import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame, newTikzElement, newTextElement } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import { derivePackages } from '../src/emit/derivePackages.js';
import { TIKZ_LIBRARIES } from '../src/emit/tikz.js';
import { addShape, shapeFromDrag } from '../src/model/shapeOps.js';
import type { Deck, TikzElement, TikzShape } from '../src/model/types.js';

function deckWith(el: TikzElement): Deck {
  const deck = newDeck({ title: 'T' });
  deck.nodes = [newFrame('Diagram', [el])];
  return deck;
}

function roundTrip(deck: Deck): { tex: string; round: ReturnType<typeof parseDeck> } {
  const tex = emitDeck(deck).tex;
  const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });
  expect(emitDeck(round.deck).tex).toBe(tex);
  return { tex, round };
}

function firstPicture(round: ReturnType<typeof parseDeck>): TikzElement | undefined {
  for (const node of round.deck.nodes) {
    if (node.kind !== 'frame') continue;
    const found = node.children.find((c) => c.kind === 'tikz');
    if (found?.kind === 'tikz') return found;
  }
  return undefined;
}

/** A picture holding one shape of each kind the UI can draw. */
function sampler(): TikzElement {
  let el = newTikzElement(100, 60);
  const shapes: TikzShape[] = [
    { id: 'box', t: 'rect', x: 10, y: 5, w: 30, h: 15, style: { draw: { k: 'structure' }, fill: { k: 'mix', expr: 'blue!20' } } },
    { id: 'round', t: 'rect', x: 10, y: 25, w: 30, h: 15, rx: 2, style: { draw: { k: 'named', name: 'black' } } },
    { id: 'oval', t: 'ellipse', cx: 70, cy: 12.5, rx: 15, ry: 10, style: { fill: { k: 'mix', expr: 'red!15' } } },
    { id: 'poly', t: 'path', points: [[10, 45], [40, 45], [25, 58]], closed: true, smooth: false, style: { draw: { k: 'named', name: 'black' }, dash: 'dashed' } },
    { id: 'curve', t: 'path', points: [[55, 45], [70, 55], [90, 45]], closed: false, smooth: true, style: { lineWidth: { v: 0.6, u: 'mm' } } },
    { id: 'link', t: 'arrow', from: { kind: 'shape', shapeId: 'box', side: 'e' }, to: { kind: 'shape', shapeId: 'oval', side: 'w' }, head: 'latex', style: {} },
    { id: 'bent', t: 'arrow', from: { kind: 'point', x: 10, y: 42 }, to: { kind: 'point', x: 45, y: 42 }, bend: 25, head: 'stealth', style: { draw: { k: 'named', name: 'gray' } } },
    { id: 'tag', t: 'node', x: 45, y: 30, content: [{ t: 'text', s: 'Label' }], shape: 'none', style: { textColor: { k: 'structure' } } },
  ];
  for (const s of shapes) el = addShape(el, s);
  return el;
}

