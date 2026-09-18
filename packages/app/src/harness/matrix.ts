/**
 * The engine-conformance matrix: everything the app can make, compiled by the real engine.
 *
 * Each case is BUILT from core's own factories and operations -- the same code the UI
 * calls -- so what compiles here is what a user's deck would compile to. Hand-written
 * LaTeX appears only where the question is about LaTeX itself (the `transparent` pin).
 *
 * Expectations are data, not code, so the Playwright side can assert them after the
 * page reports what happened. Regexes travel as their source strings.
 */
import {
  DECK_FONTS, LST_DEFINITIONS, LST_LANGUAGES, POLYGON_KINDS, SMART_ART, THEME_IDS,
  addChartColumn, addShape, applyTableStyle, newChartElement, newCodeElement, newDeck,
  newFrame, newListElement, newSmartArtElement, newTableElement, newTextElement,
  newTikzElement, newTitleFrame, newTocElement, plain, polygonPoints, setShapeLabel,
  setTableFit, themeNeedsUnicodeEngine,
  type BeamerBlockElement, type ChartElement, type CodeElement, type ColumnsElement,
  type Deck, type DocNode, type Element, type FrameNode, type ImageElement,
  type ListElement, type MathElement, type TableElement, type TikzElement, type TikzShape,
} from '@beamerpoint/core';

export interface Expect {
  /** Whether a PDF must come out. Default true. */
  ok?: boolean;
  pages?: number;
  minPages?: number;
  /** Substrings that must appear in the PDF's text layer. */
  text?: string[];
  /** Substrings that must NOT appear in the text layer (e.g. `?` for an unresolved cite). */
  notText?: string[];
  /** Regex sources matched against the PDF's own bytes. Requires `raw: true`. */
  bytes?: string[];
  /** Regex sources matched against the TeX log. */
  log?: string[];
  /**
   * A defect already in the audit ledger. The case is asserted to FAIL the way the ledger
   * says, so it cannot quietly start passing unnoticed -- when it is fixed, the runner
   * insists the marker is removed, exactly like vitest's `it.fails`.
   */
  knownDefect?: string;
}

export interface Case {
  id: string;
  area: 'element' | 'theme' | 'font' | 'language' | 'output' | 'program' | 'pin';
  /** Compile with PDF compression off, so the PDF's own bytes are readable. */
  raw?: boolean;
  /** Needs a real image in the resource store. */
  image?: boolean;
  /** Needs a `.bib` in the resource store. */
  bib?: boolean;
  build: () => Deck | { tex: string };
  expect: Expect;
}

const P = { mode: 'flow' as const };
let n = 0;
const id = (p: string): string => `${p}${(n += 1)}`;

function deck(children: Element[], patch: (d: Deck) => Deck = (d) => d): Deck {
  const base = newDeck({ title: 'Conformance', author: 'Probe' });
  return patch({ ...base, nodes: [newFrame('Probe', children)] });
}

const text = (s: string): Element => newTextElement(s);

const block = (variant: BeamerBlockElement['variant'], rotate?: number): BeamerBlockElement => ({
  id: id('b'), kind: 'block', variant,
  placement: rotate === undefined
    ? P
    : { mode: 'absolute', x: 20, y: 30, w: 80, rotate, driver: 'textpos' },
  title: plain('Heading'), children: [text('Block body')],
});

const cols = (count: number): ColumnsElement => ({
  id: id('c'), kind: 'columns', placement: P,
  columns: Array.from({ length: count }, (_, i) => ({
    id: id('col'), width: { v: 0.9 / count, u: 'textwidth' as const },
    valign: (['t', 'c', 'b'] as const)[i % 3],
    children: [text(`Column ${i + 1}`)],
  })),
});

export const IMAGE_RESOURCE_ID = 'probe-image';
export const BIB_RESOURCE_ID = 'probe-bib';

const image = (patch: Partial<ImageElement> = {}): ImageElement => ({
  id: id('i'), kind: 'image', placement: P, resourceId: IMAGE_RESOURCE_ID,
  width: { v: 0.4, u: 'textwidth' }, keepAspect: true, ...patch,
});

function withImage(d: Deck): Deck {
  return {
    ...d,
    resources: [...d.resources, {
      id: IMAGE_RESOURCE_ID, path: 'images/probe.png', kind: 'image', mime: 'image/png',
      bytes: 0, sha256: 'probe', originalName: 'probe.png', intrinsic: { w: 64, h: 32 },
    }],
  };
}

