import { normalizeRichText } from './richtext.js';
import type { BeamerFontSize, Color, Inline, InlineStyle, RichText } from './types.js';

/**
 * Applying and removing an inline style over a range of characters.
 *
 * Pure, in `core`, and tested here for the same reason `tableOps` and `chartOps` are:
 * splitting runs at a boundary and merging them back afterwards is index arithmetic,
 * and index arithmetic that is wrong does not crash — it formats the wrong words.
 *
 * ## What a character is
 *
 * Offsets are measured the way the canvas measures them: a text node contributes
 * `s.length`, an ATOMIC node (math, a citation, a reference, a symbol, a raw island, a
 * line break) contributes exactly one, and a wrapper contributes the sum of its
 * children. An atomic node is `contentEditable={false}` on the canvas, so a caret can
 * never sit inside one and the two sides cannot disagree.
 *
 * ## What may be styled
 *
 * Text, math, symbols, citations and references may all carry a style — `\textbf{$x$}`
 * is ordinary LaTeX. A raw island and a line break may NOT: a raw island is preserved
 * verbatim and may be block-level (`\vspace{2mm}` arrives as one), and wrapping it
 * would change what it means. A range spanning a raw island therefore produces two
 * wrappers around it rather than one across it.
 */

/** A half-open character range, `[from, to)`. */
export interface CharRange {
  from: number;
  to: number;
}

/** What to apply. `color` and `size` are only read for their own styles. */
export interface StyleSpec {
  style: InlineStyle;
  color?: Color;
  size?: BeamerFontSize;
}

/** What the controls show as active over a range. */
export interface InlineMarks {
  styles: InlineStyle[];
  color?: Color;
  size?: BeamerFontSize;
}

export function inlineLength(node: Inline): number {
  if (node.t === 'text') return node.s.length;
  if (node.t === 'style' || node.t === 'link') return richTextLength(node.children);
  return 1;
}

export function richTextLength(rt: RichText): number {
  let n = 0;
  for (const node of rt) n += inlineLength(node);
  return n;
}

/* ------------------------------------------------------------------- atoms */

type Mark =
  | { kind: 'style'; style: InlineStyle; color?: Color; size?: BeamerFontSize }
  | { kind: 'link'; url: string };

/** One character, or one whole atomic node, with the wrappers it sits inside. */
interface Atom {
  leaf: Inline;
  marks: Mark[];
}

/**
 * How deeply each wrapper nests, outermost first.
 *
 * Without a fixed order, applying a colour to "a" and to a bold "b" put the colour
 * innermost on one and outermost on the other, so the two had no common wrapper and the
 * result was `\textcolor{red}{a}\textbf{\textcolor{red}{b}}` — correct LaTeX, twice
 * the source, and it could not be merged or toggled back off as one run. Marks inside
 * the range being edited are sorted into this order so that neighbours nest compatibly.
 * All of these commands commute, so the reordering changes nothing about the output.
 */
const MARK_RANK: Readonly<Record<string, number>> = {
  link: 0,
  color: 1,
  size: 2,
  structure: 3,
  alert: 4,
  emph: 5,
  bf: 6,
  it: 7,
  ul: 8,
  tt: 9,
  sc: 10,
};

function markRank(m: Mark): number {
  return m.kind === 'link' ? MARK_RANK.link! : MARK_RANK[m.style] ?? 50;
}

/** Sort stably by nesting rank, leaving anything unranked in the order it arrived. */
function inNestingOrder(marks: Mark[]): Mark[] {
  return marks
    .map((m, i) => ({ m, i }))
    .sort((a, b) => markRank(a.m) - markRank(b.m) || a.i - b.i)
    .map((e) => e.m);
}

/** Stable identity for a mark, so rebuilding can tell "same wrapper" from "new one". */
function markKey(m: Mark): string {
  if (m.kind === 'link') return `link|${m.url}`;
  return `style|${m.style}|${JSON.stringify(m.color ?? null)}|${m.size ?? ''}`;
}

/** Marks a raw island or a break must not receive. */
function isMarkable(leaf: Inline): boolean {
  return leaf.t !== 'raw' && leaf.t !== 'break';
}

