import { useLayoutEffect, useRef, useState } from 'react';
import type { ImageTrim, RichText } from '@beamerpoint/core';
import {
  PAPER,
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
  overlayMode: OverlayMode;
  aids: AidSettings;
  onAddGuide(axis: 'v' | 'h', mm: number): void;
  onMoveGuide(axis: 'v' | 'h', index: number, mm: number): void;
  onRemoveGuide(axis: 'v' | 'h', index: number): void;
  onResizeImage(elementId: string, deltaMm: number, deltaFraction: number): void;
  onMoveImage(elementId: string, dxMm: number, dyMm: number): void;
  onTrimImage(elementId: string, trim: ImageTrim): void;
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

  /** Width the sidebar occupies, or 0. Sidebar themes reserve their whole left margin. */
  const sidebarMm = theme.headline.kind === 'bar' && !frame.options.plain
    ? theme.margins.hMm
    : 0;

  /** Design millimetres: the canvas grid, not CSS physical millimetres. */
  const mm = (n: number): string => `${n * PX_PER_MM}px`;

  const geometry = {
    scale,
    pxPerMm: PX_PER_MM,
    bodyWidthMm: paper.w - 2 * theme.margins.hMm,
  };

  return (
    <CanvasContext.Provider value={geometry}>
    <div className="bp-canvas-wrap" ref={wrapRef}>
      {/*
        * The stage carries the scale and does NOT clip; the paper inside it does clip,
        * because slide content must not spill past the page edge. The rulers live on
        * the stage: they sit just outside the page, so when they were inside the paper
        * its `overflow: hidden` ate them and they never appeared at all.
        */}
      <div
        className="bp-stage"
        style={{ width: designW, height: designH, transform: `scale(${scale})` }}
      >
      <Rulers
        aspect={deck.preamble.documentClass.aspectRatio}
        aids={props.aids}
        onAddGuide={props.onAddGuide}
      />
      <div
        className={`bp-paper${locked ? ' is-locked' : ''}`}
        style={{
          width: designW,
          height: designH,
          background: theme.background,
          color: theme.foreground,
          fontFamily: theme.fontFamily === 'serif'
            ? 'Latin Modern Roman, Georgia, serif'
            : 'Latin Modern Sans, Segoe UI, system-ui, sans-serif',
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
            className="bp-sidebar"
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
              // A sidebar theme's frame title has to start clear of the sidebar, which
              // occupies the left margin; otherwise the title runs underneath it.
              paddingTop: mm(theme.frametitle.paddingMm.y),
              paddingBottom: mm(theme.frametitle.paddingMm.y),
              paddingRight: mm(theme.frametitle.paddingMm.x || theme.margins.hMm),
              paddingLeft: mm(Math.max(
                theme.frametitle.paddingMm.x || theme.margins.hMm,
                sidebarMm === 0 ? 0 : sidebarMm + 1.5,
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
                  padding: `0 ${mm(theme.margins.hMm)}`,
                }
              : {
                  padding: `${mm(theme.margins.topMm)} ${mm(theme.margins.hMm)} ${mm(theme.margins.bottomMm)}`,
                }),
            justifyContent:
              frame.options.vAlign === 't' || deck.preamble.documentClass.t
                ? 'flex-start'
                : frame.options.vAlign === 'b' ? 'flex-end' : 'center',
          }}
        >
          {frame.children.filter((el) => el.placement.mode === 'flow').map((el) => (
            <ElementView
              key={el.id}
              el={el}
              theme={theme}
              resources={deck.resources}
              locked={locked}
              selected={el.id === selectedElementId}
              onSelect={onSelectElement}
              onEditContent={props.onEditContent}
              onEditItem={props.onEditItem}
              onEditCell={props.onEditCell}
              overlayMode={props.overlayMode}
              onResizeImage={props.onResizeImage}
              onMoveImage={props.onMoveImage}
              onTrimImage={props.onTrimImage}
            />
          ))}
        </div>

        {/*
          * Absolutely-placed elements are positioned from the page corner, matching
          * textpos with 	extblockorigin{0mm}{0mm}. They cannot live inside .bp-body,
          * which is inset by the margins, sits below the frame title, and clips.
          */}
        <div className="bp-abs-layer">
          {frame.children.filter((el) => el.placement.mode === 'absolute').map((el) => (
            <ElementView
              key={el.id}
              el={el}
              theme={theme}
              resources={deck.resources}
              locked={locked}
              selected={el.id === selectedElementId}
              onSelect={onSelectElement}
              onEditContent={props.onEditContent}
              onEditItem={props.onEditItem}
              onEditCell={props.onEditCell}
              overlayMode={props.overlayMode}
              onResizeImage={props.onResizeImage}
              onMoveImage={props.onMoveImage}
              onTrimImage={props.onTrimImage}
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
    case 'date': return m.date ? richTextToPlain(m.date) || 'today' : '';
    case 'framenumber': return String(frameNumber);
    default: return '';
  }
}
