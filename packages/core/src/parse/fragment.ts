/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import type { RichText } from '../model/types.js';
import type { CstNode } from './cst.js';
import { buildCst } from './lexer.js';
import { parseInline, trimRichText } from './inline.js';
import { emitInline } from '../emit/inline.js';

/**
 * A piece of LaTeX a user typed into a one-line field, read as rich text.
 *
 * For the fields that hold a command argument -- the presentation's title, author,
 * institute and date -- where a plain-text field would turn `\and` into nothing and
 * `\today` into an empty box (F-018).
 *
 * Returns `null` for anything that cannot stand inside `\author{...}`: unbalanced
 * braces or a lexer error, a `%` comment (it would swallow the closing brace), or a
 * paragraph break. The caller keeps its own text and does not commit, rather than
 * writing a fragment that breaks the document around it.
 *
 * What it returns always emits back to exactly what was typed: when the inline parser's
 * reading would re-emit differently, the whole fragment is kept as one raw island, which
 * is byte-exact by construction -- the guard's rule, applied to a single field.
 */
export function richTextFromTex(tex: string): RichText | null {
  const src = tex.trim();
  if (src === '') return [];
  const cst = buildCst(src);
  if (cst.diagnostics.length > 0) return null;
  if (cst.root.some(unsafe)) return null;
  const rt = trimRichText(parseInline(cst.root, src));
  return emitInline(rt) === src ? rt : [{ t: 'raw', tex: src }];
}

/**
 * Also refused: a bare `&`, `#`, `^` or `_` in text, each an error outside the context
 * that gives it meaning -- `\title{R&D}` does not compile -- and `\verb`, which cannot
 * appear in a command argument at all.
 */
function unsafe(node: CstNode): boolean {
  switch (node.n) {
    case 'comment':
    case 'parbreak':
    case 'error':
    case 'verb':
      return true;
    case 'text':
      return /[&#^_]/.test(node.value);
    case 'group':
      return node.children.some(unsafe);
    case 'cmd':
      return [...node.opts, ...node.args].some((g) => g.children.some(unsafe));
    case 'env':
      return node.children.some(unsafe);
    default:
      return false;
  }
}
