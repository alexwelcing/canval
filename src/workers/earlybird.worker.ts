import * as ort from 'onnxruntime-web/wasm';
import type {
  EarlybirdTranscriptUpdate,
  EarlybirdWorkerIn,
  EarlybirdWorkerOut,
  WordWithConfidence,
} from '../types/protocol';

interface EarlybirdMeta {
  sample_rate: number;
  step_samples: number;
  frame_len: number;
  hidden_size: number;
  num_heads: number;
  head_dim: number;
  num_layers: number;
  bos_token_id: number;
  eos_token_id: number;
  vocab_size: number;
  conv1: { kernel: number; stride: number };
  conv2: { kernel: number; stride: number };
  back: number[];
  ahead: number[];
  pieces: string[];
  word_starts: number[];
}

function post(msg: EarlybirdWorkerOut) {
  self.postMessage(msg);
}

class BrowserEarlybirdStream {
  private meta!: EarlybirdMeta;
  private feFrame!: ort.InferenceSession;
  private feConv1!: ort.InferenceSession;
  private feConv2!: ort.InferenceSession;
  private encStep!: ort.InferenceSession;
  private crossKv!: ort.InferenceSession;
  private decStep!: ort.InferenceSession;

  private nSamples = 0;
  private rem: Float32Array = new Float32Array(0);
  private c0: Float32Array = new Float32Array(0);
  private c0Len = 0;
  private c0Seen = 0;
  private c1: Float32Array = new Float32Array(0);
  private c1Len = 0;
  private c1Seen = 0;

  // fin[l] stored row-major [T_l, d]
  private fin: Float32Array[] = [];
  private finLens: number[] = [];

  // cross K/V stored as [nl, 1, H, T_enc, hd] flattened
  private crossK: Float32Array = new Float32Array(0);
  private crossV: Float32Array = new Float32Array(0);
  private crossLen = 0;

  public hyp: number[] = [];
  public probs: number[] = [];
  public guessToks: number[] = [];
  public guessProbs: number[] = [];

  private readonly nGuess = 1;
  private readonly tokPerS = 6.5;
  private readonly minS = 0.16;

  async init(baseUrl: string) {
    const cleanBase = baseUrl.replace(/\/$/, '');
    ort.env.wasm.wasmPaths = `${cleanBase}/ort/`;
    ort.env.wasm.numThreads = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated ? 2 : 1;
    ort.env.logLevel = 'error';

    post({ type: 'progress', stage: 'Earlybird metadata', progress: 5 });
    const metaRes = await fetch(`${cleanBase}/models/earlybird/earlybird_meta.json`);
    if (!metaRes.ok) {
      throw new Error(`Failed to fetch Earlybird metadata (${metaRes.status})`);
    }
    this.meta = (await metaRes.json()) as EarlybirdMeta;

    const modelFiles: [string, number][] = [
      ['frontend_frame.onnx', 15],
      ['frontend_conv1.onnx', 25],
      ['frontend_conv2.onnx', 35],
      ['encoder_step.onnx', 55],
      ['cross_kv.onnx', 68],
      ['decoder_step.onnx', 98],
    ];

    const opts: ort.InferenceSession.SessionOptions = {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    };

    const sessions: ort.InferenceSession[] = [];
    for (const [fn, pct] of modelFiles) {
      post({ type: 'progress', stage: `Earlybird ${fn.replace('.onnx', '')}`, progress: pct });
      const res = await fetch(`${cleanBase}/models/earlybird/${fn}`);
      if (!res.ok) throw new Error(`Failed to fetch ${fn} (${res.status})`);
      const buf = await res.arrayBuffer();
      sessions.push(await ort.InferenceSession.create(buf, opts));
    }

    [this.feFrame, this.feConv1, this.feConv2, this.encStep, this.crossKv, this.decStep] = sessions;
    this.reset();
    post({ type: 'progress', stage: 'Earlybird ready', progress: 100 });
  }

