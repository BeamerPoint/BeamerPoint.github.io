import type { Element, ListElement, ListItem, Placement, TexString } from '../model/types.js';
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
            const width =
              col.width.u === 'textwidth' || col.width.u === 'linewidth'
                ? `${col.width.v}\\${col.width.u}`
                : `${col.width.v}${col.width.u}`;
            w.line_(`\\begin{column}${valign}{${width}}`);
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
