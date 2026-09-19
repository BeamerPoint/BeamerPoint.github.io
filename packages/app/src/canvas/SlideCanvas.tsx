/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { useLayoutEffect, useRef, useState } from 'react';
import type { ImageTrim, RichText } from '@beamerpoint/core';
import {
  PAPER,
  canvasFontStack,
  PX_PER_MM,
  resolveTheme,
  richTextToPlain,
  type Deck,
  type FrameNode,
} from '@beamerpoint/core';
import { ElementView } from './ElementView.js';
import { CanvasContext } from './CanvasContext.js';
import { Gridlines, Guides, Rulers, RULER_PX, type AidSettings } from './CanvasAids.js';
import type { OverlayMode } from './SelectionOverlay.js';
import { InlineText } from './InlineText.js';
import { TitlePage, displayDate, isTitlePageTex } from './TitlePage.js';

interface Props {
  deck: Deck;
  frame: FrameNode | undefined;
  frameNumber: number;
  selectedElementId: string | null;
  locked: boolean;
  onSelectElement(id: string | null): void;
  onEditContent(elementId: string, content: RichText): void;
  onEditItem(elementId: string, itemId: string, content: RichText): void;
  onEditCell(elementId: string, rowId: string, cellId: string, content: RichText): void;
  onEditCode(elementId: string, code: string): void;
  overlayMode: OverlayMode;
  aids: AidSettings;
  onAddGuide(axis: 'v' | 'h', mm: number): void;
  onMoveGuide(axis: 'v' | 'h', index: number, mm: number): void;
  onRemoveGuide(axis: 'v' | 'h', index: number): void;
  onResizeImage(elementId: string, deltaMm: number, deltaFraction: number): void;
  onResizeElement(
    elementId: string, dxMm: number, dyMm: number,
    grip: import('../state/store.js').ResizeGrip, shift: boolean,
  ): void;
  onMoveElement(elementId: string, dxMm: number, dyMm: number): void;
  onTrimImage(elementId: string, trim: ImageTrim): void;
  /** Bracket a pointer drag, so the whole gesture is one undo entry. */
  onDragStart(): void;
  onDragEnd(): void;
}

/**
 * The slide surface.
 *
 * The paper is rendered at a fixed design resolution (PX_PER_MM design pixels per
 * millimetre) and then CSS-scaled to fit its container. Keeping the design resolution
 * constant across aspect ratios mirrors Beamer, where 11pt is 11pt whether the page is
 * 128mm or 160mm wide — only the page changes size.
 */
