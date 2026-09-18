/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

/**
 * Where the TeX engine's files are served from. The one place that knows.
 *
 * Every caller used to spell `'/core/busytex'`, an absolute path that is right only when
 * the app sits at the root of its origin. On GitHub Pages it sits under `/<repo>/`, where
 * every one of them 404s; so the engine path follows Vite's `base`.
 *
 * The two paths are separate because they have different constraints. The ENGINE -- the
 * worker, `busytex.js` and `busytex.wasm` -- must be same-origin, because a Worker cannot
 * be constructed from another origin. The DATA -- `texlive-*.js`, their `.data` and the
 * manifests, about 540 MB -- may live anywhere that sends CORS headers, which is how the
 * desktop app serves its engine from `app://` and its data from the web site, and how the
 * web app could move its data off GitHub Pages without a code change.
 */

/** The engine: same-origin, always. */
export function engineBase(): string {
  return `${import.meta.env.BASE_URL}core/busytex`;
}

/** The TeX Live data packages: `VITE_TEX_DATA_URL` when set, else beside the engine. */
export function dataBase(): string {
  const configured = import.meta.env.VITE_TEX_DATA_URL as string | undefined;
  return configured !== undefined && configured !== ''
    ? configured.replace(/\/+$/, '')
    : engineBase();
}
