import type { BlueprintKind, CatalogAnimationKind } from '../design/catalog';
import type {
  CanvasRegisterSnapshot,
  CanvasShapeSummary,
  CanvasSyscall,
  SemanticResolution,
  SpatialAnchor,
  SpatialRelation,
} from '../types/protocol';
import {
  hasExplicitClearConsent,
  hasExplicitDeleteConsent,
  hasExplicitUndoConsent,
  isPureFillerOrNoise,
  parseVoiceSlots,
  splitCompoundClauses,
} from './slotParser.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function serializeRegisterState(snapshot: CanvasRegisterSnapshot): string {
  if (snapshot.shapes.length === 0) {
    return `REG:[] FOCUS:[] THEME:${snapshot.editionId}`;
  }
  const items = snapshot.shapes.slice(-12).map((s) => {
    const flags = [s.anim ? `~${s.anim}` : '', s.locked ? '!' : ''].filter(Boolean).join('');
    return `${s.reg}:${s.shapeType}"${s.label}"(${s.color})@${s.x},${s.y}${flags}`;
  });
  return `REG:[${items.join(' ')}] FOCUS:[${snapshot.focusRegs.join(',')}] ANIMS:${snapshot.activeAnimations}`;
}

/**
 * Compact ~110-token prompt for Qwen2.5-0.5B-Instruct (3.5x faster prefill than verbose ChatML).
 */
export function buildStateComputerMessages(
  snapshot: CanvasRegisterSnapshot,
  voiceText: string,
): ChatMessage[] {
  const regDump = serializeRegisterState(snapshot);
  return [
    {
      role: 'system',
      content:
        'Canvas State Computer. Emit ONE RISC opcode: NOOP | SPAWN | LAYOUT <kind> | MOVE <reg|ALL|FOCUS> <left|right|up|down|center> | ' +
        'PLACE <reg> <above|below|left-of|right-of> <refReg> | SWAP <regA> <regB> | ' +
        'ANIM <reg|ALL|FOCUS> <orbit|float|pulse|spin|bounce|wiggle|pendulum|figure8|drift> [refReg] | ' +
        'STOP <reg|ALL> | CONNECT <regA> <regB> | COLOR <reg|ALL> <color> | SCALE <reg> <up|down> | ' +
        'ROTATE <reg> <deg> | ALIGN <mode> | FRAME <label> | DEL <reg> | CLEAR | THEME | HARMONIZE | UNDO | REDO. ' +
        'NEVER emit DEL/CLEAR/UNDO unless explicitly requested.',
    },
    {
      role: 'user',
      content: 'REG:[s1:ellipse"Sun"(yellow)@0,0 s2:ellipse"Earth"(blue)@180,0] FOCUS:[s2] ANIMS:0\nCMD:make earth orbit around sun',
    },
    { role: 'assistant', content: 'ANIM s2 orbit s1' },
    {
      role: 'user',
      content: 'REG:[s1:hexagon"Gateway"(black)@0,0 s2:trapezoid"DB"(violet)@200,0] FOCUS:[s2] ANIMS:0\nCMD:put DB above Gateway',
    },
    { role: 'assistant', content: 'PLACE s2 above s1' },
    {
      role: 'user',
      content: `${regDump}\nCMD:${voiceText.trim()}`,
    },
  ];
}

const SHAPE_SYNONYMS: Record<string, string[]> = {
  rectangle: ['box', 'rectangle', 'card', 'square', 'block', 'panel'],
  ellipse: ['circle', 'orb', 'sphere', 'ball', 'round', 'dot', 'moon', 'sun', 'planet'],
  oval: ['pill', 'oval', 'capsule', 'badge', 'button'],
  diamond: ['diamond', 'decision', 'router'],
  rhombus: ['parallelogram', 'rhombus', 'queue', 'buffer'],
  hexagon: ['hexagon', 'hex', 'polygon', 'engine', 'microservice'],
  octagon: ['octagon', 'firewall', 'stop'],
  pentagon: ['pentagon', 'shield', 'crest'],
  trapezoid: ['trapezoid', 'database', 'storage', 'bucket'],
  cloud: ['cloud', 'cdn', 'internet'],
  triangle: ['triangle', 'pyramid'],
  star: ['star', 'spark'],
  heart: ['heart'],
  'arrow-right': ['chevron', 'banner'],
  'check-box': ['checkbox', 'todo'],
  'x-box': ['blocker'],
  note: ['note', 'sticky', 'memo', 'post-it', 'post it'],
  text: ['text', 'title', 'heading', 'label', 'caption'],
  frame: ['frame', 'artboard'],
  draw: ['sketch', 'wave', 'spiral', 'stroke', 'ink', 'underline', 'checkmark'],
  line: ['line', 'spline', 'divider', 'curve'],
  group: ['group', 'cluster'],
};

const VALID_BLUEPRINTS = new Set<BlueprintKind>([
  'architecture',
  'flowchart',
  'mindmap',
  'kanban',
  'quadrant',
  'timeline',
  'bento',
  'cycle',
  'tree',
  'venn',
  'funnel',
  'neural',
  'orbit_system',
  'wireframe',
  'state_machine',
  'layers',
  'comparison',
  'sequence',
  'table',
  'journey',
  'er_schema',
  'row',
  'column',
]);

