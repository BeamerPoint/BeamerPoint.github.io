import type { Anchor, Mm, TikzElement, TikzShape, TikzStyle } from './types.js';
import { newId } from './ids.js';
import { roundMm } from '../geometry/paper.js';

/**
 * Drawing operations on a TikZ element.
 *
 * Pure, in `core`, and headlessly testable for the same reason the table operations
 * are: an off-by-one here changes the emitted LaTeX, not just the screen.
 */

/** The shape kinds the UI can draw. `path` covers both a plain line and a polygon. */
export type ShapeTool = 'rect' | 'rounded' | 'ellipse' | 'line' | 'arrow' | 'text';

const DEFAULT_STYLE: TikzStyle = { draw: { k: 'structure' } };

/** The bounding box of a shape, in canvas millimetres. Arrows have no box of their own. */
export function shapeBounds(
  s: TikzShape,
): { x: Mm; y: Mm; w: Mm; h: Mm } | null {
  switch (s.t) {
    case 'rect':
      return { x: s.x, y: s.y, w: s.w, h: s.h };
    case 'ellipse':
      return { x: s.cx - s.rx, y: s.cy - s.ry, w: s.rx * 2, h: s.ry * 2 };
    case 'node':
      // A text node is sized by its content, which only the renderer knows.
      return { x: s.x, y: s.y, w: 0, h: 0 };
    case 'path': {
      const xs = s.points.map((p) => p[0]);
      const ys = s.points.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case 'arrow':
      return null;
  }
}

/**
 * Build a shape from a drag on the canvas.
 *
 * The drag is given as its two corners in either order, so dragging up or left works
 * the same as dragging down or right.
 */
export function shapeFromDrag(
  tool: ShapeTool,
  from: { x: Mm; y: Mm },
  to: { x: Mm; y: Mm },
  style: TikzStyle = DEFAULT_STYLE,
): TikzShape {
  const id = newId();
  const x = roundMm(Math.min(from.x, to.x));
  const y = roundMm(Math.min(from.y, to.y));
  const w = roundMm(Math.abs(to.x - from.x));
  const h = roundMm(Math.abs(to.y - from.y));

  switch (tool) {
    case 'rect':
      return { id, t: 'rect', x, y, w: Math.max(w, 2), h: Math.max(h, 2), style };
    case 'rounded':
      return { id, t: 'rect', x, y, w: Math.max(w, 2), h: Math.max(h, 2), rx: 2, style };
    case 'ellipse':
      return {
        id, t: 'ellipse',
        cx: roundMm(x + w / 2), cy: roundMm(y + h / 2),
        rx: Math.max(roundMm(w / 2), 1), ry: Math.max(roundMm(h / 2), 1),
        style,
      };
    case 'line':
      return {
        id, t: 'path',
        points: [[roundMm(from.x), roundMm(from.y)], [roundMm(to.x), roundMm(to.y)]],
        closed: false, smooth: false, style,
      };
    case 'arrow':
      return {
        id, t: 'arrow',
        from: { kind: 'point', x: roundMm(from.x), y: roundMm(from.y) },
        to: { kind: 'point', x: roundMm(to.x), y: roundMm(to.y) },
        head: 'latex',
        style,
      };
    case 'text':
      return {
        id, t: 'node', x, y,
        content: [{ t: 'text', s: 'Label' }],
        shape: 'none',
        style: {},
      };
  }
}

function mapShape(
  el: TikzElement,
  shapeId: string,
  fn: (s: TikzShape) => TikzShape,
): TikzElement {
  return { ...el, shapes: (el.shapes ?? []).map((s) => (s.id === shapeId ? fn(s) : s)) };
}

export function addShape(el: TikzElement, shape: TikzShape): TikzElement {
  return { ...el, shapes: [...(el.shapes ?? []), shape] };
}

/**
 * Remove a shape, and any arrow that was attached to it.
 *
 * An arrow left pointing at a deleted node does not compile: TikZ fails with an
 * undefined-shape error rather than skipping it.
 */
export function removeShape(el: TikzElement, shapeId: string): TikzElement {
  const kept = (el.shapes ?? []).filter((s) => s.id !== shapeId);
  const attached = (a: Anchor): boolean => a.kind === 'shape' && a.shapeId === shapeId;
  return {
    ...el,
    shapes: kept.filter((s) => !(s.t === 'arrow' && (attached(s.from) || attached(s.to)))),
  };
}

export function moveShape(el: TikzElement, shapeId: string, dx: Mm, dy: Mm): TikzElement {
  return mapShape(el, shapeId, (s) => {
    switch (s.t) {
      case 'rect':
        return { ...s, x: roundMm(s.x + dx), y: roundMm(s.y + dy) };
      case 'ellipse':
        return { ...s, cx: roundMm(s.cx + dx), cy: roundMm(s.cy + dy) };
      case 'node':
        return { ...s, x: roundMm(s.x + dx), y: roundMm(s.y + dy) };
      case 'path':
        return {
          ...s,
          points: s.points.map(([x, y]) => [roundMm(x + dx), roundMm(y + dy)] as [Mm, Mm]),
        };
      case 'arrow': {
        // Only an endpoint pinned to a point moves; one attached to a shape follows
        // that shape, which is the whole reason for attaching it.
        const shift = (a: Anchor): Anchor =>
          a.kind === 'point' ? { ...a, x: roundMm(a.x + dx), y: roundMm(a.y + dy) } : a;
        return { ...s, from: shift(s.from), to: shift(s.to) };
      }
    }
  });
}

/** Resize by dragging a corner: `dw`/`dh` are deltas on the shape's own box. */
export function resizeShape(el: TikzElement, shapeId: string, dw: Mm, dh: Mm): TikzElement {
  return mapShape(el, shapeId, (s) => {
    if (s.t === 'rect') {
      return { ...s, w: Math.max(2, roundMm(s.w + dw)), h: Math.max(2, roundMm(s.h + dh)) };
    }
    if (s.t === 'ellipse') {
      return {
        ...s,
        rx: Math.max(1, roundMm(s.rx + dw / 2)),
        ry: Math.max(1, roundMm(s.ry + dh / 2)),
      };
    }
    // A line or an arrow is resized by dragging its endpoint, not a corner.
    return s;
  });
}

/** Move one endpoint of a line or an arrow. */
export function moveEndpoint(
  el: TikzElement,
  shapeId: string,
  which: 'from' | 'to',
  point: { x: Mm; y: Mm },
): TikzElement {
  return mapShape(el, shapeId, (s) => {
    if (s.t === 'arrow') {
      return {
        ...s,
        [which]: { kind: 'point', x: roundMm(point.x), y: roundMm(point.y) },
      } as TikzShape;
    }
    if (s.t === 'path' && s.points.length === 2) {
      const points: Array<[Mm, Mm]> = which === 'from'
        ? [[roundMm(point.x), roundMm(point.y)], s.points[1]!]
        : [s.points[0]!, [roundMm(point.x), roundMm(point.y)]];
      return { ...s, points };
    }
    return s;
  });
}

/** Attach an arrow endpoint to a shape's side, which is what makes it a diagram. */
export function attachEndpoint(
  el: TikzElement,
  shapeId: string,
  which: 'from' | 'to',
  target: { shapeId: string; side: 'n' | 's' | 'e' | 'w' | 'center' } | null,
  fallback: { x: Mm; y: Mm },
): TikzElement {
  return mapShape(el, shapeId, (s) => {
    if (s.t !== 'arrow') return s;
    // An arrow attached to itself is a TikZ error, not a shape.
    if (target !== null && target.shapeId === shapeId) return s;
    const anchor: Anchor = target === null
      ? { kind: 'point', x: roundMm(fallback.x), y: roundMm(fallback.y) }
      : { kind: 'shape', shapeId: target.shapeId, side: target.side };
    return { ...s, [which]: anchor } as TikzShape;
  });
}

export function restyleShape(
  el: TikzElement,
  shapeId: string,
  patch: Partial<TikzStyle>,
): TikzElement {
  return mapShape(el, shapeId, (s) => {
    const style: TikzStyle = { ...s.style };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete (style as Record<string, unknown>)[key];
      else (style as Record<string, unknown>)[key] = value;
    }
    return { ...s, style };
  });
}

/** Raise or lower a shape in the paint order. */
export function reorderShape(el: TikzElement, shapeId: string, delta: 1 | -1): TikzElement {
  const shapes = [...(el.shapes ?? [])];
  const i = shapes.findIndex((s) => s.id === shapeId);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= shapes.length) return el;
  [shapes[i], shapes[j]] = [shapes[j]!, shapes[i]!];
  return { ...el, shapes };
}

export function setCanvasSize(el: TikzElement, w: Mm, h: Mm): TikzElement {
  return { ...el, canvasSize: { w: Math.max(10, roundMm(w)), h: Math.max(10, roundMm(h)) } };
}

export function setArrowHead(
  el: TikzElement,
  shapeId: string,
  head: Extract<TikzShape, { t: 'arrow' }>['head'],
): TikzElement {
  return mapShape(el, shapeId, (s) => (s.t === 'arrow' ? { ...s, head } : s));
}

export function setNodeContent(
  el: TikzElement,
  shapeId: string,
  content: Extract<TikzShape, { t: 'node' }>['content'],
): TikzElement {
  return mapShape(el, shapeId, (s) => (s.t === 'node' ? { ...s, content } : s));
}
