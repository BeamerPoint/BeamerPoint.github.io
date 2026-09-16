import type {
  BeamerBlockElement,
  ColumnSpec,
  ColumnsElement,
  Element,
  Id,
  ImageElement,
  ImageTrim,
  Length,
  MathElement,
  ListElement,
  ListItem,
  Placement,
  RawElement,
} from '../../model/types.js';
import type { CstGroup, CstNode } from '../cst.js';
import { buildCst } from '../lexer.js';
import { parseInline, trimRichText } from '../inline.js';
import { recognizeTable } from './table.js';
import { recognizeTikz } from './tikz.js';

export interface RecognizeCtx {
  src: string;
  newId(): Id;
  /**
   * Map an image path found in the source onto a resource id, registering it if this
   * is the first time it has been seen. The deck stores ids; the .tex stores paths.
   */
  resolveResource?(path: string): Id;
}

const LIST_ENVS: ReadonlySet<string> = new Set(['itemize', 'enumerate', 'description']);

const BLOCK_ENVS: Readonly<Record<string, BeamerBlockElement['variant']>> = {
  block: 'block',
  alertblock: 'alertblock',
  exampleblock: 'exampleblock',
  theorem: 'theorem',
  definition: 'definition',
  lemma: 'lemma',
  corollary: 'corollary',
  proof: 'proof',
  example: 'example',
};

/**
 * Commands that terminate a prose run and become their own element.
 *
 * Everything else is treated as inline and folded into the surrounding text element,
 * where `parseInline` will preserve it as a raw island if it is not understood.
 */
const BLOCK_COMMANDS: ReadonlySet<string> = new Set([
  'titlepage', 'maketitle', 'tableofcontents',
  'includegraphics', 'bibliography', 'bibliographystyle', 'printbibliography',
  // A table shrunk to fit is `\resizebox{...}{!}{<tabular>}`, which has to reach the
  // table recognizer rather than being folded into the surrounding prose.
  'resizebox',
]);

/** Commands handled by the frame recognizer, never emitted as elements. */
export const FRAME_META_COMMANDS: ReadonlySet<string> = new Set([
  'frametitle', 'framesubtitle', 'note',
]);

function rawSlice(ctx: RecognizeCtx, from: CstNode, to: CstNode = from): string {
  return ctx.src.slice(from.span.start, to.span.end);
}

function makeRaw(
  ctx: RecognizeCtx,
  tex: string,
  reason: RawElement['reason'],
  label?: string,
): RawElement {
  return {
    id: ctx.newId(),
    kind: 'raw',
    placement: { mode: 'flow' },
    tex,
    reason,
    ...(label !== undefined ? { label } : {}),
  };
}

/**
 * Turn a run of CST nodes (a frame body, a block body, a column body) into elements.
 *
 * Prose is accumulated until something block-level appears, then flushed as a single
 * text element. Comments attach to the element that follows them so they survive a
 * round trip in the right place.
 */
