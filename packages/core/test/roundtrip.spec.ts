import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame, newListElement, newTextElement, plain } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import type { Deck } from '../src/model/types.js';

/**
 * The fixpoint property: emitting a deck, parsing it back, and emitting again must
 * produce byte-identical output. If this ever fails, the visual editor and the source
 * view disagree about what the document is.
 */
function expectFixpoint(deck: Deck): { round: ReturnType<typeof parseDeck>; tex: string } {
  const tex = emitDeck(deck).tex;
  const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });
  const again = emitDeck(round.deck).tex;
  expect(again).toBe(tex);
  return { round, tex };
}

describe('round trip fixpoint', () => {
  it('holds for a default new deck', () => {
    const { round } = expectFixpoint(newDeck({ title: 'Demo', author: 'A. Mohebbi' }));
    expect(round.guard.ok).toBe(true);
    expect(round.health.demoted).toBe(0);
  });

  it('holds for text, lists and nested lists', () => {
    const deck = newDeck({ title: 'T' });
    deck.nodes = [
      newFrame('Content', [
        newTextElement('A paragraph with 100% specials & _underscores_ and #hashes.'),
        {
          id: 'l1',
          kind: 'list',
          placement: { mode: 'flow' },
          listType: 'itemize',
          items: [
            { id: 'i1', content: plain('First') },
            {
              id: 'i2',
              content: plain('Second'),
              sublist: {
                id: 'l2',
                kind: 'list',
                placement: { mode: 'flow' },
                listType: 'enumerate',
                items: [
                  { id: 'i3', content: plain('Nested a') },
                  { id: 'i4', content: plain('Nested b') },
                ],
              },
            },
          ],
        },
      ]),
    ];
    const { round } = expectFixpoint(deck);
    expect(round.guard.ok).toBe(true);
  });

  it('holds for blocks, columns and inline styles', () => {
    const deck = newDeck({ title: 'T' });
    deck.nodes = [
      newFrame('Layout', [
        {
          id: 'c1',
          kind: 'columns',
          placement: { mode: 'flow' },
          columns: [
            {
              id: 'col1',
              width: { v: 0.48, u: 'textwidth' },
              children: [
                {
                  id: 'b1',
                  kind: 'block',
                  placement: { mode: 'flow' },
                  variant: 'alertblock',
                  title: plain('Important'),
                  children: [newTextElement('Inside the block.')],
                },
              ],
            },
            {
              id: 'col2',
              width: { v: 0.48, u: 'textwidth' },
              valign: 't',
              children: [
                {
                  id: 't2',
                  kind: 'text',
                  placement: { mode: 'flow' },
                  content: [
                    { t: 'text', s: 'Mix of ' },
                    { t: 'style', style: 'bf', children: plain('bold') },
                    { t: 'text', s: ' and ' },
                    { t: 'style', style: 'it', children: plain('italic') },
                    { t: 'text', s: ' plus ' },
                    { t: 'math', tex: 'E = mc^2' },
                    { t: 'text', s: '.' },
                  ],
                },
              ],
            },
          ],
        },
      ]),
    ];
    const { round } = expectFixpoint(deck);
    expect(round.guard.ok).toBe(true);
  });

  it('holds for absolutely positioned elements', () => {
    const deck = newDeck({ title: 'T' });
    deck.nodes = [
      newFrame('Dragged', [
        {
          id: 'a1',
          kind: 'text',
          placement: { mode: 'absolute', x: 20, y: 35.5, w: 60, z: 0, driver: 'textpos' },
          content: plain('I was dragged here.'),
        },
      ]),
    ];
    const { round, tex } = expectFixpoint(deck);
    expect(tex).toContain('\\begin{textblock*}{60mm}(20mm,35.5mm)');
    expect(tex).toContain('\\usepackage[absolute,overlay]{textpos}');

    const frame = round.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected frame');
    expect(frame.children[0]?.placement).toMatchObject({ mode: 'absolute', x: 20, y: 35.5, w: 60 });
  });

  it('holds for a deck with sections and speaker notes', () => {
    const deck = newDeck({ title: 'T' });
    deck.nodes = [
      { kind: 'section', id: 's1', level: 'section', title: plain('Method'), starred: false },
      {
        ...newFrame('With notes', [newTextElement('Body.')]),
        notes: [{ id: 'n1', content: plain('Mention the ablation study.') }],
      },
    ];
    const { round, tex } = expectFixpoint(deck);
    expect(tex).toContain('\\section{Method}');
    expect(tex).toContain('\\note{Mention the ablation study.}');
    expect(round.guard.ok).toBe(true);
  });
});

