export type Collection = 'basic' | 'recommended' | 'extra';

export const COLLECTIONS: readonly Collection[] = ['basic', 'recommended', 'extra'];

/**
 * Which bundled collection provides a file.
 *
 * The app used to tell the user that a missing `.sty` was "not part of the bundled
 * TeX Live collections". That is a claim, and it was often false — `textpos.sty` ships
 * in the *extra* bundle, so the real problem was a broken engine install, and the
 * advice ("pick a different theme") sent the user in exactly the wrong direction.
 *
 * Two manifests ship beside the asset bundles, and this uses both:
 *
 *   - `texlive-<c>.js.providespackage.txt` (~200KB total) lists every
 *     `\ProvidesPackage`. Cheap, and settles most POSITIVE answers.
 *   - `texlive-<c>.txt` (~3.5MB total) lists every file path. Only fetched when the
 *     cheap manifest found nothing, because a negative is the answer that must not be
 *     wrong: `tikz.sty` does not use `\ProvidesPackage` and would otherwise be
 *     reported as unbundled, which is exactly the original bug again.
 */
export interface PackageOrigin {
  /** The collection that provides it, or null if no manifest mentions it. */
  collection: Collection | null;
  /** False when the manifests could not be read, so absence proves nothing. */
  conclusive: boolean;
}

const PROVIDES = /\\ProvidesPackage\{([^}]+)\}/g;

interface Manifests {
  /** Package name -> collection, from the cheap manifest. */
  provides: Map<string, Collection>;
  /** Lazily fetched full file listings, per collection. */
  listings: Map<Collection, string | null>;
  anyLoaded: boolean;
}

const cache = new Map<string, Promise<Manifests>>();

async function loadProvides(basePath: string, fetchImpl: typeof fetch): Promise<Manifests> {
  const provides = new Map<string, Collection>();
  let anyLoaded = false;

  // Later collections are supersets in practice, so record the FIRST (smallest) one
  // that provides a package: that is the one the user most likely already has.
  for (const collection of COLLECTIONS) {
    try {
      const res = await fetchImpl(`${basePath}/texlive-${collection}.js.providespackage.txt`);
      if (!res.ok) continue;
      const text = await res.text();
      anyLoaded = true;
      PROVIDES.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = PROVIDES.exec(text)) !== null) {
        const name = m[1]!.trim();
        if (!provides.has(name)) provides.set(name, collection);
      }
    } catch {
      // A manifest that will not load makes the answer inconclusive, not negative.
    }
  }

  return { provides, listings: new Map(), anyLoaded };
}

async function listingOf(
  m: Manifests,
  collection: Collection,
  basePath: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const cached = m.listings.get(collection);
  if (cached !== undefined) return cached;

  let text: string | null = null;
  try {
    const res = await fetchImpl(`${basePath}/texlive-${collection}.txt`);
    if (res.ok) text = await res.text();
  } catch {
    text = null;
  }
  m.listings.set(collection, text);
  return text;
}

/**
 * Look up the origin of a missing file.
 *
 * `file` is what TeX reported, e.g. `textpos.sty` or `beamer.cls`.
 */
export async function packageOrigin(
  file: string,
  basePath: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PackageOrigin> {
  const name = file.trim();
  if (name === '' || name.includes('/')) return { collection: null, conclusive: false };

  let pending = cache.get(basePath);
  if (pending === undefined) {
    pending = loadProvides(basePath, fetchImpl);
    cache.set(basePath, pending);
  }
  const manifests = await pending;

  const asPackage = name.replace(/\.sty$/, '');
  if (asPackage !== name) {
    const hit = manifests.provides.get(asPackage);
    if (hit !== undefined) return { collection: hit, conclusive: true };
  }

  // Nothing cheap matched. Before claiming it is not bundled, read the file listings,
  // which are what the TeX installation actually contains.
  let allListingsLoaded = true;
  for (const collection of COLLECTIONS) {
    const listing = await listingOf(manifests, collection, basePath, fetchImpl);
    if (listing === null) { allListingsLoaded = false; continue; }
    if (listing.includes(`/${name}\n`) || listing.endsWith(`/${name}`)) {
      return { collection, conclusive: true };
    }
  }

  return {
    collection: null,
    conclusive: allListingsLoaded && manifests.anyLoaded,
  };
}

/** Testing seam: drop the memoised manifests. */
export function resetPackageIndex(): void {
  cache.clear();
}
