// @vitest-environment happy-dom
/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { newTextElement } from '@beamerpoint/core';
import { CanvasContext } from '../src/canvas/CanvasContext.js';
import { SelectionOverlay } from '../src/canvas/SelectionOverlay.js';

/**
 * The move bands of a selected element must leave its interior clickable (F-019).
 *
 * They were centred on the edge, so half of each band lay inside the box. At the
 * canvas' usual zoom a line of text is 7-10 screen pixels tall, which the north and
 * south bands covered completely between them: a selected text box could not be clicked
 * into, and a new table's header row started a move. jsdom has no layout, so this reads
 * the bands' own geometry, in SCREEN pixels, at a realistic scale.
 */

const SCALE = 0.33;
const noop = (): void => {};

function bands(): Record<string, CSSStyleDeclaration> {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <CanvasContext.Provider value={{ scale: SCALE, pxPerMm: 10, bodyWidthMm: 140 }}>
      <SelectionOverlay
        el={newTextElement('one line')}
        resource={undefined}
        mode="transform"
        onResize={noop} onMove={noop} onTrim={noop} onDragStart={noop} onDragEnd={noop}
        canResizeHeight={false}
        grabWholeBody={false}
        sizeMm={null}
      />
    </CanvasContext.Provider>,
  );
  const out: Record<string, CSSStyleDeclaration> = {};
  for (const edge of ['n', 's', 'e', 'w']) {
    out[edge] = (host.querySelector(`.bp-move-band-${edge}`) as HTMLElement).style;
  }
  return out;
}

/** How many SCREEN pixels of a band lie inside the element, from its offset and size. */
function insideScreenPx(style: CSSStyleDeclaration, side: 'top' | 'bottom' | 'left' | 'right'): number {
  const thick = parseFloat(side === 'top' || side === 'bottom' ? style.height : style.width);
  const offset = parseFloat(style[side]);
  return (thick + offset) * SCALE;
}

describe('the move bands of a selected element', () => {
  const b = bands();

  it('lie almost entirely outside the element', () => {
    expect(insideScreenPx(b.n!, 'top')).toBeCloseTo(2, 5);
    expect(insideScreenPx(b.s!, 'bottom')).toBeCloseTo(2, 5);
    expect(insideScreenPx(b.w!, 'left')).toBeCloseTo(2, 5);
    expect(insideScreenPx(b.e!, 'right')).toBeCloseTo(2, 5);
  });

  it('leave the middle of a 7-pixel line of text clickable', () => {
    // Where a click on the words lands; the old bands reached 6px in from each side.
    expect(insideScreenPx(b.n!, 'top')).toBeLessThan(7 / 2);
    expect(insideScreenPx(b.s!, 'bottom')).toBeLessThan(7 / 2);
    expect(7 - insideScreenPx(b.n!, 'top') - insideScreenPx(b.s!, 'bottom')).toBeGreaterThanOrEqual(3);
  });

  it('are still a 12-pixel target on screen', () => {
    expect(parseFloat(b.n!.height) * SCALE).toBeCloseTo(12, 5);
    expect(parseFloat(b.e!.width) * SCALE).toBeCloseTo(12, 5);
  });
});
