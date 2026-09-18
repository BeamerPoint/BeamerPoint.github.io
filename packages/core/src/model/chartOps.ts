/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import type { ChartElement, DataTable, SeriesSpec } from './types.js';
import { newId } from './ids.js';

/**
 * Operations on a chart's data table.
 *
 * Pure and in `core`, for the same reason `tableOps.ts` is: a `SeriesSpec` points at its
 * data by COLUMN INDEX, so inserting or removing a column moves every series that sits to
 * its right. Getting that wrong plots the wrong numbers, silently — it does not crash, it
 * lies — so the index fixing lives in one tested place rather than in the panel.
 */

/** A cell as the emitter will write it. */
export type Cell = number | string | null;

export function cellText(v: Cell): string {
  return v === null ? '' : String(v);
}

/** True when every value under this column parses as a number. */
export function isNumericColumn(data: DataTable, col: number): boolean {
  const values = data.rows
    .map((r) => r[col])
    .filter((v): v is number | string => v !== null && v !== undefined && v !== '');
  if (values.length === 0) return true;
  return values.every((v) => typeof v === 'number' || Number.isFinite(Number(v)));
}

/** The distinct x values, in order, for a symbolic (categorical) axis. */
export function symbolicCoords(data: DataTable, col: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of data.rows) {
    const v = cellText(row[col] ?? null);
    if (v === '' || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function setChartCell(el: ChartElement, row: number, col: number, value: Cell): ChartElement {
  return {
    ...el,
    data: {
      ...el.data,
      rows: el.data.rows.map((r, i) =>
        (i === row ? r.map((c, j) => (j === col ? value : c)) : r)),
    },
  };
}

export function addChartRow(el: ChartElement, after = el.data.rows.length - 1): ChartElement {
  const blank: Cell[] = el.data.columns.map(() => null);
  const rows = [...el.data.rows];
  rows.splice(Math.max(0, after + 1), 0, blank);
  return { ...el, data: { ...el.data, rows } };
}

export function removeChartRow(el: ChartElement, index: number): ChartElement {
  if (el.data.rows.length <= 1) return el;
  return {
    ...el,
    data: { ...el.data, rows: el.data.rows.filter((_r, i) => i !== index) },
  };
}

/**
 * Add a column, and shift every series that referred to a later one.
 *
 * A new column also becomes a new series, because a column nobody plots is invisible.
 */
export function addChartColumn(el: ChartElement, name?: string): ChartElement {
  const index = el.data.columns.length;
  const columns = [...el.data.columns, name ?? `Series ${index}`];
  const rows = el.data.rows.map((r) => [...r, null]);
  const series: SeriesSpec[] = [
    ...el.series,
    { id: newId(), xCol: el.series[0]?.xCol ?? 0, yCol: index, label: columns[index]! },
  ];
  return { ...el, data: { columns, rows }, series };
}

/**
 * Remove a column, remap the series that pointed past it, and drop the ones that pointed
 * AT it.
 *
 * The remap is the whole point: without it, deleting the second of four columns leaves
 * every later series plotting its neighbour's numbers.
 */
export function removeChartColumn(el: ChartElement, index: number): ChartElement {
  if (el.data.columns.length <= 2) return el;

  const columns = el.data.columns.filter((_c, i) => i !== index);
  const rows = el.data.rows.map((r) => r.filter((_c, i) => i !== index));
  const shift = (i: number): number => (i > index ? i - 1 : i);

  const series = el.series
    .filter((s) => s.xCol !== index && s.yCol !== index)
    .map((s) => ({ ...s, xCol: shift(s.xCol), yCol: shift(s.yCol) }));

  return { ...el, data: { columns, rows }, series };
}

export function renameChartColumn(el: ChartElement, index: number, name: string): ChartElement {
  const columns = el.data.columns.map((c, i) => (i === index ? name : c));
  // A series labelled after its column follows the rename; one the user named does not.
  const series = el.series.map((s) =>
    (s.yCol === index && s.label === el.data.columns[index] ? { ...s, label: name } : s));
  return { ...el, data: { ...el.data, columns }, series };
}

export function setChartSeries(
  el: ChartElement,
  seriesId: string,
  patch: Partial<Omit<SeriesSpec, 'id'>>,
): ChartElement {
  return {
    ...el,
    series: el.series.map((s) => {
      if (s.id !== seriesId) return s;
      const next = { ...s, ...patch };
      // `undefined` in a patch means "clear", not "leave alone".
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete (next as Record<string, unknown>)[k];
      }
      return next;
    }),
  };
}

/**
 * Replace the whole table from pasted or uploaded text.
 *
 * Splits on tabs or commas so a copy out of a spreadsheet lands correctly, and treats the
 * first row as the header. Series are rebuilt against the new columns: keeping the old
 * ones would point them at data that is no longer there.
 */
export function replaceChartData(el: ChartElement, text: string): ChartElement {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return el;

  const sep = lines[0]!.includes('\t') ? '\t' : ',';
  const split = (line: string): string[] => line.split(sep).map((c) => c.trim());

  const columns = split(lines[0]!).map((c, i) => (c === '' ? `Column ${i + 1}` : c));
  const rows: Cell[][] = lines.slice(1).map((line) => {
    const cells = split(line);
    return columns.map((_c, i) => {
      const v = cells[i];
      if (v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) && v.trim() !== '' ? n : v;
    });
  });

  const series: SeriesSpec[] = columns.slice(1).map((name, i) => ({
    id: newId(),
    xCol: 0,
    yCol: i + 1,
    label: name,
  }));

  return { ...el, data: { columns, rows }, series: series.length > 0 ? series : el.series };
}
