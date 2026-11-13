import { test, expect } from 'bun:test'
import app from './index'

test('health check returns 200 ok', async () => {
  const res = await app.request('/api/health')
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ status: 'ok' })
})

test('creates a task', async () => {
  const res = await app.request('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'x' }),
  })
  expect(res.status).toBe(201)
  const body = await res.json()
  expect(body).toMatchObject({ title: 'x', completed: false })
})

test('rejects invalid task payload at Zod boundary', async () => {
  const res = await app.request('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '' }),
  })
  expect(res.status).toBe(400)
})

test('returns expanded Earlybird and EmbeddingGemma 2 design catalog (11 themes, 10 layouts, 22 intents)', async () => {
  const res = await app.request('/api/voice/catalog')
  expect(res.status).toBe(200)
  const body = (await res.json()) as any
  expect(body.status.earlybird).toBe('sahilmahendrakar/Earlybird-29M')
  expect(body.status.embeddingGemma).toBe('google/embeddinggemma-2')
  expect(body.themes.length).toBe(11)
  expect(body.layouts.length).toBe(10)
  expect(body.intents.length).toBe(22)
})

test('routes spoken shape creation command with semantic archetype & color', async () => {
  const res = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'draw a blue cloud called AWS Gateway',
      canvasShapes: [],
    }),
  })
  expect(res.status).toBe(200)
  const { command } = (await res.json()) as any
  expect(command.intent).toBe('create_shape')
  expect(command.shape.archetype.geo).toBe('cloud')
  expect(command.shape.color).toBe('blue')
  expect(command.shape.label).toBe('AWS Gateway')
})

test('routes spoken visual design theme switch including Watercolor Atelier, Bauhaus & Cyberpunk palettes', async () => {
  const res1 = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'switch to cyberpunk neon aesthetic',
      canvasShapes: [],
    }),
  })
  expect(res1.status).toBe(200)
  expect(((await res1.json()) as any).command.theme.id).toBe('cyberpunk-neon')

  const res2 = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'apply bauhaus primary geometric style',
      canvasShapes: [],
    }),
  })
  expect(res2.status).toBe(200)
  expect(((await res2.json()) as any).command.theme.id).toBe('bauhaus-geometric')

  const res3 = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'paint with watercolor atelier palette',
      canvasShapes: [],
    }),
  })
  expect(res3.status).toBe(200)
  expect(((await res3.json()) as any).command.theme.id).toBe('watercolor-atelier')
})

test('routes spoken multi-shape layout generation including RAG and C4 diagrams', async () => {
  const res1 = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'generate a mind map about Quantum Audio',
      canvasShapes: [],
    }),
  })
  expect(res1.status).toBe(200)
  const cmd1 = ((await res1.json()) as any).command
  expect(cmd1.intent).toBe('generate_layout')
  expect(cmd1.layout.template.id).toBe('mindmap-radial')
  expect(cmd1.layout.topicTitle).toBe('Quantum Audio')

  const res2 = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'generate a multimodal rag vector pipeline diagram',
      canvasShapes: [],
    }),
  })
  expect(res2.status).toBe(200)
  const cmd2 = ((await res2.json()) as any).command
  expect(cmd2.intent).toBe('generate_layout')
  expect(cmd2.layout.template.id).toBe('rag-vector-pipeline')
})

test('resolves existing canvas shapes semantically when connecting nodes', async () => {
  const canvasShapes = [
    { id: 'shape:auth1', type: 'geo', geo: 'rectangle', label: 'User Login Gateway', x: -200, y: 0, w: 200, h: 100 },
    { id: 'shape:db1', type: 'geo', geo: 'oval', label: 'Postgres Account Store', x: 250, y: 0, w: 200, h: 100 },
  ]
  const res = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'connect the login gateway to the account store',
      canvasShapes,
    }),
  })
  expect(res.status).toBe(200)
  const { command } = (await res.json()) as any
  expect(command.intent).toBe('connect_shapes')
  expect(command.connection.fromShapeId).toBe('shape:auth1')
  expect(command.connection.toShapeId).toBe('shape:db1')
})

