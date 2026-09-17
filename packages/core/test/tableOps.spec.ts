import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { newDeck, newFrame, newTableElement } from '../src/model/factory.js';
import {
  applyTableStyle,
  insertTableColumn,
  insertTableRow,
  removeTableColumn,
  removeTableRow,
  setTableColumnAlign,
  setTableFit,
} from '../src/model/tableOps.js';
import type { TableElement } from '../src/model/types.js';

/** The tabular the emitter produces for a table, for checking shape end to end. */
function tabularOf(table: TableElement): string {
  const deck = newDeck({ title: 'T' });
  deck.nodes = [newFrame('F', [table])];
  return emitDeck(deck).tex;
}

const rules = (t: TableElement): Array<string | undefined> =>
  [t.topRule?.k, ...t.rows.map((r) => r.ruleBelow?.k)];

describe('table structure operations', () => {
  it('keeps the bottom rule under the last row when a row is added', () => {
    // The obvious implementation appends after the last row, which carries the
    // bottom rule -- leaving the new row stranded below it in the output.
    const t = insertTableRow(newTableElement(3, 2), 2);

    expect(t.rows).toHaveLength(4);
    expect(rules(t)).toEqual(['toprule', 'midrule', undefined, undefined, 'bottomrule']);
    expect(tabularOf(t)).not.toMatch(/\\bottomrule\n\s*&/);
  });

  it('keeps the bottom rule under the last row when the last row is removed', () => {
    const t = removeTableRow(newTableElement(3, 2), 2);
    expect(t.rows).toHaveLength(2);
    expect(rules(t)).toEqual(['toprule', 'midrule', 'bottomrule']);
  });

  it('refuses to empty a table', () => {
    const one = newTableElement(1, 1);
    expect(removeTableRow(one, 0)).toBe(one);
    expect(removeTableColumn(one, 0)).toBe(one);
  });

  it('adds and removes columns across every row', () => {
    const t = insertTableColumn(newTableElement(3, 2), 0);
    expect(t.columns).toHaveLength(3);
    expect(t.rows.map((r) => r.cells.length)).toEqual([3, 3, 3]);

    const back = removeTableColumn(t, 1);
    expect(back.columns).toHaveLength(2);
    expect(back.rows.map((r) => r.cells.length)).toEqual([2, 2, 2]);
  });

  it('moves merges with the rows and columns they cover', () => {
    const base = newTableElement(3, 4);
    base.merges = [{ row: 1, col: 1, colspan: 3 }];

    // A row inserted above pushes the merge down.
    expect(insertTableRow(base, 0).merges).toEqual([
      { row: 2, col: 1, colspan: 3 },
    ]);

    // A column removed from inside the span shortens it.
    expect(removeTableColumn(base, 2).merges).toEqual([
      { row: 1, col: 1, colspan: 2 },
    ]);

    // Removing the anchor's own row drops the merge rather than leaving it dangling.
    expect(removeTableRow(base, 1).merges).toEqual([]);

    // A merge shortened to a single column is no longer a merge.
    const narrow = { ...base, merges: [{ row: 1, col: 1, colspan: 2 }] };
    expect(removeTableColumn(narrow, 2).merges).toEqual([]);
  });

  it('moves a cmidrule when a column it names is removed', () => {
    const t = newTableElement(2, 4);
    t.rows[0]!.ruleBelow = { k: 'cmidrule', from: 2, to: 4 };

    expect(removeTableColumn(t, 0).rows[0]!.ruleBelow).toEqual({
      k: 'cmidrule', from: 1, to: 3,
    });
  });

  it('rewrites the rules for each style preset', () => {
    const base = newTableElement(3, 2);

    expect(rules(applyTableStyle(base, 'hline')))
      .toEqual(['hline', 'hline', 'hline', 'hline']);
    expect(rules(applyTableStyle(base, 'plain')))
      .toEqual([undefined, undefined, undefined, undefined]);
    expect(rules(applyTableStyle(applyTableStyle(base, 'plain'), 'booktabs')))
      .toEqual(['toprule', 'midrule', undefined, 'bottomrule']);
  });

  it('drops X columns when leaving tabularx, because tabular cannot compile them', () => {
    const wide = setTableColumnAlign(setTableFit(newTableElement(2, 2), 'tabularx'), 1, 'X');
    expect(wide.columns[1]!.align).toBe('X');
    expect(wide.fitWidth).toEqual({ v: 1, u: 'linewidth' });

    const natural = setTableFit(wide, 'natural');
    expect(natural.columns[1]!.align).toBe('l');
    expect(natural.fitWidth).toBeUndefined();
  });

  it('gives a p column a width and takes it away again', () => {
    const p = setTableColumnAlign(newTableElement(2, 2), 0, 'p');
    expect(p.columns[0]!.width).toEqual({ v: 25, u: 'mm' });
    expect(tabularOf(p)).toContain('\\begin{tabular}{p{25mm}c}');

    const c = setTableColumnAlign(p, 0, 'c');
    expect(c.columns[0]!.width).toBeUndefined();
    expect(tabularOf(c)).toContain('\\begin{tabular}{cc}');
  });
});
