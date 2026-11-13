import type {
  TLDefaultDashStyle,
  TLDefaultFillStyle,
  TLDefaultFontStyle,
} from 'tldraw';
import type { CatalogAnimationKind, IntentKind } from '../design/catalog';
import type { SpatialAnchor, SpatialRelation, WordWithConfidence } from '../types/protocol';

export interface ParsedSlots {
  cleanText: string;
  wordCount: number;
  count: number | null;
  singleLabel: string | null;
  listLabels: string[];
  connectCreated: boolean;
  connectAll: boolean;
  sourceHint: string | null;
  targetHint: string | null;
  direction: 'left' | 'right' | 'up' | 'down' | 'center' | null;
  moveDistance: 'small' | 'normal' | 'far';
  anchor: SpatialAnchor | null;
  spatialRelation: SpatialRelation | null;
  arrangement: 'row' | 'column' | 'grid' | null;
  scaleFactor: number | null;
  animationKind: CatalogAnimationKind | null;
  tempoMultiplier: number | null;
  reverseAnimation: boolean;
  dashOverride: TLDefaultDashStyle | null;
  fillOverride: TLDefaultFillStyle | null;
  fontOverride: TLDefaultFontStyle | null;
  lexicalIntent: IntentKind | null;
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  single: 1,
  two: 2,
  couple: 2,
  pair: 2,
  three: 3,
  triple: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
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
 * Rejects breaths, throat-clears, mumbles, and conversational filler so they NEVER mutate canvas state.
 */
export function isPureFillerOrNoise(rawText: string, words: WordWithConfidence[] = []): boolean {
  const clean = rawText.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!clean || clean.length < 2) return true;

  const toks = clean.split(' ').filter(Boolean);
  if (toks.length === 0) return true;

  // If every spoken word is a conversational filler word, ignore completely
  if (toks.every((t) => FILLER_WORDS.has(t))) return true;

  // If Earlybird word confidences are provided, reject low-confidence gibberish
  if (words.length > 0) {
    const maxProb = Math.max(...words.map(([, p]) => p));
    const meanProb = words.reduce((s, [, p]) => s + p, 0) / words.length;
    if (maxProb < 0.38 || (toks.length <= 2 && meanProb < 0.42)) {
      return true;
    }
  }
  return false;
}

/**
 * HARD SAFETY LOCK: Shapes NEVER delete themselves.
 * Returns true ONLY when the user explicitly and confidently spoke a delete/remove/erase verb.
 */
export function hasExplicitDeleteConsent(rawText: string, words: WordWithConfidence[] = []): boolean {
  const lower = rawText.replace(/[.?!,]+$/g, '').trim().toLowerCase();
  const deleteVerbRe = /\b(delete|remove|erase|trash|destroy|get\s+rid\s+of|drop\s+(?:the|that|this))\b/i;
  if (!deleteVerbRe.test(lower)) return false;

  if (words.length > 0) {
    // Verify the destructive keyword itself wasn't a low-confidence acoustic hallucination
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
 * HARD SAFETY LOCK: Undo requires explicit spoken "undo" / "revert" / "step back" so shapes don't vanish via accidental undo!
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

/**
 * Extracts pair hints `(sourceHint, targetHint)` for connections, relative moves, orbits, and swaps!
 */
export function extractEntityPairHints(raw: string): {
  sourceHint: string | null;
  targetHint: string | null;
  relation: SpatialRelation | null;
  isSwap: boolean;
} {
  const cleaned = raw.replace(/[.?!]+$/g, '').trim();

  // 1. Swap patterns: "swap X and Y", "switch X with Y"
  const swapMatch = cleaned.match(
    /\b(?:swap|switch|exchange|trade(?:\s+places)?(?:\s+between)?)\s+(?:the\s+)?(.+?)\s+(?:and|with)\s+(?:the\s+)?(.+)$/i,
  );
  if (swapMatch) {
    return {
      sourceHint: swapMatch[1].trim(),
      targetHint: swapMatch[2].trim(),
      relation: null,
      isSwap: true,
    };
  }

  // 2. Relative placement patterns: "move X above/below/next to/left of/right of Y"
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
      relation,
      isSwap: false,
    };
  }

  // 3. Orbit patterns: "make X orbit around Y", "orbit X around Y"
  const orbitMatch = cleaned.match(
    /\b(?:make|have|let|set)?\s*(?:the\s+)?(.+?)\s+(?:orbit|revolve|circle|spin)\s+around\s+(?:the\s+)?(.+)$/i,
  );
  if (orbitMatch) {
    return {
      sourceHint: orbitMatch[1].trim(),
      targetHint: orbitMatch[2].trim(),
      relation: null,
      isSwap: false,
    };
  }

  // 4. Connection patterns: "connect X to Y", "arrow from X to Y"
  const connPatterns = [
    /(?:connect|wire|link|point|arrow\s+from|join)\s+(?:the\s+)?(.+?)\s+(?:to|into|with|and|towards?)\s+(?:the\s+)?(.+)$/i,
    /from\s+(?:the\s+)?(.+?)\s+to\s+(?:the\s+)?(.+)$/i,
  ];
  for (const re of connPatterns) {
    const m = cleaned.match(re);
    if (m) {
      const s = m[1].trim();
      const t = m[2].trim();
      if (!/^(them|all|everything|these|those)$/i.test(s)) {
        return { sourceHint: s, targetHint: t, relation: null, isSwap: false };
      }
    }
  }

  return { sourceHint: null, targetHint: null, relation: null, isSwap: false };
}

