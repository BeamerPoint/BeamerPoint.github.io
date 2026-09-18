/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

export type {
  EngineId, TexProgram, EngineCapabilities, VirtualFile, CompileJob,
  CompileResult, Diagnostic, DiagnosticSeverity, EngineStatus, LatexEngine, EngineFactory,
} from './LatexEngine.js';
export { defaultJob } from './LatexEngine.js';
export { parseLog, logIndicatesFailure, findMissingFiles, type MissingFile } from './logParser.js';
export { BusytexEngine, COLLECTION_BYTES, type BusytexOptions } from './backends/busytex/BusytexEngine.js';
export {
  buildProject, jobForProject,
  type BuiltProject, type BuildOptions, type ResourceResolver,
} from './buildProject.js';
export { attachDiagnostics } from './attachDiagnostics.js';
export {
  COLLECTIONS, packageOrigin, resetPackageIndex,
  type Collection, type PackageOrigin,
} from './packageIndex.js';
