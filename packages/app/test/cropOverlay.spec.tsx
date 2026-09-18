// @vitest-environment happy-dom
/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Element, ImageTrim, ResourceRef } from '@beamerpoint/core';
import { CanvasContext } from '../src/canvas/CanvasContext.js';
import { SelectionOverlay } from '../src/canvas/SelectionOverlay.js';

/**
 * Cropping a picture with the mouse (F-022).
 *
 * `pointerDrag` reports INCREMENTAL deltas, and the crop handler added each one to the
 * trim captured at pointer-down -- so every move replaced the previous one and the crop
 * reflected a single event's worth of movement. The edges were also drawn on the
 * element box rather than the picture, and a pixel was converted as if the box showed
 * the cropped image. happy-dom has no layout, so the picture's rect is stubbed; the
 * overlay, its maths and the real drag session are what run.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SCALE = 0.5;
/** The picture on screen: 160 px wide for a 320 px image, so 2 trim units per pixel. */
const IMG = { left: 100, top: 50, width: 160, height: 100 };
/** The element box spans the whole text column, far wider than the picture. */
const HOST = { left: 80, top: 40, width: 600, height: 120 };

const resource: ResourceRef = {
  id: 'r', path: 'p.png', kind: 'image', mime: 'image/png', bytes: 1, sha256: '',
  originalName: 'p.png', intrinsic: { w: 320, h: 200 },
};
const image = (trim?: ImageTrim): Element => ({
  id: 'i', kind: 'image', placement: { mode: 'flow' }, resourceId: 'r', keepAspect: true,
  ...(trim ? { trim } : {}),
});

function rect(r: { left: number; top: number; width: number; height: number }): DOMRect {
  return {
    ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => r,
  } as DOMRect;
}

let host: HTMLDivElement;
let root: Root;
let trims: ImageTrim[];

function mount(el: Element): void {
  act(() => root.render(
    <CanvasContext.Provider value={{ scale: SCALE, pxPerMm: 10, bodyWidthMm: 140 }}>
      <div className="bp-image"><img alt="" /></div>
      <SelectionOverlay
        el={el} resource={resource} mode="crop"
        onResize={() => {}} onMove={() => {}} onDragStart={() => {}} onDragEnd={() => {}}
        onTrim={(t) => trims.push(t)}
        canResizeHeight={false} grabWholeBody={false} sizeMm={null}
      />
    </CanvasContext.Provider>,
  ));
}

function drag(edge: string, steps: Array<[number, number]>): void {
  const bar = host.querySelector(`.bp-crop-${edge}`)!;
  let x = 0;
  let y = 0;
  act(() => { bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 1 })); });
  for (const [dx, dy] of steps) {
    x += dx; y += dy;
    act(() => { window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerId: 1 })); });
  }
  act(() => { window.dispatchEvent(new PointerEvent('pointerup', { clientX: x, clientY: y, pointerId: 1 })); });
}

beforeEach(() => {
  trims = [];
  host = document.createElement('div');
  document.body.appendChild(host);
  host.getBoundingClientRect = () => rect(HOST);
  root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

function stubPicture(): void {
  (host.querySelector('.bp-image img') as HTMLElement).getBoundingClientRect = () => rect(IMG);
}

describe('the crop overlay', () => {
  it('sits on the picture, not on the element box', () => {
    // Measured on mount, so the picture has to have its rect before the first render.
    const proto = HTMLImageElement.prototype;
    const original = proto.getBoundingClientRect;
    proto.getBoundingClientRect = () => rect(IMG);
    try { mount(image()); } finally { proto.getBoundingClientRect = original; }
    const overlay = host.querySelector('.bp-overlay-crop-host') as HTMLElement;
    // (100 - 80) / 0.5 and 160 / 0.5, in the element's unscaled pixels.
    expect(parseFloat(overlay.style.left)).toBe(40);
    expect(parseFloat(overlay.style.width)).toBe(320);
  });

  it('adds up every move of one drag, instead of keeping only the last', () => {
    mount(image());
    stubPicture();
    // Ten moves of 4px: 40 screen px of a 160px picture showing 320 units.
    drag('e', Array.from({ length: 10 }, () => [-4, 0] as [number, number]));
    expect(trims.at(-1)!.right).toBe(80);
  });

  it('converts a pixel against the full picture, which is what crop mode shows', () => {
    // Already cropped by 160 of 320: the old maths used the VISIBLE width and doubled it.
    mount(image({ left: 0, bottom: 0, right: 160, top: 0 }));
    stubPicture();
    drag('w', [[10, 0]]);
    expect(trims.at(-1)!.left).toBe(20);
  });

  it('places the kept region on the picture in proportion to the trim', () => {
    mount(image({ left: 80, bottom: 0, right: 0, top: 50 }));
    const kept = host.querySelector('.bp-overlay-crop') as HTMLElement;
    expect(kept.style.left).toBe('25%');
    expect(kept.style.top).toBe('25%');
  });
});
