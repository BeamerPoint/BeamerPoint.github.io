import {
  resolveTheme,
  richTextToPlain,
  type Color,
  type ThemeSpec,
  type TikzElement,
  type TikzShape,
} from '@beamerpoint/core';
import { useStore } from '../state/store.js';
import { colorToCss } from '../canvas/shapeColors.js';

interface Props {
  el: TikzElement;
  slideId: string;
  locked: boolean;
}

/**
 * The palette a shape's colours come from.
 *
 * Deliberately short, and built from theme-relative and mixed colours rather than raw
 * RGB: those are the ones that stay legible when the deck's theme changes, and they
 * are also the ones that survive the round trip as readable LaTeX.
 */
const SWATCHES: Array<{ label: string; color: Color | undefined }> = [
  { label: 'None', color: undefined },
  { label: 'Theme', color: { k: 'structure' } },
  { label: 'Theme 20%', color: { k: 'structure', shade: 20 } },
  { label: 'Black', color: { k: 'named', name: 'black' } },
  { label: 'Grey', color: { k: 'named', name: 'gray' } },
  { label: 'White', color: { k: 'named', name: 'white' } },
  { label: 'Blue 20%', color: { k: 'mix', expr: 'blue!20' } },
  { label: 'Red 20%', color: { k: 'mix', expr: 'red!20' } },
  { label: 'Green 20%', color: { k: 'mix', expr: 'green!20' } },
  { label: 'Orange', color: { k: 'named', name: 'orange' } },
];

