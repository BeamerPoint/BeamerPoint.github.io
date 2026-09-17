import { useLayoutEffect, useRef } from 'react';
import {
  PX_PER_MM,
  type Deck, type Element, type ListElement, type ResourceRef, type RichText,
  type ThemeSpec,
} from '@beamerpoint/core';
import { InlineText, MathView } from './InlineText.js';
import { readInlineFromDom } from './domInline.js';
import { ImageView } from './ImageView.js';
import { TableView } from './TableView.js';
import { CodeView } from './CodeView.js';
import { TocView } from './TocView.js';
import { ChartView } from './ChartView.js';
import { TikzView } from './TikzView.js';
import { measuredRects, useStore, type ResizeGrip } from '../state/store.js';
import { SelectionOverlay, type OverlayMode } from './SelectionOverlay.js';
import { useCanvasGeometry } from './CanvasContext.js';
import { wrapForKatex } from './mathPreview.js';

interface Props {
  el: Element;
  /** The whole deck, because an outline slide lists the deck's sections. */
  deck: Deck;
  theme: ThemeSpec;
  resources: readonly ResourceRef[];
  /**
   * The selected element's id, not a boolean.
   *
   * A boolean was hardcoded to `false` for children of blocks and columns, so a nested
   * element could never appear selected however hard it was clicked.
   */
  selectedId: string | null;
  locked: boolean;
  onSelect(id: string): void;
  onEditContent(elementId: string, content: RichText): void;
  onEditItem(elementId: string, itemId: string, content: RichText): void;
  onEditCell(elementId: string, rowId: string, cellId: string, content: RichText): void;
  onEditCode(elementId: string, code: string): void;
  overlayMode: OverlayMode;
  onResizeImage(elementId: string, deltaMm: number, deltaFraction: number): void;
  onResizeElement(elementId: string, dxMm: number, dyMm: number, grip: ResizeGrip): void;
  onMoveElement(elementId: string, dxMm: number, dyMm: number): void;
  onTrimImage(elementId: string, trim: import('@beamerpoint/core').ImageTrim): void;
  /** Bracket a pointer drag, so the whole gesture is one undo entry. */
  onDragStart(): void;
  onDragEnd(): void;
}

/** Kinds whose whole interior can be grabbed, because nothing inside is typed into. */
const SOLID_KINDS: ReadonlySet<Element['kind']> = new Set(['image', 'math', 'raw', 'toc', 'bibliography', 'chart']);

/** Kinds with a height LaTeX can actually be told about. */
const HEIGHT_KINDS: ReadonlySet<Element['kind']> = new Set(['image', 'tikz', 'chart']);

/**
 * One element on the canvas.
 *
 * Text is edited in place via contentEditable rather than a modal, which is what
 * makes the surface feel like PowerPoint rather than a form.
 */
export function ElementView(props: Props): React.ReactElement {
  const { el, onSelect } = props;
  const selected = el.id === props.selectedId;
  const geometry = useCanvasGeometry();
  const { bodyWidthMm } = geometry;
  const ref = useRef<HTMLDivElement>(null);

  /**
   * Record where this element is actually drawn, so lifting it out of the flow starts
   * from there.
   *
   * Only `ImageView` used to do this, which is why dragging a block, a table or a set
   * of columns teleported it to a hardcoded (20, 30). An image keeps its own, more
   * precise measurement of the picture rather than of the row it sits in.
   */
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null || el.kind === 'image') return;
    const paper = node.closest('.bp-paper');
    if (paper === null) return;
    const a = node.getBoundingClientRect();
    const b = paper.getBoundingClientRect();
    const toMm = (px: number): number => px / (geometry.scale * geometry.pxPerMm);
    measuredRects.set(el.id, {
      x: toMm(a.left - b.left),
      y: toMm(a.top - b.top),
      w: toMm(a.width),
      h: toMm(a.height),
    });
  });

  const absolute = el.placement.mode === 'absolute' ? el.placement : null;
  const style: React.CSSProperties = absolute
    ? {
        position: 'absolute',
        // Design millimetres, not CSS physical millimetres.
        left: `${absolute.x * PX_PER_MM}px`,
        top: `${absolute.y * PX_PER_MM}px`,
        width: `${absolute.w * PX_PER_MM}px`,
        zIndex: absolute.z,
        // `\rotatebox` turns anticlockwise and CSS turns clockwise, so the sign flips.
        ...(absolute.rotate ? { transform: `rotate(${-absolute.rotate}deg)` } : {}),
      }
    : {};

  const rect = measuredRects.get(el.id);

  return (
    <div
      ref={ref}
      className={`bp-el bp-el-${el.kind}${selected ? ' is-selected' : ''}`}
      style={style}
      onMouseDown={(e) => { e.stopPropagation(); onSelect(el.id); }}
      data-element-id={el.id}
    >
      {el.overlay !== undefined && <span className="bp-overlay-badge">{el.overlay}</span>}
      <Body {...props} />
      {selected && (
        <SelectionOverlay
          el={el}
          resource={el.kind === 'image'
            ? props.resources.find((r) => r.id === el.resourceId)
            : undefined}
          mode={props.overlayMode}
          canResizeHeight={HEIGHT_KINDS.has(el.kind)}
          grabWholeBody={SOLID_KINDS.has(el.kind)}
          sizeMm={rect === undefined ? null : { w: rect.w, h: rect.h }}
          onDragStart={props.onDragStart}
          onDragEnd={props.onDragEnd}
          onResize={(dxMm, dyMm, grip) => {
            // An image in the flow is sized as a fraction of the text column and stays
            // there; everything else resizes as a box, which lifts it out of the flow.
            // Only the canvas knows the column width, which is why the conversion is
            // here and the top and bottom grips go to the store like everything else.
            const sideways = grip.includes('e') || grip.includes('w');
            if (el.kind === 'image' && el.placement.mode === 'flow' && sideways) {
              // A west grip pulls the LEFT edge, so dragging it right narrows the box.
              const dw = grip.includes('w') ? -dxMm : dxMm;
              props.onResizeImage(el.id, dw, dw / bodyWidthMm);
            } else {
              props.onResizeElement(el.id, dxMm, dyMm, grip);
            }
          }}
          onMove={(dx, dy) => props.onMoveElement(el.id, dx, dy)}
          onTrim={(t) => props.onTrimImage(el.id, t)}
        />
      )}
    </div>
  );
}

