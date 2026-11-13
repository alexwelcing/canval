import type { Editor, TLShape, TLShapeId } from 'tldraw';

export type AnimationKind =
  | 'float'
  | 'orbit'
  | 'pulse'
  | 'spin'
  | 'bounce'
  | 'wiggle'
  | 'pendulum'
  | 'figure8'
  | 'drift'
  | 'stop';

export interface ShapeAnimationSpec {
  kind: Exclude<AnimationKind, 'stop'>;
  speed: number; // 1.0 = default tempo
  intensity: number; // 1.0 = default amplitude
  anchorShapeId?: TLShapeId | null;
  direction?: 'cw' | 'ccw' | 'horizontal' | 'vertical';
}

interface ActiveTrack extends ShapeAnimationSpec {
  shapeId: TLShapeId;
  centerX: number;
  centerY: number;
  baseW: number;
  baseH: number;
  phaseOffset: number;
  orbitRadius: number;
  lastOutX: number;
  lastOutY: number;
  lastOutRot: number;
}

function getShapeDimensions(editor: Editor, shape: TLShape): { w: number; h: number } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = shape.props as any;
  if (typeof p?.w === 'number' && typeof p?.h === 'number') {
    return { w: p.w, h: p.h };
  }
  const b = editor.getShapePageBounds(shape.id);
  if (b) {
    return { w: Math.max(40, b.w), h: Math.max(40, b.h) };
  }
  return { w: 180, h: 100 };
}

/**
 * Computes top-left (x, y) in tldraw page space so that a shape of size (w, h)
 * rotated by `theta` radians stays centered at `(cx, cy)`.
 */
function topLeftFromCenterAndRotation(
  cx: number,
  cy: number,
  w: number,
  h: number,
  theta: number,
): { x: number; y: number } {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const halfW = w * 0.5;
  const halfH = h * 0.5;
  return {
    x: cx - (halfW * cos - halfH * sin),
    y: cy - (halfW * sin + halfH * cos),
  };
}

function centerFromTopLeftAndRotation(
  x: number,
  y: number,
  w: number,
  h: number,
  theta: number,
): { cx: number; cy: number } {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const halfW = w * 0.5;
  const halfH = h * 0.5;
  return {
    cx: x + (halfW * cos - halfH * sin),
    cy: y + (halfW * sin + halfH * cos),
  };
}

export class CanvasAnimationEngine {
  private editor: Editor | null = null;
  private tracks = new Map<TLShapeId, ActiveTrack>();
  private rafId: number | null = null;
  private startEpochSec = performance.now() / 1000;
  private onCountChange?: (count: number) => void;

  public attach(editor: Editor, onCountChange?: (count: number) => void): void {
    this.editor = editor;
    this.onCountChange = onCountChange;
    this.restoreFromMeta();
    this.ensureLoop();
  }

  public detach(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.editor = null;
  }

  public get activeCount(): number {
    return this.tracks.size;
  }

  public getTrackSummary(shapeId: TLShapeId): ShapeAnimationSpec | null {
    const t = this.tracks.get(shapeId);
    if (!t) return null;
    return {
      kind: t.kind,
      speed: t.speed,
      intensity: t.intensity,
      anchorShapeId: t.anchorShapeId,
      direction: t.direction,
    };
  }

  private notifyCount(): void {
    this.onCountChange?.(this.tracks.size);
  }

  private restoreFromMeta(): void {
    const editor = this.editor;
    if (!editor) return;
    for (const s of editor.getCurrentPageShapes()) {
      if (s.meta?.speculative || s.type === 'arrow') continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anim = s.meta?.anim as any;
      if (anim && typeof anim.kind === 'string' && anim.kind !== 'stop') {
        this.setAnimation([s.id], {
          kind: anim.kind,
          speed: typeof anim.speed === 'number' ? anim.speed : 1,
          intensity: typeof anim.intensity === 'number' ? anim.intensity : 1,
          anchorShapeId: anim.anchorShapeId ?? null,
          direction: anim.direction,
        });
      }
    }
  }

