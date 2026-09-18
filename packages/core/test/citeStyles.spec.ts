import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import { derivePackages } from '../src/emit/derivePackages.js';
import type { CiteStyle, Deck, RichText } from '../src/model/types.js';
import { expectRoundTrip } from './helpers/roundTrip.js';

/**
 * `\citep`, `\citet`, and the two biblatex commands.
 *
 * Measured against the bundled engine before any of this was written. natbib's
 * `\citep{knuth1984}` and `\citet{lamport1994}` resolve with zero "Citation undefined"
 * warnings under the app's existing `\bibliographystyle` + `\bibliography` + BibTeX
 * pipeline; a control citing a key that is not in the `.bib` produced two such warnings,
 * which is what makes the absence meaningful.
 *
 * biblatex's `\autocite`/`\textcite` also compile here, but biblatex REPLACES that
 * pipeline (`\addbibresource`, `\printbibliography`). So they are read and preserved —
 * someone else's deck stays editable — and nothing is derived for them, and the UI does
 * not offer them.
 */

function deckWithCites(content: RichText): Deck {
  const base = newDeck({ title: 'T' });
  return {
    ...base,
    nodes: [newFrame('S', [
      { id: 'e1', kind: 'text', placement: { mode: 'flow' }, content },
    ])],
  };
}

const cite = (style: CiteStyle | undefined, key = 'knuth1984'): RichText =>
  [{ t: 'text', s: 'See ' }, style === undefined
    ? { t: 'cite', keys: [key] }
    : { t: 'cite', keys: [key], style }];

function round(tex: string) {
  return parseDeck(tex, { newId: makeSeededIdFactory('r') });
}

function citeOf(tex: string) {
  const frame = round(tex).deck.nodes.find((n) => n.kind === 'frame');
  const el = frame?.kind === 'frame' ? frame.children[0] : undefined;
  return el?.kind === 'text' ? el.content.find((n) => n.t === 'cite') : undefined;
}

describe('citation commands', () => {
  it('writes the command each style stands for', () => {
    expect(emitDeck(deckWithCites(cite('p'))).tex).toContain('\\citep{knuth1984}');
    expect(emitDeck(deckWithCites(cite('t'))).tex).toContain('\\citet{knuth1984}');
    expect(emitDeck(deckWithCites(cite('auto'))).tex).toContain('\\autocite{knuth1984}');
    expect(emitDeck(deckWithCites(cite('text'))).tex).toContain('\\textcite{knuth1984}');
  });

  it('leaves a plain \\cite exactly as it was', () => {
    // Every deck written before the other commands existed has to keep round-tripping,
    // so `plain` carries no `style` key at all.
    const tex = emitDeck(deckWithCites(cite(undefined))).tex;
    expect(tex).toContain('\\cite{knuth1984}');
    expect(tex).not.toContain('citep');
    const back = citeOf(tex);
    expect(back).toEqual({ t: 'cite', keys: ['knuth1984'] });
    expect('style' in (back ?? {})).toBe(false);
  });

  it('round-trips every style with nothing demoted', () => {
    for (const style of ['p', 't', 'auto', 'text'] as CiteStyle[]) {
      const tex = emitDeck(deckWithCites(cite(style))).tex;
      expectRoundTrip(deckWithCites(cite(style)));
      const r = round(tex);
      expect(r.health.demoted, style).toBe(0);
      expect(r.guard.ok, style).toBe(true);
      expect(emitDeck(r.deck).tex, style).toBe(tex);
      expect(citeOf(tex), style).toMatchObject({ style });
    }
  });

  it('keeps the pre- and post-notes on a natbib citation', () => {
    const rt: RichText = [{ t: 'cite', keys: ['knuth1984'], style: 'p', pre: 'see', post: 'p. 3' }];
    const tex = emitDeck(deckWithCites(rt)).tex;
    expect(tex).toContain('\\citep[see][p. 3]{knuth1984}');
    expect(emitDeck(round(tex).deck).tex).toBe(tex);
  });

  it('derives natbib for \\citep and \\citet, because they are natbib commands', () => {
    // Without the package they are undefined control sequences and there is NO PDF --
    // the same class of failure as an unknown listings language.
    for (const style of ['p', 't'] as CiteStyle[]) {
      const names = derivePackages(deckWithCites(cite(style))).map((p) => p.name);
      expect(names, style).toContain('natbib');
    }
  });

  it('derives nothing for a plain \\cite', () => {
    // `\cite` is LaTeX's own; adding natbib would change how every citation renders.
    const names = derivePackages(deckWithCites(cite(undefined))).map((p) => p.name);
    expect(names).not.toContain('natbib');
  });

  it('derives nothing for the biblatex commands', () => {
    // biblatex replaces the BibTeX pipeline; deriving natbib beside it is a clash, and
    // deriving biblatex would rewrite the deck's bibliography out from under it.
    for (const style of ['auto', 'text'] as CiteStyle[]) {
      const names = derivePackages(deckWithCites(cite(style))).map((p) => p.name);
      expect(names, style).not.toContain('natbib');
      expect(names, style).not.toContain('biblatex');
    }
  });

  it('finds a citation nested inside formatting, and inside a list', () => {
    // The deriver never used to look at inline content at all, so a `\citep` inside a
    // bold run or a bullet would have compiled to nothing.
    const bold: RichText = [
      { t: 'style', style: 'bf', children: [{ t: 'cite', keys: ['k'], style: 'p' }] },
    ];
    expect(derivePackages(deckWithCites(bold)).map((p) => p.name)).toContain('natbib');

    const base = newDeck({ title: 'T' });
    const listDeck: Deck = {
      ...base,
      nodes: [newFrame('S', [{
        id: 'l1', kind: 'list', placement: { mode: 'flow' }, listType: 'itemize',
        items: [{ id: 'i1', content: [{ t: 'cite', keys: ['k'], style: 't' }] }],
      }])],
    };
    expect(derivePackages(listDeck).map((p) => p.name)).toContain('natbib');
  });
});
