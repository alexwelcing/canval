import { AutoModelForCausalLM, AutoTokenizer } from '@huggingface/transformers';
import {
  buildStateComputerMessages,
  compileVerifiedSyscall,
} from '../canvas/stateComputer';
import { isPureFillerOrNoise } from '../canvas/slotParser';
import type {
  StateComputerDecision,
  StateWorkerIn,
  StateWorkerOut,
} from '../types/protocol';

const LOCAL_QWEN_MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct-ONNX';

function post(msg: StateWorkerOut) {
  self.postMessage(msg);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let localTokenizer: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let localModel: any = null;
let edgeEndpointAvailable = false;
let apiBaseUrl = '';
let activeMode: 'qwen-webgpu' | 'qwen-edge' | 'register-alu' = 'register-alu';

async function hasWebGpu(): Promise<boolean> {
  try {
    const nav = self.navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
    if (!nav.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

async function probeEdgeQwen(baseUrl: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1800);
    const res = await fetch(`${baseUrl}/api/state-computer`, {
      method: 'GET',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    const json = (await res.json()) as { ok?: boolean };
    return Boolean(json?.ok);
  } catch {
    return false;
  }
}

async function initStateComputer(baseUrl: string, isMobileConstrained: boolean) {
  apiBaseUrl = baseUrl.replace(/\/$/, '');
  post({ type: 'progress', stage: 'Connecting Qwen State Kernel', progress: 25 });

  // 1. Check if Cloudflare Edge Qwen (`/api/state-computer`) is live on this origin
  edgeEndpointAvailable = await probeEdgeQwen(apiBaseUrl);
  if (edgeEndpointAvailable && isMobileConstrained) {
    // On mobile phones, using Cloudflare Edge Qwen preserves 460MB of WebContent RAM so mobile Safari never jetsams!
    activeMode = 'qwen-edge';
    post({ type: 'progress', stage: 'Qwen State Kernel ready', progress: 100 });
    post({ type: 'ready', mode: activeMode });
    return;
  }

  // 2. On WebGPU devices with sufficient unified memory, load Qwen2.5-0.5B-Instruct-ONNX (q4f16) in-browser!
  const canRunLocalWebGpu = !isMobileConstrained && (await hasWebGpu());
  if (canRunLocalWebGpu) {
    try {
      post({ type: 'progress', stage: 'Loading Qwen2.5-0.5B State Kernel (WebGPU)', progress: 40 });
      localTokenizer = await AutoTokenizer.from_pretrained(LOCAL_QWEN_MODEL);
      localModel = await AutoModelForCausalLM.from_pretrained(LOCAL_QWEN_MODEL, {
        dtype: 'q4f16',
        device: 'webgpu',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        progress_callback: (info: any) => {
          if (typeof info?.progress === 'number') {
            post({
              type: 'progress',
              stage: 'Qwen2.5-0.5B State Kernel (WebGPU)',
              progress: Math.min(96, Math.round(40 + info.progress * 0.56)),
            });
          }
        },
      });
      activeMode = 'qwen-webgpu';
      post({ type: 'progress', stage: 'Qwen2.5-0.5B State Kernel ready', progress: 100 });
      post({ type: 'ready', mode: activeMode });
      return;
    } catch {
      localModel = null;
      localTokenizer = null;
    }
  }

  activeMode = edgeEndpointAvailable ? 'qwen-edge' : 'register-alu';
  post({ type: 'progress', stage: 'Canvas State Kernel ready', progress: 100 });
  post({ type: 'ready', mode: activeMode });
}

async function runQwenInference(
  messages: ReturnType<typeof buildStateComputerMessages>,
): Promise<{ line: string | null; source: 'qwen-webgpu' | 'qwen-edge' | 'register-alu' }> {
  // Priority A: Local in-browser WebGPU Qwen2.5-0.5B-Instruct
  if (localModel && localTokenizer) {
    try {
      const prompt = localTokenizer.apply_chat_template(messages, {
        tokenize: false,
        add_generation_prompt: true,
      });
      const inputs = await localTokenizer(prompt);
      const out = await localModel.generate({
        ...inputs,
        max_new_tokens: 12,
        do_sample: false,
      });
      const genIds = out.slice(null, [inputs.input_ids.dims[1], null]);
      const decoded = localTokenizer.batch_decode(genIds, { skip_special_tokens: true })[0] ?? '';
      try {
        inputs.input_ids?.dispose?.();
        inputs.attention_mask?.dispose?.();
        out?.dispose?.();
      } catch {
        // ignore tensor disposal
      }
      return { line: decoded.split('\n')[0].trim(), source: 'qwen-webgpu' };
    } catch {
      // Fall through to Edge Qwen or Register ALU
    }
  }

  // Priority B: Cloudflare Workers AI Edge Qwen (`/api/state-computer`)
  if (edgeEndpointAvailable) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1600);
      const res = await fetch(`${apiBaseUrl}/api/state-computer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as { opcode?: string };
        if (typeof data.opcode === 'string' && data.opcode.trim()) {
          return { line: data.opcode.trim(), source: 'qwen-edge' };
        }
      }
    } catch {
      // Fall through to deterministic Register ALU
    }
  }

  return { line: null, source: 'register-alu' };
}

async function handleStep(msg: Extract<StateWorkerIn, { type: 'step' }>): Promise<StateComputerDecision> {
  const t0 = performance.now();
  const { snapshot, resolution, requestId } = msg;

  // Fast-path filter: don't burn Qwen tokens on pure silence/filler
  if (isPureFillerOrNoise(resolution.rawText, resolution.words)) {
    return {
      requestId,
      utteranceId: resolution.utteranceId,
      rawOpcodeLine: 'NOOP',
      syscall: { op: 'NOOP', reason: 'Filtered filler' },
      resolution,
      engineSource: activeMode,
      computeMs: Math.round((performance.now() - t0) * 10) / 10,
    };
  }

  const messages = buildStateComputerMessages(snapshot, resolution.rawText);
  const qwenOut = await runQwenInference(messages);
  const compiled = compileVerifiedSyscall(qwenOut.line, snapshot, resolution);

  return {
    requestId,
    utteranceId: resolution.utteranceId,
    rawOpcodeLine: compiled.opcodeLine,
    syscall: compiled.syscall,
    resolution,
    engineSource: qwenOut.source,
    computeMs: Math.round((performance.now() - t0) * 10) / 10,
  };
}

let busy = false;
const stepQueue: Extract<StateWorkerIn, { type: 'step' }>[] = [];

async function drainQueue() {
  if (busy) return;
  busy = true;
  try {
    while (stepQueue.length > 0) {
      const job = stepQueue.shift()!;
      const decision = await handleStep(job);
      post({ type: 'decision', payload: decision });
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    busy = false;
  }
}

self.addEventListener('message', async (ev: MessageEvent<StateWorkerIn>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      await initStateComputer(msg.baseUrl, msg.isMobileConstrained);
      void drainQueue();
    } else if (msg.type === 'step') {
      stepQueue.push(msg);
      void drainQueue();
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});
