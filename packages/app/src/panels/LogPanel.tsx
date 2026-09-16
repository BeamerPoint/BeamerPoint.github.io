import { findMissingFiles } from '@beamerpoint/engine';
import { useStore } from '../state/store.js';

/** Compile diagnostics, mapped back to slides and elements via the source map. */
/** Say "image" for an image and "package" for a package; mixed cases say "file". */
function missingHeading(missing: ReturnType<typeof findMissingFiles>): string {
  const graphics = missing.filter((m) => m.kind === 'graphic').length;
  const noun =
    graphics === missing.length ? 'image'
    : graphics === 0 ? 'package'
    : 'file';
  return missing.length === 1
    ? `An ${noun} this deck needs could not be found`.replace('An package', 'A package')
       .replace('An file', 'A file')
    : `${noun[0]!.toUpperCase()}${noun.slice(1)}s this deck needs could not be found`;
}

export function LogPanel(): React.ReactElement {
  const result = useStore((s) => s.engine.result);
  const selectSlide = useStore((s) => s.selectSlide);
  const parse = useStore((s) => s.source.lastParse);

  // A missing .sty is the single most common failure and the log buries it, so lift it
  // to the top rather than making the user read TeX output.
  const missing = result === null ? [] : findMissingFiles(result.log);

  return (
    <div className="bp-log">
      {parse !== null && parse.guard.demoted > 0 && (
        <div className="bp-log-note">
          The last source edit produced {parse.guard.demoted} block
          {parse.guard.demoted === 1 ? '' : 's'} BeamerPoint could not model. They are
          preserved exactly as written and shown on the canvas as raw LaTeX.
        </div>
      )}

      {missing.length > 0 && (
        <div className="bp-log-missing">
          <strong>{missingHeading(missing)}</strong>
          <ul>
            {missing.map((m) => (
              <li key={m.file}>
                <code>{m.pkg}</code>
                {m.kind === 'graphic'
                  ? ' — an image file the document references but that is not stored here.'
                  : ' — not part of the bundled TeX Live collections.'}
              </li>
            ))}
          </ul>
          <p className="bp-muted">
            {missing.some((m) => m.kind !== 'graphic')
              ? 'Pick a different theme or drop the package, or compile this deck with a '
                + 'local TeX installation that has it.'
              : 'Add the file to the deck, then compile again.'}
          </p>
        </div>
      )}

      {result === null && <p className="bp-muted">No compilation yet.</p>}

      {result !== null && result.diagnostics.length === 0 && (
        <p className="bp-ok">No errors or warnings.</p>
      )}

      <ul className="bp-diags">
        {(result?.diagnostics ?? []).map((d, i) => (
          <li
            key={i}
            className={`bp-diag sev-${d.severity}`}
            onClick={() => d.frameId !== undefined && selectSlide(d.frameId)}
          >
            <span className="bp-diag-sev">{d.severity}</span>
            <span className="bp-diag-msg">{d.message}</span>
            {d.line !== undefined && <span className="bp-diag-line">line {d.line}</span>}
          </li>
        ))}
      </ul>

      {result !== null && (
        <details className="bp-rawlog">
          <summary>Full TeX log</summary>
          <pre>{result.log}</pre>
        </details>
      )}
    </div>
  );
}
