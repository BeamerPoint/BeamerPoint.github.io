import {
  PAPER, PX_PER_MM, resolveTheme, richTextToPlain,
  type Deck, type FrameNode, type SectionNode,
} from '@beamerpoint/core';
import { useEffect, useRef } from 'react';
import { selectFrames, selectOutline, useStore } from '../state/store.js';
import { useSlideReorder } from './useSlideReorder.js';
import { InlineText } from '../canvas/InlineText.js';
import { TitlePage, isTitlePageTex } from '../canvas/TitlePage.js';

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
  // The miniature is drawn at full slide size and then scaled, so the real title page
  // renders here unchanged -- a title slide's thumbnail is the thing it identifies.
  const titlePages = frame.children.filter((el) => el.kind === 'raw' && isTitlePageTex(el.tex));

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
          position: 'relative',
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
          {frame.children
            .filter((el) => !titlePages.some((t) => t.id === el.id))
            .slice(0, 7)
            .map((el) => (
              <ThumbBlock key={el.id} el={el} accent={theme.structure} />
            ))}
        </div>
        {titlePages.length > 0 && (
          <TitlePage deck={deck} theme={theme} showPlaceholders={false} />
        )}
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
    case 'code':
      return <div className="bp-thumb-code" style={{ borderLeftColor: accent }} />;
    case 'toc':
      return <div className="bp-thumb-toc" />;
    case 'bibliography':
      return <div className="bp-thumb-toc" />;
    case 'chart':
      return <div className="bp-thumb-chart" style={{ borderColor: accent }} />;
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

/**
 * A section heading in the rail.
 *
 * Sections were emitted, parsed and completely invisible: the rail filtered the deck down
 * to frames, so the only outline-like surface in the app hid the outline. The title is
 * typed in place here, which is the whole authoring UI a `\section` needs.
 */
function SectionRow({
  node, locked, dropBefore,
}: { node: SectionNode; locked: boolean; dropBefore: boolean }): React.ReactElement {
  const setSectionTitle = useStore((s) => s.setSectionTitle);
  const deleteSection = useStore((s) => s.deleteSection);
  const moveSection = useStore((s) => s.moveSection);

  return (
    <li
      className={`bp-section-row bp-section-${node.level}${dropBefore ? ' is-drop-target' : ''}`}
      data-node-id={node.id}
    >
      <input
        className="bp-section-title"
        value={richTextToPlain(node.title)}
        disabled={locked}
        placeholder="Section"
        onChange={(e) => setSectionTitle(node.id, e.target.value)}
      />
      <span className="bp-section-tools">
        <button
          disabled={locked}
          title="Move this section and its slides up"
          onClick={() => moveSection(node.id, -1)}
        >
          ↑
        </button>
        <button
          disabled={locked}
          title="Move this section and its slides down"
          onClick={() => moveSection(node.id, 1)}
        >
          ↓
        </button>
        {/* Deleting the heading keeps the slides: losing them to a mis-click is the
            kind of thing you only notice later. */}
        <button
          disabled={locked}
          title="Remove the heading; the slides stay"
          onClick={() => deleteSection(node.id, true)}
        >
          ×
        </button>
      </span>
    </li>
  );
}

/**
 * The slide sorter: navigation, reordering, and per-slide compile status.
 *
 * A real listbox, because it is one. It used to be a list of buttons with no delete
 * control at ALL — section rows had up, down and a cross, and a slide had nothing, so
 * the only way to remove one was the ribbon — and no keyboard beyond Tab, because the
 * app's single key handler returned early unless Ctrl or Meta was held.
 */
