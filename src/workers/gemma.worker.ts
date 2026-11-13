import { AutoConfig, AutoModel, AutoTokenizer } from '@huggingface/transformers';
import type { BlueprintKind, CatalogAnimationKind, IntentKind } from '../design/catalog';
import type {
  CanvasShapeSummary,
  GemmaWorkerIn,
  GemmaWorkerOut,
  SemanticResolution,
} from '../types/protocol';
import type { TLDefaultColorStyle } from 'tldraw';

const MODEL_ID = 'onnx-community/embeddinggemma-2-ONNX';
const DIM_FULL = 768;
const DIM_MRL = 256;

interface BankManifestEntry {
  index: number;
  group: 'intent' | 'aesthetic' | 'blueprint' | 'archetype' | 'color' | 'animation';
  id: string;
  subkind: string;
}

interface BankManifest {
  model: string;
  dimensions: number;
  entries: BankManifestEntry[];
}

function post(msg: GemmaWorkerOut) {
  self.postMessage(msg);
}

function l2Normalize(src: Float32Array, len = src.length): Float32Array {
  let sum = 0;
  for (let i = 0; i < len; i++) sum += src[i] * src[i];
  const inv = sum > 0 ? 1 / Math.sqrt(sum) : 0;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = src[i] * inv;
  return out;
}

function dot(a: Float32Array, b: Float32Array, len = a.length): number {
  let s = 0;
  for (let i = 0; i < len; i++) s += a[i] * b[i];
  return s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tokenizer: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let model: any = null;
let bank768 = new Float32Array(0);
let bank256 = new Float32Array(0);
let manifest: BankManifestEntry[] = [];
let ready = false;

// Live canvas shape embeddings cached by normalized descriptor string
const labelEmbedCache = new Map<string, { vec768: Float32Array; vec256: Float32Array }>();
let currentShapes: CanvasShapeSummary[] = [];

async function detectDevice(): Promise<'webgpu' | 'wasm'> {
  try {
    const nav = self.navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
    if (nav.gpu) {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    }
  } catch {
    // Fallback to WASM
  }
  return 'wasm';
}

async function embedRaw(formattedText: string): Promise<{ vec768: Float32Array; vec256: Float32Array }> {
  const inputs = await tokenizer(formattedText, { padding: true, truncation: true });
  const out = await model(inputs);
  const raw = Float32Array.from(out.sentence_embedding.data as Float32Array);
  try {
    out.sentence_embedding?.dispose?.();
    out.last_hidden_state?.dispose?.();
    inputs.input_ids?.dispose?.();
    inputs.attention_mask?.dispose?.();
  } catch {
    // ignore disposal errors
  }
  const vec768 = l2Normalize(raw, DIM_FULL);
  const vec256 = l2Normalize(vec768, DIM_MRL);
  return { vec768, vec256 };
}

async function initEngine(baseUrl: string) {
  const cleanBase = baseUrl.replace(/\/$/, '');
  post({ type: 'progress', stage: 'Fetching Visual Vector Bank', progress: 8 });

  const [manifestRes, binRes] = await Promise.all([
    fetch(`${cleanBase}/models/gemma-bank.json`),
    fetch(`${cleanBase}/models/gemma-bank.bin`),
  ]);
  if (!manifestRes.ok || !binRes.ok) {
    throw new Error('Failed to load pre-computed EmbeddingGemma 2 vector bank');
  }
  const bankJson = (await manifestRes.json()) as BankManifest;
  manifest = bankJson.entries;
  bank768 = new Float32Array(await binRes.arrayBuffer());

  bank256 = new Float32Array(manifest.length * DIM_MRL);
  for (let i = 0; i < manifest.length; i++) {
    const slice768 = bank768.subarray(i * DIM_FULL, (i + 1) * DIM_FULL);
    bank256.set(l2Normalize(slice768, DIM_MRL), i * DIM_MRL);
  }

  let backend = await detectDevice();
  post({ type: 'progress', stage: `Loading EmbeddingGemma 2 (${backend.toUpperCase()})`, progress: 18 });

  const config = await AutoConfig.from_pretrained(MODEL_ID);
  // Text-only mode: omits 170M vision + 300M audio encoders to save >300MB on mobile phones!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (config as any).vision_config = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (config as any).audio_config = null;

  tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID);

  try {
    model = await AutoModel.from_pretrained(MODEL_ID, {
      config,
      dtype: 'q4',
      device: backend,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      progress_callback: (info: any) => {
        if (typeof info?.progress === 'number') {
          const scaled = Math.min(94, Math.round(20 + info.progress * 0.74));
          post({ type: 'progress', stage: `EmbeddingGemma 2 (${backend.toUpperCase()})`, progress: scaled });
        }
      },
    });
    post({ type: 'progress', stage: 'Compiling EmbeddingGemma 2 kernels', progress: 96 });
    await embedRaw('task: search result | query: draw a gallery card');
  } catch (webgpuErr) {
    if (backend === 'webgpu') {
      backend = 'wasm';
      post({ type: 'progress', stage: 'Switching EmbeddingGemma 2 to WASM', progress: 50 });
      model = await AutoModel.from_pretrained(MODEL_ID, {
        config,
        dtype: 'q4',
        device: 'wasm',
      });
      await embedRaw('task: search result | query: draw a gallery card');
    } else {
      throw webgpuErr;
    }
  }

  ready = true;
  post({ type: 'progress', stage: 'EmbeddingGemma 2 ready', progress: 100 });
  post({ type: 'ready', backend });
}