export function recognizeElements(nodes: CstNode[], ctx: RecognizeCtx): Element[] {
  const out: Element[] = [];
  let buffer: CstNode[] = [];
  let comments: string[] = [];

  const attach = (el: Element): void => {
    if (comments.length > 0) {
      el.leadingComments = comments;
      comments = [];
    }
    out.push(el);
  };

  const isBlank = (n: CstNode): boolean => n.n === 'text' && n.value.trim() === '';

  const flushProse = (): void => {
    if (buffer.length === 0) return;
    const nodes = buffer;
    buffer = [];

    const content = trimRichText(parseInline(nodes, ctx.src));
    if (content.length === 0) {
      comments = [];
      return;
    }

    // The span must cover the significant nodes only. Trailing whitespace can sit
    // where a command was lifted out of the body (a \note, say), and including it
    // would make the span overlap content this element does not own — which the
    // round-trip guard would then see as a mismatch.
    const first = nodes.find((n) => !isBlank(n)) ?? nodes[0]!;
    let last = nodes[nodes.length - 1]!;
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (!isBlank(nodes[i]!)) { last = nodes[i]!; break; }
    }

    attach({
      id: ctx.newId(),
      kind: 'text',
      placement: { mode: 'flow' },
      content,
      src: { start: first.span.start, end: last.span.end, line: first.span.line },
    });
  };

  for (const node of nodes) {
    if (node.n === 'comment') {
      flushProse();
      comments.push(node.value);
      continue;
    }

    if (node.n === 'parbreak') {
      flushProse();
      continue;
    }

    if (node.n === 'text' && node.value.trim() === '') {
      if (buffer.length > 0) buffer.push(node);
      continue;
    }

    if (isBlockLevel(node)) {
      flushProse();
      attach(recognizeBlockLevel(node, ctx));
      continue;
    }

    buffer.push(node);
  }

  flushProse();

  // Trailing comments with nothing to attach to must still survive.
  if (comments.length > 0) {
    out.push(makeRaw(ctx, comments.map((c) => `%${c}`).join('\n'), 'unrecognised', 'comment'));
  }

  return out;
}

function isBlockLevel(node: CstNode): boolean {
  switch (node.n) {
    case 'env':
    case 'verb':
    case 'error':
      return true;
    case 'math':
      return node.display;
    case 'cmd':
      return BLOCK_COMMANDS.has(node.name);
    default:
      return false;
  }
}

/**
 * Recognize one block-level node.
 *
 * Every branch is all-or-nothing: a recognizer that meets something it cannot model
 * falls through to `makeRaw` with the exact source bytes rather than returning a
 * partially-populated element.
 */
function recognizeBlockLevel(node: CstNode, ctx: RecognizeCtx): Element {
  // Tables come first: a `center` or `table` wrapper around a tabular would
  // otherwise be read by the image or prose recognizers.
  const table = recognizeTable(node, ctx);
  if (table !== null) return table;

  if (node.n === 'env') {
    const placed = recognizeTextblock(node, ctx);
    if (placed !== null) return placed;

    if (LIST_ENVS.has(node.name)) {
      const list = recognizeList(node, ctx);
      if (list !== null) return list;
    }

    const variant = BLOCK_ENVS[node.name];
    if (variant !== undefined) {
      const block = recognizeBlock(node, variant, ctx);
      if (block !== null) return block;
    }

    if (node.name === 'columns') {
      const cols = recognizeColumns(node, ctx);
      if (cols !== null) return cols;
    }

    if (node.name === 'tikzpicture') {
      const pic = recognizeTikz(node, ctx);
      if (pic !== null) return pic;
    }

    if (node.name === 'figure') {
      const fig = recognizeFigure(node, ctx);
      if (fig !== null) return fig;
    }

    const aligned = recognizeAlignedImage(node, ctx);
    if (aligned !== null) return aligned;
  }

  if (node.n === 'cmd' && node.name === 'includegraphics') {
    const img = recognizeIncludegraphics(node, ctx);
    if (img !== null) return img;
  }

  if (node.n === 'math' && node.display) {
    const math = recognizeDisplayMath(node, ctx);
    if (math !== null) return math;
  }

  return makeRaw(ctx, rawSlice(ctx, node), 'unrecognised', labelFor(node));
}

function labelFor(node: CstNode): string | undefined {
  if (node.n === 'env') return `\\begin{${node.name}}`;
  if (node.n === 'cmd') return `\\${node.name}`;
  if (node.n === 'verb') return `\\begin{${node.name}}`;
  if (node.n === 'math') return 'display math';
  return undefined;
}

/* --------------------------------------------------------------------- lists */

