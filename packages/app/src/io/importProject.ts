/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import JSZip from 'jszip';
import {
  buildCst, graphicsPaths, inlineInputs, normalizePath, resolveGraphicPath,
  type CstNode,
} from '@beamerpoint/core';
import { analyseImport, type ImportAnalysis } from './importTex.js';

/**
 * Importing a whole Beamer project from a `.zip` -- the shape Overleaf's "Download
 * source" produces: a main file that `\input`s its slides from other files, images in
 * folders, a `.bib`, sometimes local `.sty` or theme files.
 *
 * The slide files are MERGED into one document (`inlineInputs`), so every slide becomes
 * editable. Everything else keeps its path: images become the deck's image resources at
 * their real location, and every other file is stored as a support file, so the compiler
 * finds a local `.sty` or `\graphicspath` folder exactly as it would on the author's
 * machine, and export writes it all back.
 */

export interface ProjectFile {
  path: string;
  bytes: Uint8Array;
  /** The UTF-8 text, for anything that decodes as text; null for binary files. */
  text: string | null;
}

export interface Project {
  /** The archive's name, for the dialog. */
  name: string;
  files: Map<string, ProjectFile>;
}

/** What the zip import adds to an ordinary `.tex` analysis. */
export interface ProjectPlan {
  main: string;
  /** Every file that could be the main document, for the dialog's choice. */
  mainCandidates: string[];
  /** Slide files merged into the deck. */
  inlined: string[];
  /** `\input`s that named a file the archive does not contain. */
  missingInputs: string[];
  /** Resource id -> the project file its `\includegraphics` resolves to. */
  images: Map<string, string>;
  /** Stored as they are, at their paths: `.sty`, `.bib`, unreferenced images, data. */
  support: ProjectFile[];
  supportBytes: number;
  /** Figures pdflatex cannot use here: `.eps` needs a shell-escape conversion. */
  eps: string[];
}

export interface ProjectAnalysis extends ImportAnalysis {
  project: ProjectPlan;
}

/** Operating-system litter and LaTeX build output: never part of the project. */
function isJunk(path: string): boolean {
  const name = path.split('/').pop() ?? path;
  return path.startsWith('__MACOSX/')
    || name === '.DS_Store' || name === 'Thumbs.db' || name.startsWith('._')
    || /\.(aux|log|out|nav|snm|toc|vrb|fls|fdb_latexmk|synctex\.gz|synctex|bbl|blg|bcf|run\.xml)$/i.test(name);
}

const TEXT_EXTENSIONS = /\.(tex|ltx|sty|cls|bib|bst|def|cfg|dtx|ins|txt|csv|dat|tikz|pgf|lua|md)$/i;

function decodeText(path: string, bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // An old Latin-1 `.tex` is still text; anything else that is not UTF-8 is binary.
    return TEXT_EXTENSIONS.test(path) ? new TextDecoder('latin1').decode(bytes) : null;
  }
}

/** Read an archive into project-relative paths, dropping a single wrapping folder. */
export async function readProjectZip(file: Blob, name = 'project.zip'): Promise<Project> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  const raw: Array<{ path: string; entry: JSZip.JSZipObject }> = entries
    .map((entry) => ({ path: normalizePath(entry.name), entry }))
    .filter(({ path }) => path !== '' && !isJunk(path));

  // `project/main.tex`, `project/figures/a.png`: the wrapper is not part of any path the
  // document writes, so it has to go.
  const firstParts = new Set(raw.map(({ path }) => path.split('/')[0]));
  const wrapped = firstParts.size === 1 && raw.every(({ path }) => path.includes('/'));
  const prefix = wrapped ? `${[...firstParts][0]}/` : '';

  const files = new Map<string, ProjectFile>();
  for (const { path, entry } of raw) {
    const rel = path.slice(prefix.length);
    const bytes = await entry.async('uint8array');
    files.set(rel, { path: rel, bytes, text: decodeText(rel, bytes) });
  }
  return { name, files };
}

/** True when the lexer finds `\documentclass` and a `document` environment at top level. */
function isMainDocument(text: string): boolean {
  const { root } = buildCst(text);
  const has = (pred: (n: CstNode) => boolean): boolean => root.some(pred);
  return has((n) => n.n === 'cmd' && n.name === 'documentclass')
    && has((n) => n.n === 'env' && n.name === 'document');
}

/** Documents in the archive that could be the main file, the likeliest first. */
export function findMainCandidates(project: Project): string[] {
  const found = [...project.files.values()]
    .filter((f) => /\.(tex|ltx)$/i.test(f.path) && f.text !== null && isMainDocument(f.text))
    .map((f) => f.path);
  const rank = (p: string): number => {
    const name = p.split('/').pop()!.toLowerCase();
    const depth = p.split('/').length;
    return (name === 'main.tex' ? 0 : name === 'presentation.tex' || name === 'slides.tex' ? 1 : 2) * 10 + depth;
  };
  return found.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * Merge the project from `main` and analyse it as an import.
 *
 * `report.missingResources` lists only what the ARCHIVE could not supply, so the
 * dialog's "pick images" step is left for what is genuinely absent.
 */
export function analyseProject(project: Project, main: string): ProjectAnalysis {
  const texts = new Map<string, string>();
  for (const f of project.files.values()) if (f.text !== null) texts.set(f.path, f.text);

  const merged = inlineInputs(texts, main);
  const base = analyseImport(merged.source);

  const available = new Set(project.files.keys());
  const paths = graphicsPaths(merged.source);
  const mainDir = main.includes('/') ? main.slice(0, main.lastIndexOf('/')) : '';

  const images = new Map<string, string>();
  const unresolved: string[] = [];
  for (const ref of base.deck.resources) {
    const hit = resolveGraphicPath(ref.path, paths, available, mainDir);
    if (hit !== null) images.set(ref.id, hit);
    else unresolved.push(ref.path);
  }

  // Everything that is not the merged text and not already an image resource is kept as
  // a support file: a local theme, a .bib, an image only raw LaTeX mentions, a data file.
  const consumed = new Set([main, ...merged.inlined, ...images.values()]);
  const mainStem = main.replace(/\.(tex|ltx)$/i, '');
  const support = [...project.files.values()].filter((f) =>
    !consumed.has(f.path) && f.path !== `${mainStem}.pdf`);

  const eps = [...images.values(), ...support.map((f) => f.path)]
    .filter((p) => /\.eps$/i.test(p));

  return {
    deck: base.deck,
    report: { ...base.report, missingResources: unresolved },
    project: {
      main,
      mainCandidates: findMainCandidates(project),
      inlined: merged.inlined,
      missingInputs: merged.missing,
      images,
      support,
      supportBytes: support.reduce((n, f) => n + f.bytes.byteLength, 0),
      eps,
    },
  };
}

/** True for a file the project import should take. */
export function isZipFile(file: File): boolean {
  return /\.zip$/i.test(file.name)
    || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
}
