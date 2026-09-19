/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PX_PER_MM,
  ptToMm,
  richTextToPlain,
  canHoldLabel,
  shapeBounds,
  type Anchor,
  type Mm,
  type RichText,
  type ShapeCorner,
  type ShapeTool,
  type ThemeSpec,
  type TikzElement,
  type TikzShape,
  type TikzStyle,
} from '@beamerpoint/core';
import { colorToCss } from './shapeColors.js';
import { useCanvasGeometry } from './CanvasContext.js';
import { startPointerDrag } from './pointerDrag.js';

export interface ShapeDrag {
  tool: ShapeTool;
  from: { x: Mm; y: Mm };
  to: { x: Mm; y: Mm };
}

interface Props {
  el: TikzElement;
  theme: ThemeSpec;
  locked: boolean;
  /** The active drawing tool, or null when the pointer selects instead of draws. */
  tool: ShapeTool | null;
  selectedShapeId: string | null;
  /** Draw the diagram's canvas outline, which is otherwise invisible. */
  showBounds: boolean;
  onSelectShape(shapeId: string | null): void;
  onDrawShape(drag: ShapeDrag): void;
  onMoveShape(shapeId: string, dx: Mm, dy: Mm): void;
  onResizeShape(shapeId: string, dw: Mm, dh: Mm, corner: ShapeCorner, shift: boolean): void;
  onEditLabel(shapeId: string, text: string): void;
  onMoveEndpoint(
    shapeId: string,
    which: 'from' | 'to',
    point: { x: Mm; y: Mm },
    over: { shapeId: string; side: 'n' | 's' | 'e' | 'w' | 'center' } | null,
  ): void;
  /** Bracket a pointer drag, so the whole gesture is one undo entry. */
  onDragStart(): void;
  onDragEnd(): void;
}

/**
 * TikZ default `inner sep` is 0.3333em, which at 11pt is about 1.29mm. A text node is
 * inset by it, so leaving it out puts every label a millimetre left of where the PDF
 * puts it. Measured, not assumed.
 */
const INNER_SEP_MM = ptToMm(11 / 3);

/** Two presses this close together on one shape open its label. */
const DOUBLE_CLICK_MS = 450;

/** Rough text metrics, only so a label's box can be hit-tested and anchored. */
function nodeBox(s: Extract<TikzShape, { t: 'node' }>): { w: Mm; h: Mm } {
  const text = richTextToPlain(s.content);
  const pad = s.shape === 'none' ? 0 : INNER_SEP_MM * 2;
  return { w: text.length * 1.9 + pad + INNER_SEP_MM * 2, h: 5 + pad };
}

/** Where an arrow attaches on a shape's outline. */
function anchorOf(shape: TikzShape, side: 'n' | 's' | 'e' | 'w' | 'center'): { x: Mm; y: Mm } {
  if (shape.t === 'ellipse') {
    switch (side) {
      case 'n': return { x: shape.cx, y: shape.cy - shape.ry };
      case 's': return { x: shape.cx, y: shape.cy + shape.ry };
      case 'e': return { x: shape.cx + shape.rx, y: shape.cy };
      case 'w': return { x: shape.cx - shape.rx, y: shape.cy };
      default: return { x: shape.cx, y: shape.cy };
    }
  }

  const box = shape.t === 'node'
    ? { x: shape.x, y: shape.y, ...nodeBox(shape) }
    : shapeBounds(shape);
  if (box === null) return { x: 0, y: 0 };

  switch (side) {
    case 'n': return { x: box.x + box.w / 2, y: box.y };
    case 's': return { x: box.x + box.w / 2, y: box.y + box.h };
    case 'e': return { x: box.x + box.w, y: box.y + box.h / 2 };
    case 'w': return { x: box.x, y: box.y + box.h / 2 };
    default: return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  }
}

function resolveAnchor(a: Anchor, shapes: readonly TikzShape[]): { x: Mm; y: Mm } {
  if (a.kind === 'point') return { x: a.x, y: a.y };
  const target = shapes.find((s) => s.id === a.shapeId);
  return target === undefined ? { x: 0, y: 0 } : anchorOf(target, a.side);
}

