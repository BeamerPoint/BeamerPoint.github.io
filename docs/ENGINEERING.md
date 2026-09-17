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
| Elements wanted | Text/lists, images, tables, math, TikZ shapes, code blocks — all done |
| Extras wanted | Speaker notes, sections + auto-outline, pgfplots charts, citations/bibliography — all done |
| Overlays | **Out of scope for v1** — no `\pause`, no `\onslide`, no animation UI. Preserved on import, never authored. |

## Commands

```bash
npm install          # once
npm run dev          # http://localhost:5173
npm test             # vitest, 306 tests
npm run engine:install   # ~540MB TeX Live, optional, one-time
```

Typecheck a package: `npx tsc -p packages/<name>/tsconfig.json --noEmit`.
There is no build/lint step beyond these.

## Layout

```
packages/
  core/     Document model, LaTeX emitter, LaTeX parser, theme catalogue. Pure TS, NO DOM.
  engine/   LatexEngine abstraction, busytex WASM backend, TeX log parsing.
  app/      React UI: Office-style shell (title bar, ribbon, thumbnail rail, format
            pane, status bar), canvas, source editor, PDF preview.
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

**A frame has three spellings and the model must remember which one it read.**
`\begin{frame}{Title}` and `\frame{...}` mean the same as the app's own
`\begin{frame}` + `\frametitle{...}`, but the guard compares BYTES — so re-emitting in
the app's style made every imported frame mismatch, and a typical third-party deck
imported as ONE enormous raw block. `FrameNode.titleStyle` and `FrameNode.form` record
the spelling; new frames still use the app's. Covered by `test/frameForms.spec.ts`.

**Parsing must not apply the app's preferences to someone else's file.** Beamer shows
navigation symbols by default and `defaultPreamble()` turns them off, so importing a
deck silently added `\setbeamertemplate{navigation symbols}{}` and changed every slide.
The parser now starts that flag at beamer's default and only turns it off when the file
does.

**TikZ's shape library sizes shapes to CONTAIN the box, not to fill it.** Measured
against the engine with a 26×16mm request: `trapezium` drew 34.2×16, `star` drew
24.7×23.5, `regular polygon sides=3` drew 22.5×19.5, `isosceles triangle` drew 31.4×26.
Only `rectangle`, `ellipse`, `circle`, `diamond` and `signal` came out exactly. So the
extended shapes are explicit point lists in `model/polygons.ts` — same numbers on the
canvas and in the `\draw`, exact by construction, and no library needed. A polygon
inscribed in the box needs `fitToBox` too: a pentagon has no bottom vertex and a hexagon
spans only 86.6% of the width.

**Only a named node can be an arrow's target.** A polygon is a bare `\draw ... -- cycle`
with no name, so attaching an arrow to one would emit `(bpX.east)` for a node that does
not exist and abort the compile — the same failure as an orphaned arrow. `isAttachable`
gates it and `attachEndpoint` falls back to a plain point.

**Gridlines are SVG lines with `vector-effect: non-scaling-stroke`, not a repeating
gradient.** The page is CSS-scaled to about 0.31, so a 1px gradient stop lands on a
third of a device pixel and each repeat rasterises independently — the lines came out
at visibly unequal spacing. Verified after the change: every gap exactly 31.063px.

**A full-bleed layer over the slide must be `pointer-events: none`.** The canvas stacks
several `position: absolute; inset: 0` layers on top of `.bp-body` — gridlines, guides,
the absolute-placement layer, the selection overlay — and any one of them that accepts the
pointer swallows every click aimed at the slide underneath. `.bp-guides` did, at z-index 3,
for as long as guides have existed: an EMPTY guide layer with no guides in it made text,
lists and diagrams unselectable, and a drag inside a diagram never reached the SVG, so **no
shape could ever be drawn with a real mouse**. The layer is inert and the guide LINES take
the pointer instead. `app/test/canvasLayers.spec.ts` asserts the rule against the
stylesheet, since jsdom has no layout to hit-test.

**A drag belongs to the DOCUMENT, not to the node it started on.** `resizeElementBy`
converts an element to absolute placement on the first pointermove, and the canvas
renders flow children under `.bp-body` but absolute ones under `.bp-abs-layer` -- a
different DOM parent, so React unmounts the handle mid-gesture and takes the pointer
capture and the handler with it. A box moved about a pixel and then froze, which is what
"resizing is not possible at all" was. `canvas/pointerDrag.ts` listens on `window` and
captures on `document.body`. The first version of that file was a HOOK and failed just
as hard, because the same remount tears down the `useEffect` that installed the
listeners: the session has to be module state. Measured in the browser, twice.

**A handle declared in CSS pixels is not that many pixels.** `.bp-stage` carries
`transform: scale(...)`, typically 0.2-0.4, so the 11px `.bp-handle` measured **2.3 real
pixels** and the 10px move bands measured 2. Interactive sizes and offsets are divided by
the scale in `SelectionOverlay`, the same inverse the rulers use, and measure exactly 11
on screen at any zoom. A shape's SVG handle has it twice over -- PX_PER_MM and then the
stage -- so its radius is computed from both.

**Snapping applied per pointermove makes a guide a trap.** `snapMm` ran on the stored
value and the next move started from the snapped number, so once a box touched a guide no
single move could exceed the 1.5mm tolerance and it could not be pulled off. The gesture
(`beginGesture`/`endGesture`) keeps the true position and snapping is a presentation of
it. The same bracket gives one undo entry per drag: `mutate` used to push history on
every move, so one drag buried the 100-deep stack and Ctrl+Z undid two pixels.

**`requestAnimationFrame` does not fire when the window is not being painted.** Known for
pdf.js here; it bit again in the selection tracking, which coalesced `selectionchange`
through rAF -- so the whole text-formatting feature was dead, with no error, whenever the
app sat behind another window. Measured in the browser pane, where rAF never fires at
all. Coalesce with a timeout; keep rAF for things that are genuinely about painting.

**`\large` is a control word, so the space after it is not content.** The parser kept it
in the child text and the emitter wrote its own, so `{\large big}` re-emitted as
`{\large  big}`, then three spaces, then four: the file grew every time the deck was
saved. The guard never caught it because whitespace between tokens is insignificant to
the comparison -- a fixpoint test is the only thing that finds this class of bug.

**`\textcolor[rgb]{...}` was emitted and could not be parsed.** The emitter has always
written the `[model]{spec}` form for an rgb colour and `parse/inline.ts` accepted only the
two-argument, zero-option one, so a colour from the RGB picker came back as an inert raw
island: preserved, no longer editable, counted against `health.demoted`. If the emitter
can write a form, the parser has to read it -- the same rule as `\titlegraphic`.

**Styling a range needs a fixed nesting ORDER.** Applying a colour to "a" and to a bold
"b" put the wrapper innermost on one and outermost on the other, so the two had no common
parent: `\textcolor{red}{a}\textbf{\textcolor{red}{b}}`, correct LaTeX, twice the source,
and impossible to toggle back off as one run. `MARK_RANK` in `model/richtextOps.ts` ranks
every wrapper; all of these commands commute, so reordering changes nothing on the page.

**A format button must cancel its own mousedown.** Clicking one moves the focus, which
destroys the browser's selection before the click handler runs -- and then there is
nothing left to format. Every control in Home > Font calls `preventDefault` on mousedown.
For the same reason Ctrl+B/I/U are intercepted inside the editable box: the browser's own
handler inserts a bare `<strong>` with no `data-bp-i`, and `readInlineFromDom` flattens
anything without one to plain text on the next blur.

**Beamer typesets in SANS, so a serif font package does nothing on its own.** `mathptmx`
and `mathpazo` -- the obvious way to offer Times and Palatino -- set `\rmdefault` and
leave `\familydefault` at `cmss`. Loading either compiles, produces a PDF, and changes
nothing on the slide. A serif family has to carry `\usefonttheme{serif}` with it.
`themes/fonts.ts` records which of the eleven offered families need it, each measured by
reading `\familydefault` out of the log; the probe is `tools/deck-fonts.md`. Six more
font packages are not bundled at all.

**The `transparent` package does not make anything transparent here.** Measured with
`\pdfcompresslevel=0` so the PDF's graphics state is readable: `\transparent{0.4}{...}`
compiles and writes `ca 1, CA 1` -- an alpha of one. A TikZ node with `opacity=0.4`
writes `ca 0.4`. So a see-through picture is emitted as a one-node `tikzpicture` with
`inner sep=0pt`, and a picture with no opacity emits byte-for-byte what it always did.
Reading a PDF's own bytes needs that compression flag: busytex writes object streams, so
grepping a normal output for `/ca` or `/BaseFont` finds nothing and looks like a negative
result.

**A copy must renew the ids INSIDE it, not just its own.** A diagram's arrows name the
shapes they attach to, so a clone that reuses a shape id leaves the pasted arrows bound
to the ORIGINAL shapes: they follow it when it moves, and emitting `(bpX.east)` for a
node outside its own picture aborts the whole compile — the orphaned-arrow failure
again, arrived at from the other direction. `model/cloneOps.ts` remaps them in two
passes, because an arrow can be declared before the shape it points at. Resource ids are
deliberately NOT remapped: they are the IndexedDB keys for the image bytes, and a copied
picture must not need a second copy of the file. The clipboard is also cleared by
`loadDeck`, or an element copied out of the previous document can name a resource the
new one does not have.

**A diagram's element BOX and the picture inside it are the same width, and nothing kept
them together.** `setTikzCanvasSize` wrote `canvasSize` and left `placement.w` alone, so
a picture shrunk to 90mm sat in a 170.5mm box with its selection handles floating out to
the right of it — measured in the browser. `withBoxWidth` keeps them in step. The same
confusion bites the other way for a FLOW diagram: it lives in a block-level div that
spans the whole text column, so `measuredRects` reports about 152mm for a 100mm picture.
Anything that needs "how wide is this element" for a diagram or a chart must ask the
element (`elementWidthMm`), not the rect it was drawn into.

**Constraining an aspect ratio has to capture the ratio ONCE.** Derived from the current
box on every pointermove, rounding feeds back in and a long drag slowly walks the
proportions away from where they started. It lives on the gesture, beside the raw box and
for the same reason.

**Deleting the focused thing drops focus to the body.** The slide rail's first Delete
worked and every key after it went nowhere, because the button holding focus had just
been unmounted. Anything that removes the node it was invoked from has to take the focus
back afterwards. Found with real keystrokes; the store was right the whole time.

**Driving the store is not driving the UI.** Every shape feature was built and verified by
calling `drawShape` and friends directly, and all of it worked — while the thing a user
actually does, press and drag on the canvas, had never once been tried and had never
worked. A store call skips hit-testing, stacking order and pointer capture, which is
exactly where this class of bug lives. Finish a canvas feature by doing it with the mouse.

**The rulers live on `.bp-stage`, not inside `.bp-paper`.** They are positioned just
outside the page, and the page sets `overflow: hidden` to clip slide content — so while
they were children of the paper they were clipped away and never appeared at all. The
stage carries the zoom and does not clip; the rulers divide by the scale so they stay a
constant size on screen while their tick positions stay in page units.

**A slide thumbnail is drawn in SLIDE pixels, then scaled.** `SlideThumbs` renders the
miniature at the deck's full 1600px width and scales it by ~0.094, so every size in
`.bp-thumb-*` is about four times what a screen-space value would be. A 7px bar — which
looks right in a stylesheet — comes out at two thirds of a pixel and the thumbnails
render blank.

**A hook's `useState` is per call site.** `useImageImport` is used by both the ribbon
and the canvas drop target; its `notice` lived in `useState`, so a message raised by
the ribbon went into the ribbon's own copy and never reached the banner the app
renders. Shared UI state that any caller can raise belongs outside React — that one is
a module-level store read through `useSyncExternalStore`.

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

**Theme colours are asked of beamer, not derived from one hex.** Every palette used to be
mixed arithmetically from a hand-written `structure` colour, and **25 of the 39 themes shared
the same blue** — Madrid, Warsaw, Berlin, Frankfurt and 21 others were colour-identical on
the canvas while the PDFs were plainly different. Beamer will simply tell you: for each
colour, `\usebeamercolor*{X}` then `\extractcolorspec{X.fg}{\tmp}\typeout{...}`, guarded with
`\@ifundefined{\string\color@X.fg}` because most beamer colours have no background — and
**starred, inside a group**, because the unstarred form adds to the colour already in force
and a theme's answers then depend on the order you asked the questions in. The
sweep is in `tools/theme-colours.md` and its output is checked in as
`themes/measured.ts`; `applyMeasured()` overlays it on the derivation, which survives only
as the fallback for the four themes that cannot compile here. Measurement also corrected
eight catalogued footline kinds and found AnnArbor's maize title bar (derived: navy),
CambridgeUS' grey-and-red (derived: maroon) and Madrid's footline running light-dark-light
when beamer runs it dark-to-light. Re-run the sweep after touching the theme list.

**The title page is drawn from a measured layout, and it is not one layout.** `\titlepage`
stays a `RawElement` — the emitter writes the one command and beamer builds the slide — so
this is purely a canvas rendering, from `themes/titleLayout.ts`. Twenty-eight of the 35
themes do agree with beamer's default, and the rest are not near it: metropolis and moloch
are left-aligned at the text margin and put the date BEFORE the institute, Nord sets its
title at 24.8pt and runs author and institute onto one line, Cuerna puts the author at the
foot of the page, and the sidebar themes centre on their text area. Lines are placed by
baseline: the block's top is the first baseline less `0.9 × font size` (the ascent at
`line-height: 1.2`) and each following line gets the measured baseline GAP as a margin, so
a title that wraps pushes the rest down instead of being overlapped. Beamer sets the title
and subtitle in ONE `beamercolorbox`, so its 8pt padding is inside that box and not between
lines — treating it as a margin put every line below the title 2.8mm low.

**`\titlegraphic` was being eaten.** It was listed in `TITLE_COMMANDS`, so the parser
consumed it, and `applyTitleCommand` had no case for it, so it vanished: importing a deck
with a logo on its title slide silently deleted the logo. `DeckMeta.titlegraphicResourceId`
existed but nothing ever emitted it, so it could not have come back either. Removed from
the set, it falls through to `pushChunk` and survives byte-for-byte. Covered by
`test/deckMeta.spec.ts`. If a command reaches `TITLE_COMMANDS`, it needs a case in
`applyTitleCommand` AND a line in the emitter — otherwise leaving it out is the safe choice.

**A re-lexed fragment's spans must be rebased before the guard sees them.** A
`textblock*`'s body is re-lexed on its own so that raw slices inside it resolve against
the right string -- but that left every span inside counted from the start of the
FRAGMENT while the guard slices them out of the whole document. An absolutely-placed
block's child text therefore compared itself against a piece of the preamble, mismatched,
and took the entire frame down to one raw block. A bare text box survived only because
its own span is overwritten with the environment's. `rebaseSrc` shifts the subtree.

**`\rotatebox` typesets in LR mode, so its content needs a `minipage`.** Without one, a
rotated `block` fails with *Missing \endgroup inserted* and produces NO PDF, and a
rotated paragraph never wraps. Measured: bare fails, wrapped compiles. The emitter always
writes `\rotatebox{d}{\begin{minipage}{\linewidth}...\end{minipage}}` and
`peelRotatebox` in the parser strips both layers -- an emit-side change that is only
correct together with the parse-side one.

**The store's element lookup has to recurse, because elements nest.** `mapElement` and
`findElement` walked the frame's own child list only, so an edit to something inside a
block or a column was applied to a list that did not contain it and was then silently
dropped -- typing into a block's body did nothing at all, and deleting a nested element
did nothing either. They walk the tree now, via `mapTree`/`removeFromTree`, and the
canvas passes `selectedId` down instead of the `selected={false}` it used to hardcode for
children.

**Freeing a nested element must lift it out of its container.** An absolutely-placed
element is positioned from the page corner by textpos, so it is no longer inside
anything; leaving it in a block's child list would have the canvas draw it inside a box
the PDF puts it nowhere near. `liftToFrame` moves it onto the frame, which is also what
dragging something out of a placeholder does in PowerPoint.

**A drag delta is the POINTER's movement; the grip says what it means.** Sign-correcting
in the overlay AND in the store made one westward drag grow the box by twice the distance
and move it the wrong way at the same time. The overlay passes millimetres straight
through and `resizeElementBy` decides: an east grip moves the right edge, a west grip
moves the left edge and the width with it.

**Only an image and a diagram can be resized vertically.** `Placement.h` exists in the
model and is emitted by NOTHING -- `textblock*` takes a width only -- so a height stored
there would be a control that silently does nothing and a canvas that claims a size the
PDF does not have. An image has `height=` and a diagram has its canvas; those two get the
north and south handles and nothing else does.

**The selection overlay must not swallow the element it covers.** `.bp-overlay` spans the
element, so once every element could be selected, selecting a list or a block made its
text uneditable: every click landed on the overlay. The overlay's own box is
`pointer-events: none` and only its handles and drag bands take the pointer. For the same
reason the move target is a BAND around the edge, not a sheet over the middle, for
anything that is typed into in place.

**TikZ's `rotate` turns the coordinate system, not the shape.** A shape given
`rotate=20` swings away from where it was drawn, which is not what a rotation control
means anywhere else. `rotate around={20:(cx,-cy)}` takes a pivot, and the pivot is the
shape's own centre. `drop shadow` additionally needs `\usetikzlibrary{shadows}` --
without it the compile fails outright with *I do not know the key '/tikz/drop shadow'*
and there is no PDF. Adding `shadows` to `TIKZ_LIBRARIES` meant keeping the previous
spelling as `TIKZ_LIBRARIES_LEGACY` inside `DERIVED_SETUP_LINES`, which matches by exact
string: without it a deck saved by an older build keeps its old line as a user chunk AND
derives the new one beside it, growing a duplicate on every edit.

**TikZ and LaTeX turn anticlockwise; CSS and SVG turn clockwise.** Every rotation
crosses that boundary, so the canvas draws `rotate(-deg)` for both a shape's `rotate
around` and an element's `\rotatebox`. The model keeps LaTeX's convention, because
flipping the sign in emit and parse instead would put a sign error one refactor away
from being permanent.

**Table shading needs `colortbl`, and `\rowcolor` is a row PREFIX.** Measured: without
the package, `\rowcolor` is an undefined control sequence and the deck does not compile;
beamer already loads xcolor, so colortbl alone is the smaller ask than re-loading xcolor
with its `table` option. The command stands before the row's first cell and colours the
whole row, so the parser reads it between rows rather than inside a cell. The rgb form of
a colour already carries its own `[model]{spec}`, so it must NOT be wrapped in braces
again — `\rowcolor{[rgb]{...}}` is not a colour. Fill lives on the id-keyed row and cell
rather than in an index-keyed side table, so inserting a row does not move the colour.

**A sidebar theme's frame title must be inset past the sidebar.** The sidebar occupies the
whole left text margin, and the frame title spans the full page width, so padding the title
by `margins.hMm` put it exactly underneath — Berkeley's "Frame title bar" rendered as
"ne title bar". The title's left padding is `max(its own, sidebar + 1.5mm)`, and both the
sidebar and that inset read one `sidebarMm` local so they cannot drift apart.

**A chart's series point at their data by COLUMN INDEX.** Removing or reordering a
column moves every series to its right, and getting that wrong plots the wrong numbers
without crashing — it does not fail, it lies. `model/chartOps.ts` owns the remapping, in
`core`, tested; the panel never touches indices itself. It is the same class of index
fixing `shiftMerges` does for table merges.

**Each chart series carries its own two columns, not the whole table.** Repeating the
entire table per `\addplot` is what pgfplots examples do, and it puts the same numbers in
the source three times for a three-series chart. Two columns each keeps it readable, and
the parser rebuilds one table by requiring the x column to agree across plots — plots that
disagree are not a table and decline to raw. `col sep=comma` so a column name may contain
spaces; a TEXT x column additionally needs `symbolic x coords={...},xtick=data` or
pgfplots reads the labels as numbers and plots nothing.

**The chart recognizer must run BEFORE the TikZ one.** A chart IS a `tikzpicture`, so the
drawing-canvas recognizer will happily claim it, and then the data grid has nothing to
edit and the numbers are raw TikZ.

**`\bibliography{...}` belongs in the BODY, and nothing was writing it.** The preamble
carried a `bibliography: { files, style }` whose `files` the parser always set to `[]` and
the emitter never read, and `BibliographyElement` — the thing that should own the files —
had no emitter at all, so one built by hand vanished with an `emit.unimplemented` warning.
The preamble now carries the style only; the element carries the files and prints where
the list should appear. `runBibtex` asks the BODY too, since a deck can have a `.bib` and
a references frame without a `\bibliographystyle` anywhere, and BibTeX needs three passes
to settle: one to write the `.aux`, bibtex, then two more for the labels to reach the
citations. Verified end to end against the engine — the PDF prints the entry, and the
citation renders as `[1]` rather than a bold `?`.

**A section owns the slides that follow it, and the list is flat.** `SectionNode` is a
SIBLING of `FrameNode` in `deck.nodes`, because that is how beamer reads the file — so
"the slides in this section" is a question about the span between two headings, and
`sectionSpan` answers it. A subsection does not end a section, it nests inside one, so the
span runs to the next heading of the same or a HIGHER rank. Moving a heading without its
span silently re-parents every slide it owned, and taking the nearest preceding heading as
the landing spot drops a section into the middle of its own subsection — both were caught
by `app/test/sections.spec.ts`. Deleting a section defaults to keeping its slides: losing
them to a mis-click is only noticed later.

**A listing's language must come from a fixed list, because a wrong one is fatal.**
`listings` answers `language=Nonesuch` with *Package Listings Error: Couldn't load
requested language* and produces no PDF — it does not fall back to no highlighting. So
`emit/lstLanguages.ts` holds the 53 languages the bundled TeX Live actually loads,
measured by compiling one probe each, and the picker offers exactly those. Nine common
ones are missing from `listings` altogether — JavaScript, TypeScript, Rust, Kotlin, JSON,
YAML, Lua, Makefile and Assembler — and seven of them are shipped as one-line
`\lstdefinelanguage` definitions instead. One line each, because `DERIVED_SETUP_LINES`
matches preamble lines by exact string.

**A listing is emitted with no indentation at all, and the newlines around it are
structural.** The lexer captures everything between `\begin{lstlisting}` and
`\end{lstlisting}`, so an indented `\end` puts its own leading spaces INSIDE the next
parse's body and the round trip stops being a fixpoint. The options are inside that body
too — `parseOpaqueEnvBody` starts it immediately after the `\begin{...}` group — so
splitting `[language=Python]` back off is the recognizer's real job. The newline either
side of the code is written by the emitter and stripped by the parser, so `code` in the
model is what the user typed and nothing more.

**`textContent` loses the line breaks in a contentEditable.** Pressing Enter inserts a
`<br>` or a `<div>`, and `textContent` skips both, so every newline the user typed in a
code block vanished and the lines ran together. `CodeView` sets
`contentEditable="plaintext-only"` so the browser inserts a literal `\n`, and reads back
`innerText`, which reports the RENDERED text — under `white-space: pre` that is exactly
the bytes. This does not apply to the rich-text elements: those go through
`readInlineFromDom`, which reassembles the model from tagged nodes.

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

Thirty-seven commits on `master`, ~21,600 lines across 119 source files, 306 tests passing.

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
- **Shape gallery and layouts**: 16 polygon shapes (triangle, diamond, pentagon through
  octagon, stars, trapezium, parallelogram, chevron, block arrow, cross, cylinder,
  document) drawn from `core/model/polygons.ts`, plus eight prebuilt layouts — the
  SmartArt equivalent — in `core/model/smartArt.ts`: process, chevron process, cycle,
  hierarchy, pyramid, matrix, overlapping circles, timeline. A layout expands to
  ordinary shapes, so every part stays editable
- **Import**: open an external `.tex` by button or by dropping it on the canvas. The
  dialog reports what became editable AND what stayed raw before replacing the open
  deck, checks the theme and every `\usepackage` against the bundled collections, and
  matches picked image files onto the paths the file references
- **Code blocks**: `listings`, `verbatim` and `minted`, typed in place on the canvas,
  with a measured language list, line numbers, a border and a caption. `[fragile]` is
  derived on the frame, and the languages `listings` does not ship are defined in the
  preamble
- **Math**: display equations (equation/align/gather and their starred forms, plus
  `\[ \]`), body kept verbatim, KaTeX preview on the canvas and in the inspector
- **Title page**: `\titlepage` and `\maketitle` render as a real title page on the canvas
  and in the thumbnails, from a per-theme measured layout; the presentation's title,
  subtitle, author, institute and date are edited in the format pane
- **Arrange**: a numeric Position and Size panel (X, Y, width, rotation in millimetres
  and degrees) and align-to-slide for any selected element
- **Formatting**: bold, italic, underline, monospace, small caps, alert, colour and
  size applied to the WORDS THAT ARE SELECTED, from Home > Font, with Ctrl+B/I/U; one
  font family for the deck on Design > Font, from eleven measured families; shape fill,
  outline, line style and width, corner radius, arrow curve and head, node shape, text
  colour, transparency, rotation and drop shadow; any colour at all through an RGB
  picker, not just the ten preset swatches; picture height, rotation, keep-aspect and
  transparency; table borders, row and cell shading, and banded rows
- **Direct manipulation**: every element -- text, list, block, columns, table, picture,
  equation, diagram, at any depth -- is selectable, draggable and resizable on the
  canvas. Dragging one out of the flow converts it to a free position at the place it
  was already drawn, and dragging one out of a block or a column lifts it onto the frame.
  Handles are a constant size on screen whatever the zoom, a drag survives the remount
  that lifting an element causes, and a whole gesture is one undo entry
- **The slide rail**: a listbox with arrow keys, a delete control on every slide, Delete
  to remove and Enter to insert; deleting the last slide replaces it with a blank one.
  A title slide can be added back after being deleted
- **Copy and paste**: copy, cut, paste and duplicate any element, with Ctrl+C/X/V/D or
  the ribbon, across slides. The clipboard holds the MODEL, and every id inside a copy is
  renewed — including the shape ids a diagram's arrows point at
- **Lock aspect ratio**: on by default, constraining CORNER drags, with Shift to invert
  it for one gesture
- **Charts**: pgfplots line, bar, horizontal-bar and scatter charts with a data grid
  that takes a paste from a spreadsheet or a `.csv`, per-series marker, dash and label,
  and axis labels, grid, legend and a log scale. Drawn on the canvas in SVG
- **Citations**: attach a `.bib`, pick an entry from the list and cite it into the
  selected text box, and insert a references slide. BibTeX runs in the bundled engine, so
  the compiled PDF has the real reference list
- **Sections and the outline**: section headings are created, renamed, reordered and
  deleted in the slide rail, where they group the slides they own; `\tableofcontents`
  is an element the canvas draws from those headings
- **Speaker notes**: a per-slide box under the canvas. `\note` round-trips as it always
  did, and the compiled PDF is unchanged — beamer hides notes unless the deck asks for
  them, which this does not
- **Themes**: 35 presentation themes, each verified to compile, with measured margins and
  measured colours (`themes/measured.ts`); XeLaTeX auto-selected for
  fontspec themes via a `% !TEX program` magic comment
- **Engine**: busytex WASM (TeX Live 2026), log parsing with diagnostics mapped back to
  slides and elements, overfull-box fidelity warnings
- **UI**: an Office-style shell — title bar, ribbon with Home/Insert/Design/View tabs
  and labelled command groups, slide-thumbnail rail, contextual format pane, status
  bar. Commands that CREATE live in the ribbon; the format pane holds only properties
  of what is selected. Plus resizable columns, LaTeX syntax highlighting, three-layer
  autosave with crash recovery and optional save-to-real-file, undo/redo

### Not done

Everything the user and I agreed on is now done. What is left is smaller, and none of it
has been asked for yet:

1. Rich text inside a diagram label, and multi-point polyline editing
2. `\citep`/`\citet`/`\autocite` — they need natbib or biblatex, and stay raw inline
   islands for now
3. Table row spans (`\multirow` is preserved on import but not modelled) and a per-table
   font size (the emitter deliberately warns and drops `TableElement.fontSize`)
4. Formatting a selection that spans TWO text boxes. `modelRangeFromSelection` returns
   `null` rather than clamping, because styling half of what looks selected is worse
   than doing nothing, and the controls disable. It needs one range per host and one
   `mutate`
5. beamer's other font themes (`structurebold` and the two structure-serif ones) have no
   UI. Design ▸ Font owns `Preamble.fontTheme` so it can pair `serif` with a serif
   family, and a second control would fight it for the same field

**Every `Element['kind']` now has an emitter, and TypeScript proves it**: the `default:`
arm of `emitElementBody` narrows `el` to `never`. Three kinds used to land there and emit
NOTHING — `toc`, `bibliography` and `chart` — so a modelled element simply disappeared
from the `.tex`. `code.spec.ts` keeps the regression test. If you add a kind, the compiler
will not complain; the test will.

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
- A chart on the canvas is a sketch of the real one: pgfplots chooses the ticks, the axis
  limits and the label placement, so the shape and the colours are right and the exact
  geometry is not. Unlike the rest of the canvas it has not been audited against the PDF
- Diagrams have no multi-point polyline editing after drawing, no grid
  snapping of shapes, and no rich text inside a label. A label's on-canvas box is
  estimated from its character count, so hit-testing a label is approximate — the
  compiled position is not. Internal diagram geometry was measured at **0.00mm** against
  the PDF; the picture's own placement on the slide is within about 1.4mm, the same
  vertical-centring approximation as text and tables
- Import understands the structure the app models; an unmodelled package lands as a raw
  block, editable only in the source panel. `\titlepage` is a raw block too, but the
  canvas draws it as a title page. A `\titlegraphic` survives
  as a preamble chunk, but its image file is not listed among the import's missing
  resources, so it has to be supplied by hand. A measured sample of an ordinary 8-slide deck came through with 5% raw. Import
  also reformats: indentation, package order and a few escapes (`\ ` gains a `{}`
  terminator) change, so the output is equivalent LaTeX rather than the original bytes
- `minted` needs shell escape, which the WASM engine cannot provide; preview falls back
  to `listings` with a warning
- The file picker, drag-drop and paste paths have not been exercised with a real mouse —
  only driven programmatically. Drawing, selecting, moving, resizing, deleting a slide,
  formatting a selection and the transparency slider all HAVE been, after a layer that
  swallowed every click went unnoticed for exactly this reason
- A package the parser read from a file comes back as a USER package, with no `derived`
  flag, so a derived one that has already round-tripped is never dropped again: make a
  transparent picture opaque after reopening the deck and its `\usepackage{tikz}` stays.
  Harmless — an unused package — and fixing it risks deleting a package the user wrote
  by hand for their own raw TikZ
