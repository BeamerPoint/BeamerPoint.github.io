import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import type { Deck, RichText } from '../src/model/types.js';

/**
 * Two defects the text-formatting controls walked straight into.
 *
 * Both were found by round-tripping the inline nodes a colour picker and a size picker
 * would create, before either control existed — which is the only reason they were
 * found at all. Neither crashes; one loses the ability to edit what it wrote, and the
 * other quietly widens the file on every pass.
 */

function deckWithText(content: RichText): Deck {
  const base = newDeck({ title: 'T' });
  return {
    ...base,
    nodes: [newFrame('S', [
      { id: 'e1', kind: 'text', placement: { mode: 'flow' }, content },
    ])],
  };
}

function parseSource(tex: string) {
  return parseDeck(tex, { newId: makeSeededIdFactory('r') });
}

/** The text element's content after a parse, or null when it was demoted to raw. */
function contentOf(tex: string): RichText | null {
  const round = parseSource(tex);
  const frame = round.deck.nodes.find((n) => n.kind === 'frame');
  const el = frame?.kind === 'frame' ? frame.children[0] : undefined;
  return el?.kind === 'text' ? el.content : null;
}

describe('inline colour', () => {
  it('reads back an rgb colour as a colour, not as a raw island', () => {
    // The emitter has always written this form; the parser accepted only the
    // zero-option one, so a colour from the RGB picker came back inert.
    const deck = deckWithText([
      { t: 'style', style: 'color', color: { k: 'rgb', r: 0.8, g: 0.2, b: 0.1 }, children: [{ t: 'text', s: 'red' }] },
    ]);
    const tex = emitDeck(deck).tex;
    expect(tex).toContain('\\textcolor[rgb]{0.8,0.2,0.1}{red}');

    const content = contentOf(tex);
    expect(content?.[0]).toEqual({
      t: 'style', style: 'color',
      color: { k: 'rgb', r: 0.8, g: 0.2, b: 0.1 },
      children: [{ t: 'text', s: 'red' }],
    });

    const round = parseSource(tex);
    expect(round.health.demoted).toBe(0);
    expect(emitDeck(round.deck).tex).toBe(tex);
  });

  it('still keeps a named or mixed colour byte-for-byte', () => {
    for (const expr of ['blue', 'blue!20!white', 'structure.fg!60']) {
      const deck = deckWithText([
        { t: 'style', style: 'color', color: { k: 'mix', expr }, children: [{ t: 'text', s: 'x' }] },
      ]);
      const tex = emitDeck(deck).tex;
      expect(tex).toContain(`\\textcolor{${expr}}{x}`);
      expect(emitDeck(parseSource(tex).deck).tex).toBe(tex);
    }
  });

  it('declines a colour model it does not understand, rather than guessing', () => {
    // `[HTML]`, `[cmyk]` and `[gray]` are not in the model. Inventing an rgb triple for
    // one would change the colour in the PDF; a raw island keeps it exactly.
    const source = emitDeck(deckWithText([{ t: 'text', s: 'PLACEHOLDER' }])).tex
      .replace('PLACEHOLDER', '\\textcolor[HTML]{00FF00}{x}');
    const content = contentOf(source);
    expect(content?.some((n) => n.t === 'raw' && n.tex.includes('[HTML]'))).toBe(true);
    // ...and it survives untouched.
    expect(emitDeck(parseSource(source).deck).tex).toContain('\\textcolor[HTML]{00FF00}{x}');
  });
});

describe('inline font size', () => {
  it('does not grow a space on every round trip', () => {
    /*
     * `\large` is a control word, so TeX skips ALL whitespace after it -- the space in
     * `{\large big}` terminates the macro and is not content. The parser used to keep
     * it in the child text and the emitter added its own, so the source went
     * `{\large big}` -> `{\large  big}` -> three spaces -> four, growing every time the
     * deck was saved. The guard never caught it: whitespace between tokens is
     * insignificant to the comparison, so this was silent.
     */
    const deck = deckWithText([
      { t: 'text', s: 'a ' },
      { t: 'style', style: 'size', size: 'large', children: [{ t: 'text', s: 'big' }] },
      { t: 'text', s: ' b' },
    ]);
    const first = emitDeck(deck).tex;
    expect(first).toContain('{\\large big}');

    const second = emitDeck(parseSource(first).deck).tex;
    expect(second).toBe(first);
    const third = emitDeck(parseSource(second).deck).tex;
    expect(third).toBe(first);
  });

  it('reads a hand-written size group with extra spaces as the same thing', () => {
    const source = emitDeck(deckWithText([{ t: 'text', s: 'PLACEHOLDER' }])).tex
      .replace('PLACEHOLDER', '{\\Large   spaced}');
    expect(contentOf(source)?.[0]).toEqual({
      t: 'style', style: 'size', size: 'Large',
      children: [{ t: 'text', s: 'spaced' }],
    });
    // The guard is happy because whitespace between tokens is insignificant, so this
    // stays an editable size rather than being demoted for being reformatted.
    expect(parseSource(source).health.demoted).toBe(0);
  });

  it('keeps an empty size group from losing its shape', () => {
    const deck = deckWithText([
      { t: 'style', style: 'size', size: 'small', children: [] },
    ]);
    const first = emitDeck(deck).tex;
    expect(emitDeck(parseSource(first).deck).tex).toBe(first);
  });
});
