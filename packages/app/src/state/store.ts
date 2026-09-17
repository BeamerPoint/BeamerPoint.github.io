import { create } from 'zustand';
import {
  emitDeck,
  newDeck as makeDeck,
  newFrame,
  newListElement,
  newId,
  newChartElement,
  newCodeElement,
  // Aliased for the same reason the table ops are: a bare call inside a shorthand
  // method of the same name reads as recursion even though it is not.
  addChartColumn as addChartColumnOp,
  addChartRow as addChartRowOp,
  removeChartColumn as removeChartColumnOp,
  removeChartRow as removeChartRowOp,
  removeChartSeries as removeChartSeriesOp,
  renameChartColumn as renameChartColumnOp,
  replaceChartData as replaceChartDataOp,
  setChartCell as setChartCellOp,
  setChartSeries as setChartSeriesOp,
  newTocElement,
  newTitleFrame,
  cloneElement,
  offsetElement,
  DECK_FONT_PACKAGES,
  deckFontByPackage,
  newTableElement,
  newTikzElement,
  newSmartArtElement,
  addShape as addShapeOp,
  attachEndpoint,
  moveEndpoint,
  moveShape as moveShapeOp,
  removeShape,
  reorderShape as reorderShapeOp,
  resizeShape as resizeShapeOp,
  restyleShape as restyleShapeOp,
  setArrowHead,
  setCanvasSize,
  setNodeContent,
  setShapeOption as setShapeOptionOp,
  shapeBounds,
  shapeFromDrag,
  // Aliased: the store exposes actions with these names, and a bare call inside a
  // shorthand method would read as recursion even though it is not.
  applyTableStyle as applyStyle,
  insertTableColumn as insertColumn,
  insertTableRow as insertRow,
  removeTableColumn as dropColumn,
  removeTableRow as dropRow,
  setTableColumnAlign as setColumnAlign,
  setTableFit as setFit,
  newTextElement,
  parseDeck,
  plain,
  isBlankRichText,
  richTextEquals,
  themeNeedsUnicodeEngine,
  type AxisSpec,
  type Cell,
  type ChartElement,
  type CodeElement,
  type Deck,
  type DocNode,
  type Element,
  type FrameNode,
  type ParseResult,
  type TexProgram,
  type ImageTrim,
  type MathElement,
  type ResourceRef,
  type RichText,
  type SectionNode,
  type SourceMap,
  type ArrowHead,
  type ShapeCorner,
  type ShapeOptionPatch,
  type SeriesSpec,
  type ShapeTool,
  type SmartArtKind,
  type Color,
  type TableColumn,
  type TableElement,
  type TikzElement,
  type TikzStyle,
} from '@beamerpoint/core';
import type { ShapeDrag } from '../canvas/TikzView.js';
import type { CompileResult, EngineStatus } from '@beamerpoint/engine';
import { DEFAULT_AIDS, snapMm, type AidSettings } from '../canvas/CanvasAids.js';

/**
 * Source-panel state.
 *
 * The invariant that protects the user's work: the canvas and the source editor are
 * never both writable. Typing in the editor moves us to `dirty`, which makes the
 * canvas read-only until the edit is applied or reverted. There is no merge path,
 * because a merge is exactly where hand-written LaTeX gets silently clobbered.
 */
export type SourceStatus = 'synced' | 'dirty' | 'error';

/** The display-math environments the editor can author. */
export type MathEnv = MathElement['env'];

/** The presentation-level fields the format pane can edit. */
export type DeckMetaField = 'title' | 'subtitle' | 'author' | 'institute' | 'date';

export interface SourceHealth {
  balanced: boolean;
  parseErrors: number;
  /** New raw elements compared with the applied deck. Negative or zero is safe. */
  rawDelta: number;
}

export interface Selection {
  slideId: string | null;
  elementId: string | null;
  /** The shape selected inside a tikz element, if any. */
  shapeId?: string | null;
}

interface AppState {
  deck: Deck;
  sourceMap: SourceMap;

  selection: Selection;

  source: {
    status: SourceStatus;
    text: string;
    /** Text as of the last successful sync, for Revert. */
    baseText: string;
    health: SourceHealth | null;
    lastParse: ParseResult | null;
  };

  engine: {
    status: EngineStatus;
    result: CompileResult | null;
    compiling: boolean;
  };

  history: { past: Deck[]; future: Deck[] };

  /** Whether the selection handles resize/move, or crop. */
  overlayMode: 'transform' | 'crop';
  setOverlayMode(mode: 'transform' | 'crop'): void;

  /** Rulers, grid and guides. Canvas only; none of this reaches the document. */
  aids: AidSettings;
  setAids(patch: Partial<AidSettings>): void;
  addGuide(axis: 'v' | 'h', mm: number): void;
  moveGuide(axis: 'v' | 'h', index: number, mm: number): void;
  removeGuide(axis: 'v' | 'h', index: number): void;

  /* actions */
  loadDeck(deck: Deck): void;
  resetDeck(): void;

  selectSlide(slideId: string): void;
  selectElement(slideId: string, elementId: string | null): void;

  addSlide(): void;
  /** A `\titlepage` slide, for when the deck's own has been deleted. */
  addTitleSlide(): void;
  deleteSlide(slideId: string): void;
  moveSlide(slideId: string, delta: number): void;
  /**
   * Drop a slide in front of another node, or at the end when `beforeId` is null.
   *
   * Takes an ID rather than an index because the rail shows frames and section headings
   * together while `deck.nodes` may also hold `rawdoc` nodes it does not show, so a row
   * number and a node index are not the same thing.
   */
  moveSlideBefore(slideId: string, beforeId: string | null): void;
  setSlideTitle(slideId: string, title: string): void;
  addOutlineSlide(): void;

  addSection(level?: SectionNode['level']): void;
  setSectionTitle(sectionId: string, title: string): void;
  /** `keepSlides` deletes the heading only; otherwise the section's frames go too. */
  deleteSection(sectionId: string, keepSlides: boolean): void;
  moveSection(sectionId: string, delta: 1 | -1): void;

  setFrameNote(slideId: string, content: RichText): void;

  attachBibliography(ref: ResourceRef): void;
  detachBibliography(resourceId: string): void;
  setBibliographyStyle(style: string): void;
  addReferencesSlide(): void;
  syncBibliographyFiles(): void;
  insertCitation(slideId: string, elementId: string, key: string): void;

  addTextElement(slideId: string): void;
  addListElement(slideId: string): void;
  deleteElement(slideId: string, elementId: string): void;
  /**
   * The element clipboard.
   *
   * NOT the system clipboard, which holds text: putting a slide element in it would
   * mean emitting LaTeX and parsing it back, losing everything the round trip cannot
   * express — a pasted diagram would arrive as a raw block. This holds the model.
   *
   * It lives in the store rather than in a module variable so the Paste button can be
   * enabled the moment something is copied, and it is set with `set` rather than
   * `mutate`, so copying is not an undoable document change.
   */
  clipboard: Element | null;
  /** Copy, cut and paste for whole elements. Paste targets the CURRENT slide. */
  copyElement(slideId: string, elementId: string): void;
  cutElement(slideId: string, elementId: string): void;
  pasteElement(): void;
  duplicateElement(slideId: string, elementId: string): void;
  setElementContent(slideId: string, elementId: string, content: RichText): void;
  setListItemContent(slideId: string, elementId: string, itemId: string, content: RichText): void;
  addBlockElement(slideId: string, variant: 'block' | 'alertblock' | 'exampleblock'): void;
  addColumnsElement(slideId: string): void;
  addImageElement(slideId: string, ref: ResourceRef): void;
  addMathElement(slideId: string): void;
  addCodeElement(slideId: string): void;
  addChartElement(slideId: string): void;
  setChartCell(
    slideId: string, elementId: string, row: number, col: number, value: Cell,
  ): void;
  addChartRow(slideId: string, elementId: string): void;
  removeChartRow(slideId: string, elementId: string, index: number): void;
  addChartColumn(slideId: string, elementId: string): void;
  removeChartColumn(slideId: string, elementId: string, index: number): void;
  renameChartColumn(slideId: string, elementId: string, index: number, name: string): void;
  setChartSeries(
    slideId: string, elementId: string, seriesId: string,
    patch: Partial<Omit<SeriesSpec, 'id'>>,
  ): void;
  removeChartSeries(slideId: string, elementId: string, seriesId: string): void;
  replaceChartData(slideId: string, elementId: string, text: string): void;
  setChartType(slideId: string, elementId: string, type: ChartElement['chartType']): void;
  setChartAxis(slideId: string, elementId: string, patch: Partial<AxisSpec>): void;
  setChartSize(slideId: string, elementId: string, wMm: number, hMm: number): void;
  setCodeText(slideId: string, elementId: string, code: string): void;
  setCodeLanguage(slideId: string, elementId: string, language: string): void;
  setCodeBackend(slideId: string, elementId: string, backend: CodeElement['backend']): void;
  setCodeFrameStyle(
    slideId: string, elementId: string, frameStyle: CodeElement['frameStyle'],
  ): void;
  setCodeCaption(slideId: string, elementId: string, caption: string | null): void;
  setCodeOption(slideId: string, elementId: string, key: string, value: string | null): void;
  addTextBox(slideId: string): void;
  addTableElement(slideId: string): void;
  setTableCell(
    slideId: string, elementId: string, rowId: string, cellId: string, content: RichText,
  ): void;
  addTableRow(slideId: string, elementId: string, afterIndex: number): void;
  removeTableRow(slideId: string, elementId: string, index: number): void;
  addTableColumn(slideId: string, elementId: string, afterIndex: number): void;
  removeTableColumn(slideId: string, elementId: string, index: number): void;
  setTableColumnAlign(
    slideId: string, elementId: string, index: number, align: TableColumn['align'],
  ): void;
  setTableStyle(slideId: string, elementId: string, style: TableElement['style']): void;
  setTableFit(slideId: string, elementId: string, fit: TableElement['fit']): void;
  setTableCaption(slideId: string, elementId: string, caption: string | null): void;
  setTableRowFill(
    slideId: string, elementId: string, rowIndex: number, fill: Color | null,
  ): void;
  setTableVerticalRules(
    slideId: string, elementId: string, mode: 'none' | 'all' | 'outer',
  ): void;

