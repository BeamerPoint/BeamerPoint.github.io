import type { BeamerFontSize, CiteStyle, Color, Inline, RichText } from '../model/types.js';
import type { CstGroup, CstNode } from './cst.js';
import { normalizeRichText, trimRichText } from '../model/richtext.js';

/**
 * Stage 2 for inline content: CST nodes to rich text.
 *
 * Anything not recognised becomes `{ t: 'raw' }` carrying the exact source bytes.
 * That is the inline-level equivalent of `RawElement`, and it is what stops a
 * `\pause`, a user-defined macro, or an exotic font switch from being silently
 * dropped when a paragraph is edited on the canvas.
 */

const SIMPLE_STYLES: Readonly<Record<string, 'bf' | 'it' | 'ul' | 'tt' | 'sc' | 'emph' | 'alert' | 'structure'>> = {
  textbf: 'bf',
  textit: 'it',
  emph: 'emph',
  underline: 'ul',
  texttt: 'tt',
  textsc: 'sc',
  alert: 'alert',
  structure: 'structure',
};

/** Control sequences that stand for a literal character. */
const LITERAL_COMMANDS: Readonly<Record<string, string>> = {
  '%': '%', '&': '&', '#': '#', '_': '_', '$': '$', '{': '{', '}': '}',
  textbackslash: '\\',
  textasciitilde: '~',
  textasciicircum: '^',
};

const FONT_SIZES: ReadonlySet<string> = new Set<BeamerFontSize>([
  'tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize',
  'large', 'Large', 'LARGE', 'huge', 'Huge',
]);

const REF_KINDS: ReadonlySet<string> = new Set(['ref', 'pageref', 'nameref', 'eqref']);

/** Citation commands, by the style they stand for. */
const CITE_STYLE: Readonly<Record<string, CiteStyle>> = {
  cite: 'plain',
  citep: 'p',
  citet: 't',
  autocite: 'auto',
  textcite: 'text',
};

export function parseInline(nodes: CstNode[], src: string): RichText {
  const out: RichText = [];
  for (const node of nodes) push(out, convert(node, src));
  return normalizeRichText(out);
}

function groupToInline(g: CstGroup, src: string): RichText {
  return parseInline(g.children, src);
}

/** Flatten the raw text of a group, for arguments that are keys rather than prose. */
function groupToLiteral(g: CstGroup, src: string): string {
  return src.slice(g.span.start + 1, g.span.end - 1);
}

function raw(node: CstNode, src: string): Inline {
  return { t: 'raw', tex: src.slice(node.span.start, node.span.end) };
}

function convert(node: CstNode, src: string): Inline | Inline[] {
  switch (node.n) {
    case 'text':
      return { t: 'text', s: node.value };

    case 'math':
      // Display math inside a paragraph is a block-level construct; the element
      // recognizer handles it. Inline math becomes an inline node.
      return node.display ? raw(node, src) : { t: 'math', tex: node.body };

    case 'comment':
    case 'parbreak':
    case 'error':
    case 'verb':
      return raw(node, src);

    case 'env':
      return raw(node, src);

    case 'group': {
      // `{\small ...}` is a size switch; any other bare group is preserved verbatim
      // because its grouping semantics may matter.
      const first = node.children[0];
      if (first !== undefined && first.n === 'cmd' && FONT_SIZES.has(first.name) &&
          first.args.length === 0 && first.opts.length === 0) {
        const rest = node.children.slice(1);
        return {
          t: 'style',
          style: 'size',
          size: first.name as BeamerFontSize,
          children: dropMacroSpace(parseInline(rest, src)),
        };
      }
      return raw(node, src);
    }

    case 'cmd':
      return convertCommand(node, src);
  }
}

