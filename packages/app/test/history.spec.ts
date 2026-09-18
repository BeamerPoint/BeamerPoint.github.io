// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { newDeck, newFrame, newTextElement, richTextToPlain } from '@beamerpoint/core';
import type { Deck, FrameNode } from '@beamerpoint/core';
import { useStore } from '../src/state/store.js';

/**
 * Undo, redo, and the gesture bracket.
 *
 * Until this file no test called `undo()` or `redo()` at all. The rules pinned here are
 * the ones a user leans on without thinking: an edit can be taken back, a new edit
 * forgets what was redoable, the stack is bounded, and a whole drag is ONE entry --
 * `mutate` used to push per pointermove, so one Ctrl+Z after a resize undid two pixels.
 */

const st = () => useStore.getState();
const title = (): string => {
  const f = st().deck.nodes.find((n): n is FrameNode => n.kind === 'frame');
  return f?.title === undefined ? '' : richTextToPlain(f.title);
};

function load(): void {
  const deck: Deck = {
    ...newDeck({ title: 'T' }),
    nodes: [{ ...newFrame('v0', [{ ...newTextElement('x'), id: 'e1' }]), id: 'f1' }],
  };
  st().loadDeck(deck);
}

beforeEach(load);

describe('undo and redo', () => {
  it('takes an edit back, and puts it back', () => {
    st().setSlideTitle('f1', 'v1');
    expect(title()).toBe('v1');
    st().undo();
    expect(title()).toBe('v0');
    st().redo();
    expect(title()).toBe('v1');
  });

  it('keeps the source text in step with the deck it restores', () => {
    st().setSlideTitle('f1', 'v1');
    st().undo();
    expect(st().source.text).toContain('\\frametitle{v0}');
    expect(st().source.text).not.toContain('v1');
    expect(st().source.status).toBe('synced');
  });

  it('forgets the redo stack when a new edit is made', () => {
    st().setSlideTitle('f1', 'v1');
    st().undo();
    st().setSlideTitle('f1', 'other');
    expect(st().history.future).toEqual([]);
    st().redo();
    expect(title()).toBe('other');
  });

  it('does nothing when there is nothing to undo or redo', () => {
    const before = st().deck;
    st().undo();
    st().redo();
    expect(st().deck).toBe(before);
  });

  it('keeps the hundred most recent edits and drops the oldest', () => {
    for (let i = 1; i <= 101; i++) st().setSlideTitle('f1', `v${i}`);
    expect(st().history.past).toHaveLength(100);
    for (let i = 0; i < 100; i++) st().undo();
    // v0 was the 101st-oldest state, so it fell off the end.
    expect(title()).toBe('v1');
    st().undo();
    expect(title()).toBe('v1');
  });

  it('caps the redo stack too', () => {
    for (let i = 1; i <= 101; i++) st().setSlideTitle('f1', `v${i}`);
    for (let i = 0; i < 101; i++) st().undo();
    expect(st().history.future.length).toBeLessThanOrEqual(100);
  });
});

describe('a gesture', () => {
  it('is one undo entry however many moves it makes', () => {
    const depth = st().history.past.length;
    st().beginGesture();
    for (let i = 0; i < 5; i++) st().moveElementBy('f1', 'e1', 2, 1);
    st().endGesture();
    expect(st().history.past).toHaveLength(depth + 1);
  });

  it('is undone as a whole', () => {
    const before = st().deck;
    st().beginGesture();
    for (let i = 0; i < 5; i++) st().moveElementBy('f1', 'e1', 2, 1);
    st().endGesture();
    st().undo();
    expect(st().deck).toBe(before);
  });

  it('costs no undo entry when the pointer never moved', () => {
    // A stray click on a handle is not an edit.
    const depth = st().history.past.length;
    st().beginGesture();
    st().endGesture();
    expect(st().history.past).toHaveLength(depth);
  });
});

describe('the source panel lock', () => {
  it('refuses a canvas edit while the source has unapplied changes', () => {
    st().editSource(`${st().source.text}\n% typed by hand`);
    expect(st().source.status).toBe('dirty');
    st().setSlideTitle('f1', 'from the canvas');
    expect(title()).toBe('v0');
  });

  // F-009, fixed: undo and redo now obey the same lock as `mutate`.
  it('does not throw away unapplied source edits when Undo is pressed', () => {
    st().setSlideTitle('f1', 'v1');
    const typed = `${st().source.text}\n% typed by hand, not yet applied`;
    st().editSource(typed);
    st().undo();
    expect(st().source.text).toBe(typed);
  });
});
