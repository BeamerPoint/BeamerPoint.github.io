/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import fc from 'fast-check';
import { newDeck, newFrame } from '../../src/model/factory.js';
import { LST_LANGUAGES } from '../../src/emit/lstLanguages.js';
import type {
  Deck, DocNode, Element, Inline, InlineStyle, ListItem, Placement, RichText, TikzShape,
} from '../../src/model/types.js';

/**
 * Random decks for the round-trip property.
 *
 * The generators produce ID-FREE descriptors -- plain JSON -- and `buildDeck` gives them
 * ids from a seeded counter. Two payoffs: a counterexample reproduces exactly on every
 * shrink step, and fast-check prints it as JSON that can be pasted verbatim into a
 * regression test.
 *
 * What is generated is what the APP can make: every constraint below is a rule the
 * editor enforces, not a convenience. A deck the UI cannot produce is an example test,
 * not a property.
 */

/* ------------------------------------------------------------------- text */

// Includes every character `escapeText` has to handle. Spaces are single and the ends
// are trimmed: TeX collapses runs of spaces, so "a  b" is not a value LaTeX can hold.
const WORD_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const SPECIALS = ['%', '&', '_', '#', '$', '{', '}', '~', '^', '\\'];

const word = fc.array(fc.constantFrom(...WORD_CHARS, ...SPECIALS), { minLength: 1, maxLength: 8 })
  .map((cs) => cs.join(''));
export const plainText = fc.array(word, { minLength: 1, maxLength: 5 }).map((ws) => ws.join(' '));

const STYLES: InlineStyle[] = ['bf', 'it', 'ul', 'tt', 'sc', 'emph', 'alert'];

const inlineRun: fc.Arbitrary<Inline> = fc.oneof(
  { weight: 4, arbitrary: plainText.map((s): Inline => ({ t: 'text', s })) },
  { weight: 2, arbitrary: fc.tuple(fc.constantFrom(...STYLES), plainText)
    .map(([style, s]): Inline => ({ t: 'style', style, children: [{ t: 'text', s }] })) },
  { weight: 1, arbitrary: fc.constantFrom('x^2', '\\alpha + \\beta', 'a_{ij}', '\\frac{1}{2}')
    .map((tex): Inline => ({ t: 'math', tex })) },
);

/** Runs separated by a space, so two text runs never fuse into one on the way back. */
export const richText: fc.Arbitrary<RichText> = fc.array(inlineRun, { minLength: 1, maxLength: 3 })
  .map((runs) => runs.flatMap((r, i): Inline[] => (i === 0 ? [r] : [{ t: 'text', s: ' ' }, r])));

/* --------------------------------------------------------------- elements */

export type ElementSpec =
  | { k: 'text'; rt: RichText; abs?: AbsSpec }
  | { k: 'list'; type: 'itemize' | 'enumerate'; items: Array<{ rt: RichText; overlay?: string; sub?: RichText[] }> }
  | { k: 'block'; variant: 'block' | 'alertblock' | 'exampleblock'; title: RichText; body: RichText }
  | { k: 'columns'; left: RichText; right: RichText }
  | { k: 'math'; env: 'equation' | 'equation*' | 'align' | 'align*' | 'gather' | 'gather*'; body: string }
  | { k: 'code'; language: string; code: string }
  | { k: 'table'; rows: number; cols: number; cells: string[]; merge?: boolean }
  | { k: 'tikz'; shapes: ShapeSpec[] }
  | { k: 'pause' }
  | { k: 'chart'; type: 'line' | 'bar' | 'hbar' | 'scatter'; rows: number[][]; logY: boolean }
  | { k: 'image'; width: number; align?: 'left' | 'center' | 'right'; caption?: RichText;
      opacity?: number; rotate?: number; trim?: [number, number, number, number] }
  | { k: 'toc' }
  | { k: 'bibliography'; size?: 'footnotesize' | 'small' | 'scriptsize'; style?: string };

