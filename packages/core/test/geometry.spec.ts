import { describe, expect, it } from 'vitest';
import { THEME_IDS, THEME_SHAPES, resolveTheme } from '../src/index.js';
import { PAPER, PX_PER_MM } from '../src/geometry/paper.js';

/**
 * Canvas geometry.
 *
 * These numbers are not stylistic choices — they are measurements taken from the real
 * engine, and the canvas silently disagrees with the compiled PDF whenever they drift.
 * The margins in particular look like arbitrary round numbers begging to be tidied up;
 * they are not.
 */
describe('theme text margins', () => {
  it('uses the measured margin for every shipped theme', () => {
    for (const id of THEME_IDS) {
      const shape = THEME_SHAPES[id]!;
      expect(shape.hMarginMm, `${id} has no margin`).toBeGreaterThan(0);
      expect(resolveTheme(id).margins.hMm).toBe(shape.hMarginMm);
    }
  });

  it('keeps the measured values for themes that differ from the beamer default', () => {
    // Measured with \the\textwidth inside a frame, aspectratio=169. Madrid matters
    // most: it is the default theme, and assuming 10mm here rendered every
    // width-as-a-fraction-of-\textwidth about 8% too small on the canvas.
    const measured: Record<string, number> = {
      Madrid: 3.85, Boadilla: 3.85, CambridgeUS: 3.85, AnnArbor: 3.85, EastLansing: 3.85,
      SimpleDarkBlue: 7.69, SimplePlus: 7.69,
      Berkeley: 12.91, Hannover: 12.91, PaloAlto: 12.91,
      Goettingen: 15, Marburg: 15,
      Bergen: 22.56,
      default: 10, Warsaw: 10, metropolis: 10,
    };
    for (const [id, mm] of Object.entries(measured)) {
      expect(THEME_SHAPES[id]?.hMarginMm, `${id}`).toBe(mm);
    }
  });

  it('derives the text column from the paper and the margin', () => {
    const madrid = resolveTheme('Madrid');
    // 160mm paper less 2 x 3.85mm -> the 152.3mm the engine reports.
    expect(PAPER['169'].w - 2 * madrid.margins.hMm).toBeCloseTo(152.3, 1);
  });
});

describe('design grid', () => {
  it('is 10 design pixels per millimetre', () => {
    // The canvas must never use CSS `mm`, which is a physical unit (~3.78px at 96dpi).
    // Mixing the two put absolutely-placed elements at 0.38x their intended position.
    expect(PX_PER_MM).toBe(10);
    expect(PAPER['169'].w * PX_PER_MM).toBe(1600);
    expect(PAPER['43'].w * PX_PER_MM).toBe(1280);
  });
});
