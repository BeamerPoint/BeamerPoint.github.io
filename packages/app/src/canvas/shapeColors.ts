/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import type { Color, ThemeSpec } from '@beamerpoint/core';

/**
 * xcolor colours as CSS.
 *
 * Only the names xcolor's base set defines are resolved. Two of them differ from the
 * CSS colour of the same name and would otherwise render visibly wrong: xcolor's
 * `green` is pure (0,255,0), which CSS calls `lime`, and xcolor's `purple` is a
 * magenta rather than CSS's dark plum.
 */
const XCOLOR: Readonly<Record<string, string>> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#00ff00', blue: '#0000ff',
  cyan: '#00ffff', magenta: '#ff00ff', yellow: '#ffff00',
  gray: '#808080', grey: '#808080', darkgray: '#404040', lightgray: '#bfbfbf',
  brown: '#bf8040', lime: '#bfff00', olive: '#808000', orange: '#ff8000',
  pink: '#ffbfbf', purple: '#bf0040', teal: '#008080', violet: '#800080',
};

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function mix(a: [number, number, number], b: [number, number, number], pct: number): string {
  const t = Math.min(100, Math.max(0, pct)) / 100;
  const c = a.map((v, i) => Math.round(v * t + b[i]! * (1 - t)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function resolveBase(name: string, theme: ThemeSpec): [number, number, number] | null {
  if (name === 'structure') return hexToRgb(normaliseHex(theme.structure));
  const hex = XCOLOR[name.toLowerCase()];
  return hex === undefined ? null : hexToRgb(hex);
}

/** Accept `#abc`, `#aabbcc` and `rgb(...)`, returning a 6-digit hex. */
function normaliseHex(css: string): string {
  if (/^#[0-9a-f]{6}$/i.test(css)) return css;
  if (/^#[0-9a-f]{3}$/i.test(css)) {
    return `#${css[1]}${css[1]}${css[2]}${css[2]}${css[3]}${css[3]}`;
  }
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(css);
  if (m === null) return '#000000';
  const h = (n: string): string => Number(n).toString(16).padStart(2, '0');
  return `#${h(m[1]!)}${h(m[2]!)}${h(m[3]!)}`;
}

/**
 * A model colour as a CSS colour.
 *
 * `blue!20` means 20% blue mixed into white, and `blue!20!black` mixes into black
 * instead. Getting this wrong makes every filled shape on the canvas the wrong shade
 * without looking obviously broken, so the two-term form is handled explicitly.
 */
export function colorToCss(c: Color | undefined, theme: ThemeSpec, fallback = 'none'): string {
  if (c === undefined) return fallback;

  switch (c.k) {
    case 'structure':
      return c.shade === undefined
        ? theme.structure
        : mix(hexToRgb(normaliseHex(theme.structure)), [255, 255, 255], c.shade);

    case 'rgb':
      return `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;

    case 'named': {
      const base = resolveBase(c.name, theme);
      return base === null ? fallback : `rgb(${base[0]},${base[1]},${base[2]})`;
    }

    case 'mix': {
      const parts = c.expr.split('!').map((p) => p.trim());
      const base = resolveBase(parts[0] ?? '', theme);
      if (base === null) return fallback;
      if (parts.length === 1) return `rgb(${base[0]},${base[1]},${base[2]})`;

      const pct = Number(parts[1]);
      if (!Number.isFinite(pct)) return fallback;
      const otherName = parts[2];
      const other = otherName === undefined
        ? ([255, 255, 255] as [number, number, number])
        : resolveBase(otherName, theme);
      return other === null ? fallback : mix(base, other, pct);
    }
  }
}
