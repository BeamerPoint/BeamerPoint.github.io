import { useLayoutEffect, useRef, useState } from 'react';
import type { RichText } from '@beamerpoint/core';
import {
  PAPER,
  PX_PER_MM,
  resolveTheme,
  richTextToPlain,
  type Deck,
  type FrameNode,
} from '@beamerpoint/core';
import { ElementView } from './ElementView.js';
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

  useLayoutEffect(() => {
    const node = wrapRef.current;
    if (node === null) return;
    const update = (): void => {
      const avail = node.clientWidth - 32;
      const availH = node.clientHeight - 32;
      setScale(Math.max(0.1, Math.min(avail / designW, availH / designH)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [designW, designH]);

  if (frame === undefined) {
    return <div className="bp-canvas-wrap bp-empty">No slide selected</div>;
  }

  const hasFrametitle = frame.title !== undefined && !frame.options.plain;

  return (
    <div className="bp-canvas-wrap" ref={wrapRef}>
      <div
        className={`bp-paper${locked ? ' is-locked' : ''}`}
        style={{
          width: designW,
          height: designH,
          transform: `scale(${scale})`,
          background: theme.background,
          color: theme.foreground,
          fontFamily: theme.fontFamily === 'serif'
            ? 'Latin Modern Roman, Georgia, serif'
            : 'Latin Modern Sans, Segoe UI, system-ui, sans-serif',
          fontSize: deck.preamble.documentClass.fontSize * (PX_PER_MM / 2.845),
        }}
        onMouseDown={() => onSelectElement(null)}
      >
        {theme.headline.kind === 'miniframes' && !frame.options.plain && (
          <div
            className="bp-headline"
            style={{
              height: `${theme.headline.heightMm}mm`,
              background: theme.headline.bg,
              color: theme.headline.fg,
            }}
          >
            {sectionTitles(deck).map((t, i) => (
              <span key={i} className="bp-headline-section">{t}</span>
            ))}
          </div>
        )}

        {hasFrametitle && (
          <div
            className="bp-frametitle"
            style={{
              color: theme.frametitle.fg,
              background: theme.frametitle.bg ?? 'transparent',
              padding: `${theme.frametitle.paddingMm.y}mm ${theme.frametitle.paddingMm.x || theme.margins.hMm}mm`,
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

        <div
          className="bp-body"
          style={{
            padding: `${theme.margins.topMm}mm ${theme.margins.hMm}mm ${theme.margins.bottomMm}mm`,
          }}
        >
          {frame.children.map((el) => (
            <ElementView
              key={el.id}
              el={el}
              theme={theme}
              locked={locked}
              selected={el.id === selectedElementId}
              onSelect={onSelectElement}
              onEditContent={props.onEditContent}
              onEditItem={props.onEditItem}
            />
          ))}
        </div>

        {theme.footline.cells.length > 0 && !frame.options.plain && (
          <div className="bp-footline" style={{ height: `${theme.footline.heightMm}mm` }}>
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