describe('tikz shapes', () => {
  it('round-trips every shape kind without degrading', () => {
    const { tex, round } = roundTrip(deckWith(sampler()));

    expect(tex).toContain(TIKZ_LIBRARIES);
    expect(tex).toContain('\\useasboundingbox (0mm,0mm) rectangle (100mm,-60mm);');
    expect(round.guard.ok).toBe(true);
    expect(round.health.demoted).toBe(0);

    const pic = firstPicture(round);
    expect(pic).toBeDefined();
    expect(pic!.mode).toBe('shapes');
    expect(pic!.canvasSize).toEqual({ w: 100, h: 60 });
    expect(pic!.shapes?.map((s) => s.t))
      .toEqual(['rect', 'rect', 'ellipse', 'path', 'path', 'arrow', 'arrow', 'node']);
  });

  it('stores millimetres from the top-left and emits them with y negated', () => {
    // TikZ's y axis points up. Verified against the engine: a node asked for at
    // (40mm, 20mm) measured 40.00mm right and 20.00mm DOWN from the origin.
    const el = addShape(newTikzElement(80, 40), {
      id: 'a', t: 'rect', x: 40, y: 20, w: 10, h: 5, style: {},
    });
    const { tex, round } = roundTrip(deckWith(el));

    expect(tex).toContain('at (40mm,-20mm)');
    const shape = firstPicture(round)!.shapes![0]!;
    expect(shape).toMatchObject({ t: 'rect', x: 40, y: 20, w: 10, h: 5 });
  });

  it('keeps an arrow attached to the shapes it joins', () => {
    const pic = firstPicture(roundTrip(deckWith(sampler())).round)!;
    const arrow = pic.shapes!.find((s) => s.t === 'arrow' && s.from.kind === 'shape');
    expect(arrow).toBeDefined();
    expect(arrow).toMatchObject({
      from: { kind: 'shape', side: 'e' },
      to: { kind: 'shape', side: 'w' },
      head: 'latex',
    });

    // The anchor must name the rectangle, whatever id reassignment did to it.
    const target = (arrow as Extract<TikzShape, { t: 'arrow' }>).from;
    const box = pic.shapes!.find((s) => s.t === 'rect' && s.x === 10 && s.y === 5);
    expect(target.kind === 'shape' && target.shapeId).toBe(box!.id);
  });

  it('derives the tikz libraries, without which nothing compiles', () => {
    const packages = derivePackages(deckWith(sampler()));
    const tikz = packages.find((p) => p.name === 'tikz');
    expect(tikz?.setup).toEqual([TIKZ_LIBRARIES]);

    // Emitted once, not once per picture.
    const deck = deckWith(sampler());
    (deck.nodes[0] as { children: unknown[] }).children.push(sampler());
    const tex = emitDeck(deck).tex;
    expect(tex.split('\\usetikzlibrary').length - 1).toBe(1);
  });

  it('gives a picture its own paragraph, like a tabular', () => {
    const deck = newDeck({ title: 'T' });
    deck.nodes = [newFrame('Mixed', [
      newTextElement('Before the diagram.'),
      newTikzElement(60, 30),
      newTextElement('After the diagram.'),
    ])];
    const { tex } = roundTrip(deck);
    expect(tex).toMatch(/Before the diagram\.\n\n\s*\\begin\{tikzpicture\}/);
    expect(tex).toMatch(/\\end\{tikzpicture\}\n\n\s*After the diagram\./);
  });

  it('keeps a hand-written picture verbatim as a raw-mode element', () => {
    const src = [
      '\\begin{tikzpicture}[scale=2]',
      '  \\foreach \\i in {1,...,4}',
      '    \\draw (\\i,0) circle (0.4);',
      '\\end{tikzpicture}',
    ].join('\n');

    const deck = newDeck({ title: 'T' });
    deck.nodes = [newFrame('Hand written', [
      { id: 'r1', kind: 'raw', placement: { mode: 'flow' }, tex: src, reason: 'user-forced' },
    ])];
    const tex = emitDeck(deck).tex;
    const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });

    const pic = firstPicture(round);
    expect(pic).toBeDefined();
    expect(pic!.mode).toBe('raw');
    expect(pic!.pictureOptions).toBe('[scale=2]');
    expect(pic!.raw).toContain('\\foreach');

    // The body is byte-exact, and once it is a picture rather than a raw block the
    // round trip is a fixpoint. It is not one on the FIRST pass, because becoming a
    // picture is what makes the deck derive \usepackage{tikz}.
    expect(pic!.raw).toBe('  \\foreach \\i in {1,...,4}\n    \\draw (\\i,0) circle (0.4);');
    const once = emitDeck(round.deck).tex;
    const twice = parseDeck(once, { newId: makeSeededIdFactory('s') });
    expect(emitDeck(twice.deck).tex).toBe(once);
    expect(firstPicture(twice)?.mode).toBe('raw');
  });

  it('does not swallow the tikz wrapper around an absolutely-placed element', () => {
    // `remember picture,overlay` is the absolute-placement driver. Reading it as a
    // diagram would lose the element inside it along with its position.
    const src = [
      '\\begin{tikzpicture}[remember picture,overlay]',
      '  \\node[anchor=north west,inner sep=0pt,text width=40mm]',
      '    at ([xshift=20mm,yshift=-15mm]current page.north west) \\bgroup',
      '  Placed text',
      '  \\egroup;',
      '\\end{tikzpicture}',
    ].join('\n');

    const deck = newDeck({ title: 'T' });
    deck.nodes = [newFrame('Placed', [
      { id: 'r1', kind: 'raw', placement: { mode: 'flow' }, tex: src, reason: 'user-forced' },
    ])];
    const tex = emitDeck(deck).tex;
    const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });

    expect(firstPicture(round)).toBeUndefined();
    expect(emitDeck(round.deck).tex).toBe(tex);
  });

  it('builds shapes from a drag in either direction', () => {
    const a = shapeFromDrag('rect', { x: 50, y: 40 }, { x: 10, y: 10 });
    expect(a).toMatchObject({ t: 'rect', x: 10, y: 10, w: 40, h: 30 });

    const b = shapeFromDrag('ellipse', { x: 10, y: 10 }, { x: 50, y: 30 });
    expect(b).toMatchObject({ t: 'ellipse', cx: 30, cy: 20, rx: 20, ry: 10 });

    // A line keeps the drag's direction: its start is where the pointer went down.
    const c = shapeFromDrag('line', { x: 50, y: 40 }, { x: 10, y: 10 });
    expect(c).toMatchObject({ t: 'path', points: [[50, 40], [10, 10]] });
  });
});
