/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import type {
  CodeElement, Color, Element, Length, ListElement, ListItem, Placement, RowRule,
  TableColumn, TableElement,
  TableRow, TexString,
} from '../model/types.js';
import { roundMm } from '../geometry/paper.js';
import { colorToTex, emitInline, isBlankRichText } from './inline.js';
import { emitTikz } from './tikz.js';
import { emitChart } from './chart.js';
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
  // A tabular is an inline box: a newline before it in the source is just a space, so
  // without a paragraph break it lands on the same line as the text above it and the
  // canvas — which draws it as a block — would be lying. Measured: 58mm to the right.
  // A tikzpicture is an inline box for the same reason a tabular is.
  const ownParagraph =
    (el.kind === 'table' || el.kind === 'tikz' || el.kind === 'code' || el.kind === 'chart')
    && el.placement.mode === 'flow';

  if (ownParagraph) w.blank();
  w.span(el.id, `element:${el.kind}`, () => {
    for (const c of el.leadingComments ?? []) w.line_(`%${c}`);

    if (el.placement.mode === 'absolute') {
      emitAbsoluteWrapper(w, el, el.placement, ctx);
    } else {
      emitElementBody(w, el, ctx);
    }
  });
  if (ownParagraph) w.blank();
}

/**
 * Emit a container's children -- a frame's, a block's, a column's.
 *
 * A flow text element is a paragraph, and nothing used to END it: two text boxes in a
 * row were written with one newline between them, which LaTeX reads as a space.
 * Measured, the PDF set them as ONE paragraph on one line while the canvas drew two
 * boxes, and the next reparse merged them into one element for good (F-014) -- the
 * tabular lesson, fixed for tables and never for text.
 *
 * So a flow text that follows another flow text gets a blank line before it. A `\pause`
 * between them does not end the paragraph either (`One \pause Two` is one line on the
 * second overlay), so it does not reset the rule. Only between two texts: blank lines
 * around every text would also land just inside `\begin{block}{...}`, noise in every
 * file for nothing.
 */
export function emitChildren(w: TexWriter, els: readonly Element[], ctx: EmitContext): void {
  let textBefore = false;
  for (const el of els) {
    const isText = el.kind === 'text' && el.placement.mode === 'flow' && !isBlankRichText(el.content);
    if (isText && textBefore) w.blank();
    emitElement(w, el, ctx);
    if (isText) textBefore = true;
    else if (el.kind !== 'pause') textBefore = false;
  }
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
      // The minipage is not decoration. `\rotatebox` typesets its argument in LR mode,
      // where a `block` environment fails with *Missing \endgroup inserted* and no PDF
      // at all, and where a paragraph would never wrap. Measured against the engine:
      // bare fails, wrapped compiles. `peelRotatebox` in the parser strips both layers.
      w.line_(`\\rotatebox{${roundMm(p.rotate)}}{%`);
      w.indented(() => {
        w.line_('\\begin{minipage}{\\linewidth}');
        w.indented(() => emitElementBody(w, el, ctx));
        w.line_('\\end{minipage}');
      });
      w.line_('}');
    } else {
      emitElementBody(w, el, ctx);
    }
  });
  w.line_('\\end{textblock*}');
}

const CODE_ENVIRONMENT: Readonly<Record<CodeElement['backend'], string>> = {
  listings: 'lstlisting',
  minted: 'minted',
  verbatim: 'verbatim',
};

/**
 * What follows `\begin{lstlisting}` / `\begin{minted}`.
 *
 * `minted` takes the language as a mandatory argument and everything else in an option
 * list; `lstlisting` takes one option list; `verbatim` takes nothing at all, so anything
 * set on a verbatim listing is deliberately dropped rather than emitted somewhere it
 * does not belong -- the UI does not offer those controls for that backend.
 *
 * The option order is fixed, because the round trip is a fixpoint only if re-emitting
 * reproduces the same bytes.
 */
