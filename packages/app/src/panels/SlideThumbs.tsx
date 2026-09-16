import { PAPER, PX_PER_MM, resolveTheme, richTextToPlain, type Deck, type FrameNode } from '@beamerpoint/core';
import { selectFrames, useStore } from '../state/store.js';
import { InlineText } from '../canvas/InlineText.js';

/** Thumbnail width in CSS pixels. The height follows the deck's aspect ratio. */
const THUMB_W = 150;

/**
 * A miniature of one slide.
 *
 * Deliberately NOT the real canvas scaled down. The real canvas carries
 * contentEditable regions, pointer handlers and SVG hit-testing, and rendering one per
 * slide would put a dozen editable surfaces on screen competing for focus. This draws
 * the furniture that identifies a slide at 150px — background, title bar, and blocked-in
 * content — which is all a thumbnail can usefully show anyway.
 */
function Thumb({ deck, frame }: { deck: Deck; frame: FrameNode }): React.ReactElement {
  const theme = resolveTheme(deck.preamble.theme.name);
  const paper = PAPER[deck.preamble.documentClass.aspectRatio];
  const scale = THUMB_W / (paper.w * PX_PER_MM);
  const hasTitle = frame.title !== undefined && !frame.options.plain;

  return (
    <div
      className="bp-thumb-paper"
      style={{
        width: THUMB_W,
        height: paper.h * PX_PER_MM * scale,
        background: theme.background,
        color: theme.foreground,
      }}
    >
      <div
        className="bp-thumb-inner"
        style={{
          width: paper.w * PX_PER_MM,
          height: paper.h * PX_PER_MM,
          transform: `scale(${scale})`,
          fontSize: deck.preamble.documentClass.fontSize * (PX_PER_MM / 2.845),
          fontFamily: theme.fontFamily === 'serif'
            ? 'Latin Modern Roman, Georgia, serif'
            : 'Latin Modern Sans, Segoe UI, system-ui, sans-serif',
        }}
      >
        {theme.headline.kind === 'miniframes' && !frame.options.plain && (
          <div
            className="bp-thumb-headline"
            style={{
              height: theme.headline.heightMm * PX_PER_MM,
              background: theme.headline.bg,
            }}
          />
        )}
        {hasTitle && (
          <div
            className="bp-thumb-title"
            style={{
              color: theme.frametitle.fg,
              background: theme.frametitle.bg ?? 'transparent',
              padding: `${theme.frametitle.paddingMm.y * PX_PER_MM}px `
                + `${(theme.frametitle.paddingMm.x || theme.margins.hMm) * PX_PER_MM}px`,
              fontWeight: theme.frametitle.bold ? 700 : 400,
            }}
          >
            <InlineText content={frame.title!} />
          </div>
        )}
        <div
          className="bp-thumb-body"
          style={{ padding: `0 ${theme.margins.hMm * PX_PER_MM}px` }}
        >
          {frame.children.slice(0, 7).map((el) => (
            <ThumbBlock key={el.id} el={el} accent={theme.structure} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** One element, blocked in. Shapes, not content: at this size text is unreadable. */
function ThumbBlock({
  el, accent,
}: { el: FrameNode['children'][number]; accent: string }): React.ReactElement {
  switch (el.kind) {
    case 'list':
      return (
        <div className="bp-thumb-lines">
          {el.items.slice(0, 5).map((it) => (
            <div key={it.id} className="bp-thumb-line">
              <span className="bp-thumb-bullet" style={{ background: accent }} />
              <span className="bp-thumb-bar" style={{ width: `${45 + (it.id.charCodeAt(0) % 40)}%` }} />
            </div>
          ))}
        </div>
      );
    case 'image':
      return <div className="bp-thumb-image" />;
    case 'table':
      return <div className="bp-thumb-table" />;
    case 'tikz':
      return <div className="bp-thumb-diagram" style={{ borderColor: accent }} />;
    case 'math':
      return <div className="bp-thumb-math" style={{ color: accent }}>∑</div>;
    case 'block':
      return <div className="bp-thumb-block" style={{ borderTopColor: accent }} />;
    case 'columns':
      return (
        <div className="bp-thumb-cols">
          {el.columns.map((c) => <div key={c.id} className="bp-thumb-col" />)}
        </div>
      );
    default:
      return (
        <div className="bp-thumb-lines">
          <span className="bp-thumb-bar" style={{ width: '92%' }} />
          <span className="bp-thumb-bar" style={{ width: '74%' }} />
        </div>
      );
  }
}

/** The slide sorter: navigation, reordering, and per-slide compile status. */
export function SlideThumbs(): React.ReactElement {
  const deck = useStore((s) => s.deck);
  const frames = useStore(selectFrames);
  const selectedId = useStore((s) => s.selection.slideId);
  const locked = useStore((s) => s.source.status !== 'synced');
  const selectSlide = useStore((s) => s.selectSlide);
  const addSlide = useStore((s) => s.addSlide);
  const result = useStore((s) => s.engine.result);

  const bad = (severity: string): Set<string> => new Set(
    (result?.diagnostics ?? [])
      .filter((d) => d.severity === severity && d.frameId !== undefined)
      .map((d) => d.frameId!),
  );
  const errorFrames = bad('error');
  const fidelityFrames = bad('fidelity');

  return (
    <aside className="bp-slides">
      <div className="bp-pane-head">
        <span>Slides</span>
        <span className="bp-pane-count">{frames.length}</span>
      </div>

      <ol className="bp-thumb-list">
        {frames.map((f, i) => {
          const title = f.title ? richTextToPlain(f.title) : 'Untitled slide';
          const hasError = errorFrames.has(f.id);
          return (
            <li key={f.id}>
              <button
                className={`bp-thumb${f.id === selectedId ? ' is-selected' : ''}`}
                onClick={() => selectSlide(f.id)}
                title={title}
              >
                <span className="bp-thumb-num">{i + 1}</span>
                <span className="bp-thumb-frame">
                  <Thumb deck={deck} frame={f} />
                  {hasError && <span className="bp-thumb-badge is-error" title="Compile error" />}
                  {!hasError && fidelityFrames.has(f.id) && (
                    <span className="bp-thumb-badge is-warn" title="Content overflows in the real output" />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <button className="bp-slides-add" disabled={locked} onClick={addSlide}>
        + New slide
      </button>
    </aside>
  );
}
