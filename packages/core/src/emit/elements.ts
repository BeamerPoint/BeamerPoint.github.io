import type { Element, Length, ListElement, ListItem, Placement, TexString } from '../model/types.js';
import { roundMm } from '../geometry/paper.js';
import { emitInline, isBlankRichText } from './inline.js';
import type { TexWriter } from './writer.js';

export interface EmitWarning {
  code: string;
  message: string;
  nodeId?: string;
}

export interface EmitContext {
  warn(w: EmitWarning): void;
  /**
   * Resolve a resource id to its path inside the project.
   *
   * Elements hold ids, not paths, so that renaming a file touches one place. The
   * emitter needs the path, and only the deck knows the mapping.
   */
  resourcePath(id: string): string | undefined;
}

/**
 * Emit one element, including its placement wrapper.
 *
 * An absolute element is wrapped in `textblock*`, whose coordinates are page-relative
 * millimetres — the same numbers the model stores and the canvas draws with, so there
 * is no conversion step to get wrong.
 */
export function emitElement(w: TexWriter, el: Element, ctx: EmitContext): void {
  w.span(el.id, `element:${el.kind}`, () => {
    for (const c of el.leadingComments ?? []) w.line_(`%${c}`);

    if (el.placement.mode === 'absolute') {
      emitAbsoluteWrapper(w, el, el.placement, ctx);
    } else {
      emitElementBody(w, el, ctx);
    }
  });
}

function emitAbsoluteWrapper(
  w: TexWriter,
  el: Element,
  p: Extract<Placement, { mode: 'absolute' }>,
  ctx: EmitContext,
): void {
  const x = roundMm(p.x);
  const y = roundMm(p.y);
  const width = roundMm(p.w);

  if (p.driver === 'tikz') {
    w.line_(`\\begin{tikzpicture}[remember picture,overlay]`);
    w.indented(() => {
      const rot = p.rotate ? `,rotate=${roundMm(p.rotate)}` : '';
      w.line_(
        `\\node[anchor=north west,inner sep=0pt,text width=${width}mm${rot}] ` +
        `at ([xshift=${x}mm,yshift=-${y}mm]current page.north west) \\bgroup`,
      );
      emitElementBody(w, el, ctx);
      w.line_('\\egroup;');
    });
    w.line_('\\end{tikzpicture}');
    return;
  }

  w.line_(`\\begin{textblock*}{${width}mm}(${x}mm,${y}mm)`);
  w.indented(() => {
    if (p.rotate) {
      w.line_(`\\rotatebox{${roundMm(p.rotate)}}{%`);
      w.indented(() => emitElementBody(w, el, ctx));
      w.line_('}');
    } else {
      emitElementBody(w, el, ctx);
    }
  });
  w.line_('\\end{textblock*}');
}

function emitElementBody(w: TexWriter, el: Element, ctx: EmitContext): void {
  switch (el.kind) {
    case 'raw':
      // Byte-exact. This is the whole point of the raw escape hatch.
      w.nl();
      w.raw(el.tex);
      w.nl();
      return;

    case 'text': {
      if (isBlankRichText(el.content)) return;
      const body = emitInline(el.content);
      const aligned = wrapAlignment(body, el.align);
      if (el.size !== undefined) {
        w.line_(`{\\${el.size} ${aligned}\\par}`);
      } else {
        w.line_(aligned);
      }
      return;
    }

    case 'list':
      emitList(w, el, ctx);
      return;

    case 'image': {
      const path = ctx.resourcePath(el.resourceId);
      if (path === undefined) {
        ctx.warn({
          code: 'emit.missing-resource',
          message: `Image element references a resource that is not in the deck`,
          nodeId: el.id,
        });
        return;
      }
      const opts = graphicsOptions(el);
      const optPart = opts === '' ? '' : `[${opts}]`;
      const graphic = `\\includegraphics${optPart}{${path}}`;

      // A figure already centres its contents, so the alignment wrapper would be
      // redundant inside one.
      if (el.caption !== undefined) {
        w.line_('\\begin{figure}');
        w.indented(() => {
          w.line_('\\centering');
          w.line_(graphic);
          w.line_(`\\caption{${emitInline(el.caption!)}}`);
        });
        w.line_('\\end{figure}');
        return;
      }

      // Absolute placement positions the box itself, so alignment within a column
      // has nothing to act on.
      if (el.align === undefined || el.placement.mode === 'absolute') {
        w.line_(graphic);
        return;
      }
      w.line_(wrapAlignment(graphic, el.align));
      return;
    }

    case 'block': {
      const title = el.title === undefined ? '' : emitInline(el.title);
      w.line_(`\\begin{${el.variant}}{${title}}`);
      w.indented(() => {
        for (const child of el.children) emitElement(w, child, ctx);
      });
      w.line_(`\\end{${el.variant}}`);
      return;
    }

    case 'columns': {
      const opts = el.envOptions ?? '';
      w.line_(`\\begin{columns}${opts}`);
      w.indented(() => {
        for (const col of el.columns) {
          w.span(col.id, 'column', () => {
            const valign = col.valign === undefined ? '' : `[${col.valign}]`;
            w.line_(`\\begin{column}${valign}{${lengthToTex(col.width)}}`);
            w.indented(() => {
              for (const child of col.children) emitElement(w, child, ctx);
            });
            w.line_('\\end{column}');
          });
        }
      });
      w.line_('\\end{columns}');
      return;
    }

    default:
      // Reached only if a model kind is added without an emitter. Never silently drop.
      ctx.warn({
        code: 'emit.unimplemented',
        message: `No emitter for element kind "${el.kind}"`,
        nodeId: el.id,
      });
      return;
  }
}

