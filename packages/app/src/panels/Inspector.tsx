import {
  THEME_IDS,
  isApproximateTheme,
  richTextToPlain,
  themeNeedsUnicodeEngine,
  type AspectRatio,
  type TexProgram,
} from '@beamerpoint/core';
import { selectCurrentFrame, useStore } from '../state/store.js';

const ASPECTS: AspectRatio[] = ['169', '43', '1610', '32'];
const PROGRAMS: TexProgram[] = ['pdflatex', 'xelatex', 'lualatex'];

/** Properties for the current slide and the deck as a whole. */
export function Inspector(): React.ReactElement {
  const deck = useStore((s) => s.deck);
  const frame = useStore(selectCurrentFrame);
  const locked = useStore((s) => s.source.status !== 'synced');
  const setSlideTitle = useStore((s) => s.setSlideTitle);
  const setTheme = useStore((s) => s.setTheme);
  const setAspect = useStore((s) => s.setAspect);
  const setTexProgram = useStore((s) => s.setTexProgram);
  const addTextElement = useStore((s) => s.addTextElement);
  const addListElement = useStore((s) => s.addListElement);
  const addBlockElement = useStore((s) => s.addBlockElement);
  const addColumnsElement = useStore((s) => s.addColumnsElement);
  const deleteElement = useStore((s) => s.deleteElement);
  const selection = useStore((s) => s.selection);

  return (
    <aside className="bp-inspector">
      <section>
        <h4>Slide</h4>
        <label>
          Title
          <input
            type="text"
            disabled={locked || frame === undefined}
            value={frame?.title ? richTextToPlain(frame.title) : ''}
            onChange={(e) => frame && setSlideTitle(frame.id, e.target.value)}
          />
        </label>
        <div className="bp-btn-row">
          <button disabled={locked || !frame} onClick={() => frame && addTextElement(frame.id)}>
            + Text
          </button>
          <button disabled={locked || !frame} onClick={() => frame && addListElement(frame.id)}>
            + Bullets
          </button>
        </div>
        <div className="bp-btn-row">
          <button
            disabled={locked || !frame}
            title="A highlighted box, the most recognisable Beamer element"
            onClick={() => frame && addBlockElement(frame.id, 'block')}
          >
            + Block
          </button>
          <button
            disabled={locked || !frame}
            title="Two side-by-side columns"
            onClick={() => frame && addColumnsElement(frame.id)}
          >
            + Columns
          </button>
        </div>
        <div className="bp-btn-row">
          <button
            disabled={locked || !frame}
            onClick={() => frame && addBlockElement(frame.id, 'alertblock')}
          >
            + Alert
          </button>
          <button
            disabled={locked || !frame}
            onClick={() => frame && addBlockElement(frame.id, 'exampleblock')}
          >
            + Example
          </button>
        </div>
        {selection.elementId !== null && frame !== undefined && (
          <button
            className="bp-danger"
            disabled={locked}
            onClick={() => deleteElement(frame.id, selection.elementId!)}
          >
            Delete selected element
          </button>
        )}
      </section>

      <section>
        <h4>Presentation</h4>
        <label>
          Theme
          <select
            disabled={locked}
            value={deck.preamble.theme.name}
            onChange={(e) => setTheme(e.target.value)}
          >
            {THEME_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <label>
          Compile with
          <select
            disabled={locked}
            value={deck.preamble.texProgram ?? 'pdflatex'}
            onChange={(e) => setTexProgram(e.target.value as TexProgram)}
          >
            {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        {themeNeedsUnicodeEngine(deck.preamble.theme.name)
          && (deck.preamble.texProgram ?? 'pdflatex') === 'pdflatex' && (
          <p className="bp-hint bp-hint-warn">
            {deck.preamble.theme.name} needs XeLaTeX or LuaLaTeX for its fonts. Under
            pdfLaTeX it compiles, but falls back to Computer Modern and will not look
            like the theme.
          </p>
        )}
        {isApproximateTheme(deck.preamble.theme.name) && (
          <p className="bp-hint">
            The canvas shows a generic approximation of this theme. Compile to see it
            properly.
          </p>
        )}
        <label>
          Aspect ratio
          <select
            disabled={locked}
            value={deck.preamble.documentClass.aspectRatio}
            onChange={(e) => setAspect(e.target.value as AspectRatio)}
          >
            {ASPECTS.map((a) => (
              <option key={a} value={a}>
                {a === '169' ? '16:9' : a === '43' ? '4:3' : a === '1610' ? '16:10' : '3:2'}
              </option>
            ))}
          </select>
        </label>
      </section>
    </aside>
  );
}
