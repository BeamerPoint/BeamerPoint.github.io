/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { lookupByLine, type SourceMap } from '@beamerpoint/core';
import type { Diagnostic } from './LatexEngine.js';

/**
 * Attach model ids to compile diagnostics using the emitter's source map.
 *
 * This is the payoff for recording spans during emission: a TeX error on line 47
 * becomes "this element, on this slide" without any marker comments in the output.
 */
export function attachDiagnostics(
  diagnostics: Diagnostic[],
  sourceMap: SourceMap,
): Diagnostic[] {
  return diagnostics.map((d) => {
    if (d.line === undefined) return d;

    const innermost = lookupByLine(sourceMap, d.line);
    if (innermost === undefined) return d;

    const out: Diagnostic = { ...d };
    if (innermost.kind.startsWith('element:') || innermost.kind === 'listitem') {
      out.elementId = innermost.nodeId;
    }

    // Walk outward for the enclosing frame, which is almost always available even
    // when the element is not.
    const frame = sourceMap
      .filter((e) => e.kind === 'frame' && e.startLine <= d.line! && d.line! <= e.endLine)
      .sort((a, b) => b.depth - a.depth)[0];
    if (frame !== undefined) out.frameId = frame.nodeId;

    return out;
  });
}