function recognizeList(
  node: Extract<CstNode, { n: 'env' }>,
  ctx: RecognizeCtx,
): ListElement | null {
  const items = splitItems(node.children, ctx);
  if (items === null) return null;

  const envOptions = node.opts.length > 0
    ? ctx.src.slice(node.opts[0]!.span.start, node.opts[node.opts.length - 1]!.span.end)
    : undefined;

  return {
    id: ctx.newId(),
    kind: 'list',
    placement: { mode: 'flow' },
    listType: node.name as ListElement['listType'],
    ...(envOptions !== undefined ? { envOptions } : {}),
    items,
    src: node.span,
  };
}

/**
 * Split an itemize body into items.
 *
 * Returns `null` when content appears before the first `\item`, because that content
 * has no representation in the model and silently dropping it is exactly the failure
 * this architecture exists to prevent.
 */
function splitItems(children: CstNode[], ctx: RecognizeCtx): ListItem[] | null {
  interface Pending { label?: CstGroup; nodes: CstNode[] }
  const items: ListItem[] = [];
  let current: Pending | null = null;

  /** Convert the pending item. Returns false to decline the whole environment. */
  const flush = (): boolean => {
    if (current === null) return true;
    const pending: Pending = current;
    current = null;

    const sublistIdx = pending.nodes.findIndex((n) => n.n === 'env' && LIST_ENVS.has(n.name));
    const inlineNodes = sublistIdx === -1 ? pending.nodes : pending.nodes.slice(0, sublistIdx);
    const tail = sublistIdx === -1 ? [] : pending.nodes.slice(sublistIdx);

    let sublist: ListElement | undefined;
    if (tail.length > 0) {
      const envNode = tail[0]!;
      if (envNode.n !== 'env') return false;
      const nested = recognizeList(envNode, ctx);
      if (nested === null) return false;
      sublist = nested;
      // Content after a nested list has no representation; refuse rather than drop it.
      const rest = tail.slice(1);
      const significant = rest.some(
        (n) => !(n.n === 'parbreak' || (n.n === 'text' && n.value.trim() === '')),
      );
      if (significant) return false;
    }

    const item: ListItem = {
      id: ctx.newId(),
      content: trimRichText(parseInline(inlineNodes, ctx.src)),
    };
    if (pending.label !== undefined) {
      item.label = trimRichText(parseInline(pending.label.children, ctx.src));
    }
    if (sublist !== undefined) item.sublist = sublist;
    items.push(item);
    return true;
  };

  for (const node of children) {
    if (node.n === 'cmd' && node.name === 'item') {
      if (!flush()) return null;
      if (node.opts.length > 1) return null;
      const label = node.opts.length === 1 ? node.opts[0]! : undefined;
      current = { nodes: [], ...(label !== undefined ? { label } : {}) };
      continue;
    }

    if (current === null) {
      // Whitespace before the first \item is tolerable; anything else would be lost,
      // so decline the whole environment rather than dropping it.
      if (node.n === 'text' && node.value.trim() === '') continue;
      if (node.n === 'parbreak') continue;
      return null;
    }

    current.nodes.push(node);
  }

  if (!flush()) return null;
  return items.length > 0 ? items : null;
}

/* -------------------------------------------------------------------- blocks */

function recognizeBlock(
  node: Extract<CstNode, { n: 'env' }>,
  variant: BeamerBlockElement['variant'],
  ctx: RecognizeCtx,
): BeamerBlockElement | null {
  if (node.args.length > 1) return null;
  const title = node.args.length === 1
    ? trimRichText(parseInline(node.args[0]!.children, ctx.src))
    : undefined;

  return {
    id: ctx.newId(),
    kind: 'block',
    placement: { mode: 'flow' },
    variant,
    ...(title !== undefined ? { title } : {}),
    children: recognizeElements(node.children, ctx),
    src: node.span,
  };
}

/* ------------------------------------------------------------------- columns */

