/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Where the app is served from. GitHub Pages serves a project site under `/<repo>/`,
  // and the TeX engine's path follows this (`engine/assetPaths.ts`), so the Pages build
  // sets BP_BASE. The desktop app and local development serve from the root.
  base: process.env.BP_BASE ?? '/',
  server: {
    port: 5173,
    // The engine-conformance runner starts its own server with this set. With HMR on, any
    // edit anywhere in the app reloads the harness page mid-sweep and kills the run --
    // which is exactly what happened the first time it ran.
    ...(process.env.BP_HARNESS === '1' ? { hmr: false } : {}),
    watch: {
      // The TeX Live bundles are ~686MB of static assets that never change during
      // development. Watching them is pointless, and on Windows the watcher dies with
      // EBUSY on the multi-hundred-megabyte .data files.
      ignored: ['**/public/core/**'],
    },
  },
  // texlyre-busytex ships its own worker and .data bundles; keep it out of the
  // dependency pre-bundle so its relative asset paths still resolve.
  optimizeDeps: { exclude: ['texlyre-busytex'] },
});
