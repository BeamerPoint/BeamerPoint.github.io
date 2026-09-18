import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame, newTikzElement } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import {
  addShape, attachEndpoint, moveEndpoint, moveShape, removeShape, reorderShape,
  resizeShape, restyleShape, setCanvasSize, shapeBounds,
} from '../src/model/shapeOps.js';
import type { TikzElement, TikzShape } from '../src/model/types.js';
import { expectRoundTrip } from './helpers/roundTrip.js';

const RECT: TikzShape = { id: 'r1', t: 'rect', x: 10, y: 10, w: 30, h: 20, style: {} };
const OVAL: TikzShape = { id: 'e1', t: 'ellipse', cx: 70, cy: 20, rx: 15, ry: 10, style: {} };

function withShapes(...shapes: TikzShape[]): TikzElement {
  return shapes.reduce(addShape, newTikzElement(100, 50));
}

/** Compile-ability proxy: does the emitted source reference an undefined node? */
function danglingNodeRefs(el: TikzElement): string[] {
  const deck = newDeck({ title: 'T' });
  deck.nodes = [newFrame('F', [el])];
  const tex = emitDeck(deck).tex;
  const defined = new Set([...tex.matchAll(/\\node\[[^\]]*\]\s*\((bp\w+)\)/g)].map((m) => m[1]!));
  const used = [...tex.matchAll(/\((bp\w+)\.(?:north|south|east|west|center)\)/g)]
    .map((m) => m[1]!);
  return used.filter((u) => !defined.has(u));
}

