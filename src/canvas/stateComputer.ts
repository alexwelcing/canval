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
} from './slotParser.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function serializeRegisterState(snapshot: CanvasRegisterSnapshot): string {
  if (snapshot.shapes.length === 0) {
    return `REG: [] | FOCUS: [] | THEME: ${snapshot.editionId}`;
  }
  const items = snapshot.shapes.slice(-14).map((s) => {
    const flags = [
      s.anim ? `anim=${s.anim}` : '',
      s.locked ? 'locked' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return `${s.reg}:${s.shapeType} "${s.label}" ${s.color} @(${s.x},${s.y})${flags ? ' ' + flags : ''}`;
  });
  return `REG: [${items.join(', ')}] | FOCUS: [${snapshot.focusRegs.join(',')}] | ANIMS: ${snapshot.activeAnimations}`;
}

export function buildStateComputerMessages(
  snapshot: CanvasRegisterSnapshot,
  voiceText: string,
): ChatMessage[] {
  const regDump = serializeRegisterState(snapshot);
  return [
    {
      role: 'system',
      content:
        'You are the Canvas State Computer. Compile STATE + CMD into ONE short instruction line. ' +
        'Valid instructions: NOOP | SPAWN | LAYOUT <architecture|flowchart|mindmap|kanban|quadrant|timeline|bento|row|column> | ' +
        'MOVE <reg|ALL|FOCUS> <left|right|up|down|center|top-left|top|top-right|bottom-left|bottom|bottom-right> | ' +
        'PLACE <reg> <above|below|left-of|right-of|near> <refReg> | SWAP <regA> <regB> | ' +
        'ANIM <reg|ALL|FOCUS> <orbit|float|pulse|spin|bounce|wiggle|pendulum|figure8|drift> [aroundReg] | ' +
        'TEMPO <reg|ALL> <faster|slower|reverse> | STOP <reg|ALL> | CONNECT <regA> <regB> | CONNECT ALL | ' +
        'COLOR <reg|ALL|FOCUS> <color> | STYLE <reg|ALL|FOCUS> | SCALE <reg|FOCUS> <up|down> | ' +
        'ARRANGE <row|column|grid> | DUP <reg|FOCUS> | LABEL <reg|FOCUS> | LOCK <reg|ALL|FOCUS> | UNLOCK <reg|ALL|FOCUS> | ' +
        'DEL <reg|FOCUS> | CLEAR | THEME | UNDO | REDO | CAM <zoom_in|zoom_out|fit>. ' +
        'CRITICAL RULE: Output NOOP for filler/noise/comments. NEVER output DEL, CLEAR, or UNDO unless CMD explicitly says delete, remove, erase, clear canvas, or undo.',
    },
    {
      role: 'user',
      content:
        'REG: [s1:ellipse "Moon" grey @(180,0), s2:ellipse "Earth" blue @(0,0)] | FOCUS: [s1] | ANIMS: 0\nCMD: make the moon orbit around the earth',
    },
    { role: 'assistant', content: 'ANIM s1 orbit s2' },
    {
      role: 'user',
      content:
        'REG: [s1:rectangle "Client" blue @(-200,0), s2:hexagon "Gateway" black @(0,0), s3:trapezoid "Database" violet @(200,0)] | FOCUS: [s3] | ANIMS: 0\nCMD: move the database above the gateway',
    },
    { role: 'assistant', content: 'PLACE s3 above s2' },
    {
      role: 'user',
      content: 'REG: [s1:rectangle "Sketch" black @(0,0)] | FOCUS: [s1] | ANIMS: 0\nCMD: uh okay yeah nice',
    },
    { role: 'assistant', content: 'NOOP' },
    {
      role: 'user',
      content:
        'REG: [s1:star "North Star" yellow @(-120,0), s2:note "Draft Memo" orange @(140,0)] | FOCUS: [s2] | ANIMS: 0\nCMD: remove the draft memo',
    },
    { role: 'assistant', content: 'DEL s2' },
    {
      role: 'user',
      content: 'REG: [s1:diamond "Core" red @(0,0) anim=spin] | FOCUS: [s1] | ANIMS: 1\nCMD: stop spinning',
    },
    { role: 'assistant', content: 'STOP ALL' },
    {
      role: 'user',
      content: `${regDump}\nCMD: ${voiceText.trim()}`,
    },
  ];
}

