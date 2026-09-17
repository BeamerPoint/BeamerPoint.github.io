import type {
  Anchor, ArrowHead, Color, Mm, TikzElement, TikzShape, TikzStyle,
} from '../model/types.js';
import { roundMm } from '../geometry/paper.js';
import { shapeBounds } from '../model/shapeOps.js';
import { emitInline } from './inline.js';
import type { EmitContext } from './elements.js';
import type { TexWriter } from './writer.js';

/**
 * TikZ shapes.
 *
 * Coordinates are stored the way the rest of the app stores them — millimetres from
 * the TOP-left — and emitted as `(x mm, -y mm)`. TikZ's y axis points up, so negating
 * y puts the origin at the top-left corner and makes the model, the canvas and the
 * PDF agree with no conversion. Verified against the engine: a node asked for at
 * (40mm, 20mm) measured 40.00mm, 20.00mm from the origin in the compiled PDF.
 */

/** The TikZ libraries the emitted shapes need. Without these, nothing compiles. */
export const TIKZ_LIBRARIES =
  '\\usetikzlibrary{arrows.meta,shapes.geometric,shadows}';

/**
 * The libraries line as earlier versions wrote it.
 *
 * `DERIVED_SETUP_LINES` matches by exact string, so a deck saved before `shadows` was
 * added would otherwise have its old line kept as a user-owned chunk AND the new one
 * derived beside it, growing a duplicate on every edit. Keeping the old spelling in the
 * set absorbs it; the next emit writes the current one.
 */
export const TIKZ_LIBRARIES_LEGACY = '\\usetikzlibrary{arrows.meta,shapes.geometric}';

function n(v: Mm): string {
  // -0 would print as "-0mm", which is valid but churns the round trip.
  const r = roundMm(v);
  return Object.is(r, -0) ? '0' : String(r);
}

/** A model point as a TikZ coordinate, with y negated. */
function coord(x: Mm, y: Mm): string {
  return `(${n(x)}mm,${n(-y)}mm)`;
}

/**
 * A colour as a TikZ option value.
 *
 * `colorToTex` produces `[rgb]{r,g,b}` for rgb, which is `\textcolor` syntax and is
 * not valid inside a TikZ key. xcolor's extended form works there instead.
 */
export function tikzColor(c: Color): string {
  switch (c.k) {
    case 'named': return c.name;
    case 'mix': return c.expr;
    case 'structure': return c.shade === undefined ? 'structure.fg' : `structure.fg!${c.shade}`;
    case 'rgb': {
      const f = (v: number): string => String(Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000);
      return `{rgb,1:red,${f(c.r)};green,${f(c.g)};blue,${f(c.b)}}`;
    }
  }
}

/**
 * Style options, in a fixed order so the round trip is a fixpoint.
 *
 * `centre` is the shape's own middle, needed for rotation: TikZ's plain `rotate` key
 * transforms the COORDINATE SYSTEM, so a rotated shape swings away from where it was
 * drawn rather than turning in place. `rotate around` takes the pivot, and the pivot is
 * the shape's centre, which is what a rotation handle means everywhere else.
 */
export function styleOptions(
  s: TikzStyle,
  centre?: { x: Mm; y: Mm },
): string[] {
  const out: string[] = [];
  if (s.draw !== undefined) out.push(`draw=${tikzColor(s.draw)}`);
  if (s.fill !== undefined) out.push(`fill=${tikzColor(s.fill)}`);
  if (s.textColor !== undefined) out.push(`text=${tikzColor(s.textColor)}`);
  if (s.lineWidth !== undefined) out.push(`line width=${n(s.lineWidth.v)}${s.lineWidth.u}`);
  if (s.dash === 'dashed') out.push('dashed');
  if (s.dash === 'dotted') out.push('dotted');
  if (s.opacity !== undefined) out.push(`opacity=${s.opacity}`);
  if (s.rotate !== undefined && s.rotate !== 0 && centre !== undefined) {
    out.push(`rotate around={${n(s.rotate)}:${coord(centre.x, centre.y)}}`);
  }
  // Measured: without \usetikzlibrary{shadows} this is *I do not know the key
  // '/tikz/drop shadow'* and the deck does not compile at all.
  if (s.shadow === true) out.push('drop shadow');
  return out;
}

const ARROW_TIP: Readonly<Record<ArrowHead, string | null>> = {
  none: null,
  latex: '-Latex',
  stealth: '-Stealth',
  to: '->',
};

/**
 * TikZ node names for shapes an arrow can attach to.
 *
 * Prefixed and letters-only: a name is a TeX control-sequence-ish token, and ids can
 * start with a digit.
 */
export function nodeName(id: string): string {
  return `bp${id.replace(/[^A-Za-z0-9]/g, '')}`;
}

const SIDE_ANCHOR: Readonly<Record<'n' | 's' | 'e' | 'w' | 'center', string>> = {
  n: 'north', s: 'south', e: 'east', w: 'west', center: 'center',
};

function anchorPoint(a: Anchor): string {
  return a.kind === 'point'
    ? coord(a.x, a.y)
    : `(${nodeName(a.shapeId)}.${SIDE_ANCHOR[a.side]})`;
}

function optionList(parts: string[]): string {
  return parts.length === 0 ? '' : `[${parts.join(',')}]`;
}