function convertCommand(
  node: Extract<CstNode, { n: 'cmd' }>,
  src: string,
): Inline | Inline[] {
  const { name, args, opts, star } = node;

  if (name === '\\') return { t: 'break' };

  const literal = LITERAL_COMMANDS[name];
  if (literal !== undefined && args.length === 0 && opts.length === 0) {
    return { t: 'text', s: literal };
  }
  // `\textbackslash{}` etc. arrive with one empty argument.
  if (literal !== undefined && args.length === 1 && args[0]!.children.length === 0) {
    return { t: 'text', s: literal };
  }

  const style = SIMPLE_STYLES[name];
  if (style !== undefined && !star && opts.length === 0 && args.length === 1) {
    return { t: 'style', style, children: groupToInline(args[0]!, src) };
  }

  if (name === 'textcolor' && args.length === 2 && opts.length <= 1) {
    const spec = groupToLiteral(args[0]!, src);
    // No model given: keep the expression verbatim, so `blue!20!white` and every
    // named colour re-emit byte-for-byte.
    const color: Color | null = opts.length === 0
      ? { k: 'mix', expr: spec }
      : parseColorModel(groupToLiteral(opts[0]!, src), spec);
    if (color !== null) {
      return {
        t: 'style',
        style: 'color',
        color,
        children: groupToInline(args[1]!, src),
      };
    }
    // An unknown colour model falls through to the raw island below, unchanged.
  }

  if (name === 'href' && args.length === 2) {
    return {
      t: 'link',
      url: groupToLiteral(args[0]!, src),
      children: groupToInline(args[1]!, src),
    };
  }

  const citeStyle = CITE_STYLE[name];
  if (citeStyle !== undefined && args.length === 1 && !star) {
    const keys = groupToLiteral(args[0]!, src).split(',').map((k) => k.trim()).filter(Boolean);
    // Plain `\cite` keeps no style at all, so every deck written before the other
    // commands existed still emits byte-for-byte what it did.
    const style = citeStyle === 'plain' ? {} : { style: citeStyle };
    if (opts.length === 0) return { t: 'cite', keys, ...style };
    if (opts.length === 1) return { t: 'cite', keys, ...style, post: groupToLiteral(opts[0]!, src) };
    if (opts.length === 2) {
      return {
        t: 'cite',
        keys,
        ...style,
        pre: groupToLiteral(opts[0]!, src),
        post: groupToLiteral(opts[1]!, src),
      };
    }
  }

  if (REF_KINDS.has(name) && args.length === 1 && opts.length === 0) {
    return {
      t: 'ref',
      kind: name as 'ref' | 'pageref' | 'nameref' | 'eqref',
      target: groupToLiteral(args[0]!, src),
    };
  }

  // A bare control word with an empty argument group, e.g. `\ldots{}` or `\LaTeX{}`.
  if (opts.length === 0 && args.length <= 1 &&
      (args.length === 0 || args[0]!.children.length === 0) && !star) {
    return { t: 'sym', name };
  }

  return raw(node, src);
}

/**
 * `\textcolor[model]{spec}{...}`, for the one model the document model has.
 *
 * The emitter has always written `\textcolor[rgb]{r,g,b}{...}` for a `{k:'rgb'}`
 * colour and the parser accepted only the zero-option form, so a colour picked from the
 * RGB picker came back as an inert raw island: preserved in the file, no longer
 * editable as a colour, and counted against `health.demoted`. `[HTML]`, `[cmyk]` and
 * `[gray]` are not modelled and still decline, which is the honest answer.
 */
function parseColorModel(model: string, spec: string): Color | null {
  if (model.trim() !== 'rgb') return null;
  const parts = spec.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 3) return null;
  if (parts.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) return null;
  return { k: 'rgb', r: parts[0]!, g: parts[1]!, b: parts[2]! };
}

/**
 * Drop the whitespace that merely terminates a font-size command.
 *
 * TeX skips ALL whitespace after a control word, so the space in `{\large big}` is not
 * content. Keeping it made the round trip grow: the parser put it in the child text and
 * the emitter added its own, so `{\large big}` re-emitted as `{\large  big}`, then
 * three spaces, then four. The guard never caught it because whitespace between tokens
 * is insignificant to the comparison — the source simply got wider on every pass.
 */
function dropMacroSpace(rt: RichText): RichText {
  const first = rt[0];
  if (first === undefined || first.t !== 'text') return rt;
  const trimmed = first.s.replace(/^\s+/, '');
  if (trimmed === first.s) return rt;
  return normalizeRichText([{ t: 'text', s: trimmed }, ...rt.slice(1)]);
}

function push(out: Inline[], v: Inline | Inline[]): void {
  if (Array.isArray(v)) out.push(...v);
  else out.push(v);
}

export { trimRichText };
