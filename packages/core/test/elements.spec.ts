/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { describe, expect, it } from 'vitest';
import { newDeck, newFrame, newListElement, newTextElement } from '../src/model/factory.js';
import type {
  BeamerBlockElement, ColumnsElement, Deck, Element, ListElement,
} from '../src/model/types.js';
import { expectRoundTrip } from './helpers/roundTrip.js';

/**
 * The emitted bytes of the structural elements.
 *
 * Blocks, columns and list environments round-tripped in `roundtrip.spec.ts`, but no test
 * said what LaTeX they PRODUCE -- so an emitter that wrote the wrong environment name
 * consistently in both directions would have passed. Each expectation here was checked
 * against the bundled engine, where every one of these compiles.
 */

const P = { mode: 'flow' as const };

function deckOf(...children: Element[]): Deck {
  return { ...newDeck({ title: 'T' }), nodes: [newFrame('F', children)] };
}

function frameBody(deck: Deck): string {
  const tex = expectRoundTrip(deck).tex;
  return tex.slice(tex.indexOf('\\begin{frame}'), tex.indexOf('\\end{frame}'));
}

const block = (variant: BeamerBlockElement['variant']): BeamerBlockElement => ({
  id: `b-${variant}`, kind: 'block', placement: P, variant,
  title: [{ t: 'text', s: 'Heading' }], children: [newTextElement('Body')],
});

describe('blocks', () => {
  for (const variant of ['block', 'alertblock', 'exampleblock'] as const) {
    it(`writes a ${variant} with its title as the argument`, () => {
      expect(frameBody(deckOf(block(variant)))).toContain(
        `\\begin{${variant}}{Heading}\n    Body\n  \\end{${variant}}`,
      );
    });
  }

  it('writes an empty title argument rather than omitting it', () => {
    // beamer's block takes its title as a MANDATORY argument; leaving it out swallows the
    // first token of the body as the title.
    const untitled: BeamerBlockElement = { ...block('block'), title: [] };
    expect(frameBody(deckOf(untitled))).toContain('\\begin{block}{}');
  });
});

describe('columns', () => {
  const cols: ColumnsElement = {
    id: 'c', kind: 'columns', placement: P,
    columns: [
      { id: 'ca', width: { v: 0.48, u: 'textwidth' }, valign: 't', children: [newTextElement('Left')] },
      { id: 'cb', width: { v: 0.48, u: 'textwidth' }, children: [newTextElement('Right')] },
    ],
  };

  it('writes each column with its width, and an alignment only when it has one', () => {
    const body = frameBody(deckOf(cols));
    expect(body).toContain('\\begin{columns}');
    expect(body).toContain('\\begin{column}[t]{0.48\\textwidth}\n      Left\n    \\end{column}');
    expect(body).toContain('\\begin{column}{0.48\\textwidth}\n      Right\n    \\end{column}');
    expect(body).toContain('\\end{columns}');
  });

  it('keeps a block nested inside a column', () => {
    const nested: ColumnsElement = {
      ...cols,
      columns: [{ ...cols.columns[0]!, children: [block('alertblock')] }, cols.columns[1]!],
    };
    expect(frameBody(deckOf(nested))).toContain('\\begin{alertblock}{Heading}');
  });
});

describe('list environments', () => {
  it('writes an itemize', () => {
    expect(frameBody(deckOf(newListElement(['one', 'two'])))).toContain(
      '\\begin{itemize}\n    \\item one\n    \\item two\n  \\end{itemize}',
    );
  });

  it('writes an enumerate', () => {
    const l: ListElement = { ...newListElement(['a', 'b']), listType: 'enumerate' };
    expect(frameBody(deckOf(l))).toContain('\\begin{enumerate}\n    \\item a');
  });

  it('writes a description with the term as the item option', () => {
    const base = newListElement(['definition']);
    const l: ListElement = {
      ...base, listType: 'description',
      items: [{ ...base.items[0]!, label: [{ t: 'text', s: 'Term' }] }],
    };
    expect(frameBody(deckOf(l))).toContain('\\item[Term] definition');
  });

  it('nests a sublist inside its item, indented one level further', () => {
    const outer = newListElement(['outer']);
    const l: ListElement = {
      ...outer, items: [{ ...outer.items[0]!, sublist: newListElement(['inner']) }],
    };
    expect(frameBody(deckOf(l))).toContain(
      '\\item outer\n      \\begin{itemize}\n        \\item inner\n      \\end{itemize}',
    );
  });
});
