import type {
  AxisSpec, ChartElement, DataTable, SeriesSpec,
} from '../../model/types.js';
import type { Cell } from '../../model/chartOps.js';
import type { CstNode } from '../cst.js';
import { parseTikzColor, splitOptions } from './tikz.js';
import type { RecognizeCtx } from './elements.js';

/**
 * A pgfplots chart: a `tikzpicture` whose only content is one `axis`.
 *
 * Must be tried BEFORE `recognizeTikz`, or every chart is read back as a drawing canvas
 * full of raw TikZ and the data grid has nothing to edit.
 *
 * All-or-nothing, as every recognizer is. The two things it will not guess at: an axis
 * option it does not model (kept verbatim in `extraAxisOptions`, which is what that field
 * is for) and a set of series whose x columns disagree — the model allows a per-series
 * `xCol`, but one table cannot be rebuilt from plots that share no x, so that declines.
 */

const AXIS_KIND: Readonly<Record<string, ChartElement['chartType']>> = {
  ybar: 'bar',
  xbar: 'hbar',
};

interface Plot {
  options: string;
  columns: [string, string];
  rows: Array<[Cell, Cell]>;
  label?: string;
}

export function recognizeChart(node: CstNode, ctx: RecognizeCtx): ChartElement | null {
  if (node.n !== 'env' || node.name !== 'tikzpicture') return null;

  const body = ctx.src.slice(node.bodySpan.start, node.bodySpan.end);
  const axis = /\\begin\{axis\}(\[[\s\S]*?\])?\s*([\s\S]*?)\\end\{axis\}/.exec(body);
  if (axis === null) return null;

  // Anything outside the axis is a drawing, not a chart.
  if (body.slice(0, axis.index).trim() !== '') return null;
  if (body.slice(axis.index + axis[0].length).trim() !== '') return null;

  const plots = readPlots(axis[2] ?? '');
  if (plots === null || plots.length === 0) return null;

  const table = buildTable(plots);
  if (table === null) return null;

  const el: ChartElement = {
    id: ctx.newId(),
    kind: 'chart',
    placement: { mode: 'flow' },
    chartType: 'line',
    data: table.data,
    series: table.series.map((s, i) => withStyle(s, plots[i]!.options)),
    axis: { grid: 'none' },
    size: { w: { v: 90, u: 'mm' }, h: { v: 50, u: 'mm' } },
    src: node.span,
  };

  // A scatter is spelt on the plots (`only marks`), not on the axis.
  const scatter = plots.every((p) => /(^|,)\s*only marks\s*(,|$)/.test(p.options));
  const opts = axis[1] === undefined ? '' : axis[1].slice(1, -1);
  return applyAxisOptions({ ...el, chartType: scatter ? 'scatter' : 'line' }, opts);
}

/** `\addplot[opts] table[...] { header \\ rows \\ };` plus an optional legend entry. */
function readPlots(body: string): Plot[] | null {
  const out: Plot[] = [];
  const re = /\\addplot(\[[^\]]*\])?\s*table\[([^\]]*)\]\s*\{([\s\S]*?)\}\s*;/g;

  let m = re.exec(body);
  let consumed = 0;
  while (m !== null) {
    // Whatever sits between plots must be a legend entry and nothing else.
    const between = body.slice(consumed, m.index);
    if (!isOnlyLegend(between)) return null;

    const tableOpts = m[2] ?? '';
    // Only the form this emitter writes is understood; anything else stays raw.
    if (!tableOpts.includes('col sep=comma')) return null;

    const rows = (m[3] ?? '')
      .split('\\\\')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    if (rows.length < 1) return null;

    const header = rows[0]!.split(',').map((c) => c.trim());
    if (header.length !== 2) return null;

    out.push({
      options: (m[1] ?? '').replace(/^\[|\]$/g, ''),
      columns: [header[0]!, header[1]!],
      rows: rows.slice(1).map((line) => {
        const cells = line.split(',').map((c) => c.trim());
        return [toCell(cells[0]), toCell(cells[1])];
      }),
    });

    consumed = m.index + m[0].length;
    m = re.exec(body);
  }

  const tail = body.slice(consumed);
  if (!isOnlyLegend(tail)) return null;

  // Legend entries, in order, attach to the plots before them.
  const labels = [...body.matchAll(/\\addlegendentry\{([^}]*)\}/g)].map((x) => x[1] ?? '');
  labels.forEach((label, i) => { if (out[i] !== undefined) out[i]!.label = label; });

  return out;
}

