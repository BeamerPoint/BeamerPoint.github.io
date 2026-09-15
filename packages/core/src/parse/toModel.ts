import type {
  AspectRatio,
  ColorDef,
  Deck,
  DeckMeta,
  DocNode,
  FrameNode,
  FrameOptions,
  Id,
  NoteSpec,
  PackageSpec,
  Preamble,
  PreambleSlot,
  RichText,
  SectionNode,
  ThemeRef,
} from '../model/types.js';
import { defaultPreamble } from '../model/factory.js';
import { frameNeedsFragile } from '../emit/deck.js';
import { isDerivedSetupLine } from '../emit/derivePackages.js';
import type { CstGroup, CstNode } from './cst.js';
import { parseInline, trimRichText } from './inline.js';
import { recognizeElements, type RecognizeCtx } from './recognizers/elements.js';

export interface ToModelResult {
  deck: Deck;
  /** Text outside \begin{document} that we could not classify, for reporting. */
  unknownPreambleChunks: number;
}

const THEME_COMMANDS: ReadonlySet<string> = new Set([
  'usetheme', 'usecolortheme', 'usefonttheme', 'useinnertheme', 'useoutertheme',
]);

const BEAMER_SETTING_COMMANDS: ReadonlySet<string> = new Set([
  'setbeamercolor', 'setbeamerfont', 'setbeamertemplate',
  'setbeamersize', 'setbeamercovered',
]);

const TITLE_COMMANDS: ReadonlySet<string> = new Set([
  'title', 'subtitle', 'author', 'institute', 'date', 'titlegraphic',
]);

const SECTION_LEVELS: Readonly<Record<string, SectionNode['level']>> = {
  part: 'part',
  section: 'section',
  subsection: 'subsection',
  subsubsection: 'subsubsection',
};

export function toModel(root: CstNode[], src: string, newId: () => Id, deckId: Id): ToModelResult {
  const ctx: RecognizeCtx = { src, newId };

  const docIdx = root.findIndex((n) => n.n === 'env' && n.name === 'document');
  const preambleNodes = docIdx === -1 ? root : root.slice(0, docIdx);
  const documentNode = docIdx === -1 ? null : root[docIdx]!;

  const meta: DeckMeta = {};
  const { preamble, unknownChunks } = parsePreamble(preambleNodes, meta, ctx);

  const nodes: DocNode[] =
    documentNode !== null && documentNode.n === 'env'
      ? parseDocumentBody(documentNode.children, ctx)
      : [];

  return {
    deck: {
      schemaVersion: 1,
      id: deckId,
      meta,
      preamble,
      nodes,
      resources: [],
    },
    unknownPreambleChunks: unknownChunks,
  };
}

/* ------------------------------------------------------------------ preamble */

