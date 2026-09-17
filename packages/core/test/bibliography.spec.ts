import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame, newTextElement } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import { emitInline } from '../src/emit/inline.js';
import type { Deck, Element } from '../src/model/types.js';

/**
 * Citations and the reference list.
 *
 * The inline `\cite` span worked from the start. What did not: `\bibliography{...}` was
 * never written by anything — the preamble carried a `files: string[]` the parser always
 * set to `[]` and the emitter never read — and `BibliographyElement` had no emitter, so
 * one built by hand vanished from the output with an `emit.unimplemented` warning.
 */

function roundTrip(deck: Deck): { tex: string; round: ReturnType<typeof parseDeck> } {
  const tex = emitDeck(deck).tex;
  const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });
  expect(emitDeck(round.deck).tex).toBe(tex);
  expect(round.guard.ok).toBe(true);
  expect(round.health.demoted).toBe(0);
  return { tex, round };
}

function deckWithRefs(): Deck {
  const base = newDeck({ title: 'T' });
  const bib: Element = {
    id: 'b1',
    kind: 'bibliography',
    placement: { mode: 'flow' },
    files: ['refs'],
    sizeHint: 'footnotesize',
  };
  return {
    ...base,
    preamble: { ...base.preamble, bibliography: { style: 'plain', backend: 'bibtex' } },
    nodes: [
      newFrame('Body', [{
        ...newTextElement('As shown by '),
        content: [{ t: 'text', s: 'As shown by ' }, { t: 'cite', keys: ['knuth1984'] }],
      }]),
      { ...newFrame('References', [bib]), options: { allowframebreaks: true } },
    ],
  };
}

describe('the reference list', () => {
  it('writes the files line, without which BibTeX resolves nothing', () => {
    const { tex } = roundTrip(deckWithRefs());
    expect(tex).toContain('\\bibliographystyle{plain}');
    expect(tex).toContain('\\bibliography{refs}');
    expect(tex).toContain('\\begin{frame}[allowframebreaks]');
  });

  it('reads a bibliography element back instead of leaving it raw', () => {
    const { round } = roundTrip(deckWithRefs());
    const frame = round.deck.nodes.filter((n) => n.kind === 'frame')[1];
    if (frame?.kind !== 'frame') throw new Error('expected a frame');
    const el = frame.children.find((c) => c.kind === 'bibliography');
    expect(el?.kind === 'bibliography' && el.files).toEqual(['refs']);
  });

  it('is no longer dropped by the emitter', () => {
    expect(emitDeck(deckWithRefs()).warnings.filter((w) => w.code === 'emit.unimplemented'))
      .toEqual([]);
  });

  it('round-trips several files and a style written inside the frame', () => {
    const base = newDeck({ title: 'T' });
    const deck: Deck = {
      ...base,
      nodes: [newFrame('R', [
        { id: 'st', kind: 'bibliography', placement: { mode: 'flow' }, files: [], style: 'alpha' },
        { id: 'bb', kind: 'bibliography', placement: { mode: 'flow' }, files: ['a', 'b'] },
      ])],
    };
    const { tex } = roundTrip(deck);
    expect(tex).toContain('\\bibliographystyle{alpha}');
    expect(tex).toContain('\\bibliography{a,b}');
  });
});

describe('inline citations', () => {
  it('emits every form the model carries', () => {
    expect(emitInline([{ t: 'cite', keys: ['a', 'b'] }])).toBe('\\cite{a,b}');
    expect(emitInline([{ t: 'cite', keys: ['a'], post: 'p. 7' }])).toBe('\\cite[p. 7]{a}');
    expect(emitInline([{ t: 'cite', keys: ['a'], pre: 'see', post: 'p. 7' }]))
      .toBe('\\cite[see][p. 7]{a}');
  });

  it('survives the round trip inside a paragraph', () => {
    const { round } = roundTrip(deckWithRefs());
    const frame = round.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected a frame');
    const text = frame.children[0];
    expect(text?.kind === 'text' && text.content.some((n) => n.t === 'cite')).toBe(true);
  });
});