function withBib(d: Deck): Deck {
  return {
    ...d,
    preamble: { ...d.preamble, bibliography: { style: 'plain', backend: 'bibtex' } },
    resources: [...d.resources, {
      id: BIB_RESOURCE_ID, path: 'refs.bib', kind: 'bib', mime: 'text/plain',
      bytes: 0, sha256: 'probe', originalName: 'refs.bib',
    }],
  };
}

const math = (env: MathElement['env']): MathElement => ({
  id: id('m'), kind: 'math', placement: P, env,
  tex: env.startsWith('align') ? '  a &= b \\\\\n  c &= d' : '  E = mc^2',
});

const code = (patch: Partial<CodeElement>): CodeElement => ({
  ...newCodeElement('Python', 'def greet(name):\n    print(name)'), ...patch,
});

function tikz(shapes: TikzShape[], w = 120, h = 60): TikzElement {
  return shapes.reduce(addShape, newTikzElement(w, h));
}

const rect = (patch: Partial<Extract<TikzShape, { t: 'rect' }>> = {}): TikzShape => ({
  id: id('r'), t: 'rect', x: 10, y: 10, w: 30, h: 15, style: {}, ...patch,
});

function table(patch: (t: TableElement) => TableElement = (t) => t): TableElement {
  const t = newTableElement(3, 3);
  const filled: TableElement = {
    ...t,
    rows: t.rows.map((r, i) => ({
      ...r, cells: r.cells.map((c, j) => ({ ...c, content: plain(`r${i}c${j}`) })),
    })),
  };
  return patch(filled);
}

function chart(patch: Partial<ChartElement> = {}): ChartElement {
  return { ...newChartElement(), ...patch };
}

const listOf = (type: ListElement['listType'], items: string[]): ListElement => ({
  ...newListElement(items), listType: type,
});

function framesWith(...nodes: DocNode[]): (d: Deck) => Deck {
  return (d) => ({ ...d, nodes });
}

/* ================================================================= elements */

