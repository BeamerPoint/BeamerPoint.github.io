/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { useEffect, useRef, useState } from 'react';
import type { ImageElement, ResourceRef } from '@beamerpoint/core';
import { getResourceBytes } from '../state/resources.js';
import { measuredRects } from '../state/store.js';
import { useCanvasGeometry } from './CanvasContext.js';
import { InlineText } from './InlineText.js';

/**
 * An image on the canvas.
 *
 * Bytes live in IndexedDB keyed by resource id, so they are fetched asynchronously and
 * held as an object URL for as long as the element is mounted.
 *
 * A resource with no stored bytes is a real and expected state: it happens whenever a
 * deck references a file that was never uploaded here — most often after pasting
 * someone else's `.tex`. That is shown as a labelled placeholder rather than a broken
 * image, because the document is not wrong, it just needs the file.
 */
export function ImageView({
  el,
  resource,
  showUncropped,
}: {
  el: ImageElement;
  resource: ResourceRef | undefined;
  /** During a crop drag, show what is being cut away rather than hiding it. */
  showUncropped?: boolean;
}): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const geometry = useCanvasGeometry();

  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;

    void (async () => {
      const bytes = await getResourceBytes(el.resourceId);
      if (bytes === undefined) { setMissing(true); return; }
      // Copy into a fresh buffer: the stored Uint8Array may be a view into a larger one.
      const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
        type: resource?.mime ?? 'image/png',
      });
      objectUrl = URL.createObjectURL(blob);
      if (disposed) { URL.revokeObjectURL(objectUrl); return; }
      setMissing(false);
      setUrl(objectUrl);
    })();

    return () => {
      disposed = true;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [el.resourceId, resource?.mime]);

  // Record where this element sits, so dragging it out of the flow can start from its
  // current position instead of jumping.
  useEffect(() => {
    const node = boxRef.current;
    if (node === null) return;
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

  const widthPct =
    el.width !== undefined && (el.width.u === 'textwidth' || el.width.u === 'linewidth')
      ? `${Math.round(el.width.v * 100)}%`
      : el.width !== undefined
        ? `${el.width.v}${el.width.u}`
        : '60%';

  const alignStyle: React.CSSProperties =
    el.placement.mode === 'absolute'
      ? { width: '100%' }
      : {
          width: widthPct,
          marginLeft: el.align === 'right' ? 'auto' : el.align === 'center' ? 'auto' : '0',
          marginRight: el.align === 'left' ? 'auto' : el.align === 'center' ? 'auto' : '0',
        };

  const intrinsic = resource?.intrinsic;
  const trim = el.trim;
  const cropping = trim !== undefined && intrinsic !== undefined && !showUncropped;

  // The PDF gets its alpha from a TikZ node; the canvas gets it from CSS. Both are
  // "multiply what is drawn by this", so the two agree.
  const faded = el.opacity !== undefined && el.opacity < 1
    ? { opacity: el.opacity }
    : {};

  return (
    <div className="bp-image" style={{ ...alignStyle, ...faded }} ref={boxRef}>
      {missing || url === null ? (
        <div className="bp-image-missing">
          <div className="bp-image-missing-icon" aria-hidden="true">🖼</div>
          <div className="bp-image-missing-path">{resource?.path ?? el.resourceId}</div>
          <div className="bp-image-missing-note">
            {missing ? 'file not stored here' : 'loading…'}
          </div>
        </div>
      ) : cropping ? (
        // Show the cropped region by scaling the full image inside a clipping box, so
        // the canvas matches what `trim` + `clip` will produce.
        <CroppedImage
          url={url}
          alt={resource?.originalName ?? ''}
          intrinsic={intrinsic!}
          trim={trim!}
          rotate={el.rotate}
        />
      ) : (
        <img
          src={url}
          alt={resource?.originalName ?? ''}
          draggable={false}
          className={showUncropped && trim !== undefined ? 'bp-image-uncropped' : undefined}
          style={el.rotate ? { transform: `rotate(${el.rotate}deg)` } : undefined}
        />
      )}
      {el.caption !== undefined && (
        <div className="bp-image-caption">
          <InlineText content={el.caption} />
        </div>
      )}
    </div>
  );
}

function CroppedImage({
  url, alt, intrinsic, trim, rotate,
}: {
  url: string;
  alt: string;
  intrinsic: { w: number; h: number };
  trim: { left: number; bottom: number; right: number; top: number };
  rotate?: number;
}): React.ReactElement {
  const visibleW = Math.max(1, intrinsic.w - trim.left - trim.right);
  const visibleH = Math.max(1, intrinsic.h - trim.top - trim.bottom);

  return (
    <div
      className="bp-image-crop"
      style={{
        // Percentages are relative to the box width, so the whole thing scales with it.
        aspectRatio: `${visibleW} / ${visibleH}`,
        ...(rotate ? { transform: `rotate(${rotate}deg)` } : {}),
      }}
    >
      <img
        src={url}
        alt={alt}
        draggable={false}
        style={{
          // The box is exactly the visible region, so scaling the image by
          // intrinsic/visible and shifting by the trim lines the crop up.
          // A percentage `left` resolves against the box width and `top` against its
          // height, which is why the two denominators differ.
          width: `${(intrinsic.w / visibleW) * 100}%`,
          left: `${(-trim.left / visibleW) * 100}%`,
          top: `${(-trim.top / visibleH) * 100}%`,
        }}
      />
    </div>
  );
}
