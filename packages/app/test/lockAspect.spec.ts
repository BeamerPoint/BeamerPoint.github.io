// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { newDeck, newFrame } from '@beamerpoint/core';
import type { Deck, FrameNode, TikzElement } from '@beamerpoint/core';
import { measuredRects, useStore } from '../src/state/store.js';

/**
 * Keeping the proportions while a corner is dragged.
 *
 * A workspace preference, not a document property: `ImageElement.keepAspect` says what
 * `\includegraphics` should do with a box it is handed, and this says what dragging a
 * corner means. The ratio comes from the box as the GESTURE began, so a long drag does
 * not walk the proportions away through rounding.
 */

function frame(): FrameNode {
  return useStore.getState().deck.nodes.find((n): n is FrameNode => n.kind === 'frame')!;
}

function diagram(): TikzElement {
  return frame().children[0] as TikzElement;
}

function load(): void {
  const base = newDeck({ title: 'T' });
  const el: TikzElement = {
    id: 'd1', kind: 'tikz', mode: 'canvas',
    placement: { mode: 'absolute', x: 10, y: 10, w: 80, z: 0, driver: 'textpos' },
    canvasSize: { w: 80, h: 40 },
    shapes: [],
  };
  const deck: Deck = { ...base, nodes: [{ ...newFrame('S', [el]), id: 'f1' }] };
  useStore.getState().loadDeck(deck);
  useStore.getState().selectElement('f1', 'd1');
  measuredRects.set('d1', { x: 10, y: 10, w: 80, h: 40 });
  useStore.getState().setAids({ lockAspect: true, snap: false });
}

/** One whole drag, the way the canvas does it: bracketed, many small moves. */
function dragCorner(
  grip: 'nw' | 'ne' | 'sw' | 'se',
  dx: number,
  dy: number,
  shift = false,
  steps = 8,
): void {
  const s = useStore.getState();
  s.beginGesture();
  for (let i = 0; i < steps; i++) {
    s.resizeElementBy('f1', 'd1', dx / steps, dy / steps, grip, shift);
  }
  s.endGesture();
}

describe('lock aspect ratio', () => {
  beforeEach(load);

  it('keeps 2:1 through a corner drag that pulls only sideways', () => {
    dragCorner('se', 20, 0);
    const { w, h } = diagram().canvasSize;
    expect(w / h).toBeCloseTo(2, 3);
    expect(w).toBeCloseTo(100, 1);
  });

  it('holds the opposite corner still while it constrains', () => {
    // The anchored corner is the whole meaning of a corner drag; constraining the
    // height must not let it drift.
    dragCorner('nw', -20, 0);
    const p = diagram().placement;
    expect(p.mode === 'absolute' && p.x + p.w).toBeCloseTo(90, 1);
    expect(diagram().canvasSize.w / diagram().canvasSize.h).toBeCloseTo(2, 3);
  });

  it('does not drift over many small moves', () => {
    // The ratio is taken ONCE, at the start. Re-deriving it per move feeds rounding
    // back in and the shape slowly changes proportions as you drag.
    dragCorner('se', 37, 11, false, 60);
    expect(diagram().canvasSize.w / diagram().canvasSize.h).toBeCloseTo(2, 2);
  });

  it('lets Shift free the proportions for one drag', () => {
    dragCorner('se', 0, 20, true);
    const { w, h } = diagram().canvasSize;
    expect(h).toBeCloseTo(60, 1);
    expect(w).toBeCloseTo(80, 1); // width untouched: only the vertical was dragged
  });

  it('and Shift LOCKS them when the preference is off', () => {
    useStore.getState().setAids({ lockAspect: false });
    dragCorner('se', 20, 0, true);
    expect(diagram().canvasSize.w / diagram().canvasSize.h).toBeCloseTo(2, 3);
  });

  it('leaves a SIDE handle free, so a shape can still be reshaped', () => {
    const s = useStore.getState();
    s.beginGesture();
    s.resizeElementBy('f1', 'd1', 20, 0, 'e', false);
    s.endGesture();
    const { w, h } = diagram().canvasSize;
    expect(w).toBeCloseTo(100, 1);
    expect(h).toBeCloseTo(40, 1);
  });

  it('constrains a SHAPE inside a diagram too', () => {
    // The lock was applied to element handles and not to shape handles, so dragging a
    // rectangle's corner inside a diagram stretched it: 2:1 became 2.9:1. Reported as
    // "the lock aspect ratio thing is still not working", and it was.
    const s = useStore.getState();
    s.drawShape('f1', 'd1', { tool: 'rect', from: { x: 10, y: 10 }, to: { x: 50, y: 30 } });
    const shape = diagram().shapes![0]!;

    s.beginGesture();
    for (let i = 0; i < 8; i++) s.resizeShape('f1', 'd1', shape.id, 2, 0, 'se', false);
    s.endGesture();

    const box = diagram().shapes![0]! as Extract<typeof shape, { t: 'rect' }>;
    expect(box.w / box.h).toBeCloseTo(2, 2);
    expect(box.w).toBeCloseTo(56, 0);
  });

  it('lets Shift free a shape corner as well', () => {
    const s = useStore.getState();
    s.drawShape('f1', 'd1', { tool: 'rect', from: { x: 10, y: 10 }, to: { x: 50, y: 30 } });
    const shape = diagram().shapes![0]!;

    s.beginGesture();
    for (let i = 0; i < 8; i++) s.resizeShape('f1', 'd1', shape.id, 2, 0, 'se', true);
    s.endGesture();

    const box = diagram().shapes![0]! as Extract<typeof shape, { t: 'rect' }>;
    expect(box.h).toBeCloseTo(20, 1);
    expect(box.w).toBeCloseTo(56, 0);
  });

  it('never constrains below the minimum box', () => {
    dragCorner('se', -500, -500);
    const { w, h } = diagram().canvasSize;
    expect(w).toBeGreaterThanOrEqual(5);
    expect(h).toBeGreaterThanOrEqual(5);
  });
});
