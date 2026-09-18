/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

/**
 * Concrete syntax tree for the LaTeX subset we read.
 *
 * Every node carries an exact `SrcSpan` into the original string. That is what makes
 * raw capture byte-exact: a recognizer that declines hands its node's span to
 * `RawElement`, and the original bytes are reproduced with no reconstruction.
 */

import type { SrcSpan } from '../model/types.js';

export interface CstGroup {
  children: CstNode[];
  span: SrcSpan;
}

export type CstNode =
  /** Ordinary text, including whitespace, with no markup. */
  | { n: 'text'; value: string; span: SrcSpan }
  /**
   * A control sequence. `name` excludes the leading backslash. For symbolic control
   * sequences (`\%`, `\\`, `\{`) `name` is the single character.
   */
  | {
      n: 'cmd';
      name: string;
      star: boolean;
      opts: CstGroup[];
      args: CstGroup[];
      span: SrcSpan;
    }
  /** A brace group `{ ... }`. */
  | { n: 'group'; children: CstNode[]; span: SrcSpan }
  /** `\begin{name}...\end{name}`. `bodySpan` covers the content between them. */
  | {
      n: 'env';
      name: string;
      opts: CstGroup[];
      args: CstGroup[];
      children: CstNode[];
      bodySpan: SrcSpan;
      span: SrcSpan;
    }
  /** Verbatim-like content captured opaquely and never tokenized. */
  | { n: 'verb'; name: string; body: string; span: SrcSpan }
  /**
   * Math shift. `body` is verbatim; we never structurally parse math.
   *
   * `env` records the environment name for display math that came from one, so
   * `align` does not round-trip as `equation`. Absent for `$...$` and `\[...\]`.
   */
  | { n: 'math'; display: boolean; body: string; env?: string; span: SrcSpan }
  /** `%` to end of line. `value` excludes the `%`. */
  | { n: 'comment'; value: string; span: SrcSpan }
  /** A blank line (paragraph separator). */
  | { n: 'parbreak'; span: SrcSpan }
  /** Malformed input. Produced instead of throwing, so parsing stays total. */
  | { n: 'error'; message: string; span: SrcSpan };

export interface ParseDiagnostic {
  severity: 'error' | 'warning';
  message: string;
  span: SrcSpan;
}

/**
 * Environments whose bodies must be captured as opaque bytes rather than tokenized.
 * Getting this list wrong is the classic way a LaTeX parser corrupts a document:
 * a `%` or an unbalanced `{` inside a code listing is content, not markup.
 */
export const VERBATIM_ENVIRONMENTS: ReadonlySet<string> = new Set([
  'verbatim', 'verbatim*',
  'Verbatim', 'Verbatim*',
  'lstlisting',
  'minted',
  'semiverbatim',
  'alltt',
  'comment',
  'filecontents', 'filecontents*',
]);

/** Environments that introduce math mode; body captured verbatim. */
export const MATH_ENVIRONMENTS: ReadonlySet<string> = new Set([
  'equation', 'equation*',
  'align', 'align*',
  'gather', 'gather*',
  'multline', 'multline*',
  'displaymath',
  'eqnarray', 'eqnarray*',
]);

export function isVerbatimEnv(name: string): boolean {
  return VERBATIM_ENVIRONMENTS.has(name);
}

export function isMathEnv(name: string): boolean {
  return MATH_ENVIRONMENTS.has(name);
}

/** Recover the exact source text a node came from. */
export function sliceOf(src: string, node: { span: SrcSpan }): string {
  return src.slice(node.span.start, node.span.end);
}

/** Span covering a list of nodes, or `null` when the list is empty. */
export function spanOfAll(nodes: CstNode[]): SrcSpan | null {
  if (nodes.length === 0) return null;
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  return { start: first.span.start, end: last.span.end, line: first.span.line };
}
