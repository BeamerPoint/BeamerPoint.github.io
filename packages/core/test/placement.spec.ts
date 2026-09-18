import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame, newTextElement, plain } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import { derivePackages } from '../src/emit/derivePackages.js';
import type { Deck, Element, Placement } from '../src/model/types.js';
import { expectRoundTrip } from './helpers/roundTrip.js';

/**
 * Free placement and rotation, through the round trip.
 *
 * `Placement.rotate` has been modelled and emitted as `\rotatebox` from the start with
 * no UI able to set it, so this path had never been exercised.
 */

function deckWithPlacement(rotate?: number): Deck {
  const el = {
    ...newTextElement('Free text'),
    placement: {
      mode: 'absolute' as const,
      x: 10, y: 20, w: 60,
      driver: 'textpos' as const,
      ...(rotate === undefined ? {} : { rotate }),
    },
  };
  const deck = newDeck({ title: 'T' });
  return { ...deck, nodes: [newFrame('Slide', [el])] };
}

describe('absolute placement', () => {
  it('emits and re-reads a rotation', () => {
    const tex = emitDeck(deckWithPlacement(15)).tex;
    expect(tex).toContain('\\rotatebox{15}');
    // Not decoration: `\rotatebox` typesets in LR mode, where a block environment
    // fails outright with *Missing \endgroup inserted* and produces no PDF at all.
    expect(tex).toContain('\\begin{minipage}{\\linewidth}');

    const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });
    const frame = round.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected a frame');
    expect(frame.children[0]?.placement).toMatchObject({ mode: 'absolute', rotate: 15 });
  });

  it('is a fixpoint with and without a rotation', () => {
    for (const rotate of [undefined, 15]) {
      const tex = emitDeck(deckWithPlacement(rotate)).tex;
      const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });
      expect(emitDeck(round.deck).tex, `rotate=${String(rotate)}`).toBe(tex);
      expect(round.guard.ok).toBe(true);
    }
  });

  it('derives packages in a stable order', () => {
    // A rotation needs graphicx and free placement needs textpos. The order they are
    // derived in must not depend on where they came from, or the second emit reorders
    // the preamble and `emit -> parse -> emit` stops being a fixpoint.
    const first = derivePackages(deckWithPlacement(15)).map((p) => p.name);
    const tex = emitDeck(deckWithPlacement(15)).tex;
    const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });
    expect(derivePackages(round.deck).map((p) => p.name)).toEqual(first);
  });
});

describe('an element with children, placed freely', () => {
  const ABS = {
    mode: 'absolute', x: 20, y: 30, w: 70, driver: 'textpos',
  } as const satisfies Placement;

  function deckWithBlock(rotate?: number): Deck {
    const block: Element = {
      id: 'b1', kind: 'block', variant: 'block',
      placement: rotate === undefined ? ABS : { ...ABS, rotate },
      title: plain('Block title'),
      children: [newTextElement('Block content.')],
    };
    const base = newDeck({ title: 'T' });
    return { ...base, nodes: [newFrame('S', [block])] };
  }

  it('survives the round trip instead of taking the frame down with it', () => {
    // The body of a textblock is re-lexed on its own, so spans inside it counted from
    // the fragment while the guard sliced them out of the whole document. A block's
    // child text compared itself against a piece of the PREAMBLE, mismatched, and the
    // whole frame was demoted to one raw block.
    for (const rotate of [undefined, 15]) {
      const tex = emitDeck(deckWithBlock(rotate)).tex;
      expectRoundTrip(deckWithBlock(rotate));
      const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });
      expect(round.guard.mismatches, `rotate=${String(rotate)}`).toEqual([]);
      expect(round.health.demoted).toBe(0);

      const frame = round.deck.nodes.find((n) => n.kind === 'frame');
      if (frame?.kind !== 'frame') throw new Error('expected a frame');
      expect(frame.children[0]?.kind).toBe('block');
      expect(emitDeck(round.deck).tex).toBe(tex);
    }
  });
});
