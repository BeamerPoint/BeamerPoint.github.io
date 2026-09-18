import { describe, expect, it } from 'vitest';
import { POLYGON_KINDS, polygonPoints } from '../src/model/polygons.js';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame, newTikzElement } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import { addShape, isAttachable, attachEndpoint, shapeFromDrag } from '../src/model/shapeOps.js';
import type { TikzElement, TikzShape } from '../src/model/types.js';
import { expectRoundTrip } from './helpers/roundTrip.js';

const BOX = { x: 10, y: 20, w: 40, h: 25 };

function bounds(pts: ReadonlyArray<readonly [number, number]>) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    x: Math.min(...xs), y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
  };
}

describe('polygon shapes', () => {
  it('every kind exactly fills the box it is given', () => {
    // This is the whole reason these are computed here instead of using TikZ's shapes
    // library: measured against the engine, `trapezium` drew 34.2mm for a 26mm box and
    // `star` drew 23.5mm for a 16mm one. A shape that does not fill its box makes the
    // canvas disagree with the PDF by tens of millimetres.
    for (const kind of POLYGON_KINDS) {
      const b = bounds(polygonPoints(kind, BOX.x, BOX.y, BOX.w, BOX.h));
      expect(b.x, kind).toBeCloseTo(BOX.x, 6);
      expect(b.y, kind).toBeCloseTo(BOX.y, 6);
      expect(b.w, kind).toBeCloseTo(BOX.w, 6);
      expect(b.h, kind).toBeCloseTo(BOX.h, 6);
    }
  });

  it('every kind is a closed polygon with at least three distinct points', () => {
    for (const kind of POLYGON_KINDS) {
      const pts = polygonPoints(kind, 0, 0, 30, 20);
      expect(pts.length, kind).toBeGreaterThanOrEqual(3);
      const distinct = new Set(pts.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`));
      expect(distinct.size, kind).toBe(pts.length);
    }
  });

  it('scales with the box rather than keeping a fixed size', () => {
    const small = bounds(polygonPoints('hexagon', 0, 0, 10, 10));
    const big = bounds(polygonPoints('hexagon', 0, 0, 80, 40));
    expect(small.w).toBeCloseTo(10, 6);
    expect(big.w).toBeCloseTo(80, 6);
    expect(big.h).toBeCloseTo(40, 6);
  });

  it('a dragged polygon round-trips through LaTeX', () => {
    let el: TikzElement = newTikzElement(100, 60);
    for (const kind of POLYGON_KINDS) {
      el = addShape(el, shapeFromDrag(kind, { x: 5, y: 5 }, { x: 35, y: 25 }));
    }

    const deck = newDeck({ title: 'T' });
    deck.nodes = [newFrame('Shapes', [el])];
    const tex = emitDeck(deck).tex;
    expectRoundTrip(deck);
    const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });

    expect(emitDeck(round.deck).tex).toBe(tex);
    expect(round.guard.ok).toBe(true);
    expect(round.health.demoted).toBe(0);
    // No TikZ shape library is needed, because these are plain paths.
    expect(tex).not.toContain('regular polygon');
    expect(tex).toContain('-- cycle');
  });

  it('a circle drag gives a circle, not an oval', () => {
    const s = shapeFromDrag('circle', { x: 0, y: 0 }, { x: 40, y: 20 });
    expect(s.t).toBe('ellipse');
    if (s.t !== 'ellipse') return;
    expect(s.rx).toBe(s.ry);
    expect(s.rx).toBeCloseTo(10, 6);
  });
});

describe('arrow attachment is limited to named nodes', () => {
  const polygon: TikzShape = {
    id: 'p1', t: 'path',
    points: polygonPoints('hexagon', 0, 0, 20, 20),
    closed: true, smooth: false, style: {},
  };
  const box: TikzShape = { id: 'b1', t: 'rect', x: 40, y: 0, w: 20, h: 20, style: {} };
  const arrow: TikzShape = {
    id: 'a1', t: 'arrow',
    from: { kind: 'point', x: 0, y: 0 }, to: { kind: 'point', x: 50, y: 50 },
    head: 'latex', style: {},
  };

  it('knows which shapes are nodes in the output', () => {
    expect(isAttachable(box)).toBe(true);
    expect(isAttachable(polygon)).toBe(false);
  });

  it('refuses to attach an arrow to a polygon, which has no name to reference', () => {
    // `\draw ... -- cycle` produces no node, so `(bpP1.east)` would reference nothing
    // and abort the entire compile — the same failure as a deleted shape's orphan.
    const el = [polygon, box, arrow].reduce(addShape, newTikzElement(80, 40));
    const after = attachEndpoint(el, 'a1', 'to', { shapeId: 'p1', side: 'e' }, { x: 7, y: 9 });
    const a = after.shapes!.find((s) => s.id === 'a1') as Extract<TikzShape, { t: 'arrow' }>;
    expect(a.to).toEqual({ kind: 'point', x: 7, y: 9 });

    const ok = attachEndpoint(el, 'a1', 'to', { shapeId: 'b1', side: 'w' }, { x: 7, y: 9 });
    const b = ok.shapes!.find((s) => s.id === 'a1') as Extract<TikzShape, { t: 'arrow' }>;
    expect(b.to).toEqual({ kind: 'shape', shapeId: 'b1', side: 'w' });
  });

  it('emits no dangling node reference for a polygon-heavy diagram', () => {
    const el = [polygon, box, arrow].reduce(addShape, newTikzElement(80, 40));
    const attached = attachEndpoint(el, 'a1', 'to', { shapeId: 'p1', side: 'e' }, { x: 7, y: 9 });

    const deck = newDeck({ title: 'T' });
    deck.nodes = [newFrame('F', [attached])];
    const tex = emitDeck(deck).tex;
    expectRoundTrip(deck);

    const defined = new Set([...tex.matchAll(/\\node\[[^\]]*\]\s*\((bp\w+)\)/g)].map((m) => m[1]!));
    const used = [...tex.matchAll(/\((bp\w+)\.(?:north|south|east|west|center)\)/g)].map((m) => m[1]!);
    expect(used.filter((u) => !defined.has(u))).toEqual([]);
  });
});
