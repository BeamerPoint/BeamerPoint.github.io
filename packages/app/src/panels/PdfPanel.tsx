import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
import { useStore } from '../state/store.js';
import { useEngine } from '../engine/useEngine.js';
import { exportPdf } from '../io/exportProject.js';

// Hand pdf.js a worker Vite has bundled, rather than a URL it has to fetch itself.
// With a plain `workerSrc` URL the worker silently fails to start and
// `getDocument().promise` never settles — no error, just a hang.
pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

/**
 * Resolve once the document is visible.
 *
 * pdf.js drives canvas rendering with requestAnimationFrame, which browsers do not
 * fire for a hidden document. Starting a render while hidden produces a promise that
 * never settles and no error, so gate on visibility rather than debugging a hang.
 */
function whenVisible(): Promise<void> {
  if (!document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const onChange = (): void => {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', onChange);
      resolve();
    };
    document.addEventListener('visibilitychange', onChange);
  });
}

/**
 * The true preview: the actual compiled PDF, rendered page by page.
 *
 * The HTML canvas is an approximation by design; this panel is where the user finds
 * out exactly what Beamer will produce.
 */
export function PdfPanel(): React.ReactElement {
  const result = useStore((s) => s.engine.result);
  const engineStatus = useStore((s) => s.engine.status);
  const compiling = useStore((s) => s.engine.compiling);
  const { install, compile, installProgress } = useEngine();

  const [pages, setPages] = useState<string[]>([]);
  const [renderError, setRenderError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    // `== null`, not `=== undefined`: a failed compile once arrived as `pdf: null`, and
    // this guard let it through to `pdf.slice()` -- a raw TypeError over the previous
    // compile's pages (F-008). The engine now normalises it; this is the second fence.
    const pdf = result?.pdf;
    if (pdf == null || pdf.length === 0) {
      ++tokenRef.current;
      setPages([]);
      setRenderError(null);
      return;
    }

    const token = ++tokenRef.current;
    setRenderError(null);

    void (async () => {
      try {
        // pdf.js schedules its canvas work with requestAnimationFrame, which never
        // fires while the document is hidden — the render promise would simply hang.
        // Wait for the page to become visible instead of starting work that stalls.
        await whenVisible();
        if (tokenRef.current !== token) return;

        // pdf.js transfers the buffer, so hand it a copy the store still owns.
        const doc = await pdfjs.getDocument({ data: pdf.slice() }).promise;
        const urls: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx === null) continue;
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          urls.push(canvas.toDataURL('image/png'));
          if (tokenRef.current !== token) return;
        }
        if (tokenRef.current === token) setPages(urls);
      } catch (err) {
        if (tokenRef.current === token) {
          setRenderError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
  }, [result]);

  if (engineStatus.s === 'uninitialised') {
    return (
      <div className="bp-pdf bp-pdf-cta">
        <h3>Compile with real LaTeX</h3>
        <p>
          BeamerPoint can run a full TeX Live 2026 installation in your browser, so you
          get the exact PDF Beamer produces — no LaTeX installation needed.
        </p>
        <p className="bp-muted">
          The first run downloads roughly 540&nbsp;MB — the basic, recommended and extra
          TeX Live collections, all three of which a Beamer deck can reach into. It is
          cached afterwards, and everything else in BeamerPoint works without it.
        </p>
        <button className="bp-primary" onClick={() => void install()}>
          Download the LaTeX engine
        </button>
      </div>
    );
  }

  if (engineStatus.s === 'installing') {
    return (
      <div className="bp-pdf bp-pdf-cta">
        <h3>{engineStatus.phase}</h3>
        <p className="bp-muted">{installProgress}</p>
        <p className="bp-muted">This happens once. You can keep editing meanwhile.</p>
      </div>
    );
  }

  if (engineStatus.s === 'failed') {
    return (
      <div className="bp-pdf bp-pdf-cta">
        <h3>The engine failed to load</h3>
        <pre className="bp-error">{engineStatus.error}</pre>
        <button onClick={() => void install()}>Try again</button>
      </div>
    );
  }

  return (
    <div className="bp-pdf">
      <div className="bp-pdf-bar">
        <button className="bp-primary" disabled={compiling} onClick={() => void compile()}>
          {compiling ? 'Compiling…' : 'Compile'}
        </button>
        {result?.ok === true && result.pdf !== undefined && (
          <button
            title="Save the compiled PDF to disk"
            onClick={() => exportPdf(useStore.getState().deck, result.pdf!)}
          >
            Save PDF
          </button>
        )}
        {result !== null && (
          <span className={result.ok ? 'bp-ok' : 'bp-error-text'}>
            {result.ok
              ? `${pages.length} page${pages.length === 1 ? '' : 's'} · ${result.durationMs}ms`
              : 'Compilation failed — see the Log tab'}
          </span>
        )}
      </div>
      <div className="bp-pdf-pages">
        {renderError !== null && <pre className="bp-error">{renderError}</pre>}
        {pages.length === 0 && result === null && (
          <p className="bp-muted">Press Compile to render the deck.</p>
        )}
        {pages.map((src, i) => (
          <img key={i} src={src} alt={`Slide ${i + 1}`} className="bp-pdf-page" />
        ))}
      </div>
    </div>
  );
}
