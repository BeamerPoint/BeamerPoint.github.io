/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { get, set, del } from 'idb-keyval';

/**
 * A link to a real `.tex` file on disk, via the File System Access API.
 *
 * Browser storage alone is not a file: it does not survive clearing site data, does not
 * exist for any other program, and cannot be recovered from a different browser. Linking
 * an actual file means a crash costs at most the last debounce interval, and the deck is
 * openable in any editor afterwards.
 *
 * Chromium only. Everywhere else `isSupported()` is false and the app falls back to
 * browser storage plus a manual export.
 */

const HANDLE_KEY = 'bp:file:handle';

/** Minimal shape of the parts of FileSystemFileHandle we rely on. */
interface WritableHandle {
  readonly name: string;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  queryPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
}

interface PickerWindow {
  showSaveFilePicker?(opts: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }): Promise<WritableHandle>;
}

export function isSupported(): boolean {
  return typeof (window as unknown as PickerWindow).showSaveFilePicker === 'function';
}

let handle: WritableHandle | null = null;

export function linkedFileName(): string | null {
  return handle?.name ?? null;
}

/** Ask the user to choose a file, and remember it across sessions. */
export async function linkFile(suggestedName = 'presentation.tex'): Promise<string | null> {
  const picker = (window as unknown as PickerWindow).showSaveFilePicker;
  if (picker === undefined) return null;

  try {
    const picked = await picker({
      suggestedName,
      types: [{ description: 'LaTeX source', accept: { 'text/x-tex': ['.tex'] } }],
    });
    handle = picked;
    // Handles are structured-cloneable, so IndexedDB can hold them across reloads.
    await set(HANDLE_KEY, picked);
    return picked.name;
  } catch {
    // The user dismissed the picker.
    return null;
  }
}

export async function unlinkFile(): Promise<void> {
  handle = null;
  await del(HANDLE_KEY);
}

/**
 * Restore a previously linked file.
 *
 * A stored handle does NOT carry write permission across a reload — the browser
 * requires a user gesture to re-grant it. This only reports whether the handle is
 * usable right now; `ensureWritable` does the asking.
 */
export async function restoreLink(): Promise<{ name: string; writable: boolean } | null> {
  const stored = (await get(HANDLE_KEY)) as WritableHandle | undefined;
  if (stored === undefined) return null;
  handle = stored;

  const state = (await stored.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
  return { name: stored.name, writable: state === 'granted' };
}

/** Re-request write permission. Must be called from a user gesture. */
export async function ensureWritable(): Promise<boolean> {
  if (handle === null) return false;
  const current = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
  if (current === 'granted') return true;
  const asked = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
  return asked === 'granted';
}

/** Write the document to the linked file. Returns false when there is nothing linked. */
export async function writeLinkedFile(tex: string): Promise<boolean> {
  if (handle === null) return false;
  const state = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
  if (state !== 'granted') return false;

  const writable = await handle.createWritable();
  await writable.write(tex);
  await writable.close();
  return true;
}
