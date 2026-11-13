import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultSizeStyle,
  PageRecordType,
  createBindingId,
  createShapeId,
  getIndices,
  toRichText,
  type Editor,
  type TLDefaultColorStyle,
  type TLGeoShapeGeoStyle,
  type TLRichText,
  type TLShape,
  type TLShapeId,
} from 'tldraw';
import {
  AESTHETIC_EDITIONS,
  LAYOUT_BLUEPRINTS,
  SHAPE_ARCHETYPES,
  TOPIC_CONCEPT_LEXICON,
  type AestheticEdition,
  type BlueprintKind,
  type LayoutBlueprint,
  type ShapeArchetype,
} from '../design/catalog';
import type {
  CanvasRegisterSnapshot,
  CanvasShapeSummary,
  CanvasSyscall,
  ExportFormat,
  SemanticResolution,
  SpatialAnchor,
  StateComputerDecision,
  StudioToolId,
  VisionHarmonizePayload,
} from '../types/protocol';
import { CanvasAnimationEngine } from './animationEngine';
import { spawnInkSketch } from './inkSketcher';
import {
  appendToRichText,
  buildCodeRichText,
  buildListRichText,
  extractHeadlineText,
} from './richTextBuilder';
import {
  hasExplicitClearConsent,
  hasExplicitDeleteConsent,
  hasExplicitUndoConsent,
  parseVoiceSlots,
  type ParsedSlots,
} from './slotParser';

type ColorRole = 'primary' | 'secondary' | 'accent' | 'muted';

