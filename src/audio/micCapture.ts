const WORKLET_CODE = `
class EarlybirdCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0;
    this.prevSample = 0;
    this.hasPrev = false;
    this.outBuf = new Float32Array(1280);
    this.outIdx = 0;
    this.peak = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || ch.length === 0) return true;

    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > this.peak) this.peak = a;
    }

    if (this.ratio === 1) {
      for (let i = 0; i < ch.length; i++) {
        this.outBuf[this.outIdx++] = ch[i];
        if (this.outIdx === 1280) {
          const slice = this.outBuf.slice(0);
          this.port.postMessage({ pcm: slice, lvl: this.peak }, [slice.buffer]);
          this.outIdx = 0;
          this.peak = 0;
        }
      }
      return true;
    }

    const n = ch.length;
    while (this.pos < n) {
      const idx = Math.floor(this.pos);
      const frac = this.pos - idx;
      const s0 = idx === 0 ? (this.hasPrev ? this.prevSample : ch[0]) : ch[idx - 1];
      const s1 = ch[idx];
      const interp = s0 + frac * (s1 - s0);
      this.outBuf[this.outIdx++] = interp;
      if (this.outIdx === 1280) {
        const slice = this.outBuf.slice(0);
        this.port.postMessage({ pcm: slice, lvl: this.peak }, [slice.buffer]);
        this.outIdx = 0;
        this.peak = 0;
      }
      this.pos += this.ratio;
    }

    this.pos -= n;
    this.prevSample = ch[n - 1];
    this.hasPrev = true;
    return true;
  }
}
registerProcessor('earlybird-cap', EarlybirdCaptureProcessor);
`;

export type MicHardwareState = 'live' | 'suspended' | 'ended';

export interface MicSession {
  isAlive: () => boolean;
  resumeIfNeeded: () => Promise<boolean>;
  stop: () => void;
}

/**
 * Subtle studio activation tone (two-note Braun/Nagra fifth: 528 Hz -> 792 Hz, 95ms total)
 * played once when hardware PCM frames actually begin flowing.
 */
function playActivationTone(ctx: AudioContext): void {
  try {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.045, now + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    master.connect(ctx.destination);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(528, now);
    osc1.frequency.setValueAtTime(792, now + 0.048);
    osc1.connect(master);
    osc1.start(now);
    osc1.stop(now + 0.115);
  } catch {
    // Ignore if audio output is muted by device switch
  }
}

export async function startMobileMicrophone(
  onChunk: (pcm: Float32Array, lvl: number) => void,
  onStateChange?: (state: MicHardwareState) => void,
): Promise<MicSession> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Microphone requires HTTPS on mobile browsers. Open https://cavals.alexwelcing.com',
    );
  }

  // Acquire hardware mic stream FIRST inside the user gesture before constructing AudioContext
  // (avoids iOS Safari sample-rate mismatch & suspended source bugs).
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  let ctx: AudioContext;
  try {
    ctx = new AudioCtx({ sampleRate: 16000, latencyHint: 'interactive' });
  } catch {
    ctx = new AudioCtx();
  }

  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  const blobUrl = URL.createObjectURL(new Blob([WORKLET_CODE], { type: 'application/javascript' }));
  try {
    await ctx.audioWorklet.addModule(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  const source = ctx.createMediaStreamSource(stream);
  const workletNode = new AudioWorkletNode(ctx, 'earlybird-cap');

  // Connect worklet through a 0-gain sink to ctx.destination so iOS WebKit & Android Chrome
  // continuously pull audio quantum blocks from EarlybirdCaptureProcessor.
  const silentSink = ctx.createGain();
  silentSink.gain.value = 0;
  source.connect(workletNode);
  workletNode.connect(silentSink);
  silentSink.connect(ctx.destination);

  let firstFrameSeen = false;
  const primaryTrack = stream.getAudioTracks()[0];

  const notifyHardwareState = () => {
    if (!primaryTrack || primaryTrack.readyState === 'ended') {
      onStateChange?.('ended');
      return;
    }
    if (ctx.state !== 'running' || primaryTrack.muted) {
      onStateChange?.('suspended');
      return;
    }
    if (firstFrameSeen) {
      onStateChange?.('live');
    }
  };

  ctx.addEventListener('statechange', notifyHardwareState);
  if (primaryTrack) {
    primaryTrack.addEventListener('ended', () => onStateChange?.('ended'));
    primaryTrack.addEventListener('mute', () => onStateChange?.('suspended'));
    primaryTrack.addEventListener('unmute', () => {
      if (firstFrameSeen && ctx.state === 'running') onStateChange?.('live');
    });
  }

  workletNode.port.onmessage = (ev: MessageEvent<{ pcm: Float32Array; lvl: number }>) => {
    if (!firstFrameSeen) {
      firstFrameSeen = true;
      try {
        navigator.vibrate?.(12);
      } catch {
        // ignore if vibrate unsupported
      }
      playActivationTone(ctx);
      onStateChange?.('live');
    }
    onChunk(ev.data.pcm, ev.data.lvl);
  };

  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  return {
    isAlive: () =>
      Boolean(primaryTrack && primaryTrack.readyState === 'live' && ctx.state !== 'closed'),
    resumeIfNeeded: async () => {
      if (!primaryTrack || primaryTrack.readyState === 'ended' || ctx.state === 'closed') {
        onStateChange?.('ended');
        return false;
      }
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const running = ctx.state === 'running';
      if (running && firstFrameSeen) {
        onStateChange?.('live');
      }
      return running;
    },
    stop: () => {
      try {
        workletNode.disconnect();
        silentSink.disconnect();
        source.disconnect();
        void ctx.close();
      } catch {
        // ignore cleanup errors
      }
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