export function SlideCanvas(props: Props): React.ReactElement {
  const { deck, frame, frameNumber, selectedElementId, locked, onSelectElement } = props;

  const theme = resolveTheme(deck.preamble.theme.name);
  const paper = PAPER[deck.preamble.documentClass.aspectRatio];
  const designW = paper.w * PX_PER_MM;
  const designH = paper.h * PX_PER_MM;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // Read inside the observer without making it a dependency.
  const aidsRef = useRef(props.aids.rulers);
  aidsRef.current = props.aids.rulers;

  useLayoutEffect(() => {
    const node = wrapRef.current;
    if (node === null) return;
    const update = (): void => {
      const gutter = 32 + (aidsRef.current ? RULER_PX * 2 : 0);
      const avail = node.clientWidth - gutter;
      const availH = node.clientHeight - gutter;
      setScale(Math.max(0.1, Math.min(avail / designW, availH / designH)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [designW, designH, props.aids.rulers]);

  if (frame === undefined) {
    return <div className="bp-canvas-wrap bp-empty">No slide selected</div>;
  }

  const hasFrametitle = frame.title !== undefined && !frame.options.plain;

  /**
   * The sidebar's width, or 0 when this theme has none.
   *
   * Width and side are measured (see `SIDEBARS` in core's `themes.ts`) — the canvas used
   * to put all five sidebars on the left at the width of the text margin, and Goettingen
   * and Marburg carry theirs on the right.
   */
  const sidebarMm = theme.headline.kind === 'bar' && !frame.options.plain
    ? theme.headline.widthMm ?? theme.margins.hMm
    : 0;
  const sidebarSide = theme.headline.side ?? 'left';

  /**
   * Title pages are lifted out of the flow: their layout is measured in page
   * coordinates, so they are drawn on the absolute layer rather than in .bp-body.
   */
  const titlePages = frame.children.filter(
    (el) => el.kind === 'raw' && isTitlePageTex(el.tex),
  );
  const isTitlePage = (el: { id: string }): boolean =>
    titlePages.some((t) => t.id === el.id);

  /** Design millimetres: the canvas grid, not CSS physical millimetres. */
  const mm = (n: number): string => `${n * PX_PER_MM}px`;

  const geometry = {
    scale,
    pxPerMm: PX_PER_MM,
    bodyWidthMm: paper.w - 2 * theme.margins.hMm,
  };

  return (
    <CanvasContext.Provider value={geometry}>
    <div
      className="bp-canvas-wrap"
      ref={wrapRef}
      // The grey around the slide deselects, as it does in any editor. Before, the only
      // way out of a selection was to select something ELSE -- and a selected text box's
      // own interior was under its move bands (F-019). The backdrop only: a press on the
      // rulers adds a guide and must not also drop the selection.
      onMouseDown={(e) => {
        const t = e.target as HTMLElement;
        if (t === e.currentTarget || t.classList.contains('bp-stage')) onSelectElement(null);
      }}
    >
      {/*
        * The stage carries the scale and does NOT clip; the paper inside it does clip,
        * because slide content must not spill past the page edge. The rulers live on
        * the stage: they sit just outside the page, so when they were inside the paper
        * its `overflow: hidden` ate them and they never appeared at all.
        */}
      <div
        className="bp-stage"
        style={{
          width: designW,
          height: designH,
          transform: `scale(${scale})`,
          // The inverse of the scale, for anything that must stay a constant size on
          // SCREEN rather than on the slide. Read by the aids; the selection handles
          // compute their own from the same number.
          ['--bp-inv' as string]: 1 / Math.max(scale, 0.01),
        }}
      >
      <Rulers
        aspect={deck.preamble.documentClass.aspectRatio}
        aids={props.aids}
        onAddGuide={props.onAddGuide}
      />
      {/*
        * Say WHY nothing responds.
        *
        * The canvas and the source editor are never both writable, so an edited source
        * takes an exclusive lock -- and until now the canvas just greyed out and
        * stopped accepting clicks, with the explanation on the other side of the
        * window. Dragging a handle that does nothing reads as a broken handle.
        */}
      {locked && (
        <div className="bp-lock-note">
          The source is being edited. Apply or revert it to edit the slide again.
        </div>
      )}
      <div
        className={`bp-paper${locked ? ' is-locked' : ''}`}
        style={{
          width: designW,
          height: designH,
          background: theme.background,
          color: theme.foreground,
          fontFamily: canvasFontStack(deck.preamble, theme.fontFamily === 'serif'),
          fontSize: deck.preamble.documentClass.fontSize * (PX_PER_MM / 2.845),
        }}
        onMouseDown={() => onSelectElement(null)}
      >
        <Gridlines aspect={deck.preamble.documentClass.aspectRatio} aids={props.aids} />

        {theme.headline.kind === 'miniframes' && !frame.options.plain && (
          <div
            className="bp-headline"
            style={{
              height: mm(theme.headline.heightMm),
              background: theme.headline.bg,
              color: theme.headline.fg,
            }}
          >
            {sectionTitles(deck).map((t, i) => (
              <span key={i} className="bp-headline-section">{t}</span>
            ))}
          </div>
        )}

        {/*
          * The sidebar themes reserve horizontal space and used to draw nothing in it —
          * `headlineFor` produced a 'bar' headline that no branch ever rendered, so
          * Berkeley, PaloAlto, Goettingen, Marburg and Hannover showed a blank strip.
          * A real sidebar is vertical, and its width is the measured text margin.
          */}
        {sidebarMm > 0 && (
          <div
            className={`bp-sidebar bp-sidebar-${sidebarSide}`}
            style={{
              width: mm(sidebarMm),
              background: theme.headline.bg,
              color: theme.headline.fg,
            }}
          >
            {sectionTitles(deck).map((t, i) => (
              <span key={i} className="bp-sidebar-section">{t}</span>
            ))}
          </div>
        )}

        {hasFrametitle && (
          <div
            className="bp-frametitle"
            style={{
              color: theme.frametitle.fg,
              background: theme.frametitle.bg ?? 'transparent',
              // A sidebar theme's frame title has to start clear of the sidebar;
              // otherwise the title runs underneath it, which is how Berkeley's read
              // "ne title bar".
              paddingTop: mm(theme.frametitle.paddingMm.y),
              paddingBottom: mm(theme.frametitle.paddingMm.y),
              paddingLeft: mm(Math.max(
                theme.frametitle.paddingMm.x || theme.margins.hMm,
                sidebarSide === 'left' && sidebarMm > 0 ? sidebarMm + 1.5 : 0,
              )),
              paddingRight: mm(Math.max(
                theme.frametitle.paddingMm.x || theme.margins.hMm,
                sidebarSide === 'right' && sidebarMm > 0 ? sidebarMm + 1.5 : 0,
              )),
              fontWeight: theme.frametitle.bold ? 700 : 400,
              textAlign: theme.frametitle.align,
            }}
          >
            <InlineText content={frame.title!} />
            {frame.subtitle !== undefined && (
              <div className="bp-framesubtitle">
                <InlineText content={frame.subtitle} />
              </div>
            )}
          </div>
        )}

        {/*
          * Beamer centres frame content vertically unless the frame or the class is
          * top-aligned. Top-aligning here put every element up to 17mm above where it
          * lands in the PDF -- nearly a fifth of the slide height.
          */}
        <div
          className="bp-body"
          style={{
            ...(theme.textBox !== undefined
              ? {
                  position: 'absolute' as const,
                  left: 0,
                  right: 0,
                  top: mm(theme.textBox.topMm),
                  bottom: mm(theme.textBox.bottomInsetMm),
                  paddingTop: 0,
                  paddingBottom: 0,
                }
              : {
                  paddingTop: mm(theme.margins.topMm),
                  paddingBottom: mm(theme.margins.bottomMm),
                }),
            // Frame content stops at the sidebar, on whichever side the theme puts it.
            paddingLeft: mm(theme.margins.hMm + (sidebarSide === 'left' ? sidebarMm : 0)),
            paddingRight: mm(theme.margins.hMm + (sidebarSide === 'right' ? sidebarMm : 0)),
            justifyContent:
              frame.options.vAlign === 't' || deck.preamble.documentClass.t
                ? 'flex-start'
                : frame.options.vAlign === 'b' ? 'flex-end' : 'center',
          }}
        >
          {frame.children
            .filter((el) => el.placement.mode === 'flow' && !isTitlePage(el))
            .map((el) => (
            <ElementView
              key={el.id}
              el={el}
              deck={deck}
              theme={theme}
              resources={deck.resources}
              locked={locked}
              selectedId={selectedElementId}
              onSelect={onSelectElement}
              onEditContent={props.onEditContent}
              onEditItem={props.onEditItem}
              onEditCell={props.onEditCell}
              onEditCode={props.onEditCode}
              overlayMode={props.overlayMode}
              onResizeImage={props.onResizeImage}
              onResizeElement={props.onResizeElement}
              onMoveElement={props.onMoveElement}
              onTrimImage={props.onTrimImage}
              onDragStart={props.onDragStart}
              onDragEnd={props.onDragEnd}
            />
          ))}
        </div>

        {/*
          * Absolutely-placed elements are positioned from the page corner, matching
          * textpos with \textblockorigin{0mm}{0mm}. They cannot live inside .bp-body,
          * which is inset by the margins, sits below the frame title, and clips.
          */}
        <div className="bp-abs-layer">
          {/*
            * A title page is drawn in PAGE coordinates, because that is what its layout
            * was measured in, so it belongs on this layer rather than inside .bp-body —
            * which is inset by the margins and centres its content vertically.
            */}
          {titlePages.map((el) => (
            <div
              key={el.id}
              className={`bp-el bp-el-titlepage${el.id === selectedElementId ? ' is-selected' : ''}`}
              data-element-id={el.id}
              onMouseDown={(e) => { e.stopPropagation(); onSelectElement(el.id); }}
            >
              <TitlePage deck={deck} theme={theme} showPlaceholders />
            </div>
          ))}
          {frame.children.filter((el) => el.placement.mode === 'absolute').map((el) => (
            <ElementView
              key={el.id}
              el={el}
              deck={deck}
              theme={theme}
              resources={deck.resources}
              locked={locked}
              selectedId={selectedElementId}
              onSelect={onSelectElement}
              onEditContent={props.onEditContent}
              onEditItem={props.onEditItem}
              onEditCell={props.onEditCell}
              onEditCode={props.onEditCode}
              overlayMode={props.overlayMode}
              onResizeImage={props.onResizeImage}
              onResizeElement={props.onResizeElement}
              onMoveElement={props.onMoveElement}
              onTrimImage={props.onTrimImage}
              onDragStart={props.onDragStart}
              onDragEnd={props.onDragEnd}
            />
          ))}
        </div>

        <Guides
          aids={props.aids}
          onMoveGuide={props.onMoveGuide}
          onRemoveGuide={props.onRemoveGuide}
        />

        {theme.footline.cells.length > 0 && !frame.options.plain && (
          <div className="bp-footline" style={{ height: mm(theme.footline.heightMm) }}>
            {theme.footline.cells.map((cell, i) => (
              <div
                key={i}
                className="bp-footcell"
                style={{ flex: cell.flex, background: cell.bg, color: cell.fg }}
              >
                {footContent(cell.content, deck, frameNumber)}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
    </CanvasContext.Provider>
  );
}

function sectionTitles(deck: Deck): string[] {
  return deck.nodes
    .filter((n) => n.kind === 'section')
    .map((n) => (n.kind === 'section' ? richTextToPlain(n.title) : ''));
}

function footContent(
  content: string,
  deck: Deck,
  frameNumber: number,
): string {
  const m = deck.meta;
  switch (content) {
    case 'author': return m.author ? richTextToPlain(m.author) : '';
    case 'institute': return m.institute ? richTextToPlain(m.institute) : '';
    case 'title': return m.title ? richTextToPlain(m.title) : '';
    case 'date': return m.date ? displayDate(m.date) : '';
    case 'framenumber': return String(frameNumber);
    default: return '';
  }
}
