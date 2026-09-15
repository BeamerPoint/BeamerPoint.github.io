export * from './model/types.js';
export { newId, makeSeededIdFactory } from './model/ids.js';
export {
  normalizeRichText, trimRichText, richTextEquals,
} from './model/richtext.js';
export {
  newDeck, newFrame, newTitleFrame, newTextElement, newListElement, newListItem,
  defaultPreamble, plain,
} from './model/factory.js';

export { emitDeck, emitFrameStandalone, type EmitOptions, type EmitResult } from './emit/deck.js';
export { emitInline, richTextToPlain, colorToTex, isBlankRichText } from './emit/inline.js';
export { escapeText, unescapeText, isPlainEscaped, normalisePastedText } from './emit/escape.js';
export { derivePackages, packageLine } from './emit/derivePackages.js';
export {
  TexWriter, lookupByLine, lookupByOffset, entriesOfKind,
  type SourceMap, type SourceMapEntry,
} from './emit/writer.js';
export type { EmitWarning } from './emit/elements.js';

export { parseDeck, type ParseOptions, type ParseResult, type ParseHealth } from './parse/parseDeck.js';
export { buildCst } from './parse/lexer.js';
export { significantTokens, tokensEqual, type GuardReport } from './parse/guard.js';
export { reassignIds } from './parse/reid.js';
export type { CstNode, ParseDiagnostic } from './parse/cst.js';

export {
  PAPER, PX_PER_MM, PT_PER_MM, DEFAULT_H_MARGIN_MM,
  mmToPx, pxToMm, ptToMm, mmToPt, paperGeometry, roundMm,
  type PaperGeometry,
} from './geometry/paper.js';

export { THEMES, THEME_IDS, resolveTheme, isApproximateTheme } from './themes/themes.js';
export {
  THEME_NAMES, THEME_SHAPES, COLOR_THEME_NAMES, FONT_THEME_NAMES,
  themeNeedsUnicodeEngine, themeShape,
  type ThemeShape, type HeadlineKind, type FootlineKind,
} from './themes/catalogue.js';
export type {
  ThemeSpec, HeadlineSpec, FootlineSpec, FootlineCell, FrametitleSpec, BlockSpec, BlockStyle,
} from './themes/spec.js';