export function SlideThumbs(): React.ReactElement {
  const deck = useStore((s) => s.deck);
  const frames = useStore(selectFrames);
  const outline = useStore(selectOutline);
  const selectedId = useStore((s) => s.selection.slideId);
  const locked = useStore((s) => s.source.status !== 'synced');
  const selectSlide = useStore((s) => s.selectSlide);
  const addSlide = useStore((s) => s.addSlide);
  const addSection = useStore((s) => s.addSection);
  const deleteSlide = useStore((s) => s.deleteSlide);
  const result = useStore((s) => s.engine.result);
  const listRef = useRef<HTMLOListElement>(null);
  const reorder = useSlideReorder(listRef);
  /** Set by the rail's own actions, so focus comes back after the list re-renders. */
  const refocus = useRef(false);

  // Follow the selection, wherever it was changed from -- the ribbon's next/previous,
  // a compile error jumping to its slide, undo. A selected thumbnail off-screen looks
  // exactly like no selection at all.
  useEffect(() => {
    const thumb = listRef.current?.querySelector<HTMLElement>('.bp-thumb.is-selected');
    thumb?.scrollIntoView({ block: 'nearest' });
    // Deleting a slide unmounts the button that had the focus, which drops focus to
    // the body -- so the FIRST Delete worked and every key after it went nowhere.
    // Measured with real keystrokes; the store was right the whole time.
    if (refocus.current) {
      refocus.current = false;
      thumb?.focus();
    }
  }, [selectedId]);

  /**
   * Arrow keys move the selection; Delete removes a slide; Enter inserts one.
   *
   * On the list rather than on each thumbnail, so it works wherever focus is inside the
   * rail, and `isTypingTarget`-style guarding is unnecessary here because a section
   * row's title input stops these keys itself.
   */
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement) return;
    if (locked || selectedId === null) return;
    const at = frames.findIndex((f) => f.id === selectedId);

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const next = frames[at + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next === undefined) return;
      e.preventDefault();
      selectSlide(next.id);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      refocus.current = true;
      // Stop the window handler acting on it too: from here Delete always means the
      // slide, even when something on it happens to be selected.
      e.stopPropagation();
      deleteSlide(selectedId);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      refocus.current = true;
      addSlide();
    }
  };

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

      <ol
        className="bp-thumb-list"
        ref={listRef}
        role="listbox"
        aria-label="Slides"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {outline.map((node) => {
          if (node.kind === 'section') {
            return (
              <SectionRow
                key={node.id}
                node={node}
                locked={locked}
                dropBefore={reorder.dropBeforeId === node.id}
              />
            );
          }
          const f = node;
          const i = frames.indexOf(f);
          const title = f.title ? richTextToPlain(f.title) : 'Untitled slide';
          const hasError = errorFrames.has(f.id);
          const selected = f.id === selectedId;
          const classes = [
            'bp-thumb-row',
            reorder.draggingId === f.id ? 'is-dragging' : '',
            reorder.dropBeforeId === f.id ? 'is-drop-target' : '',
          ].filter(Boolean).join(' ');
          return (
            <li key={f.id} className={classes} data-node-id={f.id}>
              <button
                className={`bp-thumb${selected ? ' is-selected' : ''}`}
                // Press and move to reorder; press and release still selects. The
                // threshold is in the hook, so a click is never mistaken for a drag.
                onPointerDown={(e) => reorder.onPointerDown(e, f.id)}
                // Roving tabIndex: one stop for the whole rail, then the arrow keys.
                tabIndex={selected ? 0 : -1}
                role="option"
                aria-selected={selected}
                onClick={() => { if (!reorder.consumeClick()) selectSlide(f.id); }}
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
              {/* The same cross a section row has had all along. Deleting the LAST
                  slide replaces it with a blank one rather than leaving an empty deck,
                  so this is never disabled for want of somewhere to land. */}
              <button
                className="bp-thumb-delete"
                disabled={locked}
                title={`Delete slide ${i + 1}`}
                aria-label={`Delete slide ${i + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  // Keep the keyboard in the rail: this button is about to unmount.
                  refocus.current = true;
                  deleteSlide(f.id);
                }}
              >
                ×
              </button>
            </li>
          );
        })}
        {/* The drop indicator has nowhere to sit when the slide is going to the very
            end, so the list carries one last row for it. */}
        {reorder.active && (
          <li
            className={`bp-drop-end${reorder.dropBeforeId === null ? ' is-drop-target' : ''}`}
            aria-hidden="true"
          />
        )}
      </ol>

      <div className="bp-slides-add-row">
        <button className="bp-slides-add" disabled={locked} onClick={addSlide}>
          + New slide
        </button>
        <button
          className="bp-slides-add"
          disabled={locked}
          title="A \section heading, which beamer shows in the outline and in the theme's navigation"
          onClick={() => addSection()}
        >
          + Section
        </button>
      </div>
    </aside>
  );
}
