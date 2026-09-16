import { useCallback, useRef, useState } from 'react';
import {
  PX_PER_MM,
  ptToMm,
  richTextToPlain,
  shapeBounds,
  type Anchor,
  type Mm,
  type ShapeTool,
  type ThemeSpec,
  type TikzElement,
  type TikzShape,
  type TikzStyle,
} from '@beamerpoint/core';
import { colorToCss } from './shapeColors.js';
import { useCanvasGeometry } from './CanvasContext.js';

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
  onSelectShape(shapeId: string | null): void;
  onDrawShape(drag: ShapeDrag): void;
  onMoveShape(shapeId: string, dx: Mm, dy: Mm): void;
  onResizeShape(shapeId: string, dw: Mm, dh: Mm): void;
  onMoveEndpoint(
    shapeId: string,
    which: 'from' | 'to',
    point: { x: Mm; y: Mm },
    over: { shapeId: string; side: 'n' | 's' | 'e' | 'w' | 'center' } | null,
  ): void;
}

/**
 * TikZ default `inner sep` is 0.3333em, which at 11pt is about 1.29mm. A text node is
 * inset by it, so leaving it out puts every label a millimetre left of where the PDF
 * puts it. Measured, not assumed.
 */
const INNER_SEP_MM = ptToMm(11 / 3);

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
  const drag = useRef<
    | { k: 'move'; id: string; x: number; y: number }
    | { k: 'resize'; id: string; x: number; y: number }
    | { k: 'end'; id: string; which: 'from' | 'to' }
    | null
  >(null);

  const shapes = el.shapes ?? [];
  const { w, h } = el.canvasSize;

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
    if (draft !== null) { setDraft({ ...draft, to: mmAt(e) }); return; }

    const d = drag.current;
    if (d === null) return;
    const p = mmAt(e);

    if (d.k === 'end') {
      const over = hitTest(p, d.id);
      props.onMoveEndpoint(
        d.id, d.which, p,
        over === null ? null : { shapeId: over.id, side: nearestSide(over, p) },
      );
      return;
    }

    const dx = (e.clientX - d.x) / (PX_PER_MM * scale);
    const dy = (e.clientY - d.y) / (PX_PER_MM * scale);
    drag.current = { ...d, x: e.clientX, y: e.clientY };
    if (d.k === 'move') props.onMoveShape(d.id, dx, dy);
    else props.onResizeShape(d.id, dx, dy);
  };

  const onPointerUp = (e: React.PointerEvent): void => {
    if (draft !== null) {
      // A click with no movement is not a shape; it would create an invisible speck.
      const moved = Math.hypot(draft.to.x - draft.from.x, draft.to.y - draft.from.y) > 1;
      if (moved || draft.tool === 'text') props.onDrawShape(draft);
      setDraft(null);
    }
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const startDrag = (
    d: NonNullable<typeof drag.current>,
  ) => (e: React.PointerEvent): void => {
    if (locked) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = d;
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
        <marker
          id={`bp-arrow-${el.id}`}
          markerWidth="6" markerHeight="6" refX="5" refY="3"
          orient="auto" markerUnits="strokeWidth"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="context-stroke" />
        </marker>
      </defs>

      {shapes.map((s) => (
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
            startDrag({ k: 'move', id: s.id, x: e.clientX, y: e.clientY })(e);
          }}
        />
      ))}

      {selected !== undefined && (
        <SelectionHandles
          shape={selected}
          shapes={shapes}
          onResizeDown={startDrag({ k: 'resize', id: selected.id, x: 0, y: 0 })}
          onEndpointDown={(which) => startDrag({ k: 'end', id: selected.id, which })}
        />
      )}

      {draft !== null && <DraftShape drag={draft} />}
    </svg>
  );
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
          <text
            x={shape.x + INNER_SEP_MM}
            y={shape.y + INNER_SEP_MM + 3.1}
            fill={colorToCss(shape.style.textColor, theme, theme.foreground)}
            style={{ font: 'inherit', fontSize: 3.9 }}
          >
            {richTextToPlain(shape.content)}
          </text>
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

function SelectionHandles({
  shape, shapes, onResizeDown, onEndpointDown,
}: {
  shape: TikzShape;
  shapes: readonly TikzShape[];
  onResizeDown(e: React.PointerEvent): void;
  onEndpointDown(which: 'from' | 'to'): (e: React.PointerEvent) => void;
}): React.ReactElement {
  const R = 1.4;

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
      {shape.t !== 'node' && shape.t !== 'path' && (
        <circle cx={box.x + box.w} cy={box.y + box.h} r={R} onPointerDown={onResizeDown} />
      )}
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
