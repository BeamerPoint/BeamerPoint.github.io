import { describe, expect, it, beforeEach } from 'vitest';
import { packageOrigin, resetPackageIndex } from '../src/packageIndex.js';

interface Bundle {
  /** Names from the cheap \ProvidesPackage manifest. */
  provides?: string[];
  /** Filenames from the full path listing, the authority on what is bundled. */
  files?: string[];
}

/** A stand-in for the two manifests the asset bundles ship. */
function manifests(byCollection: Record<string, Bundle>): typeof fetch {
  const missing = { ok: false, text: async () => '' } as Response;

  return (async (url: string | URL | Request) => {
    const href = String(url);

    const prov = /texlive-(basic|recommended|extra)\.js\.providespackage\.txt$/.exec(href);
    if (prov !== null) {
      const names = byCollection[prov[1]!]?.provides;
      if (names === undefined) return missing;
      return {
        ok: true,
        text: async () =>
          names.map((n) => `// \\ProvidesPackage{${n}}[2022/07/23 v1]`).join('\n'),
      } as Response;
    }

    const list = /texlive-(basic|recommended|extra)\.txt$/.exec(href);
    if (list !== null) {
      const files = byCollection[list[1]!]?.files;
      if (files === undefined) return missing;
      return {
        ok: true,
        text: async () =>
          `${files.map((f) => `build/texlive-${list[1]}/texmf-dist/tex/latex/x/${f}`).join('\n')}\n`,
      } as Response;
    }

    return missing;
  }) as unknown as typeof fetch;
}

beforeEach(resetPackageIndex);

describe('package origin lookup', () => {
  it('finds a package that only the extra collection provides', async () => {
    // The real case: textpos is bundled, in extra. Reporting it as "not bundled" sent
    // users off to change their theme when the engine install was the problem.
    const fetchImpl = manifests({
      basic: { provides: ['article'], files: ['article.cls'] },
      recommended: { provides: ['booktabs'], files: ['booktabs.sty'] },
      extra: { provides: ['textpos', 'booktabs'], files: ['textpos.sty', 'booktabs.sty'] },
    });

    expect(await packageOrigin('textpos.sty', '/base', fetchImpl))
      .toEqual({ collection: 'extra', conclusive: true });
  });

  it('reports the smallest collection that provides a package', async () => {
    const fetchImpl = manifests({
      basic: { provides: [], files: [] },
      recommended: { provides: ['booktabs'], files: ['booktabs.sty'] },
      extra: { provides: ['booktabs'], files: ['booktabs.sty'] },
    });
    expect(await packageOrigin('booktabs.sty', '/base', fetchImpl))
      .toEqual({ collection: 'recommended', conclusive: true });
  });

  it('says so conclusively when nothing provides it', async () => {
    const fetchImpl = manifests({
      basic: { provides: ['article'], files: ['article.cls'] },
      recommended: { provides: [], files: [] },
      extra: { provides: [], files: [] },
    });
    expect(await packageOrigin('nosuchpkg.sty', '/base', fetchImpl))
      .toEqual({ collection: null, conclusive: true });
  });

  it('is inconclusive rather than negative when the manifests will not load', async () => {
    // Absence of evidence is not evidence of absence: if we cannot read the manifests
    // we must not tell the user their package is unbundled.
    const dead = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await packageOrigin('textpos.sty', '/base', dead))
      .toEqual({ collection: null, conclusive: false });

    const notFound = (async () => ({ ok: false, text: async () => '' } as Response)) as
      unknown as typeof fetch;
    resetPackageIndex();
    expect(await packageOrigin('textpos.sty', '/base', notFound))
      .toEqual({ collection: null, conclusive: false });
  });

  it('finds a package that declares no \ProvidesPackage', async () => {
    // tikz.sty is bundled but does not use \ProvidesPackage, so the cheap manifest
    // misses it. Reporting it as unbundled would be the original bug all over again.
    const fetchImpl = manifests({
      basic: { provides: [], files: [] },
      recommended: { provides: ['booktabs'], files: ['booktabs.sty', 'tikz.sty'] },
      extra: { provides: ['booktabs'], files: ['booktabs.sty', 'tikz.sty'] },
    });
    expect(await packageOrigin('tikz.sty', '/base', fetchImpl))
      .toEqual({ collection: 'recommended', conclusive: true });
  });

  it('finds a class, which the cheap manifest never lists', async () => {
    const fetchImpl = manifests({
      basic: { provides: [], files: [] },
      recommended: { provides: [], files: ['beamer.cls'] },
      extra: { provides: [], files: ['beamer.cls'] },
    });
    expect(await packageOrigin('beamer.cls', '/base', fetchImpl))
      .toEqual({ collection: 'recommended', conclusive: true });
  });

  it('will not claim absence when the file listings are unreadable', async () => {
    const fetchImpl = manifests({
      basic: { provides: [] },
      recommended: { provides: [] },
      extra: { provides: [] },
    });
    expect(await packageOrigin('mystery.sty', '/base', fetchImpl))
      .toEqual({ collection: null, conclusive: false });
  });

  it('reads each manifest once, however many packages are looked up', async () => {
    let calls = 0;
    const counting = (async (url: string | URL | Request) => {
      calls += 1;
      return manifests({
        basic: { provides: [], files: [] },
        recommended: { provides: [], files: [] },
        extra: { provides: ['textpos', 'pgfplots'], files: ['textpos.sty', 'pgfplots.sty'] },
      })(url);
    }) as unknown as typeof fetch;

    await packageOrigin('textpos.sty', '/base', counting);
    await packageOrigin('pgfplots.sty', '/base', counting);
    expect(calls).toBe(3);
  });
});
