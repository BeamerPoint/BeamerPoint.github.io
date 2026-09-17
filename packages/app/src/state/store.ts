import { create } from 'zustand';
import {
  emitDeck,
  newDeck as makeDeck,
  newFrame,
  newListElement,
  newId,
  newCodeElement,
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
  richTextEquals,
  themeNeedsUnicodeEngine,
  type CodeElement,
  type Deck,
  type Element,
  type FrameNode,
  type ParseResult,
  type TexProgram,
  type ImageTrim,
  type MathElement,
  type ResourceRef,
  type RichText,
  type SourceMap,
  type ArrowHead,
  type ShapeOptionPatch,
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
  deleteSlide(slideId: string): void;
  moveSlide(slideId: string, delta: number): void;
  setSlideTitle(slideId: string, title: string): void;

  addTextElement(slideId: string): void;
  addListElement(slideId: string): void;
  deleteElement(slideId: string, elementId: string): void;
  setElementContent(slideId: string, elementId: string, content: RichText): void;
  setListItemContent(slideId: string, elementId: string, itemId: string, content: RichText): void;
  addBlockElement(slideId: string, variant: 'block' | 'alertblock' | 'exampleblock'): void;
  addColumnsElement(slideId: string): void;
  addImageElement(slideId: string, ref: ResourceRef): void;
  addMathElement(slideId: string): void;
  addCodeElement(slideId: string): void;
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
  resizeShape(slideId: string, elementId: string, shapeId: string, dw: number, dh: number): void;
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
  moveElementBy(slideId: string, elementId: string, dxMm: number, dyMm: number): void;
  resizeElementBy(
    slideId: string, elementId: string, dxMm: number, dyMm: number, grip: ResizeGrip,
  ): void;
  setElementBox(
    slideId: string, elementId: string,
    box: { x?: number; y?: number; w?: number },
  ): void;
  setImageHeightMm(slideId: string, elementId: string, mm: number | null): void;
  setImageRotate(slideId: string, elementId: string, deg: number): void;
  setImageKeepAspect(slideId: string, elementId: string, keep: boolean): void;
  setElementRotate(slideId: string, elementId: string, deg: number): void;
  returnElementToFlow(slideId: string, elementId: string): void;
  moveElementToAbsolute(slideId: string, elementId: string, x: number, y: number, w: number): void;

  setDeckMeta(patch: Partial<Record<DeckMetaField, string>>): void;
  setTheme(name: string): void;
  setTexProgram(program: TexProgram): void;
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

/**
 * Find an element of a frame, at any depth.
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
  /** Apply a deck mutation, push undo, and keep the source panel in sync. */
  const mutate = (fn: (deck: Deck) => Deck): void => {
    const state = get();
    if (state.source.status !== 'synced') return; // canvas is locked
    const next = fn(state.deck);
    const regen = regenerate(next);
    set({
      deck: next,
      sourceMap: regen.sourceMap,
      source: { ...state.source, text: regen.text, baseText: regen.text },
      history: { past: [...state.history.past, state.deck].slice(-100), future: [] },
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

    deleteSlide(slideId) {
      const remaining = frames(get().deck).filter((f) => f.id !== slideId);
      if (remaining.length === 0) return;
      mutate((deck) => ({ ...deck, nodes: deck.nodes.filter((n) => n.id !== slideId) }));
      set({ selection: { slideId: remaining[0]!.id, elementId: null } });
    },

    moveSlide(slideId, delta) {
      mutate((deck) => {
        const idx = deck.nodes.findIndex((n) => n.id === slideId);
        const target = idx + delta;
        if (idx === -1 || target < 0 || target >= deck.nodes.length) return deck;
        const nodes = [...deck.nodes];
        const [node] = nodes.splice(idx, 1);
        nodes.splice(target, 0, node!);
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

    resizeShape(slideId, elementId, shapeId, dw, dh) {
      mutate((deck) =>
        mapTikz(deck, slideId, elementId, (el) => resizeShapeOp(el, shapeId, dw, dh)));
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
      mutate((deck) => mapTikz(deck, slideId, elementId, (el) => setCanvasSize(el, w, h)));
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

      // In flow: width is a fraction of the text column.
      const current = el.width?.v ?? 0.6;
      const next = Math.min(1, Math.max(0.05, current + deltaFraction));
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (e) =>
          e.kind === 'image'
            ? { ...e, width: { v: Math.round(next * 100) / 100, u: 'textwidth' } }
            : e,
        ),
      );
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

      if (el.placement.mode === 'absolute') {
        const p = el.placement;
        mutate((deck) =>
          mapElement(deck, slideId, elementId, (e) => ({
            ...e,
            placement: {
              ...p,
              x: snapMm(Math.round((p.x + dxMm) * 10) / 10, aids, 'v'),
              y: snapMm(Math.round((p.y + dyMm) * 10) / 10, aids, 'h'),
            },
          })),
        );
        return;
      }

      const start = measuredRects.get(elementId) ?? FALLBACK_RECT;
      mutate((deck) =>
        mapElement(liftToFrame(deck, slideId, elementId), slideId, elementId, (e) => ({
          ...e,
          placement: {
            mode: 'absolute',
            x: snapMm(Math.round((start.x + dxMm) * 10) / 10, aids, 'v'),
            y: snapMm(Math.round((start.y + dyMm) * 10) / 10, aids, 'h'),
            w: Math.round(start.w * 10) / 10,
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
    resizeElementBy(slideId, elementId, dxMm, dyMm, grip) {
      const el = findElement(get().deck, slideId, elementId);
      if (el === undefined) return;
      if (el.placement.mode === 'flow' && el.kind === 'image') return;

      const hasHeight = el.kind === 'image' || el.kind === 'tikz';
      const base = el.placement.mode === 'absolute'
        ? { x: el.placement.x, y: el.placement.y, w: el.placement.w }
        : measuredRects.get(elementId) ?? FALLBACK_RECT;

      let { x, y, w } = base;
      if (grip.includes('e')) w += dxMm;
      if (grip.includes('w')) { x += dxMm; w -= dxMm; }
      if (w < MIN_BOX_MM) {
        // Refuse to invert: hold the edge that is NOT being dragged where it is.
        if (grip.includes('w')) x = base.x + base.w - MIN_BOX_MM;
        w = MIN_BOX_MM;
      }
      if (hasHeight && grip.includes('n')) y += dyMm;

      const round = (n: number): number => Math.round(n * 10) / 10;
      const aids = get().aids;
      mutate((deck) =>
        mapElement(liftToFrame(deck, slideId, elementId), slideId, elementId, (e) => ({
          ...e,
          placement: {
            ...(e.placement.mode === 'absolute' ? e.placement : {}),
            mode: 'absolute',
            x: snapMm(round(x), aids, 'v'),
            y: snapMm(round(y), aids, 'h'),
            w: round(w),
            z: e.placement.mode === 'absolute' ? e.placement.z : 0,
            driver: 'textpos',
          },
        })),
      );

      if (!hasHeight || dyMm === 0 || !(grip.includes('n') || grip.includes('s'))) return;
      const dh = grip.includes('n') ? -dyMm : dyMm;

      if (el.kind === 'image') {
        const current = el.height?.u === 'mm'
          ? el.height.v
          : measuredRects.get(elementId)?.h ?? MIN_BOX_MM;
        const next = Math.max(MIN_BOX_MM, round(current + dh));
        mutate((deck) =>
          mapElement(deck, slideId, elementId, (e) =>
            e.kind === 'image' ? { ...e, height: { v: next, u: 'mm' } } : e,
          ),
        );
      } else if (el.kind === 'tikz' && el.mode !== 'raw') {
        const h = Math.max(MIN_BOX_MM, round(el.canvasSize.h + dh));
        mutate((deck) =>
          mapTikz(deck, slideId, elementId, (e) => setCanvasSize(e, e.canvasSize.w, h)),
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
     * `Placement.rotate` was modelled and emitted as `
otatebox` all along, with no
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

export const selectCurrentFrame = (s: AppState): FrameNode | undefined =>
  frames(s.deck).find((f) => f.id === s.selection.slideId);

/** True when the canvas must refuse edits because the source editor owns the document. */
export const selectCanvasLocked = (s: AppState): boolean => s.source.status !== 'synced';

