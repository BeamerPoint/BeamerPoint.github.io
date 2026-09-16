import type {
  Anchor, ArrowHead, Color, Length, Mm, TikzElement, TikzShape, TikzStyle,
} from '../../model/types.js';
import type { CstNode } from '../cst.js';
import { parseInline, trimRichText } from '../inline.js';
import type { RecognizeCtx } from './elements.js';

/**
 * TikZ pictures.
 *
 * Two shapes of picture are read: one the app itself produced, which is a bounding
 * box followed by a list of shape statements, and anything else, which is kept as a
 * verbatim `mode: 'raw'` body so a hand-written diagram survives as an element rather
 * than as an anonymous raw block.
 *
 * As everywhere else, reading the shape form is all-or-nothing. A statement this
 * cannot model demotes the WHOLE picture to raw — a picture half in the shape editor
 * and half missing would be much worse than one that is simply not editable.
 */

/** `bp<id>` node names, as produced by `emit/tikz.ts`. */
const NODE_NAME = /^bp([A-Za-z0-9]+)$/;

const ANCHOR_SIDE: Readonly<Record<string, 'n' | 's' | 'e' | 'w' | 'center'>> = {
  north: 'n', south: 's', east: 'e', west: 'w', center: 'center',
};

const ARROW_TIP: Readonly<Record<string, ArrowHead>> = {
  '-Latex': 'latex',
  '-Stealth': 'stealth',
  '->': 'to',
};

/* ------------------------------------------------------------------ colours */