  addTikzElement(slideId: string): void;
  addSmartArt(slideId: string, kind: SmartArtKind, labels: string[]): void;
  shapeTool: ShapeTool | null;
  setShapeTool(tool: ShapeTool | null): void;
  selectShape(shapeId: string | null): void;
  drawShape(slideId: string, elementId: string, drag: ShapeDrag): void;
  deleteShape(slideId: string, elementId: string, shapeId: string): void;
  moveShape(slideId: string, elementId: string, shapeId: string, dx: number, dy: number): void;
  resizeShape(
    slideId: string, elementId: string, shapeId: string,
    dw: number, dh: number, corner: ShapeCorner,
    /** Shift was held: invert the lock-aspect preference for this gesture. */
    invertLock?: boolean,
  ): void;
  moveShapeEndpoint(
    slideId: string, elementId: string, shapeId: string, which: 'from' | 'to',
    point: { x: number; y: number },
    over: { shapeId: string; side: 'n' | 's' | 'e' | 'w' | 'center' } | null,
  ): void;
  restyleShape(slideId: string, elementId: string, shapeId: string, patch: Partial<TikzStyle>): void;
  reorderShape(slideId: string, elementId: string, shapeId: string, delta: 1 | -1): void;
  setShapeArrowHead(slideId: string, elementId: string, shapeId: string, head: ArrowHead): void;
  setShapeText(slideId: string, elementId: string, shapeId: string, text: string): void;
  setShapeOption(
    slideId: string, elementId: string, shapeId: string, patch: ShapeOptionPatch,
  ): void;
  setTikzCanvasSize(slideId: string, elementId: string, w: number, h: number): void;
  setMathTex(slideId: string, elementId: string, tex: string): void;
  setMathEnv(slideId: string, elementId: string, env: MathEnv): void;
  setImageWidth(slideId: string, elementId: string, fraction: number): void;
  setImageCaption(slideId: string, elementId: string, caption: string | null): void;
  setImageAlign(slideId: string, elementId: string, align: 'left' | 'center' | 'right'): void;
  setImageTrim(slideId: string, elementId: string, trim: ImageTrim | null): void;
  nudgeImageWidth(slideId: string, elementId: string, deltaMm: number, deltaFraction: number): void;
  /**
   * Bracket a pointer drag: one undo entry for the whole gesture, and an accumulator
   * that is not re-snapped on every move. Every canvas drag calls both.
   */
  beginGesture(): void;
  endGesture(): void;
  moveElementBy(slideId: string, elementId: string, dxMm: number, dyMm: number): void;
  resizeElementBy(
    slideId: string, elementId: string, dxMm: number, dyMm: number, grip: ResizeGrip,
    /** Shift was held: invert the lock-aspect preference for this gesture. */
    invertLock?: boolean,
  ): void;
  setElementBox(
    slideId: string, elementId: string,
    box: { x?: number; y?: number; w?: number },
  ): void;
  setImageHeightMm(slideId: string, elementId: string, mm: number | null): void;
  setImageRotate(slideId: string, elementId: string, deg: number): void;
  setImageKeepAspect(slideId: string, elementId: string, keep: boolean): void;
  /** 0..1, where 1 is opaque and removes the wrapper entirely. */
  setImageOpacity(slideId: string, elementId: string, opacity: number): void;
  setElementRotate(slideId: string, elementId: string, deg: number): void;
  returnElementToFlow(slideId: string, elementId: string): void;
  moveElementToAbsolute(slideId: string, elementId: string, x: number, y: number, w: number): void;

  setDeckMeta(patch: Partial<Record<DeckMetaField, string>>): void;
  setTheme(name: string): void;
  setTexProgram(program: TexProgram): void;
  /** The deck's font family, by package name; `null` is beamer's own default. */
  setDeckFont(pkg: string | null): void;
  setAspect(aspect: Deck['preamble']['documentClass']['aspectRatio']): void;

  editSource(text: string): void;
  applySource(): void;
  revertSource(): void;

  setEngineStatus(s: EngineStatus): void;
  setCompiling(v: boolean): void;
  setCompileResult(r: CompileResult | null): void;

  undo(): void;
  redo(): void;
}

function regenerate(deck: Deck): { text: string; sourceMap: SourceMap } {
  const { tex, sourceMap } = emitDeck(deck);
  return { text: tex, sourceMap };
}

/**
 * Frames of a deck, memoised on deck identity.
 *
 * Zustand compares selector results by reference, so returning a fresh array here
 * would re-render forever. The deck is replaced wholesale on every mutation, so
 * identity is a sound cache key.
 */
let framesCache: { deck: Deck; frames: FrameNode[] } | null = null;

function frames(deck: Deck): FrameNode[] {
  if (framesCache !== null && framesCache.deck === deck) return framesCache.frames;
  const result = deck.nodes.filter((n): n is FrameNode => n.kind === 'frame');
  framesCache = { deck, frames: result };
  return result;
}

/**
 * Where each element is currently drawn, in slide millimetres.
 *
 * Recorded by the canvas as it renders. Lifting an element out of the text flow needs
 * its present position, or it would jump to an arbitrary spot the moment it is dragged.
 */
export const measuredRects = new Map<string, MeasuredRect>();

export interface MeasuredRect { x: number; y: number; w: number; h: number }

/**
 * The pointer gesture in progress, if any.
 *
 * Two things a drag needs that per-move state cannot give it:
 *
 * 1. **One undo entry.** `base` is the deck as it was before the first pointermove;
 *    `mutate` pushes nothing while this is set.
 * 2. **Raw, unsnapped accumulation.** Snapping used to be applied to the stored value
 *    on every move, and the next move then started from the snapped number — so once a
 *    box touched a guide it could not be pulled off it, because no single move exceeds
 *    the 1.5mm tolerance. The gesture keeps the true position and snapping is a
 *    presentation of it.
 *
 * Deliberately module-level rather than React state: it changes many times per frame
 * and nothing renders from it.
 */
interface Gesture {
  base: Deck;
  /** Raw box of the element being dragged; `h` is its height where one is emitted. */
  box: MeasuredRect | null;
  /** Raw \textwidth fraction, for a picture still in the text flow. */
  frac: number | null;
  /** The same, for a shape inside a diagram; a drag touches one or the other. */
  shapeRatio: number | null;
  /**
   * Width over height as the drag BEGAN, for a locked-aspect corner drag.
   *
   * Taken once, not recomputed per move: derive it from the current box each time and
   * rounding feeds back into it, so a long drag walks the proportions away from where
   * they started. This is also why locking uses the box's own ratio rather than an
   * image's intrinsic one — what the user sees is what gets preserved, which is what
   * every drawing program does.
   */
  ratio: number | null;
}

let gesture: Gesture | null = null;



/**
 * How far a pasted copy lands from what it was copied from.
 *
 * A copy sitting exactly on top of the original is invisible, and a paste that
 * looks like it did nothing gets pressed again.
 */
const PASTE_OFFSET_MM = 4;

/** Smallest box a drag may leave behind, so an element can never be lost. */
const MIN_BOX_MM = 5;

/**
 * Where an element lands if nothing measured it.
 *
 * Only reachable for an element that has never been rendered, since the canvas records
 * every element's rect as it draws. It used to be the ONLY path for anything that was
 * not an image, which is why dragging a block sent it to (20, 30).
 */
const FALLBACK_RECT: MeasuredRect = { x: 20, y: 30, w: 80, h: 20 };

/** Which corner or edge a resize is pulling. */
export type ResizeGrip = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** One decimal of a millimetre, which is the precision the emitter writes. */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The height LaTeX has actually been told about, where there is one. */
function elementHeightMm(el: Element, measured: MeasuredRect): number {
  if (el.kind === 'image' && el.height?.u === 'mm') return el.height.v;
  if (el.kind === 'tikz' && el.mode !== 'raw') return el.canvasSize.h;
  if (el.kind === 'chart' && el.size.h.u === 'mm') return el.size.h.v;
  return measured.h;
}

/**
 * Keep a freely-placed diagram or chart's BOX the same width as the picture in it.
 *
 * They are the same width — the box exists to position the picture — but nothing kept
 * them together, so setting the canvas size numerically left the element box at its old
 * width. The selection handles follow the BOX, so they ended up floating to the right of
 * a picture that had been made smaller, and dragging one resized from a width the user
 * could not see. Measured in the browser: a 90mm picture in a 170.5mm box.
 */
function withBoxWidth<T extends Element>(el: T, wMm: number): T {
  if (el.placement.mode !== 'absolute') return el;
  return { ...el, placement: { ...el.placement, w: round1(wMm) } };
}

/**
 * The width the element actually DRAWS at.
 *
 * For most things that is the placement box, or where the canvas last drew it. A
 * diagram and a chart are different: they draw at their own canvas size, and a flow one
 * sits in a block-level div that spans the whole text column -- so the measured rect
 * reports about 152mm for a picture 100mm wide. Taking the width from there made a
 * locked corner drag preserve the ratio of the COLUMN rather than of the picture, which
 * is what it visibly did before this existed.
 */
function elementWidthMm(el: Element, measured: MeasuredRect): number {
  if (el.kind === 'tikz' && el.mode !== 'raw') return el.canvasSize.w;
  if (el.kind === 'chart' && el.size.w.u === 'mm') return el.size.w.v;
  if (el.placement.mode === 'absolute') return el.placement.w;
  return measured.w;
}

/**
 * The raw box a drag accumulates into.
 *
 * Inside a gesture this is ONE object for the whole drag, so pointer deltas add up at
 * full precision and snapping never feeds back into the next move. Outside a gesture —
 * the Arrange pane's numeric fields, the tests — it is read fresh from the element
 * every time, which is what those callers expect.
 */
function gestureBox(el: Element, elementId: string): MeasuredRect {
  if (gesture !== null && gesture.box !== null) return gesture.box;
  const measured = measuredRects.get(elementId) ?? FALLBACK_RECT;
  const h = elementHeightMm(el, measured);
  const w = elementWidthMm(el, measured);
  const box: MeasuredRect = el.placement.mode === 'absolute'
    ? { x: el.placement.x, y: el.placement.y, w, h }
    : { x: measured.x, y: measured.y, w, h };
  if (gesture !== null) gesture.box = box;
  return box;
}

/**
 * Where a section's block of nodes starts and ends.
 *
 * A section owns everything after its heading up to the next heading of the same or a
 * higher level — `subsection` does not end `section`, it nests inside it.
 */
const SECTION_RANK: Readonly<Record<SectionNode['level'], number>> = {
  part: 0, section: 1, subsection: 2, subsubsection: 3,
};

