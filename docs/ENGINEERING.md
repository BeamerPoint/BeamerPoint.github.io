# BeamerPoint engineering notes

Guidance for working in this repository. Read the **Invariants** and **Hard-won
lessons** sections before changing anything — several of them look like arbitrary
choices and are not.

## What this is

**BeamerPoint** — a browser-based, PowerPoint-like editor for Beamer presentations.
Edit slides on a visual canvas, read and edit the generated LaTeX in the same window,
and compile to a real PDF without installing a TeX distribution.

The distinguishing requirement: **the LaTeX source is a first-class, editable view, not
a one-way export.** Canvas edits appear in the source; source edits come back to the
canvas; anything the app does not understand is preserved byte-for-byte.

## Scope, as agreed with the user

| Area | Decision |
| --- | --- |
| Preview | Hybrid — instant HTML/CSS canvas for editing, on-demand WASM LaTeX compile for a true PDF |
| Source | Bidirectional round trip over the app's own subset; foreign LaTeX preserved verbatim as raw blocks |
| Layout | Hybrid — idiomatic Beamer by default, absolute positioning when an element is dragged |
| App shape | Local-first React/TS SPA, no server required |
| Elements wanted | Text/lists, images, tables, math, TikZ shapes, code blocks |
| Extras wanted | Speaker notes, sections + auto-outline, pgfplots charts, citations/bibliography |
| Overlays | **Out of scope for v1** — no `\pause`, no `\onslide`, no animation UI. Preserved on import, never authored. |

## Commands

```bash
npm install          # once
npm run dev          # http://localhost:5173
npm test             # vitest, 100 tests
npm run engine:install   # ~540MB TeX Live, optional, one-time
```

Typecheck a package: `npx tsc -p packages/<name>/tsconfig.json --noEmit`.
There is no build/lint step beyond these.

## Layout

```
packages/
  core/     Document model, LaTeX emitter, LaTeX parser, theme catalogue. Pure TS, NO DOM.
  engine/   LatexEngine abstraction, busytex WASM backend, TeX log parsing.
  app/      React UI: canvas, slide sorter, source editor, PDF preview, inspector.
```

`core` must stay DOM-free — that is what lets the round-trip property tests run fast and
headless in Node.

## Invariants

These are load-bearing. Breaking one produces silent data loss or a canvas that lies.

**1. Parsing is total and lossy-proof.** Three stages:
   `parse/lexer.ts` builds a CST and never throws (malformed input becomes an `error`
   node); `parse/recognizers/` are **all-or-nothing** — a recognizer that meets anything
   it cannot model returns `null` and declines rather than returning a half-populated
   element; `parse/guard.ts` then re-emits every parsed element and compares it against
   its source, demoting anything that does not match to a byte-exact raw block.
   Together these make "the parser silently ate a macro" structurally unreachable.

**2. Never concatenate user text into TeX.** Everything goes through `emit/escape.ts`.
   `unescapeText` returns `null` rather than guessing; `null` means "keep verbatim".

**3. The canvas and the source editor are never both writable.** Typing in the editor
   takes an exclusive lock and greys out the canvas. There is no merge path — a merge is
   exactly where hand-written LaTeX gets clobbered.

**4. Element ids are not stored in the `.tex`.** `parse/reid.ts` re-derives them by
   structural matching after every reparse. Note this is also how an uploaded image
   keeps its bytes: the resource id is the IndexedDB key.

**5. Never use CSS `mm` on the canvas.** See below — this one has already caused a bug.

## Hard-won lessons

Each of these was a real defect. Do not undo them.

**CSS `mm` is a physical unit** (~3.78px at 96dpi), but the slide is drawn on a
10-design-pixel-per-millimetre grid (`PX_PER_MM`). Mixing them rendered everything at
0.38×, so an element the model placed at 40mm appeared at 15mm and landed somewhere
else entirely in the PDF. Use the `--bp-mm` custom property in CSS, or `PX_PER_MM` in
TSX.

**Beamer centres frame content vertically** unless the frame or class is top-aligned,
and it centres inside its own text area, not inside whatever is left after the chrome.
Top-aligning the canvas instead put every element up to 17mm too high. The measured text
box lives in `themes/catalogue.ts` as `textTopMm`/`textBottomInsetMm`.

**A theme existing in TeX Live does not mean it compiles.** Four of the first 39
offered failed on missing font packages. Every theme in the picker has now been
verified by compiling it; the failures stay in the catalogue as `unavailable` so a
deck that uses one still renders, but are excluded from `THEME_IDS`. Re-sweep after
touching the list -- the procedure is in `tools/fidelity-audit.md`.

