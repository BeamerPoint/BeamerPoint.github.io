/**
 * The LaTeX engine abstraction.
 *
 * Nothing in the application binds to a concrete engine. The WASM backend is the
 * default because it needs no local TeX installation, but a user who has a real TeX
 * distribution can point at the local-server backend and get identical behaviour.
 *
 * The app must remain fully usable with NO engine initialised: authoring, the canvas
 * and .tex export all work before a single asset byte is downloaded.
 */

export type EngineId = 'busytex' | 'local-server';

export type TexProgram = 'pdflatex' | 'xelatex' | 'lualatex';

export interface EngineCapabilities {
  programs: TexProgram[];
  bibtex: boolean;
  /** Shell escape enables `minted`. False for the WASM backends. */
  shellEscape: boolean;
  offlineAfterInstall: boolean;
  approxAssetBytes: number;
}

export interface VirtualFile {
  /** POSIX path relative to the project root, e.g. 'images/plot.png'. */
  path: string;
  content: Uint8Array | string;
}

export interface CompileJob {
  jobId: string;
  mainFile: string;
  files: VirtualFile[];
  program: TexProgram;
  /** 'auto' reruns while .aux/.toc/.nav are unstable, to a maximum of 3 passes. */
  passes: 'auto' | 1 | 2 | 3;
  runBibtex: boolean;
  timeoutMs: number;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'fidelity';

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  file?: string;
  /** 1-based line in the main .tex file. */
  line?: number;
  /** Filled in by the caller via the emitter's source map. */
  frameId?: string;
  elementId?: string;
  raw: string;
}

export interface CompileResult {
  jobId: string;
  ok: boolean;
  pdf?: Uint8Array;
  synctex?: Uint8Array;
  log: string;
  diagnostics: Diagnostic[];
  passesRun: number;
  durationMs: number;
}

export type EngineStatus =
  | { s: 'uninitialised' }
  | { s: 'installing'; phase: string; receivedBytes: number; totalBytes: number }
  | { s: 'ready' }
  | { s: 'busy'; jobId: string; phase: string }
  | { s: 'failed'; error: string };

export interface LatexEngine {
  readonly id: EngineId;
  readonly capabilities: EngineCapabilities;
  status(): EngineStatus;
  init(opts?: { onProgress?: (s: EngineStatus) => void }): Promise<void>;
  compile(job: CompileJob, signal?: AbortSignal): Promise<CompileResult>;
  dispose(): Promise<void>;
}

export interface EngineFactory {
  id: EngineId;
  /** Cheap check for whether this backend is usable in the current environment. */
  probe(): Promise<boolean>;
  create(): LatexEngine;
}

export function defaultJob(partial: Partial<CompileJob> & Pick<CompileJob, 'files'>): CompileJob {
  return {
    jobId: partial.jobId ?? `job-${Date.now()}`,
    mainFile: partial.mainFile ?? 'main.tex',
    files: partial.files,
    program: partial.program ?? 'pdflatex',
    passes: partial.passes ?? 'auto',
    runBibtex: partial.runBibtex ?? false,
    timeoutMs: partial.timeoutMs ?? 60_000,
  };
}
