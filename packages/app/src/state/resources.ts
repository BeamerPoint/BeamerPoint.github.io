/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { get, set, del, keys } from 'idb-keyval';

/**
 * Binary resources (images, .bib files) live in IndexedDB, keyed by model id.
 *
 * The deck itself stays JSON-serialisable and holds only `ResourceRef` metadata, so a
 * deck can be saved, diffed and round-tripped without dragging megabytes with it.
 */
const PREFIX = 'bp:res:';

export async function putResourceBytes(id: string, bytes: Uint8Array): Promise<void> {
  await set(PREFIX + id, bytes);
}

export async function getResourceBytes(id: string): Promise<Uint8Array | undefined> {
  return (await get(PREFIX + id)) as Uint8Array | undefined;
}

export async function deleteResource(id: string): Promise<void> {
  await del(PREFIX + id);
}

/** Drop stored blobs no deck references any more. */
export async function collectGarbage(referenced: Set<string>): Promise<number> {
  const all = await keys();
  let removed = 0;
  for (const k of all) {
    if (typeof k !== 'string' || !k.startsWith(PREFIX)) continue;
    if (referenced.has(k.slice(PREFIX.length))) continue;
    await del(k);
    removed += 1;
  }
  return removed;
}
