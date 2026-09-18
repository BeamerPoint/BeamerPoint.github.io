import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newChartElement, newDeck, newFrame } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import { derivePackages } from '../src/emit/derivePackages.js';
import {
  addChartColumn, removeChartColumn, replaceChartData, setChartCell,
} from '../src/model/chartOps.js';
import type { ChartElement, Deck } from '../src/model/types.js';
import { expectRoundTrip } from './helpers/roundTrip.js';

/**
 * pgfplots charts.
 *
 * `ChartElement` was typed from the start and nothing emitted or parsed it — it fell to
 * the `emit.unimplemented` arm and produced no LaTeX at all. The package derivation was
 * the one finished piece.
 */

function deckWith(el: ChartElement): Deck {
  const base = newDeck({ title: 'T' });
  return { ...base, nodes: [newFrame('S', [el])] };
}

function roundTrip(deck: Deck): { tex: string; round: ReturnType<typeof parseDeck> } {
  return expectRoundTrip(deck);
}

function chartOf(round: ReturnType<typeof parseDeck>): ChartElement {
  const frame = round.deck.nodes.find((n) => n.kind === 'frame');
  if (frame?.kind !== 'frame') throw new Error('expected a frame');
  const el = frame.children.find((c) => c.kind === 'chart');
  if (el?.kind !== 'chart') throw new Error('expected a chart');
  return el;
}

describe('emitting a chart', () => {
  it('writes an axis with the data inline, and reads it back', () => {
    const { tex, round } = roundTrip(deckWith(newChartElement()));
    expect(tex).toContain('\\begin{axis}[');
    expect(tex).toContain('\\addplot');
    expect(tex).toContain('\\addlegendentry{Sales}');

    const back = chartOf(round);
    expect(back.data.columns).toEqual(['Year', 'Sales', 'Costs']);
    expect(back.data.rows[0]).toEqual([2021, 3, 2]);
    expect(back.series.map((s) => s.yCol)).toEqual([1, 2]);
  });

  it('is no longer dropped by the emitter', () => {
    expect(emitDeck(deckWith(newChartElement())).warnings
      .filter((w) => w.code === 'emit.unimplemented')).toEqual([]);
  });

  it('derives pgfplots and its compat line', () => {
    const pgf = derivePackages(deckWith(newChartElement())).find((p) => p.name === 'pgfplots');
    expect(pgf?.setup).toEqual(['\\pgfplotsset{compat=1.18}']);
  });

  it('round-trips every chart type', () => {
    for (const chartType of ['line', 'bar', 'hbar', 'scatter'] as const) {
      const { tex, round } = roundTrip(deckWith({ ...newChartElement(), chartType }));
      if (chartType === 'bar') expect(tex).toContain('ybar');
      if (chartType === 'hbar') expect(tex).toContain('xbar');
      if (chartType === 'scatter') expect(tex).toContain('only marks');
      expect(chartOf(round).chartType, chartType).toBe(chartType);
    }
  });

  it('declares a text x column, without which pgfplots plots nothing', () => {
    const base = newChartElement();
    const el: ChartElement = {
      ...base,
      chartType: 'bar',
      data: { columns: ['Group', 'Count'], rows: [['alpha', 3], ['beta', 5]] },
      series: [{ id: 'a', xCol: 0, yCol: 1, label: 'Count' }],
    };
    const { tex, round } = roundTrip(deckWith(el));
    expect(tex).toContain('symbolic x coords={alpha,beta}');
    expect(tex).toContain('xtick=data');
    // Re-derived from the data on the way out, not stored.
    expect(chartOf(round).data.rows[0]).toEqual(['alpha', 3]);
  });

  it('keeps an axis option it does not model', () => {
    const el: ChartElement = { ...newChartElement(), extraAxisOptions: 'enlarge x limits=0.2' };
    const { tex, round } = roundTrip(deckWith(el));
    expect(tex).toContain('enlarge x limits=0.2');
    expect(chartOf(round).extraAxisOptions).toBe('enlarge x limits=0.2');
  });

  it('round-trips per-series styling', () => {
    const base = newChartElement();
    const el: ChartElement = {
      ...base,
      series: base.series.map((s, i) => (i === 1
        ? { ...s, dashed: true, marker: 'square*', color: { k: 'named' as const, name: 'orange' } }
        : s)),
    };
    const { tex, round } = roundTrip(deckWith(el));
    expect(tex).toContain('color=orange,dashed,mark=square*');
    expect(chartOf(round).series[1]).toMatchObject({ dashed: true, marker: 'square*' });
  });

  it('stays a drawing when the tikzpicture is not one axis', () => {
    // A chart recognizer that is too eager turns every diagram into a data grid.
    const tex = emitDeck(deckWith(newChartElement())).tex
      .replace('\\end{axis}', '\\end{axis}\n    \\draw (0,0) -- (1,1);');
    const round = parseDeck(tex, { newId: makeSeededIdFactory('x') });
    const frame = round.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected a frame');
    expect(frame.children[0]?.kind).not.toBe('chart');
  });
});