function shapeCacheKey(s: CanvasShapeSummary): string {
  return `${s.color}:${s.shapeType}:${s.label.trim().toLowerCase()}`;
}

async function syncCanvasShapes(shapes: CanvasShapeSummary[]) {
  currentShapes = shapes;
  if (!ready) return;
  for (const s of shapes) {
    const key = shapeCacheKey(s);
    if (!labelEmbedCache.has(key)) {
      const desc = `${s.color} ${s.shapeType} ${s.label.trim()}`.trim();
      const vecs = await embedRaw(`title: ${s.label.trim() || s.shapeType} | text: ${desc}`);
      labelEmbedCache.set(key, vecs);
    }
  }
}

function scoreGroup(
  qVec: Float32Array,
  useMrl: boolean,
  group: BankManifestEntry['group'],
): { id: string; subkind: string; score: number } {
  const dim = useMrl ? DIM_MRL : DIM_FULL;
  const bank = useMrl ? bank256 : bank768;
  let bestId = '';
  let bestSub = '';
  let bestScore = -2;

  for (const entry of manifest) {
    if (entry.group !== group) continue;
    const ref = bank.subarray(entry.index * dim, (entry.index + 1) * dim);
    const s = dot(qVec, ref, dim);
    if (s > bestScore) {
      bestScore = s;
      bestId = entry.id;
      bestSub = entry.subkind;
    }
  }
  return { id: bestId, subkind: bestSub, score: Math.round(bestScore * 1000) / 1000 };
}

