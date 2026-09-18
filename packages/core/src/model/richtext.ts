/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import type { Inline, RichText } from './types.js';

/**
 * Rich-text normalisation shared by the parser and by the canvas editor.
 *
 * Both produce `Inline[]` from different sources — CST nodes and DOM nodes — and both
 * need the same canonical form, or the same document would compare unequal depending
 * on which path it came through.
 */

/** Merge adjacent text nodes, and adjacent raw nodes, into single runs. */
export function normalizeRichText(rt: RichText): RichText {
  const out: RichText = [];
  for (const node of rt) {
    const prev = out[out.length - 1];
    if (node.t === 'text' && prev !== undefined && prev.t === 'text') {
      out[out.length - 1] = { t: 'text', s: prev.s + node.s };
      continue;
    }
    if (node.t === 'raw' && prev !== undefined && prev.t === 'raw') {
      out[out.length - 1] = { t: 'raw', tex: prev.tex + node.tex };
      continue;
    }
    // Drop empty text runs; they carry no content and only create noise in diffs.
    if (node.t === 'text' && node.s === '') continue;
    out.push(node);
  }
  return out;
}

/** Trim leading and trailing whitespace from the outermost text nodes. */
export function trimRichText(rt: RichText): RichText {
  const out: RichText = rt.map((n) => ({ ...n }) as Inline);

  const first = out[0];
  if (first !== undefined && first.t === 'text') {
    first.s = first.s.replace(/^\s+/, '');
  }
  const last = out[out.length - 1];
  if (last !== undefined && last.t === 'text') {
    last.s = last.s.replace(/\s+$/, '');
  }

  return out.filter((n) => !(n.t === 'text' && n.s === ''));
}

/**
 * True when two rich texts are structurally identical.
 *
 * Used to decide whether an edit actually changed anything, so that focusing and
 * blurring an element without typing does not push an undo entry.
 */
export function richTextEquals(a: RichText, b: RichText): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!inlineEquals(a[i]!, b[i]!)) return false;
  }
  return true;
}

function inlineEquals(a: Inline, b: Inline): boolean {
  if (a.t !== b.t) return false;
  switch (a.t) {
    case 'text': return a.s === (b as typeof a).s;
    case 'raw': return a.tex === (b as typeof a).tex;
    case 'math': return a.tex === (b as typeof a).tex;
    case 'sym': return a.name === (b as typeof a).name;
    case 'break': return true;
    case 'ref': {
      const o = b as typeof a;
      return a.kind === o.kind && a.target === o.target;
    }
    case 'cite': {
      const o = b as typeof a;
      return a.keys.join(',') === o.keys.join(',') && a.pre === o.pre && a.post === o.post;
    }
    case 'link': {
      const o = b as typeof a;
      return a.url === o.url && richTextEquals(a.children, o.children);
    }
    case 'style': {
      const o = b as typeof a;
      return a.style === o.style
        && a.size === o.size
        && JSON.stringify(a.color) === JSON.stringify(o.color)
        && richTextEquals(a.children, o.children);
    }
  }
}
