import {
  removeInlineStyle, toggleInlineStyle,
  type InlineStyle, type RichText, type StyleSpec,
} from '@beamerpoint/core';
import { useStore } from '../state/store.js';
import { readInlineFromDom } from '../canvas/domInline.js';
import { domRangeFromModel } from '../canvas/domSelection.js';
import {
  contentOfHost, getTextSelection, HOST_CELL_ATTR, HOST_EL_ATTR, HOST_ITEM_ATTR,
  type TextHost,
} from '../canvas/textSelection.js';

/**
 * Applying an inline style to whatever is selected on the canvas.
 *
 * A plain function rather than a hook, because both the ribbon and the Ctrl+B handler
 * inside the editable box need it and only one of them is a component.
 *
 * Three things this has to get right, each of which silently loses work otherwise.
 *
 * **Flush the DOM first.** Type "hello", select "hel", press Bold: the typed characters
 * exist only in the DOM until the box is blurred, so styling `el.content` would both
 * discard the typing and use offsets measured against a different string. The base is
 * `readInlineFromDom`, exactly what blur uses — and DOM offsets are DEFINED to be
 * `readInlineFromDom` offsets, so the range measured from the selection already lines up
 * with it.
 *
 * **Style the MODEL, never the DOM.** `readInlineFromDom` resolves nodes by their
 * `data-bp-i` index and flattens anything without one, so a browser-native Ctrl+B —
 * which inserts a bare `<strong>` — is downgraded to plain text on the next blur.
 *
 * **Put the selection back.** The change re-renders the host and destroys the browser's
 * selection. Character offsets are invariant under styling, so the same range is
 * restored against the new content: that is what lets Bold then Italic work without
 * re-selecting the words in between.
 */

/**
 * The host node for a selection, by its ids.
 *
 * Every list item and every table cell of one element carries that element's id, so a
 * selector on `data-bp-host-el` alone would find the FIRST one and format the wrong
 * bullet.
 */
export function hostNode(host: TextHost): HTMLElement | null {
  const parts = [`[${HOST_EL_ATTR}="${CSS.escape(host.elementId)}"]`];
  if (host.itemId !== undefined) parts.push(`[${HOST_ITEM_ATTR}="${CSS.escape(host.itemId)}"]`);
  if (host.cellId !== undefined) parts.push(`[${HOST_CELL_ATTR}="${CSS.escape(host.cellId)}"]`);
  return document.querySelector<HTMLElement>(parts.join(''));
}

function change(fn: (rt: RichText, from: number, to: number) => RichText): void {
  // Read the selection again at the moment of the click: a React copy can be a frame
  // behind, and this is what decides which characters change.
  const live = getTextSelection();
  const state = useStore.getState();
  const slideId = state.selection.slideId;
  if (live === null || slideId === null || live.from === live.to) return;
  if (state.source.status !== 'synced') return;

  // The node may have been replaced since the selection was taken.
  const container = live.container.isConnected ? live.container : hostNode(live);
  if (container === null) return;

  const current = contentOfHost(state.deck, slideId, live);
  if (current === null) return;

  const next = fn(readInlineFromDom(container, current), live.from, live.to);

  if (live.itemId !== undefined) {
    state.setListItemContent(slideId, live.elementId, live.itemId, next);
  } else if (live.rowId !== undefined && live.cellId !== undefined) {
    state.setTableCell(slideId, live.elementId, live.rowId, live.cellId, next);
  } else {
    state.setElementContent(slideId, live.elementId, next);
  }

  // After the re-render, not before it. A timeout, not `requestAnimationFrame`: rAF
  // does not run while the window is not being painted, and the caret would then never
  // come back.
  setTimeout(() => {
    const node = hostNode(live);
    if (node === null) return;
    const range = domRangeFromModel(node, next, live.from, live.to);
    if (range === null) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, 0);
}

export function applyFormatToSelection(spec: StyleSpec): void {
  change((rt, from, to) => toggleInlineStyle(rt, { from, to }, spec));
}

export function clearFormatOnSelection(style: InlineStyle): void {
  change((rt, from, to) => removeInlineStyle(rt, { from, to }, style));
}