function recognizeColumns(
  node: Extract<CstNode, { n: 'env' }>,
  ctx: RecognizeCtx,
): ColumnsElement | null {
  const columns: ColumnSpec[] = [];

  for (const child of node.children) {
    if (child.n === 'text' && child.value.trim() === '') continue;
    if (child.n === 'parbreak') continue;
    if (child.n !== 'env' || child.name !== 'column') return null;
    if (child.args.length !== 1) return null;

    const width = parseLength(ctx.src.slice(child.args[0]!.span.start + 1, child.args[0]!.span.end - 1));
    if (width === null) return null;

    const valign = child.opts.length === 1
      ? ctx.src.slice(child.opts[0]!.span.start + 1, child.opts[0]!.span.end - 1).trim()
      : undefined;
    if (valign !== undefined && !['t', 'c', 'b'].includes(valign)) return null;

    columns.push({
      id: ctx.newId(),
      width,
      ...(valign !== undefined ? { valign: valign as 't' | 'c' | 'b' } : {}),
      children: recognizeElements(child.children, ctx),
    });
  }

  if (columns.length === 0) return null;

  const envOptions = node.opts.length > 0
    ? ctx.src.slice(node.opts[0]!.span.start, node.opts[node.opts.length - 1]!.span.end)
    : undefined;

  return {
    id: ctx.newId(),
    kind: 'columns',
    placement: { mode: 'flow' },
    ...(envOptions !== undefined ? { envOptions } : {}),
    columns,
    src: node.span,
  };
}

/* ---------------------------------------------------------------------- math */

const MATH_ENVS: ReadonlySet<string> = new Set([
  'equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'displaymath',
]);

/**
 * Display math: an `equation`-family environment, or `\[ ... \]`.
 *
 * The body is kept verbatim and never parsed. Math is the one place where a
 * structural model buys nothing and risks everything: users paste equations from
 * papers, and anything we cannot represent we would have to mangle.
 */
function recognizeDisplayMath(
  node: Extract<CstNode, { n: 'math' }>,
  ctx: RecognizeCtx,
): MathElement | null {
  // `multline` and `eqnarray` are captured by the lexer but not modelled; leaving them
  // raw keeps them byte-exact rather than silently relabelling them.
  const env = node.env ?? 'displaymath';
  if (!MATH_ENVS.has(env)) return null;

  // The lexer's capture runs from immediately after `\begin{env}` to immediately
  // before `\end{env}`, so it includes the newline the emitter writes after the
  // opening and the indentation before the closing. Left in, every round trip would
  // add another blank line. Strip exactly that boundary whitespace and nothing else —
  // whitespace INSIDE the body is the author's alignment and must survive.
  const tex = node.body.replace(/^\r?\n/, '').replace(/\r?\n[ \t]*$/, '');

  return {
    id: ctx.newId(),
    kind: 'math',
    placement: { mode: 'flow' },
    env: env as MathElement['env'],
    tex,
    src: node.span,
  };
}

/* -------------------------------------------------------------------- images */

const ALIGN_ENVS: Readonly<Record<string, 'left' | 'center' | 'right'>> = {
  center: 'center',
  flushleft: 'left',
  flushright: 'right',
};

/** `\begin{center}\includegraphics{...}\end{center}` and its left/right siblings. */
function recognizeAlignedImage(
  node: Extract<CstNode, { n: 'env' }>,
  ctx: RecognizeCtx,
): ImageElement | null {
  const align = ALIGN_ENVS[node.name];
  if (align === undefined) return null;

  const significant = node.children.filter(
    (c) => !(c.n === 'parbreak' || (c.n === 'text' && c.value.trim() === '')),
  );
  if (significant.length !== 1) return null;

  const only = significant[0]!;
  if (only.n !== 'cmd' || only.name !== 'includegraphics') return null;

  const img = recognizeIncludegraphics(only, ctx);
  if (img === null) return null;
  return { ...img, align, src: node.span };
}

