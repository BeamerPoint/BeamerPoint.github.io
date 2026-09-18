import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame, newTikzElement } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import { addShape, setShapeLabel } from '../src/model/shapeOps.js';
import type { Deck, TikzElement, TikzShape } from '../src/model/types.js';
import { expectRoundTrip } from './helpers/roundTrip.js';

/**
 * Text written inside a rectangle or an ellipse.
 *
 * Both already emit as named TikZ nodes with an empty body, so a label is that body
 * filled in — no second node and no extra id, which is what keeps an arrow attached to
 * the one shape.
 *
 * The measurements that shaped it, taken against the bundled engine on a 40x20mm
 * rectangle by reading the node's own anchors back out of the log:
 *
 * | node | width |
 * | --- | --- |
 * | empty body | 40.14mm |
 * | a label too long for it | **56.26mm** |
 * | the same, with `text width=40mm` | 40.14mm |
 *
 * A node GROWS to fit its text, so without `text width` the canvas draws 40 and the PDF
 * is 56. An ellipse needs a narrower box still — `text width=40mm` grew a 40mm ellipse
 * to 56.71mm, because the shape library sizes a shape to CONTAIN its text box rather
 * than fill it. `rx * sqrt(2)`, the widest rectangle that fits inside it, held it at
 * 40.14.
 */

const RECT: TikzShape = { id: 'r1', t: 'rect', x: 10, y: 10, w: 40, h: 20, style: {} };
const OVAL: TikzShape = { id: 'e1', t: 'ellipse', cx: 70, cy: 20, rx: 20, ry: 10, style: {} };

function deckWith(el: TikzElement): Deck {
  const base = newDeck({ title: 'T' });
  return { ...base, nodes: [newFrame('S', [el])] };
}

function withShapes(...shapes: TikzShape[]): TikzElement {
  return shapes.reduce(addShape, newTikzElement(120, 60));
}

function texOf(el: TikzElement): string {
  // Anything the app emits from its own model must come back as the same model. Tests
  // that exercise a DECLINE tamper with the text afterwards, so this never blocks them.
  return expectRoundTrip(deckWith(el)).tex;
}

function round(tex: string) {
  return parseDeck(tex, { newId: makeSeededIdFactory('r') });
}

function shapesOf(tex: string): TikzShape[] {
  const frame = round(tex).deck.nodes.find((n) => n.kind === 'frame');
  const el = frame?.kind === 'frame' ? frame.children[0] : undefined;
  return el?.kind === 'tikz' ? el.shapes ?? [] : [];
}

const label = (s: string) => [{ t: 'text' as const, s }];

describe('a label inside a shape', () => {
  it('leaves an unlabelled shape byte-for-byte as it was', () => {
    // Every deck already saved has to keep round-tripping, so the label options are
    // written only when there IS a label.
    const tex = texOf(withShapes(RECT, OVAL));
    expect(tex).toContain('inner sep=0pt,anchor=north west] (bpr1) at (10mm,-10mm) {};');
    expect(tex).not.toContain('text width');
    expect(tex).not.toContain('align=center');
  });

  it('writes the text into the node the shape already was', () => {
    const el = setShapeLabel(withShapes(RECT), 'r1', label('Hello'));
    const tex = texOf(el);
    // One node, not two: an arrow attached to this shape still has exactly one target.
    expect(tex.match(/\\node/g)).toHaveLength(1);
    expect(tex).toContain('{Hello};');
  });

  it('constrains the text so the shape does not grow around it', () => {
    const tex = texOf(setShapeLabel(withShapes(RECT), 'r1', label('Hello')));
    expect(tex).toContain('text width=40mm,align=center');
  });

  it('gives an ellipse the widest box that fits INSIDE it, not its own width', () => {
    // `text width=40mm` grew a 40mm ellipse to 56.71mm; rx*sqrt(2) held it at 40.14.
    const tex = texOf(setShapeLabel(withShapes(OVAL), 'e1', label('Hello')));
    expect(tex).toContain(`text width=${Math.round(20 * Math.SQRT2 * 100) / 100}mm`);
    expect(tex).not.toContain('text width=40mm');
  });

  it('round-trips a labelled rectangle with nothing demoted', () => {
    const tex = texOf(setShapeLabel(withShapes(RECT), 'r1', label('Hello there')));
    const r = round(tex);
    expect(r.health.demoted).toBe(0);
    expect(r.guard.ok).toBe(true);
    expect(emitDeck(r.deck).tex).toBe(tex);

    const back = shapesOf(tex)[0]!;
    expect(back.t).toBe('rect');
    expect(back.t === 'rect' && back.label).toEqual(label('Hello there'));
  });

  it('round-trips a labelled ellipse', () => {
    const tex = texOf(setShapeLabel(withShapes(OVAL), 'e1', label('Middle')));
    expect(round(tex).health.demoted).toBe(0);
    expect(emitDeck(round(tex).deck).tex).toBe(tex);
    const back = shapesOf(tex)[0]!;
    expect(back.t === 'ellipse' && back.label).toEqual(label('Middle'));
  });

  it('keeps the formatting inside a label', () => {
    const el = setShapeLabel(withShapes(RECT), 'r1', [
      { t: 'text', s: 'a ' },
      { t: 'style', style: 'bf', children: label('bold') },
    ]);
    const tex = texOf(el);
    expect(tex).toContain('{a \\textbf{bold}};');
    expect(emitDeck(round(tex).deck).tex).toBe(tex);
  });

  it('clearing a label removes the options too', () => {
    const labelled = setShapeLabel(withShapes(RECT), 'r1', label('Hello'));
    const cleared = setShapeLabel(labelled, 'r1', []);
    expect(texOf(cleared)).toBe(texOf(withShapes(RECT)));
    expect('label' in cleared.shapes![0]!).toBe(false);
  });

  it('declines a node whose text width is not the one it would write', () => {
    // Somebody else's node, or one hand-edited to a different width. Reading it as a
    // label would re-emit it at the size WE derive, silently resizing their shape.
    const tex = texOf(setShapeLabel(withShapes(RECT), 'r1', label('Hello')))
      .replace('text width=40mm', 'text width=25mm');
    expect(shapesOf(tex)).toHaveLength(0);
    // ...and it survives untouched.
    expect(emitDeck(round(tex).deck).tex).toContain('text width=25mm');
  });

  it('declines a left-aligned label', () => {
    const tex = texOf(setShapeLabel(withShapes(RECT), 'r1', label('Hello')))
      .replace('align=center', 'align=left');
    expect(shapesOf(tex)).toHaveLength(0);
  });

  it('declines an EMPTY node that carries the label options anyway', () => {
    const tex = texOf(withShapes(RECT))
      .replace('anchor=north west]', 'anchor=north west,text width=40mm,align=center]');
    expect(shapesOf(tex)).toHaveLength(0);
  });

  it('does nothing to a shape that has no node to put text in', () => {
    // A polygon is a bare `\draw ... -- cycle`, which is also why an arrow cannot
    // attach to one.
    const poly: TikzShape = {
      id: 'p1', t: 'path', closed: true, smooth: false,
      points: [[0, 0], [20, 0], [10, 10]], style: {},
    };
    const el = withShapes(poly);
    expect(setShapeLabel(el, 'p1', label('nope')).shapes![0]).toEqual(poly);
  });
});
