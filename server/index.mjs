import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { StudioMLKernel } from './mlStudio.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PORT = Number(process.env.PORT || 8080);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const studio = new StudioMLKernel(ROOT_DIR);
const bootStart = Date.now();
let initError = null;
let activeWsClients = 0;

const bootPromise = studio.initAll().catch((err) => {
  initError = err instanceof Error ? err.message : String(err);
  console.error('[StudioMLKernel] Initialization error:', err);
});

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readJsonBody(req, maxBytes = 4 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('Payload too large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function serveStatic(reqPath, res) {
  const safeRel = path.normalize(decodeURIComponent(reqPath)).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = path.join(DIST_DIR, safeRel === '/' || safeRel === '\\' ? 'index.html' : safeRel);

  try {
    const st = await fs.stat(filePath);
    if (st.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch {
    // SPA fallback for extensionless client routes
    if (!path.extname(safeRel)) {
      filePath = path.join(DIST_DIR, 'index.html');
    } else {
      res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const cacheControl =
    reqPath.startsWith('/assets/') || ext === '.onnx' || ext === '.wasm'
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';

  res.writeHead(200, {
    ...CORS_HEADERS,
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
  });
  createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const p = url.pathname;

    if (p === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, {
        ok: !initError,
        service: 'cavals-studio',
        uptimeSec: Math.round((Date.now() - bootStart) / 1000),
        activeStreams: activeWsClients,
        error: initError,
        ...studio.getStatus(),
      });
      return;
    }

    if (p === '/api/state-computer') {
      if (req.method === 'GET') {
        await bootPromise;
        sendJson(res, 200, {
          ok: studio.qwenReady,
          model: 'onnx-community/Qwen2.5-0.5B-Instruct-ONNX (q4)',
          loadMs: studio.qwenLoadMs,
        });
        return;
      }
      if (req.method === 'POST') {
        await bootPromise;
        const body = await readJsonBody(req);
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          sendJson(res, 400, { ok: false, error: 'Missing ChatML messages' });
          return;
        }
        const out = await studio.stepStateComputer(body.messages);
        sendJson(res, 200, out);
        return;
      }
    }

    if (p === '/api/voice/resolve' && req.method === 'POST') {
      await bootPromise;
      const body = await readJsonBody(req);
      const resolution = await studio.resolveUtterance(body);
      sendJson(res, 200, { ok: true, resolution });
      return;
    }

    if (p === '/api/voice/ideate' && req.method === 'POST') {
      await bootPromise;
      const body = await readJsonBody(req);
      const ideation = await studio.ideateTopicNodes(body);
      sendJson(res, 200, ideation);
      return;
    }

    if (p === '/api/voice/harmonize' && req.method === 'POST') {
      await bootPromise;
      const body = await readJsonBody(req);
      const harmony = await studio.harmonizeComposition(body);
      sendJson(res, 200, { ok: true, harmony });
      return;
    }

    if (p === '/api/voice/catalog' && req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        status: studio.getStatus(),
        manifestEntries: studio.manifest.length,
      });
      return;
    }

    await serveStatic(p, res);
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: err instanceof Error ? err.message : 'Internal server error',
    });
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname !== '/ws/voice') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

function extractServerPairHints(rawText) {
  const clean = String(rawText || '').trim();
  if (!clean) return { sourceHint: null, targetHint: null };
  const trimArt = (s) =>
    s
      .replace(/^(the|a|an|that|this|my)\s+/i, '')
      .replace(/\s+(with\s+an?\s+arrow|together|now|please|smoothly|gently)$/i, '')
      .trim() || null;

  const orbitM = clean.match(
    /\b(?:orbit|revolve|circle)\s+(.+?)\s+around\s+(.+?)(?:\s+clockwise|\s+counterclockwise|$)/i,
  );
  if (orbitM) return { sourceHint: trimArt(orbitM[1]), targetHint: trimArt(orbitM[2]) };

  const makeOrbitM = clean.match(/\bmake\s+(.+?)\s+(?:orbit|revolve|circle)\s+around\s+(.+)$/i);
  if (makeOrbitM) return { sourceHint: trimArt(makeOrbitM[1]), targetHint: trimArt(makeOrbitM[2]) };

  const placeM = clean.match(
    /\b(?:put|place|move|position|stack|set)\s+(.+?)\s+(?:right\s+of|left\s+of|to\s+the\s+right\s+of|to\s+the\s+left\s+of|next\s+to|beside|above|over|on\s+top\s+of|below|under|underneath|beneath)\s+(.+)$/i,
  );
  if (placeM) return { sourceHint: trimArt(placeM[1]), targetHint: trimArt(placeM[2]) };

  const swapM = clean.match(/\b(?:swap|switch|exchange)\s+(.+?)\s+(?:and|with)\s+(.+)$/i);
  if (swapM) return { sourceHint: trimArt(swapM[1]), targetHint: trimArt(swapM[2]) };

  const connM = clean.match(
    /\b(?:connect|link|wire|join|attach|point)\s+(.+?)\s+(?:to|with|into|and|->)\s+(.+)$/i,
  );
  if (connM) return { sourceHint: trimArt(connM[1]), targetHint: trimArt(connM[2]) };

  return { sourceHint: null, targetHint: null };
}

