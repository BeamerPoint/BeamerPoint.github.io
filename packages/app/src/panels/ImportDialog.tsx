/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { useEffect, useState } from 'react';
import { packageOrigin, type Collection } from '@beamerpoint/engine';
import type { ElementKind } from '@beamerpoint/core';
import { matchResources, type ImportAnalysis, type ResourceMatch } from '../io/importTex.js';
import { dataBase } from '../engine/assetPaths.js';

interface Props {
  filename: string;
  analysis: ImportAnalysis;
  onCancel(): void;
  onConfirm(files: Map<string, File>): void;
}

const KIND_LABEL: Partial<Record<ElementKind, string>> = {
  text: 'paragraph', list: 'list', block: 'block', columns: 'column layout',
  image: 'image', table: 'table', math: 'equation', tikz: 'diagram',
  code: 'code block', chart: 'chart', raw: 'raw LaTeX block',
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * The import confirmation.
 *
 * An import replaces the open deck, so the user sees what they are getting first —
 * including, prominently, what did NOT come through as editable. A summary that only
 * counted the successes would be the kind of flattery this app is built to avoid.
 */
export function ImportDialog({ filename, analysis, onCancel, onConfirm }: Props): React.ReactElement {
  const { report } = analysis;
  const [matches, setMatches] = useState<ResourceMatch[]>(
    () => matchResources(report.missingResources, []),
  );
  const [unbundled, setUnbundled] = useState<Array<{ name: string; collection: Collection | null }>>([]);
  const [checkedPackages, setCheckedPackages] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const bad: Array<{ name: string; collection: Collection | null }> = [];
      for (const name of report.packages) {
        const origin = await packageOrigin(`${name}.sty`, dataBase());
        if (origin.conclusive && origin.collection === null) {
          bad.push({ name, collection: null });
        }
      }
      if (!live) return;
      setUnbundled(bad);
      setCheckedPackages(true);
    })();
    return () => { live = false; };
  }, [report.packages.join('|')]);

  const kinds = Object.entries(report.elements)
    .filter(([kind]) => kind !== 'raw')
    .sort((a, b) => b[1] - a[1]);

  const matched = matches.filter((m) => m.file !== null).length;

  const onPickImages = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = [...(e.target.files ?? [])];
    setMatches(matchResources(report.missingResources, files));
  };

  const confirm = (): void => {
    const map = new Map<string, File>();
    for (const m of matches) if (m.file !== null) map.set(m.path, m.file);
    onConfirm(map);
  };

  return (
    <div className="bp-modal-backdrop" onClick={onCancel}>
      <div className="bp-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Import {filename}</h3>

        {report.slides === 0 ? (
          <p className="bp-hint bp-hint-warn">
            No <code>frame</code> environments found. This does not look like a Beamer
            presentation — importing it would give you one long raw block.
          </p>
        ) : (
          <p>
            <strong>{plural(report.slides, 'slide')}</strong>
            {kinds.length > 0 && (
              <>
                , containing{' '}
                {kinds.map(([kind, n], i) => (
                  <span key={kind}>
                    {i > 0 && (i === kinds.length - 1 ? ' and ' : ', ')}
                    {plural(n, KIND_LABEL[kind as ElementKind] ?? kind)}
                  </span>
                ))}
              </>
            )}
            .
          </p>
        )}

        {report.raw.length > 0 ? (
          <div className="bp-import-raw">
            <strong>
              {plural(report.raw.length, 'block')} could not be modelled
              {report.rawRatio > 0
                ? ` (${Math.round(report.rawRatio * 100)}% of the file)`
                : ''}
            </strong>
            <p className="bp-muted">
              These are kept exactly as written and shown on the canvas as raw LaTeX.
              They will compile, but you will have to edit them in the source panel.
            </p>
            <ul>
              {[...new Map(report.raw.map((r) => [r.label, r])).values()]
                .slice(0, 8)
                .map((r) => (
                  <li key={r.label}>
                    <code>{r.label}</code>
                    {r.slide !== null ? ` — slide ${r.slide}` : ' — document level'}
                  </li>
                ))}
              {report.raw.length > 8 && <li>…and {report.raw.length - 8} more.</li>}
            </ul>
          </div>
        ) : (
          report.slides > 0 && (
            <p className="bp-ok">Everything in the file was understood.</p>
          )
        )}

        {report.parseErrors > 0 && (
          <p className="bp-hint bp-hint-warn">
            {plural(report.parseErrors, 'place')} in the file could not be parsed
            (unbalanced braces or a missing <code>\end</code>). The text is preserved,
            but check those slides.
          </p>
        )}

        {report.themeProblem !== null && (
          <p className="bp-hint bp-hint-warn">
            Theme <code>{report.theme}</code> needs {report.themeProblem}, which is not
            in the bundled TeX Live. The deck will import, but pick another theme before
            compiling.
          </p>
        )}

        {checkedPackages && unbundled.length > 0 && (
          <p className="bp-hint bp-hint-warn">
            {unbundled.length === 1 ? 'Package' : 'Packages'}{' '}
            {unbundled.map((u) => <code key={u.name}>{u.name}</code>)
              .reduce<React.ReactNode[]>((acc, el, i) => (
                i === 0 ? [el] : [...acc, ', ', el]), [])}
            {' '}
            {unbundled.length === 1 ? 'is' : 'are'} not in the bundled TeX Live
            collections, so this deck will not compile here without changes.
          </p>
        )}

        {report.missingResources.length > 0 && (
          <div className="bp-import-files">
            <strong>
              {plural(report.missingResources.length, 'file')} referenced but not
              included
            </strong>
            <p className="bp-muted">
              A <code>.tex</code> names its images; it does not carry them. Pick them
              now, or add them later from the slide.
            </p>
            <label className="bp-file-input">
              Choose images…
              <input type="file" multiple accept="image/*" onChange={onPickImages} />
            </label>
            <ul>
              {matches.map((m) => (
                <li key={m.path}>
                  <code>{m.path}</code>
                  {m.file !== null
                    ? ' — matched'
                    : m.ambiguous
                      ? ' — several files share that name; add it from the slide instead'
                      : ' — not supplied'}
                </li>
              ))}
            </ul>
            {matched > 0 && (
              <p className="bp-ok">
                {matched} of {matches.length} matched by filename.
              </p>
            )}
          </div>
        )}

        <div className="bp-modal-actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="bp-primary" onClick={confirm}>
            Replace my deck with this
          </button>
        </div>
        <p className="bp-muted bp-modal-note">
          This replaces the deck you have open. Export it first if you want to keep it.
        </p>
      </div>
    </div>
  );
}
