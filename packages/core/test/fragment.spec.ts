/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { describe, expect, it } from 'vitest';
import { richTextFromTex } from '../src/parse/fragment.js';
import { emitInline } from '../src/emit/inline.js';

/**
 * A LaTeX fragment typed into a one-line field (F-018).
 *
 * The contract: what comes back emits to exactly what was typed, or nothing comes back.
 */

describe('richTextFromTex', () => {
  it.each([
    'Alice Smith \\and Bob Jones',
    '\\today',
    'Alice\\inst{1} \\and Bob\\inst{2}',
    'Line one\\\\Line two',
    'Energy $E = mc^2$',
    '\\textbf{Bold} title',
    'R\\&D',
    'A \\mymacro{x} B',
  ])('reads %s back to the same bytes', (tex) => {
    const rt = richTextFromTex(tex);
    expect(rt).not.toBeNull();
    expect(emitInline(rt!)).toBe(tex);
  });

  it('keeps a macro it does not model as a raw island, not as text', () => {
    const rt = richTextFromTex('Alice \\and Bob')!;
    expect(rt.some((n) => n.t === 'raw' || n.t === 'sym')).toBe(true);
    expect(rt.every((n) => n.t !== 'text' || !n.s.includes('and'))).toBe(true);
  });

  it('reads an empty field as empty', () => {
    expect(richTextFromTex('   ')).toEqual([]);
  });

  it.each([
    ['an unbalanced brace, as while typing one', '\\textbf{Bold'],
    ['a stray closing brace', 'Bold}'],
    ['a comment, which would swallow the closing brace', 'A % note'],
    ['a bare ampersand', 'R&D'],
    ['a bare hash', 'No #1'],
    ['a bare underscore', 'snake_case'],
    ['a paragraph break', 'one\n\ntwo'],
    ['\\verb, which cannot sit in an argument', '\\verb|x|'],
    ['an unsafe character inside a group', '\\textbf{R&D}'],
  ])('refuses %s', (_why, tex) => {
    expect(richTextFromTex(tex)).toBeNull();
  });
});
