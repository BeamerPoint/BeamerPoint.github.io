import {
  isApproximateTheme,
  richTextToPlain,
  themeNeedsUnicodeEngine,
  themeUnavailableReason,
  type Element,
} from '@beamerpoint/core';
import { selectCurrentFrame, useStore } from '../state/store.js';
import { MathEditor } from './MathEditor.js';
import { TableEditor } from './TableEditor.js';
import { ShapeEditor } from './ShapeEditor.js';

const KIND_NAME: Partial<Record<Element['kind'], string>> = {
  text: 'Text', list: 'List', block: 'Block', columns: 'Columns', image: 'Picture',
  table: 'Table', math: 'Equation', tikz: 'Diagram', code: 'Code', raw: 'Raw LaTeX',
};

/**
 * The format pane.
 *
 * Properties of what is selected, and nothing else. Commands that CREATE things live
 * in the ribbon — mixing "insert a table" in with "this table's column alignment" is
 * what made the old panel an undifferentiated wall of buttons.
 */
export function FormatPane(): React.ReactElement {
  const deck = useStore((s) => s.deck);
  const frame = useStore(selectCurrentFrame);
  const locked = useStore((s) => s.source.status !== 'synced');
  const selection = useStore((s) => s.selection);

  const setSlideTitle = useStore((s) => s.setSlideTitle);
  const setImageWidth = useStore((s) => s.setImageWidth);
  const setImageCaption = useStore((s) => s.setImageCaption);
  const setImageAlign = useStore((s) => s.setImageAlign);
  const setImageTrim = useStore((s) => s.setImageTrim);
  const overlayMode = useStore((s) => s.overlayMode);
  const setOverlayMode = useStore((s) => s.setOverlayMode);
  const returnElementToFlow = useStore((s) => s.returnElementToFlow);

  const selected = frame?.children.find((e) => e.id === selection.elementId);
  const themeName = deck.preamble.theme.name;
  const themeMissing = themeUnavailableReason(themeName);
  const needsUnicode = themeNeedsUnicodeEngine(themeName)
    && (deck.preamble.texProgram ?? 'pdflatex') === 'pdflatex';

  return (
    <aside className="bp-format">
      <div className="bp-pane-head">
        <span>{selected === undefined ? 'Slide' : `Format ${KIND_NAME[selected.kind] ?? selected.kind}`}</span>
      </div>

      <div className="bp-format-body">
        {(themeMissing !== undefined || needsUnicode || isApproximateTheme(themeName)) && (
          <div className="bp-notices">
            {themeMissing !== undefined && (
              <p className="bp-hint bp-hint-warn">
                <strong>{themeName}</strong> needs <code>{themeMissing}</code>, which is
                not bundled. Pick another theme on the Design tab, or compile elsewhere.
              </p>
            )}
            {needsUnicode && (
              <p className="bp-hint bp-hint-warn">
                {themeName} needs XeLaTeX or LuaLaTeX for its fonts. Under pdfLaTeX it
                compiles, but falls back to Computer Modern.
              </p>
            )}
            {isApproximateTheme(themeName) && (
              <p className="bp-hint">
                The canvas approximates this theme. Compile to see it properly.
              </p>
            )}
          </div>
        )}

        <section className="bp-format-section">
          <label className="bp-field">
            <span>Slide title</span>
            <input
              type="text"
              placeholder="Untitled slide"
              disabled={locked || frame === undefined}
              value={frame?.title ? richTextToPlain(frame.title) : ''}
              onChange={(e) => frame && setSlideTitle(frame.id, e.target.value)}
            />
          </label>
        </section>

        {selected === undefined && (
          <p className="bp-empty-hint">
            Select something on the slide to format it, or use the Insert tab to add
            something new.
          </p>
        )}

        {selected?.kind === 'math' && frame !== undefined && (
          <MathEditor el={selected} slideId={frame.id} locked={locked} />
        )}

        {selected?.kind === 'table' && frame !== undefined && (
          <TableEditor el={selected} slideId={frame.id} locked={locked} />
        )}

        {selected?.kind === 'tikz' && frame !== undefined && (
          <ShapeEditor el={selected} slideId={frame.id} locked={locked} />
        )}

        {selected?.kind === 'image' && frame !== undefined && (
          <section className="bp-format-section">
            <h4>Picture</h4>
            <label className="bp-field">
              <span>Width — {Math.round((selected.width?.v ?? 0.6) * 100)}% of text width</span>
              <input
                type="range" min={5} max={100} step={5}
                disabled={locked}
                value={Math.round((selected.width?.v ?? 0.6) * 100)}
                onChange={(e) => setImageWidth(frame.id, selected.id, Number(e.target.value) / 100)}
              />
            </label>

            <div className="bp-field">
              <span>Align</span>
              <div className="bp-seg">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button
                    key={a}
                    disabled={locked || selected.placement.mode === 'absolute'}
                    className={selected.align === a ? 'is-active' : ''}
                    title={selected.placement.mode === 'absolute'
                      ? 'Alignment does not apply to a freely positioned picture'
                      : `Align ${a}`}
                    onClick={() => setImageAlign(frame.id, selected.id, a)}
                  >
                    {a === 'left' ? 'Left' : a === 'center' ? 'Centre' : 'Right'}
                  </button>
                ))}
              </div>
            </div>

            <div className="bp-btn-row">
              <button
                disabled={locked}
                className={overlayMode === 'crop' ? 'is-active' : ''}
                title="Drag the edge handles on the canvas to crop"
                onClick={() => setOverlayMode(overlayMode === 'crop' ? 'transform' : 'crop')}
              >
                {overlayMode === 'crop' ? 'Done cropping' : 'Crop'}
              </button>
              <button
                disabled={locked || selected.trim === undefined}
                onClick={() => setImageTrim(frame.id, selected.id, null)}
              >
                Reset crop
              </button>
            </div>

            {selected.placement.mode === 'absolute' && (
              <button
                className="bp-wide"
                disabled={locked}
                title="Put the picture back into the text flow"
                onClick={() => returnElementToFlow(frame.id, selected.id)}
              >
                Return to text flow
              </button>
            )}

            <label className="bp-field">
              <span>Caption</span>
              <input
                type="text"
                placeholder="none"
                disabled={locked}
                value={selected.caption ? richTextToPlain(selected.caption) : ''}
                onChange={(e) => setImageCaption(frame.id, selected.id, e.target.value || null)}
              />
            </label>
          </section>
        )}

        {selected !== undefined && selected.placement.mode === 'absolute'
          && selected.kind !== 'image' && frame !== undefined && (
          <section className="bp-format-section">
            <h4>Position</h4>
            <p className="bp-hint">
              Freely placed at {Math.round(selected.placement.x)},{' '}
              {Math.round(selected.placement.y)} mm.
            </p>
            <button
              className="bp-wide"
              disabled={locked}
              onClick={() => returnElementToFlow(frame.id, selected.id)}
            >
              Return to text flow
            </button>
          </section>
        )}
      </div>
    </aside>
  );
}
