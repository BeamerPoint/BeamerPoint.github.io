import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { makeSeededIdFactory } from '../src/model/ids.js';
import { emitDeck } from '../src/emit/deck.js';
import { newDeck, newFrame, newTextElement } from '../src/model/factory.js';
import { buildDeck, deckSpec, type DeckSpec } from './helpers/arbitraries.js';
import { expectRoundTrip } from './helpers/roundTrip.js';

/**
 * The round-trip property, over decks nobody wrote by hand.
 *
 * Every other round-trip test checks an example somebody thought of. This one asks
 * fast-check for decks across the element kinds, with nesting, overlays, absolute
 * placement, inline styles and every special character, and requires the full
 * `expectRoundTrip` clause set of each: bytes over three cycles, the guard, the
 * whole-document fixpoint, and the census.
 *
 * `BP_FUZZ=1` runs a soak of thousands; the default stays small enough for `npm test`.
 * A counterexample prints as JSON: paste it into a regression test below.
 */

const RUNS = process.env.BP_FUZZ === '1' ? 3000 : 60;

/**
 * F-014, excluded so the property can keep looking past it. Two FLOW text elements in a
 * row are emitted with one newline between them, which LaTeX reads as a space: the PDF
 * sets them as one paragraph, and a reparse merges them into one element. Delete this
 * exclusion when F-014 is fixed -- the pinned regression below will already insist.
 */
function hasAdjacentFlowText(spec: DeckSpec): boolean {
  return spec.frames.some((f) => f.els.some((e, i) => {
    const next = f.els[i + 1];
    return e.k === 'text' && e.abs === undefined && next?.k === 'text' && next.abs === undefined;
  }));
}

describe('the round-trip property', () => {
  it('holds for random decks built the way the editor builds them', () => {
    fc.assert(
      fc.property(deckSpec, (spec) => {
        fc.pre(!hasAdjacentFlowText(spec));
        expectRoundTrip(buildDeck(spec, makeSeededIdFactory('g')));
      }),
      { numRuns: RUNS, verbose: 1 },
    );
  }, process.env.BP_FUZZ === '1' ? 30 * 60_000 : 30_000);
});

describe('counterexamples the property found, pinned', () => {
  // F-014 (tools/audit-2026-09.md). Found by the property after 541 runs, shrunk to two
  // words. Measured in the engine: the PDF sets "FIRSTPARA SECONDPARA" on ONE baseline.
  // Remove `.fails` when fixed.
  it.fails('keeps two text boxes on a slide as two paragraphs', () => {
    const deck = {
      ...newDeck({ title: 'T' }),
      nodes: [newFrame('F', [newTextElement('First'), newTextElement('Second')])],
    };
    expect(emitDeck(deck).tex).toMatch(/First\n\s*\n\s*Second/);
    expectRoundTrip(deck);
  });
});
