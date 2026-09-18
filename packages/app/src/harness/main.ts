/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

/**
 * The engine-conformance harness: a dev-only page Playwright drives.
 *
 * Not the app. `window.bpEngine` is created lazily and only after Install or Compile is
 * clicked, and the app's React tree, autosave and IndexedDB would be pure noise across
 * a couple of hundred compiles -- and would contaminate the UI pass, which is the stage
 * that is actually about the UI. This page runs the real `BusytexEngine`, the real
 * `buildProject`, and pdf.js, and nothing else.
 */
import * as pdfjs from 'pdfjs-dist';
import { dataBase, engineBase } from '../engine/assetPaths.js';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
import { MEASURED, type Deck, type PreambleChunk } from '@beamerpoint/core';
import {
  BusytexEngine, buildProject, findMissingFiles, jobForProject, type CompileResult,
  type ResourceResolver,
} from '@beamerpoint/engine';
import {
  BIB_RESOURCE_ID, CASES, COLOUR_FIELDS, IMAGE_RESOURCE_ID, type Case, type Expect,
} from './matrix.js';

pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

export interface Observation {
  id: string;
  area: Case['area'];
  expect: Expect;
  ok: boolean;
  /** The probe's own marker was in the log: the engine compiled THIS file. */
  marker: boolean;
  pdfBytes: number;
  pages: number;
  durationMs: number;
  errors: string[];
  missing: string[];
  text: string;
  /** Present only for `raw` cases: which byte patterns matched. */
  bytes?: Record<string, boolean>;
  log: Record<string, boolean>;
  /** For colour cases: every field whose colour differs from `MEASURED`, as `field.side`. */
  colourDiff?: string[];
  /** The whole log, returned only when the case failed, so the failure has evidence. */
  fullLog?: string;
  harnessError?: string;
}

const BIB = [
  '@book{knuth1984,',
  '  author = {Donald E. Knuth},',
  '  title = {Literate Programming},',
  '  publisher = {CSLI},',
  '  year = {1984}',
  '}',
  '',
].join('\n');

