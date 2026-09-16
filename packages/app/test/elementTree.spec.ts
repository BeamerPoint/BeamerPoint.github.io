// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { newDeck, newFrame, newTextElement, plain, richTextToPlain } from '@beamerpoint/core';
import type { Deck, Element } from '@beamerpoint/core';
import { measuredRects, useStore } from '../src/state/store.js';

/**
 * Elements nest, and the store used to pretend they did not.
 *
 * `mapElement` and `findElement` looked at the frame's own child list only, so typing
 * into a block's body applied the edit to a list that did not contain it and the result
 * was silently dropped. Deleting a nested element did nothing either. The canvas made
 * the same assumption from the other side, hardcoding `selected={false}` for children.
 */

function deckWithNesting(): Deck {
  const inner = newTextElement('Inside the block');
  const colText = newTextElement('Inside the column');
  const block: Element = {
    id: 'blk', kind: 'block', variant: 'block', placement: { mode: 'flow' },
    title: plain('A block'), children: [inner],
  };
  const columns: Element = {
    id: 'cols', kind: 'columns', placement: { mode: 'flow' },
    columns: [
      { id: 'c1', width: { v: 0.5, u: 'textwidth' }, children: [colText] },
      { id: 'c2', width: { v: 0.5, u: 'textwidth' }, children: [] },
    ],
  };
  const deck = newDeck({ title: 'T' });
  return { ...deck, nodes: [{ ...newFrame('Slide', [block, columns]), id: 'f1' }] };
}

function frame(): Extract<Deck['nodes'][number], { kind: 'frame' }> {
  const f = useStore.getState().deck.nodes.find((n) => n.kind === 'frame');
  if (f?.kind !== 'frame') throw new Error('expected a frame');
  return f;
}

function blockChildren(): readonly Element[] {
  const b = frame().children.find((e) => e.id === 'blk');
  return b?.kind === 'block' ? b.children : [];
}

beforeEach(() => {
  measuredRects.clear();
  useStore.getState().loadDeck(deckWithNesting());
  useStore.getState().selectSlide('f1');
});

describe('nested elements', () => {
  it('edits text inside a block', () => {
    const id = blockChildren()[0]!.id;
    useStore.getState().setElementContent('f1', id, plain('CHANGED'));
    const child = blockChildren()[0]!;
    expect(child.kind === 'text' && richTextToPlain(child.content)).toBe('CHANGED');
  });

  it('deletes an element inside a column', () => {
    const cols = frame().children.find((e) => e.id === 'cols');
    const id = cols?.kind === 'columns' ? cols.columns[0]!.children[0]!.id : '';
    useStore.getState().deleteElement('f1', id);
    const after = frame().children.find((e) => e.id === 'cols');
    expect(after?.kind === 'columns' && after.columns[0]!.children.length).toBe(0);
  });

  it('lifts an element out of its container when it is placed freely', () => {
    const id = blockChildren()[0]!.id;
    measuredRects.set(id, { x: 30, y: 40, w: 60, h: 10 });
    useStore.getState().moveElementBy('f1', id, 5, 5);

    // Out of the block...
    expect(blockChildren()).toHaveLength(0);
    // ...and onto the frame, at the place it was drawn plus the drag.
    const lifted = frame().children.find((e) => e.id === id);
    expect(lifted?.placement).toMatchObject({ mode: 'absolute', x: 35, y: 45, w: 60 });
  });
});

describe('moving and resizing', () => {
  it('starts a freed element where it was drawn, not at a fixed spot', () => {
    measuredRects.set('blk', { x: 12.5, y: 61.25, w: 140, h: 22 });
    useStore.getState().moveElementBy('f1', 'blk', 0, 0);
    expect(frame().children.find((e) => e.id === 'blk')?.placement)
      .toMatchObject({ mode: 'absolute', x: 12.5, y: 61.3, w: 140 });
  });

  it('moves the edge that is dragged, and only that edge', () => {
    measuredRects.set('blk', { x: 20, y: 30, w: 100, h: 20 });
    const store = useStore.getState();
    store.moveElementBy('f1', 'blk', 0, 0);

    // East: the right edge follows the pointer, the left edge stays.
    useStore.getState().resizeElementBy('f1', 'blk', -20, 0, 'e');
    expect(frame().children.find((e) => e.id === 'blk')?.placement)
      .toMatchObject({ x: 20, w: 80 });

    // West: the left edge follows the pointer, the right edge stays at 100.
    useStore.getState().resizeElementBy('f1', 'blk', 10, 0, 'w');
    expect(frame().children.find((e) => e.id === 'blk')?.placement)
      .toMatchObject({ x: 30, w: 70 });
  });

  it('refuses to invert a box, holding the edge that is not being dragged', () => {
    measuredRects.set('blk', { x: 20, y: 30, w: 100, h: 20 });
    useStore.getState().moveElementBy('f1', 'blk', 0, 0);
    useStore.getState().resizeElementBy('f1', 'blk', 500, 0, 'w');
    const p = frame().children.find((e) => e.id === 'blk')?.placement;
    // The right edge was at 120, so the smallest legal box ends there.
    expect(p).toMatchObject({ x: 115, w: 5 });
  });

  it('leaves a picture in the flow sized as a fraction, not lifted out', () => {
    const deck = useStore.getState().deck;
    const img: Element = {
      id: 'img', kind: 'image', placement: { mode: 'flow' },
      resourceId: 'r1', keepAspect: true, width: { v: 0.6, u: 'textwidth' },
    };
    const f = deck.nodes[0];
    if (f?.kind !== 'frame') throw new Error('expected a frame');
    useStore.getState().loadDeck({
      ...deck, nodes: [{ ...f, children: [...f.children, img] }],
    });
    useStore.getState().resizeElementBy('f1', 'img', 20, 0, 'e');
    expect(frame().children.find((e) => e.id === 'img')?.placement)
      .toEqual({ mode: 'flow' });
  });
});
