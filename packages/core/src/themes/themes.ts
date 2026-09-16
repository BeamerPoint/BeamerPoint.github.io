import type { FootlineSpec, HeadlineSpec, ThemeSpec } from './spec.js';
import { MEASURED, hasMeasuredColors, type MeasuredTheme } from './measured.js';
import { titleLayoutFor } from './titleLayout.js';
import {
  ALL_THEME_NAMES,
  THEME_NAMES,
  THEME_SHAPES,
  themeShape,
  type ThemeShape,
} from './catalogue.js';

/**
 * Canvas renderings of Beamer themes.
 *
 * Colours come from `measured.ts` — the values beamer itself resolves, read out of the
 * engine. Only themes that cannot compile here fall back to the old derivation from a
 * single `structure` hex, which was wrong in ways invisible without compiling: AnnArbor's
 * frame title is Michigan maize, not navy, and Madrid's footline runs dark-to-light, not
 * light-dark-light.
 *
 * The SHAPE of a theme — headline, footline, sidebar, text area — still comes from the
 * catalogue, because that is layout rather than colour and is measured separately.
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

/**
 * Which edge each sidebar theme's sidebar is on, and how wide it is.
 *
 * Measured, because assuming got it wrong twice over: the canvas drew all five on the
 * left at the width of the text margin. A compiled `\titlepage` centres its block on the
 * text area, so the offset of that block from the page centre gives both answers —
 * Berkeley, Hannover and PaloAlto sit +7.9mm (a 15.8mm sidebar on the left), Goettingen
 * and Marburg sit -10mm (a 20mm sidebar on the right).
 */
const SIDEBARS: Readonly<Record<string, { side: 'left' | 'right'; widthMm: number }>> = {
  Berkeley: { side: 'left', widthMm: 15.8 },
  Hannover: { side: 'left', widthMm: 15.8 },
  PaloAlto: { side: 'left', widthMm: 15.8 },
  Goettingen: { side: 'right', widthMm: 20 },
  Marburg: { side: 'right', widthMm: 20 },
};

