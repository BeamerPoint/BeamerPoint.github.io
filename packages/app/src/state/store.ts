import { create } from 'zustand';
import {
  emitDeck,
  newDeck as makeDeck,
  newFrame,
  newListElement,
  newId,
  newTextElement,
  parseDeck,
  plain,
  richTextEquals,
  themeNeedsUnicodeEngine,
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
} from '@beamerpoint/core';
import type { CompileResult, EngineStatus } from '@beamerpoint/engine';

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

export interface SourceHealth {
  balanced: boolean;
  parseErrors: number;
  /** New raw elements compared with the applied deck. Negative or zero is safe. */
  rawDelta: number;
}

export interface Selection {
  slideId: string | null;
  elementId: string | null;
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
  setMathTex(slideId: string, elementId: string, tex: string): void;
  setMathEnv(slideId: string, elementId: string, env: MathEnv): void;
  setImageWidth(slideId: string, elementId: string, fraction: number): void;
  setImageCaption(slideId: string, elementId: string, caption: string | null): void;
  setImageAlign(slideId: string, elementId: string, align: 'left' | 'center' | 'right'): void;
  setImageTrim(slideId: string, elementId: string, trim: ImageTrim | null): void;
  nudgeImageWidth(slideId: string, elementId: string, deltaMm: number, deltaFraction: number): void;
  moveElementBy(slideId: string, elementId: string, dxMm: number, dyMm: number): void;
  returnElementToFlow(slideId: string, elementId: string): void;
  moveElementToAbsolute(slideId: string, elementId: string, x: number, y: number, w: number): void;

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
export const measuredRects = new Map<string, { x: number; y: number; w: number }>();

/** Find a top-level element of a frame, for comparing an edit against current state. */
function findElement(deck: Deck, slideId: string, elementId: string): Element | undefined {
  const frame = deck.nodes.find((n) => n.kind === 'frame' && n.id === slideId);
  if (frame === undefined || frame.kind !== 'frame') return undefined;
  return frame.children.find((el) => el.id === elementId);
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

  const mapFrame = (deck: Deck, slideId: string, fn: (f: FrameNode) => FrameNode): Deck => ({
    ...deck,
    nodes: deck.nodes.map((n) => (n.kind === 'frame' && n.id === slideId ? fn(n) : n)),
  });

  const mapElement = (
    deck: Deck,
    slideId: string,
    elementId: string,
    fn: (el: Element) => Element,
  ): Deck =>
    mapFrame(deck, slideId, (f) => ({
      ...f,
      children: f.children.map((el) => (el.id === elementId ? fn(el) : el)),
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

    setOverlayMode(mode) {
      set({ overlayMode: mode });
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
      set({ selection: { slideId, elementId }, overlayMode: 'transform' });
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
          children: f.children.filter((el) => el.id !== elementId),
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
      if (el?.kind !== 'image') return;

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

      if (el.placement.mode === 'absolute') {
        const p = el.placement;
        mutate((deck) =>
          mapElement(deck, slideId, elementId, (e) => ({
            ...e,
            placement: {
              ...p,
              x: Math.round((p.x + dxMm) * 10) / 10,
              y: Math.round((p.y + dyMm) * 10) / 10,
            },
          })),
        );
        return;
      }

      const measured = measuredRects.get(elementId);
      const start = measured ?? { x: 20, y: 30, w: 80 };
      mutate((deck) =>
        mapElement(deck, slideId, elementId, (e) => ({
          ...e,
          placement: {
            mode: 'absolute',
            x: Math.round((start.x + dxMm) * 10) / 10,
            y: Math.round((start.y + dyMm) * 10) / 10,
            w: Math.round(start.w * 10) / 10,
            z: 0,
            driver: 'textpos',
          },
        })),
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
