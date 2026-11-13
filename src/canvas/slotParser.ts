import type {
  TLDefaultColorStyle,
  TLDefaultDashStyle,
  TLDefaultFillStyle,
  TLDefaultFontStyle,
  TLDefaultSizeStyle,
} from 'tldraw';
import type { BlueprintKind, CatalogAnimationKind, IntentKind } from '../design/catalog';
import type { SketchMotif } from './inkSketcher';
import type {
  AlignDistributeMode,
  ArrangementMode,
  ExportFormat,
  PageAction,
  SpatialAnchor,
  SpatialRelation,
  StudioToolId,
  WordWithConfidence,
} from '../types/protocol';

export interface ParsedSlots {
  cleanText: string;
  wordCount: number;
  count: number | null;
  singleLabel: string | null;
  listLabels: string[];
  topic: string | null;
  explicitArchetypeId: string | null;
  explicitBlueprintId: BlueprintKind | null;
  explicitColor: TLDefaultColorStyle | null;
  explicitEditionId: string | null;
  connectCreated: boolean;
  connectAll: boolean;
  chainLabels: string[];
  sourceHint: string | null;
  targetHint: string | null;
  edgeLabel: string | null;
  direction: 'left' | 'right' | 'up' | 'down' | 'center' | null;
  moveDistance: 'small' | 'normal' | 'far';
  anchor: SpatialAnchor | null;
  spatialRelation: SpatialRelation | null;
  arrangement: ArrangementMode | null;
  alignMode: AlignDistributeMode | null;
  scaleFactor: number | null;
  rotationDegrees: number | null;
  rotationAbsolute: boolean;
  zOrder: 'front' | 'back' | null;
  frameGroupLabel: string | null;
  arrowKindOverride: 'arc' | 'elbow' | null;
  reverseArrows: boolean;
  sizeOverride: TLDefaultSizeStyle | null;
  animationKind: CatalogAnimationKind | null;
  tempoMultiplier: number | null;
  reverseAnimation: boolean;
  dashOverride: TLDefaultDashStyle | null;
  fillOverride: TLDefaultFillStyle | null;
  fontOverride: TLDefaultFontStyle | null;
  /** New tldraw creative studio slots */
  toolSwitch: StudioToolId | null;
  sketchMotif: SketchMotif | null;
  sketchTargetHint: string | null;
  sketchAsSpline: boolean;
  richCardKind: 'bullet' | 'ordered' | 'checklist' | 'code' | null;
  codeSnippet: string | null;
  appendText: string | null;
  appendTargetHint: string | null;
  pageAction: PageAction | null;
  pageName: string | null;
  pageNumber: number | null;
  exportFormat: ExportFormat | null;
  exportSelectionOnly: boolean;
  groupAction: 'group' | 'ungroup' | null;
  packShapes: boolean;
  stackDirection: 'horizontal' | 'vertical' | null;
  stretchDirection: 'horizontal' | 'vertical' | 'both' | null;
  flipAxis: 'horizontal' | 'vertical' | null;
  gridMode: boolean | null;
  snapMode: boolean | null;
  studioGuide: boolean;
  lexicalIntent: IntentKind | null;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  single: 1,
  first: 1,
  two: 2,
  second: 2,
  couple: 2,
  pair: 2,
  twice: 2,
  three: 3,
  third: 3,
  triple: 3,
  four: 4,
  fourth: 4,
  quadruple: 4,
  five: 5,
  fifth: 5,
  six: 6,
  half_dozen: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dozen: 12,
  fifteen: 15,
  sixteen: 16,
  twenty: 20,
};

const FILLER_WORDS = new Set([
  'uh',
  'um',
  'hmm',
  'hm',
  'mm',
  'ah',
  'oh',
  'okay',
  'ok',
  'yeah',
  'yep',
  'nope',
  'so',
  'well',
  'like',
  'the',
  'a',
  'an',
  'and',
  'or',
  'it',
  'that',
  'this',
  'nice',
  'cool',
  'great',
  'good',
  'wait',
  'hey',
  'hi',
  'hello',
  'thank',
  'thanks',
  'you',
]);

/**
 * Splits a multi-idea or rapid-fire compound utterance into ordered atomic clauses.
 * Preserves noun lists ("draw three boxes called Alpha, Beta, and Gamma") and binary relations ("swap A and B").
 */
export function splitCompoundClauses(rawText: string): string[] {
  const normalized = rawText.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  // Do not split if explicit colon/steps/items list ("with steps A, B, and C") is present without sequential "then"
  const hasExplicitStepsList =
    /\b(?:with\s+(?:steps?|columns?|nodes?|items?|bullets?|tasks?|branches|stages)|named|called)\s+[^.;]+,/i.test(
      normalized,
    );

  // First split on strong sequential boundaries: ";", ". ", " then ", " and then ", " after that ", " next "
  const primaryParts = normalized
    .split(/(?:\s*;\s*|\.\s+|\s+(?:and\s+then|then|after\s+that|next\s+up)\s+)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const actionVerbLookahead =
    /^(?:please\s+)?(?:now\s+)?(?:also\s+)?(?:draw|create|add|spawn|sketch|build|make|put|place|drop|move|shift|nudge|slide|swap|switch|connect|link|wire|join|color|paint|tint|turn|animate|orbit|spin|rotate|tilt|float|pulse|bounce|wiggle|swing|scale|enlarge|shrink|align|distribute|arrange|stack|pack|stretch|flip|mirror|scatter|frame|group|ungroup|wrap|enclose|duplicate|clone|copy|label|rename|append|underline|circle\s+(?:that|this|it|the|around)|cross\s+out|strike\s+out|export|download|save|new\s+page|next\s+page|previous\s+page|show\s+grid|hide\s+grid|lock|unlock|harmonize|curate|zoom|bring|send|curve|delete|remove|erase|clear)\b/i;

  const finalClauses: string[] = [];

  for (const part of primaryParts) {
    if (
      hasExplicitStepsList &&
      !/\b(?:connect|animate|orbit|spin|color|paint|move|switch|harmonize|export|underline)\b/i.test(
        part,
      )
    ) {
      finalClauses.push(part);
      continue;
    }

    const subParts: string[] = [];
    const tokens = part.split(/(\s*,?\s+and\s+|\s*,\s+)/i);
    let current = tokens[0] ?? '';

    for (let i = 1; i < tokens.length; i += 2) {
      const sep = tokens[i] ?? '';
      const rhs = (tokens[i + 1] ?? '').trim();
      if (!rhs) continue;

      const isCreateConnectShorthand =
        /^(?:connect|link|wire)\s+(?:them|all|these|in\s+order|together)\b/i.test(rhs) &&
        /\b(?:draw|create|add|spawn|sketch|place|drop)\b/i.test(current);

      const isSwapOrBetween =
        /\b(?:swap|switch|exchange|trade|between)\b/i.test(current) && !/,/.test(sep);

      const isListContinuation =
        /\b(?:bullet\s+list|numbered\s+list|checklist|with\s+items?|with\s+bullets?)\b/i.test(
          current,
        ) && !/^(?:export|new\s+page|next\s+page|harmonize|switch\s+to)\b/i.test(rhs);

      if (
        !isCreateConnectShorthand &&
        !isSwapOrBetween &&
        !isListContinuation &&
        actionVerbLookahead.test(rhs)
      ) {
        if (current.trim()) subParts.push(current.trim());
        current = rhs;
      } else {
        current += sep + rhs;
      }
    }
    if (current.trim()) subParts.push(current.trim());
    finalClauses.push(...subParts);
  }

  return finalClauses.slice(0, 12);
}

/**
 * Rejects breaths, throat-clears, mumbles, and conversational filler so they NEVER mutate canvas state.
 */
export function isPureFillerOrNoise(rawText: string, words: WordWithConfidence[] = []): boolean {
  const clean = rawText
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!clean || clean.length < 2) return true;

  const toks = clean.split(' ').filter(Boolean);
  if (toks.length === 0) return true;

  if (toks.every((t) => FILLER_WORDS.has(t))) return true;

  if (words.length > 0) {
    const maxProb = Math.max(...words.map(([, p]) => p));
    const meanProb = words.reduce((s, [, p]) => s + p, 0) / words.length;
    if (maxProb < 0.36 || (toks.length <= 2 && meanProb < 0.4)) {
      return true;
    }
  }
  return false;
}

/**
 * HARD SAFETY LOCK: Shapes NEVER delete themselves.
 */
export function hasExplicitDeleteConsent(rawText: string, words: WordWithConfidence[] = []): boolean {
  const lower = rawText.replace(/[.?!,]+$/g, '').trim().toLowerCase();
  if (/\beraser\s+(?:tool|mode)\b|\bswitch\s+to\s+eraser\b/i.test(lower)) return false;
  const deleteVerbRe =
    /\b(delete|remove|erase|trash|destroy|get\s+rid\s+of|drop\s+(?:the|that|this))\b/i;
  if (!deleteVerbRe.test(lower)) return false;

  if (words.length > 0) {
    const destructiveWord = words.find(([w]) =>
      /^(delete|deleted|remove|erase|trash|destroy|rid)$/i.test(w.replace(/[^a-zA-Z]/g, '')),
    );
    if (destructiveWord && destructiveWord[1] < 0.48) return false;
  }
  return true;
}