/** Bare `\includegraphics[...]{path}`. */
function recognizeIncludegraphics(
  node: Extract<CstNode, { n: 'cmd' }>,
  ctx: RecognizeCtx,
): ImageElement | null {
  if (ctx.resolveResource === undefined) return null;
  if (node.args.length !== 1 || node.opts.length > 1) return null;

  const path = ctx.src.slice(node.args[0]!.span.start + 1, node.args[0]!.span.end - 1).trim();
  if (path === '') return null;

  const parsed = parseGraphicsOptions(
    node.opts.length === 1
      ? ctx.src.slice(node.opts[0]!.span.start + 1, node.opts[0]!.span.end - 1)
      : '',
  );
  if (parsed === null) return null;

  return {
    id: ctx.newId(),
    kind: 'image',
    placement: { mode: 'flow' },
    resourceId: ctx.resolveResource(path),
    ...(parsed.width !== undefined ? { width: parsed.width } : {}),
    ...(parsed.height !== undefined ? { height: parsed.height } : {}),
    ...(parsed.rotate !== undefined ? { rotate: parsed.rotate } : {}),
    ...(parsed.trim !== undefined ? { trim: parsed.trim } : {}),
    ...(parsed.rest !== '' ? { altGraphicsOptions: parsed.rest } : {}),
    keepAspect: parsed.keepAspect,
    src: node.span,
  };
}

/**
 * A `figure` environment wrapping a single graphic, which is how a captioned image is
 * emitted. Anything more elaborate declines and stays raw.
 */
function recognizeFigure(
  node: Extract<CstNode, { n: 'env' }>,
  ctx: RecognizeCtx,
): ImageElement | null {
  let graphic: ImageElement | null = null;
  let caption: CstGroup | undefined;

  for (const child of node.children) {
    if (child.n === 'text' && child.value.trim() === '') continue;
    if (child.n === 'parbreak') continue;

    if (child.n === 'cmd' && child.name === 'centering' && child.args.length === 0) continue;

    if (child.n === 'cmd' && child.name === 'includegraphics') {
      if (graphic !== null) return null;
      graphic = recognizeIncludegraphics(child, ctx);
      if (graphic === null) return null;
      continue;
    }

    if (child.n === 'cmd' && child.name === 'caption' && child.args.length === 1) {
      if (caption !== undefined) return null;
      caption = child.args[0]!;
      continue;
    }

    // Anything else in the figure has no representation; keep the whole thing raw.
    return null;
  }

  if (graphic === null) return null;
  return {
    ...graphic,
    ...(caption !== undefined
      ? { caption: trimRichText(parseInline(caption.children, ctx.src)) }
      : {}),
    src: node.span,
  };
}

interface GraphicsOptions {
  width?: Length;
  height?: Length;
  rotate?: number;
  trim?: ImageTrim;
  keepAspect: boolean;
  /** Options we understood well enough to keep, but not to model. */
  rest: string;
}

/** `trim=L B R T`, in any length unit graphicx accepts. */
function parseTrim(value: string): ImageTrim | null {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 4) return null;

  const nums = parts.map((p) => {
    const m = /^(-?[\d.]+)\s*(bp|pt|mm|cm|in|px)?$/.exec(p);
    if (m === null) return null;
    const n = Number.parseFloat(m[1]!);
    if (!Number.isFinite(n)) return null;
    // Normalise to big points, the unit the model stores.
    switch (m[2] ?? 'bp') {
      case 'bp': case 'px': return n;
      case 'pt': return n * 72 / 72.27;
      case 'mm': return n * 72 / 25.4;
      case 'cm': return n * 720 / 25.4;
      case 'in': return n * 72;
      default: return null;
    }
  });

  if (nums.some((n) => n === null)) return null;
  const [left, bottom, right, top] = nums as number[];
  return { left: left!, bottom: bottom!, right: right!, top: top! };
}