  public setAnimation(shapeIds: TLShapeId[], spec: ShapeAnimationSpec): number {
    const editor = this.editor;
    if (!editor) return 0;

    const nowSec = performance.now() / 1000 - this.startEpochSec;
    let applied = 0;

    editor.store.mergeRemoteChanges(() => {
      shapeIds.forEach((id, idx) => {
        const shape = editor.getShape(id);
        if (!shape || shape.type === 'arrow' || shape.meta?.speculative) return;

        // Prevent a shape from orbiting itself
        const anchorId = spec.anchorShapeId && spec.anchorShapeId !== id ? spec.anchorShapeId : null;
        const existing = this.tracks.get(id);
        const dims = existing
          ? { w: existing.baseW, h: existing.baseH }
          : getShapeDimensions(editor, shape);

        const { cx, cy } = centerFromTopLeftAndRotation(
          shape.x,
          shape.y,
          dims.w,
          dims.h,
          shape.rotation || 0,
        );

        let orbitRadius = 175 * spec.intensity;
        let phaseOffset = idx * 0.85;

        if (spec.kind === 'orbit') {
          let pivotX = cx;
          let pivotY = cy;
          if (anchorId) {
            const anchorShape = editor.getShape(anchorId);
            const anchorBounds = anchorShape ? editor.getShapePageBounds(anchorId) : null;
            if (anchorBounds) {
              pivotX = anchorBounds.midX;
              pivotY = anchorBounds.midY;
              const dx = cx - pivotX;
              const dy = cy - pivotY;
              const dist = Math.hypot(dx, dy);
              orbitRadius = Math.max(130, dist > 45 ? dist : 200 * spec.intensity);
              phaseOffset = Math.atan2(dy, dx) - nowSec * 1.15 * spec.speed;
            }
          } else {
            // Orbit around current center with a pleasant radius
            orbitRadius = 110 * spec.intensity;
            phaseOffset = (idx * Math.PI * 2) / Math.max(1, shapeIds.length);
          }
        }

        const track: ActiveTrack = {
          shapeId: id,
          kind: spec.kind,
          speed: Math.max(0.2, Math.min(4.0, spec.speed)),
          intensity: Math.max(0.25, Math.min(3.0, spec.intensity)),
          anchorShapeId: anchorId,
          direction: spec.direction,
          centerX: cx,
          centerY: cy,
          baseW: dims.w,
          baseH: dims.h,
          phaseOffset,
          orbitRadius,
          lastOutX: shape.x,
          lastOutY: shape.y,
          lastOutRot: shape.rotation || 0,
        };

        this.tracks.set(id, track);
        editor.updateShape({
          id,
          type: shape.type,
          meta: {
            ...shape.meta,
            anim: {
              kind: track.kind,
              speed: track.speed,
              intensity: track.intensity,
              anchorShapeId: track.anchorShapeId ?? null,
              direction: track.direction ?? null,
            },
          },
        });
        applied++;
      });
    });

    this.notifyCount();
    this.ensureLoop();
    return applied;
  }

  public adjustTempo(shapeIds: TLShapeId[] | 'all', speedMultiplier: number, reverse = false): number {
    const targets =
      shapeIds === 'all' ? [...this.tracks.keys()] : shapeIds.filter((id) => this.tracks.has(id));
    let count = 0;
    for (const id of targets) {
      const tr = this.tracks.get(id);
      if (!tr) continue;
      tr.speed = Math.max(0.2, Math.min(4.5, tr.speed * speedMultiplier));
      if (reverse) {
        tr.direction = tr.direction === 'ccw' ? 'cw' : 'ccw';
      }
      count++;
    }
    return count;
  }