describe('TeX program selection', () => {
  it('round-trips the "% !TEX program" magic comment', () => {
    const deck = newDeck({ title: 'T' });
    deck.preamble.theme = { name: 'metropolis', options: [] };
    deck.preamble.texProgram = 'xelatex';

    const { round, tex } = expectFixpoint(deck);
    expect(tex.startsWith('% !TEX program = xelatex')).toBe(true);
    expect(round.deck.preamble.texProgram).toBe('xelatex');
  });

  it('does not emit the magic comment when no program is set', () => {
    const tex = emitDeck(newDeck({ title: 'T' })).tex;
    expect(tex).not.toContain('!TEX program');
  });

  it('absorbs the magic comment rather than keeping it as a preamble chunk', () => {
    // Re-emitting it from a chunk as well would duplicate it on every edit.
    const deck = newDeck({ title: 'T' });
    deck.preamble.texProgram = 'lualatex';
    const parsed = parseDeck(emitDeck(deck).tex, { newId: makeSeededIdFactory('p') });
    expect(parsed.deck.preamble.custom).toHaveLength(0);
    expect(emitDeck(parsed.deck).tex.match(/!TEX program/g)).toHaveLength(1);
  });
});

describe('degradation: unknown LaTeX is preserved, never lost', () => {
  const parse = (src: string) => parseDeck(src, { newId: makeSeededIdFactory('r') });

  it('keeps an unrecognised environment as a raw element', () => {
    const src = [
      '\\documentclass[aspectratio=169,11pt]{beamer}',
      '\\usetheme{Madrid}',
      '\\begin{document}',
      '\\begin{frame}',
      '  \\frametitle{Hi}',
      '  \\begin{tcolorbox}[colback=red!5]',
      '    Exotic content',
      '  \\end{tcolorbox}',
      '\\end{frame}',
      '\\end{document}',
    ].join('\n');

    const r = parse(src);
    const frame = r.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected frame');
    const raw = frame.children.find((e) => e.kind === 'raw');
    if (raw?.kind !== 'raw') throw new Error('expected raw element');
    expect(raw.tex).toContain('\\begin{tcolorbox}[colback=red!5]');
    expect(raw.tex).toContain('Exotic content');

    // And it survives a re-emit unchanged.
    expect(emitDeck(r.deck).tex).toContain('\\begin{tcolorbox}[colback=red!5]');
  });

  it('preserves overlay specifications even though v1 cannot author them', () => {
    const src = [
      '\\documentclass[aspectratio=169,11pt]{beamer}',
      '\\usetheme{Madrid}',
      '\\begin{document}',
      '\\begin{frame}',
      '  \\frametitle{Animated}',
      '  \\begin{itemize}',
      '    \\item<1-> Always',
      '    \\item<2-> Later',
      '  \\end{itemize}',
      '\\end{frame}',
      '\\end{document}',
    ].join('\n');

    const r = parse(src);
    const out = emitDeck(r.deck).tex;
    expect(out).toContain('<1->');
    expect(out).toContain('<2->');
  });

  it('preserves a verbatim listing byte-exactly, including LaTeX-looking content', () => {
    const code = 'if x > 0:  # note {a}\n    print("100%")';
    const src = [
      '\\documentclass[aspectratio=169,11pt]{beamer}',
      '\\usetheme{Madrid}',
      '\\begin{document}',
      '\\begin{frame}[fragile]',
      '  \\frametitle{Code}',
      '\\begin{lstlisting}[language=Python]',
      code,
      '\\end{lstlisting}',
      '\\end{frame}',
      '\\end{document}',
    ].join('\n');

    const r = parse(src);
    const out = emitDeck(r.deck).tex;
    expect(out).toContain(code);
    expect(out).toContain('[fragile]');
  });

  it('never drops bytes even from badly malformed input', () => {
    const src = '\\documentclass{beamer}\\begin{document}\\begin{frame}\\textbf{unclosed\\end{frame}\\end{document}';
    const r = parse(src);
    expect(() => emitDeck(r.deck)).not.toThrow();
    expect(r.health.parseErrors).toBeGreaterThan(0);
  });

  it('reports a raw ratio that reflects how much was modelled', () => {
    const clean = parse(emitDeck(newDeck({ title: 'X' })).tex);
    expect(clean.health.rawRatio).toBeLessThan(0.1);
  });
});

describe('id stability across reparse', () => {
  it('keeps ids of untouched elements when one word changes', () => {
    const deck = newDeck({ title: 'T' });
    deck.nodes = [
      newFrame('Slide', [newTextElement('alpha'), newListElement(['one', 'two'])]),
    ];
    const tex = emitDeck(deck).tex;
    const first = parseDeck(tex, { newId: makeSeededIdFactory('a') }).deck;

    const editedTex = emitDeck(first).tex.replace('alpha', 'ALPHA');
    const second = parseDeck(editedTex, { previous: first, newId: makeSeededIdFactory('b') }).deck;

    const f1 = first.nodes.find((n) => n.kind === 'frame');
    const f2 = second.nodes.find((n) => n.kind === 'frame');
    if (f1?.kind !== 'frame' || f2?.kind !== 'frame') throw new Error('expected frames');

    expect(f2.id).toBe(f1.id);
    // The list was untouched, so it must keep its identity.
    expect(f2.children[1]?.id).toBe(f1.children[1]?.id);
  });
});
