import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Everything the app can make, compiled by the real engine and checked in the PDF.
 *
 * The cases are defined in `packages/app/src/harness/matrix.ts` and built in the page from
 * core's own factories. This file asks for them by area and judges what comes back.
 * Results are written to `results/` -- a JSON and a Markdown table, plus the full log of
 * every FAILING case, so a regression has its evidence in the repo.
 */

const ASSETS = 'packages/app/public/core/busytex/texlive-basic.js';
const RESULTS = join('tools', 'engine-conformance', 'results');
const AREAS = ['element', 'theme', 'font', 'language', 'output', 'program', 'pin', 'colour'] as const;

interface Expect {
  ok?: boolean; pages?: number; minPages?: number; text?: string[]; notText?: string[];
  bytes?: string[]; log?: string[]; knownDefect?: string;
}
interface Observation {
  id: string; area: string; expect: Expect; ok: boolean; marker: boolean; pdfBytes: number;
  pages: number; durationMs: number; errors: string[]; missing: string[]; text: string;
  bytes?: Record<string, boolean>; log: Record<string, boolean>; colourDiff?: string[]; fullLog?: string;
  harnessError?: string;
}
interface Verdict { obs: Observation; status: 'pass' | 'fail' | 'known'; problems: string[] }

/** Everything wrong with one observation, judged against its own expectations. */
function judge(o: Observation): Verdict {
  const e = o.expect;
  const problems: string[] = [];
  if (o.harnessError !== undefined) problems.push(`harness: ${o.harnessError.split('\n')[0]}`);

  if (e.knownDefect !== undefined) {
    // Like vitest's `it.fails`: the defect is asserted, so a fix cannot go unnoticed.
    if (o.ok && o.marker) {
      problems.push(`${e.knownDefect} now COMPILES -- fix the ledger and drop knownDefect`);
      return { obs: o, status: 'fail', problems };
    }
    return { obs: o, status: 'known', problems: [`${e.knownDefect}: ${o.errors[0] ?? 'no PDF'}`] };
  }

  const wantOk = e.ok ?? true;
  if (o.ok !== wantOk) problems.push(`ok=${o.ok}, expected ${wantOk}${o.errors[0] ? ` -- ${o.errors[0]}` : ''}`);
  if (wantOk) {
    // The silent-pass guard: a PDF from a file other than the one we built proves nothing.
    if (!o.marker) problems.push('the probe marker is missing from the log -- not our file');
    if (o.pdfBytes === 0) problems.push('no PDF bytes');
    if (o.errors.length > 0) problems.push(`log errors: ${o.errors.join(' | ')}`);
    if (o.missing.length > 0) problems.push(`missing files: ${o.missing.join(', ')}`);
  }
  if (e.pages !== undefined && o.pages !== e.pages) problems.push(`pages=${o.pages}, expected ${e.pages}`);
  if (e.minPages !== undefined && o.pages < e.minPages) problems.push(`pages=${o.pages}, expected >= ${e.minPages}`);
  for (const t of e.text ?? []) if (!o.text.includes(t)) problems.push(`text lacks "${t}"`);
  for (const t of e.notText ?? []) if (o.text.includes(t)) problems.push(`text contains "${t}"`);
  for (const [re, hit] of Object.entries(o.bytes ?? {})) if (!hit) problems.push(`PDF bytes lack /${re}/`);
  if ((e.bytes?.length ?? 0) > 0 && o.bytes === undefined) problems.push('byte checks requested but not run');
  for (const [re, hit] of Object.entries(o.log)) if (!hit) problems.push(`log lacks /${re}/`);
  for (const d of o.colourDiff ?? []) problems.push(`colour ${d}`);

  return { obs: o, status: problems.length === 0 ? 'pass' : 'fail', problems };
}

const verdicts: Verdict[] = [];
let page: Page;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  test.skip(!existsSync(ASSETS), 'TeX Live is not installed -- run `npm run engine:install`');
  page = await browser.newPage();
  await page.goto('/harness.html');
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  // The first init preloads the whole payload; everything after reuses it.
  await page.evaluate(() => window.bpHarness.init());
});

for (const area of AREAS) {
  test(`compiles every ${area} case`, async () => {
    const ids = await page.evaluate((a) => window.bpHarness.cases()
      .filter((c) => c.area === a).map((c) => c.id), area);
    expect(ids.length, `cases in ${area}`).toBeGreaterThan(0);

    for (const id of ids) {
      const obs = await page.evaluate((i) => window.bpHarness.run(i), id) as Observation;
      const v = judge(obs);
      verdicts.push(v);
      expect.soft(v.problems, `${id} (${obs.durationMs} ms)`).toEqual(
        v.status === 'known' ? v.problems : [],
      );
    }
  });
}

test.afterAll(() => {
  // Only a FULL run writes the checked-in results: a run filtered to one area with `-g`
  // would otherwise replace the whole table with a subset of it.
  if (!AREAS.every((a) => verdicts.some((v) => v.obs.area === a))) return;
  const failures = join(RESULTS, 'failures');
  rmSync(failures, { recursive: true, force: true });
  mkdirSync(failures, { recursive: true });

  const rows = verdicts.map((v) => ({
    id: v.obs.id, area: v.obs.area, status: v.status, pages: v.obs.pages,
    durationMs: v.obs.durationMs, problems: v.problems,
  }));
  writeFileSync(join(RESULTS, 'latest.json'), `${JSON.stringify(rows, null, 2)}\n`);

  for (const v of verdicts) {
    if (v.status !== 'pass' && v.obs.fullLog !== undefined) {
      writeFileSync(join(failures, `${v.obs.id}.log`), v.obs.fullLog);
    }
  }

  const count = (s: Verdict['status']) => verdicts.filter((v) => v.status === s).length;
  const lines = [
    '# Engine conformance — latest run',
    '',
    `Generated by \`npm run test:engine\`. ${verdicts.length} cases: **${count('pass')} pass**, `
      + `**${count('fail')} fail**, **${count('known')} known defect(s)** (see \`tools/audit-2026-09.md\`).`,
    '',
    '| Area | Cases | Pass | Fail | Known |',
    '| --- | --- | --- | --- | --- |',
    ...AREAS.map((a) => {
      const vs = verdicts.filter((v) => v.obs.area === a);
      const c = (s: Verdict['status']) => vs.filter((v) => v.status === s).length;
      return `| ${a} | ${vs.length} | ${c('pass')} | ${c('fail')} | ${c('known')} |`;
    }),
    '',
    '## Not passing',
    '',
    ...(verdicts.some((v) => v.status !== 'pass')
      ? ['| Case | Status | Problems |', '| --- | --- | --- |',
        ...verdicts.filter((v) => v.status !== 'pass')
          .map((v) => `| \`${v.obs.id}\` | ${v.status} | ${v.problems.join('; ').replace(/\|/g, '\\|')} |`)]
      : ['Nothing.']),
    '',
  ];
  writeFileSync(join(RESULTS, 'latest.md'), lines.join('\n'));
});

declare global {
  interface Window {
    bpHarness: {
      init(): Promise<void>;
      cases(): Array<{ id: string; area: string }>;
      run(id: string): Promise<unknown>;
    };
  }
}