const ELEMENTS: Case[] = [
  { id: 'text-plain', area: 'element', build: () => deck([text('PROBETEXT with 100% & _ # specials')]),
    expect: { pages: 1, text: ['PROBETEXT'] } },
  { id: 'text-styled', area: 'element', build: () => deck([{
      ...newTextElement(''), content: [
        { t: 'style', style: 'bf', children: plain('Bold ') },
        { t: 'style', style: 'it', children: plain('Italic ') },
        { t: 'style', style: 'ul', children: plain('Under ') },
        { t: 'style', style: 'tt', children: plain('Mono ') },
        { t: 'style', style: 'sc', children: plain('Caps ') },
        { t: 'style', style: 'alert', children: plain('Alert ') },
        { t: 'style', style: 'color', color: { k: 'rgb', r: 0.8, g: 0.2, b: 0.1 }, children: plain('Red ') },
        { t: 'style', style: 'size', size: 'Large', children: plain('BIGWORD') },
        { t: 'math', tex: 'x^2' },
      ] }]),
    expect: { pages: 1, text: ['Bold', 'BIGWORD'] } },
  { id: 'text-link', area: 'element', raw: true, build: () => deck([{
      ...newTextElement(''), content: [
        { t: 'text', s: 'Go to ' },
        { t: 'link', url: 'https://example.com/probe', children: plain('the site') },
      ] }]),
    expect: { pages: 1, bytes: ['/URI\\s*\\(https://example\\.com/probe\\)'] } },
  { id: 'text-rotated', area: 'element', build: () => deck([{
      ...text('ROTATED'), placement: { mode: 'absolute', x: 30, y: 30, w: 60, rotate: 20, driver: 'textpos' },
    }]),
    expect: { pages: 1, text: ['ROTATED'] } },

  { id: 'list-itemize', area: 'element', build: () => deck([listOf('itemize', ['alpha', 'beta'])]), expect: { pages: 1, text: ['alpha'] } },
  { id: 'list-enumerate', area: 'element', build: () => deck([listOf('enumerate', ['alpha', 'beta'])]), expect: { pages: 1, text: ['alpha'] } },
  { id: 'list-description', area: 'element', build: () => {
      const l = listOf('description', ['meaning']);
      return deck([{ ...l, items: [{ ...l.items[0]!, label: plain('TERM') }] }]);
    }, expect: { pages: 1, text: ['TERM', 'meaning'] } },
  { id: 'list-nested', area: 'element', build: () => {
      const l = newListElement(['outer']);
      return deck([{ ...l, items: [{ ...l.items[0]!, sublist: newListElement(['INNER']) }] }]);
    }, expect: { pages: 1, text: ['INNER'] } },
  { id: 'list-stepped', area: 'element', build: () => {
      const l = newListElement(['one', 'two', 'three']);
      return deck([{ ...l, items: l.items.map((it, i) => ({ ...it, overlay: `<${i + 1}->` })) }]);
    }, expect: { pages: 3 } },

  ...(['block', 'alertblock', 'exampleblock'] as const).map((v): Case => ({
    id: `block-${v}`, area: 'element', build: () => deck([block(v)]), expect: { pages: 1, text: ['Heading'] },
  })),
  { id: 'block-rotated', area: 'element', build: () => deck([block('block', 15)]), expect: { pages: 1, text: ['Heading'] } },

  { id: 'columns-2', area: 'element', build: () => deck([cols(2)]), expect: { pages: 1, text: ['Column 2'] } },
  { id: 'columns-3', area: 'element', build: () => deck([cols(3)]), expect: { pages: 1, text: ['Column 3'] } },

  { id: 'image-flow', area: 'element', image: true, build: () => withImage(deck([image()])), expect: { pages: 1 } },
  { id: 'image-absolute', area: 'element', image: true,
    build: () => withImage(deck([image({ placement: { mode: 'absolute', x: 20, y: 20, w: 50, driver: 'textpos' } })])),
    expect: { pages: 1 } },
  { id: 'image-cropped', area: 'element', image: true,
    build: () => withImage(deck([image({ trim: { left: 4, bottom: 2, right: 4, top: 2 } })])), expect: { pages: 1 } },
  { id: 'image-caption', area: 'element', image: true,
    build: () => withImage(deck([image({ caption: plain('PROBECAPTION') })])), expect: { pages: 1, text: ['PROBECAPTION'] } },
  { id: 'image-rotated', area: 'element', image: true, build: () => withImage(deck([image({ rotate: 30 })])), expect: { pages: 1 } },
  { id: 'image-opacity', area: 'element', image: true, raw: true,
    build: () => withImage(deck([image({ opacity: 0.4 })])),
    // The `transparent` package writes `ca 1` here; a tikz node writes the real alpha.
    expect: { pages: 1, bytes: ['/ca\\s+0?\\.4\\b'] } },

  { id: 'table-booktabs', area: 'element', build: () => deck([table()]), expect: { pages: 1, text: ['r1c1'] } },
  { id: 'table-hline', area: 'element', build: () => deck([table((t) => applyTableStyle(t, 'hline'))]), expect: { pages: 1 } },
  { id: 'table-tabularx', area: 'element', build: () => deck([table((t) => setTableFit(t, 'tabularx'))]), expect: { pages: 1 } },
  { id: 'table-resizebox', area: 'element', build: () => deck([table((t) => setTableFit(t, 'resizebox'))]), expect: { pages: 1 } },
  { id: 'table-multicolumn', area: 'element', build: () => deck([table((t) => ({
      ...t,
      merges: [{ row: 0, col: 0, colspan: 2 }],
      rows: t.rows.map((r, i) => (i === 0
        ? { ...r, cells: r.cells.map((c, j) => (j === 1 ? { ...c, content: [] } : c)) }
        : r)),
    }))]), expect: { pages: 1 } },
  { id: 'table-shaded', area: 'element', build: () => deck([table((t) => ({
      ...t, rows: t.rows.map((r, i) => (i === 1 ? { ...r, fill: { k: 'mix' as const, expr: 'gray!20' } } : r)),
    }))]), expect: { pages: 1 } },
  { id: 'table-caption', area: 'element', build: () => deck([table((t) => ({
      ...t, floatWrapper: 'table', caption: plain('PROBETABLE'),
    }))]), expect: { pages: 1, text: ['PROBETABLE'] } },

  ...(['equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'displaymath'] as const).map((env): Case => ({
    id: `math-${env}`, area: 'element', build: () => deck([math(env)]), expect: { pages: 1 },
  })),

  { id: 'code-listings', area: 'element',
    build: () => deck([code({ options: { numbers: 'left', frame: 'single' }, caption: plain('PROBELISTING') })]),
    expect: { pages: 1, text: ['greet'] } },
  { id: 'code-verbatim', area: 'element', build: () => deck([code({ backend: 'verbatim' })]), expect: { pages: 1, text: ['greet'] } },
  { id: 'code-minted', area: 'element', build: () => deck([code({ backend: 'minted' })]),
    expect: { pages: 1, text: ['greet'], knownDefect: 'F-001' } },

  { id: 'tikz-basic', area: 'element', build: () => deck([tikz([
      rect(), rect({ x: 50, rx: 3 }),
      { id: id('e'), t: 'ellipse', cx: 95, cy: 20, rx: 12, ry: 8, style: { fill: { k: 'mix', expr: 'blue!20' } } },
      { id: id('l'), t: 'path', points: [[10, 45], [110, 45]], closed: false, smooth: false, style: { dash: 'dashed' } },
    ])]), expect: { pages: 1 } },
  { id: 'tikz-polygons', area: 'element', build: () => deck([tikz(
      POLYGON_KINDS.map((k, i): TikzShape => ({
        id: id('p'), t: 'path', closed: true, smooth: false, style: {},
        points: polygonPoints(k, (i % 6) * 22 + 2, Math.floor(i / 6) * 22 + 2, 18, 18),
      })), 140, 70)]),
    expect: { pages: 1 } },
  { id: 'tikz-arrow-attached', area: 'element', build: () => {
      const a = rect({ id: 'ra' }); const b = rect({ id: 'rb', x: 70 });
      return deck([tikz([a, b, {
        id: id('a'), t: 'arrow', head: 'latex', style: {},
        from: { kind: 'shape', shapeId: 'ra', side: 'e' }, to: { kind: 'shape', shapeId: 'rb', side: 'w' },
      }])]);
    }, expect: { pages: 1 } },
  { id: 'tikz-styled', area: 'element', raw: true, build: () => deck([tikz([
      rect({ style: { rotate: 20, shadow: true, opacity: 0.5, fill: { k: 'named', name: 'red' } } }),
    ])]), expect: { pages: 1, bytes: ['/ca\\s+0?\\.5\\b'] } },
  { id: 'tikz-label', area: 'element', build: () => deck([
      setShapeLabel(tikz([rect({ id: 'lab', w: 40, h: 20 })]), 'lab', plain('PROBELABEL')),
    ]), expect: { pages: 1, text: ['PROBELABEL'] } },

  ...(['line', 'bar', 'hbar', 'scatter'] as const).map((chartType): Case => ({
    id: `chart-${chartType}`, area: 'element', build: () => deck([chart({ chartType })]), expect: { pages: 1 },
  })),
  { id: 'chart-log', area: 'element', build: () => deck([chart({ axis: { ...newChartElement().axis, ymode: 'log' } })]), expect: { pages: 1 } },
  { id: 'chart-symbolic', area: 'element', build: () => deck([chart({
      chartType: 'bar', data: { columns: ['Group', 'Count'], rows: [['alpha', 3], ['beta', 5]] },
      series: [{ id: 's', xCol: 0, yCol: 1, label: 'Count' }],
    })]), expect: { pages: 1 } },
  { id: 'chart-3-series', area: 'element', build: () => deck([addChartColumn(chart(), 'Profit')]), expect: { pages: 1 } },

  { id: 'toc-sections', area: 'element', build: () => deck([], framesWith(
      newFrame('Outline', [newTocElement()]),
      { kind: 'section', id: id('s'), level: 'section', title: plain('PROBESECTION'), starred: false },
      newFrame('In section', [text('x')]),
    )), expect: { minPages: 2, text: ['PROBESECTION'] } },

  { id: 'pause', area: 'element', build: () => deck([text('One'), { id: id('pz'), kind: 'pause', placement: P }, text('Two')]),
    expect: { pages: 2 } },

  { id: 'bibliography-cite', area: 'element', bib: true, build: () => withBib(deck([], framesWith(
      newFrame('Body', [{ ...newTextElement(''), content: [{ t: 'text', s: 'See ' }, { t: 'cite', keys: ['knuth1984'] }] }]),
      { ...newFrame('References', [{ id: id('bib'), kind: 'bibliography', placement: P, files: ['refs'] }]),
        options: { allowframebreaks: true } } satisfies FrameNode,
    ))), expect: { minPages: 2, text: ['[1]', 'Literate Programming'], notText: ['[?]'] } },
  { id: 'bibliography-citep', area: 'element', bib: true, build: () => withBib(deck([], framesWith(
      newFrame('Body', [{ ...newTextElement(''), content: [{ t: 'cite', keys: ['knuth1984'], style: 'p' }] }]),
      newFrame('References', [{ id: id('bib'), kind: 'bibliography', placement: P, files: ['refs'] }]),
    ))), expect: { minPages: 2, text: ['Literate Programming'] } },

  { id: 'raw', area: 'element', build: () => deck([{ id: id('raw'), kind: 'raw', placement: P, tex: '\\emph{PROBERAW}', reason: 'unrecognised' }]),
    expect: { pages: 1, text: ['PROBERAW'] } },
  { id: 'title-page', area: 'element', build: () => deck([], framesWith(newTitleFrame())), expect: { pages: 1, text: ['Conformance'] } },

  ...SMART_ART.map((s): Case => ({
    id: `smartart-${s.kind}`, area: 'element', build: () => deck([newSmartArtElement(s.kind, [])]), expect: { pages: 1 },
  })),
];