function isOnlyLegend(text: string): boolean {
  return text.replace(/\\addlegendentry\{[^}]*\}/g, '').trim() === '';
}

function toCell(raw: string | undefined): Cell {
  if (raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}

/**
 * One table from several two-column plots.
 *
 * Column 0 is the shared x; each plot contributes one y column. Plots that disagree about
 * x are not a table, so they decline.
 */
function buildTable(plots: Plot[]): { data: DataTable; series: SeriesSpec[] } | null {
  const first = plots[0]!;
  const xName = first.columns[0];
  const xValues = first.rows.map((r) => r[0]);

  for (const p of plots) {
    if (p.columns[0] !== xName) return null;
    if (p.rows.length !== xValues.length) return null;
    if (p.rows.some((r, i) => String(r[0]) !== String(xValues[i]))) return null;
  }

  const columns = [xName, ...plots.map((p) => p.columns[1])];
  const rows: Cell[][] = xValues.map((x, i) => [x, ...plots.map((p) => p.rows[i]![1])]);

  return {
    data: { columns, rows },
    series: plots.map((p, i) => ({
      id: `s${i}`,
      xCol: 0,
      yCol: i + 1,
      ...(p.label !== undefined ? { label: p.label } : {}),
    })),
  };
}

function withStyle(s: SeriesSpec, options: string): SeriesSpec {
  const out = { ...s };
  for (const raw of options === '' ? [] : splitOptions(options)) {
    const opt = raw.trim();
    if (opt === 'dashed') { out.dashed = true; continue; }
    if (opt === 'only marks') continue;          // read from the chart type instead
    const eq = opt.indexOf('=');
    if (eq === -1) continue;
    const key = opt.slice(0, eq).trim();
    const value = opt.slice(eq + 1).trim();
    if (key === 'mark') out.marker = value;
    if (key === 'color') {
      const c = parseTikzColor(value);
      if (c !== null) out.color = c;
    }
  }
  return out;
}

/** Read the axis option list, keeping anything unmodelled verbatim. */
function applyAxisOptions(el: ChartElement, optionText: string): ChartElement | null {
  const axis: AxisSpec = { grid: 'none' };
  const extra: string[] = [];
  let chartType: ChartElement['chartType'] = el.chartType;
  let size = el.size;

  for (const raw of optionText.trim() === '' ? [] : splitOptions(optionText)) {
    const opt = raw.trim();
    if (opt === '') continue;

    if (AXIS_KIND[opt] !== undefined) { chartType = AXIS_KIND[opt]!; continue; }
    // Declared from the data, not stored: re-emitted from the x column's own values.
    if (opt === 'xtick=data' || opt.startsWith('symbolic x coords=')) continue;

    const eq = opt.indexOf('=');
    if (eq === -1) { extra.push(opt); continue; }

    const key = opt.slice(0, eq).trim();
    const value = opt.slice(eq + 1).trim();
    const braced = value.startsWith('{') && value.endsWith('}') ? value.slice(1, -1) : value;
    const len = /^(-?[\d.]+)(mm|cm|pt|in)$/.exec(value);

    switch (key) {
      case 'width':
        if (len === null) return null;
        size = { ...size, w: { v: Number(len[1]), u: len[2] as 'mm' } };
        continue;
      case 'height':
        if (len === null) return null;
        size = { ...size, h: { v: Number(len[1]), u: len[2] as 'mm' } };
        continue;
      case 'title': axis.title = braced; continue;
      case 'xlabel': axis.xLabel = braced; continue;
      case 'ylabel': axis.yLabel = braced; continue;
      case 'grid':
        if (value !== 'major' && value !== 'both' && value !== 'none') return null;
        axis.grid = value;
        continue;
      case 'legend pos': axis.legendPos = value; continue;
      case 'xmin': axis.xmin = Number(value); continue;
      case 'xmax': axis.xmax = Number(value); continue;
      case 'ymin': axis.ymin = Number(value); continue;
      case 'ymax': axis.ymax = Number(value); continue;
      case 'xmode':
        if (value !== 'log' && value !== 'normal') return null;
        axis.xmode = value;
        continue;
      case 'ymode':
        if (value !== 'log' && value !== 'normal') return null;
        axis.ymode = value;
        continue;
      default:
        extra.push(opt);
    }
  }

  return {
    ...el,
    chartType,
    size,
    axis,
    ...(extra.length > 0 ? { extraAxisOptions: extra.join(',') } : {}),
  };
}
