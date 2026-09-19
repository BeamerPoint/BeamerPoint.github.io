/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { useEffect } from 'react';

/** Stamped in by `vite.config.ts` at build time. */
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_DATE__: string;

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

const SITE = 'https://beamerpoint.github.io/';
const REPO = 'https://github.com/BeamerPoint/BeamerPoint.github.io';

/** The desktop app is the same build in Electron, whose user agent says so. */
function platformLabel(): string {
  return /Electron\//.test(navigator.userAgent) ? 'Desktop app' : 'Web app';
}

interface Props {
  onClose(): void;
}

/**
 * App ▸ About: what the app is, who wrote it, which build this is, and what it stands on.
 *
 * Links open outside the app: in a browser they get a new tab, and the desktop shell turns
 * any window-open into the system browser.
 */
export function AboutDialog({ onClose }: Props): React.ReactElement {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const commit = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : '';
  const built = typeof __APP_BUILD_DATE__ === 'string' ? __APP_BUILD_DATE__ : '';

  return (
    <div className="bp-modal-backdrop" onClick={onClose}>
      <div
        className="bp-modal bp-about"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bp-about-title"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          className="bp-about-logo"
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="BeamerPoint"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <h3 id="bp-about-title" className="bp-visually-hidden">About BeamerPoint</h3>

        <p className="bp-about-tagline">
          A PowerPoint-like editor for LaTeX Beamer presentations.
        </p>
        <p>
          Build slides on a visual canvas while the LaTeX source stays a first-class,
          editable view: canvas edits appear in the source, source edits come back to the
          canvas, and LaTeX the app does not understand is kept exactly as written. PDFs
          are compiled by a complete TeX Live that runs inside the app, with nothing to
          install.
        </p>

        <dl className="bp-about-facts">
          <dt>Version</dt>
          <dd>
            {APP_VERSION}
            {commit !== '' && <span className="bp-about-muted"> ({commit})</span>}
          </dd>
          {built !== '' && (<><dt>Built</dt><dd>{built}</dd></>)}
          <dt>Edition</dt>
          <dd>{platformLabel()}</dd>
          <dt>TeX engine</dt>
          <dd>TeX Live 2026, compiled to WebAssembly</dd>
          <dt>License</dt>
          <dd>GNU General Public License v3.0</dd>
        </dl>

        <div className="bp-about-author">
          <div className="bp-about-label">Author</div>
          <div className="bp-about-name">Abolfazl Mohebbi, PhD</div>
          <div>Professor in Mechanical and Biomedical Engineering</div>
          <div>Polytechnique Montréal</div>
          <a href="mailto:abolfazl.mohebbi@polymtl.ca">abolfazl.mohebbi@polymtl.ca</a>
        </div>

        <p className="bp-about-links">
          <a href={SITE} target="_blank" rel="noreferrer">Website</a>
          <a href={REPO} target="_blank" rel="noreferrer">Source code</a>
          <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">Report an issue</a>
          <a href={`${REPO}/releases`} target="_blank" rel="noreferrer">Desktop downloads</a>
        </p>

        <p className="bp-about-credits">
          Built with the busytex / texlyre-busytex WebAssembly TeX Live, pdf.js, KaTeX,
          CodeMirror and React, each under its own open-source license.
        </p>

        <div className="bp-modal-actions">
          <button className="bp-primary" onClick={onClose} autoFocus>Close</button>
        </div>
      </div>
    </div>
  );
}
