import {
  b64Vecs,
  createShapeId,
  getIndices,
  type Editor,
  type TLDefaultColorStyle,
  type TLDefaultDashStyle,
  type TLDefaultSizeStyle,
  type TLDrawShapeSegment,
  type TLShapeId,
  type VecModel,
} from 'tldraw';

export type SketchMotif =
  | 'circle_around'
  | 'underline'
  | 'cross_out'
  | 'bracket'
  | 'wave'
  | 'spiral'
  | 'sparkline'
  | 'divider'
  | 'checkmark'
  | 'lightning'
  | 'smiley';

export interface SketchBoundsTarget {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

function encodeStroke(points: VecModel[]): TLDrawShapeSegment {
  const safePoints =
    points.length >= 2
      ? points
      : [
          { x: 0, y: 0, z: 0.5 },
          { x: 2, y: 0, z: 0.5 },
        ];
  return {
    type: 'free',
    path: b64Vecs.encodePoints(safePoints),
  };
}

/**
 * Generates local stroke segments (relative to shape origin `(originX, originY)`)
 * for organic hand-drawn `TLDrawShape` motifs.
 */
export function buildDrawMotifSegments(
  motif: SketchMotif,
  target: SketchBoundsTarget,
): {
  originX: number;
  originY: number;
  segments: TLDrawShapeSegment[];
  isPen: boolean;
  label: string;
} {
  const { cx, cy, w, h } = target;

  switch (motif) {
    case 'circle_around': {
      const rx = Math.max(68, w * 0.64 + 18);
      const ry = Math.max(46, h * 0.66 + 16);
      const originX = cx - rx;
      const originY = cy - ry;
      const pts: VecModel[] = [];
      const steps = 44;
      // Organic 1.14-turn calligrapher's loop with subtle hand wobble
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const theta = -Math.PI * 0.58 + t * Math.PI * 2 * 1.13;
        const wobble = 1 + Math.sin(t * Math.PI * 3) * 0.035 - t * 0.02;
        const x = rx + Math.cos(theta) * rx * wobble;
        const y = ry + Math.sin(theta) * ry * wobble;
        const z = Math.min(0.85, Math.max(0.28, 0.38 + Math.sin(t * Math.PI) * 0.42));
        pts.push({ x, y, z });
      }
      return {
        originX,
        originY,
        segments: [encodeStroke(pts)],
        isPen: true,
        label: 'Ink Loop',
      };
    }

    case 'underline': {
      const spanW = Math.max(120, w * 0.94);
      const originX = cx - spanW * 0.5;
      const originY = cy + h * 0.5 + 10;
      const pts1: VecModel[] = [];
      const pts2: VecModel[] = [];
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = t * spanW;
        const y = -Math.sin(t * Math.PI) * 4.5 + (1 - t) * 1.5;
        const z = 0.42 + Math.sin(t * Math.PI) * 0.36;
        pts1.push({ x, y, z });
      }
      // Subtle second accent flourish underneath
      for (let i = 0; i <= 18; i++) {
        const t = i / 18;
        const x = spanW * 0.08 + t * spanW * 0.84;
        const y = 8 - Math.sin(t * Math.PI) * 2.5;
        const z = 0.34 + Math.sin(t * Math.PI) * 0.28;
        pts2.push({ x, y, z });
      }
      return {
        originX,
        originY,
        segments: [encodeStroke(pts1), encodeStroke(pts2)],
        isPen: true,
        label: 'Ink Underline',
      };
    }

    case 'cross_out': {
      const spanW = Math.max(90, w * 0.86);
      const spanH = Math.max(54, h * 0.78);
      const originX = cx - spanW * 0.5;
      const originY = cy - spanH * 0.5;
      const s1: VecModel[] = [];
      const s2: VecModel[] = [];
      for (let i = 0; i <= 18; i++) {
        const t = i / 18;
        const z = 0.4 + Math.sin(t * Math.PI) * 0.38;
        s1.push({ x: t * spanW, y: t * spanH + Math.sin(t * Math.PI) * 3, z });
        s2.push({ x: spanW - t * spanW, y: t * spanH - Math.sin(t * Math.PI) * 3, z });
      }
      return {
        originX,
        originY,
        segments: [encodeStroke(s1), encodeStroke(s2)],
        isPen: true,
        label: 'Cross Out',
      };
    }