/* =================================================================== themes */

const THEMES_CASES: Case[] = THEME_IDS.map((name): Case => ({
  id: `theme-${name}`, area: 'theme',
  build: () => deck([text('Theme body'), newListElement(['item'])], (d) => ({
    ...d,
    preamble: {
      ...d.preamble, theme: { name, options: [] },
      ...(themeNeedsUnicodeEngine(name) ? { texProgram: 'xelatex' as const } : {}),
    },
  })),
  expect: { pages: 1 },
}));

/* ==================================================================== fonts */

const FONT_CASES: Case[] = DECK_FONTS.map((f): Case => ({
  id: `font-${f.pkg ?? 'default'}`, area: 'font',
  build: () => deck([text('The quick brown fox.')], (d) => ({
    ...d,
    preamble: {
      ...d.preamble,
      packages: f.pkg === null ? d.preamble.packages : [...d.preamble.packages, { name: f.pkg, options: [] }],
      ...(f.serif ? { fontTheme: { name: 'serif', options: [] } } : {}),
    },
    // After the preamble, where `tools/deck-fonts.md` asks -- not inside a frame.
    documentPrologue: '\\typeout{BPFONT fam=\\familydefault}',
  })),
  // The whole point: a serif family that leaves `familydefault` at cmss changed nothing.
  expect: { pages: 1, log: [`BPFONT fam=${f.family}\\b`] },
}));

