import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Tldraw,
  Editor,
  createShapeId,
  createBindingId,
  toRichText,
  type TLShapeId,
} from 'tldraw'
import 'tldraw/tldraw.css'
import type {
  CanvasActionCommand,
  CanvasShapeSummary,
} from '../design/router'
import {
  DESIGN_THEMES,
  SHAPE_ARCHETYPES,
  type DesignThemeSpec,
  type TldrawColor,
  type TldrawDash,
  type TldrawFont,
  type TldrawSize,
} from '../design/catalog'

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

const AMBIENT_SUGGESTIONS = [
  '“generate a system architecture diagram”',
  '“switch to cyberpunk neon aesthetic”',
  '“draw a cloud called CDN and connect it to Stream Gateway”',
  '“generate a multimodal rag pipeline”',
  '“apply warm editorial paper style”',
  '“arrange all shapes in a circle”',
  '“frame all shapes as Core Platform”',
  '“swap Earlybird and Zero-UI Canvas”',
  '“harmonize the visual design”',
]

const COLOR_HEX_MAP: Record<string, string> = {
  black: '#1e293b',
  grey: '#64748b',
  'light-violet': '#c084fc',
  violet: '#8b5cf6',
  blue: '#3b82f6',
  'light-blue': '#38bdf8',
  yellow: '#facc15',
  orange: '#f97316',
  green: '#22c55e',
  'light-green': '#4ade80',
  'light-red': '#fb7185',
  red: '#ef4444',
  white: '#f8fafc',
}

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

