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
import { useStore } from '../src/state/store.js';

/**
 * The slide rail's own operations.
 *
 * All three of these were wrong in a way that is hard to notice at the time: deleting
 * a slide sent you back to the top of the deck, deleting the last one did nothing at
 * all while the control stayed enabled, and moving a slide by one stepped over the
 * flat `deck.nodes` list — which holds section headings too, so a slide could swap
 * places with a heading and quietly change which section owned it.
 */

function sec(id: string, title: string): SectionNode {
  return { kind: 'section', id, level: 'section', title: plain(title), starred: false };
}

function frame(id: string, title: string) {
  return { ...newFrame(title, [newTextElement(title)]), id };
}

function load(deck: Deck): void {
  useStore.getState().loadDeck(deck);
}

function shape(): string {
  return useStore.getState().deck.nodes
    .map((n) => (n.kind === 'section'
      ? `[${richTextToPlain(n.title)}]`
      : n.kind === 'frame' ? (n.title ? richTextToPlain(n.title) : '?') : 'raw'))
    .join(' ');
}

function deckOf(...nodes: Deck['nodes']): Deck {
  return { ...newDeck({ title: 'T' }), nodes };
}

describe('the slide rail', () => {
  beforeEach(() => {
    load(deckOf(frame('f1', 'A'), frame('f2', 'B'), frame('f3', 'C')));
  });

  it('lands on the neighbour of the slide it deleted, not on the first', () => {
    useStore.getState().selectSlide('f2');
    useStore.getState().deleteSlide('f2');
    expect(shape()).toBe('A C');
    expect(useStore.getState().selection.slideId).toBe('f3');
  });

  it('falls back to the slide before, when it deleted the last one', () => {
    useStore.getState().deleteSlide('f3');
    expect(useStore.getState().selection.slideId).toBe('f2');
  });

  it('replaces the only slide with a blank one rather than refusing', () => {
    load(deckOf(frame('only', 'Solo')));
    useStore.getState().deleteSlide('only');

    const nodes = useStore.getState().deck.nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.kind).toBe('frame');
    expect(nodes[0]!.id).not.toBe('only');
    // ...and it is the one now selected, so the canvas is not left pointing at a ghost.
    expect(useStore.getState().selection.slideId).toBe(nodes[0]!.id);
  });

  it('moves a slide past another SLIDE, not past a section heading', () => {
    load(deckOf(frame('f1', 'A'), sec('s1', 'Two'), frame('f2', 'B')));
    // Stepping one index through `deck.nodes` would put A after the heading, leaving
    // the deck looking identical in the rail while A silently joined section Two.
    useStore.getState().moveSlide('f1', 1);
    expect(shape()).toBe('[Two] B A');
  });

  it('moves a slide back up past a heading in one step', () => {
    load(deckOf(frame('f1', 'A'), sec('s1', 'Two'), frame('f2', 'B')));
    useStore.getState().moveSlide('f2', -1);
    expect(shape()).toBe('B A [Two]');
  });

  it('drops a slide in front of another one', () => {
    useStore.getState().moveSlideBefore('f3', 'f1');
    expect(shape()).toBe('C A B');
  });

  it('drops a slide at the end when there is nothing to go in front of', () => {
    useStore.getState().moveSlideBefore('f1', null);
    expect(shape()).toBe('B C A');
  });

  it('drops a slide in front of a section heading, changing which section owns it', () => {
    // The rail shows headings and slides in one list, so "put it here" has to be able
    // to mean either side of a heading -- that is the whole point of dragging.
    load(deckOf(frame('f1', 'A'), sec('s1', 'Two'), frame('f2', 'B')));
    useStore.getState().moveSlideBefore('f2', 's1');
    expect(shape()).toBe('A B [Two]');
  });

  it('is a no-op when a slide is dropped on itself', () => {
    const before = useStore.getState().deck;
    useStore.getState().moveSlideBefore('f2', 'f2');
    expect(useStore.getState().deck).toBe(before);
  });

  it('finds the neighbour AFTER removing the slide, however far it travelled', () => {
    // Computing the landing index before the splice puts a forward move one place off,
    // which reads as the drag being ignored for adjacent slides and wrong for the rest.
    load(deckOf(frame('f1', 'A'), frame('f2', 'B'), frame('f3', 'C'), frame('f4', 'D')));
    useStore.getState().moveSlideBefore('f1', 'f4');
    expect(shape()).toBe('B C A D');
  });

  it('refuses to move the first slide up or the last one down', () => {
    const before = useStore.getState().deck;
    useStore.getState().moveSlide('f1', -1);
    useStore.getState().moveSlide('f3', 1);
    expect(useStore.getState().deck.nodes.map((n) => n.id)).toEqual(
      before.nodes.map((n) => n.id),
    );
  });
});