function sectionSpan(deck: Deck, sectionId: string): { start: number; end: number } | null {
  const start = deck.nodes.findIndex((n) => n.id === sectionId);
  const head = deck.nodes[start];
  if (start === -1 || head === undefined || head.kind !== 'section') return null;

  const rank = SECTION_RANK[head.level];
  for (let i = start + 1; i < deck.nodes.length; i += 1) {
    const n = deck.nodes[i]!;
    if (n.kind === 'section' && SECTION_RANK[n.level] <= rank) return { start, end: i };
  }
  return { start, end: deck.nodes.length };
}

/** The index just past the block owned by the section heading at `from`. */
function nextSectionAfter(nodes: readonly DocNode[], from: number): number {
  const head = nodes[from];
  if (head === undefined || head.kind !== 'section') return from + 1;
  const rank = SECTION_RANK[head.level];
  for (let i = from + 1; i < nodes.length; i += 1) {
    const n = nodes[i]!;
    if (n.kind === 'section' && SECTION_RANK[n.level] <= rank) return i;
  }
  return nodes.length;
}

/** Every attached `.bib`, named the way `\bibliography{...}` wants them: no extension. */
export function bibFiles(deck: Deck): string[] {
  return deck.resources
    .filter((r) => r.kind === 'bib')
    .map((r) => r.path.replace(/\.bib$/i, ''));
}

/** Find an element of a frame, at any depth.
 *
 * Elements nest: a block and a set of columns both hold children. This used to look at
 * the frame's own list only, which — together with the equally shallow `mapElement` —
 * is why typing into a block's body did nothing at all. The edit was applied to a list
 * that did not contain the element, and the result was silently discarded.
 */
export function findElement(
  deck: Deck, slideId: string, elementId: string,
): Element | undefined {
  const frame = deck.nodes.find((n) => n.kind === 'frame' && n.id === slideId);
  if (frame === undefined || frame.kind !== 'frame') return undefined;

  const search = (els: readonly Element[]): Element | undefined => {
    for (const el of els) {
      if (el.id === elementId) return el;
      const inner = el.kind === 'block'
        ? search(el.children)
        : el.kind === 'columns'
          ? el.columns.map((c) => search(c.children)).find((x) => x !== undefined)
          : undefined;
      if (inner !== undefined) return inner;
    }
    return undefined;
  };
  return search(frame.children);
}

/** Apply `fn` to every element at any depth, keeping the tree's shape. */
function mapTree(els: readonly Element[], fn: (el: Element) => Element): Element[] {
  return els.map((el) => {
    const mapped = fn(el);
    if (mapped.kind === 'block') return { ...mapped, children: mapTree(mapped.children, fn) };
    if (mapped.kind === 'columns') {
      return {
        ...mapped,
        columns: mapped.columns.map((c) => ({ ...c, children: mapTree(c.children, fn) })),
      };
    }
    return mapped;
  });
}

/** True when this element is inside a block or a column rather than the frame itself. */
function isNested(deck: Deck, slideId: string, elementId: string): boolean {
  const frame = deck.nodes.find((n) => n.kind === 'frame' && n.id === slideId);
  if (frame === undefined || frame.kind !== 'frame') return false;
  return frame.children.every((el) => el.id !== elementId)
    && findElement(deck, slideId, elementId) !== undefined;
}

/** Drop `elementId` wherever it is, at any depth. */
function removeFromTree(els: readonly Element[], elementId: string): Element[] {
  return els
    .filter((el) => el.id !== elementId)
    .map((el) => {
      if (el.kind === 'block') return { ...el, children: removeFromTree(el.children, elementId) };
      if (el.kind === 'columns') {
        return {
          ...el,
          columns: el.columns.map((c) => ({
            ...c, children: removeFromTree(c.children, elementId),
          })),
        };
      }
      return el;
    });
}

function countRaw(deck: Deck): number {
  let n = 0;
  const visit = (els: Element[]): void => {
    for (const el of els) {
      if (el.kind === 'raw') n += 1;
      else if (el.kind === 'block') visit(el.children);
      else if (el.kind === 'columns') el.columns.forEach((c) => visit(c.children));
    }
  };
  for (const node of deck.nodes) {
    if (node.kind === 'rawdoc') n += 1;
    else if (node.kind === 'frame') visit(node.children);
  }
  return n;
}

/** Quick structural health check, used to decide whether auto-apply is safe. */
function healthOf(text: string, appliedDeck: Deck): SourceHealth {
  const parsed = parseDeck(text);
  return {
    balanced: parsed.health.parseErrors === 0,
    parseErrors: parsed.health.parseErrors,
    rawDelta: countRaw(parsed.deck) - countRaw(appliedDeck),
  };
}

const AIDS_KEY = 'bp:canvas:aids';

