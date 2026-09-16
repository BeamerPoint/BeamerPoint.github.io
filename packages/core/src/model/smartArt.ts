import type { Mm, TikzElement, TikzShape, TikzStyle } from './types.js';
import { newId } from './ids.js';
import { polygonPoints } from './polygons.js';

/**
 * Prebuilt diagram layouts, the equivalent of PowerPoint's SmartArt.
 *
 * Each one turns a list of labels into ordinary shapes — the same rectangles, arrows
 * and text nodes the drawing tools produce. Nothing here is a special element kind, so
 * the result is editable afterwards: move a box, restyle it, delete one, and it is
 * still just a diagram. A layout that produced something you could not then edit would
 * be a dead end the first time the wording changed.
 */

export type SmartArtKind =
  | 'process' | 'chevrons' | 'cycle' | 'hierarchy' | 'pyramid' | 'matrix' | 'venn' | 'timeline';

export interface SmartArtSpec {
  kind: SmartArtKind;
  label: string;
  /** What the labels mean for this layout, shown beside the label box. */
  hint: string;
  /** Sensible starting labels, and the count the layout looks best at. */
  sample: string[];
  min: number;
  max: number;
}

export const SMART_ART: readonly SmartArtSpec[] = [
  {
    kind: 'process', label: 'Process',
    hint: 'One box per step, joined left to right.',
    sample: ['Collect', 'Analyse', 'Report'], min: 2, max: 6,
  },
  {
    kind: 'chevrons', label: 'Chevron process',
    hint: 'Interlocking arrows, for a sequence that flows.',
    sample: ['Plan', 'Build', 'Ship'], min: 2, max: 6,
  },
  {
    kind: 'cycle', label: 'Cycle',
    hint: 'Steps around a ring, each arrow leading to the next.',
    sample: ['Design', 'Measure', 'Learn', 'Adjust'], min: 3, max: 8,
  },
  {
    kind: 'hierarchy', label: 'Hierarchy',
    hint: 'First label is the root; the rest hang below it.',
    sample: ['Programme', 'Workstream A', 'Workstream B', 'Workstream C'], min: 2, max: 7,
  },
  {
    kind: 'pyramid', label: 'Pyramid',
    hint: 'First label is the apex, widening downwards.',
    sample: ['Vision', 'Strategy', 'Tactics'], min: 2, max: 5,
  },
  {
    kind: 'matrix', label: 'Matrix',
    hint: 'Four quadrants. Extra labels are ignored.',
    sample: ['Urgent', 'Important', 'Later', 'Drop'], min: 4, max: 4,
  },
  {
    kind: 'venn', label: 'Overlapping circles',
    hint: 'Two or three sets that intersect.',
    sample: ['Useful', 'Feasible', 'Wanted'], min: 2, max: 3,
  },
  {
    kind: 'timeline', label: 'Timeline',
    hint: 'Milestones along a single line.',
    sample: ['Q1', 'Q2', 'Q3', 'Q4'], min: 2, max: 8,
  },
];

/** Theme-relative fill, so a generated diagram follows the deck's colours. */
const BOX: TikzStyle = { draw: { k: 'structure' }, fill: { k: 'structure', shade: 12 } };
const LINE: TikzStyle = { draw: { k: 'structure' } };
const PLAIN: TikzStyle = {};

function text(x: Mm, y: Mm, label: string): TikzShape {
  return {
    id: newId(), t: 'node', x, y,
    content: label === '' ? [] : [{ t: 'text', s: label }],
    shape: 'none', style: PLAIN,
  };
}

/**
 * A label centred in a box.
 *
 * The node is anchored at its top-left and sized by its content, which only the
 * renderer knows — so this is an estimate, and it is the one place a generated layout
 * is approximate. Roughly 1.9mm per character at the default body size.
 */
function centredText(x: Mm, y: Mm, w: Mm, h: Mm, label: string): TikzShape {
  const est = Math.min(label.length * 1.9, w);
  return text(x + Math.max(0, (w - est) / 2), y + h / 2 - 2.6, label);
}

function arrow(from: [Mm, Mm], to: [Mm, Mm], style: TikzStyle = LINE): TikzShape {
  return {
    id: newId(), t: 'arrow',
    from: { kind: 'point', x: from[0], y: from[1] },
    to: { kind: 'point', x: to[0], y: to[1] },
    head: 'latex', style,
  };
}

function poly(
  kind: Parameters<typeof polygonPoints>[0],
  x: Mm, y: Mm, w: Mm, h: Mm, style: TikzStyle = BOX,
): TikzShape {
  return {
    id: newId(), t: 'path',
    points: polygonPoints(kind, x, y, w, h),
    closed: true, smooth: false, style,
  };
}

