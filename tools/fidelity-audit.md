# Canvas fidelity audit

How to check that the HTML canvas agrees with the compiled PDF, rather than assuming it.

This found three real bugs the first time it was run, including one where every element
sat up to 17mm too high — nearly a fifth of the slide.

## Why it is done this way

Screenshots are not evidence. Two renderings can look similar and be several millimetres
apart, and a systematic offset is invisible by eye but obvious in numbers. So: put a
unique marker word in each element, find that marker's position in **both** the DOM and
the PDF text layer, and subtract.

`page.getTextContent()` gives each text run with a transform, so the marker's position in
the PDF is exact. For images, `page.getOperatorList()` gives the image transform instead.

## Running it

Open the app, make sure the engine is installed, then paste the following into the
browser console. `window.bpStore` and `window.bpEngine` are exposed in dev builds.

### 1. Load the reference deck and compile it

```js
const tex = `\\documentclass[aspectratio=169,11pt]{beamer}
\\usetheme{Madrid}
\\setbeamertemplate{navigation symbols}{}
\\title{Fidelity Audit}\\date{}
\\begin{document}
\\begin{frame}
  \\frametitle{Audit}
  MARKERTEXT plain paragraph
  \\begin{itemize}
    \\item MARKERITEMA first
    \\item MARKERITEMB second
  \\end{itemize}
  \\begin{block}{MARKERBLOCKTITLE}
    MARKERBLOCKBODY inside
  \\end{block}
  \\begin{columns}
    \\begin{column}[t]{0.48\\textwidth}MARKERCOLL left\\end{column}
    \\begin{column}[t]{0.48\\textwidth}MARKERCOLR right\\end{column}
  \\end{columns}
\\end{frame}
\\end{document}`;
const st = window.bpStore.getState();
st.editSource(tex);
setTimeout(() => window.bpStore.getState().applySource(), 300);
```

Then compile from the PDF tab.

### 2. Read marker positions out of the PDF

```js
const pdfjs = await import('/@fs/<REPO>/node_modules/pdfjs-dist/build/pdf.mjs');
const W = await import('/@fs/<REPO>/node_modules/pdfjs-dist/build/pdf.worker.mjs?worker');
pdfjs.GlobalWorkerOptions.workerPort = new W.default();
const doc = await pdfjs.getDocument({ data: window.bpStore.getState().engine.result.pdf.slice() }).promise;
const page = await doc.getPage(1);
const vp = page.getViewport({ scale: 1 });
const tc = await page.getTextContent();
const PT = 72.27 / 25.4, mm = (p) => +(p / PT).toFixed(1);

// Group runs into lines so the layout is legible, and so an EMPTY run cannot be
// mistaken for a marker — that mistake once made a correct column look 45mm out.
const byY = {};
for (const i of tc.items) {
  const y = mm(vp.height - i.transform[5]);
  (byY[y] = byY[y] || []).push({ x: mm(i.transform[4]), s: i.str });
}
console.table(Object.entries(byY).map(([y, runs]) => ({ y, runs: runs.map(r => `${r.x}:${r.s}`).join(' | ') })));
```

### 3. Read the same markers off the canvas and diff

```js
const paper = document.querySelector('.bp-paper').getBoundingClientRect();
const scale = paper.width / 1600;              // 16:9 paper is 1600 design px wide
const toMm = (px) => +(px / (scale * 10)).toFixed(1);   // 10 design px per mm

const findNode = (m) => {
  const w = document.createTreeWalker(document.querySelector('.bp-paper'), NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (n.textContent.replace(/\s+/g, '').startsWith(m)) {
      const r = document.createRange(); r.selectNodeContents(n);
      const b = r.getBoundingClientRect();
      return { x: toMm(b.left - paper.left), y: toMm(b.top - paper.top) };
    }
  }
  return null;
};
```

Subtract, and look at the shape of the residuals — not just their size.

## Reading the results

