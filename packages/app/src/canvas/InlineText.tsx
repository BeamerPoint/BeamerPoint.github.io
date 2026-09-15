import { useMemo } from 'react';
import katex from 'katex';
import type { Inline, RichText } from '@beamerpoint/core';

/**
 * Render rich text on the canvas.
 *
 * Raw islands are shown as inert chips rather than being hidden: the user can see
 * that something LaTeX-y lives there, and that BeamerPoint is preserving rather than
 * understanding it.
 */
export function InlineText({ content }: { content: RichText }): React.ReactElement {
  return <>{content.map((node, i) => <InlineNode key={i} node={node} />)}</>;
}

function InlineNode({ node }: { node: Inline }): React.ReactElement {
  switch (node.t) {
    case 'text':
      return <>{node.s}</>;

    case 'break':
      return <br />;

    case 'math':
      return <MathView tex={node.tex} display={false} />;

    case 'sym':
      return <span className="bp-sym">{symbolFor(node.name)}</span>;

    case 'ref':
      return <span className="bp-ref">[{node.target}]</span>;

    case 'cite':
      return <span className="bp-cite">[{node.keys.join(', ')}]</span>;

    case 'link':
      return (
        <span className="bp-link">
          <InlineText content={node.children} />
        </span>
      );

    case 'raw':
      return (
        <span className="bp-raw-inline" title={`Preserved LaTeX: ${node.tex}`}>
          {node.tex}
        </span>
      );

    case 'style': {
      const inner = <InlineText content={node.children} />;
      switch (node.style) {
        case 'bf': return <strong>{inner}</strong>;
        case 'it': return <em>{inner}</em>;
        case 'emph': return <em>{inner}</em>;
        case 'ul': return <u>{inner}</u>;
        case 'tt': return <code className="bp-tt">{inner}</code>;
        case 'sc': return <span style={{ fontVariant: 'small-caps' }}>{inner}</span>;
        case 'alert': return <span className="bp-alert">{inner}</span>;
        case 'structure': return <span className="bp-structure">{inner}</span>;
        case 'color':
          return (
            <span style={{ color: cssColor(node.color) }}>{inner}</span>
          );
        case 'size':
          return <span className={`bp-size-${node.size ?? 'normalsize'}`}>{inner}</span>;
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

function cssColor(c: { k: string; name?: string; expr?: string } | undefined): string {
  if (c === undefined) return 'inherit';
  if (c.k === 'named' && c.name !== undefined) return c.name;
  if (c.k === 'mix' && c.expr !== undefined) {
    // `blue!20!white` and friends: take the base colour as a rough approximation.
    const base = c.expr.split('!')[0]!;
    return base;
  }
  return 'inherit';
}

const SYMBOLS: Readonly<Record<string, string>> = {
  ldots: '…', dots: '…', textellipsis: '…',
  LaTeX: 'LaTeX', TeX: 'TeX',
  today: new Date().toLocaleDateString(undefined, { dateStyle: 'long' }),
  quad: ' ', qquad: '  ',
};

function symbolFor(name: string): string {
  return SYMBOLS[name] ?? `\\${name}`;
}
