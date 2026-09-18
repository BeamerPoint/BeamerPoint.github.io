import type { CompileJob, CompileResult } from './LatexEngine.js';
import { parseLog } from './logParser.js';

/** What the WASM backend hands back. Its typings say `pdf?`; at runtime it is `null`. */
export interface BackendResult {
  success: boolean;
  pdf?: Uint8Array | null;
  synctex?: Uint8Array | null;
  log: string;
  exitCode: number;
}

/**
 * The backend's answer, held to `CompileResult`'s own contract.
 *
 * A failed compile comes back with `pdf: null`, not an absent key (measured, harness,
 * F-008). The engine used to spread `pdf` whenever it was `!== undefined`, so `null`
 * reached the PDF tab, which checked `=== undefined` and then called `pdf.slice()`: the
 * user got a raw "Cannot read properties of null" on top of the PREVIOUS compile's
 * pages. Anything that is not a non-empty PDF is now simply absent -- a zero-length one
 * means TeX aborted after opening the output file, and is no more a PDF than null is.
 */
export function toCompileResult(
  job: Pick<CompileJob, 'jobId'>,
  result: BackendResult,
  durationMs: number,
): CompileResult {
  const pdf = result.pdf instanceof Uint8Array && result.pdf.length > 0 ? result.pdf : undefined;
  const synctex = result.synctex instanceof Uint8Array ? result.synctex : undefined;
  return {
    jobId: job.jobId,
    ok: result.success && pdf !== undefined,
    ...(pdf !== undefined ? { pdf } : {}),
    ...(synctex !== undefined ? { synctex } : {}),
    log: result.log,
    diagnostics: parseLog(result.log),
    durationMs,
  };
}
