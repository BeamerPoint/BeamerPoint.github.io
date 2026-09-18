/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataBase, engineBase } from '../src/engine/assetPaths.js';

/** The engine follows Vite's `base`; the data follows `VITE_TEX_DATA_URL` when it is set. */

afterEach(() => { vi.unstubAllEnvs(); });

describe('asset paths', () => {
  it('put the engine under the app\'s own base', () => {
    vi.stubEnv('BASE_URL', '/BeamerPoint/');
    expect(engineBase()).toBe('/BeamerPoint/core/busytex');
  });

  it('keep the data beside the engine unless told otherwise', () => {
    vi.stubEnv('BASE_URL', '/BeamerPoint/');
    vi.stubEnv('VITE_TEX_DATA_URL', '');
    expect(dataBase()).toBe('/BeamerPoint/core/busytex');
  });

  it('take the data from VITE_TEX_DATA_URL, without a trailing slash', () => {
    vi.stubEnv('VITE_TEX_DATA_URL', 'https://example.github.io/BeamerPoint/core/busytex/');
    expect(dataBase()).toBe('https://example.github.io/BeamerPoint/core/busytex');
  });
});
