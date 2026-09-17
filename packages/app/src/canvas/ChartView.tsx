import {
  PX_PER_MM, isNumericColumn, symbolicCoords,
  type ChartElement, type SeriesSpec, type ThemeSpec,
} from '@beamerpoint/core';
import { colorToCss } from './shapeColors.js';

interface Props {
  el: ChartElement;
  theme: ThemeSpec;
}

/**
 * A chart on the canvas.
 *
 * An approximation, like the rest of the canvas: pgfplots chooses the tick marks, the
 * axis limits and the label placement, and the PDF is one click away. What this has to
 * get right is the SHAPE — which series is which colour, whether it rises or falls, and
 * roughly how much room the picture takes — so the slide can be laid out around it.
 *
 * Drawn in millimetres so the box matches the `width=`/`height=` the emitter writes, and
 * with `vector-effect: non-scaling-stroke` for the same reason the gridlines use it: the
 * page is CSS-scaled to about a third, and a hairline at that scale rasterises unevenly.
 */

/** Room for the axis labels, in the chart's own millimetres. */
const PAD = { left: 10, right: 3, top: 4, bottom: 8 };

/** pgfplots' default cycle, near enough for a preview. */
const CYCLE = ['#0000ff', '#ff0000', '#008000', '#a0522d', '#8a2be2'];