function rankCanvasShapes(
  qVec: Float32Array,
  useMrl: boolean,
): { id: string; reg: string; label: string; score: number }[] {
  const dim = useMrl ? DIM_MRL : DIM_FULL;
  const scored: { id: string; reg: string; label: string; score: number }[] = [];
  for (const s of currentShapes) {
    const key = shapeCacheKey(s);
    const cached = labelEmbedCache.get(key);
    if (!cached) continue;
    const ref = useMrl ? cached.vec256 : cached.vec768;
    scored.push({
      id: s.id,
      reg: s.reg,
      label: s.label,
      score: Math.round(dot(qVec, ref, dim) * 1000) / 1000,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

async function handleResolve(msg: Extract<GemmaWorkerIn, { type: 'resolve' }>): Promise<SemanticResolution> {
  const t0 = performance.now();
  const combined = msg.ghostText ? `${msg.text} ${msg.ghostText}`.trim() : msg.text.trim();
  const useMrl = msg.phase === 'speculative';

  const { vec768, vec256 } = await embedRaw(`task: search result | query: ${combined}`);
  const qVec = useMrl ? vec256 : vec768;

  const intent = scoreGroup(qVec, useMrl, 'intent');
  const aesthetic = scoreGroup(qVec, useMrl, 'aesthetic');
  const blueprint = scoreGroup(qVec, useMrl, 'blueprint');
  const archetype = scoreGroup(qVec, useMrl, 'archetype');
  const color = scoreGroup(qVec, useMrl, 'color');
  const anim = scoreGroup(qVec, useMrl, 'animation');

  const matchedShapes = rankCanvasShapes(qVec, useMrl);

  let sourceMatch: { id: string; reg: string; label: string; score: number } | null = null;
  let targetMatch: { id: string; reg: string; label: string; score: number } | null = null;

  if (msg.phase === 'commit' && currentShapes.length > 0) {
    if (msg.sourceHint) {
      const sEmb = await embedRaw(`task: search result | query: ${msg.sourceHint}`);
      sourceMatch = rankCanvasShapes(sEmb.vec768, false)[0] ?? null;
    }
    if (msg.targetHint) {
      const tEmb = await embedRaw(`task: search result | query: ${msg.targetHint}`);
      const ranked = rankCanvasShapes(tEmb.vec768, false);
      targetMatch = ranked.find((r) => r.id !== sourceMatch?.id) ?? ranked[0] ?? null;
    }
  }

  const words = msg.words ?? [];
  const meanWordConfidence =
    words.length > 0
      ? Math.round((words.reduce((acc, [, p]) => acc + p, 0) / words.length) * 1000) / 1000
      : 0.75;

  return {
    requestId: msg.requestId,
    utteranceId: msg.utteranceId,
    phase: msg.phase,
    rawText: msg.text,
    ghostText: msg.ghostText,
    words,
    meanWordConfidence,
    intentKind: intent.subkind as IntentKind,
    intentScore: intent.score,
    aestheticId: aesthetic.id,
    aestheticScore: aesthetic.score,
    blueprintId: blueprint.id as BlueprintKind,
    blueprintScore: blueprint.score,
    archetypeId: archetype.id,
    archetypeScore: archetype.score,
    color: color.score >= 0.58 ? (color.subkind as TLDefaultColorStyle) : null,
    colorScore: color.score,
    animationKind: (anim.subkind || 'float') as CatalogAnimationKind,
    animationScore: anim.score,
    matchedShapes: matchedShapes.slice(0, 6),
    sourceMatch,
    targetMatch,
    elapsedMs: Math.round((performance.now() - t0) * 10) / 10,
  };
}

let busy = false;
let pendingSpeculative: Extract<GemmaWorkerIn, { type: 'resolve' }> | null = null;
const commitQueue: Extract<GemmaWorkerIn, { type: 'resolve' }>[] = [];
let pendingShapes: CanvasShapeSummary[] | null = null;

async function processQueue() {
  if (busy || !ready) return;
  busy = true;
  try {
    while (commitQueue.length > 0 || pendingSpeculative !== null || pendingShapes !== null) {
      if (pendingShapes !== null) {
        const sh = pendingShapes;
        pendingShapes = null;
        await syncCanvasShapes(sh);
      }
      if (commitQueue.length > 0) {
        const job = commitQueue.shift()!;
        if (pendingSpeculative && pendingSpeculative.utteranceId <= job.utteranceId) {
          pendingSpeculative = null;
        }
        const res = await handleResolve(job);
        post({ type: 'resolved', payload: res });
      } else if (pendingSpeculative !== null) {
        const job = pendingSpeculative;
        pendingSpeculative = null;
        const res = await handleResolve(job);
        post({ type: 'resolved', payload: res });
      }
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    busy = false;
  }
}

self.addEventListener('message', async (ev: MessageEvent<GemmaWorkerIn>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      await initEngine(msg.baseUrl);
      void processQueue();
    } else if (msg.type === 'sync_shapes') {
      pendingShapes = msg.shapes;
      void processQueue();
    } else if (msg.type === 'resolve') {
      if (msg.phase === 'commit') {
        commitQueue.push(msg);
      } else {
        pendingSpeculative = msg;
      }
      void processQueue();
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});
