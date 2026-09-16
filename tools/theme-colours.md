# Theme colour sweep

How `packages/core/src/themes/measured.ts` is regenerated: by asking beamer what colours
it uses, rather than deriving them.

Re-run this after adding, removing or renaming a theme in `themes/catalogue.ts`. A theme
with no row in `measured.ts` silently falls back to the arithmetic derivation, which is
the thing this sweep exists to replace — `themeColours.spec.ts` fails if any name in
`THEME_NAMES` is missing, so the test suite will tell you.

## Why it is done this way

Every palette used to be mixed from one hand-written `structure` hex per theme, and **25
of the 39 themes shared the same blue**. Madrid, Warsaw, Berlin, Frankfurt, Copenhagen
and twenty others were colour-identical on the canvas while their PDFs plainly were not.
The derivation was also wrong where it was distinct: AnnArbor's frame title is Michigan
maize and it drew navy; CambridgeUS' is light grey with red text and it drew maroon;
Madrid's footline ran light-dark-light where beamer runs it dark-to-light.

Beamer does not need to be guessed at. `\usebeamercolor*{X}` makes `X.fg` and `X.bg`
current, and `\extractcolorspec` writes the colour back out as a model and a spec, which
`\typeout` puts in the log.

Two details are load-bearing:

- **The star, and the group.** Plain `\usebeamercolor{X}` *adds* to the colour already in
  force, so a beamer colour that defines only a foreground inherits whatever background
  the previous ask left behind — and the answers then depend on the order the questions
  were asked in. Unstarred and ungrouped, AnnArbor reports its author, institute, date
  and every block colour on a maize background, because `title` was asked just before
  them. `\usebeamercolor*` resets to `normal text` first; `\begingroup`/`\endgroup` keeps
  one ask from leaking into the next.
- **The `\@ifundefined` guard.** Most beamer colours define no background, and
  `\extractcolorspec` on an undefined colour aborts the run.

## Running it

Open the app with the engine installed and paste the following into the browser console.
`window.bpEngine` is exposed in dev builds.

### 1. The probe

