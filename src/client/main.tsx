import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Tldraw,
  Editor,
  createShapeId,
  toRichText,
  type TLShapeId,
} from 'tldraw'
import 'tldraw/tldraw.css'
import type {
  CanvasActionCommand,
  CanvasShapeSummary,
} from '../design/router'
import { DESIGN_THEMES, SHAPE_ARCHETYPES, type DesignThemeSpec } from '../design/catalog'

const EARLYBIRD_WORKLET = `
class EarlybirdCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = [];
    this.ratio = sampleRate / 16000;
    this.acc = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let lvl = 0;
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > lvl) lvl = a;
      this.acc += 1;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        this.buf.push(ch[i]);
      }
    }
    if (this.buf.length >= 1280) {
      const pcm = new Float32Array(this.buf.splice(0, 1280));
      this.port.postMessage({ pcm, lvl }, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('earlybird-cap', EarlybirdCaptureProcessor);
`

declare global {
  interface Window {
    __tldrawEditor?: Editor
    voiceCanvasSpeak?: (utterance: string) => Promise<CanvasActionCommand | null>
    voiceCanvasHarmonize?: (goalPrompt?: string) => Promise<void>
  }
}

function extractLabelFromShape(editor: Editor, shape: any): string {
  try {
    const util = editor.getShapeUtil(shape)
    const text = util.getText?.(shape)
    if (typeof text === 'string' && text.trim()) return text.trim()
  } catch {
    // fallback
  }
  if (typeof shape?.props?.name === 'string' && shape.props.name.trim()) {
    return shape.props.name.trim()
  }
  return ''
}

function summarizeCanvasShapes(editor: Editor): CanvasShapeSummary[] {
  const shapes = editor.getCurrentPageShapes()
  const out: CanvasShapeSummary[] = []
  for (const s of shapes as any[]) {
    if (s.type === 'arrow') continue
    const bounds = editor.getShapePageBounds(s.id)
    const label = extractLabelFromShape(editor, s)
    out.push({
      id: s.id,
      type: s.type,
      geo: s.props?.geo,
      label: label || s.props?.name || s.type,
      x: Math.round(bounds?.x ?? s.x ?? 0),
      y: Math.round(bounds?.y ?? s.y ?? 0),
      w: Math.round(bounds?.w ?? s.props?.w ?? 180),
      h: Math.round(bounds?.h ?? s.props?.h ?? 100),
      color: s.props?.color,
    })
  }
  return out
}

