import type {
  Deck,
  DocNode,
  FrameNode,
  FrameOptions,
  Preamble,
  SectionNode,
} from '../model/types.js';
import { emitElement, type EmitContext, type EmitWarning } from './elements.js';
import { emitInline } from './inline.js';
import { derivePackages, packageLine } from './derivePackages.js';
import { TexWriter, type SourceMap } from './writer.js';

export interface EmitOptions {
  /**
   * `export` produces the file the user shares. `preview` is identical except that
   * `instrument.ts` may append frame labels to existing lines afterwards.
   */
  target?: 'export' | 'preview';
  indent?: string;
  collectSourceMap?: boolean;
}

export interface EmitResult {
  tex: string;
  sourceMap: SourceMap;
  warnings: EmitWarning[];
}

export function emitDeck(deck: Deck, opts: EmitOptions = {}): EmitResult {
  const warnings: EmitWarning[] = [];
  const ctx: EmitContext = { warn: (w) => warnings.push(w) };
  const w = new TexWriter({
    indent: opts.indent ?? '  ',
    collectSourceMap: opts.collectSourceMap ?? true,
  });

  emitPreamble(w, deck, ctx);
  w.line_('\\begin{document}');
  w.blank();

  if (deck.documentPrologue !== undefined && deck.documentPrologue.trim() !== '') {
    w.raw(deck.documentPrologue);
    w.nl();
    w.blank();
  }

  for (const node of deck.nodes) {
    emitDocNode(w, node, ctx);
    w.blank();
  }

  if (deck.documentEpilogue !== undefined && deck.documentEpilogue.trim() !== '') {
    w.raw(deck.documentEpilogue);
    w.nl();
    w.blank();
  }

  w.line_('\\end{document}');

  const { tex, sourceMap } = w.finish();
  return { tex, sourceMap, warnings };
}

/* -------------------------------------------------------------------- preamble */

function emitPreamble(w: TexWriter, deck: Deck, _ctx: EmitContext): void {
  const p: Preamble = deck.preamble;
  const dc = p.documentClass;

  // Magic comment first, so editors that read it see it before anything else.
  if (p.texProgram !== undefined) {
    w.line_(`% !TEX program = ${p.texProgram}`);
  }

  const classOpts = [
    `aspectratio=${dc.aspectRatio}`,
    `${dc.fontSize}pt`,
    ...(dc.handout ? ['handout'] : []),
    ...(dc.t ? ['t'] : []),
    ...dc.extraOptions,
  ];
  w.line_(`\\documentclass[${classOpts.join(',')}]{beamer}`);

  emitChunks(w, p, 'after-documentclass');

  // Derived packages first, then user packages that are not already covered.
  const derived = derivePackages(deck);
  const derivedNames = new Set(derived.map((d) => d.name));
  const userPackages = p.packages.filter((u) => !u.derived && !derivedNames.has(u.name));

  if (derived.length > 0 || userPackages.length > 0) w.blank();
  for (const d of derived) {
    w.line_(packageLine(d));
    for (const s of d.setup ?? []) w.line_(s);
  }
  for (const u of userPackages) w.line_(packageLine(u));

  emitChunks(w, p, 'after-packages');

  w.blank();
  w.line_(themeLine('usetheme', p.theme));
  if (p.colorTheme) w.line_(themeLine('usecolortheme', p.colorTheme));
  if (p.fontTheme) w.line_(themeLine('usefonttheme', p.fontTheme));
  if (p.innerTheme) w.line_(themeLine('useinnertheme', p.innerTheme));
  if (p.outerTheme) w.line_(themeLine('useoutertheme', p.outerTheme));
  if (!p.navigationSymbols) w.line_('\\setbeamertemplate{navigation symbols}{}');

  emitChunks(w, p, 'after-theme');

  if (p.colorDefs.length > 0) {
    w.blank();
    for (const c of p.colorDefs) {
      w.line_(`\\definecolor{${c.name}}{${c.model}}{${c.spec}}`);
    }
  }

  if (p.beamerSettings.length > 0) {
    w.blank();
    for (const s of p.beamerSettings) {
      w.line_(`\\${s.cmd}{${s.target}}${s.value}`);
    }
  }

  emitChunks(w, p, 'after-settings');

  if (p.bibliography !== undefined) {
    w.blank();
    w.line_(`\\bibliographystyle{${p.bibliography.style}}`);
  }

  // Title block.
  const m = deck.meta;
  const titled =
    m.title !== undefined || m.subtitle !== undefined ||
    m.author !== undefined || m.institute !== undefined || m.date !== undefined;
  if (titled) {
    w.blank();
    if (m.title !== undefined) w.line_(titleCommand('title', m.title, m.shortTitle));
    if (m.subtitle !== undefined) w.line_(`\\subtitle{${emitInline(m.subtitle)}}`);
    if (m.author !== undefined) w.line_(titleCommand('author', m.author, m.shortAuthor));
    if (m.institute !== undefined) w.line_(titleCommand('institute', m.institute, m.shortInstitute));
    if (m.date !== undefined) w.line_(`\\date{${emitInline(m.date)}}`);
  }

  emitChunks(w, p, 'before-document');
  w.blank();
}

