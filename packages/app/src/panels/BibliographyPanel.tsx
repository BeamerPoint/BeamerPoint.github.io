import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store.js';
import { getResourceBytes } from '../state/resources.js';
import { importBibFile } from '../state/images.js';
import { parseBib, shortAuthor, type BibEntry } from '../io/bibtex.js';

/**
 * Citations: the attached `.bib` files, the style, and a picker.
 *
 * The inline `\cite` span has been modelled, emitted, parsed and rendered from the start
 * — what was missing was everything around it. `\bibliography{...}` was never written at
 * all, so a deck with a bibliography style produced one BibTeX could not resolve, and
 * `ResourceRef.kind === 'bib'` was never produced by anything.
 *
 * BibTeX itself runs in the bundled engine (verified: a two-pass compile with a `.bib` in
 * the virtual filesystem resolves the citation), so nothing here has to fake a reference
 * list — the PDF has the real one.
 */

/** Styles BibTeX ships with. `plain` is the safe default. */
const STYLES = ['plain', 'unsrt', 'alpha', 'abbrv', 'siam', 'apalike', 'ieeetr'];

export function BibliographyPanel(): React.ReactElement {
  const deck = useStore((s) => s.deck);
  const locked = useStore((s) => s.source.status !== 'synced');
  const selection = useStore((s) => s.selection);
  const attachBibliography = useStore((s) => s.attachBibliography);
  const detachBibliography = useStore((s) => s.detachBibliography);
  const setBibliographyStyle = useStore((s) => s.setBibliographyStyle);
  const addReferencesSlide = useStore((s) => s.addReferencesSlide);
  const insertCitation = useStore((s) => s.insertCitation);

  const fileInput = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState('');
  const bibs = deck.resources.filter((r) => r.kind === 'bib');
  const entries = useBibEntries(bibs.map((b) => b.id));

  // A citation goes into a text element, so the picker needs one selected.
  const frame = deck.nodes.find((n) => n.kind === 'frame' && n.id === selection.slideId);
  const target = frame?.kind === 'frame'
    ? frame.children.find((e) => e.id === selection.elementId && e.kind === 'text')
    : undefined;

  const shown = filter.trim() === ''
    ? entries
    : entries.filter((e) => matches(e, filter.toLowerCase()));

  return (
    <section className="bp-format-section">
      <h4>References</h4>

      <input
        ref={fileInput}
        type="file"
        accept=".bib,text/plain"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file === undefined) return;
          const paths = new Set(deck.resources.map((r) => r.path));
          attachBibliography(await importBibFile(file, paths));
        }}
      />

      {bibs.length === 0 ? (
        <p className="bp-hint">
          Attach a <code>.bib</code> and its entries appear here to cite.
        </p>
      ) : (
        <ul className="bp-bib-files">
          {bibs.map((b) => (
            <li key={b.id}>
              <span title={b.path}>{b.path}</span>
              <button
                disabled={locked}
                title="Detach this file"
                onClick={() => detachBibliography(b.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="bp-btn-row">
        <button disabled={locked} onClick={() => fileInput.current?.click()}>
          Attach .bib
        </button>
        <button
          disabled={locked || bibs.length === 0}
          title="A slide printing the reference list, with allowframebreaks"
          onClick={addReferencesSlide}
        >
          References slide
        </button>
      </div>

      {bibs.length > 0 && (
        <label className="bp-field">
          <span>Style</span>
          <select
            disabled={locked}
            value={deck.preamble.bibliography?.style ?? 'plain'}
            onChange={(e) => setBibliographyStyle(e.target.value)}
          >
            {STYLES.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
        </label>
      )}

      {entries.length > 0 && (
        <>
          <label className="bp-field">
            <span>{entries.length} entries</span>
            <input
              type="text"
              placeholder="Filter by author, title or key"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>

          {target === undefined && (
            <p className="bp-hint">
              Select a text box on the slide to cite into it.
            </p>
          )}

          <ul className="bp-bib-entries">
            {shown.slice(0, 40).map((e) => (
              <li key={e.key}>
                <button
                  disabled={locked || target === undefined}
                  title={`Insert \\cite{${e.key}}`}
                  onClick={() => target !== undefined && selection.slideId !== null
                    && insertCitation(selection.slideId, target.id, e.key)}
                >
                  <span className="bp-bib-key">{e.key}</span>
                  <span className="bp-bib-desc">
                    {[shortAuthor(e.author), e.year].filter(Boolean).join(' ')}
                    {e.title !== undefined ? ` — ${e.title}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function matches(e: BibEntry, needle: string): boolean {
  return [e.key, e.author, e.title, e.year]
    .some((v) => v !== undefined && v.toLowerCase().includes(needle));
}

/**
 * Entries from the attached files.
 *
 * The bytes live in IndexedDB keyed by resource id, so this is asynchronous; the list is
 * re-read whenever the set of attached ids changes.
 */
function useBibEntries(ids: string[]): BibEntry[] {
  const [entries, setEntries] = useState<BibEntry[]>([]);
  const key = ids.join(',');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const all: BibEntry[] = [];
      for (const id of key === '' ? [] : key.split(',')) {
        const bytes = await getResourceBytes(id);
        if (bytes === undefined) continue;
        all.push(...parseBib(new TextDecoder().decode(bytes)));
      }
      if (!cancelled) setEntries(all);
    })();

    return () => { cancelled = true; };
  }, [key]);

  return entries;
}
