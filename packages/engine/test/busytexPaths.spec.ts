/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { describe, expect, it } from 'vitest';
import { BusytexEngine } from '../src/backends/busytex/BusytexEngine.js';

/**
 * The engine and its data can be served from different places.
 *
 * The worker must be same-origin, so the engine path follows the app. The 540 MB of data
 * need not: the desktop app serves its engine from `app://` and the data from the web
 * site, and the web app can move its data without a code change.
 */

describe('BusytexEngine asset paths', () => {
  it('keeps the data beside the engine by default', () => {
    const e = new BusytexEngine({ basePath: '/BeamerPoint/core/busytex' });
    expect(e.packageUrl('extra')).toBe('/BeamerPoint/core/busytex/texlive-extra.js');
  });

  it('loads the data packages from dataPath when one is given', () => {
    const e = new BusytexEngine({
      basePath: 'app://bp/core/busytex',
      dataPath: 'https://example.github.io/BeamerPoint/core/busytex',
    });
    expect(e.packageUrl('basic'))
      .toBe('https://example.github.io/BeamerPoint/core/busytex/texlive-basic.js');
  });

  it('still defaults to the root path when given nothing', () => {
    expect(new BusytexEngine().packageUrl('recommended')).toBe('/core/busytex/texlive-recommended.js');
  });
});
