import { describe, expect, it } from 'vitest';
import {
  applyInlineStyle, hasInlineStyle, inlineMarksIn, removeInlineStyle, richTextLength,
  toggleInlineStyle,
} from '../src/model/richtextOps.js';
import { normalizeRichText, richTextEquals } from '../src/model/richtext.js';
import { emitInline } from '../src/emit/inline.js';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import type { Element, RichText } from '../src/model/types.js';

/**
 * Styling a range of characters.
 *
 * The inline model has carried bold, italic, colour and size since the first commit and
 * nothing in the app ever built one, so this operation is the whole feature. Everything
 * here is a case where getting the index arithmetic wrong formats the wrong words
 * instead of failing.
 */

const text = (s: string): RichText => [{ t: 'text', s }];

function textElement(content: RichText): Element {
  return { id: 'e1', kind: 'text', placement: { mode: 'flow' }, content };
}

/** The LaTeX a rich text emits, which is the thing that has to stay sane. */
const tex = (rt: RichText): string => emitInline(rt);

describe('inline style over a range', () => {
  it('splits one run into three', () => {
    const out = applyInlineStyle(text('hello world'), { from: 6, to: 11 }, { style: 'bf' });
    expect(tex(out)).toBe('hello \\textbf{world}');
  });

  it('merges across a run that already had the style', () => {
    const rt: RichText = [
      { t: 'text', s: 'a ' },
      { t: 'style', style: 'bf', children: text('b') },
      { t: 'text', s: ' c' },
    ];
    // No \textbf inside \textbf: the middle run keeps exactly one wrapper.
    const out = applyInlineStyle(rt, { from: 0, to: 5 }, { style: 'bf' });
    expect(tex(out)).toBe('\\textbf{a b c}');
  });

  it('wraps a run it covers exactly, without leaving empty siblings', () => {
    const out = applyInlineStyle(text('word'), { from: 0, to: 4 }, { style: 'it' });
    expect(out).toEqual([{ t: 'style', style: 'it', children: text('word') }]);
  });

  it('does nothing at all to a zero-length range', () => {
    const before = text('hello');
    const after = applyInlineStyle(before, { from: 2, to: 2 }, { style: 'bf' });
    expect(richTextEquals(before, after)).toBe(true);
  });

  it('carries a style across an atomic node without splitting it', () => {
    const rt: RichText = [
      { t: 'text', s: 'a' },
      { t: 'math', tex: 'x^2' },
      { t: 'text', s: 'b' },
    ];
    const out = applyInlineStyle(rt, { from: 0, to: 3 }, { style: 'bf' });
    expect(tex(out)).toBe('\\textbf{a$x^2$b}');
  });

  it('steps over a raw island rather than wrapping it', () => {
    // A raw island is preserved verbatim and may be block-level -- `\vspace{2mm}`
    // arrives as one -- so putting it inside \textbf{} would change what it means.
    const rt: RichText = [
      { t: 'text', s: 'a' },
      { t: 'raw', tex: '\\vspace{2mm}' },
      { t: 'text', s: 'b' },
    ];
    const out = applyInlineStyle(rt, { from: 0, to: 3 }, { style: 'bf' });
    expect(tex(out)).toBe('\\textbf{a}\\vspace{2mm}\\textbf{b}');
  });

  it('toggles off when the whole range already has the style', () => {
    const bold: RichText = [{ t: 'style', style: 'bf', children: text('all bold') }];
    expect(hasInlineStyle(bold, { from: 0, to: 8 }, 'bf')).toBe(true);
    expect(tex(toggleInlineStyle(bold, { from: 0, to: 8 }, { style: 'bf' }))).toBe('all bold');
  });

  it('toggles ON when the range is only partly styled', () => {
    const rt: RichText = [
      { t: 'style', style: 'bf', children: text('ab') },
      { t: 'text', s: 'cd' },
    ];
    expect(hasInlineStyle(rt, { from: 0, to: 4 }, 'bf')).toBe(false);
    expect(tex(toggleInlineStyle(rt, { from: 0, to: 4 }, { style: 'bf' })))
      .toBe('\\textbf{abcd}');
  });

  it('removes a style from the middle of a run, leaving it either side', () => {
    const bold: RichText = [{ t: 'style', style: 'bf', children: text('abcdef') }];
    expect(tex(removeInlineStyle(bold, { from: 2, to: 4 }, 'bf')))
      .toBe('\\textbf{ab}cd\\textbf{ef}');
  });

  it('keeps bold inside a colour, and adds no second colour wrapper', () => {
    const rt: RichText = [
      { t: 'text', s: 'a' },
      { t: 'style', style: 'bf', children: text('b') },
    ];
    const red = applyInlineStyle(rt, { from: 0, to: 2 }, {
      style: 'color', color: { k: 'named', name: 'red' },
    });
    expect(tex(red)).toBe('\\textcolor{red}{a\\textbf{b}}');

    const again = applyInlineStyle(red, { from: 0, to: 2 }, { style: 'bf' });
    expect(tex(again)).toBe('\\textcolor{red}{\\textbf{ab}}');
  });

  it('replaces a colour rather than nesting one inside another', () => {
    const red: RichText = [
      { t: 'style', style: 'color', color: { k: 'named', name: 'red' }, children: text('x') },
    ];
    const blue = applyInlineStyle(red, { from: 0, to: 1 }, {
      style: 'color', color: { k: 'named', name: 'blue' },
    });
    expect(tex(blue)).toBe('\\textcolor{blue}{x}');
  });

  it('replaces a size the same way', () => {
    const big: RichText = [{ t: 'style', style: 'size', size: 'large', children: text('x') }];
    const bigger = applyInlineStyle(big, { from: 0, to: 1 }, { style: 'size', size: 'Huge' });
    expect(tex(bigger)).toBe('{\\Huge x}');
  });

  it('keeps a link and its url when styling across its boundary', () => {
    const rt: RichText = [
      { t: 'link', url: 'https://x.test', children: text('ab') },
      { t: 'text', s: 'cd' },
    ];
    const out = applyInlineStyle(rt, { from: 0, to: 4 }, { style: 'bf' });
    expect(tex(out)).toBe('\\href{https://x.test}{\\textbf{ab}}\\textbf{cd}');
  });

  it('produces a fixpoint of normalisation, and is idempotent', () => {
    const once = applyInlineStyle(text('hello world'), { from: 0, to: 5 }, { style: 'bf' });
    expect(normalizeRichText(once)).toEqual(once);
    const twice = applyInlineStyle(once, { from: 0, to: 5 }, { style: 'bf' });
    expect(richTextEquals(once, twice)).toBe(true);
  });

  it('never changes the character count', () => {
    const rt: RichText = [
      { t: 'text', s: 'ab' },
      { t: 'math', tex: 'x' },
      { t: 'style', style: 'it', children: text('cd') },
    ];
    const before = richTextLength(rt);
    expect(richTextLength(applyInlineStyle(rt, { from: 1, to: 4 }, { style: 'bf' })))
      .toBe(before);
    expect(richTextLength(removeInlineStyle(rt, { from: 0, to: 5 }, 'it'))).toBe(before);
  });

  it('clamps an inverted, negative or overlong range', () => {
    const rt = text('abc');
    expect(tex(applyInlineStyle(rt, { from: 3, to: 0 }, { style: 'bf' })))
      .toBe('\\textbf{abc}');
    expect(tex(applyInlineStyle(rt, { from: -5, to: 99 }, { style: 'bf' })))
      .toBe('\\textbf{abc}');
  });

  it('reports only the styles the WHOLE range shares', () => {
    const rt: RichText = [
      { t: 'style', style: 'bf', children: text('ab') },
      { t: 'text', s: 'cd' },
    ];
    expect(inlineMarksIn(rt, { from: 0, to: 2 }).styles).toEqual(['bf']);
    expect(inlineMarksIn(rt, { from: 0, to: 4 }).styles).toEqual([]);
  });

  it('round-trips through the emitter and the parser with nothing demoted', () => {
    // The whole point: a formatted paragraph has to come back as the same model, or
    // the guard turns the user's own formatting into an inert raw island.
    let content = applyInlineStyle(text('alpha beta gamma'), { from: 0, to: 5 }, { style: 'bf' });
    content = applyInlineStyle(content, { from: 6, to: 10 }, {
      style: 'color', color: { k: 'rgb', r: 0.8, g: 0.2, b: 0.1 },
    });
    content = applyInlineStyle(content, { from: 11, to: 16 }, { style: 'size', size: 'large' });

    const deck = newDeck({ title: 'T' });
    deck.nodes = [newFrame('F', [textElement(content)])];
    const first = emitDeck(deck).tex;
    const round = parseDeck(first, { newId: makeSeededIdFactory('r') });

    expect(round.health.demoted).toBe(0);
    expect(round.guard.ok).toBe(true);
    expect(emitDeck(round.deck).tex).toBe(first);
  });
});
