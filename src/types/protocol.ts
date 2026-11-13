import type {
  BlueprintKind,
  CatalogAnimationKind,
  IntentKind,
} from '../design/catalog';
import type { SketchMotif } from '../canvas/inkSketcher';
import type { RichTextListKind } from '../canvas/richTextBuilder';
import type { TLDefaultColorStyle, TLDefaultDashStyle, TLDefaultSizeStyle } from 'tldraw';

export type StudioToolId =
  | 'select'
  | 'draw'
  | 'highlight'
  | 'laser'
  | 'eraser'
  | 'hand'
  | 'arrow'
  | 'line'
  | 'note'
  | 'text'
  | 'frame';

export type ExportFormat = 'png' | 'svg' | 'copy' | 'json';

export type PageAction =
  | 'new'
  | 'next'
  | 'prev'
  | 'first'
  | 'last'
  | 'duplicate'
  | 'rename'
  | 'goto';

export type WordWithConfidence = [word: string, confidence: number];

export interface EarlybirdTranscriptUpdate {
  utteranceId: number;
  audioTimeSec: number;
  stepComputeMs: number;
  text: string;
  words: WordWithConfidence[];
  ghost: WordWithConfidence[];
  rmsLevel: number;
  isFinal: boolean;
}

export type EarlybirdWorkerIn =
  | { type: 'init'; baseUrl: string }
  | { type: 'audio'; pcm: Float32Array; lvl: number }
  | { type: 'flush' }
  | { type: 'reset' };

export type EarlybirdWorkerOut =
  | { type: 'progress'; stage: string; progress: number }
  | { type: 'ready' }
  | { type: 'level'; lvl: number }
  | { type: 'update'; payload: EarlybirdTranscriptUpdate }
  | { type: 'error'; message: string };

export interface CanvasShapeSummary {
  /** Short symbolic register ID for the State Computer, e.g. "s1", "s2" */
  reg: string;
  id: string;
  label: string;
  shapeType: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  anim: string | null;
  locked: boolean;
}

export interface SemanticResolution {
  requestId: number;
  utteranceId: number;
  phase: 'speculative' | 'commit';
  rawText: string;
  ghostText: string;
  words: WordWithConfidence[];
  meanWordConfidence: number;
  intentKind: IntentKind;
  intentScore: number;
  aestheticId: string;
  aestheticScore: number;
  blueprintId: BlueprintKind;
  blueprintScore: number;
  archetypeId: string;
  archetypeScore: number;
  color: TLDefaultColorStyle | null;
  colorScore: number;
  animationKind: CatalogAnimationKind;
  animationScore: number;
  /** Matched canvas shape IDs sorted by semantic similarity to target phrases */
  matchedShapes: { id: string; reg: string; label: string; score: number }[];
  sourceMatch?: { id: string; reg: string; label: string; score: number } | null;
  targetMatch?: { id: string; reg: string; label: string; score: number } | null;
  elapsedMs: number;
}

export type GemmaWorkerIn =
  | { type: 'init'; baseUrl: string }
  | { type: 'sync_shapes'; shapes: CanvasShapeSummary[] }
  | {
      type: 'resolve';
      requestId: number;
      utteranceId: number;
      phase: 'speculative' | 'commit';
      text: string;
      ghostText: string;
      words: WordWithConfidence[];
      sourceHint?: string | null;
      targetHint?: string | null;
    };

export type GemmaWorkerOut =
  | { type: 'progress'; stage: string; progress: number }
  | { type: 'ready'; backend: 'webgpu' | 'wasm' }
  | { type: 'resolved'; payload: SemanticResolution }
  | { type: 'error'; message: string };

// ---------------- Model 3: Superscalar + Qwen Canvas State Computer Protocol ----------------

export interface CanvasRegisterSnapshot {
  shapes: CanvasShapeSummary[];
  focusRegs: string[]; // Most recently created/selected shape registers (e.g. ["s2"])
  editionId: string;
  activeAnimations: number;
  /** Current pointer/touch page coordinates for deictic "right here" placement */
  pointerPoint?: { x: number; y: number } | null;
  currentPageName?: string;
  pageCount?: number;
}

export type SpatialAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'
  | 'pointer';

export type SpatialRelation = 'above' | 'below' | 'left-of' | 'right-of' | 'near';

export type ArrangementMode = 'row' | 'column' | 'grid' | 'circle' | 'scatter';

export type AlignDistributeMode =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'center-horizontal'
  | 'center-vertical'
  | 'distribute-horizontal'
  | 'distribute-vertical';