function summarizeCanvasShapes(editor: Editor, ghostId?: TLShapeId | null): CanvasShapeSummary[] {
  const shapes = editor.getCurrentPageShapes()
  const out: CanvasShapeSummary[] = []
  for (const s of shapes as any[]) {
    if (s.type === 'arrow' || s.type === 'frame') continue
    if (ghostId && s.id === ghostId) continue
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

/**
 * Renders a real 448x280 RGB PNG snapshot of the current canvas state for
 * EmbeddingGemma 2's Vision+Text multimodal encoder.
 */
function renderCanvasSnapshotBase64(shapes: CanvasShapeSummary[], bgHex: string): string {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 448
    canvas.height = 280
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    ctx.fillStyle = bgHex || '#08101d'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    if (shapes.length > 0) {
      const xs = shapes.map((s) => s.x)
      const ys = shapes.map((s) => s.y)
      const maxXs = shapes.map((s) => s.x + s.w)
      const maxYs = shapes.map((s) => s.y + s.h)
      const minX = Math.min(...xs)
      const minY = Math.min(...ys)
      const spanX = Math.max(200, Math.max(...maxXs) - minX)
      const spanY = Math.max(140, Math.max(...maxYs) - minY)

      for (const s of shapes) {
        const sx = 28 + ((s.x - minX) / spanX) * 392
        const sy = 28 + ((s.y - minY) / spanY) * 224
        const sw = Math.max(36, (s.w / spanX) * 392)
        const sh = Math.max(24, (s.h / spanY) * 224)
        const strokeHex = COLOR_HEX_MAP[s.color ?? 'light-blue'] ?? '#38bdf8'

        ctx.fillStyle = strokeHex + '28'
        ctx.strokeStyle = strokeHex
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.roundRect(sx, sy, sw, sh, 8)
        ctx.fill()
        ctx.stroke()

        ctx.fillStyle = '#f8fafc'
        ctx.font = '11px Inter, sans-serif'
        ctx.fillText((s.label || '').slice(0, 18), sx + 8, sy + sh / 2 + 4)
      }
    }

    return canvas.toDataURL('image/png')
  } catch {
    return ''
  }
}

/**
 * Creates a tldraw v5 arrow with native TLArrowBindings on both start and end shapes
 * so arrows attach cleanly to shape perimeters and follow shapes when moved or aligned.
 */
function createBoundArrow(
  editor: Editor,
  fromShape: { id: string; x: number; y: number; w: number; h: number },
  toShape: { id: string; x: number; y: number; w: number; h: number },
  opts: {
    label?: string
    bend?: number
    color: TldrawColor
    dash: TldrawDash
    size: TldrawSize
    font: TldrawFont
  }
) {
  const arrowId = createShapeId()
  const startX = fromShape.x + fromShape.w / 2
  const startY = fromShape.y + fromShape.h / 2
  const endX = toShape.x + toShape.w / 2
  const endY = toShape.y + toShape.h / 2

  editor.createShape({
    id: arrowId,
    type: 'arrow',
    x: 0,
    y: 0,
    props: {
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
      bend: opts.bend ?? 0,
      color: opts.color,
      dash: opts.dash,
      size: opts.size,
      font: opts.font,
      richText: toRichText(opts.label ?? ''),
    },
  } as any)

  try {
    editor.createBinding({
      id: createBindingId(),
      type: 'arrow',
      fromId: arrowId,
      toId: fromShape.id as TLShapeId,
      props: {
        terminal: 'start',
        normalizedAnchor: { x: 0.5, y: 0.5 },
        isExact: false,
        isPrecise: false,
        snap: 'none',
      },
    } as any)

    editor.createBinding({
      id: createBindingId(),
      type: 'arrow',
      fromId: arrowId,
      toId: toShape.id as TLShapeId,
      props: {
        terminal: 'end',
        normalizedAnchor: { x: 0.5, y: 0.5 },
        isExact: false,
        isPrecise: false,
        snap: 'none',
      },
    } as any)
  } catch {
    // fallback to unbound coordinates if binding fails
  }
}

/**
 * Finds a clean, non-overlapping coordinate near (targetX, targetY) so new shapes
 * never pile directly on top of existing nodes.
 */
function findOpenCanvasSpot(
  existing: CanvasShapeSummary[],
  targetX: number,
  targetY: number,
  w: number,
  h: number
): { x: number; y: number } {
  const overlaps = (x: number, y: number) =>
    existing.some(
      (s) =>
        Math.abs(x + w / 2 - (s.x + s.w / 2)) < (w + s.w) * 0.48 &&
        Math.abs(y + h / 2 - (s.y + s.h / 2)) < (h + s.h) * 0.48
    )

  if (!overlaps(targetX, targetY)) return { x: targetX, y: targetY }

  for (let ring = 1; ring <= 8; ring++) {
    const stepRadius = ring * 135
    for (let k = 0; k < 8; k++) {
      const angle = (k * Math.PI) / 4 + ring * 0.35
      const cx = Math.round(targetX + Math.cos(angle) * stepRadius)
      const cy = Math.round(targetY + Math.sin(angle) * stepRadius)
      if (!overlaps(cx, cy)) return { x: cx, y: cy }
    }
  }
  return { x: targetX + 60, y: targetY + 60 }
}

function App() {
  const editorRef = useRef<Editor | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const ghostShapeIdRef = useRef<TLShapeId | null>(null)

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
  const [suggestionIdx, setSuggestionIdx] = useState<number>(0)

  const activeThemeRef = useRef<DesignThemeSpec>(activeTheme)
  activeThemeRef.current = activeTheme

  // Rotate idle voice command examples every 6.5s
  useEffect(() => {
    const id = setInterval(() => {
      setSuggestionIdx((i) => (i + 1) % AMBIENT_SUGGESTIONS.length)
    }, 6500)
    return () => clearInterval(id)
  }, [])

  const clearSpeculativeGhostShape = useCallback(() => {
    const editor = editorRef.current
    const gid = ghostShapeIdRef.current
    if (editor && gid) {
      try {
        if (editor.getShape(gid)) {
          editor.deleteShapes([gid])
        }
      } catch {}
      ghostShapeIdRef.current = null
    }
  }, [])

  /**
   * Renders a real-time translucent ghost shape on the tldraw canvas while the user
   * is mid-utterance!
   */
  const syncSpeculativeGhostShape = useCallback(
    (specCmd?: CanvasActionCommand) => {
      const editor = editorRef.current
      if (!editor || !specCmd) {
        clearSpeculativeGhostShape()
        return
      }
      if (
        specCmd.intent !== 'create_shape' &&
        specCmd.intent !== 'create_note' &&
        specCmd.intent !== 'create_text'
      ) {
        clearSpeculativeGhostShape()
        return
      }
      if (!specCmd.shape) return

      const theme = activeThemeRef.current
      const viewport = editor.getViewportPageBounds()
      const cx = viewport.x + viewport.w / 2
      const cy = viewport.y + viewport.h / 2
      const { archetype, label, color } = specCmd.shape

      let gid = ghostShapeIdRef.current
      if (!gid || !editor.getShape(gid)) {
        gid = createShapeId('earlybird_ghost')
        ghostShapeIdRef.current = gid
        const spot = findOpenCanvasSpot(
          summarizeCanvasShapes(editor, gid),
          cx - archetype.width / 2,
          cy - archetype.height / 2,
          archetype.width,
          archetype.height
        )
        editor.createShape({
          id: gid,
          type: 'geo',
          x: spot.x,
          y: spot.y,
          opacity: 0.36,
          props: {
            geo: archetype.geo ?? 'rectangle',
            w: archetype.width,
            h: archetype.height,
            color: color ?? theme.primaryColor,
            fill: 'semi',
            dash: 'dashed',
            size: theme.size,
            font: theme.font,
            richText: toRichText(`${label} …`),
          },
        } as any)
      } else {
        editor.updateShape({
          id: gid,
          type: 'geo',
          opacity: 0.36,
          props: {
            geo: archetype.geo ?? 'rectangle',
            w: archetype.width,
            h: archetype.height,
            color: color ?? theme.primaryColor,
            dash: 'dashed',
            richText: toRichText(`${label} …`),
          },
        } as any)
      }
    },
    [clearSpeculativeGhostShape]
  )

  const applyThemeToCanvas = useCallback((editor: Editor, theme: DesignThemeSpec) => {
    setActiveTheme(theme)
    activeThemeRef.current = theme
    try {
      editor.user.updateUserPreferences({
        colorScheme: theme.isDark ? 'dark' : 'light',
      })
    } catch {}

    const shapes = editor.getCurrentPageShapes() as any[]
    if (!shapes.length) return

    const palette: TldrawColor[] = [
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

  const executeAtomicCommand = useCallback(
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
        const cam = editor.getCamera()
        if (cmd.cameraOp === 'zoom_in') editor.zoomIn(undefined, { animation: { duration: 220 } })
        else if (cmd.cameraOp === 'zoom_out') editor.zoomOut(undefined, { animation: { duration: 220 } })
        else if (cmd.cameraOp === 'pan_left')
          editor.setCamera({ x: cam.x + 280, y: cam.y, z: cam.z }, { animation: { duration: 220 } })
        else if (cmd.cameraOp === 'pan_right')
          editor.setCamera({ x: cam.x - 280, y: cam.y, z: cam.z }, { animation: { duration: 220 } })
        else if (cmd.cameraOp === 'pan_up')
          editor.setCamera({ x: cam.x, y: cam.y + 220, z: cam.z }, { animation: { duration: 220 } })
        else if (cmd.cameraOp === 'pan_down')
          editor.setCamera({ x: cam.x, y: cam.y - 220, z: cam.z }, { animation: { duration: 220 } })
        else editor.zoomToFit({ animation: { duration: 280 } })
      } else if (cmd.intent === 'apply_theme' && cmd.theme) {
        applyThemeToCanvas(editor, cmd.theme)
      } else if (cmd.intent === 'vision_harmonize') {
        const shapes = summarizeCanvasShapes(editor, ghostShapeIdRef.current)
        const imageBase64 = renderCanvasSnapshotBase64(shapes, theme.canvasBg)
        const res = await fetch('/api/voice/harmonize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canvasShapes: shapes,
            canvasBg: theme.canvasBg,
            goalPrompt: cmd.utterance,
            imageBase64,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.theme) {
            applyThemeToCanvas(editor, data.theme)
          }
          if (data.harmony?.critiqueId === 'dense-cluster') {
            const nonArrows = (editor.getCurrentPageShapes() as any[]).filter(
              (s) => s.type !== 'arrow' && s.type !== 'frame'
            )
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
        const existing = summarizeCanvasShapes(editor, ghostShapeIdRef.current)
        let targetX = cx - archetype.width / 2
        let targetY = cy - archetype.height / 2

        if (positionHint === 'left') targetX = cx - 340 - archetype.width / 2
        else if (positionHint === 'right') targetX = cx + 340 - archetype.width / 2
        else if (positionHint === 'top') targetY = cy - 220 - archetype.height / 2
        else if (positionHint === 'bottom') targetY = cy + 220 - archetype.height / 2

        const { x, y } = findOpenCanvasSpot(existing, targetX, targetY, archetype.width, archetype.height)
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
        const shapes = summarizeCanvasShapes(editor, ghostShapeIdRef.current)
        let fromShape =
          shapes.find((s) => s.id === cmd.connection?.fromShapeId) ??
          shapes.find((s) => s.label.toLowerCase() === cmd.connection?.fromLabel?.toLowerCase())
        let toShape =
          shapes.find((s) => s.id === cmd.connection?.toShapeId) ??
          shapes.find((s) => s.label.toLowerCase() === cmd.connection?.toLabel?.toLowerCase())

        if (!fromShape) {
          const newFromId = createShapeId()
          const spot = findOpenCanvasSpot(shapes, cx - 260, cy - 55, 210, 110)
          editor.createShape({
            id: newFromId,
            type: 'geo',
            x: spot.x,
            y: spot.y,
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
            x: spot.x,
            y: spot.y,
            w: 210,
            h: 110,
          }
        }

        if (!toShape || toShape.id === fromShape.id) {
          const newToId = createShapeId()
          const spot = findOpenCanvasSpot([...shapes, fromShape], fromShape.x + 340, fromShape.y, 210, 110)
          editor.createShape({
            id: newToId,
            type: 'geo',
            x: spot.x,
            y: spot.y,
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
            x: spot.x,
            y: spot.y,
            w: 210,
            h: 110,
          }
        }

        createBoundArrow(editor, fromShape, toShape, {
          label: cmd.connection.edgeLabel,
          color: theme.accentColor,
          dash: theme.dash,
          size: theme.size,
          font: theme.font,
        })
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
          const headerText = topicTitle
            ? `${template.name}: ${topicTitle}`
            : template.frameLabel ?? template.name
          editor.createShape({
            id: createShapeId(),
            type: 'text',
            x: cx - 240,
            y: cy - 320,
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
            createBoundArrow(editor, src, dst, {
              label: edge.label,
              bend: edge.bend,
              color: theme.secondaryColor,
              dash: theme.dash,
              size: theme.size,
              font: theme.font,
            })
          }
        })

        editor.zoomToFit({ animation: { duration: 320 } })
      } else if (cmd.intent === 'rename_target' && cmd.targetOp?.newLabel) {
        const allShapes = (editor.getCurrentPageShapes() as any[]).filter((s) => s.type !== 'arrow')
        const target =
          allShapes.find((s) => s.id === cmd.targetOp?.targetShapeId) ?? allShapes[allShapes.length - 1]
        if (target) {
          if (target.type === 'frame') {
            editor.updateShape({
              id: target.id,
              type: 'frame',
              props: { name: cmd.targetOp.newLabel },
            } as any)
          } else {
            editor.updateShape({
              id: target.id,
              type: target.type,
              props: { richText: toRichText(cmd.targetOp.newLabel) },
            } as any)
          }
        }
      } else if (cmd.intent === 'duplicate_target' && cmd.targetOp) {
        const allShapes = (editor.getCurrentPageShapes() as any[]).filter((s) => s.type !== 'arrow')
        const target =
          allShapes.find((s) => s.id === cmd.targetOp?.targetShapeId) ?? allShapes[allShapes.length - 1]
        if (target) {
          editor.duplicateShapes([target.id], { x: 55, y: 55 })
        }
      } else if (cmd.intent === 'highlight_target' && cmd.targetOp) {
        const allShapes = (editor.getCurrentPageShapes() as any[]).filter((s) => s.type !== 'arrow')
        const target =
          allShapes.find((s) => s.id === cmd.targetOp?.targetShapeId) ?? allShapes[allShapes.length - 1]
        if (target) {
          const b = editor.getShapePageBounds(target.id)
          if (b) {
            editor.zoomToBounds(b, {
              targetZoom: 1.1,
              inset: 140,
              animation: { duration: 360 },
            })
          }
        }
      } else if (cmd.intent === 'swap_positions' && cmd.targetOp) {
        const allShapes = (editor.getCurrentPageShapes() as any[]).filter((s) => s.type !== 'arrow')
        const s1 = allShapes.find((s) => s.id === cmd.targetOp?.targetShapeId) ?? allShapes[0]
        const s2 =
          allShapes.find((s) => s.id === cmd.targetOp?.secondTargetShapeId) ??
          allShapes[allShapes.length - 1]
        if (s1 && s2 && s1.id !== s2.id) {
          const x1 = s1.x
          const y1 = s1.y
          editor.run(() => {
            editor.updateShape({ id: s1.id, type: s1.type, x: s2.x, y: s2.y } as any)
            editor.updateShape({ id: s2.id, type: s2.type, x: x1, y: y1 } as any)
          })
        }
      } else if (cmd.intent === 'group_frame' && cmd.frameOp) {
        const shapes = summarizeCanvasShapes(editor, ghostShapeIdRef.current)
        if (shapes.length > 0) {
          const minX = Math.min(...shapes.map((s) => s.x)) - 60
          const minY = Math.min(...shapes.map((s) => s.y)) - 70
          const maxX = Math.max(...shapes.map((s) => s.x + s.w)) + 60
          const maxY = Math.max(...shapes.map((s) => s.y + s.h)) + 60
          const frameId = createShapeId()
          editor.createShape({
            id: frameId,
            type: 'frame',
            x: minX,
            y: minY,
            props: {
              w: Math.max(360, maxX - minX),
              h: Math.max(240, maxY - minY),
              name: cmd.frameOp.frameLabel,
              color: theme.mutedColor,
            },
          } as any)
          editor.sendToBack([frameId])
          editor.zoomToFit({ animation: { duration: 280 } })
        }
      } else if (cmd.intent === 'distribute_shapes') {
        const shapes = (editor.getCurrentPageShapes() as any[]).filter(
          (s) => s.type !== 'arrow' && s.type !== 'frame'
        )
        if (shapes.length > 0) {
          editor.run(() => {
            if (cmd.alignment === 'circle') {
              const radius = Math.max(240, shapes.length * 52)
              shapes.forEach((s, idx) => {
                const angle = (idx / shapes.length) * Math.PI * 2 - Math.PI / 2
                const w = s.props?.w ?? 200
                const h = s.props?.h ?? 110
                editor.updateShape({
                  id: s.id,
                  type: s.type,
                  x: Math.round(cx + Math.cos(angle) * radius - w / 2),
                  y: Math.round(cy + Math.sin(angle) * radius - h / 2),
                } as any)
              })
            } else {
              shapes.forEach((s) => {
                const dx = (s.x ?? cx) - cx
                const dy = (s.y ?? cy) - cy
                editor.updateShape({
                  id: s.id,
                  type: s.type,
                  x: Math.round(cx + dx * 1.32),
                  y: Math.round(cy + dy * 1.32),
                } as any)
              })
            }
          })
          editor.zoomToFit({ animation: { duration: 300 } })
        }
      } else if (
        (cmd.intent === 'style_target' ||
          cmd.intent === 'move_target' ||
          cmd.intent === 'resize_target' ||
          cmd.intent === 'delete_target') &&
        cmd.targetOp
      ) {
        const allShapes = (editor.getCurrentPageShapes() as any[]).filter(
          (s) => s.type !== 'arrow' && s.id !== ghostShapeIdRef.current
        )
        const targets = cmd.targetOp.applyToAll
          ? allShapes
          : allShapes.filter((s) => s.id === cmd.targetOp?.targetShapeId)
        const finalTargets = targets.length > 0 ? targets : allShapes.slice(-1)

        if (cmd.intent === 'delete_target') {
          editor.deleteShapes(finalTargets.map((t) => t.id))
        } else if (cmd.intent === 'move_target') {
          const anchor = cmd.targetOp.relativeToShapeId
            ? allShapes.find((s) => s.id === cmd.targetOp?.relativeToShapeId)
            : undefined

          for (const t of finalTargets) {
            if (anchor && cmd.targetOp.relativePlacement) {
              const aw = anchor.props?.w ?? 210
              const ah = anchor.props?.h ?? 115
              const tw = t.props?.w ?? 210
              const th = t.props?.h ?? 115
              let nx = anchor.x
              let ny = anchor.y
              if (cmd.targetOp.relativePlacement === 'above') ny = anchor.y - th - 75
              else if (cmd.targetOp.relativePlacement === 'below') ny = anchor.y + ah + 75
              else if (cmd.targetOp.relativePlacement === 'left') nx = anchor.x - tw - 95
              else if (cmd.targetOp.relativePlacement === 'right') nx = anchor.x + aw + 95
              editor.updateShape({ id: t.id, type: t.type, x: nx, y: ny } as any)
            } else {
              editor.updateShape({
                id: t.id,
                type: t.type,
                x: (t.x ?? 0) + (cmd.targetOp.dx ?? 180),
                y: (t.y ?? 0) + (cmd.targetOp.dy ?? 0),
              } as any)
            }
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
          (s) => s.type !== 'arrow' && s.type !== 'frame' && s.id !== ghostShapeIdRef.current
        )
        if (shapes.length > 0) {
          editor.run(() => {
            if (cmd.alignment === 'row') {
              const totalW = shapes.length * 265
              shapes.forEach((s, idx) => {
                editor.updateShape({
                  id: s.id,
                  type: s.type,
                  x: cx - totalW / 2 + idx * 265,
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
                  x: cx - ((cols - 1) * 275) / 2 + c * 275 - 105,
                  y: cy - 160 + r * 190,
                } as any)
              })
            }
          })
          editor.zoomToFit({ animation: { duration: 280 } })
        }
      }
    },
    [applyThemeToCanvas]
  )

  const executeCanvasCommand = useCallback(
    async (cmd: CanvasActionCommand) => {
      clearSpeculativeGhostShape()
      const steps = cmd.steps && cmd.steps.length > 1 ? cmd.steps : [cmd]
      for (const step of steps) {
        await executeAtomicCommand(step)
      }

      setLastExecuted({
        summary: cmd.summary,
        utterance: cmd.utterance,
        confidence: cmd.confidence,
        modelUsed: cmd.modelUsed,
        latencyMs: cmd.latencyMs,
      })

      const editor = editorRef.current
      if (editor && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'sync_shapes',
            canvasShapes: summarizeCanvasShapes(editor, ghostShapeIdRef.current),
          })
        )
      }
    },
    [clearSpeculativeGhostShape, executeAtomicCommand]
  )

  const dispatchSpokenUtterance = useCallback(
    async (utterance: string): Promise<CanvasActionCommand | null> => {
      const clean = utterance.trim()
      if (!clean) return null
      clearSpeculativeGhostShape()
      const editor = editorRef.current
      const canvasShapes = editor ? summarizeCanvasShapes(editor, ghostShapeIdRef.current) : []

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
    [clearSpeculativeGhostShape, executeCanvasCommand]
  )

  useEffect(() => {
    window.voiceCanvasSpeak = dispatchSpokenUtterance
    window.voiceCanvasHarmonize = async (goalPrompt = 'cohesive high-contrast architectural diagram') => {
      await dispatchSpokenUtterance(`harmonize the visual design for ${goalPrompt}`)
    }
  }, [dispatchSpokenUtterance])

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
      } catch {}
    }
    checkStatus()
    timer = setInterval(checkStatus, 3000)
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [])

  // Connect WebSocket + Earlybird 16kHz AudioWorklet stream + Cooperative Browser SpeechRecognition Booster
  useEffect(() => {
    let cancelled = false
    let audioCtx: AudioContext | null = null
    let mediaStream: MediaStream | null = null
    let silenceTimer: ReturnType<typeof setTimeout> | null = null
    let latestTranscriptRef = ''
    let lastCommitTime = 0
    let speechRec: any = null

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
                canvasShapes: summarizeCanvasShapes(editorRef.current, ghostShapeIdRef.current),
              })
            )
          }
          return
        }
        if (msg.type === 'speculative_intent' && msg.command) {
          setSpeculativeSummary(msg.command.summary)
          syncSpeculativeGhostShape(msg.command)
          return
        }
        if (msg.type === 'transcript') {
          const words: [string, number][] = msg.words ?? []
          const guess: [string, number][] = msg.guess ?? []
          setLiveWords(words)
          setGhostWords(guess)
          if (msg.speculative?.summary) {
            setSpeculativeSummary(msg.speculative.summary)
            syncSpeculativeGhostShape(msg.speculative)
          }
          const joined = words.map((w) => w[0]).join(' ').trim()
          if (joined && joined !== latestTranscriptRef) {
            latestTranscriptRef = joined
            if (silenceTimer) clearTimeout(silenceTimer)
            silenceTimer = setTimeout(() => {
              const phraseToCommit = latestTranscriptRef.trim()
              if (
                phraseToCommit.length >= 3 &&
                Date.now() - lastCommitTime > 1200 &&
                ws.readyState === WebSocket.OPEN
              ) {
                lastCommitTime = Date.now()
                latestTranscriptRef = ''
                const shapes = editorRef.current
                  ? summarizeCanvasShapes(editorRef.current, ghostShapeIdRef.current)
                  : []
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
      } catch {}
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

      // Cooperative Web Speech API booster (for instant interim ghost preview & fallback on CPU warmup)
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SR && !cancelled) {
        try {
          speechRec = new SR()
          speechRec.continuous = true
          speechRec.interimResults = true
          speechRec.lang = 'en-US'
          speechRec.onresult = (event: any) => {
            let interim = ''
            let finalPhrase = ''
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const transcript = event.results[i][0].transcript
              if (event.results[i].isFinal) {
                finalPhrase += transcript
              } else {
                interim += transcript
              }
            }
            if (interim.trim() && liveWords.length === 0) {
              const parts = interim.trim().split(/\s+/)
              setLiveWords(parts.map((w: string) => [w, 0.88]))
              if (ws.readyState === WebSocket.OPEN && interim.trim().length >= 4) {
                ws.send(JSON.stringify({ type: 'speculate', utterance: interim.trim() }))
              }
            }
            if (finalPhrase.trim().length >= 3 && Date.now() - lastCommitTime > 1200) {
              lastCommitTime = Date.now()
              latestTranscriptRef = ''
              if (silenceTimer) clearTimeout(silenceTimer)
              dispatchSpokenUtterance(finalPhrase.trim())
            }
          }
          speechRec.onend = () => {
            if (!cancelled) {
              try {
                speechRec.start()
              } catch {}
            }
          }
          speechRec.start()
        } catch {}
      }
    }

    startMicrophone()

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
        speechRec?.stop()
      } catch {}
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
  }, [dispatchSpokenUtterance, executeCanvasCommand, syncSpeculativeGhostShape])

  // Air-typing support: user can also speak by simply typing in mid-air (no input boxes or buttons!)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') {
        setAirTypingBuffer('')
        setSpeculativeSummary('')
        clearSpeculativeGhostShape()
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
        setAirTypingBuffer((prev) => {
          const next = prev.slice(0, -1)
          if (!next.trim()) {
            clearSpeculativeGhostShape()
            setSpeculativeSummary('')
          }
          return next
        })
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
  }, [clearSpeculativeGhostShape, dispatchSpokenUtterance])

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    window.__tldrawEditor = editor

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
          x: -330,
          y: -255,
          props: {
            color: 'light-blue',
            size: 'xl',
            font: 'mono',
            richText: toRichText('EARLYBIRD × EMBEDDINGGEMMA 2 · VOICE CANVAS'),
            autoSize: true,
          },
        } as any)

        const ebNode = { id: idEb, x: -430, y: -80, w: 235, h: 125 }
        const gemmaNode = { id: idGemma, x: -115, y: -80, w: 245, h: 125 }
        const canvasNode = { id: idCanvas, x: 210, y: -80, w: 235, h: 125 }

        editor.createShape({
          id: idEb,
          type: 'geo',
          x: ebNode.x,
          y: ebNode.y,
          props: {
            geo: 'hexagon',
            w: ebNode.w,
            h: ebNode.h,
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
          x: gemmaNode.x,
          y: gemmaNode.y,
          props: {
            geo: 'hexagon',
            w: gemmaNode.w,
            h: gemmaNode.h,
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
          x: canvasNode.x,
          y: canvasNode.y,
          props: {
            geo: 'rectangle',
            w: canvasNode.w,
            h: canvasNode.h,
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
          x: -95,
          y: 115,
          props: {
            color: 'yellow',
            size: 's',
            font: 'mono',
            richText: toRichText(
              'Just talk: "switch to cyberpunk neon", "generate a mind map", "draw a cloud called CDN and connect it to Earlybird"'
            ),
          },
        } as any)

        createBoundArrow(editor, ebNode, gemmaNode, {
          label: '80ms stream',
          color: 'light-blue',
          dash: 'solid',
          size: 'm',
          font: 'mono',
        })

        createBoundArrow(editor, gemmaNode, canvasNode, {
          label: 'visual design',
          color: 'violet',
          dash: 'solid',
          size: 'm',
          font: 'mono',
        })
      })

      editor.zoomToFit({ animation: { duration: 0 } })
    }
  }, [])

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

          <div className="eq-bars" aria-hidden="true">
            {[0.45, 0.85, 1.0, 0.7, 0.5].map((mult, idx) => {
              const h = Math.max(4, Math.min(18, Math.round(4 + micLevel * 95 * mult)))
              return <i key={idx} style={{ height: `${h}px` }} />
            })}
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
                Speak naturally — try <em>{AMBIENT_SUGGESTIONS[suggestionIdx]}</em>
              </div>
            )}

            {speculativeSummary && hasLiveSpeech && (
              <div className="speculative-line">
                <span className="spec-label">GHOST PREVIEW</span> {speculativeSummary}
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