  public stopAnimation(shapeIds: TLShapeId[] | 'all'): number {
    const editor = this.editor;
    const ids = shapeIds === 'all' ? [...this.tracks.keys()] : shapeIds;
    let stopped = 0;

    if (editor && ids.length > 0) {
      editor.store.mergeRemoteChanges(() => {
        for (const id of ids) {
          const tr = this.tracks.get(id);
          this.tracks.delete(id);
          const shape = editor.getShape(id);
          if (!shape) continue;

          const curDims = getShapeDimensions(editor, shape);
          const { cx, cy } = centerFromTopLeftAndRotation(
            shape.x,
            shape.y,
            curDims.w,
            curDims.h,
            shape.rotation || 0,
          );
          const w = tr ? tr.baseW : curDims.w;
          const h = tr ? tr.baseH : curDims.h;
          const nextMeta = { ...shape.meta };
          delete nextMeta.anim;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const propsUpdate: Record<string, any> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rawProps = shape.props as any;
          if (typeof rawProps?.w === 'number' && typeof rawProps?.h === 'number') {
            propsUpdate.w = w;
            propsUpdate.h = h;
          }

          editor.updateShape({
            id,
            type: shape.type,
            x: cx - w * 0.5,
            y: cy - h * 0.5,
            rotation: 0,
            meta: nextMeta,
            ...(Object.keys(propsUpdate).length > 0 ? { props: propsUpdate } : {}),
          });
          stopped++;
        }
      });
    } else {
      for (const id of ids) {
        if (this.tracks.delete(id)) stopped++;
      }
    }

    this.notifyCount();
    return stopped;
  }

  public pruneDeletedShapes(): void {
    const editor = this.editor;
    if (!editor) return;
    let changed = false;
    for (const id of [...this.tracks.keys()]) {
      if (!editor.getShape(id)) {
        this.tracks.delete(id);
        changed = true;
      }
    }
    if (changed) this.notifyCount();
  }

  private ensureLoop(): void {
    if (this.rafId !== null) return;
    const step = (nowMs: number) => {
      if (!this.editor || this.tracks.size === 0) {
        this.rafId = null;
        return;
      }
      this.tick(nowMs / 1000 - this.startEpochSec);
      this.rafId = requestAnimationFrame(step);
    };
    this.rafId = requestAnimationFrame(step);
  }

