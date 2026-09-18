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
import { makeSeededIdFactory } from '../src/model/ids.js';
import { newDeck, newFrame, newTextElement } from '../src/model/factory.js';
import type { FrameNode } from '../src/model/types.js';

/**
 * The two spellings of a frame.
 *
 * `\begin{frame}{Title}` and `\frame{...}` mean the same as the app's own
 * `\begin{frame}` + `\frametitle{...}`, but the round-trip guard compares BYTES. Before
 * the model recorded which spelling a file used, re-emitting differed from the source,
 * every frame was demoted, and importing a typical third-party deck produced one
 * enormous raw block instead of slides.
 */
function roundTrip(src: string): { frames: FrameNode[]; again: string } {
  const round = parseDeck(src, { newId: makeSeededIdFactory('r') });
  const again = emitDeck(round.deck).tex;
  return {
    frames: round.deck.nodes.filter((n): n is FrameNode => n.kind === 'frame'),
    again,
  };
}

const doc = (body: string): string =>
  `\\documentclass{beamer}\n\\begin{document}\n${body}\n\\end{document}\n`;

describe('frame spellings', () => {
  it('keeps a title written as an environment argument', () => {
    const src = doc('\\begin{frame}{Overview}\nSome prose.\n\\end{frame}');
    const { frames, again } = roundTrip(src);

    expect(frames).toHaveLength(1);
    expect(frames[0]!.titleStyle).toBe('argument');
    expect(again).toContain('\\begin{frame}{Overview}');
    expect(again).not.toContain('\\frametitle');
  });

  it('keeps a title and subtitle written as arguments', () => {
    const { frames, again } = roundTrip(
      doc('\\begin{frame}{Main}{Secondary}\nx\n\\end{frame}'),
    );
    expect(frames[0]!.titleStyle).toBe('argument');
    expect(again).toContain('\\begin{frame}{Main}{Secondary}');
    expect(again).not.toContain('\\framesubtitle');
  });

  it('keeps options alongside an argument title', () => {
    const { again } = roundTrip(
      doc('\\begin{frame}[fragile]{Code}\n\\begin{verbatim}\nx\n\\end{verbatim}\n\\end{frame}'),
    );
    expect(again).toContain('\\begin{frame}[fragile]{Code}');
  });

  it('keeps the \\frame{...} command form', () => {
    const { frames, again } = roundTrip(doc('\\frame{\\titlepage}'));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.form).toBe('command');
    expect(again).toContain('\\frame{');
    expect(again).not.toContain('\\begin{frame}');
  });

  it('still writes the app\'s own style for frames it created', () => {
    const deck = newDeck({ title: 'T' });
    deck.nodes = [newFrame('Mine', [newTextElement('Body.')])];
    const tex = emitDeck(deck).tex;

    expect(tex).toContain('\\begin{frame}');
    expect(tex).toContain('\\frametitle{Mine}');
    expect(tex).not.toContain('\\begin{frame}{Mine}');
  });

  it('re-emits every spelling byte-identically', () => {
    const sources = [
      doc('\\begin{frame}{Overview}\nProse.\n\\end{frame}'),
      doc('\\begin{frame}{Main}{Secondary}\nProse.\n\\end{frame}'),
      doc('\\frame{\\titlepage}'),
      doc('\\begin{frame}\n  \\frametitle{Classic}\n\n  Prose.\n\\end{frame}'),
    ];

    for (const src of sources) {
      const once = parseDeck(src, { newId: makeSeededIdFactory('a') });
      const emitted = emitDeck(once.deck).tex;
      const twice = parseDeck(emitted, { newId: makeSeededIdFactory('b') });

      expect(emitDeck(twice.deck).tex, src).toBe(emitted);
      expect(once.guard.ok, src).toBe(true);
      expect(once.health.demoted, src).toBe(0);
    }
  });

  it('does not turn off navigation symbols that the file never turned off', () => {
    // The app's own new decks suppress them; a file being read did not ask for that.
    // Adding the line on import silently changes every slide of someone's deck.
    const { again } = roundTrip(doc('\\begin{frame}{A}\nx\n\\end{frame}'));
    expect(again).not.toContain('navigation symbols');

    const asked = roundTrip(
      '\\documentclass{beamer}\n\\setbeamertemplate{navigation symbols}{}\n'
      + '\\begin{document}\n\\begin{frame}{A}\nx\n\\end{frame}\n\\end{document}\n',
    );
    expect(asked.again).toContain('\\setbeamertemplate{navigation symbols}{}');
  });

  it('falls back to the environment when a command-form frame gains options', () => {
    // `\frame{...}` takes no option list, so a frame imported in command form that
    // later needs `fragile` has to be written as an environment or it will not compile.
    const round = parseDeck(doc('\\frame{\\titlepage}'), { newId: makeSeededIdFactory('r') });
    const frame = round.deck.nodes.find((n): n is FrameNode => n.kind === 'frame')!;
    frame.options = { ...frame.options, plain: true };

    const tex = emitDeck(round.deck).tex;
    expect(tex).toContain('\\begin{frame}[plain]');
    expect(tex).not.toMatch(/\\frame\[/);
  });
});
