/**
 * Stage 1 of the round trip: generic LaTeX source to CST.
 *
 * This function is TOTAL. It never throws and never loses bytes: malformed input
 * becomes an `error` node covering the offending region, and the caller degrades that
 * region to a raw block. Everything downstream relies on that guarantee.
 */

import type { SrcSpan } from '../model/types.js';
import {
  type CstGroup,
  type CstNode,
  type ParseDiagnostic,
  isMathEnv,
  isVerbatimEnv,
} from './cst.js';

export interface BuildCstResult {
  root: CstNode[];
  diagnostics: ParseDiagnostic[];
}

const LETTER = /[A-Za-z]/;

class Scanner {
  readonly src: string;
  pos = 0;
  readonly diagnostics: ParseDiagnostic[] = [];
  private readonly lineStarts: number[];

  constructor(src: string) {
    this.src = src;
    this.lineStarts = [0];
    for (let i = 0; i < src.length; i++) {
      if (src[i] === '\n') this.lineStarts.push(i + 1);
    }
  }

  lineAt(offset: number): number {
    // Binary search over line start offsets.
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }

  span(start: number, end: number): SrcSpan {
    return { start, end, line: this.lineAt(start) };
  }

  eof(): boolean {
    return this.pos >= this.src.length;
  }

  peek(offset = 0): string | undefined {
    return this.src[this.pos + offset];
  }

  error(message: string, start: number, end: number): CstNode {
    const span = this.span(start, end);
    this.diagnostics.push({ severity: 'error', message, span });
    return { n: 'error', message, span };
  }
}

/**
 * Parse `src` into a CST.
 *
 * @param src Complete LaTeX source.
 */
export function buildCst(src: string): BuildCstResult {
  const sc = new Scanner(src);
  const root = parseNodes(sc, null, false);
  return { root, diagnostics: sc.diagnostics };
}

/**
 * Parse nodes until EOF, a closing brace, or `\end{stopEnv}`.
 *
 * @param stopEnv When set, stop at `\end{stopEnv}` without consuming it.
 * @param inGroup When true a `}` closes the caller's group. When false a `}` is
 *   unbalanced, and becomes an error node so the byte is still accounted for —
 *   dropping it would break the invariant that spans cover the whole source.
 */
function parseNodes(sc: Scanner, stopEnv: string | null, inGroup: boolean): CstNode[] {
  const out: CstNode[] = [];

  while (!sc.eof()) {
    const ch = sc.peek()!;

    if (ch === '}') {
      if (inGroup) break;
      const braceStart = sc.pos;
      sc.pos += 1;
      out.push(sc.error('Unbalanced "}"', braceStart, sc.pos));
      continue;
    }

    if (ch === '\\' && stopEnv !== null && looksLikeEnd(sc, stopEnv)) break;

    const node = parseNode(sc);
    if (node === null) break;
    out.push(node);
  }

  return out;
}

/** True when the scanner sits on `\end{name}` (allowing spaces inside the braces). */
function looksLikeEnd(sc: Scanner, name: string): boolean {
  const m = /^\\end\s*\{\s*([^}]*?)\s*\}/.exec(sc.src.slice(sc.pos));
  return m !== null && m[1] === name;
}

function parseNode(sc: Scanner): CstNode | null {
  const start = sc.pos;
  const ch = sc.peek();
  if (ch === undefined) return null;

  if (ch === '%') return parseComment(sc);
  if (ch === '{') return parseGroup(sc);
  if (ch === '$') return parseDollarMath(sc);
  if (ch === '\\') return parseBackslash(sc);

  // Whitespace: a blank line is a paragraph break, everything else is text.
  if (ch === '\n' || ch === '\r') {
    const m = /^(\r?\n[ \t]*){2,}/.exec(sc.src.slice(sc.pos));
    if (m !== null) {
      sc.pos += m[0].length;
      return { n: 'parbreak', span: sc.span(start, sc.pos) };
    }
  }

  return parseText(sc);
}

function parseComment(sc: Scanner): CstNode {
  const start = sc.pos;
  sc.pos += 1; // '%'
  const nl = sc.src.indexOf('\n', sc.pos);
  const end = nl === -1 ? sc.src.length : nl;
  const value = sc.src.slice(sc.pos, end);
  sc.pos = end;
  return { n: 'comment', value, span: sc.span(start, end) };
}

function parseText(sc: Scanner): CstNode {
  const start = sc.pos;
  let i = sc.pos;
  while (i < sc.src.length) {
    const c = sc.src[i]!;
    if (c === '\\' || c === '{' || c === '}' || c === '%' || c === '$') break;
    // Stop before a blank line so the parbreak is its own node.
    if ((c === '\n' || c === '\r') && /^(\r?\n[ \t]*){2,}/.test(sc.src.slice(i))) break;
    i += 1;
  }
  // Guarantee forward progress even on a pathological input.
  if (i === start) i = start + 1;
  sc.pos = i;
  return { n: 'text', value: sc.src.slice(start, i), span: sc.span(start, i) };
}