function codeArguments(el: CodeElement): string {
  if (el.backend === 'verbatim') return '';

  const opts: string[] = [];
  if (el.backend === 'listings' && el.language !== '') {
    opts.push(`language=${el.language}`);
  }
  if (el.caption !== undefined) opts.push(`caption={${emitInline(el.caption)}}`);
  if (el.frameStyle !== undefined && el.frameStyle !== 'none') {
    opts.push(`frame=${el.frameStyle}`);
  }
  for (const [k, v] of Object.entries(el.options)) {
    opts.push(v === '' ? k : `${k}=${v}`);
  }

  const list = opts.length === 0 ? '' : `[${opts.join(',')}]`;
  return el.backend === 'minted' ? `${list}{${el.language}}` : list;
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

    case 'math': {
      // The body is verbatim and is never re-indented: whitespace inside an align
      // affects nothing, but rewriting it would make the round-trip guard reject
      // every equation the user hand-edited.
      if (el.env === 'displaymath') {
        w.line_('\\[');
        w.raw(el.tex);
        w.nl();
        w.line_('\\]');
        return;
      }
      w.line_(`\\begin{${el.env}}`);
      w.raw(el.tex);
      w.nl();
      w.line_(`\\end{${el.env}}`);
      return;
    }

    case 'chart':
      emitChart(w, el);
      return;

    case 'bibliography': {
      // `\bibliography` belongs in the BODY, where the list prints — it was never
      // emitted at all, so a deck with a bibliography style produced one BibTeX could
      // not resolve. A style set here is one the source wrote inside the frame; the
      // usual place is the preamble, and `emitPreamble` owns that one.
      if (el.sizeHint !== undefined) w.line_(`\\${el.sizeHint}`);
      if (el.style !== undefined) w.line_(`\\bibliographystyle{${el.style}}`);
      if (el.files.length > 0) w.line_(`\\bibliography{${el.files.join(',')}}`);
      return;
    }

    case 'toc':
      // `options` is the verbatim `[...]` group, so `[currentsection]` and anything else
      // beamer accepts round-trips without the model having to understand it.
      w.line_(`\\tableofcontents${el.options}`);
      return;

    case 'code': {
      // NOTHING here is indented, and the body is never reflowed.
      //
      // `guard.ts` compares verbatim bodies byte for byte, and the lexer captures
      // everything between `\begin{lstlisting}` and `\end{lstlisting}` -- so an
      // indented `\end` would put its own leading spaces INSIDE the next parse's body
      // and the round trip would stop being a fixpoint. The newline either side of the
      // code is structural (listings needs the content to start on its own line) and is
      // stripped again on the way back in.
      const env = CODE_ENVIRONMENT[el.backend];
      w.nl();
      w.raw(`\\begin{${env}}${codeArguments(el)}\n`);
      w.raw(el.code);
      w.raw(`\n\\end{${env}}`);
      w.nl();
      return;
    }

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
      const graphic = withOpacity(`\\includegraphics${optPart}{${path}}`, el.opacity);

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

    case 'table':
      emitTable(w, el, ctx);
      return;

    case 'tikz':
      emitTikz(w, el, ctx);
      return;

    case 'block': {
      const title = el.title === undefined ? '' : emitInline(el.title);
      w.line_(`\\begin{${el.variant}}{${title}}`);
      w.indented(() => {
        emitChildren(w, el.children, ctx);
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
              emitChildren(w, col.children, ctx);
            });
            w.line_('\\end{column}');
          });
        }
      });
      w.line_('\\end{columns}');
      return;
    }

    case 'pause':
      // Everything after this appears on the next overlay of the slide. Measured: a
      // frame with two of them compiles to three pages.
      w.line_('\\pause');
      return;

    default: {
      /*
       * Unreachable, and the assignment below is what PROVES it: `el` narrows to
       * `never` here only while every `Element['kind']` has a case above, so adding a
       * kind without an emitter fails to compile.
       *
       * That proof used to be claimed and not performed -- the cast on the next line
       * was the only thing here, and a cast accepts anything. Three kinds once landed
       * in this arm and emitted NOTHING, so a modelled element simply vanished from the
       * .tex; `code.spec.ts` caught that, at runtime, long after. The cast stays as the
       * runtime net for a deck built by older code.
       */
      const exhaustive: never = el;
      const added = exhaustive as Element;
      ctx.warn({
        code: 'emit.unimplemented',
        message: `No emitter for element kind "${added.kind}"`,
        nodeId: added.id,
      });
      return;
    }
  }
}