function titleCaseLabel(s: string): string {
  const trimmed = s.replace(/^["'“”‘’]+|["'“”‘’.,!?]+$/g, '').trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\s+/)
    .map((w) => (w.length <= 2 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

export function parseVoiceSlots(rawText: string, ghostText = ''): ParsedSlots {
  const full = `${rawText} ${ghostText}`.replace(/\s+/g, ' ').trim();
  const clean = full.replace(/[.?!,]+$/g, '').trim();
  const lower = clean.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);

  const isTwoByTwo = /\b(two\s+by\s+two|2\s*x\s*2|2\s+by\s+2)\b/i.test(lower);

  let count: number | null = null;
  if (!isTwoByTwo) {
    const digitMatch = lower.match(/\b([1-9]|10|12)\b/);
    if (digitMatch) {
      count = parseInt(digitMatch[1], 10);
    } else {
      for (const w of words) {
        if (w in NUMBER_WORDS && w !== 'a' && w !== 'an') {
          count = NUMBER_WORDS[w];
          break;
        }
      }
    }
  }

  // Spoken labels
  let singleLabel: string | null = null;
  const labelPatterns = [
    /\b(?:called|named|labeled|labelled|titled|saying|reading)\s+["']?([^,.]+?)["']?(?:\s+and\s+connect.*)?$/i,
    /^(?:write|type|caption\s+it|label\s+it|rename\s+(?:it|that|this)\s+to|title\s+it)\s+["']?(.+?)["']?$/i,
  ];
  for (const re of labelPatterns) {
    const m = clean.match(re);
    if (m && m[1]) {
      singleLabel = titleCaseLabel(m[1]);
      break;
    }
  }

  let listLabels: string[] = [];
  const listMatch = clean.match(/\b(?:with\s+steps?|with\s+columns?|named|for|colon)\s+([A-Za-z0-9 ,]+)$/i);
  if (listMatch && listMatch[1] && (listMatch[1].includes(',') || /\band\b/i.test(listMatch[1]))) {
    const parts = listMatch[1]
      .split(/,|\band\b/i)
      .map((p) => titleCaseLabel(p))
      .filter((p) => p.length > 0 && p.length <= 28);
    if (parts.length >= 2) {
      listLabels = parts;
    }
  }

  // Pair & relation hints
  const connectCreated =
    /\b(and\s+(?:connect|link|wire)|connected|linked\s+together|with\s+arrows)\b/i.test(lower);
  const connectAll =
    /\b(connect|link|wire)\s+(them(\s+all)?|everything|all(\s+of\s+them)?|these|the\s+shapes|in\s+order|in\s+sequence)\b/i.test(
      lower,
    );
  const { sourceHint, targetHint, relation: spatialRelation, isSwap } = extractEntityPairHints(clean);

  // Spatial anchors & directions
  let anchor: SpatialAnchor | null = null;
  if (/\b(top\s+left|upper\s+left)\b/.test(lower)) anchor = 'top-left';
  else if (/\b(top\s+right|upper\s+right)\b/.test(lower)) anchor = 'top-right';
  else if (/\b(bottom\s+left|lower\s+left)\b/.test(lower)) anchor = 'bottom-left';
  else if (/\b(bottom\s+right|lower\s+right)\b/.test(lower)) anchor = 'bottom-right';
  else if (/\b(at\s+the\s+top|to\s+the\s+top|top\s+edge|top\s+center|upper\s+edge)\b/.test(lower)) anchor = 'top';
  else if (/\b(at\s+the\s+bottom|to\s+the\s+bottom|bottom\s+edge|bottom\s+center)\b/.test(lower)) anchor = 'bottom';
  else if (/\b(on\s+the\s+left|far\s+left|left\s+edge|left\s+side)\b/.test(lower)) anchor = 'left';
  else if (/\b(on\s+the\s+right|far\s+right|right\s+edge|right\s+side)\b/.test(lower)) anchor = 'right';
  else if (/\b(in\s+the\s+(?:center|middle)|to\s+the\s+(?:center|middle)|center\s+(?:it|them|everything))\b/.test(lower)) {
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
  else if (/\b(way\s+over|far|a\s+lot|all\s+the\s+way|much\s+further|big\s+step)\b/.test(lower)) moveDistance = 'far';

  let arrangement: ParsedSlots['arrangement'] = null;
  if (/\b(in\s+a\s+row|horizontal\s+row|horizontally|side\s+by\s+side|in\s+a\s+line)\b/.test(lower)) {
    arrangement = 'row';
  } else if (/\b(in\s+a\s+column|vertical\s+column|vertically|stack(?:ed)?)\b/.test(lower)) {
    arrangement = 'column';
  } else if (/\b(in\s+a\s+grid|neat\s+grid|tidy\s+grid)\b/.test(lower)) {
    arrangement = 'grid';
  }

  // Scale factor
  let scaleFactor: number | null = null;
  if (/\b(double|twice\s+as\s+big|much\s+bigger|huge)\b/.test(lower)) scaleFactor = 1.65;
  else if (/\b(bigger|larger|scale\s+up|enlarge|grow|increase\s+size)\b/.test(lower)) scaleFactor = 1.32;
  else if (/\b(tiny|much\s+smaller|half\s+size)\b/.test(lower)) scaleFactor = 0.6;
  else if (/\b(smaller|shrink|scale\s+down|reduce\s+size)\b/.test(lower)) scaleFactor = 0.75;

  // Animation slots
  let animationKind: CatalogAnimationKind | null = null;
  if (/\b(stop\s+(?:animating|animation|moving|spinning|orbiting|bouncing|floating)|freeze(?:\s+everything|\s+all|\s+motion)?|pause\s+(?:animation|motion)|hold\s+still|calm\s+down)\b/.test(lower)) {
    animationKind = 'stop';
  } else if (/\b(orbit|revolve|satellite|circle\s+around)\b/.test(lower)) {
    animationKind = 'orbit';
  } else if (/\b(float|floating|levitate|hover|bob|bobbing|zero\s+gravity)\b/.test(lower)) {
    animationKind = 'float';
  } else if (/\b(pulse|pulsing|breathe|breathing|heartbeat|throb)\b/.test(lower)) {
    animationKind = 'pulse';
  } else if (/\b(spin|spinning|rotate|rotating|twirl)\b/.test(lower)) {
    animationKind = 'spin';
  } else if (/\b(bounce|bouncing|jump|jumping|hop|hopping)\b/.test(lower)) {
    animationKind = 'bounce';
  } else if (/\b(wiggle|wiggling|shake|shaking|jitter|vibrate|vibrating|shimmy)\b/.test(lower)) {
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
  else if (/\b(slower|slow\s+down|slow\s+motion|gentle|gently|calmer|half\s+speed)\b/.test(lower)) tempoMultiplier = 0.62;

  const reverseAnimation = /\b(reverse|counter\s*clockwise|opposite\s+direction|backwards)\b/.test(lower);

  // Surface overrides
  let dashOverride: TLDefaultDashStyle | null = null;
  if (/\b(dashed|dash\s+line)\b/.test(lower)) dashOverride = 'dashed';
  else if (/\b(dotted|dots)\b/.test(lower)) dashOverride = 'dotted';
  else if (/\b(sketchy|hand\s*drawn|rough|chalk)\b/.test(lower)) dashOverride = 'draw';
  else if (/\b(crisp\s+solid|clean\s+solid\s+line)\b/.test(lower)) dashOverride = 'solid';

  let fillOverride: TLDefaultFillStyle | null = null;
  if (/\b(no\s+fill|hollow|transparent|outline\s+only|unfilled)\b/.test(lower)) fillOverride = 'none';
  else if (/\b(solid\s+fill|filled\s+solid)\b/.test(lower)) fillOverride = 'solid';
  else if (/\b(semi\s+fill|soft\s+fill|wash)\b/.test(lower)) fillOverride = 'semi';
  else if (/\b(pattern\s+fill|hatched)\b/.test(lower)) fillOverride = 'pattern';

  let fontOverride: TLDefaultFontStyle | null = null;
  if (/\b(serif|editorial\s+font|literary)\b/.test(lower)) fontOverride = 'serif';
  else if (/\b(mono|monospace|code\s+font|terminal\s+font)\b/.test(lower)) fontOverride = 'mono';
  else if (/\b(sans|sans\s+serif|clean\s+font)\b/.test(lower)) fontOverride = 'sans';
  else if (/\b(handwriting|script\s+font)\b/.test(lower)) fontOverride = 'draw';

  // Crisp lexical intent routing
  let lexicalIntent: IntentKind | null = null;
  if (isSwap) {
    lexicalIntent = 'transform_swap';
  } else if (spatialRelation) {
    lexicalIntent = 'transform_move_relative';
  } else if (animationKind === 'stop') {
    lexicalIntent = 'stop_animation';
  } else if (animationKind !== null) {
    lexicalIntent = 'animate_shapes';
  } else if (/^(please\s+)?(undo|undo\s+that|step\s+back|revert(?:\s+last)?)$/.test(lower)) {
    lexicalIntent = 'history_undo';
  } else if (/^(please\s+)?(redo|redo\s+that)$/.test(lower)) {
    lexicalIntent = 'history_redo';
  } else if (hasExplicitClearConsent(clean)) {
    lexicalIntent = 'clear_canvas';
  } else if (/\b(lock|pin)\s+(it|that|this|them|all|everything|the\s+.+)$/.test(lower)) {
    lexicalIntent = 'lock_shapes';
  } else if (/\b(unlock|unpin)\s+(it|that|this|them|all|everything|the\s+.+)$/.test(lower)) {
    lexicalIntent = 'unlock_shapes';
  } else if (/^(please\s+)?(zoom\s+in|closer|magnify)$/.test(lower)) {
    lexicalIntent = 'camera_zoom_in';
  } else if (/^(please\s+)?(zoom\s+out|wider\s+view|step\s+back\s+camera)$/.test(lower)) {
    lexicalIntent = 'camera_zoom_out';
  } else if (/\b(zoom\s+to\s+fit|fit\s+everything|frame\s+everything|show\s+whole\s+canvas|reset\s+view)\b/.test(lower)) {
    lexicalIntent = 'camera_fit';
  } else if (
    /^(?:please\s+)?(?:move|shift|nudge|slide|push|pull|bring|put|drag)\b/.test(lower) &&
    !/\b(draw|create|add|sketch)\b/.test(lower)
  ) {
    lexicalIntent = 'transform_move';
  } else if (hasExplicitDeleteConsent(clean) && !/\b(draw|create|add)\b/.test(lower)) {
    lexicalIntent = 'delete_shapes';
  } else if (isTwoByTwo || /\b(architecture|flowchart|mind\s*map|kanban|quadrant|timeline|roadmap|bento|wireframe)\b/.test(lower)) {
    if (!/\b(delete|remove|erase|color|zoom|move|animate|spin|orbit|float)\b/.test(lower)) {
      lexicalIntent = 'compose_layout';
    }
  } else if (
    /\b(bauhaus|kyoto|washi|sumi|kunsthalle|swiss\s+grid|cyanotype|blueprint|obsidian|travertine|blackboard|chalkboard|dieter\s+rams|aesthetic|theme|vibe|palette)\b/.test(
      lower,
    ) &&
    !/\b(draw|create|add|sketch|build)\s+(?:a|an|two|three|four)\b/.test(lower)
  ) {
    lexicalIntent = 'apply_aesthetic';
  }

  return {
    cleanText: clean,
    wordCount: words.length,
    count,
    singleLabel,
    listLabels,
    connectCreated,
    connectAll,
    sourceHint,
    targetHint,
    direction,
    moveDistance,
    anchor,
    spatialRelation,
    arrangement,
    scaleFactor,
    animationKind,
    tempoMultiplier,
    reverseAnimation,
    dashOverride,
    fillOverride,
    fontOverride,
    lexicalIntent,
  };
}
