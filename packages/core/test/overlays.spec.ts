import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame, newListElement, newTextElement } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import type { Deck, Element, FrameNode, ListElement } from '../src/model/types.js';

/**
 * Overlays: `\pause`, and a spec on a bullet.
 *
 * Out of scope for v1 by agreement — preserved on import, never authored — and reopened
 * because they are the thing a Beamer talk most often wants. Measured against the
 * bundled engine first: a frame with two `\pause` compiles to three pages, and
 * `\item<1->`, `<2->`, `<3->` on three bullets also compiles to three.
 *
 * `\pause` is an ELEMENT, because that is what it is in the source — a marker standing
 * between two pieces of content, not a property one of them carries.
 */

function deckOf(...children: Element[]): Deck {
  const base = newDeck({ title: 'T' });
  return { ...base, nodes: [newFrame('S', children)] };
}

function round(tex: string) {
  return parseDeck(tex, { newId: makeSeededIdFactory('r') });
}

function kindsOf(tex: string): string[] {
  const frame = round(tex).deck.nodes.find((n): n is FrameNode => n.kind === 'frame');
  return (frame?.children ?? []).map((c) => c.kind);
}

const pause: Element = { id: 'p1', kind: 'pause', placement: { mode: 'flow' } };

describe('\\pause', () => {
  it('emits the one command, on its own line', () => {
    const tex = emitDeck(deckOf(newTextElement('One'), pause, newTextElement('Two'))).tex;
    expect(tex).toMatch(/One\s*\n\s*\\pause\s*\n\s*Two/);
  });

  it('round-trips as a pause, not as a raw island', () => {
    const tex = emitDeck(deckOf(newTextElement('One'), pause, newTextElement('Two'))).tex;
    const r = round(tex);
    expect(r.health.demoted).toBe(0);
    expect(r.guard.ok).toBe(true);
    expect(emitDeck(r.deck).tex).toBe(tex);
    expect(kindsOf(tex)).toEqual(['text', 'pause', 'text']);
  });

  it('keeps its place between the elements it separates', () => {
    const tex = emitDeck(deckOf(
      newTextElement('One'), pause, newTextElement('Two'), { ...pause, id: 'p2' },
      newTextElement('Three'),
    )).tex;
    expect(kindsOf(tex)).toEqual(['text', 'pause', 'text', 'pause', 'text']);
  });

  it('declines a \\pause that carries an overlay spec', () => {
    // `\pause<3>` is legal beamer and the model cannot say it, so re-emitting would
    // drop the spec. It stays raw instead.
    const tex = emitDeck(deckOf(newTextElement('One'), pause)).tex
      .replace('\\pause', '\\pause<3>');
    const r = round(tex);
    expect(kindsOf(tex)).toContain('raw');
    expect(emitDeck(r.deck).tex).toContain('\\pause<3>');
  });

  it('adds nothing to a deck that has none', () => {
    const tex = emitDeck(deckOf(newTextElement('One'))).tex;
    expect(tex).not.toContain('\\pause');
  });
});

describe('an overlay spec on a bullet', () => {
  function listWith(specs: (string | undefined)[]): ListElement {
    const list = newListElement(['A', 'B', 'C']);
    return {
      ...list,
      items: list.items.map((it, i) => (
        specs[i] === undefined ? it : { ...it, overlay: specs[i]! }
      )),
    };
  }

  it('writes the spec straight after \\item, with no space', () => {
    const tex = emitDeck(deckOf(listWith(['<1->', '<2->', '<3->']))).tex;
    expect(tex).toContain('\\item<1-> A');
    expect(tex).toContain('\\item<2-> B');
    expect(tex).toContain('\\item<3-> C');
  });

  it('reads the spec back onto the item, not into its text', () => {
    // The lexer sees `\item<2->` as the command plus the TEXT `<2-> B`, so without
    // peeling it the spec became part of the bullet and showed as literal characters.
    const tex = emitDeck(deckOf(listWith([undefined, '<2->', undefined]))).tex;
    const r = round(tex);
    const frame = r.deck.nodes.find((n): n is FrameNode => n.kind === 'frame');
    const list = frame!.children[0] as ListElement;

    expect(list.items[1]!.overlay).toBe('<2->');
    expect(list.items[1]!.content).toEqual([{ t: 'text', s: 'B' }]);
    expect(list.items[0]!.overlay).toBeUndefined();
    expect(r.health.demoted).toBe(0);
    expect(emitDeck(r.deck).tex).toBe(tex);
  });

  it('survives every spec shape beamer allows', () => {
    for (const spec of ['<1->', '<2>', '<1,3>', '<+->', '<2-4>', '<beamer:1->']) {
      const tex = emitDeck(deckOf(listWith([spec]))).tex;
      const r = round(tex);
      expect(r.health.demoted, spec).toBe(0);
      expect(emitDeck(r.deck).tex, spec).toBe(tex);
      const frame = r.deck.nodes.find((n): n is FrameNode => n.kind === 'frame');
      expect((frame!.children[0] as ListElement).items[0]!.overlay, spec).toBe(spec);
    }
  });

  it('leaves a bullet that merely starts with a less-than sign alone', () => {
    // `<` is ordinary text. Only a complete `<...>` at the very front is a spec.
    const list = newListElement(['3 < 4 is true']);
    const tex = emitDeck(deckOf(list)).tex;
    const r = round(tex);
    const frame = r.deck.nodes.find((n): n is FrameNode => n.kind === 'frame');
    expect((frame!.children[0] as ListElement).items[0]!.overlay).toBeUndefined();
    expect(emitDeck(r.deck).tex).toBe(tex);
  });
});