function flatten(rt: RichText, marks: Mark[], out: Atom[]): void {
  for (const node of rt) {
    if (node.t === 'text') {
      for (const ch of node.s) out.push({ leaf: { t: 'text', s: ch }, marks });
      continue;
    }
    if (node.t === 'style') {
      const mark: Mark = {
        kind: 'style',
        style: node.style,
        ...(node.color !== undefined ? { color: node.color } : {}),
        ...(node.size !== undefined ? { size: node.size } : {}),
      };
      flatten(node.children, [...marks, mark], out);
      continue;
    }
    if (node.t === 'link') {
      flatten(node.children, [...marks, { kind: 'link', url: node.url }], out);
      continue;
    }
    // Atomic: carried BY REFERENCE, which is what keeps a raw island byte-exact.
    out.push({ leaf: node, marks });
  }
}

/**
 * Rebuild rich text from atoms, reopening a wrapper only where it actually changes.
 *
 * Merging adjacent identical runs falls out of this: if two neighbours share a mark,
 * the common prefix never breaks and the wrapper is never closed.
 */
function rebuild(atoms: readonly Atom[]): RichText {
  const root: RichText = [];
  // The wrapper stack: each level knows its key and the children array to append to.
  let open: { key: string; children: RichText }[] = [];

  for (const atom of atoms) {
    const keys = atom.marks.map(markKey);
    let shared = 0;
    while (shared < open.length && shared < keys.length && open[shared]!.key === keys[shared]) {
      shared += 1;
    }
    open = open.slice(0, shared);

    for (let i = shared; i < atom.marks.length; i++) {
      const mark = atom.marks[i]!;
      const children: RichText = [];
      const node: Inline = mark.kind === 'link'
        ? { t: 'link', url: mark.url, children }
        : {
            t: 'style',
            style: mark.style,
            ...(mark.color !== undefined ? { color: mark.color } : {}),
            ...(mark.size !== undefined ? { size: mark.size } : {}),
            children,
          };
      (open[i - 1]?.children ?? root).push(node);
      open.push({ key: keys[i]!, children });
    }

    (open[atom.marks.length - 1]?.children ?? root).push(atom.leaf);
  }

  return tidy(root);
}

/** Coalesce the per-character text back into runs, bottom-up, and drop empty wrappers. */
function tidy(rt: RichText): RichText {
  const mapped = rt.map((node): Inline => {
    if (node.t === 'style') return { ...node, children: tidy(node.children) };
    if (node.t === 'link') return { ...node, children: tidy(node.children) };
    return node;
  });
  return normalizeRichText(mapped).filter(
    (n) => !((n.t === 'style' || n.t === 'link') && n.children.length === 0),
  );
}

/* --------------------------------------------------------------- operations */

function clampRange(rt: RichText, range: CharRange): CharRange {
  const len = richTextLength(rt);
  const a = Math.max(0, Math.min(len, Math.min(range.from, range.to)));
  const b = Math.max(0, Math.min(len, Math.max(range.from, range.to)));
  return { from: a, to: b };
}

function withMark(marks: Mark[], spec: StyleSpec): Mark[] {
  const at = marks.findIndex((m) => m.kind === 'style' && m.style === spec.style);
  if (at === -1) {
    return inNestingOrder([...marks, {
      kind: 'style',
      style: spec.style,
      ...(spec.color !== undefined ? { color: spec.color } : {}),
      ...(spec.size !== undefined ? { size: spec.size } : {}),
    }]);
  }
  // A colour inside a colour is meaningless, so setting one REPLACES it. A boolean
  // style is left alone rather than emitting `\textbf{\textbf{x}}`.
  if (spec.style !== 'color' && spec.style !== 'size') return inNestingOrder(marks);
  const next = [...marks];
  next[at] = {
    kind: 'style',
    style: spec.style,
    ...(spec.color !== undefined ? { color: spec.color } : {}),
    ...(spec.size !== undefined ? { size: spec.size } : {}),
  };
  return inNestingOrder(next);
}

