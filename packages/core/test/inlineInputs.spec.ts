/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { describe, expect, it } from 'vitest';
import {
  graphicsPaths, inlineInputs, normalizePath, resolveGraphicPath,
} from '../src/project/inlineInputs.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { makeSeededIdFactory } from '../src/model/ids.js';

/**
 * Merging a multi-file project into one document (the zip import).
 *
 * Every `\input` is replaced by the file it names BEFORE parsing, so slides kept in
 * separate files become ordinary, editable frames rather than opaque raw blocks.
 */

const R = String.raw;
const files = (entries: Record<string, string>): Map<string, string> => new Map(Object.entries(entries));

const MAIN = [
  R`\documentclass{beamer}`,
  R`\usetheme{Madrid}`,
  R`\title{Project}`,
  R`\begin{document}`,
  R`\input{slides/intro}`,
  R`\include{slides/results.tex}`,
  R`\end{document}`,
].join('\n');

const INTRO = [R`\begin{frame}`, R`\frametitle{Intro}`, 'Hello from a separate file.', R`\end{frame}`].join('\n');
const RESULTS = [R`\begin{frame}`, R`\frametitle{Results}`, R`\begin{itemize}`, R`\item One`, R`\end{itemize}`, R`\end{frame}`].join('\n');

describe('inlineInputs', () => {
  it('replaces each include with the file it names, with or without .tex', () => {
    const r = inlineInputs(files({
      'main.tex': MAIN, 'slides/intro.tex': INTRO, 'slides/results.tex': RESULTS,
    }), 'main.tex');
    expect(r.inlined).toEqual(['slides/intro.tex', 'slides/results.tex']);
    expect(r.missing).toEqual([]);
    expect(r.source).toContain(R`\frametitle{Intro}`);
    expect(r.source).toContain(R`\frametitle{Results}`);
    expect(r.source).not.toContain(R`\input`);
    expect(r.source).not.toContain(R`\include{`);
  });

  it('makes the included slides editable frames, not raw blocks', () => {
    const r = inlineInputs(files({
      'main.tex': MAIN, 'slides/intro.tex': INTRO, 'slides/results.tex': RESULTS,
    }), 'main.tex');
    const parsed = parseDeck(r.source, { newId: makeSeededIdFactory('i') });
    const frames = parsed.deck.nodes.filter((n) => n.kind === 'frame');
    expect(frames).toHaveLength(2);
    expect(parsed.deck.nodes.some((n) => n.kind === 'rawdoc')).toBe(false);
    const kinds = frames.flatMap((f) => (f.kind === 'frame' ? f.children.map((c) => c.kind) : []));
    expect(kinds).toEqual(['text', 'list']);
    expect(parsed.health.demoted).toBe(0);
  });

  it('follows nested includes, resolved from the main file\'s directory', () => {
    const r = inlineInputs(files({
      'deck/main.tex': R`\begin{document}\input{parts/a}\end{document}`,
      'deck/parts/a.tex': R`A\input{parts/b}`,
      'deck/parts/b.tex': 'B',
    }), 'deck/main.tex');
    expect(r.inlined).toEqual(['deck/parts/a.tex', 'deck/parts/b.tex']);
    expect(r.source.replace(/\s+/g, '')).toBe(R`\begin{document}AB\end{document}`);
  });

  it('leaves a commented-out include alone', () => {
    const r = inlineInputs(files({ 'main.tex': '%\\input{x}\nkept', 'x.tex': 'SHOULD NOT APPEAR' }), 'main.tex');
    expect(r.source).toBe('%\\input{x}\nkept');
    expect(r.inlined).toEqual([]);
  });

  it('leaves an include inside a verbatim listing alone', () => {
    const src = [R`\begin{lstlisting}`, R`\input{x}`, R`\end{lstlisting}`].join('\n');
    const r = inlineInputs(files({ 'main.tex': src, 'x.tex': 'SHOULD NOT APPEAR' }), 'main.tex');
    expect(r.source).toBe(src);
  });

  it('reads the plain-TeX form, \\input name', () => {
    const r = inlineInputs(files({ 'main.tex': 'a \\input part b', 'part.tex': 'P' }), 'main.tex');
    expect(r.source.replace(/\s+/g, ' ')).toBe('a P b');
  });

  it('keeps an unresolved include as written, and reports it', () => {
    const r = inlineInputs(files({ 'main.tex': R`x \input{slides/gone} y` }), 'main.tex');
    expect(r.source).toBe(R`x \input{slides/gone} y`);
    expect(r.missing).toEqual(['slides/gone']);
  });

  it('stops at a circular include instead of looping', () => {
    const r = inlineInputs(files({ 'main.tex': R`\input{a}`, 'a.tex': R`A\input{b}`, 'b.tex': R`B\input{a}` }), 'main.tex');
    expect(r.missing).toEqual(['a.tex (circular include)']);
    expect(r.source).toContain('A');
    expect(r.source).toContain('B');
  });

  it('takes only the body of a \\subfile', () => {
    const r = inlineInputs(files({
      'main.tex': R`\begin{document}\subfile{sec/one}\end{document}`,
      'sec/one.tex': R`\documentclass[../main]{subfiles}\begin{document}BODY\end{document}`,
    }), 'main.tex');
    expect(r.source).toContain('BODY');
    expect(r.source).not.toContain('subfiles');
  });

  it('resolves \\import{dir}{file} and the includes inside it from that directory', () => {
    const r = inlineInputs(files({
      'main.tex': R`\import{chapters/one/}{text}`,
      'chapters/one/text.tex': R`T\input{more}`,
      'chapters/one/more.tex': 'M',
    }), 'main.tex');
    expect(r.inlined).toEqual(['chapters/one/text.tex', 'chapters/one/more.tex']);
    expect(r.source.replace(/\s+/g, '')).toBe('TM');
  });
});

describe('graphics resolution', () => {
  const available = new Set(['figures/plot.png', 'figures/plot.pdf', 'logo.jpg', 'img/a.png']);

  it('finds an extensionless name through \\graphicspath, in pdflatex\'s extension order', () => {
    expect(resolveGraphicPath('plot', ['figures/'], available)).toBe('figures/plot.pdf');
  });

  it('takes a written extension as written', () => {
    expect(resolveGraphicPath('figures/plot.png', [], available)).toBe('figures/plot.png');
    expect(resolveGraphicPath('logo', [], available)).toBe('logo.jpg');
  });

  it('returns null for a file the project does not have', () => {
    expect(resolveGraphicPath('missing', ['figures/'], available)).toBeNull();
  });

  it('reads the directories of \\graphicspath', () => {
    expect(graphicsPaths(R`\graphicspath{{figures/}{img/}}`)).toEqual(['figures/', 'img/']);
  });

  it('normalises project paths', () => {
    expect(normalizePath('./a/../b//c.tex')).toBe('b/c.tex');
  });
});