function App() {
  const editorRef = useRef<Editor | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [activeTheme, setActiveTheme] = useState<DesignThemeSpec>(DESIGN_THEMES[0]!)
  const [micState, setMicState] = useState<'listening' | 'connecting' | 'air-keyboard'>('connecting')
  const [micLevel, setMicLevel] = useState<number>(0)
  const [liveWords, setLiveWords] = useState<[string, number][]>([])
  const [ghostWords, setGhostWords] = useState<[string, number][]>([])
  const [speculativeSummary, setSpeculativeSummary] = useState<string>('')
  const [lastExecuted, setLastExecuted] = useState<{
    summary: string
    utterance: string
    confidence: number
    modelUsed: string
    latencyMs: number
  } | null>(null)
  const [mlReady, setMlReady] = useState<boolean>(false)
  const [airTypingBuffer, setAirTypingBuffer] = useState<string>('')

  const activeThemeRef = useRef<DesignThemeSpec>(activeTheme)
  activeThemeRef.current = activeTheme

  const applyThemeToCanvas = useCallback((editor: Editor, theme: DesignThemeSpec) => {
    setActiveTheme(theme)
    activeThemeRef.current = theme
    try {
      editor.user.updateUserPreferences({
        colorScheme: theme.isDark ? 'dark' : 'light',
      })
    } catch {
      // ignore
    }

    const shapes = editor.getCurrentPageShapes() as any[]
    if (!shapes.length) return

    const palette: DesignThemeSpec['primaryColor'][] = [
      theme.primaryColor,
      theme.secondaryColor,
      theme.accentColor,
      theme.mutedColor,
    ]

    editor.run(() => {
      shapes.forEach((s, idx) => {
        if (s.type === 'geo') {
          editor.updateShape({
            id: s.id,
            type: 'geo',
            props: {
              color: palette[idx % palette.length],
              fill: theme.fill,
              dash: theme.dash,
              font: theme.font,
            },
          } as any)
        } else if (s.type === 'note') {
          editor.updateShape({
            id: s.id,
            type: 'note',
            props: {
              color: palette[(idx + 1) % palette.length],
              font: theme.font,
            },
          } as any)
        } else if (s.type === 'arrow') {
          editor.updateShape({
            id: s.id,
            type: 'arrow',
            props: {
              color: theme.secondaryColor,
              dash: theme.dash,
              font: theme.font,
            },
          } as any)
        } else if (s.type === 'text') {
          editor.updateShape({
            id: s.id,
            type: 'text',
            props: {
              color: theme.primaryColor,
              font: theme.font,
            },
          } as any)
        } else if (s.type === 'frame') {
          editor.updateShape({
            id: s.id,
            type: 'frame',
            props: {
              color: theme.mutedColor,
            },
          } as any)
        }
      })
    })
  }, [])

  const executeCanvasCommand = useCallback(
    async (cmd: CanvasActionCommand) => {
      const editor = editorRef.current
      if (!editor) return

      const theme = activeThemeRef.current
      const viewport = editor.getViewportPageBounds()
      const cx = viewport.x + viewport.w / 2
      const cy = viewport.y + viewport.h / 2

      if (cmd.intent === 'clear_canvas') {
        const allIds = Array.from(editor.getCurrentPageShapeIds())
        if (allIds.length > 0) {
          editor.deleteShapes(allIds)
        }
      } else if (cmd.intent === 'undo_redo') {
        if (cmd.historyOp === 'redo') editor.redo()
        else editor.undo()
      } else if (cmd.intent === 'camera_control') {
        if (cmd.cameraOp === 'zoom_in') editor.zoomIn(undefined, { animation: { duration: 220 } })
        else if (cmd.cameraOp === 'zoom_out') editor.zoomOut(undefined, { animation: { duration: 220 } })
        else editor.zoomToFit({ animation: { duration: 280 } })
      } else if (cmd.intent === 'apply_theme' && cmd.theme) {
        applyThemeToCanvas(editor, cmd.theme)
      } else if (cmd.intent === 'vision_harmonize') {
        const shapes = summarizeCanvasShapes(editor)
        const res = await fetch('/api/voice/harmonize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canvasShapes: shapes,
            canvasBg: theme.canvasBg,
            goalPrompt: cmd.utterance,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.theme) {
            applyThemeToCanvas(editor, data.theme)
          }
          if (data.harmony?.critiqueId === 'dense-cluster') {
            // Also organize shapes into a balanced grid
            const nonArrows = (editor.getCurrentPageShapes() as any[]).filter((s) => s.type !== 'arrow' && s.type !== 'frame')
            const cols = Math.max(2, Math.ceil(Math.sqrt(nonArrows.length)))
            nonArrows.forEach((s, i) => {
              const r = Math.floor(i / cols)
              const c = i % cols
              editor.updateShape({
                id: s.id,
                type: s.type,
                x: cx - ((cols - 1) * 280) / 2 + c * 280 - 100,
                y: cy - 160 + r * 200,
              } as any)
            })
            editor.zoomToFit({ animation: { duration: 280 } })
          }
          setLastExecuted({
            summary: `Vision Harmonized: ${data.theme?.name ?? 'Blueprint'} (${data.harmony?.critiqueTitle ?? 'Balanced'})`,
            utterance: cmd.utterance,
            confidence: 0.96,
            modelUsed: data.harmony?.modelUsed ?? cmd.modelUsed,
            latencyMs: data.harmony?.latencyMs ?? cmd.latencyMs,
          })
          return
        }
      } else if (
        (cmd.intent === 'create_shape' || cmd.intent === 'create_note' || cmd.intent === 'create_text') &&
        cmd.shape
      ) {
        const { archetype, label, color, fill, dash, font, size, positionHint } = cmd.shape
        const existingCount = editor.getCurrentPageShapes().length
        const goldenAngle = existingCount * 2.39996
        const radius = existingCount === 0 ? 0 : Math.min(260, 95 + existingCount * 28)
        let x = cx + Math.cos(goldenAngle) * radius - archetype.width / 2
        let y = cy + Math.sin(goldenAngle) * radius - archetype.height / 2

        if (positionHint === 'center') {
          x = cx - archetype.width / 2
          y = cy - archetype.height / 2
        } else if (positionHint === 'left') {
          x = cx - 340 - archetype.width / 2
          y = cy - archetype.height / 2
        } else if (positionHint === 'right') {
          x = cx + 340 - archetype.width / 2
          y = cy - archetype.height / 2
        } else if (positionHint === 'top') {
          x = cx - archetype.width / 2
          y = cy - 220 - archetype.height / 2
        } else if (positionHint === 'bottom') {
          x = cx - archetype.width / 2
          y = cy + 220 - archetype.height / 2
        }

        const id = createShapeId()
        if (cmd.intent === 'create_note' || archetype.kind === 'note') {
          editor.createShape({
            id,
            type: 'note',
            x,
            y,
            props: {
              color: color ?? theme.accentColor,
              size: size ?? theme.size,
              font: font ?? theme.font,
              richText: toRichText(label),
            },
          } as any)
        } else if (cmd.intent === 'create_text' || archetype.kind === 'text') {
          editor.createShape({
            id,
            type: 'text',
            x,
            y,
            props: {
              color: color ?? theme.primaryColor,
              size: size ?? 'xl',
              font: font ?? theme.font,
              richText: toRichText(label),
              autoSize: true,
            },
          } as any)
        } else {
          editor.createShape({
            id,
            type: 'geo',
            x,
            y,
            props: {
              geo: archetype.geo ?? 'rectangle',
              w: archetype.width,
              h: archetype.height,
              color: color ?? theme.primaryColor,
              fill: fill ?? theme.fill,
              dash: dash ?? theme.dash,
              size: size ?? theme.size,
              font: font ?? theme.font,
              richText: toRichText(label),
            },
          } as any)
        }
      } else if (cmd.intent === 'connect_shapes' && cmd.connection) {
        const shapes = summarizeCanvasShapes(editor)
        let fromShape = shapes.find((s) => s.id === cmd.connection?.fromShapeId)
        let toShape = shapes.find((s) => s.id === cmd.connection?.toShapeId)

        // If either shape doesn't exist yet on the canvas, create it automatically!
        if (!fromShape) {
          const newFromId = createShapeId()
          const fx = cx - 260
          const fy = cy - 55
          editor.createShape({
            id: newFromId,
            type: 'geo',
            x: fx,
            y: fy,
            props: {
              geo: 'rectangle',
              w: 210,
              h: 110,
              color: theme.primaryColor,
              fill: theme.fill,
              dash: theme.dash,
              font: theme.font,
              size: theme.size,
              richText: toRichText(cmd.connection.fromLabel ?? cmd.connection.fromQuery),
            },
          } as any)
          fromShape = {
            id: newFromId,
            type: 'geo',
            label: cmd.connection.fromLabel ?? cmd.connection.fromQuery,
            x: fx,
            y: fy,
            w: 210,
            h: 110,
          }
        }

        if (!toShape || toShape.id === fromShape.id) {
          const newToId = createShapeId()
          const tx = fromShape.x + 360
          const ty = fromShape.y
          editor.createShape({
            id: newToId,
            type: 'geo',
            x: tx,
            y: ty,
            props: {
              geo: 'rectangle',
              w: 210,
              h: 110,
              color: theme.secondaryColor,
              fill: theme.fill,
              dash: theme.dash,
              font: theme.font,
              size: theme.size,
              richText: toRichText(cmd.connection.toLabel ?? cmd.connection.toQuery),
            },
          } as any)
          toShape = {
            id: newToId,
            type: 'geo',
            label: cmd.connection.toLabel ?? cmd.connection.toQuery,
            x: tx,
            y: ty,
            w: 210,
            h: 110,
          }
        }

        const startX = fromShape.x + fromShape.w / 2
        const startY = fromShape.y + fromShape.h / 2
        const endX = toShape.x + toShape.w / 2
        const endY = toShape.y + toShape.h / 2

        editor.createShape({
          id: createShapeId(),
          type: 'arrow',
          x: 0,
          y: 0,
          props: {
            start: { x: startX, y: startY },
            end: { x: endX, y: endY },
            color: theme.accentColor,
            dash: theme.dash,
            size: theme.size,
            font: theme.font,
            richText: toRichText(cmd.connection.edgeLabel ?? ''),
          },
        } as any)
      } else if (cmd.intent === 'generate_layout' && cmd.layout) {
        const { template, topicTitle } = cmd.layout
        const roleColors = {
          primary: theme.primaryColor,
          secondary: theme.secondaryColor,
          accent: theme.accentColor,
          muted: theme.mutedColor,
        }

        const nodePositions = new Map<string, { id: TLShapeId; x: number; y: number; w: number; h: number }>()

        editor.run(() => {
          // Create a heading title above the generated layout
          const headerText = topicTitle
            ? `${template.name}: ${topicTitle}`
            : template.frameLabel ?? template.name
          editor.createShape({
            id: createShapeId(),
            type: 'text',
            x: cx - 220,
            y: cy - 310,
            props: {
              color: theme.primaryColor,
              size: 'xl',
              font: theme.font,
              richText: toRichText(headerText),
              autoSize: true,
            },
          } as any)

          for (const node of template.nodes) {
            const arch =
              SHAPE_ARCHETYPES.find((a) => a.id === node.archetype) ?? SHAPE_ARCHETYPES[0]!
            const w = node.w ?? arch.width
            const h = node.h ?? arch.height
            const nx = cx + node.dx - w / 2
            const ny = cy + node.dy - h / 2
            const shapeId = createShapeId()
            const c = roleColors[node.colorRole ?? 'primary']
            const nodeLabel =
              node.key === 'center' && topicTitle ? topicTitle : node.label

            if (arch.kind === 'note') {
              editor.createShape({
                id: shapeId,
                type: 'note',
                x: nx,
                y: ny,
                props: {
                  color: c,
                  size: theme.size,
                  font: theme.font,
                  richText: toRichText(nodeLabel),
                },
              } as any)
            } else {
              editor.createShape({
                id: shapeId,
                type: 'geo',
                x: nx,
                y: ny,
                props: {
                  geo: arch.geo ?? 'rectangle',
                  w,
                  h,
                  color: c,
                  fill: theme.fill,
                  dash: theme.dash,
                  size: theme.size,
                  font: theme.font,
                  richText: toRichText(nodeLabel),
                },
              } as any)
            }

            nodePositions.set(node.key, { id: shapeId, x: nx, y: ny, w, h })
          }

          for (const edge of template.edges) {
            const src = nodePositions.get(edge.from)
            const dst = nodePositions.get(edge.to)
            if (!src || !dst) continue
            editor.createShape({
              id: createShapeId(),
              type: 'arrow',
              x: 0,
              y: 0,
              props: {
                start: { x: src.x + src.w / 2, y: src.y + src.h / 2 },
                end: { x: dst.x + dst.w / 2, y: dst.y + dst.h / 2 },
                color: theme.secondaryColor,
                dash: theme.dash,
                size: theme.size,
                font: theme.font,
                richText: toRichText(edge.label ?? ''),
              },
            } as any)
          }
        })

        editor.zoomToFit({ animation: { duration: 320 } })
      } else if (
        (cmd.intent === 'style_target' ||
          cmd.intent === 'move_target' ||
          cmd.intent === 'resize_target' ||
          cmd.intent === 'delete_target') &&
        cmd.targetOp
      ) {
        const allShapes = (editor.getCurrentPageShapes() as any[]).filter((s) => s.type !== 'arrow')
        const targets = cmd.targetOp.applyToAll
          ? allShapes
          : allShapes.filter((s) => s.id === cmd.targetOp?.targetShapeId)
        const finalTargets = targets.length > 0 ? targets : allShapes.slice(-1)

        if (cmd.intent === 'delete_target') {
          editor.deleteShapes(finalTargets.map((t) => t.id))
        } else if (cmd.intent === 'move_target') {
          for (const t of finalTargets) {
            editor.updateShape({
              id: t.id,
              type: t.type,
              x: (t.x ?? 0) + (cmd.targetOp.dx ?? 180),
              y: (t.y ?? 0) + (cmd.targetOp.dy ?? 0),
            } as any)
          }
        } else if (cmd.intent === 'resize_target') {
          const factor = cmd.targetOp.scaleFactor ?? 1.35
          for (const t of finalTargets) {
            if (t.props?.w && t.props?.h) {
              editor.updateShape({
                id: t.id,
                type: t.type,
                props: {
                  w: Math.max(80, Math.round(t.props.w * factor)),
                  h: Math.max(60, Math.round(t.props.h * factor)),
                },
              } as any)
            }
          }
        } else if (cmd.intent === 'style_target') {
          for (const t of finalTargets) {
            const nextProps: Record<string, unknown> = {}
            if (cmd.targetOp.color) nextProps.color = cmd.targetOp.color
            if (cmd.targetOp.fill && t.type === 'geo') nextProps.fill = cmd.targetOp.fill
            if (cmd.targetOp.dash && t.type === 'geo') nextProps.dash = cmd.targetOp.dash
            if (cmd.targetOp.font) nextProps.font = cmd.targetOp.font
            if (cmd.targetOp.size) nextProps.size = cmd.targetOp.size
            editor.updateShape({
              id: t.id,
              type: t.type,
              props: nextProps,
            } as any)
          }
        }
      } else if (cmd.intent === 'align_shapes') {
        const shapes = (editor.getCurrentPageShapes() as any[]).filter(
          (s) => s.type !== 'arrow' && s.type !== 'frame'
        )
        if (shapes.length > 0) {
          editor.run(() => {
            if (cmd.alignment === 'row') {
              const totalW = shapes.length * 260
              shapes.forEach((s, idx) => {
                editor.updateShape({
                  id: s.id,
                  type: s.type,
                  x: cx - totalW / 2 + idx * 260,
                  y: cy - 60,
                } as any)
              })
            } else if (cmd.alignment === 'column') {
              const totalH = shapes.length * 165
              shapes.forEach((s, idx) => {
                editor.updateShape({
                  id: s.id,
                  type: s.type,
                  x: cx - 110,
                  y: cy - totalH / 2 + idx * 165,
                } as any)
              })
            } else {
              const cols = Math.max(2, Math.ceil(Math.sqrt(shapes.length)))
              shapes.forEach((s, idx) => {
                const r = Math.floor(idx / cols)
                const c = idx % cols
                editor.updateShape({
                  id: s.id,
                  type: s.type,
                  x: cx - ((cols - 1) * 270) / 2 + c * 270 - 105,
                  y: cy - 160 + r * 185,
                } as any)
              })
            }
          })
          editor.zoomToFit({ animation: { duration: 280 } })
        }
      }

      setLastExecuted({
        summary: cmd.summary,
        utterance: cmd.utterance,
        confidence: cmd.confidence,
        modelUsed: cmd.modelUsed,
        latencyMs: cmd.latencyMs,
      })

      // Sync updated canvas shape list to WebSocket session for EmbeddingGemma 2 target resolution
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'sync_shapes',
            canvasShapes: summarizeCanvasShapes(editor),
          })
        )
      }
    },
    [applyThemeToCanvas]
  )

  const dispatchSpokenUtterance = useCallback(
    async (utterance: string): Promise<CanvasActionCommand | null> => {
      const clean = utterance.trim()
      if (!clean) return null
      const editor = editorRef.current
      const canvasShapes = editor ? summarizeCanvasShapes(editor) : []

      const res = await fetch('/api/voice/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ utterance: clean, canvasShapes }),
      })
      if (!res.ok) return null
      const data = await res.json()
      if (data.command) {
        await executeCanvasCommand(data.command)
        setLiveWords([])
        setGhostWords([])
        setSpeculativeSummary('')
        return data.command
      }
      return null
    },
    [executeCanvasCommand]
  )

  // Expose programmatic voice trigger for E2E verification and console/automation
  useEffect(() => {
    window.voiceCanvasSpeak = dispatchSpokenUtterance
    window.voiceCanvasHarmonize = async (goalPrompt = 'cohesive high-contrast architectural diagram') => {
      await dispatchSpokenUtterance(`harmonize the visual design for ${goalPrompt}`)
    }
  }, [dispatchSpokenUtterance])

  // Poll /api/voice/catalog once to check ML status
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/voice/catalog')
        if (res.ok) {
          const data = await res.json()
          if (data.status?.ready) {
            setMlReady(true)
            if (timer) clearInterval(timer)
          }
        }
      } catch {
        // ignore
      }
    }
    checkStatus()
    timer = setInterval(checkStatus, 3000)
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [])

  // Connect WebSocket + Earlybird 16kHz AudioWorklet stream + Silence VAD auto-commit
  useEffect(() => {
    let cancelled = false
    let audioCtx: AudioContext | null = null
    let mediaStream: MediaStream | null = null
    let silenceTimer: ReturnType<typeof setTimeout> | null = null
    let latestTranscriptRef = ''

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${location.host}/ws/voice`)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onmessage = async (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        if (msg.type === 'ready') {
          if (msg.status?.ready) setMlReady(true)
          if (editorRef.current) {
            ws.send(
              JSON.stringify({
                type: 'sync_shapes',
                canvasShapes: summarizeCanvasShapes(editorRef.current),
              })
            )
          }
          return
        }
        if (msg.type === 'transcript') {
          const words: [string, number][] = msg.words ?? []
          const guess: [string, number][] = msg.guess ?? []
          setLiveWords(words)
          setGhostWords(guess)
          if (msg.speculative?.summary) {
            setSpeculativeSummary(msg.speculative.summary)
          }
          const joined = words.map((w) => w[0]).join(' ').trim()
          if (joined && joined !== latestTranscriptRef) {
            latestTranscriptRef = joined
            if (silenceTimer) clearTimeout(silenceTimer)
            // Auto-commit when speaker pauses for 850ms after Earlybird predicts words
            silenceTimer = setTimeout(() => {
              const phraseToCommit = latestTranscriptRef.trim()
              if (phraseToCommit.length >= 3 && ws.readyState === WebSocket.OPEN) {
                latestTranscriptRef = ''
                const shapes = editorRef.current ? summarizeCanvasShapes(editorRef.current) : []
                ws.send(
                  JSON.stringify({
                    type: 'commit',
                    utterance: phraseToCommit,
                    canvasShapes: shapes,
                  })
                )
              }
            }, 850)
          }
          return
        }
        if (msg.type === 'command' && msg.command) {
          await executeCanvasCommand(msg.command)
          setLiveWords([])
          setGhostWords([])
          setSpeculativeSummary('')
        }
      } catch {
        // ignore
      }
    }

    async function startMicrophone() {
      if (cancelled) return
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        })
        if (cancelled) return
        try {
          audioCtx = new AudioContext({ sampleRate: 16000 })
        } catch {
          audioCtx = new AudioContext()
        }
        const blobUrl = URL.createObjectURL(
          new Blob([EARLYBIRD_WORKLET], { type: 'application/javascript' })
        )
        await audioCtx.audioWorklet.addModule(blobUrl)
        const workletNode = new AudioWorkletNode(audioCtx, 'earlybird-cap')
        workletNode.port.onmessage = (e) => {
          const { pcm, lvl } = e.data
          setMicLevel(lvl)
          if (ws.readyState === WebSocket.OPEN && lvl > 0.002) {
            ws.send(pcm.buffer)
          }
        }
        audioCtx.createMediaStreamSource(mediaStream).connect(workletNode)
        setMicState('listening')
      } catch {
        setMicState('air-keyboard')
      }
    }

    startMicrophone()

    // Unlock AudioContext on first pointer movement or keystroke if suspended by browser policy
    const unlockAudio = () => {
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {})
      }
    }
    window.addEventListener('pointerdown', unlockAudio, { passive: true })
    window.addEventListener('keydown', unlockAudio, { passive: true })

    return () => {
      cancelled = true
      if (silenceTimer) clearTimeout(silenceTimer)
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      try {
        ws.close()
      } catch {}
      try {
        mediaStream?.getTracks().forEach((t) => t.stop())
      } catch {}
      try {
        audioCtx?.close()
      } catch {}
    }
  }, [executeCanvasCommand])

  // Air-typing support: user can also speak by simply typing in mid-air (no input boxes or buttons!)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') {
        setAirTypingBuffer('')
        setSpeculativeSummary('')
        return
      }
      if (e.key === 'Enter') {
        setAirTypingBuffer((prev) => {
          if (prev.trim()) {
            dispatchSpokenUtterance(prev.trim())
          }
          return ''
        })
        return
      }
      if (e.key === 'Backspace') {
        setAirTypingBuffer((prev) => prev.slice(0, -1))
        return
      }
      if (e.key.length === 1) {
        setAirTypingBuffer((prev) => {
          const next = prev + e.key
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && next.trim().length >= 4) {
            wsRef.current.send(JSON.stringify({ type: 'speculate', utterance: next.trim() }))
          }
          return next
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatchSpokenUtterance])

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      window.__tldrawEditor = editor

      // Initialize dark blueprint mode and seed a clean initial voice architecture diagram
      editor.user.updateUserPreferences({ colorScheme: 'dark' })

      if (editor.getCurrentPageShapes().length === 0) {
        const idTitle = createShapeId()
        const idEb = createShapeId()
        const idGemma = createShapeId()
        const idCanvas = createShapeId()
        const idNote = createShapeId()

        editor.run(() => {
          editor.createShape({
            id: idTitle,
            type: 'text',
            x: -320,
            y: -250,
            props: {
              color: 'light-blue',
              size: 'xl',
              font: 'mono',
              richText: toRichText('EARLYBIRD × EMBEDDINGGEMMA 2 · VOICE CANVAS'),
              autoSize: true,
            },
          } as any)

          editor.createShape({
            id: idEb,
            type: 'geo',
            x: -420,
            y: -80,
            props: {
              geo: 'hexagon',
              w: 230,
              h: 125,
              color: 'light-blue',
              fill: 'semi',
              dash: 'solid',
              font: 'mono',
              size: 'm',
              richText: toRichText('Earlybird 29M (-90ms STT)'),
            },
          } as any)

          editor.createShape({
            id: idGemma,
            type: 'geo',
            x: -115,
            y: -80,
            props: {
              geo: 'hexagon',
              w: 240,
              h: 125,
              color: 'violet',
              fill: 'solid',
              dash: 'solid',
              font: 'mono',
              size: 'm',
              richText: toRichText('EmbeddingGemma 2 (768d)'),
            },
          } as any)

          editor.createShape({
            id: idCanvas,
            type: 'geo',
            x: 205,
            y: -80,
            props: {
              geo: 'rectangle',
              w: 230,
              h: 125,
              color: 'light-green',
              fill: 'semi',
              dash: 'solid',
              font: 'mono',
              size: 'm',
              richText: toRichText('Zero-UI tldraw Canvas'),
            },
          } as any)

          editor.createShape({
            id: idNote,
            type: 'note',
            x: -100,
            y: 110,
            props: {
              color: 'yellow',
              size: 's',
              font: 'mono',
              richText: toRichText(
                'Just talk: "switch to cyberpunk neon", "generate a mind map", "add a cloud node called Gateway"'
              ),
            },
          } as any)

          editor.createShape({
            id: createShapeId(),
            type: 'arrow',
            x: 0,
            y: 0,
            props: {
              start: { x: -190, y: -18 },
              end: { x: -115, y: -18 },
              color: 'light-blue',
              dash: 'solid',
              size: 'm',
              font: 'mono',
              richText: toRichText('80ms stream'),
            },
          } as any)

          editor.createShape({
            id: createShapeId(),
            type: 'arrow',
            x: 0,
            y: 0,
            props: {
              start: { x: 125, y: -18 },
              end: { x: 205, y: -18 },
              color: 'violet',
              dash: 'solid',
              size: 'm',
              font: 'mono',
              richText: toRichText('visual design'),
            },
          } as any)
        })

        editor.zoomToFit({ animation: { duration: 0 } })
      }
    },
    []
  )

  const hasLiveSpeech = liveWords.length > 0 || ghostWords.length > 0 || airTypingBuffer.length > 0
  const pulseScale = 1 + Math.min(0.45, micLevel * 3.2)

  return (
    <div
      className="zero-ui-stage"
      style={
        {
          '--canvas-bg': activeTheme.canvasBg,
          '--theme-accent': activeTheme.accentHex,
        } as React.CSSProperties
      }
    >
      <Tldraw hideUi onMount={handleMount} />

      {/* 100% click-through, button-free ambient voice + visual design overlay */}
      <div className="ambient-hud" aria-live="polite">
        <div className="ambient-pill">
          <div className="pulse-orb-wrap">
            <span
              className={`pulse-orb ${micState === 'listening' ? 'active' : ''}`}
              style={{ transform: `scale(${pulseScale.toFixed(3)})` }}
            />
            <span className="pulse-dot" />
          </div>

          <div className="transcript-stream">
            {hasLiveSpeech ? (
              <div className="words-line">
                {airTypingBuffer ? (
                  <span className="spoken-word high-conf">{airTypingBuffer}</span>
                ) : (
                  liveWords.map(([w, p], idx) => (
                    <span
                      key={`w-${idx}`}
                      className={`spoken-word ${p >= 0.85 ? 'high-conf' : 'mid-conf'}`}
                      style={{ opacity: Math.max(0.55, p) }}
                    >
                      {w}{' '}
                    </span>
                  ))
                )}
                {ghostWords.map(([gw, gp], idx) => (
                  <span
                    key={`g-${idx}`}
                    className="ghost-word"
                    style={{ opacity: Math.max(0.32, gp * 0.65) }}
                  >
                    {gw}{' '}
                  </span>
                ))}
              </div>
            ) : lastExecuted ? (
              <div className="executed-line">
                <span className="exec-tag">EXECUTED</span>
                <span className="exec-summary">{lastExecuted.summary}</span>
                <span className="exec-meta">
                  {(lastExecuted.confidence * 100).toFixed(0)}% · {lastExecuted.latencyMs}ms
                </span>
              </div>
            ) : (
              <div className="idle-prompt">
                Speak naturally to design — e.g. <em>“generate a system architecture diagram”</em> or{' '}
                <em>“switch to cyberpunk neon”</em>
              </div>
            )}

            {speculativeSummary && hasLiveSpeech && (
              <div className="speculative-line">
                <span className="spec-label">ANTICIPATING</span> {speculativeSummary}
              </div>
            )}
          </div>

          <div className="model-telemetry">
            <span className="theme-chip">{activeTheme.name}</span>
            <span className={`engine-dot ${mlReady ? 'gpu-ready' : 'warming'}`} />
            <span className="engine-label">
              {mlReady ? 'Earlybird 29M + EmbeddingGemma 2' : 'Earlybird + Gemma 2'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

const rootEl = document.getElementById('root')
if (rootEl) {
  createRoot(rootEl).render(<App />)
}
