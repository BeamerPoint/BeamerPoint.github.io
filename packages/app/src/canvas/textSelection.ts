import { useEffect, useSyncExternalStore } from 'react';
import type { Deck, RichText } from '@beamerpoint/core';
import { findElement, useStore } from '../state/store.js';
import { modelRangeFromSelection } from './domSelection.js';

/**
 * What text is selected on the canvas, tracked outside React.
 *
 * The ribbon has to know this to enable Bold and to draw it active, and the selection
 * moves far more often than anything renders — a double-click, Ctrl+A, dragging across
 * words. It is module state read through `useSyncExternalStore`, which is the pattern
 * this app already uses for shared UI state any caller can raise; it deliberately never
 * enters the deck or the undo history.
 *
 * The identity of the host is kept as IDS, not as a node, because the canvas re-renders
 * constantly. The live container is kept too, but only ever used immediately.
 */

export interface TextHost {
  elementId: string;
  /** Set for a list item. */
  itemId?: string;
  /** Set for a table cell. */
  rowId?: string;
  cellId?: string;
}

export interface TextSelection extends TextHost {
  container: HTMLElement;
  from: number;
  to: number;
}

export const HOST_EL_ATTR = 'data-bp-host-el';
export const HOST_ITEM_ATTR = 'data-bp-host-item';
export const HOST_ROW_ATTR = 'data-bp-host-row';
export const HOST_CELL_ATTR = 'data-bp-host-cell';

let snapshot: TextSelection | null = null;
const listeners = new Set<() => void>();

function publish(next: TextSelection | null): void {
  const same = snapshot !== null && next !== null
    && snapshot.container === next.container
    && snapshot.from === next.from && snapshot.to === next.to;
  if (same || (snapshot === null && next === null)) return;
  snapshot = next;
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function getTextSelection(): TextSelection | null {
  return snapshot;
}

export function useTextSelection(): TextSelection | null {
  return useSyncExternalStore(subscribe, getTextSelection, () => null);
}

/** The host element a node sits inside, with the ids that identify it in the model. */
export function hostOf(node: Node | null): { el: HTMLElement; host: TextHost } | null {
  const start = node === null
    ? null
    : node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
  const el = start?.closest<HTMLElement>(`[${HOST_EL_ATTR}]`) ?? null;
  if (el === null) return null;
  const elementId = el.getAttribute(HOST_EL_ATTR);
  if (elementId === null) return null;
  return {
    el,
    host: {
      elementId,
      ...(el.getAttribute(HOST_ITEM_ATTR) !== null
        ? { itemId: el.getAttribute(HOST_ITEM_ATTR)! } : {}),
      ...(el.getAttribute(HOST_ROW_ATTR) !== null
        ? { rowId: el.getAttribute(HOST_ROW_ATTR)! } : {}),
      ...(el.getAttribute(HOST_CELL_ATTR) !== null
        ? { cellId: el.getAttribute(HOST_CELL_ATTR)! } : {}),
    },
  };
}

/** The rich text a host is showing, as the model currently has it. */
export function contentOfHost(deck: Deck, slideId: string, host: TextHost): RichText | null {
  const el = findElement(deck, slideId, host.elementId);
  if (el === undefined) return null;

  if (host.itemId !== undefined) {
    if (el.kind !== 'list') return null;
    return el.items.find((i) => i.id === host.itemId)?.content ?? null;
  }
  if (host.cellId !== undefined) {
    if (el.kind !== 'table') return null;
    for (const row of el.rows) {
      const cell = row.cells.find((c) => c.id === host.cellId);
      if (cell !== undefined) return cell.content;
    }
    return null;
  }
  return el.kind === 'text' ? el.content : null;
}

/**
 * Follow the browser's selection.
 *
 * `selectionchange` rather than mouseup/keyup, because those miss double-click to
 * select a word, Ctrl+A, and anything set programmatically — all of which the user sees
 * as a selection and expects Bold to act on. It fires per character while dragging, so
 * it is coalesced — with a TIMEOUT, not `requestAnimationFrame`. rAF does not run while
 * the document is not being painted, and the app's window is often behind another one;
 * measured in this very pane, where rAF never fired and the whole feature was dead with
 * no error. It is the same trap pdf.js fell into here.
 */
export function useTextSelectionTracking(): void {
  const deck = useStore((s) => s.deck);
  const slideId = useStore((s) => s.selection.slideId);

  useEffect(() => {
    let queued: ReturnType<typeof setTimeout> | null = null;

    const read = (): void => {
      queued = null;
      const sel = window.getSelection();
      const found = hostOf(sel?.anchorNode ?? null);
      if (found === null || slideId === null) { publish(null); return; }

      const content = contentOfHost(deck, slideId, found.host);
      if (content === null) { publish(null); return; }

      const range = modelRangeFromSelection(found.el, content);
      publish(range === null ? null : { ...found.host, ...range });
    };

    const onChange = (): void => {
      if (queued !== null) return;
      queued = setTimeout(read, 0);
    };

    document.addEventListener('selectionchange', onChange);
    read();
    return () => {
      document.removeEventListener('selectionchange', onChange);
      if (queued !== null) clearTimeout(queued);
    };
  }, [deck, slideId]);
}
