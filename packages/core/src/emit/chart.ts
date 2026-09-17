import type { ChartElement, SeriesSpec } from '../model/types.js';
import { cellText, isNumericColumn, symbolicCoords } from '../model/chartOps.js';
import { tikzColor } from './tikz.js';
import type { TexWriter } from './writer.js';

/**
 * A chart as a pgfplots `axis`.
 *
 * `ChartElement` was typed from the start and nothing emitted it — it fell through to the
 * `emit.unimplemented` arm and produced no LaTeX at all, the last of three modelled kinds
 * silently dropped that way. The package derivation was already done and already
 * round-trip-safe (`\pgfplotsset{compat=1.18}` is in `DERIVED_SETUP_LINES`).
 *
 * Every option list here is in a FIXED order. The round trip is a fixpoint only if
 * re-emitting produces the same bytes, exactly as for `styleOptions` in `tikz.ts`.
 *
 * Each series carries its own two columns rather than the whole table. Repeating the
 * entire table per `\addplot` is what pgfplots examples usually do, and it means the same
 * numbers appear three times in a three-series chart; two columns each keeps the source
 * readable and the parse unambiguous.
 */

/** `col sep=comma` so a column name or a label may contain spaces. Verified to compile. */
const TABLE_OPTIONS = 'col sep=comma,row sep=\\\\';

const AXIS_KIND: Readonly<Record<ChartElement['chartType'], string | null>> = {
  line: null,
  bar: 'ybar',
  hbar: 'xbar',
  scatter: null,
};

function num(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

export function axisOptions(el: ChartElement): string[] {
  const out: string[] = [];
  const kind = AXIS_KIND[el.chartType];
  if (kind !== null) out.push(kind);

  out.push(`width=${num(el.size.w.v)}${el.size.w.u}`);
  out.push(`height=${num(el.size.h.v)}${el.size.h.u}`);

  const a = el.axis;
  if (a.title !== undefined) out.push(`title={${a.title}}`);
  if (a.xLabel !== undefined) out.push(`xlabel={${a.xLabel}}`);
  if (a.yLabel !== undefined) out.push(`ylabel={${a.yLabel}}`);
  if (a.grid !== 'none') out.push(`grid=${a.grid}`);
  if (a.legendPos !== undefined) out.push(`legend pos=${a.legendPos}`);
  if (a.xmin !== undefined) out.push(`xmin=${num(a.xmin)}`);
  if (a.xmax !== undefined) out.push(`xmax=${num(a.xmax)}`);
  if (a.ymin !== undefined) out.push(`ymin=${num(a.ymin)}`);
  if (a.ymax !== undefined) out.push(`ymax=${num(a.ymax)}`);
  if (a.xmode === 'log') out.push('xmode=log');
  if (a.ymode === 'log') out.push('ymode=log');

  // A text x column has to be declared, or pgfplots reads the labels as numbers and
  // plots nothing. Verified against the engine with `x index` and a symbolic axis.
  const xCol = el.series[0]?.xCol ?? 0;
  if (!isNumericColumn(el.data, xCol)) {
    const coords = symbolicCoords(el.data, xCol);
    if (coords.length > 0) {
      out.push(`symbolic x coords={${coords.join(',')}}`);
      out.push('xtick=data');
    }
  }

  if (el.extraAxisOptions !== undefined && el.extraAxisOptions !== '') {
    out.push(el.extraAxisOptions);
  }
  return out;
}

export function seriesOptions(el: ChartElement, s: SeriesSpec): string[] {
  const out: string[] = [];
  if (s.color !== undefined) out.push(`color=${tikzColor(s.color)}`);
  if (s.dashed === true) out.push('dashed');
  if (s.marker !== undefined) out.push(`mark=${s.marker}`);
  // A scatter is a line plot with the line switched off, which is how pgfplots spells it.
  if (el.chartType === 'scatter') out.push('only marks');
  return out;
}

export function emitChart(w: TexWriter, el: ChartElement): void {
  w.line_('\\begin{tikzpicture}');
  w.indented(() => {
    w.line_(`\\begin{axis}[${axisOptions(el).join(',')}]`);
    w.indented(() => {
      for (const s of el.series) {
        const opts = seriesOptions(el, s);
        const list = opts.length === 0 ? '' : `[${opts.join(',')}]`;
        w.line_(`\\addplot${list} table[${TABLE_OPTIONS}] {`);
        w.raw(`${el.data.columns[s.xCol] ?? 'x'},${el.data.columns[s.yCol] ?? 'y'} \\\\\n`);
        for (const row of el.data.rows) {
          w.raw(`${cellText(row[s.xCol] ?? null)},${cellText(row[s.yCol] ?? null)} \\\\\n`);
        }
        w.line_('};');
        if (s.label !== undefined) w.line_(`\\addlegendentry{${s.label}}`);
      }
    });
    w.line_('\\end{axis}');
  });
  w.line_('\\end{tikzpicture}');
}
