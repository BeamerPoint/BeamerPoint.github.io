/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

export * from './model/types.js';
export { newId, makeSeededIdFactory } from './model/ids.js';
export {
  normalizeRichText, trimRichText, richTextEquals,
} from './model/richtext.js';
export {
  applyInlineStyle, removeInlineStyle, toggleInlineStyle, hasInlineStyle,
  inlineMarksIn, inlineLength, richTextLength, isRoundTrippableColor,
  type CharRange, type StyleSpec, type InlineMarks,
} from './model/richtextOps.js';
export {
  newDeck, newFrame, newTitleFrame, newTextElement, newListElement, newListItem,
  newTableElement, newTikzElement, newCodeElement, newTocElement, newChartElement,
  defaultPreamble, plain,
} from './model/factory.js';
export { cloneElement, offsetElement } from './model/cloneOps.js';
export { CITE_COMMAND } from './emit/inline.js';
export {
  addShape, attachEndpoint, isAttachable, isNodeTool, moveEndpoint, moveShape,
  removeShape, reorderShape, resizeShape, restyleShape, setArrowHead, setCanvasSize,
  setNodeContent, setShapeLabel, canHoldLabel, setShapeOption, shapeBounds, shapeFromDrag,
  type ShapeOptionPatch, type ShapeCorner,
  type BasicTool, type ShapeTool,
} from './model/shapeOps.js';
export {
  POLYGON_KINDS, POLYGON_LABEL, polygonPoints, type PolygonKind,
} from './model/polygons.js';
export {
  SMART_ART, buildSmartArt, newSmartArtElement,
  type SmartArtKind, type SmartArtSpec,
} from './model/smartArt.js';
export { TIKZ_LIBRARIES, tikzColor } from './emit/tikz.js';
export {
  LST_LANGUAGES, LST_DEFINITIONS, LST_SETUP, lstNeedsDefinition, lstSetupLines,
} from './emit/lstLanguages.js';
export {
  addChartColumn, addChartRow, cellText, isNumericColumn, removeChartColumn,
  removeChartRow, renameChartColumn, replaceChartData, setChartCell,
  setChartSeries, symbolicCoords, type Cell,
} from './model/chartOps.js';
export {
  applyTableStyle, insertTableColumn, insertTableRow, removeTableColumn, removeTableRow,
  setTableColumnAlign, setTableFit, shiftMerges,
} from './model/tableOps.js';

export { emitDeck, emitFrameStandalone, type EmitOptions, type EmitResult } from './emit/deck.js';
export { applyPreviewFallbacks, type PreviewFallbackResult } from './emit/previewFallback.js';
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
export { richTextFromTex } from './parse/fragment.js';
export {
  inlineInputs, graphicsPaths, resolveGraphicPath, normalizePath, type InlineResult,
} from './project/inlineInputs.js';
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
  THEME_NAMES, ALL_THEME_NAMES, THEME_SHAPES, COLOR_THEME_NAMES, FONT_THEME_NAMES,
  themeNeedsUnicodeEngine, themeShape, themeUnavailableReason,
  type ThemeShape, type HeadlineKind, type FootlineKind,
} from './themes/catalogue.js';
export {
  DECK_FONTS, DECK_FONT_PACKAGES, deckFontByPackage, canvasFontStack, type DeckFont,
} from './themes/fonts.js';
export type {
  ThemeSpec, HeadlineSpec, FootlineSpec, FootlineCell, FrametitleSpec, BlockSpec, BlockStyle,
  TitlePageSpec,
} from './themes/spec.js';
export { MEASURED, hasMeasuredColors, type MeasuredTheme } from './themes/measured.js';
export {
  TITLE_LAYOUTS, DEFAULT_TITLE_LAYOUT, titleLayoutFor,
  type TitleLayout, type TitleLine, type TitleField,
} from './themes/titleLayout.js';
