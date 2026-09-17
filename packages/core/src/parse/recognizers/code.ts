import type { CodeElement, RichText } from '../../model/types.js';
import type { CstNode } from '../cst.js';
import { buildCst } from '../lexer.js';
import { parseInline, trimRichText } from '../inline.js';
import type { RecognizeCtx } from './elements.js';
import { splitOptions } from './tikz.js';

/**
 * Source listings: `lstlisting`, `minted` and `verbatim`.
 *
 * The lexer captures these environments as opaque `verb` nodes before any tokenization,
 * so the body arrives byte-exact — but it starts immediately after `\begin{name}`, which
 * means **the options are part of it**. `parseOpaqueEnvBody` says so in as many words.
 * Splitting them back off is this recognizer's real job; everything else is a map.
 *
 * All-or-nothing, as every recognizer must be: anything that would not re-emit as the
 * same bytes declines and becomes a raw block, and the round-trip guard catches whatever
 * slips past. In practice that means an imported listing whose option list is in a
 * different order from ours stays raw rather than being silently reordered.
 */

const ENV_BACKEND: Readonly<Record<string, CodeElement['backend']>> = {
  lstlisting: 'listings',
  minted: 'minted',
  verbatim: 'verbatim',
};

const FRAME_STYLES: ReadonlySet<string> = new Set(['none', 'single', 'lines', 'shadowbox']);

/**
 * Consume a balanced `[...]` or `{...}` at the very start of `text`.
 *
 * Position zero, not "the first one found": the emitter writes the bracket flush against
 * `\begin{lstlisting}`, so anything else — a space, a newline, a comment — is a file we
 * did not write and would not reproduce.
 */
function takeDelimited(
  text: string,
  open: '[' | '{',
): { inner: string; rest: string } | null {
  const close = open === '[' ? ']' : '}';
  if (text[0] !== open) return null;

  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '\\') { i += 1; continue; }
    if (c === open || (open === '[' && c === '{')) depth += 1;
    else if (c === close || (open === '[' && c === '}')) depth -= 1;
    else continue;
    if (depth === 0) return { inner: text.slice(1, i), rest: text.slice(i + 1) };
  }
  return null;
}

/** A `caption={...}` value, read as rich text so the inspector can edit it. */
function readCaption(value: string, ctx: RecognizeCtx): RichText | null {
  const braced = value.startsWith('{') && value.endsWith('}')
    ? value.slice(1, -1)
    : value;
  const sub = buildCst(braced);
  if (sub.diagnostics.length > 0) return null;
  return trimRichText(parseInline(sub.root, braced));
}

export function recognizeCode(node: CstNode, ctx: RecognizeCtx): CodeElement | null {
  if (node.n !== 'verb') return null;
  const backend = ENV_BACKEND[node.name];
  if (backend === undefined) return null;

  let rest = node.body;
  let optionText = '';
  let language = '';

  if (backend !== 'verbatim') {
    const opts = takeDelimited(rest, '[');
    if (opts !== null) {
      optionText = opts.inner;
      rest = opts.rest;
    }
  }

  if (backend === 'minted') {
    // minted takes its language as a mandatory argument, not as an option.
    const arg = takeDelimited(rest, '{');
    if (arg === null) return null;
    language = arg.inner.trim();
    rest = arg.rest;
  }

  // The newline either side of the body is structural, not content: listings needs the
  // code to start on its own line, and the emitter puts it back. Keeping it in the model
  // would show the user a blank first line they never typed.
  let code = rest.startsWith('\n') ? rest.slice(1) : rest;
  if (code.endsWith('\n')) code = code.slice(0, -1);

  const el: CodeElement = {
    id: ctx.newId(),
    kind: 'code',
    placement: { mode: 'flow' },
    backend,
    language,
    code,
    options: {},
    src: node.span,
  };

  for (const raw of optionText === '' ? [] : splitOptions(optionText)) {
    const opt = raw.trim();
    if (opt === '') continue;

    const eq = opt.indexOf('=');
    if (eq === -1) { el.options[opt] = ''; continue; }

    const key = opt.slice(0, eq).trim();
    const value = opt.slice(eq + 1).trim();

    if (key === 'language' && backend === 'listings') { el.language = value; continue; }
    if (key === 'caption') {
      const caption = readCaption(value, ctx);
      if (caption === null) return null;
      el.caption = caption;
      continue;
    }
    if (key === 'frame' && FRAME_STYLES.has(value)) {
      el.frameStyle = value as CodeElement['frameStyle'];
      continue;
    }
    el.options[key] = value;
  }

  return el;
}