function headlineFor(id: string, shape: ThemeShape): HeadlineSpec {
  const bg = mix(shape.structure, '#000000', 78);
  switch (shape.headline) {
    case 'miniframes':
    case 'tree':
      return { kind: 'miniframes', heightMm: 6, bg, fg: '#ffffff', content: 'sections' };
    case 'sidebar': {
      const s = SIDEBARS[id] ?? { side: 'left' as const, widthMm: 15.8 };
      return {
        kind: 'bar', heightMm: 4, bg, fg: '#ffffff', content: 'empty',
        side: s.side, widthMm: s.widthMm,
      };
    }
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

/**
 * Apply measured colours over a derived spec.
 *
 * Every field beamer reports replaces the derived one; anything it does not report is
 * left alone. The footline is the clearest gain: its three cells use beamer's own
 * `author/title/date in head/foot` colours, so they no longer have to be guessed from
 * `structure` — the derivation had Madrid's middle cell lighter than its outer ones,
 * which is backwards.
 */
function applyMeasured(spec: ThemeSpec, m: MeasuredTheme): ThemeSpec {
  const fg = (k: keyof MeasuredTheme, fallback: string): string => m[k]?.fg ?? fallback;
  const bg = (k: keyof MeasuredTheme, fallback: string): string => m[k]?.bg ?? fallback;

  const structure = fg('structure', spec.structure);
  const cell = (
    k: keyof MeasuredTheme,
    flex: number,
    content: FootlineSpec['cells'][number]['content'],
  ): FootlineSpec['cells'][number] => ({
    flex,
    bg: bg(k, spec.structure),
    fg: fg(k, '#ffffff'),
    content,
  });

  return {
    ...spec,
    measured: true,
    structure,
    background: bg('backgroundCanvas', bg('normalText', spec.background)),
    foreground: fg('normalText', spec.foreground),
    alertFg: fg('alertedText', '#cc0000'),
    titlePage: {
      titleFg: fg('title', structure),
      // Beamer's default title page puts the title in a `beamercolorbox{title}`, so a
      // theme whose `title` colour has its own background really does draw a bar there —
      // Madrid's is the blue one, and its title text is white, which would be invisible
      // without it. A background equal to the page's is not a bar and is dropped.
      ...(m.title?.bg !== undefined
        && m.title.bg !== bg('backgroundCanvas', bg('normalText', spec.background))
        ? { titleBg: m.title.bg }
        : {}),
      subtitleFg: fg('subtitle', structure),
      authorFg: fg('author', spec.foreground),
      instituteFg: fg('institute', spec.foreground),
      dateFg: fg('date', spec.foreground),
    },
    frametitle: {
      ...spec.frametitle,
      fg: fg('frametitle', spec.frametitle.fg),
      // A theme whose frametitle background matches the page has no bar to draw.
      ...(m.frametitle?.bg !== undefined
        && m.frametitle.bg !== bg('backgroundCanvas', spec.background)
        ? { bg: m.frametitle.bg }
        : {}),
    },
    headline: {
      ...spec.headline,
      bg: bg('paletteSecondary', spec.headline.bg),
      fg: fg('paletteSecondary', spec.headline.fg),
    },
    footline: spec.footline.cells.length === 3 || spec.footline.cells.length === 4
      ? {
          ...spec.footline,
          cells: [
            cell('authorInHeadFoot', 2, 'author'),
            cell('titleInHeadFoot', 3, 'title'),
            cell('dateInHeadFoot', 2, 'date'),
            ...(spec.footline.cells.length === 4
              ? [cell('dateInHeadFoot', 1, 'framenumber')]
              : []),
          ],
        }
      : spec.footline.cells.length === 1
        ? {
            ...spec.footline,
            cells: [{ ...spec.footline.cells[0]!, fg: structure }],
          }
        : spec.footline,
    block: {
      ...spec.block,
      titleBg: bg('blockTitle', spec.block.titleBg),
      titleFg: fg('blockTitle', spec.block.titleFg),
      bodyBg: bg('blockBody', spec.block.bodyBg),
      bodyFg: fg('blockBody', spec.block.bodyFg),
      alert: {
        titleBg: bg('blockTitleAlerted', spec.block.alert.titleBg),
        titleFg: fg('blockTitleAlerted', spec.block.alert.titleFg),
        bodyBg: bg('blockBodyAlerted', spec.block.alert.bodyBg),
        bodyFg: fg('blockBodyAlerted', spec.block.alert.bodyFg),
      },
      example: {
        titleBg: bg('blockTitleExample', spec.block.example.titleBg),
        titleFg: fg('blockTitleExample', spec.block.example.titleFg),
        bodyBg: bg('blockBodyExample', spec.block.example.bodyBg),
        bodyFg: fg('blockBodyExample', spec.block.example.bodyFg),
      },
    },
  };
}

/** Build a canvas approximation from a theme's declared shape. */
function specFromShape(id: string, shape: ThemeShape): ThemeSpec {
  const headline = headlineFor(id, shape);
  const footline = footlineFor(shape);
  const background = shape.dark ? '#2e3440' : '#ffffff';
  const foreground = shape.dark ? '#eceff4' : '#000000';

  return {
    id,
    label: id,
    structure: shape.structure,
    alertFg: '#cc0000',
    measured: false,
    titleLayout: titleLayoutFor(id),
    titlePage: {
      titleFg: shape.structure,
      subtitleFg: shape.structure,
      authorFg: foreground,
      instituteFg: foreground,
      dateFg: foreground,
    },
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
    ...(shape.textTopMm !== undefined && shape.textBottomInsetMm !== undefined
      ? { textBox: { topMm: shape.textTopMm, bottomInsetMm: shape.textBottomInsetMm } }
      : {}),
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
 * Hand-tuned corrections applied AFTER measurement.
 *
 * Deliberately colour-free now: every colour these used to set is measured, and the
 * measurements were better. Boadilla's whole override went — it painted the footline
 * white where beamer paints it three shades of violet. What is left is shape and
 * spacing, which no colour probe can report.
 */
const OVERRIDES: Readonly<Record<string, (s: ThemeSpec) => ThemeSpec>> = {
  metropolis: (s) => ({
    ...s,
    // metropolis blocks are flat with a bold title, not a rounded filled bar.
    block: { ...s.block, shape: 'plain', radiusMm: 0 },
    itemMarkers: ['•', '–', '•'],
    // Keep the measured horizontal margin; only the vertical padding is tuned.
    margins: { ...s.margins, topMm: 3, bottomMm: 6 },
  }),
  moloch: (s) => OVERRIDES['metropolis']!(s),
  default: (s) => ({ ...s, margins: { ...s.margins, topMm: 4, bottomMm: 4 } }),
};

function build(id: string): ThemeSpec {
  const shape = THEME_SHAPES[id]!;
  const base = specFromShape(id, shape);
  const measured = MEASURED[id];
  // Measurement first, then the remaining hand-tuned SHAPE corrections on top — those
  // adjust geometry and block styling, which no colour probe can report.
  const withColors = measured === undefined ? base : applyMeasured(base, measured);
  const override = OVERRIDES[id];
  return override === undefined ? withColors : override(withColors);
}

/**
 * Canvas approximations for EVERY catalogued theme, including ones that cannot
 * compile here. Opening someone else's deck must still render something recognisable
 * rather than silently falling back to the default look.
 */
export const THEMES: Readonly<Record<string, ThemeSpec>> = Object.fromEntries(
  ALL_THEME_NAMES.map((id) => [id, build(id)]),
);

/** The list the picker offers: only themes verified to compile. */
export const THEME_IDS: readonly string[] = THEME_NAMES;

export function resolveTheme(name: string): ThemeSpec {
  return THEMES[name] ?? THEMES['default']!;
}

/**
 * True when the canvas has only a generic approximation of this theme's colours.
 *
 * Now means "beamer was never asked" rather than "nobody hand-tuned it". Only the
 * themes that cannot compile here are left, which is also exactly the set whose colours
 * cannot be measured.
 */
export function isApproximateTheme(name: string): boolean {
  return themeShape(name) !== undefined && !hasMeasuredColors(name);
}
