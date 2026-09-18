/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

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

/**
 * Which asset bundles this browser actually has.
 *
 * Exported as a plain function rather than through the hook because the missing-package
 * banner needs it once, on mount, not as reactive state.
 */
export async function installedCollections(): ReturnType<BusytexEngine['installedCollections']> {
  const engine = engineSingleton;
  if (engine === null || !(engine instanceof BusytexEngine)) return null;
  return engine.installedCollections();
}

export function useEngine(): {
  install(): Promise<void>;
  repair(): Promise<void>;
  compile(): Promise<void>;
  installProgress: string;
  repairing: boolean;
} {
  const setEngineStatus = useStore((s) => s.setEngineStatus);
  const setCompiling = useStore((s) => s.setCompiling);
  const setCompileResult = useStore((s) => s.setCompileResult);
  const [installProgress, setInstallProgress] = useState('Starting…');
  const [repairing, setRepairing] = useState(false);
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

      // buildProject knows about problems BEFORE TeX runs — a referenced image with no
      // stored bytes. Discarding those left the user with a cryptic TeX error and no
      // explanation of the actual cause.
      const buildDiagnostics: Diagnostic[] = [
        ...project.warnings.map((message): Diagnostic => ({
          severity: 'error', code: 'project.build', message, raw: message,
        })),
        // What the preview did differently from the export -- a minted block compiled
        // with listings. Information, not failure: as an 'error' it marked a successful
        // compile as failed.
        ...project.notes.map((message): Diagnostic => ({
          severity: 'info', code: 'project.preview', message, raw: message,
        })),
      ];

      setCompileResult({
        ...result,
        diagnostics: [
          ...buildDiagnostics,
          // The source map of the file that was COMPILED, which is the one TeX's line
          // numbers refer to. Re-emitting the deck here instead gave the map of a
          // different file the moment the preview and the export differ -- and they do
          // whenever a minted block is swapped -- so every diagnostic pointed at the
          // wrong slide.
          ...attachDiagnostics(result.diagnostics, project.sourceMap),
        ],
      });
    } catch (err) {
      setCompileResult({
        jobId: 'failed',
        ok: false,
        log: err instanceof Error ? err.message : String(err),
        diagnostics: [],
        durationMs: 0,
      });
    } finally {
      setCompiling(false);
    }
  }, [setCompiling, setCompileResult]);

  /**
   * Throw away the cached asset bundles and fetch them again.
   *
   * The fix for a half-installed engine, where the runner reports ready but a
   * collection is absent, so ordinary decks compile and the first package from the
   * missing collection fails with a bare "file not found".
   */
  const repair = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRepairing(true);
    const engine = getEngine();
    try {
      if (engine instanceof BusytexEngine) {
        await engine.repair({
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
      }
      setEngineStatus(engine.status());
    } catch (err) {
      setEngineStatus({ s: 'failed', error: err instanceof Error ? err.message : String(err) });
    } finally {
      busy.current = false;
      setRepairing(false);
    }
  }, [setEngineStatus]);

  return { install, repair, compile, installProgress, repairing };
}
