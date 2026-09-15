// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { emitDeck, newDeck, newFrame, plain, type RichText } from '@beamerpoint/core';
import { InlineText } from '../src/canvas/InlineText.js';
import { readInlineFromDom } from '../src/canvas/domInline.js';

/**
 * Regression tests for destructive canvas editing.
 *
 * The original implementation read `element.textContent` and rebuilt the content as a
 * single plain run. Focusing and blurring a bullet — without typing — silently removed
 * bold, turned inline math into rendered glyphs, and re-escaped a preserved raw macro
 * into `\textbackslash{}vspace\{2mm\}`, which then printed as visible characters in the
 * compiled PDF.
 *
 * These tests render with the real component and read back with the real reader, so
 * they cover the actual pairing rather than a reimplementation of it.
 */

/** Render rich text the way the canvas does, into a live editable container. */
function renderToContainer(content: RichText): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(<InlineText content={content} />);
  return host;
}

/** Simulate focus-then-blur with no typing. */
function roundTripThroughDom(content: RichText): RichText {
  return readInlineFromDom(renderToContainer(content), content);
}

describe('editing preserves inline structure', () => {
  it('keeps a raw LaTeX island byte-exact when the element is not typed in', () => {
    const content: RichText = [
      { t: 'text', s: 'Point with ' },
      { t: 'raw', tex: '\\vspace{2mm}' },
      { t: 'text', s: ' unknown macro' },
    ];
    expect(roundTripThroughDom(content)).toEqual(content);
  });

  it('keeps bold and italic', () => {
    const content: RichText = [
      { t: 'text', s: 'Mix of ' },
      { t: 'style', style: 'bf', children: plain('bold') },
      { t: 'text', s: ' and ' },
      { t: 'style', style: 'it', children: plain('italic') },
      { t: 'text', s: '.' },
    ];
    expect(roundTripThroughDom(content)).toEqual(content);
  });

  it('keeps inline math as its source, not its rendered glyphs', () => {
    const content: RichText = [
      { t: 'text', s: 'Energy is ' },
      { t: 'math', tex: 'E = mc^2' },
      { t: 'text', s: '.' },
    ];
    const out = roundTripThroughDom(content);
    expect(out).toEqual(content);
    const math = out.find((n) => n.t === 'math');
    if (math?.t !== 'math') throw new Error('math node lost');
    expect(math.tex).toBe('E = mc^2');
  });

  it('keeps citations, refs and symbols', () => {
    const content: RichText = [
      { t: 'cite', keys: ['vaswani2017', 'he2016'] },
      { t: 'text', s: ' see ' },
      { t: 'ref', kind: 'ref', target: 'fig:arch' },
      { t: 'text', s: ' ' },
      { t: 'sym', name: 'ldots' },
    ];
    expect(roundTripThroughDom(content)).toEqual(content);
  });

  it('preserves surrounding structure when the plain text is edited', () => {
    const content: RichText = [
      { t: 'text', s: 'Before ' },
      { t: 'raw', tex: '\\vspace{2mm}' },
      { t: 'text', s: ' after' },
    ];
    const host = renderToContainer(content);

    // Simulate the user typing in the trailing text run only.
    const textNodes = Array.from(host.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
    const last = textNodes[textNodes.length - 1]!;
    last.textContent = ' after EDITED';

    expect(readInlineFromDom(host, content)).toEqual([
      { t: 'text', s: 'Before ' },
      { t: 'raw', tex: '\\vspace{2mm}' },
      { t: 'text', s: ' after EDITED' },
    ]);
  });

  it('drops a raw island only when the user actually deletes it', () => {
    const content: RichText = [
      { t: 'text', s: 'Keep ' },
      { t: 'raw', tex: '\\vspace{2mm}' },
    ];
    const host = renderToContainer(content);
    host.querySelector('[data-bp-i="1"]')!.remove();

    expect(readInlineFromDom(host, content)).toEqual([{ t: 'text', s: 'Keep ' }]);
  });

  it('marks non-textual nodes non-editable so a caret cannot corrupt them', () => {
    const host = renderToContainer([
      { t: 'raw', tex: '\\vspace{2mm}' },
      { t: 'math', tex: 'x^2' },
      { t: 'style', style: 'bf', children: plain('bold') },
    ]);
    expect(host.querySelector('[data-bp-i="0"]')!.getAttribute('contenteditable')).toBe('false');
    expect(host.querySelector('[data-bp-i="1"]')!.getAttribute('contenteditable')).toBe('false');
    // Styled text stays editable: you must be able to type inside bold.
    expect(host.querySelector('[data-bp-i="2"]')!.getAttribute('contenteditable')).toBeNull();
  });

  it('survives the full path to emitted LaTeX', () => {
    const deck = newDeck({ title: 'T' });
    const content: RichText = [
      { t: 'text', s: 'Point with ' },
      { t: 'raw', tex: '\\vspace{2mm}' },
      { t: 'text', s: ' and ' },
      { t: 'style', style: 'bf', children: plain('bold') },
    ];
    deck.nodes = [
      newFrame('Slide', [
        { id: 'e1', kind: 'text', placement: { mode: 'flow' }, content },
      ]),
    ];

    const before = emitDeck(deck).tex;
    const edited = { ...deck, nodes: deck.nodes.map((n) =>
      n.kind === 'frame'
        ? { ...n, children: n.children.map((el) =>
            el.kind === 'text' ? { ...el, content: roundTripThroughDom(el.content) } : el) }
        : n) };

    expect(emitDeck(edited).tex).toBe(before);
    expect(before).toContain('\\vspace{2mm}');
    expect(before).toContain('\\textbf{bold}');
    // The old bug escaped the macro into literal characters.
    expect(emitDeck(edited).tex).not.toContain('\\textbackslash{}vspace');
  });
});
