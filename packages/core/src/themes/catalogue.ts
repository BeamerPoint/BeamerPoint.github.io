/**
 * The Beamer theme catalogue.
 *
 * Every name here ships with TeX Live and compiles as-is — the theme only reaches the
 * document as `\usetheme{Name}`. The canvas approximation is a separate concern: some
 * themes have a hand-tuned `ThemeSpec`, and the rest are approximated from the shape
 * declared below. A theme with no canvas approximation still compiles correctly.
 */

/** How the theme draws the area above the frame content. */
export type HeadlineKind =
  | 'none'
  /** A navigation bar of section dots. */
  | 'miniframes'
  /** A section/subsection tree bar. */
  | 'tree'
  /** A vertical sidebar. Approximated as a plain top bar on the canvas. */
  | 'sidebar';

/** How the theme draws the area below the frame content. */
export type FootlineKind = 'none' | 'split' | 'minimal';

export interface ThemeShape {
  /** Base structure colour as CSS. */
  structure: string;
  headline: HeadlineKind;
  footline: FootlineKind;
  /** Frame titles sit on a filled bar rather than plain on the background. */
  filledFrametitle: boolean;
  /**
   * Requires a Unicode engine. These themes load fontspec and only render as designed
   * under XeLaTeX or LuaLaTeX; under pdfLaTeX they compile but silently fall back to
   * Computer Modern, which does not look like the theme at all.
   */
  needsUnicodeEngine?: boolean;
  /** Dark background themes. */
  dark?: boolean;
}

const BLUE = '#3b4f81';
const DARKBLUE = '#2b3a5e';
const TEAL = '#23373b';
const MAROON = '#6b1414';

/**
 * Shapes for the themes worth offering by default.
 *
 * Grouped by the visual family Beamer's own documentation uses, so the canvas gets the
 * broad strokes right even where no hand-tuned spec exists.
 */
export const THEME_SHAPES: Readonly<Record<string, ThemeShape>> = {
  // --- minimal -------------------------------------------------------------
  default: { structure: BLUE, headline: 'none', footline: 'none', filledFrametitle: false },
  boxes: { structure: BLUE, headline: 'none', footline: 'none', filledFrametitle: false },
  Bergen: { structure: BLUE, headline: 'none', footline: 'none', filledFrametitle: false },
  Pittsburgh: { structure: BLUE, headline: 'none', footline: 'none', filledFrametitle: false },
  Rochester: { structure: BLUE, headline: 'none', footline: 'none', filledFrametitle: true },

  // --- split footline ------------------------------------------------------
  Madrid: { structure: BLUE, headline: 'none', footline: 'split', filledFrametitle: true },
  Boadilla: { structure: BLUE, headline: 'none', footline: 'minimal', filledFrametitle: false },
  AnnArbor: { structure: '#00274c', headline: 'none', footline: 'split', filledFrametitle: true },
  CambridgeUS: { structure: MAROON, headline: 'none', footline: 'split', filledFrametitle: true },
  EastLansing: { structure: '#18453b', headline: 'none', footline: 'minimal', filledFrametitle: false },

  // --- miniframes navigation ----------------------------------------------
  Berlin: { structure: BLUE, headline: 'miniframes', footline: 'split', filledFrametitle: true },
  Frankfurt: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: true },
  Darmstadt: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: true },
  Ilmenau: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: true },
  Dresden: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: true },
  Singapore: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: false },
  Szeged: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: true },
  Antibes: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: true },
  JuanLesPins: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: false },
  Montpellier: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: false },

  // --- section tree --------------------------------------------------------
  Warsaw: { structure: DARKBLUE, headline: 'tree', footline: 'split', filledFrametitle: true },
  Copenhagen: { structure: BLUE, headline: 'tree', footline: 'split', filledFrametitle: true },
  Luebeck: { structure: BLUE, headline: 'tree', footline: 'none', filledFrametitle: false },
  Malmoe: { structure: BLUE, headline: 'tree', footline: 'none', filledFrametitle: false },

  // --- sidebar (approximated as a top bar on the canvas) -------------------
  Berkeley: { structure: BLUE, headline: 'sidebar', footline: 'none', filledFrametitle: true },
  PaloAlto: { structure: BLUE, headline: 'sidebar', footline: 'none', filledFrametitle: true },
  Goettingen: { structure: BLUE, headline: 'sidebar', footline: 'none', filledFrametitle: false },
  Marburg: { structure: BLUE, headline: 'sidebar', footline: 'none', filledFrametitle: false },
  Hannover: { structure: BLUE, headline: 'sidebar', footline: 'none', filledFrametitle: false },

  // --- modern / third-party ------------------------------------------------
  metropolis: {
    structure: TEAL, headline: 'none', footline: 'minimal',
    filledFrametitle: true, needsUnicodeEngine: true,
  },
  moloch: {
    structure: TEAL, headline: 'none', footline: 'minimal',
    filledFrametitle: true, needsUnicodeEngine: true,
  },
  focus: { structure: '#22333b', headline: 'none', footline: 'minimal', filledFrametitle: true },
  SimpleDarkBlue: { structure: '#1f3864', headline: 'none', footline: 'minimal', filledFrametitle: false },
  SimplePlus: { structure: '#2b5797', headline: 'none', footline: 'minimal', filledFrametitle: true },
  Nord: { structure: '#5e81ac', headline: 'none', footline: 'minimal', filledFrametitle: true, dark: true },
  Arguelles: { structure: '#28536b', headline: 'none', footline: 'minimal', filledFrametitle: true },
  CleanEasy: { structure: '#00539c', headline: 'none', footline: 'minimal', filledFrametitle: true },
  Cuerna: { structure: '#8c1d40', headline: 'none', footline: 'minimal', filledFrametitle: true },
  trigon: { structure: '#3d5a80', headline: 'none', footline: 'minimal', filledFrametitle: true },
};

export const THEME_NAMES: readonly string[] = Object.keys(THEME_SHAPES).sort((a, b) =>
  a.localeCompare(b),
);

/** Colour themes shipped with TeX Live, applied on top of a presentation theme. */
export const COLOR_THEME_NAMES: readonly string[] = [
  'default', 'albatross', 'beaver', 'beetle', 'crane', 'dolphin', 'dove', 'fly',
  'lily', 'monarca', 'orchid', 'rose', 'seagull', 'seahorse', 'spruce', 'whale',
  'wolverine',
];

/** Font themes shipped with TeX Live. */
export const FONT_THEME_NAMES: readonly string[] = [
  'default', 'professionalfonts', 'serif', 'structurebold', 'structureitalicserif',
  'structuresmallcapsserif',
];

/**
 * True when the theme only renders as designed under XeLaTeX or LuaLaTeX.
 *
 * These themes load fontspec. Under pdfLaTeX they still produce a PDF, but silently
 * substitute Computer Modern, so the output does not look like the theme — which reads
 * as "the theme is broken" rather than "the wrong engine was used".
 */
export function themeNeedsUnicodeEngine(name: string): boolean {
  return THEME_SHAPES[name]?.needsUnicodeEngine === true;
}

export function themeShape(name: string): ThemeShape | undefined {
  return THEME_SHAPES[name];
}