**Theme text margins are MEASURED, not assumed.** Beamer's default is 10mm, but Madrid
— the app's default theme — is 3.85mm, the sidebar themes are 12.91–15mm, and Bergen is
22.56mm. Wrong margins make every `\textwidth`-relative width render at the wrong size.
`packages/core/test/geometry.spec.ts` exists to stop these being "tidied" to round
numbers.

**Absolutely-placed elements belong on the page layer**, not inside the text column.
`textpos` measures from the page corner; the text column is inset by the margins and
sits below the frame title.

**Inside a `textblock*`, textpos sets both `\linewidth` and `\textwidth` to the block
width.** So a fractional width there renders at a fraction of the box the user just
sized. Absolutely-placed images emit `width=\linewidth`.

**graphicx rejects `\width` inside `trim`** (fails with *File ended while scanning use
of \Gread@parse@vp*). Crop is therefore stored in absolute big points, which also keeps
the round trip exact.

**Canvas editing must not read `textContent`.** Rebuilding content from plain text
destroys bold, turns inline math into rendered glyphs, and re-escapes preserved macros
into literal characters. `canvas/domInline.ts` tags each inline node with its index and
reassembles the model from the DOM. Regression-tested in
`packages/app/test/inlineEditing.spec.tsx`.

**pdf.js needs `requestAnimationFrame`**, which does not fire in a hidden document, so
rendering is gated on visibility. A render started while hidden hangs with no error.

**A `tabular` is an inline box, not a block.** A newline before it in the source is
just a space, so a table emitted straight after a paragraph is set *beside* that
paragraph — measured 58mm to the right — while the canvas draws it below. The emitter
therefore puts a blank line either side of a flow-placed table. `\includegraphics`
has the same nature and has not been given the same treatment yet.

**booktabs' rule separation is deliberately not drawn on the canvas.** Adding
`\aboverulesep`/`\belowrulesep` as cell padding is the obvious fix for the header row
sitting 1.3mm high, and measuring showed it made every row worse (residuals went from
+1.3/−0.2/+0.1 to +2.4/+2.7/+3.0) because frame content is centred and the table then
overshot its true height. Measure before and after, not just after.

**TikZ needs its libraries declared, and the shapes are stored y-down.** An `ellipse`
node without `\usetikzlibrary{shapes.geometric}` fails with *I do not know the key
'/tikz/ellipse'* and produces **no PDF at all** — not a degraded one. The libraries are
part of the derived `tikz` package setup. TikZ's y axis points up, so the model keeps
millimetres from the top-left like everything else and the emitter negates y; verified
by compiling a node asked for at (40mm, 20mm) and measuring 40.00mm right, 20.00mm down.
A picture also needs `\useasboundingbox`, or TikZ shrinks it to fit its contents and
empty space at the edge of the user's canvas silently disappears.

**Deleting a shape must delete the arrows attached to it.** A `\draw (bpX.east) -- ...`
naming a node that no longer exists aborts the whole compile rather than skipping that
one arrow, so an orphaned arrow takes the deck down. `shapeOps.removeShape` drops them,
and `shapeOps.spec.ts` checks the emitted source for dangling node references.

**PDF user space is big points (72/inch), not TeX points (72.27/inch).** The audit
script used 72.27 and so scaled every measurement down by 0.375% — 0.37mm at 100mm,
leaning the same way in every residual. A node placed at exactly 100mm read as 99.63
under the old constant.

**Never tell the user a package is not bundled without checking.** The missing-file
banner used to assert "not part of the bundled TeX Live collections" for every missing
`.sty`. For `textpos` — which the app emits for every text box, and which ships in the
*extra* bundle — that was false, and the advice it gave ("pick a different theme") sent
the user away from the real cause. `engine/packageIndex.ts` answers the question from
the manifests that ship beside the bundles. It reads the cheap `providespackage` list
first, then falls back to the full file listing, because `tikz.sty` declares no
`\ProvidesPackage` and would otherwise be reported as unbundled — the same bug again.
An unreadable manifest yields `conclusive: false`, never a negative.

**The collections are not equal, and a partial install looks healthy.** beamer, tikz
and booktabs are all in *recommended*; `textpos` is *extra*-only. The runner reports
`ready` with a collection absent, so ordinary decks compile and the first extra-only
package fails with a bare "file not found". `BusytexEngine.installedCollections()`
tells the two cases apart and `repair()` re-downloads.