export function resolveRegisterTargets(
  rawText: string,
  snapshot: CanvasRegisterSnapshot,
  res: SemanticResolution,
  qwenToken?: string | null,
): string[] {
  const lower = rawText.toLowerCase();
  const shapes = snapshot.shapes;
  if (shapes.length === 0) return [];

  if (
    qwenToken === 'ALL' ||
    /\b(all(?:\s+of\s+them|\s+shapes|\s+cards|\s+nodes)?|everything|every\s+shape|everybody|whole\s+thing)\b/i.test(
      lower,
    )
  ) {
    return ['ALL'];
  }

  if (/\b(leftmost|furthest\s+left)\b/.test(lower)) {
    const sorted = [...shapes].sort((a, b) => a.x - b.x);
    return [sorted[0].reg];
  }
  if (/\b(rightmost|furthest\s+right)\b/.test(lower)) {
    const sorted = [...shapes].sort((a, b) => b.x - a.x);
    return [sorted[0].reg];
  }
  if (/\b(topmost|highest\s+shape)\b/.test(lower)) {
    const sorted = [...shapes].sort((a, b) => a.y - b.y);
    return [sorted[0].reg];
  }
  if (/\b(bottommost|lowest\s+shape)\b/.test(lower)) {
    const sorted = [...shapes].sort((a, b) => b.y - a.y);
    return [sorted[0].reg];
  }
  if (/\bfirst\s+(?:shape|box|card|circle|one|element)\b/.test(lower)) {
    return [shapes[0].reg];
  }
  if (/\blast\s+(?:shape|box|card|circle|one|element)\b/.test(lower)) {
    return [shapes[shapes.length - 1].reg];
  }

  const labelHits = shapes.filter((s) => {
    const lbl = s.label.trim().toLowerCase();
    return lbl.length >= 2 && lower.includes(lbl);
  });
  if (labelHits.length > 0) {
    return labelHits.map((s) => s.reg);
  }

  let candidates = shapes;
  const slots = parseVoiceSlots(rawText);
  const colorFilter = slots.explicitColor ?? (res.color && res.colorScore >= 0.62 ? res.color : null);
  if (colorFilter && !/\b(make|paint|turn|color|tint)\b/.test(lower)) {
    const byCol = candidates.filter((s) => s.color === colorFilter || s.color.includes(colorFilter));
    if (byCol.length > 0) candidates = byCol;
  }

  let matchedByGeo = false;
  for (const [shapeKey, words] of Object.entries(SHAPE_SYNONYMS)) {
    if (words.some((w) => new RegExp(`\\b${w}s?\\b`, 'i').test(lower))) {
      const byGeo = candidates.filter((s) => s.shapeType === shapeKey);
      if (byGeo.length > 0) {
        candidates = byGeo;
        matchedByGeo = true;
        break;
      }
    }
  }
  if (matchedByGeo || candidates.length < shapes.length) {
    return candidates.map((s) => s.reg);
  }

  if (qwenToken && /^s\d+$/i.test(qwenToken)) {
    const found = shapes.find((s) => s.reg.toLowerCase() === qwenToken.toLowerCase());
    if (found) return [found.reg];
  }

  if (res.sourceMatch && res.sourceMatch.score >= 0.58) {
    return [res.sourceMatch.reg];
  }
  if (res.matchedShapes[0] && res.matchedShapes[0].score >= 0.62) {
    return [res.matchedShapes[0].reg];
  }

  if (snapshot.focusRegs.length > 0) {
    return snapshot.focusRegs;
  }
  return [shapes[shapes.length - 1].reg];
}

function resolvePairRegisters(
  snapshot: CanvasRegisterSnapshot,
  res: SemanticResolution,
  rawClauseText: string,
  qwenA?: string | null,
  qwenB?: string | null,
): { regA: string; regB: string } | null {
  const shapes = snapshot.shapes;
  if (shapes.length < 2) return null;

  const findByHint = (hint?: string | null): CanvasShapeSummary | undefined => {
    if (!hint) return undefined;
    const h = hint.toLowerCase();
    const byLbl = shapes.find((s) => s.label.trim().length >= 2 && h.includes(s.label.trim().toLowerCase()));
    if (byLbl) return byLbl;
    for (const [shapeKey, words] of Object.entries(SHAPE_SYNONYMS)) {
      if (words.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(h))) {
        const hit = shapes.find((s) => s.shapeType === shapeKey);
        if (hit) return hit;
      }
    }
    return undefined;
  };

  const slots = parseVoiceSlots(rawClauseText);
  let a = findByHint(slots.sourceHint)?.reg ?? res.sourceMatch?.reg ?? null;
  let b = findByHint(slots.targetHint)?.reg ?? res.targetMatch?.reg ?? null;

  if (!a && qwenA && /^s\d+$/i.test(qwenA) && shapes.some((s) => s.reg === qwenA)) a = qwenA;
  if (!b && qwenB && /^s\d+$/i.test(qwenB) && shapes.some((s) => s.reg === qwenB)) b = qwenB;

  if (!a) a = snapshot.focusRegs[0] ?? shapes[shapes.length - 1].reg;
  if (!b || b === a) {
    const other = shapes.find((s) => s.reg !== a);
    if (!other) return null;
    b = other.reg;
  }
  return { regA: a, regB: b };
}

/**
 * Compiles a single atomic utterance/clause into a verified CanvasSyscall.
 */
