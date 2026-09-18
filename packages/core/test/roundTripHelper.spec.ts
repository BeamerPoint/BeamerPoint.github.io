import { describe, expect, it } from 'vitest';
import { newDeck, newFrame, newListElement, newTextElement } from '../src/model/factory.js';
import type { Deck, Element } from '../src/model/types.js';
import { expectRoundTrip, kindCensus } from './helpers/roundTrip.js';

/**
 * The assertion under test is the assertion every other round-trip test relies on, so it
 * has to be shown to FAIL on the failures it exists to catch -- the ones the old
 * byte-fixpoint + `guard.ok` pair let through.
 */

function deckOf(...children: Element[]): Deck {
  return { ...newDeck({ title: 'T' }), nodes: [newFrame('F', children)] };
}

const raw = (tex: string): Element => ({ id: 'raw1', kind: 'raw', placement: { mode: 'flow' }, tex, reason: 'unrecognised' });

describe('expectRoundTrip', () => {
  it('passes a fully modelled deck', () => {
    expectRoundTrip(deckOf(newTextElement('Hello'), newListElement(['a', 'b'])));
  });

  it('passes a deck that contains raw on purpose, and keeps it raw', () => {
    expectRoundTrip(deckOf(raw('\\begin{unknownenv}\\somethingUnmodelled{x}\\end{unknownenv}')));
  });

  it('FAILS when two elements come back as one', () => {
    // A text element followed by a bare control word re-parses as ONE text element: the
    // command is folded into the paragraph as a `sym`. `guard.ok`, `demoted === 0` and
    // `rawRatio === 0` all hold. Here the bytes happen to shift as well, so the fixpoint
    // clause fires first -- the census is the backstop for a collapse that does not.
    const deck = deckOf(newTextElement('Hello'), raw('\\weird{}'));
    expect(() => expectRoundTrip(deck)).toThrow();
  });

  it('FAILS on the census alone when bytes and health are all clean', () => {
    // The old assertions' blind spot, isolated: identical bytes, a clean guard, and a deck
    // whose parsed structure is simply different. Simulated by checking the census of a
    // deck against a different one, which is what a decline-to-raw produces.
    const modelled = deckOf(newTextElement('Hello'));
    const declined = deckOf(raw('Hello'));
    expect(kindCensus(declined)).not.toEqual(kindCensus(modelled));
  });

  it('counts nested elements and document nodes in the census', () => {
    const deck = deckOf(newTextElement('x'));
    expect(kindCensus(deck)).toEqual(['node:frame', 'text']);
  });
});