  private tick(tSec: number): void {
    const editor = this.editor;
    if (!editor || this.tracks.size === 0) return;

    // Respect active pointer dragging: skip mutating currently dragged selected shapes mid-gesture
    const isDragging = editor.inputs.isDragging;
    const selectedSet = isDragging ? new Set(editor.getSelectedShapeIds()) : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any[] = [];
    let pruned = false;

    for (const [id, tr] of this.tracks.entries()) {
      const shape = editor.getShape(id);
      if (!shape || shape.meta?.speculative) {
        this.tracks.delete(id);
        pruned = true;
        continue;
      }

      if (selectedSet?.has(id)) {
        // Track user's finger drag in real time so releasing continues smoothly from new position
        const dims = getShapeDimensions(editor, shape);
        const c = centerFromTopLeftAndRotation(shape.x, shape.y, dims.w, dims.h, shape.rotation || 0);
        tr.centerX = c.cx;
        tr.centerY = c.cy;
        tr.lastOutX = shape.x;
        tr.lastOutY = shape.y;
        tr.lastOutRot = shape.rotation || 0;
        continue;
      }

      // If shape was moved externally (e.g. voice MOVE / ARRANGE / UNDO), rebase its home center seamlessly!
      const extDx = shape.x - tr.lastOutX;
      const extDy = shape.y - tr.lastOutY;
      if (Math.abs(extDx) > 1.5 || Math.abs(extDy) > 1.5) {
        tr.centerX += extDx;
        tr.centerY += extDy;
        if (tr.kind === 'orbit' && tr.anchorShapeId) {
          const ab = editor.getShapePageBounds(tr.anchorShapeId);
          if (ab) {
            tr.orbitRadius = Math.max(90, Math.hypot(tr.centerX - ab.midX, tr.centerY - ab.midY));
          }
        }
      }

      const dirSign = tr.direction === 'ccw' ? -1 : 1;
      const omega = tr.speed;
      const amp = tr.intensity;
      const phase = tr.phaseOffset;

      let cx = tr.centerX;
      let cy = tr.centerY;
      let w = tr.baseW;
      let h = tr.baseH;
      let rot = 0;

      switch (tr.kind) {
        case 'float': {
          const u = tSec * 2.1 * omega + phase;
          cx += Math.cos(u * 0.55) * 10 * amp;
          cy -= Math.sin(u) * 22 * amp;
          rot = Math.sin(u * 0.7) * 0.04 * amp;
          break;
        }

        case 'orbit': {
          let pivotX = tr.centerX;
          let pivotY = tr.centerY;
          if (tr.anchorShapeId) {
            const ab = editor.getShapePageBounds(tr.anchorShapeId);
            if (ab) {
              pivotX = ab.midX;
              pivotY = ab.midY;
            }
          }
          const angle = tSec * 1.15 * omega * dirSign + phase;
          cx = pivotX + Math.cos(angle) * tr.orbitRadius;
          cy = pivotY + Math.sin(angle) * (tr.orbitRadius * 0.82);
          break;
        }

        case 'pulse': {
          const s = 1 + Math.sin(tSec * 2.8 * omega + phase) * 0.13 * amp;
          w = Math.max(48, tr.baseW * s);
          h = Math.max(40, tr.baseH * s);
          break;
        }

        case 'spin': {
          rot = (tSec * 1.45 * omega * dirSign + phase) % (Math.PI * 2);
          break;
        }

        case 'bounce': {
          const u = tSec * 2.6 * omega + phase;
          const sAbs = Math.abs(Math.sin(u));
          cy = tr.centerY - sAbs * 56 * amp;
          // Subtle squash near bottom of arc
          const impact = Math.max(0, 1 - sAbs * 4.5) * 0.08 * amp;
          w = tr.baseW * (1 + impact);
          h = tr.baseH * (1 - impact);
          break;
        }

        case 'wiggle': {
          const u = tSec * 11.0 * omega + phase;
          cx += Math.sin(u * 1.3) * 6 * amp;
          cy += Math.cos(u * 1.7) * 4 * amp;
          rot = Math.sin(u) * 0.085 * amp;
          break;
        }

        case 'pendulum': {
          const u = tSec * 2.2 * omega + phase;
          const swing = Math.sin(u) * 0.32 * amp;
          const arm = Math.max(70, tr.baseH * 0.85);
          cx = tr.centerX + Math.sin(swing) * arm;
          cy = tr.centerY + (Math.cos(swing) - 1) * arm * -0.5;
          rot = -swing * 0.65;
          break;
        }

        case 'figure8': {
          const u = tSec * 1.5 * omega * dirSign + phase;
          cx = tr.centerX + Math.sin(u) * 95 * amp;
          cy = tr.centerY + Math.sin(u * 2) * 48 * amp;
          rot = Math.cos(u) * 0.06 * amp;
          break;
        }

        case 'drift': {
          const u = tSec * 1.35 * omega + phase;
          if (tr.direction === 'vertical') {
            cy = tr.centerY + Math.sin(u) * 90 * amp;
          } else {
            cx = tr.centerX + Math.sin(u) * 115 * amp;
          }
          break;
        }
      }

      const tl = topLeftFromCenterAndRotation(cx, cy, w, h, rot);
      tr.lastOutX = tl.x;
      tr.lastOutY = tl.y;
      tr.lastOutRot = rot;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawProps = shape.props as any;
      const canResize =
        (tr.kind === 'pulse' || tr.kind === 'bounce') &&
        typeof rawProps?.w === 'number' &&
        typeof rawProps?.h === 'number';

      updates.push({
        id,
        type: shape.type,
        x: tl.x,
        y: tl.y,
        rotation: rot,
        ...(canResize ? { props: { w, h } } : {}),
      });
    }

    if (updates.length > 0) {
      editor.store.mergeRemoteChanges(() => {
        editor.updateShapes(updates);
      });
    }

    if (pruned) {
      this.notifyCount();
    }
  }
}
