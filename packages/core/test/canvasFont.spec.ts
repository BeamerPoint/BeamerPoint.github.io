/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { describe, expect, it } from 'vitest';
import { canvasFontStack, DECK_FONTS } from '../src/themes/fonts.js';
import type { PackageSpec, ThemeRef } from '../src/model/types.js';

/**
 * The family the canvas draws with (F-017).
 *
 * It follows the measured `\familydefault` rule, not the package list: beamer typesets
 * in sans, so a serif package without the serif font theme changes nothing, and the
 * serif font theme without a serif package is Computer Modern Roman.
 */

const pre = (pkg: string | null, serif = false): { packages: PackageSpec[]; fontTheme?: ThemeRef } => ({
  packages: pkg === null ? [{ name: 'graphicx', options: [] }] : [{ name: pkg, options: [] }],
  ...(serif ? { fontTheme: { name: 'serif', options: [] } } : {}),
});
const first = (stack: string): string => stack.split(',')[0]!.trim();

describe('canvasFontStack', () => {
  it('is Latin Modern Sans for a deck with no font chosen', () => {
    expect(first(canvasFontStack(pre(null)))).toBe('Latin Modern Sans');
  });

  it('draws each offered family in a face of the same kind, as the picker sets it', () => {
    for (const f of DECK_FONTS) {
      const stack = canvasFontStack(pre(f.pkg, f.serif));
      expect(stack.endsWith(f.serif ? 'serif' : 'sans-serif'), `${f.label}: ${stack}`).toBe(true);
    }
  });

  it('gives each family its own stack', () => {
    const stacks = DECK_FONTS.filter((f) => f.pkg !== 'lmodern').map((f) => canvasFontStack(pre(f.pkg, f.serif)));
    expect(new Set(stacks).size).toBe(stacks.length);
  });

  it('draws Palatino for mathpazo with the serif font theme', () => {
    expect(canvasFontStack(pre('mathpazo', true))).toContain('Palatino');
  });

  it('stays sans for a serif package alone, as beamer does', () => {
    expect(first(canvasFontStack(pre('mathpazo', false)))).toBe('Latin Modern Sans');
  });

  it('is Computer Modern Roman for the serif font theme alone', () => {
    expect(first(canvasFontStack(pre(null, true)))).toBe('Latin Modern Roman');
  });

  it('honours a theme spec that asks for serif', () => {
    expect(first(canvasFontStack(pre(null), true))).toBe('Latin Modern Roman');
  });
});
