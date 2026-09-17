import { useRef } from 'react';
import type { Element, ImageElement, ImageTrim, ResourceRef } from '@beamerpoint/core';
import type { ResizeGrip } from '../state/store.js';
import { screenPxToMm, useCanvasGeometry } from './CanvasContext.js';
import { startPointerDrag, type DragMods } from './pointerDrag.js';

export type OverlayMode = 'transform' | 'crop';

interface Props {
  /** Any element can be moved and resized; only an image can be cropped. */
  el: Element;
  resource: ResourceRef | undefined;
  mode: OverlayMode;
  /** Deltas in slide millimetres. The store never sees screen pixels. */
  onResize(dxMm: number, dyMm: number, grip: ResizeGrip, shift: boolean): void;
  onMove(dxMm: number, dyMm: number): void;
  onTrim(next: ImageTrim): void;
  /** Bracket the gesture, so a whole drag costs exactly one undo entry. */
  onDragStart(): void;
  onDragEnd(): void;
  /**
   * Whether dragging the top or bottom edge means anything.
   *
   * Only an image (`height=`), a diagram (its canvas) and a chart (its axis height)
   * have a height LaTeX can be told about; `Placement.h` is not emitted, so offering
   * the handle anywhere else would be a control that silently does nothing.
   */
  canResizeHeight: boolean;
  /** True when the whole interior can be used to drag — false where text is edited. */
  grabWholeBody: boolean;
  /** Millimetres, for the readout. */
  sizeMm: { w: number; h: number } | null;
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';
type Edge = 'n' | 's' | 'e' | 'w';

const CORNERS: readonly ResizeGrip[] = ['nw', 'ne', 'sw', 'se'];
const SIDE_GRIPS: readonly ResizeGrip[] = ['e', 'w'];
const HEIGHT_GRIPS: readonly ResizeGrip[] = ['n', 's'];

/** Screen pixels a handle measures, before the canvas scale is divided out. */
const HANDLE_PX = 11;
/** Screen pixels the grab bands are thick. */
const BAND_PX = 12;

/**
 * Drag handles for the selected element.
 *
 * Rendered inside the element's own box, so the overlay needs no coordinate maths to
 * position itself — only to interpret drag deltas, which come from the canvas scale.
 *
 * Every drag runs on WINDOW listeners (`pointerDrag.ts`), not on handlers bound to the
 * handle. The first pointermove of a resize converts the element to absolute placement,
 * which moves it to a different DOM parent and unmounts the handle mid-gesture; a
 * handler bound to that node — and the pointer capture it held — went with it, which is
 * why a box could only ever be nudged a pixel and then stopped.
 *
 * The move target is a BAND around the edge, not a cover over the whole element, for
 * anything whose text is edited in place — a cover over a bullet list would swallow
 * every click meant for the text underneath it.
 */
export function SelectionOverlay(props: Props): React.ReactElement {
  const { el, resource, mode } = props;
  const geometry = useCanvasGeometry();
  /** The element box as a crop drag began; the node may be replaced mid-drag. */
  const cropBox = useRef<{ width: number; height: number } | null>(null);

  /** Start a drag, bracketing it so the whole gesture costs one undo entry. */
  const begin = (
    e: React.PointerEvent,
    onMove: (dx: number, dy: number, mods: DragMods) => void,
  ): void => {
    props.onDragStart();
    startPointerDrag(e, { onMove, onEnd: props.onDragEnd });
  };

  /*
   * Handles and bands are sized in SCREEN pixels, not slide pixels.
   *
   * `.bp-stage` carries `transform: scale(...)`, which at a typical window is near 0.2
   * — so the 11px handle measured 2.3 real pixels and the 10px move bands measured 2.
   * A two-pixel target cannot be hit on purpose, which is most of why resizing felt
   * impossible. Dividing by the scale keeps them a constant size on screen, the same
   * trick the rulers use.
   */
  const inv = 1 / Math.max(geometry.scale, 0.01);

  /* ------------------------------------------------------------------ crop */

  if (mode === 'crop' && el.kind === 'image') {
    const intrinsic = resource?.intrinsic;
    if (intrinsic === undefined) {
      return (
        <div className="bp-overlay bp-overlay-note">
          Crop needs the image&rsquo;s pixel size, which is not stored for this file.
        </div>
      );
    }

    const trim = (el as ImageElement).trim ?? { left: 0, bottom: 0, right: 0, top: 0 };
    // The element box shows the CROPPED image, so a pixel of drag corresponds to
    // (visible image pixels / box pixels) of trim.
    const visibleW = Math.max(1, intrinsic.w - trim.left - trim.right);
    const visibleH = Math.max(1, intrinsic.h - trim.top - trim.bottom);

    const onCropDrag = (edge: Edge, dx: number, dy: number): void => {
      const box = cropBox.current;
      if (box === null) return;

      const perPxX = visibleW / Math.max(1, box.width);
      const perPxY = visibleH / Math.max(1, box.height);
      const next: ImageTrim = { ...trim };

      if (edge === 'w') next.left = trim.left + dx * perPxX;
      if (edge === 'e') next.right = trim.right - dx * perPxX;
      if (edge === 'n') next.top = trim.top + dy * perPxY;
      if (edge === 's') next.bottom = trim.bottom - dy * perPxY;

      // Never let the crop collapse or invert: keep at least 10% of each axis.
      const minW = intrinsic.w * 0.1;
      const minH = intrinsic.h * 0.1;
      next.left = Math.max(0, Math.min(next.left, intrinsic.w - next.right - minW));
      next.right = Math.max(0, Math.min(next.right, intrinsic.w - next.left - minW));
      next.top = Math.max(0, Math.min(next.top, intrinsic.h - next.bottom - minH));
      next.bottom = Math.max(0, Math.min(next.bottom, intrinsic.h - next.top - minH));

      props.onTrim({
        left: Math.round(next.left * 10) / 10,
        bottom: Math.round(next.bottom * 10) / 10,
        right: Math.round(next.right * 10) / 10,
        top: Math.round(next.top * 10) / 10,
      });
    };

    const onCropDown = (edge: Edge) => (e: React.PointerEvent): void => {
      // Measured at pointer-DOWN: the drag runs off window listeners, so the node this
      // event came from may well be replaced before the first move arrives.
      const box = e.currentTarget.parentElement?.getBoundingClientRect();
      cropBox.current = box === undefined
        ? null
        : { width: box.width, height: box.height };
      begin(e, (dx, dy) => onCropDrag(edge, dx, dy));
    };

    return (
      <div className="bp-overlay bp-overlay-crop">
        {(['n', 's', 'e', 'w'] as Edge[]).map((edge) => (
          <div
            key={edge}
            className={`bp-crop-edge bp-crop-${edge}`}
            style={cropEdgeStyle(edge, inv)}
            onPointerDown={onCropDown(edge)}
          />
        ))}
        <span className="bp-overlay-label" style={labelStyle(inv)}>
          crop {Math.round(visibleW)}&times;{Math.round(visibleH)} px
        </span>
      </div>
    );
  }

  /* ------------------------------------------------------- move and resize */

  const onBodyDown = (e: React.PointerEvent): void => {
    begin(e, (dx, dy) => {
      props.onMove(screenPxToMm(dx, geometry), screenPxToMm(dy, geometry));
    });
  };

  const onHandleDown = (grip: ResizeGrip) => (e: React.PointerEvent): void => {
    begin(e, (dx, dy, mods) => {
      // The POINTER's movement, in millimetres. The grip says what it means -- a west
      // handle moves the left edge, an east one the right - and the store applies it.
      // Correcting the sign here as well as there doubled every westward drag.
      // Shift is read per MOVE, so it can be pressed or released mid-drag.
      props.onResize(
        screenPxToMm(dx, geometry), screenPxToMm(dy, geometry), grip, mods.shift,
      );
    });
  };

  const grips = [
    ...CORNERS,
    ...SIDE_GRIPS,
    ...(props.canResizeHeight ? HEIGHT_GRIPS : []),
  ];

  const handleStyle: React.CSSProperties = {
    width: `${HANDLE_PX * inv}px`,
    height: `${HANDLE_PX * inv}px`,
    borderWidth: `${1.5 * inv}px`,
    borderRadius: `${2 * inv}px`,
  };

  return (
    <div className="bp-overlay bp-overlay-transform">
      {props.grabWholeBody ? (
        <div
          className="bp-move-target"
          title="Drag to position freely on the slide"
          onPointerDown={onBodyDown}
        />
      ) : (
        (['n', 's', 'e', 'w'] as Edge[]).map((edge) => (
          <div
            key={edge}
            className={`bp-move-band bp-move-band-${edge}`}
            title="Drag the frame to position this freely on the slide"
            style={bandStyle(edge, inv)}
            onPointerDown={onBodyDown}
          />
        ))
      )}
      {grips.map((grip) => (
        <div
          key={grip}
          className={`bp-handle bp-handle-${grip}`}
          title="Drag to resize"
          style={{ ...handleStyle, ...gripOffset(grip, inv) }}
          onPointerDown={onHandleDown(grip)}
        />
      ))}
      <span className="bp-overlay-label" style={labelStyle(inv)}>
        {el.placement.mode === 'absolute'
          ? `${Math.round(el.placement.x)}, ${Math.round(el.placement.y)} mm`
          : el.kind === 'image'
            ? `${Math.round((el.width?.v ?? 0.6) * 100)}%`
            : 'drag the frame to place'}
        {props.sizeMm !== null
          && ` · ${Math.round(props.sizeMm.w)} × ${Math.round(props.sizeMm.h)} mm`}
      </span>
    </div>
  );
}

/**
 * A handle straddles the edge it belongs to, so it is offset by half its own size.
 *
 * In CSS these were fixed `-6px` — half of 11, rounded — which is only half a handle
 * at a scale of 1, and the canvas is never at a scale of 1.
 */
function gripOffset(grip: ResizeGrip, inv: number): React.CSSProperties {
  const half = `${(HANDLE_PX / 2) * inv}px`;
  const mid = `${-(HANDLE_PX / 2) * inv}px`;
  const out: React.CSSProperties = {};
  if (grip.includes('n')) out.top = `-${half}`;
  if (grip.includes('s')) out.bottom = `-${half}`;
  if (grip.includes('e')) out.right = `-${half}`;
  if (grip.includes('w')) out.left = `-${half}`;
  if (grip === 'n' || grip === 's') { out.left = '50%'; out.marginLeft = mid; }
  if (grip === 'e' || grip === 'w') { out.top = '50%'; out.marginTop = mid; }
  return out;
}

/** The grab band around one edge, thick enough to hit at the canvas' own scale. */
function bandStyle(edge: Edge, inv: number): React.CSSProperties {
  const t = BAND_PX * inv;
  const outset = `${-t / 2}px`;
  const out: React.CSSProperties = edge === 'n' || edge === 's'
    ? { height: `${t}px`, left: outset, right: outset }
    : { width: `${t}px`, top: outset, bottom: outset };
  out[edge === 'n' ? 'top' : edge === 's' ? 'bottom' : edge === 'w' ? 'left' : 'right'] = outset;
  return out;
}

/** The crop bars, likewise a constant size on screen. */
function cropEdgeStyle(edge: Edge, inv: number): React.CSSProperties {
  const t = 8 * inv;
  const outset = `${-t / 2}px`;
  const out: React.CSSProperties = edge === 'n' || edge === 's'
    ? { height: `${t}px`, left: '12%', right: '12%' }
    : { width: `${t}px`, top: '12%', bottom: '12%' };
  out[edge === 'n' ? 'top' : edge === 's' ? 'bottom' : edge === 'w' ? 'left' : 'right'] = outset;
  out.borderRadius = `${t / 2}px`;
  return out;
}

/** The readout is text, so it has to be un-scaled too or it is unreadable. */
function labelStyle(inv: number): React.CSSProperties {
  return {
    fontSize: `${10 * inv}px`,
    padding: `${1 * inv}px ${5 * inv}px`,
    borderRadius: `${3 * inv}px`,
    top: `${-18 * inv}px`,
  };
}
