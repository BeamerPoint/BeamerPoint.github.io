import { PAPER, type Element } from '@beamerpoint/core';
import { measuredRects, useStore } from '../state/store.js';

/**
 * Position, size, rotation and alignment for the selected element.
 *
 * PowerPoint's "Position and Size" and "Arrange" groups, as far as LaTeX can honestly
 * carry them. Numbers here are millimetres on the slide, the same units the model
 * stores and `textpos` emits, so nothing is converted on the way through.
 *
 * Setting any of them places the element freely, because these ARE free-position
 * properties: an element in the text flow is positioned by beamer, and pretending
 * otherwise would put a number in the panel that the PDF ignores.
 */

type Align = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom';

const ALIGNMENTS: readonly { key: Align; label: string; title: string }[] = [
  { key: 'left', label: '⇤', title: 'Align left edge with the slide' },
  { key: 'centre', label: '↔', title: 'Centre horizontally on the slide' },
  { key: 'right', label: '⇥', title: 'Align right edge with the slide' },
  { key: 'top', label: '⇡', title: 'Align top edge with the slide' },
  { key: 'middle', label: '↕', title: 'Centre vertically on the slide' },
  { key: 'bottom', label: '⇣', title: 'Align bottom edge with the slide' },
];

interface Props {
  el: Element;
  slideId: string;
  locked: boolean;
}

export function ArrangePane({ el, slideId, locked }: Props): React.ReactElement {
  const aspect = useStore((s) => s.deck.preamble.documentClass.aspectRatio);
  const setElementBox = useStore((s) => s.setElementBox);
  const setElementRotate = useStore((s) => s.setElementRotate);
  const returnElementToFlow = useStore((s) => s.returnElementToFlow);

  const paper = PAPER[aspect];
  const rect = measuredRects.get(el.id);
  const abs = el.placement.mode === 'absolute' ? el.placement : null;

  // Millimetres to show: the model's own numbers when it has them, otherwise where the
  // canvas last drew it, which is exactly what freeing it would use.
  const x = abs?.x ?? rect?.x ?? 0;
  const y = abs?.y ?? rect?.y ?? 0;
  const w = abs?.w ?? rect?.w ?? 0;
  const h = rect?.h ?? 0;
  const rotate = abs?.rotate ?? 0;

  const align = (how: Align): void => {
    switch (how) {
      case 'left': return setElementBox(slideId, el.id, { x: 0 });
      case 'centre': return setElementBox(slideId, el.id, { x: (paper.w - w) / 2 });
      case 'right': return setElementBox(slideId, el.id, { x: paper.w - w });
      case 'top': return setElementBox(slideId, el.id, { y: 0 });
      case 'middle': return setElementBox(slideId, el.id, { y: (paper.h - h) / 2 });
      case 'bottom': return setElementBox(slideId, el.id, { y: paper.h - h });
    }
  };

  const num = (
    label: string, value: number, onSet: (v: number) => void, step = 1,
  ): React.ReactElement => (
    <label className="bp-field bp-field-num">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        disabled={locked}
        value={Math.round(value * 10) / 10}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onSet(v);
        }}
      />
    </label>
  );

  return (
    <section className="bp-format-section">
      <h4>Position and size</h4>

      <div className="bp-num-grid">
        {num('X (mm)', x, (v) => setElementBox(slideId, el.id, { x: v }))}
        {num('Y (mm)', y, (v) => setElementBox(slideId, el.id, { y: v }))}
        {num('Width (mm)', w, (v) => setElementBox(slideId, el.id, { w: v }))}
        {num('Rotation (°)', rotate, (v) => setElementRotate(slideId, el.id, v), 5)}
      </div>

      <p className="bp-hint">
        {abs === null
          ? `Placed by beamer, drawn at ${Math.round(x)}, ${Math.round(y)} mm. `
            + 'Changing any of these places it freely.'
          : `Height follows the content: ${Math.round(h)} mm as drawn.`}
      </p>

      <div className="bp-field">
        <span>Align to slide</span>
        <div className="bp-seg bp-seg-align">
          {ALIGNMENTS.map((a) => (
            <button
              key={a.key}
              type="button"
              disabled={locked}
              title={a.title}
              onClick={() => align(a.key)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {abs !== null && (
        <button
          className="bp-wide"
          disabled={locked}
          title="Let beamer position this again"
          onClick={() => returnElementToFlow(slideId, el.id)}
        >
          Return to text flow
        </button>
      )}
    </section>
  );
}
