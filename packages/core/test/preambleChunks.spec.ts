import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import { TIKZ_LIBRARIES, TIKZ_LIBRARIES_LEGACY } from '../src/emit/tikz.js';

/**
 * Preamble lines the model does not understand.
 *
 * They are kept as `PreambleChunk`s, each with the SLOT it was read in and an order, so a
 * `\newcommand` stays after the packages it may depend on. Until now nothing tested a
 * chunk being kept at all -- the only reference asserted the array was empty.
 *
 * The preamble is also the one part of the document the round-trip guard cannot see (it
 * works frame by frame), so these tests are its whole defence.
 */

const parse = (src: string, seed = 'r') => parseDeck(src, { newId: makeSeededIdFactory(seed) });

const SOURCE = [
  '\\documentclass[aspectratio=169,11pt]{beamer}',
  '% a comment right after the class',
  '\\usepackage{amssymb}',
  '\\newcommand{\\R}{\\mathbb{R}}',
  '\\usetheme{Madrid}',
  '\\setlength{\\parskip}{0.5em}',
  '\\setbeamercolor{title}{fg=red}',
  '\\definecolor{brand}{HTML}{112233}',
  '\\AtBeginSection{\\frame{\\sectionpage}}',
  '\\title{T}',
  '\\begin{document}',
  '\\begin{frame}{F}',
  'Body with $\\R$.',
  '\\end{frame}',
  '\\end{document}',
  '',
].join('\n');

describe('preamble chunks', () => {
  it('keeps each unmodelled line in the slot it was read in, in order', () => {
    const { deck } = parse(SOURCE);
    expect(deck.preamble.custom.map((c) => [c.slot, c.tex])).toEqual([
      ['after-documentclass', '% a comment right after the class'],
      ['after-packages', '\\newcommand{\\R}{\\mathbb{R}}'],
      ['after-theme', '\\setlength{\\parskip}{0.5em}'],
      ['after-settings', '\\AtBeginSection{\\frame{\\sectionpage}}'],
    ]);
    const orders = deck.preamble.custom.map((c) => c.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('emits every chunk exactly once, and is a byte fixpoint from the second save on', () => {
    // The first import reformats (see below); after that, nothing may move or grow.
    const once = emitDeck(parse(SOURCE).deck).tex;
    const twice = emitDeck(parse(once, 's').deck).tex;
    const thrice = emitDeck(parse(twice, 't').deck).tex;
    expect(twice).toBe(once);
    expect(thrice).toBe(once);
    for (const line of [
      '% a comment right after the class', '\\newcommand{\\R}{\\mathbb{R}}',
      '\\setlength{\\parskip}{0.5em}', '\\AtBeginSection{\\frame{\\sectionpage}}',
    ]) {
      expect(once.split(line).length - 1, line).toBe(1);
    }
  });

  it('keeps a macro after the package it depends on', () => {
    const tex = emitDeck(parse(SOURCE).deck).tex;
    expect(tex.indexOf('\\usepackage{amssymb}')).toBeLessThan(tex.indexOf('\\newcommand{\\R}'));
  });

  it('writes colour definitions before beamer colour settings, whatever the source order', () => {
    // A reordering the import does on purpose, recorded so it is not mistaken for a bug:
    // colours are defined before anything names them. Beamer resolves colours lazily, so
    // the source order also worked -- this is the order that works without relying on it.
    // It is why an imported file's first `health.fixpoint` can be false.
    const tex = emitDeck(parse(SOURCE).deck).tex;
    expect(tex.indexOf('\\definecolor{brand}')).toBeLessThan(tex.indexOf('\\setbeamercolor{title}'));
  });

  it('does not grow a second copy of a derived setup line it read from the file', () => {
    // `DERIVED_SETUP_LINES` matches by exact string. Both the current tikz library line
    // and the one older builds wrote must be absorbed, or a deck saved by an older build
    // keeps its line as a chunk AND derives the new one beside it -- on every save.
    for (const line of [TIKZ_LIBRARIES, TIKZ_LIBRARIES_LEGACY]) {
      const src = SOURCE
        .replace('\\usetheme{Madrid}', `\\usepackage{tikz}\n${line}\n\\usetheme{Madrid}`)
        .replace('Body with $\\R$.', '\\begin{tikzpicture}\\draw (0,0) -- (1,1);\\end{tikzpicture}');
      let tex = emitDeck(parse(src).deck).tex;
      for (let i = 0; i < 3; i++) tex = emitDeck(parse(tex, `c${i}`).deck).tex;
      expect(tex.split('\\usetikzlibrary').length - 1, line).toBeLessThanOrEqual(1);
    }
  });
});
