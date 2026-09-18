/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import type { Anchor, Mm, RichText, TikzElement, TikzShape, TikzStyle } from './types.js';
import { newId } from './ids.js';
import { roundMm } from '../geometry/paper.js';
import { POLYGON_KINDS, polygonPoints, type PolygonKind } from './polygons.js';

/**
 * Drawing operations on a TikZ element.
 *
 * Pure, in `core`, and headlessly testable for the same reason the table operations
 * are: an off-by-one here changes the emitted LaTeX, not just the screen.
 */

/** The shapes the UI can draw directly. */
export type BasicTool = 'rect' | 'rounded' | 'ellipse' | 'circle' | 'line' | 'arrow' | 'text';

/**
 * Everything the shape gallery offers.
 *
 * The basic tools map onto model shapes that TikZ sizes exactly as asked; the polygon
 * kinds are drawn as explicit point lists for the same reason (see `polygons.ts`).
 */
export type ShapeTool = BasicTool | PolygonKind;

/** True when the tool produces a named TikZ node, which is what an arrow can attach to. */
export function isNodeTool(tool: ShapeTool): boolean {
  return tool === 'rect' || tool === 'rounded' || tool === 'ellipse' || tool === 'circle';
}

/** True when a shape is a named node in the output, so an arrow may attach to it. */
export function isAttachable(shape: TikzShape): boolean {
  return shape.t === 'rect' || shape.t === 'ellipse' || shape.t === 'node';
}

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

  if ((POLYGON_KINDS as readonly string[]).includes(tool)) {
    return {
      id, t: 'path',
      points: polygonPoints(tool as PolygonKind, x, y, Math.max(w, 2), Math.max(h, 2))
        .map(([px, py]) => [roundMm(px), roundMm(py)] as [Mm, Mm]),
      closed: true, smooth: false, style,
    };
  }

  // The polygon kinds returned above; what is left is exactly a BasicTool.
  switch (tool as BasicTool) {
    case 'rect':
      return { id, t: 'rect', x, y, w: Math.max(w, 2), h: Math.max(h, 2), style };
    case 'rounded':
      return { id, t: 'rect', x, y, w: Math.max(w, 2), h: Math.max(h, 2), rx: 2, style };
    case 'circle': {
      // A circle is an ellipse with one radius, so dragging any box gives a circle
      // that fits inside it rather than an oval the user did not ask for.
      const r = Math.max(Math.min(w, h) / 2, 1);
      return {
        id, t: 'ellipse',
        cx: roundMm(x + w / 2), cy: roundMm(y + h / 2), rx: roundMm(r), ry: roundMm(r),
        style,
      };
    }
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

/** Which corner of a shape's box is being pulled; the opposite one stays put. */
export type ShapeCorner = 'nw' | 'ne' | 'sw' | 'se';

/** Smallest box a shape may be dragged down to, so it cannot be lost or inverted. */
const MIN_SHAPE_MM = 2;

/**
 * Resize by dragging a corner.
 *
 * `dw`/`dh` are the POINTER's movement, as they are for an element: the corner says
 * what that means, and the corner diagonally opposite it is the anchor. Dragging the
 * north-west corner of a box therefore moves its top-left and leaves its bottom-right
 * exactly where it was, which is what every drawing program does and what one SE-only
 * handle could never express.
 *
 * A polygon is resized by scaling its point list inside the new box, so the canvas and
 * the emitted `\draw` stay the same numbers — the reason `polygons.ts` writes explicit
 * points rather than asking TikZ's shape library for a size it does not honour.
 */
export function resizeShape(
  el: TikzElement,
  shapeId: string,
  dw: Mm,
  dh: Mm,
  corner: ShapeCorner = 'se',
  /**
   * Width over height to hold, or `undefined` to let both move freely.
   *
   * Passed in rather than derived here, because it has to be the ratio the shape had
   * when the DRAG began: recomputing it from the current box on every pointermove feeds
   * rounding back in and the proportions walk away over a long drag.
   */
  ratio?: number,
): TikzElement {
  return mapShape(el, shapeId, (s) => {
    // An arrow or a two-point line is resized by dragging its endpoints, and a text
    // node is sized by its text — TikZ measures it, so there is no box to pull.
    if (s.t === 'arrow' || s.t === 'node') return s;
    if (s.t === 'path' && s.points.length < 3) return s;

    const from = shapeBounds(s);
    if (from === null || from.w <= 0 || from.h <= 0) return s;

    let { x, y, w, h } = from;
    if (corner.includes('e')) w += dw; else { x += dw; w -= dw; }
    if (corner.includes('s')) h += dh; else { y += dh; h -= dh; }
    if (w < MIN_SHAPE_MM) {
      if (corner.includes('w')) x = from.x + from.w - MIN_SHAPE_MM;
      w = MIN_SHAPE_MM;
    }
    if (h < MIN_SHAPE_MM) {
      if (corner.includes('n')) y = from.y + from.h - MIN_SHAPE_MM;
      h = MIN_SHAPE_MM;
    }

    // Width leads and height follows, then the anchored corner is re-derived from the
    // new size -- otherwise constraining a north-west drag stretches it from the wrong
    // corner and the shape crawls across the canvas.
    if (ratio !== undefined && ratio > 0) {
      h = Math.max(MIN_SHAPE_MM, w / ratio);
      w = h * ratio;
      if (corner.includes('w')) x = from.x + from.w - w;
      if (corner.includes('n')) y = from.y + from.h - h;
    }

    switch (s.t) {
      case 'rect':
        return { ...s, x: roundMm(x), y: roundMm(y), w: roundMm(w), h: roundMm(h) };
      case 'ellipse':
        return {
          ...s,
          cx: roundMm(x + w / 2), cy: roundMm(y + h / 2),
          rx: roundMm(w / 2), ry: roundMm(h / 2),
        };
      case 'path': {
        const sx = w / from.w;
        const sy = h / from.h;
        return {
          ...s,
          points: s.points.map(([px, py]) => [
            roundMm(x + (px - from.x) * sx),
            roundMm(y + (py - from.y) * sy),
          ] as [Mm, Mm]),
        };
      }
      default:
        return s;
    }
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
    // Only a named node can be referenced. A polygon is a bare \draw with no name, so
    // attaching to one would emit `(bpX.east)` for a node that does not exist and take
    // the whole compile down.
    if (target !== null) {
      const to = (el.shapes ?? []).find((c) => c.id === target.shapeId);
      if (to === undefined || !isAttachable(to)) {
        return { ...s, [which]: { kind: 'point', x: roundMm(fallback.x), y: roundMm(fallback.y) } } as TikzShape;
      }
    }
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

/**
 * A shape's own geometry options, as opposed to its style.
 *
 * `rect.rx`, `arrow.bend` and `node.shape` were all modelled, emitted and parsed with no
 * control anywhere able to set them. `null` clears a field rather than storing a zero,
 * so a rectangle with no rounding emits no `rounded corners` key at all and the round
 * trip stays a fixpoint.
 */
export interface ShapeOptionPatch {
  rx?: number | null;
  bend?: number | null;
  nodeShape?: 'none' | 'rect' | 'circle';
}

export function setShapeOption(
  el: TikzElement,
  shapeId: string,
  patch: ShapeOptionPatch,
): TikzElement {
  return mapShape(el, shapeId, (s) => {
    if (patch.rx !== undefined && s.t === 'rect') {
      const next = { ...s };
      if (patch.rx === null || patch.rx <= 0) delete next.rx;
      else next.rx = patch.rx;
      return next;
    }
    if (patch.bend !== undefined && s.t === 'arrow') {
      const next = { ...s };
      if (patch.bend === null || patch.bend === 0) delete next.bend;
      else next.bend = patch.bend;
      return next;
    }
    if (patch.nodeShape !== undefined && s.t === 'node') {
      return { ...s, shape: patch.nodeShape };
    }
    return s;
  });
}

export function setNodeContent(
  el: TikzElement,
  shapeId: string,
  content: Extract<TikzShape, { t: 'node' }>['content'],
): TikzElement {
  return mapShape(el, shapeId, (s) => (s.t === 'node' ? { ...s, content } : s));
}

/**
 * The text written INSIDE a rectangle or an ellipse.
 *
 * Empty REMOVES the key rather than storing `[]`, so an unlabelled shape emits exactly
 * what it emitted before labels existed -- no `text width`, no `align`, an empty node
 * body -- and every deck already saved still round-trips byte for byte.
 *
 * A polygon and an arrow have no node to put text in: a polygon is a bare `\draw ...
 * -- cycle`, which is also why an arrow cannot attach to one.
 */
export function setShapeLabel(
  el: TikzElement,
  shapeId: string,
  label: RichText,
): TikzElement {
  return mapShape(el, shapeId, (s) => {
    if (s.t !== 'rect' && s.t !== 'ellipse') return s;
    if (label.length === 0) {
      const { label: _drop, ...rest } = s;
      return rest;
    }
    return { ...s, label };
  });
}

/**
 * True when this shape can hold text at all.
 *
 * A type predicate, so the caller can then reach for `label` or `content` without
 * asking again — the two live in different places because a text NODE is text with a
 * box around it while a rectangle is a box that may have text in it.
 */
export function canHoldLabel(
  s: TikzShape,
): s is Extract<TikzShape, { t: 'rect' | 'ellipse' | 'node' }> {
  return s.t === 'rect' || s.t === 'ellipse' || s.t === 'node';
}
