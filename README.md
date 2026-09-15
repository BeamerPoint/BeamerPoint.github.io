# BeamerPoint

A browser-based, PowerPoint-like editor for Beamer presentations. Edit slides on a visual
canvas, read and edit the generated LaTeX in the same window, and compile to a real PDF
without installing a TeX distribution.

## What makes it different

The LaTeX source is a **first-class, editable view**, not a one-way export. Canvas edits
appear in the source; source edits come back to the canvas. Anything BeamerPoint does not
understand is preserved byte-for-byte rather than dropped.

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

To enable real PDF compilation (optional — everything else works without it):

```bash
npm run engine:install
```

This downloads TeX Live 2026 compiled to WebAssembly into `packages/app/public/core/`.
It is roughly **540 MB**, because Beamer lives in TeX Live's *extra* collection and needs
basic + recommended + extra. It is a one-time download, cached in the browser afterwards.

## Layout

```
packages/
  core/     Document model, LaTeX emitter, LaTeX parser, themes. Pure TS, no DOM.
  engine/   LatexEngine abstraction + the WASM (busytex) backend + log parsing.
  app/      React UI: canvas, slide sorter, source editor, PDF preview, inspector.
```

`core` has no DOM dependency and is fully unit-testable in Node, which is what lets the
round-trip property tests run fast and headless.

## How the round trip works

Three stages, and the third is the one that matters:

1. **A total CST build** (`parse/lexer.ts`). Never throws, never loses bytes. Malformed
   input becomes an `error` node rather than an exception. Verbatim environments
   (`lstlisting`, `verbatim`, `minted`) are captured opaquely so a `%` or `{` inside a
   code listing is treated as content, not markup.

2. **All-or-nothing recognizers** (`parse/recognizers/`). A recognizer that meets
   anything it cannot model returns `null` and declines, rather than returning a
   partially-populated element. Declined regions become `RawElement`s holding the exact
   source bytes.

3. **The round-trip guard** (`parse/guard.ts`). Every parsed element is re-emitted and
   compared against the source it came from, as a whitespace-insensitive token stream
   (verbatim bodies, math and comments compared byte-exact). Anything that does not match
   is demoted to a raw block. Frames are checked independently, so a mismatch is always
   localised.

Together these make "the parser silently ate a macro" structurally unreachable: it
surfaces as a visible raw block with a stated reason instead of missing content.

Element identity is **not** stored in the `.tex`. `parse/reid.ts` re-derives ids after
every reparse by matching structurally-similar nodes, so editing the source does not
scramble the user's selection or fragment undo history.

### Why not marker comments?

An earlier design anchored the round trip with `%%BP` comments. It was rejected: a marker
asserting `kind=table` still leaves the bytes between the markers to be read, so you write
the full recognizer anyway *and* inherit a marker/content consistency failure mode.
Markers also print literally inside `lstlisting`, break under copy-paste (duplicate ids),
add hundreds of comment lines to a deck, and do nothing for pasted external `.tex`.

## The canvas/source lock

The canvas and the source editor are **never both writable**. Typing in the editor moves
the document to `dirty` and makes the canvas read-only until the change is applied or
reverted. There is no merge path, because a merge is exactly where hand-written LaTeX gets
silently clobbered.

Auto-apply fires after 800 ms idle, but only when the text is structurally healthy —
balanced groups and environments, no parse errors, and no increase in raw blocks. A
half-typed `\begin{` therefore never flips the deck to raw.

## Editing on the canvas

Text is edited in place with `contentEditable`, but the content is **not** read back as
plain text. Every inline node is tagged with its index when rendered, and
`readInlineFromDom` walks the DOM to reassemble the model, carrying untouched nodes over
by reference. Nodes that render as something other than their own source — inline math,
symbols, citations, preserved raw LaTeX — are marked `contenteditable="false"` so a caret
cannot get inside them; they can be deleted wholesale but not corrupted halfway.

This matters more than it sounds. Reading `textContent` and rebuilding with a single
plain run silently removes bold, replaces inline math with its rendered glyphs, and
re-escapes a preserved macro such as `\vspace{2mm}` into `\textbackslash{}vspace\{2mm\}`
— which then prints as visible characters in the compiled PDF. That is regression-tested
in `packages/app/test/inlineEditing.spec.tsx`.

## Themes and the TeX engine

The theme dropdown offers ~39 presentation themes, all of which ship with TeX Live and
compile as-is — the theme only reaches the document as `\usetheme{Name}`. The canvas
approximation is a separate concern, derived from a shape declared in
`themes/catalogue.ts` (headline style, footline style, structure colour), with
hand-tuned overrides for a few. Adding a theme is one line in the catalogue.

