/**
 * Pre-computes the exact 768d EmbeddingGemma 2 vector bank (`onnx-community/embeddinggemma-2-ONNX`, q4 text-only)
 * for all intents, curated gallery aesthetics, layout blueprints, shape archetypes, and color descriptors,
 * and verifies both 768d and 256d MRL retrieval accuracy on spoken queries.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutoConfig, AutoTokenizer, AutoModel } from '@huggingface/transformers';
import {
  AESTHETIC_EDITIONS,
  INTENT_PROTOTYPES,
  LAYOUT_BLUEPRINTS,
  SHAPE_ARCHETYPES,
  COLOR_PROTOTYPES,
  ANIMATION_PROTOTYPES,
} from '../src/design/catalog.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'models');
const MODEL_ID = 'onnx-community/embeddinggemma-2-ONNX';

function l2Normalize(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const inv = sum > 0 ? 1 / Math.sqrt(sum) : 0;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] * inv;
  return out;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

async function embedText(tokenizer, model, formattedText) {
  const inputs = await tokenizer(formattedText, { padding: true, truncation: true });
  const out = await model(inputs);
  const raw = Float32Array.from(out.sentence_embedding.data);
  return l2Normalize(raw);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  console.log(`Loading ${MODEL_ID} (text-only 270M q4)...`);
  const config = await AutoConfig.from_pretrained(MODEL_ID);
  config.vision_config = null;
  config.audio_config = null;

  const [tokenizer, model] = await Promise.all([
    AutoTokenizer.from_pretrained(MODEL_ID),
    AutoModel.from_pretrained(MODEL_ID, { config, dtype: 'q4' }),
  ]);

  const entries = [];
  for (const item of INTENT_PROTOTYPES) {
    entries.push({
      group: 'intent',
      id: item.id,
      subkind: item.kind,
      doc: `title: ${item.title} | text: ${item.exemplars}`,
    });
  }
  for (const ed of AESTHETIC_EDITIONS) {
    entries.push({
      group: 'aesthetic',
      id: ed.id,
      subkind: ed.title,
      doc: `title: ${ed.title} — ${ed.subtitle} | text: ${ed.semanticPrompt}`,
    });
  }
  for (const bp of LAYOUT_BLUEPRINTS) {
    entries.push({
      group: 'blueprint',
      id: bp.id,
      subkind: bp.id,
      doc: `title: ${bp.title} | text: ${bp.exemplars}`,
    });
  }
  for (const sh of SHAPE_ARCHETYPES) {
    entries.push({
      group: 'archetype',
      id: sh.id,
      subkind: sh.shapeType,
      doc: `title: ${sh.title} | text: ${sh.exemplars}`,
    });
  }
  for (const col of COLOR_PROTOTYPES) {
    entries.push({
      group: 'color',
      id: col.id,
      subkind: col.color,
      doc: `title: ${col.title} | text: ${col.exemplars}`,
    });
  }
  for (const anim of ANIMATION_PROTOTYPES) {
    entries.push({
      group: 'animation',
      id: anim.id,
      subkind: anim.anim,
      doc: `title: ${anim.title} | text: ${anim.exemplars}`,
    });
  }

  console.log(`Embedding ${entries.length} visual design & command prototypes (768d)...`);
  const dim = 768;
  const bank = new Float32Array(entries.length * dim);
  const manifest = [];

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const vec = await embedText(tokenizer, model, e.doc);
    bank.set(vec, i * dim);
    manifest.push({ index: i, group: e.group, id: e.id, subkind: e.subkind });
  }

  await fs.writeFile(path.join(OUT_DIR, 'gemma-bank.bin'), Buffer.from(bank.buffer));
  await fs.writeFile(
    path.join(OUT_DIR, 'gemma-bank.json'),
    JSON.stringify({ model: MODEL_ID, dimensions: dim, mrlDimensions: [256, 768], entries: manifest }, null, 2),
  );
  console.log(`Saved gemma-bank.bin (${(bank.byteLength / 1024).toFixed(1)} KB) and gemma-bank.json`);

  // Verify live spoken query accuracy across 768d and 256d MRL!
  const testQueries = [
    ['draw three circles in a row', 'intent'],
    ['sketch a backend microservice architecture', 'blueprint'],
    ['make it look like Japanese sumi ink on warm paper', 'aesthetic'],
    ['dark brutalist obsidian terminal aesthetic', 'aesthetic'],
    ['clean Swiss Kunsthalle modernist grid', 'aesthetic'],
    ['connect the login box to the vector database', 'intent'],
    ['paint that shape terracotta rust', 'color'],
    ['clear the whole canvas', 'intent'],
    ['zoom out to frame everything', 'intent'],
  ];

  console.log('\nVerifying 768d & 256d MRL semantic routing:');
  for (const [q, targetGroup] of testQueries) {
    const q768 = await embedText(tokenizer, model, `task: search result | query: ${q}`);
    const q256 = l2Normalize(q768.subarray(0, 256));

    let best768 = { id: '', score: -1 };
    let best256 = { id: '', score: -1 };
    for (const m of manifest) {
      if (m.group !== targetGroup) continue;
      const d768 = bank.subarray(m.index * dim, (m.index + 1) * dim);
      const d256 = l2Normalize(d768.subarray(0, 256));
      const s768 = dot(q768, d768);
      const s256 = dot(q256, d256);
      if (s768 > best768.score) best768 = { id: `${m.id} (${m.subkind})`, score: s768 };
      if (s256 > best256.score) best256 = { id: `${m.id} (${m.subkind})`, score: s256 };
    }
    console.log(
      `  "${q}"\n    768d -> ${best768.id} (${best768.score.toFixed(3)}) | 256d MRL -> ${best256.id} (${best256.score.toFixed(3)})`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
