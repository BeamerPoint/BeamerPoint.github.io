import type { CiteStyle, Color, Inline, RichText, TexString } from '../model/types.js';
import { escapeText } from './escape.js';

/** Render an xcolor value as it appears inside `\textcolor{...}` or an option list. */
export function colorToTex(c: Color): TexString {
  switch (c.k) {
    case 'named': return c.name;
    case 'mix': return c.expr;
    case 'structure': return c.shade === undefined ? 'structure.fg' : `structure.fg!${c.shade}`;
    case 'rgb': {
      const f = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
      return `[rgb]{${f(c.r)},${f(c.g)},${f(c.b)}}`;
    }
  }
}

/** The command each citation style writes. */
export const CITE_COMMAND: Readonly<Record<CiteStyle, string>> = {
  plain: 'cite',
  p: 'citep',
  t: 'citet',
  auto: 'autocite',
  text: 'textcite',
};

const STYLE_COMMAND: Readonly<Record<string, string>> = {
  bf: 'textbf',
  it: 'textit',
  ul: 'underline',
  tt: 'texttt',
  sc: 'textsc',
  emph: 'emph',
  alert: 'alert',
  structure: 'structure',
};

/**
 * Render rich text to LaTeX.
 *
 * All user text passes through `escapeText`; nothing here concatenates raw user input.
 * `{ t: 'raw' }` islands are emitted byte-exact — they are the reason an unrecognised
 * macro survives an edit round trip unchanged.
 */
export function emitInline(rt: RichText): TexString {
  let out = '';
  for (let i = 0; i < rt.length; i++) {
    out += emitOne(rt[i]!, rt[i + 1]);
  }
  return out;
}

/**
 * True when a bare control word would swallow whatever comes next.
 *
 * `\ldots` followed by the text "abc" must be written `\ldots{}abc`, but
 * `\today` at the end of a group must stay `\today` — appending `{}` unconditionally
 * makes emit/parse/emit grow a pair of braces on every round trip.
 */
function needsBraceTerminator(next: Inline | undefined): boolean {
  if (next === undefined) return false;
  if (next.t !== 'text') return false;
  return /^[A-Za-z]/.test(next.s);
}

function emitOne(node: Inline, next?: Inline): TexString {
  switch (node.t) {
    case 'text':
      return escapeText(node.s);

    case 'raw':
      return node.tex;

    case 'break':
      return '\\\\';

    case 'math':
      return `$${node.tex}$`;

    case 'sym':
      return `\\${node.name}${needsBraceTerminator(next) ? '{}' : ''}`;

    case 'ref':
      return `\\${node.kind}{${node.target}}`;

    case 'link':
      return `\\href{${node.url}}{${emitInline(node.children)}}`;

    case 'cite': {
      const inner = node.keys.join(',');
      const cmd = CITE_COMMAND[node.style ?? 'plain'];
      if (node.pre !== undefined && node.post !== undefined) {
        return `\\${cmd}[${escapeText(node.pre)}][${escapeText(node.post)}]{${inner}}`;
      }
      if (node.post !== undefined) return `\\${cmd}[${escapeText(node.post)}]{${inner}}`;
      return `\\${cmd}{${inner}}`;
    }

    case 'style': {
      const body = emitInline(node.children);
      if (node.style === 'color') {
        const c = node.color ?? { k: 'named' as const, name: 'black' };
        const spec = colorToTex(c);
        // The rgb form already carries its own [model]{...} prefix.
        return spec.startsWith('[') ? `\\textcolor${spec}{${body}}` : `\\textcolor{${spec}}{${body}}`;
      }
      if (node.style === 'size') {
        return `{\\${node.size ?? 'normalsize'} ${body}}`;
      }
      const cmd = STYLE_COMMAND[node.style];
      return cmd === undefined ? body : `\\${cmd}{${body}}`;
    }
  }
}

/** True when the rich text contains nothing but whitespace. */
export function isBlankRichText(rt: RichText): boolean {
  return rt.every((n) => n.t === 'text' && n.s.trim() === '');
}

/** Plain-text approximation, for slide titles in the outline and thumbnails. */
export function richTextToPlain(rt: RichText): string {
  return rt
    .map((n) => {
      switch (n.t) {
        case 'text': return n.s;
        case 'style': return richTextToPlain(n.children);
        case 'link': return richTextToPlain(n.children);
        case 'math': return n.tex;
        case 'sym': return '';
        case 'break': return ' ';
        case 'cite': return `[${n.keys.join(',')}]`;
        case 'ref': return n.target;
        case 'raw': return '';
      }
    })
    .join('');
}
