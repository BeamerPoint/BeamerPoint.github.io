import { richTextToPlain, type ListElement } from '@beamerpoint/core';
import { useStore } from '../state/store.js';

/**
 * Overlays for a bullet list.
 *
 * Beamer's overlay specs are written verbatim — `<2->`, `<1,3>`, `<+->` — because the
 * syntax is richer than anything worth modelling and a deck that already uses one has to
 * survive untouched. The field takes what the user types; the store adds the angle
 * brackets if they are missing, since a spec without them does not compile.
 *
 * "Reveal one at a time" is the pattern people actually want and the one that is tedious
 * to type: `<1->`, `<2->`, `<3->`. Measured against the engine — three bullets specced
 * that way compile to three pages.
 */
export function ListEditor({
  el, slideId, locked,
}: {
  el: ListElement;
  slideId: string;
  locked: boolean;
}): React.ReactElement {
  const setListItemOverlay = useStore((s) => s.setListItemOverlay);
  const revealListOneByOne = useStore((s) => s.revealListOneByOne);

  const stepped = el.items.length > 1
    && el.items.every((it, i) => it.overlay === `<${i + 1}->`);
  const anyOverlay = el.items.some((it) => it.overlay !== undefined);

  return (
    <section className="bp-format-section">
      <h4>Overlays</h4>

      <label className="bp-field bp-field-inline">
        <input
          type="checkbox"
          disabled={locked || el.items.length === 0}
          checked={stepped}
          onChange={(e) => revealListOneByOne(slideId, el.id, e.target.checked)}
        />
        <span>Reveal one at a time</span>
      </label>

      <div className="bp-num-grid">
        {el.items.map((item, i) => (
          <label className="bp-field bp-field-num" key={item.id}>
            <span title={richTextToPlain(item.content)}>
              {i + 1}. {richTextToPlain(item.content).slice(0, 14) || '(empty)'}
            </span>
            <input
              type="text"
              placeholder="always"
              disabled={locked}
              value={item.overlay ?? ''}
              onChange={(e) => setListItemOverlay(
                slideId, el.id, item.id, e.target.value === '' ? null : e.target.value,
              )}
            />
          </label>
        ))}
      </div>

      <p className="bp-hint">
        {anyOverlay
          ? 'Each bullet appears on the overlays its spec names. The canvas shows them '
            + 'all at once — compile to step through.'
          : 'A spec like 2- shows that bullet from the second overlay onwards.'}
      </p>
    </section>
  );
}
