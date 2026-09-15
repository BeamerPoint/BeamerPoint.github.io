import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
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