export function compileVerifiedSyscall(
  rawOpcodeLine: string | null,
  snapshot: CanvasRegisterSnapshot,
  res: SemanticResolution,
  clauseOverrideText?: string,
): { opcodeLine: string; syscall: CanvasSyscall } {
  const clauseText = clauseOverrideText ?? res.rawText;
  const isSubClause = Boolean(clauseOverrideText && clauseOverrideText !== res.rawText);

  if (isPureFillerOrNoise(clauseText, isSubClause ? [] : res.words)) {
    return {
      opcodeLine: 'NOOP (acoustic-filler)',
      syscall: { op: 'NOOP', reason: 'Filtered ambient filler' },
    };
  }

  const slots = parseVoiceSlots(clauseText, isSubClause ? '' : res.ghostText);
  const cleanLine = (rawOpcodeLine ?? '')
    .replace(/^(OUT:|STATE:|CMD:)\s*/i, '')
    .split('\n')[0]
    .trim();
  const parts = cleanLine.split(/\s+/).filter(Boolean);
  const head = (parts[0] ?? '').toUpperCase();

  // 1. Tempo adjustments on active animations ("faster", "slower", "reverse")
  if (
    snapshot.activeAnimations > 0 &&
    (slots.tempoMultiplier !== null || slots.reverseAnimation) &&
    !slots.animationKind &&
    !/\b(draw|create|add|move|scale|bigger|smaller)\b/i.test(slots.cleanText)
  ) {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    return {
      opcodeLine: `TEMPO ${targets.join(',')} x${slots.tempoMultiplier ?? 1}`,
      syscall: {
        op: 'TEMPO',
        targets,
        multiplier: slots.tempoMultiplier ?? 1,
        reverse: slots.reverseAnimation,
      },
    };
  }

  // In a multi-clause sentence, rely on each sub-clause's lexical intent first so clauses don't bleed into one another!
  const effectiveIntent = slots.lexicalIntent ?? (isSubClause ? 'create_shape' : res.intentKind);

  // STUDIO GUIDE ("what can I say", "show voice commands", "studio guide")
  if (
    head === 'GUIDE' ||
    slots.studioGuide ||
    (effectiveIntent === 'studio_guide' &&
      /\b(help|guide|commands?|what\s+can|examples?|how\s+do\s+i)\b/i.test(clauseText))
  ) {
    return {
      opcodeLine: 'STUDIO_GUIDE',
      syscall: { op: 'STUDIO_GUIDE' },
    };
  }

  // EXPORT CANVAS (PNG, SVG, Clipboard, JSON)
  if (
    head === 'EXPORT' ||
    slots.exportFormat !== null ||
    (effectiveIntent === 'export_canvas' &&
      /\b(export|download|save|snapshot|screenshot|copy\s+(?:image|canvas|diagram))\b/i.test(
        clauseText,
      ))
  ) {
    const fmt = slots.exportFormat ?? 'png';
    return {
      opcodeLine: `EXPORT ${fmt}${slots.exportSelectionOnly ? ' (selected)' : ''}`,
      syscall: {
        op: 'EXPORT',
        format: fmt,
        selectionOnly: slots.exportSelectionOnly,
      },
    };
  }

  // MULTI-PAGE MANAGEMENT ("new page called Wireframe", "next page", "duplicate page")
  if (
    head === 'PAGE' ||
    slots.pageAction !== null ||
    (effectiveIntent === 'manage_page' && /\b(page|slide)\b/i.test(clauseText))
  ) {
    const action = slots.pageAction ?? 'new';
    return {
      opcodeLine: `PAGE ${action}${slots.pageName ? ` "${slots.pageName}"` : slots.pageNumber ? ` #${slots.pageNumber}` : ''}`,
      syscall: {
        op: 'PAGE',
        action,
        name: slots.pageName,
        pageNumber: slots.pageNumber,
      },
    };
  }

  // NATIVE TLDRAW TOOL SWITCHING ("pen mode", "red highlighter", "laser pointer", "select mode")
  if (
    head === 'TOOL' ||
    slots.toolSwitch !== null ||
    (effectiveIntent === 'switch_tool' &&
      /\b(tool|mode|pen|marker|highlighter|laser|eraser|pointer|hand)\b/i.test(clauseText))
  ) {
    const tool = slots.toolSwitch ?? 'draw';
    return {
      opcodeLine: `TOOL ${tool}${slots.explicitColor ? ` (${slots.explicitColor})` : ''}`,
      syscall: {
        op: 'TOOL',
        tool,
        color: slots.explicitColor,
        size: slots.sizeOverride,
        dash: slots.dashOverride,
      },
    };
  }

  // ARCHITECTURAL GRID & MAGNETIC SNAP
  if (
    head === 'GRID' ||
    slots.gridMode !== null ||
    slots.snapMode !== null ||
    (effectiveIntent === 'toggle_grid_snap' && /\b(grid|snap|snapping)\b/i.test(clauseText))
  ) {
    const fallbackGrid =
      slots.gridMode === null && slots.snapMode === null
        ? !/\b(hide|off|disable)\b/i.test(clauseText)
        : slots.gridMode;
    return {
      opcodeLine: `GRID grid=${fallbackGrid ?? 'keep'} snap=${slots.snapMode ?? 'keep'}`,
      syscall: {
        op: 'GRID',
        gridMode: fallbackGrid,
        snapMode: slots.snapMode,
      },
    };
  }

  // APPEND BULLET / LINE TO EXISTING RICH-TEXT SHAPE
  if (
    head === 'APPEND' ||
    slots.appendText !== null ||
    (effectiveIntent === 'append_text' && /\b(append|add\s+(?:bullet|item|line))\b/i.test(clauseText))
  ) {
    const targets = slots.appendTargetHint
      ? resolveRegisterTargets(slots.appendTargetHint, snapshot, res, parts[1])
      : snapshot.focusRegs.length > 0
        ? snapshot.focusRegs
        : resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    return {
      opcodeLine: `APPEND ${targets.join(',') || 'FOCUS'} "${slots.appendText ?? ''}"`,
      syscall: {
        op: 'APPEND_TEXT',
        targets: targets.length > 0 ? targets : ['FOCUS'],
        targetLabelHint: slots.appendTargetHint,
        text: slots.appendText ?? slots.singleLabel ?? 'New item',
        asBullet: !/\bline\b/i.test(clauseText),
      },
    };
  }

  // RICH-TEXT STRUCTURED CARDS (bullet lists, numbered lists, checklists, code cards)
  if (
    head === 'RICHCARD' ||
    slots.richCardKind !== null ||
    (effectiveIntent === 'rich_text_card' &&
      /\b(list|checklist|todo|code\s+(?:card|block|snippet))\b/i.test(clauseText))
  ) {
    const cardKind = slots.richCardKind ?? 'bullet';
    const items =
      cardKind === 'code'
        ? slots.codeSnippet
          ? [slots.codeSnippet]
          : slots.listLabels.length > 0
            ? slots.listLabels
            : ['export async function handler(req) {', '  return Response.json({ ok: true })', '}']
        : slots.listLabels.length > 0
          ? slots.listLabels
          : ['First priority', 'Second milestone', 'Final review'];
    const shapeKind = /\b(note|sticky)\b/i.test(clauseText) ? 'note' : 'card';
    return {
      opcodeLine: `RICH_CARD ${cardKind} (${items.length} items)`,
      syscall: {
        op: 'RICH_CARD',
        cardKind,
        title: slots.singleLabel ?? slots.topic,
        items,
        shapeKind,
        anchor: slots.anchor,
        color: slots.explicitColor ?? (isSubClause ? null : res.color),
      },
    };
  }

  // FREEHAND INK SKETCH & CUBIC SPLINE ILLUSTRATIONS / ANNOTATIONS
  if (
    head === 'SKETCH' ||
    slots.sketchMotif !== null ||
    (effectiveIntent === 'sketch_ink' &&
      /\b(scribble|squiggle|doodle|ink\s+stroke|freehand\s+line)\b/i.test(clauseText))
  ) {
    const motif = slots.sketchMotif ?? 'wave';
    const isAnnotationMotif =
      motif === 'circle_around' ||
      motif === 'underline' ||
      motif === 'cross_out' ||
      motif === 'bracket';
    const targets = slots.sketchTargetHint
      ? resolveRegisterTargets(slots.sketchTargetHint, snapshot, res, parts[1])
      : isAnnotationMotif && snapshot.focusRegs.length > 0
        ? snapshot.focusRegs
        : [];
    return {
      opcodeLine: `SKETCH ${motif}${targets.length ? ` @${targets.join(',')}` : ''}`,
      syscall: {
        op: 'SKETCH',
        motif,
        targets,
        targetLabelHint: slots.sketchTargetHint,
        anchor: slots.anchor,
        color: slots.explicitColor ?? (isSubClause ? null : res.color),
        size: slots.sizeOverride,
        asCubicSpline: slots.sketchAsSpline,
      },
    };
  }

  // NATIVE TLDRAW GROUP / UNGROUP
  if (
    head === 'GROUP' ||
    head === 'UNGROUP' ||
    slots.groupAction !== null ||
    (effectiveIntent === 'group_ungroup' && /\b(group|ungroup)\b/i.test(clauseText))
  ) {
    const isUngroup =
      head === 'UNGROUP' || slots.groupAction === 'ungroup' || /\bungroup\b/i.test(clauseText);
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    if (isUngroup) {
      return {
        opcodeLine: `UNGROUP ${targets.join(',') || 'ALL'}`,
        syscall: { op: 'UNGROUP', targets: targets.length > 0 ? targets : ['ALL'] },
      };
    }
    return {
      opcodeLine: `GROUP ${targets.length >= 2 ? targets.join(',') : 'ALL'}`,
      syscall: { op: 'GROUP', targets: targets.length >= 2 ? targets : ['ALL'] },
    };
  }

  // NATIVE TLDRAW PACK, STACK & STRETCH
  if (
    head === 'PACK' ||
    head === 'STACK' ||
    head === 'STRETCH' ||
    slots.packShapes ||
    slots.stackDirection !== null ||
    slots.stretchDirection !== null ||
    (effectiveIntent === 'layout_pack_stack' &&
      /\b(pack|stack|stretch|same\s+(?:width|height|size)|match\s+(?:width|height|size))\b/i.test(
        clauseText,
      ))
  ) {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    const multiTargets = targets.length >= 2 ? targets : ['ALL'];
    if (
      head === 'PACK' ||
      slots.packShapes ||
      (!slots.stackDirection && !slots.stretchDirection && /\bpack\b/i.test(clauseText))
    ) {
      return {
        opcodeLine: `PACK ${multiTargets.join(',')}`,
        syscall: { op: 'PACK', targets: multiTargets },
      };
    }
    if (head === 'STRETCH' || slots.stretchDirection !== null) {
      const dir = slots.stretchDirection ?? 'horizontal';
      return {
        opcodeLine: `STRETCH ${dir}`,
        syscall: { op: 'STRETCH', targets: multiTargets, direction: dir },
      };
    }
    const stackDir =
      slots.stackDirection ?? (/\bhorizontal/i.test(clauseText) ? 'horizontal' : 'vertical');
    return {
      opcodeLine: `STACK ${stackDir}`,
      syscall: { op: 'STACK', targets: multiTargets, direction: stackDir },
    };
  }

  // NATIVE TLDRAW FLIP / MIRROR
  if (
    head === 'FLIP' ||
    slots.flipAxis !== null ||
    (effectiveIntent === 'transform_flip' && /\b(flip|mirror)\b/i.test(clauseText))
  ) {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    const axis =
      slots.flipAxis ?? (/\bvertical/i.test(clauseText) ? 'vertical' : 'horizontal');
    return {
      opcodeLine: `FLIP ${targets.join(',') || 'FOCUS'} ${axis}`,
      syscall: {
        op: 'FLIP',
        targets: targets.length > 0 ? targets : ['FOCUS'],
        axis,
      },
    };
  }

  // STOP animation
  if (head === 'STOP' || effectiveIntent === 'stop_animation' || slots.animationKind === 'stop') {
    const targets =
      parts[1]?.toUpperCase() === 'ALL' || snapshot.shapes.length <= 1
        ? ['ALL']
        : resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    return {
      opcodeLine: `STOP ${targets.join(',')}`,
      syscall: { op: 'STOP_ANIM', targets },
    };
  }

  // ANIMATE
  const directAnimVerbs: Record<string, Exclude<CatalogAnimationKind, 'stop'>> = {
    ORBIT: 'orbit',
    FLOAT: 'float',
    PULSE: 'pulse',
    SPIN: 'spin',
    BOUNCE: 'bounce',
    WIGGLE: 'wiggle',
    SWING: 'pendulum',
    PENDULUM: 'pendulum',
    DRIFT: 'drift',
  };

  if (
    head === 'ANIM' ||
    head in directAnimVerbs ||
    effectiveIntent === 'animate_shapes' ||
    (slots.animationKind !== null && slots.lexicalIntent === 'animate_shapes')
  ) {
    const qwenAnim =
      head in directAnimVerbs
        ? directAnimVerbs[head]
        : (parts[2]?.toLowerCase() as Exclude<CatalogAnimationKind, 'stop'> | undefined);

    const validAnims = new Set([
      'orbit',
      'float',
      'pulse',
      'spin',
      'bounce',
      'wiggle',
      'pendulum',
      'figure8',
      'drift',
    ]);

    const chosenKind = (
      slots.animationKind
        ? slots.animationKind
        : qwenAnim && validAnims.has(qwenAnim)
          ? qwenAnim
          : res.animationKind !== 'stop'
            ? res.animationKind
            : 'float'
    ) as Exclude<CatalogAnimationKind, 'stop'>;

    if (chosenKind === 'orbit' && (slots.targetHint || parts[3] || res.targetMatch)) {
      const pair = resolvePairRegisters(snapshot, res, clauseText, parts[1], parts[3]);
      return {
        opcodeLine: `ANIM ${pair?.regA ?? slots.sourceHint ?? 'FOCUS'} orbit ${pair?.regB ?? slots.targetHint ?? 'ANCHOR'}`,
        syscall: {
          op: 'ANIM',
          targets: pair ? [pair.regA] : ['FOCUS'],
          kind: 'orbit',
          aroundReg: pair?.regB ?? null,
          targetLabelHint: slots.sourceHint,
          aroundLabelHint: slots.targetHint,
          speed: slots.tempoMultiplier ?? 1,
          intensity: 1,
          direction: slots.reverseAnimation ? 'ccw' : 'cw',
        },
      };
    }

    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    return {
      opcodeLine: `ANIM ${targets.join(',') || 'FOCUS'} ${chosenKind}`,
      syscall: {
        op: 'ANIM',
        targets: targets.length > 0 ? targets : ['FOCUS'],
        targetLabelHint: slots.sourceHint ?? slots.singleLabel,
        kind: chosenKind,
        speed: slots.tempoMultiplier ?? 1,
        intensity: 1,
        direction: /\bvertical|up\s+and\s+down\b/i.test(clauseText)
          ? 'vertical'
          : slots.reverseAnimation
            ? 'ccw'
            : 'cw',
      },
    };
  }

  // SWAP
  if (head === 'SWAP' || effectiveIntent === 'transform_swap') {
    const pair = resolvePairRegisters(snapshot, res, clauseText, parts[1], parts[2]);
    if (pair) {
      return {
        opcodeLine: `SWAP ${pair.regA} ${pair.regB}`,
        syscall: { op: 'SWAP', regA: pair.regA, regB: pair.regB },
      };
    }
  }

  // HARMONIZE
  if (head === 'HARMONIZE' || effectiveIntent === 'vision_harmonize') {
    return {
      opcodeLine: 'HARMONIZE',
      syscall: { op: 'HARMONIZE', goalPrompt: clauseText },
    };
  }

  // FRAME GROUP ("put a frame around everything called Sprint 1")
  if (head === 'FRAME' || effectiveIntent === 'frame_group') {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    return {
      opcodeLine: `FRAME ${slots.frameGroupLabel ?? 'Group'}`,
      syscall: {
        op: 'FRAME_GROUP',
        targets: targets.length > 0 ? targets : ['ALL'],
        label: slots.frameGroupLabel,
      },
    };
  }

  // ALIGN / DISTRIBUTE
  if (head === 'ALIGN' || effectiveIntent === 'transform_align_distribute') {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    const mode = slots.alignMode ?? 'center-horizontal';
    return {
      opcodeLine: `ALIGN ${mode}`,
      syscall: {
        op: 'ALIGN',
        targets: targets.length >= 2 ? targets : ['ALL'],
        mode,
      },
    };
  }

  // ROTATE
  if (head === 'ROTATE' || effectiveIntent === 'transform_rotate') {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    const deg = slots.rotationDegrees ?? 45;
    return {
      opcodeLine: `ROTATE ${targets.join(',') || 'FOCUS'} ${deg}`,
      syscall: {
        op: 'ROTATE',
        targets: targets.length > 0 ? targets : ['FOCUS'],
        degrees: deg,
        absolute: slots.rotationAbsolute,
      },
    };
  }

  // STYLE ARROWS
  if (head === 'ARROWS' || effectiveIntent === 'style_arrows') {
    return {
      opcodeLine: `ARROWS ${slots.arrowKindOverride ?? slots.dashOverride ?? 'reverse'}`,
      syscall: {
        op: 'STYLE_ARROWS',
        kind: slots.arrowKindOverride,
        dash: slots.dashOverride,
        reverse: slots.reverseArrows,
      },
    };
  }

  // Z-ORDER
  if (head === 'ZORDER' || effectiveIntent === 'z_order') {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    return {
      opcodeLine: `ZORDER ${slots.zOrder ?? 'front'}`,
      syscall: {
        op: 'Z_ORDER',
        targets: targets.length > 0 ? targets : ['FOCUS'],
        order: slots.zOrder ?? 'front',
      },
    };
  }

  // RELATIVE PLACEMENT
  const qwenRelCandidate = parts[2]?.toLowerCase() as SpatialRelation | undefined;
  const validRel = new Set<SpatialRelation>(['above', 'below', 'left-of', 'right-of', 'near']);
  if (
    head === 'PLACE' ||
    (head === 'MOVE' && qwenRelCandidate && validRel.has(qwenRelCandidate) && parts[3]) ||
    effectiveIntent === 'transform_move_relative' ||
    (slots.spatialRelation && slots.lexicalIntent === 'transform_move_relative')
  ) {
    const pair = resolvePairRegisters(snapshot, res, clauseText, parts[1], parts[3]);
    const relation: SpatialRelation =
      slots.spatialRelation ??
      (qwenRelCandidate && validRel.has(qwenRelCandidate) ? qwenRelCandidate : 'right-of');
    if (pair || (slots.sourceHint && slots.targetHint)) {
      return {
        opcodeLine: `PLACE ${pair?.regA ?? slots.sourceHint} ${relation} ${pair?.regB ?? slots.targetHint}`,
        syscall: {
          op: 'PLACE',
          targets: pair ? [pair.regA] : ['FOCUS'],
          relation,
          refReg: pair?.regB ?? null,
          targetLabelHint: slots.sourceHint,
          refLabelHint: slots.targetHint,
        },
      };
    }
  }

  // MOVE
  if (
    (head === 'MOVE' &&
      (slots.lexicalIntent === 'transform_move' ||
        res.intentKind === 'transform_move' ||
        slots.direction !== null ||
        slots.anchor !== null)) ||
    effectiveIntent === 'transform_move'
  ) {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    const qDir = parts[2]?.toLowerCase();
    const anchor: SpatialAnchor | null =
      slots.anchor ??
      (qDir &&
      ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'].includes(
        qDir,
      ) &&
      slots.direction === null
        ? (qDir as SpatialAnchor)
        : null);
    const dir =
      slots.direction ??
      (qDir && ['left', 'right', 'up', 'down', 'center'].includes(qDir)
        ? (qDir as 'left' | 'right' | 'up' | 'down' | 'center')
        : 'right');

    return {
      opcodeLine: `MOVE ${targets.join(',') || 'FOCUS'} ${anchor ?? dir} (${slots.moveDistance})`,
      syscall: {
        op: 'MOVE',
        targets: targets.length > 0 ? targets : ['FOCUS'],
        dir,
        anchor,
        distance: slots.moveDistance,
      },
    };
  }

  // DESTRUCTIVE CONSENT LOCKS
  if (head === 'CLEAR' || effectiveIntent === 'clear_canvas') {
    if (!hasExplicitClearConsent(clauseText, isSubClause ? [] : res.words)) {
      return {
        opcodeLine: 'NOOP (blocked unconfirmed CLEAR)',
        syscall: { op: 'NOOP', reason: 'Clear requires explicit spoken phrase' },
      };
    }
    return { opcodeLine: 'CLEAR', syscall: { op: 'CLEAR' } };
  }

  if (head === 'DEL' || head === 'DELETE' || effectiveIntent === 'delete_shapes') {
    if (!hasExplicitDeleteConsent(clauseText, isSubClause ? [] : res.words)) {
      return {
        opcodeLine: 'NOOP (blocked unconfirmed DEL)',
        syscall: { op: 'NOOP', reason: 'Delete requires explicit spoken verb' },
      };
    }
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    return {
      opcodeLine: `DEL ${targets.join(',')}`,
      syscall: { op: 'DELETE', targets },
    };
  }

  if (head === 'UNDO' || effectiveIntent === 'history_undo') {
    if (!hasExplicitUndoConsent(clauseText, isSubClause ? [] : res.words)) {
      return {
        opcodeLine: 'NOOP (blocked unconfirmed UNDO)',
        syscall: { op: 'NOOP', reason: 'Undo requires explicit spoken undo' },
      };
    }
    return { opcodeLine: 'UNDO', syscall: { op: 'UNDO' } };
  }

  if (head === 'REDO' || effectiveIntent === 'history_redo') {
    if (!/\b(redo)\b/i.test(clauseText)) {
      return { opcodeLine: 'NOOP', syscall: { op: 'NOOP', reason: 'Redo gate' } };
    }
    return { opcodeLine: 'REDO', syscall: { op: 'REDO' } };
  }

  // LOCK / UNLOCK
  if (head === 'LOCK' || effectiveIntent === 'lock_shapes') {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    return { opcodeLine: `LOCK ${targets.join(',')}`, syscall: { op: 'LOCK', targets, locked: true } };
  }
  if (head === 'UNLOCK' || effectiveIntent === 'unlock_shapes') {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    return { opcodeLine: `UNLOCK ${targets.join(',')}`, syscall: { op: 'LOCK', targets, locked: false } };
  }

  // AESTHETIC EDITION
  if (head === 'THEME' || effectiveIntent === 'apply_aesthetic') {
    const chosenEdition = slots.explicitEditionId ?? res.aestheticId;
    return {
      opcodeLine: `THEME ${chosenEdition}`,
      syscall: { op: 'AESTHETIC', aestheticId: chosenEdition },
    };
  }

  // LAYOUT BLUEPRINT
  if (
    head === 'LAYOUT' ||
    effectiveIntent === 'compose_layout' ||
    (!isSubClause &&
      effectiveIntent === 'create_shape' &&
      !slots.explicitArchetypeId &&
      res.blueprintScore >= 0.71 &&
      res.blueprintId !== 'row' &&
      res.blueprintId !== 'column')
  ) {
    const qBp = parts[1]?.toLowerCase() as BlueprintKind | undefined;
    const kind =
      slots.explicitBlueprintId ?? (qBp && VALID_BLUEPRINTS.has(qBp) ? qBp : res.blueprintId);
    return {
      opcodeLine: `LAYOUT ${kind}${slots.topic ? ` (${slots.topic})` : ''}`,
      syscall: {
        op: 'LAYOUT',
        kind,
        topic: slots.topic,
        listLabels: slots.listLabels.length > 0 ? slots.listLabels : undefined,
        anchor: slots.anchor,
        color: slots.explicitColor ?? (isSubClause ? null : res.color),
      },
    };
  }

  // SPAWN SHAPE(S)
  if (
    (head === 'SPAWN' && res.intentScore >= 0.46) ||
    (effectiveIntent === 'create_shape' &&
      (res.intentScore >= 0.46 || slots.lexicalIntent === 'create_shape' || isSubClause))
  ) {
    const chosenArch = slots.explicitArchetypeId ?? res.archetypeId;
    const chosenColor = slots.explicitColor ?? (isSubClause ? null : res.color);
    return {
      opcodeLine: `SPAWN ${chosenArch} x${slots.listLabels.length || slots.count || 1}`,
      syscall: {
        op: 'SPAWN',
        count: slots.count ?? undefined,
        anchor: slots.anchor,
        archetypeId: chosenArch,
        color: chosenColor,
        label: slots.singleLabel,
        listLabels: slots.listLabels.length > 0 ? slots.listLabels : undefined,
        arrangement: slots.arrangement,
        connectCreated: slots.connectCreated,
        sizeOverride: slots.sizeOverride,
      },
    };
  }

  // CONNECT (including 3+ hop chains & auto-materialized endpoints!)
  if (head === 'CONNECT' || effectiveIntent === 'connect_shapes') {
    if (slots.chainLabels.length >= 2) {
      return {
        opcodeLine: `CONNECT CHAIN (${slots.chainLabels.join(' -> ')})`,
        syscall: {
          op: 'CONNECT',
          chainLabels: slots.chainLabels,
          edgeLabel: slots.edgeLabel,
        },
      };
    }

    if (slots.connectAll || parts[1]?.toUpperCase() === 'ALL') {
      return {
        opcodeLine: 'CONNECT ALL',
        syscall: { op: 'CONNECT', all: true, edgeLabel: slots.edgeLabel },
      };
    }

    const matchEndpoint = (
      hint: string | null,
      semMatch: { id: string; reg: string; label: string; score: number } | null | undefined,
      qwenTok: string | undefined,
      excludeReg?: string | null,
    ): { reg: string | null; label: string | null } => {
      const shapes = snapshot.shapes.filter((s) => !excludeReg || s.reg !== excludeReg);
      if (hint) {
        const h = hint.trim().toLowerCase();
        if (/^(it|this|that)$/i.test(h) && shapes.length > 0) {
          const foc = snapshot.focusRegs.find((r) => r !== excludeReg);
          return { reg: foc ?? shapes[shapes.length - 1].reg, label: null };
        }
        if (/\bfirst\b/.test(h) && snapshot.shapes[0] && snapshot.shapes[0].reg !== excludeReg) {
          return { reg: snapshot.shapes[0].reg, label: null };
        }
        if (/\bsecond\b/.test(h) && snapshot.shapes[1] && snapshot.shapes[1].reg !== excludeReg) {
          return { reg: snapshot.shapes[1].reg, label: null };
        }
        if (/\blast\b/.test(h) && shapes.length > 0) {
          return { reg: shapes[shapes.length - 1].reg, label: null };
        }
        const byLbl = shapes.find((s) => {
          const sl = s.label.trim().toLowerCase();
          return sl.length >= 2 && (h.includes(sl) || sl.includes(h));
        });
        if (byLbl) return { reg: byLbl.reg, label: null };

        for (const [shapeKey, words] of Object.entries(SHAPE_SYNONYMS)) {
          if (words.some((w) => new RegExp(`^(?:the\\s+)?${w}$`, 'i').test(h))) {
            const hit = shapes.find((s) => s.shapeType === shapeKey);
            if (hit) return { reg: hit.reg, label: null };
          }
        }

        if (!isSubClause && semMatch && semMatch.score >= 0.72 && semMatch.reg !== excludeReg) {
          return { reg: semMatch.reg, label: null };
        }

        return { reg: null, label: hint.trim() };
      }

      if (qwenTok && /^s\d+$/i.test(qwenTok)) {
        const hit = shapes.find((s) => s.reg.toLowerCase() === qwenTok.toLowerCase());
        if (hit) return { reg: hit.reg, label: null };
      }
      return { reg: null, label: null };
    };

    if (slots.sourceHint || slots.targetHint) {
      const src = matchEndpoint(slots.sourceHint, res.sourceMatch, parts[1], null);
      const dst = matchEndpoint(slots.targetHint, res.targetMatch, parts[2], src.reg);
      return {
        opcodeLine: `CONNECT ${src.reg ?? `"${src.label}"`} -> ${dst.reg ?? `"${dst.label}"`}${slots.edgeLabel ? ` [${slots.edgeLabel}]` : ''}`,
        syscall: {
          op: 'CONNECT',
          fromReg: src.reg,
          toReg: dst.reg,
          fromLabel: src.label,
          toLabel: dst.label,
          edgeLabel: slots.edgeLabel,
        },
      };
    }

    const pair = resolvePairRegisters(snapshot, res, clauseText, parts[1], parts[2]);
    return {
      opcodeLine: pair ? `CONNECT ${pair.regA} -> ${pair.regB}` : 'CONNECT SEQ',
      syscall: {
        op: 'CONNECT',
        fromReg: pair?.regA ?? null,
        toReg: pair?.regB ?? null,
        edgeLabel: slots.edgeLabel,
      },
    };
  }

  // STYLE & COLOR
  if (head === 'COLOR' || effectiveIntent === 'style_color') {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    const col = slots.explicitColor ?? res.color;
    return {
      opcodeLine: `COLOR ${targets.join(',') || 'FOCUS'} ${col ?? 'accent'}`,
      syscall: { op: 'STYLE_COLOR', targets: targets.length > 0 ? targets : ['FOCUS'], color: col },
    };
  }

  if (head === 'STYLE' || effectiveIntent === 'style_stroke_fill') {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    return {
      opcodeLine: `STYLE ${targets.join(',') || 'FOCUS'}`,
      syscall: {
        op: 'STYLE_SURFACE',
        targets: targets.length > 0 ? targets : ['FOCUS'],
        sizeOverride: slots.sizeOverride,
      },
    };
  }

  // SCALE / ARRANGE / DUPLICATE / LABEL / SELECT / CAMERA
  if (head === 'SCALE' || effectiveIntent === 'transform_scale') {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    const factor = slots.scaleFactor ?? (parts[2] === 'down' ? 0.75 : 1.3);
    return {
      opcodeLine: `SCALE ${targets.join(',') || 'FOCUS'} x${factor}`,
      syscall: { op: 'SCALE', targets: targets.length > 0 ? targets : ['FOCUS'], factor },
    };
  }

  if (head === 'ARRANGE' || effectiveIntent === 'transform_arrange') {
    return {
      opcodeLine: `ARRANGE ${slots.arrangement ?? 'auto'}`,
      syscall: { op: 'ARRANGE', mode: slots.arrangement },
    };
  }

  if (head === 'DUP' || effectiveIntent === 'transform_duplicate') {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    return {
      opcodeLine: `DUP ${targets.join(',') || 'FOCUS'} x${slots.count ?? 1}`,
      syscall: {
        op: 'DUPLICATE',
        targets: targets.length > 0 ? targets : ['FOCUS'],
        count: slots.count ?? 1,
      },
    };
  }

  if (head === 'LABEL' || effectiveIntent === 'edit_label') {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    return {
      opcodeLine: `LABEL ${targets.join(',') || 'FOCUS'}`,
      syscall: {
        op: 'LABEL',
        targets: targets.length > 0 ? targets : ['FOCUS'],
        text: slots.singleLabel,
      },
    };
  }

  if (effectiveIntent === 'select_target') {
    const targets = resolveRegisterTargets(clauseText, snapshot, res, parts[1]);
    return {
      opcodeLine: `SELECT ${targets.join(',')}`,
      syscall: { op: 'SELECT', targets },
    };
  }

  if (head === 'CAM' || effectiveIntent === 'camera_zoom_in') {
    const act = parts[1] === 'zoom_out' ? 'zoom_out' : parts[1] === 'fit' ? 'fit' : 'zoom_in';
    return { opcodeLine: `CAM ${act}`, syscall: { op: 'CAMERA', action: act } };
  }
  if (effectiveIntent === 'camera_zoom_out') {
    return { opcodeLine: 'CAM zoom_out', syscall: { op: 'CAMERA', action: 'zoom_out' } };
  }
  if (effectiveIntent === 'camera_fit') {
    return { opcodeLine: 'CAM fit', syscall: { op: 'CAMERA', action: 'fit' } };
  }

  return {
    opcodeLine: 'NOOP',
    syscall: { op: 'NOOP', reason: 'Below confidence threshold' },
  };
}