```js
window.bpProbeFields = [
  ['normalText','normal text'],['structure','structure'],['alertedText','alerted text'],
  ['frametitle','frametitle'],['title','title'],['subtitle','subtitle'],
  ['author','author'],['institute','institute'],['date','date'],
  ['blockTitle','block title'],['blockBody','block body'],
  ['blockTitleAlerted','block title alerted'],['blockBodyAlerted','block body alerted'],
  ['blockTitleExample','block title example'],['blockBodyExample','block body example'],
  ['palettePrimary','palette primary'],['paletteSecondary','palette secondary'],
  ['paletteTertiary','palette tertiary'],['sectionInHeadFoot','section in head/foot'],
  ['authorInHeadFoot','author in head/foot'],['titleInHeadFoot','title in head/foot'],
  ['dateInHeadFoot','date in head/foot'],['backgroundCanvas','background canvas'],
  ['sidebar','sidebar'],
];

window.bpProbeTex = (theme) => `\\documentclass[aspectratio=169,11pt]{beamer}
\\usetheme{${theme}}
\\makeatletter
\\newcommand\\bpask[2]{%
  \\begingroup\\usebeamercolor*{#2}%
  \\@ifundefined{\\string\\color@#2.fg}{}{\\extractcolorspec{#2.fg}{\\bptmp}\\typeout{BPC|#1|fg|\\bptmp}}%
  \\@ifundefined{\\string\\color@#2.bg}{}{\\extractcolorspec{#2.bg}{\\bptmp}\\typeout{BPC|#1|bg|\\bptmp}}%
  \\endgroup
}
\\makeatother
\\begin{document}
${window.bpProbeFields.map(([k, n]) => `\\bpask{${k}}{${n}}`).join('\n')}
\\begin{frame}{x}y\\end{frame}
\\end{document}
`;

const { THEME_NAMES, themeNeedsUnicodeEngine } =
  await import('/@fs/C:/Stash/BeamerPoint/packages/core/src/themes/catalogue.ts');

window.bpProbe = async (theme) => {
  const r = await window.bpEngine.compile({
    jobId: 'probe-' + theme, mainFile: 'main.tex',
    program: themeNeedsUnicodeEngine(theme) ? 'xelatex' : 'pdflatex',
    passes: 1, runBibtex: false, timeoutMs: 120000,
    files: [{ path: 'main.tex', content: window.bpProbeTex(theme) }],
  });
  return (r.log ?? '').split('\n').filter((l) => l.startsWith('BPC|'));
};

await window.bpProbe('AnnArbor');
// ['BPC|normalText|fg|{gray}{0}', ..., 'BPC|frametitle|bg|{cmyk}{0,0.05,1,0}', ...]
```

`VirtualFile` takes `content`, not `text`; a job with `text` compiles a *missing* main
file, exits 0 and produces a log with no `BPC|` lines in it at all.

Four themes — Arguelles, CleanEasy, focus, trigon — cannot compile here at all because
the font packages they need are not bundled, so they have no row and keep the derivation.

### 2. Convert the colour specs

`\extractcolorspec` answers in whichever model the theme author used, so all four have to
be handled. Everything else has never appeared in a sweep; make it throw rather than
guess, so a new model is noticed instead of silently becoming black.

```js
window.bpToHex = (model, spec) => {
  const n = spec.split(',').map(Number);
  let rgb;
  if (model === 'rgb') rgb = n;
  else if (model === 'gray') rgb = [n[0], n[0], n[0]];
  else if (model === 'cmyk') rgb = [0, 1, 2].map((i) => (1 - n[i]) * (1 - n[3]));
  else if (model === 'RGB') rgb = n.map((v) => v / 255);
  else throw new Error('unknown colour model: ' + model);
  return rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)
    .toString(16).padStart(2, '0')).join('');
};
```

### 3. Sweep and emit the table

```js
window.bpSweep = async (names) => {
  const rows = {};
  for (const name of names) {
    let lines;
    try { lines = await window.bpProbe(name); } catch (e) { console.warn(name, e); continue; }
    const got = {};
    for (const l of lines) {
      const [, field, side, rest] = l.split('|');
      const m = /^\{([^}]*)\}\{([^}]*)\}/.exec(rest);
      if (m) (got[field] ??= {})[side] = window.bpToHex(m[1], m[2]);
    }
    rows[name] = window.bpProbeFields
      .map(([k]) => `${got[k]?.fg ?? ''},${got[k]?.bg ?? ''}`).join(' ');
  }
  return rows;
};

copy(Object.entries(await window.bpSweep(THEME_NAMES))
  .map(([k, v]) => `  ${k}: '${v}',`).join('\n'));
```

Paste the result over the body of `RAW` in `measured.ts` and run `npm test`. Running the
sweep exactly as written above reproduces the checked-in table for all 35 themes with no
differences, so a diff means something really changed. The format
is documented at the top of that file: one row per theme, fields in `MEASURED_FIELDS`
order, `fg,bg` as hex without the `#`, either side empty when beamer defines no such
colour.

## What consumes it

`themes.ts` builds a spec from the catalogue shape, then `applyMeasured()` overlays the
measurement, then the hand-written `OVERRIDES` apply. `OVERRIDES` is **colour-free** on
purpose — it holds shapes, radii, item markers and margins only. Do not put a colour back
into it; measure the theme instead, or the two sources of truth will disagree and the
measured one will lose.

## Title page layout

`themes/titleLayout.ts` is generated the same way, but from the PDF's text layer rather
than the log: a `\titlepage` is compiled per theme with known sample text, and each
line's baseline, size and horizontal anchor are read off it.

```js
window.bpTitleTex = (theme) => `\\documentclass[aspectratio=169,11pt]{beamer}
\\usetheme{${theme}}
\\setbeamertemplate{navigation symbols}{}
\\title{Measured Colours}
\\subtitle{A subtitle line}
\\author{A. Mohebbi}
\\institute{Polytechnique}
\\date{September 16, 2026}
\\begin{document}
\\begin{frame}[plain]
\\titlepage
\\end{frame}
\\end{document}
`;

// pdf.js is bundled with the app; the console needs it by path.
const pdfjs = await import('/node_modules/.vite/deps/pdfjs-dist.js');
pdfjs.GlobalWorkerOptions.workerSrc =
  '/@fs/' + location.pathname.split('/@fs/')[1] ?? '';  // or the absolute path to
  // node_modules/pdfjs-dist/build/pdf.worker.min.mjs

window.bpTitleItems = async (theme) => {
  const r = await window.bpEngine.compile({
    jobId: 'tp-' + theme, mainFile: 'main.tex',
    program: themeNeedsUnicodeEngine(theme) ? 'xelatex' : 'pdflatex',
    passes: 1, runBibtex: false, timeoutMs: 120000,
    files: [{ path: 'main.tex', content: window.bpTitleTex(theme) }],
  });
  const page = await (await pdfjs.getDocument({ data: r.pdf.slice(0) }).promise).getPage(1);
  const vp = page.getViewport({ scale: 1 });
  const BP = 72 / 25.4;   // big points, NOT TeX points
  return (await page.getTextContent()).items.filter((i) => i.str.trim()).map((i) => ({
    s: i.str,
    xMm: i.transform[4] / BP,
    yMm: (vp.height - i.transform[5]) / BP,   // baseline, from the page top
    pt: Math.hypot(i.transform[2], i.transform[3]),
    wMm: i.width / BP,
  }));
};
```

Match each item to a field by its sample text, sort by baseline, merge items whose
baselines are within about a millimetre onto one line, and decide the alignment from the
title's centre against the page's. Twenty-eight of the 35 themes come out on beamer's
default layout; the interesting rows are metropolis, moloch, Nord, Cuerna, Bergen,
SimpleDarkBlue, SimplePlus and the five sidebar themes.

That same anchor is where `SIDEBARS` in `themes.ts` comes from: the block is centred on
the TEXT area, so its offset from the page centre gives the sidebar's width and, by its
sign, the side it is on.

Rendering is checked by measuring the canvas back: each `.bp-title-line`'s baseline is
its box top plus `0.9 × font size` at `line-height: 1.2`, and for Madrid, metropolis,
Nord, Berkeley and SimplePlus every line lands within 0.01mm of the compiled value.

## Footline and headline kinds

The sweep gives colours, not layout. The footline *kind* in `catalogue.ts` was checked
separately, by compiling a probe deck with a distinctive author and title and looking for
that text in the page's bottom 12mm via `page.getTextContent()`. That found eight
catalogued kinds wrong: Boadilla and EastLansing were `minimal` and are `split`; Ilmenau,
Dresden, Szeged, Luebeck and Malmoe were `none` and are `split`; Cuerna was `minimal` and
is `none`. They are pinned in `themeColours.spec.ts`.

The equivalent headline check is **not done**. Five themes (AnnArbor, CambridgeUS, Cuerna,
EastLansing, Nord) draw section text where the catalogue says `headline: 'none'`, but a
text probe cannot tell a headline apart from a frame title reliably, and the obvious fix —
sampling pixels along the top band — needs pdf.js rendering, which hangs while the browser
pane is hidden (see docs/ENGINEERING.md). Do it with the pane visible, or from the operator list.