export function parseTikzColor(raw: string): Color | null {
  const s = raw.trim();
  if (s === '') return null;

  const rgb = /^\{?rgb,1:red,([\d.]+);green,([\d.]+);blue,([\d.]+)\}?$/.exec(s);
  if (rgb !== null) {
    return { k: 'rgb', r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  }

  const structure = /^structure\.fg(?:!(\d+))?$/.exec(s);
  if (structure !== null) {
    return structure[1] === undefined
      ? { k: 'structure' }
      : { k: 'structure', shade: Number(structure[1]) };
  }

  if (/^[A-Za-z][A-Za-z0-9]*$/.test(s)) return { k: 'named', name: s };
  // `blue!20`, `blue!20!white` and friends are kept verbatim so they round-trip.
  if (/^[A-Za-z0-9!.\s-]+$/.test(s)) return { k: 'mix', expr: s };
  return null;
}

/* ------------------------------------------------------------------ options */

/** Split an option list on top-level commas, respecting braces and brackets. */
export function splitOptions(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '{' || c === '[') depth += 1;
    else if (c === '}' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  const tail = s.slice(start);
  if (tail.trim() !== '' || out.length > 0) out.push(tail);
  return out.map((o) => o.trim()).filter((o) => o !== '');
}

const LENGTH = /^(-?[\d.]+)(mm|cm|pt|ex|em)$/;

function parseLen(s: string): Length | null {
  const m = LENGTH.exec(s.trim());
  if (m === null) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? { v, u: m[2] as Length['u'] } : null;
}

function mmOf(s: string): Mm | null {
  const m = /^(-?[\d.]+)mm$/.exec(s.trim());
  if (m === null) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

interface ReadOptions {
  style: TikzStyle;
  /** Keys the shape recognizers consume themselves. */
  rest: Map<string, string>;
  /** Bare keys with no `=`, e.g. `dashed`, `shape=ellipse`'s sibling forms. */
  flags: Set<string>;
}

/**
 * Read an option list into a style plus whatever is left.
 *
 * Anything unrecognised stays in `rest`/`flags` for the caller to accept or reject —
 * nothing is silently discarded, because a dropped option changes the picture.
 */
function readOptions(raw: string): ReadOptions | null {
  const style: TikzStyle = {};
  const rest = new Map<string, string>();
  const flags = new Set<string>();

  for (const opt of splitOptions(raw)) {
    const eq = opt.indexOf('=');
    if (eq === -1) {
      if (opt === 'dashed' || opt === 'dotted') style.dash = opt;
      else flags.add(opt);
      continue;
    }

    const key = opt.slice(0, eq).trim();
    const value = opt.slice(eq + 1).trim();

    switch (key) {
      case 'draw': case 'fill': case 'text': {
        const c = parseTikzColor(value);
        if (c === null) return null;
        if (key === 'draw') style.draw = c;
        else if (key === 'fill') style.fill = c;
        else style.textColor = c;
        break;
      }
      case 'line width': {
        const l = parseLen(value);
        if (l === null) return null;
        style.lineWidth = l;
        break;
      }
      case 'opacity': {
        const v = Number(value);
        if (!Number.isFinite(v)) return null;
        style.opacity = v;
        break;
      }
      default:
        rest.set(key, value);
    }
  }

  return { style, rest, flags };
}

/* --------------------------------------------------------------- statements */

/**
 * Split a picture body into statements.
 *
 * TikZ statements end at a semicolon, and the lexer hands back a flat run of nodes,
 * so the split is on `;` inside text nodes. Rather than rebuild spans, each statement
 * is kept as the exact source slice plus the nodes it covers — the slice is what the
 * regexes read, and the nodes are what a node's `{...}` body is parsed from.
 */
interface Statement {
  text: string;
  nodes: CstNode[];
}

function splitStatements(children: CstNode[], src: string): Statement[] | null {
  const out: Statement[] = [];
  let nodes: CstNode[] = [];
  let start: number | null = null;
  let end = 0;

  const note = (node: CstNode): void => {
    if (start === null) start = node.span.start;
    end = node.span.end;
    nodes.push(node);
  };

  for (const node of children) {
    if (node.n === 'comment') return null;      // a comment has nowhere to live

    if (node.n === 'text') {
      let from = 0;
      for (let i = 0; i < node.value.length; i++) {
        if (node.value[i] !== ';') continue;
        const piece = node.value.slice(from, i + 1);
        if (piece.trim() !== '' || nodes.length > 0) {
          if (start === null) start = node.span.start + from;
          end = node.span.start + i + 1;
          out.push({ text: src.slice(start, end), nodes });
        }
        nodes = [];
        start = null;
        from = i + 1;
      }
      const tail = node.value.slice(from);
      if (tail.trim() !== '') {
        if (start === null) start = node.span.start + from;
        end = node.span.start + node.value.length;
        nodes.push({ n: 'text', value: tail, span: { ...node.span } });
      }
      continue;
    }

    if (node.n === 'parbreak') continue;
    note(node);
  }

  // Anything after the last semicolon is an unterminated statement.
  return nodes.length > 0 ? null : out;
}

/* ------------------------------------------------------------ coordinates */

const COORD = /\(\s*(-?[\d.]+)mm\s*,\s*(-?[\d.]+)mm\s*\)/g;

function readPoints(s: string): Array<[Mm, Mm]> {
  const out: Array<[Mm, Mm]> = [];
  COORD.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COORD.exec(s)) !== null) out.push([Number(m[1]), -Number(m[2])]);
  return out;
}

function readAnchor(s: string): Anchor | null {
  const named = /^\(\s*([A-Za-z0-9]+)\.(north|south|east|west|center)\s*\)$/.exec(s.trim());
  if (named !== null) {
    const id = NODE_NAME.exec(named[1]!);
    if (id === null) return null;
    return { kind: 'shape', shapeId: id[1]!, side: ANCHOR_SIDE[named[2]!]! };
  }
  const pts = readPoints(s);
  return pts.length === 1 ? { kind: 'point', x: pts[0]![0], y: pts[0]![1] } : null;
}

/* ------------------------------------------------------------------ shapes */