/* -------------------------------------------------------------------- tables */

/** `l`, `c`, `r`, `p{3cm}` or `X`, prefixed by this column's vertical rule. */
function columnSpecOf(col: TableColumn): string {
  const rule = col.leftRule === 'single' ? '|' : col.leftRule === 'double' ? '||' : '';
  if (col.align === 'p') return `${rule}p{${lengthToTex(col.width ?? { v: 2, u: 'cm' })}}`;
  return `${rule}${col.align}`;
}

function ruleLine(r: RowRule): string {
  if (r.k === 'cmidrule') {
    const trim = r.trim === undefined || r.trim === '' ? '' : `(${r.trim})`;
    return `\\cmidrule${trim}{${r.from}-${r.to}}`;
  }
  return `\\${r.k}`;
}

/** The letter `\multicolumn` takes; it carries no vertical rules of its own here. */
function mergeAlignOf(el: TableElement, col: number, override: string | undefined): string {
  if (override !== undefined) return override;
  const a = el.columns[col]?.align;
  return a === 'l' || a === 'c' || a === 'r' ? a : 'l';
}

/**
 * One table row.
 *
 * A merge spans `colspan` columns, and the model keeps one cell per column so the
 * grid stays rectangular for the editor. The covered cells therefore have no place
 * in the output — emitting them would add stray `&` — so they are skipped, and a
 * covered cell that is not blank is reported rather than silently dropped.
 */
/**
 * A colour as an argument to `\rowcolor` / `\cellcolor`.
 *
 * The rgb form already carries its own `[model]{spec}`, so wrapping it in braces again
 * would produce `\rowcolor{[rgb]{...}}`, which is not a colour at all.
 */
function colorArg(c: Color): string {
  const spec = colorToTex(c);
  return spec.startsWith('[') ? spec : `{${spec}}`;
}

function emitTableRow(
  w: TexWriter,
  el: TableElement,
  row: TableRow,
  rowIndex: number,
  ctx: EmitContext,
): void {
  const parts: string[] = [];

  // colortbl's `\rowcolor` is a row PREFIX, not a cell option: it has to come before
  // the first cell of the row and it colours the whole row.
  if (row.fill !== undefined) w.line_(`\\rowcolor${colorArg(row.fill)}`);

  for (let col = 0; col < el.columns.length;) {
    const merge = el.merges.find((m) => m.row === rowIndex && m.col === col && m.colspan > 1);
    const cell = row.cells[col];
    const inner = cell === undefined ? '' : emitInline(cell.content);
    const body = cell?.fill === undefined
      ? inner
      : `\\cellcolor${colorArg(cell.fill)}${inner}`;

    if (merge === undefined) {
      parts.push(body);
      col += 1;
      continue;
    }

    const span = Math.min(merge.colspan, el.columns.length - col);
    for (let k = 1; k < span; k++) {
      const covered = row.cells[col + k];
      if (covered !== undefined && !isBlankRichText(covered.content)) {
        ctx.warn({
          code: 'emit.table-covered-cell',
          message: `Cell at row ${rowIndex + 1}, column ${col + k + 1} is hidden by a merge and will not appear`,
          nodeId: covered.id,
        });
      }
    }
    parts.push(`\\multicolumn{${span}}{${mergeAlignOf(el, col, merge.align)}}{${body}}`);
    col += span;
  }

  w.line_(`${parts.join(' & ')} \\\\`);
}

