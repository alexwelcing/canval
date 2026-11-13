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
  type TldrawFill,
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
  '“make all shapes float gently”',
  '“animate data flow through the pipeline”',
  '“spin Speak to Paint”',
  '“draw a mind map about Ocean Robotics”',
  '“draw a cloud called CDN and connect it to Speak to Paint”',
  '“switch to watercolor atelier”',
  '“export canvas to image”',
  '“switch to cyberpunk neon aesthetic”',
  '“arrange all shapes in a circle”',
  '“stop all animations”',
]

const COLOR_HEX_MAP: Record<string, string> = {
  black: '#1e293b',
  grey: '#64748b',
  'light-violet': '#c084fc',
  violet: '#8b5cf6',
  blue: '#2563eb',
  'light-blue': '#0ea5e9',
  yellow: '#eab308',
  orange: '#f97316',
  green: '#16a34a',
  'light-green': '#22c55e',
  'light-red': '#f43f5e',
  red: '#dc2626',
  white: '#f8fafc',
}

interface WatercolorBloomItem {
  id: string
  x: number
  y: number
  w: number
  h: number
  colorHex: string
  edgeHex: string
}

type AnimationMotionMode = 'float' | 'pulse' | 'spin' | 'orbit' | 'bounce' | 'shake' | 'wave' | 'flow'

interface ActiveShapeAnimation {
  shapeId: TLShapeId
  shapeType: string
  mode: AnimationMotionMode
  speedMultiplier: number
  phaseOffset: number
  baseX: number
  baseY: number
  w: number
  h: number
  baseRotation: number
  baseOpacity: number
  color?: string
  orbitCenterX?: number
  orbitCenterY?: number
  orbitRadius?: number
  orbitBaseAngle?: number
  orbitCenterShapeId?: TLShapeId
}

declare global {
  interface Window {
    __tldrawEditor?: Editor
    voiceCanvasSpeak?: (utterance: string) => Promise<CanvasActionCommand | null>
    voiceCanvasHarmonize?: (goalPrompt?: string) => Promise<void>
    voiceCanvasExport?: (format?: 'png' | 'svg' | 'jpeg' | 'webp') => Promise<string>
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function extractLabelFromShape(editor: Editor, shape: any): string {
  try {
    const util = editor.getShapeUtil(shape)
    const text = util.getText?.(shape)
    if (typeof text === 'string' && text.trim()) {
      return text.trim().split('\n')[0]!.trim()
    }
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

function renderCanvasSnapshotBase64(shapes: CanvasShapeSummary[], bgHex: string): string {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 448
    canvas.height = 280
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    ctx.fillStyle = bgHex || '#f6f1e5'
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
        const strokeHex = COLOR_HEX_MAP[s.color ?? 'light-blue'] ?? '#0ea5e9'

        ctx.fillStyle = strokeHex + '33'
        ctx.strokeStyle = strokeHex
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.roundRect(sx, sy, sw, sh, 10)
        ctx.fill()
        ctx.stroke()

        ctx.fillStyle = '#1e293b'
        ctx.font = '11px Inter, sans-serif'
        ctx.fillText((s.label || '').slice(0, 18), sx + 8, sy + sh / 2 + 4)
      }
    }

    return canvas.toDataURL('image/png')
  } catch {
    return ''
  }
}

function triggerBrowserDownload(blobOrDataUrl: Blob | string, filename: string) {
  const link = document.createElement('a')
  const isBlob = typeof blobOrDataUrl !== 'string'
  const href = isBlob ? URL.createObjectURL(blobOrDataUrl) : blobOrDataUrl
  link.href = href
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  setTimeout(() => {
    link.remove()
    if (isBlob) URL.revokeObjectURL(href)
  }, 1500)
}

async function exportCanvasToImageFile(
  editor: Editor,
  theme: DesignThemeSpec,
  ghostId: TLShapeId | null,
  format: 'png' | 'svg' | 'jpeg' | 'webp' = 'png'
): Promise<string> {
  const shapesToExport = editor
    .getCurrentPageShapes()
    .filter((s) => s.id !== ghostId)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const ext = format === 'jpeg' ? 'jpg' : format
  const filename = `canval-${theme.id}-${stamp}.${ext}`

  try {
    if (format === 'svg' && shapesToExport.length > 0) {
      const svgRes = await editor.getSvgString(shapesToExport, {
        background: true,
        padding: 36,
        scale: 1,
        darkMode: theme.isDark,
      })
      if (svgRes?.svg) {
        const blob = new Blob([svgRes.svg], { type: 'image/svg+xml;charset=utf-8' })
        triggerBrowserDownload(blob, filename)
        return filename
      }
    }

    if (shapesToExport.length > 0) {
      const imgRes = await editor.toImage(shapesToExport, {
        format: format === 'svg' ? 'png' : format,
        background: false,
        padding: 40,
        scale: 1,
        pixelRatio: 2,
        darkMode: theme.isDark,
      })

      if (imgRes?.blob) {
        try {
          const bitmap = await createImageBitmap(imgRes.blob)
          const canvas = document.createElement('canvas')
          canvas.width = bitmap.width
          canvas.height = bitmap.height
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.fillStyle = theme.canvasBg || '#f6f1e5'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(bitmap, 0, 0)
            const mime =
              format === 'jpeg'
                ? 'image/jpeg'
                : format === 'webp'
                  ? 'image/webp'
                  : 'image/png'
            const compositedBlob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob((b) => resolve(b), mime, 0.94)
            )
            if (compositedBlob) {
              triggerBrowserDownload(compositedBlob, filename)
              return filename
            }
          }
        } catch {}

        triggerBrowserDownload(imgRes.blob, filename)
        return filename
      }
    }
  } catch {}

  // Fallback snapshot export if canvas is empty or running in headless DOM
  const summaries = summarizeCanvasShapes(editor, ghostId)
  const fallbackDataUrl = renderCanvasSnapshotBase64(summaries, theme.canvasBg)
  if (fallbackDataUrl) {
    triggerBrowserDownload(fallbackDataUrl, filename)
  }
  return filename
}

