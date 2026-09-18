/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { richTextLength, type Inline, type RichText } from '@beamerpoint/core';
import { INLINE_INDEX_ATTR } from './domInline.js';

/**
 * Mapping the browser's selection onto character offsets in the model.
 *
 * The one invariant everything here rests on: **DOM space is defined to equal
 * `readInlineFromDom` space.** A text node contributes its length, an element the
 * renderer did not create contributes its text (because the reader flattens it to plain
 * text), an ATOMIC node contributes exactly one, and a wrapper contributes the sum of
 * its children. Atomic nodes are `contentEditable={false}`, so a caret can never be
 * inside one and the two sides cannot drift.
 *
 * This walk deliberately mirrors `readInlineFromDom`'s, case for case. Where the two
 * disagree, a style lands on the wrong words — silently, since nothing throws.
 */

export interface DomRange {
  container: HTMLElement;
  from: number;
  to: number;
}

function isElement(n: Node): n is HTMLElement {
  return n.nodeType === Node.ELEMENT_NODE;
}

function isAtomicNode(node: Inline | undefined): boolean {
  return node !== undefined && node.t !== 'text' && node.t !== 'style' && node.t !== 'link';
}

function childrenOf(node: Inline | undefined): RichText | null {
  return node !== undefined && (node.t === 'style' || node.t === 'link') ? node.children : null;
}

/**
 * The model offset of a DOM position inside `container`, or `null` when it is not in it.
 *
 * `side` decides which edge of an atomic node an endpoint inside it collapses to, so
 * that selecting a rendered equation selects the whole of it rather than none of it.
 */
export function modelOffsetFromDom(
  container: Node,
  original: RichText,
  target: Node,
  offset: number,
  side: 'start' | 'end',
): number | null {
  // The position is BETWEEN this container's own children: `offset` is a child index.
  if (container === target) {
    let n = 0;
    const kids = Array.from(container.childNodes);
    for (let i = 0; i < offset && i < kids.length; i++) n += domLength(kids[i]!, original);
    return n;
  }

  let count = 0;

  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child === target) return count + Math.min(offset, child.textContent?.length ?? 0);
      count += child.textContent?.length ?? 0;
      continue;
    }

    if (!isElement(child)) continue;

    const raw = child.getAttribute(INLINE_INDEX_ATTR);
    if (raw === null) {
      // A browser-inserted wrapper or paste residue: the reader flattens it to plain
      // text, so it counts as its own characters and nothing inside it is addressable.
      if (child === target || child.contains(target)) {
        return count + (side === 'start' ? 0 : (child.textContent?.length ?? 0));
      }
      count += child.textContent?.length ?? 0;
      continue;
    }

    const node = original[Number(raw)];
    if (node === undefined) continue;

    if (isAtomicNode(node)) {
      // Never descend: KaTeX's internal text nodes have nothing to do with the model.
      if (child === target || child.contains(target)) {
        return count + (side === 'start' ? 0 : 1);
      }
      count += 1;
      continue;
    }

    const kids = childrenOf(node);
    if (kids === null) { count += 1; continue; }

    if (child === target || child.contains(target)) {
      const inner = modelOffsetFromDom(child, kids, target, offset, side);
      if (inner !== null) return count + inner;
    }
    count += richTextLength(kids);
  }

  return null;
}

function lengthOfChild(node: Inline): number {
  if (node.t === 'text') return node.s.length;
  if (node.t === 'style' || node.t === 'link') return richTextLength(node.children);
  return 1;
}

/** How many model characters one DOM child stands for. */
function domLength(child: Node, original: RichText): number {
  if (child.nodeType === Node.TEXT_NODE) return child.textContent?.length ?? 0;
  if (!isElement(child)) return 0;
  const raw = child.getAttribute(INLINE_INDEX_ATTR);
  if (raw === null) return child.textContent?.length ?? 0;
  const node = original[Number(raw)];
  if (node === undefined) return 0;
  return lengthOfChild(node);
}

/**
 * The live selection, as model offsets inside `container`.
 *
 * `null` when there is no selection, when it is somewhere else, or when it spans TWO
 * editable hosts. That last case deliberately does not clamp: styling half of what
 * looks selected is worse than doing nothing, and the caller disables the control.
 */
export function modelRangeFromSelection(
  container: HTMLElement,
  original: RichText,
): DomRange | null {
  const sel = window.getSelection();
  if (sel === null || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return null;
  }

  const from = modelOffsetFromDom(
    container, original, range.startContainer, range.startOffset, 'start',
  );
  const to = modelOffsetFromDom(
    container, original, range.endContainer, range.endOffset, 'end',
  );
  if (from === null || to === null) return null;
  return { container, from: Math.min(from, to), to: Math.max(from, to) };
}

/**
 * The inverse: a DOM range for a model range, so the caret survives a re-render.
 *
 * Character offsets do not change when a style is applied, so the same range is valid
 * against the new content — which is what lets Bold then Italic work without
 * re-selecting the words in between.
 */
export function domRangeFromModel(
  container: HTMLElement,
  content: RichText,
  from: number,
  to: number,
): Range | null {
  const start = domPositionAt(container, content, from);
  const end = domPositionAt(container, content, to);
  if (start === null || end === null) return null;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

function domPositionAt(
  container: HTMLElement,
  content: RichText,
  offset: number,
): { node: Node; offset: number } | null {
  let remaining = offset;

  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const len = child.textContent?.length ?? 0;
      if (remaining <= len) return { node: child, offset: remaining };
      remaining -= len;
      continue;
    }
    if (!isElement(child)) continue;

    const raw = child.getAttribute(INLINE_INDEX_ATTR);
    if (raw === null) {
      const len = child.textContent?.length ?? 0;
      if (remaining <= len) return { node: container, offset: indexOf(container, child) };
      remaining -= len;
      continue;
    }

    const node = content[Number(raw)];
    if (node === undefined) continue;

    const kids = childrenOf(node);
    if (kids !== null) {
      const len = richTextLength(kids);
      if (remaining <= len) {
        const inner = domPositionAt(child, kids, remaining);
        if (inner !== null) return inner;
      }
      remaining -= len;
      continue;
    }

    // Atomic: addressable only on either side of it.
    if (remaining === 0) return { node: container, offset: indexOf(container, child) };
    remaining -= 1;
  }

  return { node: container, offset: container.childNodes.length };
}

function indexOf(parent: Node, child: Node): number {
  return Array.prototype.indexOf.call(parent.childNodes, child);
}
