import { Hono } from 'hono'
import { createBunWebSocket } from 'hono/bun'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  COMMAND_INTENTS,
  DESIGN_THEMES,
  LAYOUT_TEMPLATES,
  SHAPE_ARCHETYPES,
} from '../design/catalog'
import { routeVoiceCommand } from '../design/router'
import { mlBridge } from '../ml/client'

export const { upgradeWebSocket, websocket } = createBunWebSocket()

const canvasShapeSchema = z.object({
  id: z.string().min(1),
  type: z.string().default('geo'),
  geo: z.string().optional(),
  label: z.string().default(''),
  x: z.number().default(0),
  y: z.number().default(0),
  w: z.number().default(180),
  h: z.number().default(100),
  color: z.string().optional(),
})

const commandBodySchema = z.object({
  utterance: z.string().min(1),
  canvasShapes: z.array(canvasShapeSchema).default([]),
})

const harmonizeBodySchema = z.object({
  canvasShapes: z.array(canvasShapeSchema).default([]),
  canvasBg: z.string().default('#08101d'),
  goalPrompt: z.string().default('cohesive high-contrast architectural diagram'),
  imageBase64: z.string().optional(),
})

const audioChunkBodySchema = z.object({
  sessionId: z.string().min(1).default('default'),
  pcmBase64: z.string().default(''),
  reset: z.boolean().optional(),
})

function extractConnectionQueries(utterance: string): { fromQuery?: string; toQuery?: string } {
  const m = utterance
    .trim()
    .match(/\b(?:connect|link|wire|point|draw an? arrow from|arrow from)\s+(?:the\s+)?(.+?)\s+(?:to|with|into|towards)\s+(?:the\s+)?(.+)$/i)
  if (!m) return {}
  return {
    fromQuery: m[1]?.trim(),
    toQuery: m[2]?.replace(/\bwith label\s+.+$/i, '').trim(),
  }
}

export const voiceRoutes = new Hono()
  .get('/api/voice/catalog', (c) => {
    return c.json({
      status: mlBridge.getStatus(),
      themes: DESIGN_THEMES,
      layouts: LAYOUT_TEMPLATES,
      archetypes: SHAPE_ARCHETYPES,
      intents: COMMAND_INTENTS,
    })
  })
  .post('/api/voice/command', zValidator('json', commandBodySchema), async (c) => {
    const { utterance, canvasShapes } = c.req.valid('json')
    const { fromQuery, toQuery } = extractConnectionQueries(utterance)
    const scores = await mlBridge.scoreUtterance(utterance, canvasShapes, fromQuery, toQuery)
    const command = routeVoiceCommand(utterance, canvasShapes, scores)
    return c.json({ command, scores })
  })
  .post('/api/voice/harmonize', zValidator('json', harmonizeBodySchema), async (c) => {
    const { canvasShapes, canvasBg, goalPrompt, imageBase64 } = c.req.valid('json')
    const harmony = await mlBridge.harmonizeVision(canvasShapes, canvasBg, goalPrompt, imageBase64)
    const matchedTheme =
      DESIGN_THEMES.find((t) => t.id === harmony.bestThemeId) ?? DESIGN_THEMES[0]!
    return c.json({
      harmony,
      theme: matchedTheme,
    })
  })
  .post('/api/voice/audio-chunk', zValidator('json', audioChunkBodySchema), async (c) => {
    const { sessionId, pcmBase64, reset } = c.req.valid('json')
    if (reset) {
      const res = await mlBridge.resetAudioSession(sessionId)
      return c.json(res)
    }
    const res = await mlBridge.feedAudioChunk(sessionId, pcmBase64)
    return c.json(res)
  })
  .get(
    '/ws/voice',
    upgradeWebSocket(() => {
      const sessionId = `eb_${crypto.randomUUID().slice(0, 8)}`
      let latestShapes: z.infer<typeof canvasShapeSchema>[] = []

      return {
        onOpen(_evt, ws) {
          mlBridge.ensureStarted()
          ws.send(
            JSON.stringify({
              type: 'ready',
              sessionId,
              status: mlBridge.getStatus(),
            })
          )
        },
        async onMessage(evt, ws) {
          const data = evt.data
          if (typeof data === 'string') {
            try {
              const msg = JSON.parse(data)
              if (msg.type === 'reset') {
                const u = await mlBridge.resetAudioSession(sessionId)
                ws.send(JSON.stringify({ type: 'transcript', ...u }))
                return
              }
              if (msg.type === 'sync_shapes' && Array.isArray(msg.canvasShapes)) {
                latestShapes = msg.canvasShapes
                return
              }
              if (msg.type === 'commit' && typeof msg.utterance === 'string' && msg.utterance.trim()) {
                const shapes = Array.isArray(msg.canvasShapes) ? msg.canvasShapes : latestShapes
                const { fromQuery, toQuery } = extractConnectionQueries(msg.utterance)
                const scores = await mlBridge.scoreUtterance(msg.utterance, shapes, fromQuery, toQuery)
                const command = routeVoiceCommand(msg.utterance, shapes, scores)
                await mlBridge.resetAudioSession(sessionId)
                ws.send(JSON.stringify({ type: 'command', command, scores }))
                return
              }
              if (msg.type === 'speculate' && typeof msg.utterance === 'string' && msg.utterance.trim()) {
                const preview = routeVoiceCommand(msg.utterance, latestShapes)
                ws.send(JSON.stringify({ type: 'speculative_intent', command: preview }))
                return
              }
            } catch {
              // ignore malformed message
            }
            return
          }

          // Binary PCM float32 audio chunk (16 kHz mono)
          let bytes: Uint8Array | null = null
          if (data instanceof ArrayBuffer) {
            bytes = new Uint8Array(data)
          } else if (ArrayBuffer.isView(data)) {
            bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          }
          if (!bytes || bytes.byteLength === 0) return

          const b64 = Buffer.from(bytes).toString('base64')
          const update = await mlBridge.feedAudioChunk(sessionId, b64)
          if (update.updated || update.words.length > 0) {
            const speculativeText = [
              ...update.words.map((w) => w[0]),
              ...update.guess.filter((g) => g[1] >= 0.55).map((g) => g[0]),
            ]
              .join(' ')
              .trim()
            const speculative =
              speculativeText.length >= 4
                ? routeVoiceCommand(speculativeText, latestShapes)
                : undefined
            ws.send(
              JSON.stringify({
                type: 'transcript',
                ...update,
                speculative,
              })
            )
          }
        },
      }
    })
  )