/**
 * Animates a shape's opacity and watercolor wash fill from an initial wet sketch
 * into a saturated watercolor wash over ~600ms.
 */
function animateWatercolorWashOnShape(
  editor: Editor,
  shapeId: TLShapeId,
  shapeType: 'geo' | 'note' | 'text' | 'arrow',
  targetFill?: TldrawFill
) {
  const stages: { delay: number; opacity: number; fill?: TldrawFill }[] = [
    { delay: 90, opacity: 0.42, fill: shapeType === 'geo' ? (targetFill ?? 'semi') : undefined },
    { delay: 240, opacity: 0.72 },
    { delay: 440, opacity: 0.94 },
  ]

  for (const st of stages) {
    setTimeout(() => {
      try {
        const existing = editor.getShape(shapeId)
        if (!existing) return
        const updatePayload: Record<string, any> = {
          id: shapeId,
          type: shapeType,
          opacity: st.opacity,
        }
        if (st.fill && shapeType === 'geo') {
          updatePayload.props = { fill: st.fill }
        }
        editor.updateShape(updatePayload as any)
      } catch {}
    }, st.delay)
  }
}

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
): TLShapeId {
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
    opacity: 0.22,
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
  } catch {}

  animateWatercolorWashOnShape(editor, arrowId, 'arrow')
  return arrowId
}

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
    const stepRadius = ring * 145
    for (let k = 0; k < 8; k++) {
      const angle = (k * Math.PI) / 4 + ring * 0.35
      const cx = Math.round(targetX + Math.cos(angle) * stepRadius)
      const cy = Math.round(targetY + Math.sin(angle) * stepRadius)
      if (!overlaps(cx, cy)) return { x: cx, y: cy }
    }
  }
  return { x: targetX + 70, y: targetY + 70 }
}

