/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { normalizeRichText, type Inline, type RichText } from '@beamerpoint/core';

/**
 * Reading edited rich text back out of the DOM.
 *
 * The naive approach — take `element.textContent` and rebuild the content as one plain
 * run — destroys everything that is not literal text. Bold becomes unbold, inline math
 * becomes the rendered glyphs, and a preserved raw macro like `\vspace{2mm}` gets
 * re-escaped into `\textbackslash{}vspace\{2mm\}`, which then prints as visible
 * characters in the compiled PDF.
 *
 * Instead, every inline node is tagged with its index when rendered, and this module
 * walks the DOM to reassemble the model. Nodes the user did not touch are carried over
 * by reference, byte for byte.
 */

export const INLINE_INDEX_ATTR = 'data-bp-i';

/**
 * Inline kinds that behave as a single indivisible object in the editor.
 *
 * These render as something other than their own source (KaTeX output, a symbol, a
 * citation chip), so there is no sensible way to map edited characters back onto them.
 * They are marked `contenteditable="false"` so a caret cannot get inside: the user can
 * delete one wholesale, but cannot corrupt it halfway.
 */
export function isAtomicInline(node: Inline): boolean {
  switch (node.t) {
    case 'math':
    case 'raw':
    case 'sym':
    case 'cite':
    case 'ref':
    case 'break':
      return true;
    default:
      return false;
  }
}

/** Inline kinds whose wrapper is preserved but whose children stay editable. */
function isContainerInline(node: Inline): node is Extract<Inline, { t: 'style' | 'link' }> {
  return node.t === 'style' || node.t === 'link';
}

/**
 * Rebuild rich text from an edited contenteditable subtree.
 *
 * @param container The element whose children were edited.
 * @param original  The rich text that was rendered into it, used to resolve indices.
 */
export function readInlineFromDom(container: Node, original: RichText): RichText {
  const out: RichText = [];

  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.push({ t: 'text', s: child.textContent ?? '' });
      continue;
    }

    if (!isElement(child)) continue;

    const raw = child.getAttribute(INLINE_INDEX_ATTR);
    if (raw === null) {
      // An element the renderer did not create: a browser-inserted wrapper, or markup
      // from a paste. Keep its characters as plain text rather than dropping them.
      const text = child.textContent ?? '';
      if (text !== '') out.push({ t: 'text', s: text });
      continue;
    }

    const node = original[Number(raw)];
    if (node === undefined) continue;

    if (isContainerInline(node)) {
      out.push({ ...node, children: readInlineFromDom(child, node.children) });
    } else {
      // Atomic: carried over unchanged. This is what keeps raw LaTeX intact.
      out.push(node);
    }
  }

  return normalizeRichText(out);
}

function isElement(n: Node): n is Element {
  return n.nodeType === Node.ELEMENT_NODE;
}
