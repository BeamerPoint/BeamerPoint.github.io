/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import type { MathElement } from '@beamerpoint/core';

/**
 * Prepare a display-math body for KaTeX.
 *
 * `align` and `gather` bodies use `&` and `\\`, which KaTeX only accepts inside an
 * environment of their own. Handing it a bare body renders an error instead of the
 * equation — which is how a perfectly valid equation ended up showing as red text on
 * the canvas while the inspector preview showed it correctly.
 *
 * KaTeX has no numbered `align`, so the starred `aligned`/`gathered` forms stand in.
 * Equation numbers are not drawn on the canvas either way; the PDF has them.
 */
export function wrapForKatex(tex: string, env: MathElement['env']): string {
  const base = env.replace(/\*$/, '');
  if (base === 'align' || base === 'gather') {
    return `\\begin{${base}ed}${tex}\\end{${base}ed}`;
  }
  return tex;
}