describe('editing the data', () => {
  it('remaps the series when a column is removed', () => {
    // Without the remap, deleting a middle column leaves every later series quietly
    // plotting its neighbour's numbers.
    const el = addChartColumn(newChartElement(), 'Profit');
    expect(el.series.map((s) => s.yCol)).toEqual([1, 2, 3]);

    const after = removeChartColumn(el, 1);
    expect(after.data.columns).toEqual(['Year', 'Costs', 'Profit']);
    // The series that plotted column 1 is gone; the others moved down with their data.
    expect(after.series.map((s) => s.yCol)).toEqual([1, 2]);
    expect(after.series.map((s) => s.label)).toEqual(['Costs', 'Profit']);
  });

  it('will not remove the last two columns', () => {
    const el: ChartElement = {
      ...newChartElement(),
      data: { columns: ['x', 'y'], rows: [[1, 2]] },
      series: [{ id: 'a', xCol: 0, yCol: 1 }],
    };
    expect(removeChartColumn(el, 1)).toBe(el);
  });

  it('reads pasted spreadsheet text, tabs or commas', () => {
    const tabbed = replaceChartData(newChartElement(), 'Q\tRevenue\nQ1\t10\nQ2\t12');
    expect(tabbed.data.columns).toEqual(['Q', 'Revenue']);
    expect(tabbed.data.rows).toEqual([['Q1', 10], ['Q2', 12]]);
    expect(tabbed.series.map((s) => s.label)).toEqual(['Revenue']);

    const csv = replaceChartData(newChartElement(), 'A,B\n1,2\n3,4');
    expect(csv.data.rows).toEqual([[1, 2], [3, 4]]);
  });

  it('ignores text with no rows rather than emptying the chart', () => {
    const el = newChartElement();
    expect(replaceChartData(el, 'just a header')).toBe(el);
  });

  it('round-trips an empty cell', () => {
    const el = setChartCell(newChartElement(), 1, 2, null);
    const { round } = roundTrip(deckWith(el));
    expect(chartOf(round).data.rows[1]?.[2]).toBeNull();
  });

  it('does not write a column no series plots — which is why removing a series must '
    + 'remove its column', () => {
    // Each `\addplot` names exactly two columns, so a column nothing plots never reaches
    // the file. Dropping a series while keeping its column would leave the numbers in the
    // in-memory deck and lose them at the next parse — a reload, an import, or a source
    // round trip. The UI therefore removes the column, and this is the reason why.
    const base = addChartColumn(newChartElement());
    const orphaned: ChartElement = { ...base, series: base.series.slice(0, 1) };
    const dropped = base.data.columns[orphaned.series[0]!.yCol + 1]!;

    const tex = emitDeck(deckWith(orphaned)).tex;
    expect(tex).not.toContain(dropped);

    // And the loss is real, not theoretical: it is gone after one round trip.
    const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });
    expect(chartOf(round).data.columns).not.toContain(dropped);
  });
});
