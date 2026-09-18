import type {
  CompileJob,
  CompileResult,
  EngineCapabilities,
  EngineStatus,
  LatexEngine,
} from '../../LatexEngine.js';
import { toCompileResult, type BackendResult } from '../../compileResult.js';
import { COLLECTIONS, type Collection } from '../../packageIndex.js';

/**
 * TeX Live 2026 compiled to WebAssembly, running in its own worker.
 *
 * Measured against the shipped manifests: beamer, tikz and booktabs are all in
 * *recommended*, while packages such as `textpos` are in *extra* only. So a deck can
 * look like it compiles fine on an install that is missing `extra`, right up until it
 * uses the first extra-only package. All three are downloaded, and
 * `installedCollections()` exists so a failure can tell the difference between "not
 * bundled" and "bundled but not here".
 *
 * That is a large one-time download, which is why `init()` is never called implicitly —
 * the user opts in from the UI, and everything except compilation works without it.
 */

export interface BusytexOptions {
  /** Where the WASM and .data bundles are served from. */
  basePath?: string;
  /** Cumulative collections. `extra` is needed for textpos and other extras. */
  collections?: Collection[];
  /** Optional on-demand package endpoint for anything beyond the bundles. */
  remoteEndpoint?: string;
}

const DEFAULT_BASE = '/core/busytex';

/** Approximate download sizes, used for the opt-in dialog. */
export const COLLECTION_BYTES: Readonly<Record<string, number>> = {
  basic: 90 * 1024 * 1024,
  recommended: 200 * 1024 * 1024,
  extra: 340 * 1024 * 1024,
};

interface BusytexRunnerLike {
  initialize(useWorker?: boolean): Promise<void>;
  terminate?(): void;
  isPackageCached?(packageJsUrl: string): Promise<boolean>;
  clearPreloadDataPackageCache?(): Promise<void>;
}

interface BusytexEngineLike {
  compile(opts: {
    input: string;
    bibtex?: boolean;
    rerun?: boolean;
    verbose?: 'silent' | 'info' | 'debug';
    additionalFiles?: Array<{ path: string; content: string | Uint8Array }>;
    remoteEndpoint?: string;
  }): Promise<BackendResult>;
}

export class BusytexEngine implements LatexEngine {
  readonly id = 'busytex' as const;

  readonly capabilities: EngineCapabilities;

  private state: EngineStatus = { s: 'uninitialised' };
  private runner: BusytexRunnerLike | null = null;
  private engines = new Map<string, BusytexEngineLike>();
  private readonly opts: Required<Omit<BusytexOptions, 'remoteEndpoint'>> &
    Pick<BusytexOptions, 'remoteEndpoint'>;

  constructor(opts: BusytexOptions = {}) {
    this.opts = {
      basePath: opts.basePath ?? DEFAULT_BASE,
      collections: opts.collections ?? ['basic', 'recommended', 'extra'],
      ...(opts.remoteEndpoint !== undefined ? { remoteEndpoint: opts.remoteEndpoint } : {}),
    };
    this.capabilities = {
      programs: ['pdflatex', 'xelatex', 'lualatex'],
      bibtex: true,
      // No shell escape in the browser sandbox, so `minted` cannot run here.
      shellEscape: false,
      offlineAfterInstall: true,
      approxAssetBytes: this.opts.collections.reduce(
        (n, c) => n + (COLLECTION_BYTES[c] ?? 0),
        32 * 1024 * 1024,
      ),
    };
  }

  status(): EngineStatus {
    return this.state;
  }

  /**
   * Which asset bundles are actually present in this browser.
   *
   * The runner reports `ready` once it has started, and a bundle that is absent from
   * the cache does not stop that — so an install missing `extra` compiles ordinary
   * decks happily and then fails on the first extra-only package with nothing but a
   * bare "file not found". This is how that case is told apart from a genuinely
   * unbundled package.
   */
  async installedCollections(): Promise<Record<Collection, boolean> | null> {
    const runner = this.runner;
    if (runner?.isPackageCached === undefined) return null;

    const out = {} as Record<Collection, boolean>;
    for (const c of COLLECTIONS) {
      if (!this.opts.collections.includes(c)) continue;
      try {
        out[c] = await runner.isPackageCached(`${this.opts.basePath}/texlive-${c}.js`);
      } catch {
        return null;
      }
    }
    return out;
  }

