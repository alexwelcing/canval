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

export interface MicSession {
  resumeIfNeeded: () => Promise<void>;
  stop: () => void;
}

export async function startMobileMicrophone(
  onChunk: (pcm: Float32Array, lvl: number) => void,
): Promise<MicSession> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Microphone requires HTTPS on mobile browsers. Open the https:// URL shown in your terminal.',
    );
  }

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  let ctx: AudioContext;
  try {
    ctx = new AudioCtx({ sampleRate: 16000, latencyHint: 'interactive' });
  } catch {
    ctx = new AudioCtx();
  }

  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const blobUrl = URL.createObjectURL(new Blob([WORKLET_CODE], { type: 'application/javascript' }));
  try {
    await ctx.audioWorklet.addModule(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  const source = ctx.createMediaStreamSource(stream);
  const workletNode = new AudioWorkletNode(ctx, 'earlybird-cap');

  workletNode.port.onmessage = (ev: MessageEvent<{ pcm: Float32Array; lvl: number }>) => {
    onChunk(ev.data.pcm, ev.data.lvl);
  };

  source.connect(workletNode);
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  return {
    resumeIfNeeded: async () => {
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
    },
    stop: () => {
      try {
        workletNode.disconnect();
        source.disconnect();
        void ctx.close();
      } catch {
        // ignore cleanup errors
      }
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}