function parseGroup(sc: Scanner): CstNode {
  const start = sc.pos;
  sc.pos += 1; // '{'
  const children = parseNodes(sc, null, true);
  if (sc.peek() !== '}') {
    return sc.error('Unclosed group: missing "}"', start, sc.pos);
  }
  sc.pos += 1; // '}'
  return { n: 'group', children, span: sc.span(start, sc.pos) };
}

function parseDollarMath(sc: Scanner): CstNode {
  const start = sc.pos;
  const display = sc.peek(1) === '$';
  const delim = display ? '$$' : '$';
  sc.pos += delim.length;
  const bodyStart = sc.pos;

  // Find the closing delimiter, skipping escaped dollars.
  let i = bodyStart;
  while (i < sc.src.length) {
    if (sc.src[i] === '\\') { i += 2; continue; }
    if (sc.src.startsWith(delim, i)) break;
    i += 1;
  }
  if (i >= sc.src.length) {
    sc.pos = sc.src.length;
    return sc.error('Unterminated math: missing closing "' + delim + '"', start, sc.pos);
  }
  const body = sc.src.slice(bodyStart, i);
  sc.pos = i + delim.length;
  return { n: 'math', display, body, span: sc.span(start, sc.pos) };
}

function parseBackslash(sc: Scanner): CstNode {
  const start = sc.pos;
  const next = sc.peek(1);

  if (next === undefined) {
    sc.pos += 1;
    return sc.error('Trailing backslash', start, sc.pos);
  }

  // \( ... \) and \[ ... \]
  if (next === '(' || next === '[') {
    const close = next === '(' ? '\\)' : '\\]';
    const bodyStart = sc.pos + 2;
    const idx = sc.src.indexOf(close, bodyStart);
    if (idx === -1) {
      sc.pos = sc.src.length;
      return sc.error('Unterminated math: missing "' + close + '"', start, sc.pos);
    }
    sc.pos = idx + 2;
    return { n: 'math', display: next === '[', body: sc.src.slice(bodyStart, idx), span: sc.span(start, sc.pos) };
  }

  // Symbolic control sequence: \\, \%, \{, \_, ...
  if (!LETTER.test(next)) {
    sc.pos += 2;
    return { n: 'cmd', name: next, star: false, opts: [], args: [], span: sc.span(start, sc.pos) };
  }

  // \name
  let i = sc.pos + 1;
  while (i < sc.src.length && LETTER.test(sc.src[i]!)) i += 1;
  const name = sc.src.slice(sc.pos + 1, i);
  sc.pos = i;

  if (name === 'verb') return parseVerbCommand(sc, start);
  if (name === 'begin') return parseEnvironment(sc, start);
  if (name === 'end') {
    // An \end with no matching \begin in scope.
    const g = tryParseBraceGroupRaw(sc);
    const envName = g ?? '?';
    return sc.error('Unexpected \\end{' + envName + '}', start, sc.pos);
  }

  const star = sc.peek() === '*';
  if (star) sc.pos += 1;

  const { opts, args } = parseCommandArguments(sc);
  return { n: 'cmd', name, star, opts, args, span: sc.span(start, sc.pos) };
}

/** `\verb<delim>...<delim>` with an arbitrary delimiter character. */
function parseVerbCommand(sc: Scanner, start: number): CstNode {
  const star = sc.peek() === '*';
  if (star) sc.pos += 1;
  const delim = sc.peek();
  if (delim === undefined || delim === '\n') {
    return sc.error('\\verb with no delimiter', start, sc.pos);
  }
  sc.pos += 1;
  const bodyStart = sc.pos;
  const idx = sc.src.indexOf(delim, bodyStart);
  if (idx === -1) {
    sc.pos = sc.src.length;
    return sc.error('Unterminated \\verb', start, sc.pos);
  }
  const body = sc.src.slice(bodyStart, idx);
  sc.pos = idx + 1;
  return { n: 'verb', name: star ? 'verb*' : 'verb', body, span: sc.span(start, sc.pos) };
}

function parseEnvironment(sc: Scanner, start: number): CstNode {
  const name = tryParseBraceGroupRaw(sc);
  if (name === null) {
    return sc.error('\\begin with no environment name', start, sc.pos);
  }

  // Verbatim-like: capture the body as opaque bytes. Do this BEFORE any tokenization,
  // otherwise a stray % or { inside a listing corrupts the parse.
  if (isVerbatimEnv(name)) {
    return parseOpaqueEnvBody(sc, start, name, 'verb');
  }
  if (isMathEnv(name)) {
    return parseOpaqueEnvBody(sc, start, name, 'math');
  }

  const { opts, args } = parseCommandArguments(sc);
  const bodyStart = sc.pos;
  const children = parseNodes(sc, name, false);
  const bodyEnd = sc.pos;

  if (!looksLikeEnd(sc, name)) {
    return sc.error('Unclosed environment: missing \\end{' + name + '}', start, sc.pos);
  }
  const endMatch = /^\\end\s*\{\s*[^}]*?\s*\}/.exec(sc.src.slice(sc.pos))!;
  sc.pos += endMatch[0].length;

  return {
    n: 'env',
    name,
    opts,
    args,
    children,
    bodySpan: sc.span(bodyStart, bodyEnd),
    span: sc.span(start, sc.pos),
  };
}

