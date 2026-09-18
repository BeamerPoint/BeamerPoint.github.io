import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame, newTextElement } from '../src/model/factory.js';
import { emitInline } from '../src/emit/inline.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import type { Deck, Element } from '../src/model/types.js';
import { expectRoundTrip } from './helpers/roundTrip.js';

/**
 * Citations and the reference list.
 *
 * The inline `\cite` span worked from the start. What did not: `\bibliography{...}` was
 * never written by anything — the preamble carried a `files: string[]` the parser always
 * set to `[]` and the emitter never read — and `BibliographyElement` had no emitter, so
 * one built by hand vanished from the output with an `emit.unimplemented` warning.
 */

function roundTrip(deck: Deck): { tex: string; round: ReturnType<typeof parseDeck> } {
  return expectRoundTrip(deck);
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

  it('round-trips several files and a style written inside the frame, as ONE element', () => {
    // This test used to build TWO elements, a style-only one and a files-only one --
    // which is exactly the shape the old parser produced from these two lines, and it
    // passed because both models emit the same bytes. The emitter settles which reading
    // is right: one element carrying a style writes exactly these two lines. (F-007's
    // sibling: the same one-command-at-a-time parsing that lost the size.)
    const base = newDeck({ title: 'T' });
    const deck: Deck = {
      ...base,
      nodes: [newFrame('R', [
        { id: 'bb', kind: 'bibliography', placement: { mode: 'flow' }, files: ['a', 'b'], style: 'alpha', sizeHint: 'small' },
      ])],
    };
    const { tex, round } = roundTrip(deck);
    expect(tex).toMatch(/\\small\n\s*\\bibliographystyle\{alpha\}\n\s*\\bibliography\{a,b\}/);
    const frame = round.deck.nodes.find((n) => n.kind === 'frame');
    const els = frame?.kind === 'frame' ? frame.children : [];
    expect(els).toHaveLength(1);
    expect(els[0]).toMatchObject({ kind: 'bibliography', files: ['a', 'b'], style: 'alpha', sizeHint: 'small' });
  });

  it('leaves a size command that is not followed by a reference list alone', () => {
    // All or nothing: `\small` before ordinary prose is the prose's business.
    const base = newDeck({ title: 'T' });
    const tex = emitDeck({ ...base, nodes: [newFrame('R', [])] }).tex
      .replace('\\end{frame}', '\\small Some words.\n\\end{frame}');
    const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });
    const frame = round.deck.nodes.find((n) => n.kind === 'frame');
    expect(frame?.kind === 'frame' ? frame.children.map((c) => c.kind) : []).toEqual(['text']);
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
