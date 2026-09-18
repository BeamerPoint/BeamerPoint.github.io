/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { get, set } from 'idb-keyval';
import { create } from 'zustand';
import { emitDeck, type Deck } from '@beamerpoint/core';
import { useStore } from './store.js';
import { linkedFileName, restoreLink, writeLinkedFile } from './fileLink.js';

/**
 * Autosave.
 *
 * Three layers, because each one fails in a different way:
 *
 *  1. IndexedDB holds the structured deck. Survives a reload, lost if site data is
 *     cleared, invisible to every other program.
 *  2. localStorage holds the emitted .tex. Writes SYNCHRONOUSLY, which is what makes it
 *     usable from `pagehide` — an async IndexedDB write started during teardown is not
 *     guaranteed to finish, so this is the layer that actually survives a tab close.
 *  3. A real file on disk, if the user links one. The only layer that produces something
 *     another program can open.
 *
 * The snapshot ring is separate: a bounded history for recovering from a bad edit,
 * rather than from a crash.
 */

const CURRENT_KEY = 'bp:deck:current';
const RING_KEY = 'bp:deck:ring';
const EMERGENCY_KEY = 'bp:deck:emergency';
const RING_SIZE = 50;

/** Short enough that a crash costs almost nothing, long enough not to thrash. */
const DEBOUNCE_MS = 800;
/** Snapshots are for undoing a bad edit, so they can be much rarer than saves. */
const SNAPSHOT_MS = 60_000;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SaveState {
  status: SaveStatus;
  lastSavedAt: number | null;
  fileName: string | null;
  /** Set when a linked file exists but the browser has not re-granted write access. */
  needsPermission: boolean;
  error: string | null;
  set(patch: Partial<Omit<SaveState, 'set'>>): void;
}

export const useSaveState = create<SaveState>()((setState) => ({
  status: 'idle',
  lastSavedAt: null,
  fileName: null,
  needsPermission: false,
  error: null,
  set: (patch) => setState(patch),
}));

/* ------------------------------------------------------------------ storage */

export async function loadSavedDeck(): Promise<Deck | undefined> {
  return (await get(CURRENT_KEY)) as Deck | undefined;
}

/**
 * The last emitted .tex, written synchronously so it survives an abrupt close.
 *
 * It exists ONLY while there is work the structured deck does not have yet: it is
 * written when the deck changes or the page is torn down with unsaved edits, and removed
 * as soon as IndexedDB has the deck. So a mirror found at launch means exactly one thing
 * -- the tab closed with unsaved edits -- and the recovery prompt no longer needs to
 * guess by comparing texts. That guess was wrong twice: it fired on every launch until
 * the first edit, because an untouched deck was mirrored at teardown and never saved
 * (F-016), and it fired after any release that changed how an existing deck emits,
 * because the mirror came from the previous build (F-010).
 */
export function readEmergencyTex(): { at: number; tex: string } | null {
  try {
    const raw = window.localStorage.getItem(EMERGENCY_KEY);
    return raw === null ? null : (JSON.parse(raw) as { at: number; tex: string });
  } catch {
    return null;
  }
}

/** Forget the mirror: the deck has it, or the user discarded or recovered it. */
export function clearEmergencyTex(): void {
  try {
    window.localStorage.removeItem(EMERGENCY_KEY);
  } catch {
    // Nothing to do; a stale mirror is only a spurious prompt.
  }
}

function writeEmergencyTex(tex: string): void {
  try {
    window.localStorage.setItem(EMERGENCY_KEY, JSON.stringify({ at: Date.now(), tex }));
  } catch {
    // Quota or a private window. The other two layers still apply.
  }
}

export async function snapshot(deck: Deck): Promise<void> {
  const ring = ((await get(RING_KEY)) as Array<{ at: number; deck: Deck }> | undefined) ?? [];
  ring.push({ at: Date.now(), deck });
  await set(RING_KEY, ring.slice(-RING_SIZE));
}

export async function listSnapshots(): Promise<Array<{ at: number; deck: Deck }>> {
  return ((await get(RING_KEY)) as Array<{ at: number; deck: Deck }> | undefined) ?? [];
}

/* ----------------------------------------------------------------- autosave */

let pending: number | null = null;
let lastSavedDeck: Deck | null = null;
let lastSnapshotAt = 0;

/**
 * Persist the current deck across all available layers.
 *
 * @param sync When true (teardown), only the synchronous layer is guaranteed to land.
 */
async function saveNow(sync = false): Promise<void> {
  const deck = useStore.getState().deck;
  if (deck === lastSavedDeck) return;

  const { tex } = emitDeck(deck);

  // Synchronous first: during pagehide this is the only layer that reliably completes.
  writeEmergencyTex(tex);
  if (sync) return;

  useSaveState.getState().set({ status: 'saving', error: null });
  try {
    await set(CURRENT_KEY, deck);
    lastSavedDeck = deck;
    // Only if nothing changed while the write was in flight: a newer edit's mirror is
    // the one thing standing between it and a crash.
    if (useStore.getState().deck === deck) clearEmergencyTex();

    if (Date.now() - lastSnapshotAt > SNAPSHOT_MS) {
      lastSnapshotAt = Date.now();
      await snapshot(deck);
    }

    const wroteFile = await writeLinkedFile(tex);
    useSaveState.getState().set({
      status: 'saved',
      lastSavedAt: Date.now(),
      fileName: linkedFileName(),
      needsPermission: linkedFileName() !== null && !wroteFile,
    });
  } catch (err) {
    useSaveState.getState().set({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * The deck this session started from -- restored, or the default for a first visit --
 * has nothing unsaved in it. Without this, closing an untouched tab mirrored it as if it
 * had been edited, and the next launch offered to "recover" it (F-016).
 */
export function markClean(deck: Deck): void {
  lastSavedDeck = deck;
}

/** Force an immediate save, e.g. right after linking a file. */
export async function flushSave(): Promise<void> {
  if (pending !== null) { window.clearTimeout(pending); pending = null; }
  lastSavedDeck = null;
  await saveNow();
}

export function startAutosave(): () => void {
  markClean(useStore.getState().deck);
  void (async () => {
    const link = await restoreLink();
    if (link !== null) {
      useSaveState.getState().set({ fileName: link.name, needsPermission: !link.writable });
    }
  })();

  const schedule = (): void => {
    if (pending !== null) window.clearTimeout(pending);
    pending = window.setTimeout(() => { pending = null; void saveNow(); }, DEBOUNCE_MS);
  };

  const unsubscribe = useStore.subscribe((s, prev) => {
    if (s.deck !== prev.deck) schedule();
  });

  // Teardown: the tab is closing, being frozen, or backgrounded on mobile. `pagehide`
  // is the one event that fires reliably in all of those, unlike `beforeunload`.
  const onTeardown = (): void => { void saveNow(true); };
  const onVisibility = (): void => { if (document.hidden) void saveNow(true); };

  window.addEventListener('pagehide', onTeardown);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    if (pending !== null) window.clearTimeout(pending);
    unsubscribe();
    window.removeEventListener('pagehide', onTeardown);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
