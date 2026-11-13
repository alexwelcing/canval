import {
  COMMAND_INTENTS,
  DESIGN_THEMES,
  LAYOUT_TEMPLATES,
  SHAPE_ARCHETYPES,
  type CommandIntentId,
  type DesignThemeSpec,
  type LayoutTemplateSpec,
  type ShapeArchetypeSpec,
  type TldrawColor,
  type TldrawDash,
  type TldrawFill,
  type TldrawFont,
  type TldrawSize,
} from './catalog'

export interface CanvasShapeSummary {
  id: string
  type: string
  geo?: string
  label: string
  x: number
  y: number
  w: number
  h: number
  color?: string
}

export interface SemanticScoresPayload {
  intentScores?: Record<string, number>
  themeScores?: Record<string, number>
  layoutScores?: Record<string, number>
  archetypeScores?: Record<string, number>
  targetScores?: Record<string, number>
  sourceTargetScores?: Record<string, number>
  destTargetScores?: Record<string, number>
  modelUsed?: string
  latencyMs?: number
}

export interface CanvasActionCommand {
  intent: CommandIntentId
  confidence: number
  utterance: string
  summary: string
  modelUsed: string
  latencyMs: number
  theme?: DesignThemeSpec
  layout?: {
    template: LayoutTemplateSpec
    topicTitle?: string
  }
  shape?: {
    archetype: ShapeArchetypeSpec
    label: string
    color?: TldrawColor
    fill?: TldrawFill
    dash?: TldrawDash
    font?: TldrawFont
    size?: TldrawSize
    positionHint?: 'center' | 'left' | 'right' | 'top' | 'bottom'
  }
  connection?: {
    fromQuery: string
    toQuery: string
    fromShapeId?: string
    toShapeId?: string
    fromLabel?: string
    toLabel?: string
    edgeLabel?: string
  }
  targetOp?: {
    targetQuery: string
    targetShapeId?: string
    targetLabel?: string
    secondTargetShapeId?: string
    secondTargetLabel?: string
    targetSimilarity?: number
    applyToAll?: boolean
    newLabel?: string
    color?: TldrawColor
    fill?: TldrawFill
    dash?: TldrawDash
    font?: TldrawFont
    size?: TldrawSize
    dx?: number
    dy?: number
    relativeToShapeId?: string
    relativePlacement?: 'above' | 'below' | 'left' | 'right'
    scaleFactor?: number
  }
  frameOp?: {
    frameLabel: string
    targetShapeIds?: string[]
  }
  alignment?: 'row' | 'column' | 'grid' | 'circle' | 'spread'
  cameraOp?: 'zoom_in' | 'zoom_out' | 'fit' | 'center' | 'pan_left' | 'pan_right' | 'pan_up' | 'pan_down'
  historyOp?: 'undo' | 'redo'
  exportFormat?: 'png' | 'svg' | 'jpeg' | 'webp'
  steps?: CanvasActionCommand[]
}

