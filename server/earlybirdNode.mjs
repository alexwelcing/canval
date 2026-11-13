import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const hfRequire = createRequire(import.meta.resolve('@huggingface/transformers'));
const ort = hfRequire('onnxruntime-node');

/**
 * Shared Earlybird-29M native C++ ONNX sessions (`onnxruntime-node`).
 * Loaded once at container startup (~180ms); all concurrent WebSocket streams share these weights with zero duplication.
 */
export class SharedEarlybirdWeights {
  constructor() {
    this.meta = null;
    this.feFrame = null;
    this.feConv1 = null;
    this.feConv2 = null;
    this.encStep = null;
    this.crossKv = null;
    this.decStep = null;
    this.ready = false;
    this.loadMs = 0;
  }

  async init(earlybirdDir) {
    const t0 = performance.now();
    const metaRaw = await fs.readFile(path.join(earlybirdDir, 'earlybird_meta.json'), 'utf8');
    this.meta = JSON.parse(metaRaw);

    const opts = {
      intraOpNumThreads: 4,
      interOpNumThreads: 1,
      graphOptimizationLevel: 'all',
    };

    const files = [
      'frontend_frame.onnx',
      'frontend_conv1.onnx',
      'frontend_conv2.onnx',
      'encoder_step.onnx',
      'cross_kv.onnx',
      'decoder_step.onnx',
    ];

    const sessions = await Promise.all(
      files.map((fn) => ort.InferenceSession.create(path.join(earlybirdDir, fn), opts)),
    );
    [this.feFrame, this.feConv1, this.feConv2, this.encStep, this.crossKv, this.decStep] = sessions;
    this.ready = true;
    this.loadMs = Math.round((performance.now() - t0) * 10) / 10;
  }
}

function calcRms(chunk) {
  let sum = 0;
  for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
  return Math.sqrt(sum / Math.max(1, chunk.length));
}