interface AbsSpec { x: number; y: number; w: number; rotate?: number }
type ShapeSpec =
  | { t: 'rect'; x: number; y: number; w: number; h: number }
  | { t: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { t: 'line'; pts: Array<[number, number]> };

/** Millimetres to one decimal, which is the precision the emitter writes. */
const mm = (lo: number, hi: number): fc.Arbitrary<number> =>
  fc.integer({ min: lo * 10, max: hi * 10 }).map((n) => n / 10);

const absSpec: fc.Arbitrary<AbsSpec> = fc.record({
  x: mm(0, 120), y: mm(0, 70), w: mm(10, 100),
  rotate: fc.option(fc.integer({ min: -180, max: 180 }).filter((d) => d !== 0), { nil: undefined }),
}, { requiredKeys: ['x', 'y', 'w'] });

const MATH_BODIES = ['  E = mc^2', '  a &= b \\\\\n  c &= d', '  \\sum_{i=1}^n i = \\frac{n(n+1)}{2}'];
const CODE_BODIES = ['x = 1', 'def f(a):\n    return a', 'if (x) {\n  y();\n}'];

const shapeSpec: fc.Arbitrary<ShapeSpec> = fc.oneof(
  fc.record({ t: fc.constant('rect' as const), x: mm(0, 80), y: mm(0, 30), w: mm(2, 30), h: mm(2, 20) }),
  fc.record({ t: fc.constant('ellipse' as const), cx: mm(10, 90), cy: mm(10, 40), rx: mm(2, 15), ry: mm(2, 10) }),
  fc.record({ t: fc.constant('line' as const), pts: fc.array(fc.tuple(mm(0, 100), mm(0, 50)), { minLength: 2, maxLength: 4 }) }),
);

export const elementSpec: fc.Arbitrary<ElementSpec> = fc.oneof(
  fc.record({ k: fc.constant('text' as const), rt: richText, abs: fc.option(absSpec, { nil: undefined }) }, { requiredKeys: ['k', 'rt'] }),
  fc.record({
    k: fc.constant('list' as const),
    type: fc.constantFrom('itemize' as const, 'enumerate' as const),
    items: fc.array(fc.record({
      rt: richText,
      overlay: fc.option(fc.constantFrom('<1->', '<2->', '<2>', '<1,3>', '<+->'), { nil: undefined }),
      sub: fc.option(fc.array(richText, { minLength: 1, maxLength: 2 }), { nil: undefined }),
    }, { requiredKeys: ['rt'] }), { minLength: 1, maxLength: 4 }),
  }),
  fc.record({ k: fc.constant('block' as const), variant: fc.constantFrom('block' as const, 'alertblock' as const, 'exampleblock' as const), title: richText, body: richText }),
  fc.record({ k: fc.constant('columns' as const), left: richText, right: richText }),
  fc.record({ k: fc.constant('math' as const), env: fc.constantFrom('equation' as const, 'equation*' as const, 'align' as const, 'align*' as const, 'gather' as const, 'gather*' as const), body: fc.constantFrom(...MATH_BODIES) }),
  fc.record({ k: fc.constant('code' as const), language: fc.constantFrom(...LST_LANGUAGES), code: fc.constantFrom(...CODE_BODIES) }),
  fc.integer({ min: 1, max: 4 }).chain((rows) => fc.integer({ min: 1, max: 4 }).chain((cols) =>
    fc.array(word, { minLength: rows * cols, maxLength: rows * cols })
      .chain((cells) => fc.boolean().map((merge): ElementSpec => ({
        k: 'table', rows, cols, cells, ...(merge && cols >= 2 ? { merge: true } : {}),
      }))))),
  fc.record({ k: fc.constant('tikz' as const), shapes: fc.array(shapeSpec, { minLength: 1, maxLength: 4 }) }),
  fc.constant({ k: 'pause' as const }),
  fc.record({
    k: fc.constant('chart' as const),
    type: fc.constantFrom('line' as const, 'bar' as const, 'hbar' as const, 'scatter' as const),
    rows: fc.array(fc.tuple(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 99 }), fc.integer({ min: 1, max: 99 }))
      .map((t) => [...t]), { minLength: 2, maxLength: 5 }),
    logY: fc.boolean(),
  }),
  fc.record({
    k: fc.constant('image' as const),
    width: fc.integer({ min: 10, max: 100 }).map((n) => n / 100),
    align: fc.option(fc.constantFrom('left' as const, 'center' as const, 'right' as const), { nil: undefined }),
    caption: fc.option(richText, { nil: undefined }),
    opacity: fc.option(fc.integer({ min: 1, max: 9 }).map((n) => n / 10), { nil: undefined }),
    rotate: fc.option(fc.integer({ min: -180, max: 180 }).filter((d) => d !== 0), { nil: undefined }),
    trim: fc.option(fc.tuple(fc.nat(20), fc.nat(20), fc.nat(20), fc.nat(20)), { nil: undefined }),
  }, { requiredKeys: ['k', 'width'] }),
  fc.constant({ k: 'toc' as const }),
  // With a size and a style too, now that F-007 reads the three lines back as one element.
  fc.record({
    k: fc.constant('bibliography' as const),
    size: fc.option(fc.constantFrom('footnotesize', 'small', 'scriptsize'), { nil: undefined }),
    style: fc.option(fc.constantFrom('plain', 'alpha', 'unsrt'), { nil: undefined }),
  }, { requiredKeys: ['k'] }),
);

