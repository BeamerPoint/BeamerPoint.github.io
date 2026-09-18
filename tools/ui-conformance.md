# UI conformance — driven with the mouse

Stage 4 of the September 2026 audit (`tools/audit-2026-09.md`). The standing rule in this
repo is that **driving the store is not driving the UI**: a store call skips hit-testing,
stacking order, focus and pointer capture, which is where this class of bug lives. So
every row below was done in the browser pane with real pointer and keyboard events, and
only the RESULT was read back from the store or the DOM.

Re-run it after any change to a panel, the ribbon or the canvas. Add a row per control.

## Environment notes

- **The pane must be painting.** The browser pane stops painting when the app window is
  behind another window; mouse input then fails with "could not get the tab ready", and
  `requestAnimationFrame` never fires — so pdf.js renders no pages ("0 pages"), with no
  error. That is the environment, not the app: a screenshot forces a paint and the pages
  appear. Bring the tab forward (`tabs_select`) before a run.
- **The OS file dialog cannot be driven.** The file picker, "Attach .bib" and "Save as…"
  open it; everything after it is the shared `addImageFiles` / import path, which the drop
  and paste rows exercise.
- A native `<select>` cannot be opened by a synthetic click; set it with `form_input`,
  which fires the same `change` event the panel listens for.
- **Ctrl+A does not select through this automation.** The keydown arrives but the editing
  command is not executed — verified on a bare page with no app code, so it is the driver,
  not BeamerPoint. Select text with a triple-click or a drag instead, or a caret-placed
  typing test will look like the app inserted text in the wrong place.
- A diagram's drawing surface is its canvas size, not its element box: a flow diagram's
  box spans the text column, but only the SVG inside it draws. Aim inside the SVG.

## Results

| Surface | Control | Gesture | Expected | Observed | Verdict |
| --- | --- | --- | --- | --- | --- |
| App start | Crash recovery | Reload with no edits | No banner | "Unsaved changes were found" on every load; Discard does not clear it | **F-016** |
| Home ▸ Content | Code | Click | Code block on the slide, Code panel opens | As expected | Pass |
| Code panel | Typeset with → minted | Select | Warns that minted cannot compile here | Warning shown under the picker | Pass |
| PDF tab | Compile after a minted block | Click | A clear failure, no stale PDF | Raw `Cannot read properties of null (reading 'slice')` above the PREVIOUS PDF's pages | **F-008** |
| Log tab | Diagnostics list | Open after a failed compile | Each problem once | Every item twice; status bar says "5 errors"; one message swallows TeX's help text and memory statistics | **F-013** |
| Design | Presentation theme → Warsaw | Select | Canvas, thumbnails, status bar and source change | All four changed | Pass |
| Design | Slide size → 4:3 | Click | Paper 4:3, `aspectratio=43` | Paper 1.333, source correct | Pass |
| Design | Font family → Palatino | Select | Source and canvas change | Source correct (`mathpazo` + `\usefonttheme{serif}`); canvas stays Latin Modern Sans | **F-017** |
| Design | Font family → Theme default | Select | Package and font theme removed | Both removed | Pass |
| Presentation | Date field (`\today`) | Click, type | Appends to the date | Field is empty with `\today` as placeholder; typing replaces the date | **F-018** |
| Presentation | Author (`Alice \and Bob`) | Click, End, type " Jr." | Keeps two authors | `\and` destroyed: one author "Alice Smith Bob Jones Jr." | **F-018** |
| View | Rulers | Click | Top and left rulers | Both drawn, outside the page | Pass |
| View | Gridlines | Click | Grid over the page | 27 lines drawn | Pass |
| View | Guide | Click the top ruler | A vertical guide at that x | Guide created; Clear guides enabled | Pass |
| View | Guide | Drag it | Guide follows | Moved 250 → 300 | Pass |
| View | Guide | Double-click it | Guide removed | Removed | Pass |
