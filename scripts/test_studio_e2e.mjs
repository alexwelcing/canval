import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import {
  buildStateComputerMessages,
  compileCompoundSyscalls,
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

  // 7. Test WebSocket /ws/voice Zero-RTT readiness + sync_state + binary PCM handling
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/voice`);
    const timer = setTimeout(() => reject(new Error('WS timeout')), 5000);
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString('utf8'));
      if (msg.type === 'ready') {
        assert.equal(msg.zeroRttResolve, true, 'Expected zeroRttResolve: true on /ws/voice');
        ws.send(JSON.stringify({ type: 'sync_state', shapes: populatedSnap.shapes }));
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
  console.log('7. WebSocket /ws/voice Zero-RTT + sync_state + Earlybird PCM stream PASS!');

  // 8. Test Multi-Clause Superscalar Compound Compilation (<2ms, zero Qwen stall)
  const compoundText =
    'draw a yellow circle called Sun, add a blue circle called Earth, connect Sun to Earth, and make Earth orbit around Sun';
  const compRes = await fetch(`${BASE}/api/voice/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: compoundText,
      words: compoundText.split(/\s+/).map((w) => [w, 0.99]),
      shapes: [],
    }),
  });
  const { resolution: compSem } = await compRes.json();
  const tComp0 = performance.now();
  const compPlan = compileCompoundSyscalls(null, emptySnap, compSem);
  const compMs = Math.round((performance.now() - tComp0) * 100) / 100;
  assert.equal(compPlan.needsQwenDisambiguation, false, 'Expected zero Qwen stall on unambiguous compound speech');
  assert.equal(compPlan.syscalls.length, 4, `Expected 4 syscalls, got: ${JSON.stringify(compPlan.syscalls)}`);
  assert.deepEqual(
    compPlan.syscalls.map((s) => s.op),
    ['SPAWN', 'SPAWN', 'CONNECT', 'ANIM'],
  );
  assert.equal(compPlan.syscalls[0].label, 'Sun');
  assert.equal(compPlan.syscalls[1].label, 'Earth');
  assert.equal(compPlan.syscalls[3].aroundLabelHint?.toLowerCase(), 'sun');
  console.log(`8. Superscalar 4-clause compound compilation PASS in ${compMs}ms:`, compPlan.opcodeLine);

  // 9. Test Multi-Hop Chain Pipeline ("connect Client to Gateway to Auth to Postgres")
  const chainText = 'connect Client to Gateway to Auth to Postgres';
  const chainRes = await fetch(`${BASE}/api/voice/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: chainText,
      words: chainText.split(/\s+/).map((w) => [w, 0.99]),
      shapes: [],
    }),
  });
  const { resolution: chainSem } = await chainRes.json();
  const chainPlan = compileCompoundSyscalls(null, emptySnap, chainSem);
  assert.equal(chainPlan.syscall.op, 'CONNECT');
  assert.deepEqual(chainPlan.syscall.chainLabels, ['Client', 'Gateway', 'Auth', 'Postgres']);
  console.log('9. Multi-hop chain pipeline PASS:', chainPlan.opcodeLine);

  // 10. Test Terse Rapid-Fire Shorthands & New Syscalls (ROTATE, ALIGN, FRAME_GROUP, STYLE_ARROWS, DUPLICATE xN)
  const shorthandChecks = [
    { text: 'red circle', snap: emptySnap, expectedOp: 'SPAWN' },
    { text: 'three blue stars', snap: emptySnap, expectedOp: 'SPAWN' },
    { text: 'rotate 45 degrees', snap: populatedSnap, expectedOp: 'ROTATE' },
    { text: 'align top edges', snap: populatedSnap, expectedOp: 'ALIGN' },
    { text: 'put a frame around everything called Backend', snap: populatedSnap, expectedOp: 'FRAME_GROUP' },
    { text: 'curve the arrows', snap: populatedSnap, expectedOp: 'STYLE_ARROWS' },
    { text: 'duplicate four times', snap: populatedSnap, expectedOp: 'DUPLICATE' },
  ];
  for (const chk of shorthandChecks) {
    const r = await fetch(`${BASE}/api/voice/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: chk.text,
        words: chk.text.split(/\s+/).map((w) => [w, 0.99]),
        shapes: chk.snap.shapes,
      }),
    });
    const { resolution } = await r.json();
    const compiled = compileCompoundSyscalls(null, chk.snap, resolution);
    assert.equal(
      compiled.syscall.op,
      chk.expectedOp,
      `For "${chk.text}" expected ${chk.expectedOp}, got ${compiled.syscall.op} (${compiled.opcodeLine})`,
    );
    assert.equal(compiled.needsQwenDisambiguation, false);
  }
  console.log('10. Rapid-fire shorthands & new syscalls (ROTATE, ALIGN, FRAME_GROUP, STYLE_ARROWS, DUPLICATE) PASS');

  // 11. Test Expanded Conceptual Blueprints (orbit_system, neural, venn, funnel, cycle, wireframe)
  const bpChecks = [
    { text: 'draw a solar system with planets orbiting the sun', expectedBp: 'orbit_system' },
    { text: 'create a neural network diagram', expectedBp: 'neural' },
    { text: 'make a venn diagram', expectedBp: 'venn' },
    { text: 'draw a conversion funnel', expectedBp: 'funnel' },
    { text: 'create a feedback loop cycle', expectedBp: 'cycle' },
    { text: 'draw a mobile app wireframe', expectedBp: 'wireframe' },
  ];
  for (const bchk of bpChecks) {
    const r = await fetch(`${BASE}/api/voice/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: bchk.text,
        words: bchk.text.split(/\s+/).map((w) => [w, 0.99]),
        shapes: [],
      }),
    });
    const { resolution } = await r.json();
    const compiled = compileCompoundSyscalls(null, emptySnap, resolution);
    assert.equal(compiled.syscall.op, 'LAYOUT', `Expected LAYOUT for "${bchk.text}", got ${compiled.syscall.op}`);
    assert.equal(
      compiled.syscall.kind,
      bchk.expectedBp,
      `Expected blueprint ${bchk.expectedBp} for "${bchk.text}", got ${compiled.syscall.kind}`,
    );
  }
  console.log('11. Expanded conceptual blueprints (orbit_system, neural, venn, funnel, cycle, wireframe) PASS');

  // 12. Test Open-Vocabulary Topic Ideation (/api/voice/ideate via Qwen2.5-0.5B + instant cache)
  const idRes1 = await fetch(`${BASE}/api/voice/ideate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: 'Quantum Computing', blueprintId: 'mindmap', count: 4 }),
  });
  assert.equal(idRes1.status, 200);
  const idJson1 = await idRes1.json();
  assert.ok(idJson1.ok && Array.isArray(idJson1.labels) && idJson1.labels.length >= 2);

  const idRes2 = await fetch(`${BASE}/api/voice/ideate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: 'Quantum Computing', blueprintId: 'mindmap', count: 4 }),
  });
  const idJson2 = await idRes2.json();
  assert.equal(idJson2.cached, true);
  console.log('12. Open-vocabulary Topic Ideation PASS:', idJson1.labels, `(${idJson1.latencyMs}ms cold, ${idJson2.latencyMs}ms cached)`);

  // 13. Rapid-Fire 20-Command Throughput Benchmark (Cold + LRU Warm)
  const rapidCommands = [
    'red circle',
    'blue hexagon called Gateway',
    'green trapezoid called Postgres',
    'connect Gateway to Postgres',
    'move left',
    'bigger',
    'make it float',
    'faster',
    'yellow star',
    'violet diamond called Auth',
    'red circle',
    'move left',
    'bigger',
    'faster',
    'yellow star',
    'draw three circles in a row',
    'curve the arrows',
    'rotate 45 degrees',
    'align center horizontally',
    'stop animating',
  ];
  const resolveTimes = [];
  const stateTimes = [];
  for (const cmd of rapidCommands) {
    const r = await fetch(`${BASE}/api/voice/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cmd,
        words: cmd.split(/\s+/).map((w) => [w, 0.99]),
        shapes: populatedSnap.shapes,
      }),
    });
    const { resolution } = await r.json();
    resolveTimes.push(resolution.elapsedMs);
    const ts0 = performance.now();
    compileCompoundSyscalls(null, populatedSnap, resolution);
    stateTimes.push(performance.now() - ts0);
  }
  const avgResolveMs = Math.round((resolveTimes.reduce((a, b) => a + b, 0) / resolveTimes.length) * 100) / 100;
  const cachedSlice = resolveTimes.slice(10, 15);
  const avgCachedMs = Math.round((cachedSlice.reduce((a, b) => a + b, 0) / cachedSlice.length) * 100) / 100;
  const avgStateMs = Math.round((stateTimes.reduce((a, b) => a + b, 0) / stateTimes.length) * 1000) / 1000;
  assert.ok(avgCachedMs < 2, `Expected LRU cached resolve < 2ms, got ${avgCachedMs}ms`);
  assert.ok(avgStateMs < 1.5, `Expected Superscalar state compile < 1.5ms, got ${avgStateMs}ms`);
  console.log(
    `13. Rapid-Fire 20-Command Benchmark PASS: avgGemmaMs=${avgResolveMs}ms, lruWarmMs=${avgCachedMs}ms, avgStateCompilerMs=${avgStateMs}ms`,
  );

  console.log('\nALL 13 E2E STUDIO + SPEED + CREATIVE BREADTH TESTS PASSED 100%!');
} finally {
  serverProc.kill();
}