describe('shape operations', () => {
  it('deletes the arrows attached to a shape it removes', () => {
    // TikZ fails the whole compile on a reference to a node that is not there, so an
    // orphaned arrow does not degrade gracefully — it takes the deck down with it.
    const arrow: TikzShape = {
      id: 'a1', t: 'arrow',
      from: { kind: 'shape', shapeId: 'r1', side: 'e' },
      to: { kind: 'shape', shapeId: 'e1', side: 'w' },
      head: 'latex', style: {},
    };
    const el = withShapes(RECT, OVAL, arrow);
    expect(danglingNodeRefs(el)).toEqual([]);

    const after = removeShape(el, 'r1');
    expect(after.shapes?.map((s) => s.id)).toEqual(['e1']);
    expect(danglingNodeRefs(after)).toEqual([]);
  });

  it('keeps an arrow whose other end is a plain point', () => {
    const arrow: TikzShape = {
      id: 'a1', t: 'arrow',
      from: { kind: 'point', x: 5, y: 5 },
      to: { kind: 'point', x: 50, y: 40 },
      head: 'to', style: {},
    };
    expect(removeShape(withShapes(RECT, arrow), 'r1').shapes?.map((s) => s.id)).toEqual(['a1']);
  });

  it('moves a shape and leaves attached arrow ends alone', () => {
    const arrow: TikzShape = {
      id: 'a1', t: 'arrow',
      from: { kind: 'shape', shapeId: 'r1', side: 'e' },
      to: { kind: 'point', x: 60, y: 20 },
      head: 'latex', style: {},
    };
    const moved = moveShape(withShapes(RECT, arrow), 'a1', 5, -3);
    const a = moved.shapes!.find((s) => s.id === 'a1') as Extract<TikzShape, { t: 'arrow' }>;

    // The pinned end follows the drag; the attached end still tracks the rectangle.
    expect(a.from).toEqual({ kind: 'shape', shapeId: 'r1', side: 'e' });
    expect(a.to).toEqual({ kind: 'point', x: 65, y: 17 });
  });

  it('refuses to attach an arrow to itself', () => {
    const arrow: TikzShape = {
      id: 'a1', t: 'arrow',
      from: { kind: 'point', x: 5, y: 5 },
      to: { kind: 'point', x: 50, y: 40 },
      head: 'latex', style: {},
    };
    const el = attachEndpoint(
      withShapes(arrow), 'a1', 'to', { shapeId: 'a1', side: 'n' }, { x: 50, y: 40 },
    );
    // A self-reference is a TikZ error, and it is reachable by dropping an endpoint
    // back on the arrow it belongs to. The endpoint stays where it was.
    expect((el.shapes![0] as Extract<TikzShape, { t: 'arrow' }>).to)
      .toEqual({ kind: 'point', x: 50, y: 40 });
  });

  it('detaches an endpoint when it is dropped on empty space', () => {
    const arrow: TikzShape = {
      id: 'a1', t: 'arrow',
      from: { kind: 'shape', shapeId: 'r1', side: 'e' },
      to: { kind: 'point', x: 60, y: 20 },
      head: 'latex', style: {},
    };
    const el = attachEndpoint(withShapes(RECT, arrow), 'a1', 'from', null, { x: 12, y: 34 });
    expect((el.shapes![1] as Extract<TikzShape, { t: 'arrow' }>).from)
      .toEqual({ kind: 'point', x: 12, y: 34 });
  });

  it('moves one end of a line without touching the other', () => {
    const line: TikzShape = {
      id: 'l1', t: 'path', points: [[0, 0], [20, 20]], closed: false, smooth: false, style: {},
    };
    const el = moveEndpoint(withShapes(line), 'l1', 'to', { x: 35, y: 5 });
    expect((el.shapes![0] as Extract<TikzShape, { t: 'path' }>).points).toEqual([[0, 0], [35, 5]]);
  });

  it('never resizes a shape to nothing', () => {
    const tiny = resizeShape(withShapes(RECT), 'r1', -100, -100);
    expect(shapeBounds(tiny.shapes![0]!)).toMatchObject({ w: 2, h: 2 });

    const flat = resizeShape(withShapes(OVAL), 'e1', -100, -100);
    expect(flat.shapes![0]).toMatchObject({ rx: 1, ry: 1 });
  });

  it('anchors a corner resize at the corner opposite the one being dragged', () => {
    // The SE handle was the only one there was, so a shape could only ever grow down
    // and right. Pulling the NW corner has to hold the bottom-right edge still.
    const nw = resizeShape(withShapes(RECT), 'r1', -6, -4, 'nw');
    expect(shapeBounds(nw.shapes![0]!)).toEqual({ x: 4, y: 6, w: 36, h: 24 });
    // ...and the bottom-right is exactly where it was: 10+30, 10+20.
    const b = shapeBounds(nw.shapes![0]!)!;
    expect([b.x + b.w, b.y + b.h]).toEqual([40, 30]);

    const ne = resizeShape(withShapes(RECT), 'r1', 5, -4, 'ne');
    expect(shapeBounds(ne.shapes![0]!)).toEqual({ x: 10, y: 6, w: 35, h: 24 });

    const sw = resizeShape(withShapes(OVAL), 'e1', 5, 4, 'sw');
    expect(shapeBounds(sw.shapes![0]!)).toEqual({ x: 60, y: 10, w: 25, h: 24 });
  });

  it('refuses to invert a shape, holding the anchored edge still', () => {
    // Dragging the west edge past the east one must not turn the box inside out.
    const el = resizeShape(withShapes(RECT), 'r1', 500, 0, 'nw');
    const b = shapeBounds(el.shapes![0]!)!;
    expect(b.w).toBe(2);
    expect(b.x + b.w).toBe(40); // the east edge never moved
  });

  it('resizes a polygon by scaling its points inside the new box', () => {
    // A polygon is an explicit point list precisely because TikZ's shape library sizes
    // shapes to CONTAIN their box rather than fill it, so the resize has to keep that
    // promise: the same numbers on the canvas and in the emitted \draw.
    const tri: TikzShape = {
      id: 'p1', t: 'path', closed: true, smooth: false,
      points: [[0, 0], [20, 0], [10, 10]],
      style: {},
    };
    const doubled = resizeShape(withShapes(tri), 'p1', 20, 10, 'se');
    expect((doubled.shapes![0] as Extract<TikzShape, { t: 'path' }>).points)
      .toEqual([[0, 0], [40, 0], [20, 20]]);
  });

  it('leaves alone the shapes that have no box to pull', () => {
    // A text node is sized by TikZ from its own text and an arrow by its endpoints;
    // handing either a corner handle would be a control that does nothing.
    const node: TikzShape = {
      id: 'n1', t: 'node', x: 5, y: 5, shape: 'none',
      content: [{ t: 'text', s: 'hello' }], style: {},
    };
    const el = withShapes(node);
    expect(resizeShape(el, 'n1', 10, 10, 'se').shapes![0]).toEqual(node);

    const line: TikzShape = {
      id: 'l1', t: 'path', closed: false, smooth: false,
      points: [[0, 0], [10, 10]], style: {},
    };
    expect(resizeShape(withShapes(line), 'l1', 10, 10, 'se').shapes![0]).toEqual(line);
  });

  it('removes a style key when it is set back to undefined', () => {
    const filled = restyleShape(withShapes(RECT), 'r1', { fill: { k: 'named', name: 'red' } });
    expect(filled.shapes![0]!.style.fill).toEqual({ k: 'named', name: 'red' });

    // `undefined` has to DELETE the key, not store it: an emitted `fill=undefined`
    // would not compile, and a present-but-undefined key defeats the round trip.
    const cleared = restyleShape(filled, 'r1', { fill: undefined });
    expect('fill' in cleared.shapes![0]!.style).toBe(false);
  });

  it('reorders shapes and clamps at the ends', () => {
    const el = withShapes(RECT, OVAL);
    expect(reorderShape(el, 'r1', 1).shapes?.map((s) => s.id)).toEqual(['e1', 'r1']);
    expect(reorderShape(el, 'r1', -1)).toBe(el);
    expect(reorderShape(el, 'e1', 1)).toBe(el);
  });

  it('keeps the canvas big enough to draw on', () => {
    expect(setCanvasSize(newTikzElement(), 1, 1).canvasSize).toEqual({ w: 10, h: 10 });
  });

  it('survives a round trip after every operation', () => {
    let el = withShapes(RECT, OVAL);
    el = addShape(el, {
      id: 'a1', t: 'arrow',
      from: { kind: 'shape', shapeId: 'r1', side: 'e' },
      to: { kind: 'shape', shapeId: 'e1', side: 'w' },
      head: 'latex', style: {},
    });
    el = restyleShape(el, 'r1', { fill: { k: 'mix', expr: 'blue!20' }, dash: 'dashed' });
    el = moveShape(el, 'e1', 3.5, -2.25);
    el = resizeShape(el, 'r1', 4, 4);
    el = reorderShape(el, 'a1', -1);

    const deck = newDeck({ title: 'T' });
    deck.nodes = [newFrame('F', [el])];
    const tex = emitDeck(deck).tex;
    expectRoundTrip(deck);
    const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });
    expect(emitDeck(round.deck).tex).toBe(tex);
    expect(round.guard.ok).toBe(true);
    expect(round.health.demoted).toBe(0);
  });
});
