import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame, newTableElement, newTextElement, plain } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import { derivePackages } from '../src/emit/derivePackages.js';
import type { Deck, Element, TableElement } from '../src/model/types.js';

function deckWith(el: Element): Deck {
  const deck = newDeck({ title: 'T' });
  deck.nodes = [newFrame('Table', [el])];
  return deck;
}

function roundTrip(deck: Deck): { tex: string; round: ReturnType<typeof parseDeck> } {
  const tex = emitDeck(deck).tex;
  const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });
  expect(emitDeck(round.deck).tex).toBe(tex);
  return { tex, round };
}

/** The table on the first frame of a parsed deck, or undefined if it degraded. */
function firstTable(round: ReturnType<typeof parseDeck>): TableElement | undefined {
  for (const node of round.deck.nodes) {
    if (node.kind !== 'frame') continue;
    const found = node.children.find((c) => c.kind === 'table');
    if (found?.kind === 'table') return found;
  }
  return undefined;
}

describe('tables', () => {
  it('round-trips a default booktabs table without degrading', () => {
    const table = newTableElement(3, 3);
    table.rows[1]!.cells[0]!.content = plain('alpha');
    table.rows[1]!.cells[1]!.content = plain('1.5');

    const { tex, round } = roundTrip(deckWith(table));

    expect(tex).toContain('\\begin{tabular}{lcc}');
    expect(tex).toContain('\\toprule');
    expect(tex).toContain('\\midrule');
    expect(tex).toContain('\\bottomrule');
    expect(round.guard.ok).toBe(true);
    expect(round.health.demoted).toBe(0);

    const parsed = firstTable(round);
    expect(parsed).toBeDefined();
    expect(parsed!.columns.map((c) => c.align)).toEqual(['l', 'c', 'c']);
    expect(parsed!.rows).toHaveLength(3);
    expect(parsed!.topRule).toEqual({ k: 'toprule' });
    expect(parsed!.rows[0]!.ruleBelow).toEqual({ k: 'midrule' });
    expect(parsed!.rows[2]!.ruleBelow).toEqual({ k: 'bottomrule' });
  });

  it('derives booktabs from the rules present, not from the style field', () => {
    const table = newTableElement(2, 2);
    expect(derivePackages(deckWith(table)).map((p) => p.name)).toContain('booktabs');

    const plainRules = newTableElement(2, 2);
    delete plainRules.topRule;
    for (const row of plainRules.rows) delete row.ruleBelow;
    expect(derivePackages(deckWith(plainRules)).map((p) => p.name)).not.toContain('booktabs');
  });

  it('keeps cell text escaped and unescaped symmetrically', () => {
    const table = newTableElement(2, 2);
    table.rows[1]!.cells[0]!.content = plain('100% & rising');
    table.rows[1]!.cells[1]!.content = plain('a_b #3');

    const { tex, round } = roundTrip(deckWith(table));
    // The literal ampersand must be escaped, or it would become a column separator.
    expect(tex).toContain('100\\% \\& rising');

    const parsed = firstTable(round);
    expect(parsed).toBeDefined();
    expect(parsed!.rows[1]!.cells[0]!.content).toEqual(plain('100% & rising'));
    expect(parsed!.rows[1]!.cells[1]!.content).toEqual(plain('a_b #3'));
  });

  it('round-trips a multicolumn merge', () => {
    const table = newTableElement(2, 3);
    table.merges = [{ row: 0, col: 0, colspan: 3, rowspan: 1, align: 'c' }];
    table.rows[0]!.cells[0]!.content = plain('Spanning header');
    table.rows[0]!.cells[1]!.content = [];
    table.rows[0]!.cells[2]!.content = [];

    const { tex, round } = roundTrip(deckWith(table));
    expect(tex).toContain('\\multicolumn{3}{c}{Spanning header}');

    const parsed = firstTable(round);
    expect(parsed).toBeDefined();
    expect(parsed!.merges).toEqual([{ row: 0, col: 0, colspan: 3, rowspan: 1, align: 'c' }]);
    // The grid stays rectangular: one cell per column, covered cells empty.
    expect(parsed!.rows[0]!.cells).toHaveLength(3);
  });

  it('round-trips a captioned table float and a tabularx', () => {
    const float = newTableElement(2, 2);
    float.floatWrapper = 'table';
    float.caption = plain('Results');
    float.label = 'tab:results';

    const { tex, round } = roundTrip(deckWith(float));
    expect(tex).toContain('\\begin{table}');
    expect(tex).toContain('\\caption{Results}');
    expect(firstTable(round)?.caption).toEqual(plain('Results'));
    expect(firstTable(round)?.label).toBe('tab:results');

    const wide = newTableElement(2, 2);
    wide.fit = 'tabularx';
    wide.fitWidth = { v: 1, u: 'linewidth' };
    wide.columns[1]!.align = 'X';
    const wideRound = roundTrip(deckWith(wide));
    expect(wideRound.tex).toContain('\\begin{tabularx}{1\\linewidth}{lX}');
    expect(firstTable(wideRound.round)?.fit).toBe('tabularx');

    const shrunk = newTableElement(2, 2);
    shrunk.fit = 'resizebox';
    shrunk.fitWidth = { v: 0.9, u: 'linewidth' };
    const shrunkRound = roundTrip(deckWith(shrunk));
    expect(shrunkRound.tex).toContain('\\resizebox{0.9\\linewidth}{!}{%');
    expect(firstTable(shrunkRound.round)?.fit).toBe('resizebox');
  });

  it('reads a hand-written tabular with hlines and vertical rules', () => {
    const src = [
      '\\begin{tabular}{|l|c|}',
      '\\hline',
      'Name & Score \\\\',
      '\\hline',
      'Ada & 10 \\\\',
      '\\hline',
      '\\end{tabular}',
    ].join('\n');

    const deck = newDeck({ title: 'T' });
    deck.nodes = [newFrame('Hand written', [
      { id: 'r1', kind: 'raw', placement: { mode: 'flow' }, tex: src, reason: 'user-forced' },
    ])];
    const round = parseDeck(emitDeck(deck).tex, { newId: makeSeededIdFactory('r') });

    const parsed = firstTable(round);
    expect(parsed).toBeDefined();
    expect(parsed!.style).toBe('hline');
    expect(parsed!.columns[0]!.leftRule).toBe('single');
    expect(parsed!.columns[1]!.leftRule).toBe('single');
    expect(parsed!.rows.map((r) => r.cells.length)).toEqual([2, 2]);
  });

  it('gives a table its own paragraph so it does not share a line with text', () => {
    // A tabular is an inline box. Without a blank line, LaTeX sets it beside the
    // paragraph above -- measured 58mm to the right -- while the canvas draws it
    // below. This test exists because that divergence is invisible in the model.
    const deck = newDeck({ title: 'T' });
    deck.nodes = [newFrame('Mixed', [
      newTextElement('Before the table.'),
      newTableElement(2, 2),
      newTextElement('After the table.'),
    ])];

    const { tex, round } = roundTrip(deck);
    expect(tex).toMatch(/Before the table\.\n\n\s*\\begin\{tabular\}/);
    expect(tex).toMatch(/\\end\{tabular\}\n\n\s*After the table\./);
    expect(round.guard.ok).toBe(true);
    expect(round.health.demoted).toBe(0);
  });

  it('declines anything it cannot model, keeping the bytes verbatim', () => {
    const cases = [
      // A column prefix that changes every cell in the column.
      '\\begin{tabular}{>{\\bfseries}lc}\nA & B \\\\\n\\end{tabular}',
      // An inter-column spacer.
      '\\begin{tabular}{l@{ }c}\nA & B \\\\\n\\end{tabular}',
      // A row with the wrong number of cells.
      '\\begin{tabular}{lc}\nA & B & C \\\\\n\\end{tabular}',
      // Extra vertical space on a row break.
      '\\begin{tabular}{lc}\nA & B \\\\[2pt]\nC & D \\\\\n\\end{tabular}',
      // Two rules where the model has one slot.
      '\\begin{tabular}{lc}\n\\hline\n\\hline\nA & B \\\\\n\\end{tabular}',
    ];

    for (const src of cases) {
      const deck = newDeck({ title: 'T' });
      deck.nodes = [newFrame('Odd', [
        { id: 'r1', kind: 'raw', placement: { mode: 'flow' }, tex: src, reason: 'user-forced' },
      ])];
      const tex = emitDeck(deck).tex;
      const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });

      expect(firstTable(round), `should have declined: ${src}`).toBeUndefined();
      // Declining must not lose anything: the bytes survive and re-emit exactly.
      expect(emitDeck(round.deck).tex).toBe(tex);
    }
  });
});
