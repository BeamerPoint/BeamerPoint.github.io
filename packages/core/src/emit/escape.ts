/**
 * The ONLY module permitted to turn user text into LaTeX, or LaTeX back into user text.
 *
 * Escaping is where silent corruption lives. The contract here is deliberately strict:
 * `unescapeText` returns `null` rather than guessing. A `null` is a recognizer decline
 * signal — the caller must preserve the source verbatim as a raw inline island instead
 * of producing text that would not survive a round trip.
 */

import type { PlainText, TexString } from '../model/types.js';

/** Characters that cannot appear literally in LaTeX text mode. */
const ESCAPES: ReadonlyArray<readonly [string, string]> = [
  // Backslash MUST be first when escaping, so the replacements we emit below are not
  // themselves re-escaped.
  ['\\', '\\textbackslash{}'],
  ['{', '\\{'],
  ['}', '\\}'],
  ['#', '\\#'],
  ['$', '\\$'],
  ['%', '\\%'],
  ['&', '\\&'],
  ['_', '\\_'],
  ['~', '\\textasciitilde{}'],
  ['^', '\\textasciicircum{}'],
];

const SIMPLE_CHARS = new Set(['{', '}', '#', '$', '%', '&', '_']);

/**
 * Escape user text for LaTeX text mode.
 *
 * Total function: every possible input string has an escaped form.
 * `unescapeText(escapeText(s)) === s` holds for all `s` (property-tested).
 */
export function escapeText(s: PlainText): TexString {
  let out = '';
  for (const ch of s) {
    switch (ch) {
      case '\\': out += '\\textbackslash{}'; break;
      case '~': out += '\\textasciitilde{}'; break;
      case '^': out += '\\textasciicircum{}'; break;
      case '{': case '}': case '#': case '$': case '%': case '&': case '_':
        out += '\\' + ch;
        break;
      default:
        out += ch;
    }
  }
  return out;
}

/**
 * Invert `escapeText`.
 *
 * Returns `null` when the input contains LaTeX that is not purely escaped plain text —
 * any other control sequence, or a bare special character whose meaning is not literal.
 * Callers MUST treat `null` as "keep this verbatim", never as "close enough".
 */
export function unescapeText(tex: TexString): PlainText | null {
  let out = '';
  let i = 0;

  while (i < tex.length) {
    const ch = tex[i]!;

    if (ch === '\\') {
      // Long forms first: they are prefixes of nothing else, but must be checked
      // before the single-character forms so `\textbackslash{}` is not read as `\t`.
      if (tex.startsWith('\\textbackslash{}', i)) { out += '\\'; i += 16; continue; }
      if (tex.startsWith('\\textasciitilde{}', i)) { out += '~'; i += 17; continue; }
      if (tex.startsWith('\\textasciicircum{}', i)) { out += '^'; i += 18; continue; }

      const next = tex[i + 1];
      if (next !== undefined && SIMPLE_CHARS.has(next)) { out += next; i += 2; continue; }

      // Any other control sequence: not plain text.
      return null;
    }

    // A bare special character in the source is not literal text — it is markup
    // (math shift, alignment tab, comment, parameter, subscript, group, active tilde).
    if (ch === '$' || ch === '&' || ch === '%' || ch === '#' ||
        ch === '_' || ch === '^' || ch === '{' || ch === '}' || ch === '~') {
      return null;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/** True when `tex` is exclusively escaped plain text. */
export function isPlainEscaped(tex: TexString): boolean {
  return unescapeText(tex) !== null;
}

/**
 * Normalise punctuation that arrives via paste from word processors into forms that
 * survive `pdflatex` without `inputenc` surprises. Applied at paste time, not at emit
 * time, so the user sees what was stored.
 */
export function normalisePastedText(s: string): PlainText {
  return s
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/–/g, '--')
    .replace(/—/g, '---')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/​/g, '');
}

/** Exposed for tests that assert the table is internally consistent. */
export const ESCAPE_TABLE = ESCAPES;