    case 'bracket': {
      const bh = Math.max(150, h * 1.15);
      const bw = 34;
      const originX = cx + w * 0.5 + 22;
      const originY = cy - bh * 0.5;
      const pts: VecModel[] = [];
      const steps = 32;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const y = t * bh;
        let x = 0;
        if (t < 0.45) {
          x = Math.sin((t / 0.45) * (Math.PI * 0.5)) * (bw * 0.55);
        } else if (t <= 0.55) {
          const midT = (t - 0.45) / 0.1;
          x = bw * 0.55 + Math.sin(midT * Math.PI) * (bw * 0.45);
        } else {
          const tailT = (t - 0.55) / 0.45;
          x = Math.cos(tailT * (Math.PI * 0.5)) * (bw * 0.55);
        }
        pts.push({ x, y, z: 0.42 + Math.sin(t * Math.PI) * 0.32 });
      }
      return {
        originX,
        originY,
        segments: [encodeStroke(pts)],
        isPen: true,
        label: 'Calligraphic Brace',
      };
    }

    case 'wave': {
      const spanW = 280;
      const amp = 34;
      const originX = cx - spanW * 0.5;
      const originY = cy;
      const pts: VecModel[] = [];
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        pts.push({
          x: t * spanW,
          y: Math.sin(t * Math.PI * 4) * amp,
          z: 0.45 + Math.cos(t * Math.PI * 4) * 0.18,
        });
      }
      return {
        originX,
        originY,
        segments: [encodeStroke(pts)],
        isPen: true,
        label: 'Sine Wave',
      };
    }

    case 'spiral': {
      const maxR = 96;
      const originX = cx - maxR;
      const originY = cy - maxR;
      const pts: VecModel[] = [];
      const steps = 64;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const theta = t * Math.PI * 6.5;
        const r = 8 + t * (maxR - 8);
        pts.push({
          x: maxR + Math.cos(theta) * r,
          y: maxR + Math.sin(theta) * r,
          z: 0.34 + t * 0.44,
        });
      }
      return {
        originX,
        originY,
        segments: [encodeStroke(pts)],
        isPen: true,
        label: 'Spiral Study',
      };
    }

    case 'sparkline': {
      const spanW = 260;
      const spanH = 110;
      const originX = cx - spanW * 0.5;
      const originY = cy - spanH * 0.5;
      const knots = [0.85, 0.72, 0.78, 0.54, 0.61, 0.35, 0.41, 0.12];
      const pts: VecModel[] = [];
      const steps = 42;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const pos = t * (knots.length - 1);
        const idx = Math.min(knots.length - 2, Math.floor(pos));
        const frac = pos - idx;
        const smooth = frac * frac * (3 - 2 * frac);
        const yNorm = knots[idx] * (1 - smooth) + knots[idx + 1] * smooth;
        pts.push({
          x: t * spanW,
          y: yNorm * spanH,
          z: 0.42 + t * 0.35,
        });
      }
      return {
        originX,
        originY,
        segments: [encodeStroke(pts)],
        isPen: true,
        label: 'Sparkline Curve',
      };
    }

    case 'divider': {
      const spanW = 420;
      const originX = cx - spanW * 0.5;
      const originY = cy;
      const pts: VecModel[] = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        pts.push({
          x: t * spanW,
          y: Math.sin(t * Math.PI) * -1.8,
          z: 0.35 + Math.sin(t * Math.PI) * 0.35,
        });
      }
      return {
        originX,
        originY,
        segments: [encodeStroke(pts)],
        isPen: true,
        label: 'Divider Rule',
      };
    }

    case 'checkmark': {
      const originX = cx - 54;
      const originY = cy - 46;
      const pts: VecModel[] = [];
      const corners: [number, number, number][] = [
        [0, 52, 0.42],
        [18, 72, 0.65],
        [36, 90, 0.82],
        [68, 44, 0.64],
        [108, 0, 0.36],
      ];
      for (let s = 0; s < corners.length - 1; s++) {
        const [x0, y0, z0] = corners[s];
        const [x1, y1, z1] = corners[s + 1];
        for (let k = 0; k < 7; k++) {
          const t = k / 7;
          pts.push({
            x: x0 + (x1 - x0) * t,
            y: y0 + (y1 - y0) * t,
            z: z0 + (z1 - z0) * t,
          });
        }
      }
      pts.push({ x: 108, y: 0, z: 0.32 });
      return {
        originX,
        originY,
        segments: [encodeStroke(pts)],
        isPen: true,
        label: 'Checkmark',
      };
    }

    case 'lightning': {
      const originX = cx - 44;
      const originY = cy - 78;
      const vertices: [number, number][] = [
        [56, 0],
        [10, 72],
        [48, 72],
        [24, 156],
        [86, 64],
        [46, 64],
        [56, 0],
      ];
      const pts: VecModel[] = [];
      for (let s = 0; s < vertices.length - 1; s++) {
        const [x0, y0] = vertices[s];
        const [x1, y1] = vertices[s + 1];
        for (let k = 0; k < 6; k++) {
          const t = k / 6;
          pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, z: 0.56 });
        }
      }
      pts.push({ x: vertices[vertices.length - 1][0], y: vertices[vertices.length - 1][1], z: 0.5 });
      return {
        originX,
        originY,
        segments: [encodeStroke(pts)],
        isPen: false,
        label: 'Lightning Bolt',
      };
    }

    case 'smiley':
    default: {
      const r = 68;
      const originX = cx - r;
      const originY = cy - r;
      const ring: VecModel[] = [];
      for (let i = 0; i <= 36; i++) {
        const t = i / 36;
        const a = -Math.PI * 0.5 + t * Math.PI * 2.04;
        ring.push({ x: r + Math.cos(a) * r, y: r + Math.sin(a) * r, z: 0.52 });
      }
      const leftEye: VecModel[] = [
        { x: r - 22, y: r - 22, z: 0.65 },
        { x: r - 22, y: r - 10, z: 0.65 },
      ];
      const rightEye: VecModel[] = [
        { x: r + 22, y: r - 22, z: 0.65 },
        { x: r + 22, y: r - 10, z: 0.65 },
      ];
      const smile: VecModel[] = [];
      for (let i = 0; i <= 18; i++) {
        const t = i / 18;
        const a = Math.PI * 0.18 + t * Math.PI * 0.64;
        smile.push({
          x: r + Math.cos(a) * (r * 0.56),
          y: r - 2 + Math.sin(a) * (r * 0.52),
          z: 0.58,
        });
      }
      return {
        originX,
        originY,
        segments: [
          encodeStroke(ring),
          encodeStroke(leftEye),
          encodeStroke(rightEye),
          encodeStroke(smile),
        ],
        isPen: true,
        label: 'Smiley Sketch',
      };
    }
  }
}