/** A cardinal spline through the points, approximating TikZ's `plot[smooth]`. */
function smoothPath(points: ReadonlyArray<readonly [Mm, Mm]>, closed: boolean): string {
  if (points.length < 2) return '';
  const p = points.map(([x, y]) => ({ x, y }));
  const at = (i: number): { x: Mm; y: Mm } => {
    if (closed) return p[(i + p.length) % p.length]!;
    return p[Math.min(p.length - 1, Math.max(0, i))]!;
  };

  let d = `M ${p[0]!.x} ${p[0]!.y}`;
  const last = closed ? p.length : p.length - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return closed ? `${d} Z` : d;
}

interface StrokeProps {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  opacity?: number;
}

function strokeProps(style: TikzStyle, theme: ThemeSpec): StrokeProps {
  const width = style.lineWidth === undefined ? 0.4 : style.lineWidth.v;
  return {
    stroke: colorToCss(style.draw, theme, 'none'),
    strokeWidth: width,
    ...(style.dash === 'dashed' ? { strokeDasharray: `${width * 6} ${width * 4}` } : {}),
    ...(style.dash === 'dotted' ? { strokeDasharray: `${width} ${width * 3}` } : {}),
    ...(style.opacity !== undefined ? { opacity: style.opacity } : {}),
  };
}

/**
 * A TikZ picture on the canvas.
 *
 * Drawn as an SVG whose viewBox is the canvas in millimetres, so the model's numbers
 * are the SVG's numbers and there is no coordinate conversion to get wrong.
 */