export type CanvasSyscall =
  | { op: 'NOOP'; reason: string }
  | {
      op: 'SPAWN';
      count?: number;
      anchor?: SpatialAnchor | null;
      archetypeId?: string | null;
      color?: TLDefaultColorStyle | null;
      label?: string | null;
      listLabels?: string[];
      arrangement?: ArrangementMode | null;
      connectCreated?: boolean;
      sizeOverride?: TLDefaultSizeStyle | null;
    }
  | {
      op: 'LAYOUT';
      kind?: BlueprintKind;
      topic?: string | null;
      listLabels?: string[];
      anchor?: SpatialAnchor | null;
      color?: TLDefaultColorStyle | null;
    }
  | {
      op: 'SKETCH';
      motif: SketchMotif;
      targets?: string[];
      targetLabelHint?: string | null;
      anchor?: SpatialAnchor | null;
      color?: TLDefaultColorStyle | null;
      size?: TLDefaultSizeStyle | null;
      asCubicSpline?: boolean;
    }
  | {
      op: 'RICH_CARD';
      cardKind: 'bullet' | 'ordered' | 'checklist' | 'code';
      title?: string | null;
      items: string[];
      shapeKind?: 'note' | 'card';
      anchor?: SpatialAnchor | null;
      color?: TLDefaultColorStyle | null;
    }
  | {
      op: 'APPEND_TEXT';
      targets: string[];
      targetLabelHint?: string | null;
      text: string;
      asBullet?: boolean;
      listKind?: RichTextListKind;
    }
  | {
      op: 'TOOL';
      tool: StudioToolId;
      color?: TLDefaultColorStyle | null;
      size?: TLDefaultSizeStyle | null;
      dash?: TLDefaultDashStyle | null;
    }
  | {
      op: 'PAGE';
      action: PageAction;
      name?: string | null;
      pageNumber?: number | null;
    }
  | {
      op: 'EXPORT';
      format: ExportFormat;
      selectionOnly?: boolean;
    }
  | {
      op: 'GROUP';
      targets: string[];
    }
  | {
      op: 'UNGROUP';
      targets: string[];
    }
  | {
      op: 'PACK';
      targets: string[];
    }
  | {
      op: 'STACK';
      targets: string[];
      direction: 'horizontal' | 'vertical';
    }
  | {
      op: 'STRETCH';
      targets: string[];
      direction: 'horizontal' | 'vertical' | 'both';
    }
  | {
      op: 'FLIP';
      targets: string[];
      axis: 'horizontal' | 'vertical';
    }
  | {
      op: 'GRID';
      gridMode?: boolean | null;
      snapMode?: boolean | null;
    }
  | {
      op: 'STUDIO_GUIDE';
    }
  | {
      op: 'MOVE';
      targets: string[]; // shape regs ("s1") or "ALL" or "FOCUS"
      dir?: 'left' | 'right' | 'up' | 'down' | 'center' | null;
      anchor?: SpatialAnchor | null;
      distance?: 'small' | 'normal' | 'far';
    }
  | {
      op: 'PLACE';
      targets: string[];
      relation: SpatialRelation;
      refReg?: string | null;
      targetLabelHint?: string | null;
      refLabelHint?: string | null;
    }
  | {
      op: 'SWAP';
      regA: string;
      regB: string;
    }
  | {
      op: 'ANIM';
      targets: string[];
      kind: Exclude<CatalogAnimationKind, 'stop'>;
      aroundReg?: string | null;
      aroundLabelHint?: string | null;
      targetLabelHint?: string | null;
      speed?: number;
      intensity?: number;
      direction?: 'cw' | 'ccw' | 'horizontal' | 'vertical';
    }
  | {
      op: 'TEMPO';
      targets: string[];
      multiplier: number;
      reverse?: boolean;
    }
  | {
      op: 'STOP_ANIM';
      targets: string[];
    }
  | {
      op: 'CONNECT';
      fromReg?: string | null;
      toReg?: string | null;
      fromLabel?: string | null;
      toLabel?: string | null;
      edgeLabel?: string | null;
      chainLabels?: string[];
      all?: boolean;
    }
  | { op: 'STYLE_COLOR'; targets: string[]; color?: TLDefaultColorStyle | null }
  | { op: 'STYLE_SURFACE'; targets: string[]; sizeOverride?: TLDefaultSizeStyle | null }
  | {
      op: 'STYLE_ARROWS';
      kind?: 'arc' | 'elbow' | null;
      dash?: TLDefaultDashStyle | null;
      reverse?: boolean;
    }
  | { op: 'SCALE'; targets: string[]; factor: number }
  | { op: 'ROTATE'; targets: string[]; degrees: number; absolute?: boolean }
  | { op: 'ARRANGE'; mode?: ArrangementMode | null }
  | { op: 'ALIGN'; targets: string[]; mode: AlignDistributeMode }
  | { op: 'FRAME_GROUP'; targets: string[]; label?: string | null }
  | { op: 'Z_ORDER'; targets: string[]; order: 'front' | 'back' }
  | { op: 'DUPLICATE'; targets: string[]; count?: number }
  | { op: 'LABEL'; targets: string[]; text?: string | null }
  | { op: 'LOCK'; targets: string[]; locked: boolean }
  | { op: 'SELECT'; targets: string[] }
  | { op: 'DELETE'; targets: string[] }
  | { op: 'CLEAR' }
  | { op: 'AESTHETIC'; aestheticId?: string }
  | { op: 'HARMONIZE'; goalPrompt?: string }
  | { op: 'UNDO' }
  | { op: 'REDO' }
  | { op: 'CAMERA'; action: 'zoom_in' | 'zoom_out' | 'fit' };

export interface VisionHarmonizePayload {
  editionId: string;
  critiqueId: string;
  critiqueTitle: string;
  critiqueDescription: string;
  shouldUntangle: boolean;
  themeScores: Record<string, number>;
  critiqueScores: Record<string, number>;
  modelUsed: string;
  latencyMs: number;
}

export interface StateComputerDecision {
  requestId: number;
  utteranceId: number;
  rawOpcodeLine: string;
  syscall: CanvasSyscall;
  /** Ordered compound batch of syscalls when a single utterance contains multiple clauses/steps */
  syscalls?: CanvasSyscall[];
  resolution: SemanticResolution;
  engineSource: 'qwen-webgpu' | 'qwen-edge' | 'register-alu';
  computeMs: number;
}

export type StateWorkerIn =
  | { type: 'init'; baseUrl: string; isMobileConstrained: boolean }
  | {
      type: 'step';
      requestId: number;
      snapshot: CanvasRegisterSnapshot;
      resolution: SemanticResolution;
    };

export type StateWorkerOut =
  | { type: 'progress'; stage: string; progress: number }
  | { type: 'ready'; mode: 'qwen-webgpu' | 'qwen-edge' | 'register-alu' }
  | { type: 'decision'; payload: StateComputerDecision }
  | { type: 'error'; message: string };