/** Build the `\includegraphics[...]` option list, in a stable order. */
function graphicsOptions(el: Extract<Element, { kind: 'image' }>): string {
  const parts: string[] = [];

  if (el.placement.mode === 'absolute') {
    // Inside a textblock*, textpos sets \linewidth and \textwidth to the block width
    // (verified: a 60mm block reports 170.7pt for both). So a fractional width would
    // render the image at a fraction of the box the user sized, not filling it.
    // The placement width IS the image width here.
    parts.push('width=\\linewidth');
  } else if (el.width !== undefined) {
    parts.push(`width=${lengthToTex(el.width)}`);
  }
  if (el.height !== undefined) parts.push(`height=${lengthToTex(el.height)}`);
  if (el.keepAspect && el.width !== undefined && el.height !== undefined) {
    parts.push('keepaspectratio');
  }
  if (el.rotate) parts.push(`angle=${roundMm(el.rotate)}`);
  if (el.trim !== undefined && hasCrop(el.trim)) {
    const bp = (n: number): string => `${Math.round(n * 100) / 100}bp`;
    // graphicx order is left, bottom, right, top.
    parts.push(`trim=${bp(el.trim.left)} ${bp(el.trim.bottom)} ${bp(el.trim.right)} ${bp(el.trim.top)}`);
    parts.push('clip');
  }
  if (el.altGraphicsOptions !== undefined && el.altGraphicsOptions !== '') {
    parts.push(el.altGraphicsOptions);
  }
  return parts.join(',');
}

/** True when a trim actually removes anything; an all-zero crop should not be emitted. */
export function hasCrop(t: { left: number; bottom: number; right: number; top: number }): boolean {
  return t.left > 0 || t.bottom > 0 || t.right > 0 || t.top > 0;
}

/** Render a length, expanding the LaTeX-relative units to their control sequences. */
export function lengthToTex(l: Length): string {
  const relative =
    l.u === 'textwidth' || l.u === 'linewidth' || l.u === 'textheight'
    || l.u === 'paperwidth' || l.u === 'paperheight';
  return relative ? `${l.v}\\${l.u}` : `${l.v}${l.u}`;
}

function wrapAlignment(body: TexString, align: string | undefined): TexString {
  switch (align) {
    case 'center': return `\\begin{center}${body}\\end{center}`;
    case 'right': return `\\begin{flushright}${body}\\end{flushright}`;
    case 'left': return `\\begin{flushleft}${body}\\end{flushleft}`;
    default: return body;
  }
}

function emitList(w: TexWriter, el: ListElement, ctx: EmitContext): void {
  const opts = el.envOptions ?? '';
  w.line_(`\\begin{${el.listType}}${opts}`);
  w.indented(() => {
    for (const item of el.items) emitListItem(w, item, ctx);
  });
  w.line_(`\\end{${el.listType}}`);
}

function emitListItem(w: TexWriter, item: ListItem, ctx: EmitContext): void {
  w.span(item.id, 'listitem', () => {
    const overlay = item.overlay ?? '';
    const label = item.label === undefined ? '' : `[${emitInline(item.label)}]`;
    const body = emitInline(item.content);
    w.line_(`\\item${overlay}${label} ${body}`.trimEnd());
    if (item.sublist !== undefined) {
      w.indented(() => emitList(w, item.sublist!, ctx));
    }
  });
}