function Body(props: Props): React.ReactElement {
  const { el, theme, locked, onEditContent, onEditItem } = props;

  switch (el.kind) {
    case 'text':
      return (
        <div
          className="bp-text"
          style={{ textAlign: el.align === 'justify' ? 'justify' : el.align }}
          contentEditable={!locked}
          suppressContentEditableWarning
          onBlur={(e) => onEditContent(el.id, readInlineFromDom(e.currentTarget, el.content))}
        >
          <InlineText content={el.content} />
        </div>
      );

    case 'list':
      return <ListView el={el} theme={theme} locked={locked} onEditItem={onEditItem} depth={0} />;

    case 'block': {
      const style =
        el.variant === 'alertblock' ? theme.block.alert
        : el.variant === 'exampleblock' ? theme.block.example
        : theme.block;
      // `block.shape` was declared and never read, so metropolis' flat blocks still
      // drew a rounded filled bar. An empty block also had no height at all: nothing
      // to see and nothing to grab.
      // The rounding lives on the title and the body rather than on a clipping wrapper:
      // `overflow: hidden` here also clipped the resize handles of everything nested
      // inside, which straddle their element's edge.
      const radius = theme.block.radiusMm * PX_PER_MM;
      return (
        <div
          className={`bp-block bp-block-${theme.block.shape}${
            el.children.length === 0 ? ' is-empty' : ''}`}
        >
          {el.title !== undefined && (
            <div
              className="bp-block-title"
              style={{
                background: style.titleBg,
                color: style.titleFg,
                borderRadius: `${radius}px ${radius}px 0 0`,
              }}
            >
              <InlineText content={el.title} />
            </div>
          )}
          <div
            className="bp-block-body"
            style={{
              background: style.bodyBg,
              color: style.bodyFg,
              borderRadius: el.title === undefined
                ? `${radius}px`
                : `0 0 ${radius}px ${radius}px`,
              // Measured: beamer's block body is flush with the text margin, not inset.
              padding: `${theme.block.paddingMm * 0.7 * PX_PER_MM}px 0`,
            }}
          >
            {el.children.map((child) => (
              <ElementView key={child.id} {...props} el={child} />
            ))}
          </div>
        </div>
      );
    }

    case 'columns':
      return (
        <div className="bp-columns">
          {el.columns.map((col) => (
            <div
              key={col.id}
              className="bp-column"
              style={{
                flex: col.width.u === 'textwidth' || col.width.u === 'linewidth'
                  ? `0 0 ${col.width.v * 100}%`
                  : `0 0 ${col.width.v}${col.width.u}`,
                alignSelf: col.valign === 't' ? 'flex-start'
                  : col.valign === 'b' ? 'flex-end' : 'stretch',
              }}
            >
              {col.children.map((child) => (
                <ElementView key={child.id} {...props} el={child} />
              ))}
            </div>
          ))}
        </div>
      );

    case 'image':
      return (
        <ImageView
          el={el}
          resource={el.kind === 'image'
            ? props.resources.find((r) => r.id === el.resourceId)
            : undefined}
          showUncropped={props.el.id === props.selectedId && props.overlayMode === 'crop'}
        />
      );

    case 'table':
      return (
        <TableView el={el} theme={theme} locked={locked} onEditCell={props.onEditCell} />
      );

    case 'code':
      return (
        <CodeView el={el} theme={theme} locked={locked} onEditCode={props.onEditCode} />
      );

    case 'toc':
      return <TocView el={el} deck={props.deck} theme={theme} />;

    case 'chart':
      return <ChartView el={el} theme={theme} />;

    case 'bibliography':
      // BibTeX formats the real list at compile time from the .bib, so the canvas can
      // only say which files it will read and how many entries they hold.
      return (
        <div className="bp-bibliography" style={{ color: theme.foreground }}>
          <span className="bp-bibliography-mark" style={{ color: theme.structure }}>
            References
          </span>
          {el.files.length === 0
            ? <span className="bp-bibliography-hint">No .bib attached yet</span>
            : <span className="bp-bibliography-hint">
                from {el.files.map((f) => `${f}.bib`).join(', ')} — BibTeX sets the list
              </span>}
        </div>
      );

    case 'tikz':
      return <TikzBody el={el} theme={theme} locked={locked} />;

    case 'math':
      return <MathView tex={wrapForKatex(el.tex, el.env)} display />;

    case 'raw':
      return (
        <div className="bp-raw" title={`Preserved verbatim (${el.reason})`}>
          <div className="bp-raw-label">{el.label ?? 'LaTeX'}</div>
          <pre>{el.tex}</pre>
        </div>
      );

    default: {
      // Unreachable today: every `Element['kind']` has a case above, so TypeScript
      // narrows `el` to `never` here. Kept as the visible fallback for a kind added
      // later, so a new element is never silently blank on the canvas.
      const added = el as Element;
      return (
        <div className="bp-unsupported">
          {added.kind} — not yet rendered on the canvas
        </div>
      );
    }
  }
}

