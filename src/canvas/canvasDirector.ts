import {
  createBindingId,
  createShapeId,
  toRichText,
  type Editor,
  type TLDefaultColorStyle,
  type TLGeoShapeGeoStyle,
  type TLShape,
  type TLShapeId,
} from 'tldraw';
import {
  AESTHETIC_EDITIONS,
  LAYOUT_BLUEPRINTS,
  SHAPE_ARCHETYPES,
  type AestheticEdition,
  type BlueprintKind,
  type ShapeArchetype,
} from '../design/catalog';
import type {
  CanvasRegisterSnapshot,
  CanvasShapeSummary,
  SemanticResolution,
  SpatialAnchor,
  StateComputerDecision,
} from '../types/protocol';
import { CanvasAnimationEngine } from './animationEngine';
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
    const label =
      typeof props?.name === 'string' && props.name
        ? props.name
        : extractRichTextPlain(props?.richText);
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

export interface DirectorResult {
  summary: string;
  opcode?: string;
  changedAesthetic?: AestheticEdition;
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

    return {
      shapes,
      focusRegs,
      editionId,
      activeAnimations: this.animations.activeCount,
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
  ): { cx: number; cy: number; isPortrait: boolean; vw: number; vh: number } {
    const bounds = editor.getViewportPageBounds();
    const screen = editor.getViewportScreenBounds();
    const isPortrait = screen.h > screen.w * 1.05;
    let cx = bounds.midX;
    let cy = bounds.midY;
    const padX = bounds.w * 0.23;
    const padY = bounds.h * 0.23;

    if (anchor) {
      if (anchor.includes('left')) cx = bounds.minX + padX;
      if (anchor.includes('right')) cx = bounds.maxX - padX;
      if (anchor.includes('top')) cy = bounds.minY + padY;
      if (anchor.includes('bottom')) cy = bounds.maxY - padY;
      return { cx, cy, isPortrait, vw: bounds.w, vh: bounds.h };
    }

    // Smart non-overlapping gallery slot finder so newly created shapes don't pile blindly onto existing ones!
    if (avoidOverlap) {
      const existing = editor
        .getCurrentPageShapes()
        .filter((s) => !s.meta?.speculative && s.type !== 'arrow')
        .map((s) => editor.getShapePageBounds(s.id))
        .filter((b): b is NonNullable<typeof b> => Boolean(b));

      if (existing.length > 0) {
        const stepX = isPortrait ? 195 : 235;
        const stepY = isPortrait ? 150 : 160;
        const candidateOffsets: [number, number][] = [
          [0, 0],
          [stepX, 0],
          [-stepX, 0],
          [0, stepY],
          [0, -stepY],
          [stepX, stepY],
          [-stepX, stepY],
          [stepX, -stepY],
          [-stepX, -stepY],
          [0, stepY * 1.9],
        ];

        for (const [ox, oy] of candidateOffsets) {
          const tx = cx + ox;
          const ty = cy + oy;
          const collides = existing.some(
            (b) => Math.abs(b.midX - tx) < b.w * 0.5 + 75 && Math.abs(b.midY - ty) < b.h * 0.5 + 55,
          );
          if (!collides) {
            cx = tx;
            cy = ty;
            break;
          }
        }
      }
    }

    return { cx, cy, isPortrait, vw: bounds.w, vh: bounds.h };
  }

