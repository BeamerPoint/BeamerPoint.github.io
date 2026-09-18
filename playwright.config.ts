import { defineConfig } from '@playwright/test';

/**
 * The engine-conformance runner: `npm run test:engine`.
 *
 * Deliberately NOT part of `npm test`. It needs the 686 MB TeX Live payload
 * (`npm run engine:install`), which is gitignored, and a real browser, since the engine
 * runs in a Web Worker that node cannot host. A fresh clone's `npm test` stays green.
 */
export default defineConfig({
  // Mandatory: Playwright's default pattern would also collect every vitest spec.
  testDir: 'tools/engine-conformance',
  testMatch: '**/*.spec.ts',
  // One engine per file. Parallel workers would each preload the whole payload.
  fullyParallel: false,
  workers: 1,
  // A retry would hide exactly the flakiness this exists to expose.
  retries: 0,
  timeout: 20 * 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5174', headless: true },
  // Its own server, on its own port, with HMR off -- never the dev server someone is
  // working against. Sharing one meant an edit elsewhere reloaded the harness mid-run.
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    cwd: 'packages/app',
    env: { BP_HARNESS: '1' },
    url: 'http://localhost:5174/harness.html',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
