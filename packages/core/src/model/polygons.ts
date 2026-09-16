import type { Mm } from './types.js';

/**
 * Shapes drawn as explicit polygons.
 *
 * TikZ ships a shapes library, and using it was the obvious route — until the output
 * was measured. Asked for a 26x16mm box, `trapezium` drew 34.2x16, `star` drew
 * 24.7x23.5, `regular polygon sides=3` drew 22.5x19.5 and `isosceles triangle` drew
 * 31.4x26. Those shapes size themselves to CONTAIN the given box, so the canvas would
 * have drawn one rectangle's worth of diamond while the PDF drew another — a 30-50%
 * error, against a canvas budget of about 2mm.
 *
 * Computing the points here instead means the canvas and the emitted `\draw` are the
 * same numbers, exact by construction, and it needs no TikZ library at all. Only the
 * shapes TikZ sizes correctly (`rectangle`, `ellipse`, `circle`) stay as nodes, and
 * those are the ones an arrow can attach to.
 */

export type PolygonKind =
  | 'triangle' | 'rightTriangle' | 'diamond' | 'pentagon' | 'hexagon' | 'octagon'
  | 'star5' | 'star6' | 'trapezium' | 'parallelogram' | 'chevron' | 'arrowBlock'
  | 'cross' | 'bracePair' | 'cylinder' | 'document';

export const POLYGON_KINDS: readonly PolygonKind[] = [
  'triangle', 'rightTriangle', 'diamond', 'pentagon', 'hexagon', 'octagon',
  'star5', 'star6', 'trapezium', 'parallelogram', 'chevron', 'arrowBlock',
  'cross', 'bracePair', 'cylinder', 'document',
];

export const POLYGON_LABEL: Readonly<Record<PolygonKind, string>> = {
  triangle: 'Triangle',
  rightTriangle: 'Right triangle',
  diamond: 'Diamond',
  pentagon: 'Pentagon',
  hexagon: 'Hexagon',
  octagon: 'Octagon',
  star5: 'Star (5)',
  star6: 'Star (6)',
  trapezium: 'Trapezium',
  parallelogram: 'Parallelogram',
  chevron: 'Chevron',
  arrowBlock: 'Block arrow',
  cross: 'Cross',
  bracePair: 'Chevron (open)',
  cylinder: 'Cylinder',
  document: 'Document',
};

/**
 * Stretch a point list so it exactly fills the box.
 *
 * A polygon inscribed in an ellipse does not touch all four edges — a pentagon has no
 * vertex at the bottom, and a hexagon's widest points are at cos(30°), so it spans only
 * 86.6% of the width. Leaving that alone would reproduce the very defect that ruled out
 * TikZ's own shapes: a shape smaller than the box the user dragged.
 */
function fitToBox(pts: Array<[Mm, Mm]>, x: Mm, y: Mm, w: Mm, h: Mm): Array<[Mm, Mm]> {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const sx = spanX === 0 ? 1 : w / spanX;
  const sy = spanY === 0 ? 1 : h / spanY;
  return pts.map(([px, py]) => [x + (px - minX) * sx, y + (py - minY) * sy]);
}

/** A regular n-gon, first vertex at the top, stretched to fill the box. */
function regular(x: Mm, y: Mm, w: Mm, h: Mm, n: number): Array<[Mm, Mm]> {
  const out: Array<[Mm, Mm]> = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    out.push([Math.cos(a), Math.sin(a)]);
  }
  return fitToBox(out, x, y, w, h);
}

/** An n-pointed star, `inner` as a fraction of the radius, stretched to fill the box. */
function star(x: Mm, y: Mm, w: Mm, h: Mm, points: number, inner: number): Array<[Mm, Mm]> {
  const out: Array<[Mm, Mm]> = [];
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 === 0 ? 1 : inner;
    out.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return fitToBox(out, x, y, w, h);
}

/**
 * The outline of a shape, in millimetres, exactly filling the box (x, y, w, h).
 *
 * Every kind touches all four edges of the box, so what the user drags is what both
 * the canvas and the PDF draw.
 */
export function polygonPoints(
  kind: PolygonKind,
  x: Mm,
  y: Mm,
  w: Mm,
  h: Mm,
): Array<[Mm, Mm]> {
  const r = x + w;
  const b = y + h;
  const cx = x + w / 2;
  const cy = y + h / 2;

  switch (kind) {
    case 'triangle':
      return [[cx, y], [r, b], [x, b]];

    case 'rightTriangle':
      return [[x, y], [x, b], [r, b]];

    case 'diamond':
      return [[cx, y], [r, cy], [cx, b], [x, cy]];

    case 'pentagon':
      return regular(x, y, w, h, 5);

    case 'hexagon':
      return regular(x, y, w, h, 6);

    case 'octagon':
      return regular(x, y, w, h, 8);

    case 'star5':
      return star(x, y, w, h, 5, 0.42);

    case 'star6':
      return star(x, y, w, h, 6, 0.55);

    case 'trapezium':
      return [[x + w * 0.22, y], [r - w * 0.22, y], [r, b], [x, b]];

    case 'parallelogram':
      return [[x + w * 0.22, y], [r, y], [r - w * 0.22, b], [x, b]];

    // A process step: a rectangle with a notched left edge and a pointed right one.
    case 'chevron': {
      const tip = Math.min(w * 0.25, h / 2);
      return [
        [x, y], [r - tip, y], [r, cy], [r - tip, b], [x, b], [x + tip, cy],
      ];
    }

    // A block arrow: a shaft with a head, pointing right.
    case 'arrowBlock': {
      const head = Math.min(w * 0.35, h);
      const shaft = h * 0.28;
      return [
        [x, cy - shaft], [r - head, cy - shaft], [r - head, y],
        [r, cy], [r - head, b], [r - head, cy + shaft], [x, cy + shaft],
      ];
    }

    case 'cross': {
      const ax = w * 0.3;
      const ay = h * 0.3;
      return [
        [x + ax, y], [r - ax, y], [r - ax, y + ay], [r, y + ay],
        [r, b - ay], [r - ax, b - ay], [r - ax, b], [x + ax, b],
        [x + ax, b - ay], [x, b - ay], [x, y + ay], [x + ax, y + ay],
      ];
    }

    // A thick ">" — an open chevron, for "leads to" without a full arrow.
    case 'bracePair': {
      const thick = w * 0.42;
      return [
        [x, y], [r, cy], [x, b],
        [x + thick, b], [r - thick, cy], [x + thick, y],
      ];
    }

    // A cylinder drawn as a polygon: the top ellipse is approximated by its corners,
    // which keeps it exact against the box rather than pretty.
    case 'cylinder': {
      const lip = Math.min(h * 0.18, 6);
      return [
        [x, y + lip], [cx, y], [r, y + lip], [r, b - lip], [cx, b], [x, b - lip],
      ];
    }

    // A page with a wavy foot, flattened to a zig-zag so it stays a plain polygon.
    case 'document': {
      const wave = h * 0.16;
      return [
        [x, y], [r, y], [r, b - wave],
        [x + w * 0.66, b], [x + w * 0.33, b - wave * 1.6], [x, b],
      ];
    }
  }
}
