// @vitest-environment happy-dom
/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { newDeck, resolveTheme, type Deck } from '@beamerpoint/core';
import { TitlePage, isTitlePageTex } from '../src/canvas/TitlePage.js';

/**
 * The canvas used to draw `\titlepage` as the literal string `\titlepage` in a grey box,
 * which resembled the compiled slide not at all. These check that it now draws the
 * deck's own metadata, in the order and with the colours the theme was measured to use.
 */

function render(deck: Deck, theme: string, placeholders = true): string {
  return renderToStaticMarkup(
    <TitlePage deck={deck} theme={resolveTheme(theme)} showPlaceholders={placeholders} />,
  );
}

function deckWithMeta(): Deck {
  const deck = newDeck({ title: 'Measured Colours', author: 'A. Mohebbi' });
  return { ...deck, meta: { ...deck.meta, institute: [{ t: 'text', s: 'Polytechnique' }] } };
}

describe('title page', () => {
  it('recognises the two commands beamer builds a title page from', () => {
    expect(isTitlePageTex('\\titlepage')).toBe(true);
    expect(isTitlePageTex('  \\maketitle\n')).toBe(true);
    expect(isTitlePageTex('\\tableofcontents')).toBe(false);
  });

  it('draws the deck metadata rather than the command', () => {
    const html = render(deckWithMeta(), 'Madrid');
    expect(html).toContain('Measured Colours');
    expect(html).toContain('A. Mohebbi');
    expect(html).toContain('Polytechnique');
    expect(html).not.toContain('titlepage<');
  });

  it("paints Madrid's title bar, without which its white title is invisible", () => {
    const madrid = resolveTheme('Madrid');
    expect(madrid.titlePage.titleFg).toBe('#ffffff');
    expect(madrid.titlePage.titleBg).toBe('#3333b3');
    expect(render(deckWithMeta(), 'Madrid')).toContain('bp-titlebox');
  });

  it('leaves a theme with no title bar unboxed', () => {
    // `default` sets its title in the structure colour on the page background.
    expect(resolveTheme('default').titlePage.titleBg).toBeUndefined();
    expect(render(deckWithMeta(), 'default')).not.toContain('bp-titlebox');
  });

  it('follows the measured layout, including the themes that differ', () => {
    const madrid = resolveTheme('Madrid').titleLayout;
    expect(madrid.align).toBe('center');
    expect(madrid.lines.map((l) => l.fields.join('+')))
      .toEqual(['title', 'subtitle', 'author', 'institute', 'date']);

    // metropolis is left-aligned at the text margin and puts the date before the
    // institute; Nord sets author and institute on ONE line.
    const metro = resolveTheme('metropolis').titleLayout;
    expect(metro.align).toBe('left');
    expect(metro.anchorMm).toBe(10);
    expect(metro.lines.map((l) => l.fields.join('+')))
      .toEqual(['title', 'subtitle', 'author', 'date', 'institute']);
    expect(resolveTheme('Nord').titleLayout.lines[2]!.fields).toEqual(['author', 'institute']);
  });

  it('shows a placeholder for a field the deck has not filled in', () => {
    const html = render(newDeck({ title: 'T' }), 'Madrid');
    expect(html).toContain('bp-title-placeholder');
    // ...and not when the caller asks for a clean rendering, as the thumbnails do.
    expect(render(newDeck({ title: 'T' }), 'Madrid', false)).not.toContain('bp-title-placeholder');
  });

  it('renders \\today as a date, not as seven characters of LaTeX', () => {
    const deck = newDeck({ title: 'T' });
    const html = render(deck, 'Madrid');
    expect(deck.meta.date).toBeDefined();
    expect(html).not.toContain('\\today');
    expect(html).toContain(String(new Date().getFullYear()));
  });
});
