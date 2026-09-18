/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { describe, expect, it } from 'vitest';
import { parseBib, shortAuthor } from '../src/io/bibtex.js';

/**
 * The `.bib` reader exists to fill a picker, not to implement BibTeX — BibTeX itself
 * compiles the file and nothing here changes the output. What matters is that it never
 * hides a key: an entry it only half understands must still be listed.
 */

const SAMPLE = `
% a comment line
@string{aw = "Addison-Wesley"}

@book{knuth1984,
  author    = {Donald E. Knuth},
  title     = {The {\\TeX}book},
  publisher = aw,
  year      = 1984
}

@article{lamport86,
  author = {Leslie Lamport and Someone Else},
  title  = "A note, with a comma inside",
  year   = {1986},
}

@inproceedings{nested2020,
  title = {Braces {Inside {The} Title}},
  author = {Ada Lovelace},
}
`;

describe('reading a .bib', () => {
  it('finds every entry, and skips @string and comments', () => {
    expect(parseBib(SAMPLE).map((e) => e.key))
      .toEqual(['knuth1984', 'lamport86', 'nested2020']);
  });

  it('reads the fields a picker shows', () => {
    const [knuth] = parseBib(SAMPLE);
    expect(knuth?.type).toBe('book');
    expect(knuth?.author).toBe('Donald E. Knuth');
    expect(knuth?.year).toBe('1984');
    // Brace groups protect capitals in BibTeX; they are not part of the text.
    expect(knuth?.title).toBe('The \\TeXbook');
  });

  it('is not fooled by a comma inside a quoted value', () => {
    const lamport = parseBib(SAMPLE)[1];
    expect(lamport?.title).toBe('A note, with a comma inside');
    expect(lamport?.year).toBe('1986');
  });

  it('keeps an entry whose fields it cannot fully resolve', () => {
    // `publisher = aw` is a @string macro this reader deliberately does not expand.
    // The entry must still be listed, or the key becomes uncitable.
    expect(parseBib(SAMPLE)[0]?.key).toBe('knuth1984');
  });

  it('handles nested braces without swallowing the next entry', () => {
    expect(parseBib(SAMPLE)[2]?.title).toBe('Braces Inside The Title');
  });

  it('survives an empty or broken file', () => {
    expect(parseBib('')).toEqual([]);
    expect(parseBib('@book{ unterminated, author = {X}')).toHaveLength(1);
  });
});

describe('a one-line author label', () => {
  it('uses the surname, and marks several authors', () => {
    expect(shortAuthor('Donald E. Knuth')).toBe('Knuth');
    expect(shortAuthor('Knuth, Donald E.')).toBe('Knuth');
    expect(shortAuthor('Leslie Lamport and Someone Else')).toBe('Lamport et al.');
    expect(shortAuthor(undefined)).toBe('');
  });
});
