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

Not yet implemented: tables, images, math elements, code blocks, TikZ shapes, pgfplots
charts, citations, and drag-to-position. The model, emitter and type system already
account for all of them.

Overlays/animations (`\pause`, `\onslide`, `<2->`) are deliberately out of scope for v1,
but they are **preserved on import** — the model carries `overlay` on elements, frames and
list items, so opening an animated deck does not destroy it.
