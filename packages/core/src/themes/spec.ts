import type { BeamerFontSize, Mm } from '../model/types.js';

/**
 * Themes are DATA, not stylesheets.
 *
 * One React component tree renders any theme from one of these specs, so adding a
 * theme is a small data file rather than a new component. The canvas targets roughly
 * 80% visual accuracy; the exact appearance always remains one compile away.
 */

/** A resolved CSS colour. Theme specs are already concrete, unlike model colours. */
export type Css = string;

export interface HeadlineSpec {
  kind: 'none' | 'bar' | 'miniframes';
  heightMm: Mm;
  bg: Css;
  fg: Css;
  /** What the bar shows: section navigation, or the deck title. */
  content: 'sections' | 'title' | 'empty';
}

export interface FootlineCell {
  flex: number;
  bg: Css;
  fg: Css;
  content: 'author' | 'institute' | 'title' | 'date' | 'framenumber' | 'section' | 'empty';
}

export interface FootlineSpec {
  heightMm: Mm;
  cells: FootlineCell[];
}

export interface FrametitleSpec {
  align: 'left' | 'center';
  fontSize: BeamerFontSize;
  bold: boolean;
  fg: Css;
  bg?: Css;
  rule?: { color: Css; thicknessMm: Mm };
  paddingMm: { x: Mm; y: Mm };
}

export interface BlockStyle {
  titleBg: Css;
  titleFg: Css;
  bodyBg: Css;
  bodyFg: Css;
}

export interface BlockSpec extends BlockStyle {
  shape: 'plain' | 'rounded' | 'rounded-shadow';
  radiusMm: Mm;
  paddingMm: Mm;
  alert: BlockStyle;
  example: BlockStyle;
}

export interface ThemeSpec {
  id: string;
  label: string;
  structure: Css;
  background: Css;
  foreground: Css;
  fontFamily: 'sans' | 'serif';
  headline: HeadlineSpec;
  footline: FootlineSpec;
  frametitle: FrametitleSpec;
  block: BlockSpec;
  /** Item markers per nesting level. */
  itemMarkers: [string, string, string];
  margins: { hMm: Mm; topMm: Mm; bottomMm: Mm };
  /**
   * Beamer's text area, measured where known: distance from the top of the page, and
   * inset from the bottom. Frame content is centred inside THIS box, not inside
   * whatever is left over after the chrome.
   */
  textBox?: { topMm: Mm; bottomInsetMm: Mm };
}
