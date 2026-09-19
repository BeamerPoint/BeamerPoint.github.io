/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import type { CstNode } from '../parse/cst.js';
import { buildCst } from '../parse/lexer.js';

/**
 * A multi-file LaTeX project, merged into the one document BeamerPoint edits.
 *
 * Real Beamer projects -- Overleaf's "Download source" among them -- keep slides in
 * separate files and pull them in with `\input{slides/intro}`. Without this, each of
 * those commands stayed an opaque raw block and none of the slides inside them could be
 * edited. Every include is replaced by the file it names, recursively, BEFORE parsing,
 * so the parser sees one ordinary document; the split-file layout is deliberately not
 * kept (the user's decision: merge into one deck).
 *
 * The includes are found with the lexer, not a regex, so a commented-out `%\input{x}`
 * and an `\input` inside a `verbatim` or `lstlisting` body are left alone -- exactly
 * where a regex would inline the wrong thing.
 */

const INCLUDE_COMMANDS: ReadonlySet<string> = new Set([
  'input', 'include', 'subfile', 'import', 'subimport', 'inputfrom', 'subinputfrom',
  'includefrom', 'subincludefrom',
]);
/** The `import` package's commands, whose FIRST argument is a directory. */
const DIR_FIRST: ReadonlySet<string> = new Set([
  'import', 'subimport', 'inputfrom', 'subinputfrom', 'includefrom', 'subincludefrom',
]);
/** `\subimport` and friends resolve relative to the file they are written in. */
const RELATIVE_TO_CURRENT: ReadonlySet<string> = new Set([
  'subimport', 'subinputfrom', 'subincludefrom',
]);

const MAX_DEPTH = 20;

export interface InlineResult {
  /** The merged document. */
  source: string;
  /** Project paths that were inlined, in the order they were first reached. */
  inlined: string[];
  /** Include targets that no project file matched; the command is left in place. */
  missing: string[];
}

