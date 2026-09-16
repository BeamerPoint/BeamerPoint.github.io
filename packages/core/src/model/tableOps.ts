import type { CellMerge, TableColumn, TableElement } from './types.js';
import { newId } from './ids.js';

/**
 * Structural edits to a table.
 *
 * These live in `core` rather than in the store because they are document logic, not
 * UI logic: getting a rule or a merge wrong here changes the emitted LaTeX, and that
 * is exactly the kind of thing that needs a headless test.
 *
 * Every function is pure and returns a new table.
 */

/**
 * Keep merges pointing at the right cells after a row or column is inserted or
 * removed.
 *
 * A merge that would now run off the end of the table is dropped rather than
 * clamped: a silently-resized merge changes which cells are hidden, and hidden cells
 * are how table content gets lost.
 */
export function shiftMerges(
  merges: readonly CellMerge[],
  axis: 'row' | 'col',
  at: number,
  delta: 1 | -1,
  limit: number,
): CellMerge[] {
  const out: CellMerge[] = [];

  for (const m of merges) {
    const index = axis === 'row' ? m.row : m.col;

    if (delta === -1 && index === at) continue;          // its anchor went away
    const moved = index >= at ? index + delta : index;

    // Removing a column from inside a span shortens it; from outside, it does not.
    let colspan = m.colspan;
    if (axis === 'col' && delta === -1 && at > m.col && at < m.col + m.colspan) {
      colspan -= 1;
    }
    if (colspan < 2) continue;

    const next: CellMerge = axis === 'row'
      ? { ...m, row: moved, colspan }
      : { ...m, col: moved, colspan };

    if (axis === 'row' ? next.row < limit : next.col + next.colspan <= limit) out.push(next);
  }

  return out;
}

/** Insert an empty row after `afterIndex`. */
export function insertTableRow(t: TableElement, afterIndex: number): TableElement {
  const at = Math.min(Math.max(afterIndex + 1, 0), t.rows.length);
  const rows = [...t.rows];

  // The closing rule belongs under the LAST row. Inserting after a row that carries
  // it would otherwise leave the new row stranded below the bottom rule.
  const above = rows[at - 1];
  const inherited = above?.ruleBelow?.k === 'bottomrule' ? above.ruleBelow : undefined;
  if (inherited !== undefined && above !== undefined) {
    const { ruleBelow: _drop, ...rest } = above;
    rows[at - 1] = rest;
  }

  rows.splice(at, 0, {
    id: newId(),
    cells: t.columns.map(() => ({ id: newId(), content: [] })),
    ...(inherited !== undefined ? { ruleBelow: inherited } : {}),
  });

  return { ...t, rows, merges: shiftMerges(t.merges, 'row', at, 1, rows.length) };
}

/** Remove a row, keeping the closing rule under whichever row becomes last. */
export function removeTableRow(t: TableElement, index: number): TableElement {
  if (t.rows.length <= 1 || index < 0 || index >= t.rows.length) return t;

  const rows = t.rows.filter((_r, i) => i !== index);
  const closing = t.rows[index]?.ruleBelow;
  if (closing?.k === 'bottomrule' && rows.length > 0) {
    rows[rows.length - 1] = { ...rows[rows.length - 1]!, ruleBelow: closing };
  }

  return { ...t, rows, merges: shiftMerges(t.merges, 'row', index, -1, rows.length) };
}

/** Insert an empty column after `afterIndex`. */
export function insertTableColumn(t: TableElement, afterIndex: number): TableElement {
  const at = Math.min(Math.max(afterIndex + 1, 0), t.columns.length);
  const columns = [...t.columns];
  columns.splice(at, 0, { id: newId(), align: 'c' });

  return {
    ...t,
    columns,
    rows: t.rows.map((row) => {
      const cells = [...row.cells];
      cells.splice(at, 0, { id: newId(), content: [] });
      return { ...row, cells };
    }),
    merges: shiftMerges(t.merges, 'col', at, 1, columns.length),
  };
}

export function removeTableColumn(t: TableElement, index: number): TableElement {
  if (t.columns.length <= 1 || index < 0 || index >= t.columns.length) return t;

  const columns = t.columns.filter((_c, i) => i !== index);
  const cmidrule = (r: TableElement['rows'][number]): TableElement['rows'][number] => {
    // A cmidrule names column numbers, so removing a column moves its endpoints.
    if (r.ruleBelow?.k !== 'cmidrule') return r;
    const from = r.ruleBelow.from > index + 1 ? r.ruleBelow.from - 1 : r.ruleBelow.from;
    const to = r.ruleBelow.to >= index + 1 ? r.ruleBelow.to - 1 : r.ruleBelow.to;
    if (to < from) { const { ruleBelow: _drop, ...rest } = r; return rest; }
    return { ...r, ruleBelow: { ...r.ruleBelow, from, to } };
  };

  return {
    ...t,
    columns,
    rows: t.rows.map((row) => cmidrule({
      ...row,
      cells: row.cells.filter((_c, i) => i !== index),
    })),
    merges: shiftMerges(t.merges, 'col', index, -1, columns.length),
  };
}

export function setTableColumnAlign(
  t: TableElement,
  index: number,
  align: TableColumn['align'],
): TableElement {
  return {
    ...t,
    columns: t.columns.map((c, i) => {
      if (i !== index) return c;
      // A p column needs a width; every other kind must not carry one.
      if (align === 'p') return { ...c, align, width: c.width ?? { v: 25, u: 'mm' as const } };
      const { width: _drop, ...rest } = c;
      return { ...rest, align };
    }),
  };
}

/** Rewrite a table's rules to match one of the three presets the UI offers. */
export function applyTableStyle(
  t: TableElement,
  style: TableElement['style'],
): TableElement {
  const last = t.rows.length - 1;

  if (style === 'plain') {
    const { topRule: _drop, ...rest } = t;
    return { ...rest, style, rows: t.rows.map(({ ruleBelow: _r, ...row }) => row) };
  }

  if (style === 'hline') {
    return {
      ...t,
      style,
      topRule: { k: 'hline' },
      rows: t.rows.map((row) => ({ ...row, ruleBelow: { k: 'hline' as const } })),
    };
  }

  return {
    ...t,
    style,
    topRule: { k: 'toprule' },
    rows: t.rows.map((row, i) => {
      if (i === last) return { ...row, ruleBelow: { k: 'bottomrule' as const } };
      if (row.isHeader === true) return { ...row, ruleBelow: { k: 'midrule' as const } };
      const { ruleBelow: _drop, ...rest } = row;
      return rest;
    }),
  };
}

/**
 * Switch how the table is sized.
 *
 * X columns only exist inside `tabularx`; leaving one behind produces a `tabular`
 * that will not compile at all.
 */
export function setTableFit(t: TableElement, fit: TableElement['fit']): TableElement {
  const columns = fit === 'tabularx'
    ? t.columns
    : t.columns.map((c) => (c.align === 'X' ? { ...c, align: 'l' as const } : c));

  if (fit === 'natural') {
    const { fitWidth: _drop, ...rest } = t;
    return { ...rest, columns, fit };
  }
  return { ...t, columns, fit, fitWidth: t.fitWidth ?? { v: 1, u: 'linewidth' } };
}
