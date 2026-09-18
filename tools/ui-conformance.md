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
- **End and Home do not move the caret either**, for the same reason: verified on a bare
  `<input>` with no app code. Place the caret with `setSelectionRange` and then type with
  real keys, or the text lands wherever the click left the caret.
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
| Insert | Table | Click, then click a header cell and type | Header text is edited | Header row lies under the selection's move band; typing goes nowhere | **F-019** |
| Canvas | Table cell | Select another element, click a cell, type | Cell edited, commits on blur | Typed at the caret; committed to the source on blur | Pass |
| Canvas | Text box | Click into a selected one-line text box | Caret placed | Whole box covered by the N and S move bands | **F-019** |
| Canvas | Grey stage around the slide | Click | Deselects | Selection unchanged | Note (part of F-019's way out) |
| Insert | Equation | Click, then type in the Math panel | Source and KaTeX update | Both updated, no KaTeX error | Pass |
| Insert | Shapes ▸ right triangle | Pick, drag inside the drawing surface | A triangle is drawn | Three-point path, `\draw … -- cycle` | Pass |
| Insert | Layouts ▸ Cycle | Pick, type labels, Insert | Diagram of ordinary shapes | Modal closed, labels in the source | Pass |
| Insert | Chart | Click | Chart and its editor | Line chart with legend and axis | Pass |
| Chart panel | Data cell | Triple-click, type 9, Tab | Value changes, stays numeric | 3 → 9, numeric, source updated | Pass |
| Chart panel | Bars | Click | Bar chart | `ybar` in the source, 10 bars drawn | Pass |
| Chart panel | + Row | Click | An empty row that still compiles | Row of empty cells; the deck compiles | Pass |
| Source panel | Type a balanced edit | Keyboard in CodeMirror | Canvas locks; auto-applies after 800 ms | Locked (opacity 0.55, no pointer events, status-bar notice), then applied | Pass |
| Source panel | Auto-apply of an end-of-line comment | Pause after typing | Comment stays where typed | Moved to its own line after `\date` | **F-021** |
| Source panel | Revert | Unbalanced edit, click Revert | Edit discarded, canvas unlocked | Discarded in the model and the editor; unlocked | Pass |
| Slide rail | + Section | Click | A heading before the slide | `\section{New section}` | Pass |
| Slide rail | Rename a section | Triple-click, type, Enter | Renamed; Enter does not add a slide | `\section{Results}`, still two frames | Pass |
| Notes | Type a note | Open, click, type `100% & …` | `\note` with escaped specials | `\note{Mention 100\% \& the caveat}` | Pass |
| Canvas | Drop a PNG | Drag-and-drop event with a real file | Picture on the slide, file registered | Inserted; name sanitised to `probe-photo.png`; 320×160 recorded; overlay cleared | Pass |
| Picture panel | Crop | Click Crop, drag the east edge | Edge on the picture, crop follows the pointer | Edge floats ~200 px off the picture and does not move; crop is ~1/3.4 of the drag | **F-022** |
| Whole app | Window 800 px wide | Resize | Usable layout | Page scrolls sideways; only 32 px of the format pane visible | **F-020** |

Earlier in the session, and not repeated here: slide-rail drag reordering, Delete and Enter in the rail, element resize and move at every depth, lock aspect, copy/cut/paste/duplicate with a real clipboard, drop of a `.tex` into the import dialog, the transparency slider, attaching a `.bib` and citing from it, the table header-row checkbox and the chart's per-series `×`.
