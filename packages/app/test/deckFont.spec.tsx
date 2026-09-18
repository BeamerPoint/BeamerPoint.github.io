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
import { DECK_FONTS, newDeck, newFrame, newTextElement } from '@beamerpoint/core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from '../src/state/store.js';
import { SlideThumbs } from '../src/panels/SlideThumbs.js';

/**
 * One font family for the whole deck.
 *
 * The measurement this is built on: beamer typesets in SANS, so `mathptmx` sets
 * `\rmdefault` and leaves `\familydefault` at `cmss` — loading it on its own changes
 * nothing visible. A serif family has to carry `\usefonttheme{serif}` with it, and that
 * pairing is what these tests pin down.
 */

function load(): void {
  const deck = newDeck({ title: 'T' });
  useStore.getState().loadDeck({
    ...deck,
    nodes: [newFrame('S', [newTextElement('hello')])],
  });
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const source = (): string => useStore.getState().source.text;

describe('the deck font', () => {
  beforeEach(load);

  it('writes the package for a sans family and no font theme', () => {
    useStore.getState().setDeckFont('helvet');
    expect(source()).toContain('\\usepackage{helvet}');
    expect(source()).not.toContain('\\usefonttheme');
  });

  it('brings the serif font theme along with a serif family', () => {
    // Without it the package loads, the compile succeeds, and the slide is unchanged.
    useStore.getState().setDeckFont('mathptmx');
    expect(source()).toContain('\\usepackage{mathptmx}');
    expect(source()).toContain('\\usefonttheme{serif}');
  });

  it('replaces the previous family rather than stacking packages', () => {
    const s = useStore.getState();
    s.setDeckFont('mathptmx');
    s.setDeckFont('mathpazo');
    expect(source()).toContain('\\usepackage{mathpazo}');
    expect(source()).not.toContain('\\usepackage{mathptmx}');
  });

  it('clears the serif theme it set when going back to a sans family', () => {
    const s = useStore.getState();
    s.setDeckFont('mathptmx');
    s.setDeckFont('helvet');
    expect(source()).not.toContain('\\usefonttheme{serif}');
  });

  it("leaves a font theme it did not set alone", () => {
    // An imported deck's `professionalfonts` is the author's choice, not this control's.
    const s = useStore.getState();
    s.loadDeck({
      ...useStore.getState().deck,
      preamble: {
        ...useStore.getState().deck.preamble,
        fontTheme: { name: 'professionalfonts', options: [] },
      },
    });
    s.setDeckFont('helvet');
    expect(source()).toContain('\\usefonttheme{professionalfonts}');
  });

  it('returns to the theme default, removing everything it added', () => {
    const s = useStore.getState();
    s.setDeckFont('mathpazo');
    s.setDeckFont(null);
    expect(source()).not.toContain('\\usepackage{mathpazo}');
    expect(source()).not.toContain('\\usefonttheme{serif}');
  });

  it('round-trips: the choice is read back out of the package list', () => {
    // Nothing new is stored in the file -- `Preamble.packages` already round-trips, so
    // an imported deck that loads `helvet` shows up as Helvetica with no extra state.
    useStore.getState().setDeckFont('charter');
    const text = source();
    const s = useStore.getState();
    s.editSource(text);
    s.applySource();
    expect(source()).toBe(text);
    expect(useStore.getState().deck.preamble.packages.map((p) => p.name))
      .toContain('charter');
  });

  it('offers only families that were measured to change the family', () => {
    for (const f of DECK_FONTS) {
      expect(f.family).not.toBe('');
      if (f.serif) expect(f.family).not.toBe('cmss');
    }
  });
});

// F-017, fixed: the PDF changed and the canvas never did.
describe('the deck font on the canvas', () => {
  beforeEach(load);

  // A live root, not renderToStaticMarkup: zustand hands a server render its INITIAL
  // state, so a static render never sees the font that was just chosen.
  const paperFont = (): string => {
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() => root.render(<SlideThumbs />));
    const family = (host.querySelector('.bp-thumb-inner') as HTMLElement).style.fontFamily;
    act(() => root.unmount());
    return family;
  };

  it('draws a serif family in serif', () => {
    expect(paperFont()).toContain('Latin Modern Sans');
    useStore.getState().setDeckFont('mathpazo');
    expect(paperFont()).toContain('Palatino');
    useStore.getState().setDeckFont(null);
    expect(paperFont()).toContain('Latin Modern Sans');
  });
});
