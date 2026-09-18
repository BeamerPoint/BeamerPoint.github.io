import { describe, expect, it } from 'vitest';
import { DEFAULT_WIDTHS, fitColumns } from '../src/ui/useColumnLayout.js';

/**
 * Fitting the columns to the window (F-020).
 *
 * At 800px the page used to scroll sideways with 32px of the format pane on screen: the
 * fitting ran only on a resize event, only narrowed the source panel, and wrote the
 * narrowed width over the user's own.
 */

const total = (w: typeof DEFAULT_WIDTHS): number => w.slides + w.panel + w.inspector + 18;

describe('fitColumns', () => {
  it('leaves the chosen widths alone when the window is wide enough', () => {
    expect(fitColumns(DEFAULT_WIDTHS, 1600)).toEqual(DEFAULT_WIDTHS);
  });

  it('fits an 800-pixel window without scrolling, keeping the canvas usable', () => {
    const w = fitColumns(DEFAULT_WIDTHS, 800);
    expect(total(w) + 220).toBeLessThanOrEqual(800);
  });

  it('narrows the source panel first, and the others only when it has nothing left', () => {
    const w = fitColumns(DEFAULT_WIDTHS, 1100);
    expect(w.panel).toBeLessThan(DEFAULT_WIDTHS.panel);
    expect(w.slides).toBe(DEFAULT_WIDTHS.slides);
    expect(w.inspector).toBe(DEFAULT_WIDTHS.inspector);

    const tight = fitColumns(DEFAULT_WIDTHS, 800);
    expect(tight.panel).toBe(260);
    expect(tight.slides).toBeLessThan(DEFAULT_WIDTHS.slides);
  });

  it('never goes below a column\'s minimum, even when that means scrolling', () => {
    const w = fitColumns(DEFAULT_WIDTHS, 500);
    expect(w).toEqual({ slides: 120, panel: 260, inspector: 170 });
  });

  it('does not change what was chosen, so a wider window restores it', () => {
    const chosen = { slides: 300, panel: 700, inspector: 300 };
    fitColumns(chosen, 800);
    expect(chosen).toEqual({ slides: 300, panel: 700, inspector: 300 });
    expect(fitColumns(chosen, 2000)).toEqual(chosen);
  });
});
