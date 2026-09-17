import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame, newTocElement, newTextElement, plain } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import type { Deck, SectionNode } from '../src/model/types.js';

/**
 * Sections, the outline slide and speaker notes.
 *
 * Sections and notes were emitted and parsed from the start with no UI at all, so this
 * pins the round trip the authoring UI now depends on. `\tableofcontents` is the new
 * half: it was a modelled element kind (`toc`) that the emitter dropped on the floor and
 * the parser never produced.
 */

function roundTrip(deck: Deck): { tex: string; round: ReturnType<typeof parseDeck> } {
  const tex = emitDeck(deck).tex;
  const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });
  expect(emitDeck(round.deck).tex).toBe(tex);
  expect(round.guard.ok).toBe(true);
  expect(round.health.demoted).toBe(0);
  return { tex, round };
}

function section(level: SectionNode['level'], title: string): SectionNode {
  return { kind: 'section', id: `s-${title}`, level, title: plain(title), starred: false };
}

describe('the outline slide', () => {
  it('emits \\tableofcontents and reads it back', () => {
    const base = newDeck({ title: 'T' });
    const deck: Deck = {
      ...base,
      nodes: [
        section('section', 'Results'),
        newFrame('Outline', [newTocElement()]),
      ],
    };
    const { tex, round } = roundTrip(deck);
    expect(tex).toContain('\\tableofcontents');

    const frame = round.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected a frame');
    expect(frame.children[0]?.kind).toBe('toc');
  });

  it('keeps the option group verbatim', () => {
    // `[currentsection]`, `[hideallsubsections]` and friends are beamer's business, not
    // the model's, so they round-trip as the bytes they were written as.
    const base = newDeck({ title: 'T' });
    const deck: Deck = {
      ...base,
      nodes: [newFrame('Outline', [newTocElement('[currentsection]')])],
    };
    const { tex, round } = roundTrip(deck);
    expect(tex).toContain('\\tableofcontents[currentsection]');

    const frame = round.deck.nodes.find((n) => n.kind === 'frame');
    if (frame?.kind !== 'frame') throw new Error('expected a frame');
    const el = frame.children[0];
    expect(el?.kind === 'toc' && el.options).toBe('[currentsection]');
  });

  it('is no longer dropped by the emitter', () => {
    const base = newDeck({ title: 'T' });
    const deck: Deck = { ...base, nodes: [newFrame('O', [newTocElement()])] };
    expect(emitDeck(deck).warnings.filter((w) => w.code === 'emit.unimplemented')).toEqual([]);
  });
});

describe('sections', () => {
  it('round-trips every level, starred or not, with a short title', () => {
    const base = newDeck({ title: 'T' });
    const deck: Deck = {
      ...base,
      nodes: [
        section('part', 'One'),
        section('section', 'Method'),
        { ...section('subsection', 'Detail'), shortTitle: plain('Det') },
        { ...section('subsubsection', 'Aside'), starred: true },
        newFrame('Slide', [newTextElement('body')]),
      ],
    };
    const { tex, round } = roundTrip(deck);
    expect(tex).toContain('\\part{One}');
    expect(tex).toContain('\\subsection[Det]{Detail}');
    expect(tex).toContain('\\subsubsection*{Aside}');
    expect(round.deck.nodes.filter((n) => n.kind === 'section')).toHaveLength(4);
  });
});

describe('speaker notes', () => {
  it('round-trips a note, which the PDF does not show', () => {
    const base = newDeck({ title: 'T' });
    const frame = newFrame('Slide', [newTextElement('body')]);
    frame.notes = [{ id: 'n1', content: plain('Breathe. Then the numbers.') }];
    const { tex, round } = roundTrip({ ...base, nodes: [frame] });

    expect(tex).toContain('\\note{Breathe. Then the numbers.}');
    // Not shown unless the deck asks for it, which the app does not.
    expect(tex).not.toContain('show notes');

    const back = round.deck.nodes.find((n) => n.kind === 'frame');
    if (back?.kind !== 'frame') throw new Error('expected a frame');
    expect(back.notes).toHaveLength(1);
  });

  it('keeps several notes on one frame', () => {
    const base = newDeck({ title: 'T' });
    const frame = newFrame('Slide', [newTextElement('body')]);
    frame.notes = [
      { id: 'n1', content: plain('First') },
      { id: 'n2', content: plain('Second'), options: '[item]' },
    ];
    const { tex, round } = roundTrip({ ...base, nodes: [frame] });
    expect(tex).toContain('\\note[item]{Second}');

    const back = round.deck.nodes.find((n) => n.kind === 'frame');
    if (back?.kind !== 'frame') throw new Error('expected a frame');
    expect(back.notes).toHaveLength(2);
  });
});
