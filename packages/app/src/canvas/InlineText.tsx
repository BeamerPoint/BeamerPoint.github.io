/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { useMemo } from 'react';
import katex from 'katex';
import type { Color, Inline, RichText } from '@beamerpoint/core';
import { INLINE_INDEX_ATTR, isAtomicInline } from './domInline.js';

/**
 * Render rich text on the canvas.
 *
 * Every node carries its index as a data attribute so `readInlineFromDom` can map the
 * edited DOM back onto the model. Nodes that render as something other than their own
 * source — math, symbols, citations, preserved raw LaTeX — are additionally marked
 * non-editable, so a caret cannot get inside and corrupt them.
 */
export function InlineText({ content }: { content: RichText }): React.ReactElement {
  return (
    <>
      {content.map((node, i) => (
        <InlineNode key={i} node={node} index={i} />
      ))}
    </>
  );
}

function InlineNode({ node, index }: { node: Inline; index: number }): React.ReactElement {
  // Spread onto every rendered node: the index the reader resolves against, and
  // atomicity so the browser treats the node as one object.
  const tag = {
    [INLINE_INDEX_ATTR]: index,
    ...(isAtomicInline(node) ? { contentEditable: false } : {}),
  } as Record<string, unknown>;

  switch (node.t) {
    case 'text':
      // Bare text needs no wrapper: a DOM text node maps back to itself.
      return <>{node.s}</>;

    case 'break':
      return <br {...tag} />;

    case 'math':
      return (
        <span {...tag}>
          <MathView tex={node.tex} display={false} />
        </span>
      );

    case 'sym':
      return <span {...tag} className="bp-sym">{symbolFor(node.name)}</span>;

    case 'ref':
      return <span {...tag} className="bp-ref">[{node.target}]</span>;

    case 'cite':
      return <span {...tag} className="bp-cite">[{node.keys.join(', ')}]</span>;

    case 'raw':
      return (
        <span {...tag} className="bp-raw-inline" title={`Preserved LaTeX: ${node.tex}`}>
          {node.tex}
        </span>
      );

    case 'link':
      return (
        <span {...tag} className="bp-link">
          <InlineText content={node.children} />
        </span>
      );

    case 'style': {
      const inner = <InlineText content={node.children} />;
      switch (node.style) {
        case 'bf': return <strong {...tag}>{inner}</strong>;
        case 'it': return <em {...tag}>{inner}</em>;
        case 'emph': return <em {...tag}>{inner}</em>;
        case 'ul': return <u {...tag}>{inner}</u>;
        case 'tt': return <code {...tag} className="bp-tt">{inner}</code>;
        case 'sc': return <span {...tag} style={{ fontVariant: 'small-caps' }}>{inner}</span>;
        case 'alert': return <span {...tag} className="bp-alert">{inner}</span>;
        case 'structure': return <span {...tag} className="bp-structure">{inner}</span>;
        case 'color':
          return <span {...tag} style={{ color: cssColor(node.color) }}>{inner}</span>;
        case 'size':
          return (
            <span {...tag} className={`bp-size-${node.size ?? 'normalsize'}`}>{inner}</span>
          );
      }
    }
  }
}

export function MathView({ tex, display }: { tex: string; display: boolean }): React.ReactElement {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: false });
    } catch {
      return null;
    }
  }, [tex, display]);

  if (html === null) {
    return <span className="bp-math-error" title="Could not render">{`$${tex}$`}</span>;
  }
  return (
    <span
      className={display ? 'bp-math-display' : 'bp-math-inline'}
      // KaTeX output is generated from the document's own LaTeX, not third-party HTML.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function cssColor(c: Color | undefined): string {
  if (c === undefined) return 'inherit';
  if (c.k === 'named') return c.name;
  // `blue!20!white` and friends: the base colour is a rough but useful approximation.
  if (c.k === 'mix') return c.expr.split('!')[0] ?? 'inherit';
  if (c.k === 'rgb') {
    const to255 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
    return `rgb(${to255(c.r)}, ${to255(c.g)}, ${to255(c.b)})`;
  }
  return 'inherit';
}

const SYMBOLS: Readonly<Record<string, string>> = {
  ldots: '…', dots: '…', textellipsis: '…',
  LaTeX: 'LaTeX', TeX: 'TeX',
  quad: ' ', qquad: '  ',
  today: new Date().toLocaleDateString(undefined, { dateStyle: 'long' }),
};

function symbolFor(name: string): string {
  return SYMBOLS[name] ?? `\\${name}`;
}
