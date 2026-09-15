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
  /**
   * Horizontal text margin in millimetres, per side.
   *
   * MEASURED against the real engine (`\the\textwidth` inside a frame), not assumed.
   * The beamer default is 10mm, but several themes differ sharply -- Madrid and
   * friends use 3.85mm, the sidebar themes 12.91-15mm, Bergen 22.56mm. Getting this
   * wrong makes every width-as-a-fraction-of-`\textwidth` render at the wrong size on
   * the canvas, which is exactly how an image looks right here and wrong in the PDF.
   */
  hMarginMm: number;
  /**
   * Top of beamer's text area, in millimetres from the top of the page.
   *
   * MEASURED by compiling a [t]-aligned frame and reading where the content lands,
   * then allowing for the ascent. Beamer centres frame content vertically by default,
   * so the canvas has to centre inside the SAME box or everything sits too high --
   * top-aligning instead put elements up to 17mm out.
   */
  textTopMm?: number;
  /** Bottom of the text area, as an inset from the bottom of the page. */
  textBottomInsetMm?: number;
}

/** The beamer default, used for themes whose margin has not been measured. */
const DEFAULT_MARGIN = 10;

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
  default: { structure: BLUE, headline: 'none', footline: 'none', filledFrametitle: false , hMarginMm: DEFAULT_MARGIN, textTopMm: 11.3, textBottomInsetMm: 0.2 },
  boxes: { structure: BLUE, headline: 'none', footline: 'none', filledFrametitle: false , hMarginMm: DEFAULT_MARGIN },
  Bergen: { structure: BLUE, headline: 'none', footline: 'none', filledFrametitle: false , hMarginMm: 22.56 },
  Pittsburgh: { structure: BLUE, headline: 'none', footline: 'none', filledFrametitle: false , hMarginMm: DEFAULT_MARGIN },
  Rochester: { structure: BLUE, headline: 'none', footline: 'none', filledFrametitle: true , hMarginMm: DEFAULT_MARGIN },

  // --- split footline ------------------------------------------------------
  Madrid: { structure: BLUE, headline: 'none', footline: 'split', filledFrametitle: true , hMarginMm: 3.85, textTopMm: 13.9, textBottomInsetMm: 3.3 },
  Boadilla: { structure: BLUE, headline: 'none', footline: 'minimal', filledFrametitle: false , hMarginMm: 3.85 },
  AnnArbor: { structure: '#00274c', headline: 'none', footline: 'split', filledFrametitle: true , hMarginMm: 3.85 },
  CambridgeUS: { structure: MAROON, headline: 'none', footline: 'split', filledFrametitle: true , hMarginMm: 3.85 },
  EastLansing: { structure: '#18453b', headline: 'none', footline: 'minimal', filledFrametitle: false , hMarginMm: 3.85 },

  // --- miniframes navigation ----------------------------------------------
  Berlin: { structure: BLUE, headline: 'miniframes', footline: 'split', filledFrametitle: true , hMarginMm: DEFAULT_MARGIN },
  Frankfurt: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: true , hMarginMm: DEFAULT_MARGIN },
  Darmstadt: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: true , hMarginMm: DEFAULT_MARGIN },
  Ilmenau: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: true , hMarginMm: DEFAULT_MARGIN },
  Dresden: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: true , hMarginMm: DEFAULT_MARGIN },
  Singapore: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: false , hMarginMm: DEFAULT_MARGIN },
  Szeged: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: true , hMarginMm: DEFAULT_MARGIN },
  Antibes: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: true , hMarginMm: DEFAULT_MARGIN },
  JuanLesPins: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: false , hMarginMm: DEFAULT_MARGIN },
  Montpellier: { structure: BLUE, headline: 'miniframes', footline: 'none', filledFrametitle: false , hMarginMm: DEFAULT_MARGIN },

  // --- section tree --------------------------------------------------------
  Warsaw: { structure: DARKBLUE, headline: 'tree', footline: 'split', filledFrametitle: true , hMarginMm: DEFAULT_MARGIN, textTopMm: 10.7, textBottomInsetMm: 3.6 },
  Copenhagen: { structure: BLUE, headline: 'tree', footline: 'split', filledFrametitle: true , hMarginMm: DEFAULT_MARGIN },
  Luebeck: { structure: BLUE, headline: 'tree', footline: 'none', filledFrametitle: false , hMarginMm: DEFAULT_MARGIN },
  Malmoe: { structure: BLUE, headline: 'tree', footline: 'none', filledFrametitle: false , hMarginMm: DEFAULT_MARGIN },

  // --- sidebar (approximated as a top bar on the canvas) -------------------
  Berkeley: { structure: BLUE, headline: 'sidebar', footline: 'none', filledFrametitle: true , hMarginMm: 12.91, textTopMm: 19.0, textBottomInsetMm: 0.2 },
  PaloAlto: { structure: BLUE, headline: 'sidebar', footline: 'none', filledFrametitle: true , hMarginMm: 12.91 },
  Goettingen: { structure: BLUE, headline: 'sidebar', footline: 'none', filledFrametitle: false , hMarginMm: 15 },
  Marburg: { structure: BLUE, headline: 'sidebar', footline: 'none', filledFrametitle: false , hMarginMm: 15 },
  Hannover: { structure: BLUE, headline: 'sidebar', footline: 'none', filledFrametitle: false , hMarginMm: 12.91 },

  // --- modern / third-party ------------------------------------------------
  metropolis: {
    structure: TEAL, headline: 'none', footline: 'minimal',
    filledFrametitle: true, needsUnicodeEngine: true, hMarginMm: DEFAULT_MARGIN, textTopMm: 15.3, textBottomInsetMm: 8.6 },
  moloch: {
    structure: TEAL, headline: 'none', footline: 'minimal',
    filledFrametitle: true, needsUnicodeEngine: true, hMarginMm: DEFAULT_MARGIN,
  },
  focus: { structure: '#22333b', headline: 'none', footline: 'minimal', filledFrametitle: true , hMarginMm: DEFAULT_MARGIN },
  SimpleDarkBlue: { structure: '#1f3864', headline: 'none', footline: 'minimal', filledFrametitle: false , hMarginMm: 7.69 },
  SimplePlus: { structure: '#2b5797', headline: 'none', footline: 'minimal', filledFrametitle: true , hMarginMm: 7.69 },
  Nord: { structure: '#5e81ac', headline: 'none', footline: 'minimal', filledFrametitle: true, dark: true , hMarginMm: DEFAULT_MARGIN },
  Arguelles: { structure: '#28536b', headline: 'none', footline: 'minimal', filledFrametitle: true , hMarginMm: DEFAULT_MARGIN },
  CleanEasy: { structure: '#00539c', headline: 'none', footline: 'minimal', filledFrametitle: true , hMarginMm: DEFAULT_MARGIN },
  Cuerna: { structure: '#8c1d40', headline: 'none', footline: 'minimal', filledFrametitle: true , hMarginMm: DEFAULT_MARGIN },
  trigon: { structure: '#3d5a80', headline: 'none', footline: 'minimal', filledFrametitle: true , hMarginMm: DEFAULT_MARGIN },
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