function readNodeStatement(st: Statement, ctx: RecognizeCtx): TikzShape | null {
  const m = /^\\node\s*(?:\[([\s\S]*?)\])?\s*\(([A-Za-z0-9]+)\)\s*at\s*(\([^)]*\))\s*\{/
    .exec(st.text);
  if (m === null) return null;

  const idMatch = NODE_NAME.exec(m[2]!);
  if (idMatch === null) return null;
  const id = idMatch[1]!;

  const opts = readOptions(m[1] ?? '');
  if (opts === null) return null;

  const pts = readPoints(m[3]!);
  if (pts.length !== 1) return null;
  const [x, y] = pts[0]!;

  // The node body is the last brace group in the statement.
  const group = [...st.nodes].reverse().find((n) => n.n === 'group');
  const content = group !== undefined && group.n === 'group'
    ? trimRichText(parseInline(group.children, ctx.src))
    : [];

  const anchor = opts.rest.get('anchor');
  const shapeKey = opts.rest.get('shape');
  const innerSep = opts.rest.get('inner sep');
  const minW = opts.rest.get('minimum width');
  const minH = opts.rest.get('minimum height');
  const rounded = opts.rest.get('rounded corners');

  const consumed = new Set(['anchor', 'shape', 'inner sep', 'minimum width',
    'minimum height', 'rounded corners']);
  for (const key of opts.rest.keys()) if (!consumed.has(key)) return null;
  if (opts.flags.size > 0) return null;

  // A rectangle or an ellipse: a sized, empty, zero-inset node.
  if (minW !== undefined && minH !== undefined && innerSep === '0pt' && content.length === 0) {
    const w = mmOf(minW);
    const h = mmOf(minH);
    if (w === null || h === null) return null;

    if (shapeKey === 'ellipse' && anchor === 'center') {
      return {
        id, t: 'ellipse', cx: x, cy: y, rx: w / 2, ry: h / 2, style: opts.style,
      };
    }
    if (shapeKey === undefined && anchor === 'north west') {
      const rx = rounded === undefined ? undefined : mmOf(rounded);
      if (rounded !== undefined && rx === null) return null;
      return {
        id, t: 'rect', x, y, w, h,
        ...(rx !== undefined && rx !== null ? { rx } : {}),
        style: opts.style,
      };
    }
    return null;
  }

  // Otherwise a text node.
  if (anchor !== 'north west' || innerSep !== undefined
      || minW !== undefined || minH !== undefined || rounded !== undefined) {
    return null;
  }
  const shape =
    shapeKey === undefined ? 'none'
    : shapeKey === 'rectangle' ? 'rect'
    : shapeKey === 'circle' ? 'circle'
    : null;
  if (shape === null) return null;

  return { id, t: 'node', x, y, content, shape, style: opts.style };
}

function readDrawStatement(st: Statement, ctx: RecognizeCtx): TikzShape | null {
  const m = /^\\draw\s*(?:\[([\s\S]*?)\])?\s*([\s\S]*);$/.exec(st.text.trim());
  if (m === null) return null;

  const rawOpts = m[1] ?? '';
  const body = m[2]!.trim();

  // The arrow tip is the first option and is not a key=value pair.
  const parts = splitOptions(rawOpts);
  const tip = parts.length > 0 ? ARROW_TIP[parts[0]!] : undefined;
  const opts = readOptions(tip === undefined ? rawOpts : parts.slice(1).join(','));
  if (opts === null || opts.rest.size > 0 || opts.flags.size > 0) return null;

  const id = ctx.newId();

  // A smoothed path.
  const smooth = /^plot\[smooth(\s+cycle)?\]\s*coordinates\s*\{([\s\S]*)\}$/.exec(body);
  if (smooth !== null) {
    if (tip !== undefined) return null;
    const points = readPoints(smooth[2]!);
    if (points.length < 2) return null;
    return {
      id, t: 'path', points, closed: smooth[1] !== undefined, smooth: true, style: opts.style,
    };
  }

  // An arrow: exactly two endpoints joined by `--` or a bend.
  const bendJoin = /^(\([^)]*\))\s*to\[bend (left|right)=([\d.]+)\]\s*(\([^)]*\))$/.exec(body);
  if (bendJoin !== null) {
    const from = readAnchor(bendJoin[1]!);
    const to = readAnchor(bendJoin[4]!);
    if (from === null || to === null) return null;
    const deg = Number(bendJoin[3]!);
    return {
      id, t: 'arrow', from, to,
      bend: bendJoin[2] === 'left' ? deg : -deg,
      head: tip ?? 'none',
      style: opts.style,
    };
  }

  const segments = body.split('--').map((s) => s.trim());
  const closed = segments[segments.length - 1] === 'cycle';
  const coords = closed ? segments.slice(0, -1) : segments;
  if (coords.length < 2) return null;

  // Anything with an arrow tip, or an endpoint attached to a shape, is an arrow.
  const endpointsAreAnchors = coords.length === 2 && !closed;
  if (endpointsAreAnchors) {
    const from = readAnchor(coords[0]!);
    const to = readAnchor(coords[1]!);
    if (from === null || to === null) return null;
    if (tip !== undefined || from.kind === 'shape' || to.kind === 'shape') {
      return { id, t: 'arrow', from, to, head: tip ?? 'none', style: opts.style };
    }
    return {
      id, t: 'path',
      points: [[from.x, from.y], [to.x, to.y]],
      closed: false, smooth: false, style: opts.style,
    };
  }

  if (tip !== undefined) return null;
  const points: Array<[Mm, Mm]> = [];
  for (const c of coords) {
    const pts = readPoints(c);
    if (pts.length !== 1) return null;
    points.push(pts[0]!);
  }
  return { id, t: 'path', points, closed, smooth: false, style: opts.style };
}

