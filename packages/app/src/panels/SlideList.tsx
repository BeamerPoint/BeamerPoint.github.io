import { richTextToPlain } from '@beamerpoint/core';
import { selectFrames, useStore } from '../state/store.js';

/** The slide sorter: navigation plus reordering, with compile errors surfaced per slide. */
export function SlideList(): React.ReactElement {
  const frames = useStore(selectFrames);
  const selectedId = useStore((s) => s.selection.slideId);
  const locked = useStore((s) => s.source.status !== 'synced');
  const selectSlide = useStore((s) => s.selectSlide);
  const addSlide = useStore((s) => s.addSlide);
  const deleteSlide = useStore((s) => s.deleteSlide);
  const moveSlide = useStore((s) => s.moveSlide);
  const result = useStore((s) => s.engine.result);

  const errorFrames = new Set(
    (result?.diagnostics ?? [])
      .filter((d) => d.severity === 'error' && d.frameId !== undefined)
      .map((d) => d.frameId!),
  );
  const fidelityFrames = new Set(
    (result?.diagnostics ?? [])
      .filter((d) => d.severity === 'fidelity' && d.frameId !== undefined)
      .map((d) => d.frameId!),
  );

  return (
    <aside className="bp-slidelist">
      <div className="bp-slidelist-head">
        <span>Slides</span>
        <button onClick={addSlide} disabled={locked} title="Add slide">+</button>
      </div>
      <ol>
        {frames.map((f, i) => {
          const title = f.title ? richTextToPlain(f.title) : '(no title)';
          return (
            <li
              key={f.id}
              className={f.id === selectedId ? 'is-selected' : ''}
              onClick={() => selectSlide(f.id)}
            >
              <span className="bp-slide-num">{i + 1}</span>
              <span className="bp-slide-title">{title}</span>
              {errorFrames.has(f.id) && <span className="bp-dot bp-dot-error" title="Compile error" />}
              {!errorFrames.has(f.id) && fidelityFrames.has(f.id) && (
                <span className="bp-dot bp-dot-warn" title="Content overflows in the real output" />
              )}
              <span className="bp-slide-actions">
                <button
                  disabled={locked}
                  title="Move up"
                  onClick={(e) => { e.stopPropagation(); moveSlide(f.id, -1); }}
                >
                  ↑
                </button>
                <button
                  disabled={locked}
                  title="Move down"
                  onClick={(e) => { e.stopPropagation(); moveSlide(f.id, 1); }}
                >
                  ↓
                </button>
                <button
                  disabled={locked || frames.length <= 1}
                  title="Delete slide"
                  onClick={(e) => { e.stopPropagation(); deleteSlide(f.id); }}
                >
                  ×
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
