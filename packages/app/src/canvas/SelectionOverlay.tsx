import { useCallback, useRef } from 'react';
import type { Element, ImageElement, ImageTrim, ResourceRef } from '@beamerpoint/core';
import type { ResizeGrip } from '../state/store.js';
import { screenPxToMm, useCanvasGeometry } from './CanvasContext.js';

export type OverlayMode = 'transform' | 'crop';

interface Props {
  /** Any element can be moved and resized; only an image can be cropped. */
  el: Element;
  resource: ResourceRef | undefined;
  mode: OverlayMode;
  /** Deltas in slide millimetres. The store never sees screen pixels. */
  onResize(dxMm: number, dyMm: number, grip: ResizeGrip): void;
  onMove(dxMm: number, dyMm: number): void;
  onTrim(next: ImageTrim): void;
  /**
   * Whether dragging the top or bottom edge means anything.
   *
   * Only an image (`height=`) and a diagram (its canvas) have a height LaTeX can be
   * told about; `Placement.h` is not emitted, so offering the handle anywhere else
   * would be a control that silently does nothing.
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

/**
 * Drag handles for the selected element.
 *
 * Rendered inside the element's own box, so the overlay needs no coordinate maths to
 * position itself — only to interpret drag deltas, which come from the canvas scale.
 *
 * Pointer capture is used throughout: without it a fast drag that outruns the cursor
 * loses the element under the pointer and the gesture dies half-finished.
 *
 * The move target is a BAND around the edge, not a cover over the whole element, for
 * anything whose text is edited in place — a cover over a bullet list would swallow
 * every click meant for the text underneath it.
 */
export function SelectionOverlay(props: Props): React.ReactElement {
  const { el, resource, mode } = props;
  const geometry = useCanvasGeometry();
  const last = useRef<{ x: number; y: number } | null>(null);

  const start = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add('bp-dragging');
  }, []);

  const end = useCallback((e: React.PointerEvent) => {
    last.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    document.body.classList.remove('bp-dragging');
  }, []);

  const delta = (e: React.PointerEvent): { dx: number; dy: number } | null => {
    if (last.current === null) return null;
    const d = { dx: e.clientX - last.current.x, dy: e.clientY - last.current.y };
    last.current = { x: e.clientX, y: e.clientY };
    return d;
  };

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

    const onCropDrag = (edge: Edge) => (e: React.PointerEvent): void => {
      const d = delta(e);
      if (d === null) return;
      const box = e.currentTarget.parentElement?.getBoundingClientRect();
      if (box === undefined) return;

      const perPxX = visibleW / Math.max(1, box.width);
      const perPxY = visibleH / Math.max(1, box.height);
      const next: ImageTrim = { ...trim };

      if (edge === 'w') next.left = trim.left + d.dx * perPxX;
      if (edge === 'e') next.right = trim.right - d.dx * perPxX;
      if (edge === 'n') next.top = trim.top + d.dy * perPxY;
      if (edge === 's') next.bottom = trim.bottom - d.dy * perPxY;

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

    return (
      <div className="bp-overlay bp-overlay-crop">
        {(['n', 's', 'e', 'w'] as Edge[]).map((edge) => (
          <div
            key={edge}
            className={`bp-crop-edge bp-crop-${edge}`}
            onPointerDown={start}
            onPointerMove={onCropDrag(edge)}
            onPointerUp={end}
            onPointerCancel={end}
          />
        ))}
        <span className="bp-overlay-label">
          crop {Math.round(visibleW)}&times;{Math.round(visibleH)} px
        </span>
      </div>
    );
  }

  /* ------------------------------------------------------- move and resize */

  const onBodyDrag = (e: React.PointerEvent): void => {
    const d = delta(e);
    if (d === null) return;
    props.onMove(screenPxToMm(d.dx, geometry), screenPxToMm(d.dy, geometry));
  };

  const onHandleDrag = (grip: ResizeGrip) => (e: React.PointerEvent): void => {
    const d = delta(e);
    if (d === null) return;
    // The POINTER's movement, in millimetres. The grip says what it means -- a west
    // handle moves the left edge, an east one the right - and the store applies it.
    // Correcting the sign here as well as there doubled every westward drag.
    props.onResize(
      screenPxToMm(d.dx, geometry),
      screenPxToMm(d.dy, geometry),
      grip,
    );
  };

  const dragHandlers = {
    onPointerDown: start,
    onPointerMove: onBodyDrag,
    onPointerUp: end,
    onPointerCancel: end,
  };

  const grips = [
    ...CORNERS,
    ...SIDE_GRIPS,
    ...(props.canResizeHeight ? HEIGHT_GRIPS : []),
  ];

  return (
    <div className="bp-overlay bp-overlay-transform">
      {props.grabWholeBody ? (
        <div className="bp-move-target" title="Drag to position freely on the slide" {...dragHandlers} />
      ) : (
        (['n', 's', 'e', 'w'] as Edge[]).map((edge) => (
          <div
            key={edge}
            className={`bp-move-band bp-move-band-${edge}`}
            title="Drag the frame to position this freely on the slide"
            {...dragHandlers}
          />
        ))
      )}
      {grips.map((grip) => (
        <div
          key={grip}
          className={`bp-handle bp-handle-${grip}`}
          title="Drag to resize"
          onPointerDown={start}
          onPointerMove={onHandleDrag(grip)}
          onPointerUp={end}
          onPointerCancel={end}
        />
      ))}
      <span className="bp-overlay-label">
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