/**
 * The width a label's text box may take inside a shape, in millimetres.
 *
 * A TikZ node grows to fit its text, so without this a long label silently makes the
 * shape bigger than the one on the canvas. Measured against the engine, a 40x20mm
 * rectangle:
 *
 * | body | node width |
 * | --- | --- |
 * | empty | 40.14mm |
 * | "A rather long label that will not fit" | **56.26mm** |
 * | the same, with `text width=40mm` | 40.14mm |
 *
 * An ellipse needs a NARROWER box than its own width, because the shape library sizes a
 * shape to CONTAIN its text box rather than to fill it — the same measurement that put
 * the polygons in `polygons.ts`. `text width=40mm` grew a 40mm ellipse to 56.71mm;
 * `rx * sqrt(2)`, the widest rectangle that fits inside the ellipse, held it at 40.14.
 */
function labelWidthMm(shape: TikzShape): Mm | null {
  if (shape.t === 'rect') return shape.w;
  if (shape.t === 'ellipse') return shape.rx * Math.SQRT2;
  return null;
}

/** The label options, or nothing at all when the shape carries no label. */
export function labelOptions(shape: TikzShape): string[] {
  const label = shape.t === 'rect' || shape.t === 'ellipse' ? shape.label : undefined;
  if (label === undefined || label.length === 0) return [];
  const width = labelWidthMm(shape);
  if (width === null) return [];
  return [`text width=${n(width)}mm`, 'align=center'];
}

function labelBody(shape: TikzShape): string {
  const label = shape.t === 'rect' || shape.t === 'ellipse' ? shape.label : undefined;
  return label === undefined ? '' : emitInline(label);
}

function emitShape(w: TexWriter, shape: TikzShape, ctx: EmitContext): void {
  const b = shapeBounds(shape);
  const style = styleOptions(
    shape.style,
    b === null ? undefined : { x: b.x + b.w / 2, y: b.y + b.h / 2 },
  );

  switch (shape.t) {
    case 'rect': {
      const opts = [
        ...(shape.rx !== undefined && shape.rx > 0 ? [`rounded corners=${n(shape.rx)}mm`] : []),
        ...style,
        `minimum width=${n(shape.w)}mm`,
        `minimum height=${n(shape.h)}mm`,
        'inner sep=0pt',
        'anchor=north west',
        ...labelOptions(shape),
      ];
      w.line_(
        `\\node${optionList(opts)} (${nodeName(shape.id)}) at ${coord(shape.x, shape.y)} `
        + `{${labelBody(shape)}};`,
      );
      return;
    }

    case 'ellipse': {
      const opts = [
        'shape=ellipse',
        ...style,
        `minimum width=${n(shape.rx * 2)}mm`,
        `minimum height=${n(shape.ry * 2)}mm`,
        'inner sep=0pt',
        'anchor=center',
        ...labelOptions(shape),
      ];
      w.line_(
        `\\node${optionList(opts)} (${nodeName(shape.id)}) at ${coord(shape.cx, shape.cy)} `
        + `{${labelBody(shape)}};`,
      );
      return;
    }

    case 'node': {
      const shapeKey =
        shape.shape === 'rect' ? ['shape=rectangle']
        : shape.shape === 'circle' ? ['shape=circle']
        : [];
      const opts = [...shapeKey, ...style, 'anchor=north west'];
      const body = emitInline(shape.content);
      w.line_(
        `\\node${optionList(opts)} (${nodeName(shape.id)}) at ${coord(shape.x, shape.y)} {${body}};`,
      );
      return;
    }

    case 'path': {
      if (shape.points.length < 2) {
        ctx.warn({
          code: 'emit.tikz-short-path',
          message: 'A line needs at least two points',
          nodeId: shape.id,
        });
        return;
      }
      const pts = shape.points.map(([x, y]) => coord(x, y));

      if (shape.smooth) {
        const plot = shape.closed ? 'plot[smooth cycle]' : 'plot[smooth]';
        w.line_(`\\draw${optionList(style)} ${plot} coordinates {${pts.join(' ')}};`);
        return;
      }
      const tail = shape.closed ? ' -- cycle' : '';
      w.line_(`\\draw${optionList(style)} ${pts.join(' -- ')}${tail};`);
      return;
    }

    case 'arrow': {
      const tip = ARROW_TIP[shape.head];
      const opts = [...(tip === null ? [] : [tip]), ...style];
      const join = shape.bend === undefined || shape.bend === 0
        ? '--'
        : shape.bend > 0
          ? `to[bend left=${n(shape.bend)}]`
          : `to[bend right=${n(-shape.bend)}]`;
      w.line_(
        `\\draw${optionList(opts)} ${anchorPoint(shape.from)} ${join} ${anchorPoint(shape.to)};`,
      );
      return;
    }
  }
}

export function emitTikz(w: TexWriter, el: TikzElement, ctx: EmitContext): void {
  const opts = el.pictureOptions ?? '';
  w.line_(`\\begin{tikzpicture}${opts}`);
  w.indented(() => {
    if (el.mode === 'raw') {
      // Verbatim, exactly like a math body: the user owns every byte in here.
      w.raw(el.raw ?? '');
      w.nl();
      return;
    }

    // Without an explicit bounding box TikZ shrinks the picture to fit its contents,
    // so an empty region at the edge of the canvas would vanish and the element would
    // be a different size in the PDF than the one the user drew on.
    w.line_(
      `\\useasboundingbox ${coord(0, 0)} rectangle ${coord(el.canvasSize.w, el.canvasSize.h)};`,
    );
    for (const shape of el.shapes ?? []) {
      w.span(shape.id, 'shape', () => emitShape(w, shape, ctx));
    }
  });
  w.line_('\\end{tikzpicture}');
}
