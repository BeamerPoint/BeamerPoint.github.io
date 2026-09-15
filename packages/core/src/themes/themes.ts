import type { FootlineSpec, HeadlineSpec, ThemeSpec } from './spec.js';
import {
  THEME_NAMES,
  THEME_SHAPES,
  themeShape,
  type ThemeShape,
} from './catalogue.js';

/**
 * Canvas approximations for Beamer themes.
 *
 * Specs are DERIVED from each theme's declared shape rather than hand-written one by
 * one, so adding a theme is a single line in the catalogue. A handful of the most-used
 * themes then get hand-tuned overrides on top.
 *
 * None of this affects compilation: the theme reaches the document as `\usetheme{Name}`
 * regardless, so a theme with a rough approximation still produces a correct PDF.
 */

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** xcolor-style `a!pct!b` mixing, used to derive the beamer palette from structure. */
function mix(hex: string, withHex: string, pct: number): string {
  const a = parseHex(hex);
  const b = parseHex(withHex);
  const f = pct / 100;
  const c = a.map((v, i) => Math.round(v * f + b[i]! * (1 - f)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function blocksFor(structure: string): ThemeSpec['block'] {
  return {
    shape: 'rounded',
    radiusMm: 1,
    paddingMm: 2,
    titleBg: mix(structure, '#ffffff', 75),
    titleFg: '#ffffff',
    bodyBg: mix(structure, '#ffffff', 12),
    bodyFg: '#000000',
    alert: {
      titleBg: '#9b2c2c', titleFg: '#ffffff',
      bodyBg: mix('#9b2c2c', '#ffffff', 12), bodyFg: '#000000',
    },
    example: {
      titleBg: '#2f6b4f', titleFg: '#ffffff',
      bodyBg: mix('#2f6b4f', '#ffffff', 12), bodyFg: '#000000',
    },
  };
}

function headlineFor(shape: ThemeShape): HeadlineSpec {
  const bg = mix(shape.structure, '#000000', 78);
  switch (shape.headline) {
    case 'miniframes':
    case 'tree':
      return { kind: 'miniframes', heightMm: 6, bg, fg: '#ffffff', content: 'sections' };
    case 'sidebar':
      // A real sidebar is vertical; approximate it as a slim top band so the canvas at
      // least reflects that the usable area is smaller.
      return { kind: 'bar', heightMm: 4, bg, fg: '#ffffff', content: 'empty' };
    case 'none':
      return { kind: 'none', heightMm: 0, bg, fg: '#ffffff', content: 'empty' };
  }
}

function footlineFor(shape: ThemeShape): FootlineSpec {
  const s = shape.structure;
  switch (shape.footline) {
    case 'split':
      return {
        heightMm: 5,
        cells: [
          { flex: 2, bg: mix(s, '#000000', 70), fg: '#ffffff', content: 'author' },
          { flex: 3, bg: mix(s, '#ffffff', 85), fg: '#ffffff', content: 'title' },
          { flex: 2, bg: mix(s, '#ffffff', 70), fg: '#ffffff', content: 'date' },
          { flex: 1, bg: mix(s, '#ffffff', 70), fg: '#ffffff', content: 'framenumber' },
        ],
      };
    case 'minimal':
      return {
        heightMm: 4,
        cells: [{ flex: 1, bg: 'transparent', fg: s, content: 'framenumber' }],
      };
    case 'none':
      return { heightMm: 0, cells: [] };
  }
}

/** Build a canvas approximation from a theme's declared shape. */
function specFromShape(id: string, shape: ThemeShape): ThemeSpec {
  const headline = headlineFor(shape);
  const footline = footlineFor(shape);
  const background = shape.dark ? '#2e3440' : '#ffffff';
  const foreground = shape.dark ? '#eceff4' : '#000000';

  return {
    id,
    label: id,
    structure: shape.structure,
    background,
    foreground,
    fontFamily: 'sans',
    headline,
    footline,
    frametitle: {
      align: 'left',
      fontSize: 'large',
      bold: true,
      fg: shape.filledFrametitle ? '#ffffff' : shape.structure,
      ...(shape.filledFrametitle ? { bg: shape.structure } : {}),
      paddingMm: shape.filledFrametitle ? { x: 3, y: 2 } : { x: 0, y: 1 },
    },
    block: blocksFor(shape.structure),
    itemMarkers: ['▸', '–', '•'],
    margins: {
      hMm: shape.hMarginMm,
      topMm: headline.heightMm > 0 ? headline.heightMm + 2 : 3,
      bottomMm: footline.heightMm > 0 ? footline.heightMm + 2 : 4,
    },
  };
}

/**
 * Hand-tuned corrections, applied over the derived spec.
 *
 * Only for themes where the generic derivation is visibly wrong. Measured by eye
 * against real compiled output.
 */
const OVERRIDES: Readonly<Record<string, (s: ThemeSpec) => ThemeSpec>> = {
  metropolis: (s) => ({
    ...s,
    background: '#fafafa',
    block: {
      ...s.block,
      shape: 'plain',
      radiusMm: 0,
      titleBg: 'transparent',
      titleFg: '#23373b',
      bodyBg: '#eaeaea',
    },
    itemMarkers: ['•', '–', '•'],
    // Keep the measured horizontal margin; only the vertical padding is tuned.
    margins: { ...s.margins, topMm: 3, bottomMm: 6 },
  }),
  moloch: (s) => OVERRIDES['metropolis']!(s),
  Boadilla: (s) => ({
    ...s,
    footline: {
      heightMm: 5,
      cells: [
        { flex: 2, bg: '#ffffff', fg: s.structure, content: 'author' },
        { flex: 3, bg: '#ffffff', fg: s.structure, content: 'title' },
        { flex: 2, bg: '#ffffff', fg: s.structure, content: 'date' },
      ],
    },
  }),
  default: (s) => ({ ...s, margins: { ...s.margins, topMm: 4, bottomMm: 4 } }),
};

function build(id: string): ThemeSpec {
  const shape = THEME_SHAPES[id]!;
  const base = specFromShape(id, shape);
  const override = OVERRIDES[id];
  return override === undefined ? base : override(base);
}

export const THEMES: Readonly<Record<string, ThemeSpec>> = Object.fromEntries(
  THEME_NAMES.map((id) => [id, build(id)]),
);

export const THEME_IDS: readonly string[] = THEME_NAMES;

export function resolveTheme(name: string): ThemeSpec {
  return THEMES[name] ?? THEMES['default']!;
}

/** True when the canvas has only a generic approximation of this theme. */
export function isApproximateTheme(name: string): boolean {
  return themeShape(name) !== undefined && OVERRIDES[name] === undefined;
}
