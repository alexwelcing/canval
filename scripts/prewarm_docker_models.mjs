import {
  env as hfEnv,
  AutoConfig,
  AutoTokenizer,
  AutoModel,
  AutoModelForCausalLM,
} from '@huggingface/transformers';

const cacheDir = process.env.MODELS_CACHE_DIR || '/app/models/hf-cache';
hfEnv.cacheDir = cacheDir;

console.log(`[prewarm] Caching EmbeddingGemma 2 + Qwen2.5-0.5B into ${cacheDir}...`);

const gCfg = await AutoConfig.from_pretrained('onnx-community/embeddinggemma-2-ONNX');
gCfg.vision_config = null;
gCfg.audio_config = null;

const [gTok, gMod] = await Promise.all([
  AutoTokenizer.from_pretrained('onnx-community/embeddinggemma-2-ONNX'),
  AutoModel.from_pretrained('onnx-community/embeddinggemma-2-ONNX', { config: gCfg, dtype: 'q4' }),
]);
const gInp = await gTok('task: search result | query: warm studio', { padding: true, truncation: true });
await gMod(gInp);
console.log('[prewarm] EmbeddingGemma 2 (q4) cached & verified.');

const [qTok, qMod] = await Promise.all([
  AutoTokenizer.from_pretrained('onnx-community/Qwen2.5-0.5B-Instruct-ONNX'),
  AutoModelForCausalLM.from_pretrained('onnx-community/Qwen2.5-0.5B-Instruct-ONNX', { dtype: 'q4' }),
]);
const qInp = await qTok('Hello');
await qMod.generate({ ...qInp, max_new_tokens: 2, do_sample: false });
console.log('[prewarm] Qwen2.5-0.5B-Instruct (q4) cached & verified.');