export function ChartView({ el, theme }: Props): React.ReactElement {
  const w = el.size.w.v;
  const h = el.size.h.v;
  const plot = {
    x: PAD.left,
    y: PAD.top,
    w: Math.max(10, w - PAD.left - PAD.right),
    h: Math.max(10, h - PAD.top - PAD.bottom),
  };

  const xCol = el.series[0]?.xCol ?? 0;
  const numericX = isNumericColumn(el.data, xCol);
  const categories = numericX ? [] : symbolicCoords(el.data, xCol);

  const points = el.series.map((s) => readSeries(el, s, xCol, numericX, categories));
  const flat = points.flat();
  const bounds = extent(flat, el);

  return (
    <svg
      className="bp-chart"
      width={w * PX_PER_MM}
      height={h * PX_PER_MM}
      viewBox={`0 0 ${w} ${h}`}
    >
      {el.axis.grid !== 'none' && (
        <g className="bp-chart-grid">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={`h${f}`}
              x1={plot.x} x2={plot.x + plot.w}
              y1={plot.y + plot.h * f} y2={plot.y + plot.h * f}
            />
          ))}
          {el.axis.grid === 'both' && [0.25, 0.5, 0.75].map((f) => (
            <line
              key={`v${f}`}
              x1={plot.x + plot.w * f} x2={plot.x + plot.w * f}
              y1={plot.y} y2={plot.y + plot.h}
            />
          ))}
        </g>
      )}

      <g className="bp-chart-axes" style={{ stroke: theme.foreground }}>
        <line x1={plot.x} y1={plot.y} x2={plot.x} y2={plot.y + plot.h} />
        <line x1={plot.x} y1={plot.y + plot.h} x2={plot.x + plot.w} y2={plot.y + plot.h} />
      </g>

      {el.series.map((s, i) => (
        <SeriesShape
          key={s.id}
          el={el}
          series={s}
          points={points[i] ?? []}
          index={i}
          plot={plot}
          bounds={bounds}
          count={el.series.length}
          theme={theme}
        />
      ))}

      <g className="bp-chart-text" style={{ fill: theme.foreground }}>
        {el.axis.title !== undefined && (
          <text x={w / 2} y={2.8} textAnchor="middle" fontSize={3}>{el.axis.title}</text>
        )}
        {el.axis.xLabel !== undefined && (
          <text x={plot.x + plot.w / 2} y={h - 1} textAnchor="middle" fontSize={2.6}>
            {el.axis.xLabel}
          </text>
        )}
        {el.axis.yLabel !== undefined && (
          <text
            x={2.6} y={plot.y + plot.h / 2} fontSize={2.6} textAnchor="middle"
            transform={`rotate(-90 2.6 ${plot.y + plot.h / 2})`}
          >
            {el.axis.yLabel}
          </text>
        )}
        <text x={plot.x - 1} y={plot.y + 1} textAnchor="end" fontSize={2.2} opacity={0.7}>
          {round(bounds.yMax)}
        </text>
        <text x={plot.x - 1} y={plot.y + plot.h} textAnchor="end" fontSize={2.2} opacity={0.7}>
          {round(bounds.yMin)}
        </text>
      </g>

      {el.series.some((s) => s.label !== undefined) && (
        <g className="bp-chart-legend">
          {el.series.map((s, i) => (
            <g key={s.id} transform={`translate(${plot.x + 2} ${plot.y + 3 + i * 3.4})`}>
              <rect width={2.6} height={1.6} y={-1.4} fill={colourOf(s, i, theme)} />
              <text x={3.6} fontSize={2.4} fill={theme.foreground}>{s.label}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

interface Plot { x: number; y: number; w: number; h: number }
interface Bounds { xMin: number; xMax: number; yMin: number; yMax: number }

function SeriesShape({
  el, series, points, index, plot, bounds, count, theme,
}: {
  el: ChartElement;
  series: SeriesSpec;
  points: Array<{ x: number; y: number }>;
  index: number;
  plot: Plot;
  bounds: Bounds;
  count: number;
  theme: ThemeSpec;
}): React.ReactElement | null {
  if (points.length === 0) return null;

  const colour = colourOf(series, index, theme);
  const sx = (x: number): number => plot.x
    + (bounds.xMax === bounds.xMin ? 0.5 : (x - bounds.xMin) / (bounds.xMax - bounds.xMin))
      * plot.w;
  const sy = (y: number): number => plot.y + plot.h
    - (bounds.yMax === bounds.yMin ? 0.5 : (y - bounds.yMin) / (bounds.yMax - bounds.yMin))
      * plot.h;

  if (el.chartType === 'bar' || el.chartType === 'hbar') {
    const slot = plot.w / Math.max(1, points.length) / Math.max(1, count);
    return (
      <g>
        {points.map((p, i) => {
          const left = plot.x + (i + 0.15) * (plot.w / points.length) + index * slot * 0.8;
          const top = Math.min(sy(p.y), sy(Math.max(0, bounds.yMin)));
          const height = Math.abs(sy(p.y) - sy(Math.max(0, bounds.yMin)));
          return (
            <rect
              key={i}
              x={left} y={top}
              width={Math.max(0.4, slot * 0.7)} height={Math.max(0.2, height)}
              fill={colour}
            />
          );
        })}
      </g>
    );
  }

  const marks = (
    <g>
      {points.map((p, i) => (
        <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={0.7} fill={colour} />
      ))}
    </g>
  );

  if (el.chartType === 'scatter') return marks;

  return (
    <g>
      <polyline
        className="bp-chart-line"
        points={points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}
        stroke={colour}
        strokeDasharray={series.dashed === true ? '1.4 1' : undefined}
      />
      {series.marker !== undefined && marks}
    </g>
  );
}

function colourOf(s: SeriesSpec, index: number, theme: ThemeSpec): string {
  return s.color !== undefined
    ? colorToCss(s.color, theme, CYCLE[index % CYCLE.length]!)
    : CYCLE[index % CYCLE.length]!;
}

/** A series as plain numbers. A categorical x becomes its position in the category list. */
function readSeries(
  el: ChartElement,
  s: SeriesSpec,
  xCol: number,
  numericX: boolean,
  categories: string[],
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];

  el.data.rows.forEach((row) => {
    const rawY = row[s.yCol];
    const y = Number(rawY);
    if (rawY === null || rawY === undefined || !Number.isFinite(y)) return;

    const rawX = row[xCol];
    const x = numericX
      ? Number(rawX)
      : categories.indexOf(String(rawX ?? ''));
    if (!Number.isFinite(x) || x < 0) return;

    out.push({ x, y });
  });

  return out;
}

function extent(points: Array<{ x: number; y: number }>, el: ChartElement): Bounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const a = el.axis;
  return {
    xMin: a.xmin ?? (xs.length > 0 ? Math.min(...xs) : 0),
    xMax: a.xmax ?? (xs.length > 0 ? Math.max(...xs) : 1),
    // Bars are read against zero, so a bar chart that does not start there misleads.
    yMin: a.ymin ?? (ys.length > 0 ? Math.min(0, ...ys) : 0),
    yMax: a.ymax ?? (ys.length > 0 ? Math.max(...ys) : 1),
  };
}

function round(v: number): string {
  return String(Math.round(v * 100) / 100);
}