export function buildSplineMotifPoints(motif: 'wave' | 'sparkline' | 'divider'): {
  points: Record<string, { id: string; index: ReturnType<typeof getIndices>[number]; x: number; y: number }>;
  spanW: number;
  spline: 'line' | 'cubic';
} {
  const knotCoords: [number, number][] =
    motif === 'divider'
      ? [
          [0, 0],
          [180, -4],
          [360, 0],
        ]
      : motif === 'sparkline'
        ? [
            [0, 96],
            [65, 72],
            [130, 82],
            [195, 34],
            [260, 8],
          ]
        : [
            [0, 0],
            [70, -38],
            [140, 0],
            [210, 38],
            [280, 0],
          ];
  const indices = getIndices(knotCoords.length);
  const points: Record<string, { id: string; index: (typeof indices)[number]; x: number; y: number }> = {};
  knotCoords.forEach(([x, y], i) => {
    const idx = indices[i];
    points[idx] = { id: idx, index: idx, x, y };
  });
  return {
    points,
    spanW: knotCoords[knotCoords.length - 1][0],
    spline: motif === 'divider' ? 'line' : 'cubic',
  };
}

/**
 * Spawns either a genuine `TLDrawShape` freehand ink sketch OR a smooth cubic `TLLineShape` spline.
 */
export function spawnInkSketch(
  editor: Editor,
  opts: {
    motif: SketchMotif;
    target: SketchBoundsTarget;
    color: TLDefaultColorStyle;
    dash?: TLDefaultDashStyle;
    size?: TLDefaultSizeStyle;
    asCubicSpline?: boolean;
    utteranceId: number;
    reg: string;
  },
): { id: TLShapeId; label: string } {
  const id = createShapeId();

  if (opts.asCubicSpline && (opts.motif === 'wave' || opts.motif === 'sparkline' || opts.motif === 'divider')) {
    const { points, spanW, spline } = buildSplineMotifPoints(opts.motif);

    editor.createShape({
      id,
      type: 'line',
      x: opts.target.cx - spanW * 0.5,
      y: opts.target.cy,
      meta: {
        speculative: false,
        utteranceId: opts.utteranceId,
        role: 'accent',
        reg: opts.reg,
        sketchLabel: `${opts.motif} spline`,
      },
      props: {
        color: opts.color,
        dash: opts.dash ?? 'solid',
        size: opts.size ?? 'm',
        spline,
        points,
        scale: 1,
      },
    });
    return { id, label: `${opts.motif} spline` };
  }

  const built = buildDrawMotifSegments(opts.motif, opts.target);
  editor.createShape({
    id,
    type: 'draw',
    x: built.originX,
    y: built.originY,
    meta: {
      speculative: false,
      utteranceId: opts.utteranceId,
      role: 'accent',
      reg: opts.reg,
      sketchLabel: built.label,
    },
    props: {
      color: opts.color,
      fill: 'none',
      dash: opts.dash ?? 'draw',
      size: opts.size ?? 'm',
      segments: built.segments,
      isComplete: true,
      isClosed: false,
      isPen: built.isPen,
      scale: 1,
      scaleX: 1,
      scaleY: 1,
    },
  });
  return { id, label: built.label };
}
