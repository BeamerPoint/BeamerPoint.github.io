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

/** F-015: a transparent picture that also has a caption or any explicit alignment. */
function hasFadedCaptionedOrAlignedImage(spec: DeckSpec): boolean {
  return spec.frames.some((f) => f.els.some((e) => e.k === 'image' && e.opacity !== undefined
    && (e.caption !== undefined || e.align !== undefined)));
}

describe('the round-trip property', () => {
  it('holds for random decks built the way the editor builds them', () => {
    fc.assert(
      fc.property(deckSpec, (spec) => {
        fc.pre(!hasFadedCaptionedOrAlignedImage(spec));
        expectRoundTrip(buildDeck(spec, makeSeededIdFactory('g')));
      }),
      { numRuns: RUNS, verbose: 1 },
    );
  }, process.env.BP_FUZZ === '1' ? 30 * 60_000 : 30_000);
});

describe('counterexamples the property found, pinned', () => {
  // F-014, fixed. Found by the property after 541 runs, shrunk to two words. Measured in
  // the engine before the fix: the PDF set "FIRSTPARA SECONDPARA" on ONE baseline.
  it('keeps two text boxes on a slide as two paragraphs', () => {
    const deck = {
      ...newDeck({ title: 'T' }),
      nodes: [newFrame('F', [newTextElement('First'), newTextElement('Second')])],
    };
    expect(emitDeck(deck).tex).toMatch(/First\n\s*\n\s*Second/);
    expectRoundTrip(deck);
  });

  it('keeps them apart across a pause, which does not end a paragraph either', () => {
    // `One \pause Two` is one line on the second overlay.
    const deck = {
      ...newDeck({ title: 'T' }),
      nodes: [newFrame('F', [
        newTextElement('One'),
        { id: 'p', kind: 'pause' as const, placement: { mode: 'flow' as const } },
        newTextElement('Two'),
      ])],
    };
    expect(emitDeck(deck).tex).toMatch(/One\n\s*\\pause\n\s*\n\s*Two/);
    expectRoundTrip(deck);
  });

  it('adds no blank line where there is no second paragraph to separate', () => {
    // Just inside a block, or before a list, a blank line is noise for nothing.
    const tex = emitDeck({ ...newDeck({ title: 'T' }), nodes: [newFrame('F', [newTextElement('Only')])] }).tex;
    expect(tex).toMatch(/\\frametitle\{F\}\n\n\s*Only\n\\end\{frame\}/);
  });
});
