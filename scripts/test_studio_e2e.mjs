import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import {
  buildStateComputerMessages,
  compileVerifiedSyscall,
} from '../src/canvas/stateComputer.ts';

const PORT = 18080;
const BASE = `http://127.0.0.1:${PORT}`;

const serverProc = spawn(process.execPath, ['server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

serverProc.stdout.on('data', (d) => process.stdout.write(`[srv] ${d}`));
serverProc.stderr.on('data', (d) => process.stderr.write(`[srv-err] ${d}`));

try {
  // Wait for server HTTP port + 3-model readiness
  let health = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) {
        health = await r.json();
        if (health.ready) break;
      }
    } catch {
      // wait
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  assert.ok(health?.ready, `Expected all 3 models ready, got: ${JSON.stringify(health)}`);
  console.log('1. /api/health 3-model readiness PASS:', {
    earlybirdLoadMs: health.earlybirdLoadMs,
    gemmaLoadMs: health.gemmaLoadMs,
    qwenLoadMs: health.qwenLoadMs,
  });

  // 2. Test Frontend HTML serving
  const htmlRes = await fetch(`${BASE}/`);
  assert.equal(htmlRes.status, 200);
  const html = await htmlRes.text();
  assert.ok(html.includes('<div id="root">'), 'Expected SPA index.html');
  console.log('2. Static SPA index.html serving PASS');

  // 3. Test EmbeddingGemma 2 /api/voice/resolve + auto-materialize CONNECT with edgeLabel
  const connRes = await fetch(`${BASE}/api/voice/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: 1,
      utteranceId: 1,
      phase: 'commit',
      text: 'connect API Gateway to Redis Cache with label gRPC',
      ghostText: '',
      words: [
        ['connect', 0.99],
        ['API', 0.99],
        ['Gateway', 0.99],
        ['to', 0.99],
        ['Redis', 0.99],
        ['Cache', 0.99],
        ['with', 0.99],
        ['label', 0.99],
        ['gRPC', 0.99],
      ],
      shapes: [],
      sourceHint: 'API Gateway',
      targetHint: 'Redis Cache',
    }),
  });
  assert.equal(connRes.status, 200);
  const { resolution: connSem } = await connRes.json();
  const emptySnap = { shapes: [], focusRegs: [], editionId: 'bauhaus-archive', activeAnimations: 0 };
  const connCompiled = compileVerifiedSyscall(null, emptySnap, connSem);
  assert.equal(connCompiled.syscall.op, 'CONNECT');
  assert.equal(connCompiled.syscall.fromLabel, 'API Gateway');
  assert.equal(connCompiled.syscall.toLabel, 'Redis Cache');
  assert.equal(connCompiled.syscall.edgeLabel, 'GRPC');
  console.log('3. Auto-materialize CONNECT + edgeLabel PASS:', connCompiled.opcodeLine);

  // 4. Test Qwen2.5-0.5B State Computer RPC (/api/state-computer)
  const populatedSnap = {
    shapes: [
      { reg: 's1', id: 'shape:1', label: 'Moon', shapeType: 'ellipse', color: 'grey', x: 180, y: 0, w: 120, h: 120, anim: null, locked: false },
      { reg: 's2', id: 'shape:2', label: 'Earth', shapeType: 'ellipse', color: 'blue', x: 0, y: 0, w: 160, h: 160, anim: null, locked: false },
    ],
    focusRegs: ['s1'],
    editionId: 'bauhaus-archive',
    activeAnimations: 0,
  };
  const orbitSemRes = await fetch(`${BASE}/api/voice/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: 2,
      utteranceId: 2,
      phase: 'commit',
      text: 'make the moon orbit around the earth',
      words: [['make', 0.98], ['the', 0.98], ['moon', 0.99], ['orbit', 0.99], ['around', 0.99], ['the', 0.98], ['earth', 0.99]],
      shapes: populatedSnap.shapes,
      sourceHint: 'moon',
      targetHint: 'earth',
    }),
  });
  const { resolution: orbitSem } = await orbitSemRes.json();
  const messages = buildStateComputerMessages(populatedSnap, orbitSem.rawText);
  const qwenRes = await fetch(`${BASE}/api/state-computer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  assert.equal(qwenRes.status, 200);
  const qwenJson = await qwenRes.json();
  assert.ok(qwenJson.ok && typeof qwenJson.opcode === 'string');
  const orbitCompiled = compileVerifiedSyscall(qwenJson.opcode, populatedSnap, orbitSem);
  assert.equal(orbitCompiled.syscall.op, 'ANIM');
  assert.equal(orbitCompiled.syscall.kind, 'orbit');
  assert.equal(orbitCompiled.syscall.aroundReg, 's2');
  console.log('4. Qwen2.5-0.5B State Computer RPC PASS:', qwenJson.opcode, '->', orbitCompiled.opcodeLine, `(${qwenJson.latencyMs}ms)`);

  // 5. Test Curatorial Vision Harmonize (/api/voice/harmonize)
  const harmRes = await fetch(`${BASE}/api/voice/harmonize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      canvasShapes: [
        { reg: 's1', id: 'shape:1', label: 'Gateway', shapeType: 'hexagon', color: 'black', x: 100, y: 100, w: 180, h: 120 },
        { reg: 's2', id: 'shape:2', label: 'Auth', shapeType: 'diamond', color: 'black', x: 120, y: 110, w: 165, h: 150 },
      ],
      goalPrompt: 'harmonize into dark obsidian brutalist presentation',
    }),
  });
  assert.equal(harmRes.status, 200);
  const { harmony } = await harmRes.json();
  assert.equal(harmony.editionId, 'obsidian-monolith');
  assert.equal(harmony.critiqueId, 'dense-cluster');
  assert.equal(harmony.shouldUntangle, true);
  console.log('5. Vision Harmonize & Overlap Critique PASS:', harmony.editionId, '|', harmony.critiqueTitle, `(${harmony.latencyMs}ms)`);

  // 6. Test Safety Gate: unconfirmed delete blocked even if Qwen hallucinated DEL
  const safeSemRes = await fetch(`${BASE}/api/voice/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: 'move the moon above the earth',
      words: [['move', 0.99], ['the', 0.99], ['moon', 0.99], ['above', 0.99], ['the', 0.99], ['earth', 0.99]],
      shapes: populatedSnap.shapes,
      sourceHint: 'moon',
      targetHint: 'earth',
    }),
  });
  const { resolution: safeSem } = await safeSemRes.json();
  const blockedDel = compileVerifiedSyscall('DEL s1', populatedSnap, safeSem);
  assert.notEqual(blockedDel.syscall.op, 'DELETE');
  assert.equal(blockedDel.syscall.op, 'PLACE');
  console.log('6. Destructive Safety Lock + Relative Move PASS:', blockedDel.opcodeLine);

  // 7. Test WebSocket /ws/voice Earlybird-29M streaming readiness + binary PCM handling
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/voice`);
    const timer = setTimeout(() => reject(new Error('WS timeout')), 5000);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString('utf8'));
      if (msg.type === 'ready') {
        // Send 3 chunks of 80ms PCM audio (1280 float32 samples each)
        const pcm = new Float32Array(1280);
        for (let i = 0; i < 1280; i++) pcm[i] = Math.sin(i * 0.1) * 0.03;
        ws.send(Buffer.from(pcm.buffer));
        ws.send(Buffer.from(pcm.buffer));
        ws.send(Buffer.from(pcm.buffer));
        setTimeout(() => {
          clearTimeout(timer);
          ws.close();
          resolve();
        }, 250);
      }
    });
    ws.on('error', reject);
  });
  console.log('7. WebSocket /ws/voice Earlybird-29M binary PCM stream PASS!');

  console.log('\nALL 7 E2E STUDIO TESTS PASSED 100%!');
} finally {
  serverProc.kill();
}
