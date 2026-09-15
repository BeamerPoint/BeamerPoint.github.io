import { newId, type ResourceRef } from '@beamerpoint/core';
import { putResourceBytes } from './resources.js';

/**
 * Importing an image into a deck.
 *
 * The non-obvious part is format. pdfLaTeX accepts PNG, JPEG and PDF and nothing else:
 * hand it an SVG and it fails with "Unknown graphics extension", which gives the user
 * no idea what went wrong. So anything it cannot read is rasterised here, at import
 * time, where we can still explain what happened.
 */

/** Formats pdfLaTeX can embed directly. */
const NATIVE_MIME: ReadonlySet<string> = new Set([
  'image/png', 'image/jpeg', 'application/pdf',
]);

/** Rasterise to roughly this width, so a full-slide figure stays sharp in print. */
const RASTER_TARGET_PX = 2000;

export interface ImportedImage {
  ref: ResourceRef;
  /** Set when the file was converted, so the UI can say so. */
  converted?: { from: string; to: string; reason: string };
}

export async function importImageFile(
  file: File,
  existingPaths: ReadonlySet<string>,
): Promise<ImportedImage> {
  const native = NATIVE_MIME.has(file.type);
  const { bytes, mime, width, height, converted } = native
    ? { ...(await readAsBytes(file)), converted: undefined }
    : await rasterise(file);

  const id = newId();
  const path = uniquePath(file.name, mime, existingPaths);

  await putResourceBytes(id, bytes);

  const ref: ResourceRef = {
    id,
    path,
    kind: 'image',
    mime,
    bytes: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    originalName: file.name,
    ...(width !== undefined && height !== undefined
      ? { intrinsic: { w: width, h: height } }
      : {}),
  };

  return converted === undefined ? { ref } : { ref, converted };
}

async function readAsBytes(
  file: File,
): Promise<{ bytes: Uint8Array; mime: string; width?: number; height?: number }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = await intrinsicSize(file).catch(() => undefined);
  return {
    bytes,
    mime: file.type,
    ...(size !== undefined ? { width: size.w, height: size.h } : {}),
  };
}

/** Convert a format pdfLaTeX cannot read into PNG. */
async function rasterise(file: File): Promise<{
  bytes: Uint8Array; mime: string; width: number; height: number;
  converted: { from: string; to: string; reason: string };
}> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, RASTER_TARGET_PX / Math.max(bitmap.width, bitmap.height));
  // Never downscale below the source; only cap very large inputs.
  const w = Math.max(1, Math.round(bitmap.width * (scale < 1 ? 1 : scale)));
  const h = Math.max(1, Math.round(bitmap.height * (scale < 1 ? 1 : scale)));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Could not get a 2D canvas context');
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (blob === null) throw new Error('Could not convert the image to PNG');

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mime: 'image/png',
    width: w,
    height: h,
    converted: {
      from: file.type || 'unknown',
      to: 'image/png',
      reason: 'pdfLaTeX can only embed PNG, JPEG and PDF',
    },
  };
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // SVG has no intrinsic bitmap, so createImageBitmap rejects it in some browsers;
  // an <img> with an object URL handles both cases.
  try {
    return await createImageBitmap(file);
  } catch {
    return await loadViaImgElement(file);
  }
}

function loadViaImgElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name} as an image`));
    };
    img.src = url;
  });
}

async function intrinsicSize(file: File): Promise<{ w: number; h: number }> {
  const bmp = await loadBitmap(file);
  return { w: bmp.width, h: bmp.height };
}

/**
 * Build a project-relative path that does not collide with an existing one.
 *
 * Non-ASCII and spaces are stripped: they are legal in a filename but a reliable way
 * to break `\includegraphics`, which is not worth debugging later.
 */
function uniquePath(
  originalName: string,
  mime: string,
  existing: ReadonlySet<string>,
): string {
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'application/pdf' ? 'pdf' : 'png';
  const stem = originalName
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'image';

  let candidate = `images/${stem}.${ext}`;
  let n = 2;
  while (existing.has(candidate)) {
    candidate = `images/${stem}-${n}.${ext}`;
    n += 1;
  }
  return candidate;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', buf as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when the file looks like something we can import at all. */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || file.type === 'application/pdf';
}
