import { customAlphabet } from 'nanoid';
import type { Id } from './types.js';

/**
 * Ids are a UX concern (selection, undo coalescing, inspector focus), not a
 * correctness concern. They are deliberately NOT written into the .tex file — see
 * `parse/reid.ts`, which re-derives them by structural matching after every reparse.
 */
const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const gen = customAlphabet(alphabet, 10);

export function newId(): Id {
  return gen();
}

/** Deterministic id source, for tests that assert on exact model shapes. */
export function makeSeededIdFactory(prefix = 'id'): () => Id {
  let n = 0;
  return () => `${prefix}${(n += 1)}`;
}
