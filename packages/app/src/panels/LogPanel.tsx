import { findMissingFiles } from '@beamerpoint/engine';
import { useStore } from '../state/store.js';
import { MissingPackages } from './MissingPackages.js';

/** Compile diagnostics, mapped back to slides and elements via the source map. */

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

      {missing.length > 0 && <MissingPackages missing={missing} />}

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
