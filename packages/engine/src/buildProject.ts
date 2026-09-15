import { emitDeck, entriesOfKind, type Deck, type SourceMap } from '@beamerpoint/core';
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
      warnings.push(`Missing resource: ${res.path}`);
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

export function jobForProject(
  project: BuiltProject,
  deck: Deck,
  overrides: Partial<CompileJob> = {},
): CompileJob {
  return defaultJob({
    files: project.files,
    mainFile: 'main.tex',
    runBibtex: deck.preamble.bibliography !== undefined,
    ...overrides,
  });
}
