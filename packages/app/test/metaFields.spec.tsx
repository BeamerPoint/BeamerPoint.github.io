// @vitest-environment happy-dom
/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emitDeck, newDeck, newFrame, parseDeck } from '@beamerpoint/core';
import type { Deck } from '@beamerpoint/core';
import { useStore } from '../src/state/store.js';
import { FormatPane } from '../src/panels/FormatPane.js';

/**
 * The Presentation and slide-title fields (F-018).
 *
 * They were plain-text inputs over rich text: `\author{A \and B}` showed as "A  B" and
 * the first keystroke saved one author, and `\date{\today}` showed as an empty box. These
 * drive the real component with real input events, because the store was never the
 * problem -- the field was.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const st = () => useStore.getState();
let host: HTMLDivElement;
let root: Root;

function loadTex(body: string): void {
  const base = emitDeck({ ...newDeck({ title: 'T' }), nodes: [{ ...newFrame('S', []), id: 'f1' }] }).tex;
  const tex = base.replace(/\\author\{[^}]*\}|\\title\{/, (m) => (m.startsWith('\\title') ? `${body}\n\\title{` : ''));
  st().loadDeck(parseDeck(tex).deck as Deck);
}

function field(label: string): HTMLInputElement {
  const span = [...host.querySelectorAll('.bp-field > span')].find((s) => s.firstChild?.textContent === label);
  const input = span?.parentElement?.querySelector('input');
  if (!input) throw new Error(`no field ${label}`);
  return input;
}

/** What React's onChange listens for: the native value setter, then an input event. */
function type(input: HTMLInputElement, value: string): void {
  act(() => {
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    input.focus();
  });
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function blur(input: HTMLInputElement): void {
  act(() => {
    input.blur();
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('a presentation field holding LaTeX', () => {
  it('shows the LaTeX, not a flattened approximation of it', () => {
    loadTex('\\author{Alice Smith \\and Bob Jones}');
    act(() => root.render(<FormatPane />));
    expect(field('Author').value).toBe('Alice Smith \\and Bob Jones');
  });

  it('keeps \\and when the user adds to it', () => {
    loadTex('\\author{Alice Smith \\and Bob Jones}');
    act(() => root.render(<FormatPane />));
    const input = field('Author');
    type(input, 'Alice Smith \\and Bob Jones Jr.');
    blur(input);
    expect(st().source.text).toContain('\\author{Alice Smith \\and Bob Jones Jr.}');
  });

  it('shows \\today instead of an empty box', () => {
    loadTex('');
    act(() => root.render(<FormatPane />));
    expect(st().source.text).toContain('\\date{\\today}');
    expect(field('Date').value).toBe('\\today');
  });

  it('does not commit half-typed LaTeX, and flags it', () => {
    loadTex('\\author{Alice \\and Bob}');
    act(() => root.render(<FormatPane />));
    const input = field('Author');
    type(input, 'Alice \\and \\textbf{Bob');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(st().source.text).toContain('\\author{Alice \\and Bob}');
    type(input, 'Alice \\and \\textbf{Bob}');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(st().source.text).toContain('\\author{Alice \\and \\textbf{Bob}}');
  });
});

describe('a presentation field holding plain words', () => {
  it('is still edited as words, and escaped on the way out', () => {
    loadTex('\\author{Alice}');
    act(() => root.render(<FormatPane />));
    const input = field('Author');
    type(input, 'Alice & Bob R&D');
    blur(input);
    expect(st().source.text).toContain('\\author{Alice \\& Bob R\\&D}');
  });
});

describe('the slide title field', () => {
  it('keeps inline math in a title', () => {
    loadTex('');
    const frameId = st().deck.nodes.find((n) => n.kind === 'frame')!.id;
    st().setSlideTitle(frameId, [{ t: 'text', s: 'Energy ' }, { t: 'math', tex: 'E=mc^2' }]);
    st().selectSlide(frameId);
    act(() => root.render(<FormatPane />));
    const input = field('Slide title');
    expect(input.value).toBe('Energy $E=mc^2$');
    type(input, 'Energy $E=mc^2$ and more');
    blur(input);
    expect(st().source.text).toContain('\\frametitle{Energy $E=mc^2$ and more}');
  });
});