/** Parse the `\includegraphics` option list, preserving anything unrecognised. */
function parseGraphicsOptions(raw: string): GraphicsOptions | null {
  const out: GraphicsOptions = { keepAspect: false, rest: '' };
  const rest: string[] = [];
  let sawClip = false;
  let trimSource = '';

  for (const part of splitTopLevel(raw)) {
    const opt = part.trim();
    if (opt === '') continue;

    if (opt === 'keepaspectratio') { out.keepAspect = true; continue; }
    if (opt === 'clip') { sawClip = true; continue; }

    const kv = /^([A-Za-z]+)\s*=\s*(.+)$/.exec(opt);
    if (kv === null) { rest.push(opt); continue; }

    const [, key, value] = kv as unknown as [string, string, string];
    if (key === 'width' || key === 'height') {
      const len = parseLength(value);
      if (len === null) { rest.push(opt); continue; }
      if (key === 'width') out.width = len; else out.height = len;
      continue;
    }
    if (key === 'angle') {
      const n = Number.parseFloat(value);
      if (Number.isFinite(n)) { out.rotate = n; continue; }
    }
    if (key === 'trim') {
      const trim = parseTrim(value);
      if (trim !== null) { out.trim = trim; trimSource = opt; continue; }
    }
    rest.push(opt);
  }

  // `trim` without `clip` resizes the box without hiding anything, which is not a crop.
  // Hand it back VERBATIM rather than re-serialising the parsed numbers: reconstructing
  // it would drop the original units and no longer match the source.
  if (out.trim !== undefined && !sawClip) {
    rest.push(trimSource);
    delete out.trim;
  } else if (sawClip && out.trim === undefined) {
    rest.push('clip');
  }

  out.rest = rest.join(',');
  return out;
}

function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '{' || c === '[') depth += 1;
    else if (c === '}' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out;
}

const LENGTH_RE = /^\s*(-?[\d.]+)\s*(?:\\(textwidth|linewidth|textheight|paperwidth|paperheight)|(mm|cm|pt|ex|em))\s*$/;

export function parseLength(s: string): Length | null {
  const m = LENGTH_RE.exec(s);
  if (m === null) return null;
  const v = Number.parseFloat(m[1]!);
  if (!Number.isFinite(v)) return null;
  const u = (m[2] ?? m[3]) as Length['u'];
  return { v, u };
}

/* ---------------------------------------------------- absolute placement */

/**
 * Peel a `\rotatebox{deg}{...}` wrapper off a textblock body.
 *
 * The emitter writes one whenever `Placement.rotate` is set. Without this the whole
 * `textblock*` failed to recognise, the guard demoted it to a raw block, and a rotated
 * element stopped being editable on the canvas the moment the source was reparsed —
 * and `graphicx` stopped being derived, which reordered the preamble and broke the
 * `emit -> parse -> emit` fixpoint.
 *
 * Returns null for anything that is not exactly one wrapper around the whole body,
 * which declines rather than guessing, as every recognizer must.
 */
