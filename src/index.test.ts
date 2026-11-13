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

test('returns Earlybird and EmbeddingGemma 2 design catalog', async () => {
  const res = await app.request('/api/voice/catalog')
  expect(res.status).toBe(200)
  const body = (await res.json()) as any
  expect(body.status.earlybird).toBe('sahilmahendrakar/Earlybird-29M')
  expect(body.status.embeddingGemma).toBe('google/embeddinggemma-2')
  expect(body.themes.length).toBeGreaterThanOrEqual(7)
  expect(body.layouts.length).toBeGreaterThanOrEqual(6)
  expect(body.intents.length).toBeGreaterThanOrEqual(15)
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

test('routes spoken visual design theme switch via EmbeddingGemma 2 palette matching', async () => {
  const res = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'switch to cyberpunk neon aesthetic',
      canvasShapes: [],
    }),
  })
  expect(res.status).toBe(200)
  const { command } = (await res.json()) as any
  expect(command.intent).toBe('apply_theme')
  expect(command.theme.id).toBe('cyberpunk-neon')
})

test('routes spoken multi-shape layout generation', async () => {
  const res = await app.request('/api/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      utterance: 'generate a mind map about Quantum Audio',
      canvasShapes: [],
    }),
  })
  expect(res.status).toBe(200)
  const { command } = (await res.json()) as any
  expect(command.intent).toBe('generate_layout')
  expect(command.layout.template.id).toBe('mindmap-radial')
  expect(command.layout.topicTitle).toBe('Quantum Audio')
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