/** Capture an environment body verbatim, up to its matching `\end{name}`. */
function parseOpaqueEnvBody(
  sc: Scanner,
  start: number,
  name: string,
  as: 'verb' | 'math',
): CstNode {
  // Skip any options on the \begin line; they are part of the opaque capture for
  // verbatim environments and re-emitted from the original span.
  const bodyStart = sc.pos;
  const endRe = new RegExp('\\\\end\\s*\\{\\s*' + escapeRegExp(name) + '\\s*\\}');
  const rest = sc.src.slice(bodyStart);
  const m = endRe.exec(rest);
  if (m === null) {
    sc.pos = sc.src.length;
    return sc.error('Unclosed environment: missing \\end{' + name + '}', start, sc.pos);
  }
  const body = rest.slice(0, m.index);
  sc.pos = bodyStart + m.index + m[0].length;

  if (as === 'math') {
    return { n: 'math', display: true, body, span: sc.span(start, sc.pos) };
  }
  return { n: 'verb', name, body, span: sc.span(start, sc.pos) };
}

/**
 * Greedily consume `[...]` and `{...}` that immediately follow a command.
 *
 * Whitespace is allowed between arguments, but a paragraph break is not — that stops
 * argument collection, which prevents a command at the end of a paragraph from
 * swallowing the group that opens the next one.
 */
function parseCommandArguments(sc: Scanner): { opts: CstGroup[]; args: CstGroup[] } {
  const opts: CstGroup[] = [];
  const args: CstGroup[] = [];

  for (;;) {
    const save = sc.pos;
    skipInlineWhitespace(sc);
    const ch = sc.peek();

    if (ch === '[') {
      const g = parseBracketGroup(sc);
      if (g === null) { sc.pos = save; break; }
      opts.push(g);
      continue;
    }
    if (ch === '{') {
      const g = parseBraceGroup(sc);
      if (g === null) { sc.pos = save; break; }
      args.push(g);
      continue;
    }
    sc.pos = save;
    break;
  }

  return { opts, args };
}

/** Advance over spaces, tabs and at most one newline (never a blank line). */
function skipInlineWhitespace(sc: Scanner): void {
  const m = /^[ \t]*(\r?\n[ \t]*)?/.exec(sc.src.slice(sc.pos));
  if (m === null) return;
  // A blank line ends argument collection.
  if (/\r?\n[ \t]*\r?\n/.test(m[0])) return;
  sc.pos += m[0].length;
}

function parseBraceGroup(sc: Scanner): CstGroup | null {
  if (sc.peek() !== '{') return null;
  const start = sc.pos;
  sc.pos += 1;
  const children = parseNodes(sc, null, true);
  if (sc.peek() !== '}') { sc.pos = start; return null; }
  sc.pos += 1;
  return { children, span: sc.span(start, sc.pos) };
}

function parseBracketGroup(sc: Scanner): CstGroup | null {
  if (sc.peek() !== '[') return null;
  const start = sc.pos;
  sc.pos += 1;

  // Optional arguments are brace-aware but not fully recursive: scan to the matching
  // ']' at brace depth zero, then tokenize the interior.
  let depth = 0;
  let i = sc.pos;
  while (i < sc.src.length) {
    const c = sc.src[i]!;
    if (c === '\\') { i += 2; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === ']' && depth === 0) break;
    i += 1;
  }
  if (i >= sc.src.length) { sc.pos = start; return null; }

  const inner = sc.src.slice(sc.pos, i);
  const sub = new Scanner(inner);
  const children = parseNodes(sub, null, false);
  // Rebase child spans onto the outer source.
  const offset = sc.pos;
  rebase(children, offset, sc);

  sc.pos = i + 1;
  return { children, span: sc.span(start, sc.pos) };
}

function rebase(nodes: CstNode[], offset: number, sc: Scanner): void {
  for (const node of nodes) {
    node.span = sc.span(node.span.start + offset, node.span.end + offset);
    if (node.n === 'group') rebase(node.children, offset, sc);
    else if (node.n === 'env') {
      node.bodySpan = sc.span(node.bodySpan.start + offset, node.bodySpan.end + offset);
      rebase(node.children, offset, sc);
      for (const g of [...node.opts, ...node.args]) {
        g.span = sc.span(g.span.start + offset, g.span.end + offset);
        rebase(g.children, offset, sc);
      }
    } else if (node.n === 'cmd') {
      for (const g of [...node.opts, ...node.args]) {
        g.span = sc.span(g.span.start + offset, g.span.end + offset);
        rebase(g.children, offset, sc);
      }
    }
  }
}

/** Read `{name}` immediately at the cursor, returning the raw interior. */
function tryParseBraceGroupRaw(sc: Scanner): string | null {
  const m = /^\s*\{\s*([^}]*?)\s*\}/.exec(sc.src.slice(sc.pos));
  if (m === null) return null;
  sc.pos += m[0].length;
  return m[1]!;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
