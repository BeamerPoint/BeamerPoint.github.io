// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emitDeck, newDeck, newFrame, newTextElement } from '@beamerpoint/core';
import type { Deck } from '@beamerpoint/core';

/**
 * Autosave: three layers, each failing differently, and none of them tested until now.
 *
 * IndexedDB (the structured deck) is replaced by an in-memory map -- happy-dom has none --
 * and the linked-file layer by a stub, so what is tested is the ordering and the
 * guarantees: the synchronous `.tex` mirror is written FIRST, because during `pagehide` it
 * is the only write that reliably lands.
 */

const idb = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => { idb.set(k, structuredClone(v)); },
}));
vi.mock('../src/state/fileLink.js', () => ({
  restoreLink: async () => null,
  writeLinkedFile: async () => false,
  linkedFileName: () => null,
}));

const { useStore } = await import('../src/state/store.js');
const persist = await import('../src/state/persist.js');

const EMERGENCY = 'bp:deck:emergency';

function deckSaying(word: string): Deck {
  return { ...newDeck({ title: 'T' }), nodes: [newFrame('F', [newTextElement(word)])] };
}

beforeEach(() => {
  idb.clear();
  window.localStorage.clear();
  useStore.getState().loadDeck(deckSaying('start'));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('saving', () => {
  it('stores the structured deck and mirrors its .tex, which are the same document', async () => {
    await persist.flushSave();
    const saved = await persist.loadSavedDeck();
    expect(saved).toEqual(useStore.getState().deck);
    expect(persist.readEmergencyTex()?.tex).toBe(emitDeck(saved!).tex);
  });

  it('still saves the deck when the .tex mirror cannot be written', async () => {
    // Quota exceeded, or a private window: the other layers must carry on.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await expect(persist.flushSave()).resolves.toBeUndefined();
    expect(await persist.loadSavedDeck()).toBeDefined();
    expect(persist.useSaveState.getState().status).toBe('saved');
  });

  it('reports a failure of the deck store instead of claiming it saved', async () => {
    const keyval = await import('idb-keyval');
    vi.spyOn(keyval, 'set').mockRejectedValueOnce(new Error('disk full'));
    await persist.flushSave();
    expect(persist.useSaveState.getState().status).toBe('error');
    // ...and the synchronous mirror, written first, still has the work.
    expect(persist.readEmergencyTex()?.tex).toContain('start');
  });
});

describe('the emergency mirror', () => {
  it('reads back null rather than throwing on a damaged entry', () => {
    window.localStorage.setItem(EMERGENCY, '{not json');
    expect(persist.readEmergencyTex()).toBeNull();
  });

  it('is written synchronously when the page is being hidden, before any await', () => {
    const stop = persist.startAutosave();
    useStore.getState().setSlideTitle(useStore.getState().deck.nodes[0]!.id, 'Edited just before close');
    window.dispatchEvent(new Event('pagehide'));
    // No await: this is the whole point of the layer.
    expect(persist.readEmergencyTex()?.tex).toContain('Edited just before close');
    stop();
  });
});

describe('the autosave loop', () => {
  it('coalesces a burst of edits into one save', async () => {
    vi.useFakeTimers();
    const keyval = await import('idb-keyval');
    const writes = vi.spyOn(keyval, 'set');
    const stop = persist.startAutosave();
    const id = useStore.getState().deck.nodes[0]!.id;
    for (let i = 0; i < 5; i++) useStore.getState().setSlideTitle(id, `t${i}`);
    await vi.advanceTimersByTimeAsync(900);
    const deckWrites = writes.mock.calls.filter(([k]) => k === 'bp:deck:current');
    expect(deckWrites).toHaveLength(1);
    stop();
  });

  it('stops listening when torn down', async () => {
    const stop = persist.startAutosave();
    stop();
    window.localStorage.clear();
    useStore.getState().setSlideTitle(useStore.getState().deck.nodes[0]!.id, 'after teardown');
    window.dispatchEvent(new Event('pagehide'));
    expect(persist.readEmergencyTex()).toBeNull();
  });
});

describe('the snapshot ring', () => {
  it('keeps the fifty most recent and drops the oldest', async () => {
    for (let i = 0; i < 55; i++) await persist.snapshot(deckSaying(`s${i}`));
    const ring = await persist.listSnapshots();
    expect(ring).toHaveLength(50);
    expect(JSON.stringify(ring[0]!.deck)).toContain('s5');
    expect(JSON.stringify(ring.at(-1)!.deck)).toContain('s54');
  });
});