function roleToColor(edition: AestheticEdition, role: ColorRole): TLDefaultColorStyle {
  switch (role) {
    case 'primary':
      return edition.tokens.primaryColor;
    case 'secondary':
      return edition.tokens.secondaryColor;
    case 'accent':
      return edition.tokens.accentColor;
    case 'muted':
      return edition.tokens.mutedColor;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractRichTextPlain(richText: any): string {
  if (!richText || typeof richText !== 'object') return '';
  if (typeof richText.text === 'string') return richText.text;
  if (Array.isArray(richText.content)) {
    return richText.content
      .map(extractRichTextPlain)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

let nextRegSeq = 1;

function ensureShapeRegister(editor: Editor, shape: TLShape): string {
  const existing = typeof shape.meta?.reg === 'string' ? shape.meta.reg : '';
  if (existing) {
    const n = parseInt(existing.slice(1), 10);
    if (!Number.isNaN(n) && n >= nextRegSeq) nextRegSeq = n + 1;
    return existing;
  }
  const assigned = `s${nextRegSeq++}`;
  editor.store.mergeRemoteChanges(() => {
    editor.updateShape({
      id: shape.id,
      type: shape.type,
      meta: { ...shape.meta, reg: assigned },
    });
  });
  return assigned;
}

export function collectCanvasShapeSummaries(editor: Editor): CanvasShapeSummary[] {
  const shapes = editor.getCurrentPageShapes();
  const out: CanvasShapeSummary[] = [];
  for (const s of shapes) {
    if (s.meta?.speculative) continue;
    if (s.type === 'arrow') continue;
    const reg = ensureShapeRegister(editor, s);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = s.props as any;
    const sketchLabel = typeof s.meta?.sketchLabel === 'string' ? s.meta.sketchLabel : '';
    const headline = extractHeadlineText(props?.richText);
    const label =
      typeof props?.name === 'string' && props.name
        ? props.name
        : headline || extractRichTextPlain(props?.richText) || sketchLabel;
    const bounds = editor.getShapePageBounds(s.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const animMeta = s.meta?.anim as any;
    out.push({
      reg,
      id: s.id,
      label: label || (props?.geo ? String(props.geo) : s.type),
      shapeType: props?.geo ? String(props.geo) : s.type,
      color: typeof props?.color === 'string' ? props.color : 'black',
      x: Math.round(bounds ? bounds.midX : s.x),
      y: Math.round(bounds ? bounds.midY : s.y),
      w: Math.round(bounds ? bounds.w : (props?.w ?? 180)),
      h: Math.round(bounds ? bounds.h : (props?.h ?? 100)),
      anim: typeof animMeta?.kind === 'string' ? animMeta.kind : null,
      locked: Boolean(s.meta?.locked),
    });
  }
  return out;
}

export interface IdeateEnrichmentTarget {
  topic: string;
  blueprintKind: BlueprintKind;
  nodeIds: TLShapeId[];
}

export interface DirectorResult {
  summary: string;
  opcode?: string;
  changedAesthetic?: AestheticEdition;
  requestHarmonizeGoal?: string;
  ideateTarget?: IdeateEnrichmentTarget;
  requestExport?: { format: ExportFormat; selectionOnly?: boolean };
  changedTool?: StudioToolId;
  changedPage?: { name: string; index: number; total: number };
}

export class CanvasDirector {
  private lastCreatedIds: TLShapeId[] = [];
  public readonly animations = new CanvasAnimationEngine();

  public buildRegisterSnapshot(editor: Editor, editionId: string): CanvasRegisterSnapshot {
    const shapes = collectCanvasShapeSummaries(editor);
    const selectedIds = new Set(editor.getSelectedShapeIds());
    let focusRegs = shapes.filter((s) => selectedIds.has(s.id as TLShapeId)).map((s) => s.reg);

    if (focusRegs.length === 0 && this.lastCreatedIds.length > 0) {
      const recentSet = new Set(this.lastCreatedIds);
      focusRegs = shapes.filter((s) => recentSet.has(s.id as TLShapeId)).map((s) => s.reg);
    }
    if (focusRegs.length === 0 && shapes.length > 0) {
      focusRegs = [shapes[shapes.length - 1].reg];
    }

    const rawPtr = editor.inputs?.currentPagePoint;
    const pointerPoint =
      rawPtr && Number.isFinite(rawPtr.x) && Number.isFinite(rawPtr.y)
        ? { x: Math.round(rawPtr.x), y: Math.round(rawPtr.y) }
        : null;
    const currentPage = editor.getCurrentPage();
    const pages = editor.getPages();

    return {
      shapes,
      focusRegs,
      editionId,
      activeAnimations: this.animations.activeCount,
      pointerPoint,
      currentPageName: currentPage?.name ?? 'Page 1',
      pageCount: pages.length,
    };
  }

  public clearSpeculativeShapes(editor: Editor): void {
    const specIds = editor
      .getCurrentPageShapes()
      .filter((s) => Boolean(s.meta?.speculative))
      .map((s) => s.id);
    if (specIds.length > 0) {
      editor.store.mergeRemoteChanges(() => {
        editor.deleteShapes(specIds);
      });
    }
  }

  /**
   * CRITICAL SAFETY HANDOFF:
   * If speculative shapes were rendered during `utteranceId`, and `commit` arrives with NOOP/low-confidence,
   * solidify those speculative shapes into permanent shapes instead of deleting them!
   */
  private crystallizeSpeculativeShapes(
    editor: Editor,
    utteranceId: number,
    edition: AestheticEdition,
  ): TLShapeId[] {
    const specs = editor
      .getCurrentPageShapes()
      .filter((s) => Boolean(s.meta?.speculative) && s.meta?.utteranceId === utteranceId);
    if (specs.length === 0) return [];

    editor.markHistoryStoppingPoint('voice-crystallize');
    const crystallizedNodeIds: TLShapeId[] = [];

    const updates = specs.map((s) => {
      const isArrow = s.type === 'arrow';
      const reg = isArrow ? undefined : `s${nextRegSeq++}`;
      if (!isArrow) crystallizedNodeIds.push(s.id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const props: Record<string, any> = {};
      if (s.type === 'geo') {
        props.dash = edition.tokens.dash;
      } else if (s.type === 'arrow') {
        props.dash = edition.tokens.dash === 'dashed' ? 'solid' : edition.tokens.dash;
      }

      return {
        id: s.id,
        type: s.type,
        opacity: 1,
        meta: {
          ...s.meta,
          speculative: false,
          ...(reg ? { reg } : {}),
        },
        ...(Object.keys(props).length > 0 ? { props } : {}),
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.updateShapes(updates as any);
    if (crystallizedNodeIds.length > 0) {
      this.lastCreatedIds = crystallizedNodeIds;
    }
    return crystallizedNodeIds;
  }

  public applyAestheticToCanvas(editor: Editor, edition: AestheticEdition): void {
    editor.user.updateUserPreferences({
      colorScheme: edition.isDarkCanvas ? 'dark' : 'light',
    });

    const shapes = editor.getCurrentPageShapes().filter((s) => !s.meta?.speculative);
    if (shapes.length === 0) return;

    editor.markHistoryStoppingPoint('aesthetic-change');
    const updates = shapes.map((s, idx) => {
      const role =
        (s.meta?.role as ColorRole | undefined) ??
        (['primary', 'secondary', 'accent', 'muted'][idx % 4] as ColorRole);
      if (s.type === 'arrow') {
        return {
          id: s.id,
          type: 'arrow' as const,
          props: {
            color: edition.tokens.connectorColor,
            dash: edition.tokens.dash === 'dashed' ? ('solid' as const) : edition.tokens.dash,
            kind: edition.tokens.arrowKind,
            bend: edition.tokens.arrowKind === 'arc' ? edition.tokens.arrowBend : 0,
            arrowheadEnd: edition.tokens.arrowheadEnd,
            font: edition.tokens.font,
          },
        };
      }
      if (s.type === 'geo') {
        return {
          id: s.id,
          type: 'geo' as const,
          props: {
            color: roleToColor(edition, role),
            dash: edition.tokens.dash,
            fill: role === 'accent' ? edition.tokens.accentFill : edition.tokens.fill,
            font: edition.tokens.font,
            size: edition.tokens.size,
          },
        };
      }
      if (s.type === 'note') {
        return {
          id: s.id,
          type: 'note' as const,
          props: {
            color: roleToColor(edition, role),
            font: edition.tokens.font,
            size: edition.tokens.size,
          },
        };
      }
      if (s.type === 'text') {
        return {
          id: s.id,
          type: 'text' as const,
          props: {
            color: edition.tokens.primaryColor,
            font: edition.tokens.headingFont,
          },
        };
      }
      if (s.type === 'draw') {
        return {
          id: s.id,
          type: 'draw' as const,
          props: {
            color: roleToColor(edition, role),
          },
        };
      }
      if (s.type === 'line') {
        return {
          id: s.id,
          type: 'line' as const,
          props: {
            color: edition.tokens.connectorColor,
          },
        };
      }
      return {
        id: s.id,
        type: s.type,
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor.updateShapes(updates as any);
  }

  private getViewportAnchorPoint(
    editor: Editor,
    anchor: SpatialAnchor | null,
    avoidOverlap = false,
    footprintW = 190,
    footprintH = 110,
  ): { cx: number; cy: number; isPortrait: boolean; vw: number; vh: number } {
    const bounds = editor.getViewportPageBounds();
    const screen = editor.getViewportScreenBounds();
    const isPortrait = screen.h > screen.w * 1.05;
    let cx = bounds.midX;
    let cy = bounds.midY;
    const padX = bounds.w * 0.23;
    const padY = bounds.h * 0.23;

    if (anchor === 'pointer') {
      const ptr = editor.inputs?.currentPagePoint;
      if (ptr && Number.isFinite(ptr.x) && Number.isFinite(ptr.y)) {
        const insideViewport =
          ptr.x >= bounds.minX &&
          ptr.x <= bounds.maxX &&
          ptr.y >= bounds.minY &&
          ptr.y <= bounds.maxY;
        cx = insideViewport
          ? ptr.x
          : Math.min(bounds.maxX - 80, Math.max(bounds.minX + 80, ptr.x));
        cy = insideViewport
          ? ptr.y
          : Math.min(bounds.maxY - 60, Math.max(bounds.minY + 60, ptr.y));
      }
      return { cx, cy, isPortrait, vw: bounds.w, vh: bounds.h };
    }

    if (anchor) {
      if (anchor.includes('left')) cx = bounds.minX + padX;
      if (anchor.includes('right')) cx = bounds.maxX - padX;
      if (anchor.includes('top')) cy = bounds.minY + padY;
      if (anchor.includes('bottom')) cy = bounds.maxY - padY;
      if (!avoidOverlap) {
        return { cx, cy, isPortrait, vw: bounds.w, vh: bounds.h };
      }
    }

    // Concentric spiral gallery slot finder: supports 60+ rapid-fire shapes without ever piling up!
    if (avoidOverlap) {
      const existing = editor
        .getCurrentPageShapes()
        .filter((s) => !s.meta?.speculative && s.type !== 'arrow' && s.type !== 'frame')
        .map((s) => editor.getShapePageBounds(s.id))
        .filter((b): b is NonNullable<typeof b> => Boolean(b));

      if (existing.length > 0) {
        const stepX = Math.max(footprintW + 32, isPortrait ? 190 : 230);
        const stepY = Math.max(footprintH + 28, isPortrait ? 140 : 150);
        const halfW = footprintW * 0.5 + 16;
        const halfH = footprintH * 0.5 + 14;

        const collidesAt = (tx: number, ty: number) =>
          existing.some(
            (b) => Math.abs(b.midX - tx) < b.w * 0.5 + halfW && Math.abs(b.midY - ty) < b.h * 0.5 + halfH,
          );

        if (collidesAt(cx, cy)) {
          let placed = false;
          for (let ring = 1; ring <= 10 && !placed; ring++) {
            const ringCandidates: [number, number][] = [];
            // Prioritize cardinal slots on the ring first, then perimeter slots
            ringCandidates.push(
              [ring * stepX, 0],
              [-ring * stepX, 0],
              [0, ring * stepY],
              [0, -ring * stepY],
            );
            for (let dx = -ring; dx <= ring; dx++) {
              for (let dy = -ring; dy <= ring; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
                if ((dx === 0 || dy === 0) && Math.abs(dx + dy) === ring) continue;
                ringCandidates.push([dx * stepX, dy * stepY]);
              }
            }
            for (const [ox, oy] of ringCandidates) {
              const tx = cx + ox;
              const ty = cy + oy;
              if (!collidesAt(tx, ty)) {
                cx = tx;
                cy = ty;
                placed = true;
                break;
              }
            }
          }
        }
      }
    }

    return { cx, cy, isPortrait, vw: bounds.w, vh: bounds.h };
  }

  private inferArchetypeForLabel(label: string): ShapeArchetype {
    const l = label.toLowerCase();
    const byId = (id: string) => SHAPE_ARCHETYPES.find((a) => a.id === id) ?? SHAPE_ARCHETYPES[0];
    if (/\b(db|database|postgres|sql|redis|cache|store|vector|bucket|storage|warehouse|s3|disk)\b/.test(l)) {
      return byId('arch-database');
    }
    if (/\b(queue|kafka|stream|event|topic|pubsub|buffer|io|input|output)\b/.test(l)) {
      return byId('arch-rhombus');
    }
    if (/\b(firewall|guard|security|waf|policy|stop|blocker)\b/.test(l)) {
      return byId('arch-octagon');
    }
    if (/\b(gateway|engine|worker|processor|model|kernel|api|service|server|node|pod|compute|llm)\b/.test(l)) {
      return byId('arch-hexagon');
    }
    if (/\b(cloud|cdn|internet|aws|gcp|edge|network|dns)\b/.test(l)) {
      return byId('arch-cloud');
    }
    if (/\b(sun|earth|mars|venus|mercury|moon|planet|star|hub|atom|nucleus|electron)\b/.test(l)) {
      return byId('arch-circle');
    }
    if (/\b(client|user|mobile|phone|browser|actor|session|app|start|end|idle)\b/.test(l)) {
      return byId('arch-pill');
    }
    if (/\b(decision|router|auth|check|gate|branch|if|verify)\b/.test(l)) {
      return byId('arch-diamond');
    }
    if (/\b(done|complete|verified|task|todo)\b/.test(l)) {
      return byId('arch-checkbox');
    }
    if (/\b(note|memo|sticky)\b/.test(l)) {
      return byId('arch-sticky');
    }
    return SHAPE_ARCHETYPES[0];
  }

  public applyVisionHarmonize(
    editor: Editor,
    harmony: VisionHarmonizePayload,
    onEditionChange: (ed: AestheticEdition) => void,
  ): DirectorResult {
    const matchedEd =
      AESTHETIC_EDITIONS.find((e) => e.id === harmony.editionId) ?? AESTHETIC_EDITIONS[0];
    onEditionChange(matchedEd);
    this.applyAestheticToCanvas(editor, matchedEd);

    const unlocked = editor
      .getCurrentPageShapes()
      .filter((s) => !s.meta?.speculative && s.type !== 'arrow' && !s.meta?.locked);

    if (harmony.shouldUntangle && unlocked.length >= 2) {
      editor.markHistoryStoppingPoint('voice-harmonize');
      const { cx, cy, isPortrait } = this.getViewportAnchorPoint(editor, null, false);
      const cols = unlocked.length <= 3 ? (isPortrait ? 1 : unlocked.length) : Math.ceil(Math.sqrt(unlocked.length));
      const rows = Math.ceil(unlocked.length / cols);
      const gapX = matchedEd.tokens.gapX + 18;
      const gapY = matchedEd.tokens.gapY + 14;

      editor.updateShapes(
        unlocked.map((s, idx) => {
          const b = editor.getShapePageBounds(s.id);
          const w = b ? b.w : 190;
          const h = b ? b.h : 105;
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const x = cx + (col - (cols - 1) / 2) * gapX - w / 2;
          const y = cy + (row - (rows - 1) / 2) * gapY - h / 2;
          return { id: s.id, type: s.type, x, y };
        }),
      );
    }

    const allIds = editor
      .getCurrentPageShapes()
      .filter((s) => !s.meta?.speculative)
      .map((s) => s.id);
    this.gentlyFrameShapes(editor, allIds);

    return {
      summary: `${matchedEd.catalogueNumber} · ${harmony.critiqueTitle}`,
      opcode: 'HARMONIZE',
      changedAesthetic: matchedEd,
    };
  }

  private createBoundArrow(
    editor: Editor,
    fromId: TLShapeId,
    toId: TLShapeId,
    edition: AestheticEdition,
    speculative: boolean,
    utteranceId: number,
    edgeLabel?: string | null,
    arrowOverride?: { kind?: 'arc' | 'elbow'; bend?: number },
  ): void {
    const fromBounds = editor.getShapePageBounds(fromId);
    const toBounds = editor.getShapePageBounds(toId);
    if (!fromBounds || !toBounds) return;

    const arrowKind = arrowOverride?.kind ?? edition.tokens.arrowKind;
    const arrowBend =
      arrowOverride?.bend !== undefined
        ? arrowOverride.bend
        : arrowKind === 'arc'
          ? edition.tokens.arrowBend || 24
          : 0;

    const arrowId = createShapeId();
    editor.createShape({
      id: arrowId,
      type: 'arrow',
      x: fromBounds.midX,
      y: fromBounds.midY,
      opacity: speculative ? 0.28 : 1,
      meta: { speculative, utteranceId, role: 'muted' },
      props: {
        kind: arrowKind,
        color: edition.tokens.connectorColor,
        labelColor: edition.tokens.primaryColor,
        font: edition.tokens.font,
        dash: speculative ? 'dashed' : edition.tokens.dash === 'dashed' ? 'solid' : edition.tokens.dash,
        size: edition.tokens.size,
        arrowheadStart: 'none',
        arrowheadEnd: edition.tokens.arrowheadEnd,
        bend: arrowBend,
        start: { x: 0, y: 0 },
        end: { x: toBounds.midX - fromBounds.midX, y: toBounds.midY - fromBounds.midY },
        ...(edgeLabel ? { richText: toRichText(edgeLabel) } : {}),
      },
    });

    editor.createBindings([
      {
        id: createBindingId(),
        type: 'arrow',
        fromId: arrowId,
        toId: fromId,
        props: {
          terminal: 'start',
          normalizedAnchor: { x: 0.5, y: 0.5 },
          isExact: false,
          isPrecise: false,
          snap: 'none',
        },
      },
      {
        id: createBindingId(),
        type: 'arrow',
        fromId: arrowId,
        toId: toId,
        props: {
          terminal: 'end',
          normalizedAnchor: { x: 0.5, y: 0.5 },
          isExact: false,
          isPrecise: false,
          snap: 'none',
        },
      },
    ]);
  }

  private spawnNode(
    editor: Editor,
    opts: {
      x: number;
      y: number;
      w: number;
      h: number;
      shapeType: ShapeArchetype['shapeType'];
      geo?: TLGeoShapeGeoStyle;
      label: string;
      richTextOverride?: TLRichText | null;
      alignOverride?: 'start' | 'middle' | 'end';
      verticalAlignOverride?: 'start' | 'middle' | 'end';
      fontOverride?: AestheticEdition['tokens']['font'] | null;
      role: ColorRole;
      colorOverride: TLDefaultColorStyle | null;
      fillOverride?: AestheticEdition['tokens']['fill'] | null;
      sizeOverride?: AestheticEdition['tokens']['size'] | null;
      slots: ParsedSlots;
      edition: AestheticEdition;
      speculative: boolean;
      utteranceId: number;
    },
  ): TLShapeId {
    const id = createShapeId();
    const { edition, slots, speculative, utteranceId, role } = opts;
    const color = opts.colorOverride ?? roleToColor(edition, role);
    const dash = speculative ? 'dashed' : (slots.dashOverride ?? edition.tokens.dash);
    const fill =
      opts.fillOverride ??
      slots.fillOverride ??
      (role === 'accent' ? edition.tokens.accentFill : edition.tokens.fill);
    const font = opts.fontOverride ?? slots.fontOverride ?? edition.tokens.font;
    const size = opts.sizeOverride ?? slots.sizeOverride ?? edition.tokens.size;
    const opacity = speculative ? 0.28 : 1;
    const meta = {
      speculative,
      utteranceId,
      role,
      ...(speculative ? {} : { reg: `s${nextRegSeq++}` }),
    };

    if (opts.shapeType === 'note') {
      editor.createShape({
        id,
        type: 'note',
        x: opts.x - opts.w / 2,
        y: opts.y - opts.h / 2,
        opacity,
        meta,
        props: {
          color,
          font,
          size,
          richText: opts.richTextOverride ?? toRichText(opts.label),
        },
      });
    } else if (opts.shapeType === 'text') {
      editor.createShape({
        id,
        type: 'text',
        x: opts.x - opts.w / 2,
        y: opts.y - opts.h / 2,
        opacity,
        meta,
        props: {
          color,
          font: opts.fontOverride ?? slots.fontOverride ?? edition.tokens.headingFont,
          size: opts.sizeOverride ?? slots.sizeOverride ?? 'xl',
          textAlign: opts.alignOverride ?? 'middle',
          autoSize: true,
          richText: opts.richTextOverride ?? toRichText(opts.label || 'Untitled Study'),
        },
      });
    } else if (opts.shapeType === 'frame') {
      editor.createShape({
        id,
        type: 'frame',
        x: opts.x - opts.w / 2,
        y: opts.y - opts.h / 2,
        opacity,
        meta,
        props: {
          w: opts.w,
          h: opts.h,
          name: opts.label || edition.title,
          color,
        },
      });
    } else {
      editor.createShape({
        id,
        type: 'geo',
        x: opts.x - opts.w / 2,
        y: opts.y - opts.h / 2,
        opacity,
        meta,
        props: {
          geo: opts.geo ?? 'rectangle',
          w: opts.w,
          h: opts.h,
          color,
          dash,
          fill,
          font,
          size,
          align: opts.alignOverride ?? 'middle',
          verticalAlign: opts.verticalAlignOverride ?? 'middle',
          richText: opts.richTextOverride ?? toRichText(opts.label),
        },
      });
    }
    return id;
  }

  public applyTopicEnrichment(editor: Editor, nodeIds: TLShapeId[], labels: string[]): void {
    if (nodeIds.length === 0 || labels.length === 0) return;
    editor.store.mergeRemoteChanges(() => {
      const updates: unknown[] = [];
      nodeIds.forEach((id, idx) => {
        const nextLabel = labels[idx];
        if (!nextLabel) return;
        const shape = editor.getShape(id);
        if (!shape || shape.meta?.locked) return;
        if (shape.type === 'geo' || shape.type === 'note' || shape.type === 'text') {
          updates.push({
            id: shape.id,
            type: shape.type,
            props: { richText: toRichText(nextLabel) },
          });
        } else if (shape.type === 'frame') {
          updates.push({
            id: shape.id,
            type: 'frame',
            props: { name: nextLabel },
          });
        }
      });
      if (updates.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor.updateShapes(updates as any);
      }
    });
  }

  private renderCreateShapes(
    editor: Editor,
    res: SemanticResolution,
    slots: ParsedSlots,
    edition: AestheticEdition,
    speculative: boolean,
    overrides?: {
      archetypeId?: string | null;
      color?: TLDefaultColorStyle | null;
      label?: string | null;
      listLabels?: string[];
      arrangement?: ParsedSlots['arrangement'];
      connectCreated?: boolean;
      sizeOverride?: AestheticEdition['tokens']['size'] | null;
    },
  ): TLShapeId[] {
    const archId = overrides?.archetypeId ?? slots.explicitArchetypeId ?? res.archetypeId;
    const archetype = SHAPE_ARCHETYPES.find((a) => a.id === archId) ?? SHAPE_ARCHETYPES[0];
    const listLabels = overrides?.listLabels ?? slots.listLabels;
    const singleLabel = overrides?.label !== undefined ? overrides.label : slots.singleLabel;
    const chosenColor = overrides?.color !== undefined ? overrides.color : (slots.explicitColor ?? res.color);
    const count = Math.min(12, Math.max(1, listLabels.length || slots.count || 1));

    const mode =
      overrides?.arrangement ??
      slots.arrangement ??
      (count >= 4 ? 'grid' : count === 1 ? 'row' : 'row');

    const gapX = Math.max(archetype.w + 42, edition.tokens.gapX);
    const gapY = Math.max(archetype.h + 38, edition.tokens.gapY);
    const estW = count === 1 ? archetype.w : mode === 'column' ? archetype.w : gapX * Math.min(count, 3);
    const estH = count === 1 ? archetype.h : mode === 'row' ? archetype.h : gapY * Math.ceil(count / 3);

    const { cx, cy, isPortrait } = this.getViewportAnchorPoint(
      editor,
      slots.anchor,
      !speculative && !slots.anchor,
      estW,
      estH,
    );

    const effectiveMode =
      overrides?.arrangement ??
      slots.arrangement ??
      (count >= 4 ? 'grid' : isPortrait && count >= 3 ? 'column' : 'row');

    const roles: ColorRole[] = ['primary', 'secondary', 'accent', 'muted'];
    const created: TLShapeId[] = [];

    for (let i = 0; i < count; i++) {
      let x = cx;
      let y = cy;
      if (effectiveMode === 'row') {
        x = cx + (i - (count - 1) / 2) * gapX;
      } else if (effectiveMode === 'column') {
        y = cy + (i - (count - 1) / 2) * gapY;
      } else if (effectiveMode === 'circle') {
        const radius = Math.max(135, count * 34);
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
        x = cx + Math.cos(angle) * radius;
        y = cy + Math.sin(angle) * radius * 0.85;
      } else if (effectiveMode === 'scatter') {
        const golden = i * 2.3999632;
        const r = i === 0 ? 0 : 115 * Math.sqrt(i);
        x = cx + Math.cos(golden) * r;
        y = cy + Math.sin(golden) * r * 0.82;
      } else {
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        const col = i % cols;
        const row = Math.floor(i / cols);
        x = cx + (col - (cols - 1) / 2) * gapX;
        y = cy + (row - (rows - 1) / 2) * gapY;
      }

      const label =
        listLabels[i] ??
        (count === 1
          ? (singleLabel ?? '')
          : singleLabel
            ? `${singleLabel} ${i + 1}`
            : '');

      const role = count === 1 ? archetype.role : roles[i % roles.length];
      created.push(
        this.spawnNode(editor, {
          x,
          y,
          w: archetype.w,
          h: archetype.h,
          shapeType: archetype.shapeType,
          geo: archetype.geo,
          label,
          role,
          colorOverride: chosenColor,
          sizeOverride: overrides?.sizeOverride ?? slots.sizeOverride,
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        }),
      );
    }

    const shouldConnect = overrides?.connectCreated ?? slots.connectCreated;
    if (shouldConnect && created.length >= 2) {
      for (let i = 0; i < created.length - 1; i++) {
        this.createBoundArrow(editor, created[i], created[i + 1], edition, speculative, res.utteranceId);
      }
    }
    return created;
  }

  private resolveBlueprintLabels(
    bp: LayoutBlueprint,
    rawText: string,
    topic: string | null | undefined,
    listLabels: string[],
    singleLabel: string | null,
  ): {
    nodes: LayoutBlueprint['defaultNodes'];
    needsAsyncIdeate: boolean;
    cleanTopic: string | null;
    hubCentric: boolean;
  } {
    const hubCentric = bp.id === 'mindmap' || bp.id === 'tree' || bp.id === 'orbit_system';

    if (listLabels.length >= 2) {
      const count = Math.max(bp.defaultNodes.length, Math.min(8, listLabels.length));
      const roles: ColorRole[] = ['accent', 'primary', 'secondary', 'muted'];
      const nodes: LayoutBlueprint['defaultNodes'] = [];
      for (let i = 0; i < count; i++) {
        const base = bp.defaultNodes[i] ?? bp.defaultNodes[bp.defaultNodes.length - 1];
        nodes.push({
          ...base,
          role: base?.role ?? roles[i % roles.length],
          geo: base?.geo ?? 'rectangle',
          label: listLabels[i] ?? base?.label ?? `Stage ${i + 1}`,
        });
      }
      return { nodes, needsAsyncIdeate: false, cleanTopic: null, hubCentric };
    }

    const searchHaystack = `${topic ?? ''} ${rawText}`.toLowerCase();
    for (const [lexKey, concepts] of Object.entries(TOPIC_CONCEPT_LEXICON)) {
      if (new RegExp(`\\b${lexKey}s?\\b`, 'i').test(searchHaystack)) {
        const nodes = bp.defaultNodes.map((n, idx) => ({
          ...n,
          label: concepts[idx] ?? n.label,
        }));
        return { nodes, needsAsyncIdeate: false, cleanTopic: null, hubCentric };
      }
    }

    const rawTopic = (topic ?? '').trim();
    if (rawTopic.length >= 2) {
      const titledTopic = rawTopic.replace(/\b\w/g, (m) => m.toUpperCase());
      const nodes = bp.defaultNodes.map((n, idx) => ({
        ...n,
        label: idx === 0 && hubCentric ? titledTopic : idx === 0 && singleLabel ? singleLabel : n.label,
      }));
      return {
        nodes,
        needsAsyncIdeate: true,
        cleanTopic: titledTopic,
        hubCentric,
      };
    }

    const nodes = bp.defaultNodes.map((n, idx) => ({
      ...n,
      label: idx === 0 && singleLabel ? singleLabel : n.label,
    }));
    return { nodes, needsAsyncIdeate: false, cleanTopic: null, hubCentric };
  }

  private renderBlueprint(
    editor: Editor,
    bpKind: BlueprintKind,
    res: SemanticResolution,
    slots: ParsedSlots,
    edition: AestheticEdition,
    speculative: boolean,
    overrides?: {
      topic?: string | null;
      listLabels?: string[];
      anchor?: SpatialAnchor | null;
      color?: TLDefaultColorStyle | null;
    },
  ): { ids: TLShapeId[]; ideateTarget?: IdeateEnrichmentTarget } {
    const effectiveAnchor = overrides?.anchor !== undefined ? overrides.anchor : slots.anchor;
    const effectiveList = overrides?.listLabels ?? slots.listLabels;
    const effectiveColor = overrides?.color !== undefined ? overrides.color : (slots.explicitColor ?? res.color);
    const effectiveTopic = overrides?.topic !== undefined ? overrides.topic : slots.topic;

    if (bpKind === 'row' || bpKind === 'column') {
      const ids = this.renderCreateShapes(
        editor,
        res,
        { ...slots, anchor: effectiveAnchor, arrangement: bpKind, count: slots.count ?? 3 },
        edition,
        speculative,
        { listLabels: effectiveList, color: effectiveColor },
      );
      return { ids };
    }

    const bp = LAYOUT_BLUEPRINTS.find((b) => b.id === bpKind) ?? LAYOUT_BLUEPRINTS[0];
    const { cx, cy, isPortrait } = this.getViewportAnchorPoint(
      editor,
      effectiveAnchor,
      !speculative && !effectiveAnchor,
      540,
      360,
    );
    const created: TLShapeId[] = [];
    const { nodes, needsAsyncIdeate, cleanTopic, hubCentric } = this.resolveBlueprintLabels(
      bp,
      res.rawText,
      effectiveTopic,
      effectiveList,
      slots.singleLabel,
    );

    const buildReturn = (ids: TLShapeId[]): { ids: TLShapeId[]; ideateTarget?: IdeateEnrichmentTarget } => {
      if (!speculative && needsAsyncIdeate && cleanTopic) {
        const targetIds = hubCentric ? ids.slice(1) : ids;
        if (targetIds.length >= 2) {
          return {
            ids,
            ideateTarget: {
              topic: cleanTopic,
              blueprintKind: bpKind,
              nodeIds: targetIds,
            },
          };
        }
      }
      return { ids };
    };

    if (bpKind === 'mindmap') {
      const centerNode = nodes[0];
      const hubId = this.spawnNode(editor, {
        x: cx,
        y: cy,
        w: 180,
        h: 115,
        shapeType: 'geo',
        geo: 'ellipse',
        label: centerNode.label,
        role: 'accent',
        colorOverride: effectiveColor,
        slots,
        edition,
        speculative,
        utteranceId: res.utteranceId,
      });
      created.push(hubId);

      const branches = nodes.slice(1);
      const rx = isPortrait ? 150 : 245;
      const ry = isPortrait ? 195 : 170;
      branches.forEach((b, idx) => {
        const angle = (idx / branches.length) * Math.PI * 2 - Math.PI / 2;
        const bx = cx + Math.cos(angle) * rx;
        const by = cy + Math.sin(angle) * ry;
        const bid = this.spawnNode(editor, {
          x: bx,
          y: by,
          w: 158,
          h: 82,
          shapeType: 'geo',
          geo: b.geo === 'note' ? 'rectangle' : b.geo,
          label: b.label,
          role: b.role,
          colorOverride: null,
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        });
        created.push(bid);
        this.createBoundArrow(editor, hubId, bid, edition, speculative, res.utteranceId);
      });
      return buildReturn(created);
    }

    if (bpKind === 'orbit_system') {
      const hubNode = nodes[0];
      const hubId = this.spawnNode(editor, {
        x: cx,
        y: cy,
        w: 132,
        h: 132,
        shapeType: 'geo',
        geo: 'ellipse',
        label: hubNode.label,
        role: 'accent',
        colorOverride: effectiveColor ?? 'yellow',
        fillOverride: 'solid',
        slots,
        edition,
        speculative,
        utteranceId: res.utteranceId,
      });
      created.push(hubId);

      const satellites = nodes.slice(1);
      satellites.forEach((sat, idx) => {
        const radius = (isPortrait ? 115 : 140) + idx * (isPortrait ? 48 : 62);
        const angle = idx * 1.85 - Math.PI / 3;
        const sx = cx + Math.cos(angle) * radius;
        const sy = cy + Math.sin(angle) * radius * 0.82;
        const dim = Math.max(76, 98 - idx * 5);
        const sid = this.spawnNode(editor, {
          x: sx,
          y: sy,
          w: dim,
          h: dim,
          shapeType: 'geo',
          geo: 'ellipse',
          label: sat.label,
          role: sat.role,
          colorOverride: null,
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        });
        created.push(sid);
        if (!speculative) {
          this.animations.setAnimation([sid], {
            kind: 'orbit',
            anchorShapeId: hubId,
            speed: Math.max(0.45, 1.18 - idx * 0.17),
            intensity: 1,
            direction: 'cw',
          });
        }
      });
      return buildReturn(created);
    }

    if (bpKind === 'cycle') {
      const ringNodes = nodes.slice(0, 6);
      const rx = isPortrait ? 140 : 205;
      const ry = isPortrait ? 175 : 160;
      ringNodes.forEach((n, idx) => {
        const angle = (idx / ringNodes.length) * Math.PI * 2 - Math.PI / 2;
        const nx = cx + Math.cos(angle) * rx;
        const ny = cy + Math.sin(angle) * ry;
        created.push(
          this.spawnNode(editor, {
            x: nx,
            y: ny,
            w: 162,
            h: 78,
            shapeType: 'geo',
            geo: n.geo === 'note' ? 'oval' : n.geo,
            label: n.label,
            role: n.role,
            colorOverride: effectiveColor,
            slots,
            edition,
            speculative,
            utteranceId: res.utteranceId,
          }),
        );
      });
      for (let i = 0; i < created.length; i++) {
        const nextIdx = (i + 1) % created.length;
        this.createBoundArrow(editor, created[i], created[nextIdx], edition, speculative, res.utteranceId, null, {
          kind: 'arc',
          bend: -26,
        });
      }
      return buildReturn(created);
    }

    if (bpKind === 'tree') {
      const root = nodes[0];
      const rootId = this.spawnNode(editor, {
        x: cx,
        y: cy - 150,
        w: 195,
        h: 82,
        shapeType: 'geo',
        geo: 'rectangle',
        label: root.label,
        role: 'accent',
        colorOverride: effectiveColor,
        slots,
        edition,
        speculative,
        utteranceId: res.utteranceId,
      });
      created.push(rootId);

      const tier1 = nodes.slice(1, 4);
      const tier2 = nodes.slice(4);
      const gap1 = isPortrait ? 170 : 220;
      const tier1Ids: TLShapeId[] = [];

      tier1.forEach((n, idx) => {
        const tx = cx + (idx - (tier1.length - 1) / 2) * gap1;
        const ty = cy - 10;
        const tid = this.spawnNode(editor, {
          x: tx,
          y: ty,
          w: 162,
          h: 76,
          shapeType: 'geo',
          geo: n.geo === 'note' ? 'rectangle' : n.geo,
          label: n.label,
          role: n.role,
          colorOverride: null,
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        });
        created.push(tid);
        tier1Ids.push(tid);
        this.createBoundArrow(editor, rootId, tid, edition, speculative, res.utteranceId);
      });

      tier2.forEach((n, idx) => {
        const parentIdx = idx % Math.max(1, tier1Ids.length);
        const parentId = tier1Ids[parentIdx] ?? rootId;
        const pBounds = editor.getShapePageBounds(parentId);
        const lx = pBounds ? pBounds.midX : cx + (idx - (tier2.length - 1) / 2) * gap1;
        const ly = cy + 130;
        const lid = this.spawnNode(editor, {
          x: lx,
          y: ly,
          w: 150,
          h: 68,
          shapeType: 'geo',
          geo: n.geo === 'note' ? 'oval' : n.geo,
          label: n.label,
          role: n.role,
          colorOverride: null,
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        });
        created.push(lid);
        this.createBoundArrow(editor, parentId, lid, edition, speculative, res.utteranceId);
      });
      return buildReturn(created);
    }

    if (bpKind === 'venn') {
      const vennNodes = nodes.slice(0, 3);
      const offsets: [number, number][] =
        vennNodes.length === 2
          ? [
              [-72, 0],
              [72, 0],
            ]
          : [
              [-74, -42],
              [74, -42],
              [0, 62],
            ];
      const roles: ColorRole[] = ['primary', 'secondary', 'accent'];
      vennNodes.forEach((n, idx) => {
        const [ox, oy] = offsets[idx] ?? [0, 0];
        created.push(
          this.spawnNode(editor, {
            x: cx + ox,
            y: cy + oy,
            w: 225,
            h: 225,
            shapeType: 'geo',
            geo: 'ellipse',
            label: n.label,
            role: roles[idx % roles.length],
            colorOverride: idx === 0 && effectiveColor ? effectiveColor : null,
            fillOverride: 'semi',
            slots,
            edition,
            speculative,
            utteranceId: res.utteranceId,
          }),
        );
      });
      return buildReturn(created);
    }

    if (bpKind === 'funnel') {
      const stages = nodes.slice(0, 5);
      const stepY = 98;
      stages.forEach((n, idx) => {
        const w = Math.max(145, 330 - idx * 54);
        const y = cy + (idx - (stages.length - 1) / 2) * stepY;
        created.push(
          this.spawnNode(editor, {
            x: cx,
            y,
            w,
            h: 72,
            shapeType: 'geo',
            geo: 'trapezoid',
            label: n.label,
            role: n.role,
            colorOverride: idx === stages.length - 1 ? effectiveColor : null,
            slots,
            edition,
            speculative,
            utteranceId: res.utteranceId,
          }),
        );
      });
      for (let i = 0; i < created.length - 1; i++) {
        this.createBoundArrow(editor, created[i], created[i + 1], edition, speculative, res.utteranceId);
      }
      return buildReturn(created);
    }

    if (bpKind === 'neural') {
      const colStep = isPortrait ? 165 : 235;
      const inputs = nodes.slice(0, 2);
      const hidden = nodes.slice(2, 5);
      const outputs = nodes.slice(5, 6);

      const inIds = inputs.map((n, i) =>
        this.spawnNode(editor, {
          x: cx - colStep,
          y: cy + (i - (inputs.length - 1) / 2) * 125,
          w: 132,
          h: 88,
          shapeType: 'geo',
          geo: 'ellipse',
          label: n.label,
          role: n.role,
          colorOverride: null,
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        }),
      );
      const hidIds = hidden.map((n, i) =>
        this.spawnNode(editor, {
          x: cx,
          y: cy + (i - (hidden.length - 1) / 2) * 115,
          w: 148,
          h: 96,
          shapeType: 'geo',
          geo: 'hexagon',
          label: n.label,
          role: n.role,
          colorOverride: effectiveColor,
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        }),
      );
      const outIds = outputs.map((n, i) =>
        this.spawnNode(editor, {
          x: cx + colStep,
          y: cy + (i - (outputs.length - 1) / 2) * 115,
          w: 150,
          h: 88,
          shapeType: 'geo',
          geo: 'oval',
          label: n.label,
          role: 'accent',
          colorOverride: null,
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        }),
      );

      created.push(...inIds, ...hidIds, ...outIds);
      for (const iid of inIds) {
        for (const hid of hidIds) {
          this.createBoundArrow(editor, iid, hid, edition, speculative, res.utteranceId);
        }
      }
      for (const hid of hidIds) {
        for (const oid of outIds) {
          this.createBoundArrow(editor, hid, oid, edition, speculative, res.utteranceId);
        }
      }
      return buildReturn(created);
    }

    if (bpKind === 'wireframe') {
      const frameW = isPortrait ? 310 : 420;
      const frameH = 420;
      const frameTitle = cleanTopic ? `${cleanTopic} · Screen` : 'Product Wireframe';
      const frameId = this.spawnNode(editor, {
        x: cx,
        y: cy,
        w: frameW,
        h: frameH,
        shapeType: 'frame',
        label: frameTitle,
        role: 'muted',
        colorOverride: null,
        slots,
        edition,
        speculative,
        utteranceId: res.utteranceId,
      });
      if (!speculative) editor.sendToBack([frameId]);

      const innerW = frameW - 52;
      const navId = this.spawnNode(editor, {
        x: cx,
        y: cy - 148,
        w: innerW,
        h: 52,
        shapeType: 'geo',
        geo: 'rectangle',
        label: nodes[0]?.label ?? 'Navigation',
        role: 'muted',
        colorOverride: null,
        slots,
        edition,
        speculative,
        utteranceId: res.utteranceId,
      });
      const heroId = this.spawnNode(editor, {
        x: cx,
        y: cy - 34,
        w: innerW,
        h: 132,
        shapeType: 'geo',
        geo: 'rectangle',
        label: nodes[1]?.label ?? 'Hero Showcase',
        role: 'primary',
        colorOverride: null,
        slots,
        edition,
        speculative,
        utteranceId: res.utteranceId,
      });
      const inputId = this.spawnNode(editor, {
        x: cx,
        y: cy + 78,
        w: innerW,
        h: 54,
        shapeType: 'geo',
        geo: 'oval',
        label: nodes[2]?.label ?? 'Input Field',
        role: 'secondary',
        colorOverride: null,
        slots,
        edition,
        speculative,
        utteranceId: res.utteranceId,
      });
      const ctaId = this.spawnNode(editor, {
        x: cx,
        y: cy + 150,
        w: Math.min(210, innerW),
        h: 54,
        shapeType: 'geo',
        geo: 'oval',
        label: nodes[3]?.label ?? 'Continue',
        role: 'accent',
        colorOverride: effectiveColor,
        fillOverride: 'solid',
        slots,
        edition,
        speculative,
        utteranceId: res.utteranceId,
      });
      created.push(navId, heroId, inputId, ctaId);
      return buildReturn([frameId, ...created]);
    }

    if (bpKind === 'layers') {
      const barW = isPortrait ? 310 : 440;
      const stepY = 82;
      nodes.forEach((n, idx) => {
        const y = cy + (idx - (nodes.length - 1) / 2) * stepY;
        created.push(
          this.spawnNode(editor, {
            x: cx,
            y,
            w: barW,
            h: 66,
            shapeType: 'geo',
            geo: 'rectangle',
            label: n.label,
            role: n.role,
            colorOverride: idx === 0 ? effectiveColor : null,
            slots,
            edition,
            speculative,
            utteranceId: res.utteranceId,
          }),
        );
      });
      return buildReturn(created);
    }

    if (bpKind === 'comparison') {
      const colOffset = isPortrait ? 105 : 135;
      const cardW = isPortrait ? 185 : 235;
      const pairs = Math.ceil(nodes.length / 2);
      nodes.forEach((n, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const isHeader = row === 0;
        created.push(
          this.spawnNode(editor, {
            x: cx + (col === 0 ? -colOffset : colOffset),
            y: cy + (row - (pairs - 1) / 2) * 96,
            w: cardW,
            h: isHeader ? 68 : 78,
            shapeType: 'geo',
            geo: 'rectangle',
            label: n.label,
            role: n.role,
            colorOverride: col === 1 && isHeader ? effectiveColor : null,
            fillOverride: isHeader && col === 1 ? 'solid' : undefined,
            slots,
            edition,
            speculative,
            utteranceId: res.utteranceId,
          }),
        );
      });
      return buildReturn(created);
    }

    if (bpKind === 'state_machine') {
      const stepX = isPortrait ? 0 : 215;
      const stepY = isPortrait ? 130 : 0;
      nodes.forEach((n, idx) => {
        created.push(
          this.spawnNode(editor, {
            x: cx + (idx - (nodes.length - 1) / 2) * stepX,
            y: cy + (idx - (nodes.length - 1) / 2) * stepY,
            w: 165,
            h: 82,
            shapeType: 'geo',
            geo: n.geo === 'note' ? 'oval' : n.geo,
            label: n.label,
            role: n.role,
            colorOverride: idx === 2 ? effectiveColor : null,
            slots,
            edition,
            speculative,
            utteranceId: res.utteranceId,
          }),
        );
      });
      const edgeVerbs = ['arm', 'active', 'commit', 'next'];
      for (let i = 0; i < created.length - 1; i++) {
        this.createBoundArrow(
          editor,
          created[i],
          created[i + 1],
          edition,
          speculative,
          res.utteranceId,
          edgeVerbs[i] ?? null,
        );
      }
      if (created.length >= 3) {
        this.createBoundArrow(
          editor,
          created[created.length - 1],
          created[0],
          edition,
          speculative,
          res.utteranceId,
          'reset',
          { kind: 'arc', bend: 54 },
        );
      }
      return buildReturn(created);
    }

    if (bpKind === 'quadrant' || bpKind === 'bento') {
      const gapX = 215;
      const gapY = 140;
      nodes.slice(0, 4).forEach((n, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const w = bpKind === 'bento' && idx === 0 ? 205 : 190;
        const h = 115;
        created.push(
          this.spawnNode(editor, {
            x: cx + (col - 0.5) * gapX,
            y: cy + (row - 0.5) * gapY,
            w,
            h,
            shapeType: 'geo',
            geo: n.geo === 'note' ? 'rectangle' : n.geo,
            label: n.label,
            role: n.role,
            colorOverride: effectiveColor,
            slots,
            edition,
            speculative,
            utteranceId: res.utteranceId,
          }),
        );
      });
      return buildReturn(created);
    }

    if (bpKind === 'kanban') {
      const colGap = isPortrait ? 185 : 230;
      nodes.forEach((col, cIdx) => {
        const colX = cx + (cIdx - (nodes.length - 1) / 2) * colGap;
        const headerId = this.spawnNode(editor, {
          x: colX,
          y: cy - 110,
          w: 165,
          h: 64,
          shapeType: 'geo',
          geo: 'rectangle',
          label: col.label,
          role: col.role,
          colorOverride: null,
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        });
        created.push(headerId);

        const cardId = this.spawnNode(editor, {
          x: colX,
          y: cy + 30,
          w: 165,
          h: 135,
          shapeType: 'note',
          label: cIdx === 0 ? 'Explore' : cIdx === 1 ? 'In Studio' : 'Complete',
          role: col.role,
          colorOverride: effectiveColor,
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        });
        created.push(cardId);
      });
      return buildReturn(created);
    }

    if (bpKind === 'sequence') {
      const actors = nodes.slice(0, 4);
      const actorGap = isPortrait ? 152 : 208;
      const headerY = cy - 142;
      const actorXs: number[] = [];

      actors.forEach((actor, idx) => {
        const ax = cx + (idx - (actors.length - 1) / 2) * actorGap;
        actorXs.push(ax);
        const aid = this.spawnNode(editor, {
          x: ax,
          y: headerY,
          w: isPortrait ? 136 : 162,
          h: 66,
          shapeType: 'geo',
          geo: actor.geo === 'note' ? 'rectangle' : actor.geo,
          label: actor.label,
          role: actor.role,
          colorOverride: idx === 0 && effectiveColor ? effectiveColor : null,
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        });
        created.push(aid);

        // Vertical dashed lifeline beneath each actor
        const lineIdx = getIndices(2);
        editor.createShape({
          id: createShapeId(),
          type: 'line',
          x: ax,
          y: headerY + 38,
          opacity: speculative ? 0.24 : 0.72,
          meta: {
            speculative,
            utteranceId: res.utteranceId,
            role: 'muted',
            ...(speculative ? {} : { reg: `s${nextRegSeq++}`, sketchLabel: `${actor.label} lifeline` }),
          },
          props: {
            color: edition.tokens.connectorColor,
            dash: 'dashed',
            size: 's',
            spline: 'line',
            points: {
              [lineIdx[0]]: { id: lineIdx[0], index: lineIdx[0], x: 0, y: 0 },
              [lineIdx[1]]: { id: lineIdx[1], index: lineIdx[1], x: 0, y: 268 },
            },
            scale: 1,
          },
        });
      });

      const callLabels = ['1 · request()', '2 · authorize()', '3 · query()', '4 · commit()'];
      const msgStartY = headerY + 86;
      const msgStepY = 56;
      for (let i = 0; i < actorXs.length - 1; i++) {
        const y = msgStartY + i * msgStepY;
        editor.createShape({
          id: createShapeId(),
          type: 'arrow',
          x: actorXs[i],
          y,
          opacity: speculative ? 0.28 : 1,
          meta: { speculative, utteranceId: res.utteranceId, role: 'primary' },
          props: {
            kind: 'arc',
            bend: 0,
            color: edition.tokens.primaryColor,
            labelColor: edition.tokens.primaryColor,
            font: 'mono',
            dash: speculative ? 'dashed' : 'solid',
            size: 's',
            arrowheadStart: 'none',
            arrowheadEnd: 'arrow',
            start: { x: 4, y: 0 },
            end: { x: actorXs[i + 1] - actorXs[i] - 4, y: 0 },
            richText: toRichText(callLabels[i] ?? `step ${i + 1}`),
          },
        });
      }

      if (actorXs.length >= 2) {
        const retY = msgStartY + (actorXs.length - 1) * msgStepY + 12;
        const lastX = actorXs[actorXs.length - 1];
        const firstX = actorXs[0];
        editor.createShape({
          id: createShapeId(),
          type: 'arrow',
          x: lastX,
          y: retY,
          opacity: speculative ? 0.24 : 0.9,
          meta: { speculative, utteranceId: res.utteranceId, role: 'accent' },
          props: {
            kind: 'arc',
            bend: 0,
            color: edition.tokens.accentColor,
            labelColor: edition.tokens.accentColor,
            font: 'mono',
            dash: 'dashed',
            size: 's',
            arrowheadStart: 'none',
            arrowheadEnd: 'arrow',
            start: { x: -4, y: 0 },
            end: { x: firstX - lastX + 4, y: 0 },
            richText: toRichText('200 OK · payload'),
          },
        });
      }
      return buildReturn(created);
    }

    if (bpKind === 'table') {
      const cols = 3;
      const paddedCount = Math.max(6, Math.ceil(nodes.length / cols) * cols);
      const rows = Math.ceil(paddedCount / cols);
      const cellW = isPortrait ? 132 : 182;
      const cellH = 62;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const n = nodes[idx] ?? {
            label: r === 0 ? `Col ${c + 1}` : '—',
            geo: 'rectangle' as const,
            role: (r === 0 ? 'accent' : c === 0 ? 'primary' : 'muted') as ColorRole,
          };
          const x = cx + (c - (cols - 1) / 2) * cellW;
          const y = cy + (r - (rows - 1) / 2) * cellH;
          const isHeader = r === 0;
          created.push(
            this.spawnNode(editor, {
              x,
              y,
              w: cellW,
              h: cellH,
              shapeType: 'geo',
              geo: 'rectangle',
              label: n.label,
              role: isHeader ? 'accent' : c === 0 ? 'primary' : 'secondary',
              colorOverride: isHeader && effectiveColor ? effectiveColor : null,
              fillOverride: isHeader ? 'solid' : 'semi',
              fontOverride: c === cols - 1 && !isHeader ? 'mono' : undefined,
              sizeOverride: 's',
              slots,
              edition,
              speculative,
              utteranceId: res.utteranceId,
            }),
          );
        }
      }
      return buildReturn(created);
    }

    if (bpKind === 'journey') {
      const stages = nodes.slice(0, 4);
      const colGap = isPortrait ? 182 : 216;
      const touchpoints = ['First Impression', 'Spoken Prompt', 'Tactile Polish', 'Archival Share'];
      const sentiments = ['Curious', 'Delighted', 'In Flow', 'Confident'];
      const stageIds: TLShapeId[] = [];
      const extraIds: TLShapeId[] = [];

      stages.forEach((st, idx) => {
        const sx = cx + (idx - (stages.length - 1) / 2) * colGap;
        const headerId = this.spawnNode(editor, {
          x: sx,
          y: cy - 102,
          w: isPortrait ? 162 : 188,
          h: 68,
          shapeType: 'geo',
          geo: 'arrow-right',
          label: st.label,
          role: st.role,
          colorOverride: idx === stages.length - 1 ? effectiveColor : null,
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        });
        stageIds.push(headerId);

        const tpId = this.spawnNode(editor, {
          x: sx,
          y: cy + 6,
          w: isPortrait ? 162 : 184,
          h: 76,
          shapeType: 'geo',
          geo: 'rectangle',
          label: touchpoints[idx] ?? `Touchpoint ${idx + 1}`,
          role: 'primary',
          colorOverride: null,
          sizeOverride: 's',
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        });
        extraIds.push(tpId);
        this.createBoundArrow(editor, headerId, tpId, edition, speculative, res.utteranceId);

        const moodId = this.spawnNode(editor, {
          x: sx,
          y: cy + 106,
          w: 146,
          h: 58,
          shapeType: 'geo',
          geo: 'oval',
          label: sentiments[idx] ?? 'Positive',
          role: idx === stages.length - 1 ? 'accent' : 'secondary',
          colorOverride: null,
          fillOverride: 'semi',
          sizeOverride: 's',
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        });
        extraIds.push(moodId);
      });

      for (let i = 0; i < stageIds.length - 1; i++) {
        this.createBoundArrow(editor, stageIds[i], stageIds[i + 1], edition, speculative, res.utteranceId);
      }
      created.push(...stageIds, ...extraIds);
      return buildReturn(stageIds);
    }

    if (bpKind === 'er_schema') {
      const entities = nodes.slice(0, 4);
      const gapX = isPortrait ? 245 : 295;
      const gapY = 205;
      const schemaColumns = (rawName: string, idx: number): string[] => {
        const slug = rawName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '') || `table_${idx + 1}`;
        const fk =
          idx === 0
            ? 'email: text UNIQUE'
            : `owner_id: uuid FK`;
        return [
          'id: uuid PK',
          fk,
          `${slug}_title: text`,
          'created_at: timestamptz',
        ];
      };

      entities.forEach((ent, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const ex = cx + (col - 0.5) * gapX;
        const ey = cy + (row - 0.5) * gapY;
        const richSchema = buildCodeRichText(ent.label.toUpperCase(), schemaColumns(ent.label, idx));
        created.push(
          this.spawnNode(editor, {
            x: ex,
            y: ey,
            w: isPortrait ? 218 : 248,
            h: 158,
            shapeType: 'geo',
            geo: 'rectangle',
            label: ent.label,
            richTextOverride: richSchema,
            alignOverride: 'start',
            verticalAlignOverride: 'start',
            fontOverride: 'mono',
            sizeOverride: 's',
            role: ent.role,
            colorOverride: idx === 0 && effectiveColor ? effectiveColor : null,
            slots,
            edition,
            speculative,
            utteranceId: res.utteranceId,
          }),
        );
      });

      if (created.length >= 2) {
        this.createBoundArrow(editor, created[0], created[1], edition, speculative, res.utteranceId, '1 : N', {
          kind: 'elbow',
          bend: 0,
        });
      }
      if (created.length >= 3) {
        this.createBoundArrow(editor, created[1], created[2], edition, speculative, res.utteranceId, '1 : N', {
          kind: 'elbow',
          bend: 0,
        });
      }
      if (created.length >= 4) {
        this.createBoundArrow(editor, created[2], created[3], edition, speculative, res.utteranceId, '1 : N', {
          kind: 'elbow',
          bend: 0,
        });
      }
      return { ids: created };
    }

    const vertical = isPortrait && bpKind !== 'timeline';
    const stepX = vertical ? 0 : edition.tokens.gapX;
    const stepY = vertical ? 150 : 0;

    nodes.forEach((n, idx) => {
      const x = cx + (idx - (nodes.length - 1) / 2) * stepX;
      const y = cy + (idx - (nodes.length - 1) / 2) * stepY;
      const id = this.spawnNode(editor, {
        x,
        y,
        w: n.geo === 'diamond' ? 175 : 195,
        h: n.geo === 'diamond' ? 130 : 92,
        shapeType: 'geo',
        geo: n.geo === 'note' ? 'rectangle' : n.geo,
        label: n.label,
        role: n.role,
        colorOverride: effectiveColor,
        slots,
        edition,
        speculative,
        utteranceId: res.utteranceId,
      });
      created.push(id);
    });

    for (let i = 0; i < created.length - 1; i++) {
      this.createBoundArrow(editor, created[i], created[i + 1], edition, speculative, res.utteranceId);
    }
    return buildReturn(created);
  }

  private getPlainShapeLabel(shape: TLShape): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = shape.props as any;
    if (typeof props?.name === 'string' && props.name) return props.name.trim();
    const headline = extractHeadlineText(props?.richText);
    if (headline) return headline;
    const plain = extractRichTextPlain(props?.richText);
    if (plain) return plain;
    return typeof shape.meta?.sketchLabel === 'string' ? shape.meta.sketchLabel : '';
  }

  private findShapeByLabelHint(editor: Editor, hint?: string | null, excludeId?: TLShapeId): TLShape | null {
    if (!hint) return null;
    const needle = hint
      .toLowerCase()
      .replace(/^(the|a|an|that|this|my)\s+/i, '')
      .trim();
    if (!needle) return null;

    const candidates = editor
      .getCurrentPageShapes()
      .filter((s) => !s.meta?.speculative && s.type !== 'arrow' && s.id !== excludeId);

    // 1. Exact headline or label match (prefer most recently created)
    for (let i = candidates.length - 1; i >= 0; i--) {
      const s = candidates[i];
      if (this.getPlainShapeLabel(s).toLowerCase() === needle) return s;
    }

    // 2. Substring match across headline, full richText body, or color+shape descriptor
    for (let i = candidates.length - 1; i >= 0; i--) {
      const s = candidates[i];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const props = s.props as any;
      const lbl = this.getPlainShapeLabel(s).toLowerCase();
      const fullBody = extractRichTextPlain(props?.richText).toLowerCase();
      const desc = `${props?.color ?? ''} ${props?.geo ?? s.type} ${lbl} ${fullBody}`.toLowerCase();
      if (
        (lbl && (lbl.includes(needle) || needle.includes(lbl))) ||
        (fullBody && fullBody.includes(needle)) ||
        desc.includes(needle)
      ) {
        return s;
      }
    }
    return null;
  }

  private resolveShapesFromRegs(
    editor: Editor,
    regs: string[],
    labelHint?: string | null,
  ): TLShape[] {
    const all = editor
      .getCurrentPageShapes()
      .filter((s) => !s.meta?.speculative && s.type !== 'arrow');
    if (all.length === 0) return [];

    if (regs.includes('ALL')) return all;

    const regSet = new Set(regs.map((r) => r.toLowerCase()));
    const matched = all.filter((s) => {
      const r = typeof s.meta?.reg === 'string' ? s.meta.reg.toLowerCase() : '';
      return r && regSet.has(r);
    });
    if (matched.length > 0) return matched;

    if (labelHint) {
      const hinted = this.findShapeByLabelHint(editor, labelHint);
      if (hinted) return [hinted];
    }

    const selected = editor.getSelectedShapes().filter((s) => !s.meta?.speculative);
    if (selected.length > 0) return selected;

    const recent = this.lastCreatedIds
      .map((id) => editor.getShape(id))
      .filter((s): s is TLShape => Boolean(s));
    if (recent.length > 0) return recent;
    return [all[all.length - 1]];
  }

  private findShapeByReg(editor: Editor, reg?: string | null, labelHint?: string | null): TLShape | null {
    if (reg) {
      const target = reg.toLowerCase();
      const byReg =
        editor
          .getCurrentPageShapes()
          .find(
            (s) =>
              !s.meta?.speculative &&
              typeof s.meta?.reg === 'string' &&
              s.meta.reg.toLowerCase() === target,
          ) ?? null;
      if (byReg) return byReg;
    }
    if (labelHint) {
      return this.findShapeByLabelHint(editor, labelHint);
    }
    return null;
  }

  /**
   * 1. SPECULATIVE GHOST PREVIEW (256d MRL + Earlybird -90ms predictions)
   * In-place morphs existing ghost nodes when utteranceId & count match so rapid speech never flickers!
   */
  public executeSpeculative(
    editor: Editor,
    res: SemanticResolution,
    currentEdition: AestheticEdition,
  ): DirectorResult | null {
    const slots = parseVoiceSlots(res.rawText, res.ghostText);
    if (slots.wordCount < 2) return null;

    if (
      slots.animationKind !== null ||
      slots.spatialRelation !== null ||
      slots.toolSwitch !== null ||
      slots.sketchMotif !== null ||
      slots.richCardKind !== null ||
      slots.pageAction !== null ||
      slots.exportFormat !== null ||
      /\b(move|shift|nudge|slide|put|place|swap|delete|remove|erase|clear|undo|redo|connect|color|paint|spin|orbit|float|bounce|pulse|stop|freeze|rotate|align|distribute|duplicate|frame|group|ungroup|pack|stack|stretch|flip|mirror|export|append|underline)\b/i.test(
        slots.cleanText,
      )
    ) {
      return null;
    }

    const effectiveIntent = slots.lexicalIntent ?? res.intentKind;
    const isBlueprint = effectiveIntent === 'compose_layout' || res.blueprintScore >= 0.7;
    const canPreview =
      (effectiveIntent === 'create_shape' && res.intentScore >= 0.56) ||
      (effectiveIntent === 'compose_layout' && (res.intentScore >= 0.56 || res.blueprintScore >= 0.62));

    if (!canPreview) return null;

    editor.store.mergeRemoteChanges(() => {
      const existingSpecs = editor
        .getCurrentPageShapes()
        .filter((s) => Boolean(s.meta?.speculative));

      const archId = slots.explicitArchetypeId ?? res.archetypeId;
      const archetype = SHAPE_ARCHETYPES.find((a) => a.id === archId) ?? SHAPE_ARCHETYPES[0];
      const desiredCount = Math.min(12, Math.max(1, slots.listLabels.length || slots.count || 1));

      // Fast in-place morph path for single/multi geo shape previews within the same utterance!
      if (
        !isBlueprint &&
        archetype.shapeType === 'geo' &&
        desiredCount === 1 &&
        existingSpecs.length === 1 &&
        existingSpecs[0].type === 'geo' &&
        existingSpecs[0].meta?.utteranceId === res.utteranceId
      ) {
        const s = existingSpecs[0];
        const b = editor.getShapePageBounds(s.id);
        const cx = b ? b.midX : s.x + archetype.w / 2;
        const cy = b ? b.midY : s.y + archetype.h / 2;
        const color =
          slots.explicitColor ?? res.color ?? roleToColor(currentEdition, archetype.role);
        editor.updateShape({
          id: s.id,
          type: 'geo',
          x: cx - archetype.w / 2,
          y: cy - archetype.h / 2,
          props: {
            geo: archetype.geo ?? 'rectangle',
            w: archetype.w,
            h: archetype.h,
            color,
            richText: toRichText(slots.singleLabel ?? ''),
          },
        });
        return;
      }

      if (existingSpecs.length > 0) {
        editor.deleteShapes(existingSpecs.map((s) => s.id));
      }

      if (isBlueprint) {
        this.renderBlueprint(
          editor,
          slots.explicitBlueprintId ?? res.blueprintId,
          res,
          slots,
          currentEdition,
          true,
        );
      } else {
        this.renderCreateShapes(editor, res, slots, currentEdition, true);
      }
    });

    return { summary: 'Speculative preview' };
  }

  /**
   * 2. COMMIT EXECUTION (Driven by Superscalar + Qwen Canvas State Computer)
   * Executes single OR multi-clause compound syscall batches inside a single atomic tldraw transaction!
   */
  public executeStateDecision(
    editor: Editor,
    decision: StateComputerDecision,
    currentEdition: AestheticEdition,
    onEditionChange: (ed: AestheticEdition) => void,
  ): DirectorResult | null {
    const { resolution: res, rawOpcodeLine } = decision;
    const batch =
      decision.syscalls && decision.syscalls.length > 0 ? decision.syscalls : [decision.syscall];

    // Safety handoff: if commit returned only NOOP while speculative shapes exist for THIS utterance, crystallize!
    if (batch.length === 1 && batch[0].op === 'NOOP') {
      if (res.meanWordConfidence >= 0.42) {
        const crystallized = this.crystallizeSpeculativeShapes(
          editor,
          res.utteranceId,
          currentEdition,
        );
        if (crystallized.length > 0) {
          return {
            summary: `Placed ${crystallized.length} element${crystallized.length > 1 ? 's' : ''}`,
            opcode: 'CRYSTALLIZE',
          };
        }
      }
      this.clearSpeculativeShapes(editor);
      return null;
    }

    const slots = parseVoiceSlots(res.rawText, res.ghostText);
    let activeEdition = currentEdition;
    let changedAesthetic: AestheticEdition | undefined;
    const summaries: string[] = [];
    let harmonizeGoal: string | undefined;
    let ideateTarget: IdeateEnrichmentTarget | undefined;
    let requestExport: DirectorResult['requestExport'];
    let changedTool: StudioToolId | undefined;
    let changedPage: DirectorResult['changedPage'];
    const newlyCreatedIds: TLShapeId[] = [];

    editor.markHistoryStoppingPoint(`voice-commit-${res.utteranceId}`);

    editor.run(() => {
      this.clearSpeculativeShapes(editor);

      // Check embedded aesthetic shift alongside creation/styling commands
      const explicitThemeOp = batch.find((op) => op.op === 'AESTHETIC') as
        | Extract<CanvasSyscall, { op: 'AESTHETIC' }>
        | undefined;
      if (explicitThemeOp || res.aestheticScore >= 0.75) {
        const targetId = explicitThemeOp
          ? (explicitThemeOp.aestheticId ?? res.aestheticId)
          : res.aestheticId;
        const foundEd = AESTHETIC_EDITIONS.find((e) => e.id === targetId);
        if (foundEd && (explicitThemeOp || foundEd.id !== currentEdition.id)) {
          activeEdition = foundEd;
          changedAesthetic = foundEd;
          onEditionChange(foundEd);
          this.applyAestheticToCanvas(editor, foundEd);
          summaries.push(`${foundEd.catalogueNumber} · ${foundEd.title}`);
        }
      }

      for (const syscall of batch) {
        if (syscall.op === 'NOOP' || syscall.op === 'AESTHETIC') continue;
        const stepRes = this.executeOneSyscall(
          editor,
          syscall,
          res,
          slots,
          activeEdition,
          newlyCreatedIds,
        );
        if (stepRes?.summary) summaries.push(stepRes.summary);
        if (stepRes?.requestHarmonizeGoal) harmonizeGoal = stepRes.requestHarmonizeGoal;
        if (stepRes?.ideateTarget) ideateTarget = stepRes.ideateTarget;
        if (stepRes?.requestExport) requestExport = stepRes.requestExport;
        if (stepRes?.changedTool) changedTool = stepRes.changedTool;
        if (stepRes?.changedPage) changedPage = stepRes.changedPage;
      }
    });

    if (newlyCreatedIds.length > 0) {
      const currentPageId = editor.getCurrentPageId();
      const onCurrentPage = newlyCreatedIds.filter(
        (id) => editor.getShape(id)?.parentId === currentPageId,
      );
      if (onCurrentPage.length > 0) {
        this.frameIfOutsideViewport(editor, onCurrentPage);
      }
    }

    if (summaries.length === 0 && !harmonizeGoal && !requestExport) return null;

    return {
      summary: summaries.join(' · ') || 'Updated canvas',
      opcode: rawOpcodeLine,
      changedAesthetic,
      requestHarmonizeGoal: harmonizeGoal,
      ideateTarget,
      requestExport,
      changedTool,
      changedPage,
    };
  }

  private executeOneSyscall(
    editor: Editor,
    syscall: CanvasSyscall,
    res: SemanticResolution,
    slots: ParsedSlots,
    activeEdition: AestheticEdition,
    newlyCreatedIds: TLShapeId[],
  ): DirectorResult | null {
    switch (syscall.op) {
      case 'TOOL': {
        if (syscall.color) {
          editor.setStyleForNextShapes(DefaultColorStyle, syscall.color);
        }
        if (syscall.size) {
          editor.setStyleForNextShapes(DefaultSizeStyle, syscall.size);
        }
        if (syscall.dash) {
          editor.setStyleForNextShapes(DefaultDashStyle, syscall.dash);
        }
        editor.setCurrentTool(syscall.tool);
        const toolNames: Record<StudioToolId, string> = {
          select: 'Pointer select',
          draw: 'Freehand ink pen',
          highlight: 'Highlighter marker',
          laser: 'Presentation laser',
          eraser: 'Precision eraser',
          hand: 'Hand pan',
          arrow: 'Connector arrow',
          line: 'Spline line',
          note: 'Sticky note',
          text: 'Typography tool',
          frame: 'Frame tool',
        };
        return {
          summary: `${toolNames[syscall.tool] ?? syscall.tool}${syscall.color ? ` (${syscall.color})` : ''}`,
          changedTool: syscall.tool,
        };
      }

      case 'SKETCH': {
        const isAnnotation =
          syscall.motif === 'circle_around' ||
          syscall.motif === 'underline' ||
          syscall.motif === 'cross_out' ||
          syscall.motif === 'bracket';
        let targetBounds: { cx: number; cy: number; w: number; h: number } | null = null;

        if (
          isAnnotation ||
          (syscall.targets && syscall.targets.length > 0) ||
          syscall.targetLabelHint
        ) {
          const resolved = this.resolveShapesFromRegs(
            editor,
            syscall.targets ?? [],
            syscall.targetLabelHint,
          ).filter((s) => s.type !== 'draw' || Boolean(syscall.targetLabelHint));
          if (resolved.length > 0) {
            const bList = resolved
              .map((s) => editor.getShapePageBounds(s.id))
              .filter((b): b is NonNullable<typeof b> => Boolean(b));
            if (bList.length > 0) {
              const minX = Math.min(...bList.map((b) => b.minX));
              const maxX = Math.max(...bList.map((b) => b.maxX));
              const minY = Math.min(...bList.map((b) => b.minY));
              const maxY = Math.max(...bList.map((b) => b.maxY));
              targetBounds = {
                cx: (minX + maxX) / 2,
                cy: (minY + maxY) / 2,
                w: maxX - minX,
                h: maxY - minY,
              };
            }
          }
        }

        if (!targetBounds) {
          const pt = this.getViewportAnchorPoint(
            editor,
            syscall.anchor ?? null,
            !syscall.anchor,
            260,
            140,
          );
          targetBounds = { cx: pt.cx, cy: pt.cy, w: 220, h: 110 };
        }

        const color = syscall.color ?? activeEdition.tokens.accentColor;
        const reg = `s${nextRegSeq++}`;
        const sketched = spawnInkSketch(editor, {
          motif: syscall.motif,
          target: targetBounds,
          color,
          size: syscall.size ?? activeEdition.tokens.size,
          asCubicSpline: syscall.asCubicSpline,
          utteranceId: res.utteranceId,
          reg,
        });
        if (!isAnnotation) {
          this.lastCreatedIds = [sketched.id];
        }
        newlyCreatedIds.push(sketched.id);
        return { summary: `Sketched ${sketched.label.toLowerCase()}` };
      }

      case 'RICH_CARD': {
        const items = syscall.items.length > 0 ? syscall.items : ['First item', 'Second item'];
        const cardW = syscall.cardKind === 'code' ? 325 : 268;
        const cardH = Math.max(152, 74 + items.length * 32);
        const pt = this.getViewportAnchorPoint(
          editor,
          syscall.anchor ?? null,
          !syscall.anchor,
          cardW,
          cardH,
        );
        const richDoc =
          syscall.cardKind === 'code'
            ? buildCodeRichText(syscall.title ?? 'Snippet', items)
            : buildListRichText(
                syscall.title ??
                  (syscall.cardKind === 'checklist'
                    ? 'Checklist'
                    : syscall.cardKind === 'ordered'
                      ? 'Steps'
                      : 'Notes'),
                items,
                syscall.cardKind,
              );
        const id = this.spawnNode(editor, {
          x: pt.cx,
          y: pt.cy,
          w: cardW,
          h: cardH,
          shapeType: syscall.shapeKind === 'note' ? 'note' : 'geo',
          geo: 'rectangle',
          label: syscall.title ?? 'List',
          richTextOverride: richDoc,
          alignOverride: 'start',
          verticalAlignOverride: 'start',
          fontOverride: syscall.cardKind === 'code' ? 'mono' : undefined,
          sizeOverride: syscall.cardKind === 'code' ? 's' : undefined,
          role: syscall.cardKind === 'code' ? 'secondary' : 'primary',
          colorOverride: syscall.color ?? null,
          slots,
          edition: activeEdition,
          speculative: false,
          utteranceId: res.utteranceId,
        });
        this.lastCreatedIds = [id];
        newlyCreatedIds.push(id);
        return {
          summary:
            syscall.cardKind === 'code'
              ? `Added code card${syscall.title ? ` · ${syscall.title}` : ''}`
              : `Created ${syscall.cardKind} card (${items.length} items)`,
        };
      }

      case 'APPEND_TEXT': {
        const candidates = this.resolveShapesFromRegs(
          editor,
          syscall.targets,
          syscall.targetLabelHint,
        ).filter(
          (s) => !s.meta?.locked && (s.type === 'geo' || s.type === 'note' || s.type === 'text'),
        );
        if (candidates.length === 0) return null;
        const target = candidates[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const props = target.props as any;
        const updatedRich = appendToRichText(props?.richText, syscall.text, syscall.asBullet ?? true);
        const nextProps: Record<string, unknown> = {
          richText: updatedRich,
        };
        if (target.type === 'geo') {
          nextProps.align = 'start';
          nextProps.verticalAlign = 'start';
          if (typeof props?.h === 'number') {
            nextProps.h = Math.max(props.h, props.h + 28);
          }
          if (typeof props?.w === 'number' && props.w < 230) {
            nextProps.w = 240;
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor.updateShape({ id: target.id, type: target.type, props: nextProps as any });
        return { summary: `Appended "${syscall.text}"` };
      }

      case 'PAGE': {
        const pagesBefore = editor.getPages();
        const curId = editor.getCurrentPageId();
        const curIdx = Math.max(0, pagesBefore.findIndex((p) => p.id === curId));

        if (syscall.action === 'new') {
          const name = syscall.name?.trim() || `Study ${pagesBefore.length + 1}`;
          const newPageId = PageRecordType.createId();
          editor.createPage({ id: newPageId, name });
          editor.setCurrentPage(newPageId);
          this.lastCreatedIds = [];
          this.animations.syncCurrentPage();
          const pagesAfter = editor.getPages();
          const idx = pagesAfter.findIndex((p) => p.id === newPageId);
          return {
            summary: `Opened ${name} (${idx + 1}/${pagesAfter.length})`,
            changedPage: { name, index: idx + 1, total: pagesAfter.length },
          };
        }

        if (syscall.action === 'duplicate') {
          editor.duplicatePage(curId);
          this.lastCreatedIds = [];
          this.animations.syncCurrentPage();
          const pagesAfter = editor.getPages();
          const active = editor.getCurrentPage();
          const idx = pagesAfter.findIndex((p) => p.id === active.id);
          return {
            summary: `Duplicated to ${active.name} (${idx + 1}/${pagesAfter.length})`,
            changedPage: { name: active.name, index: idx + 1, total: pagesAfter.length },
          };
        }

        if (syscall.action === 'rename') {
          const nextName = syscall.name?.trim() || 'Untitled Study';
          editor.renamePage(curId, nextName);
          return {
            summary: `Renamed page to "${nextName}"`,
            changedPage: { name: nextName, index: curIdx + 1, total: pagesBefore.length },
          };
        }

        let targetPage = pagesBefore[curIdx];
        if (syscall.action === 'next') {
          targetPage = pagesBefore[(curIdx + 1) % pagesBefore.length];
        } else if (syscall.action === 'prev') {
          targetPage = pagesBefore[(curIdx - 1 + pagesBefore.length) % pagesBefore.length];
        } else if (syscall.action === 'first') {
          targetPage = pagesBefore[0];
        } else if (syscall.action === 'last') {
          targetPage = pagesBefore[pagesBefore.length - 1];
        } else if (syscall.action === 'goto') {
          if (
            syscall.pageNumber &&
            syscall.pageNumber >= 1 &&
            syscall.pageNumber <= pagesBefore.length
          ) {
            targetPage = pagesBefore[syscall.pageNumber - 1];
          } else if (syscall.name) {
            const needle = syscall.name.toLowerCase();
            const byName = pagesBefore.find((p) => p.name.toLowerCase().includes(needle));
            if (byName) targetPage = byName;
          }
        }

        if (targetPage && targetPage.id !== curId) {
          editor.setCurrentPage(targetPage.id);
          this.lastCreatedIds = [];
          this.animations.syncCurrentPage();
          if (editor.getCurrentPageShapes().length > 0) {
            editor.zoomToFit({ animation: { duration: 220 } });
          }
        }
        const active = editor.getCurrentPage();
        const activeIdx = editor.getPages().findIndex((p) => p.id === active.id);
        return {
          summary: `Page ${activeIdx + 1}/${pagesBefore.length} · ${active.name}`,
          changedPage: { name: active.name, index: activeIdx + 1, total: pagesBefore.length },
        };
      }

      case 'EXPORT': {
        return {
          summary:
            syscall.format === 'copy'
              ? 'Copying PNG to clipboard…'
              : `Exporting ${syscall.format.toUpperCase()}…`,
          requestExport: {
            format: syscall.format,
            selectionOnly: syscall.selectionOnly,
          },
        };
      }

      case 'GROUP': {
        let targets = this.resolveShapesFromRegs(editor, syscall.targets).filter(
          (s) => !s.meta?.locked && s.type !== 'group',
        );
        if (targets.length < 2) {
          targets = editor
            .getCurrentPageShapes()
            .filter((s) => !s.meta?.speculative && s.type !== 'arrow' && !s.meta?.locked);
        }
        if (targets.length < 2) return null;
        editor.groupShapes(targets.map((s) => s.id));
        const sel = editor.getSelectedShapeIds();
        if (sel.length > 0) this.lastCreatedIds = [...sel];
        return { summary: `Grouped ${targets.length} elements` };
      }

      case 'UNGROUP': {
        const groups = editor
          .getCurrentPageShapes()
          .filter((s) => !s.meta?.speculative && s.type === 'group' && !s.meta?.locked);
        if (groups.length === 0) return null;
        editor.ungroupShapes(groups.map((g) => g.id));
        return { summary: 'Ungrouped elements' };
      }

      case 'PACK': {
        let targets = this.resolveShapesFromRegs(editor, syscall.targets).filter(
          (s) => !s.meta?.locked && s.type !== 'frame',
        );
        if (targets.length < 2) {
          targets = editor
            .getCurrentPageShapes()
            .filter(
              (s) =>
                !s.meta?.speculative &&
                s.type !== 'arrow' &&
                s.type !== 'frame' &&
                !s.meta?.locked,
            );
        }
        if (targets.length < 2) return null;
        editor.packShapes(
          targets.map((s) => s.id),
          24,
        );
        return { summary: `Packed ${targets.length} elements` };
      }

      case 'STACK': {
        let targets = this.resolveShapesFromRegs(editor, syscall.targets).filter(
          (s) => !s.meta?.locked && s.type !== 'frame',
        );
        if (targets.length < 2) {
          targets = editor
            .getCurrentPageShapes()
            .filter(
              (s) =>
                !s.meta?.speculative &&
                s.type !== 'arrow' &&
                s.type !== 'frame' &&
                !s.meta?.locked,
            );
        }
        if (targets.length < 2) return null;
        editor.stackShapes(
          targets.map((s) => s.id),
          syscall.direction,
          22,
        );
        return { summary: `Stacked ${syscall.direction}ly` };
      }

      case 'STRETCH': {
        let targets = this.resolveShapesFromRegs(editor, syscall.targets).filter(
          (s) => !s.meta?.locked && s.type !== 'frame',
        );
        if (targets.length < 2) {
          targets = editor
            .getCurrentPageShapes()
            .filter(
              (s) =>
                !s.meta?.speculative &&
                s.type !== 'arrow' &&
                s.type !== 'frame' &&
                !s.meta?.locked,
            );
        }
        if (targets.length < 2) return null;
        const ids = targets.map((s) => s.id);
        if (syscall.direction === 'both') {
          editor.stretchShapes(ids, 'horizontal');
          editor.stretchShapes(ids, 'vertical');
          return { summary: 'Matched uniform dimensions' };
        }
        editor.stretchShapes(ids, syscall.direction);
        return { summary: `Matched ${syscall.direction === 'horizontal' ? 'width' : 'height'}` };
      }

      case 'FLIP': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets).filter(
          (s) => !s.meta?.locked,
        );
        if (targets.length === 0) return null;
        editor.flipShapes(
          targets.map((s) => s.id),
          syscall.axis,
        );
        return { summary: `Mirrored ${syscall.axis}ly` };
      }

      case 'GRID': {
        const parts: string[] = [];
        if (typeof syscall.gridMode === 'boolean') {
          editor.updateInstanceState({ isGridMode: syscall.gridMode });
          parts.push(syscall.gridMode ? 'Grid visible' : 'Grid hidden');
        }
        if (typeof syscall.snapMode === 'boolean') {
          editor.user.updateUserPreferences({ isSnapMode: syscall.snapMode });
          parts.push(syscall.snapMode ? 'Snap active' : 'Snap off');
        }
        return { summary: parts.join(' · ') || 'Updated studio grid' };
      }

      case 'STUDIO_GUIDE': {
        const pt = this.getViewportAnchorPoint(editor, null, true, 840, 290);
        const sections: { title: string; role: ColorRole; items: string[] }[] = [
          {
            title: 'Create & Sketch',
            role: 'primary',
            items: [
              '"Sequence diagram" · "ER schema"',
              '"Bullet list with Design, Build, Ship"',
              '"Circle around Gateway" · "Underline"',
              '"Put a yellow note right here"',
            ],
          },
          {
            title: 'Tools, Layout & Motion',
            role: 'accent',
            items: [
              '"Pen mode" · "Laser pointer" · "Select mode"',
              '"Pack shapes" · "Stack vertically" · "Group"',
              '"Orbit Earth around Sun" · "Float gently"',
              '"Show grid" · "Enable snap"',
            ],
          },
          {
            title: 'Pages, Themes & Export',
            role: 'secondary',
            items: [
              '"New page called Wireframe" · "Next page"',
              '"Kyoto Washi" · "Harmonize the canvas"',
              '"Export PNG" · "Export SVG" · "Copy image"',
              '"Lock that" · "Undo" · "Clear canvas"',
            ],
          },
        ];

        const cardW = 264;
        const cardH = 228;
        const gap = pt.isPortrait ? 0 : 284;
        const vGap = pt.isPortrait ? 248 : 0;
        const guideIds: TLShapeId[] = [];

        sections.forEach((sec, idx) => {
          const sx = pt.cx + (idx - 1) * gap;
          const sy = pt.cy + (idx - 1) * vGap;
          const cid = this.spawnNode(editor, {
            x: sx,
            y: sy,
            w: cardW,
            h: cardH,
            shapeType: 'geo',
            geo: 'rectangle',
            label: sec.title,
            richTextOverride: buildListRichText(sec.title, sec.items, 'bullet'),
            alignOverride: 'start',
            verticalAlignOverride: 'start',
            sizeOverride: 's',
            role: sec.role,
            colorOverride: null,
            slots,
            edition: activeEdition,
            speculative: false,
            utteranceId: res.utteranceId,
          });
          guideIds.push(cid);
          newlyCreatedIds.push(cid);
        });

        this.lastCreatedIds = guideIds;
        return { summary: 'Placed Spoken Studio voice reference' };
      }

      case 'LAYOUT': {
        const kind = syscall.kind ?? slots.explicitBlueprintId ?? res.blueprintId;
        const out = this.renderBlueprint(editor, kind, res, slots, activeEdition, false, {
          topic: syscall.topic,
          listLabels: syscall.listLabels,
          anchor: syscall.anchor,
          color: syscall.color,
        });
        this.lastCreatedIds = out.ids;
        newlyCreatedIds.push(...out.ids);
        return {
          summary: `Composed ${kind.replace('_', ' ')}`,
          ideateTarget: out.ideateTarget,
        };
      }

      case 'SPAWN': {
        const mergedSlots: ParsedSlots = {
          ...slots,
          count: syscall.count ?? slots.count,
          anchor: syscall.anchor !== undefined ? syscall.anchor : slots.anchor,
        };
        const ids = this.renderCreateShapes(editor, res, mergedSlots, activeEdition, false, {
          archetypeId: syscall.archetypeId,
          color: syscall.color,
          label: syscall.label,
          listLabels: syscall.listLabels,
          arrangement: syscall.arrangement,
          connectCreated: syscall.connectCreated,
          sizeOverride: syscall.sizeOverride,
        });
        this.lastCreatedIds = ids;
        newlyCreatedIds.push(...ids);
        return {
          summary:
            ids.length === 1 && syscall.label
              ? `Added ${syscall.label}`
              : `Placed ${ids.length} element${ids.length > 1 ? 's' : ''}`,
        };
      }

      case 'MOVE': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets).filter(
          (s) => !s.meta?.locked,
        );
        if (targets.length === 0) return { summary: 'Shape is locked' };

        if (syscall.anchor || syscall.dir === 'center') {
          const anchor = syscall.anchor ?? 'center';
          const pt = this.getViewportAnchorPoint(editor, anchor, false);
          editor.updateShapes(
            targets.map((s, i) => {
              const b = editor.getShapePageBounds(s.id);
              const w = b ? b.w : 180;
              const h = b ? b.h : 100;
              const spread = targets.length > 1 ? (i - (targets.length - 1) / 2) * (w + 28) : 0;
              return {
                id: s.id,
                type: s.type,
                x: pt.cx + spread - w / 2,
                y: pt.cy - h / 2,
              };
            }),
          );
          return { summary: `Moved to ${anchor}` };
        }

        const step =
          syscall.distance === 'small' ? 52 : syscall.distance === 'far' ? 285 : 145;
        const dx = syscall.dir === 'left' ? -step : syscall.dir === 'right' ? step : 0;
        const dy = syscall.dir === 'up' ? -step : syscall.dir === 'down' ? step : 0;
        editor.nudgeShapes(
          targets.map((s) => s.id),
          { x: dx, y: dy },
        );
        return { summary: `Moved ${syscall.dir ?? 'right'}` };
      }

      case 'PLACE': {
        const targets = this.resolveShapesFromRegs(
          editor,
          syscall.targets,
          syscall.targetLabelHint,
        ).filter((s) => !s.meta?.locked);
        const refShape = this.findShapeByReg(editor, syscall.refReg, syscall.refLabelHint);
        if (targets.length === 0 || !refShape) return null;

        const refBounds = editor.getShapePageBounds(refShape.id);
        if (!refBounds) return null;

        const margin = 46;
        editor.updateShapes(
          targets.map((s) => {
            const b = editor.getShapePageBounds(s.id);
            const w = b ? b.w : 180;
            const h = b ? b.h : 100;
            let cx = refBounds.midX;
            let cy = refBounds.midY;

            if (syscall.relation === 'above') {
              cy = refBounds.minY - margin - h / 2;
            } else if (syscall.relation === 'below') {
              cy = refBounds.maxY + margin + h / 2;
            } else if (syscall.relation === 'left-of') {
              cx = refBounds.minX - margin - w / 2;
            } else {
              cx = refBounds.maxX + margin + w / 2;
            }
            return { id: s.id, type: s.type, x: cx - w / 2, y: cy - h / 2 };
          }),
        );
        return { summary: `Placed ${syscall.relation.replace('-', ' ')}` };
      }

      case 'SWAP': {
        const shapeA = this.findShapeByReg(editor, syscall.regA);
        const shapeB = this.findShapeByReg(editor, syscall.regB);
        if (!shapeA || !shapeB || shapeA.id === shapeB.id) return null;

        const bA = editor.getShapePageBounds(shapeA.id);
        const bB = editor.getShapePageBounds(shapeB.id);
        if (!bA || !bB) return null;

        editor.updateShapes([
          {
            id: shapeA.id,
            type: shapeA.type,
            x: bB.midX - bA.w / 2,
            y: bB.midY - bA.h / 2,
          },
          {
            id: shapeB.id,
            type: shapeB.type,
            x: bA.midX - bB.w / 2,
            y: bA.midY - bB.h / 2,
          },
        ]);
        return { summary: 'Swapped positions' };
      }

      case 'ANIM': {
        const targets = this.resolveShapesFromRegs(
          editor,
          syscall.targets,
          syscall.targetLabelHint,
        );
        if (targets.length === 0) return null;
        const anchorShape = this.findShapeByReg(
          editor,
          syscall.aroundReg,
          syscall.aroundLabelHint,
        );
        // Never orbit a shape around itself!
        const filteredTargets =
          anchorShape && targets.length > 1
            ? targets.filter((t) => t.id !== anchorShape.id)
            : targets;
        const validAnchor =
          anchorShape && filteredTargets.every((t) => t.id !== anchorShape.id)
            ? anchorShape
            : null;

        const applied = this.animations.setAnimation(
          filteredTargets.map((s) => s.id),
          {
            kind: syscall.kind,
            speed: syscall.speed ?? 1,
            intensity: syscall.intensity ?? 1,
            anchorShapeId: validAnchor?.id ?? null,
            direction: syscall.direction,
          },
        );
        if (applied === 0) return null;
        return {
          summary: validAnchor
            ? `Orbiting around ${this.getPlainShapeLabel(validAnchor) || syscall.aroundReg || 'hub'}`
            : `Animating · ${syscall.kind}`,
        };
      }

      case 'TEMPO': {
        const isAll = syscall.targets.includes('ALL');
        const ids = isAll
          ? ('all' as const)
          : this.resolveShapesFromRegs(editor, syscall.targets).map((s) => s.id);
        const count = this.animations.adjustTempo(ids, syscall.multiplier, Boolean(syscall.reverse));
        if (count === 0) return null;
        return {
          summary: syscall.reverse
            ? 'Reversed motion'
            : syscall.multiplier > 1
              ? 'Accelerated motion'
              : 'Gentle tempo',
        };
      }

      case 'STOP_ANIM': {
        const isAll = syscall.targets.includes('ALL');
        const ids = isAll
          ? ('all' as const)
          : this.resolveShapesFromRegs(editor, syscall.targets).map((s) => s.id);
        this.animations.stopAnimation(ids);
        return { summary: 'Motion stilled' };
      }

      case 'HARMONIZE': {
        return {
          summary: 'Curating composition…',
          requestHarmonizeGoal: syscall.goalPrompt ?? res.rawText,
        };
      }

      case 'CONNECT': {
        const { cx, cy, isPortrait } = this.getViewportAnchorPoint(editor, null, true, 480, 180);

        // Multi-hop chain pipeline: "connect Client to Gateway to Auth to Postgres"
        if (syscall.chainLabels && syscall.chainLabels.length >= 2) {
          const chain = syscall.chainLabels;
          const chainIds: TLShapeId[] = [];
          const stepX = isPortrait ? 0 : activeEdition.tokens.gapX;
          const stepY = isPortrait ? activeEdition.tokens.gapY : 0;

          chain.forEach((lbl, idx) => {
            const existing = this.findShapeByLabelHint(editor, lbl);
            if (existing) {
              chainIds.push(existing.id);
            } else {
              const arch = this.inferArchetypeForLabel(lbl);
              const nx = cx + (idx - (chain.length - 1) / 2) * stepX;
              const ny = cy + (idx - (chain.length - 1) / 2) * stepY;
              const nid = this.spawnNode(editor, {
                x: nx,
                y: ny,
                w: arch.w,
                h: arch.h,
                shapeType: arch.shapeType,
                geo: arch.geo,
                label: lbl,
                role: idx === chain.length - 1 ? 'accent' : arch.role,
                colorOverride: null,
                slots,
                edition: activeEdition,
                speculative: false,
                utteranceId: res.utteranceId,
              });
              chainIds.push(nid);
              newlyCreatedIds.push(nid);
            }
          });

          for (let i = 0; i < chainIds.length - 1; i++) {
            if (chainIds[i] !== chainIds[i + 1]) {
              this.createBoundArrow(
                editor,
                chainIds[i],
                chainIds[i + 1],
                activeEdition,
                false,
                res.utteranceId,
                syscall.edgeLabel,
              );
            }
          }
          this.lastCreatedIds = chainIds;
          return { summary: `Linked ${chain.join(' → ')}` };
        }

        if (!syscall.all && (syscall.fromReg || syscall.toReg || syscall.fromLabel || syscall.toLabel)) {
          let fromS = this.findShapeByReg(editor, syscall.fromReg, syscall.fromLabel);
          let toS = this.findShapeByReg(editor, syscall.toReg, syscall.toLabel);

          if (!fromS && syscall.fromLabel) {
            const arch = this.inferArchetypeForLabel(syscall.fromLabel);
            const sx = toS
              ? (editor.getShapePageBounds(toS.id)?.midX ?? cx) - (isPortrait ? 0 : activeEdition.tokens.gapX)
              : cx - (isPortrait ? 0 : activeEdition.tokens.gapX * 0.55);
            const sy = toS
              ? (editor.getShapePageBounds(toS.id)?.midY ?? cy) - (isPortrait ? activeEdition.tokens.gapY : 0)
              : cy - (isPortrait ? activeEdition.tokens.gapY * 0.55 : 0);
            const newId = this.spawnNode(editor, {
              x: sx,
              y: sy,
              w: arch.w,
              h: arch.h,
              shapeType: arch.shapeType,
              geo: arch.geo,
              label: syscall.fromLabel,
              role: arch.role,
              colorOverride: null,
              slots,
              edition: activeEdition,
              speculative: false,
              utteranceId: res.utteranceId,
            });
            newlyCreatedIds.push(newId);
            fromS = editor.getShape(newId) ?? null;
          }

          if (!toS && syscall.toLabel) {
            const arch = this.inferArchetypeForLabel(syscall.toLabel);
            const fromB = fromS ? editor.getShapePageBounds(fromS.id) : null;
            const dx = fromB
              ? fromB.midX + (isPortrait ? 0 : Math.max(fromB.w / 2 + arch.w / 2 + 72, activeEdition.tokens.gapX))
              : cx + (isPortrait ? 0 : activeEdition.tokens.gapX * 0.55);
            const dy = fromB
              ? fromB.midY + (isPortrait ? Math.max(fromB.h / 2 + arch.h / 2 + 64, activeEdition.tokens.gapY) : 0)
              : cy + (isPortrait ? activeEdition.tokens.gapY * 0.55 : 0);
            const newId = this.spawnNode(editor, {
              x: dx,
              y: dy,
              w: arch.w,
              h: arch.h,
              shapeType: arch.shapeType,
              geo: arch.geo,
              label: syscall.toLabel,
              role: arch.role === 'primary' ? 'accent' : arch.role,
              colorOverride: null,
              slots,
              edition: activeEdition,
              speculative: false,
              utteranceId: res.utteranceId,
            });
            newlyCreatedIds.push(newId);
            toS = editor.getShape(newId) ?? null;
          }

          if (fromS && toS && fromS.id !== toS.id) {
            this.createBoundArrow(
              editor,
              fromS.id,
              toS.id,
              activeEdition,
              false,
              res.utteranceId,
              syscall.edgeLabel,
            );
            this.lastCreatedIds = [fromS.id, toS.id];
            const srcTag = syscall.fromLabel ?? this.getPlainShapeLabel(fromS) ?? syscall.fromReg ?? 'node';
            const dstTag = syscall.toLabel ?? this.getPlainShapeLabel(toS) ?? syscall.toReg ?? 'node';
            return {
              summary: syscall.edgeLabel
                ? `Linked ${srcTag} → ${dstTag} (${syscall.edgeLabel})`
                : `Connected ${srcTag} → ${dstTag}`,
            };
          }
        }

        const allNodes = editor
          .getCurrentPageShapes()
          .filter((s) => !s.meta?.speculative && s.type !== 'arrow' && s.type !== 'frame');
        if (allNodes.length < 2) return null;

        const targets =
          this.lastCreatedIds.length >= 2
            ? this.lastCreatedIds
            : allNodes
                .slice()
                .sort((a, b) => a.y - b.y || a.x - b.x)
                .map((s) => s.id);
        for (let i = 0; i < targets.length - 1; i++) {
          this.createBoundArrow(
            editor,
            targets[i],
            targets[i + 1],
            activeEdition,
            false,
            res.utteranceId,
            syscall.edgeLabel,
          );
        }
        return { summary: `Connected ${targets.length} elements` };
      }

      case 'STYLE_COLOR': {
        const color = syscall.color ?? res.color ?? activeEdition.tokens.accentColor;
        const targets = this.resolveShapesFromRegs(editor, syscall.targets);
        if (targets.length === 0) return null;
        editor.updateShapes(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          targets.map((s) => ({ id: s.id, type: s.type, props: { color } })) as any,
        );
        return { summary: `Tinted ${color}` };
      }

      case 'STYLE_SURFACE': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets);
        if (targets.length === 0) return null;
        editor.updateShapes(
          targets.map((s) => {
            const props: Record<string, unknown> = {};
            if (slots.dashOverride && (s.type === 'geo' || s.type === 'arrow')) props.dash = slots.dashOverride;
            if (slots.fillOverride && s.type === 'geo') props.fill = slots.fillOverride;
            if (slots.fontOverride && (s.type === 'geo' || s.type === 'note' || s.type === 'text')) {
              props.font = slots.fontOverride;
            }
            const sz = syscall.sizeOverride ?? slots.sizeOverride;
            if (sz && (s.type === 'geo' || s.type === 'note' || s.type === 'text')) {
              props.size = sz;
            }
            return { id: s.id, type: s.type, props };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
        );
        return { summary: 'Updated surface treatment' };
      }

      case 'STYLE_ARROWS': {
        const arrows = editor
          .getCurrentPageShapes()
          .filter((s) => !s.meta?.speculative && s.type === 'arrow');
        if (arrows.length === 0) return null;

        editor.updateShapes(
          arrows.map((s) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = s.props as any;
            const props: Record<string, unknown> = {};
            if (syscall.kind === 'arc') {
              props.kind = 'arc';
              props.bend = activeEdition.tokens.arrowBend || 28;
            } else if (syscall.kind === 'elbow') {
              props.kind = 'elbow';
              props.bend = 0;
            }
            if (syscall.dash) {
              props.dash = syscall.dash;
            }
            if (syscall.reverse) {
              const prevStart = p?.arrowheadStart ?? 'none';
              const prevEnd = p?.arrowheadEnd ?? activeEdition.tokens.arrowheadEnd;
              props.arrowheadStart = prevEnd === 'none' ? activeEdition.tokens.arrowheadEnd : prevEnd;
              props.arrowheadEnd = prevStart === prevEnd ? 'none' : prevStart;
            }
            return { id: s.id, type: 'arrow' as const, props };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
        );
        return {
          summary: syscall.reverse
            ? 'Reversed connectors'
            : `Styled connectors (${syscall.kind ?? syscall.dash ?? 'updated'})`,
        };
      }

      case 'SCALE': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets);
        if (targets.length === 0) return null;
        const factor = syscall.factor;
        editor.updateShapes(
          targets.map((s) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const p = s.props as any;
            if (typeof p?.w === 'number' && typeof p?.h === 'number') {
              const nw = Math.max(60, p.w * factor);
              const nh = Math.max(44, p.h * factor);
              return {
                id: s.id,
                type: s.type,
                x: s.x - (nw - p.w) / 2,
                y: s.y - (nh - p.h) / 2,
                props: { w: nw, h: nh },
              };
            }
            const curScale = typeof p?.scale === 'number' ? p.scale : 1;
            return { id: s.id, type: s.type, props: { scale: curScale * factor } };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
        );
        return {
          summary: factor > 1 ? 'Enlarged proportion' : 'Reduced proportion',
        };
      }

      case 'ROTATE': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets).filter(
          (s) => !s.meta?.locked,
        );
        if (targets.length === 0) return null;
        const rad = (syscall.degrees * Math.PI) / 180;
        editor.updateShapes(
          targets.map((s) => ({
            id: s.id,
            type: s.type,
            rotation: syscall.absolute ? rad : (s.rotation || 0) + rad,
          })),
        );
        return {
          summary: syscall.absolute && syscall.degrees === 0 ? 'Straightened angle' : `Rotated ${syscall.degrees}°`,
        };
      }

      case 'ALIGN': {
        let targets = this.resolveShapesFromRegs(editor, syscall.targets).filter(
          (s) => !s.meta?.locked && s.type !== 'frame',
        );
        if (targets.length < 2) {
          targets = editor
            .getCurrentPageShapes()
            .filter((s) => !s.meta?.speculative && s.type !== 'arrow' && s.type !== 'frame' && !s.meta?.locked);
        }
        if (targets.length < 2) return null;

        const withBounds = targets
          .map((s) => ({ s, b: editor.getShapePageBounds(s.id) }))
          .filter((item): item is { s: TLShape; b: NonNullable<ReturnType<Editor['getShapePageBounds']>> } =>
            Boolean(item.b),
          );
        if (withBounds.length < 2) return null;

        const minX = Math.min(...withBounds.map((i) => i.b.minX));
        const maxX = Math.max(...withBounds.map((i) => i.b.maxX));
        const minY = Math.min(...withBounds.map((i) => i.b.minY));
        const maxY = Math.max(...withBounds.map((i) => i.b.maxY));
        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;

        if (syscall.mode === 'distribute-horizontal') {
          const sorted = withBounds.slice().sort((a, b) => a.b.midX - b.b.midX);
          const span = sorted[sorted.length - 1].b.midX - sorted[0].b.midX;
          const step = sorted.length > 1 ? Math.max(180, span / (sorted.length - 1)) : 0;
          const startX = sorted[0].b.midX;
          editor.updateShapes(
            sorted.map(({ s, b }, idx) => ({
              id: s.id,
              type: s.type,
              x: startX + idx * step - b.w / 2,
            })),
          );
        } else if (syscall.mode === 'distribute-vertical') {
          const sorted = withBounds.slice().sort((a, b) => a.b.midY - b.b.midY);
          const span = sorted[sorted.length - 1].b.midY - sorted[0].b.midY;
          const step = sorted.length > 1 ? Math.max(125, span / (sorted.length - 1)) : 0;
          const startY = sorted[0].b.midY;
          editor.updateShapes(
            sorted.map(({ s, b }, idx) => ({
              id: s.id,
              type: s.type,
              y: startY + idx * step - b.h / 2,
            })),
          );
        } else {
          editor.updateShapes(
            withBounds.map(({ s, b }) => {
              let x = s.x;
              let y = s.y;
              if (syscall.mode === 'left') x = minX;
              else if (syscall.mode === 'right') x = maxX - b.w;
              else if (syscall.mode === 'center-horizontal') x = midX - b.w / 2;
              else if (syscall.mode === 'top') y = minY;
              else if (syscall.mode === 'bottom') y = maxY - b.h;
              else if (syscall.mode === 'center-vertical') y = midY - b.h / 2;
              return { id: s.id, type: s.type, x, y };
            }),
          );
        }
        return { summary: `Aligned (${syscall.mode.replace('-', ' ')})` };
      }

      case 'FRAME_GROUP': {
        let targets: TLShape[] = this.resolveShapesFromRegs(editor, syscall.targets).filter(
          (s) => s.type !== 'frame',
        );
        if (targets.length === 0) {
          targets = editor
            .getCurrentPageShapes()
            .filter((s) => !s.meta?.speculative && s.type !== 'arrow' && s.type !== 'frame');
        }
        const boundsList = targets
          .map((s) => editor.getShapePageBounds(s.id))
          .filter((b): b is NonNullable<typeof b> => Boolean(b));

        let fx: number;
        let fy: number;
        let fw: number;
        let fh: number;

        if (boundsList.length > 0) {
          const minX = Math.min(...boundsList.map((b) => b.minX)) - 48;
          const maxX = Math.max(...boundsList.map((b) => b.maxX)) + 48;
          const minY = Math.min(...boundsList.map((b) => b.minY)) - 60;
          const maxY = Math.max(...boundsList.map((b) => b.maxY)) + 48;
          fw = Math.max(280, maxX - minX);
          fh = Math.max(200, maxY - minY);
          fx = minX + fw / 2;
          fy = minY + fh / 2;
        } else {
          const pt = this.getViewportAnchorPoint(editor, null, true, 460, 300);
          fx = pt.cx;
          fy = pt.cy;
          fw = 460;
          fh = 300;
        }

        const label = syscall.label || slots.frameGroupLabel || activeEdition.title;
        const frameId = this.spawnNode(editor, {
          x: fx,
          y: fy,
          w: fw,
          h: fh,
          shapeType: 'frame',
          label,
          role: 'muted',
          colorOverride: null,
          slots,
          edition: activeEdition,
          speculative: false,
          utteranceId: res.utteranceId,
        });
        editor.sendToBack([frameId]);
        newlyCreatedIds.push(frameId);
        return { summary: `Framed "${label}"` };
      }

      case 'Z_ORDER': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets);
        if (targets.length === 0) return null;
        const ids = targets.map((s) => s.id);
        if (syscall.order === 'front') {
          editor.bringToFront(ids);
          return { summary: 'Brought to front' };
        }
        editor.sendToBack(ids);
        return { summary: 'Sent to back' };
      }

      case 'ARRANGE': {
        const all = editor
          .getCurrentPageShapes()
          .filter((s) => !s.meta?.speculative && s.type !== 'arrow' && s.type !== 'frame' && !s.meta?.locked);
        if (all.length < 2) return null;
        const { cx, cy, isPortrait } = this.getViewportAnchorPoint(editor, null, false);
        const mode = syscall.mode ?? (isPortrait ? 'column' : 'row');
        const gapX = activeEdition.tokens.gapX;
        const gapY = activeEdition.tokens.gapY;

        editor.updateShapes(
          all.map((s, i) => {
            const b = editor.getShapePageBounds(s.id);
            const w = b ? b.w : 180;
            const h = b ? b.h : 100;
            let x = cx;
            let y = cy;
            if (mode === 'row') {
              x = cx + (i - (all.length - 1) / 2) * gapX;
            } else if (mode === 'column') {
              y = cy + (i - (all.length - 1) / 2) * gapY;
            } else if (mode === 'circle') {
              const radius = Math.max(155, all.length * 38);
              const angle = (i / all.length) * Math.PI * 2 - Math.PI / 2;
              x = cx + Math.cos(angle) * radius;
              y = cy + Math.sin(angle) * radius * 0.85;
            } else if (mode === 'scatter') {
              const golden = i * 2.3999632;
              const r = i === 0 ? 0 : 125 * Math.sqrt(i);
              x = cx + Math.cos(golden) * r;
              y = cy + Math.sin(golden) * r * 0.82;
            } else {
              const cols = Math.ceil(Math.sqrt(all.length));
              const rows = Math.ceil(all.length / cols);
              x = cx + ((i % cols) - (cols - 1) / 2) * gapX;
              y = cy + (Math.floor(i / cols) - (rows - 1) / 2) * gapY;
            }
            return { id: s.id, type: s.type, x: x - w / 2, y: y - h / 2 };
          }),
        );
        this.gentlyFrameShapes(editor, all.map((s) => s.id));
        return { summary: `Arranged in ${mode}` };
      }

      case 'DUPLICATE': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets);
        if (targets.length === 0) return null;
        const copies = Math.min(12, Math.max(1, syscall.count ?? 1));
        const ids = targets.map((s) => s.id);
        for (let c = 1; c <= copies; c++) {
          editor.duplicateShapes(ids, { x: 44 * c, y: 44 * c });
        }
        return { summary: copies > 1 ? `Duplicated ×${copies}` : 'Duplicated study' };
      }

      case 'LABEL': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets);
        const label = syscall.text ?? slots.singleLabel;
        if (targets.length === 0 || !label) return null;
        const target = targets[0];
        if (target.type === 'frame') {
          editor.updateShape({ id: target.id, type: 'frame', props: { name: label } });
        } else if (target.type === 'geo' || target.type === 'note' || target.type === 'text') {
          editor.updateShape({
            id: target.id,
            type: target.type,
            props: { richText: toRichText(label) },
          });
        }
        return { summary: `Inscribed "${label}"` };
      }

      case 'LOCK': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets);
        if (targets.length === 0) return null;
        editor.updateShapes(
          targets.map((s) => ({
            id: s.id,
            type: s.type,
            meta: { ...s.meta, locked: syscall.locked },
          })),
        );
        return {
          summary: syscall.locked ? 'Pinned in place' : 'Unpinned shape',
        };
      }

      case 'SELECT': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets);
        if (targets.length > 0) {
          editor.setSelectedShapes(targets.map((s) => s.id));
          return { summary: `Selected ${targets.length}` };
        }
        return null;
      }

      case 'DELETE': {
        // SECOND HARDWARE LOCK AT DIRECTOR LEVEL: never delete without explicit spoken consent!
        if (!hasExplicitDeleteConsent(res.rawText, res.words)) {
          return null;
        }
        const targets = this.resolveShapesFromRegs(editor, syscall.targets).filter(
          (s) => !s.meta?.locked,
        );
        if (targets.length === 0) {
          return { summary: 'Protected (locked)' };
        }
        const ids = targets.map((s) => s.id);
        this.animations.stopAnimation(ids);
        editor.deleteShapes(ids);
        this.lastCreatedIds = this.lastCreatedIds.filter((id) => !ids.includes(id));
        return {
          summary: `Removed ${ids.length} element${ids.length > 1 ? 's' : ''}`,
        };
      }

      case 'CLEAR': {
        if (!hasExplicitClearConsent(res.rawText, res.words)) {
          return null;
        }
        const unlockForce = /\b(locked|force)\b/i.test(res.rawText);
        const removable = editor
          .getCurrentPageShapes()
          .filter((s) => unlockForce || !s.meta?.locked)
          .map((s) => s.id);
        if (removable.length === 0) return { summary: 'Canvas clear' };
        this.animations.stopAnimation(removable);
        editor.deleteShapes(removable);
        this.lastCreatedIds = [];
        return { summary: 'Cleared canvas' };
      }

      case 'UNDO': {
        if (!hasExplicitUndoConsent(res.rawText, res.words)) {
          return null;
        }
        editor.undo();
        this.animations.pruneDeletedShapes();
        return { summary: 'Undid step' };
      }

      case 'REDO': {
        editor.redo();
        return { summary: 'Redid step' };
      }

      case 'CAMERA': {
        if (syscall.action === 'zoom_in') {
          editor.zoomIn(editor.getViewportScreenCenter(), { animation: { duration: 220 } });
          return { summary: 'Zoomed in' };
        }
        if (syscall.action === 'zoom_out') {
          editor.zoomOut(editor.getViewportScreenCenter(), { animation: { duration: 220 } });
          return { summary: 'Zoomed out' };
        }
        editor.zoomToFit({ animation: { duration: 300 } });
        return { summary: 'Framed composition' };
      }

      default:
        return null;
    }
  }

  /**
   * Non-intrusive smart camera framing: never hijacks viewport during rapid-fire edits unless
   * newly created geometry actually extends beyond the visible viewport!
   */
  private frameIfOutsideViewport(editor: Editor, ids: TLShapeId[]): void {
    if (ids.length === 0) return;
    editor.selectNone();
    const vp = editor.getViewportPageBounds();
    const margin = 24;
    let outside = false;
    for (const id of ids) {
      const b = editor.getShapePageBounds(id);
      if (!b) continue;
      if (
        b.minX < vp.minX + margin ||
        b.maxX > vp.maxX - margin ||
        b.minY < vp.minY + margin ||
        b.maxY > vp.maxY - margin
      ) {
        outside = true;
        break;
      }
    }
    if (outside) {
      editor.zoomToFit({ animation: { duration: 180 } });
    }
  }

  private gentlyFrameShapes(editor: Editor, ids: TLShapeId[]): void {
    if (ids.length === 0) return;
    editor.selectNone();
    const shapes = editor.getCurrentPageShapes().filter((s) => !s.meta?.speculative);
    if (shapes.length >= 2) {
      editor.zoomToFit({ animation: { duration: 300 } });
    }
  }
}
