import type { Preamble } from '../model/types.js';

/**
 * The deck's font family.
 *
 * Every entry here was compiled against the bundled TeX Live and the family beamer
 * actually selected was read out of the log (`\familydefault` after the preamble), for
 * the reason the theme catalogue exists: a package being installed does not mean it
 * changes anything.
 *
 * The measurement that shaped this list: **beamer typesets in SANS by default**, so
 * `mathptmx` and `mathpazo` — the obvious way to offer Times and Palatino — set
 * `\rmdefault` and leave `\familydefault` at `cmss`. Loading either on its own changes
 * NOTHING on the slide. A serif family therefore has to bring `\usefonttheme{serif}`
 * with it, and this table records which ones do.
 *
 * Measured under Madrid, 11pt, pdfLaTeX. `\familydefault` in each case:
 *
 * | choice      | package    | serif theme | family |
 * |-------------|------------|-------------|--------|
 * | Default     | —          | no          | cmss   |
 * | Latin Modern| lmodern    | no          | lmss   |
 * | Helvetica   | helvet     | no          | phv    |
 * | Avant Garde | avant      | no          | pag    |
 * | Times       | mathptmx   | YES         | ptm    |
 * | Palatino    | mathpazo   | YES         | ppl    |
 * | Charter     | charter    | YES         | bch    |
 * | Bookman     | bookman    | YES         | pbk    |
 * | New Century | newcent    | YES         | pnc    |
 * | Utopia      | utopia     | YES         | put    |
 * | Libertine   | libertine  | YES         | LinuxLibertineT |
 *
 * Not bundled, and so not offered: `fourier`, `kpfonts`, `cmbright`, `iwona`,
 * `berasans`, `mathdesign`. Re-run the probe in `tools/fidelity-audit.md` after
 * touching this list.
 */
export interface DeckFont {
  /** The package name, which is also the identity. `null` is beamer's own default. */
  pkg: string | null;
  label: string;
  /** Sans by default, so a serif family needs `\usefonttheme{serif}` to be visible. */
  serif: boolean;
  /** The family the compiler selected, as the log reported it. */
  family: string;
}

export const DECK_FONTS: readonly DeckFont[] = [
  { pkg: null, label: 'Theme default', serif: false, family: 'cmss' },
  { pkg: 'lmodern', label: 'Latin Modern', serif: false, family: 'lmss' },
  { pkg: 'helvet', label: 'Helvetica', serif: false, family: 'phv' },
  { pkg: 'avant', label: 'Avant Garde', serif: false, family: 'pag' },
  { pkg: 'mathptmx', label: 'Times', serif: true, family: 'ptm' },
  { pkg: 'mathpazo', label: 'Palatino', serif: true, family: 'ppl' },
  { pkg: 'charter', label: 'Charter', serif: true, family: 'bch' },
  { pkg: 'bookman', label: 'Bookman', serif: true, family: 'pbk' },
  { pkg: 'newcent', label: 'New Century Schoolbook', serif: true, family: 'pnc' },
  { pkg: 'utopia', label: 'Utopia', serif: true, family: 'put' },
  { pkg: 'libertine', label: 'Libertine', serif: true, family: 'LinuxLibertineT' },
];

/** Every package this picker owns, so choosing one can remove the previous choice. */
export const DECK_FONT_PACKAGES: readonly string[] = DECK_FONTS
  .map((f) => f.pkg)
  .filter((p): p is string => p !== null);

export function deckFontByPackage(pkg: string | null): DeckFont | undefined {
  return DECK_FONTS.find((f) => f.pkg === pkg);
}

/**
 * The CSS font stack the canvas draws with, for what the PDF will actually use.
 *
 * Every theme's canvas spec said `sans` and nothing read the font package or the font
 * theme, so choosing Palatino changed the PDF and left the editor in Latin Modern Sans,
 * title page included (F-017). This follows the same measured rule the picker does:
 * beamer typesets in `\familydefault`, which is the SANS family unless the serif font
 * theme is loaded -- so a serif package alone changes nothing, and the serif font theme
 * with no serif package is Computer Modern Roman.
 *
 * The stacks are the nearest faces a browser is likely to have, named by what TeX Live
 * ships first; the canvas is an approximation and says so, but a serif slide must at
 * least look serif.
 */
export function canvasFontStack(
  preamble: Pick<Preamble, 'packages' | 'fontTheme'>,
  /** The theme's own canvas spec asks for serif. */
  themeSerif = false,
): string {
  const chosen = DECK_FONTS.find((f) => f.pkg !== null && preamble.packages.some((p) => p.name === f.pkg));
  const serifTheme = themeSerif || preamble.fontTheme?.name === 'serif';
  const family = serifTheme
    ? (chosen?.serif === true ? chosen.family : 'cmr')
    : (chosen !== undefined && !chosen.serif ? chosen.family : 'cmss');
  return CSS_STACKS[family] ?? CSS_STACKS['cmss']!;
}

const CSS_STACKS: Readonly<Record<string, string>> = {
  cmss: 'Latin Modern Sans, "CMU Sans Serif", Segoe UI, system-ui, sans-serif',
  lmss: 'Latin Modern Sans, "CMU Sans Serif", Segoe UI, system-ui, sans-serif',
  cmr: 'Latin Modern Roman, "CMU Serif", Georgia, serif',
  phv: '"TeX Gyre Heros", "Nimbus Sans", Helvetica, Arial, sans-serif',
  pag: '"TeX Gyre Adventor", "URW Gothic", "Century Gothic", "Avant Garde", sans-serif',
  ptm: '"TeX Gyre Termes", "Nimbus Roman", "Times New Roman", Times, serif',
  ppl: '"TeX Gyre Pagella", "URW Palladio L", "Palatino Linotype", Palatino, "Book Antiqua", serif',
  bch: '"Bitstream Charter", Charter, "Charis SIL", Georgia, serif',
  pbk: '"TeX Gyre Bonum", "URW Bookman", "Bookman Old Style", Bookman, serif',
  pnc: '"TeX Gyre Schola", "Century Schoolbook", "New Century Schoolbook", serif',
  put: '"Utopia", "Adobe Utopia", Georgia, serif',
  LinuxLibertineT: '"Linux Libertine O", "Linux Libertine", "Libertinus Serif", Georgia, serif',
};