/**
 * HARD SAFETY LOCK: Whole-canvas clear requires explicit multi-word clear/wipe consent.
 */
export function hasExplicitClearConsent(rawText: string, words: WordWithConfidence[] = []): boolean {
  const lower = rawText.replace(/[.?!,]+$/g, '').trim().toLowerCase();
  const clearPhraseRe =
    /\b(clear\s+(?:the\s+)?(?:whole\s+|entire\s+)?canvas|wipe\s+(?:the\s+)?(?:canvas|everything|all)|erase\s+(?:everything|all)|delete\s+(?:everything|all(?:\s+shapes)?)|remove\s+(?:everything|all(?:\s+shapes)?)|reset\s+(?:the\s+)?canvas|blank\s+canvas|start\s+over)\b/i;
  if (!clearPhraseRe.test(lower)) return false;

  if (words.length > 0) {
    const meanProb = words.reduce((s, [, p]) => s + p, 0) / words.length;
    if (meanProb < 0.5) return false;
  }
  return true;
}

/**
 * HARD SAFETY LOCK: Undo requires explicit spoken "undo" / "revert" / "step back".
 */
export function hasExplicitUndoConsent(rawText: string, words: WordWithConfidence[] = []): boolean {
  const lower = rawText.replace(/[.?!,]+$/g, '').trim().toLowerCase();
  if (!/\b(undo|revert|step\s+back)\b/i.test(lower)) return false;
  if (words.length > 0) {
    const undoWord = words.find(([w]) => /^(undo|revert|back)$/i.test(w.replace(/[^a-zA-Z]/g, '')));
    if (undoWord && undoWord[1] < 0.5) return false;
  }
  return true;
}