function App() {
  const editorRef = useRef<Editor | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const ghostShapeIdRef = useRef<TLShapeId | null>(null)
  const activeAnimationsRef = useRef<Map<TLShapeId, ActiveShapeAnimation>>(new Map())
  const flowPulseIdxRef = useRef<number>(0)

  const [activeTheme, setActiveTheme] = useState<DesignThemeSpec>(DESIGN_THEMES[0]!)
  const [blooms, setBlooms] = useState<WatercolorBloomItem[]>([])
  const [animStatus, setAnimStatus] = useState<{ count: number; mode: string } | null>(null)
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

  useEffect(() => {
    const id = setInterval(() => {
      setSuggestionIdx((i) => (i + 1) % AMBIENT_SUGGESTIONS.length)
    }, 6500)
    return () => clearInterval(id)
  }, [])

  /**
   * Spawns an organic expanding wet watercolor pigment bloom at the screen coordinates
   * corresponding to (pageX, pageY, w, h) on the tldraw canvas.
   */
  const spawnWatercolorBloom = useCallback(
    (editor: Editor, pageX: number, pageY: number, w: number, h: number, colorName?: string) => {
      try {
        const pt = editor.pageToScreen({ x: pageX + w / 2, y: pageY + h / 2 })
        const zoom = editor.getZoomLevel()
        const hex = COLOR_HEX_MAP[colorName ?? 'light-blue'] ?? '#0ea5e9'
        const item: WatercolorBloomItem = {
          id: `bloom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          x: pt.x,
          y: pt.y,
          w: Math.max(130, Math.round(w * zoom * 1.45)),
          h: Math.max(100, Math.round(h * zoom * 1.45)),
          colorHex: hex + '66',
          edgeHex: hex + '26',
        }
        setBlooms((prev) => [...prev.slice(-14), item])
        setTimeout(() => {
          setBlooms((prev) => prev.filter((b) => b.id !== item.id))
        }, 1500)
      } catch {}
    },
    []
  )

  // Real-time 60fps Canvas Element Physics & Animation Loop (history: 'ignore')
  useEffect(() => {
    let rafId = 0
    let lastBloomTime = 0
    const tStart = performance.now()

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick)
      const animMap = activeAnimationsRef.current
      const editor = editorRef.current
      if (!editor || animMap.size === 0) return

      const t = (now - tStart) / 1000
      const selectedIds = new Set(editor.getSelectedShapeIds())
      const isDragging = editor.inputs?.isDragging ?? false

      try {
        editor.run(
          () => {
            for (const [shapeId, anim] of animMap.entries()) {
              const live = editor.getShape(shapeId) as any
              if (!live) {
                animMap.delete(shapeId)
                continue
              }

              // If the user is actively dragging this shape, update its anchor coordinates
              if (isDragging && selectedIds.has(shapeId)) {
                anim.baseX = live.x
                anim.baseY = live.y
                continue
              }

              const omega = t * anim.speedMultiplier + anim.phaseOffset
              let nx = anim.baseX
              let ny = anim.baseY
              let nRot = anim.baseRotation
              let nOpacity = anim.baseOpacity

              if (anim.mode === 'float') {
                nx = anim.baseX + Math.sin(omega * 1.45) * 11
                ny = anim.baseY + Math.cos(omega * 1.95) * 14
                nRot = anim.baseRotation + Math.sin(omega * 1.15) * 0.042
              } else if (anim.mode === 'pulse') {
                const beat = Math.pow(Math.abs(Math.sin(omega * 2.5)), 3)
                ny = anim.baseY - beat * 11
                nOpacity = 0.48 + 0.5 * (0.5 + 0.5 * Math.sin(omega * 3.2))
                nRot = anim.baseRotation + Math.sin(omega * 1.6) * 0.025
              } else if (anim.mode === 'spin') {
                const theta = anim.baseRotation + omega * 1.65
                const cx = anim.baseX + anim.w / 2
                const cy = anim.baseY + anim.h / 2
                nx = cx - (anim.w / 2) * Math.cos(theta) + (anim.h / 2) * Math.sin(theta)
                ny = cy - (anim.w / 2) * Math.sin(theta) - (anim.h / 2) * Math.cos(theta)
                nRot = theta
              } else if (anim.mode === 'orbit') {
                let centerX = anim.orbitCenterX ?? 0
                let centerY = anim.orbitCenterY ?? 0
                if (anim.orbitCenterShapeId) {
                  const centerBounds = editor.getShapePageBounds(anim.orbitCenterShapeId)
                  if (centerBounds) {
                    centerX = centerBounds.x + centerBounds.w / 2
                    centerY = centerBounds.y + centerBounds.h / 2
                  }
                }
                const radius = anim.orbitRadius ?? 280
                const angle = (anim.orbitBaseAngle ?? 0) + t * anim.speedMultiplier * 0.85
                nx = centerX + Math.cos(angle) * radius - anim.w / 2
                ny = centerY + Math.sin(angle) * radius - anim.h / 2
                nRot = Math.sin(angle) * 0.06
              } else if (anim.mode === 'bounce') {
                ny = anim.baseY - Math.abs(Math.sin(omega * 2.9)) * 36
                nRot = anim.baseRotation + Math.cos(omega * 2.9) * 0.045
              } else if (anim.mode === 'shake') {
                nx = anim.baseX + Math.sin(omega * 18) * 9
                ny = anim.baseY + Math.cos(omega * 14) * 4
                nRot = anim.baseRotation + Math.sin(omega * 16) * 0.065
              } else if (anim.mode === 'wave') {
                const wavePhase = anim.baseX * 0.0045 - t * anim.speedMultiplier * 2.7
                ny = anim.baseY + Math.sin(wavePhase) * 28
                nRot = Math.cos(wavePhase) * 0.065
              } else if (anim.mode === 'flow') {
                const flowWave = anim.baseX * 0.0035 - t * anim.speedMultiplier * 2.2
                nx = anim.baseX + Math.cos(omega * 1.3) * 6
                ny = anim.baseY + Math.sin(omega * 1.75) * 10
                nRot = anim.baseRotation + Math.sin(omega * 1.1) * 0.03
                nOpacity = 0.68 + 0.3 * (0.5 + 0.5 * Math.sin(flowWave))
              }

              editor.updateShape({
                id: shapeId,
                type: anim.shapeType,
                x: nx,
                y: ny,
                rotation: nRot,
                opacity: Number(Math.min(1, Math.max(0.2, nOpacity)).toFixed(3)),
              } as any)
            }
          },
          { history: 'ignore' }
        )

        // Periodically emit a travelling watercolor bloom along 'flow' or 'pulse' nodes
        if (now - lastBloomTime > 1250) {
          const flowEntries = Array.from(animMap.values()).filter(
            (a) => a.mode === 'flow' || a.mode === 'pulse'
          )
          if (flowEntries.length > 0) {
            lastBloomTime = now
            const chosen = flowEntries[flowPulseIdxRef.current % flowEntries.length]!
            flowPulseIdxRef.current += 1
            const b = editor.getShapePageBounds(chosen.shapeId)
            if (b) {
              spawnWatercolorBloom(editor, b.x, b.y, b.w, b.h, chosen.color)
            }
          }
        }
      } catch {}
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [spawnWatercolorBloom])

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
            dash: 'draw',
            size: theme.size,
            font: theme.font,
            richText: toRichText(`${label} …`),
          },
        } as any)
        spawnWatercolorBloom(editor, spot.x, spot.y, archetype.width, archetype.height, color ?? theme.primaryColor)
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
            dash: 'draw',
            richText: toRichText(`${label} …`),
          },
        } as any)
      }
    },
    [clearSpeculativeGhostShape, spawnWatercolorBloom]
  )

  const applyThemeToCanvas = useCallback(
    (editor: Editor, theme: DesignThemeSpec) => {
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

      shapes.forEach((s, idx) => {
        const chosenColor = palette[idx % palette.length]
        setTimeout(() => {
          try {
            if (!editor.getShape(s.id)) return
            const bounds = editor.getShapePageBounds(s.id)
            if (bounds && s.type !== 'arrow') {
              spawnWatercolorBloom(editor, bounds.x, bounds.y, bounds.w, bounds.h, chosenColor)
            }
            if (s.type === 'geo') {
              editor.updateShape({
                id: s.id,
                type: 'geo',
                props: {
                  color: chosenColor,
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
          } catch {}
        }, idx * 85)
      })
    },
    [spawnWatercolorBloom]
  )

  const executeAtomicCommand = useCallback(
    async (cmd: CanvasActionCommand) => {
      const editor = editorRef.current
      if (!editor) return

      const theme = activeThemeRef.current
      const viewport = editor.getViewportPageBounds()
      const cx = viewport.x + viewport.w / 2
      const cy = viewport.y + viewport.h / 2

      if (cmd.intent === 'clear_canvas') {
        activeAnimationsRef.current.clear()
        setAnimStatus(null)
        const allIds = Array.from(editor.getCurrentPageShapeIds())
        if (allIds.length > 0) {
          editor.deleteShapes(allIds)
        }
      } else if (cmd.intent === 'animate_target' && cmd.animationOp) {
        const {
          animationType,
          applyToAll,
          targetShapeId,
          targetLabel,
          orbitCenterShapeId,
          orbitCenterLabel,
          speed,
        } = cmd.animationOp

        const allShapes = (editor.getCurrentPageShapes() as any[]).filter(
          (s) => s.type !== 'arrow' && s.type !== 'frame' && s.id !== ghostShapeIdRef.current
        )

        if (animationType === 'stop') {
          const toStop = applyToAll
            ? Array.from(activeAnimationsRef.current.values())
            : Array.from(activeAnimationsRef.current.values()).filter(
                (a) => a.shapeId === targetShapeId
              )
          editor.run(() => {
            for (const anim of toStop) {
              if (editor.getShape(anim.shapeId)) {
                editor.updateShape({
                  id: anim.shapeId,
                  type: anim.shapeType,
                  x: anim.baseX,
                  y: anim.baseY,
                  rotation: anim.baseRotation,
                  opacity: 0.94,
                } as any)
              }
              activeAnimationsRef.current.delete(anim.shapeId)
            }
          })
          const rem = activeAnimationsRef.current.size
          const firstMode = Array.from(activeAnimationsRef.current.values())[0]?.mode ?? 'float'
          setAnimStatus(rem > 0 ? { count: rem, mode: firstMode } : null)
          return
        }

        let targets = applyToAll
          ? allShapes
          : allShapes.filter(
              (s) =>
                s.id === targetShapeId ||
                (targetLabel &&
                  extractLabelFromShape(editor, s)
                    .toLowerCase()
                    .includes(targetLabel.toLowerCase()))
            )
        if (targets.length === 0 && allShapes.length > 0) {
          targets = allShapes.slice(-1)
        }

        const speedMultiplier = speed === 'fast' ? 1.85 : speed === 'slow' ? 0.55 : 1.0

        let orbitCenterShape =
          allShapes.find((s) => s.id === orbitCenterShapeId) ??
          (orbitCenterLabel
            ? allShapes.find((s) =>
                extractLabelFromShape(editor, s)
                  .toLowerCase()
                  .includes(orbitCenterLabel.toLowerCase())
              )
            : undefined)

        if (animationType === 'orbit' && !orbitCenterShape && applyToAll && allShapes.length > 1) {
          orbitCenterShape =
            allShapes.find((s) => s.props?.geo === 'hexagon') ?? allShapes[0]
        }

        if (animationType === 'orbit' && orbitCenterShape && applyToAll && targets.length > 1) {
          targets = targets.filter((t) => t.id !== orbitCenterShape.id)
        }

        const centerBounds = orbitCenterShape
          ? editor.getShapePageBounds(orbitCenterShape.id)
          : undefined
        const orbitCx = centerBounds ? centerBounds.x + centerBounds.w / 2 : cx
        const orbitCy = centerBounds ? centerBounds.y + centerBounds.h / 2 : cy

        targets.forEach((s, idx) => {
          const existingAnim = activeAnimationsRef.current.get(s.id)
          const bounds = editor.getShapePageBounds(s.id)
          const baseX = existingAnim?.baseX ?? s.x ?? 0
          const baseY = existingAnim?.baseY ?? s.y ?? 0
          const w = bounds?.w ?? s.props?.w ?? 200
          const h = bounds?.h ?? s.props?.h ?? 110
          const scx = baseX + w / 2
          const scy = baseY + h / 2
          const dx = scx - orbitCx
          const dy = scy - orbitCy
          const dist = Math.hypot(dx, dy)
          const orbitRadius = dist > 60 ? dist : 260 + idx * 45
          const orbitBaseAngle =
            dist > 60 ? Math.atan2(dy, dx) : (idx / Math.max(1, targets.length)) * Math.PI * 2

          activeAnimationsRef.current.set(s.id, {
            shapeId: s.id,
            shapeType: s.type,
            mode: animationType,
            speedMultiplier,
            phaseOffset: idx * 0.85,
            baseX,
            baseY,
            w,
            h,
            baseRotation: existingAnim?.baseRotation ?? (s.rotation ?? 0),
            baseOpacity: 0.94,
            color: s.props?.color,
            orbitCenterX: orbitCx,
            orbitCenterY: orbitCy,
            orbitRadius,
            orbitBaseAngle,
            orbitCenterShapeId: orbitCenterShape?.id,
          })

          spawnWatercolorBloom(editor, baseX, baseY, w, h, s.props?.color)
        })

        setAnimStatus({
          count: activeAnimationsRef.current.size,
          mode: animationType,
        })
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
      } else if (cmd.intent === 'export_canvas') {
        const format = cmd.exportFormat ?? 'png'
        spawnWatercolorBloom(editor, cx - 160, cy - 90, 320, 180, theme.primaryColor)
        await exportCanvasToImageFile(editor, theme, ghostShapeIdRef.current, format)
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
            summary: `Vision Harmonized: ${data.theme?.name ?? 'Watercolor'} (${data.harmony?.critiqueTitle ?? 'Balanced'})`,
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
        const paintColor = color ?? theme.primaryColor

        if (cmd.intent === 'create_note' || archetype.kind === 'note') {
          editor.createShape({
            id,
            type: 'note',
            x,
            y,
            opacity: 0.16,
            props: {
              color: color ?? theme.accentColor,
              size: size ?? theme.size,
              font: font ?? theme.font,
              richText: toRichText(label),
            },
          } as any)
          spawnWatercolorBloom(editor, x, y, 200, 200, color ?? theme.accentColor)
          animateWatercolorWashOnShape(editor, id, 'note')
        } else if (cmd.intent === 'create_text' || archetype.kind === 'text') {
          editor.createShape({
            id,
            type: 'text',
            x,
            y,
            opacity: 0.16,
            props: {
              color: paintColor,
              size: size ?? 'xl',
              font: font ?? theme.font,
              richText: toRichText(label),
              autoSize: true,
            },
          } as any)
          spawnWatercolorBloom(editor, x, y, 260, 70, paintColor)
          animateWatercolorWashOnShape(editor, id, 'text')
        } else {
          editor.createShape({
            id,
            type: 'geo',
            x,
            y,
            opacity: 0.14,
            props: {
              geo: archetype.geo ?? 'rectangle',
              w: archetype.width,
              h: archetype.height,
              color: paintColor,
              fill: 'none',
              dash: dash ?? 'draw',
              size: size ?? theme.size,
              font: font ?? theme.font,
              richText: toRichText(label),
            },
          } as any)
          spawnWatercolorBloom(editor, x, y, archetype.width, archetype.height, paintColor)
          animateWatercolorWashOnShape(editor, id, 'geo', fill ?? theme.fill)
        }
      } else if (cmd.intent === 'connect_shapes' && cmd.connection) {
        const shapes = summarizeCanvasShapes(editor, ghostShapeIdRef.current)
        let fromShape =
          shapes.find((s) => s.id === cmd.connection?.fromShapeId) ??
          shapes.find((s) => s.label.toLowerCase().includes((cmd.connection?.fromLabel ?? '').toLowerCase()))
        let toShape =
          shapes.find((s) => s.id === cmd.connection?.toShapeId) ??
          shapes.find((s) => s.label.toLowerCase().includes((cmd.connection?.toLabel ?? '').toLowerCase()))

        if (!fromShape) {
          const newFromId = createShapeId()
          const spot = findOpenCanvasSpot(shapes, cx - 260, cy - 55, 210, 110)
          editor.createShape({
            id: newFromId,
            type: 'geo',
            x: spot.x,
            y: spot.y,
            opacity: 0.16,
            props: {
              geo: 'rectangle',
              w: 210,
              h: 110,
              color: theme.primaryColor,
              fill: 'none',
              dash: 'draw',
              font: theme.font,
              size: theme.size,
              richText: toRichText(cmd.connection.fromLabel ?? cmd.connection.fromQuery),
            },
          } as any)
          spawnWatercolorBloom(editor, spot.x, spot.y, 210, 110, theme.primaryColor)
          animateWatercolorWashOnShape(editor, newFromId, 'geo', theme.fill)
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
            opacity: 0.16,
            props: {
              geo: 'rectangle',
              w: 210,
              h: 110,
              color: theme.secondaryColor,
              fill: 'none',
              dash: 'draw',
              font: theme.font,
              size: theme.size,
              richText: toRichText(cmd.connection.toLabel ?? cmd.connection.toQuery),
            },
          } as any)
          spawnWatercolorBloom(editor, spot.x, spot.y, 210, 110, theme.secondaryColor)
          animateWatercolorWashOnShape(editor, newToId, 'geo', theme.fill)
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

        const midX = (fromShape.x + toShape.x) / 2
        const midY = (fromShape.y + toShape.y) / 2
        spawnWatercolorBloom(editor, midX, midY, 160, 90, theme.accentColor)
        createBoundArrow(editor, fromShape, toShape, {
          label: cmd.connection.edgeLabel,
          color: theme.accentColor,
          dash: 'draw',
          size: theme.size,
          font: theme.font,
        })
      } else if (cmd.intent === 'generate_layout' && cmd.layout) {
        // Staggered progressive watercolor painting: paint header, then each node stroke-by-stroke, then brush-flow arrows!
        const { template, topicTitle } = cmd.layout
        const roleColors = {
          primary: theme.primaryColor,
          secondary: theme.secondaryColor,
          accent: theme.accentColor,
          muted: theme.mutedColor,
        }

        const headerText = topicTitle
          ? `${template.name}: ${topicTitle}`
          : template.frameLabel ?? template.name
        const headerId = createShapeId()
        editor.createShape({
          id: headerId,
          type: 'text',
          x: cx - 240,
          y: cy - 320,
          opacity: 0.15,
          props: {
            color: theme.primaryColor,
            size: 'xl',
            font: theme.font,
            richText: toRichText(headerText),
            autoSize: true,
          },
        } as any)
        spawnWatercolorBloom(editor, cx - 120, cy - 310, 320, 70, theme.primaryColor)
        animateWatercolorWashOnShape(editor, headerId, 'text')

        const nodePositions = new Map<string, { id: TLShapeId; x: number; y: number; w: number; h: number }>()

        for (let i = 0; i < template.nodes.length; i++) {
          const node = template.nodes[i]!
          await sleep(145)
          const arch =
            SHAPE_ARCHETYPES.find((a) => a.id === node.archetype) ?? SHAPE_ARCHETYPES[0]!
          const w = node.w ?? arch.width
          const h = node.h ?? arch.height
          const nx = cx + node.dx - w / 2
          const ny = cy + node.dy - h / 2
          const shapeId = createShapeId()
          const c = roleColors[node.colorRole ?? 'primary']
          const nodeLabel = node.key === 'center' && topicTitle ? topicTitle : node.label

          if (arch.kind === 'note') {
            editor.createShape({
              id: shapeId,
              type: 'note',
              x: nx,
              y: ny,
              opacity: 0.15,
              props: {
                color: c,
                size: theme.size,
                font: theme.font,
                richText: toRichText(nodeLabel),
              },
            } as any)
            spawnWatercolorBloom(editor, nx, ny, w, h, c)
            animateWatercolorWashOnShape(editor, shapeId, 'note')
          } else {
            editor.createShape({
              id: shapeId,
              type: 'geo',
              x: nx,
              y: ny,
              opacity: 0.14,
              props: {
                geo: arch.geo ?? 'rectangle',
                w,
                h,
                color: c,
                fill: 'none',
                dash: 'draw',
                size: theme.size,
                font: theme.font,
                richText: toRichText(nodeLabel),
              },
            } as any)
            spawnWatercolorBloom(editor, nx, ny, w, h, c)
            animateWatercolorWashOnShape(editor, shapeId, 'geo', theme.fill)
          }

          nodePositions.set(node.key, { id: shapeId, x: nx, y: ny, w, h })
        }

        editor.zoomToFit({ animation: { duration: 340 } })

        for (const edge of template.edges) {
          await sleep(105)
          const src = nodePositions.get(edge.from)
          const dst = nodePositions.get(edge.to)
          if (!src || !dst) continue
          spawnWatercolorBloom(
            editor,
            (src.x + dst.x) / 2,
            (src.y + dst.y) / 2,
            140,
            80,
            theme.secondaryColor
          )
          createBoundArrow(editor, src, dst, {
            label: edge.label,
            bend: edge.bend,
            color: theme.secondaryColor,
            dash: 'draw',
            size: theme.size,
            font: theme.font,
          })
        }
      } else if (cmd.intent === 'rename_target' && cmd.targetOp?.newLabel) {
        const allShapes = (editor.getCurrentPageShapes() as any[]).filter((s) => s.type !== 'arrow')
        const target =
          allShapes.find((s) => s.id === cmd.targetOp?.targetShapeId) ?? allShapes[allShapes.length - 1]
        if (target) {
          const b = editor.getShapePageBounds(target.id)
          if (b) spawnWatercolorBloom(editor, b.x, b.y, b.w, b.h, target.props?.color)
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
          editor.duplicateShapes([target.id], { x: 60, y: 60 })
          const b = editor.getShapePageBounds(target.id)
          if (b) spawnWatercolorBloom(editor, b.x + 60, b.y + 60, b.w, b.h, target.props?.color)
        }
      } else if (cmd.intent === 'highlight_target' && cmd.targetOp) {
        const allShapes = (editor.getCurrentPageShapes() as any[]).filter((s) => s.type !== 'arrow')
        const target =
          allShapes.find((s) => s.id === cmd.targetOp?.targetShapeId) ?? allShapes[allShapes.length - 1]
        if (target) {
          const b = editor.getShapePageBounds(target.id)
          if (b) {
            spawnWatercolorBloom(editor, b.x, b.y, b.w, b.h, target.props?.color)
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
          spawnWatercolorBloom(editor, s2.x, s2.y, 200, 120, s1.props?.color)
          spawnWatercolorBloom(editor, x1, y1, 200, 120, s2.props?.color)
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
              const radius = Math.max(260, shapes.length * 55)
              shapes.forEach((s, idx) => {
                const angle = (idx / shapes.length) * Math.PI * 2 - Math.PI / 2
                const w = s.props?.w ?? 200
                const h = s.props?.h ?? 110
                const nx = Math.round(cx + Math.cos(angle) * radius - w / 2)
                const ny = Math.round(cy + Math.sin(angle) * radius - h / 2)
                editor.updateShape({
                  id: s.id,
                  type: s.type,
                  x: nx,
                  y: ny,
                } as any)
                spawnWatercolorBloom(editor, nx, ny, w, h, s.props?.color)
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
              spawnWatercolorBloom(editor, nx, ny, tw, th, t.props?.color)
            } else {
              const nx = (t.x ?? 0) + (cmd.targetOp.dx ?? 180)
              const ny = (t.y ?? 0) + (cmd.targetOp.dy ?? 0)
              editor.updateShape({
                id: t.id,
                type: t.type,
                x: nx,
                y: ny,
              } as any)
              spawnWatercolorBloom(editor, nx, ny, t.props?.w ?? 200, t.props?.h ?? 110, t.props?.color)
            }
          }
        } else if (cmd.intent === 'resize_target') {
          const factor = cmd.targetOp.scaleFactor ?? 1.35
          for (const t of finalTargets) {
            if (t.props?.w && t.props?.h) {
              const nw = Math.max(80, Math.round(t.props.w * factor))
              const nh = Math.max(60, Math.round(t.props.h * factor))
              editor.updateShape({
                id: t.id,
                type: t.type,
                props: { w: nw, h: nh },
              } as any)
              spawnWatercolorBloom(editor, t.x, t.y, nw, nh, t.props?.color)
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
            spawnWatercolorBloom(
              editor,
              t.x,
              t.y,
              t.props?.w ?? 200,
              t.props?.h ?? 110,
              cmd.targetOp.color ?? t.props?.color
            )
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
                const nx = cx - totalW / 2 + idx * 265
                const ny = cy - 60
                editor.updateShape({ id: s.id, type: s.type, x: nx, y: ny } as any)
                spawnWatercolorBloom(editor, nx, ny, 220, 120, s.props?.color)
              })
            } else if (cmd.alignment === 'column') {
              const totalH = shapes.length * 165
              shapes.forEach((s, idx) => {
                const nx = cx - 110
                const ny = cy - totalH / 2 + idx * 165
                editor.updateShape({ id: s.id, type: s.type, x: nx, y: ny } as any)
                spawnWatercolorBloom(editor, nx, ny, 220, 120, s.props?.color)
              })
            } else {
              const cols = Math.max(2, Math.ceil(Math.sqrt(shapes.length)))
              shapes.forEach((s, idx) => {
                const r = Math.floor(idx / cols)
                const c = idx % cols
                const nx = cx - ((cols - 1) * 275) / 2 + c * 275 - 105
                const ny = cy - 160 + r * 190
                editor.updateShape({ id: s.id, type: s.type, x: nx, y: ny } as any)
                spawnWatercolorBloom(editor, nx, ny, 220, 120, s.props?.color)
              })
            }
          })
          editor.zoomToFit({ animation: { duration: 280 } })
        }
      }
    },
    [applyThemeToCanvas, spawnWatercolorBloom]
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
    window.voiceCanvasHarmonize = async (goalPrompt = 'cohesive watercolor architectural diagram') => {
      await dispatchSpokenUtterance(`harmonize the visual design for ${goalPrompt}`)
    }
    window.voiceCanvasExport = async (format: 'png' | 'svg' | 'jpeg' | 'webp' = 'png') => {
      const editor = editorRef.current
      if (!editor) return ''
      return exportCanvasToImageFile(editor, activeThemeRef.current, ghostShapeIdRef.current, format)
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

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      window.__tldrawEditor = editor

      // Start in light mode on warm cold-press cotton watercolor paper
      editor.user.updateUserPreferences({ colorScheme: 'light' })

      if (editor.getCurrentPageShapes().length === 0) {
        const idBanner = createShapeId()
        const idHub = createShapeId()
        const idCardDiagrams = createShapeId()
        const idCardShapes = createShapeId()
        const idCardStyles = createShapeId()
        const idCardArrange = createShapeId()
        const idCardNote = createShapeId()

        const hubNode = { id: idHub, x: -155, y: -80, w: 310, h: 155 }
        const cardDiagrams = { id: idCardDiagrams, x: -620, y: -275, w: 340, h: 190 }
        const cardShapes = { id: idCardShapes, x: 280, y: -275, w: 340, h: 190 }
        const cardStyles = { id: idCardStyles, x: -620, y: 95, w: 340, h: 190 }
        const cardArrange = { id: idCardArrange, x: 280, y: 95, w: 340, h: 190 }

        editor.run(() => {
          editor.createShape({
            id: idBanner,
            type: 'text',
            x: -395,
            y: -380,
            props: {
              color: 'blue',
              size: 'xl',
              font: 'draw',
              richText: toRichText('🎨 CANVAL · VOICE WATERCOLOR CANVAS (ZERO BUTTONS — JUST TALK)'),
              autoSize: true,
            },
          } as any)

          // Central Hub Node
          editor.createShape({
            id: idHub,
            type: 'geo',
            x: hubNode.x,
            y: hubNode.y,
            opacity: 0.16,
            props: {
              geo: 'hexagon',
              w: hubNode.w,
              h: hubNode.h,
              color: 'violet',
              fill: 'none',
              dash: 'draw',
              font: 'draw',
              size: 'm',
              richText: toRichText(
                '🎙️ SPEAK TO PAINT\nEarlybird 29M + EmbeddingGemma 2\nSpeak naturally & pause ~1s\n(or type in mid-air + press Enter)'
              ),
            },
          } as any)

          // Card 1: Paint Full Diagrams
          editor.createShape({
            id: idCardDiagrams,
            type: 'geo',
            x: cardDiagrams.x,
            y: cardDiagrams.y,
            opacity: 0.16,
            props: {
              geo: 'cloud',
              w: cardDiagrams.w,
              h: cardDiagrams.h,
              color: 'light-blue',
              fill: 'none',
              dash: 'draw',
              font: 'draw',
              size: 's',
              richText: toRichText(
                '1. PAINT FULL DIAGRAMS\n• "Generate a system architecture diagram"\n• "Draw a mind map about Ocean AI"\n• "Build a Kanban board"\n• "Create a decision flowchart"'
              ),
            },
          } as any)

          // Card 2: Add & Link Shapes
          editor.createShape({
            id: idCardShapes,
            type: 'geo',
            x: cardShapes.x,
            y: cardShapes.y,
            opacity: 0.16,
            props: {
              geo: 'rectangle',
              w: cardShapes.w,
              h: cardShapes.h,
              color: 'green',
              fill: 'none',
              dash: 'draw',
              font: 'draw',
              size: 's',
              richText: toRichText(
                '2. ADD & LINK SHAPES\n• "Draw a blue cloud called Edge CDN"\n• "Add a sticky note saying Ship Friday"\n• "Connect Edge CDN to Speak to Paint"\n• "Draw a star called Launch Goal"'
              ),
            },
          } as any)

          // Card 3: Watercolor Palettes & Style
          editor.createShape({
            id: idCardStyles,
            type: 'geo',
            x: cardStyles.x,
            y: cardStyles.y,
            opacity: 0.16,
            props: {
              geo: 'rectangle',
              w: cardStyles.w,
              h: cardStyles.h,
              color: 'orange',
              fill: 'none',
              dash: 'draw',
              font: 'draw',
              size: 's',
              richText: toRichText(
                '3. PALETTES & WATERCOLOR\n• "Switch to Watercolor Atelier"\n• "Switch to Cyberpunk Neon"\n• "Apply Bauhaus Primary style"\n• "Harmonize the visual design"'
              ),
            },
          } as any)

          // Card 4: Arrange, Move & Edit
          editor.createShape({
            id: idCardArrange,
            type: 'geo',
            x: cardArrange.x,
            y: cardArrange.y,
            opacity: 0.16,
            props: {
              geo: 'oval',
              w: cardArrange.w,
              h: cardArrange.h,
              color: 'blue',
              fill: 'none',
              dash: 'draw',
              font: 'draw',
              size: 's',
              richText: toRichText(
                '4. ANIMATE, EXPORT & ARRANGE\n• "Make all shapes float" / "Animate data flow"\n• "Spin Speak to Paint" / "Stop animations"\n• "Export canvas to image" / "Save as SVG"\n• "Arrange all shapes in a circle"'
              ),
            },
          } as any)

          // Card 5: Bottom Sticky Note Tip
          editor.createShape({
            id: idCardNote,
            type: 'note',
            x: -100,
            y: 135,
            opacity: 0.16,
            props: {
              color: 'yellow',
              size: 's',
              font: 'draw',
              richText: toRichText(
                '💡 TRY COMPOUND COMMANDS:\n"Draw a cloud called CDN and connect it to Speak to Paint"'
              ),
            },
          } as any)

          createBoundArrow(editor, hubNode, cardDiagrams, {
            label: 'say "generate..."',
            bend: -18,
            color: 'light-blue',
            dash: 'draw',
            size: 'm',
            font: 'draw',
          })

          createBoundArrow(editor, hubNode, cardShapes, {
            label: 'say "draw / connect..."',
            bend: 18,
            color: 'green',
            dash: 'draw',
            size: 'm',
            font: 'draw',
          })

          createBoundArrow(editor, hubNode, cardStyles, {
            label: 'say "switch to..."',
            bend: 18,
            color: 'orange',
            dash: 'draw',
            size: 'm',
            font: 'draw',
          })

          createBoundArrow(editor, hubNode, cardArrange, {
            label: 'say "arrange / clear..."',
            bend: -18,
            color: 'blue',
            dash: 'draw',
            size: 'm',
            font: 'draw',
          })
        })

        editor.zoomToFit({ animation: { duration: 0 } })

        // Progressively bloom the watercolor washes across the onboarding chart on mount
        const initialNodes: {
          id: TLShapeId
          type: 'geo' | 'note'
          x: number
          y: number
          w: number
          h: number
          color: string
        }[] = [
          { ...hubNode, type: 'geo', color: 'violet' },
          { ...cardDiagrams, type: 'geo', color: 'light-blue' },
          { ...cardShapes, type: 'geo', color: 'green' },
          { ...cardStyles, type: 'geo', color: 'orange' },
          { ...cardArrange, type: 'geo', color: 'blue' },
          { id: idCardNote, type: 'note', x: -100, y: 135, w: 200, h: 200, color: 'yellow' },
        ]

        initialNodes.forEach((n, idx) => {
          setTimeout(() => {
            spawnWatercolorBloom(editor, n.x, n.y, n.w, n.h, n.color)
            animateWatercolorWashOnShape(editor, n.id, n.type, 'semi')
          }, 120 + idx * 140)
        })

        // Start a gentle ambient breathing float on the central hub after initial wash settles
        setTimeout(() => {
          if (editor.getShape(idHub)) {
            activeAnimationsRef.current.set(idHub, {
              shapeId: idHub,
              shapeType: 'geo',
              mode: 'float',
              speedMultiplier: 0.65,
              phaseOffset: 0,
              baseX: hubNode.x,
              baseY: hubNode.y,
              w: hubNode.w,
              h: hubNode.h,
              baseRotation: 0,
              baseOpacity: 0.94,
              color: 'violet',
            })
            setAnimStatus({ count: 1, mode: 'float' })
          }
        }, 1250)
      }
    },
    [spawnWatercolorBloom]
  )

  const hasLiveSpeech = liveWords.length > 0 || ghostWords.length > 0 || airTypingBuffer.length > 0
  const pulseScale = 1 + Math.min(0.45, micLevel * 3.2)

  return (
    <div
      className="zero-ui-stage"
      data-dark={activeTheme.isDark ? 'true' : 'false'}
      style={
        {
          '--canvas-bg': activeTheme.canvasBg,
          '--theme-accent': activeTheme.accentHex,
        } as React.CSSProperties
      }
    >
      <Tldraw hideUi onMount={handleMount} />

      {/* Live Expanding Watercolor Pigment Blooms (100% click-through) */}
      <div className="watercolor-bloom-layer" aria-hidden="true">
        {blooms.map((b) => (
          <React.Fragment key={b.id}>
            <div
              className="watercolor-bloom"
              style={
                {
                  left: `${b.x}px`,
                  top: `${b.y}px`,
                  width: `${b.w}px`,
                  height: `${b.h}px`,
                  '--bloom-color': b.colorHex,
                  '--bloom-edge': b.edgeHex,
                } as React.CSSProperties
              }
            />
            <div
              className="watercolor-ring"
              style={
                {
                  left: `${b.x}px`,
                  top: `${b.y}px`,
                  width: `${Math.round(b.w * 0.86)}px`,
                  height: `${Math.round(b.h * 0.86)}px`,
                  '--bloom-color': b.colorHex,
                } as React.CSSProperties
              }
            />
          </React.Fragment>
        ))}
      </div>

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
                <span className="exec-tag">PAINTED</span>
                <span className="exec-summary">{lastExecuted.summary}</span>
                <span className="exec-meta">
                  {(lastExecuted.confidence * 100).toFixed(0)}% · {lastExecuted.latencyMs}ms
                </span>
              </div>
            ) : (
              <div className="idle-prompt">
                Speak to paint — try <em>{AMBIENT_SUGGESTIONS[suggestionIdx]}</em>
              </div>
            )}

            {speculativeSummary && hasLiveSpeech && (
              <div className="speculative-line">
                <span className="spec-label">WET BRUSH PREVIEW</span> {speculativeSummary}
              </div>
            )}
          </div>

          <div className="model-telemetry">
            {animStatus && animStatus.count > 0 && (
              <span className="anim-chip">
                ✦ {animStatus.count} {animStatus.mode}
              </span>
            )}
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
