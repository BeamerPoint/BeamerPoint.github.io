/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { useEffect, useState } from 'react';
import {
  packageOrigin,
  type Collection,
  type MissingFile,
  type PackageOrigin,
} from '@beamerpoint/engine';
import { useStore } from '../state/store.js';
import { useEngine } from '../engine/useEngine.js';
import { dataBase } from '../engine/assetPaths.js';

interface Props {
  missing: MissingFile[];
}

type Origins = Record<string, PackageOrigin>;

/** Say "image" for an image and "package" for a package; mixed cases say "file". */
function heading(missing: MissingFile[]): string {
  const graphics = missing.filter((m) => m.kind === 'graphic').length;
  const noun =
    graphics === missing.length ? 'image'
    : graphics === 0 ? 'package'
    : 'file';
  return missing.length === 1
    ? `An ${noun} this deck needs could not be found`
        .replace('An package', 'A package')
        .replace('An file', 'A file')
    : `${noun[0]!.toUpperCase()}${noun.slice(1)}s this deck needs could not be found`;
}

/**
 * The missing-file banner.
 *
 * This used to state flatly that a missing `.sty` was "not part of the bundled TeX Live
 * collections" and suggest picking a different theme. For `textpos` — which the app
 * itself emits for every text box, and which IS bundled, in the *extra* collection —
 * that was both false and actively misleading: the real cause is an engine install
 * missing a collection, and the fix is to re-download it.
 *
 * So nothing here asserts what is or is not bundled without having looked.
 */
export function MissingPackages({ missing }: Props): React.ReactElement {
  const { repair, repairing } = useEngine();
  const engineStatus = useStore((s) => s.engine.status);
  const [origins, setOrigins] = useState<Origins>({});
  const [collections, setCollections] = useState<Record<Collection, boolean> | null>(null);
  const [checked, setChecked] = useState(false);

  const packages = missing.filter((m) => m.kind !== 'graphic');

  useEffect(() => {
    let live = true;
    void (async () => {
      const found: Origins = {};
      for (const m of packages) {
        found[m.file] = await packageOrigin(m.file, dataBase());
      }
      const { installedCollections } = await import('../engine/useEngine.js');
      const installed = await installedCollections();
      if (!live) return;
      setOrigins(found);
      setCollections(installed);
      setChecked(true);
    })();
    return () => { live = false; };
    // Re-check after a repair, since that is exactly what should change the answer.
  }, [missing.map((m) => m.file).join('|'), engineStatus.s]);

  /** Collections a missing package lives in, that this browser does not have. */
  const absent = new Set<Collection>();
  for (const m of packages) {
    const origin = origins[m.file];
    if (origin?.collection == null) continue;
    if (collections !== null && collections[origin.collection] === false) {
      absent.add(origin.collection);
    }
  }

  const bundledButMissing = packages.filter((m) => origins[m.file]?.collection != null);

  return (
    <div className="bp-log-missing">
      <strong>{heading(missing)}</strong>
      <ul>
        {missing.map((m) => {
          const origin = origins[m.file];
          return (
            <li key={m.file}>
              <code>{m.pkg}</code>
              {m.kind === 'graphic'
                ? ' — an image file the document references but that is not stored here.'
                : !checked
                  ? ' — checking whether it is bundled…'
                  : origin?.collection != null
                    ? ` — bundled, in the ${origin.collection} collection`
                      + (collections?.[origin.collection] === false
                        ? ', which this browser has not downloaded.'
                        : ', so the engine has it but TeX could not load it.')
                    : origin?.conclusive === true
                      ? ' — not found in any of the bundled TeX Live collections.'
                      : ' — could not check which collection provides it.'}
            </li>
          );
        })}
      </ul>

      {absent.size > 0 && (
        <p className="bp-muted">
          The <strong>{[...absent].join(' and ')}</strong>{' '}
          {absent.size === 1 ? 'collection is' : 'collections are'} missing from this
          browser. That happens when a download was interrupted or the browser evicted
          it to reclaim space.
        </p>
      )}

      {bundledButMissing.length > 0 && (
        <>
          <p className="bp-muted">
            {absent.size > 0
              ? 'Re-downloading the engine assets should fix this.'
              : 'The bundle is cached but unreadable, which a re-download usually '
                + 'clears.'}{' '}
            Nothing in your deck is touched.
          </p>
          <button className="bp-primary" disabled={repairing} onClick={() => void repair()}>
            {repairing ? 'Re-downloading…' : 'Re-download the engine'}
          </button>
        </>
      )}

      {checked && bundledButMissing.length === 0 && packages.length > 0 && (
        <p className="bp-muted">
          Pick a different theme or drop the package, or compile this deck with a local
          TeX installation that has it.
        </p>
      )}

      {packages.length === 0 && (
        <p className="bp-muted">Add the file to the deck, then compile again.</p>
      )}
    </div>
  );
}
