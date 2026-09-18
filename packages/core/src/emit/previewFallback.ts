import type { CodeElement, Deck, Element } from '../model/types.js';
import { LST_LANGUAGES } from './lstLanguages.js';

/**
 * What to compile when the engine cannot compile what the user wrote.
 *
 * `minted` highlights code by running Pygments through shell escape. The in-browser
 * engine has no shell, and measured, a `minted` block does not degrade -- it produces NO
 * PDF at all ("Missing definition for highlighting style"). So a PREVIEW swaps each
 * minted block for `listings`, which needs no shell, while the exported file keeps real
 * `minted` for anyone compiling it with a local TeX.
 *
 * This is a deck-to-deck transform applied by `buildProject` for a preview, never part
 * of `emitDeck`. The store, the source panel, export and autosave all emit through
 * `emitDeck`, so none of them can see this: the model does not change because it was
 * previewed, and the parser still reads back exactly what export writes. Element ids are
 * kept, so the source map still addresses the same element and a TeX error on the
 * listing still lands on it.
 *
 * `listings` treats an unknown language as a HARD error, so swapping blindly would trade
 * one missing PDF for another. Measured: `\begin{lstlisting}` with no language compiles,
 * `language=Nonesuch` does not. A language is kept only when `listings` can load it --
 * mapped from the Pygments name minted uses -- and otherwise dropped, which costs the
 * highlighting and nothing else.
 */

/** Pygments lexer names that differ from the `listings` spelling of the same language. */
const PYGMENTS_TO_LST: Readonly<Record<string, string>> = {
  py: 'Python', python3: 'Python', py3: 'Python',
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
  cpp: 'C++', 'c++': 'C++', cxx: 'C++', hpp: 'C++',
  shell: 'bash', zsh: 'bash', console: 'bash',
  rb: 'Ruby', rs: 'Rust', kt: 'Kotlin', yml: 'YAML', htm: 'HTML', latex: 'TeX', tex: 'TeX',
  golang: 'Go', 'objective-c': 'C', matlab: 'Matlab', octave: 'Octave',
};

/** Options `listings` understands that a minted block may carry. Anything else is dropped. */
const LISTINGS_SAFE_OPTIONS: ReadonlySet<string> = new Set(['numbers']);

export interface PreviewFallbackResult {
  deck: Deck;
  /** One line per substitution, for the Log tab. Informational, never an error. */
  notes: string[];
}

function listingsLanguage(language: string): string {
  const wanted = PYGMENTS_TO_LST[language.toLowerCase()] ?? language;
  return LST_LANGUAGES.find((l) => l.toLowerCase() === wanted.toLowerCase()) ?? '';
}

function asListings(el: CodeElement, notes: string[]): CodeElement {
  const language = listingsLanguage(el.language);
  const options: Record<string, string> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(el.options)) {
    if (LISTINGS_SAFE_OPTIONS.has(k)) options[k] = v;
    else dropped.push(k);
  }
  notes.push(
    `Previewed a minted code block with listings, because this engine cannot run minted`
    + (language === '' && el.language !== '' ? ` (no highlighting: listings has no "${el.language}")` : '')
    + (dropped.length > 0 ? ` (ignored for the preview: ${dropped.join(', ')})` : '')
    + '. The exported file keeps minted.',
  );
  return { ...el, backend: 'listings', language, options };
}

export function applyPreviewFallbacks(deck: Deck): PreviewFallbackResult {
  const notes: string[] = [];
  let changed = false;

  const visit = (els: readonly Element[]): Element[] => els.map((el) => {
    if (el.kind === 'code' && el.backend === 'minted') { changed = true; return asListings(el, notes); }
    if (el.kind === 'block') return { ...el, children: visit(el.children) };
    if (el.kind === 'columns') {
      return { ...el, columns: el.columns.map((c) => ({ ...c, children: visit(c.children) })) };
    }
    return el;
  });

  const nodes = deck.nodes.map((n) => (n.kind === 'frame' ? { ...n, children: visit(n.children) } : n));
  // Hand back the SAME deck when nothing needed a fallback, so a preview of an ordinary
  // deck is byte-for-byte the export.
  return { deck: changed ? { ...deck, nodes } : deck, notes };
}