function ListView({
  el, theme, locked, onEditItem, depth,
}: {
  el: ListElement;
  theme: ThemeSpec;
  locked: boolean;
  onEditItem(elementId: string, itemId: string, content: RichText): void;
  depth: number;
}): React.ReactElement {
  const marker = theme.itemMarkers[Math.min(depth, 2) as 0 | 1 | 2];

  return (
    <ul className="bp-list" data-depth={depth}>
      {el.items.map((item, i) => (
        <li key={item.id}>
          <span className="bp-marker" style={{ color: theme.structure }}>
            {el.listType === 'enumerate' ? `${i + 1}.` : marker}
          </span>
          <span
            className="bp-item-body"
            contentEditable={!locked}
            suppressContentEditableWarning
            onBlur={(e) => onEditItem(el.id, item.id, readInlineFromDom(e.currentTarget, item.content))}
          >
            <InlineText content={item.content} />
          </span>
          {item.sublist !== undefined && (
            <ListView
              el={item.sublist}
              theme={theme}
              locked={locked}
              onEditItem={onEditItem}
              depth={depth + 1}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * A diagram on the canvas.
 *
 * Shape editing is wired straight to the store rather than threaded through the
 * canvas props: a diagram has a dozen operations of its own, and passing them all
 * down would swamp every other element's signature for no benefit.
 */
function TikzBody({
  el, theme, locked,
}: {
  el: Extract<Element, { kind: 'tikz' }>;
  theme: ThemeSpec;
  locked: boolean;
}): React.ReactElement {
  const slideId = useStore((s) => s.selection.slideId);
  const elementSelected = useStore((s) => s.selection.elementId) === el.id;
  const shapeId = useStore((s) => s.selection.shapeId ?? null);
  const tool = useStore((s) => s.shapeTool);
  const selectShape = useStore((s) => s.selectShape);
  const drawShape = useStore((s) => s.drawShape);
  const moveShape = useStore((s) => s.moveShape);
  const resizeShape = useStore((s) => s.resizeShape);
  const moveShapeEndpoint = useStore((s) => s.moveShapeEndpoint);
  const beginGesture = useStore((s) => s.beginGesture);
  const endGesture = useStore((s) => s.endGesture);

  if (el.mode === 'raw') {
    return (
      <div className="bp-raw" title="Hand-written TikZ, preserved exactly">
        <div className="bp-raw-label">tikzpicture</div>
        <pre>{el.raw}</pre>
      </div>
    );
  }

  if (slideId === null) return <div className="bp-tikz-empty" />;

  return (
    <TikzView
      el={el}
      theme={theme}
      locked={locked}
      tool={elementSelected ? tool : null}
      showBounds={elementSelected}
      selectedShapeId={elementSelected ? shapeId : null}
      onSelectShape={selectShape}
      onDrawShape={(drag) => drawShape(slideId, el.id, drag)}
      onMoveShape={(id, dx, dy) => moveShape(slideId, el.id, id, dx, dy)}
      onResizeShape={(id, dw, dh, corner) => resizeShape(slideId, el.id, id, dw, dh, corner)}
      onMoveEndpoint={(id, which, point, over) =>
        moveShapeEndpoint(slideId, el.id, id, which, point, over)}
      onDragStart={beginGesture}
      onDragEnd={endGesture}
    />
  );
}
