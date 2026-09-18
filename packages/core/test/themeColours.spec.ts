/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { describe, expect, it } from 'vitest';
import { MEASURED, hasMeasuredColors } from '../src/themes/measured.js';
import { TITLE_LAYOUTS, titleLayoutFor } from '../src/themes/titleLayout.js';
import { THEME_NAMES, ALL_THEME_NAMES, THEME_SHAPES } from '../src/themes/catalogue.js';
import { resolveTheme, isApproximateTheme } from '../src/themes/themes.js';

/**
 * These values came out of the engine, not out of anyone's head.
 *
 * The canvas used to mix every colour from one hand-written `structure` hex per theme.
 * The tests below pin the cases where that derivation was visibly wrong, so nobody
 * "tidies" the measurements back into a formula.
 */

describe('measured theme colours', () => {
  it('covers every theme that can compile here', () => {
    for (const name of THEME_NAMES) {
      expect(hasMeasuredColors(name), name).toBe(true);
    }
  });

  it('leaves only the uncompilable themes approximate', () => {
    const approximate = ALL_THEME_NAMES.filter(isApproximateTheme);
    // These four need font packages the bundled TeX Live does not have, so beamer can
    // never be asked what colours they use.
    expect([...approximate].sort()).toEqual(['Arguelles', 'CleanEasy', 'focus', 'trigon']);
  });

  it('decodes to CSS hex', () => {
    for (const [name, theme] of Object.entries(MEASURED)) {
      for (const [field, pair] of Object.entries(theme)) {
        for (const v of [pair.fg, pair.bg]) {
          if (v !== undefined) expect(v, `${name}.${field}`).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it("keeps AnnArbor's maize frame title, which the derivation painted navy", () => {
    const s = resolveTheme('AnnArbor');
    expect(s.frametitle.bg).toBe('#fff200');
    expect(s.frametitle.fg).toBe('#3333b3');
  });

  it("keeps CambridgeUS's grey-and-red frame title, which the derivation painted maroon", () => {
    const s = resolveTheme('CambridgeUS');
    expect(s.frametitle.bg).toBe('#f2f2f2');
    expect(s.frametitle.fg).toBe('#cc0000');
  });

  it('runs Madrid’s footline dark to light, not light-dark-light', () => {
    // The derived version made the middle cell LIGHTER than the outer two, which is
    // backwards. Beamer shades author -> title -> date progressively lighter.
    const cells = resolveTheme('Madrid').footline.cells;
    expect(cells.length).toBeGreaterThanOrEqual(3);
    const lum = (hex: string): number => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
    };
    expect(lum(cells[0]!.bg)).toBeLessThan(lum(cells[1]!.bg));
    expect(lum(cells[1]!.bg)).toBeLessThan(lum(cells[2]!.bg));
  });

  it('gives Nord its own palette rather than the shared blue', () => {
    expect(resolveTheme('Nord').structure).toBe('#8fbcbb');
    expect(resolveTheme('Madrid').structure).toBe('#3333b3');
  });

  it('distinguishes themes the derivation made identical', () => {
    // 25 themes shared one hand-written blue. Measurement separates them.
    const signature = (n: string): string => {
      const s = resolveTheme(n);
      return [s.frametitle.bg ?? '-', s.block.titleBg, s.footline.cells.map((c) => c.bg).join('')].join('|');
    };
    const distinct = new Set(THEME_NAMES.map(signature));
    expect(distinct.size).toBeGreaterThan(10);
  });

  it('falls back to derivation for a theme with no measurement', () => {
    const s = resolveTheme('focus');
    expect(s.measured).toBe(false);
    expect(s.structure).toBe(THEME_SHAPES['focus']!.structure);
  });

  it('exposes title-page colours for every measured theme', () => {
    for (const name of THEME_NAMES) {
      const t = resolveTheme(name).titlePage;
      for (const v of [t.titleFg, t.subtitleFg, t.authorFg, t.instituteFg, t.dateFg]) {
        expect(v, name).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('records the footline kinds that were measured, not guessed', () => {
    // Every one of these was catalogued wrongly and found by compiling a probe deck and
    // looking for author/title text in the bottom 12mm of the page. Boadilla in
    // particular had a hand-written override painting its footline white, where beamer
    // paints it three shades of violet.
    for (const name of ['Boadilla', 'EastLansing', 'Ilmenau', 'Dresden', 'Szeged', 'Luebeck', 'Malmoe']) {
      expect(THEME_SHAPES[name]!.footline, name).toBe('split');
    }
    expect(THEME_SHAPES['Cuerna']!.footline).toBe('none');
  });
});

describe('measured title page layouts', () => {
  it('covers every theme that can compile here', () => {
    for (const name of THEME_NAMES) {
      expect(TITLE_LAYOUTS[name], name).toBeDefined();
    }
  });

  it("falls back to beamer's own layout for an unmeasured theme", () => {
    expect(titleLayoutFor('focus')).toEqual(TITLE_LAYOUTS['default']);
  });

  it('keeps every line in reading order with a sane size', () => {
    for (const [name, layout] of Object.entries(TITLE_LAYOUTS)) {
      let last = -Infinity;
      for (const line of layout.lines) {
        expect(line.baselineMm, name).toBeGreaterThan(last);
        expect(line.sizePt, name).toBeGreaterThan(3);
        expect(line.fields.length, name).toBeGreaterThan(0);
        last = line.baselineMm;
      }
      expect(layout.lines.some((l) => l.fields.includes('title')), name).toBe(true);
    }
  });

  it("records the themes whose title page is not beamer's default", () => {
    // Each of these was measured, and each would be wrong under the default layout.
    expect(TITLE_LAYOUTS['metropolis']!.align).toBe('left');
    expect(TITLE_LAYOUTS['metropolis']!.lines.map((l) => l.fields[0]))
      .toEqual(['title', 'subtitle', 'author', 'date', 'institute']);
    expect(TITLE_LAYOUTS['Nord']!.lines[2]!.fields).toEqual(['author', 'institute']);
    expect(TITLE_LAYOUTS['Nord']!.lines[0]!.sizePt).toBeGreaterThan(20);
    // Cuerna puts the author at the FOOT of the page, below the date.
    const cuerna = TITLE_LAYOUTS['Cuerna']!;
    expect(cuerna.lines[cuerna.lines.length - 2]!.fields).toEqual(['author']);
    expect(cuerna.lines[cuerna.lines.length - 2]!.baselineMm).toBeGreaterThan(70);
  });

  it('centres the sidebar themes on their text area, not on the page', () => {
    // A left sidebar pushes the centre right; Goettingen's and Marburg's are on the right.
    expect(TITLE_LAYOUTS['Berkeley']!.anchorMm).toBeGreaterThan(80);
    expect(TITLE_LAYOUTS['Goettingen']!.anchorMm).toBeLessThan(80);
    expect(resolveTheme('Berkeley').headline.side).toBe('left');
    expect(resolveTheme('Goettingen').headline.side).toBe('right');
  });
});
