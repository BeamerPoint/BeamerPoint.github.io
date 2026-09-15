import { useEffect, useState } from 'react';
import type { ImageElement, ResourceRef } from '@beamerpoint/core';
import { getResourceBytes } from '../state/resources.js';
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
}: {
  el: ImageElement;
  resource: ResourceRef | undefined;
}): React.ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;

    void (async () => {
      const bytes = await getResourceBytes(el.resourceId);
      if (bytes === undefined) { setMissing(true); return; }
      // Copy into a fresh buffer: the stored Uint8Array may be a view into a larger one.
      const blob = new Blob([bytes.slice().buffer as ArrayBuffer], {
        type: resource?.mime ?? 'image/png',
      });
      objectUrl = URL.createObjectURL(blob);
      if (revoked) { URL.revokeObjectURL(objectUrl); return; }
      setMissing(false);
      setUrl(objectUrl);
    })();

    return () => {
      revoked = true;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [el.resourceId, resource?.mime]);

  // width is a fraction of \textwidth, which on the canvas is the body width.
  const widthPct =
    el.width !== undefined && (el.width.u === 'textwidth' || el.width.u === 'linewidth')
      ? `${Math.round(el.width.v * 100)}%`
      : el.width !== undefined
        ? `${el.width.v}${el.width.u}`
        : '60%';

  const figure = (
    <div className="bp-image" style={{ width: widthPct }}>
      {missing || url === null ? (
        <div className="bp-image-missing">
          <div className="bp-image-missing-icon" aria-hidden="true">🖼</div>
          <div className="bp-image-missing-path">{resource?.path ?? el.resourceId}</div>
          <div className="bp-image-missing-note">
            {missing ? 'file not stored here' : 'loading…'}
          </div>
        </div>
      ) : (
        <img
          src={url}
          alt={resource?.originalName ?? ''}
          draggable={false}
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

  return figure;
}
