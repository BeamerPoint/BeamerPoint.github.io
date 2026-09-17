import {
  emitDeck, entriesOfKind,
  type Deck, type Element as DeckElement, type SourceMap,
} from '@beamerpoint/core';
import type { CompileJob, EngineCapabilities, VirtualFile } from './LatexEngine.js';
import { defaultJob } from './LatexEngine.js';

/**
 * Turn a deck into a compile job: the main .tex plus every resource it references.
 */

export interface ResourceResolver {
  /** Bytes for a resource, by its model id. */
  getBytes(resourceId: string): Promise<Uint8Array | undefined>;
}

export interface BuildOptions {
  target: 'preview' | 'export';
  capabilities?: EngineCapabilities;
  /** Cached .aux/.toc/.nav/.bbl from the previous run, to skip a second pass. */
  auxFiles?: VirtualFile[];
}

export interface BuiltProject {
  files: VirtualFile[];
  tex: string;
  sourceMap: SourceMap;
  /** Frame id -> the line its \begin{frame} sits on, for error attribution. */
  frameLines: Map<string, number>;
  warnings: string[];
}

export async function buildProject(
  deck: Deck,
  resolver: ResourceResolver,
  opts: BuildOptions,
): Promise<BuiltProject> {
  const warnings: string[] = [];
  const emitted = emitDeck(deck, { target: opts.target });

  const files: VirtualFile[] = [{ path: 'main.tex', content: emitted.tex }];

  for (const res of deck.resources) {
    const bytes = await resolver.getBytes(res.id);
    if (bytes === undefined) {
      // Only complain about a file the document will actually ask for. A resource
      // whose element has been deleted is still on the deck, and reporting it made
      // a clean compile look broken.
      if (emitted.tex.includes(res.path)) warnings.push(`Missing resource: ${res.path}`);
      continue;
    }
    files.push({ path: res.path, content: bytes });
  }

  for (const aux of opts.auxFiles ?? []) files.push(aux);

  // `minted` needs shell escape, which the WASM backends do not provide.
  if (opts.capabilities !== undefined && !opts.capabilities.shellEscape) {
    if (/\\begin\{minted\}|\\usepackage(\[[^\]]*\])?\{minted\}/.test(emitted.tex)) {
      warnings.push(
        'This deck uses minted, which needs shell escape. The in-browser engine cannot ' +
        'run it; switch those code blocks to listings, or compile with a local TeX.',
      );
    }
  }

  const frameLines = new Map<string, number>();
  for (const e of entriesOfKind(emitted.sourceMap, 'frame')) {
    frameLines.set(e.nodeId, e.startLine);
  }

  for (const w of emitted.warnings) warnings.push(w.message);

  return { files, tex: emitted.tex, sourceMap: emitted.sourceMap, frameLines, warnings };
}

/**
 * True when the deck prints a reference list.
 *
 * `ibliography{...}` lives in the BODY, on a `BibliographyElement` — the preamble
 * carries only the style. Asking the preamble alone meant a deck that had attached a
 * `.bib` and inserted a references frame, but no `ibliographystyle`, never ran BibTeX
 * and printed nothing.
 */
function needsBibtex(deck: Deck): boolean {
  if (deck.preamble.bibliography !== undefined) return true;
  const has = (els: readonly DeckElement[]): boolean => els.some((el) => {
    if (el.kind === 'bibliography') return true;
    if (el.kind === 'block') return has(el.children);
    if (el.kind === 'columns') return el.columns.some((c) => has(c.children));
    return false;
  });
  return deck.nodes.some((n) => n.kind === 'frame' && has(n.children));
}

export function jobForProject(
  project: BuiltProject,
  deck: Deck,
  overrides: Partial<CompileJob> = {},
): CompileJob {
  return defaultJob({
    files: project.files,
    mainFile: 'main.tex',
    runBibtex: needsBibtex(deck),
    // BibTeX needs at least three passes to settle: one to write the .aux, bibtex, then
    // two more for the ibitem labels to reach the citations.
    passes: needsBibtex(deck) ? 3 : 'auto',
    ...overrides,
  });
}