function sameColor(a: Color | undefined, b: Color | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function describe(s: TikzShape): string {
  switch (s.t) {
    case 'rect': return s.rx === undefined ? 'Rectangle' : 'Rounded rectangle';
    case 'ellipse': return 'Ellipse';
    case 'path': return s.closed ? 'Polygon' : 'Line';
    case 'arrow': return 'Arrow';
    case 'node': return 'Label';
  }
}

/** Drawing tools and per-shape styling for the selected diagram. */
export function ShapeEditor({ el, slideId, locked }: Props): React.ReactElement {
  const tool = useStore((s) => s.shapeTool);
  const setShapeTool = useStore((s) => s.setShapeTool);
  const shapeId = useStore((s) => s.selection.shapeId ?? null);
  const deleteShape = useStore((s) => s.deleteShape);
  const restyleShape = useStore((s) => s.restyleShape);
  const reorderShape = useStore((s) => s.reorderShape);
  const setShapeArrowHead = useStore((s) => s.setShapeArrowHead);
  const setShapeText = useStore((s) => s.setShapeText);
  const setTikzCanvasSize = useStore((s) => s.setTikzCanvasSize);
  const themeName = useStore((s) => s.deck.preamble.theme.name);
  const theme = resolveTheme(themeName);

  if (el.mode === 'raw') {
    return (
      <div className="bp-shape-props">
        <h4>Diagram</h4>
        <p className="bp-hint">
          This picture was hand-written, so it is kept exactly as it is. Edit it in the
          LaTeX source panel.
        </p>
      </div>
    );
  }

  const shapes = el.shapes ?? [];
  const selected = shapes.find((s) => s.id === shapeId);

  return (
    <div className="bp-shape-props">
      <h4>Diagram</h4>

      {/*
        * No tool strip here: the full gallery lives on the Insert tab, and a second,
        * shorter list of shapes in the side pane would silently offer fewer of them.
        */}
      <div className="bp-field-row">
        <span className="bp-field-label">
          {tool === null
            ? 'Insert ▸ Shapes to pick a shape, then drag on the slide'
            : 'Drag on the slide to draw'}
        </span>
        {tool !== null && (
          <button className="bp-wide" onClick={() => setShapeTool(null)}>
            Stop drawing
          </button>
        )}
      </div>

      <div className="bp-field-row">
        <span className="bp-field-label">Canvas size</span>
        <div className="bp-size-row">
          <input
            type="number" min={10} max={300} step={5} disabled={locked}
            value={el.canvasSize.w}
            onChange={(e) =>
              setTikzCanvasSize(slideId, el.id, Number(e.target.value), el.canvasSize.h)}
          />
          <span>×</span>
          <input
            type="number" min={10} max={200} step={5} disabled={locked}
            value={el.canvasSize.h}
            onChange={(e) =>
              setTikzCanvasSize(slideId, el.id, el.canvasSize.w, Number(e.target.value))}
          />
          <span>mm</span>
        </div>
      </div>

      {selected === undefined ? (
        <p className="bp-hint">
          {shapes.length === 0
            ? 'Nothing drawn yet.'
            : 'Click a shape on the slide to style it.'}
        </p>
      ) : (
        <>
          <div className="bp-field-row">
            <span className="bp-field-label">{describe(selected)}</span>
            <div className="bp-btn-row">
              <button
                disabled={locked}
                title="Bring forward"
                onClick={() => reorderShape(slideId, el.id, selected.id, 1)}
              >
                Forward
              </button>
              <button
                disabled={locked}
                title="Send backward"
                onClick={() => reorderShape(slideId, el.id, selected.id, -1)}
              >
                Back
              </button>
              <button
                className="bp-danger"
                disabled={locked}
                onClick={() => deleteShape(slideId, el.id, selected.id)}
              >
                Delete
              </button>
            </div>
          </div>

          {selected.t === 'node' && (
            <label>
              Text
              <input
                type="text"
                disabled={locked}
                value={richTextToPlain(selected.content)}
                onChange={(e) => setShapeText(slideId, el.id, selected.id, e.target.value)}
              />
            </label>
          )}

          {selected.t === 'arrow' && (
            <div className="bp-field-row">
              <span className="bp-field-label">Arrowhead</span>
              <div className="bp-btn-row">
                {([
                  ['latex', 'Solid'], ['stealth', 'Sharp'], ['to', 'Thin'], ['none', 'None'],
                ] as const).map(([v, label]) => (
                  <button
                    key={v}
                    className={selected.head === v ? 'is-active' : ''}
                    disabled={locked}
                    onClick={() => setShapeArrowHead(slideId, el.id, selected.id, v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <SwatchRow
            label="Line"
            current={selected.style.draw}
            theme={theme}
            disabled={locked}
            onPick={(c) => restyleShape(slideId, el.id, selected.id, { draw: c })}
          />
          {selected.t !== 'arrow' && (
            <SwatchRow
              label="Fill"
              current={selected.style.fill}
              theme={theme}
              disabled={locked}
              onPick={(c) => restyleShape(slideId, el.id, selected.id, { fill: c })}
            />
          )}

          <div className="bp-field-row">
            <span className="bp-field-label">Line style</span>
            <div className="bp-btn-row">
              {([
                [undefined, 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'],
              ] as const).map(([v, label]) => (
                <button
                  key={label}
                  className={selected.style.dash === v ? 'is-active' : ''}
                  disabled={locked}
                  onClick={() => restyleShape(slideId, el.id, selected.id, { dash: v })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label>
            Line width ({selected.style.lineWidth?.v ?? 0.4}mm)
            <input
              type="range" min={0.2} max={2} step={0.2}
              disabled={locked}
              value={selected.style.lineWidth?.v ?? 0.4}
              onChange={(e) => restyleShape(slideId, el.id, selected.id, {
                lineWidth: { v: Number(e.target.value), u: 'mm' },
              })}
            />
          </label>
        </>
      )}
    </div>
  );
}

function SwatchRow({
  label, current, theme, disabled, onPick,
}: {
  label: string;
  current: Color | undefined;
  theme: ThemeSpec;
  disabled: boolean;
  onPick(c: Color | undefined): void;
}): React.ReactElement {
  return (
    <div className="bp-field-row">
      <span className="bp-field-label">{label}</span>
      <div className="bp-swatches">
        {SWATCHES.map((s) => (
          <button
            key={s.label}
            title={s.label}
            className={`bp-swatch${sameColor(current, s.color) ? ' is-active' : ''}${
              s.color === undefined ? ' is-none' : ''}`}
            style={{ background: colorToCss(s.color, theme, 'transparent') }}
            disabled={disabled}
            onClick={() => onPick(s.color)}
          />
        ))}
      </div>
    </div>
  );
}