function emitTabularBody(w: TexWriter, el: TableElement, ctx: EmitContext): void {
  const spec = el.columns.map(columnSpecOf).join('')
    + (el.endRule === 'single' ? '|' : el.endRule === 'double' ? '||' : '');
  const tabularx = el.fit === 'tabularx';
  const width = lengthToTex(el.fitWidth ?? { v: 1, u: 'linewidth' });

  w.line_(tabularx
    ? `\\begin{tabularx}{${width}}{${spec}}`
    : `\\begin{tabular}{${spec}}`);
  w.indented(() => {
    if (el.topRule !== undefined) w.line_(ruleLine(el.topRule));
    el.rows.forEach((row, i) => {
      w.span(row.id, 'tablerow', () => {
        emitTableRow(w, el, row, i, ctx);
        if (row.ruleBelow !== undefined) w.line_(ruleLine(row.ruleBelow));
      });
    });
  });
  w.line_(tabularx ? '\\end{tabularx}' : '\\end{tabular}');
}

function emitTabularStack(w: TexWriter, el: TableElement, ctx: EmitContext): void {
  if (el.fit !== 'resizebox') {
    emitTabularBody(w, el, ctx);
    return;
  }
  // The trailing `%` matters: without it the newline after the opening brace becomes
  // a space inside the box, and the table sits off-centre by that space's width.
  w.line_(`\\resizebox{${lengthToTex(el.fitWidth ?? { v: 1, u: 'linewidth' })}}{!}{%`);
  w.indented(() => emitTabularBody(w, el, ctx));
  w.line_('}');
}

function emitTable(w: TexWriter, el: TableElement, ctx: EmitContext): void {
  if (el.fontSize !== undefined) {
    // A `{\small ...}` wrapper would come back from the parser as a brace group at
    // block level, which is folded into prose — so the table would survive as raw
    // rather than as a table. Use `fit` to make a table smaller instead.
    ctx.warn({
      code: 'emit.table-font-size',
      message: 'Table font size is not emitted yet; use Fit to shrink the table',
      nodeId: el.id,
    });
  }

  switch (el.floatWrapper) {
    case 'table':
      w.line_('\\begin{table}');
      w.indented(() => {
        w.line_('\\centering');
        emitTabularStack(w, el, ctx);
        if (el.caption !== undefined) w.line_(`\\caption{${emitInline(el.caption)}}`);
        if (el.label !== undefined) w.line_(`\\label{${el.label}}`);
      });
      w.line_('\\end{table}');
      return;

    case 'center':
      if (el.caption !== undefined) {
        ctx.warn({
          code: 'emit.table-caption-unplaced',
          message: 'A table caption needs the table float wrapper; it will not appear',
          nodeId: el.id,
        });
      }
      w.line_('\\begin{center}');
      w.indented(() => emitTabularStack(w, el, ctx));
      w.line_('\\end{center}');
      return;

    default:
      if (el.caption !== undefined) {
        ctx.warn({
          code: 'emit.table-caption-unplaced',
          message: 'A table caption needs the table float wrapper; it will not appear',
          nodeId: el.id,
        });
      }
      emitTabularStack(w, el, ctx);
  }
}

/**
 * Make a graphic see-through, if it is asked to be.
 *
 * Measured against the engine with an uncompressed PDF (`\pdfcompresslevel=0`) so the
 * graphics state is readable: a plain `\includegraphics` carries no alpha;
 * `\usepackage{transparent}` + `\transparent{0.4}{...}` compiles, produces a PDF, and
 * writes `ca 1, CA 1` -- no transparency whatsoever, a control that would silently lie;
 * a TikZ node with `opacity=0.4` writes `ca 0.4, CA 0.4`.
 *
 * `inner sep=0pt` so the node adds no padding around the picture, which would shift it.
 * Written on ONE line because that is what the recognizer matches, and omitted entirely
 * when there is no opacity, so an ordinary picture emits byte-for-byte what it always
 * did.
 */
function withOpacity(graphic: TexString, opacity: number | undefined): TexString {
  if (opacity === undefined || opacity >= 1) return graphic;
  const a = Math.round(Math.max(0, opacity) * 100) / 100;
  return `\\begin{tikzpicture}\\node[opacity=${a},inner sep=0pt]{${graphic}};\\end{tikzpicture}`;
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