/** POSIX-normalise a project path: no `./`, `..` resolved, no leading slash. */
export function normalizePath(p: string): string {
  const out: string[] = [];
  for (const part of p.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function dirOf(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

function join(dir: string, name: string): string {
  return normalizePath(dir === '' ? name : `${dir}/${name}`);
}

/** TeX tries the name as written, then with `.tex`. */
function resolveTex(files: ReadonlyMap<string, string>, dir: string, name: string): string | null {
  const base = join(dir, name.trim());
  for (const candidate of [base, `${base}.tex`]) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

/** The contents of a group, without its braces. */
function groupText(src: string, g: { span: { start: number; end: number } }): string {
  return src.slice(g.span.start + 1, g.span.end - 1);
}

/** A `\subfile` target is a whole document; only its body belongs in the parent. */
function subfileBody(text: string): string {
  const begin = text.indexOf('\\begin{document}');
  const end = text.lastIndexOf('\\end{document}');
  if (begin === -1 || end === -1 || end < begin) return text;
  return text.slice(begin + '\\begin{document}'.length, end);
}

interface Hit {
  start: number;
  end: number;
  cmd: string;
  dir: string | null;
  name: string;
}

/** Every include command in a file, with the span it occupies. */
function findIncludes(src: string): Hit[] {
  const { root } = buildCst(src);
  const hits: Hit[] = [];

  const walk = (nodes: readonly CstNode[]): void => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      if (node.n === 'cmd') {
        if (INCLUDE_COMMANDS.has(node.name)) {
          if (DIR_FIRST.has(node.name) && node.args.length >= 2) {
            hits.push({
              start: node.span.start, end: node.span.end, cmd: node.name,
              dir: groupText(src, node.args[0]!), name: groupText(src, node.args[1]!),
            });
            continue;
          }
          if (!DIR_FIRST.has(node.name) && node.args.length >= 1) {
            hits.push({
              start: node.span.start, end: node.span.end, cmd: node.name,
              dir: null, name: groupText(src, node.args[0]!),
            });
            continue;
          }
          // The plain-TeX form, `\input slides/a`: the name is the next word of text.
          const next = nodes[i + 1];
          if (node.name === 'input' && node.args.length === 0 && next?.n === 'text') {
            const m = /^[ \t]+([^\s%{}\\]+)/.exec(next.value);
            if (m !== null) {
              hits.push({
                start: node.span.start, end: next.span.start + m[0].length,
                cmd: node.name, dir: null, name: m[1]!,
              });
              i += 1;
              continue;
            }
          }
        }
        for (const g of [...node.opts, ...node.args]) walk(g.children);
      } else if (node.n === 'group' || node.n === 'env') {
        walk(node.children);
      }
    }
  };

  walk(root);
  return hits;
}

/**
 * Merge a project into one document, starting from `mainPath`.
 *
 * Paths resolve as TeX resolves them: relative to the MAIN file's directory, except
 * `\subimport` and friends, which are relative to the file they appear in. A target that
 * cannot be found is left exactly as written and reported, so it stays visible as a raw
 * block rather than silently vanishing.
 */
export function inlineInputs(files: ReadonlyMap<string, string>, mainPath: string): InlineResult {
  const main = normalizePath(mainPath);
  const rootDir = dirOf(main);
  const inlined: string[] = [];
  const missing: string[] = [];

  const expand = (path: string, text: string, stack: readonly string[], importDir: string): string => {
    const hits = findIncludes(text);
    // Built forwards, piece by piece, so the reports come out in reading order and the
    // spans -- all measured against the untouched `text` -- stay valid.
    let out = '';
    let pos = 0;
    for (const hit of hits) {
      out += text.slice(pos, hit.start);
      pos = hit.start;
      const base = hit.dir === null
        ? importDir
        : RELATIVE_TO_CURRENT.has(hit.cmd)
          ? join(dirOf(path), hit.dir)
          : join(rootDir, hit.dir);
      const target = resolveTex(files, base, hit.name);
      if (target === null) {
        missing.push(join(base, hit.name));
        continue;
      }
      if (stack.includes(target) || stack.length >= MAX_DEPTH) {
        missing.push(`${target} (circular include)`);
        continue;
      }
      if (!inlined.includes(target)) inlined.push(target);
      let body = files.get(target)!;
      if (hit.cmd === 'subfile') body = subfileBody(body);
      // An \import changes where the included file's OWN includes resolve.
      const nextDir = hit.dir === null ? importDir : base;
      const expanded = expand(target, body, [...stack, target], nextDir);
      // TeX ends an \input file with an end-of-line, which is a space, not a paragraph.
      out += `${expanded.replace(/\s+$/, '')}\n`;
      pos = hit.end;
    }
    return out + text.slice(pos);
  };

  const text = files.get(main);
  if (text === undefined) return { source: '', inlined, missing: [main] };
  const source = expand(main, text, [main], rootDir);
  return { source, inlined, missing: [...new Set(missing)] };
}

/* ------------------------------------------------------------------ graphics */

/**
 * pdflatex's graphics extensions, in the order graphicx tries them (`\Gin@extensions`
 * in pdftex.def). A path written with one of these is taken as it is.
 */
const GRAPHIC_EXTENSIONS: readonly string[] = [
  '.pdf', '.png', '.jpg', '.mps', '.jpeg', '.jbig2', '.jb2',
  '.PDF', '.PNG', '.JPG', '.JPEG', '.JBIG2', '.JB2', '.eps',
];

/** The directories of `\graphicspath{{a/}{b/}}`, in order, from a document. */
export function graphicsPaths(source: string): string[] {
  const { root } = buildCst(source);
  const out: string[] = [];
  const walk = (nodes: readonly CstNode[]): void => {
    for (const node of nodes) {
      if (node.n === 'cmd' && node.name === 'graphicspath' && node.args[0] !== undefined) {
        for (const child of node.args[0].children) {
          if (child.n === 'group') out.push(groupText(source, child));
        }
      } else if (node.n === 'group' || node.n === 'env') {
        walk(node.children);
      }
    }
  };
  walk(root);
  return out;
}

/**
 * The project file an `\includegraphics{written}` names, found as graphicx finds it.
 *
 * The document's own directory first, then each `\graphicspath` entry; a name written
 * without an extension tries pdflatex's extensions in their order. So
 * `\includegraphics{plot}` with `\graphicspath{{figures/}}` is `figures/plot.png`, which
 * is where the bytes have to be stored for the compile AND the canvas to find them.
 */
export function resolveGraphicPath(
  written: string,
  paths: readonly string[],
  available: ReadonlySet<string>,
  baseDir = '',
): string | null {
  const name = written.trim();
  const hasExt = GRAPHIC_EXTENSIONS.some((e) => name.endsWith(e));
  const dirs = [baseDir, ...paths.map((p) => join(baseDir, p))];
  for (const dir of dirs) {
    const stem = join(dir, name);
    const candidates = hasExt ? [stem] : GRAPHIC_EXTENSIONS.map((e) => `${stem}${e}`);
    for (const c of candidates) if (available.has(c)) return c;
  }
  return null;
}
