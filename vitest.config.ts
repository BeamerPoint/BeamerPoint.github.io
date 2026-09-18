import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.spec.ts', 'packages/*/test/**/*.spec.tsx'],
    environment: 'node',
    // Run with `npm run test:coverage`; `npm test` stays fast and does not collect it.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['packages/*/src/**/*.{ts,tsx}'],
      // Report untested files as 0% instead of leaving them out, which is the whole point:
      // a module nothing imports is the blind spot, and it would otherwise be invisible.
      all: true,
      exclude: [
        '**/*.d.ts',
        'packages/app/src/main.tsx',
        'packages/app/src/ui/icons.tsx',
        // Generated from engine sweeps; its correctness is the sweep's job, not a line count.
        'packages/core/src/themes/measured.ts',
        // Browser-only by construction (Worker + importScripts). Counting it would make the
        // number dishonest in the other direction; it is covered by `npm run test:engine`.
        'packages/engine/src/backends/busytex/**',
      ],
    },
  },
});
