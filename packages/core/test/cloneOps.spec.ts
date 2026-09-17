import { describe, expect, it } from 'vitest';
import { cloneElement, offsetElement } from '../src/model/cloneOps.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import { emitDeck } from '../src/emit/deck.js';
import { newDeck, newFrame, newListElement, newTableElement, newTikzElement } from '../src/model/factory.js';
import { addShape } from '../src/model/shapeOps.js';
import type { Element, TikzElement, TikzShape } from '../src/model/types.js';

/**
 * Copying an element.
 *
 * The copy itself is easy. What is not is the references INSIDE it: a diagram's arrows
 * name the shapes they attach to, so a clone that reuses an id leaves the pasted arrows
 * pointing at the ORIGINAL shapes — they follow the original when it moves, and deleting
 * the original then emits `\draw (bpX.east)` for a node that is gone, which aborts the
 * whole compile rather than skipping one arrow.
 */

/** Every id anywhere inside an element, so the two copies can be compared as sets. */
function idsOf(el: Element): string[] {
  const out = [el.id];
  const visit = (e: Element): void => {
    out.push(e.id);
    if (e.kind === 'block') e.children.forEach(visit);
    if (e.kind === 'columns') e.columns.forEach((c) => { out.push(c.id); c.children.forEach(visit); });
    if (e.kind === 'list') {
      for (const i of e.items) {
        out.push(i.id);
        if (i.sublist !== undefined) visit(i.sublist);
      }
    }
    if (e.kind === 'table') {
      e.columns.forEach((c) => out.push(c.id));
      e.rows.forEach((r) => { out.push(r.id); r.cells.forEach((c) => out.push(c.id)); });
    }
    if (e.kind === 'tikz') (e.shapes ?? []).forEach((s) => out.push(s.id));
  };
  visit(el);
  return out;
}

const RECT: TikzShape = { id: 'r1', t: 'rect', x: 10, y: 10, w: 30, h: 20, style: {} };
const OVAL: TikzShape = { id: 'e1', t: 'ellipse', cx: 70, cy: 20, rx: 15, ry: 10, style: {} };
const ARROW: TikzShape = {
  id: 'a1', t: 'arrow',
  from: { kind: 'shape', shapeId: 'r1', side: 'e' },
  to: { kind: 'shape', shapeId: 'e1', side: 'w' },
  head: 'latex', style: {},
};

function diagram(): TikzElement {
  return [RECT, OVAL, ARROW].reduce(addShape, newTikzElement(100, 50));
}

describe('cloning an element', () => {
  it('shares no id at all with the original', () => {
    const list = newListElement(['one', 'two']);
    const copy = cloneElement(list, makeSeededIdFactory('c'));
    const before = new Set(idsOf(list));
    expect(idsOf(copy).some((id) => before.has(id))).toBe(false);
  });

  it('rebinds a diagram arrow onto the COPIES, not the originals', () => {
    const copy = cloneElement(diagram(), makeSeededIdFactory('c')) as TikzElement;
    const shapes = copy.shapes!;
    const arrow = shapes.find((s) => s.t === 'arrow') as Extract<TikzShape, { t: 'arrow' }>;

    // Not the original ids...
    expect(arrow.from).not.toMatchObject({ shapeId: 'r1' });
    expect(arrow.to).not.toMatchObject({ shapeId: 'e1' });
    // ...and the ones it does name are in this copy.
    const here = new Set(shapes.map((s) => s.id));
    expect(arrow.from.kind === 'shape' && here.has(arrow.from.shapeId)).toBe(true);
    expect(arrow.to.kind === 'shape' && here.has(arrow.to.shapeId)).toBe(true);
  });

  it('leaves a copied diagram compiling after the original is deleted', () => {
    // The failure this protects against is total: TikZ aborts on a reference to a node
    // that is not there, so one stale arrow takes the whole deck down.
    const original = diagram();
    const copy = cloneElement(original, makeSeededIdFactory('c'));
    const deck = newDeck({ title: 'T' });
    deck.nodes = [newFrame('F', [copy])];
    const tex = emitDeck(deck).tex;

    const defined = new Set(
      [...tex.matchAll(/\\node\[[^\]]*\]\s*\((bp\w+)\)/g)].map((m) => m[1]!),
    );
    const used = [...tex.matchAll(/\((bp\w+)\.(?:north|south|east|west|center)\)/g)]
      .map((m) => m[1]!);
    expect(used.filter((u) => !defined.has(u))).toEqual([]);
  });

  it('keeps an arrow endpoint that was a plain point', () => {
    const loose: TikzShape = {
      id: 'a2', t: 'arrow',
      from: { kind: 'point', x: 5, y: 5 },
      to: { kind: 'point', x: 50, y: 40 },
      head: 'to', style: {},
    };
    const copy = cloneElement(addShape(newTikzElement(), loose), makeSeededIdFactory('c')) as TikzElement;
    const arrow = copy.shapes![0] as Extract<TikzShape, { t: 'arrow' }>;
    expect(arrow.from).toEqual({ kind: 'point', x: 5, y: 5 });
  });

  it('renews every row and cell of a table', () => {
    const table = newTableElement(2, 3);
    const copy = cloneElement(table, makeSeededIdFactory('c'));
    const before = new Set(idsOf(table));
    expect(idsOf(copy).filter((id) => before.has(id))).toEqual([]);
  });

  it('shares the picture rather than duplicating the file', () => {
    // Resource ids are IndexedDB keys for the image bytes. Two elements pointing at one
    // picture is right; remapping would leave the copy referencing nothing at all.
    const img: Element = {
      id: 'i1', kind: 'image', placement: { mode: 'flow' },
      resourceId: 'res-1', keepAspect: true,
    };
    const copy = cloneElement(img, makeSeededIdFactory('c'));
    expect(copy.kind === 'image' && copy.resourceId).toBe('res-1');
    expect(copy.id).not.toBe('i1');
  });

  it('does not mutate what it copied', () => {
    const original = diagram();
    const snapshot = JSON.stringify(original);
    cloneElement(original, makeSeededIdFactory('c'));
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('offsets an absolutely-placed copy, and leaves a flow one alone', () => {
    const abs: Element = {
      id: 'x', kind: 'text', content: [],
      placement: { mode: 'absolute', x: 20, y: 30, w: 40, z: 0, driver: 'textpos' },
    };
    expect(offsetElement(abs, 5, 5).placement).toMatchObject({ x: 25, y: 35 });

    const flow: Element = { id: 'y', kind: 'text', content: [], placement: { mode: 'flow' } };
    expect(offsetElement(flow, 5, 5)).toBe(flow);
  });
});