/** Aids are a workspace preference, not part of the document. */
function loadAids(): AidSettings {
  try {
    const raw = window.localStorage.getItem(AIDS_KEY);
    return raw === null ? DEFAULT_AIDS : { ...DEFAULT_AIDS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_AIDS;
  }
}

function saveAids(a: AidSettings): void {
  try {
    window.localStorage.setItem(AIDS_KEY, JSON.stringify(a));
  } catch { /* private window; the defaults are fine */ }
}

const initialDeck = makeDeck({ title: 'Untitled Presentation' });
const initialSource = regenerate(initialDeck);

export const useStore = create<AppState>()((set, get) => {
  /**
   * Apply a deck mutation, push undo, and keep the source panel in sync.
   *
   * During a pointer gesture no undo entry is pushed: `beginGesture` recorded the deck
   * as it was before the drag, and that one entry is the whole gesture. Pushing per
   * pointermove buried the 100-deep stack under a single drag, so one Ctrl+Z after
   * resizing a box undid a couple of pixels of it.
   */
  const mutate = (fn: (deck: Deck) => Deck): void => {
    const state = get();
    if (state.source.status !== 'synced') return; // canvas is locked
    const next = fn(state.deck);
    const regen = regenerate(next);
    set({
      deck: next,
      sourceMap: regen.sourceMap,
      source: { ...state.source, text: regen.text, baseText: regen.text },
      history: gesture !== null
        ? state.history
        : { past: [...state.history.past, state.deck].slice(-100), future: [] },
    });
  };

  const mapTable = (
    deck: Deck,
    slideId: string,
    elementId: string,
    fn: (t: TableElement) => TableElement,
  ): Deck => mapElement(deck, slideId, elementId, (el) => (el.kind === 'table' ? fn(el) : el));

  const mapCode = (
    deck: Deck,
    slideId: string,
    elementId: string,
    fn: (el: CodeElement) => CodeElement,
  ): Deck => mapElement(deck, slideId, elementId, (el) => (el.kind === 'code' ? fn(el) : el));

  const mapChart = (
    deck: Deck,
    slideId: string,
    elementId: string,
    fn: (el: ChartElement) => ChartElement,
  ): Deck => mapElement(deck, slideId, elementId, (el) => (el.kind === 'chart' ? fn(el) : el));

  const mapTikz = (
    deck: Deck,
    slideId: string,
    elementId: string,
    fn: (el: TikzElement) => TikzElement,
  ): Deck => mapElement(deck, slideId, elementId, (el) => (el.kind === 'tikz' ? fn(el) : el));

  const mapFrame = (deck: Deck, slideId: string, fn: (f: FrameNode) => FrameNode): Deck => ({
    ...deck,
    nodes: deck.nodes.map((n) => (n.kind === 'frame' && n.id === slideId ? fn(n) : n)),
  });

  /**
   * Move an element out of its block or column and onto the frame itself.
   *
   * A freely-placed element is positioned from the page corner by `textpos`, so it is
   * not inside anything any more — leaving it in the block's child list would make the
   * canvas draw it inside a box the PDF puts it nowhere near. Dragging something out of
   * a container is how PowerPoint frees it too.
   */
  const liftToFrame = (deck: Deck, slideId: string, elementId: string): Deck => {
    const el = findElement(deck, slideId, elementId);
    if (el === undefined || !isNested(deck, slideId, elementId)) return deck;
    return mapFrame(deck, slideId, (f) => ({
      ...f,
      children: [...removeFromTree(f.children, elementId), el],
    }));
  };

  const mapElement = (
    deck: Deck,
    slideId: string,
    elementId: string,
    fn: (el: Element) => Element,
  ): Deck =>
    mapFrame(deck, slideId, (f) => ({
      ...f,
      children: mapTree(f.children, (el) => (el.id === elementId ? fn(el) : el)),
    }));

  return {
    deck: initialDeck,
    sourceMap: initialSource.sourceMap,
    selection: { slideId: frames(initialDeck)[0]?.id ?? null, elementId: null },
    source: {
      status: 'synced',
      text: initialSource.text,
      baseText: initialSource.text,
      health: null,
      lastParse: null,
    },
    engine: { status: { s: 'uninitialised' }, result: null, compiling: false },
    history: { past: [], future: [] },
    overlayMode: 'transform',
    shapeTool: null,
    aids: loadAids(),

    setOverlayMode(mode) {
      set({ overlayMode: mode });
    },

    setAids(patch) {
      const next = { ...get().aids, ...patch };
      saveAids(next);
      set({ aids: next });
    },

    addGuide(axis, mm) {
      const aids = get().aids;
      const key = axis === 'v' ? 'vertical' : 'horizontal';
      const next = { ...aids, [key]: [...aids[key], mm] };
      saveAids(next);
      set({ aids: next });
    },

    moveGuide(axis, index, mm) {
      const aids = get().aids;
      const key = axis === 'v' ? 'vertical' : 'horizontal';
      const list = [...aids[key]];
      list[index] = mm;
      const next = { ...aids, [key]: list };
      set({ aids: next });
    },

    removeGuide(axis, index) {
      const aids = get().aids;
      const key = axis === 'v' ? 'vertical' : 'horizontal';
      const next = { ...aids, [key]: aids[key].filter((_, i) => i !== index) };
      saveAids(next);
      set({ aids: next });
    },

    loadDeck(deck) {
      const regen = regenerate(deck);
      set({
        deck,
        sourceMap: regen.sourceMap,
        selection: { slideId: frames(deck)[0]?.id ?? null, elementId: null },
        source: {
          status: 'synced', text: regen.text, baseText: regen.text,
          health: null, lastParse: null,
        },
        history: { past: [], future: [] },
        // A different document. An element copied out of the old one may reference an
        // image resource this deck does not have, which would paste a picture that can
        // never render and whose file the export cannot find.
        clipboard: null,
      });
    },

    resetDeck() {
      get().loadDeck(makeDeck({ title: 'Untitled Presentation' }));
    },

    selectSlide(slideId) {
      set({ selection: { slideId, elementId: null } });
    },

    selectElement(slideId, elementId) {
      set({ selection: { slideId, elementId, shapeId: null }, overlayMode: 'transform' });
    },

    addSlide() {
      const frame = newFrame('New slide', [newTextElement('')]);
      mutate((deck) => {
        const idx = deck.nodes.findIndex((n) => n.id === get().selection.slideId);
        const nodes = [...deck.nodes];
        nodes.splice(idx === -1 ? nodes.length : idx + 1, 0, frame);
        return { ...deck, nodes };
      });
      set({ selection: { slideId: frame.id, elementId: null } });
    },

    /**
     * A title slide.
     *
     * `\titlepage` is a raw element by design -- beamer builds the slide from the
     * deck's own title, author and date, and the canvas draws it from a measured
     * layout. Deleting it used to be irreversible without hand-editing the source,
     * since nothing in the UI could write that one command back.
     */
    addTitleSlide() {
      const frame = newTitleFrame();
      mutate((deck) => {
        const nodes = [...deck.nodes];
        const idx = nodes.findIndex((n) => n.id === get().selection.slideId);
        nodes.splice(idx === -1 ? nodes.length : idx + 1, 0, frame);
        return { ...deck, nodes };
      });
      set({ selection: { slideId: frame.id, elementId: null } });
    },

    /**
     * A slide holding `\tableofcontents`.
     *
     * Beamer builds the list from the deck's sections, so there is nothing to type: the
     * canvas draws the sections it can see and the PDF has the real thing.
     */
    addOutlineSlide() {
      const frame = newFrame('Outline', [newTocElement()]);
      mutate((deck) => {
        const idx = deck.nodes.findIndex((n) => n.id === get().selection.slideId);
        const nodes = [...deck.nodes];
        nodes.splice(idx === -1 ? nodes.length : idx + 1, 0, frame);
        return { ...deck, nodes };
      });
      set({ selection: { slideId: frame.id, elementId: null } });
    },

    /**
     * A section heading, inserted after the current slide.
     *
     * Sections are SIBLINGS of frames in one flat list, not a tree — that is how beamer
     * reads them and how the emitter writes them. Everything about "the slides in this
     * section" is therefore a question about the span between two headings.
     */
    addSection(level = 'section') {
      const node: SectionNode = {
        kind: 'section',
        id: newId(),
        level,
        title: plain('New section'),
        starred: false,
      };
      mutate((deck) => {
        const idx = deck.nodes.findIndex((n) => n.id === get().selection.slideId);
        const nodes = [...deck.nodes];
        nodes.splice(idx === -1 ? nodes.length : idx + 1, 0, node);
        return { ...deck, nodes };
      });
    },

    setSectionTitle(sectionId, title) {
      mutate((deck) => ({
        ...deck,
        nodes: deck.nodes.map((n) =>
          (n.kind === 'section' && n.id === sectionId ? { ...n, title: plain(title) } : n)),
      }));
    },

    deleteSection(sectionId, keepSlides) {
      mutate((deck) => {
        const span = sectionSpan(deck, sectionId);
        if (span === null) return deck;
        const nodes = keepSlides
          ? deck.nodes.filter((n) => n.id !== sectionId)
          : [...deck.nodes.slice(0, span.start), ...deck.nodes.slice(span.end)];
        return { ...deck, nodes };
      });
      const remaining = frames(get().deck);
      if (!remaining.some((f) => f.id === get().selection.slideId)) {
        set({ selection: { slideId: remaining[0]?.id ?? null, elementId: null } });
      }
    },

    /**
     * Move a section, and the slides under it.
     *
     * Moving the heading alone would silently re-parent every slide it owned, which is
     * the kind of edit you do not notice until you present.
     */
    moveSection(sectionId, delta) {
      mutate((deck) => {
        const span = sectionSpan(deck, sectionId);
        if (span === null) return deck;
        const block = deck.nodes.slice(span.start, span.end);
        const rest = [...deck.nodes.slice(0, span.start), ...deck.nodes.slice(span.end)];

        // Land before the previous SIBLING, or after the next one. Only headings of the
        // same or a higher rank count: the nearest preceding heading is often a
        // subsection of the very section being moved, and landing there would drop the
        // block into the middle of its own parent.
        const head = deck.nodes[span.start]!;
        const rank = head.kind === 'section' ? SECTION_RANK[head.level] : 1;
        const siblings = rest
          .map((n, i) => (n.kind === 'section' && SECTION_RANK[n.level] <= rank ? i : -1))
          .filter((i) => i !== -1);

        const before = siblings.filter((i) => i < span.start);
        const after = siblings.filter((i) => i >= span.start);
        const target = delta === -1
          ? before[before.length - 1]
          : (after[0] === undefined ? undefined : nextSectionAfter(rest, after[0]));
        if (target === undefined) return deck;

        return { ...deck, nodes: [...rest.slice(0, target), ...block, ...rest.slice(target)] };
      });
    },

    /**
     * The slide's speaker note.
     *
     * Beamer allows several `\note` commands per frame and the model keeps them all, but
     * the pane edits one: a second note has no separate meaning on the slide, and an
     * imported deck's extra notes are left alone rather than being merged.
     */
    setFrameNote(slideId, content) {
      mutate((deck) =>
        mapFrame(deck, slideId, (f) => {
          const empty = isBlankRichText(content);
          if (f.notes.length === 0) {
            return empty ? f : { ...f, notes: [{ id: newId(), content }] };
          }
          const notes = empty
            ? f.notes.slice(1)
            : [{ ...f.notes[0]!, content }, ...f.notes.slice(1)];
          return { ...f, notes };
        }),
      );
    },

    /**
     * Attach a `.bib` and point the deck at it.
     *
     * The resource carries the bytes; `\bibliography{refs}` names the file WITHOUT its
     * extension, which is what BibTeX expects. A style is set at the same time, because
     * without one LaTeX prints nothing and says little about why.
     */
    attachBibliography(ref) {
      mutate((deck) => {
        const preamble = deck.preamble.bibliography === undefined
          ? { ...deck.preamble, bibliography: { style: 'plain', backend: 'bibtex' as const } }
          : deck.preamble;
        return { ...deck, preamble, resources: [...deck.resources, ref] };
      });
      // Keep any references slide pointing at every attached file.
      get().syncBibliographyFiles();
    },

    detachBibliography(resourceId) {
      mutate((deck) => ({
        ...deck,
        resources: deck.resources.filter((r) => r.id !== resourceId),
      }));
      get().syncBibliographyFiles();
    },

    setBibliographyStyle(style) {
      mutate((deck) => ({
        ...deck,
        preamble: { ...deck.preamble, bibliography: { style, backend: 'bibtex' } },
      }));
    },

    /** Rewrite every `BibliographyElement`'s file list from the attached resources. */
    syncBibliographyFiles() {
      const files = bibFiles(get().deck);
      mutate((deck) => ({
        ...deck,
        nodes: deck.nodes.map((n) => (n.kind !== 'frame' ? n : {
          ...n,
          children: n.children.map((el) =>
            (el.kind === 'bibliography' && el.files.length > 0 ? { ...el, files } : el)),
        })),
      }));
    },

    /**
     * A slide holding the reference list.
     *
     * `[allowframebreaks]` because a bibliography is exactly the thing that overflows a
     * slide, and beamer's answer is to continue it on the next one.
     */
    addReferencesSlide() {
      const el: Element = {
        id: newId(),
        kind: 'bibliography',
        placement: { mode: 'flow' },
        files: bibFiles(get().deck),
        sizeHint: 'footnotesize',
      };
      const frame: FrameNode = {
        ...newFrame('References', [el]),
        options: { allowframebreaks: true },
      };
      mutate((deck) => ({ ...deck, nodes: [...deck.nodes, frame] }));
      set({ selection: { slideId: frame.id, elementId: el.id } });
    },

    /** Append a `\cite{key}` to the end of a text element. */
    insertCitation(slideId, elementId, key) {
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (el) => {
          if (el.kind !== 'text') return el;
          const sep: RichText = el.content.length === 0 ? [] : [{ t: 'text', s: ' ' }];
          return { ...el, content: [...el.content, ...sep, { t: 'cite', keys: [key] }] };
        }),
      );
    },

    /**
     * Delete a slide, and land on the one next to it.
     *
     * Two things this used to get wrong. It selected the FIRST slide rather than the
     * neighbour of the one deleted, so deleting slide 30 of 40 threw you back to the
     * top. And deleting the last slide was a silent no-op with the button still
     * enabled — a deck with no frames is legal LaTeX but is not a deck anyone wants, so
     * the last slide is REPLACED by a blank one instead.
     */
    deleteSlide(slideId) {
      const all = frames(get().deck);
      const gone = all.findIndex((f) => f.id === slideId);
      if (gone === -1) return;

      if (all.length === 1) {
        const fresh = newFrame('New slide', [newTextElement('')]);
        mutate((deck) => ({
          ...deck,
          nodes: deck.nodes.map((n) => (n.id === slideId ? fresh : n)),
        }));
        set({ selection: { slideId: fresh.id, elementId: null } });
        return;
      }

      const next = all[gone + 1] ?? all[gone - 1]!;
      mutate((deck) => ({ ...deck, nodes: deck.nodes.filter((n) => n.id !== slideId) }));
      set({ selection: { slideId: next.id, elementId: null } });
    },

    /**
     * Move a slide one place up or down among the SLIDES.
     *
     * `deck.nodes` holds frames and section headings in one flat list, so stepping by
     * one index there swapped a slide with a heading — the slide appeared not to move
     * while the section it belonged to silently changed. The step is taken over the
     * frames and translated back to a node index.
     */
    moveSlide(slideId, delta) {
      mutate((deck) => {
        const order = deck.nodes.filter((n) => n.kind === 'frame');
        const at = order.findIndex((n) => n.id === slideId);
        const to = at + delta;
        if (at === -1 || to < 0 || to >= order.length) return deck;

        const nodes = [...deck.nodes];
        const from = nodes.findIndex((n) => n.id === slideId);
        const [node] = nodes.splice(from, 1);
        // Where the slide it is trading places with now sits, after the removal.
        const anchor = nodes.findIndex((n) => n.id === order[to]!.id);
        nodes.splice(delta > 0 ? anchor + 1 : anchor, 0, node!);
        return { ...deck, nodes };
      });
    },

    moveSlideBefore(slideId, beforeId) {
      if (slideId === beforeId) return;
      mutate((deck) => {
        const from = deck.nodes.findIndex((n) => n.id === slideId);
        if (from === -1) return deck;
        const nodes = [...deck.nodes];
        const [node] = nodes.splice(from, 1);
        // Located AFTER the removal, so the index still points at the right neighbour
        // however far the slide travelled.
        const at = beforeId === null ? -1 : nodes.findIndex((n) => n.id === beforeId);
        nodes.splice(at === -1 ? nodes.length : at, 0, node!);
        return { ...deck, nodes };
      });
    },

    setSlideTitle(slideId, title) {
      mutate((deck) =>
        mapFrame(deck, slideId, (f) => ({
          ...f,
          ...(title === '' ? { title: undefined } : { title: plain(title) }),
        })),
      );
    },

    addTextElement(slideId) {
      const el = newTextElement('New text');
      mutate((deck) => mapFrame(deck, slideId, (f) => ({ ...f, children: [...f.children, el] })));
      set({ selection: { slideId, elementId: el.id } });
    },

    addListElement(slideId) {
      const el = newListElement(['First point', 'Second point']);
      mutate((deck) => mapFrame(deck, slideId, (f) => ({ ...f, children: [...f.children, el] })));
      set({ selection: { slideId, elementId: el.id } });
    },

    /**
     * Copy, cut and paste for whole elements.
     *
     * The clipboard holds the MODEL, not LaTeX. Going through the system clipboard
     * would mean emitting and reparsing, which loses anything the round trip cannot
     * express -- a pasted diagram would come back as a raw block.
     */
    clipboard: null,

    copyElement(slideId, elementId) {
      const el = findElement(get().deck, slideId, elementId);
      if (el !== undefined) set({ clipboard: el });
    },

    cutElement(slideId, elementId) {
      const el = findElement(get().deck, slideId, elementId);
      if (el === undefined) return;
      set({ clipboard: el });
      get().deleteElement(slideId, elementId);
    },

    /**
     * Paste onto the slide that is showing, not the one it was copied from.
     *
     * Always onto the FRAME, never back inside the block or column the original came
     * from: the copy is a new thing on this slide, and burying it in a container the
     * user is not looking at is how a paste appears to do nothing.
     */
    pasteElement() {
      const state = get();
      const slideId = state.selection.slideId;
      const source = state.clipboard;
      if (source === null || slideId === null) return;

      // Every id inside is renewed here, including the shape ids a diagram's arrows
      // point at -- see `cloneOps`. Pasting twice must give two independent copies, so
      // the clipboard keeps the ORIGINAL and each paste clones it afresh.
      const copy = offsetElement(cloneElement(source), PASTE_OFFSET_MM, PASTE_OFFSET_MM);
      mutate((deck) =>
        mapFrame(deck, slideId, (f) => ({ ...f, children: [...f.children, copy] })),
      );
      set({ selection: { slideId, elementId: copy.id } });
    },

    duplicateElement(slideId, elementId) {
      const el = findElement(get().deck, slideId, elementId);
      if (el === undefined) return;
      const copy = offsetElement(cloneElement(el), PASTE_OFFSET_MM, PASTE_OFFSET_MM);
      mutate((deck) =>
        mapFrame(deck, slideId, (f) => ({ ...f, children: [...f.children, copy] })),
      );
      set({ selection: { slideId, elementId: copy.id } });
    },

    deleteElement(slideId, elementId) {
      mutate((deck) =>
        mapFrame(deck, slideId, (f) => ({
          ...f,
          children: removeFromTree(f.children, elementId),
        })),
      );
      set({ selection: { slideId, elementId: null } });
    },

    setElementContent(slideId, elementId, content) {
      const el = findElement(get().deck, slideId, elementId);
      // Focusing and blurring without typing must not create an undo entry.
      if (el?.kind === 'text' && richTextEquals(el.content, content)) return;
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (e) =>
          e.kind === 'text' ? { ...e, content } : e,
        ),
      );
    },

    setListItemContent(slideId, elementId, itemId, content) {
      const el = findElement(get().deck, slideId, elementId);
      if (el?.kind === 'list') {
        const item = el.items.find((i) => i.id === itemId);
        if (item !== undefined && richTextEquals(item.content, content)) return;
      }
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (e) =>
          e.kind === 'list'
            ? { ...e, items: e.items.map((i) => (i.id === itemId ? { ...i, content } : i)) }
            : e,
        ),
      );
    },

    addBlockElement(slideId, variant) {
      const el: Element = {
        id: newId(),
        kind: 'block',
        placement: { mode: 'flow' },
        variant,
        title: plain(variant === 'alertblock' ? 'Important'
          : variant === 'exampleblock' ? 'Example' : 'Block title'),
        children: [newTextElement('Block content.')],
      };
      mutate((deck) => mapFrame(deck, slideId, (f) => ({ ...f, children: [...f.children, el] })));
      set({ selection: { slideId, elementId: el.id } });
    },

    addColumnsElement(slideId) {
      const el: Element = {
        id: newId(),
        kind: 'columns',
        placement: { mode: 'flow' },
        columns: [
          {
            id: newId(),
            width: { v: 0.48, u: 'textwidth' },
            valign: 't',
            children: [newTextElement('Left column.')],
          },
          {
            id: newId(),
            width: { v: 0.48, u: 'textwidth' },
            valign: 't',
            children: [newTextElement('Right column.')],
          },
        ],
      };
      mutate((deck) => mapFrame(deck, slideId, (f) => ({ ...f, children: [...f.children, el] })));
      set({ selection: { slideId, elementId: el.id } });
    },

    addImageElement(slideId, ref) {
      const el: Element = {
        id: newId(),
        kind: 'image',
        placement: { mode: 'flow' },
        resourceId: ref.id,
        keepAspect: true,
        width: { v: 0.6, u: 'textwidth' },
      };
      mutate((deck) => {
        const withResource = deck.resources.some((r) => r.id === ref.id)
          ? deck
          : { ...deck, resources: [...deck.resources, ref] };
        return mapFrame(withResource, slideId, (f) => ({
          ...f,
          children: [...f.children, el],
        }));
      });
      set({ selection: { slideId, elementId: el.id } });
    },

    /**
     * A free-floating text box.
     *
     * This is just a text element created already absolute, which is the PowerPoint
     * mental model: you place it, then type. New boxes are offset slightly from each
     * other so a second one does not land exactly on top of the first.
     */
    addTextBox(slideId) {
      const frame = get().deck.nodes.find((n) => n.kind === 'frame' && n.id === slideId);
      const existing = frame?.kind === 'frame'
        ? frame.children.filter((c) => c.placement.mode === 'absolute').length
        : 0;
      const offset = (existing % 6) * 5;

      const el: Element = {
        id: newId(),
        kind: 'text',
        placement: {
          mode: 'absolute',
          x: 25 + offset,
          y: 30 + offset,
          w: 70,
          z: 0,
          driver: 'textpos',
        },
        content: plain('Text box'),
      };
      mutate((deck) => mapFrame(deck, slideId, (f) => ({ ...f, children: [...f.children, el] })));
      set({ selection: { slideId, elementId: el.id } });
    },

    addMathElement(slideId) {
      const el: Element = {
        id: newId(),
        kind: 'math',
        placement: { mode: 'flow' },
        env: 'equation',
        tex: 'E = mc^2',
      };
      mutate((deck) => mapFrame(deck, slideId, (f) => ({ ...f, children: [...f.children, el] })));
      set({ selection: { slideId, elementId: el.id } });
    },

    addCodeElement(slideId) {
      const el = newCodeElement();
      mutate((deck) => mapFrame(deck, slideId, (f) => ({ ...f, children: [...f.children, el] })));
      set({ selection: { slideId, elementId: el.id } });
    },

    addChartElement(slideId) {
      const el = newChartElement();
      mutate((deck) => mapFrame(deck, slideId, (f) => ({ ...f, children: [...f.children, el] })));
      set({ selection: { slideId, elementId: el.id } });
    },

    setChartCell(slideId, elementId, row, col, value) {
      mutate((deck) => mapChart(deck, slideId, elementId, (el) =>
        setChartCellOp(el, row, col, value)));
    },

    addChartRow(slideId, elementId) {
      mutate((deck) => mapChart(deck, slideId, elementId, (el) => addChartRowOp(el)));
    },

    removeChartRow(slideId, elementId, index) {
      mutate((deck) => mapChart(deck, slideId, elementId, (el) =>
        removeChartRowOp(el, index)));
    },

    addChartColumn(slideId, elementId) {
      mutate((deck) => mapChart(deck, slideId, elementId, (el) => addChartColumnOp(el)));
    },

    removeChartColumn(slideId, elementId, index) {
      mutate((deck) => mapChart(deck, slideId, elementId, (el) =>
        removeChartColumnOp(el, index)));
    },

    renameChartColumn(slideId, elementId, index, name) {
      mutate((deck) => mapChart(deck, slideId, elementId, (el) =>
        renameChartColumnOp(el, index, name)));
    },

    setChartSeries(slideId, elementId, seriesId, patch) {
      mutate((deck) => mapChart(deck, slideId, elementId, (el) =>
        setChartSeriesOp(el, seriesId, patch)));
    },

    removeChartSeries(slideId, elementId, seriesId) {
      mutate((deck) => mapChart(deck, slideId, elementId, (el) =>
        removeChartSeriesOp(el, seriesId)));
    },

    replaceChartData(slideId, elementId, text) {
      mutate((deck) => mapChart(deck, slideId, elementId, (el) =>
        replaceChartDataOp(el, text)));
    },

    setChartType(slideId, elementId, chartType) {
      mutate((deck) => mapChart(deck, slideId, elementId, (el) => ({ ...el, chartType })));
    },

    /** `undefined` in the patch clears the field, so a limit can be removed. */
    setChartAxis(slideId, elementId, patch) {
      mutate((deck) => mapChart(deck, slideId, elementId, (el) => {
        const axis = { ...el.axis, ...patch };
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined) delete (axis as Record<string, unknown>)[k];
        }
        return { ...el, axis };
      }));
    },

    setChartSize(slideId, elementId, wMm, hMm) {
      const w = Math.max(20, Math.round(wMm));
      mutate((deck) => mapChart(deck, slideId, elementId, (el) => withBoxWidth({
        ...el,
        size: {
          w: { v: w, u: 'mm' },
          h: { v: Math.max(20, Math.round(hMm)), u: 'mm' },
        },
      }, w)));
    },

    addTableElement(slideId) {
      const el = newTableElement(3, 3);
      mutate((deck) => mapFrame(deck, slideId, (f) => ({ ...f, children: [...f.children, el] })));
      set({ selection: { slideId, elementId: el.id } });
    },

    setTableCell(slideId, elementId, rowId, cellId, content) {
      mutate((deck) =>
        mapTable(deck, slideId, elementId, (t) => ({
          ...t,
          rows: t.rows.map((row) => (row.id !== rowId ? row : {
            ...row,
            cells: row.cells.map((c) => (c.id === cellId ? { ...c, content } : c)),
          })),
        })),
      );
    },

    addTableRow(slideId, elementId, afterIndex) {
      mutate((deck) => mapTable(deck, slideId, elementId, (t) => insertRow(t, afterIndex)));
    },

    removeTableRow(slideId, elementId, index) {
      mutate((deck) => mapTable(deck, slideId, elementId, (t) => dropRow(t, index)));
    },

    addTableColumn(slideId, elementId, afterIndex) {
      mutate((deck) =>
        mapTable(deck, slideId, elementId, (t) => insertColumn(t, afterIndex)));
    },

    removeTableColumn(slideId, elementId, index) {
      mutate((deck) => mapTable(deck, slideId, elementId, (t) => dropColumn(t, index)));
    },

    setTableColumnAlign(slideId, elementId, index, align) {
      mutate((deck) =>
        mapTable(deck, slideId, elementId, (t) => setColumnAlign(t, index, align)));
    },

    setTableStyle(slideId, elementId, style) {
      mutate((deck) => mapTable(deck, slideId, elementId, (t) => applyStyle(t, style)));
    },

    setTableFit(slideId, elementId, fit) {
      mutate((deck) => mapTable(deck, slideId, elementId, (t) => setFit(t, fit)));
    },

    setTableCaption(slideId, elementId, caption) {
      mutate((deck) =>
        mapTable(deck, slideId, elementId, (t) => {
          if (caption === null || caption === '') {
            const { caption: _drop, ...rest } = t;
            // The float was adopted to carry the caption; without one it would only
            // hand LaTeX the freedom to move the table somewhere unexpected.
            return t.floatWrapper === 'table' ? { ...rest, floatWrapper: 'none' } : rest;
          }
          // A caption only prints inside a float, so adopt one rather than emitting a
          // caption that silently disappears from the PDF.
          return { ...t, caption: plain(caption), floatWrapper: 'table' };
        }),
      );
    },

    /* ------------------------------------------------------ shapes and diagrams */

    /**
     * Shade a row.
     *
     * Fill sits on the id-keyed row, so inserting or deleting rows above it does not
     * move the colour to a different row the way an index-keyed table would.
     */
    setTableRowFill(slideId, elementId, rowIndex, fill) {
      mutate((deck) =>
        mapTable(deck, slideId, elementId, (el) => ({
          ...el,
          rows: el.rows.map((r, i) => {
            if (i !== rowIndex) return r;
            if (fill === null) {
              const { fill: _drop, ...rest } = r;
              return rest;
            }
            return { ...r, fill };
          }),
        })),
      );
    },

    /**
     * Vertical rules, which live on the column that FOLLOWS them plus `endRule` for the
     * last one -- there is no "rule after this column" field, so the outer-only case
     * sets the first column's `leftRule` and `endRule` and clears the rest.
     */
    setTableVerticalRules(slideId, elementId, mode) {
      mutate((deck) =>
        mapTable(deck, slideId, elementId, (el) => {
          const columns = el.columns.map((c, i) => {
            const rest = { ...c };
            delete rest.leftRule;
            if (mode === 'all' || (mode === 'outer' && i === 0)) {
              return { ...rest, leftRule: 'single' as const };
            }
            return rest;
          });
          const next = { ...el, columns };
          if (mode === 'none') delete next.endRule;
          else next.endRule = 'single';
          return next;
        }),
      );
    },

    addTikzElement(slideId) {
      const el = newTikzElement();
      mutate((deck) => mapFrame(deck, slideId, (f) => ({ ...f, children: [...f.children, el] })));
      set({
        selection: { slideId, elementId: el.id, shapeId: null },
        // Land on the rectangle tool: an empty canvas with no tool selected looks
        // broken, because nothing happens when you drag on it.
        shapeTool: 'rect',
      });
    },

    addSmartArt(slideId, kind, labels) {
      const el = newSmartArtElement(kind, labels);
      mutate((deck) => mapFrame(deck, slideId, (f) => ({ ...f, children: [...f.children, el] })));
      set({ selection: { slideId, elementId: el.id, shapeId: null }, shapeTool: null });
    },

    setShapeTool(tool) {
      set({ shapeTool: tool });
    },

    selectShape(shapeId) {
      set({ selection: { ...get().selection, shapeId } });
    },

    drawShape(slideId, elementId, drag) {
      const shape = shapeFromDrag(drag.tool, drag.from, drag.to);
      mutate((deck) => mapTikz(deck, slideId, elementId, (el) => addShapeOp(el, shape)));
      // One shape per press: staying in the tool is how you end up with a pile of
      // rectangles after trying to move the one you just drew.
      set({ selection: { ...get().selection, shapeId: shape.id }, shapeTool: null });
    },

    deleteShape(slideId, elementId, shapeId) {
      mutate((deck) => mapTikz(deck, slideId, elementId, (el) => removeShape(el, shapeId)));
      set({ selection: { ...get().selection, shapeId: null } });
    },

    moveShape(slideId, elementId, shapeId, dx, dy) {
      mutate((deck) => mapTikz(deck, slideId, elementId, (el) => moveShapeOp(el, shapeId, dx, dy)));
    },

    /**
     * Resize a shape by a corner, keeping its proportions when asked to.
     *
     * The same rule as an element's corner handle, and it has to be here rather than in
     * `shapeOps` because the ratio is a property of the GESTURE: captured once, when the
     * drag begins. Recomputing it from the current box on every move feeds rounding back
     * in and a long drag slowly changes the shape.
     */
    resizeShape(slideId, elementId, shapeId, dw, dh, corner, invertLock = false) {
      const aids = get().aids;
      let ratio: number | undefined;

      if (aids.lockAspect !== invertLock) {
        if (gesture !== null && gesture.shapeRatio === null) {
          const el = findElement(get().deck, slideId, elementId);
          const shape = el?.kind === 'tikz'
            ? (el.shapes ?? []).find((s) => s.id === shapeId)
            : undefined;
          const box = shape === undefined ? null : shapeBounds(shape);
          if (box !== null && box.h > 0) gesture.shapeRatio = box.w / box.h;
        }
        ratio = gesture?.shapeRatio ?? undefined;
      }

      mutate((deck) =>
        mapTikz(deck, slideId, elementId, (el) =>
          resizeShapeOp(el, shapeId, dw, dh, corner, ratio)));
    },

    moveShapeEndpoint(slideId, elementId, shapeId, which, point, over) {
      mutate((deck) => mapTikz(deck, slideId, elementId, (el) => {
        const shape = (el.shapes ?? []).find((s) => s.id === shapeId);
        // Only an arrow can attach to a shape; a plain line just takes the point.
        if (shape?.t === 'arrow') return attachEndpoint(el, shapeId, which, over, point);
        return moveEndpoint(el, shapeId, which, point);
      }));
    },

    restyleShape(slideId, elementId, shapeId, patch) {
      mutate((deck) =>
        mapTikz(deck, slideId, elementId, (el) => restyleShapeOp(el, shapeId, patch)));
    },

    reorderShape(slideId, elementId, shapeId, delta) {
      mutate((deck) =>
        mapTikz(deck, slideId, elementId, (el) => reorderShapeOp(el, shapeId, delta)));
    },

    setShapeArrowHead(slideId, elementId, shapeId, head) {
      mutate((deck) => mapTikz(deck, slideId, elementId, (el) => setArrowHead(el, shapeId, head)));
    },

    setShapeText(slideId, elementId, shapeId, text) {
      mutate((deck) =>
        mapTikz(deck, slideId, elementId, (el) => setNodeContent(el, shapeId, plain(text))));
    },

    /** Corner radius, arrow bend and node shape: modelled and emitted, never settable. */
    setShapeOption(slideId, elementId, shapeId, patch) {
      mutate((deck) =>
        mapTikz(deck, slideId, elementId, (el) => setShapeOptionOp(el, shapeId, patch)));
    },

    setTikzCanvasSize(slideId, elementId, w, h) {
      mutate((deck) => mapTikz(deck, slideId, elementId, (el) =>
        withBoxWidth(setCanvasSize(el, w, h), w)));
    },

    setMathTex(slideId, elementId, tex) {
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (el) =>
          el.kind === 'math' ? { ...el, tex } : el,
        ),
      );
    },

    setMathEnv(slideId, elementId, env) {
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (el) =>
          el.kind === 'math' ? { ...el, env } : el,
        ),
      );
    },

    /**
     * The listing's text.
     *
     * Stored as the user typed it, with no leading or trailing newline: those two are
     * structural (listings needs the body on its own line), and the emitter writes them
     * and the parser strips them again.
     */
    setCodeText(slideId, elementId, code) {
      mutate((deck) => mapCode(deck, slideId, elementId, (el) => ({ ...el, code })));
    },

    setCodeLanguage(slideId, elementId, language) {
      mutate((deck) => mapCode(deck, slideId, elementId, (el) => ({ ...el, language })));
    },

    setCodeBackend(slideId, elementId, backend) {
      mutate((deck) => mapCode(deck, slideId, elementId, (el) => ({ ...el, backend })));
    },

    setCodeFrameStyle(slideId, elementId, frameStyle) {
      mutate((deck) => mapCode(deck, slideId, elementId, (el) => {
        if (frameStyle === undefined || frameStyle === 'none') {
          const { frameStyle: _drop, ...rest } = el;
          return rest;
        }
        return { ...el, frameStyle };
      }));
    },

    setCodeCaption(slideId, elementId, caption) {
      mutate((deck) => mapCode(deck, slideId, elementId, (el) => {
        if (caption === null || caption.trim() === '') {
          const { caption: _drop, ...rest } = el;
          return rest;
        }
        return { ...el, caption: plain(caption) };
      }));
    },

    /** One `listings` key. `null` removes it, so no option is emitted at all. */
    setCodeOption(slideId, elementId, key, value) {
      mutate((deck) => mapCode(deck, slideId, elementId, (el) => {
        const options = { ...el.options };
        if (value === null) delete options[key];
        else options[key] = value;
        return { ...el, options };
      }));
    },

    setImageWidth(slideId, elementId, fraction) {
      const clamped = Math.min(1, Math.max(0.05, Math.round(fraction * 100) / 100));
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (el) =>
          el.kind === 'image' ? { ...el, width: { v: clamped, u: 'textwidth' } } : el,
        ),
      );
    },

    setImageCaption(slideId, elementId, caption) {
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (el) => {
          if (el.kind !== 'image') return el;
          if (caption === null || caption === '') {
            const { caption: _drop, ...rest } = el;
            return rest;
          }
          return { ...el, caption: plain(caption) };
        }),
      );
    },

    setImageAlign(slideId, elementId, align) {
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (el) =>
          el.kind === 'image' ? { ...el, align } : el,
        ),
      );
    },

    setImageTrim(slideId, elementId, trim) {
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (el) => {
          if (el.kind !== 'image') return el;
          if (trim === null) {
            const { trim: _drop, ...rest } = el;
            return rest;
          }
          return { ...el, trim };
        }),
      );
    },

    nudgeImageWidth(slideId, elementId, deltaMm, deltaFraction) {
      const el = findElement(get().deck, slideId, elementId);
      if (el === undefined) return;

      // Any absolutely-placed element resizes by its box width; only an image in the
      // flow resizes as a fraction of the text column.
      if (el.placement.mode === 'absolute') {
        // Absolutely placed: the block width IS the image width, in millimetres.
        const next = Math.max(10, Math.round((el.placement.w + deltaMm) * 10) / 10);
        mutate((deck) =>
          mapElement(deck, slideId, elementId, (e) =>
            e.placement.mode === 'absolute'
              ? { ...e, placement: { ...e.placement, w: next } }
              : e,
          ),
        );
        return;
      }

      if (el.kind !== 'image') return;

      /*
       * In flow: width is a fraction of the text column.
       *
       * Three decimals, not two. A hundredth of the text column is about 1.4mm on the
       * slide and under three screen pixels at the usual zoom, so at two decimals every
       * small drag rounded straight back to where it started and the picture simply did
       * not move. The emitter prints the fraction as given.
       */
      const current = gesture !== null && gesture.frac !== null
        ? gesture.frac
        : el.width?.v ?? 0.6;
      const next = Math.min(1, Math.max(0.05, current + deltaFraction));
      if (gesture !== null) gesture.frac = next;
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (e) =>
          e.kind === 'image'
            ? { ...e, width: { v: Math.round(next * 1000) / 1000, u: 'textwidth' } }
            : e,
        ),
      );
    },

    beginGesture() {
      const state = get();
      if (state.source.status !== 'synced') return;
      gesture = { base: state.deck, box: null, frac: null, ratio: null, shapeRatio: null };
      set({ history: { past: [...state.history.past, state.deck].slice(-100), future: [] } });
    },

    endGesture() {
      const g = gesture;
      gesture = null;
      if (g === null) return;
      // A click that never moved is not an edit. Take the entry back off the stack
      // rather than making every stray click on a handle cost an undo.
      const state = get();
      if (state.deck === g.base && state.history.past.at(-1) === g.base) {
        set({ history: { ...state.history, past: state.history.past.slice(0, -1) } });
      }
    },

    /**
     * Move an element by a delta in millimetres.
     *
     * Dragging something that is in the text flow lifts it out into absolute
     * placement, which is what makes the canvas feel like PowerPoint. The starting
     * position is taken from where it currently sits, so it does not jump.
     */
    moveElementBy(slideId, elementId, dxMm, dyMm) {
      const el = findElement(get().deck, slideId, elementId);
      if (el === undefined) return;

      const aids = get().aids;
      const box = gestureBox(el, elementId);
      box.x += dxMm;
      box.y += dyMm;

      if (el.placement.mode === 'absolute') {
        const p = el.placement;
        mutate((deck) =>
          mapElement(deck, slideId, elementId, (e) => ({
            ...e,
            placement: {
              ...p,
              x: snapMm(round1(box.x), aids, 'v'),
              y: snapMm(round1(box.y), aids, 'h'),
            },
          })),
        );
        return;
      }

      mutate((deck) =>
        mapElement(liftToFrame(deck, slideId, elementId), slideId, elementId, (e) => ({
          ...e,
          placement: {
            mode: 'absolute',
            x: snapMm(round1(box.x), aids, 'v'),
            y: snapMm(round1(box.y), aids, 'h'),
            w: round1(box.w),
            z: 0,
            driver: 'textpos',
          },
        })),
      );
    },

    /**
     * Resize by dragging a handle.
     *
     * `dxMm`/`dyMm` are the POINTER's movement, not a width delta — the grip decides
     * what that means. Sign-correcting in the overlay as well as here is how dragging
     * the west handle once grew the box by twice the distance and moved it the wrong
     * way at the same time.
     *
     * A flow element has no box of its own to pull on — a beamer block is as wide as
     * the text column and that is that — so resizing one lifts it out of the flow at
     * the place it is already drawn, exactly as dragging it does. The one exception is
     * an image still in the flow, whose width is a fraction of the text column and
     * stays that way.
     *
     * Height is only applied where LaTeX can express it: an image has `height=` and a
     * diagram has its canvas. `Placement.h` is emitted by nothing, so a height stored
     * there would make the canvas claim a size the PDF does not have.
     */
    resizeElementBy(slideId, elementId, dxMm, dyMm, grip, invertLock = false) {
      const el = findElement(get().deck, slideId, elementId);
      if (el === undefined) return;

      /*
       * A picture still in the text flow is the one element that resizes without being
       * lifted out of it: its width is a \textwidth fraction, which the canvas applies
       * through `nudgeImageWidth` because only the canvas knows the column width. What
       * is left here is `height=`, which is legal in the flow too.
       */
      if (el.placement.mode === 'flow' && el.kind === 'image') {
        if (grip !== 'n' && grip !== 's') return;
        const flowBox = gestureBox(el, elementId);
        flowBox.h += grip === 'n' ? -dyMm : dyMm;
        const flowH = Math.max(MIN_BOX_MM, round1(flowBox.h));
        mutate((deck) =>
          mapElement(deck, slideId, elementId, (e) =>
            e.kind === 'image' ? { ...e, height: { v: flowH, u: 'mm' } } : e,
          ),
        );
        return;
      }

      // Only these three have a height LaTeX can be told about: `height=` on an image,
      // the canvas of a diagram, and `height=` on a chart's axis. `Placement.h` is
      // emitted by nothing, so a height stored there is a control that does nothing.
      const hasHeight = el.kind === 'image' || el.kind === 'tikz' || el.kind === 'chart';
      const box = gestureBox(el, elementId);
      const before = { ...box };

      if (grip.includes('e')) box.w += dxMm;
      if (grip.includes('w')) { box.x += dxMm; box.w -= dxMm; }
      if (box.w < MIN_BOX_MM) {
        // Refuse to invert: hold the edge that is NOT being dragged where it is.
        if (grip.includes('w')) box.x = before.x + before.w - MIN_BOX_MM;
        box.w = MIN_BOX_MM;
      }

      if (hasHeight && (grip.includes('n') || grip.includes('s'))) {
        if (grip.includes('n')) { box.y += dyMm; box.h -= dyMm; }
        else box.h += dyMm;
        if (box.h < MIN_BOX_MM) {
          if (grip.includes('n')) box.y = before.y + before.h - MIN_BOX_MM;
          box.h = MIN_BOX_MM;
        }
      }

      const aids = get().aids;

      /*
       * A CORNER drag keeps the proportions, unless told otherwise.
       *
       * Only a corner: a side handle means "change this one dimension", and forcing the
       * other to follow would make it impossible to reshape anything. Width leads and
       * height follows, because the pointer's horizontal travel is what a corner drag
       * reads as, and the anchored corner is held by re-deriving x and y from it --
       * otherwise a north-west drag stretches from the wrong corner.
       */
      const corner = (grip.includes('n') || grip.includes('s'))
        && (grip.includes('e') || grip.includes('w'));
      if (hasHeight && corner && aids.lockAspect !== invertLock) {
        if (gesture !== null && gesture.ratio === null && before.h > 0) {
          gesture.ratio = before.w / before.h;
        }
        const ratio = gesture?.ratio ?? (before.h > 0 ? before.w / before.h : null);
        if (ratio !== null && ratio > 0) {
          box.h = Math.max(MIN_BOX_MM, box.w / ratio);
          box.w = box.h * ratio;
          if (grip.includes('w')) box.x = before.x + before.w - box.w;
          if (grip.includes('n')) box.y = before.y + before.h - box.h;
        }
      }
      mutate((deck) =>
        mapElement(liftToFrame(deck, slideId, elementId), slideId, elementId, (e) => ({
          ...e,
          placement: {
            ...(e.placement.mode === 'absolute' ? e.placement : {}),
            mode: 'absolute',
            x: snapMm(round1(box.x), aids, 'v'),
            y: snapMm(round1(box.y), aids, 'h'),
            w: round1(box.w),
            z: e.placement.mode === 'absolute' ? e.placement.z : 0,
            driver: 'textpos',
          },
        })),
      );

      const w = Math.max(MIN_BOX_MM, round1(box.w));
      const h = Math.max(MIN_BOX_MM, round1(box.h));
      const wide = grip.includes('e') || grip.includes('w');
      const tall = hasHeight && (grip.includes('n') || grip.includes('s'));

      // A diagram and a chart draw themselves at their OWN size, so a placement box
      // that does not carry the new width back to them resizes an empty container and
      // leaves the picture exactly as it was.
      if (el.kind === 'tikz' && el.mode !== 'raw') {
        mutate((deck) =>
          mapTikz(deck, slideId, elementId, (e) =>
            setCanvasSize(e, wide ? w : e.canvasSize.w, tall ? h : e.canvasSize.h)),
        );
      } else if (el.kind === 'chart') {
        mutate((deck) =>
          mapChart(deck, slideId, elementId, (e) => ({
            ...e,
            size: {
              w: wide ? { v: w, u: 'mm' } : e.size.w,
              h: tall ? { v: h, u: 'mm' } : e.size.h,
            },
          })),
        );
      } else if (el.kind === 'image' && tall) {
        mutate((deck) =>
          mapElement(deck, slideId, elementId, (e) =>
            e.kind === 'image' ? { ...e, height: { v: h, u: 'mm' } } : e,
          ),
        );
      }
    },

    /** Absolute box setter, for the numeric Position and Size fields. */
    setElementBox(slideId, elementId, box) {
      const el = findElement(get().deck, slideId, elementId);
      if (el === undefined) return;
      const base = el.placement.mode === 'absolute'
        ? el.placement
        : { ...(measuredRects.get(elementId) ?? FALLBACK_RECT), z: 0 };

      const round = (n: number): number => Math.round(n * 10) / 10;
      mutate((deck) =>
        mapElement(liftToFrame(deck, slideId, elementId), slideId, elementId, (e) => ({
          ...e,
          placement: {
            ...(e.placement.mode === 'absolute' ? e.placement : {}),
            mode: 'absolute',
            x: round(box.x ?? base.x),
            y: round(box.y ?? base.y),
            w: Math.max(MIN_BOX_MM, round(box.w ?? base.w)),
            z: e.placement.mode === 'absolute' ? e.placement.z : 0,
            driver: 'textpos',
          },
        })),
      );
    },

    /**
     * Rotate a freely-placed element.
     *
     * `Placement.rotate` was modelled and emitted as `\rotatebox` all along, with no
     * control anywhere to set it. Zero removes the wrapper rather than emitting a
     * rotation of nothing.
     */
    /** `angle=` on the \includegraphics -- modelled and emitted, never settable. */
    setImageRotate(slideId, elementId, deg) {
      const normalised = Math.round(((deg % 360) + 360) % 360 * 10) / 10;
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (el) => {
          if (el.kind !== 'image') return el;
          if (normalised === 0) {
            const { rotate: _drop, ...rest } = el;
            return rest;
          }
          return { ...el, rotate: normalised };
        }),
      );
    },

    setImageOpacity(slideId, elementId, opacity) {
      const a = Math.min(1, Math.max(0, Math.round(opacity * 100) / 100));
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (el) => {
          if (el.kind !== 'image') return el;
          // Fully opaque removes the key, so the picture emits exactly what it emitted
          // before this control existed -- no tikzpicture wrapper, no derived package.
          if (a >= 1) {
            const { opacity: _drop, ...rest } = el;
            return rest;
          }
          return { ...el, opacity: a };
        }),
      );
    },

    setImageKeepAspect(slideId, elementId, keep) {
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (el) =>
          el.kind === 'image' ? { ...el, keepAspect: keep } : el),
      );
    },

    setElementRotate(slideId, elementId, deg) {
      const normalised = Math.round(((deg % 360) + 360) % 360 * 10) / 10;
      mutate((deck) =>
        mapElement(liftToFrame(deck, slideId, elementId), slideId, elementId, (e) => {
          const base = e.placement.mode === 'absolute'
            ? e.placement
            : { ...(measuredRects.get(elementId) ?? FALLBACK_RECT), z: 0 };
          const placement = {
            mode: 'absolute' as const,
            x: base.x, y: base.y, w: base.w, z: base.z,
            driver: 'textpos' as const,
            ...(normalised === 0 ? {} : { rotate: normalised }),
          };
          return { ...e, placement };
        }),
      );
    },

    setImageHeightMm(slideId, elementId, mm) {
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (el) => {
          if (el.kind !== 'image') return el;
          if (mm === null) {
            const { height: _drop, ...rest } = el;
            return rest;
          }
          return { ...el, height: { v: Math.max(MIN_BOX_MM, Math.round(mm * 10) / 10), u: 'mm' } };
        }),
      );
    },

    returnElementToFlow(slideId, elementId) {
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (el) => ({
          ...el,
          placement: { mode: 'flow' },
        })),
      );
    },

    moveElementToAbsolute(slideId, elementId, x, y, w) {
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (el) => ({
          ...el,
          placement: { mode: 'absolute', x, y, w, z: 0, driver: 'textpos' },
        })),
      );
    },

    /**
     * Edit the presentation's own title, author and so on.
     *
     * Until this existed the only way to change them was to type in the source panel,
     * which is an odd thing to have to do for the first line of the first slide. An
     * empty string removes the command rather than emitting an empty argument.
     */
    setDeckMeta(patch) {
      mutate((deck) => {
        const meta = { ...deck.meta };
        for (const [k, v] of Object.entries(patch)) {
          const key = k as DeckMetaField;
          if (v === undefined) continue;
          if (v.trim() === '') delete meta[key];
          else meta[key] = plain(v);
        }
        return { ...deck, meta };
      });
    },

    setTheme(name) {
      mutate((deck) => {
        const preamble = { ...deck.preamble, theme: { name, options: [] } };
        // Themes built on fontspec only render as designed under a Unicode engine.
        // Under pdflatex they compile but fall back to Computer Modern, which reads as
        // "the theme is broken", so switch the engine with the theme.
        if (themeNeedsUnicodeEngine(name)) {
          preamble.texProgram = 'xelatex';
        } else if (deck.preamble.texProgram === 'xelatex'
          && themeNeedsUnicodeEngine(deck.preamble.theme.name)) {
          // Leaving the previous theme: drop the engine we set on its behalf.
          delete preamble.texProgram;
        }
        return { ...deck, preamble };
      });
    },

    setTexProgram(program) {
      mutate((deck) => ({
        ...deck,
        preamble: { ...deck.preamble, texProgram: program },
      }));
    },

    /**
     * Set the deck's font family.
     *
     * A serif family also needs `\usefonttheme{serif}`, because beamer typesets in SANS
     * and `mathptmx` only touches `\rmdefault` -- measured, and the reason Times could
     * not be offered honestly before: loading the package on its own changes nothing at
     * all on the slide. Switching back to a sans family clears that font theme again,
     * but only when it is the one this control set -- an imported deck's
     * `professionalfonts` or `structurebold` is the user's and stays.
     */
    setDeckFont(pkg) {
      const font = deckFontByPackage(pkg);
      if (font === undefined) return;
      mutate((deck) => {
        const packages = deck.preamble.packages.filter(
          (p) => !DECK_FONT_PACKAGES.includes(p.name),
        );
        if (font.pkg !== null) packages.push({ name: font.pkg, options: [] });

        const preamble = { ...deck.preamble, packages };
        if (font.serif) preamble.fontTheme = { name: 'serif', options: [] };
        else if (preamble.fontTheme?.name === 'serif') delete preamble.fontTheme;
        return { ...deck, preamble };
      });
    },

    setAspect(aspect) {
      mutate((deck) => ({
        ...deck,
        preamble: {
          ...deck.preamble,
          documentClass: { ...deck.preamble.documentClass, aspectRatio: aspect },
        },
      }));
    },

    editSource(text) {
      const state = get();
      if (text === state.source.baseText) {
        set({ source: { ...state.source, status: 'synced', text, health: null } });
        return;
      }
      set({
        source: {
          ...state.source,
          status: 'dirty',
          text,
          health: healthOf(text, state.deck),
        },
      });
    },

    applySource() {
      const state = get();
      const result = parseDeck(state.source.text, { previous: state.deck });

      // Re-emit so the editor shows canonical formatting and the two views agree.
      const regen = regenerate(result.deck);
      const stillSelected = frames(result.deck).some((f) => f.id === state.selection.slideId);

      set({
        deck: result.deck,
        sourceMap: regen.sourceMap,
        selection: stillSelected
          ? { ...state.selection, elementId: null }
          : { slideId: frames(result.deck)[0]?.id ?? null, elementId: null },
        source: {
          status: 'synced',
          text: regen.text,
          baseText: regen.text,
          health: null,
          lastParse: result,
        },
        history: { past: [...state.history.past, state.deck].slice(-100), future: [] },
      });
    },

    revertSource() {
      const state = get();
      set({
        source: {
          ...state.source,
          status: 'synced',
          text: state.source.baseText,
          health: null,
        },
      });
    },

    setEngineStatus(s) {
      set({ engine: { ...get().engine, status: s } });
    },
    setCompiling(v) {
      set({ engine: { ...get().engine, compiling: v } });
    },
    setCompileResult(r) {
      set({ engine: { ...get().engine, result: r } });
    },

    undo() {
      const state = get();
      const prev = state.history.past[state.history.past.length - 1];
      if (prev === undefined) return;
      const regen = regenerate(prev);
      set({
        deck: prev,
        sourceMap: regen.sourceMap,
        source: {
          status: 'synced', text: regen.text, baseText: regen.text,
          health: null, lastParse: null,
        },
        history: {
          past: state.history.past.slice(0, -1),
          future: [state.deck, ...state.history.future].slice(0, 100),
        },
      });
    },

    redo() {
      const state = get();
      const next = state.history.future[0];
      if (next === undefined) return;
      const regen = regenerate(next);
      set({
        deck: next,
        sourceMap: regen.sourceMap,
        source: {
          status: 'synced', text: regen.text, baseText: regen.text,
          health: null, lastParse: null,
        },
        history: {
          past: [...state.history.past, state.deck],
          future: state.history.future.slice(1),
        },
      });
    },
  };
});

export const selectFrames = (s: AppState): FrameNode[] => frames(s.deck);

/**
 * Frames AND section headings, in document order.
 *
 * The slide rail used `selectFrames`, which is why sections were invisible in the only
 * outline-like surface the app has — and therefore uneditable.
 *
 * Memoised on deck identity for the same reason `frames()` is: zustand compares selector
 * results by reference, so a fresh array every call re-renders forever.
 */
export type OutlineNode = FrameNode | SectionNode;

let outlineCache: { deck: Deck; outline: OutlineNode[] } | null = null;

export const selectOutline = (s: AppState): OutlineNode[] => {
  if (outlineCache !== null && outlineCache.deck === s.deck) return outlineCache.outline;
  const outline = s.deck.nodes.filter(
    (n): n is OutlineNode => n.kind === 'frame' || n.kind === 'section',
  );
  outlineCache = { deck: s.deck, outline };
  return outline;
};

export const selectCurrentFrame = (s: AppState): FrameNode | undefined =>
  frames(s.deck).find((f) => f.id === s.selection.slideId);

/** True when the canvas must refuse edits because the source editor owns the document. */
export const selectCanvasLocked = (s: AppState): boolean => s.source.status !== 'synced';