export interface FrameSpec {
  title: string;
  els: ElementSpec[];
  plain?: boolean;
  vAlign?: 't' | 'c' | 'b';
  noNumber?: boolean;
  breaks?: boolean;
  note?: string;
  /** A section heading placed before this frame. */
  section?: { level: 'section' | 'subsection'; title: string };
}
export interface DeckSpec { title: string; frames: FrameSpec[] }

export const deckSpec: fc.Arbitrary<DeckSpec> = fc.record({
  title: plainText,
  frames: fc.array(fc.record({
    title: plainText,
    els: fc.array(elementSpec, { minLength: 1, maxLength: 4 }),
    plain: fc.option(fc.boolean(), { nil: undefined }),
    vAlign: fc.option(fc.constantFrom('t' as const, 'c' as const, 'b' as const), { nil: undefined }),
    noNumber: fc.option(fc.boolean(), { nil: undefined }),
    breaks: fc.option(fc.boolean(), { nil: undefined }),
    note: fc.option(plainText, { nil: undefined }),
    section: fc.option(fc.record({ level: fc.constantFrom('section' as const, 'subsection' as const), title: plainText }), { nil: undefined }),
  }, { requiredKeys: ['title', 'els'] }), { minLength: 1, maxLength: 3 }),
});

export const IMAGE_ID = 'img-resource';

/* ------------------------------------------------------------------ build */

