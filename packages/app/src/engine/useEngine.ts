import { useCallback, useRef, useState } from 'react';
import {
  BusytexEngine,
  attachDiagnostics,
  buildProject,
  jobForProject,
  type Diagnostic,
  type LatexEngine,
  type ResourceResolver,
} from '@beamerpoint/engine';
import { emitDeck } from '@beamerpoint/core';
import { useStore } from '../state/store.js';
import { getResourceBytes } from '../state/resources.js';

/**
 * Owns the single engine instance for the app.
 *
 * The engine is created lazily and initialised only on explicit user action, so the
 * editor is fully usable before any of the ~540MB of TeX Live assets are fetched.
 */
let engineSingleton: LatexEngine | null = null;

function getEngine(): LatexEngine {
  engineSingleton ??= new BusytexEngine({
    basePath: '/core/busytex',
    collections: ['basic', 'recommended', 'extra'],
  });
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).bpEngine = engineSingleton;
  }
  return engineSingleton;
}

const resolver: ResourceResolver = { getBytes: getResourceBytes };

export function useEngine(): {
  install(): Promise<void>;
  compile(): Promise<void>;
  installProgress: string;
} {
  const setEngineStatus = useStore((s) => s.setEngineStatus);
  const setCompiling = useStore((s) => s.setCompiling);
  const setCompileResult = useStore((s) => s.setCompileResult);
  const [installProgress, setInstallProgress] = useState('Starting…');
  const busy = useRef(false);

  const install = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await getEngine().init({
        onProgress: (s) => {
          setEngineStatus(s);
          if (s.s === 'installing') {
            const pct = s.totalBytes > 0
              ? Math.round((s.receivedBytes / s.totalBytes) * 100)
              : 0;
            setInstallProgress(
              s.receivedBytes > 0
                ? `${pct}% of ~${Math.round(s.totalBytes / 1024 / 1024)} MB`
                : 'Fetching TeX Live collections…',
            );
          }
        },
      });
      setEngineStatus(getEngine().status());
    } catch (err) {
      setEngineStatus({ s: 'failed', error: err instanceof Error ? err.message : String(err) });
    } finally {
      busy.current = false;
    }
  }, [setEngineStatus]);

  const compile = useCallback(async () => {
    const engine = getEngine();
    if (engine.status().s !== 'ready') return;

    const { deck } = useStore.getState();
    setCompiling(true);
    try {
      const project = await buildProject(deck, resolver, {
        target: 'preview',
        capabilities: engine.capabilities,
      });
      const result = await engine.compile(
        jobForProject(project, deck, {
          program: deck.preamble.texProgram ?? 'pdflatex',
          // XeLaTeX runs a dvipdfmx pass on top of TeX, so it needs more headroom.
          timeoutMs: deck.preamble.texProgram === 'pdflatex' ? 60_000 : 180_000,
        }),
      );

      // Map TeX line numbers back to slides and elements via the emitter's source map.
      const { sourceMap } = emitDeck(deck, { target: 'preview' });

      // buildProject knows about problems BEFORE TeX runs — a referenced image with no
      // stored bytes, a minted block the engine cannot handle. Discarding those left
      // the user with a cryptic TeX error and no explanation of the actual cause.
      const buildDiagnostics: Diagnostic[] = project.warnings.map((message) => ({
        severity: 'error',
        code: 'project.build',
        message,
        raw: message,
      }));

      setCompileResult({
        ...result,
        diagnostics: [
          ...buildDiagnostics,
          ...attachDiagnostics(result.diagnostics, sourceMap),
        ],
      });
    } catch (err) {
      setCompileResult({
        jobId: 'failed',
        ok: false,
        log: err instanceof Error ? err.message : String(err),
        diagnostics: [],
        passesRun: 0,
        durationMs: 0,
      });
    } finally {
      setCompiling(false);
    }
  }, [setCompiling, setCompileResult]);

  return { install, compile, installProgress };
}
