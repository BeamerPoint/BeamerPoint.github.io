import type { BeamerFontSize, Inline, RichText } from '../model/types.js';
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
          children: parseInline(rest, src),
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

  if (name === 'textcolor' && args.length === 2 && opts.length === 0) {
    return {
      t: 'style',
      style: 'color',
      color: { k: 'mix', expr: groupToLiteral(args[0]!, src) },
      children: groupToInline(args[1]!, src),
    };
  }

  if (name === 'href' && args.length === 2) {
    return {
      t: 'link',
      url: groupToLiteral(args[0]!, src),
      children: groupToInline(args[1]!, src),
    };
  }

  if (name === 'cite' && args.length === 1) {
    const keys = groupToLiteral(args[0]!, src).split(',').map((k) => k.trim()).filter(Boolean);
    if (opts.length === 0) return { t: 'cite', keys };
    if (opts.length === 1) return { t: 'cite', keys, post: groupToLiteral(opts[0]!, src) };
    if (opts.length === 2) {
      return {
        t: 'cite',
        keys,
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

function push(out: Inline[], v: Inline | Inline[]): void {
  if (Array.isArray(v)) out.push(...v);
  else out.push(v);
}

export { trimRichText };