function peelRotatebox(
  text: string,
): { deg: number; inner: string; offset: number } | null {
  const head = /^\s*\\rotatebox\{(-?[\d.]+)\}\{%?/.exec(text);
  if (head === null) return null;

  let depth = 1;
  let i = head[0].length;
  for (; i < text.length && depth > 0; i += 1) {
    const c = text[i];
    if (c === '\\') { i += 1; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
  }
  if (depth !== 0) return null;
  // Nothing but whitespace may follow, or this is not a wrapper around the whole body.
  if (text.slice(i).trim() !== '') return null;

  // The emitter always puts a minipage inside the rotatebox, because rotatebox
  // typesets in LR mode and a block environment fails there outright.
  const body = text.slice(head[0].length, i - 1);
  const mini = /^\s*\\begin\{minipage\}\{\\linewidth\}([\s\S]*)\\end\{minipage\}\s*$/
    .exec(body);

  return {
    deg: Number.parseFloat(head[1]!),
    inner: mini === null ? body : mini[1]!,
    offset: head[0].length + (mini === null ? 0 : mini[0].indexOf(mini[1]!)),
  };
}

/**
 * Shift an element tree's source spans by `offset`.
 *
 * A `textblock*`'s body is re-lexed on its own so that raw slices inside it resolve
 * against the right string — but that leaves every span inside counted from the start of
 * the FRAGMENT, while the guard slices them out of the whole document. An absolutely
 * placed block's child text therefore compared itself against a piece of the preamble,
 * mismatched, and took the whole frame down to a raw block with it. The outer element's
 * own span was already replaced, which is why a bare text box survived and anything with
 * children did not.
 */
function rebaseSrc<T extends Element>(el: T, offset: number): T {
  const next: Element = { ...el };
  if (next.src !== undefined) {
    next.src = {
      ...next.src,
      start: next.src.start + offset,
      end: next.src.end + offset,
    };
  }
  if (next.kind === 'block') {
    next.children = next.children.map((c) => rebaseSrc(c, offset));
  } else if (next.kind === 'columns') {
    next.columns = next.columns.map((c) => ({
      ...c,
      children: c.children.map((x) => rebaseSrc(x, offset)),
    }));
  }
  return next as T;
}

/** `\begin{textblock*}{W}(X,Y)` produced by dragging an element on the canvas. */
function recognizeTextblock(
  node: Extract<CstNode, { n: 'env' }>,
  ctx: RecognizeCtx,
): Element | null {
  if (node.name !== 'textblock*') return null;
  if (node.args.length !== 1) return null;

  const widthText = ctx.src.slice(node.args[0]!.span.start + 1, node.args[0]!.span.end - 1);
  const wm = /^\s*(-?[\d.]+)\s*mm\s*$/.exec(widthText);
  if (wm === null) return null;

  // The (x,y) pair is ordinary text at the START of the body: argument collection
  // stops at the closing brace of {W}, so the coordinates are inside bodySpan.
  const body = ctx.src.slice(node.bodySpan.start, node.bodySpan.end);
  const pm = /^\s*\(\s*(-?[\d.]+)\s*mm\s*,\s*(-?[\d.]+)\s*mm\s*\)/.exec(body);
  if (pm === null) return null;

  // Re-lex the remainder on its own, so raw slices inside it resolve against the
  // right string rather than against absolute offsets into the full document.
  const rotated = peelRotatebox(body.slice(pm[0].length));
  const remainder = rotated === null ? body.slice(pm[0].length) : rotated.inner;
  // Where `remainder` begins inside the whole document, for rebasing spans below.
  const base = node.bodySpan.start + pm[0].length + (rotated?.offset ?? 0);
  const sub = buildCst(remainder);
  const inner = recognizeElements(sub.root, {
    src: remainder,
    newId: ctx.newId,
    ...(ctx.resolveResource !== undefined ? { resolveResource: ctx.resolveResource } : {}),
  });
  if (inner.length !== 1) return null;

  const placement: Placement = {
    mode: 'absolute',
    x: Number.parseFloat(pm[1]!),
    y: Number.parseFloat(pm[2]!),
    w: Number.parseFloat(wm[1]!),
    z: 0,
    ...(rotated === null ? {} : { rotate: rotated.deg }),
    driver: 'textpos',
  };

  const only = rebaseSrc(inner[0]!, base);

  // An absolutely-placed image is emitted with `width=\linewidth` so it fills the
  // block. That is implied by the placement, so drop it here rather than carrying it
  // as an unmodelled option and emitting it twice.
  if (only.kind === 'image') {
    const opts = (only.altGraphicsOptions ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o !== '' && o !== 'width=\linewidth');
    const image = { ...only, placement, src: node.span } as typeof only;
    delete image.width;
    if (opts.length > 0) image.altGraphicsOptions = opts.join(',');
    else delete image.altGraphicsOptions;
    return image;
  }

  return { ...only, placement, src: node.span };
}
