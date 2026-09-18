import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame, newListElement, newTextElement, plain } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import type { Deck } from '../src/model/types.js';
import { expectRoundTrip } from './helpers/roundTrip.js';

/**
 * The fixpoint property: emitting a deck, parsing it back, and emitting again must
 * produce byte-identical output. If this ever fails, the visual editor and the source
 * view disagree about what the document is.
 */
function expectFixpoint(deck: Deck): { round: ReturnType<typeof parseDeck>; tex: string } {
  // Bytes alone prove nothing about parsing: an all-raw deck is byte-perfect. The shared
  // helper adds the guard, the whole-document fixpoint and the kind census.
  return expectRoundTrip(deck);
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
          placement: { mode: 'absolute', x: 20, y: 35.5, w: 60, driver: 'textpos' },
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

describe('images', () => {
  const imageDeck = (extra: Record<string, unknown> = {}): Deck => {
    const deck = newDeck({ title: 'T' });
    deck.resources = [{
      id: 'res1', path: 'images/plot.png', kind: 'image', mime: 'image/png',
      bytes: 1234, sha256: 'abc', originalName: 'plot.png',
    }];
    deck.nodes = [newFrame('Figure', [{
      id: 'img1', kind: 'image', placement: { mode: 'flow' },
      resourceId: 'res1', keepAspect: true,
      width: { v: 0.6, u: 'textwidth' },
      ...extra,
    } as never])];
    return deck;
  };

  it('round-trips a plain image', () => {
    const { round, tex } = expectFixpoint(imageDeck());
    expect(tex).toContain('\\includegraphics[width=0.6\\textwidth]{images/plot.png}');
    expect(tex).toContain('\\usepackage{graphicx}');
    expect(round.guard.ok).toBe(true);
  });

  it('round-trips a captioned image as a figure', () => {
    const { round, tex } = expectFixpoint(imageDeck({ caption: plain('Results over time') }));
    expect(tex).toContain('\\begin{figure}');
    expect(tex).toContain('\\caption{Results over time}');
    expect(round.guard.ok).toBe(true);
  });

  it('keeps the resource id stable across a reparse, so stored bytes are not orphaned', () => {
    const deck = imageDeck();
    const first = parseDeck(emitDeck(deck).tex, { newId: makeSeededIdFactory('a') }).deck;
    const second = parseDeck(emitDeck(first).tex, {
      previous: first, newId: makeSeededIdFactory('b'),
    }).deck;
    expect(second.resources[0]?.id).toBe(first.resources[0]?.id);
    expect(second.resources[0]?.path).toBe('images/plot.png');
  });

  it('round-trips alignment', () => {
    for (const [align, env] of [
      ['center', 'center'], ['left', 'flushleft'], ['right', 'flushright'],
    ] as const) {
      const { round, tex } = expectFixpoint(imageDeck({ align }));
      expect(tex).toContain(`\\begin{${env}}`);
      const frame = round.deck.nodes.find((n) => n.kind === 'frame');
      if (frame?.kind !== 'frame') throw new Error('expected frame');
      const img = frame.children[0];
      if (img?.kind !== 'image') throw new Error('expected image');
      expect(img.align).toBe(align);
    }
  });

  it('round-trips a crop as trim plus clip', () => {
    const trim = { left: 64, bottom: 36, right: 12, top: 8 };
    const { round, tex } = expectFixpoint(imageDeck({ trim }));
    expect(tex).toContain('trim=64bp 36bp 12bp 8bp');
    expect(tex).toContain('clip');

    const frame = round.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected frame');
    const img = frame.children[0];
    if (img?.kind !== 'image') throw new Error('expected image');
    expect(img.trim).toEqual(trim);
  });

  it('emits no trim for an all-zero crop', () => {
    const tex = emitDeck(imageDeck({ trim: { left: 0, bottom: 0, right: 0, top: 0 } })).tex;
    expect(tex).not.toContain('trim=');
    expect(tex).not.toContain('clip');
  });

  it('refuses to model trim without clip, since that is not a crop', () => {
    const src = [
      '\\documentclass[aspectratio=169,11pt]{beamer}',
      '\\usetheme{Madrid}',
      '\\begin{document}',
      '\\begin{frame}',
      '  \\includegraphics[trim=10bp 10bp 0bp 0bp]{a.png}',
      '\\end{frame}',
      '\\end{document}',
    ].join('\n');
    const r = parseDeck(src, { newId: makeSeededIdFactory('r') });
    const frame = r.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected frame');
    const img = frame.children[0];
    if (img?.kind !== 'image') throw new Error('expected image');
    expect(img.trim).toBeUndefined();
    // Preserved exactly as written, units and all, rather than re-serialised.
    expect(emitDeck(r.deck).tex).toContain('trim=10bp 10bp 0bp 0bp');
    expect(emitDeck(r.deck).tex).not.toContain('clip');
  });

  it('preserves graphics options it cannot model', () => {
    const src = [
      '\\documentclass[aspectratio=169,11pt]{beamer}',
      '\\usetheme{Madrid}',
      '\\begin{document}',
      '\\begin{frame}',
      '  \\includegraphics[width=5cm,trim=1 2 3 4,clip]{a.png}',
      '\\end{frame}',
      '\\end{document}',
    ].join('\n');
    const r = parseDeck(src, { newId: makeSeededIdFactory('r') });
    const out = emitDeck(r.deck).tex;
    expect(out).toContain('trim=1 2 3 4');
    expect(out).toContain('clip');
    expect(out).toContain('width=5cm');
  });

  it('declines a figure containing anything it cannot model, keeping it raw', () => {
    const src = [
      '\\documentclass[aspectratio=169,11pt]{beamer}',
      '\\usetheme{Madrid}',
      '\\begin{document}',
      '\\begin{frame}',
      '  \\begin{figure}',
      '    \\includegraphics{a.png}',
      '    \\begin{tikzpicture}\\draw (0,0);\\end{tikzpicture}',
      '  \\end{figure}',
      '\\end{frame}',
      '\\end{document}',
    ].join('\n');
    const r = parseDeck(src, { newId: makeSeededIdFactory('r') });
    const frame = r.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected frame');
    expect(frame.children[0]?.kind).toBe('raw');
    expect(emitDeck(r.deck).tex).toContain('tikzpicture');
  });
});


describe('display math', () => {
  const mathDeck = (env: string, tex: string): Deck => {
    const deck = newDeck({ title: 'T' });
    deck.nodes = [newFrame('Math', [
      { id: 'm1', kind: 'math', placement: { mode: 'flow' }, env, tex } as never,
    ])];
    return deck;
  };

  it('round-trips each supported environment', () => {
    for (const env of ['equation', 'equation*', 'align', 'align*', 'gather', 'gather*']) {
      const { round, tex } = expectFixpoint(mathDeck(env, '  a = b'));
      expect(tex).toContain(`\\begin{${env}}`);
      const frame = round.deck.nodes.find((n) => n.kind === 'frame');
      if (frame?.kind !== 'frame') throw new Error('expected frame');
      const m = frame.children[0];
      if (m?.kind !== 'math') throw new Error(`expected math for ${env}`);
      expect(m.env).toBe(env);
    }
  });

  it('round-trips \\[ ... \\] as displaymath', () => {
    const { round, tex } = expectFixpoint(mathDeck('displaymath', '  E = mc^2'));
    expect(tex).toContain('\\[');
    expect(tex).toContain('\\]');
    const frame = round.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected frame');
    expect((frame.children[0] as { env?: string }).env).toBe('displaymath');
  });

  it('keeps the body byte-exact, including alignment and line breaks', () => {
    const body = '  f(x) &= ax^2 + bx + c \\\\\n      &= a(x - h)^2 + k';
    const { round } = expectFixpoint(mathDeck('align', body));
    const frame = round.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected frame');
    const m = frame.children[0];
    if (m?.kind !== 'math') throw new Error('expected math');
    expect(m.tex).toBe(body);
  });

  it('does not confuse align with equation', () => {
    // The lexer captures math environments opaquely; before it recorded the name,
    // every one of them came back as the same environment.
    const src = [
      '\\documentclass[aspectratio=169,11pt]{beamer}',
      '\\usetheme{Madrid}',
      '\\begin{document}',
      '\\begin{frame}',
      '\\begin{align}',
      'x &= 1',
      '\\end{align}',
      '\\end{frame}',
      '\\end{document}',
    ].join('\n');
    const r = parseDeck(src, { newId: makeSeededIdFactory('r') });
    expect(emitDeck(r.deck).tex).toContain('\\begin{align}');
    expect(emitDeck(r.deck).tex).not.toContain('\\begin{equation}');
  });

  it('leaves an unmodelled math environment raw rather than relabelling it', () => {
    const src = [
      '\\documentclass[aspectratio=169,11pt]{beamer}',
      '\\usetheme{Madrid}',
      '\\begin{document}',
      '\\begin{frame}',
      '\\begin{multline}',
      'a + b',
      '\\end{multline}',
      '\\end{frame}',
      '\\end{document}',
    ].join('\n');
    const r = parseDeck(src, { newId: makeSeededIdFactory('r') });
    const frame = r.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected frame');
    expect(frame.children[0]?.kind).toBe('raw');
    expect(emitDeck(r.deck).tex).toContain('\\begin{multline}');
  });

  it('adds amsmath when the deck contains display math', () => {
    expect(emitDeck(mathDeck('align', 'x')).tex).toContain('\\usepackage{amsmath}');
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
