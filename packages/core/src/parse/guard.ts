import type { Deck, DocNode, Element, FrameNode, Id, RawElement } from '../model/types.js';
import { emitElement, type EmitContext } from '../emit/elements.js';
import { emitFrameStandalone } from '../emit/deck.js';
import { TexWriter } from '../emit/writer.js';
import type { CstGroup, CstNode } from './cst.js';
import { buildCst } from './lexer.js';

/**
 * The round-trip guard.
 *
 * After parsing, every element is re-emitted and compared against the source bytes it
 * came from. A mismatch means the recognizer lost or altered something, and that
 * element is demoted to a byte-exact raw block.
 *
 * This is what makes "the parser silently ate a macro" unreachable: it becomes a
 * visible raw block with a stated reason instead of missing content.
 */

export interface GuardMismatch {
  nodeId: Id;
  kind: string;
  expected: string;
  actual: string;
}

export interface GuardReport {
  ok: boolean;
  mismatches: GuardMismatch[];
  /** Elements demoted to raw by the guard. */
  demoted: number;
}

/* ------------------------------------------------------------------ tokens */

/**
 * Reduce LaTeX to a stream of significant tokens.
 *
 * Whitespace and blank-line structure are insignificant — the emitter is free to
 * reindent. Verbatim bodies, math bodies and comments are compared byte-for-byte,
 * because there a difference is a real difference.
 */
export function significantTokens(src: string): string[] {
  const { root } = buildCst(src);
  const out: string[] = [];
  flatten(root, src, out);
  return out;
}

function flatten(nodes: CstNode[], src: string, out: string[]): void {
  for (const node of nodes) flattenOne(node, src, out);
}

function flattenGroups(
  groups: CstGroup[],
  open: string,
  close: string,
  src: string,
  out: string[],
): void {
  for (const g of groups) {
    // An empty group is not significant: `\ldots{}` and `\ldots` are the same document.
    if (g.children.length === 0) continue;
    out.push(open);
    flatten(g.children, src, out);
    out.push(close);
  }
}

function flattenOne(node: CstNode, src: string, out: string[]): void {
  switch (node.n) {
    case 'text': {
      for (const word of node.value.split(/\s+/)) {
        if (word !== '') out.push(word);
      }
      return;
    }
    case 'parbreak':
      // Paragraph structure is whitespace; the emitter may reflow it.
      return;
    case 'comment':
      out.push('%' + node.value.trimEnd());
      return;
    case 'verb':
      out.push(`verb:${node.name}:${node.body}`);
      return;
    case 'math':
      out.push(`math:${node.display ? 'd' : 'i'}:${node.body.trim()}`);
      return;
    case 'error':
      out.push(`err:${src.slice(node.span.start, node.span.end)}`);
      return;
    case 'group':
      if (node.children.length === 0) return;
      out.push('{');
      flatten(node.children, src, out);
      out.push('}');
      return;
    case 'cmd':
      out.push('\\' + node.name + (node.star ? '*' : ''));
      flattenGroups(node.opts, '[', ']', src, out);
      flattenGroups(node.args, '{', '}', src, out);
      return;
    case 'env':
      out.push(`\\begin{${node.name}}`);
      flattenGroups(node.opts, '[', ']', src, out);
      flattenGroups(node.args, '{', '}', src, out);
      flatten(node.children, src, out);
      out.push(`\\end{${node.name}}`);
      return;
  }
}

export function tokensEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* ------------------------------------------------------------- verification */

function emitElementToString(el: Element): string {
  const w = new TexWriter({ collectSourceMap: false });
  const ctx: EmitContext = { warn: () => undefined };
  emitElement(w, el, ctx);
  return w.finish().tex;
}

/**
 * Check one element against the source it was parsed from.
 *
 * Returns `null` when it round-trips, or the source bytes when it does not.
 */
function checkElement(el: Element, source: string): string | null {
  if (el.src === undefined) return null;
  const original = source.slice(el.src.start, el.src.end);
  const expected = significantTokens(original);
  const actual = significantTokens(emitElementToString(el));
  return tokensEqual(expected, actual) ? null : original;
}

function demote(el: Element, tex: string): RawElement {
  return {
    id: el.id,
    kind: 'raw',
    placement: el.placement,
    ...(el.leadingComments !== undefined ? { leadingComments: el.leadingComments } : {}),
    ...(el.src !== undefined ? { src: el.src } : {}),
    tex,
    reason: 'guard-mismatch',
    label: `\\${el.kind}`,
  };
}

/**
 * Walk a frame's elements, demoting any that fail to round-trip.
 *
 * Containers are recursed into first, so the DEEPEST mismatching element is demoted
 * rather than the whole container — losing the least structure possible.
 */
function guardElements(
  els: Element[],
  source: string,
  mismatches: GuardMismatch[],
): { elements: Element[]; demoted: number } {
  let demoted = 0;
  const out: Element[] = els.map((el) => {
    // Recurse into containers first.
    if (el.kind === 'block') {
      const r = guardElements(el.children, source, mismatches);
      demoted += r.demoted;
      el = { ...el, children: r.elements };
    } else if (el.kind === 'columns') {
      const cols = el.columns.map((c) => {
        const r = guardElements(c.children, source, mismatches);
        demoted += r.demoted;
        return { ...c, children: r.elements };
      });
      el = { ...el, columns: cols };
    }

    if (el.kind === 'raw') return el;

    const failed = checkElement(el, source);
    if (failed === null) return el;

    mismatches.push({
      nodeId: el.id,
      kind: el.kind,
      expected: failed.slice(0, 200),
      actual: emitElementToString(el).slice(0, 200),
    });
    demoted += 1;
    return demote(el, failed);
  });

  return { elements: out, demoted };
}

/**
 * Verify a parsed deck against its source and degrade whatever does not round-trip.
 *
 * Frames are handled independently, so a mismatch is always localised: one bad frame
 * cannot degrade the rest of the document.
 */
export function guardDeck(deck: Deck, source: string): { deck: Deck; report: GuardReport } {
  const mismatches: GuardMismatch[] = [];
  let demoted = 0;

  const nodes: DocNode[] = deck.nodes.map((node) => {
    if (node.kind !== 'frame') return node;

    const r = guardElements(node.children, source, mismatches);
    demoted += r.demoted;
    const frame: FrameNode = { ...node, children: r.elements };

    // Frame chrome (title, options) may itself have failed to round-trip. If the
    // whole frame still does not match after element repair, keep the entire frame
    // verbatim rather than shipping a frame that renders differently.
    if (frame.src !== undefined) {
      const original = source.slice(frame.src.start, frame.src.end);
      const expected = significantTokens(original);
      const actual = significantTokens(emitFrameStandalone(frame));
      if (!tokensEqual(expected, actual)) {
        mismatches.push({
          nodeId: frame.id,
          kind: 'frame',
          expected: original.slice(0, 200),
          actual: emitFrameStandalone(frame).slice(0, 200),
        });
        demoted += 1;
        return {
          kind: 'rawdoc',
          id: frame.id,
          tex: original,
          reason: 'guard-mismatch',
          src: frame.src,
        };
      }
    }

    return frame;
  });

  return {
    deck: { ...deck, nodes },
    report: { ok: mismatches.length === 0, mismatches, demoted },
  };
}
