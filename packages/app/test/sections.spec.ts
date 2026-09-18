// @vitest-environment happy-dom
/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { newDeck, newFrame, newTextElement, plain, richTextToPlain } from '@beamerpoint/core';
import type { Deck, SectionNode } from '@beamerpoint/core';
import { selectOutline, useStore } from '../src/state/store.js';

/**
 * Sections own the slides that follow them.
 *
 * They are siblings of frames in one flat list, so "the slides in this section" is a
 * question about the span between two headings — and moving or deleting a heading
 * without accounting for that span silently re-parents or deletes someone's slides.
 */

function sec(id: string, level: SectionNode['level'], title: string): SectionNode {
  return { kind: 'section', id, level, title: plain(title), starred: false };
}

function deck(): Deck {
  const base = newDeck({ title: 'T' });
  return {
    ...base,
    nodes: [
      { ...newFrame('Intro', [newTextElement('a')]), id: 'f0' },
      sec('s1', 'section', 'One'),
      { ...newFrame('A', [newTextElement('a')]), id: 'f1' },
      sec('s1a', 'subsection', 'One point one'),
      { ...newFrame('B', [newTextElement('b')]), id: 'f2' },
      sec('s2', 'section', 'Two'),
      { ...newFrame('C', [newTextElement('c')]), id: 'f3' },
    ],
  };
}

/** The outline as a compact string, so the assertions read like the rail looks. */
function shape(): string {
  return useStore.getState().deck.nodes
    .map((n) => {
      if (n.kind === 'section') return `[${richTextToPlain(n.title)}]`;
      if (n.kind === 'frame') return n.title ? richTextToPlain(n.title) : '?';
      return 'raw';
    })
    .join(' ');
}

beforeEach(() => {
  useStore.getState().loadDeck(deck());
  useStore.getState().selectSlide('f0');
});

describe('the slide rail sees sections', () => {
  it('lists headings and frames in document order', () => {
    expect(selectOutline(useStore.getState()).map((n) => n.kind))
      .toEqual(['frame', 'section', 'frame', 'section', 'frame', 'section', 'frame']);
  });

  it('memoises on deck identity, or zustand re-renders forever', () => {
    const s = useStore.getState();
    expect(selectOutline(s)).toBe(selectOutline(s));
  });
});

describe('moving a section', () => {
  it('carries the slides it owns', () => {
    useStore.getState().moveSection('s2', -1);
    // "Two" and slide C land before "One" and everything One owned.
    expect(shape()).toBe('Intro [Two] C [One] A [One point one] B');
  });

  it('treats a subsection as part of its parent, not as a boundary', () => {
    // Section One owns A, the subsection heading AND B — a subsection does not end it.
    useStore.getState().moveSection('s1', 1);
    expect(shape()).toBe('Intro [Two] C [One] A [One point one] B');
  });

  it('does nothing at the ends', () => {
    const before = shape();
    useStore.getState().moveSection('s1', -1);
    expect(shape()).toBe(before);
  });
});

describe('deleting a section', () => {
  it('can remove the heading and keep the slides', () => {
    useStore.getState().deleteSection('s1', true);
    expect(shape()).toBe('Intro A [One point one] B [Two] C');
  });

  it('can remove the heading and everything under it, subsections included', () => {
    useStore.getState().deleteSection('s1', false);
    expect(shape()).toBe('Intro [Two] C');
  });

  it('moves the selection when the selected slide goes with it', () => {
    useStore.getState().selectSlide('f2');
    useStore.getState().deleteSection('s1', false);
    expect(useStore.getState().selection.slideId).not.toBe('f2');
    expect(useStore.getState().selection.slideId).not.toBeNull();
  });
});

describe('speaker notes', () => {
  it('creates a note on first keystroke and drops it when emptied', () => {
    const frameOf = (): { notes: unknown[] } => {
      const f = useStore.getState().deck.nodes.find((n) => n.kind === 'frame' && n.id === 'f1');
      if (f?.kind !== 'frame') throw new Error('expected a frame');
      return f;
    };
    expect(frameOf().notes).toHaveLength(0);

    useStore.getState().setFrameNote('f1', [{ t: 'text', s: 'Say this' }]);
    expect(frameOf().notes).toHaveLength(1);

    useStore.getState().setFrameNote('f1', []);
    expect(frameOf().notes).toHaveLength(0);
  });
});