test('decomposes multi-clause compound utterances and resolves anaphora ("it") across clauses', async () => {
  const canvasShapes = [
    { id: 'shape:gw', type: 'geo', geo: 'trapezoid', label: 'Stream Gateway', x: 0, y: 0, w: 220, h: 110 },
  ]
  const res = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'draw a blue cloud called Edge CDN and connect it to the Stream Gateway',
      canvasShapes,
    }),
  })
  expect(res.status).toBe(200)
  const { command } = (await res.json()) as any
  expect(Array.isArray(command.steps)).toBe(true)
  expect(command.steps.length).toBe(2)
  expect(command.steps[0].intent).toBe('create_shape')
  expect(command.steps[0].shape.label).toBe('Edge CDN')
  expect(command.steps[1].intent).toBe('connect_shapes')
  expect(command.steps[1].connection.fromLabel).toBe('Edge CDN')
  expect(command.steps[1].connection.toShapeId).toBe('shape:gw')
})

test('handles relative spatial placement, rename, frame, swap, and circle distribution intents', async () => {
  const canvasShapes = [
    { id: 'shape:a', type: 'geo', label: 'API Gateway', x: -200, y: 0, w: 200, h: 100 },
    { id: 'shape:b', type: 'geo', label: 'Redis Cache', x: 200, y: 0, w: 200, h: 100 },
  ]

  const relMove = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'put the Redis Cache below the API Gateway',
      canvasShapes,
    }),
  })
  const moveCmd = ((await relMove.json()) as any).command
  expect(moveCmd.intent).toBe('move_target')
  expect(moveCmd.targetOp.targetShapeId).toBe('shape:b')
  expect(moveCmd.targetOp.relativeToShapeId).toBe('shape:a')
  expect(moveCmd.targetOp.relativePlacement).toBe('below')

  const renameRes = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'rename the Redis Cache to Vector Index',
      canvasShapes,
    }),
  })
  const renameCmd = ((await renameRes.json()) as any).command
  expect(renameCmd.intent).toBe('rename_target')
  expect(renameCmd.targetOp.targetShapeId).toBe('shape:b')
  expect(renameCmd.targetOp.newLabel).toBe('Vector Index')

  const swapRes = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'swap the API Gateway and the Redis Cache',
      canvasShapes,
    }),
  })
  const swapCmd = ((await swapRes.json()) as any).command
  expect(swapCmd.intent).toBe('swap_positions')
  expect(swapCmd.targetOp.targetShapeId).toBe('shape:a')
  expect(swapCmd.targetOp.secondTargetShapeId).toBe('shape:b')

  const frameRes = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'frame all shapes as Core Platform',
      canvasShapes,
    }),
  })
  const frameCmd = ((await frameRes.json()) as any).command
  expect(frameCmd.intent).toBe('group_frame')
  expect(frameCmd.frameOp.frameLabel).toBe('Core Platform')

  const exportPngRes = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'export canvas to image',
      canvasShapes,
    }),
  })
  const exportPngCmd = ((await exportPngRes.json()) as any).command
  expect(exportPngCmd.intent).toBe('export_canvas')
  expect(exportPngCmd.exportFormat).toBe('png')

  const exportSvgRes = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'save the diagram as svg',
      canvasShapes,
    }),
  })
  const exportSvgCmd = ((await exportSvgRes.json()) as any).command
  expect(exportSvgCmd.intent).toBe('export_canvas')
  expect(exportSvgCmd.exportFormat).toBe('svg')
})

test('records telemetry in SQLite and serves /api/voice/history and /api/voice/metrics', async () => {
  const histRes = await app.request('/api/voice/history')
  expect(histRes.status).toBe(200)
  const histBody = (await histRes.json()) as any
  expect(Array.isArray(histBody.events)).toBe(true)
  expect(histBody.events.length).toBeGreaterThan(0)

  const metricsRes = await app.request('/api/voice/metrics')
  expect(metricsRes.status).toBe(200)
  const metricsBody = (await metricsRes.json()) as any
  expect(metricsBody.totalCommands).toBeGreaterThan(0)
  expect(typeof metricsBody.avgConfidence).toBe('number')
})

test('harmonizes visual design via multimodal endpoint', async () => {
  const res = await app.request('/api/voice/harmonize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      canvasShapes: [
        { id: 'shape:1', type: 'geo', label: 'Ingress', x: 0, y: 0, w: 180, h: 100 },
      ],
      canvasBg: '#08101d',
      goalPrompt: 'warm editorial magazine paper style',
    }),
  })
  expect(res.status).toBe(200)
  const body = (await res.json()) as any
  expect(body.theme.id).toBe('warm-editorial')
  expect(body.harmony.bestThemeId).toBe('warm-editorial')
})

test('rejects empty voice command at Zod boundary', async () => {
  const res = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ utterance: '' }),
  })
  expect(res.status).toBe(400)
})