function titleCommand(
  cmd: string,
  value: NonNullable<Deck['meta']['title']>,
  short: Deck['meta']['shortTitle'],
): string {
  const shortPart = short === undefined ? '' : `[${emitInline(short)}]`;
  return `\\${cmd}${shortPart}{${emitInline(value)}}`;
}

function themeLine(cmd: string, t: { name: string; options: string[] }): string {
  const opts = t.options.length > 0 ? `[${t.options.join(',')}]` : '';
  return `\\${cmd}${opts}{${t.name}}`;
}

function emitChunks(w: TexWriter, p: Preamble, slot: Preamble['custom'][number]['slot']): void {
  const chunks = p.custom.filter((c) => c.slot === slot).sort((a, b) => a.order - b.order);
  if (chunks.length === 0) return;
  w.blank();
  for (const c of chunks) {
    w.span(c.id, 'preamble-chunk', () => {
      w.raw(c.tex);
      w.nl();
    });
  }
}

/* ------------------------------------------------------------------- document */

function emitDocNode(w: TexWriter, node: DocNode, ctx: EmitContext): void {
  switch (node.kind) {
    case 'section': emitSection(w, node); return;
    case 'frame': emitFrame(w, node, ctx); return;
    case 'rawdoc':
      w.span(node.id, 'rawdoc', () => {
        w.nl();
        w.raw(node.tex);
        w.nl();
      });
      return;
  }
}

function emitSection(w: TexWriter, node: SectionNode): void {
  w.span(node.id, 'section', () => {
    for (const c of node.leadingComments ?? []) w.line_(`%${c}`);
    const star = node.starred ? '*' : '';
    const short = node.shortTitle === undefined ? '' : `[${emitInline(node.shortTitle)}]`;
    w.line_(`\\${node.level}${star}${short}{${emitInline(node.title)}}`);
  });
}

function emitFrame(w: TexWriter, frame: FrameNode, ctx: EmitContext): void {
  w.span(frame.id, 'frame', () => {
    for (const c of frame.leadingComments ?? []) w.line_(`%${c}`);

    const opts = frameOptionList(frame, ctx);
    const optPart = opts.length > 0 ? `[${opts.join(',')}]` : '';
    const overlay = frame.overlay ?? '';
    w.line_(`\\begin{frame}${overlay}${optPart}`);

    w.indented(() => {
      if (frame.title !== undefined) {
        const short = frame.shortTitle === undefined ? '' : `[${emitInline(frame.shortTitle)}]`;
        w.line_(`\\frametitle${short}{${emitInline(frame.title)}}`);
      }
      if (frame.subtitle !== undefined) {
        w.line_(`\\framesubtitle{${emitInline(frame.subtitle)}}`);
      }
      if (frame.title !== undefined || frame.subtitle !== undefined) w.blank();

      for (const el of frame.children) emitElement(w, el, ctx);

      for (const note of frame.notes) {
        w.span(note.id, 'note', () => {
          w.line_(`\\note${note.options ?? ''}{${emitInline(note.content)}}`);
        });
      }
    });

    w.line_('\\end{frame}');
  });
}

/**
 * Build the frame's option list.
 *
 * `fragile` is derived, not authored: a frame containing verbatim-like content will
 * not compile without it, and requiring the user to know that defeats the point of a
 * visual editor.
 */
function frameOptionList(frame: FrameNode, _ctx: EmitContext): string[] {
  const o: FrameOptions = frame.options;
  const out: string[] = [];

  const needsFragile = frameNeedsFragile(frame);
  const fragile = o.fragile ?? (needsFragile ? true : undefined);

  if (o.vAlign !== undefined) out.push(o.vAlign);
  if (o.plain) out.push('plain');
  if (fragile === 'singleslide') out.push('fragile=singleslide');
  else if (fragile) out.push('fragile');
  if (o.allowframebreaks) out.push('allowframebreaks');
  if (o.noframenumbering) out.push('noframenumbering');
  if (o.squeeze) out.push('squeeze');
  if (o.shrink !== undefined) out.push(o.shrink === true ? 'shrink' : `shrink=${o.shrink}`);
  if (o.label !== undefined) out.push(`label=${o.label}`);
  for (const e of o.extra ?? []) out.push(e);

  return out;
}

export function frameNeedsFragile(frame: FrameNode): boolean {
  let found = false;
  const visit = (els: FrameNode['children']): void => {
    for (const el of els) {
      if (found) return;
      if (el.kind === 'code') { found = true; return; }
      if (el.kind === 'block') visit(el.children);
      if (el.kind === 'columns') el.columns.forEach((c) => visit(c.children));
      if (el.kind === 'raw' && /\\begin\{(lstlisting|verbatim|minted|semiverbatim)\}/.test(el.tex)) {
        found = true;
        return;
      }
    }
  };
  visit(frame.children);
  return found;
}

/**
 * Emit a single frame in isolation, using the same code path as a full document.
 *
 * The round-trip guard compares against this, so it must never be a reimplementation:
 * a second copy of the frame emitter would drift and make the guard lie.
 */
export function emitFrameStandalone(frame: FrameNode): string {
  const w = new TexWriter({ collectSourceMap: false });
  const ctx: EmitContext = { warn: () => undefined };
  emitFrame(w, frame, ctx);
  return w.finish().tex;
}