export function titleCaseLabel(s: string): string {
  const trimmed = s.replace(/^["'“”‘’]+|["'“”‘’.,!?]+$/g, '').trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\s+/)
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * Extracts pair & chain hints `(sourceHint, targetHint, chainLabels)` for connections, relative moves, orbits, and swaps!
 */
export function extractEntityPairHints(raw: string): {
  sourceHint: string | null;
  targetHint: string | null;
  chainLabels: string[];
  edgeLabel: string | null;
  relation: SpatialRelation | null;
  isSwap: boolean;
} {
  let cleaned = raw.replace(/[.?!]+$/g, '').trim();
  let edgeLabel: string | null = null;

  const edgeLblMatch = cleaned.match(
    /\s+(?:with\s+label|labeled|labelled|saying|reading|via)\s+["']?([^,.]+?)["']?$/i,
  );
  if (edgeLblMatch && edgeLblMatch[1]) {
    edgeLabel = titleCaseLabel(edgeLblMatch[1]);
    cleaned = cleaned.slice(0, edgeLblMatch.index).trim();
  }

  // 0. Arrow chain syntax: "A -> B -> C" or "connect A to B to C to D"
  if (cleaned.includes('->') || cleaned.includes('→')) {
    const hops = cleaned
      .replace(/^(?:please\s+)?(?:draw|create|connect|wire|link|sketch)\s+/i, '')
      .split(/\s*(?:->|→)\s*/)
      .map((h) => titleCaseLabel(h.replace(/^(?:the|a|an)\s+/i, '')))
      .filter(Boolean);
    if (hops.length >= 2) {
      return {
        sourceHint: hops[0],
        targetHint: hops[1],
        chainLabels: hops,
        edgeLabel,
        relation: null,
        isSwap: false,
      };
    }
  }

  const multiToMatch = cleaned.match(/^(?:please\s+)?(?:connect|wire|link|chain|pipe)\s+(.+)$/i);
  if (multiToMatch) {
    const body = multiToMatch[1];
    const toParts = body
      .split(/\s+(?:to|into)\s+/i)
      .map((p) => p.replace(/^(?:the|a|an)\s+/i, '').trim())
      .filter(Boolean);
    if (toParts.length >= 3) {
      return {
        sourceHint: toParts[0],
        targetHint: toParts[1],
        chainLabels: toParts.map(titleCaseLabel),
        edgeLabel,
        relation: null,
        isSwap: false,
      };
    }
  }

  // 1. Swap patterns: "swap X and Y", "switch X with Y"
  const swapMatch = cleaned.match(
    /\b(?:swap|switch|exchange|trade(?:\s+places)?(?:\s+between)?)\s+(?:the\s+)?(.+?)\s+(?:and|with)\s+(?:the\s+)?(.+)$/i,
  );
  if (swapMatch && !/\bswitch\s+to\b/i.test(cleaned)) {
    return {
      sourceHint: swapMatch[1].trim(),
      targetHint: swapMatch[2].trim(),
      chainLabels: [],
      edgeLabel: null,
      relation: null,
      isSwap: true,
    };
  }

  // 2. Relative placement patterns: "move/put/add X above/below/next to/left of/right of Y"
  const relMatch = cleaned.match(
    /\b(?:move|put|place|bring|shift|slide|set|position)\s+(?:the\s+)?(.+?)\s+(above|over|on\s+top\s+of|below|under|underneath|beneath|to\s+the\s+left\s+of|left\s+of|to\s+the\s+right\s+of|right\s+of|next\s+to|beside|near)\s+(?:the\s+)?(.+)$/i,
  );
  if (relMatch) {
    const rRaw = relMatch[2].toLowerCase();
    let relation: SpatialRelation = 'near';
    if (/above|over|top/.test(rRaw)) relation = 'above';
    else if (/below|under|beneath/.test(rRaw)) relation = 'below';
    else if (/left/.test(rRaw)) relation = 'left-of';
    else if (/right|next|beside/.test(rRaw)) relation = 'right-of';

    return {
      sourceHint: relMatch[1].trim(),
      targetHint: relMatch[3].trim(),
      chainLabels: [],
      edgeLabel: null,
      relation,
      isSwap: false,
    };
  }

  // 3. Orbit patterns: "make X orbit around Y", "orbit X around Y"
  const orbitMatch = cleaned.match(
    /\b(?:make|have|let|set)?\s*(?:the\s+)?(.+?)\s+(?:orbit|revolve|spin)\s+around\s+(?:the\s+)?(.+)$/i,
  );
  if (orbitMatch) {
    return {
      sourceHint: orbitMatch[1].trim(),
      targetHint: orbitMatch[2].trim(),
      chainLabels: [],
      edgeLabel: null,
      relation: null,
      isSwap: false,
    };
  }

  // 4. Connection patterns: "connect X to Y", "arrow from X to Y"
  const connPatterns = [
    /(?:connect|wire|link|point|draw\s+an?\s+arrow\s+from|arrow\s+from|join)\s+(?:the\s+)?(.+?)\s+(?:to|into|with|and|towards?)\s+(?:the\s+)?(.+)$/i,
    /from\s+(?:the\s+)?(.+?)\s+to\s+(?:the\s+)?(.+)$/i,
  ];
  for (const re of connPatterns) {
    const m = cleaned.match(re);
    if (m && !/\b(?:append|add\s+(?:bullet|item))\b/i.test(cleaned)) {
      const s = m[1].trim();
      const t = m[2].trim();
      if (!/^(them|all|everything|these|those)$/i.test(s)) {
        return {
          sourceHint: s,
          targetHint: t,
          chainLabels: [],
          edgeLabel,
          relation: null,
          isSwap: false,
        };
      }
    }
  }

  return {
    sourceHint: null,
    targetHint: null,
    chainLabels: [],
    edgeLabel: null,
    relation: null,
    isSwap: false,
  };
}

function detectExplicitColor(lower: string): TLDefaultColorStyle | null {
  if (/\b(light\s+red|pink|rose|blush|salmon|coral\s+pink)\b/.test(lower)) return 'light-red';
  if (/\b(light\s+green|mint|sage|lime|seafoam|pistachio)\b/.test(lower)) return 'light-green';
  if (/\b(light\s+blue|sky\s+blue|cyan|azure|turquoise|teal|ice\s+blue|cerulean)\b/.test(lower))
    return 'light-blue';
  if (/\b(light\s+violet|lavender|lilac|orchid|periwinkle|pastel\s+purple)\b/.test(lower))
    return 'light-violet';
  if (/\b(red|crimson|vermilion|scarlet|ruby|burgundy|coral)\b/.test(lower)) return 'red';
  if (/\b(orange|terracotta|amber|rust|copper|tangerine|persimmon)\b/.test(lower)) return 'orange';
  if (/\b(yellow|gold|golden|ochre|mustard|lemon)\b/.test(lower)) return 'yellow';
  if (/\b(green|emerald|forest|jade|pine|olive|moss)\b/.test(lower)) return 'green';
  if (/\b(blue|cobalt|navy|indigo|ultramarine|sapphire)\b/.test(lower)) return 'blue';
  if (/\b(violet|purple|plum|amethyst|magenta)\b/.test(lower)) return 'violet';
  if (/\b(white|ivory|alabaster|chalk|cream)\b/.test(lower)) return 'white';
  if (/\b(grey|gray|silver|slate|pewter|stone)\b/.test(lower)) return 'grey';
  if (/\b(black|charcoal|ebony|onyx)\b/.test(lower)) return 'black';
  return null;
}

function detectExplicitArchetype(lower: string): string | null {
  if (/\b(sticky\s*notes?|post[- ]?its?|memos?)\b/.test(lower)) return 'arch-sticky';
  if (/\b(check\s*box(?:es)?|todo\s+items?)\b/.test(lower)) return 'arch-checkbox';
  if (/\b(x[- ]?box(?:es)?|blockers?|anti[- ]?patterns?)\b/.test(lower)) return 'arch-xbox';
  if (/\b(octagons?|stop\s+signs?|firewalls?|guardrails?)\b/.test(lower)) return 'arch-octagon';
  if (/\b(pentagons?|shields?|crests?)\b/.test(lower)) return 'arch-pentagon';
  if (/\b(parallelograms?|rhombus(?:es)?|queues?|buffers?)\b/.test(lower)) return 'arch-rhombus';
  if (/\b(left\s+chevrons?|left\s+block\s+arrows?)\b/.test(lower)) return 'arch-chevron-left';
  if (/\b(chevrons?|block\s+arrows?|banners?)\b/.test(lower)) return 'arch-chevron';
  if (/\b(hexagons?|hex|engines?|processors?|workers?|microservices?)\b/.test(lower))
    return 'arch-hexagon';
  if (/\b(diamonds?|decisions?|routers?|gateways?\s+branch)\b/.test(lower)) return 'arch-diamond';
  if (/\b(trapezoids?|databases?|postgres|redis|sql|buckets?|warehouses?|storage)\b/.test(lower))
    return 'arch-database';
  if (/\b(clouds?|cdns?|internets?)\b/.test(lower)) return 'arch-cloud';
  if (/\b(triangles?|pyramids?|deltas?|wedges?)\b/.test(lower)) return 'arch-triangle';
  if (/\b(stars?|sparkles?)\b/.test(lower)) return 'arch-star';
  if (/\b(hearts?)\b/.test(lower)) return 'arch-heart';
  if (/\b(pills?|capsules?|ovals?|badges?|buttons?)\b/.test(lower)) return 'arch-pill';
  if (
    /\b(circles?|orbs?|spheres?|dots?|planets?|bubbles?)\b/.test(lower) &&
    !/\bin\s+a\s+circle\b/.test(lower) &&
    !/^(?:please\s+)?circle\s+(?:that|this|it|the|around)\b/.test(lower)
  ) {
    return 'arch-circle';
  }
  if (/\b(titles?|headings?|headlines?|quotes?|captions?|text\s+blocks?)\b/.test(lower))
    return 'arch-text';
  if (/\b(frames?|artboards?|viewports?)\b/.test(lower)) return 'arch-frame';
  if (/\b(rectangles?|boxes|box|cards?|squares?|blocks?|panels?|modules?|nodes?)\b/.test(lower))
    return 'arch-card';
  return null;
}

function detectExplicitBlueprint(lower: string): BlueprintKind | null {
  if (
    /\b(sequence\s+diagram|uml\s+sequence|request\s+response\s+(?:diagram|sequence|flow)|api\s+call\s+sequence|actor\s+lifelines?)\b/.test(
      lower,
    )
  ) {
    return 'sequence';
  }
  if (
    /\b(er\s+diagram|entity\s+relationship|database\s+schema|sql\s+schema|data\s+model\s+schema|tables?\s+and\s+foreign\s+keys?)\b/.test(
      lower,
    )
  ) {
    return 'er_schema';
  }
  if (
    /\b(user\s+journey|customer\s+journey|journey\s+map|experience\s+map|service\s+blueprint)\b/.test(
      lower,
    )
  ) {
    return 'journey';
  }
  if (
    /\b(solar\s+system|planetary\s+system|planets?\s+orbiting|atomic\s+model|atom\s+diagram|orbital\s+system)\b/.test(
      lower,
    )
  ) {
    return 'orbit_system';
  }
  if (
    /\b(neural\s+net(?:work)?|deep\s+learning|transformer\s+architecture|mlp|multi[- ]?layer\s+network)\b/.test(
      lower,
    )
  ) {
    return 'neural';
  }
  if (/\b(venn\s+diagram|overlapping\s+circles|ikigai|three\s+circle\s+overlap)\b/.test(lower)) {
    return 'venn';
  }
  if (
    /\b(funnel(?:\s+chart|\s+diagram)?|conversion\s+funnel|sales\s+funnel|marketing\s+funnel)\b/.test(
      lower,
    )
  ) {
    return 'funnel';
  }
  if (
    /\b(org\s+chart|organization\s+chart|tree\s+diagram|hierarchy\s+tree|taxonomy|family\s+tree|file\s+tree|decision\s+tree)\b/.test(
      lower,
    )
  ) {
    return 'tree';
  }
  if (
    /\b(cycle|flywheel|feedback\s+loop|closed\s+loop|lifecycle|circular\s+loop|water\s+cycle)\b/.test(
      lower,
    )
  ) {
    return 'cycle';
  }
  if (
    /\b(wireframe|login\s+screen|landing\s+page|app\s+screen|mobile\s+mockup|ui\s+mockup)\b/.test(
      lower,
    )
  ) {
    return 'wireframe';
  }
  if (
    /\b(state\s+machine|finite\s+state|automata|state\s+diagram|state\s+transitions?)\b/.test(
      lower,
    )
  ) {
    return 'state_machine';
  }
  if (
    /\b(layered\s+stack|tech\s+stack|platform\s+layers|architecture\s+layers|osi\s+model|cake\s+diagram)\b/.test(
      lower,
    )
  ) {
    return 'layers';
  }
  if (
    /\b(pros\s+and\s+cons|comparison\s+(?:chart|matrix)|side\s+by\s+side\s+comparison|versus\s+(?:chart|table)|before\s+and\s+after|option\s+a\s+(?:vs|and)\s+option\s+b)\b/.test(
      lower,
    )
  ) {
    return 'comparison';
  }
  if (
    /\b(three\s+by\s+three\s+table|3\s*x\s*3\s+table|data\s+table|pricing\s+table|spreadsheet(?:\s+grid)?|(?:draw|create|make|build|add)\s+(?:a\s+)?(?:\w+\s+)?table)\b/.test(
      lower,
    )
  ) {
    return 'table';
  }
  if (
    /\b(mind\s*map|brainstorm\s+map|concept\s+map|hub\s+and\s+spoke|radial\s+map)\b/.test(lower)
  ) {
    return 'mindmap';
  }
  if (/\b(kanban|sprint\s+board|task\s+board|todo\s+doing\s+done)\b/.test(lower)) {
    return 'kanban';
  }
  if (
    /\b(two\s+by\s+two|2\s*x\s*2|quadrant|swot|eisenhower\s+matrix|impact\s+effort)\b/.test(lower)
  ) {
    return 'quadrant';
  }
  if (/\b(timeline|roadmap|chronology|milestones?\s+horizon)\b/.test(lower)) {
    return 'timeline';
  }
  if (/\b(bento|dashboard\s+grid)\b/.test(lower)) {
    return 'bento';
  }
  if (
    /\b(flow\s*chart|workflow\s+diagram|process\s+flow|onboarding\s+flow|user\s+flow|checkout\s+flow)\b/.test(
      lower,
    )
  ) {
    return 'flowchart';
  }
  if (
    /\b(system\s+architecture|architecture\s+diagram|microservice\s+pipeline|backend\s+stack|rag\s+pipeline|cloud\s+topology)\b/.test(
      lower,
    )
  ) {
    return 'architecture';
  }
  return null;
}

function detectExplicitEdition(lower: string): string | null {
  if (/\b(bauhaus|weimar|werkbund)\b/.test(lower)) return 'bauhaus-archive';
  if (/\b(kyoto|washi|sumi|japanese\s+ink)\b/.test(lower)) return 'kyoto-washi';
  if (/\b(swiss|kunsthalle|basel)\b/.test(lower)) return 'swiss-grid';
  if (
    /\b(cyanotype|prussian\s+blueprint|blueprint\s+(?:theme|style|mode|aesthetic|edition))\b/.test(
      lower,
    )
  ) {
    return 'cyanotype-blueprint';
  }
  if (/\b(obsidian|monolith|brutalist\s+dark|dark\s+mode)\b/.test(lower))
    return 'obsidian-monolith';
  if (/\b(travertine|milan|editorial\s+vellum)\b/.test(lower)) return 'travertine-editorial';
  if (/\b(chalkboard|blackboard|schoolhouse\s+slate)\b/.test(lower)) return 'chalkboard-atelier';
  if (/\b(dieter\s+rams|kronberg|braun\s+industrial)\b/.test(lower)) return 'rams-industrial';
  return null;
}

function detectToolSwitch(lower: string): StudioToolId | null {
  if (
    /\b(laser(?:\s+pointer|\s+tool|\s+mode)?|presentation\s+laser|switch\s+to\s+laser)\b/.test(lower)
  ) {
    return 'laser';
  }
  if (
    /\b(highlighter(?:\s+tool|\s+mode)?|highlight\s+(?:tool|mode)|switch\s+to\s+highlighter)\b/.test(
      lower,
    )
  ) {
    return 'highlight';
  }
  if (
    /\b(pen\s+(?:mode|tool)|ink\s+(?:pen|mode|tool)|freehand\s+(?:pen|mode|tool|ink)|marker\s+(?:mode|tool)|draw\s+(?:tool|mode)|switch\s+to\s+(?:(?:\w+\s+)?(?:pen|marker|ink|draw))|(?:use|grab|pick)\s+(?:a\s+|the\s+)?(?:\w+\s+)?(?:pen|marker))\b/.test(
      lower,
    ) ||
    /^(?:please\s+)?(?:red|blue|green|black|orange|violet|yellow|white)\s+(?:pen|marker|ink)$/.test(
      lower,
    )
  ) {
    return 'draw';
  }
  if (/\b(hand\s+(?:tool|mode)|pan\s+(?:tool|mode)|grab\s+(?:tool|mode)|switch\s+to\s+hand)\b/.test(lower)) {
    return 'hand';
  }
  if (/\b(eraser\s+(?:tool|mode)|switch\s+to\s+eraser)\b/.test(lower)) {
    return 'eraser';
  }
  if (
    /\b(select\s+(?:tool|mode)|selection\s+(?:tool|mode)|pointer\s+(?:tool|mode)|cursor\s+(?:tool|mode)|switch\s+to\s+(?:select|pointer)|exit\s+(?:pen|draw|laser|highlighter|tool))\b/.test(
      lower,
    )
  ) {
    return 'select';
  }
  if (/\b(arrow\s+(?:tool|mode)|switch\s+to\s+arrow(?:\s+tool)?)\b/.test(lower)) {
    return 'arrow';
  }
  if (/\b(line\s+(?:tool|mode)|spline\s+tool|switch\s+to\s+line)\b/.test(lower)) {
    return 'line';
  }
  if (/\b(note\s+(?:tool|mode)|sticky\s+note\s+tool)\b/.test(lower)) {
    return 'note';
  }
  return null;
}

function detectSketchMotif(clean: string, lower: string): {
  motif: SketchMotif | null;
  targetHint: string | null;
  asSpline: boolean;
} {
  const asSpline = /\b(spline|smooth\s+curve|bezier|cubic)\b/.test(lower);

  const stripColorTail = (s: string) =>
    s
      .replace(
        /\s+(?:in|with)\s+(?:light\s+)?(?:red|blue|green|yellow|orange|violet|purple|black|white|grey|gray|crimson|emerald|gold)(?:\s+ink)?$/i,
        '',
      )
      .replace(/^(?:the|a|an|that|this|it)\s+/i, '')
      .trim();

  // 1. Deictic / targeted ink annotations: circle around, underline, cross out
  const circleAroundMatch = clean.match(
    /^(?:please\s+)?(?:draw\s+a\s+circle\s+around|put\s+a\s+ring\s+around|ring\s+around|circle\s+around|circle)\s+(.+)$/i,
  );
  if (circleAroundMatch) {
    const rawTarget = circleAroundMatch[1].trim();
    // Guard against "circle in the center" when preceded by "draw a circle"
    if (
      !/^(?:in\s+a\s+row|in\s+the\s+|on\s+the\s+|called\s+|named\s+)/i.test(rawTarget) ||
      /^circle\s+(?:that|this|it|around|the\s+)/i.test(lower)
    ) {
      const cleanedTarget = /^(?:that|this|it)$/i.test(stripColorTail(rawTarget))
        ? null
        : stripColorTail(rawTarget);
      return { motif: 'circle_around', targetHint: cleanedTarget || null, asSpline: false };
    }
  }

  const underlineMatch = clean.match(/^(?:please\s+)?(?:double\s+)?underline\s+(.+)$/i);
  if (underlineMatch) {
    const rawTarget = stripColorTail(underlineMatch[1]);
    return {
      motif: 'underline',
      targetHint: /^(?:that|this|it)$/i.test(rawTarget) ? null : rawTarget || null,
      asSpline: false,
    };
  }
  if (/^(?:please\s+)?(?:add\s+an?\s+)?underline$/i.test(lower)) {
    return { motif: 'underline', targetHint: null, asSpline: false };
  }

  const crossMatch = clean.match(
    /^(?:please\s+)?(?:cross\s+out|cross\s+(.+?)\s+out|strike\s+out|strike\s+through|strikethrough)\s*(.*)$/i,
  );
  if (crossMatch) {
    const rawTarget = stripColorTail((crossMatch[1] || crossMatch[2] || '').trim());
    return {
      motif: 'cross_out',
      targetHint: /^(?:that|this|it)$/i.test(rawTarget) ? null : rawTarget || null,
      asSpline: false,
    };
  }

  // 2. Standalone generative freehand ink & spline illustrations
  if (
    /\b(sine\s+wave|ocean\s+wave|wavy\s+line|squiggle|scribble|doodle|(?:sketch|draw)\s+(?:a\s+)?(?:\w+\s+)?wave)\b/.test(
      lower,
    )
  ) {
    return { motif: 'wave', targetHint: null, asSpline };
  }
  if (/\b(golden\s+spiral|(?:sketch|draw|create|add)\s+(?:a\s+)?(?:\w+\s+)?spiral|^spiral$)\b/.test(lower)) {
    return { motif: 'spiral', targetHint: null, asSpline: false };
  }
  if (
    /\b(sparkline|trend\s+line|growth\s+curve|(?:sketch|draw)\s+(?:a\s+)?(?:sparkline|trend|curve))\b/.test(
      lower,
    )
  ) {
    return { motif: 'sparkline', targetHint: null, asSpline };
  }
  if (
    /\b(divider\s+line|horizontal\s+divider|horizontal\s+rule|section\s+divider|(?:sketch|draw)\s+(?:a\s+)?divider)\b/.test(
      lower,
    )
  ) {
    return { motif: 'divider', targetHint: null, asSpline };
  }
  if (/\b(check\s*mark|tick\s+mark|(?:draw|sketch)\s+(?:a\s+)?(?:\w+\s+)?check)\b/.test(lower) && !/\bcheck\s*box\b/.test(lower)) {
    return { motif: 'checkmark', targetHint: null, asSpline: false };
  }
  if (/\b(lightning(?:\s+bolt)?|thunderbolt)\b/.test(lower)) {
    return { motif: 'lightning', targetHint: null, asSpline: false };
  }
  if (/\b(smiley(?:\s+face)?|happy\s+face)\b/.test(lower)) {
    return { motif: 'smiley', targetHint: null, asSpline: false };
  }
  if (/\b(curly\s+brace|calligraphic\s+bracket|(?:draw|sketch)\s+(?:a\s+)?bracket)\b/.test(lower)) {
    return { motif: 'bracket', targetHint: null, asSpline: false };
  }

  return { motif: null, targetHint: null, asSpline: false };
}

function detectPageCommand(clean: string, lower: string): {
  action: PageAction | null;
  name: string | null;
  pageNumber: number | null;
} {
  if (/\b(duplicate|clone|copy)\s+(?:this\s+|the\s+|current\s+)?(?:page|slide)\b/.test(lower)) {
    return { action: 'duplicate', name: null, pageNumber: null };
  }

  const renameMatch = clean.match(
    /\b(?:rename|title|name)\s+(?:this\s+|the\s+|current\s+)?(?:page|slide)\s+(?:to|as)\s+["']?(.+?)["']?$/i,
  );
  if (renameMatch && renameMatch[1]) {
    return { action: 'rename', name: titleCaseLabel(renameMatch[1]), pageNumber: null };
  }

  const newPageMatch = clean.match(
    /\b(?:create\s+(?:a\s+)?new|add\s+(?:a\s+)?new|new)\s+(?:page|slide)(?:\s+(?:called|named|titled|for)\s+["']?(.+?)["']?)?$/i,
  );
  if (newPageMatch) {
    return {
      action: 'new',
      name: newPageMatch[1] ? titleCaseLabel(newPageMatch[1]) : null,
      pageNumber: null,
    };
  }

  if (/\b(next\s+(?:page|slide)|forward\s+a\s+page)\b/.test(lower)) {
    return { action: 'next', name: null, pageNumber: null };
  }
  if (/\b(previous\s+(?:page|slide)|prev\s+(?:page|slide)|back\s+a\s+page|prior\s+page)\b/.test(lower)) {
    return { action: 'prev', name: null, pageNumber: null };
  }
  if (/\b(first\s+(?:page|slide)|go\s+to\s+(?:the\s+)?first\s+(?:page|slide))\b/.test(lower)) {
    return { action: 'first', name: null, pageNumber: 1 };
  }
  if (/\b(last\s+(?:page|slide)|go\s+to\s+(?:the\s+)?last\s+(?:page|slide))\b/.test(lower)) {
    return { action: 'last', name: null, pageNumber: null };
  }

  const gotoMatch = clean.match(
    /\b(?:go\s+to|switch\s+to|open|show)\s+(?:page|slide)\s+([1-9]\d*|one|two|three|four|five|six|seven|eight|nine|ten|[A-Za-z][\w\s-]{1,28})$/i,
  );
  if (gotoMatch && gotoMatch[1]) {
    const raw = gotoMatch[1].trim();
    const asInt = parseInt(raw, 10);
    if (!Number.isNaN(asInt)) {
      return { action: 'goto', name: null, pageNumber: asInt };
    }
    const wordNum = NUMBER_WORDS[raw.toLowerCase()];
    if (wordNum) {
      return { action: 'goto', name: null, pageNumber: wordNum };
    }
    return { action: 'goto', name: titleCaseLabel(raw), pageNumber: null };
  }

  return { action: null, name: null, pageNumber: null };
}

function detectExportCommand(lower: string): {
  format: ExportFormat | null;
  selectionOnly: boolean;
} {
  const selectionOnly = /\b(selected|selection)\b/.test(lower);
  if (
    /\b(export|download|save)\s+(?:(?:the\s+)?(?:selected|selection)\s+)?(?:as\s+|the\s+|this\s+)?svg\b|\bsave\s+vector\b/.test(
      lower,
    )
  ) {
    return { format: 'svg', selectionOnly };
  }
  if (
    /\b(export|download|save)\s+(?:as\s+)?(?:json|tldr|backup|project\s+file)\b/.test(lower)
  ) {
    return { format: 'json', selectionOnly: false };
  }
  if (
    /\b(copy\s+(?:(?:the\s+)?(?:selected|selection)\s+)?(?:canvas|diagram|artwork|image|png)(?:\s+to\s+clipboard)?|copy\s+to\s+clipboard)\b/.test(
      lower,
    )
  ) {
    return { format: 'copy', selectionOnly };
  }
  if (
    /\b(export\s+(?:(?:the\s+)?(?:selected|selection)\s+)?(?:as\s+|the\s+|this\s+)?(?:png|image|diagram|canvas|snapshot)|download\s+(?:(?:the\s+)?(?:selected|selection)\s+)?(?:png|image|diagram|snapshot)|save\s+(?:(?:the\s+)?(?:selected|selection)\s+)?(?:as\s+)?(?:png|image|snapshot)|take\s+a\s+(?:snapshot|screenshot))\b/.test(
      lower,
    )
  ) {
    return { format: 'png', selectionOnly };
  }
  return { format: null, selectionOnly: false };
}

export function parseVoiceSlots(rawText: string, ghostText = ''): ParsedSlots {
  const full = `${rawText} ${ghostText}`.replace(/\s+/g, ' ').trim();
  const clean = full.replace(/[.?!,]+$/g, '').trim();
  const lower = clean.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);

  const isTwoByTwo = /\b(two\s+by\s+two|2\s*x\s*2|2\s+by\s+2|three\s+by\s+three|3\s*x\s*3)\b/i.test(
    lower,
  );
  const hasDegrees = /\b\d+\s*degrees?\b/i.test(lower);
  const pageDetected = detectPageCommand(clean, lower);

  let count: number | null = null;
  if (!isTwoByTwo && !hasDegrees && !pageDetected.action) {
    const halfDozen = /\bhalf\s+(?:a\s+)?dozen\b/i.test(lower);
    if (halfDozen) {
      count = 6;
    } else {
      const digitMatch = lower.match(/\b([1-9]|1[0-9]|2[0-4])\b/);
      if (digitMatch) {
        count = parseInt(digitMatch[1], 10);
      } else {
        for (const w of words) {
          if (
            w in NUMBER_WORDS &&
            w !== 'a' &&
            w !== 'an' &&
            w !== 'first' &&
            w !== 'second' &&
            w !== 'third' &&
            w !== 'fourth' &&
            w !== 'fifth'
          ) {
            count = NUMBER_WORDS[w];
            break;
          }
        }
      }
    }
  }

  // Spoken single label
  let singleLabel: string | null = null;
  const labelPatterns = [
    /\b(?:called|named|labeled|labelled|titled)\s+["']?([^,.]+?)["']?(?:\s+with\s+.*|\s+and\s+.*)?$/i,
    /\b(?:saying|reading)\s+["']?([^,.]+?)["']?(?:\s+and\s+.*)?$/i,
    /^(?:write|type|caption\s+it|label\s+(?:it|that|this)|rename\s+(?:it|that|this)\s+to|title\s+it)\s+["']?(.+?)["']?$/i,
  ];
  for (const re of labelPatterns) {
    const m = clean.match(re);
    if (m && m[1] && !/,/.test(m[1])) {
      singleLabel = titleCaseLabel(m[1]);
      break;
    }
  }

  // Rich-text card detection (bullet list, numbered list, checklist, code card)
  let richCardKind: ParsedSlots['richCardKind'] = null;
  let codeSnippet: string | null = null;
  if (/\b(bullet(?:ed)?\s+list|bullet\s+points?|note\s+with\s+bullets?)\b/.test(lower)) {
    richCardKind = 'bullet';
  } else if (/\b(numbered\s+list|ordered\s+list)\b/.test(lower)) {
    richCardKind = 'ordered';
  } else if (/\b(checklist(?:\s+card|\s+note)?|todo\s+list|task\s+list)\b/.test(lower)) {
    richCardKind = 'checklist';
  } else if (/\b(code\s+(?:card|block|snippet|box))\b/.test(lower)) {
    richCardKind = 'code';
    const codeMatch = clean.match(
      /\bcode\s+(?:card|block|snippet|box)(?:\s+(?:called|titled|for)\s+([^:]+?))?(?:\s+(?:saying|with|reading|:)\s+(.+))?$/i,
    );
    if (codeMatch) {
      if (codeMatch[1] && !singleLabel) singleLabel = titleCaseLabel(codeMatch[1]);
      if (codeMatch[2]) codeSnippet = codeMatch[2].trim();
    }
  }

  // Append text / bullet to existing shape: "append Ship live to Goals", "add bullet Write tests to that note"
  let appendText: string | null = null;
  let appendTargetHint: string | null = null;
  const appendMatch = clean.match(
    /^(?:please\s+)?(?:append|add\s+(?:a\s+)?(?:bullet|item|line|point))\s+["']?(.+?)["']?(?:\s+(?:to|into|inside|on)\s+(?:the\s+)?(.+))?$/i,
  );
  if (appendMatch && appendMatch[1]) {
    appendText = appendMatch[1].trim();
    const rawTarget = (appendMatch[2] || '').trim();
    appendTargetHint =
      !rawTarget || /^(?:it|that|this|that\s+note|that\s+card|this\s+note|this\s+card)$/i.test(rawTarget)
        ? null
        : rawTarget;
  }

  // Spoken list of labels: "with steps A, B, and C", "with items A, B, C", "colon: A, B, C"
  let listLabels: string[] = [];
  const listMatch = clean.match(
    /(?:\b(?:with\s+(?:steps?|columns?|nodes?|branches|stages|items?|bullets?|points?|tasks?|cards?|planets?|layers?)|with|named|called|for|of|including)\s+|:\s*)([A-Za-z0-9_/-][A-Za-z0-9_/\- ,]+)$/i,
  );
  if (
    listMatch &&
    listMatch[1] &&
    (listMatch[1].includes(',') || /\band\b/i.test(listMatch[1]) || richCardKind !== null)
  ) {
    const parts = listMatch[1]
      .split(/,|\band\b/i)
      .map((p) => titleCaseLabel(p))
      .filter((p) => p.length > 0 && p.length <= 40);
    if (parts.length >= 2 || (richCardKind !== null && parts.length >= 1)) {
      listLabels = parts;
      if (singleLabel && listLabels.length >= 2 && !/\b(?:called|named|titled)\b/i.test(clean.split(/\bwith\b/i)[0] ?? '')) {
        singleLabel = null;
      }
    }
  }

  // Extract conceptual topic ("mindmap about Space Exploration", "funnel for B2B Sales")
  let topic: string | null = null;
  const topicMatch = clean.match(
    /\b(?:about|for|around|explaining|showing|illustrating|mapping(?:\s+out)?|of)\s+["']?([A-Za-z0-9][A-Za-z0-9\s&-]{2,36})["']?$/i,
  );
  if (topicMatch && topicMatch[1] && listLabels.length === 0 && !richCardKind) {
    const cand = topicMatch[1].trim();
    if (
      !/^(it|them|all|everything|these|those|the\s+canvas|the\s+center|the\s+left|the\s+right|a\s+row|a\s+column|a\s+grid|a\s+circle)$/i.test(
        cand,
      )
    ) {
      topic = titleCaseLabel(cand);
    }
  }

  const toolSwitch = detectToolSwitch(lower);
  const sketchInfo = detectSketchMotif(clean, lower);
  const exportInfo = detectExportCommand(lower);

  const explicitArchetypeId =
    toolSwitch || sketchInfo.motif || richCardKind ? null : detectExplicitArchetype(lower);
  const explicitBlueprintId =
    toolSwitch || sketchInfo.motif || richCardKind ? null : detectExplicitBlueprint(lower);
  const explicitColor = detectExplicitColor(lower);
  const explicitEditionId = detectExplicitEdition(lower);

  const connectCreated =
    /\b(and\s+(?:connect|link|wire)|connected|linked\s+together|with\s+arrows)\b/i.test(lower);
  const connectAll =
    /\b(connect|link|wire)\s+(them(\s+all)?|everything|all(\s+of\s+them)?|these|the\s+shapes|in\s+order|in\s+sequence)\b/i.test(
      lower,
    );
  const {
    sourceHint,
    targetHint,
    chainLabels,
    edgeLabel,
    relation: spatialRelation,
    isSwap,
  } = extractEntityPairHints(clean);

  // Spatial anchors & directions (including deictic "right here" / "at cursor"!)
  let anchor: SpatialAnchor | null = null;
  if (
    /\b(right\s+here|over\s+here|at\s+(?:the\s+)?(?:cursor|pointer)|under\s+(?:my\s+)?(?:finger|cursor)|at\s+this\s+spot)\b/.test(
      lower,
    ) ||
    /\b(?:put|place|add|drop|spawn|create|draw)\s+.+\s+here$/.test(lower)
  ) {
    anchor = 'pointer';
  } else if (/\b(top\s+left|upper\s+left)\b/.test(lower)) anchor = 'top-left';
  else if (/\b(top\s+right|upper\s+right)\b/.test(lower)) anchor = 'top-right';
  else if (/\b(bottom\s+left|lower\s+left)\b/.test(lower)) anchor = 'bottom-left';
  else if (/\b(bottom\s+right|lower\s+right)\b/.test(lower)) anchor = 'bottom-right';
  else if (/\b(at\s+the\s+top|to\s+the\s+top|top\s+edge|top\s+center|upper\s+edge)\b/.test(lower))
    anchor = 'top';
  else if (
    /\b(at\s+the\s+bottom|to\s+the\s+bottom|bottom\s+edge|bottom\s+center)\b/.test(lower)
  )
    anchor = 'bottom';
  else if (/\b(on\s+the\s+left|far\s+left|left\s+edge|left\s+side)\b/.test(lower)) anchor = 'left';
  else if (/\b(on\s+the\s+right|far\s+right|right\s+edge|right\s+side)\b/.test(lower))
    anchor = 'right';
  else if (
    /\b(in\s+the\s+(?:center|middle)|to\s+the\s+(?:center|middle)|center\s+(?:it|them|everything))\b/.test(
      lower,
    )
  ) {
    anchor = 'center';
  }

  let direction: ParsedSlots['direction'] = null;
  if (/\b(left|leftward|west)\b/.test(lower)) direction = 'left';
  else if (/\b(right|rightward|east)\b/.test(lower)) direction = 'right';
  else if (/\b(up|upward|higher|north)\b/.test(lower)) direction = 'up';
  else if (/\b(down|downward|lower|south)\b/.test(lower)) direction = 'down';
  else if (/\b(center|middle)\b/.test(lower)) direction = 'center';

  let moveDistance: ParsedSlots['moveDistance'] = 'normal';
  if (/\b(tiny|slightly|little\s+bit|nudge|hair|inch)\b/.test(lower)) moveDistance = 'small';
  else if (/\b(way\s+over|far|a\s+lot|all\s+the\s+way|much\s+further|big\s+step)\b/.test(lower))
    moveDistance = 'far';

  // Native tldraw Group / Ungroup, Pack, Stack, Stretch, Flip, Grid & Snap, Studio Guide
  let groupAction: 'group' | 'ungroup' | null = null;
  if (/\bungroup\b/.test(lower)) {
    groupAction = 'ungroup';
  } else if (
    /\bgroup\s+(?:them|these|those|all|everything|the\s+shapes|selected)(?:\s+together)?$/.test(
      lower,
    )
  ) {
    groupAction = 'group';
  }

  const packShapes =
    /\b(pack\s+(?:shapes|them|everything|all|cards|nodes)|tightly\s+pack)\b/.test(lower);

  let stackDirection: 'horizontal' | 'vertical' | null = null;
  if (/\bstack\s+(?:them\s+|shapes\s+|everything\s+)?horizontally\b/.test(lower)) {
    stackDirection = 'horizontal';
  } else if (/\bstack\s+(?:them\s+|shapes\s+|everything\s+)?vertically\b/.test(lower)) {
    stackDirection = 'vertical';
  }

  let stretchDirection: 'horizontal' | 'vertical' | 'both' | null = null;
  if (/\b(same\s+size|match\s+size|equal\s+size|uniform\s+size)\b/.test(lower)) {
    stretchDirection = 'both';
  } else if (
    /\b(stretch\s+horizontally|same\s+width|match\s+width|equal\s+width)\b/.test(lower)
  ) {
    stretchDirection = 'horizontal';
  } else if (
    /\b(stretch\s+vertically|same\s+height|match\s+height|equal\s+height)\b/.test(lower)
  ) {
    stretchDirection = 'vertical';
  }

  let flipAxis: 'horizontal' | 'vertical' | null = null;
  if (/\b(flip|mirror)\s+(?:it\s+|them\s+|that\s+)?horizontally\b/.test(lower)) {
    flipAxis = 'horizontal';
  } else if (/\b(flip|mirror)\s+(?:it\s+|them\s+|that\s+)?vertically\b/.test(lower)) {
    flipAxis = 'vertical';
  }

  let gridMode: boolean | null = null;
  if (/\b(show\s+(?:the\s+)?grid|turn\s+on\s+(?:the\s+)?grid|enable\s+grid|grid\s+mode\s+on|grid\s+on)\b/.test(lower)) {
    gridMode = true;
  } else if (
    /\b(hide\s+(?:the\s+)?grid|turn\s+off\s+(?:the\s+)?grid|disable\s+grid|grid\s+mode\s+off|grid\s+off)\b/.test(
      lower,
    )
  ) {
    gridMode = false;
  }

  let snapMode: boolean | null = null;
  if (
    /\b(enable\s+snap(?:ping)?|turn\s+on\s+snap(?:ping)?|snap\s+mode\s+on|snap\s+on)\b/.test(lower)
  ) {
    snapMode = true;
  } else if (
    /\b(disable\s+snap(?:ping)?|turn\s+off\s+snap(?:ping)?|snap\s+mode\s+off|snap\s+off)\b/.test(
      lower,
    )
  ) {
    snapMode = false;
  }

  const studioGuide =
    /\b(what\s+can\s+i\s+say|show\s+(?:voice\s+)?(?:commands?|examples?|guide)|studio\s+guide|voice\s+guide|help\s+card)\b/.test(
      lower,
    );

  let arrangement: ArrangementMode | null = null;
  if (
    /\b(in\s+a\s+row|horizontal\s+row|horizontally|side\s+by\s+side|in\s+a\s+line)\b/.test(lower) &&
    !stackDirection &&
    !stretchDirection &&
    !flipAxis
  ) {
    arrangement = 'row';
  } else if (
    /\b(in\s+a\s+column|vertical\s+column|vertically|stack(?:ed)?)\b/.test(lower) &&
    !stackDirection &&
    !stretchDirection &&
    !flipAxis
  ) {
    arrangement = 'column';
  } else if (/\b(in\s+a\s+grid|neat\s+grid|tidy\s+grid)\b/.test(lower)) {
    arrangement = 'grid';
  } else if (
    /\b(in\s+a\s+(?:circle|ring)|circular\s+ring|around\s+in\s+a\s+circle)\b/.test(lower)
  ) {
    arrangement = 'circle';
  } else if (
    /\b(scatter(?:ed)?|constellation|spread\s+out\s+randomly|organic\s+scatter)\b/.test(lower)
  ) {
    arrangement = 'scatter';
  }

  // Align / Distribute modes
  let alignMode: AlignDistributeMode | null = null;
  if (/\bdistribute\s+horizontally|even\s+horizontal\s+spacing\b/.test(lower))
    alignMode = 'distribute-horizontal';
  else if (
    /\bdistribute\s+vertically|even\s+vertical\s+spacing|distribute\s+evenly\b/.test(lower)
  )
    alignMode = 'distribute-vertical';
  else if (/\balign\s+(?:to\s+the\s+)?left\b/.test(lower)) alignMode = 'left';
  else if (/\balign\s+(?:to\s+the\s+)?right\b/.test(lower)) alignMode = 'right';
  else if (/\balign\s+(?:to\s+the\s+)?top\b/.test(lower)) alignMode = 'top';
  else if (/\balign\s+(?:to\s+the\s+)?bottom\b/.test(lower)) alignMode = 'bottom';
  else if (/\balign\s+(?:middle|center\s+vertically|vertical\s+center)\b/.test(lower))
    alignMode = 'center-vertical';
  else if (/\balign\s+(?:center|horizontally)\b/.test(lower)) alignMode = 'center-horizontal';

  // Rotation
  let rotationDegrees: number | null = null;
  let rotationAbsolute = false;
  const degMatch = lower.match(
    /\b(?:rotate|turn|angle|tilt)\s+(?:it\s+|them\s+)?(-?\d{1,3})\s*(?:deg(?:rees?)?)?\b/,
  );
  if (degMatch) {
    rotationDegrees = parseInt(degMatch[1], 10);
  } else if (/\b(flip\s+upside\s+down|rotate\s+180|half\s+turn)\b/.test(lower)) {
    rotationDegrees = 180;
  } else if (/\b(quarter\s+turn|ninety\s+degrees)\b/.test(lower)) {
    rotationDegrees = 90;
  } else if (/\b(forty[- ]?five\s+degrees)\b/.test(lower)) {
    rotationDegrees = 45;
  } else if (/\b(tilt\s+left)\b/.test(lower)) {
    rotationDegrees = -15;
  } else if (/\b(tilt\s+right|tilt(?:\s+it|\s+slightly)?)\b/.test(lower)) {
    rotationDegrees = 15;
  } else if (/\b(straighten|reset\s+rotation|upright|level\s+it)\b/.test(lower)) {
    rotationDegrees = 0;
    rotationAbsolute = true;
  }

  // Z-order
  let zOrder: 'front' | 'back' | null = null;
  if (/\b(bring\s+(?:to\s+)?(?:the\s+)?front|move\s+to\s+front|on\s+top\s+layer)\b/.test(lower))
    zOrder = 'front';
  else if (/\b(send\s+(?:to\s+)?(?:the\s+)?back|push\s+to\s+back|behind\s+everything)\b/.test(lower))
    zOrder = 'back';

  // Frame grouping
  let frameGroupLabel: string | null = null;
  const isFrameGroup =
    !groupAction &&
    /\b(?:put\s+a\s+frame\s+around|frame\s+(?:all|everything|them|these|those)|group\s+(?:all|everything|them|these|those)\s+in\s+a\s+frame|wrap\s+(?:all|everything|them|these)(?:\s+in\s+a\s+frame)?|enclose\s+(?:them|everything))\b/i.test(
      lower,
    );
  if (isFrameGroup) {
    frameGroupLabel = singleLabel ?? topic ?? 'Studio Group';
  }

  // Arrow styling
  let arrowKindOverride: 'arc' | 'elbow' | null = null;
  if (
    /\b(curve(?:d)?\s+(?:the\s+)?arrows?|arc(?:ed)?\s+(?:the\s+)?(?:arrows?|connectors?)|smooth\s+arrows?)\b/.test(
      lower,
    )
  ) {
    arrowKindOverride = 'arc';
  } else if (
    /\b(straight(?:en)?\s+(?:the\s+)?arrows?|elbow\s+(?:arrows?|connectors?)|orthogonal\s+arrows?)\b/.test(
      lower,
    )
  ) {
    arrowKindOverride = 'elbow';
  }
  const reverseArrows = /\b(reverse\s+(?:the\s+)?arrows?|flip\s+arrow\s+direction)\b/.test(lower);

  // Size override (s, m, l, xl)
  let sizeOverride: TLDefaultSizeStyle | null = null;
  if (/\b(extra\s+large|huge\s+text|giant\s+text|xl\s+size|thick\s+stroke|bold\s+pen)\b/.test(lower))
    sizeOverride = 'xl';
  else if (/\b(large\s+text|big\s+text|bold\s+large|thick\s+pen)\b/.test(lower)) sizeOverride = 'l';
  else if (/\b(small\s+text|fine\s+print|compact\s+text|fine\s+pen|thin\s+pen)\b/.test(lower))
    sizeOverride = 's';

  // Scale factor
  let scaleFactor: number | null = null;
  if (/\b(double(?:\s+the)?\s+size|twice\s+as\s+big|much\s+bigger|huge)\b/.test(lower))
    scaleFactor = 1.65;
  else if (/\b(bigger|larger|scale\s+up|enlarge|grow|increase\s+size|wider)\b/.test(lower))
    scaleFactor = 1.32;
  else if (/\b(much\s+smaller|half\s+size)\b/.test(lower)) scaleFactor = 0.6;
  else if (/\b(smaller|shrink|scale\s+down|reduce\s+size)\b/.test(lower)) scaleFactor = 0.75;

  // Animation slots
  let animationKind: CatalogAnimationKind | null = null;
  if (
    /\b(stop\s+(?:animating|animation|moving|spinning|orbiting|bouncing|floating)|freeze(?:\s+everything|\s+all|\s+motion)?|pause\s+(?:animation|motion)|hold\s+still|calm\s+down)\b/.test(
      lower,
    )
  ) {
    animationKind = 'stop';
  } else if (/\b(orbit|orbiting|revolve|revolving|satellite)\b/.test(lower)) {
    animationKind = 'orbit';
  } else if (/\b(float|floating|levitate|hover|bob|bobbing|zero\s+gravity)\b/.test(lower)) {
    animationKind = 'float';
  } else if (/\b(pulse|pulsing|breathe|breathing|heartbeat|throb)\b/.test(lower)) {
    animationKind = 'pulse';
  } else if (/\b(spin|spinning|twirl)\b/.test(lower) || /\brotate\s+continuously\b/.test(lower)) {
    animationKind = 'spin';
  } else if (/\b(bounce|bouncing|jump|jumping|hop|hopping)\b/.test(lower)) {
    animationKind = 'bounce';
  } else if (
    /\b(wiggle|wiggling|shake|shaking|jitter|vibrate|vibrating|shimmy)\b/.test(lower)
  ) {
    animationKind = 'wiggle';
  } else if (/\b(pendulum|swing|swinging|sway|swaying|rocking)\b/.test(lower)) {
    animationKind = 'pendulum';
  } else if (/\b(figure\s+eight|figure\s+8|infinity|dance|dancing|weave)\b/.test(lower)) {
    animationKind = 'figure8';
  } else if (/\b(patrol|oscillate|glide|slide\s+back\s+and\s+forth|drift)\b/.test(lower)) {
    animationKind = 'drift';
  } else if (/\b(animate|bring\s+to\s+life|make\s+(?:it|them|everything)\s+alive)\b/.test(lower)) {
    animationKind = 'float';
  }

  let tempoMultiplier: number | null = null;
  if (/\b(faster|speed\s+up|quicker|double\s+speed|turbo)\b/.test(lower)) tempoMultiplier = 1.6;
  else if (
    /\b(slower|slow\s+down|slow\s+motion|gentle|gently|calmer|half\s+speed)\b/.test(lower)
  )
    tempoMultiplier = 0.62;

  const reverseAnimation =
    /\b(reverse|counter\s*clockwise|opposite\s+direction|backwards)\b/.test(lower) &&
    !reverseArrows;

  // Surface overrides
  let dashOverride: TLDefaultDashStyle | null = null;
  if (/\b(dashed|dash\s+line)\b/.test(lower)) dashOverride = 'dashed';
  else if (/\b(dotted|dots)\b/.test(lower)) dashOverride = 'dotted';
  else if (/\b(sketchy|hand\s*drawn|rough|chalk)\b/.test(lower)) dashOverride = 'draw';
  else if (/\b(crisp\s+solid|clean\s+solid\s+line|solid\s+lines?)\b/.test(lower))
    dashOverride = 'solid';

  let fillOverride: TLDefaultFillStyle | null = null;
  if (/\b(no\s+fill|hollow|transparent|outline\s+only|unfilled)\b/.test(lower))
    fillOverride = 'none';
  else if (/\b(solid\s+fill|filled\s+solid)\b/.test(lower)) fillOverride = 'solid';
  else if (/\b(semi\s+fill|soft\s+fill|wash)\b/.test(lower)) fillOverride = 'semi';
  else if (/\b(pattern\s+fill|hatched)\b/.test(lower)) fillOverride = 'pattern';

  let fontOverride: TLDefaultFontStyle | null = null;
  if (/\b(serif|editorial\s+font|literary)\b/.test(lower)) fontOverride = 'serif';
  else if (/\b(mono|monospace|code\s+font|terminal\s+font)\b/.test(lower)) fontOverride = 'mono';
  else if (/\b(sans|sans\s+serif|clean\s+font)\b/.test(lower)) fontOverride = 'sans';
  else if (/\b(handwriting|script\s+font)\b/.test(lower)) fontOverride = 'draw';

  const hasCreateVerb =
    /^(?:please\s+)?(?:now\s+)?(?:also\s+)?(?:draw|create|add|spawn|sketch|build|drop|place\s+a|put\s+a|make\s+a|give\s+me\s+a|show\s+(?:me\s+)?a)\b/i.test(
      lower,
    );

  // Crisp lexical intent routing (sub-millisecond fast path!)
  let lexicalIntent: IntentKind | null = null;
  if (studioGuide) {
    lexicalIntent = 'studio_guide';
  } else if (exportInfo.format !== null) {
    lexicalIntent = 'export_canvas';
  } else if (pageDetected.action !== null) {
    lexicalIntent = 'manage_page';
  } else if (toolSwitch !== null) {
    lexicalIntent = 'switch_tool';
  } else if (gridMode !== null || snapMode !== null) {
    lexicalIntent = 'toggle_grid_snap';
  } else if (appendText !== null) {
    lexicalIntent = 'append_text';
  } else if (richCardKind !== null) {
    lexicalIntent = 'rich_text_card';
  } else if (sketchInfo.motif !== null) {
    lexicalIntent = 'sketch_ink';
  } else if (groupAction !== null) {
    lexicalIntent = 'group_ungroup';
  } else if (packShapes || stackDirection !== null || stretchDirection !== null) {
    lexicalIntent = 'layout_pack_stack';
  } else if (flipAxis !== null) {
    lexicalIntent = 'transform_flip';
  } else if (
    /\b(harmoni[sz]e|critique|curate|auto\s*style|balance\s+(?:the\s+)?(?:design|composition|canvas|layout)|polish\s+(?:the\s+)?(?:canvas|design|diagram))\b/i.test(
      lower,
    )
  ) {
    lexicalIntent = 'vision_harmonize';
  } else if (
    explicitEditionId &&
    !hasCreateVerb &&
    !explicitBlueprintId &&
    !explicitArchetypeId
  ) {
    lexicalIntent = 'apply_aesthetic';
  } else if (isFrameGroup) {
    lexicalIntent = 'frame_group';
  } else if (isSwap) {
    lexicalIntent = 'transform_swap';
  } else if (
    (chainLabels.length >= 2 ||
      (/\b(?:connect|wire|link|draw\s+an?\s+arrow\s+from|arrow\s+from|join)\b/i.test(lower) &&
        (sourceHint !== null || connectAll))) &&
    !hasCreateVerb
  ) {
    lexicalIntent = 'connect_shapes';
  } else if (explicitBlueprintId) {
    lexicalIntent = 'compose_layout';
  } else if (
    hasCreateVerb &&
    (explicitArchetypeId || count !== null || singleLabel !== null || listLabels.length > 0)
  ) {
    lexicalIntent = 'create_shape';
  } else if (spatialRelation && !hasCreateVerb) {
    lexicalIntent = 'transform_move_relative';
  } else if (
    arrowKindOverride !== null ||
    reverseArrows ||
    (/\barrows?\b/.test(lower) && dashOverride !== null)
  ) {
    lexicalIntent = 'style_arrows';
  } else if (alignMode !== null) {
    lexicalIntent = 'transform_align_distribute';
  } else if (rotationDegrees !== null) {
    lexicalIntent = 'transform_rotate';
  } else if (zOrder !== null) {
    lexicalIntent = 'z_order';
  } else if (animationKind === 'stop') {
    lexicalIntent = 'stop_animation';
  } else if (animationKind !== null && !hasCreateVerb) {
    lexicalIntent = 'animate_shapes';
  } else if (/^(please\s+)?(undo|undo\s+that|step\s+back|revert(?:\s+last)?)$/.test(lower)) {
    lexicalIntent = 'history_undo';
  } else if (/^(please\s+)?(redo|redo\s+that)$/.test(lower)) {
    lexicalIntent = 'history_redo';
  } else if (hasExplicitClearConsent(clean)) {
    lexicalIntent = 'clear_canvas';
  } else if (hasExplicitDeleteConsent(clean)) {
    lexicalIntent = 'delete_shapes';
  } else if (/\b(duplicate|clone|make\s+(?:\w+\s+)?cop(?:y|ies))\b/.test(lower)) {
    lexicalIntent = 'transform_duplicate';
  } else if (/\b(lock|pin)\s+(it|that|this|them|all|everything|the\s+.+)$/.test(lower)) {
    lexicalIntent = 'lock_shapes';
  } else if (/\b(unlock|unpin)\s+(it|that|this|them|all|everything|the\s+.+)$/.test(lower)) {
    lexicalIntent = 'unlock_shapes';
  } else if (/^(please\s+)?(zoom\s+in|closer|magnify)$/.test(lower)) {
    lexicalIntent = 'camera_zoom_in';
  } else if (/^(please\s+)?(zoom\s+out|wider\s+view|step\s+back\s+camera)$/.test(lower)) {
    lexicalIntent = 'camera_zoom_out';
  } else if (
    /\b(zoom\s+to\s+fit|fit\s+everything|frame\s+everything|show\s+whole\s+canvas|reset\s+view)\b/.test(
      lower,
    )
  ) {
    lexicalIntent = 'camera_fit';
  } else if (
    arrangement !== null &&
    /\b(arrange|align|tidy|organize|stack|line\s+up|scatter|put\s+them|place\s+them)\b/.test(
      lower,
    ) &&
    !hasCreateVerb
  ) {
    lexicalIntent = 'transform_arrange';
  } else if (scaleFactor !== null && !hasCreateVerb) {
    lexicalIntent = 'transform_scale';
  } else if (
    explicitColor !== null &&
    /\b(color|paint|tint|turn|make)\b/.test(lower) &&
    !hasCreateVerb
  ) {
    lexicalIntent = 'style_color';
  } else if (
    (dashOverride !== null ||
      fillOverride !== null ||
      fontOverride !== null ||
      sizeOverride !== null) &&
    !hasCreateVerb
  ) {
    lexicalIntent = 'style_stroke_fill';
  } else if (
    singleLabel !== null &&
    /^(?:write|type|caption|label|rename|title)\b/i.test(lower) &&
    !hasCreateVerb
  ) {
    lexicalIntent = 'edit_label';
  } else if (
    /^(?:please\s+)?(?:move|shift|nudge|slide|push|pull|bring|put|drag)\b/.test(lower) &&
    !hasCreateVerb
  ) {
    if (direction || anchor) lexicalIntent = 'transform_move';
  } else if (
    !hasCreateVerb &&
    words.length <= 4 &&
    explicitArchetypeId !== null &&
    !/\b(delete|remove|move|color|spin|orbit)\b/.test(lower)
  ) {
    // Ultra-terse rapid-fire shorthand! e.g. "red circle", "three blue stars", "sticky note"
    lexicalIntent = 'create_shape';
  } else if (
    words.length <= 3 &&
    direction !== null &&
    /^(left|right|up|down|move\s+\w+|nudge\s+\w+)$/.test(lower)
  ) {
    // Ultra-terse rapid movement shorthand! e.g. "left", "up", "nudge right"
    lexicalIntent = 'transform_move';
  }

  return {
    cleanText: clean,
    wordCount: words.length,
    count,
    singleLabel,
    listLabels,
    topic,
    explicitArchetypeId,
    explicitBlueprintId,
    explicitColor,
    explicitEditionId,
    connectCreated,
    connectAll,
    chainLabels,
    sourceHint,
    targetHint,
    edgeLabel,
    direction,
    moveDistance,
    anchor,
    spatialRelation,
    arrangement,
    alignMode,
    scaleFactor,
    rotationDegrees,
    rotationAbsolute,
    zOrder,
    frameGroupLabel,
    arrowKindOverride,
    reverseArrows,
    sizeOverride,
    animationKind,
    tempoMultiplier,
    reverseAnimation,
    dashOverride,
    fillOverride,
    fontOverride,
    toolSwitch,
    sketchMotif: sketchInfo.motif,
    sketchTargetHint: sketchInfo.targetHint,
    sketchAsSpline: sketchInfo.asSpline,
    richCardKind,
    codeSnippet,
    appendText,
    appendTargetHint,
    pageAction: pageDetected.action,
    pageName: pageDetected.name,
    pageNumber: pageDetected.pageNumber,
    exportFormat: exportInfo.format,
    exportSelectionOnly: exportInfo.selectionOnly,
    groupAction,
    packShapes,
    stackDirection,
    stretchDirection,
    flipAxis,
    gridMode,
    snapMode,
    studioGuide,
    lexicalIntent,
  };
}