wss.on('connection', async (ws) => {
  activeWsClients++;
  await bootPromise;

  const sendSafe = (obj) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  };

  if (!studio.earlybird.ready) {
    sendSafe({ type: 'error', message: initError || 'Earlybird engine unavailable' });
    ws.close();
    activeWsClients = Math.max(0, activeWsClients - 1);
    return;
  }

  let clientShapes = [];
  let wsReqSeq = 1;
  let lastSpecKey = '';
  let specBusy = false;
  let pendingSpecJob = null;

  const drainSpeculative = async () => {
    if (specBusy || !pendingSpecJob || !studio.gemmaReady) return;
    specBusy = true;
    try {
      while (pendingSpecJob) {
        const job = pendingSpecJob;
        pendingSpecJob = null;
        const resolution = await studio.resolveUtterance(job);
        sendSafe({ type: 'resolved', payload: resolution });
      }
    } catch {
      // ignore transient speculative embedding error
    } finally {
      specBusy = false;
    }
  };

  const session = studio.createAudioSession((update) => {
    sendSafe({ type: 'update', payload: update });

    // Zero-RTT Fused Semantic Resolution pushed directly down the live WebSocket!
    if (!studio.gemmaReady) return;

    if (update.isFinal) {
      lastSpecKey = '';
      pendingSpecJob = null;
      const { sourceHint, targetHint } = extractServerPairHints(update.text);
      const reqId = wsReqSeq++;
      void studio
        .resolveUtterance({
          requestId: reqId,
          utteranceId: update.utteranceId,
          phase: 'commit',
          text: update.text,
          ghostText: '',
          words: update.words,
          shapes: clientShapes,
          sourceHint,
          targetHint,
        })
        .then((resolution) => {
          sendSafe({ type: 'resolved', payload: resolution });
        })
        .catch(() => {});
    } else {
      const solidWords = (update.words || []).filter(([, p]) => p >= 0.38).map(([w]) => w);
      const ghostWords = (update.ghost || []).filter(([, p]) => p >= 0.36).map(([w]) => w);
      const specText = solidWords.join(' ').trim();
      const specGhost = ghostWords.join(' ').trim();
      const specKey = `${update.utteranceId}:${specText}|${specGhost}`.toLowerCase();

      if (solidWords.length >= 2 && specKey !== lastSpecKey) {
        lastSpecKey = specKey;
        pendingSpecJob = {
          requestId: wsReqSeq++,
          utteranceId: update.utteranceId,
          phase: 'speculative',
          text: specText,
          ghostText: specGhost,
          words: update.words,
          shapes: clientShapes,
        };
        void drainSpeculative();
      }
    }
  });

  sendSafe({
    type: 'ready',
    zeroRttResolve: true,
    status: studio.getStatus(),
  });

  ws.on('message', (data, isBinary) => {
    try {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const aligned = new Uint8Array(buf.byteLength);
        aligned.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
        const pcm = new Float32Array(aligned.buffer);
        session.enqueuePcm(pcm);
        return;
      }

      const msg = JSON.parse(data.toString('utf8'));
      if (msg.type === 'reset') {
        session.resetAll();
      } else if (msg.type === 'sync_state' && Array.isArray(msg.shapes)) {
        clientShapes = msg.shapes.slice(0, 80);
        if (studio.gemmaReady) {
          void studio.ensureShapeEmbeddings(clientShapes).catch(() => {});
        }
      } else if (msg.type === 'audio' && typeof msg.pcmBase64 === 'string') {
        const raw = Buffer.from(msg.pcmBase64, 'base64');
        const aligned = new Uint8Array(raw.byteLength);
        aligned.set(raw);
        const pcm = new Float32Array(aligned.buffer);
        session.enqueuePcm(pcm, typeof msg.lvl === 'number' ? msg.lvl : 0);
      }
    } catch {
      // ignore malformed client frame
    }
  });

  ws.on('close', () => {
    activeWsClients = Math.max(0, activeWsClients - 1);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[cavals-studio] Listening on http://0.0.0.0:${PORT}`);
});