  private createBoundArrow(
    editor: Editor,
    fromId: TLShapeId,
    toId: TLShapeId,
    edition: AestheticEdition,
    speculative: boolean,
    utteranceId: number,
  ): void {
    const fromBounds = editor.getShapePageBounds(fromId);
    const toBounds = editor.getShapePageBounds(toId);
    if (!fromBounds || !toBounds) return;

    const arrowId = createShapeId();
    editor.createShape({
      id: arrowId,
      type: 'arrow',
      x: fromBounds.midX,
      y: fromBounds.midY,
      opacity: speculative ? 0.28 : 1,
      meta: { speculative, utteranceId, role: 'muted' },
      props: {
        kind: edition.tokens.arrowKind,
        color: edition.tokens.connectorColor,
        dash: speculative ? 'dashed' : edition.tokens.dash === 'dashed' ? 'solid' : edition.tokens.dash,
        size: edition.tokens.size,
        arrowheadStart: 'none',
        arrowheadEnd: edition.tokens.arrowheadEnd,
        bend: edition.tokens.arrowKind === 'arc' ? edition.tokens.arrowBend : 0,
        start: { x: 0, y: 0 },
        end: { x: toBounds.midX - fromBounds.midX, y: toBounds.midY - fromBounds.midY },
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
      role: ColorRole;
      colorOverride: TLDefaultColorStyle | null;
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
      slots.fillOverride ?? (role === 'accent' ? edition.tokens.accentFill : edition.tokens.fill);
    const font = slots.fontOverride ?? edition.tokens.font;
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
          size: edition.tokens.size,
          richText: toRichText(opts.label),
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
          font: slots.fontOverride ?? edition.tokens.headingFont,
          size: 'xl',
          textAlign: 'middle',
          autoSize: true,
          richText: toRichText(opts.label || 'Untitled Study'),
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
          size: edition.tokens.size,
          align: 'middle',
          verticalAlign: 'middle',
          richText: toRichText(opts.label),
        },
      });
    }
    return id;
  }

  private renderCreateShapes(
    editor: Editor,
    res: SemanticResolution,
    slots: ParsedSlots,
    edition: AestheticEdition,
    speculative: boolean,
  ): TLShapeId[] {
    const archetype =
      SHAPE_ARCHETYPES.find((a) => a.id === res.archetypeId) ?? SHAPE_ARCHETYPES[0];
    const count = Math.min(9, Math.max(1, slots.listLabels.length || slots.count || 1));
    const { cx, cy, isPortrait } = this.getViewportAnchorPoint(
      editor,
      slots.anchor,
      count === 1 && !slots.anchor,
    );

    const mode =
      slots.arrangement ??
      (count >= 4 ? 'grid' : isPortrait && count >= 3 ? 'column' : 'row');

    const gapX = Math.max(archetype.w + 44, edition.tokens.gapX);
    const gapY = Math.max(archetype.h + 40, edition.tokens.gapY);

    const roles: ColorRole[] = ['primary', 'secondary', 'accent', 'muted'];
    const created: TLShapeId[] = [];

    for (let i = 0; i < count; i++) {
      let x = cx;
      let y = cy;
      if (mode === 'row') {
        x = cx + (i - (count - 1) / 2) * gapX;
      } else if (mode === 'column') {
        y = cy + (i - (count - 1) / 2) * gapY;
      } else {
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        const col = i % cols;
        const row = Math.floor(i / cols);
        x = cx + (col - (cols - 1) / 2) * gapX;
        y = cy + (row - (rows - 1) / 2) * gapY;
      }

      const label =
        slots.listLabels[i] ??
        (count === 1
          ? (slots.singleLabel ?? '')
          : slots.singleLabel
            ? `${slots.singleLabel} ${i + 1}`
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
          colorOverride: res.color,
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        }),
      );
    }

    if (slots.connectCreated && created.length >= 2) {
      for (let i = 0; i < created.length - 1; i++) {
        this.createBoundArrow(editor, created[i], created[i + 1], edition, speculative, res.utteranceId);
      }
    }
    return created;
  }

  private renderBlueprint(
    editor: Editor,
    bpKind: BlueprintKind,
    res: SemanticResolution,
    slots: ParsedSlots,
    edition: AestheticEdition,
    speculative: boolean,
  ): TLShapeId[] {
    if (bpKind === 'row' || bpKind === 'column') {
      return this.renderCreateShapes(
        editor,
        res,
        { ...slots, arrangement: bpKind, count: slots.count ?? 3 },
        edition,
        speculative,
      );
    }

    const bp = LAYOUT_BLUEPRINTS.find((b) => b.id === bpKind) ?? LAYOUT_BLUEPRINTS[0];
    const { cx, cy, isPortrait } = this.getViewportAnchorPoint(editor, slots.anchor, !slots.anchor);
    const created: TLShapeId[] = [];
    const nodes = bp.defaultNodes.map((n, idx) => ({
      ...n,
      label:
        slots.listLabels[idx] ?? (idx === 0 && slots.singleLabel ? slots.singleLabel : n.label),
    }));

    if (bpKind === 'mindmap') {
      const centerNode = nodes[0];
      const hubId = this.spawnNode(editor, {
        x: cx,
        y: cy,
        w: 175,
        h: 115,
        shapeType: 'geo',
        geo: 'ellipse',
        label: centerNode.label,
        role: 'accent',
        colorOverride: res.color,
        slots,
        edition,
        speculative,
        utteranceId: res.utteranceId,
      });
      created.push(hubId);

      const branches = nodes.slice(1);
      const rx = isPortrait ? 145 : 240;
      const ry = isPortrait ? 195 : 165;
      branches.forEach((b, idx) => {
        const angle = (idx / branches.length) * Math.PI * 2 - Math.PI / 2;
        const bx = cx + Math.cos(angle) * rx;
        const by = cy + Math.sin(angle) * ry;
        const bid = this.spawnNode(editor, {
          x: bx,
          y: by,
          w: 155,
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
      return created;
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
            colorOverride: res.color,
            slots,
            edition,
            speculative,
            utteranceId: res.utteranceId,
          }),
        );
      });
      return created;
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
          colorOverride: res.color,
          slots,
          edition,
          speculative,
          utteranceId: res.utteranceId,
        });
        created.push(cardId);
      });
      return created;
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
        colorOverride: res.color,
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
    return created;
  }

  private resolveShapesFromRegs(editor: Editor, regs: string[]): TLShape[] {
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

    const selected = editor.getSelectedShapes().filter((s) => !s.meta?.speculative);
    if (selected.length > 0) return selected;

    const recent = this.lastCreatedIds
      .map((id) => editor.getShape(id))
      .filter((s): s is TLShape => Boolean(s));
    if (recent.length > 0) return recent;
    return [all[all.length - 1]];
  }

  private findShapeByReg(editor: Editor, reg?: string | null): TLShape | null {
    if (!reg) return null;
    const target = reg.toLowerCase();
    return (
      editor
        .getCurrentPageShapes()
        .find(
          (s) =>
            !s.meta?.speculative &&
            typeof s.meta?.reg === 'string' &&
            s.meta.reg.toLowerCase() === target,
        ) ?? null
    );
  }

  /**
   * 1. SPECULATIVE GHOST PREVIEW (256d MRL + Earlybird -90ms predictions)
   * Strictly non-destructive: NEVER deletes or mutates permanent shapes!
   */
  public executeSpeculative(
    editor: Editor,
    res: SemanticResolution,
    currentEdition: AestheticEdition,
  ): DirectorResult | null {
    const slots = parseVoiceSlots(res.rawText, res.ghostText);
    if (slots.wordCount < 2) return null;

    // Never preview if any destructive, movement, or animation keyword is present
    if (
      slots.animationKind !== null ||
      slots.spatialRelation !== null ||
      /\b(move|shift|nudge|slide|put|place|swap|delete|remove|erase|clear|undo|redo|connect|color|paint|spin|orbit|float|bounce|pulse|stop|freeze)\b/i.test(
        slots.cleanText,
      )
    ) {
      return null;
    }

    const effectiveIntent = slots.lexicalIntent ?? res.intentKind;
    const canPreview =
      (effectiveIntent === 'create_shape' && res.intentScore >= 0.56) ||
      (effectiveIntent === 'compose_layout' && (res.intentScore >= 0.56 || res.blueprintScore >= 0.62));

    if (!canPreview) return null;

    editor.store.mergeRemoteChanges(() => {
      const oldSpec = editor
        .getCurrentPageShapes()
        .filter((s) => Boolean(s.meta?.speculative))
        .map((s) => s.id);
      if (oldSpec.length > 0) editor.deleteShapes(oldSpec);

      if (effectiveIntent === 'compose_layout' || res.blueprintScore >= 0.7) {
        this.renderBlueprint(editor, res.blueprintId, res, slots, currentEdition, true);
      } else {
        this.renderCreateShapes(editor, res, slots, currentEdition, true);
      }
    });

    return { summary: 'Speculative preview' };
  }

  /**
   * 2. COMMIT EXECUTION (Driven by Model 3: Qwen Canvas State Computer)
   */
  public executeStateDecision(
    editor: Editor,
    decision: StateComputerDecision,
    currentEdition: AestheticEdition,
    onEditionChange: (ed: AestheticEdition) => void,
  ): DirectorResult | null {
    const { syscall, resolution: res, rawOpcodeLine } = decision;
    const slots = parseVoiceSlots(res.rawText, res.ghostText);

    // If commit returned NOOP while speculative shapes exist for THIS utterance, crystallize them so they NEVER disappear!
    if (syscall.op === 'NOOP') {
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

    // Clear speculative ghost previews before applying committed permanent instruction
    this.clearSpeculativeShapes(editor);

    // Check embedded aesthetic shift alongside creation/styling commands
    let activeEdition = currentEdition;
    let changedAesthetic: AestheticEdition | undefined;
    if (syscall.op === 'AESTHETIC' || res.aestheticScore >= 0.75) {
      const targetId = syscall.op === 'AESTHETIC' ? (syscall.aestheticId ?? res.aestheticId) : res.aestheticId;
      const foundEd = AESTHETIC_EDITIONS.find((e) => e.id === targetId);
      if (foundEd && (syscall.op === 'AESTHETIC' || foundEd.id !== currentEdition.id)) {
        activeEdition = foundEd;
        changedAesthetic = foundEd;
        onEditionChange(foundEd);
        this.applyAestheticToCanvas(editor, foundEd);
        if (syscall.op === 'AESTHETIC') {
          return {
            summary: `${foundEd.catalogueNumber} · ${foundEd.title}`,
            opcode: rawOpcodeLine,
            changedAesthetic: foundEd,
          };
        }
      }
    }

    switch (syscall.op) {
      case 'LAYOUT': {
        const kind = syscall.kind ?? res.blueprintId;
        editor.markHistoryStoppingPoint('voice-compose');
        const ids = this.renderBlueprint(editor, kind, res, slots, activeEdition, false);
        this.lastCreatedIds = ids;
        this.gentlyFrameShapes(editor, ids);
        return { summary: `Composed ${kind}`, opcode: rawOpcodeLine, changedAesthetic };
      }

      case 'SPAWN': {
        editor.markHistoryStoppingPoint('voice-create');
        const mergedSlots: ParsedSlots = {
          ...slots,
          count: syscall.count ?? slots.count,
          anchor: syscall.anchor ?? slots.anchor,
        };
        const ids = this.renderCreateShapes(editor, res, mergedSlots, activeEdition, false);
        this.lastCreatedIds = ids;
        if (ids.length >= 3) this.gentlyFrameShapes(editor, ids);
        return {
          summary: `Placed ${ids.length} element${ids.length > 1 ? 's' : ''}`,
          opcode: rawOpcodeLine,
          changedAesthetic,
        };
      }

      case 'MOVE': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets).filter(
          (s) => !s.meta?.locked,
        );
        if (targets.length === 0) return { summary: 'Shape is locked', opcode: rawOpcodeLine };
        editor.markHistoryStoppingPoint('voice-move');

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
          return { summary: `Moved to ${anchor}`, opcode: rawOpcodeLine };
        }

        const step =
          syscall.distance === 'small' ? 52 : syscall.distance === 'far' ? 285 : 145;
        const dx = syscall.dir === 'left' ? -step : syscall.dir === 'right' ? step : 0;
        const dy = syscall.dir === 'up' ? -step : syscall.dir === 'down' ? step : 0;
        editor.nudgeShapes(
          targets.map((s) => s.id),
          { x: dx, y: dy },
        );
        return { summary: `Moved ${syscall.dir ?? 'right'}`, opcode: rawOpcodeLine };
      }

      case 'PLACE': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets).filter(
          (s) => !s.meta?.locked,
        );
        const refShape = this.findShapeByReg(editor, syscall.refReg);
        if (targets.length === 0 || !refShape) return null;

        const refBounds = editor.getShapePageBounds(refShape.id);
        if (!refBounds) return null;

        editor.markHistoryStoppingPoint('voice-place');
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
        return { summary: `Placed ${syscall.relation.replace('-', ' ')}`, opcode: rawOpcodeLine };
      }

      case 'SWAP': {
        const shapeA = this.findShapeByReg(editor, syscall.regA);
        const shapeB = this.findShapeByReg(editor, syscall.regB);
        if (!shapeA || !shapeB || shapeA.id === shapeB.id) return null;

        const bA = editor.getShapePageBounds(shapeA.id);
        const bB = editor.getShapePageBounds(shapeB.id);
        if (!bA || !bB) return null;

        editor.markHistoryStoppingPoint('voice-swap');
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
        return { summary: 'Swapped positions', opcode: rawOpcodeLine };
      }

      case 'ANIM': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets);
        if (targets.length === 0) return null;
        const anchorShape = this.findShapeByReg(editor, syscall.aroundReg);
        const applied = this.animations.setAnimation(
          targets.map((s) => s.id),
          {
            kind: syscall.kind,
            speed: syscall.speed ?? 1,
            intensity: syscall.intensity ?? 1,
            anchorShapeId: anchorShape?.id ?? null,
            direction: syscall.direction,
          },
        );
        if (applied === 0) return null;
        return {
          summary: anchorShape
            ? `Animating ${syscall.kind} around ${syscall.aroundReg}`
            : `Animating · ${syscall.kind}`,
          opcode: rawOpcodeLine,
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
          opcode: rawOpcodeLine,
        };
      }

      case 'STOP_ANIM': {
        const isAll = syscall.targets.includes('ALL');
        const ids = isAll
          ? ('all' as const)
          : this.resolveShapesFromRegs(editor, syscall.targets).map((s) => s.id);
        this.animations.stopAnimation(ids);
        return { summary: 'Motion stilled', opcode: rawOpcodeLine };
      }

      case 'CONNECT': {
        const allNodes = editor
          .getCurrentPageShapes()
          .filter((s) => !s.meta?.speculative && s.type !== 'arrow');
        if (allNodes.length < 2) return null;

        editor.markHistoryStoppingPoint('voice-connect');
        if (!syscall.all && syscall.fromReg && syscall.toReg) {
          const fromS = this.findShapeByReg(editor, syscall.fromReg);
          const toS = this.findShapeByReg(editor, syscall.toReg);
          if (fromS && toS && fromS.id !== toS.id) {
            this.createBoundArrow(editor, fromS.id, toS.id, activeEdition, false, res.utteranceId);
            return { summary: `Connected ${syscall.fromReg} → ${syscall.toReg}`, opcode: rawOpcodeLine };
          }
        }

        const targets =
          this.lastCreatedIds.length >= 2
            ? this.lastCreatedIds
            : allNodes
                .slice()
                .sort((a, b) => a.y - b.y || a.x - b.x)
                .map((s) => s.id);
        for (let i = 0; i < targets.length - 1; i++) {
          this.createBoundArrow(editor, targets[i], targets[i + 1], activeEdition, false, res.utteranceId);
        }
        return { summary: `Connected ${targets.length} elements`, opcode: rawOpcodeLine };
      }

      case 'STYLE_COLOR': {
        const color = syscall.color ?? res.color ?? activeEdition.tokens.accentColor;
        const targets = this.resolveShapesFromRegs(editor, syscall.targets);
        if (targets.length === 0) return null;
        editor.markHistoryStoppingPoint('voice-color');
        editor.updateShapes(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          targets.map((s) => ({ id: s.id, type: s.type, props: { color } })) as any,
        );
        return { summary: `Tinted ${color}`, opcode: rawOpcodeLine };
      }

      case 'STYLE_SURFACE': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets);
        if (targets.length === 0) return null;
        editor.markHistoryStoppingPoint('voice-style');
        editor.updateShapes(
          targets.map((s) => {
            const props: Record<string, unknown> = {};
            if (slots.dashOverride && (s.type === 'geo' || s.type === 'arrow')) props.dash = slots.dashOverride;
            if (slots.fillOverride && s.type === 'geo') props.fill = slots.fillOverride;
            if (slots.fontOverride && (s.type === 'geo' || s.type === 'note' || s.type === 'text')) {
              props.font = slots.fontOverride;
            }
            return { id: s.id, type: s.type, props };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
        );
        return { summary: 'Updated surface treatment', opcode: rawOpcodeLine };
      }

      case 'SCALE': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets);
        if (targets.length === 0) return null;
        const factor = syscall.factor;
        editor.markHistoryStoppingPoint('voice-scale');
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
          opcode: rawOpcodeLine,
        };
      }

      case 'ARRANGE': {
        const all = editor
          .getCurrentPageShapes()
          .filter((s) => !s.meta?.speculative && s.type !== 'arrow' && !s.meta?.locked);
        if (all.length < 2) return null;
        editor.markHistoryStoppingPoint('voice-arrange');
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
        return { summary: `Arranged in ${mode}`, opcode: rawOpcodeLine };
      }

      case 'DUPLICATE': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets);
        if (targets.length === 0) return null;
        editor.markHistoryStoppingPoint('voice-duplicate');
        editor.duplicateShapes(
          targets.map((s) => s.id),
          { x: 48, y: 48 },
        );
        return { summary: 'Duplicated study', opcode: rawOpcodeLine };
      }

      case 'LABEL': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets);
        const label = syscall.text ?? slots.singleLabel;
        if (targets.length === 0 || !label) return null;
        editor.markHistoryStoppingPoint('voice-label');
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
        return { summary: `Inscribed "${label}"`, opcode: rawOpcodeLine };
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
          opcode: rawOpcodeLine,
        };
      }

      case 'SELECT': {
        const targets = this.resolveShapesFromRegs(editor, syscall.targets);
        if (targets.length > 0) {
          editor.setSelectedShapes(targets.map((s) => s.id));
          return { summary: `Selected ${targets.length}`, opcode: rawOpcodeLine };
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
          return { summary: 'Protected (locked)', opcode: rawOpcodeLine };
        }
        const ids = targets.map((s) => s.id);
        this.animations.stopAnimation(ids);
        editor.markHistoryStoppingPoint('voice-delete');
        editor.deleteShapes(ids);
        this.lastCreatedIds = this.lastCreatedIds.filter((id) => !ids.includes(id));
        return {
          summary: `Removed ${ids.length} element${ids.length > 1 ? 's' : ''}`,
          opcode: rawOpcodeLine,
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
        if (removable.length === 0) return { summary: 'Canvas clear', opcode: rawOpcodeLine };
        this.animations.stopAnimation(removable);
        editor.markHistoryStoppingPoint('voice-clear');
        editor.deleteShapes(removable);
        this.lastCreatedIds = [];
        return { summary: 'Cleared canvas', opcode: rawOpcodeLine };
      }

      case 'UNDO': {
        if (!hasExplicitUndoConsent(res.rawText, res.words)) {
          return null;
        }
        editor.undo();
        this.animations.pruneDeletedShapes();
        return { summary: 'Undid step', opcode: rawOpcodeLine };
      }

      case 'REDO': {
        editor.redo();
        return { summary: 'Redid step', opcode: rawOpcodeLine };
      }

      case 'CAMERA': {
        if (syscall.action === 'zoom_in') {
          editor.zoomIn(editor.getViewportScreenCenter(), { animation: { duration: 280 } });
          return { summary: 'Zoomed in', opcode: rawOpcodeLine };
        }
        if (syscall.action === 'zoom_out') {
          editor.zoomOut(editor.getViewportScreenCenter(), { animation: { duration: 280 } });
          return { summary: 'Zoomed out', opcode: rawOpcodeLine };
        }
        editor.zoomToFit({ animation: { duration: 360 } });
        return { summary: 'Framed composition', opcode: rawOpcodeLine };
      }

      default:
        return null;
    }
  }

  private gentlyFrameShapes(editor: Editor, ids: TLShapeId[]): void {
    if (ids.length === 0) return;
    editor.selectNone();
    const shapes = editor.getCurrentPageShapes().filter((s) => !s.meta?.speculative);
    if (shapes.length >= 2) {
      editor.zoomToFit({ animation: { duration: 380 } });
    }
  }
}