const COLOR_SYNONYMS: Record<string, TldrawColor> = {
  black: 'black',
  dark: 'black',
  charcoal: 'black',
  grey: 'grey',
  gray: 'grey',
  slate: 'grey',
  silver: 'grey',
  violet: 'violet',
  purple: 'violet',
  indigo: 'violet',
  magenta: 'light-violet',
  lavender: 'light-violet',
  'light violet': 'light-violet',
  'light purple': 'light-violet',
  blue: 'blue',
  cobalt: 'blue',
  navy: 'blue',
  cyan: 'light-blue',
  sky: 'light-blue',
  teal: 'light-blue',
  'light blue': 'light-blue',
  yellow: 'yellow',
  gold: 'yellow',
  amber: 'yellow',
  orange: 'orange',
  coral: 'orange',
  terracotta: 'orange',
  green: 'green',
  emerald: 'green',
  forest: 'green',
  mint: 'light-green',
  lime: 'light-green',
  sage: 'light-green',
  'light green': 'light-green',
  pink: 'light-red',
  rose: 'light-red',
  'light red': 'light-red',
  red: 'red',
  crimson: 'red',
  scarlet: 'red',
  white: 'white',
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function charTrigrams(text: string): Set<string> {
  const s = `  ${text.toLowerCase().trim()}  `
  const out = new Set<string>()
  for (let i = 0; i < s.length - 2; i++) {
    out.add(s.slice(i, i + 3))
  }
  return out
}

export function localSemanticSimilarity(query: string, doc: string): number {
  const qToks = tokenize(query)
  const dToks = new Set(tokenize(doc))
  if (qToks.length === 0 || dToks.size === 0) return 0

  let wordHits = 0
  for (const w of qToks) {
    if (dToks.has(w)) wordHits += 1
    else {
      for (const dw of dToks) {
        if (w.length >= 4 && dw.length >= 4 && (dw.startsWith(w.slice(0, 4)) || w.startsWith(dw.slice(0, 4)))) {
          wordHits += 0.65
          break
        }
      }
    }
  }
  const wordScore = wordHits / Math.sqrt(qToks.length * Math.min(dToks.size, 12))

  const qTri = charTrigrams(query)
  const dTri = charTrigrams(doc)
  let triOverlap = 0
  for (const t of qTri) {
    if (dTri.has(t)) triOverlap++
  }
  const triScore = triOverlap / Math.sqrt(qTri.size * dTri.size)
  return Math.min(1, wordScore * 0.72 + triScore * 0.28)
}

function extractSpokenColor(utterance: string): TldrawColor | undefined {
  const lower = utterance.toLowerCase()
  const multiWord = ['light blue', 'light green', 'light red', 'light violet', 'light purple']
  for (const mw of multiWord) {
    if (lower.includes(mw)) return COLOR_SYNONYMS[mw]
  }
  for (const w of tokenize(lower)) {
    if (COLOR_SYNONYMS[w]) return COLOR_SYNONYMS[w]
  }
  return undefined
}

function extractSpokenFill(utterance: string): TldrawFill | undefined {
  const lower = utterance.toLowerCase()
  if (/\b(solid|filled|opaque)\b/.test(lower)) return 'solid'
  if (/\b(pattern|hatched|striped|sketchy fill)\b/.test(lower)) return 'pattern'
  if (/\b(semi|translucent|soft fill|tinted)\b/.test(lower)) return 'semi'
  if (/\b(outline|hollow|transparent|no fill|unfilled)\b/.test(lower)) return 'none'
  return undefined
}

function extractSpokenDash(utterance: string): TldrawDash | undefined {
  const lower = utterance.toLowerCase()
  if (/\b(dashed|dash)\b/.test(lower)) return 'dashed'
  if (/\b(dotted|dots)\b/.test(lower)) return 'dotted'
  if (/\b(hand[- ]?drawn|sketch|sketchy|wobbly)\b/.test(lower)) return 'draw'
  if (/\b(solid line|crisp border)\b/.test(lower)) return 'solid'
  return undefined
}

function extractSpokenFont(utterance: string): TldrawFont | undefined {
  const lower = utterance.toLowerCase()
  if (/\b(mono|monospace|code|terminal|technical)\b/.test(lower)) return 'mono'
  if (/\b(serif|editorial|book|magazine)\b/.test(lower)) return 'serif'
  if (/\b(sans|clean|modern|swiss)\b/.test(lower)) return 'sans'
  if (/\b(handwriting|handwritten|marker|draw)\b/.test(lower)) return 'draw'
  return undefined
}

function extractSpokenSize(utterance: string): TldrawSize | undefined {
  const lower = utterance.toLowerCase()
  if (/\b(huge|giant|extra large|massive|xl|big title)\b/.test(lower)) return 'xl'
  if (/\b(large|big|bold)\b/.test(lower)) return 'l'
  if (/\b(small|tiny|compact|little)\b/.test(lower)) return 's'
  if (/\b(medium|normal)\b/.test(lower)) return 'm'
  return undefined
}

function extractPositionHint(utterance: string): 'center' | 'left' | 'right' | 'top' | 'bottom' | undefined {
  const lower = utterance.toLowerCase()
  if (/\b(in the middle|in the center|at the center|centered)\b/.test(lower)) return 'center'
  if (/\b(on the left|to the left|left side)\b/.test(lower)) return 'left'
  if (/\b(on the right|to the right|right side)\b/.test(lower)) return 'right'
  if (/\b(at the top|on top|top side|upper)\b/.test(lower)) return 'top'
  if (/\b(at the bottom|on the bottom|bottom side|lower)\b/.test(lower)) return 'bottom'
  return undefined
}

function formatLabelCase(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return 'Node'
  return trimmed
    .split(/\s+/)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

function extractCleanLabel(utterance: string, fallback: string): string {
  const explicitMatch = utterance.match(
    /\b(?:called|named|labeled|labelled|saying|that says|with text|titled|for|about)\s+["']?([^,.!?"]+)["']?/i
  )
  if (explicitMatch && explicitMatch[1]) {
    const cleaned = explicitMatch[1]
      .replace(/\b(in the center|in the middle|on the left|on the right|at the top|at the bottom)\b/gi, '')
      .trim()
    if (cleaned.length > 0) return formatLabelCase(cleaned)
  }

  const stripped = utterance
    .replace(
      /^(?:please\s+|hey\s+|can you\s+|let's\s+)?(?:draw|create|add|make|put|drop|place|write|type|spawn|throw|insert)\s+(?:a\s+|an\s+|the\s+)?/i,
      ''
    )
    .replace(
      /\b(?:blue|red|green|yellow|orange|violet|purple|cyan|pink|black|white|grey|gray|indigo|light-blue|light-green|light-red|light-violet|big|small|large|tiny|huge|solid|dashed|dotted|sticky)\b/gi,
      ' '
    )
    .replace(
      /\b(?:rectangle|box|card|square|circle|oval|ellipse|diamond|triangle|cloud|hexagon|star|trapezoid|rhombus|checkbox|check-box|heart|node|shape|sticky note|post-it|note|memo|title|heading|label|text|banner)\b/gi,
      ' '
    )
    .replace(/\b(?:in the center|in the middle|on the left|on the right|at the top|at the bottom|on the canvas|here)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (stripped.length >= 2) {
    return formatLabelCase(stripped)
  }
  return fallback
}

export function resolveBestTarget(
  query: string,
  shapes: CanvasShapeSummary[],
  embeddingScores?: Record<string, number>
): { shape?: CanvasShapeSummary; similarity: number } {
  if (!shapes.length || !query.trim()) return { similarity: 0 }
  let bestShape: CanvasShapeSummary | undefined
  let bestSim = -1

  for (const s of shapes) {
    const doc = `${s.label} ${s.geo ?? s.type} ${s.color ?? ''}`
    const localSim = localSemanticSimilarity(query, doc)
    const denseSim = embeddingScores?.[s.id]
    const combined = denseSim !== undefined ? denseSim * 0.72 + localSim * 0.28 : localSim
    if (combined > bestSim) {
      bestSim = combined
      bestShape = s
    }
  }
  return { shape: bestShape, similarity: Math.max(0, Number(bestSim.toFixed(3))) }
}

/**
 * Splits a multi-clause compound spoken command (e.g. "draw a blue cloud called CDN and connect it to the Stream Gateway")
 * into ordered atomic clauses while preserving conjunctions inside single commands (like "swap X and Y").
 */
export function splitCompoundUtterance(utterance: string): string[] {
  const clean = utterance.trim()
  if (!clean) return []
  // Do not split "swap X and Y" or "exchange X and Y"
  if (/^\s*(?:please\s+)?(?:swap|exchange|switch the positions of)\b/i.test(clean)) {
    return [clean]
  }
  const parts = clean
    .split(
      /\s*(?:;\s*|\bthen\s+|\band\s+then\s+|\band\s+(?=(?:draw|create|add|make|put|drop|connect|link|wire|point|switch|apply|change|color|move|shift|delete|remove|erase|duplicate|clone|rename|relabel|frame|wrap|align|arrange|distribute|focus|zoom|pan|harmonize|export|download|save|snapshot|undo|redo|clear)\b))/i
    )
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)

  return parts.length > 0 ? parts : [clean]
}

export function routeSingleClauseCommand(
  utterance: string,
  canvasShapes: CanvasShapeSummary[] = [],
  denseScores?: SemanticScoresPayload
): CanvasActionCommand {
  const t0 = performance.now()
  const clean = utterance.trim()
  const lower = clean.toLowerCase()

  const intentScores: Record<CommandIntentId, number> = {} as Record<CommandIntentId, number>
  for (const spec of COMMAND_INTENTS) {
    const corpusText = `${spec.title} ${spec.description} ${spec.exemplars.join(' ')}`
    const localSim = localSemanticSimilarity(clean, corpusText)
    const denseSim = denseScores?.intentScores?.[spec.id]
    intentScores[spec.id] = denseSim !== undefined ? denseSim * 0.75 + localSim * 0.25 : localSim
  }

  // Deterministic intent boosts for unambiguous spoken triggers
  if (
    /\b(export|download|save|snapshot|screenshot|capture)\b.*\b(canvas|diagram|image|png|svg|jpeg|jpg|webp|board|picture|photo)\b|\b(export|download)\s+(?:to|as)\s+(?:an?\s+)?(?:image|png|svg|jpeg|jpg|webp)\b|^export(?:\s+canvas)?$/i.test(
      lower
    )
  ) {
    intentScores.export_canvas += 0.88
  }
  if (/\b(clear|wipe|reset|erase)\b.*\b(canvas|everything|all|board)\b|^clear$|^reset canvas$/i.test(lower)) {
    intentScores.clear_canvas += 0.85
  }
  if (/\b(undo|step back|take that back|redo)\b/i.test(lower)) {
    intentScores.undo_redo += 0.85
  }
  if (/\b(zoom in|zoom out|fit|center view|reset zoom|see everything|pan left|pan right|pan up|pan down)\b/i.test(lower)) {
    intentScores.camera_control += 0.82
  }
  if (/\b(focus on|spotlight|zoom to|find the|locate the)\b/i.test(lower)) {
    intentScores.highlight_target += 0.84
  }
  if (/\b(swap|exchange|trade positions|switch the positions)\b/i.test(lower)) {
    intentScores.swap_positions += 0.86
  }
  if (/\b(duplicate|clone|make a copy of|copy the)\b/i.test(lower)) {
    intentScores.duplicate_target += 0.85
  }
  if (/\b(rename|relabel|change the text of|change the title of)\b.+\bto\b/i.test(lower)) {
    intentScores.rename_target += 0.86
  }
  if (/\b(frame all|wrap .* in a frame|enclose .* in a frame|create a frame around)\b/i.test(lower)) {
    intentScores.group_frame += 0.85
  }
  if (/\b(in a circle|radial ring|distribute .* evenly|space .* out)\b/i.test(lower)) {
    intentScores.distribute_shapes += 0.84
  }
  if (/\b(connect|link|arrow from|point|wire)\b.+\b(to|with|into)\b/i.test(lower)) {
    intentScores.connect_shapes += 0.82
  }
  if (/\b(sticky note|post-it|post it|memo|note saying|note about)\b/i.test(lower)) {
    intentScores.create_note += 0.78
  }
  if (/\b(title|heading|banner|text saying|write text|big label)\b/i.test(lower) && !/\brename\b/i.test(lower)) {
    intentScores.create_text += 0.74
  }
  if (
    /\b(architecture diagram|flowchart|flow chart|mind ?map|kanban|2x2|two by two|matrix|roadmap|timeline|diagram|pipeline|event[- ]?driven|mesh|c4|funnel|user journey|rag)\b/i.test(
      lower
    )
  ) {
    intentScores.generate_layout += 0.83
  }
  if (
    /\b(theme|aesthetic|vibe|palette|watercolor|aquarelle|blueprint|cyberpunk|neon|editorial|sketchbook|nordic|minimalist|botanical|forest|executive|bauhaus|tokyo midnight|solarized|dark mode|light mode)\b/i.test(
      lower
    ) &&
    !/\b(draw a|add a|create a)\s+(box|node|circle|rectangle|diamond)\b/i.test(lower)
  ) {
    intentScores.apply_theme += 0.8
  }
  if (/\b(harmonize|critique|vision align|polish the design|auto balance|visual harmony)\b/i.test(lower)) {
    intentScores.vision_harmonize += 0.86
  }
  if (/\b(delete|remove|erase|drop|get rid of)\b/i.test(lower) && !/\b(all|everything|canvas)\b/i.test(lower)) {
    intentScores.delete_target += 0.78
  }
  if (/\b(move|shift|nudge|drag|reposition|put the|place the)\b/i.test(lower)) {
    intentScores.move_target += 0.76
  }
  if (/\b(bigger|smaller|wider|taller|scale|resize|enlarge|shrink)\b/i.test(lower)) {
    intentScores.resize_target += 0.78
  }
  if (/\b(align|tidy|stack|organize|arrange .* in a (?:row|column|grid))\b/i.test(lower)) {
    intentScores.align_shapes += 0.78
  }
  if (
    /\b(color|recolor|change the .* to|make the .* (?:blue|red|green|yellow|orange|violet|purple|cyan|pink|white|black|grey|solid|dashed|dotted))\b/i.test(
      lower
    )
  ) {
    intentScores.style_target += 0.77
  }
  if (
    /\b(draw|create|add|put|drop|place|spawn)\b.*\b(box|rectangle|circle|oval|diamond|cloud|hexagon|star|triangle|trapezoid|rhombus|checkbox|heart|node|card|service|database|gateway|actor|shape)\b/i.test(
      lower
    )
  ) {
    intentScores.create_shape += 0.76
  }

  let bestIntent: CommandIntentId = 'create_shape'
  let bestScore = -1
  for (const spec of COMMAND_INTENTS) {
    const sc = intentScores[spec.id] ?? 0
    if (sc > bestScore) {
      bestScore = sc
      bestIntent = spec.id
    }
  }

  const confidence = Number(Math.min(0.99, Math.max(0.35, bestScore)).toFixed(3))
  const modelUsed = denseScores?.modelUsed ?? 'google/embeddinggemma-2 (hybrid-router)'
  const latencyMs = Number((denseScores?.latencyMs ?? performance.now() - t0).toFixed(1))

  if (bestIntent === 'apply_theme') {
    let bestTheme = DESIGN_THEMES[0]!
    let bestThemeScore = -1
    for (const th of DESIGN_THEMES) {
      const localSim = localSemanticSimilarity(clean, `${th.name} ${th.title} ${th.description}`)
      const denseSim = denseScores?.themeScores?.[th.id]
      const score = denseSim !== undefined ? denseSim * 0.75 + localSim * 0.25 : localSim
      if (score > bestThemeScore) {
        bestThemeScore = score
        bestTheme = th
      }
    }
    return {
      intent: 'apply_theme',
      confidence,
      utterance: clean,
      summary: `Applied "${bestTheme.name}" design system via EmbeddingGemma 2`,
      modelUsed,
      latencyMs,
      theme: bestTheme,
    }
  }

  if (bestIntent === 'generate_layout') {
    let bestLayout = LAYOUT_TEMPLATES[0]!
    let bestLayoutScore = -1
    for (const lt of LAYOUT_TEMPLATES) {
      const localSim = localSemanticSimilarity(clean, `${lt.name} ${lt.title} ${lt.description}`)
      const denseSim = denseScores?.layoutScores?.[lt.id]
      const score = denseSim !== undefined ? denseSim * 0.75 + localSim * 0.25 : localSim
      if (score > bestLayoutScore) {
        bestLayoutScore = score
        bestLayout = lt
      }
    }
    const topicMatch = clean.match(/\b(?:for|about|around|called|titled|on)\s+([^,.!?]+)/i)
    const topicTitle = topicMatch?.[1] ? formatLabelCase(topicMatch[1]) : undefined
    return {
      intent: 'generate_layout',
      confidence,
      utterance: clean,
      summary: `Generated ${bestLayout.name}${topicTitle ? ` (${topicTitle})` : ''}`,
      modelUsed,
      latencyMs,
      layout: {
        template: bestLayout,
        topicTitle,
      },
    }
  }

  if (bestIntent === 'connect_shapes') {
    const connMatch = clean.match(
      /\b(?:connect|link|wire|point|draw an? arrow from|arrow from)\s+(?:the\s+)?(.+?)\s+(?:to|with|into|towards)\s+(?:the\s+)?(.+)$/i
    )
    const fromQuery = connMatch?.[1]?.trim() || 'first node'
    const toQuery = connMatch?.[2]?.replace(/\bwith label\s+.+$/i, '').trim() || 'second node'
    const labelMatch = clean.match(/\b(?:labeled|saying|called|with label)\s+([^,.!?]+)/i)

    const resolvedFrom = resolveBestTarget(fromQuery, canvasShapes, denseScores?.sourceTargetScores)
    const remainingShapes = canvasShapes.filter((s) => s.id !== resolvedFrom.shape?.id)
    const resolvedTo = resolveBestTarget(
      toQuery,
      remainingShapes.length ? remainingShapes : canvasShapes,
      denseScores?.destTargetScores
    )

    return {
      intent: 'connect_shapes',
      confidence,
      utterance: clean,
      summary: `Connected "${resolvedFrom.shape?.label ?? formatLabelCase(fromQuery)}" → "${resolvedTo.shape?.label ?? formatLabelCase(toQuery)}"`,
      modelUsed,
      latencyMs,
      connection: {
        fromQuery,
        toQuery,
        fromShapeId: resolvedFrom.shape?.id,
        toShapeId: resolvedTo.shape?.id,
        fromLabel: resolvedFrom.shape?.label ?? formatLabelCase(fromQuery),
        toLabel: resolvedTo.shape?.label ?? formatLabelCase(toQuery),
        edgeLabel: labelMatch?.[1]?.trim(),
      },
    }
  }

  if (bestIntent === 'create_note' || bestIntent === 'create_text' || bestIntent === 'create_shape') {
    let bestArch = SHAPE_ARCHETYPES[0]!
    if (bestIntent === 'create_note') {
      bestArch = SHAPE_ARCHETYPES.find((a) => a.id === 'sticky-note') ?? SHAPE_ARCHETYPES[0]!
    } else {
      let bestArchScore = -1
      for (const arch of SHAPE_ARCHETYPES) {
        if (arch.kind === 'note') continue
        const localSim = localSemanticSimilarity(clean, `${arch.title} ${arch.description} ${arch.geo ?? ''}`)
        const denseSim = denseScores?.archetypeScores?.[arch.id]
        const score = denseSim !== undefined ? denseSim * 0.75 + localSim * 0.25 : localSim
        if (score > bestArchScore) {
          bestArchScore = score
          bestArch = arch
        }
      }
      if (/\b(cloud)\b/i.test(lower)) bestArch = SHAPE_ARCHETYPES.find((a) => a.geo === 'cloud') ?? bestArch
      else if (/\b(diamond|decision)\b/i.test(lower)) bestArch = SHAPE_ARCHETYPES.find((a) => a.geo === 'diamond') ?? bestArch
      else if (/\b(circle|ellipse|round)\b/i.test(lower)) bestArch = SHAPE_ARCHETYPES.find((a) => a.geo === 'ellipse') ?? bestArch
      else if (/\b(database|storage|postgres|redis|sql|oval)\b/i.test(lower))
        bestArch = SHAPE_ARCHETYPES.find((a) => a.id === 'database-node') ?? bestArch
      else if (/\b(hexagon|engine|model)\b/i.test(lower)) bestArch = SHAPE_ARCHETYPES.find((a) => a.geo === 'hexagon') ?? bestArch
      else if (/\b(star|milestone)\b/i.test(lower)) bestArch = SHAPE_ARCHETYPES.find((a) => a.geo === 'star') ?? bestArch
      else if (/\b(triangle|warning|alert)\b/i.test(lower)) bestArch = SHAPE_ARCHETYPES.find((a) => a.geo === 'triangle') ?? bestArch
      else if (/\b(checkbox|check-box|check)\b/i.test(lower)) bestArch = SHAPE_ARCHETYPES.find((a) => a.geo === 'check-box') ?? bestArch
      else if (/\b(heart|delight|favorite)\b/i.test(lower)) bestArch = SHAPE_ARCHETYPES.find((a) => a.geo === 'heart') ?? bestArch
    }

    const label = extractCleanLabel(
      clean,
      bestIntent === 'create_note' ? 'Quick Note' : bestArch.title.split('/')[0]!.trim()
    )
    const color = extractSpokenColor(clean) ?? bestArch.defaultColor
    const fill = extractSpokenFill(clean) ?? bestArch.defaultFill
    const dash = extractSpokenDash(clean)
    const font = extractSpokenFont(clean)
    const size = extractSpokenSize(clean)
    const positionHint = extractPositionHint(clean)

    return {
      intent: bestIntent,
      confidence,
      utterance: clean,
      summary:
        bestIntent === 'create_note'
          ? `Added sticky note "${label}"`
          : bestIntent === 'create_text'
            ? `Added heading "${label}"`
            : `Created ${bestArch.geo ?? bestArch.kind} "${label}" (${color})`,
      modelUsed,
      latencyMs,
      shape: {
        archetype: bestArch,
        label,
        color,
        fill,
        dash,
        font,
        size,
        positionHint,
      },
    }
  }

  if (bestIntent === 'rename_target') {
    const m = clean.match(/\b(?:rename|relabel|change the (?:text|title|label) of)\s+(?:the\s+)?(.+?)\s+to\s+["']?([^,.!?"]+)["']?$/i)
    const targetQuery = m?.[1]?.trim() || clean
    const newLabel = m?.[2] ? formatLabelCase(m[2]) : 'Updated Node'
    const resolved = resolveBestTarget(targetQuery, canvasShapes, denseScores?.targetScores)
    return {
      intent: 'rename_target',
      confidence,
      utterance: clean,
      summary: `Renamed "${resolved.shape?.label ?? targetQuery}" → "${newLabel}"`,
      modelUsed,
      latencyMs,
      targetOp: {
        targetQuery,
        targetShapeId: resolved.shape?.id,
        targetLabel: resolved.shape?.label,
        targetSimilarity: resolved.similarity,
        newLabel,
      },
    }
  }

  if (bestIntent === 'duplicate_target') {
    const targetQuery = clean.replace(/^(?:please\s+)?(?:duplicate|clone|make a copy of|copy)\s+(?:the\s+)?/i, '').trim()
    const resolved = resolveBestTarget(targetQuery || clean, canvasShapes, denseScores?.targetScores)
    return {
      intent: 'duplicate_target',
      confidence,
      utterance: clean,
      summary: `Duplicated "${resolved.shape?.label ?? 'latest shape'}"`,
      modelUsed,
      latencyMs,
      targetOp: {
        targetQuery: targetQuery || clean,
        targetShapeId: resolved.shape?.id,
        targetLabel: resolved.shape?.label,
        targetSimilarity: resolved.similarity,
      },
    }
  }

  if (bestIntent === 'highlight_target') {
    const targetQuery = clean
      .replace(/^(?:please\s+)?(?:focus on|spotlight|zoom to|find|locate)\s+(?:the\s+)?/i, '')
      .trim()
    const resolved = resolveBestTarget(targetQuery || clean, canvasShapes, denseScores?.targetScores)
    return {
      intent: 'highlight_target',
      confidence,
      utterance: clean,
      summary: `Focused camera on "${resolved.shape?.label ?? targetQuery}"`,
      modelUsed,
      latencyMs,
      targetOp: {
        targetQuery: targetQuery || clean,
        targetShapeId: resolved.shape?.id,
        targetLabel: resolved.shape?.label,
        targetSimilarity: resolved.similarity,
      },
    }
  }

  if (bestIntent === 'swap_positions') {
    const m = clean.match(
      /\b(?:swap|exchange|trade positions of|switch the positions of)\s+(?:the\s+)?(.+?)\s+(?:and|with)\s+(?:the\s+)?(.+)$/i
    )
    const q1 = m?.[1]?.trim() || clean
    const q2 = m?.[2]?.trim() || clean
    const r1 = resolveBestTarget(q1, canvasShapes, denseScores?.sourceTargetScores)
    const rem = canvasShapes.filter((s) => s.id !== r1.shape?.id)
    const r2 = resolveBestTarget(q2, rem.length ? rem : canvasShapes, denseScores?.destTargetScores)
    return {
      intent: 'swap_positions',
      confidence,
      utterance: clean,
      summary: `Swapped "${r1.shape?.label ?? q1}" ↔ "${r2.shape?.label ?? q2}"`,
      modelUsed,
      latencyMs,
      targetOp: {
        targetQuery: q1,
        targetShapeId: r1.shape?.id,
        targetLabel: r1.shape?.label,
        secondTargetShapeId: r2.shape?.id,
        secondTargetLabel: r2.shape?.label,
      },
    }
  }

  if (bestIntent === 'group_frame') {
    const m = clean.match(/\b(?:as|called|named|titled)\s+["']?([^,.!?"]+)["']?$/i)
    const frameLabel = m?.[1] ? formatLabelCase(m[1]) : 'Subsystem Cluster'
    return {
      intent: 'group_frame',
      confidence,
      utterance: clean,
      summary: `Enclosed shapes in frame "${frameLabel}"`,
      modelUsed,
      latencyMs,
      frameOp: {
        frameLabel,
      },
    }
  }

  if (bestIntent === 'distribute_shapes') {
    const mode: 'circle' | 'spread' = /\b(circle|ring|radial)\b/i.test(lower) ? 'circle' : 'spread'
    return {
      intent: 'distribute_shapes',
      confidence,
      utterance: clean,
      summary: mode === 'circle' ? 'Arranged shapes into a radial ring' : 'Distributed shapes with generous spacing',
      modelUsed,
      latencyMs,
      alignment: mode,
    }
  }

  if (
    bestIntent === 'style_target' ||
    bestIntent === 'move_target' ||
    bestIntent === 'resize_target' ||
    bestIntent === 'delete_target'
  ) {
    const applyToAll = /\b(all shapes|everything|every node|all nodes|every shape)\b/i.test(lower)

    // Check for relative placement in move_target: "put X below Y" / "move X above Y" / "place X to the right of Y"
    let relativeToShapeId: string | undefined
    let relativePlacement: 'above' | 'below' | 'left' | 'right' | undefined
    let targetQuery = clean

    if (bestIntent === 'move_target') {
      const relMatch = clean.match(
        /\b(?:move|put|place|shift|position)\s+(?:the\s+)?(.+?)\s+(above|below|under|beneath|to the left of|to the right of|left of|right of)\s+(?:the\s+)?(.+)$/i
      )
      if (relMatch && relMatch[1] && relMatch[2] && relMatch[3]) {
        targetQuery = relMatch[1].trim()
        const relDir = relMatch[2].toLowerCase()
        const anchorQuery = relMatch[3].trim()
        const anchorResolved = resolveBestTarget(anchorQuery, canvasShapes)
        relativeToShapeId = anchorResolved.shape?.id
        if (relDir.includes('above')) relativePlacement = 'above'
        else if (relDir.includes('below') || relDir.includes('under') || relDir.includes('beneath'))
          relativePlacement = 'below'
        else if (relDir.includes('left')) relativePlacement = 'left'
        else relativePlacement = 'right'
      }
    }

    const resolved = resolveBestTarget(targetQuery, canvasShapes, denseScores?.targetScores)

    let dx = 0
    let dy = 0
    if (bestIntent === 'move_target' && !relativeToShapeId) {
      if (/\b(left)\b/i.test(lower)) dx = -240
      if (/\b(right)\b/i.test(lower)) dx = 240
      if (/\b(up|higher|above)\b/i.test(lower)) dy = -190
      if (/\b(down|lower|below)\b/i.test(lower)) dy = 190
      if (dx === 0 && dy === 0) dx = 200
    }

    let scaleFactor = 1.0
    if (bestIntent === 'resize_target') {
      scaleFactor = /\b(smaller|tiny|shrink|compact|down)\b/i.test(lower) ? 0.74 : 1.36
    }

    return {
      intent: bestIntent,
      confidence,
      utterance: clean,
      summary: `${bestIntent.replace('_target', '').toUpperCase()} → ${
        applyToAll ? 'all shapes' : resolved.shape?.label ?? 'latest shape'
      }`,
      modelUsed,
      latencyMs,
      targetOp: {
        targetQuery,
        targetShapeId: resolved.shape?.id,
        targetLabel: resolved.shape?.label,
        targetSimilarity: resolved.similarity,
        applyToAll,
        color: extractSpokenColor(clean),
        fill: extractSpokenFill(clean),
        dash: extractSpokenDash(clean),
        font: extractSpokenFont(clean),
        size: extractSpokenSize(clean),
        dx,
        dy,
        relativeToShapeId,
        relativePlacement,
        scaleFactor,
      },
    }
  }

  if (bestIntent === 'align_shapes') {
    const alignment: 'row' | 'column' | 'grid' = /\b(vertical|column|stack)\b/i.test(lower)
      ? 'column'
      : /\b(row|horizontal|line)\b/i.test(lower)
        ? 'row'
        : 'grid'
    return {
      intent: 'align_shapes',
      confidence,
      utterance: clean,
      summary: `Aligned canvas shapes into a clean ${alignment}`,
      modelUsed,
      latencyMs,
      alignment,
    }
  }

  if (bestIntent === 'camera_control') {
    const cameraOp = /\b(zoom in|closer)\b/i.test(lower)
      ? 'zoom_in'
      : /\b(zoom out|further|back)\b/i.test(lower)
        ? 'zoom_out'
        : /\b(pan left)\b/i.test(lower)
          ? 'pan_left'
          : /\b(pan right)\b/i.test(lower)
            ? 'pan_right'
            : /\b(pan up)\b/i.test(lower)
              ? 'pan_up'
              : /\b(pan down)\b/i.test(lower)
                ? 'pan_down'
                : /\b(center)\b/i.test(lower)
                  ? 'center'
                  : 'fit'
    return {
      intent: 'camera_control',
      confidence,
      utterance: clean,
      summary: `Camera → ${cameraOp.replace('_', ' ')}`,
      modelUsed,
      latencyMs,
      cameraOp,
    }
  }

  if (bestIntent === 'undo_redo') {
    const historyOp = /\b(redo)\b/i.test(lower) ? 'redo' : 'undo'
    return {
      intent: 'undo_redo',
      confidence,
      utterance: clean,
      summary: `${historyOp === 'redo' ? 'Redid' : 'Undid'} canvas action`,
      modelUsed,
      latencyMs,
      historyOp,
    }
  }

  if (bestIntent === 'vision_harmonize') {
    return {
      intent: 'vision_harmonize',
      confidence,
      utterance: clean,
      summary: 'Harmonizing canvas design via EmbeddingGemma 2 Vision-Text alignment',
      modelUsed,
      latencyMs,
    }
  }

  if (bestIntent === 'export_canvas') {
    const exportFormat: 'png' | 'svg' | 'jpeg' | 'webp' = /\bsvg\b/i.test(lower)
      ? 'svg'
      : /\b(jpe?g)\b/i.test(lower)
        ? 'jpeg'
        : /\bwebp\b/i.test(lower)
          ? 'webp'
          : 'png'
    return {
      intent: 'export_canvas',
      confidence,
      utterance: clean,
      summary: `Exported canvas diagram to ${exportFormat.toUpperCase()} image`,
      modelUsed,
      latencyMs,
      exportFormat,
    }
  }

  return {
    intent: 'clear_canvas',
    confidence,
    utterance: clean,
    summary: 'Cleared entire canvas',
    modelUsed,
    latencyMs,
  }
}

/**
 * Routes single or multi-clause compound utterances with anaphora ("it", "that") resolution across clauses.
 */
export function routeVoiceCommand(
  utterance: string,
  canvasShapes: CanvasShapeSummary[] = [],
  denseScores?: SemanticScoresPayload
): CanvasActionCommand {
  const clauses = splitCompoundUtterance(utterance)
  if (clauses.length <= 1) {
    return routeSingleClauseCommand(utterance, canvasShapes, denseScores)
  }

  const workingShapes = [...canvasShapes]
  const steps: CanvasActionCommand[] = []
  let lastCreatedLabel: string | undefined

  for (let i = 0; i < clauses.length; i++) {
    let clause = clauses[i]!
    if (lastCreatedLabel) {
      clause = clause
        .replace(/\b(connect|link|wire|point|move|color|make|scale|resize|rename)\s+(it|that|the new node|the new box)\b/gi, `$1 ${lastCreatedLabel}`)
        .replace(/\bto\s+(it|that|the new node|the new box)\b/gi, `to ${lastCreatedLabel}`)
    }

    const stepCmd = routeSingleClauseCommand(clause, workingShapes, i === 0 ? denseScores : undefined)
    steps.push(stepCmd)

    if (
      (stepCmd.intent === 'create_shape' || stepCmd.intent === 'create_note' || stepCmd.intent === 'create_text') &&
      stepCmd.shape
    ) {
      lastCreatedLabel = stepCmd.shape.label
      workingShapes.push({
        id: `__virtual_${i}`,
        type: stepCmd.shape.archetype.kind,
        geo: stepCmd.shape.archetype.geo,
        label: stepCmd.shape.label,
        x: 0,
        y: 0,
        w: stepCmd.shape.archetype.width,
        h: stepCmd.shape.archetype.height,
        color: stepCmd.shape.color,
      })
    }
  }

  const primary = steps[0]!
  return {
    ...primary,
    utterance: utterance.trim(),
    summary: steps.map((s) => s.summary).join(' · '),
    steps,
  }
}