const SHAPE_SYNONYMS: Record<string, string[]> = {
  rectangle: ['box', 'rectangle', 'card', 'square', 'block', 'panel'],
  ellipse: ['circle', 'orb', 'sphere', 'ball', 'round', 'dot', 'moon', 'sun', 'planet'],
  oval: ['pill', 'oval', 'capsule', 'badge'],
  diamond: ['diamond', 'rhombus', 'decision', 'router'],
  hexagon: ['hexagon', 'hex', 'polygon', 'engine'],
  trapezoid: ['trapezoid', 'database', 'storage', 'bucket'],
  cloud: ['cloud'],
  triangle: ['triangle', 'pyramid'],
  star: ['star', 'spark'],
  heart: ['heart'],
  note: ['note', 'sticky', 'memo', 'post-it', 'post it'],
  text: ['text', 'title', 'heading', 'label', 'caption'],
  frame: ['frame', 'artboard'],
};

/**
 * Resolves spoken shape descriptors ("the blue circle", "leftmost shape", "everything", "alpha")
 * against the live Canvas Register File + EmbeddingGemma 2 vector matches.
 */
export function resolveRegisterTargets(
  rawText: string,
  snapshot: CanvasRegisterSnapshot,
  res: SemanticResolution,
  qwenToken?: string | null,
): string[] {
  const lower = rawText.toLowerCase();
  const shapes = snapshot.shapes;
  if (shapes.length === 0) return [];

  if (qwenToken === 'ALL' || /\b(all(?:\s+of\s+them|\s+shapes)?|everything|every\s+shape|everybody|whole\s+thing)\b/i.test(lower)) {
    return ['ALL'];
  }

  // 1. Check positional superlatives ("leftmost", "rightmost", "top", "bottom", "first", "last")
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

  // 2. Check exact label substring or color + geometry filter
  const labelHits = shapes.filter((s) => {
    const lbl = s.label.trim().toLowerCase();
    return lbl.length >= 2 && lower.includes(lbl);
  });
  if (labelHits.length > 0) {
    return labelHits.map((s) => s.reg);
  }

  // Color + Shape type match (e.g. "the red circle", "blue boxes")
  let candidates = shapes;
  const colorFilter = res.color && res.colorScore >= 0.62 ? res.color : null;
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

  // 3. Explicit register token emitted by Qwen ("s1", "s2")
  if (qwenToken && /^s\d+$/i.test(qwenToken)) {
    const found = shapes.find((s) => s.reg.toLowerCase() === qwenToken.toLowerCase());
    if (found) return [found.reg];
  }

  // 4. High-confidence EmbeddingGemma 2 label match
  if (res.sourceMatch && res.sourceMatch.score >= 0.58) {
    return [res.sourceMatch.reg];
  }
  if (res.matchedShapes[0] && res.matchedShapes[0].score >= 0.62) {
    return [res.matchedShapes[0].reg];
  }

  // 5. Fallback to FOCUS register (most recently created/selected shapes)
  if (snapshot.focusRegs.length > 0) {
    return snapshot.focusRegs;
  }
  return [shapes[shapes.length - 1].reg];
}

