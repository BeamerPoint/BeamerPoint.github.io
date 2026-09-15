import type {
  CompileJob,
  CompileResult,
  EngineCapabilities,
  EngineStatus,
  LatexEngine,
} from '../../LatexEngine.js';
import { parseLog } from '../../logParser.js';

/**
 * TeX Live 2026 compiled to WebAssembly, running in its own worker.
 *
 * Beamer lives in TeX Live's *extra* collection, so a working Beamer setup needs
 * basic + recommended + extra. That is a large one-time download, which is why
 * `init()` is never called implicitly — the user opts in from the UI, and everything
 * except compilation works without it.
 */

export interface BusytexOptions {
  /** Where the WASM and .data bundles are served from. */
  basePath?: string;
  /** Cumulative collections. Beamer requires `extra`. */
  collections?: Array<'basic' | 'recommended' | 'extra'>;
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
}

interface BusytexEngineLike {
  compile(opts: {
    input: string;
    bibtex?: boolean;
    rerun?: boolean;
    verbose?: 'silent' | 'info' | 'debug';
    additionalFiles?: Array<{ path: string; content: string | Uint8Array }>;
    remoteEndpoint?: string;
  }): Promise<{
    success: boolean;
    pdf?: Uint8Array;
    synctex?: Uint8Array;
    log: string;
    exitCode: number;
  }>;
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

      return {
        jobId: job.jobId,
        ok: result.success && result.pdf !== undefined,
        ...(result.pdf !== undefined ? { pdf: result.pdf } : {}),
        ...(result.synctex !== undefined ? { synctex: result.synctex } : {}),
        log: result.log,
        diagnostics: parseLog(result.log),
        passesRun: job.passes === 'auto' ? 2 : Number(job.passes),
        durationMs: Date.now() - started,
      };
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
