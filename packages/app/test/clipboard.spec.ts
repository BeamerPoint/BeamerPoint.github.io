// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  newDeck, newFrame, newTextElement,
} from '@beamerpoint/core';
import type { Deck, FrameNode } from '@beamerpoint/core';
import { useStore } from '../src/state/store.js';

/**
 * Copying elements between slides.
 *
 * The clipboard holds the MODEL. Going through the system clipboard would mean emitting
 * LaTeX and parsing it back, which loses whatever the round trip cannot express — a
 * copied diagram would arrive as a raw block.
 */

function frames(): FrameNode[] {
  return useStore.getState().deck.nodes.filter((n): n is FrameNode => n.kind === 'frame');
}

function load(): void {
  const base = newDeck({ title: 'T' });
  const deck: Deck = {
    ...base,
    nodes: [
      { ...newFrame('One', [newTextElement('hello')]), id: 'f1' },
      { ...newFrame('Two', []), id: 'f2' },
    ],
  };
  useStore.getState().loadDeck(deck);
  useStore.getState().selectSlide('f1');
}

describe('the element clipboard', () => {
  beforeEach(load);

  it('starts empty, so Paste has nothing to offer', () => {
    expect(useStore.getState().clipboard).toBeNull();
  });

  it('pastes onto the slide that is showing, not the one it came from', () => {
    const s = useStore.getState();
    const source = frames()[0]!.children[0]!;
    s.copyElement('f1', source.id);
    s.selectSlide('f2');
    s.pasteElement();

    expect(frames()[0]!.children).toHaveLength(1); // the original is untouched
    expect(frames()[1]!.children).toHaveLength(1);
    expect(frames()[1]!.children[0]!.id).not.toBe(source.id);
  });

  it('selects what it just pasted', () => {
    const s = useStore.getState();
    s.copyElement('f1', frames()[0]!.children[0]!.id);
    s.pasteElement();
    expect(useStore.getState().selection.elementId).toBe(frames()[0]!.children[1]!.id);
  });

  it('gives two independent copies when pasted twice', () => {
    // The clipboard keeps the ORIGINAL and each paste clones it afresh; keeping the
    // clone would make the second paste share every id with the first.
    const s = useStore.getState();
    s.copyElement('f1', frames()[0]!.children[0]!.id);
    s.pasteElement();
    s.pasteElement();
    const ids = frames()[0]!.children.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('cut removes the original and keeps it pasteable', () => {
    const s = useStore.getState();
    const id = frames()[0]!.children[0]!.id;
    s.cutElement('f1', id);
    expect(frames()[0]!.children).toHaveLength(0);

    s.pasteElement();
    expect(frames()[0]!.children).toHaveLength(1);
    expect(frames()[0]!.children[0]!.id).not.toBe(id);
  });

  it('survives the element it copied being deleted', () => {
    const s = useStore.getState();
    const id = frames()[0]!.children[0]!.id;
    s.copyElement('f1', id);
    s.deleteElement('f1', id);
    s.pasteElement();
    expect(frames()[0]!.children).toHaveLength(1);
  });

  it('duplicates in one step, onto the same slide', () => {
    const s = useStore.getState();
    s.addListElement('f1');
    const list = frames()[0]!.children.at(-1)!;
    s.duplicateElement('f1', list.id);

    const kids = frames()[0]!.children;
    expect(kids.at(-1)!.kind).toBe('list');
    expect(kids.at(-1)!.id).not.toBe(list.id);
    // The list ITEMS are new too, or editing one would edit both.
    const a = list.kind === 'list' ? list.items.map((i) => i.id) : [];
    const b = kids.at(-1)!.kind === 'list'
      ? (kids.at(-1) as typeof list & { kind: 'list' }).items.map((i) => i.id) : [];
    expect(b.some((id) => a.includes(id))).toBe(false);
  });

  it('lifts a copy out of the block it was nested in', () => {
    // Pasting back inside a container the user is not looking at is how a paste comes
    // to look as though it did nothing.
    const s = useStore.getState();
    s.addBlockElement('f1', 'block');
    const block = frames()[0]!.children.at(-1)!;
    s.addTextElement('f1');
    const loose = frames()[0]!.children.at(-1)!;

    s.copyElement('f1', loose.id);
    s.pasteElement();
    expect(frames()[0]!.children.at(-1)!.id).not.toBe(block.id);
    expect(frames()[0]!.children.filter((c) => c.kind === 'text')).toHaveLength(3);
  });

  it('does nothing when there is nothing to paste', () => {
    const before = useStore.getState().deck;
    useStore.getState().pasteElement();
    expect(useStore.getState().deck).toBe(before);
  });

  it('copying is not an undoable change', () => {
    const s = useStore.getState();
    const depth = useStore.getState().history.past.length;
    s.copyElement('f1', frames()[0]!.children[0]!.id);
    expect(useStore.getState().history.past.length).toBe(depth);
  });
});

describe('the title slide', () => {
  beforeEach(load);

  it('can be added back after it is deleted', () => {
    // `\titlepage` is a raw element by design, so nothing in the UI could write that
    // one command back and deleting the deck's title slide was irreversible.
    useStore.getState().addTitleSlide();
    const added = frames().find((f) => f.options.plain === true);
    expect(added).toBeDefined();
    expect(added!.children[0]).toMatchObject({ kind: 'raw', tex: '\\titlepage' });
    expect(useStore.getState().source.text).toContain('\\titlepage');
  });

  it('lands after the current slide, like a new one does', () => {
    useStore.getState().selectSlide('f1');
    useStore.getState().addTitleSlide();
    expect(frames().map((f) => f.id)[0]).toBe('f1');
    expect(frames()).toHaveLength(3);
    expect(frames()[1]!.options.plain).toBe(true);
  });
});
