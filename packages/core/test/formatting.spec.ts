import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame, newTableElement, newTikzElement } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import { addShape, shapeFromDrag } from '../src/model/shapeOps.js';
import { derivePackages } from '../src/emit/derivePackages.js';
import { TIKZ_LIBRARIES, TIKZ_LIBRARIES_LEGACY } from '../src/emit/tikz.js';
import { DERIVED_SETUP_LINES } from '../src/emit/derivePackages.js';
import type { Deck, Element, TikzElement } from '../src/model/types.js';

/**
 * The formatting properties the UI gained: shape rotation and shadow, and table
 * shading. Each needs emit, parse and a derived package to agree, and each was verified
 * against the engine before being wired up — the notes below say what the engine said.
 */

function deckWith(el: Element): Deck {
  const base = newDeck({ title: 'T' });
  return { ...base, nodes: [newFrame('S', [el])] };
}

function roundTrip(deck: Deck): { tex: string; round: ReturnType<typeof parseDeck> } {
  const tex = emitDeck(deck).tex;
  const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });
  expect(emitDeck(round.deck).tex).toBe(tex);
  expect(round.guard.ok).toBe(true);
  expect(round.health.demoted).toBe(0);
  return { tex, round };
}

describe('shape rotation and shadow', () => {
  function rotatedShape(rotate?: number, shadow?: boolean): TikzElement {
    const base = newTikzElement();
    const rect = shapeFromDrag('rect', { x: 5, y: 5 }, { x: 40, y: 25 });
    const styled = {
      ...rect,
      style: {
        ...rect.style,
        ...(rotate === undefined ? {} : { rotate }),
        ...(shadow === undefined ? {} : { shadow }),
      },
    };
    return addShape(base, styled);
  }

  it('rotates about the shape, not about the picture origin', () => {
    // Measured: a plain `rotate=20` swings the shape away from where it was drawn,
    // because the key transforms the coordinate system rather than the shape. The
    // pivot here is the rect's own centre: (5+35/2, 5+20/2), y negated for TikZ.
    const { tex } = roundTrip(deckWith(rotatedShape(20)));
    expect(tex).toContain('rotate around={20:(22.5mm,-15mm)}');
    expect(tex).not.toContain('rotate=20');
  });

  it('declares the shadows library, without which nothing compiles', () => {
    // Measured: `drop shadow` without it is *I do not know the key
    // '/tikz/drop shadow'* and there is no PDF at all.
    const { tex } = roundTrip(deckWith(rotatedShape(undefined, true)));
    expect(tex).toContain('drop shadow');
    expect(TIKZ_LIBRARIES).toContain('shadows');
    const tikz = derivePackages(deckWith(rotatedShape(undefined, true)))
      .find((p) => p.name === 'tikz');
    expect(tikz?.setup).toEqual([TIKZ_LIBRARIES]);
  });

  it('still absorbs the libraries line as earlier versions wrote it', () => {
    // DERIVED_SETUP_LINES matches by exact string, so a deck saved before `shadows`
    // was added would keep its old line as a user chunk AND derive the new one beside
    // it, growing a duplicate preamble entry on every edit.
    expect(DERIVED_SETUP_LINES.has(TIKZ_LIBRARIES_LEGACY)).toBe(true);
    expect(TIKZ_LIBRARIES_LEGACY).not.toBe(TIKZ_LIBRARIES);
  });

  it('round-trips a rotated, shadowed shape', () => {
    const { round } = roundTrip(deckWith(rotatedShape(-35, true)));
    const frame = round.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected a frame');
    const el = frame.children[0];
    if (el?.kind !== 'tikz') throw new Error('expected a diagram');
    expect(el.shapes?.[0]?.style).toMatchObject({ rotate: -35, shadow: true });
  });
});

describe('table shading', () => {
  function shadedTable(): Element {
    const table = newTableElement(2, 2);
    return {
      ...table,
      rows: table.rows.map((r, i) => (i === 0
        ? { ...r, fill: { k: 'structure' as const, shade: 25 } }
        : {
            ...r,
            cells: r.cells.map((c, j) => (j === 1
              ? { ...c, fill: { k: 'rgb' as const, r: 0.95, g: 0.9, b: 0.6 } }
              : c)),
          })),
    };
  }

  it('emits row and cell colours and reads them back', () => {
    const { tex, round } = roundTrip(deckWith(shadedTable()));
    expect(tex).toContain('\\rowcolor{structure.fg!25}');
    // The rgb form carries its own [model]{spec}; wrapping it in braces again would
    // produce `\cellcolor{[rgb]{...}}`, which is not a colour at all.
    expect(tex).toContain('\\cellcolor[rgb]{0.95,0.9,0.6}');

    const frame = round.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected a frame');
    const el = frame.children[0];
    if (el?.kind !== 'table') throw new Error('expected a table');
    expect(el.rows[0]?.fill).toEqual({ k: 'structure', shade: 25 });
    expect(el.rows[1]?.cells[1]?.fill).toMatchObject({ k: 'rgb', r: 0.95 });
  });

  it('derives colortbl, without which the deck does not compile', () => {
    // Measured: `\rowcolor` with no colortbl is an undefined control sequence.
    const names = derivePackages(deckWith(shadedTable())).map((p) => p.name);
    expect(names).toContain('colortbl');
    // ...and not for a table with no shading at all.
    expect(derivePackages(deckWith(newTableElement(2, 2))).map((p) => p.name))
      .not.toContain('colortbl');
  });
});