function parsePreamble(
  nodes: CstNode[],
  meta: DeckMeta,
  ctx: RecognizeCtx,
): { preamble: Preamble; unknownChunks: number } {
  const p = defaultPreamble();
  p.packages = [];
  let slot: PreambleSlot = 'after-documentclass';
  let order = 0;
  let unknownChunks = 0;
  let sawTheme = false;
  let sawDocumentClass = false;

  const pushChunk = (tex: string): void => {
    unknownChunks += 1;
    p.custom.push({ id: ctx.newId(), slot, tex, order: (order += 1) });
  };

  let pendingComments: string[] = [];
  const flushComments = (): void => {
    if (pendingComments.length === 0) return;
    pushChunk(pendingComments.map((c) => `%${c}`).join('\n'));
    pendingComments = [];
  };

  for (const node of nodes) {
    if (node.n === 'text' && node.value.trim() === '') continue;
    if (node.n === 'parbreak') continue;

    if (node.n === 'comment') {
      // `% !TEX program = xelatex` is configuration, not a comment to preserve
      // verbatim: re-emitting it from a chunk as well would duplicate it.
      const magic = /^\s*!TEX\s+program\s*=\s*(pdflatex|xelatex|lualatex)\s*$/i
        .exec(node.value);
      if (magic !== null) {
        p.texProgram = magic[1]!.toLowerCase() as NonNullable<Preamble['texProgram']>;
        continue;
      }
      pendingComments.push(node.value);
      continue;
    }

    if (node.n !== 'cmd') {
      flushComments();
      pushChunk(slice(ctx.src, node));
      continue;
    }

    const { name, args, opts, star } = node;

    if (name === 'documentclass' && args.length === 1) {
      flushComments();
      applyDocumentClass(p, opts[0], ctx.src);
      sawDocumentClass = true;
      continue;
    }

    if (name === 'usepackage' && args.length === 1) {
      flushComments();
      if (!sawTheme) slot = 'after-packages';
      p.packages.push({
        name: literal(ctx.src, args[0]!),
        options: splitOptions(opts[0], ctx.src),
      });
      continue;
    }

    if (THEME_COMMANDS.has(name) && args.length === 1) {
      flushComments();
      sawTheme = true;
      slot = 'after-theme';
      const ref: ThemeRef = {
        name: literal(ctx.src, args[0]!),
        options: splitOptions(opts[0], ctx.src),
      };
      switch (name) {
        case 'usetheme': p.theme = ref; break;
        case 'usecolortheme': p.colorTheme = ref; break;
        case 'usefonttheme': p.fontTheme = ref; break;
        case 'useinnertheme': p.innerTheme = ref; break;
        case 'useoutertheme': p.outerTheme = ref; break;
      }
      continue;
    }

    if (name === 'setbeamertemplate' && args.length === 2 &&
        literal(ctx.src, args[0]!).trim() === 'navigation symbols' &&
        args[1]!.children.length === 0) {
      flushComments();
      p.navigationSymbols = false;
      slot = 'after-settings';
      continue;
    }

    if (name === 'definecolor' && args.length === 3) {
      flushComments();
      slot = 'after-settings';
      const def: ColorDef = {
        id: ctx.newId(),
        name: literal(ctx.src, args[0]!),
        model: literal(ctx.src, args[1]!) as ColorDef['model'],
        spec: literal(ctx.src, args[2]!),
      };
      p.colorDefs.push(def);
      continue;
    }

    if (BEAMER_SETTING_COMMANDS.has(name) && args.length >= 1) {
      flushComments();
      slot = 'after-settings';
      const target = literal(ctx.src, args[0]!);
      const value = ctx.src.slice(args[0]!.span.end, node.span.end);
      p.beamerSettings.push({
        id: ctx.newId(),
        cmd: name as (typeof p.beamerSettings)[number]['cmd'],
        target,
        value,
      });
      continue;
    }

    if (name === 'bibliographystyle' && args.length === 1) {
      flushComments();
      p.bibliography = { files: [], style: literal(ctx.src, args[0]!), backend: 'bibtex' };
      continue;
    }

    if (TITLE_COMMANDS.has(name) && args.length === 1 && !star) {
      flushComments();
      slot = 'before-document';
      applyTitleCommand(meta, name, args[0]!, opts[0], ctx);
      continue;
    }

    // Setup lines owned by the emitter's derived packages are absorbed, not stored:
    // recording them here would duplicate them on the next emit.
    if (isDerivedSetupLine(slice(ctx.src, node))) {
      flushComments();
      continue;
    }

    flushComments();
    pushChunk(slice(ctx.src, node));
  }

  flushComments();

  if (!sawDocumentClass) {
    // Not a document we produced; keep the default class so emission still works.
    unknownChunks += 1;
  }

  return { preamble: p, unknownChunks };
}

