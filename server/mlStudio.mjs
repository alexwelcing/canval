import fs from 'node:fs/promises';
import path from 'node:path';
import {
  env as hfEnv,
  AutoConfig,
  AutoTokenizer,
  AutoModel,
  AutoModelForCausalLM,
} from '@huggingface/transformers';
import { SharedEarlybirdWeights, EarlybirdLiveSession } from './earlybirdNode.mjs';

const GEMMA_MODEL_ID = 'onnx-community/embeddinggemma-2-ONNX';
const QWEN_MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct-ONNX';
const DIM_FULL = 768;
const DIM_MRL = 256;

const CRITIQUE_COPY = {
  'balanced-hierarchy': {
    title: 'Balanced Visual Hierarchy',
    description: 'Proportioned studio composition with clear primary, secondary, and accent rhythm.',
  },
  'needs-accent-contrast': {
    title: 'Applied Curatorial Contrast',
    description: 'Infused semantic palette differentiation and archival frame harmony across uniform forms.',
  },
  'dense-cluster': {
    title: 'Untangled Dense Cluster',
    description: 'Resolved spatial collisions into a breathing gallery grid with harmonized connectors.',
  },
  'sparse-minimal': {
    title: 'Framed Minimalist Study',
    description: 'Centered focal study with archival typography and poised gallery framing.',
  },
};

function l2Normalize(src, len = src.length) {
  let sum = 0;
  for (let i = 0; i < len; i++) sum += src[i] * src[i];
  const inv = sum > 0 ? 1 / Math.sqrt(sum) : 0;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = src[i] * inv;
  return out;
}

function dot(a, b, len = a.length) {
  let s = 0;
  for (let i = 0; i < len; i++) s += a[i] * b[i];
  return s;
}

export class StudioMLKernel {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.earlybird = new SharedEarlybirdWeights();

    this.gemmaTokenizer = null;
    this.gemmaModel = null;
    this.gemmaReady = false;
    this.gemmaLoadMs = 0;

    this.qwenTokenizer = null;
    this.qwenModel = null;
    this.qwenReady = false;
    this.qwenLoadMs = 0;

    this.manifest = [];
    this.bank768 = new Float32Array(0);
    this.bank256 = new Float32Array(0);
    this.shapeCache = new Map();
    this.queryEmbedCache = new Map();
    this.ideateCache = new Map();