/**
 * Superscalar Multi-Clause Compiler:
 * Compiles both fast single commands AND rich multi-clause compound sentences in < 0.3ms,
 * flagging `needsQwenDisambiguation` ONLY when an utterance is genuinely ambiguous.
 */
export function compileCompoundSyscalls(
  rawOpcodeLine: string | null,
  snapshot: CanvasRegisterSnapshot,
  res: SemanticResolution,
): {
  opcodeLine: string;
  syscall: CanvasSyscall;
  syscalls: CanvasSyscall[];
  needsQwenDisambiguation: boolean;
} {
  if (isPureFillerOrNoise(res.rawText, res.words)) {
    const noop: CanvasSyscall = { op: 'NOOP', reason: 'Filtered filler' };
    return {
      opcodeLine: 'NOOP',
      syscall: noop,
      syscalls: [noop],
      needsQwenDisambiguation: false,
    };
  }

  const clauses = splitCompoundClauses(res.rawText);

  if (clauses.length <= 1) {
    const slots = parseVoiceSlots(res.rawText, res.ghostText);
    const single = compileVerifiedSyscall(rawOpcodeLine, snapshot, res);

    // Also check if the user combined creation + immediate animation in one clause!
    // e.g. "draw five yellow stars floating" or "add a red diamond spinning"
    const syscalls: CanvasSyscall[] = [single.syscall];
    if (
      (single.syscall.op === 'SPAWN' ||
        single.syscall.op === 'RICH_CARD' ||
        single.syscall.op === 'SKETCH') &&
      slots.animationKind &&
      slots.animationKind !== 'stop'
    ) {
      syscalls.push({
        op: 'ANIM',
        targets: ['FOCUS'],
        kind: slots.animationKind,
        speed: slots.tempoMultiplier ?? 1,
        intensity: 1,
        direction: slots.reverseAnimation ? 'ccw' : 'cw',
      });
    }

    const isConfident =
      single.syscall.op !== 'NOOP' &&
      (slots.lexicalIntent !== null || res.intentScore >= 0.56 || rawOpcodeLine !== null);

    return {
      opcodeLine:
        syscalls.length > 1
          ? `${single.opcodeLine} ; ANIM FOCUS ${slots.animationKind}`
          : single.opcodeLine,
      syscall: syscalls[0],
      syscalls,
      needsQwenDisambiguation:
        !isConfident && snapshot.shapes.length > 0 && rawOpcodeLine === null,
    };
  }

  // Multi-clause compound sentence! Compile each clause into an ordered transaction batch
  const opcodes: string[] = [];
  const syscalls: CanvasSyscall[] = [];

  for (const clause of clauses) {
    const cSlots = parseVoiceSlots(clause);
    const compiled = compileVerifiedSyscall(null, snapshot, res, clause);
    if (compiled.syscall.op !== 'NOOP') {
      opcodes.push(compiled.opcodeLine);
      syscalls.push(compiled.syscall);

      if (
        compiled.syscall.op === 'SPAWN' &&
        cSlots.animationKind &&
        cSlots.animationKind !== 'stop'
      ) {
        opcodes.push(`ANIM FOCUS ${cSlots.animationKind}`);
        syscalls.push({
          op: 'ANIM',
          targets: ['FOCUS'],
          kind: cSlots.animationKind,
          speed: cSlots.tempoMultiplier ?? 1,
          intensity: 1,
          direction: cSlots.reverseAnimation ? 'ccw' : 'cw',
        });
      }
    }
  }

  if (syscalls.length === 0) {
    const fallback = compileVerifiedSyscall(rawOpcodeLine, snapshot, res);
    return {
      opcodeLine: fallback.opcodeLine,
      syscall: fallback.syscall,
      syscalls: [fallback.syscall],
      needsQwenDisambiguation: fallback.syscall.op === 'NOOP' && rawOpcodeLine === null,
    };
  }

  return {
    opcodeLine: opcodes.join(' ; '),
    syscall: syscalls[0],
    syscalls,
    needsQwenDisambiguation: false,
  };
}