function concatFloat32(a, b) {
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Per-connection stateful streaming session for Earlybird-29M (80ms causal chunks + -90ms ghost predictions + VAD).
 */
export class EarlybirdLiveSession {
  constructor(shared, onUpdate) {
    this.shared = shared;
    this.meta = shared.meta;
    this.onUpdate = onUpdate;

    this.nGuess = 1;
    this.tokPerS = 6.5;
    this.minS = 0.16;

    this.utteranceId = 1;
    this.pcmQueue = new Float32Array(0);
    this.latestLvl = 0;
    this.processing = false;

    this.inUtterance = false;
    this.silenceChunks = 0;
    this.utteranceChunks = 0;
    this.preRollChunks = [];

    this.SPEECH_RMS_ONSET = 0.014;
    this.SPEECH_RMS_HOLD = 0.009;
    this.SILENCE_CHUNKS_TO_COMMIT = 4; // 320ms crisp pause commits utterance for rapid-fire voice
    this.MAX_UTTERANCE_CHUNKS = 180;

    this.resetStreamState();
  }

  resetStreamState() {
    const nl = this.meta.num_layers;
    this.nSamples = 0;
    this.rem = new Float32Array(0);
    this.c0 = new Float32Array(0);
    this.c0Len = 0;
    this.c0Seen = 0;
    this.c1 = new Float32Array(0);
    this.c1Len = 0;
    this.c1Seen = 0;
    this.fin = Array.from({ length: nl + 1 }, () => new Float32Array(0));
    this.finLens = new Array(nl + 1).fill(0);
    this.crossK = new Float32Array(0);
    this.crossV = new Float32Array(0);
    this.crossLen = 0;
    this.hyp = [];
    this.probs = [];
    this.guessToks = [];
    this.guessProbs = [];
  }

  resetAll() {
    this.pcmQueue = new Float32Array(0);
    this.inUtterance = false;
    this.silenceChunks = 0;
    this.utteranceChunks = 0;
    this.preRollChunks = [];
    this.utteranceId++;
    this.resetStreamState();
  }

  decodePieces(toks) {
    const { bos_token_id: bos, eos_token_id: eos, pieces } = this.meta;
    let s = '';
    for (const t of toks) {
      if (t !== 0 && t !== bos && t !== eos) {
        s += pieces[t] ?? '';
      }
    }
    return s.replace(/▁/g, ' ').trim();
  }

  getWords(toks, probs) {
    const out = [];
    const ws = this.meta.word_starts;
    let s = 0;
    for (let i = 1; i <= toks.length; i++) {
      if (i === toks.length || ws[toks[i]] === 1) {
        const w = this.decodePieces(toks.slice(s, i));
        if (w) {
          let p = 1;
          for (let j = s; j < i; j++) p *= probs[j];
          out.push([w, Math.round(p * 1000) / 1000]);
        }
        s = i;
      }
    }
    return out;
  }

  get audioTimeSec() {
    return Math.round((this.nSamples / this.meta.sample_rate) * 100) / 100;
  }

  concatChanTime(a, aL, b, bL, C) {
    const totalL = aL + bL;
    if (totalL === 0) return new Float32Array(0);
    const out = new Float32Array(C * totalL);
    for (let c = 0; c < C; c++) {
      if (aL > 0) out.set(a.subarray(c * aL, (c + 1) * aL), c * totalL);
      if (bL > 0) out.set(b.subarray(c * bL, (c + 1) * bL), c * totalL + aL);
    }
    return out;
  }

  sliceChanTime(x, L, C, startIdx, endIdx, padLeft = 0) {
    const segLen = endIdx - startIdx + padLeft;
    const out = new Float32Array(C * segLen);
    const copyLen = endIdx - startIdx;
    if (copyLen <= 0) return out;
    for (let c = 0; c < C; c++) {
      out.set(x.subarray(c * L + startIdx, c * L + endIdx), c * segLen + padLeft);
    }
    return out;
  }

  async runCausalConv(sess, C, k, s, buf, bufLen, nSeen, newData, newLen) {
    const x = this.concatChanTime(buf, bufLen, newData, newLen, C);
    const xLen = bufLen + newLen;
    const first = nSeen + newLen - xLen;
    const total = nSeen + newLen;
    const i0 = Math.ceil(nSeen / s);
    const i1 = total > 0 ? Math.floor((total - 1) / s) + 1 : 0;
    if (i1 <= i0) {
      return { nextBuf: x, nextBufLen: xLen, nextSeen: total, out: null };
    }
    const lo = s * i0 - (k - 1);
    const startIdx = Math.max(0, lo - first);
    const endIdx = s * (i1 - 1) - first + 1;
    const padLeft = lo < first ? first - lo : 0;
    const seg = this.sliceChanTime(x, xLen, C, startIdx, endIdx, padLeft);
    const segLen = endIdx - startIdx + padLeft;

    const res = await sess.run({
      seg: new ort.Tensor('float32', seg, [1, C, segLen]),
    });
    const outTensor = res.out;

    const keep = s * i1 - (k - 1);
    const keepStart = Math.max(0, keep - first);
    const nextBufLen = Math.max(0, xLen - keepStart);
    const nextBuf = nextBufLen > 0 ? this.sliceChanTime(x, xLen, C, keepStart, xLen, 0) : new Float32Array(0);
    return { nextBuf, nextBufLen, nextSeen: total, out: outTensor };
  }

  async embedChunk(chunk) {
    const d = this.meta.hidden_size;
    const fLen = this.meta.frame_len;
    const combined = new Float32Array(this.rem.length + chunk.length);
    combined.set(this.rem, 0);
    combined.set(chunk, this.rem.length);

    const n = Math.floor(combined.length / fLen);
    this.rem = combined.slice(n * fLen);
    if (n === 0) return { data: new Float32Array(0), nFrames: 0 };

    const framesData = combined.slice(0, n * fLen);
    const hRes = await this.shared.feFrame.run({
      frames: new ort.Tensor('float32', framesData, [1, n, fLen]),
    });
    const h = hRes.hidden.data;

    const { kernel: k1, stride: s1 } = this.meta.conv1;
    const c1Out = await this.runCausalConv(this.shared.feConv1, d, k1, s1, this.c0, this.c0Len, this.c0Seen, h, n);
    this.c0 = c1Out.nextBuf;
    this.c0Len = c1Out.nextBufLen;
    this.c0Seen = c1Out.nextSeen;
    if (!c1Out.out || c1Out.out.dims[2] === 0) {
      return { data: new Float32Array(0), nFrames: 0 };
    }

    const yData = c1Out.out.data;
    const yLen = Number(c1Out.out.dims[2]);
    const { kernel: k2, stride: s2 } = this.meta.conv2;
    const c2Out = await this.runCausalConv(this.shared.feConv2, 2 * d, k2, s2, this.c1, this.c1Len, this.c1Seen, yData, yLen);
    this.c1 = c2Out.nextBuf;
    this.c1Len = c2Out.nextBufLen;
    this.c1Seen = c2Out.nextSeen;
    if (!c2Out.out || c2Out.out.dims[1] === 0) {
      return { data: new Float32Array(0), nFrames: 0 };
    }
    return {
      data: Float32Array.from(c2Out.out.data),
      nFrames: Number(c2Out.out.dims[1]),
    };
  }

  async padFrames() {
    const d = this.meta.hidden_size;
    const { kernel: k1, stride: s1 } = this.meta.conv1;
    const i0 = Math.ceil(this.c0Seen / s1);
    const i1 = Math.floor((this.c0Seen + k1 - 2) / s1) + 1;
    if (this.c0Seen === 0 || i1 <= i0) {
      return { data: new Float32Array(0), nFrames: 0 };
    }
    const need1 = Math.max(0, s1 * (i1 - 1) + 1 - this.c0Seen);
    const c1Out = await this.runCausalConv(
      this.shared.feConv1,
      d,
      k1,
      s1,
      this.c0,
      this.c0Len,
      this.c0Seen,
      new Float32Array(d * need1),
      need1,
    );
    if (!c1Out.out || c1Out.out.dims[2] === 0) {
      return { data: new Float32Array(0), nFrames: 0 };
    }
    const yData = c1Out.out.data;
    const yLen = Number(c1Out.out.dims[2]);

    const { kernel: k2, stride: s2 } = this.meta.conv2;
    const n1 = this.c1Seen + yLen;
    const j1 = Math.floor((n1 + k2 - 2) / s2) + 1;
    const need2 = Math.max(0, s2 * (j1 - 1) + 1 - n1);
    const yPad = this.concatChanTime(yData, yLen, new Float32Array(2 * d * need2), need2, 2 * d);
    const c2Out = await this.runCausalConv(
      this.shared.feConv2,
      2 * d,
      k2,
      s2,
      this.c1,
      this.c1Len,
      this.c1Seen,
      yPad,
      yLen + need2,
    );
    if (!c2Out.out || c2Out.out.dims[1] === 0) {
      return { data: new Float32Array(0), nFrames: 0 };
    }
    return {
      data: Float32Array.from(c2Out.out.data),
      nFrames: Number(c2Out.out.dims[1]),
    };
  }

  appendTimeMajor(orig, origFrames, add, addFrames, d) {
    if (addFrames === 0) return orig;
    const out = new Float32Array((origFrames + addFrames) * d);
    if (origFrames > 0) out.set(orig, 0);
    out.set(add, origFrames * d);
    return out;
  }

  appendCrossKV(orig, origT, add, addT) {
    if (addT === 0) return orig;
    const { num_layers: nl, num_heads: H, head_dim: hd } = this.meta;
    const outer = nl * H;
    const totalT = origT + addT;
    const out = new Float32Array(outer * totalT * hd);
    for (let o = 0; o < outer; o++) {
      if (origT > 0) {
        out.set(orig.subarray(o * origT * hd, (o + 1) * origT * hd), o * totalT * hd);
      }
      out.set(add.subarray(o * addT * hd, (o + 1) * addT * hd), o * totalT * hd + origT * hd);
    }
    return out;
  }

  slicePastKV(kv, totalT, keepT) {
    const { num_layers: nl, num_heads: H, head_dim: hd } = this.meta;
    const outer = nl * H;
    const out = new Float32Array(outer * keepT * hd);
    for (let o = 0; o < outer; o++) {
      out.set(kv.subarray(o * totalT * hd, o * totalT * hd + keepT * hd), o * keepT * hd);
    }
    return out;
  }

  makeRange64(start, end) {
    const len = Math.max(0, end - start);
    const arr = new BigInt64Array(len);
    for (let i = 0; i < len; i++) arr[i] = BigInt(start + i);
    return arr;
  }

  async encode(newFrames, nNew) {
    const { hidden_size: d, num_layers: nl, back, ahead } = this.meta;
    if (nNew > 0) {
      this.fin[0] = this.appendTimeMajor(this.fin[0], this.finLens[0], newFrames, nNew, d);
      this.finLens[0] += nNew;
    }

    const prov0 = await this.padFrames();
    let provLen = prov0.nFrames;
    const feed = {
      prov0: new ort.Tensor('float32', prov0.data, [1, provLen, d]),
    };

    const simFinLens = [...this.finLens];
    let prevNewFin = 0;

    for (let l = 0; l < nl; l++) {
      const nFinIn = simFinLens[l];
      const done = simFinLens[l + 1];
      const lo = Math.max(0, done - (back[l] - 1));
      const winFrames = this.finLens[l] - lo;
      const winData = winFrames > 0 ? this.fin[l].slice(lo * d, this.finLens[l] * d) : new Float32Array(0);

      const effWinLen = winFrames + (l > 0 ? prevNewFin : 0);
      const totalX = effWinLen + provLen;
      const q0 = done - lo;
      const nq = Math.max(0, totalX - q0);
      const nNewFin = Math.min(nq, Math.max(0, nFinIn - ahead[l] - done));
      const nProvNext = nq - nNewFin;

      feed[`win${l}`] = new ort.Tensor('float32', winData, [1, winFrames, d]);
      feed[`q_idx${l}`] = new ort.Tensor('int64', this.makeRange64(q0, totalX), [nq]);
      feed[`fin_idx${l}`] = new ort.Tensor('int64', this.makeRange64(0, nNewFin), [nNewFin]);
      feed[`prov_idx${l}`] = new ort.Tensor('int64', this.makeRange64(nNewFin, nq), [nProvNext]);

      simFinLens[l + 1] = done + nNewFin;
      prevNewFin = nNewFin;
      provLen = nProvNext;
    }

    const outs = await this.shared.encStep.run(feed);
    for (let l = 0; l < nl; l++) {
      const t = outs[`new_fin${l}`];
      const count = Number(t.dims[1]);
      if (count > 0) {
        this.fin[l + 1] = this.appendTimeMajor(this.fin[l + 1], this.finLens[l + 1], t.data, count, d);
        this.finLens[l + 1] += count;
      }
    }

    const nFinLast = Number(outs[`new_fin${nl - 1}`].dims[1]);
    const provOut = outs.prov_out;
    return {
      nFinLast,
      prov: Float32Array.from(provOut.data),
      provLen: Number(provOut.dims[1]),
    };
  }

  async runDec(ids, pos0, pastK, pastV, pastLen, crossK, crossV, crossLen) {
    const { num_layers: nl, num_heads: H, head_dim: hd, vocab_size: V } = this.meta;
    const L = ids.length;
    const totalLen = pastLen + L;
    const bias = new Float32Array(L * totalLen);
    if (L > 1) {
      for (let r = 0; r < L; r++) {
        for (let c = pastLen + r + 1; c < totalLen; c++) {
          bias[r * totalLen + c] = -1e9;
        }
      }
    }

    const idArr = new BigInt64Array(L);
    for (let i = 0; i < L; i++) idArr[i] = BigInt(ids[i]);

    const res = await this.shared.decStep.run({
      input_ids: new ort.Tensor('int64', idArr, [1, L]),
      pos_ids: new ort.Tensor('int64', this.makeRange64(pos0, pos0 + L), [L]),
      past_k: new ort.Tensor('float32', pastK, [nl, 1, H, pastLen, hd]),
      past_v: new ort.Tensor('float32', pastV, [nl, 1, H, pastLen, hd]),
      attn_bias: new ort.Tensor('float32', bias, [1, 1, L, totalLen]),
      cross_k: new ort.Tensor('float32', crossK, [nl, 1, H, crossLen, hd]),
      cross_v: new ort.Tensor('float32', crossV, [nl, 1, H, crossLen, hd]),
    });

    const logits = res.logits.data;
    const logp = new Float32Array(L * V);
    for (let r = 0; r < L; r++) {
      const off = r * V;
      let maxVal = -Infinity;
      for (let j = 0; j < V; j++) {
        const v = logits[off + j];
        if (v > maxVal) maxVal = v;
      }
      let sumExp = 0;
      for (let j = 0; j < V; j++) {
        sumExp += Math.exp(logits[off + j] - maxVal);
      }
      const logSum = Math.log(sumExp);
      for (let j = 0; j < V; j++) {
        logp[off + j] = logits[off + j] - maxVal - logSum;
      }
    }

    return {
      logp,
      pk: Float32Array.from(res.present_k.data),
      pv: Float32Array.from(res.present_v.data),
      newPastLen: totalLen,
    };
  }

  argmaxRow(logp, rowIdx, V) {
    const off = rowIdx * V;
    let bestIdx = 0;
    let bestVal = logp[off];
    for (let j = 1; j < V; j++) {
      const v = logp[off + j];
      if (v > bestVal) {
        bestVal = v;
        bestIdx = j;
      }
    }
    return bestIdx;
  }

  async stepChunk(chunk) {
    const { hidden_size: d, sample_rate: sr, bos_token_id: bos, eos_token_id: eos, vocab_size: V, word_starts: ws } =
      this.meta;
    this.nSamples += chunk.length;
    const emb = await this.embedChunk(chunk);
    const { nFinLast, prov, provLen } = await this.encode(emb.data, emb.nFrames);

    const finAllLen = this.finLens[this.meta.num_layers];
    const finAll = this.fin[this.meta.num_layers];

    if (nFinLast > 0) {
      const start = finAllLen - nFinLast;
      const slice = finAll.slice(start * d, finAllLen * d);
      const kvRes = await this.shared.crossKv.run({
        enc_frames: new ort.Tensor('float32', slice, [1, nFinLast, d]),
        pos_ids: new ort.Tensor('int64', this.makeRange64(start, start + nFinLast), [nFinLast]),
      });
      this.crossK = this.appendCrossKV(this.crossK, this.crossLen, kvRes.cross_k.data, nFinLast);
      this.crossV = this.appendCrossKV(this.crossV, this.crossLen, kvRes.cross_v.data, nFinLast);
      this.crossLen += nFinLast;
    }

    const t = this.nSamples / sr;
    if (t < this.minS || this.crossLen + provLen === 0) return;

    let ckFull = this.crossK;
    let cvFull = this.crossV;
    let cLenFull = this.crossLen;

    if (provLen > 0) {
      const start = finAllLen;
      const pkvRes = await this.shared.crossKv.run({
        enc_frames: new ort.Tensor('float32', prov, [1, provLen, d]),
        pos_ids: new ort.Tensor('int64', this.makeRange64(start, start + provLen), [provLen]),
      });
      ckFull = this.appendCrossKV(this.crossK, this.crossLen, pkvRes.cross_k.data, provLen);
      cvFull = this.appendCrossKV(this.crossV, this.crossLen, pkvRes.cross_v.data, provLen);
      cLenFull = this.crossLen + provLen;
    }

    const maxNew = Math.floor(t * this.tokPerS) + 4;
    const prev = this.hyp;
    const initDec = await this.runDec([bos, ...prev], 0, new Float32Array(0), new Float32Array(0), 0, ckFull, cvFull, cLenFull);

    let keep = 0;
    while (keep < prev.length && keep < maxNew && this.argmaxRow(initDec.logp, keep, V) === prev[keep]) {
      keep++;
    }

    const toks = prev.slice(0, keep);
    const probs = [];
    for (let i = 0; i < keep; i++) {
      probs.push(Math.exp(initDec.logp[i * V + toks[i]]));
    }

    let pk = this.slicePastKV(initDec.pk, initDec.newPastLen, keep + 1);
    let pv = this.slicePastKV(initDec.pv, initDec.newPastLen, keep + 1);
    let pastLen = keep + 1;

    let curLogp = initDec.logp;
    let curRow = keep;

    while (toks.length < maxNew) {
      const tok = this.argmaxRow(curLogp, curRow, V);
      if (tok === eos) break;
      toks.push(tok);
      probs.push(Math.exp(curLogp[curRow * V + tok]));
      if (toks.length >= maxNew) break;
      const nextDec = await this.runDec([tok], toks.length, pk, pv, pastLen, ckFull, cvFull, cLenFull);
      pk = nextDec.pk;
      pv = nextDec.pv;
      pastLen = nextDec.newPastLen;
      curLogp = nextDec.logp;
      curRow = 0;
    }

    this.hyp = toks;
    this.probs = probs;
    this.guessToks = [];
    this.guessProbs = [];

    if (this.nGuess > 0 && toks.length < maxNew) {
      const gToks = [];
      const gProbs = [];
      let words = 0;
      let tok = eos;
      let pos = toks.length + 1;
      let gPk = pk;
      let gPv = pv;
      let gPastLen = pastLen;

      for (let step = 0; step < 4 * this.nGuess + 2; step++) {
        const gDec = await this.runDec([tok], pos, gPk, gPv, gPastLen, ckFull, cvFull, cLenFull);
        pos++;
        gPk = gDec.pk;
        gPv = gDec.pv;
        gPastLen = gDec.newPastLen;
        tok = this.argmaxRow(gDec.logp, 0, V);
        if (tok === eos) break;
        if (ws[tok] === 1) {
          words++;
          if (words > this.nGuess) break;
        }
        gToks.push(tok);
        gProbs.push(Math.exp(gDec.logp[tok]));
      }
      this.guessToks = gToks;
      this.guessProbs = gProbs;
    }
  }

  enqueuePcm(pcmFloat32, lvl = 0) {
    this.latestLvl = lvl;
    this.pcmQueue = concatFloat32(this.pcmQueue, pcmFloat32);
    void this.drainQueue();
  }

  async drainQueue() {
    if (this.processing || !this.shared.ready) return;
    this.processing = true;
    try {
      while (this.pcmQueue.length >= 1280) {
        const chunk = this.pcmQueue.slice(0, 1280);
        this.pcmQueue = this.pcmQueue.slice(1280);
        const rms = calcRms(chunk);

        if (!this.inUtterance) {
          if (rms >= this.SPEECH_RMS_ONSET) {
            this.inUtterance = true;
            this.silenceChunks = 0;
            this.utteranceChunks = 0;
            this.resetStreamState();
            for (const pre of this.preRollChunks) {
              await this.stepChunk(pre);
              this.utteranceChunks++;
            }
            this.preRollChunks = [];
          } else {
            this.preRollChunks.push(chunk);
            if (this.preRollChunks.length > 2) this.preRollChunks.shift();
            continue;
          }
        }

        const t0 = performance.now();
        await this.stepChunk(chunk);
        const stepComputeMs = Math.round((performance.now() - t0) * 10) / 10;
        this.utteranceChunks++;

        if (rms < this.SPEECH_RMS_HOLD) {
          this.silenceChunks++;
        } else {
          this.silenceChunks = 0;
        }

        const words = this.getWords(this.hyp, this.probs);
        const ghost = this.getWords(this.guessToks, this.guessProbs);
        const text = this.decodePieces(this.hyp);

        const autoClauseCommit =
          this.utteranceChunks >= 38 &&
          this.silenceChunks >= 2 &&
          words.length >= 3;

        const shouldCommit =
          (this.silenceChunks >= this.SILENCE_CHUNKS_TO_COMMIT &&
            (words.length > 0 || this.utteranceChunks > 10)) ||
          autoClauseCommit ||
          this.utteranceChunks >= this.MAX_UTTERANCE_CHUNKS;

        if (text.length > 0 || ghost.length > 0) {
          this.onUpdate({
            utteranceId: this.utteranceId,
            audioTimeSec: this.audioTimeSec,
            stepComputeMs,
            text,
            words,
            ghost: shouldCommit ? [] : ghost,
            rmsLevel: this.latestLvl || rms,
            isFinal: shouldCommit,
          });
        }

        if (shouldCommit) {
          this.inUtterance = false;
          this.silenceChunks = 0;
          this.utteranceChunks = 0;
          this.utteranceId++;
          this.resetStreamState();
        }
      }
    } finally {
      this.processing = false;
    }
  }
}