function applyDocumentClass(p: Preamble, opts: CstGroup | undefined, src: string): void {
  const dc = p.documentClass;
  dc.extraOptions = [];
  for (const raw of splitOptions(opts, src)) {
    const opt = raw.trim();
    if (opt === '') continue;

    const aspect = /^aspectratio=(\d+)$/.exec(opt);
    if (aspect !== null) { dc.aspectRatio = aspect[1] as AspectRatio; continue; }

    const size = /^(\d+)pt$/.exec(opt);
    if (size !== null) { dc.fontSize = Number(size[1]) as Preamble['documentClass']['fontSize']; continue; }

    if (opt === 'handout') { dc.handout = true; continue; }
    if (opt === 't') { dc.t = true; continue; }

    dc.extraOptions.push(opt);
  }
}

function applyTitleCommand(
  meta: DeckMeta,
  name: string,
  arg: CstGroup,
  shortArg: CstGroup | undefined,
  ctx: RecognizeCtx,
): void {
  const value = trimRichText(parseInline(arg.children, ctx.src));
  const short = shortArg === undefined
    ? undefined
    : trimRichText(parseInline(shortArg.children, ctx.src));

  switch (name) {
    case 'title':
      meta.title = value;
      if (short !== undefined) meta.shortTitle = short;
      return;
    case 'subtitle': meta.subtitle = value; return;
    case 'author':
      meta.author = value;
      if (short !== undefined) meta.shortAuthor = short;
      return;
    case 'institute':
      meta.institute = value;
      if (short !== undefined) meta.shortInstitute = short;
      return;
    case 'date': meta.date = value; return;
    default: return;
  }
}

/* ------------------------------------------------------------------ document */

function parseDocumentBody(nodes: CstNode[], ctx: RecognizeCtx): DocNode[] {
  const out: DocNode[] = [];
  let comments: string[] = [];
  let strays: CstNode[] = [];

  const flushStrays = (): void => {
    const significant = strays.filter(
      (n) => !(n.n === 'parbreak' || (n.n === 'text' && n.value.trim() === '')),
    );
    if (significant.length > 0) {
      const first = significant[0]!;
      const last = significant[significant.length - 1]!;
      out.push({
        kind: 'rawdoc',
        id: ctx.newId(),
        tex: ctx.src.slice(first.span.start, last.span.end),
        reason: 'unrecognised',
        src: first.span,
      });
    }
    strays = [];
  };

  const attachComments = <T extends { leadingComments?: string[] }>(node: T): T => {
    if (comments.length > 0) {
      node.leadingComments = comments;
      comments = [];
    }
    return node;
  };

  for (const node of nodes) {
    if (node.n === 'text' && node.value.trim() === '') continue;
    if (node.n === 'parbreak') continue;

    if (node.n === 'comment') {
      flushStrays();
      comments.push(node.value);
      continue;
    }

    if (node.n === 'env' && node.name === 'frame') {
      flushStrays();
      out.push(attachComments(parseFrame(node, ctx)));
      continue;
    }

    if (node.n === 'cmd' && SECTION_LEVELS[node.name] !== undefined && node.args.length === 1) {
      flushStrays();
      const section: SectionNode = {
        kind: 'section',
        id: ctx.newId(),
        level: SECTION_LEVELS[node.name]!,
        title: trimRichText(parseInline(node.args[0]!.children, ctx.src)),
        starred: node.star,
        src: node.span,
      };
      if (node.opts.length === 1) {
        section.shortTitle = trimRichText(parseInline(node.opts[0]!.children, ctx.src));
      }
      out.push(attachComments(section));
      continue;
    }

    strays.push(node);
  }

  flushStrays();
  if (comments.length > 0) {
    out.push({
      kind: 'rawdoc',
      id: ctx.newId(),
      tex: comments.map((c) => `%${c}`).join('\n'),
      reason: 'unrecognised',
    });
  }

  return out;
}