async function probePng(): Promise<Uint8Array> {
  // Drawn rather than embedded, so it is a real PNG the browser encoded itself.
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1f6feb'; ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(8, 8, 16, 16);
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

let engine: BusytexEngine | null = null;
let resolver: ResourceResolver | null = null;

async function init(): Promise<void> {
  if (engine !== null) return;
  const png = await probePng();
  const bib = new TextEncoder().encode(BIB);
  resolver = {
    getBytes: async (resourceId) => (resourceId === IMAGE_RESOURCE_ID ? png
      : resourceId === BIB_RESOURCE_ID ? bib : undefined),
  };
  const e = new BusytexEngine({
    basePath: engineBase(), dataPath: dataBase(), collections: ['basic', 'recommended', 'extra'],
  });
  await e.init();
  engine = e;
}

const marker = (id: string): string => `BPPROBE:${id}`;

/** Add the silent-pass guard and, when asked, turn PDF compression off. */
function instrument(deck: Deck, c: Case): Deck {
  const chunks: PreambleChunk[] = [
    { id: 'bp-probe', slot: 'before-document', tex: `\\typeout{${marker(c.id)}}`, order: 10_000 },
  ];
  if (c.raw === true) {
    chunks.push({
      id: 'bp-raw', slot: 'after-documentclass',
      tex: '\\pdfcompresslevel=0 \\pdfobjcompresslevel=0', order: -10_000,
    });
  }
  return { ...deck, preamble: { ...deck.preamble, custom: [...deck.preamble.custom, ...chunks] } };
}

function instrumentTex(tex: string, c: Case): string {
  const head = c.raw === true ? '\\pdfcompresslevel=0 \\pdfobjcompresslevel=0\n' : '';
  return head + tex.replace('\\begin{document}', `\\typeout{${marker(c.id)}}\n\\begin{document}`);
}

/**
 * `\extractcolorspec` answers in whichever model the theme author used. Converted exactly
 * as `tools/theme-colours.md` does, and an unknown model throws rather than becoming black.
 */
function toHex(model: string, spec: string): string {
  const n = spec.split(',').map(Number);
  let rgb: number[];
  if (model === 'rgb') rgb = n;
  else if (model === 'gray') rgb = [n[0]!, n[0]!, n[0]!];
  else if (model === 'cmyk') rgb = [0, 1, 2].map((i) => (1 - n[i]!) * (1 - n[3]!));
  else if (model === 'RGB') rgb = n.map((v) => v / 255);
  else throw new Error(`unknown colour model: ${model}`);
  return `#${rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function colourDiff(theme: string, log: string): string[] {
  const got: Record<string, { fg?: string; bg?: string }> = {};
  for (const line of log.split('\n')) {
    if (!line.startsWith('BPC|')) continue;
    const [, field, side, rest] = line.split('|');
    const m = /^\{([^}]*)\}\{([^}]*)\}/.exec(rest ?? '');
    if (m !== null && (side === 'fg' || side === 'bg')) (got[field!] ??= {})[side] = toHex(m[1]!, m[2]!);
  }
  const want = MEASURED[theme];
  const diffs: string[] = [];
  // Without these two, an empty probe compared against a missing row would pass
  // vacuously -- a check that cannot fail.
  if (want === undefined) diffs.push(`no MEASURED row for ${theme}`);
  if (Object.keys(got).length < 20) diffs.push(`only ${Object.keys(got).length} colours in the log`);
  for (const [field] of COLOUR_FIELDS) {
    for (const side of ['fg', 'bg'] as const) {
      const w = ((want ?? {}) as Record<string, { fg?: string; bg?: string }>)[field]?.[side];
      const g = got[field]?.[side];
      if (w !== g) diffs.push(`${field}.${side}: measured ${w ?? '-'}, beamer says ${g ?? '-'}`);
    }
  }
  return diffs;
}

async function pdfFacts(pdf: Uint8Array): Promise<{ pages: number; text: string }> {
  const task = pdfjs.getDocument({ data: pdf.slice() });
  const doc = await task.promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    parts.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  const pages = doc.numPages;
  await task.destroy();
  return { pages, text: parts.join('\n') };
}

async function run(id: string): Promise<Observation> {
  const c = CASES.find((x) => x.id === id);
  if (c === undefined) throw new Error(`no case ${id}`);
  await init();
  const started = performance.now();
  const base: Omit<Observation, 'ok' | 'marker' | 'pdfBytes' | 'pages' | 'durationMs' | 'errors' | 'missing' | 'text' | 'log'> = {
    id, area: c.area, expect: c.expect,
  };

  try {
    const built = c.build();
    let result: CompileResult;
    if ('tex' in built) {
      const program = c.program ?? 'pdflatex';
      result = await engine!.compile({
        jobId: id, mainFile: 'main.tex',
        files: [{ path: 'main.tex', content: instrumentTex(built.tex, c) }],
        program, passes: 1, runBibtex: false,
        timeoutMs: program === 'pdflatex' ? 60_000 : 240_000,
      });
    } else {
      // Always through the real builder: TypeScript then enforces `VirtualFile.content`,
      // and a job built by hand with `text` compiles a MISSING main file and exits clean.
      const deck = instrument(built, c);
      const project = await buildProject(deck, resolver!, {
        target: 'preview', capabilities: engine!.capabilities,
      });
      const program = deck.preamble.texProgram ?? 'pdflatex';
      result = await engine!.compile(jobForProject(project, deck, {
        program, timeoutMs: program === 'pdflatex' ? 90_000 : 240_000,
      }));
    }

    const log = result.log ?? '';
    const pdf = result.pdf;
    // `!= null`, not `!== undefined`: a failed compile returns `pdf: null` (F-008).
    const facts = pdf != null && pdf.length > 0
      ? await pdfFacts(pdf) : { pages: 0, text: '' };
    const obs: Observation = {
      ...base,
      ok: result.ok,
      marker: log.includes(marker(id)),
      pdfBytes: pdf?.length ?? 0,
      pages: facts.pages,
      durationMs: Math.round(performance.now() - started),
      errors: log.split('\n').filter((l) => l.startsWith('!')).slice(0, 4),
      missing: findMissingFiles(log).map((m) => m.file),
      text: facts.text.slice(0, 4000),
      log: Object.fromEntries((c.expect.log ?? []).map((re) => [re, new RegExp(re).test(log)])),
    };
    if (c.expect.colours !== undefined) obs.colourDiff = colourDiff(c.expect.colours, log);
    if (c.raw === true && pdf != null) {
      const s = new TextDecoder('latin1').decode(pdf);
      obs.bytes = Object.fromEntries((c.expect.bytes ?? []).map((re) => [re, new RegExp(re).test(s)]));
    }
    if (!result.ok || !obs.marker) obs.fullLog = log;
    return obs;
  } catch (err) {
    return {
      ...base, ok: false, marker: false, pdfBytes: 0, pages: 0,
      durationMs: Math.round(performance.now() - started), errors: [], missing: [], text: '', log: {},
      harnessError: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err),
    };
  }
}

declare global {
  interface Window {
    bpHarness: {
      init: typeof init;
      cases: () => Array<{ id: string; area: Case['area'] }>;
      run: typeof run;
    };
  }
}

window.bpHarness = {
  init,
  cases: () => CASES.map((c) => ({ id: c.id, area: c.area })),
  run,
};
document.body.dataset.ready = 'true';