**A systematic offset in one direction is a bug.** Residuals that all lean the same way
mean a wrong origin or a wrong box. Residuals that straddle zero are approximation.

**A residual that grows or shrinks down the slide is a spacing bug**, not an origin bug.

**Expect roughly:** under 2mm horizontally, under 3mm vertically. Text baselines versus
CSS line boxes account for a millimetre or two on their own and cannot be removed.

**Do not chase line breaking.** TeX optimises paragraphs globally and hyphenates;
browsers are greedy and mostly do not. A paragraph that wraps differently is expected,
and the compile log's overfull-hbox warnings already surface it per element.

## Measuring images instead of text

```js
const ops = await page.getOperatorList(), OPS = pdfjs.OPS;
let ctm = [1,0,0,1,0,0]; const stack = []; const found = [];
const mul = (a,b) => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3],
                      a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
for (let i = 0; i < ops.fnArray.length; i++) {
  const fn = ops.fnArray[i], a = ops.argsArray[i];
  if (fn === OPS.save) stack.push(ctm.slice());
  else if (fn === OPS.restore) ctm = stack.pop() || ctm;
  else if (fn === OPS.transform) ctm = mul(ctm, a);
  else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
    found.push({ w: Math.abs(ctm[0]), h: Math.abs(ctm[3]), x: ctm[4], yBottom: ctm[5] });
  }
}
```

The CTM's `[0]` and `[3]` are the drawn width and height; `[4]`/`[5]` are the bottom-left
corner in PDF coordinates, so `yFromTop = pageHeight - yBottom - height`.

## Measuring beamer's own geometry

Compiling `[t]` and `[b]` frames brackets the text area exactly, which is how the values
in `themes/catalogue.ts` were obtained:

```latex
\begin{frame}[t]\frametitle{X}PROBEMARK\end{frame}   % top of the text area
\begin{frame}[b]\frametitle{X}PROBEMARK\end{frame}   % bottom
```

`\typeout{... \the\textwidth ...}` inside a frame reports lengths straight into the log.
Note `\beamer@leftmargin` needs `\makeatletter`, and without it the run aborts before the
`\typeout` and you get no output at all rather than an error.

## Verifying that themes actually compile

Do this after adding or renaming any theme. **A theme appearing in the TeX Live directory
listing does not mean it compiles.** Four of the first 39 offered failed on missing font
packages — `Alegreya.sty`, `cmbright.sty`, `FiraSans.sty`, `sourcesanspro.sty` — none of
which are in the bundled basic/recommended/extra collections.

Compile each theme with a deck that exercises the usual furniture (title page, frame
title, list, block) and record `r.ok` plus any `File '...' not found` from the log:

```js
const core = await import('/@fs/<REPO>/packages/core/src/index.ts');
const results = {};
for (const t of core.THEME_IDS) {
  const r = await window.bpEngine.compile({
    jobId: 'sweep-' + t,
    mainFile: 'main.tex',
    files: [{ path: 'main.tex', content: deckUsingTheme(t) }],
    program: 'pdflatex', passes: 1, runBibtex: false, timeoutMs: 45000,
  });
  results[t] = { ok: r.ok, missing: (r.log.match(/File `([^']+)' not found/) || [])[1] ?? null };
}
console.table(results);
```

Run it in chunks of about a dozen — a full sweep takes a couple of minutes and the
console helper times out well before that.

Anything that fails goes into the catalogue as `unavailable: { missingPackage }` rather
than being deleted: the canvas still needs its shape so that opening a deck which uses it
renders something recognisable. `THEME_IDS` (what the picker offers) excludes them;
`ALL_THEME_NAMES` does not.

Sweep the colour and font themes too, applied on top of a known-good presentation theme
with `\usecolortheme` / `\usefonttheme`. All 17 and 6 respectively passed when last
checked, as did all 35 offered presentation themes, plus metropolis and moloch under
XeLaTeX.