function resolvePairRegisters(
  snapshot: CanvasRegisterSnapshot,
  res: SemanticResolution,
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

  const slots = parseVoiceSlots(res.rawText);
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
 *Deterministic Register ALU fallback + Supervisor Verifier:
 * Parses Qwen's RISC opcode line (if provided) AND cross-verifies against
 * EmbeddingGemma 2 semantic scores + Explicit Destructive Consent Locks.
 */
export function compileVerifiedSyscall(
  rawOpcodeLine: string | null,
  snapshot: CanvasRegisterSnapshot,
  res: SemanticResolution,
): { opcodeLine: string; syscall: CanvasSyscall } {
  // Gate 0: Filler / breath / noise filter
  if (isPureFillerOrNoise(res.rawText, res.words)) {
    return {
      opcodeLine: 'NOOP (acoustic-filler)',
      syscall: { op: 'NOOP', reason: 'Filtered ambient filler' },
    };
  }

  const slots = parseVoiceSlots(res.rawText, res.ghostText);
  const cleanLine = (rawOpcodeLine ?? '')
    .replace(/^(OUT:|STATE:|CMD:)\s*/i, '')
    .split('\n')[0]
    .trim();
  const parts = cleanLine.split(/\s+/).filter(Boolean);
  const head = (parts[0] ?? '').toUpperCase();

  // 1. Check explicit Tempo / Speed adjustments on active animations ("faster", "slower", "reverse")
  if (
    snapshot.activeAnimations > 0 &&
    (slots.tempoMultiplier !== null || slots.reverseAnimation) &&
    !slots.animationKind &&
    !/\b(draw|create|add|move|scale|bigger|smaller)\b/i.test(slots.cleanText)
  ) {
    const targets = resolveRegisterTargets(res.rawText, snapshot, res, parts[1]);
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

  // 2. Determine primary action from Qwen Opcode + Lexical + EmbeddingGemma 2
  const effectiveIntent = slots.lexicalIntent ?? res.intentKind;

  // Handle STOP animation
  if (head === 'STOP' || effectiveIntent === 'stop_animation' || slots.animationKind === 'stop') {
    const targets =
      parts[1]?.toUpperCase() === 'ALL' || snapshot.shapes.length <= 1
        ? ['ALL']
        : resolveRegisterTargets(res.rawText, snapshot, res, parts[1]);
    return {
      opcodeLine: `STOP ${targets.join(',')}`,
      syscall: { op: 'STOP_ANIM', targets },
    };
  }

  // Handle ANIMATE (`ANIM` / `SPIN` / `ORBIT` / `FLOAT` / `PULSE` / `BOUNCE`)
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
    slots.animationKind !== null
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
      const pair = resolvePairRegisters(snapshot, res, parts[1], parts[3]);
      if (pair) {
        return {
          opcodeLine: `ANIM ${pair.regA} orbit ${pair.regB}`,
          syscall: {
            op: 'ANIM',
            targets: [pair.regA],
            kind: 'orbit',
            aroundReg: pair.regB,
            speed: slots.tempoMultiplier ?? 1,
            intensity: 1,
            direction: slots.reverseAnimation ? 'ccw' : 'cw',
          },
        };
      }
    }

    const targets = resolveRegisterTargets(res.rawText, snapshot, res, parts[1]);
    return {
      opcodeLine: `ANIM ${targets.join(',')} ${chosenKind}`,
      syscall: {
        op: 'ANIM',
        targets,
        kind: chosenKind,
        speed: slots.tempoMultiplier ?? 1,
        intensity: 1,
        direction: /\bvertical|up\s+and\s+down\b/i.test(res.rawText)
          ? 'vertical'
          : slots.reverseAnimation
            ? 'ccw'
            : 'cw',
      },
    };
  }

  // Handle SWAP
  if (head === 'SWAP' || effectiveIntent === 'transform_swap') {
    const pair = resolvePairRegisters(snapshot, res, parts[1], parts[2]);
    if (pair) {
      return {
        opcodeLine: `SWAP ${pair.regA} ${pair.regB}`,
        syscall: { op: 'SWAP', regA: pair.regA, regB: pair.regB },
      };
    }
  }

  // Handle RELATIVE PLACEMENT ("move X above/below/left-of/right-of Y")
  if (head === 'PLACE' || effectiveIntent === 'transform_move_relative' || slots.spatialRelation) {
    const pair = resolvePairRegisters(snapshot, res, parts[1], parts[3]);
    const qRel = parts[2]?.toLowerCase() as SpatialRelation | undefined;
    const validRel = new Set<SpatialRelation>(['above', 'below', 'left-of', 'right-of', 'near']);
    const relation: SpatialRelation =
      slots.spatialRelation ?? (qRel && validRel.has(qRel) ? qRel : 'right-of');
    if (pair) {
      return {
        opcodeLine: `PLACE ${pair.regA} ${relation} ${pair.regB}`,
        syscall: { op: 'PLACE', targets: [pair.regA], relation, refReg: pair.regB },
      };
    }
  }

  // Handle MOVE (directional nudge or 9-point viewport anchor)
  if (
    (head === 'MOVE' && (slots.lexicalIntent === 'transform_move' || res.intentKind === 'transform_move' || slots.direction !== null || slots.anchor !== null)) ||
    effectiveIntent === 'transform_move'
  ) {
    const targets = resolveRegisterTargets(res.rawText, snapshot, res, parts[1]);
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
      opcodeLine: `MOVE ${targets.join(',')} ${anchor ?? dir} (${slots.moveDistance})`,
      syscall: {
        op: 'MOVE',
        targets,
        dir,
        anchor,
        distance: slots.moveDistance,
      },
    };
  }

  // HARD CONSENT GATE FOR DESTRUCTIVE OPS: DELETE / CLEAR / UNDO
  if (head === 'CLEAR' || effectiveIntent === 'clear_canvas') {
    if (!hasExplicitClearConsent(res.rawText, res.words)) {
      return {
        opcodeLine: 'NOOP (blocked unconfirmed CLEAR)',
        syscall: { op: 'NOOP', reason: 'Clear requires explicit spoken phrase' },
      };
    }
    return { opcodeLine: 'CLEAR', syscall: { op: 'CLEAR' } };
  }

  if (head === 'DEL' || head === 'DELETE' || effectiveIntent === 'delete_shapes') {
    if (!hasExplicitDeleteConsent(res.rawText, res.words)) {
      return {
        opcodeLine: 'NOOP (blocked unconfirmed DEL)',
        syscall: { op: 'NOOP', reason: 'Delete requires explicit spoken verb' },
      };
    }
    const targets = resolveRegisterTargets(res.rawText, snapshot, res, parts[1]);
    return {
      opcodeLine: `DEL ${targets.join(',')}`,
      syscall: { op: 'DELETE', targets },
    };
  }

  if (head === 'UNDO' || effectiveIntent === 'history_undo') {
    if (!hasExplicitUndoConsent(res.rawText, res.words)) {
      return {
        opcodeLine: 'NOOP (blocked unconfirmed UNDO)',
        syscall: { op: 'NOOP', reason: 'Undo requires explicit spoken undo' },
      };
    }
    return { opcodeLine: 'UNDO', syscall: { op: 'UNDO' } };
  }

  if (head === 'REDO' || effectiveIntent === 'history_redo') {
    if (!/\b(redo)\b/i.test(res.rawText)) {
      return { opcodeLine: 'NOOP', syscall: { op: 'NOOP', reason: 'Redo gate' } };
    }
    return { opcodeLine: 'REDO', syscall: { op: 'REDO' } };
  }

  // LOCK / UNLOCK
  if (head === 'LOCK' || effectiveIntent === 'lock_shapes') {
    const targets = resolveRegisterTargets(res.rawText, snapshot, res, parts[1]);
    return { opcodeLine: `LOCK ${targets.join(',')}`, syscall: { op: 'LOCK', targets, locked: true } };
  }
  if (head === 'UNLOCK' || effectiveIntent === 'unlock_shapes') {
    const targets = resolveRegisterTargets(res.rawText, snapshot, res, parts[1]);
    return { opcodeLine: `UNLOCK ${targets.join(',')}`, syscall: { op: 'LOCK', targets, locked: false } };
  }

  // AESTHETIC EDITION
  if (head === 'THEME' || effectiveIntent === 'apply_aesthetic') {
    return {
      opcodeLine: `THEME ${res.aestheticId}`,
      syscall: { op: 'AESTHETIC', aestheticId: res.aestheticId },
    };
  }

  // LAYOUT BLUEPRINT vs SPAWN SHAPE
  if (
    head === 'LAYOUT' ||
    effectiveIntent === 'compose_layout' ||
    (effectiveIntent === 'create_shape' &&
      res.blueprintScore >= 0.7 &&
      res.blueprintId !== 'row' &&
      res.blueprintId !== 'column')
  ) {
    const qBp = parts[1]?.toLowerCase() as BlueprintKind | undefined;
    const validBp = new Set<BlueprintKind>([
      'architecture',
      'flowchart',
      'mindmap',
      'kanban',
      'quadrant',
      'timeline',
      'bento',
      'row',
      'column',
    ]);
    const kind = qBp && validBp.has(qBp) ? qBp : res.blueprintId;
    return {
      opcodeLine: `LAYOUT ${kind}`,
      syscall: { op: 'LAYOUT', kind },
    };
  }

  if (
    (head === 'SPAWN' && res.intentScore >= 0.48) ||
    (effectiveIntent === 'create_shape' && (res.intentScore >= 0.48 || slots.lexicalIntent === 'create_shape'))
  ) {
    return {
      opcodeLine: `SPAWN ${res.archetypeId} x${slots.count ?? 1}`,
      syscall: { op: 'SPAWN', count: slots.count ?? undefined, anchor: slots.anchor },
    };
  }

  // CONNECT
  if (head === 'CONNECT' || effectiveIntent === 'connect_shapes') {
    if (slots.connectAll || parts[1]?.toUpperCase() === 'ALL') {
      return { opcodeLine: 'CONNECT ALL', syscall: { op: 'CONNECT', all: true } };
    }
    const pair = resolvePairRegisters(snapshot, res, parts[1], parts[2]);
    return {
      opcodeLine: pair ? `CONNECT ${pair.regA} -> ${pair.regB}` : 'CONNECT SEQ',
      syscall: { op: 'CONNECT', fromReg: pair?.regA ?? null, toReg: pair?.regB ?? null },
    };
  }

  // STYLE & COLOR
  if (head === 'COLOR' || effectiveIntent === 'style_color') {
    const targets = resolveRegisterTargets(res.rawText, snapshot, res, parts[1]);
    return {
      opcodeLine: `COLOR ${targets.join(',')} ${res.color ?? 'accent'}`,
      syscall: { op: 'STYLE_COLOR', targets, color: res.color },
    };
  }

  if (head === 'STYLE' || effectiveIntent === 'style_stroke_fill') {
    const targets = resolveRegisterTargets(res.rawText, snapshot, res, parts[1]);
    return {
      opcodeLine: `STYLE ${targets.join(',')}`,
      syscall: { op: 'STYLE_SURFACE', targets },
    };
  }

  // SCALE / ARRANGE / DUPLICATE / LABEL / SELECT / CAMERA
  if (head === 'SCALE' || effectiveIntent === 'transform_scale') {
    const targets = resolveRegisterTargets(res.rawText, snapshot, res, parts[1]);
    const factor = slots.scaleFactor ?? (parts[2] === 'down' ? 0.75 : 1.3);
    return {
      opcodeLine: `SCALE ${targets.join(',')} x${factor}`,
      syscall: { op: 'SCALE', targets, factor },
    };
  }

  if (head === 'ARRANGE' || effectiveIntent === 'transform_arrange') {
    return {
      opcodeLine: `ARRANGE ${slots.arrangement ?? 'auto'}`,
      syscall: { op: 'ARRANGE', mode: slots.arrangement },
    };
  }

  if (head === 'DUP' || effectiveIntent === 'transform_duplicate') {
    const targets = resolveRegisterTargets(res.rawText, snapshot, res, parts[1]);
    return {
      opcodeLine: `DUP ${targets.join(',')}`,
      syscall: { op: 'DUPLICATE', targets },
    };
  }

  if (head === 'LABEL' || effectiveIntent === 'edit_label') {
    const targets = resolveRegisterTargets(res.rawText, snapshot, res, parts[1]);
    return {
      opcodeLine: `LABEL ${targets.join(',')}`,
      syscall: { op: 'LABEL', targets, text: slots.singleLabel },
    };
  }

  if (effectiveIntent === 'select_target') {
    const targets = resolveRegisterTargets(res.rawText, snapshot, res, parts[1]);
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

  if (head === 'NOOP' || (res.intentScore < 0.5 && !slots.lexicalIntent)) {
    return {
      opcodeLine: 'NOOP',
      syscall: { op: 'NOOP', reason: 'Below confidence threshold' },
    };
  }

  return {
    opcodeLine: 'NOOP',
    syscall: { op: 'NOOP', reason: 'Unrecognized state transition' },
  };
}