function mapRange(
  rt: RichText,
  range: CharRange,
  fn: (marks: Mark[]) => Mark[],
): RichText {
  const { from, to } = clampRange(rt, range);
  if (from === to) return rt;

  const atoms: Atom[] = [];
  flatten(rt, [], atoms);

  let at = 0;
  const next = atoms.map((atom) => {
    const start = at;
    at += 1; // one atom is one character, by construction
    if (start < from || start >= to || !isMarkable(atom.leaf)) return atom;
    return { leaf: atom.leaf, marks: fn(atom.marks) };
  });

  return rebuild(next);
}

/**
 * Apply a style over a range.
 *
 * A zero-length range returns the input unchanged: a pending format at the caret,
 * Word-style, is deliberately not modelled — the caller disables the control instead.
 */
export function applyInlineStyle(
  rt: RichText, range: CharRange, spec: StyleSpec,
): RichText {
  return mapRange(rt, range, (marks) => withMark(marks, spec));
}

export function removeInlineStyle(
  rt: RichText, range: CharRange, style: InlineStyle,
): RichText {
  return mapRange(rt, range, (marks) =>
    inNestingOrder(marks.filter((m) => !(m.kind === 'style' && m.style === style))));
}

/** True when every markable character in the range already carries `style`. */
export function hasInlineStyle(
  rt: RichText, range: CharRange, style: InlineStyle,
): boolean {
  const { from, to } = clampRange(rt, range);
  if (from === to) return false;

  const atoms: Atom[] = [];
  flatten(rt, [], atoms);
  let seen = false;
  for (let i = from; i < to; i++) {
    const atom = atoms[i];
    if (atom === undefined || !isMarkable(atom.leaf)) continue;
    seen = true;
    if (!atom.marks.some((m) => m.kind === 'style' && m.style === style)) return false;
  }
  return seen;
}

/**
 * Toggle, with the semantics every editor has: a fully styled range loses the style,
 * a partly styled one gains it throughout.
 *
 * `color` and `size` are SET rather than toggled — "no colour" is `removeInlineStyle`.
 */
export function toggleInlineStyle(
  rt: RichText, range: CharRange, spec: StyleSpec,
): RichText {
  if (spec.style === 'color' || spec.style === 'size') {
    return applyInlineStyle(rt, range, spec);
  }
  return hasInlineStyle(rt, range, spec.style)
    ? removeInlineStyle(rt, range, spec.style)
    : applyInlineStyle(rt, range, spec);
}

/**
 * The styles shared by the whole range, for drawing the controls' active state.
 *
 * Only what EVERY markable character carries: a range half of which is bold is not
 * bold, the same rule `toggleInlineStyle` decides by.
 */
export function inlineMarksIn(rt: RichText, range: CharRange): InlineMarks {
  const { from, to } = clampRange(rt, range);
  const atoms: Atom[] = [];
  flatten(rt, [], atoms);

  let common: Mark[] | null = null;
  for (let i = from; i < Math.max(to, from + 1); i++) {
    const atom = atoms[i];
    if (atom === undefined || !isMarkable(atom.leaf)) continue;
    const here = atom.marks.filter((m) => m.kind === 'style');
    if (common === null) { common = here; continue; }
    const keys = new Set(here.map(markKey));
    common = common.filter((m) => keys.has(markKey(m)));
  }

  const marks = common ?? [];
  const colour = marks.find((m) => m.kind === 'style' && m.style === 'color');
  const size = marks.find((m) => m.kind === 'style' && m.style === 'size');
  return {
    styles: marks.flatMap((m) => (m.kind === 'style' ? [m.style] : [])),
    ...(colour?.kind === 'style' && colour.color !== undefined ? { color: colour.color } : {}),
    ...(size?.kind === 'style' && size.size !== undefined ? { size: size.size } : {}),
  };
}

/**
 * True when a colour survives the round trip as a colour.
 *
 * Every modelled form does now that the parser accepts `\textcolor[rgb]{...}`, but the
 * predicate stays as the one place a picker and the operation agree on the question —
 * adding an unparseable colour model would otherwise show up as an inert raw chip
 * rather than as a failing check.
 */
export function isRoundTrippableColor(c: Color): boolean {
  switch (c.k) {
    case 'named':
    case 'mix':
    case 'structure':
      return true;
    case 'rgb':
      return [c.r, c.g, c.b].every((n) => Number.isFinite(n) && n >= 0 && n <= 1);
  }
}