  reset() {
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

  public decodePieces(toks: number[]): string {
    const { bos_token_id: bos, eos_token_id: eos, pieces } = this.meta;
    let s = '';
    for (const t of toks) {
      if (t !== 0 && t !== bos && t !== eos) {
        s += pieces[t] ?? '';
      }
    }
    return s.replace(/▁/g, ' ').trim();
  }

  public getWords(toks: number[], probs: number[]): WordWithConfidence[] {
    const out: WordWithConfidence[] = [];
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

  public get audioTimeSec(): number {
    return Math.round((this.nSamples / this.meta.sample_rate) * 100) / 100;
  }

  /** Channel-major [1, C, L] concatenation along L (axis 2) */
  private concatChanTime(a: Float32Array, aL: number, b: Float32Array, bL: number, C: number): Float32Array {
    const totalL = aL + bL;
    if (totalL === 0) return new Float32Array(0);
    const out = new Float32Array(C * totalL);
    for (let c = 0; c < C; c++) {
      if (aL > 0) out.set(a.subarray(c * aL, (c + 1) * aL), c * totalL);
      if (bL > 0) out.set(b.subarray(c * bL, (c + 1) * bL), c * totalL + aL);
    }
    return out;
  }

  /** Channel-major [1, C, L] slice along L: [loIdx, hiIdx) with optional left zero pad */
  private sliceChanTime(x: Float32Array, L: number, C: number, startIdx: number, endIdx: number, padLeft = 0): Float32Array {
    const segLen = endIdx - startIdx + padLeft;
    const out = new Float32Array(C * segLen);
    const copyLen = endIdx - startIdx;
    if (copyLen <= 0) return out;
    for (let c = 0; c < C; c++) {
      out.set(x.subarray(c * L + startIdx, c * L + endIdx), c * segLen + padLeft);
    }
    return out;
  }

  private async runCausalConv(
    sess: ort.InferenceSession,
    C: number,
    k: number,
    s: number,
    buf: Float32Array,
    bufLen: number,
    nSeen: number,
    newData: Float32Array,
    newLen: number,
  ): Promise<{ nextBuf: Float32Array; nextBufLen: number; nextSeen: number; out: ort.Tensor | null }> {
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

  private async embedChunk(chunk: Float32Array): Promise<{ data: Float32Array; nFrames: number }> {
    const d = this.meta.hidden_size;
    const fLen = this.meta.frame_len;
    const combined = new Float32Array(this.rem.length + chunk.length);
    combined.set(this.rem, 0);
    combined.set(chunk, this.rem.length);

    const n = Math.floor(combined.length / fLen);
    this.rem = combined.slice(n * fLen);
    if (n === 0) return { data: new Float32Array(0), nFrames: 0 };

    const framesData = combined.slice(0, n * fLen);
    const hRes = await this.feFrame.run({
      frames: new ort.Tensor('float32', framesData, [1, n, fLen]),
    });
    const h = hRes.hidden.data as Float32Array; // [1, d, n]

    const { kernel: k1, stride: s1 } = this.meta.conv1;
    const c1Out = await this.runCausalConv(this.feConv1, d, k1, s1, this.c0, this.c0Len, this.c0Seen, h, n);
    this.c0 = c1Out.nextBuf;
    this.c0Len = c1Out.nextBufLen;
    this.c0Seen = c1Out.nextSeen;
    if (!c1Out.out || c1Out.out.dims[2] === 0) {
      return { data: new Float32Array(0), nFrames: 0 };
    }

    const yData = c1Out.out.data as Float32Array;
    const yLen = Number(c1Out.out.dims[2]);
    const { kernel: k2, stride: s2 } = this.meta.conv2;
    const c2Out = await this.runCausalConv(this.feConv2, 2 * d, k2, s2, this.c1, this.c1Len, this.c1Seen, yData, yLen);
    this.c1 = c2Out.nextBuf;
    this.c1Len = c2Out.nextBufLen;
    this.c1Seen = c2Out.nextSeen;
    if (!c2Out.out || c2Out.out.dims[1] === 0) {
      return { data: new Float32Array(0), nFrames: 0 };
    }
    return {
      data: Float32Array.from(c2Out.out.data as Float32Array),
      nFrames: Number(c2Out.out.dims[1]),
    };
  }

  private async padFrames(): Promise<{ data: Float32Array; nFrames: number }> {
    const d = this.meta.hidden_size;
    const { kernel: k1, stride: s1 } = this.meta.conv1;
    const i0 = Math.ceil(this.c0Seen / s1);
    const i1 = Math.floor((this.c0Seen + k1 - 2) / s1) + 1;
    if (this.c0Seen === 0 || i1 <= i0) {
      return { data: new Float32Array(0), nFrames: 0 };
    }
    const need1 = Math.max(0, s1 * (i1 - 1) + 1 - this.c0Seen);
    const c1Out = await this.runCausalConv(
      this.feConv1,
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
    const yData = c1Out.out.data as Float32Array;
    const yLen = Number(c1Out.out.dims[2]);

    const { kernel: k2, stride: s2 } = this.meta.conv2;
    const n1 = this.c1Seen + yLen;
    const j1 = Math.floor((n1 + k2 - 2) / s2) + 1;
    const need2 = Math.max(0, s2 * (j1 - 1) + 1 - n1);
    const yPad = this.concatChanTime(yData, yLen, new Float32Array(2 * d * need2), need2, 2 * d);
    const c2Out = await this.runCausalConv(this.feConv2, 2 * d, k2, s2, this.c1, this.c1Len, this.c1Seen, yPad, yLen + need2);
    if (!c2Out.out || c2Out.out.dims[1] === 0) {
      return { data: new Float32Array(0), nFrames: 0 };
    }
    return {
      data: Float32Array.from(c2Out.out.data as Float32Array),
      nFrames: Number(c2Out.out.dims[1]),
    };
  }

  private appendTimeMajor(orig: Float32Array, origFrames: number, add: Float32Array, addFrames: number, d: number): Float32Array {
    if (addFrames === 0) return orig;
    const out = new Float32Array((origFrames + addFrames) * d);
    if (origFrames > 0) out.set(orig, 0);
    out.set(add, origFrames * d);
    return out;
  }

  private appendCrossKV(orig: Float32Array, origT: number, add: Float32Array, addT: number): Float32Array {
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

  private slicePastKV(kv: Float32Array, totalT: number, keepT: number): Float32Array {
    const { num_layers: nl, num_heads: H, head_dim: hd } = this.meta;
    const outer = nl * H;
    const out = new Float32Array(outer * keepT * hd);
    for (let o = 0; o < outer; o++) {
      out.set(kv.subarray(o * totalT * hd, o * totalT * hd + keepT * hd), o * keepT * hd);
    }
    return out;
  }

  private makeRange64(start: number, end: number): BigInt64Array {
    const len = Math.max(0, end - start);
    const arr = new BigInt64Array(len);
    for (let i = 0; i < len; i++) arr[i] = BigInt(start + i);
    return arr;
  }

  private async encode(newFrames: Float32Array, nNew: number): Promise<{ nFinLast: number; prov: Float32Array; provLen: number }> {
    const { hidden_size: d, num_layers: nl, back, ahead } = this.meta;
    if (nNew > 0) {
      this.fin[0] = this.appendTimeMajor(this.fin[0], this.finLens[0], newFrames, nNew, d);
      this.finLens[0] += nNew;
    }

    const prov0 = await this.padFrames();
    let provLen = prov0.nFrames;
    const feed: Record<string, ort.Tensor> = {
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

    const outs = await this.encStep.run(feed);
    for (let l = 0; l < nl; l++) {
      const t = outs[`new_fin${l}`];
      const count = Number(t.dims[1]);
      if (count > 0) {
        this.fin[l + 1] = this.appendTimeMajor(this.fin[l + 1], this.finLens[l + 1], t.data as Float32Array, count, d);
        this.finLens[l + 1] += count;
      }
    }

    const nFinLast = Number(outs[`new_fin${nl - 1}`].dims[1]);
    const provOut = outs.prov_out;
    return {
      nFinLast,
      prov: Float32Array.from(provOut.data as Float32Array),
      provLen: Number(provOut.dims[1]),
    };
  }

  private async runDec(
    ids: number[],
    pos0: number,
    pastK: Float32Array,
    pastV: Float32Array,
    pastLen: number,
    crossK: Float32Array,
    crossV: Float32Array,
    crossLen: number,
  ): Promise<{ logp: Float32Array; pk: Float32Array; pv: Float32Array; newPastLen: number }> {
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

    const res = await this.decStep.run({
      input_ids: new ort.Tensor('int64', idArr, [1, L]),
      pos_ids: new ort.Tensor('int64', this.makeRange64(pos0, pos0 + L), [L]),
      past_k: new ort.Tensor('float32', pastK, [nl, 1, H, pastLen, hd]),
      past_v: new ort.Tensor('float32', pastV, [nl, 1, H, pastLen, hd]),
      attn_bias: new ort.Tensor('float32', bias, [1, 1, L, totalLen]),
      cross_k: new ort.Tensor('float32', crossK, [nl, 1, H, crossLen, hd]),
      cross_v: new ort.Tensor('float32', crossV, [nl, 1, H, crossLen, hd]),
    });

    const logits = res.logits.data as Float32Array; // [L, V]
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
      pk: Float32Array.from(res.present_k.data as Float32Array),
      pv: Float32Array.from(res.present_v.data as Float32Array),
      newPastLen: totalLen,
    };
  }

  private argmaxRow(logp: Float32Array, rowIdx: number, V: number): number {
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

  public async stepChunk(chunk: Float32Array): Promise<void> {
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
      const kvRes = await this.crossKv.run({
        enc_frames: new ort.Tensor('float32', slice, [1, nFinLast, d]),
        pos_ids: new ort.Tensor('int64', this.makeRange64(start, start + nFinLast), [nFinLast]),
      });
      this.crossK = this.appendCrossKV(this.crossK, this.crossLen, kvRes.cross_k.data as Float32Array, nFinLast);
      this.crossV = this.appendCrossKV(this.crossV, this.crossLen, kvRes.cross_v.data as Float32Array, nFinLast);
      this.crossLen += nFinLast;
    }

    const t = this.nSamples / sr;
    if (t < this.minS || this.crossLen + provLen === 0) return;

    let ckFull = this.crossK;
    let cvFull = this.crossV;
    let cLenFull = this.crossLen;

    if (provLen > 0) {
      const start = finAllLen;
      const pkvRes = await this.crossKv.run({
        enc_frames: new ort.Tensor('float32', prov, [1, provLen, d]),
        pos_ids: new ort.Tensor('int64', this.makeRange64(start, start + provLen), [provLen]),
      });
      ckFull = this.appendCrossKV(this.crossK, this.crossLen, pkvRes.cross_k.data as Float32Array, provLen);
      cvFull = this.appendCrossKV(this.crossV, this.crossLen, pkvRes.cross_v.data as Float32Array, provLen);
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
    const probs: number[] = [];
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
      const gToks: number[] = [];
      const gProbs: number[] = [];
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
}

// ---------------- Worker Runtime & Utterance Segmentation ----------------

const engine = new BrowserEarlybirdStream();
let ready = false;
let utteranceId = 1;
let pcmQueue: Float32Array = new Float32Array(0);
let latestLvl = 0;
let processing = false;

// Smart voice-activity endpointing so the user just speaks naturally with ZERO UI buttons
let inUtterance = false;
let silenceChunks = 0;
let utteranceChunks = 0;
const SPEECH_RMS_ONSET = 0.014;
const SPEECH_RMS_HOLD = 0.009;
const SILENCE_CHUNKS_TO_COMMIT = 4; // 4 * 80ms = 320ms crisp pause commits command cleanly
const MAX_UTTERANCE_CHUNKS = 180; // 14.4s max continuous utterance before auto-commit
let preRollChunks: Float32Array[] = [];

function concatFloat32(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function calcRms(chunk: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
  return Math.sqrt(sum / Math.max(1, chunk.length));
}

async function drainAudioQueue() {
  if (processing || !ready) return;
  processing = true;
  try {
    while (pcmQueue.length >= 1280) {
      const chunk = pcmQueue.slice(0, 1280);
      pcmQueue = pcmQueue.slice(1280);

      const rms = calcRms(chunk);

      if (!inUtterance) {
        if (rms >= SPEECH_RMS_ONSET) {
          inUtterance = true;
          silenceChunks = 0;
          utteranceChunks = 0;
          engine.reset();
          // Feed up to 2 pre-roll chunks (160ms) so initial consonants ("d-" in "draw") are crystal clear
          for (const pre of preRollChunks) {
            await engine.stepChunk(pre);
            utteranceChunks++;
          }
          preRollChunks = [];
        } else {
          preRollChunks.push(chunk);
          if (preRollChunks.length > 2) preRollChunks.shift();
          continue;
        }
      }

      const t0 = performance.now();
      await engine.stepChunk(chunk);
      const stepComputeMs = Math.round((performance.now() - t0) * 10) / 10;
      utteranceChunks++;

      if (rms < SPEECH_RMS_HOLD) {
        silenceChunks++;
      } else {
        silenceChunks = 0;
      }

      const words = engine.getWords(engine.hyp, engine.probs);
      const ghost = engine.getWords(engine.guessToks, engine.guessProbs);
      const text = engine.decodePieces(engine.hyp);

      const autoClauseCommit =
        utteranceChunks >= 38 && silenceChunks >= 2 && words.length >= 3;

      const shouldCommit =
        (silenceChunks >= SILENCE_CHUNKS_TO_COMMIT && (words.length > 0 || utteranceChunks > 10)) ||
        autoClauseCommit ||
        utteranceChunks >= MAX_UTTERANCE_CHUNKS;

      if (text.length > 0 || ghost.length > 0) {
        const update: EarlybirdTranscriptUpdate = {
          utteranceId,
          audioTimeSec: engine.audioTimeSec,
          stepComputeMs,
          text,
          words,
          ghost: shouldCommit ? [] : ghost,
          rmsLevel: latestLvl,
          isFinal: shouldCommit,
        };
        post({ type: 'update', payload: update });
      }

      if (shouldCommit) {
        inUtterance = false;
        silenceChunks = 0;
        utteranceChunks = 0;
        utteranceId++;
        engine.reset();
      }
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    processing = false;
  }
}

self.addEventListener('message', async (ev: MessageEvent<EarlybirdWorkerIn>) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      await engine.init(msg.baseUrl);
      ready = true;
      post({ type: 'ready' });
    } else if (msg.type === 'audio') {
      latestLvl = msg.lvl;
      post({ type: 'level', lvl: msg.lvl });
      pcmQueue = concatFloat32(pcmQueue, msg.pcm);
      void drainAudioQueue();
    } else if (msg.type === 'reset') {
      pcmQueue = new Float32Array(0);
      inUtterance = false;
      silenceChunks = 0;
      utteranceChunks = 0;
      utteranceId++;
      if (ready) engine.reset();
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
});
