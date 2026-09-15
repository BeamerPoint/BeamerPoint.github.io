import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildCst } from '../src/parse/lexer.js';
import type { CstNode } from '../src/parse/cst.js';
import { escapeText, unescapeText } from '../src/emit/escape.js';

/** Every byte of the source must be covered by exactly one top-level node span. */
function assertSpansCoverSource(src: string, root: CstNode[]): void {
  let cursor = 0;
  for (const node of root) {
    expect(node.span.start).toBe(cursor);
    expect(node.span.end).toBeGreaterThan(node.span.start);
    cursor = node.span.end;
  }
  expect(cursor).toBe(src.length);
}

describe('buildCst', () => {
  it('is total: never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (s) => {
        expect(() => buildCst(s)).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });

  it('covers every byte of the source with top-level spans', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (s) => {
        const { root } = buildCst(s);
        assertSpansCoverSource(s, root);
      }),
      { numRuns: 500 },
    );
  });

  it('parses a frame with an itemize', () => {
    const src = [
      '\\begin{frame}{Results}',
      '  \\begin{itemize}',
      '    \\item First',
      '    \\item Second',
      '  \\end{itemize}',
      '\\end{frame}',
    ].join('\n');

    const { root, diagnostics } = buildCst(src);
    expect(diagnostics).toEqual([]);

    const frame = root.find((n) => n.n === 'env');
    expect(frame).toBeDefined();
    if (frame?.n !== 'env') throw new Error('expected env');
    expect(frame.name).toBe('frame');
    expect(frame.args).toHaveLength(1);

    const itemize = frame.children.find((n) => n.n === 'env');
    if (itemize?.n !== 'env') throw new Error('expected nested env');
    expect(itemize.name).toBe('itemize');
    const items = itemize.children.filter((n) => n.n === 'cmd' && n.name === 'item');
    expect(items).toHaveLength(2);
  });

  it('captures lstlisting bodies opaquely, ignoring markup inside', () => {
    const src = [
      '\\begin{lstlisting}[language=Python]',
      'x = {1: "a"}  % not a comment',
      'y = 100 \\ not a command',
      '\\end{lstlisting}',
    ].join('\n');

    const { root, diagnostics } = buildCst(src);
    expect(diagnostics).toEqual([]);
    const verb = root.find((n) => n.n === 'verb');
    if (verb?.n !== 'verb') throw new Error('expected verb node');
    expect(verb.name).toBe('lstlisting');
    expect(verb.body).toContain('% not a comment');
    expect(verb.body).toContain('\\ not a command');
  });

  it('handles \\verb with an arbitrary delimiter', () => {
    const { root } = buildCst('text \\verb|a{b}c| more');
    const verb = root.find((n) => n.n === 'verb');
    if (verb?.n !== 'verb') throw new Error('expected verb node');
    expect(verb.body).toBe('a{b}c');
  });

  it('treats a comment as running to end of line only', () => {
    const { root } = buildCst('a % note\nb');
    const comment = root.find((n) => n.n === 'comment');
    if (comment?.n !== 'comment') throw new Error('expected comment');
    expect(comment.value).toBe(' note');
  });

  it('records unbalanced braces as an error node rather than throwing', () => {
    const { root, diagnostics } = buildCst('\\textbf{unclosed');
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(root.some((n) => n.n === 'error')).toBe(true);
  });

  it('separates paragraphs on a blank line', () => {
    const { root } = buildCst('one\n\ntwo');
    expect(root.some((n) => n.n === 'parbreak')).toBe(true);
  });

  it('captures inline and display math verbatim', () => {
    const { root } = buildCst('see $E = mc^2$ and \\[ x_1 \\] done');
    const maths = root.filter((n) => n.n === 'math');
    expect(maths).toHaveLength(2);
    if (maths[0]?.n !== 'math' || maths[1]?.n !== 'math') throw new Error('expected math');
    expect(maths[0].body).toBe('E = mc^2');
    expect(maths[0].display).toBe(false);
    expect(maths[1].body.trim()).toBe('x_1');
    expect(maths[1].display).toBe(true);
  });
});

describe('escapeText / unescapeText', () => {
  it('round-trips arbitrary text', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        expect(unescapeText(escapeText(s))).toBe(s);
      }),
      { numRuns: 1000 },
    );
  });

  it('escapes every LaTeX special character', () => {
    expect(escapeText('100% & #1 $x_2^3 {a} \\ ~')).toBe(
      '100\\% \\& \\#1 \\$x\\_2\\textasciicircum{}3 \\{a\\} \\textbackslash{} \\textasciitilde{}',
    );
  });

  it('declines rather than guessing on real markup', () => {
    expect(unescapeText('\\textbf{bold}')).toBeNull();
    expect(unescapeText('a $x$ b')).toBeNull();
    expect(unescapeText('a & b')).toBeNull();
  });
});
