import { get, set } from 'idb-keyval';
import type { Deck } from '@beamerpoint/core';
import { useStore } from './store.js';

/**
 * Autosave, plus a bounded ring of snapshots.
 *
 * The snapshot ring is the backstop for the one failure mode that would be
 * unforgivable: losing hand-written LaTeX to a bad reconcile. It costs almost nothing
 * and means there is always a way back.
 */
const CURRENT_KEY = 'bp:deck:current';
const RING_KEY = 'bp:deck:ring';
const RING_SIZE = 50;
const AUTOSAVE_MS = 20_000;

export async function loadSavedDeck(): Promise<Deck | undefined> {
  return (await get(CURRENT_KEY)) as Deck | undefined;
}

export async function saveDeck(deck: Deck): Promise<void> {
  await set(CURRENT_KEY, deck);
}

export async function snapshot(deck: Deck): Promise<void> {
  const ring = ((await get(RING_KEY)) as Array<{ at: number; deck: Deck }> | undefined) ?? [];
  ring.push({ at: Date.now(), deck });
  await set(RING_KEY, ring.slice(-RING_SIZE));
}

export async function listSnapshots(): Promise<Array<{ at: number; deck: Deck }>> {
  return ((await get(RING_KEY)) as Array<{ at: number; deck: Deck }> | undefined) ?? [];
}

let timer: number | null = null;
let lastSaved: Deck | null = null;

export function startAutosave(): () => void {
  const tick = (): void => {
    const { deck } = useStore.getState();
    if (deck === lastSaved) return;
    lastSaved = deck;
    void saveDeck(deck);
    void snapshot(deck);
  };
  timer = window.setInterval(tick, AUTOSAVE_MS);
  const unsubscribe = useStore.subscribe((s, prev) => {
    // Snapshot immediately whenever a source edit is applied, not just on the timer.
    if (s.source.lastParse !== prev.source.lastParse && s.source.lastParse !== null) {
      void snapshot(s.deck);
      void saveDeck(s.deck);
    }
  });
  return () => {
    if (timer !== null) window.clearInterval(timer);
    unsubscribe();
  };
}
