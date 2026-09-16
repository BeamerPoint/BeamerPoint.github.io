import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import { richTextToPlain } from '../src/emit/inline.js';

/**
 * Preamble metadata must survive a round trip, including the parts the app does not
 * model.
 *
 * `\titlegraphic` was listed as a title command, so the parser consumed it and
 * `applyTitleCommand` — which has no case for it — dropped it on the floor. Importing a
 * deck with a logo on its title slide silently deleted the logo. That is exactly the
 * failure Invariant 1 exists to make unreachable, so it gets a test.
 */

const SOURCE = `\\documentclass[aspectratio=169,11pt]{beamer}
\\usetheme{Madrid}
\\title{Measured}
\\subtitle{A subtitle}
\\author[A.M.]{A. Mohebbi}
\\institute{Polytechnique}
\\date{\\today}
\\titlegraphic{\\includegraphics[height=1cm]{logo.png}}
\\begin{document}
\\begin{frame}{Slide}
Body text.
\\end{frame}
\\end{document}
`;

describe('deck metadata round trip', () => {
  it('keeps a titlegraphic instead of eating it', () => {
    const { deck } = parseDeck(SOURCE, { newId: makeSeededIdFactory('a') });
    const out = emitDeck(deck).tex;
    expect(out).toContain('\\titlegraphic{\\includegraphics[height=1cm]{logo.png}}');
  });

  it('reaches a fixpoint with a titlegraphic present', () => {
    const first = parseDeck(SOURCE, { newId: makeSeededIdFactory('a') });
    const tex = emitDeck(first.deck).tex;
    const second = parseDeck(tex, { newId: makeSeededIdFactory('b') });
    expect(emitDeck(second.deck).tex).toBe(tex);
    expect(second.guard.ok).toBe(true);
  });

  it('reads the metadata the app does model', () => {
    const { deck } = parseDeck(SOURCE, { newId: makeSeededIdFactory('a') });
    const m = deck.meta;
    const t = (r: typeof m.title): string => (r === undefined ? '' : richTextToPlain(r));
    expect(t(m.title)).toBe('Measured');
    expect(t(m.subtitle)).toBe('A subtitle');
    expect(t(m.author)).toBe('A. Mohebbi');
    expect(t(m.shortAuthor)).toBe('A.M.');
    expect(t(m.institute)).toBe('Polytechnique');
  });
});
