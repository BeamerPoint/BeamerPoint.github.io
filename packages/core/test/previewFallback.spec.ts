/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { applyPreviewFallbacks } from '../src/emit/previewFallback.js';
import { newDeck, newFrame, newTextElement, plain } from '../src/model/factory.js';
import type { CodeElement, Deck, Element } from '../src/model/types.js';
import { expectRoundTrip } from './helpers/roundTrip.js';

/**
 * Previewing a minted block with listings (F-001).
 *
 * minted produces no PDF at all in the in-browser engine. The preview swaps it for
 * listings; the model, the source panel and the exported file keep minted.
 */

const P = { mode: 'flow' as const };

const minted = (patch: Partial<CodeElement> = {}): CodeElement => ({
  id: 'c1', kind: 'code', placement: P, backend: 'minted', language: 'python',
  code: 'print(1)', options: {}, ...patch,
});

const deckOf = (...children: Element[]): Deck =>
  ({ ...newDeck({ title: 'T' }), nodes: [{ ...newFrame('F', children), id: 'f1' }] });

function codeOf(deck: Deck): CodeElement {
  const f = deck.nodes.find((n) => n.kind === 'frame');
  const found = f?.kind === 'frame' ? f.children.find((c) => c.kind === 'code') : undefined;
  if (found?.kind !== 'code') throw new Error('no code element');
  return found;
}

describe('applyPreviewFallbacks', () => {
  it('swaps minted for listings, mapping the Pygments name to the listings one', () => {
    const { deck, notes } = applyPreviewFallbacks(deckOf(minted()));
    expect(codeOf(deck)).toMatchObject({ backend: 'listings', language: 'Python', id: 'c1' });
    expect(notes).toHaveLength(1);
    expect(emitDeck(deck).tex).toContain('\\begin{lstlisting}[language=Python]');
  });

  it('maps the Pygments short names people actually write', () => {
    for (const [pyg, lst] of [['js', 'JavaScript'], ['cpp', 'C++'], ['sh', 'sh'], ['rs', 'Rust'], ['yml', 'YAML']] as const) {
      expect(codeOf(applyPreviewFallbacks(deckOf(minted({ language: pyg }))).deck).language, pyg).toBe(lst);
    }
  });

  it('drops a language listings cannot load, because an unknown one is fatal', () => {
    // Measured: `language=Nonesuch` produces no PDF; no language at all compiles.
    const { deck, notes } = applyPreviewFallbacks(deckOf(minted({ language: 'brainfuck' })));
    expect(codeOf(deck).language).toBe('');
    expect(emitDeck(deck).tex).toContain('\\begin{lstlisting}\n');
    expect(notes[0]).toContain('no highlighting');
  });

  it('keeps line numbers and drops minted-only options, which listings would reject', () => {
    const { deck, notes } = applyPreviewFallbacks(deckOf(minted({ options: { numbers: 'left', linenos: '', bgcolor: 'gray' } })));
    expect(codeOf(deck).options).toEqual({ numbers: 'left' });
    expect(notes[0]).toContain('linenos, bgcolor');
  });

  it('keeps the caption and the frame', () => {
    const { deck } = applyPreviewFallbacks(deckOf(minted({ caption: plain('Cap'), frameStyle: 'single' })));
    expect(emitDeck(deck).tex).toMatch(/\\begin\{lstlisting\}\[language=Python,caption=\{Cap\},frame=single\]/);
  });

  it('reaches a minted block inside a block or a column', () => {
    const inBlock: Element = { id: 'b1', kind: 'block', placement: P, variant: 'block', title: plain('B'), children: [minted()] };
    const { deck } = applyPreviewFallbacks(deckOf(inBlock));
    expect(emitDeck(deck).tex).not.toContain('minted');
  });

  it('still marks the frame fragile', () => {
    const { deck } = applyPreviewFallbacks(deckOf(minted()));
    expect(emitDeck(deck).tex).toContain('\\begin{frame}[fragile]');
  });

  it('returns the very same deck when there is nothing to swap', () => {
    const d = deckOf(newTextElement('x'), minted({ backend: 'listings', language: 'Python' }));
    const { deck, notes } = applyPreviewFallbacks(d);
    expect(deck).toBe(d);
    expect(notes).toEqual([]);
  });

  it('never touches the model: the original deck still emits and parses back as minted', () => {
    const d = deckOf(minted());
    const before = emitDeck(d).tex;
    applyPreviewFallbacks(d);
    expect(emitDeck(d).tex).toBe(before);
    expect(before).toContain('\\begin{minted}');
    const { round } = expectRoundTrip(d);
    expect(codeOf(round.deck).backend).toBe('minted');
  });
});