**KaTeX cannot render a bare `align` body.** `&` and `\` are only legal inside an
environment, so a display-math body must be wrapped (`aligned`/`gathered`) before
preview. `canvas/mathPreview.ts` does it once for both the canvas and the inspector —
having two copies is how a valid equation rendered correctly in one and as a red error
in the other.

**Prefer the Write/Edit tools over shell heredocs for files containing LaTeX.** Multiple
layers of shell/Python escaping have repeatedly halved backslashes and corrupted
`\includegraphics` into `includegraphics`.

Run `tools/fidelity-audit.md` after touching canvas layout. It compares canvas and PDF
positions numerically; the first run found three real bugs, the worst of them 17mm.

## Verify against the engine, not intuition

There is a working TeX Live in the browser. When a LaTeX question comes up — does this
option exist, what is `\textwidth` here, does this theme need XeLaTeX — **compile a
probe and read the log** rather than reasoning about it. Every LaTeX fact in this file
was measured that way. In dev, `window.bpEngine` and `window.bpStore` are exposed for
exactly this.

For geometry questions, extract the actual transform from the compiled PDF via
`page.getOperatorList()` rather than eyeballing a screenshot.

## Status

Eighteen commits on `master`, ~13,600 lines across 71 source files, 100 tests passing.

### Done

- **Round trip**: total lexer, all-or-nothing recognizers, verify-and-degrade guard,
  id reassignment, source map for error attribution
- **Elements**: text (rich inline: bold/italic/math/cite/ref/links/raw islands), lists
  (itemize/enumerate/description, nested), Beamer blocks (block/alertblock/exampleblock),
  two-column layouts, images
- **Images**: insert by button/drag/paste, SVG+WebP rasterised at import, filename
  sanitising, resize, drag-to-absolute, align, crop, caption, zip export with assets
- **Tables**: `tabular`/`tabularx`/`\resizebox`, booktabs and hline rules, `\multicolumn`
  spans, `p` and `X` columns, vertical rules, captions in a `table` float; grid editor
  in the inspector, cells edited in place on the canvas; structure operations are pure
  functions in `core/model/tableOps.ts`
- **Shapes and diagrams**: a TikZ drawing canvas with rectangles, rounded rectangles,
  ellipses, lines, polygons, arrows and text labels; draw by dragging, then move, resize
  and restyle (line/fill colour, dash, width, arrowhead, z-order). An arrow endpoint
  dropped on a shape **attaches** to that side and follows it, which is what makes it a
  diagram rather than loose shapes. A hand-written `tikzpicture` is kept verbatim as a
  `mode: 'raw'` element. Operations are pure functions in `core/model/shapeOps.ts`
- **Math**: display equations (equation/align/gather and their starred forms, plus
  `\[ \]`), body kept verbatim, KaTeX preview on the canvas and in the inspector
- **Sections and speaker notes**: emitted and parsed (no authoring UI yet)
- **Themes**: 35 presentation themes, each verified to compile, with measured margins; XeLaTeX auto-selected for
  fontspec themes via a `% !TEX program` magic comment
- **Engine**: busytex WASM (TeX Live 2026), log parsing with diagnostics mapped back to
  slides and elements, overfull-box fidelity warnings
- **UI**: resizable columns, LaTeX syntax highlighting, three-layer autosave with
  crash recovery and optional save-to-real-file, undo/redo

### Not done

Roughly in the order the user and I agreed to tackle them:

1. **Code blocks** — `listings`; `fragile` is already auto-derived on the frame
2. **Citations** — `.bib` attach, `\cite` autocomplete, references frame
3. **pgfplots charts** — small data-table editor
4. Authoring UI for sections and speaker notes (model/emit/parse already exist)
5. Image rotation (model and emitter support `angle=`; no handle yet)
6. Importing an arbitrary external `.tex` (the parser can already do it; needs a file
   picker and a report of what degraded to raw)

Model types, and in several cases the emitter, already exist for all of these — check
`packages/core/src/model/types.ts` before designing anything new.

### Known gaps

- The canvas is an approximation and says so; it diverges most in line breaking, since
  TeX optimises paragraphs globally and browsers do not. Audited against the PDF at
  under 2mm horizontally and under 3.1mm vertically for text, lists, blocks and columns;
  vertical text boxes have been measured for Madrid, default, Warsaw, metropolis and
  Berkeley only, and other themes fall back to a derived approximation
- Tables cannot yet be authored with row spans (`\multirow` is preserved on import but
  not modelled), a per-table font size, or merges created from the UI; column widths are
  numeric rather than draggable. Audited against the PDF at under 2.3mm horizontally
  (cumulative font-metric divergence, worst in the rightmost column) and under 1.9mm
  vertically
- Diagrams have no rotation, no multi-point polyline editing after drawing, no grid
  snapping of shapes, and no rich text inside a label. A label's on-canvas box is
  estimated from its character count, so hit-testing a label is approximate — the
  compiled position is not. Internal diagram geometry was measured at **0.00mm** against
  the PDF; the picture's own placement on the slide is within about 1.4mm, the same
  vertical-centring approximation as text and tables
- `minted` needs shell escape, which the WASM engine cannot provide; preview falls back
  to `listings` with a warning
- The file picker, drag-drop and paste paths have not been exercised with a real mouse —
  only driven programmatically