function rect(x: Mm, y: Mm, w: Mm, h: Mm, style: TikzStyle = BOX, rx?: Mm): TikzShape {
  return { id: newId(), t: 'rect', x, y, w, h, ...(rx !== undefined ? { rx } : {}), style };
}

/**
 * Build a layout.
 *
 * `canvas` is the drawing area in millimetres; every layout fills it with a small
 * margin, so the result does not need repositioning before it is useful.
 */
export function buildSmartArt(
  kind: SmartArtKind,
  labels: readonly string[],
  canvas: { w: Mm; h: Mm },
): TikzShape[] {
  const spec = SMART_ART.find((s) => s.kind === kind)!;
  const items = labels.map((l) => l.trim()).filter((l) => l !== '');
  const n = Math.max(spec.min, Math.min(spec.max, items.length || spec.sample.length));
  const text_ = (i: number): string => items[i] ?? spec.sample[i] ?? `Item ${i + 1}`;

  const M = 4;
  const W = canvas.w - M * 2;
  const H = canvas.h - M * 2;
  const out: TikzShape[] = [];

  switch (kind) {
    case 'process': {
      const gap = Math.min(10, W * 0.06);
      const bw = (W - gap * (n - 1)) / n;
      const bh = Math.min(H * 0.45, 22);
      const y = M + (H - bh) / 2;
      for (let i = 0; i < n; i++) {
        const x = M + i * (bw + gap);
        out.push(rect(x, y, bw, bh, BOX, 2));
        out.push(centredText(x, y, bw, bh, text_(i)));
        if (i < n - 1) out.push(arrow([x + bw, y + bh / 2], [x + bw + gap, y + bh / 2]));
      }
      return out;
    }

    case 'chevrons': {
      // Chevrons interlock: each one's notch sits inside the previous one's point.
      const bh = Math.min(H * 0.45, 24);
      const y = M + (H - bh) / 2;
      const overlap = Math.min(bh / 2, W / (n * 4));
      const bw = (W + overlap * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const x = M + i * (bw - overlap);
        out.push(poly('chevron', x, y, bw, bh));
        out.push(centredText(x + overlap, y, bw - overlap * 2, bh, text_(i)));
      }
      return out;
    }

    case 'cycle': {
      const bw = Math.min(W * 0.28, 34);
      const bh = Math.min(H * 0.24, 16);
      const rx = (W - bw) / 2;
      const ry = (H - bh) / 2;
      const cx = M + W / 2;
      const cy = M + H / 2;
      const at = (i: number): { x: Mm; y: Mm } => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        return { x: cx + rx * Math.cos(a) - bw / 2, y: cy + ry * Math.sin(a) - bh / 2 };
      };
      for (let i = 0; i < n; i++) {
        const p = at(i);
        out.push(rect(p.x, p.y, bw, bh, BOX, 2));
        out.push(centredText(p.x, p.y, bw, bh, text_(i)));
      }
      // Curved arrows between consecutive boxes, bowing outwards around the ring.
      for (let i = 0; i < n; i++) {
        const a = at(i);
        const b = at((i + 1) % n);
        const from: [Mm, Mm] = [a.x + bw / 2, a.y + bh / 2];
        const to: [Mm, Mm] = [b.x + bw / 2, b.y + bh / 2];
        const shrink = 0.34;
        const p1: [Mm, Mm] = [
          from[0] + (to[0] - from[0]) * shrink, from[1] + (to[1] - from[1]) * shrink,
        ];
        const p2: [Mm, Mm] = [
          from[0] + (to[0] - from[0]) * (1 - shrink),
          from[1] + (to[1] - from[1]) * (1 - shrink),
        ];
        out.push({ ...arrow(p1, p2), bend: -25 } as TikzShape);
      }
      return out;
    }

    case 'hierarchy': {
      const kids = n - 1;
      const bw = Math.min(W * 0.3, 38);
      const bh = Math.min(H * 0.22, 15);
      const rootX = M + (W - bw) / 2;
      const rootY = M + H * 0.08;
      out.push(rect(rootX, rootY, bw, bh, BOX, 2));
      out.push(centredText(rootX, rootY, bw, bh, text_(0)));

      const childY = M + H * 0.62;
      const gap = kids > 1 ? (W - bw * kids) / (kids - 1) : 0;
      const spanW = kids > 1 ? W : bw;
      for (let i = 0; i < kids; i++) {
        const x = kids > 1 ? M + i * (bw + gap) : M + (W - bw) / 2;
        out.push(rect(x, childY, bw, bh, BOX, 2));
        out.push(centredText(x, childY, bw, bh, text_(i + 1)));
        // Elbow: down from the root, across, then down into the child.
        const midY = (rootY + bh + childY) / 2;
        out.push({
          id: newId(), t: 'path',
          points: [
            [rootX + bw / 2, rootY + bh],
            [rootX + bw / 2, midY],
            [x + bw / 2, midY],
            [x + bw / 2, childY],
          ],
          closed: false, smooth: false, style: LINE,
        });
      }
      void spanW;
      return out;
    }

    case 'pyramid': {
      const bh = H / n;
      for (let i = 0; i < n; i++) {
        const y = M + i * bh;
        // Each tier is the slice of the triangle at that height.
        const topW = (W * (i + 0.02)) / n;
        const botW = (W * (i + 1)) / n;
        const cx = M + W / 2;
        out.push({
          id: newId(), t: 'path',
          points: [
            [cx - topW / 2, y], [cx + topW / 2, y],
            [cx + botW / 2, y + bh - 1], [cx - botW / 2, y + bh - 1],
          ],
          closed: true, smooth: false,
          style: { draw: { k: 'structure' }, fill: { k: 'structure', shade: 10 + i * 12 } },
        });
        out.push(centredText(cx - botW / 2, y, botW, bh - 1, text_(i)));
      }
      return out;
    }

    case 'matrix': {
      const gap = 3;
      const bw = (W - gap) / 2;
      const bh = (H - gap) / 2;
      const cells: Array<[number, number]> = [[0, 0], [1, 0], [0, 1], [1, 1]];
      cells.forEach(([cxi, cyi], i) => {
        const x = M + cxi * (bw + gap);
        const y = M + cyi * (bh + gap);
        out.push(rect(x, y, bw, bh, {
          draw: { k: 'structure' },
          fill: { k: 'structure', shade: i % 2 === 0 ? 10 : 18 },
        }));
        out.push(centredText(x, y, bw, bh, text_(i)));
      });
      return out;
    }

    case 'venn': {
      const count = Math.min(3, Math.max(2, n));
      /*
       * The radius comes from the arrangement's own extent, not from a guess. Two
       * circles offset by 0.55r span 3.1r across and 2r down. Three sit at -0.32r and
       * +0.62r, so they span 3.2r across and (1.32 + 1.62) = 2.94r down. Sizing by
       * W/(count+1) overflowed the top of the canvas, and anything outside the
       * picture's bounding box is simply clipped away.
       */
      const spanX = count === 2 ? 3.1 : 3.2;
      const spanY = count === 2 ? 2 : 2.94;
      const r = Math.min(W / spanX, H / spanY) * 0.98;
      const cx = M + W / 2;
      // Three circles sit low in their own extent, so the centre is nudged up to match.
      const cy = M + H / 2 - (count === 3 ? r * 0.15 : 0);

      const style: TikzStyle = {
        draw: { k: 'structure' }, fill: { k: 'structure', shade: 14 }, opacity: 0.65,
      };
      const centres: Array<[Mm, Mm]> = count === 2
        ? [[cx - r * 0.55, cy], [cx + r * 0.55, cy]]
        : [
            [cx - r * 0.6, cy - r * 0.32],
            [cx + r * 0.6, cy - r * 0.32],
            [cx, cy + r * 0.62],
          ];
      centres.forEach(([x, y], i) => {
        out.push({ id: newId(), t: 'ellipse', cx: x, cy: y, rx: r, ry: r, style });
        out.push(text(x - Math.min(text_(i).length * 1.9, r) / 2, y - r * 0.5, text_(i)));
      });
      return out;
    }

    case 'timeline': {
      const y = M + H / 2;
      out.push(arrow([M, y], [M + W, y], { draw: { k: 'structure' }, lineWidth: { v: 0.5, u: 'mm' } }));
      const step = W / (n + 1);
      for (let i = 0; i < n; i++) {
        const x = M + step * (i + 1);
        out.push({
          id: newId(), t: 'ellipse', cx: x, cy: y, rx: 1.8, ry: 1.8,
          style: { draw: { k: 'structure' }, fill: { k: 'structure' } },
        });
        // Alternate above and below, so labels cannot collide.
        const above = i % 2 === 0;
        const label = text_(i);
        out.push(text(x - Math.min(label.length * 1.9, step) / 2, above ? y - 11 : y + 5, label));
      }
      return out;
    }
  }
}

/** A drawing canvas already filled with a layout. */
export function newSmartArtElement(
  kind: SmartArtKind,
  labels: readonly string[],
  w: Mm = 110,
  h: Mm = 55,
): TikzElement {
  return {
    id: newId(),
    kind: 'tikz',
    placement: { mode: 'flow' },
    mode: 'shapes',
    shapes: buildSmartArt(kind, labels, { w, h }),
    canvasSize: { w, h },
  };
}