export function buildDeck(spec: DeckSpec, id: () => string): Deck {
  const P: Placement = { mode: 'flow' };
  const text = (rt: RichText, placement: Placement = P): Element =>
    ({ id: id(), kind: 'text', placement, content: rt });

  const shape = (s: ShapeSpec): TikzShape => {
    if (s.t === 'rect') return { id: id(), t: 'rect', x: s.x, y: s.y, w: s.w, h: s.h, style: {} };
    if (s.t === 'ellipse') return { id: id(), t: 'ellipse', cx: s.cx, cy: s.cy, rx: s.rx, ry: s.ry, style: {} };
    return { id: id(), t: 'path', points: s.pts, closed: false, smooth: false, style: {} };
  };

  const element = (s: ElementSpec): Element => {
    switch (s.k) {
      case 'text':
        return text(s.rt, s.abs === undefined ? P : {
          mode: 'absolute', x: s.abs.x, y: s.abs.y, w: s.abs.w, driver: 'textpos',
          ...(s.abs.rotate !== undefined ? { rotate: s.abs.rotate } : {}),
        });
      case 'list':
        return {
          id: id(), kind: 'list', placement: P, listType: s.type,
          items: s.items.map((it): ListItem => ({
            id: id(), content: it.rt,
            ...(it.overlay !== undefined ? { overlay: it.overlay } : {}),
            ...(it.sub !== undefined ? { sublist: {
              id: id(), kind: 'list', placement: P, listType: 'itemize',
              items: it.sub.map((rt) => ({ id: id(), content: rt })),
            } } : {}),
          })),
        };
      case 'block':
        return { id: id(), kind: 'block', placement: P, variant: s.variant, title: s.title, children: [text(s.body)] };
      case 'columns':
        return {
          id: id(), kind: 'columns', placement: P,
          columns: [s.left, s.right].map((rt) => ({ id: id(), width: { v: 0.48, u: 'textwidth' as const }, children: [text(rt)] })),
        };
      case 'math':
        return { id: id(), kind: 'math', placement: P, env: s.env, tex: s.body };
      case 'code':
        return { id: id(), kind: 'code', placement: P, backend: 'listings', language: s.language, code: s.code, options: {} };
      case 'table':
        return {
          id: id(), kind: 'table', placement: P, style: 'booktabs', fit: 'natural', floatWrapper: 'none', merges: s.merge === true ? [{ row: 0, col: 0, colspan: 2 }] : [],
          columns: Array.from({ length: s.cols }, () => ({ id: id(), align: 'l' as const })),
          topRule: { k: 'toprule' },
          rows: Array.from({ length: s.rows }, (_, r) => ({
            id: id(),
            ...(r === s.rows - 1 ? { ruleBelow: { k: 'bottomrule' as const } } : {}),
            // A cell covered by a merge is blank, as the table editor leaves it.
            cells: Array.from({ length: s.cols }, (_, c) => ({
              id: id(),
              content: s.merge === true && r === 0 && c === 1 ? [] : [{ t: 'text' as const, s: s.cells[r * s.cols + c]! }],
            })),
          })),
        };
      case 'tikz':
        return { id: id(), kind: 'tikz', placement: P, mode: 'shapes', canvasSize: { w: 120, h: 60 }, shapes: s.shapes.map(shape) };
      case 'pause':
        return { id: id(), kind: 'pause', placement: P };
      case 'chart':
        return {
          id: id(), kind: 'chart', placement: P, chartType: s.type,
          data: { columns: ['Year', 'Alpha', 'Beta'], rows: s.rows },
          series: [{ id: id(), xCol: 0, yCol: 1, label: 'Alpha' }, { id: id(), xCol: 0, yCol: 2, label: 'Beta' }],
          axis: { grid: 'major', ...(s.logY ? { ymode: 'log' as const } : {}) },
          // Millimetres, as the chart editor writes them. A width in textwidth units is declined by the
          // chart recognizer on purpose (it is not a shape the editor makes) and reads back as a drawing.
          size: { w: { v: 90, u: 'mm' }, h: { v: 50, u: 'mm' } },
        };
      case 'image':
        usesImage = true;
        return {
          id: id(), kind: 'image', placement: P, resourceId: IMAGE_ID, keepAspect: true,
          width: { v: s.width, u: 'textwidth' },
          ...(s.align !== undefined ? { align: s.align } : {}),
          ...(s.caption !== undefined ? { caption: s.caption } : {}),
          ...(s.opacity !== undefined ? { opacity: s.opacity } : {}),
          ...(s.rotate !== undefined ? { rotate: s.rotate } : {}),
          ...(s.trim !== undefined ? { trim: { left: s.trim[0], bottom: s.trim[1], right: s.trim[2], top: s.trim[3] } } : {}),
        };
      case 'toc':
        return { id: id(), kind: 'toc', placement: P, options: '' };
      case 'bibliography':
        return {
          id: id(), kind: 'bibliography', placement: P, files: ['refs'],
          ...(s.size !== undefined ? { sizeHint: s.size } : {}),
          ...(s.style !== undefined ? { style: s.style } : {}),
        };
    }
  };
  let usesImage = false;

  const base = newDeck({ title: spec.title });
  const nodes: DocNode[] = [];
  for (const f of spec.frames) {
    if (f.section !== undefined) {
      nodes.push({ kind: 'section', id: id(), level: f.section.level, title: [{ t: 'text', s: f.section.title }], starred: false });
    }
    const frame = { ...newFrame(f.title, f.els.map(element)), id: id() };
    nodes.push({
      ...frame,
      options: {
        ...(f.vAlign !== undefined ? { vAlign: f.vAlign } : {}),
        ...(f.plain === true ? { plain: true } : {}),
        ...(f.noNumber === true ? { noframenumbering: true } : {}),
        ...(f.breaks === true ? { allowframebreaks: true } : {}),
      },
      notes: f.note === undefined ? [] : [{ id: id(), content: [{ t: 'text', s: f.note }] }],
    });
  }
  return {
    ...base,
    nodes,
    resources: usesImage ? [{
      id: IMAGE_ID, path: 'images/probe.png', kind: 'image', mime: 'image/png',
      bytes: 1, sha256: 'x', originalName: 'probe.png', intrinsic: { w: 64, h: 32 },
    }] : [],
  };
}