    // Lightweight async mutex for Qwen greedy generation
    this.qwenChain = Promise.resolve();
  }

  async initAll() {
    if (process.env.MODELS_CACHE_DIR) {
      hfEnv.cacheDir = process.env.MODELS_CACHE_DIR;
      if (process.env.MODELS_OFFLINE === '1') {
        hfEnv.allowRemoteModels = false;
      }
    }

    const modelsDir = path.join(this.rootDir, 'public', 'models');
    const [manifestRaw, binBuf] = await Promise.all([
      fs.readFile(path.join(modelsDir, 'gemma-bank.json'), 'utf8'),
      fs.readFile(path.join(modelsDir, 'gemma-bank.bin')),
    ]);
    const bankJson = JSON.parse(manifestRaw);
    this.manifest = bankJson.entries;
    this.bank768 = new Float32Array(binBuf.buffer, binBuf.byteOffset, binBuf.byteLength / 4);
    this.bank256 = new Float32Array(this.manifest.length * DIM_MRL);
    for (let i = 0; i < this.manifest.length; i++) {
      const slice768 = this.bank768.subarray(i * DIM_FULL, (i + 1) * DIM_FULL);
      this.bank256.set(l2Normalize(slice768, DIM_MRL), i * DIM_MRL);
    }

    // Boot Model 1 (Earlybird-29M) + Model 2 (EmbeddingGemma 2) + Model 3 (Qwen2.5-0.5B) concurrently
    await Promise.all([
      this.earlybird.init(path.join(modelsDir, 'earlybird')),
      this.initGemma(),
      this.initQwen(),
    ]);
  }

  async initGemma() {
    const t0 = performance.now();
    const cfg = await AutoConfig.from_pretrained(GEMMA_MODEL_ID);
    cfg.vision_config = null;
    cfg.audio_config = null;

    const [tok, mod] = await Promise.all([
      AutoTokenizer.from_pretrained(GEMMA_MODEL_ID),
      AutoModel.from_pretrained(GEMMA_MODEL_ID, { config: cfg, dtype: 'q4' }),
    ]);
    this.gemmaTokenizer = tok;
    this.gemmaModel = mod;
    await this.embedRaw('task: search result | query: draw a gallery card');
    this.gemmaReady = true;
    this.gemmaLoadMs = Math.round((performance.now() - t0) * 10) / 10;
  }

  async initQwen() {
    const t0 = performance.now();
    const [tok, mod] = await Promise.all([
      AutoTokenizer.from_pretrained(QWEN_MODEL_ID),
      AutoModelForCausalLM.from_pretrained(QWEN_MODEL_ID, { dtype: 'q4' }),
    ]);
    this.qwenTokenizer = tok;
    this.qwenModel = mod;
    this.qwenReady = true;
    this.qwenLoadMs = Math.round((performance.now() - t0) * 10) / 10;
  }

  getStatus() {
    return {
      ready: this.earlybird.ready && this.gemmaReady && this.qwenReady,
      earlybirdReady: this.earlybird.ready,
      earlybirdLoadMs: this.earlybird.loadMs,
      gemmaReady: this.gemmaReady,
      gemmaLoadMs: this.gemmaLoadMs,
      qwenReady: this.qwenReady,
      qwenLoadMs: this.qwenLoadMs,
      models: {
        speech: 'sahilmahendrakar/Earlybird-29M (ONNX C++ AVX)',
        design: 'onnx-community/embeddinggemma-2-ONNX (768d + 256d MRL q4)',
        stateComputer: 'onnx-community/Qwen2.5-0.5B-Instruct-ONNX (q4)',
      },
    };
  }

  createAudioSession(onUpdate) {
    return new EarlybirdLiveSession(this.earlybird, onUpdate);
  }

  async embedRaw(formattedText) {
    const cached = this.queryEmbedCache.get(formattedText);
    if (cached) {
      this.queryEmbedCache.delete(formattedText);
      this.queryEmbedCache.set(formattedText, cached);
      return cached;
    }

    const inputs = await this.gemmaTokenizer(formattedText, { padding: true, truncation: true });
    const out = await this.gemmaModel(inputs);
    const raw = Float32Array.from(out.sentence_embedding.data);
    try {
      out.sentence_embedding?.dispose?.();
      out.last_hidden_state?.dispose?.();
      inputs.input_ids?.dispose?.();
      inputs.attention_mask?.dispose?.();
    } catch {
      // ignore disposal
    }
    const vec768 = l2Normalize(raw, DIM_FULL);
    const vec256 = l2Normalize(vec768, DIM_MRL);
    const entry = { vec768, vec256 };
    if (this.queryEmbedCache.size >= 512) {
      const oldest = this.queryEmbedCache.keys().next().value;
      if (oldest !== undefined) this.queryEmbedCache.delete(oldest);
    }
    this.queryEmbedCache.set(formattedText, entry);
    return entry;
  }

  scoreGroup(qVec, useMrl, group) {
    const dim = useMrl ? DIM_MRL : DIM_FULL;
    const bank = useMrl ? this.bank256 : this.bank768;
    let bestId = '';
    let bestSub = '';
    let bestScore = -2;
    const allScores = {};

    for (const entry of this.manifest) {
      if (entry.group !== group) continue;
      const ref = bank.subarray(entry.index * dim, (entry.index + 1) * dim);
      const s = dot(qVec, ref, dim);
      allScores[entry.id] = Math.round(s * 10000) / 10000;
      if (s > bestScore) {
        bestScore = s;
        bestId = entry.id;
        bestSub = entry.subkind;
      }
    }
    return { id: bestId, subkind: bestSub, score: Math.round(bestScore * 1000) / 1000, allScores };
  }

  async ensureShapeEmbeddings(shapes = []) {
    const missing = [];
    const seen = new Set();
    for (const s of shapes) {
      const key = `${s.color || 'black'}:${s.shapeType || 'rectangle'}:${String(s.label || '').trim().toLowerCase()}`;
      if (!this.shapeCache.has(key) && !seen.has(key)) {
        seen.add(key);
        missing.push({ key, s });
      }
    }
    if (missing.length === 0) return;
    if (this.shapeCache.size + missing.length > 512) this.shapeCache.clear();
    await Promise.all(
      missing.map(async ({ key, s }) => {
        const lbl = String(s.label || '').trim();
        const desc = `${s.color || 'black'} ${s.shapeType || 'rectangle'} ${lbl}`.trim();
        const vecs = await this.embedRaw(`title: ${lbl || s.shapeType || 'shape'} | text: ${desc}`);
        this.shapeCache.set(key, vecs);
      }),
    );
  }

  rankShapes(qVec, useMrl, shapes = []) {
    const dim = useMrl ? DIM_MRL : DIM_FULL;
    const scored = [];
    for (const s of shapes) {
      const key = `${s.color || 'black'}:${s.shapeType || 'rectangle'}:${String(s.label || '').trim().toLowerCase()}`;
      const cached = this.shapeCache.get(key);
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

  async resolveUtterance({
    requestId = 1,
    utteranceId = 1,
    phase = 'commit',
    text = '',
    ghostText = '',
    words = [],
    shapes = [],
    sourceHint = null,
    targetHint = null,
  }) {
    const t0 = performance.now();
    const combined = ghostText ? `${text} ${ghostText}`.trim() : text.trim();
    const useMrl = phase === 'speculative';

    await this.ensureShapeEmbeddings(shapes);
    const { vec768, vec256 } = await this.embedRaw(`task: search result | query: ${combined}`);
    const qVec = useMrl ? vec256 : vec768;

    const intent = this.scoreGroup(qVec, useMrl, 'intent');
    const aesthetic = this.scoreGroup(qVec, useMrl, 'aesthetic');
    const blueprint = this.scoreGroup(qVec, useMrl, 'blueprint');
    const archetype = this.scoreGroup(qVec, useMrl, 'archetype');
    const color = this.scoreGroup(qVec, useMrl, 'color');
    const anim = this.scoreGroup(qVec, useMrl, 'animation');
    const matchedShapes = this.rankShapes(qVec, useMrl, shapes);

    let sourceMatch = null;
    let targetMatch = null;
    if (phase === 'commit' && shapes.length > 0) {
      if (sourceHint) {
        const sEmb = await this.embedRaw(`task: search result | query: ${sourceHint}`);
        sourceMatch = this.rankShapes(sEmb.vec768, false, shapes)[0] ?? null;
      }
      if (targetHint) {
        const tEmb = await this.embedRaw(`task: search result | query: ${targetHint}`);
        const ranked = this.rankShapes(tEmb.vec768, false, shapes);
        targetMatch = ranked.find((r) => r.id !== sourceMatch?.id) ?? ranked[0] ?? null;
      }
    }

    const meanWordConfidence =
      words.length > 0
        ? Math.round((words.reduce((acc, [, p]) => acc + p, 0) / words.length) * 1000) / 1000
        : 1;

    return {
      requestId,
      utteranceId,
      phase,
      rawText: text,
      ghostText,
      words,
      meanWordConfidence,
      intentKind: intent.subkind || 'create_shape',
      intentScore: intent.score,
      aestheticId: aesthetic.id,
      aestheticScore: aesthetic.score,
      blueprintId: blueprint.id || 'architecture',
      blueprintScore: blueprint.score,
      archetypeId: archetype.id || 'arch-card',
      archetypeScore: archetype.score,
      color: color.score >= 0.61 ? color.subkind : null,
      colorScore: color.score,
      animationKind: anim.subkind || 'float',
      animationScore: anim.score,
      matchedShapes: matchedShapes.slice(0, 6),
      sourceMatch,
      targetMatch,
      elapsedMs: Math.round((performance.now() - t0) * 10) / 10,
    };
  }

  async harmonizeComposition({ canvasShapes = [], goalPrompt = 'cohesive museum exhibition composition' }) {
    const t0 = performance.now();

    // Spatial collision & density inspection across live shapes
    let overlapPairs = 0;
    const distinctColors = new Set();
    for (let i = 0; i < canvasShapes.length; i++) {
      const a = canvasShapes[i];
      distinctColors.add(a.color || 'black');
      for (let j = i + 1; j < canvasShapes.length; j++) {
        const b = canvasShapes[j];
        const dx = Math.abs((a.x || 0) - (b.x || 0));
        const dy = Math.abs((a.y || 0) - (b.y || 0));
        const minGapX = ((a.w || 180) + (b.w || 180)) * 0.46;
        const minGapY = ((a.h || 100) + (b.h || 100)) * 0.46;
        if (dx < minGapX && dy < minGapY) overlapPairs++;
      }
    }

    const spatialDescriptor =
      canvasShapes.length === 0
        ? 'minimalist open blank canvas ready for focal study'
        : overlapPairs >= 1
          ? `crowded overlapping cluster with ${overlapPairs} spatial collisions across ${canvasShapes.length} nodes`
          : distinctColors.size <= 1 && canvasShapes.length >= 2
            ? `uniform monochrome ${canvasShapes.length} nodes needing curatorial accent contrast`
            : canvasShapes.length <= 2
              ? 'minimalist sparse focal study with poised whitespace'
              : `proportioned ${canvasShapes.length}-element diagram with balanced hierarchy`;

    const nodeLabels = canvasShapes
      .slice(0, 10)
      .map((s) => `${s.label || 'Element'} (${s.shapeType || 'card'})`)
      .join(', ');

    const queryText = `task: search result | query: ${goalPrompt}. Composition: ${spatialDescriptor}. Elements: ${nodeLabels || 'open studio'}`;
    const { vec768 } = await this.embedRaw(queryText);

    const aesthetic = this.scoreGroup(vec768, false, 'aesthetic');
    const critique = this.scoreGroup(vec768, false, 'critique');

    const chosenCritiqueId =
      overlapPairs >= 1
        ? 'dense-cluster'
        : distinctColors.size <= 1 && canvasShapes.length >= 2
          ? 'needs-accent-contrast'
          : critique.id || 'balanced-hierarchy';

    const copy = CRITIQUE_COPY[chosenCritiqueId] ?? CRITIQUE_COPY['balanced-hierarchy'];

    return {
      editionId: aesthetic.id || 'bauhaus-archive',
      critiqueId: chosenCritiqueId,
      critiqueTitle: copy.title,
      critiqueDescription: copy.description,
      shouldUntangle: overlapPairs >= 1 || canvasShapes.length >= 6,
      themeScores: aesthetic.allScores,
      critiqueScores: critique.allScores,
      modelUsed: 'onnx-community/embeddinggemma-2-ONNX (768d)',
      latencyMs: Math.round((performance.now() - t0) * 10) / 10,
    };
  }

  async stepStateComputer(messages) {
    if (!this.qwenReady || !this.qwenModel || !this.qwenTokenizer) {
      throw new Error('Qwen2.5-0.5B State Kernel still initializing');
    }

    const run = async () => {
      const t0 = performance.now();
      const prompt = this.qwenTokenizer.apply_chat_template(messages, {
        tokenize: false,
        add_generation_prompt: true,
      });
      const inputs = await this.qwenTokenizer(prompt);
      const out = await this.qwenModel.generate({
        ...inputs,
        max_new_tokens: 8,
        do_sample: false,
      });
      const genIds = out.slice(null, [inputs.input_ids.dims[1], null]);
      const decoded = this.qwenTokenizer.batch_decode(genIds, { skip_special_tokens: true })[0] ?? '';
      try {
        inputs.input_ids?.dispose?.();
        inputs.attention_mask?.dispose?.();
        out?.dispose?.();
      } catch {
        // ignore disposal
      }
      const opcode = decoded.split('\n')[0].trim() || 'NOOP';
      return {
        ok: true,
        opcode,
        model: 'onnx-community/Qwen2.5-0.5B-Instruct-ONNX (q4)',
        latencyMs: Math.round((performance.now() - t0) * 10) / 10,
      };
    };

    const next = this.qwenChain.then(run, run);
    this.qwenChain = next.catch(() => {});
    return next;
  }

  async ideateTopicNodes({ topic = '', blueprintId = 'mindmap', count = 4 }) {
    const cleanTopic = String(topic || '').trim().slice(0, 64);
    const clampedCount = Math.min(7, Math.max(2, Number(count) || 4));
    if (!cleanTopic) {
      return { ok: false, topic: '', labels: [], latencyMs: 0 };
    }

    const cacheKey = `${cleanTopic.toLowerCase()}:${blueprintId}:${clampedCount}`;
    const cached = this.ideateCache.get(cacheKey);
    if (cached) {
      return { ok: true, topic: cleanTopic, labels: cached, cached: true, latencyMs: 0.1 };
    }

    if (!this.qwenReady || !this.qwenModel || !this.qwenTokenizer) {
      return { ok: false, topic: cleanTopic, labels: [], latencyMs: 0 };
    }

    const run = async () => {
      const t0 = performance.now();
      const messages = [
        {
          role: 'system',
          content:
            'Output a comma-separated list of concise 1-to-3 word diagram node labels. Output ONLY the comma-separated labels with no numbering or quotes.',
        },
        {
          role: 'user',
          content: `Topic: ${cleanTopic}\nDiagram: ${blueprintId}\nCount: ${clampedCount}\nLabels:`,
        },
      ];
      const prompt = this.qwenTokenizer.apply_chat_template(messages, {
        tokenize: false,
        add_generation_prompt: true,
      });
      const inputs = await this.qwenTokenizer(prompt);
      const out = await this.qwenModel.generate({
        ...inputs,
        max_new_tokens: 28,
        do_sample: false,
      });
      const genIds = out.slice(null, [inputs.input_ids.dims[1], null]);
      const decoded = this.qwenTokenizer.batch_decode(genIds, { skip_special_tokens: true })[0] ?? '';
      try {
        inputs.input_ids?.dispose?.();
        inputs.attention_mask?.dispose?.();
        out?.dispose?.();
      } catch {
        // ignore disposal
      }

      const labels = decoded
        .split(/,|\n|;|\|/)
        .map((s) =>
          s
            .replace(/^[\d.)\-*•\s"'`]+/, '')
            .replace(/["'`.:]+$/, '')
            .trim(),
        )
        .filter((s) => s.length >= 2 && s.length <= 28 && !/^labels?$/i.test(s))
        .slice(0, clampedCount);

      if (labels.length >= 2) {
        if (this.ideateCache.size >= 256) this.ideateCache.clear();
        this.ideateCache.set(cacheKey, labels);
      }

      return {
        ok: labels.length >= 2,
        topic: cleanTopic,
        labels,
        latencyMs: Math.round((performance.now() - t0) * 10) / 10,
      };
    };

    const next = this.qwenChain.then(run, run);
    this.qwenChain = next.catch(() => {});
    return next;
  }
}
