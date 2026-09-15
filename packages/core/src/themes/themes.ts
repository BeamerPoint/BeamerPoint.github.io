import type { ThemeSpec } from './spec.js';

/**
 * Shipped theme approximations.
 *
 * Values were taken from each theme's beamer colour/outer theme definitions. They are
 * close enough to recognise the theme at a glance, which is what the canvas is for;
 * the compile button is what exactness is for.
 */

const BEAMER_BLUE = '#3b4f81';
const BEAMER_BLUE_LIGHT = '#5b6ea6';

function mix(hex: string, withHex: string, pct: number): string {
  const a = parseHex(hex);
  const b = parseHex(withHex);
  const f = pct / 100;
  const c = a.map((v, i) => Math.round(v * f + b[i]! * (1 - f)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(hex: string): number[] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Build the standard beamer block styling derived from a structure colour. */
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
      titleBg: '#9b2c2c',
      titleFg: '#ffffff',
      bodyBg: mix('#9b2c2c', '#ffffff', 12),
      bodyFg: '#000000',
    },
    example: {
      titleBg: '#2f6b4f',
      titleFg: '#ffffff',
      bodyBg: mix('#2f6b4f', '#ffffff', 12),
      bodyFg: '#000000',
    },
  };
}

function base(id: string, label: string, structure: string): ThemeSpec {
  return {
    id,
    label,
    structure,
    background: '#ffffff',
    foreground: '#000000',
    fontFamily: 'sans',
    headline: { kind: 'none', heightMm: 0, bg: structure, fg: '#ffffff', content: 'empty' },
    footline: { heightMm: 0, cells: [] },
    frametitle: {
      align: 'left',
      fontSize: 'large',
      bold: true,
      fg: structure,
      paddingMm: { x: 0, y: 1 },
    },
    block: blocksFor(structure),
    itemMarkers: ['▸', '–', '•'],
    margins: { hMm: 10, topMm: 4, bottomMm: 4 },
  };
}

const defaultTheme: ThemeSpec = base('default', 'default', BEAMER_BLUE);

const madrid: ThemeSpec = {
  ...base('Madrid', 'Madrid', BEAMER_BLUE),
  headline: {
    kind: 'bar', heightMm: 0, bg: BEAMER_BLUE, fg: '#ffffff', content: 'empty',
  },
  frametitle: {
    align: 'left',
    fontSize: 'large',
    bold: true,
    fg: '#ffffff',
    bg: BEAMER_BLUE,
    paddingMm: { x: 3, y: 2 },
  },
  footline: {
    heightMm: 5,
    cells: [
      { flex: 2, bg: mix(BEAMER_BLUE, '#000000', 70), fg: '#ffffff', content: 'author' },
      { flex: 3, bg: mix(BEAMER_BLUE, '#ffffff', 85), fg: '#ffffff', content: 'title' },
      { flex: 2, bg: BEAMER_BLUE_LIGHT, fg: '#ffffff', content: 'date' },
      { flex: 1, bg: BEAMER_BLUE_LIGHT, fg: '#ffffff', content: 'framenumber' },
    ],
  },
  margins: { hMm: 10, topMm: 2, bottomMm: 7 },
};

const warsaw: ThemeSpec = {
  ...madrid,
  id: 'Warsaw',
  label: 'Warsaw',
  headline: {
    kind: 'miniframes', heightMm: 6, bg: mix(BEAMER_BLUE, '#000000', 75),
    fg: '#ffffff', content: 'sections',
  },
  margins: { hMm: 10, topMm: 8, bottomMm: 7 },
};

const berlin: ThemeSpec = { ...warsaw, id: 'Berlin', label: 'Berlin' };

const copenhagen: ThemeSpec = {
  ...warsaw,
  id: 'Copenhagen',
  label: 'Copenhagen',
  frametitle: {
    align: 'left', fontSize: 'large', bold: true,
    fg: '#ffffff', bg: BEAMER_BLUE_LIGHT,
    paddingMm: { x: 3, y: 2 },
  },
};

const singapore: ThemeSpec = {
  ...base('Singapore', 'Singapore', BEAMER_BLUE),
  headline: {
    kind: 'miniframes', heightMm: 6,
    bg: mix(BEAMER_BLUE, '#ffffff', 40), fg: '#ffffff', content: 'sections',
  },
  margins: { hMm: 10, topMm: 8, bottomMm: 4 },
};

const boadilla: ThemeSpec = {
  ...base('Boadilla', 'Boadilla', BEAMER_BLUE),
  footline: {
    heightMm: 5,
    cells: [
      { flex: 2, bg: '#ffffff', fg: BEAMER_BLUE, content: 'author' },
      { flex: 3, bg: '#ffffff', fg: BEAMER_BLUE, content: 'title' },
      { flex: 2, bg: '#ffffff', fg: BEAMER_BLUE, content: 'date' },
    ],
  },
  margins: { hMm: 10, topMm: 4, bottomMm: 7 },
};

const metropolis: ThemeSpec = {
  ...base('metropolis', 'Metropolis', '#23373b'),
  background: '#fafafa',
  frametitle: {
    align: 'left',
    fontSize: 'large',
    bold: true,
    fg: '#fafafa',
    bg: '#23373b',
    paddingMm: { x: 3, y: 2.5 },
  },
  block: {
    ...blocksFor('#23373b'),
    shape: 'plain',
    radiusMm: 0,
    titleBg: 'transparent',
    titleFg: '#23373b',
    bodyBg: '#eaeaea',
  },
  itemMarkers: ['•', '–', '•'],
  footline: {
    heightMm: 4,
    cells: [{ flex: 1, bg: 'transparent', fg: '#23373b', content: 'framenumber' }],
  },
  margins: { hMm: 12, topMm: 3, bottomMm: 6 },
};

const cambridgeUS: ThemeSpec = {
  ...madrid,
  id: 'CambridgeUS',
  label: 'CambridgeUS',
  structure: '#6b1414',
  frametitle: {
    align: 'left', fontSize: 'large', bold: true,
    fg: '#ffffff', bg: '#6b1414', paddingMm: { x: 3, y: 2 },
  },
  block: blocksFor('#6b1414'),
};

export const THEMES: Readonly<Record<string, ThemeSpec>> = {
  default: defaultTheme,
  Madrid: madrid,
  Warsaw: warsaw,
  Berlin: berlin,
  Copenhagen: copenhagen,
  Singapore: singapore,
  Boadilla: boadilla,
  CambridgeUS: cambridgeUS,
  metropolis,
};

export const THEME_IDS: readonly string[] = Object.keys(THEMES);

export function resolveTheme(name: string): ThemeSpec {
  return THEMES[name] ?? defaultTheme;
}