  /**
   * Drop the cached bundles and fetch them again.
   *
   * The repair for a half-installed engine. Destructive only of the cache — the assets
   * are served from this app, so this re-downloads rather than losing anything.
   */
  async repair(opts: { onProgress?: (s: EngineStatus) => void } = {}): Promise<void> {
    await this.runner?.clearPreloadDataPackageCache?.();
    this.runner?.terminate?.();
    this.runner = null;
    this.engines.clear();
    this.state = { s: 'uninitialised' };
    await this.init(opts);
  }

  async init(opts: { onProgress?: (s: EngineStatus) => void } = {}): Promise<void> {
    if (this.state.s === 'ready' || this.state.s === 'busy') return;

    const report = (s: EngineStatus): void => {
      this.state = s;
      opts.onProgress?.(s);
    };

    report({
      s: 'installing',
      phase: 'Loading LaTeX engine',
      receivedBytes: 0,
      totalBytes: this.capabilities.approxAssetBytes,
    });

    try {
      const mod = (await import('texlyre-busytex')) as unknown as {
        BusyTexRunner: new (o: Record<string, unknown>) => BusytexRunnerLike;
        PdfLatex: new (r: BusytexRunnerLike) => BusytexEngineLike;
        XeLatex: new (r: BusytexRunnerLike) => BusytexEngineLike;
        LuaLatex: new (r: BusytexRunnerLike) => BusytexEngineLike;
      };

      const runner = new mod.BusyTexRunner({
        busytexBasePath: this.opts.basePath,
        preloadDataPackages: this.opts.collections.map(
          (c) => `${this.opts.basePath}/texlive-${c}.js`,
        ),
        engineMode: 'combined',
        verbose: false,
      });

      await runner.initialize(true);
      this.runner = runner;
      this.engines.set('pdflatex', new mod.PdfLatex(runner));
      this.engines.set('xelatex', new mod.XeLatex(runner));
      this.engines.set('lualatex', new mod.LuaLatex(runner));

      report({ s: 'ready' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      report({ s: 'failed', error: message });
      throw err;
    }
  }

  async compile(job: CompileJob, signal?: AbortSignal): Promise<CompileResult> {
    if (this.state.s !== 'ready') {
      throw new Error(`Engine is not ready (state: ${this.state.s})`);
    }
    const engine = this.engines.get(job.program);
    if (engine === undefined) throw new Error(`Unsupported program: ${job.program}`);

    const main = job.files.find((f) => f.path === job.mainFile);
    if (main === undefined) throw new Error(`Main file ${job.mainFile} not present in job`);

    this.state = { s: 'busy', jobId: job.jobId, phase: 'Compiling' };
    const started = Date.now();

    try {
      const additionalFiles = job.files
        .filter((f) => f.path !== job.mainFile)
        .map((f) => ({ path: f.path, content: f.content }));

      const result = await withTimeout(
        engine.compile({
          input: typeof main.content === 'string' ? main.content : decode(main.content),
          bibtex: job.runBibtex,
          rerun: job.passes === 'auto' || (typeof job.passes === 'number' && job.passes > 1),
          // 'info' keeps the TeX log, which the diagnostics and the overfull-box
          // fidelity signals are parsed from. Silencing it defeats error reporting.
          verbose: 'info',
          additionalFiles,
          ...(this.opts.remoteEndpoint !== undefined
            ? { remoteEndpoint: this.opts.remoteEndpoint }
            : {}),
        }),
        job.timeoutMs,
        signal,
      );

      this.state = { s: 'ready' };

      return toCompileResult(job, result, Date.now() - started);
    } catch (err) {
      this.state = { s: 'ready' };
      const message = err instanceof Error ? err.message : String(err);
      return {
        jobId: job.jobId,
        ok: false,
        log: message,
        diagnostics: [
          { severity: 'error', code: 'engine.failure', message, raw: message },
        ],
        passesRun: 0,
        durationMs: Date.now() - started,
      };
    }
  }

  async dispose(): Promise<void> {
    this.runner?.terminate?.();
    this.runner = null;
    this.engines.clear();
    this.state = { s: 'uninitialised' };
  }
}

function decode(u: Uint8Array): string {
  return new TextDecoder().decode(u);
}

/**
 * TeX cannot be interrupted cooperatively, so a timeout or abort abandons the promise.
 * The caller is expected to dispose and recreate the engine if this happens often.
 */
function withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Compile timed out after ${ms}ms`)), ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error('Compile aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}
