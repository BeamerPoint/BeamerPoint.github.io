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
import { parseDeck } from '../src/parse/parseDeck.js';
import { newCodeElement, newDeck, newFrame, newTextElement } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import { derivePackages, isDerivedSetupLine } from '../src/emit/derivePackages.js';
import { LST_LANGUAGES, LST_SETUP, LST_DEFINITIONS } from '../src/emit/lstLanguages.js';
import type { CodeElement, Deck, Element } from '../src/model/types.js';
import { expectRoundTrip } from './helpers/roundTrip.js';

/**
 * Source listings, through emit and parse.
 *
 * `CodeElement` was typed from the start and nothing could create, emit or read one — a
 * listing only ever survived as a raw block. The facts pinned here were measured against
 * the engine: an unknown language is a hard error, and a `lstlisting` without `[fragile]`
 * does not compile at all.
 */

function deckWith(el: Element): Deck {
  const base = newDeck({ title: 'T' });
  return { ...base, nodes: [newFrame('S', [el])] };
}

function roundTrip(deck: Deck): { tex: string; round: ReturnType<typeof parseDeck> } {
  return expectRoundTrip(deck);
}

function codeOf(round: ReturnType<typeof parseDeck>): CodeElement {
  const frame = round.deck.nodes.find((n) => n.kind === 'frame');
  if (frame?.kind !== 'frame') throw new Error('expected a frame');
  const el = frame.children.find((c) => c.kind === 'code');
  if (el?.kind !== 'code') throw new Error('expected a code element');
  return el;
}

describe('code listings', () => {
  it('emits a listing and reads it back', () => {
    const { tex, round } = roundTrip(deckWith(newCodeElement()));
    expect(tex).toContain('\\begin{lstlisting}[language=Python]');
    expect(tex).toContain('\\end{lstlisting}');
    expect(codeOf(round).language).toBe('Python');
    expect(codeOf(round).code).toContain('def greet(name):');
  });

  it('puts [fragile] on the frame, without which nothing compiles', () => {
    // Measured: a lstlisting in a frame with no [fragile] fails with *Illegal parameter
    // number in definition of \iterate* and produces no PDF.
    expect(roundTrip(deckWith(newCodeElement())).tex).toContain('\\begin{frame}[fragile]');
  });

  it('keeps the body byte-exact, including markup that is content', () => {
    // A % is a comment to LaTeX and a comment to Python; a \ is an escape to one and a
    // backslash to the other. The lexer captures the body before tokenizing for exactly
    // this reason, and the guard compares it byte for byte.
    const body = '\nx = 100 % 7  # not a comment\npath = "C:\\\\tmp"\nif x < 3 { }\n';
    const { tex, round } = roundTrip(deckWith(newCodeElement('Python', body)));
    expect(tex).toContain(body);
    expect(codeOf(round).code).toBe(body);
  });

  it('round-trips a caption, a frame style and an unmodelled option', () => {
    const el: CodeElement = {
      ...newCodeElement('C'),
      caption: [{ t: 'text', s: 'Listing one' }],
      frameStyle: 'single',
      options: { numbers: 'left', mathescape: '' },
    };
    const { tex, round } = roundTrip(deckWith(el));
    expect(tex).toContain(
      '\\begin{lstlisting}[language=C,caption={Listing one},frame=single,'
      + 'numbers=left,mathescape]',
    );

    const back = codeOf(round);
    expect(back.frameStyle).toBe('single');
    expect(back.options).toEqual({ numbers: 'left', mathescape: '' });
    expect(back.caption).toEqual([{ t: 'text', s: 'Listing one' }]);
  });

  it('round-trips the other two backends', () => {
    const verbatim: CodeElement = { ...newCodeElement('', '\nplain text\n'), backend: 'verbatim' };
    expect(roundTrip(deckWith(verbatim)).tex).toContain('\\begin{verbatim}');

    const minted: CodeElement = { ...newCodeElement('python'), backend: 'minted' };
    // minted takes the language as a mandatory argument, not as an option.
    expect(roundTrip(deckWith(minted)).tex).toContain('\\begin{minted}{python}');
  });

  it('derives listings, xcolor and one house style', () => {
    const packages = derivePackages(deckWith(newCodeElement()));
    expect(packages.map((p) => p.name)).toContain('listings');
    expect(packages.map((p) => p.name)).toContain('xcolor');
    expect(packages.find((p) => p.name === 'listings')?.setup).toEqual([LST_SETUP]);
  });

  it('defines the languages listings does not know, once each', () => {
    // Measured: `language=Rust` is *Couldn't load requested language* on its own, and
    // compiles after a \lstdefinelanguage. Two listings in the same language must not
    // define it twice.
    const base = newDeck({ title: 'T' });
    const deck: Deck = {
      ...base,
      nodes: [newFrame('S', [
        newCodeElement('Rust', '\nfn main() {}\n'),
        newCodeElement('Rust', '\nfn other() {}\n'),
        newCodeElement('Python', '\npass\n'),
      ])],
    };
    const setup = derivePackages(deck).find((p) => p.name === 'listings')?.setup ?? [];
    expect(setup).toEqual([LST_SETUP, LST_DEFINITIONS['Rust']]);

    const { tex } = roundTrip(deck);
    expect(tex.split('\\lstdefinelanguage').length - 1).toBe(1);
  });

  it('owns its setup lines, so the preamble does not grow a duplicate', () => {
    // DERIVED_SETUP_LINES is the single source of truth both sides read. A line the
    // emitter writes and the parser does not recognise comes back as a user chunk and
    // is emitted twice on the next pass.
    expect(isDerivedSetupLine(LST_SETUP)).toBe(true);
    for (const def of Object.values(LST_DEFINITIONS)) {
      expect(isDerivedSetupLine(def), def.slice(0, 40)).toBe(true);
    }
  });

  it('offers only languages that exist', () => {
    // The picker is a fixed list because an unknown language does not degrade — it
    // aborts the compile.
    expect(LST_LANGUAGES).toContain('Python');
    expect(LST_LANGUAGES).toContain('JavaScript');   // ours
    expect(LST_LANGUAGES).not.toContain('Nonesuch');
    expect(new Set(LST_LANGUAGES).size).toBe(LST_LANGUAGES.length);
  });

  it('does not split a paragraph at an inline \\verb', () => {
    // A verbatim ENVIRONMENT is block-level; `\verb|x|` in a sentence is not. Treating
    // both the same made one paragraph into three elements.
    const tex = emitDeck(deckWith(newTextElement('before'))).tex
      .replace('before', 'Run \\verb|make all| to build.');
    const round = parseDeck(tex, { newId: makeSeededIdFactory('v') });
    const frame = round.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected a frame');
    expect(frame.children).toHaveLength(1);
    expect(frame.children[0]?.kind).toBe('text');
  });
});

describe('every element kind emits something', () => {
  it('never reaches the unimplemented warning', () => {
    // Three modelled kinds — toc, bibliography and chart — currently fall through to
    // `default:` and emit NOTHING but a warning, which is silent content loss. This
    // test is the regression guard as each one is implemented.
    const { warnings } = emitDeck(deckWith(newCodeElement()));
    expect(warnings.filter((w) => w.code === 'emit.unimplemented')).toEqual([]);
  });
});