/* ------------------------------------------------------------------- entry */

const BBOX = /^\\useasboundingbox\s*\(\s*0mm\s*,\s*-?0mm\s*\)\s*rectangle\s*\(\s*([\d.]+)mm\s*,\s*(-?[\d.]+)mm\s*\)\s*;$/;

export function recognizeTikz(
  node: Extract<CstNode, { n: 'env' }>,
  ctx: RecognizeCtx,
): TikzElement | null {
  if (node.name !== 'tikzpicture') return null;

  const pictureOptions = node.opts.length > 0
    ? ctx.src.slice(node.opts[0]!.span.start, node.opts[node.opts.length - 1]!.span.end)
    : undefined;

  // `remember picture,overlay` is how an absolutely-placed element is wrapped. Reading
  // it as a diagram would swallow the element inside it and lose its position.
  if (pictureOptions !== undefined && pictureOptions.includes('remember picture')) return null;

  const base = {
    id: ctx.newId(),
    kind: 'tikz' as const,
    placement: { mode: 'flow' as const },
    ...(pictureOptions !== undefined ? { pictureOptions } : {}),
    src: node.span,
  };

  const shapes = readShapeForm(node, ctx);
  if (shapes !== null) {
    return { ...base, mode: 'shapes', shapes: shapes.shapes, canvasSize: shapes.canvasSize };
  }

  // Verbatim fallback. Trimmed at the boundary exactly like a math body, so a round
  // trip does not add a blank line each time.
  const raw = ctx.src.slice(node.bodySpan.start, node.bodySpan.end)
    .replace(/^\r?\n/, '')
    .replace(/\r?\n[ \t]*$/, '');

  return { ...base, mode: 'raw', raw, canvasSize: { w: 0, h: 0 } };
}

function readShapeForm(
  node: Extract<CstNode, { n: 'env' }>,
  ctx: RecognizeCtx,
): { shapes: TikzShape[]; canvasSize: { w: Mm; h: Mm } } | null {
  const statements = splitStatements(node.children, ctx.src);
  if (statements === null || statements.length === 0) return null;

  const first = statements[0]!.text.trim();
  const box = BBOX.exec(first);
  if (box === null) return null;

  const canvasSize = { w: Number(box[1]), h: -Number(box[2]) };
  if (!Number.isFinite(canvasSize.w) || !Number.isFinite(canvasSize.h)) return null;

  const shapes: TikzShape[] = [];
  for (const st of statements.slice(1)) {
    const text = st.text.trim();
    const shape = text.startsWith('\\node') ? readNodeStatement({ ...st, text }, ctx)
      : text.startsWith('\\draw') ? readDrawStatement({ ...st, text }, ctx)
      : null;
    if (shape === null) return null;
    shapes.push(shape);
  }

  return { shapes, canvasSize };
}