Some themes — metropolis and moloch — are built on `fontspec` and only render as
designed under **XeLaTeX or LuaLaTeX**. Under pdfLaTeX they still compile, but silently
fall back to Computer Modern, which does not look like the theme at all and reads as
"the theme is broken". Selecting one of these switches the engine automatically, and the
choice is recorded in the file as a `% !TEX program = xelatex` magic comment — the
convention Overleaf, TeXShop and TeXstudio already understand, so an exported deck keeps
working outside BeamerPoint.

XeLaTeX is noticeably slower than pdfLaTeX (roughly 18s versus 3s for a small deck),
because it runs a `dvipdfmx` pass on top of TeX.

## Images

Insert with the **+ Image** button, by dragging a file onto the slide, or by pasting.
Bytes are stored in IndexedDB keyed by resource id; the document holds the id and the
project-relative path, so renaming a file touches one place.

Two things happen at import time rather than at compile time, because that is where
they can still be explained:

- **Formats pdfLaTeX cannot embed are rasterised.** It accepts PNG, JPEG and PDF and
  nothing else, so an SVG or WebP would otherwise fail with "Unknown graphics
  extension" and no indication why. They are converted to PNG and the UI says so.
- **Filenames are sanitised.** Spaces and punctuation are legal in a filename and a
  reliable way to break `\includegraphics`.

Selecting an image gives drag handles on the canvas:

- **Resize** from any corner. In the flow this sets width as a fraction of the text
  column; when absolutely placed it sets a real length.
- **Drag to move**, which lifts the image out of the text flow into `textpos`
  absolute placement, starting from wherever it was already drawn so it does not
  jump. *Return to text flow* puts it back, and the `textpos` package disappears from
  the preamble by itself, because packages are derived from content.
- **Align** left, centre or right, emitted as the matching alignment environment.
  Disabled while absolutely placed, where it would have nothing to act on.
- **Crop**, dragging the edge handles. Stored as big points and emitted as
  `trim=... ,clip`.

Crop is absolute rather than fractional for a reason: graphicx rejects `\width`
inside `trim` (it fails with *File ended while scanning use of \Gread@parse@vp*),
verified against the engine. Storing the units LaTeX consumes also keeps the round
trip exact, with no rounding drift. For images with no embedded resolution — every
screenshot, every plot, everything BeamerPoint rasterises itself — one big point is
one pixel, so the handles map directly onto the image.

A deck with images exports as a **zip** containing `main.tex` and every file it
references — a bare `.tex` pointing at `images/plot.png` is not self-contained. Decks
with no images still export as a plain `.tex`. If a referenced file was never stored
here (common after pasting someone else's source) the archive includes a
`MISSING-FILES.txt` listing what to add, rather than silently producing a project that
will not build.

## Saving

Three layers, because each fails differently:

1. **IndexedDB** holds the structured deck. Survives a reload; lost if site data is
   cleared; invisible to other programs.
2. **localStorage** holds the emitted `.tex`, written **synchronously**. This is the
   layer that actually survives an abrupt tab close: an async IndexedDB write started
   during `pagehide` is not guaranteed to finish, a synchronous one is. On the next
   launch, if this mirror is ahead of the stored deck, the app offers to recover it
   rather than silently choosing — either choice would discard someone's work.
3. **A real file on disk**, via the File System Access API (Chromium only). The only
   layer that produces something another program can open. Click **Save to file...**
   once; after that every autosave writes straight to that `.tex`.

Saves are debounced 800ms, and flushed on `pagehide` and on the tab being hidden.
A stored file handle does not keep write permission across a reload, so the indicator
offers to reconnect.

## Canvas fidelity

The canvas targets roughly 80% visual accuracy and says so in the UI. It will diverge from
the real PDF in line breaking (TeX optimises paragraphs globally and hyphenates; browsers
do not), vertical glue distribution, display-math spacing, and tabular column widths.

The mitigation is not pixel-chasing: it is keeping **Compile** one keystroke away, and
mapping `Overfull \hbox` warnings from the compile log back to the offending element, so
the canvas can tell you when it is lying.

## Testing

```bash
npm test
```

The most valuable test is the fixpoint property: `emit(parse(emit(deck))) === emit(deck)`.
If that ever fails, the visual editor and the source view disagree about what the document
is. The lexer is also property-tested for totality and for span coverage — every byte of
any input string must be covered by exactly one top-level node.

## Status

M1 (the end-to-end vertical slice) is complete: create a deck, edit text and lists on the
canvas, see the generated `.tex`, hand-edit that `.tex`, have it parse back to the canvas,
and compile to a real Beamer PDF.

Authorable element types: text, bullet and numbered lists, Beamer blocks
(`block` / `alertblock` / `exampleblock`), and two-column layouts.

Not yet implemented: tables, images, math elements, code blocks, TikZ shapes, pgfplots
charts, citations, and drag-to-position. The model, emitter and type system already
account for all of them.

Overlays/animations (`\pause`, `\onslide`, `<2->`) are deliberately out of scope for v1,
but they are **preserved on import** — the model carries `overlay` on elements, frames and
list items, so opening an animated deck does not destroy it.