function parseFrame(node: Extract<CstNode, { n: 'env' }>, ctx: RecognizeCtx): FrameNode {
  const frame: FrameNode = {
    kind: 'frame',
    id: ctx.newId(),
    options: parseFrameOptions(node.opts[0], ctx.src),
    children: [],
    notes: [],
    src: node.span,
  };

  // `\begin{frame}{Title}{Subtitle}` shorthand.
  if (node.args.length >= 1) {
    frame.title = trimRichText(parseInline(node.args[0]!.children, ctx.src));
  }
  if (node.args.length >= 2) {
    frame.subtitle = trimRichText(parseInline(node.args[1]!.children, ctx.src));
  }

  // Pull frame metadata commands out of the body before element recognition.
  const body: CstNode[] = [];
  const notes: NoteSpec[] = [];

  for (const child of node.children) {
    if (child.n === 'cmd' && child.name === 'frametitle' && child.args.length === 1) {
      frame.title = trimRichText(parseInline(child.args[0]!.children, ctx.src));
      if (child.opts.length === 1) {
        frame.shortTitle = trimRichText(parseInline(child.opts[0]!.children, ctx.src));
      }
      continue;
    }
    if (child.n === 'cmd' && child.name === 'framesubtitle' && child.args.length === 1) {
      frame.subtitle = trimRichText(parseInline(child.args[0]!.children, ctx.src));
      continue;
    }
    if (child.n === 'cmd' && child.name === 'note' && child.args.length === 1) {
      const note: NoteSpec = {
        id: ctx.newId(),
        content: trimRichText(parseInline(child.args[0]!.children, ctx.src)),
      };
      if (child.opts.length === 1) {
        note.options = ctx.src.slice(child.opts[0]!.span.start, child.opts[0]!.span.end);
      }
      notes.push(note);
      continue;
    }
    body.push(child);
  }

  frame.children = recognizeElements(body, ctx);
  frame.notes = notes;

  // `fragile` is derived on emit. Drop an explicit one when it would be re-derived,
  // so emit(parse(x)) is a fixpoint rather than accumulating a duplicate option.
  if (frame.options.fragile === true && frameNeedsFragile(frame)) {
    delete frame.options.fragile;
  }

  return frame;
}

function parseFrameOptions(opts: CstGroup | undefined, src: string): FrameOptions {
  const out: FrameOptions = {};
  const extra: string[] = [];

  for (const raw of splitOptions(opts, src)) {
    const opt = raw.trim();
    if (opt === '') continue;

    if (opt === 't' || opt === 'c' || opt === 'b') { out.vAlign = opt; continue; }
    if (opt === 'plain') { out.plain = true; continue; }
    if (opt === 'fragile') { out.fragile = true; continue; }
    if (opt === 'fragile=singleslide') { out.fragile = 'singleslide'; continue; }
    if (opt === 'allowframebreaks') { out.allowframebreaks = true; continue; }
    if (opt === 'noframenumbering') { out.noframenumbering = true; continue; }
    if (opt === 'squeeze') { out.squeeze = true; continue; }
    if (opt === 'shrink') { out.shrink = true; continue; }

    const shrink = /^shrink=(\d+)$/.exec(opt);
    if (shrink !== null) { out.shrink = Number(shrink[1]); continue; }

    const label = /^label=(.+)$/.exec(opt);
    if (label !== null) { out.label = label[1]!; continue; }

    extra.push(opt);
  }

  if (extra.length > 0) out.extra = extra;
  return out;
}

/* ------------------------------------------------------------------- helpers */

function slice(src: string, node: CstNode): string {
  return src.slice(node.span.start, node.span.end);
}

/** Interior of a `{...}` or `[...]` group, without the delimiters. */
function literal(src: string, g: CstGroup): string {
  return src.slice(g.span.start + 1, g.span.end - 1);
}

/** Split a bracket group on top-level commas. */
function splitOptions(g: CstGroup | undefined, src: string): string[] {
  if (g === undefined) return [];
  const inner = literal(src, g);
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]!;
    if (c === '{' || c === '[') depth += 1;
    else if (c === '}' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) {
      out.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  out.push(inner.slice(start));
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

export type { PackageSpec, RichText };