export function TikzView(props: Props): React.ReactElement {
  const { el, theme, locked, tool, selectedShapeId } = props;
  const { scale } = useCanvasGeometry();
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<ShapeDrag | null>(null);
  /** The shape whose label is being typed into, if any. */
  const [editing, setEditing] = useState<string | null>(null);
  /** The last pointer-down, for spotting a double-click ourselves. */
  const lastDown = useRef<{ id: string; at: number }>({ id: '', at: 0 });

  const shapes = el.shapes ?? [];
  const { w, h } = el.canvasSize;

  /** True when this press is the second of a double-click on the same shape. */
  const isSecondClick = (id: string): boolean => {
    const now = Date.now();
    const again = lastDown.current.id === id && now - lastDown.current.at < DOUBLE_CLICK_MS;
    lastDown.current = { id, at: now };
    return again;
  };

  /** Pointer position in canvas millimetres. */
  const mmAt = useCallback((e: React.PointerEvent): { x: Mm; y: Mm } => {
    const box = svgRef.current?.getBoundingClientRect();
    if (box === undefined) return { x: 0, y: 0 };
    return {
      x: ((e.clientX - box.left) / (PX_PER_MM * scale)),
      y: ((e.clientY - box.top) / (PX_PER_MM * scale)),
    };
  }, [scale]);

  /** The shape under a point, ignoring the one being dragged. */
  const hitTest = (p: { x: Mm; y: Mm }, exceptId: string): TikzShape | null => {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i]!;
      if (s.id === exceptId || s.t === 'arrow' || s.t === 'path') continue;
      const box = s.t === 'node' ? { x: s.x, y: s.y, ...nodeBox(s) } : shapeBounds(s);
      if (box === null) continue;
      if (p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h) return s;
    }
    return null;
  };

  /** Which side of a shape a point is nearest, for snapping an arrow to it. */
  const nearestSide = (s: TikzShape, p: { x: Mm; y: Mm }): 'n' | 's' | 'e' | 'w' => {
    const c = anchorOf(s, 'center');
    return Math.abs(p.x - c.x) > Math.abs(p.y - c.y)
      ? (p.x > c.x ? 'e' : 'w')
      : (p.y > c.y ? 's' : 'n');
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    if (locked) return;
    e.stopPropagation();
    const p = mmAt(e);

    if (tool !== null) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDraft({ tool, from: p, to: p });
      return;
    }
    props.onSelectShape(null);
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    if (draft !== null) setDraft({ ...draft, to: mmAt(e) });
  };

  const onPointerUp = (e: React.PointerEvent): void => {
    if (draft !== null) {
      // A click with no movement is not a shape; it would create an invisible speck.
      const moved = Math.hypot(draft.to.x - draft.from.x, draft.to.y - draft.from.y) > 1;
      if (moved || draft.tool === 'text') props.onDrawShape(draft);
      setDraft(null);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  /** Pointer millimetres per screen pixel. */
  const perPx = 1 / (PX_PER_MM * scale);

  /**
   * Drag an existing shape.
   *
   * On `window`, not on the handle: moving or resizing a shape re-renders it, and the
   * handle the gesture started on is a different node afterwards. The origin is taken
   * HERE, at pointer-down — `onResizeDown` used to be built during render with
   * `{ x: 0, y: 0 }`, so the first move of a resize measured from the screen's corner
   * and asked for about 160mm of extra width in a single frame.
   */
  const beginShapeDrag = (
    e: React.PointerEvent,
    onMove: (dxMm: Mm, dyMm: Mm, shift: boolean) => void,
  ): void => {
    if (locked) return;
    props.onDragStart();
    startPointerDrag(e, {
      // Shift is read per MOVE, so it can be pressed or released mid-drag.
      onMove: (dx, dy, mods) => onMove(dx * perPx, dy * perPx, mods.shift),
      onEnd: props.onDragEnd,
    });
  };

  /**
   * Drag an arrow's endpoint, which needs a position rather than a delta.
   *
   * The position is seeded from the pointer and advanced by each move, so it never has
   * to re-measure the SVG mid-drag — the picture can resize underneath it.
   */
  const beginEndpointDrag = (id: string, which: 'from' | 'to') =>
    (e: React.PointerEvent): void => {
      if (locked) return;
      const at = mmAt(e);
      props.onDragStart();
      startPointerDrag(e, {
        onMove: (dx, dy) => {
          at.x += dx * perPx;
          at.y += dy * perPx;
          const over = hitTest(at, id);
          props.onMoveEndpoint(
            id, which, { x: at.x, y: at.y },
            over === null ? null : { shapeId: over.id, side: nearestSide(over, at) },
          );
        },
        onEnd: props.onDragEnd,
      });
    };

  const selected = shapes.find((s) => s.id === selectedShapeId);

  return (
    <svg
      ref={svgRef}
      className={`bp-tikz${tool === null ? '' : ' is-drawing'}`}
      width={w * PX_PER_MM}
      height={h * PX_PER_MM}
      viewBox={`0 0 ${w} ${h}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        {/*
          * TikZ's `drop shadow` is a soft offset copy of the shape. A Gaussian blur is
          * the closest SVG gets; the canvas says it approximates and this is one of the
          * places it does.
          */}
        <filter id={`bp-shadow-${el.id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0.7" dy="0.7" stdDeviation="0.5" floodOpacity="0.4" />
        </filter>
        <marker
          id={`bp-arrow-${el.id}`}
          markerWidth="6" markerHeight="6" refX="5" refY="3"
          orient="auto" markerUnits="strokeWidth"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="context-stroke" />
        </marker>
      </defs>

      {shapes.map((s) => {
        const view = (
          <ShapeView
            key={s.id}
            shape={s}
            shapes={shapes}
            theme={theme}
            arrowMarker={`bp-arrow-${el.id}`}
            onPointerDown={(e) => {
              if (locked || tool !== null) return;
              e.stopPropagation();
              props.onSelectShape(s.id);
              // Double-click opens the label, the way every drawing program does --
              // counted from the POINTER events rather than the browser's `dblclick`,
              // which never arrives: starting a drag calls `preventDefault()` on
              // pointerdown, and that suppresses the compatibility mouse events.
              if (isSecondClick(s.id) && canHoldLabel(s)) {
                // Prevented for the same reason a drag prevents it: an unprevented
                // pointerdown also produces a mousedown, which here would re-select the
                // diagram over the top of the shape and blur the editor as it opened.
                e.preventDefault();
                setEditing(s.id);
                return;
              }
              beginShapeDrag(e, (dx, dy) => props.onMoveShape(s.id, dx, dy));
            }}
          />
        );

        const b = shapeBounds(s);
        const spin = s.style.rotate !== undefined && s.style.rotate !== 0 && b !== null;
        if (!spin && s.style.shadow !== true) return view;

        return (
          <g
            key={s.id}
            // TikZ turns anticlockwise and SVG turns clockwise, so the sign flips here.
            // The pivot is the shape's centre, matching the `rotate around` we emit.
            {...(spin && b !== null
              ? { transform: `rotate(${-s.style.rotate!} ${b.x + b.w / 2} ${b.y + b.h / 2})` }
              : {})}
            {...(s.style.shadow === true ? { filter: `url(#bp-shadow-${el.id})` } : {})}
          >
            {view}
          </g>
        );
      })}

      {/*
        * The diagram's own canvas, which is what the shapes are positioned inside and
        * what the picture reserves on the slide. Invisible until the element is
        * selected, at which point not seeing it makes the diagram impossible to size.
        */}
      {props.showBounds && (
        <rect
          className="bp-tikz-bounds"
          x={0} y={0} width={w} height={h}
        />
      )}

      {selected !== undefined && (
        <SelectionHandles
          shape={selected}
          shapes={shapes}
          scale={scale}
          onResizeDown={(corner) => (e) =>
            beginShapeDrag(e, (dx, dy, shift) =>
              props.onResizeShape(selected.id, dx, dy, corner, shift))}
          onEndpointDown={(which) => beginEndpointDrag(selected.id, which)}
        />
      )}

      {draft !== null && <DraftShape drag={draft} />}

      {/*
        * Labels are drawn LAST, so they sit above every shape rather than behind one
        * that happens to come after them in z-order.
        */}
      {shapes.map((s) => (
        <ShapeLabel
          key={`label-${s.id}`}
          shape={s}
          theme={theme}
          scale={scale}
          editing={editing === s.id}
          onCommit={(text) => {
            setEditing(null);
            props.onEditLabel(s.id, text);
          }}
          onCancel={() => setEditing(null)}
        />
      ))}
    </svg>
  );
}

/**
 * The text inside a shape.
 *
 * A `foreignObject`, not an SVG `<text>`, because SVG text does not wrap and a label has
 * to wrap at exactly the width the emitter gives TikZ — otherwise the canvas shows one
 * long line where the PDF shows three. The same element becomes the editor when it is
 * double-clicked, so what you type is laid out exactly where it will be.
 *
 * Inert unless it is being edited — on the `foreignObject` and on the div inside it,
 * because the wrapper takes the pointer on its own. It covers the shape, and a layer
 * over the drawing that accepts the pointer swallows the drag that moves the shape
 * underneath it; measured, a labelled rectangle could not be dragged at all.
 */
function ShapeLabel({
  shape, theme, scale, editing, onCommit, onCancel,
}: {
  shape: TikzShape;
  theme: ThemeSpec;
  scale: number;
  editing: boolean;
  onCommit(text: string): void;
  onCancel(): void;
}): React.ReactElement | null {
  const ref = useRef<HTMLDivElement>(null);
  const box = labelBox(shape);

  useEffect(() => {
    if (!editing) return;
    const node = ref.current;
    if (node === null) return;
    node.focus();
    // Select what is there, so typing replaces a placeholder rather than appending.
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  if (box === null) return null;
  const text = richTextToPlain(labelOf(shape));
  if (text === '' && !editing) return null;

  return (
    <foreignObject
      x={box.x} y={box.y} width={box.w} height={box.h}
      // On the foreignObject as WELL as on the div inside it. The wrapper takes the
      // pointer on its own, so a labelled shape stopped being draggable even with an
      // inert child -- the same trap as a full-bleed layer over the slide.
      style={{ pointerEvents: editing ? 'auto' : 'none' }}
    >
      <div
        ref={ref}
        className={`bp-shape-label${editing ? ' is-editing' : ''}`}
        contentEditable={editing}
        suppressContentEditableWarning
        style={{
          color: colorToCss(shape.style.textColor, theme, theme.foreground),
          // The SVG is in millimetres, so these are millimetres too. 3.9 is 11pt.
          fontSize: 3.9,
          // Only while editing: see above.
          pointerEvents: editing ? 'auto' : 'none',
          outlineWidth: 1 / (PX_PER_MM * Math.max(scale, 0.01)),
        }}
        onBlur={(e) => { if (editing) onCommit(e.currentTarget.innerText); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          // Enter commits; Shift+Enter would need a line break in the model, and a
          // label is one run of text.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
          e.stopPropagation();
        }}
      >
        {text}
      </div>
    </foreignObject>
  );
}

/** The rich text a shape is showing, whichever kind of shape it is. */
function labelOf(s: TikzShape): RichText {
  if (s.t === 'rect' || s.t === 'ellipse') return s.label ?? [];
  if (s.t === 'node') return s.content;
  return [];
}

/**
 * Where the label sits, in canvas millimetres.
 *
 * The same box the emitter hands TikZ: the full width for a rectangle, and the widest
 * rectangle that fits INSIDE an ellipse (rx * sqrt(2)) for one, because the shape
 * library sizes an ellipse to contain its text box rather than to fill it.
 */
function labelBox(s: TikzShape): { x: Mm; y: Mm; w: Mm; h: Mm } | null {
  if (s.t === 'rect') return { x: s.x, y: s.y, w: s.w, h: s.h };
  if (s.t === 'ellipse') {
    const w = s.rx * Math.SQRT2;
    const h = s.ry * Math.SQRT2;
    return { x: s.cx - w / 2, y: s.cy - h / 2, w, h };
  }
  if (s.t === 'node') {
    const b = nodeBox(s);
    return { x: s.x, y: s.y, w: b.w, h: b.h };
  }
  return null;
}

function ShapeView({
  shape, shapes, theme, arrowMarker, onPointerDown,
}: {
  shape: TikzShape;
  shapes: readonly TikzShape[];
  theme: ThemeSpec;
  arrowMarker: string;
  onPointerDown(e: React.PointerEvent): void;
}): React.ReactElement | null {
  const stroke = strokeProps(shape.style, theme);
  const fill = colorToCss(shape.style.fill, theme, 'none');

  switch (shape.t) {
    case 'rect':
      return (
        <rect
          x={shape.x} y={shape.y} width={shape.w} height={shape.h}
          rx={shape.rx ?? 0}
          fill={fill}
          {...stroke}
          onPointerDown={onPointerDown}
          style={{ pointerEvents: 'all' }}
        />
      );

    case 'ellipse':
      return (
        <ellipse
          cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry}
          fill={fill}
          {...stroke}
          onPointerDown={onPointerDown}
          style={{ pointerEvents: 'all' }}
        />
      );

    case 'path': {
      const d = shape.smooth
        ? smoothPath(shape.points, shape.closed)
        : `M ${shape.points.map(([x, y]) => `${x} ${y}`).join(' L ')}${shape.closed ? ' Z' : ''}`;
      return (
        <path
          d={d}
          fill={fill}
          {...stroke}
          strokeLinejoin="round"
          onPointerDown={onPointerDown}
          style={{ pointerEvents: 'stroke' }}
        />
      );
    }

    case 'arrow': {
      const a = resolveAnchor(shape.from, shapes);
      const b = resolveAnchor(shape.to, shapes);
      const d = shape.bend === undefined || shape.bend === 0
        ? `M ${a.x} ${a.y} L ${b.x} ${b.y}`
        : bentPath(a, b, shape.bend);
      return (
        <path
          d={d}
          fill="none"
          {...strokeProps(
            { ...shape.style, draw: shape.style.draw ?? { k: 'named', name: 'black' } },
            theme,
          )}
          {...(shape.head === 'none' ? {} : { markerEnd: `url(#${arrowMarker})` })}
          onPointerDown={onPointerDown}
          style={{ pointerEvents: 'stroke' }}
        />
      );
    }

    case 'node': {
      const box = nodeBox(shape);
      return (
        <g onPointerDown={onPointerDown} style={{ pointerEvents: 'all' }}>
          {shape.shape !== 'none' && (
            shape.shape === 'circle'
              ? (
                <ellipse
                  cx={shape.x + box.w / 2} cy={shape.y + box.h / 2}
                  rx={box.w / 2} ry={box.h / 2}
                  fill={colorToCss(shape.style.fill, theme, 'none')}
                  {...strokeProps(shape.style, theme)}
                />
              )
              : (
                <rect
                  x={shape.x} y={shape.y} width={box.w} height={box.h}
                  fill={colorToCss(shape.style.fill, theme, 'none')}
                  {...strokeProps(shape.style, theme)}
                />
              )
          )}
          {/* The words are drawn by ShapeLabel, like every other shape's. This used to draw
              them a second time as SVG <text>, offset from the first, so every text node --
              and every SmartArt label, which is one -- appeared doubled. */}
        </g>
      );
    }
  }
}

/** A quadratic that bows by `bend` degrees, matching TikZ's `to[bend left]` closely. */
function bentPath(a: { x: Mm; y: Mm }, b: { x: Mm; y: Mm }, bend: number): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const k = Math.tan((bend * Math.PI) / 180);
  return `M ${a.x} ${a.y} Q ${mx + (dy * k) / 2} ${my - (dx * k) / 2}, ${b.x} ${b.y}`;
}

/** The four corners of a shape's box, and where each one sits on it. */
const SHAPE_CORNERS: readonly { corner: ShapeCorner; fx: number; fy: number }[] = [
  { corner: 'nw', fx: 0, fy: 0 },
  { corner: 'ne', fx: 1, fy: 0 },
  { corner: 'sw', fx: 0, fy: 1 },
  { corner: 'se', fx: 1, fy: 1 },
];

function SelectionHandles({
  shape, shapes, scale, onResizeDown, onEndpointDown,
}: {
  shape: TikzShape;
  shapes: readonly TikzShape[];
  scale: number;
  onResizeDown(corner: ShapeCorner): (e: React.PointerEvent) => void;
  onEndpointDown(which: 'from' | 'to'): (e: React.PointerEvent) => void;
}): React.ReactElement {
  /*
   * The handle radius is in canvas MILLIMETRES, and the canvas is scaled twice over --
   * PX_PER_MM design pixels per millimetre, then the stage's own scale. The fixed 1.4mm
   * this used to be measured under three real pixels across, so a shape's one handle
   * could not be hit. Six screen pixels of radius, whatever the zoom.
   */
  const R = 6 / (PX_PER_MM * Math.max(scale, 0.01));

  if (shape.t === 'arrow' || (shape.t === 'path' && shape.points.length === 2)) {
    const a = shape.t === 'arrow'
      ? resolveAnchor(shape.from, shapes)
      : { x: shape.points[0]![0], y: shape.points[0]![1] };
    const b = shape.t === 'arrow'
      ? resolveAnchor(shape.to, shapes)
      : { x: shape.points[1]![0], y: shape.points[1]![1] };
    return (
      <g className="bp-tikz-handles">
        <circle cx={a.x} cy={a.y} r={R} onPointerDown={onEndpointDown('from')} />
        <circle cx={b.x} cy={b.y} r={R} onPointerDown={onEndpointDown('to')} />
      </g>
    );
  }

  const box = shape.t === 'node'
    ? { x: shape.x, y: shape.y, ...nodeBox(shape) }
    : shapeBounds(shape);
  if (box === null) return <g />;

  return (
    <g className="bp-tikz-handles">
      <rect
        x={box.x} y={box.y} width={box.w} height={box.h}
        className="bp-tikz-outline"
      />
      {/*
        * Four corners, each anchored at the one opposite. A text node is sized by TikZ
        * from its own text, so it has no box to pull; a two-point line is resized by
        * its endpoints above.
        */}
      {shape.t !== 'node' && box.w > 0 && box.h > 0 && SHAPE_CORNERS.map(({ corner, fx, fy }) => (
        <circle
          key={corner}
          cx={box.x + box.w * fx}
          cy={box.y + box.h * fy}
          r={R}
          onPointerDown={onResizeDown(corner)}
        />
      ))}
    </g>
  );
}

function DraftShape({ drag }: { drag: ShapeDrag }): React.ReactElement {
  const x = Math.min(drag.from.x, drag.to.x);
  const y = Math.min(drag.from.y, drag.to.y);
  const w = Math.abs(drag.to.x - drag.from.x);
  const h = Math.abs(drag.to.y - drag.from.y);

  if (drag.tool === 'line' || drag.tool === 'arrow') {
    return (
      <line
        className="bp-tikz-draft"
        x1={drag.from.x} y1={drag.from.y} x2={drag.to.x} y2={drag.to.y}
      />
    );
  }
  if (drag.tool === 'ellipse') {
    return (
      <ellipse className="bp-tikz-draft" cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} />
    );
  }
  return <rect className="bp-tikz-draft" x={x} y={y} width={w} height={h} rx={drag.tool === 'rounded' ? 2 : 0} />;
}