/* ================================================================ languages */

const LANGUAGE_CASES: Case[] = [...new Set([...LST_LANGUAGES, ...Object.keys(LST_DEFINITIONS)])].map((lang): Case => ({
  id: `lang-${lang}`, area: 'language',
  build: () => deck([code({ language: lang, code: 'x = 1' })]),
  expect: { pages: 1 },
}));

/* =================================================================== output */

const OUTPUT_CASES: Case[] = [
  { id: 'handout-collapses-overlays', area: 'output', build: () => deck(
      [text('One'), { id: id('pz'), kind: 'pause', placement: P }, text('Two')],
      (d) => ({ ...d, preamble: { ...d.preamble, documentClass: { ...d.preamble.documentClass, handout: true } } }),
    ), expect: { pages: 1 } },
  { id: 'notes-shown', area: 'output', build: () => deck([text('Slide')], (d) => ({
      ...d,
      preamble: { ...d.preamble, custom: [...d.preamble.custom,
        { id: 'opt', slot: 'after-settings', tex: '\\setbeameroption{show notes}', order: 900 }] },
      nodes: d.nodes.map((nd) => (nd.kind === 'frame'
        ? { ...nd, notes: [{ id: 'n1', content: plain('PROBENOTE') }] } : nd)),
    })), expect: { pages: 2, text: ['PROBENOTE'] } },
  { id: 'aspect-43', area: 'output', build: () => deck([text('x')], (d) => ({
      ...d, preamble: { ...d.preamble, documentClass: { ...d.preamble.documentClass, aspectRatio: '43' } },
    })), expect: { pages: 1 } },
];

/* ================================================================= programs */

const PROGRAM_CASES: Case[] = (['xelatex', 'lualatex'] as const).map((program): Case => ({
  id: `program-${program}`, area: 'program',
  build: () => deck([text('Unicode é ü ß'), newListElement(['a'])], (d) => ({ ...d, preamble: { ...d.preamble, texProgram: program } })),
  expect: { pages: 1, text: ['Unicode'] },
}));

/* ===================================================================== pins */

/** Numbers docs/ENGINEERING.md records as measured, made executable so they cannot rot as prose. */
const PIN_CASES: Case[] = [
  { id: 'pin-transparent-package-does-nothing', area: 'pin', raw: true,
    build: () => ({ tex: [
      '\\documentclass{beamer}', '\\usepackage{transparent}', '\\begin{document}',
      '\\begin{frame}\\transparent{0.4}{Faded}\\end{frame}', '\\end{document}', '',
    ].join('\n') }),
    // Why a picture's opacity is a tikz node: this package writes an alpha of ONE.
    expect: { pages: 1, bytes: ['/ca\\s+1\\b'] } },
];

export const CASES: readonly Case[] = [
  ...ELEMENTS, ...THEMES_CASES, ...FONT_CASES, ...LANGUAGE_CASES,
  ...OUTPUT_CASES, ...PROGRAM_CASES, ...PIN_CASES,
];
