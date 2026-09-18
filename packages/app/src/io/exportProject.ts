/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import JSZip from 'jszip';
import { emitDeck, richTextToPlain, type Deck } from '@beamerpoint/core';
import { getResourceBytes } from '../state/resources.js';

/**
 * Exporting a deck.
 *
 * A bare `.tex` is only self-contained while the deck has no images: the moment one
 * exists, the file references `images/plot.png` and is useless on its own. So a deck
 * with resources exports as a zip containing the source and every file it references.
 */

export interface ExportResult {
  filename: string;
  /** Resources referenced by the document but not stored locally. */
  missing: string[];
}

/**
 * A file name from the deck's title: letters, digits, spaces, hyphens and underscores.
 *
 * In ANY script. `\w` is ASCII-only, so "Présentation über Physik" exported as
 * `Prsentation-ber-Physik` and a title wholly in Persian, Greek or Chinese became
 * `presentation` (F-011). Combining marks and the zero-width non-joiner are kept because
 * they are part of how those words are spelled. Truncated by code POINT, so a character
 * outside the BMP is never cut in half.
 */
function baseName(deck: Deck): string {
  const title = deck.meta.title ? richTextToPlain(deck.meta.title).normalize('NFC') : '';
  const cleaned = title
    .replace(/[^\p{L}\p{M}\p{N}_ \u200C-]+/gu, '')
    .trim()
    .replace(/\s+/g, '-');
  return cleaned === '' ? 'presentation' : Array.from(cleaned).slice(0, 60).join('');
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking immediately can cancel the download in some browsers; one tick is enough.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save the compiled PDF to disk. */
export function exportPdf(deck: Deck, pdf: Uint8Array): string {
  const name = `${baseName(deck)}.pdf`;
  // Copy into a fresh buffer: the stored bytes may be a view into a larger one, and
  // Blob would otherwise capture the whole thing.
  download(new Blob([pdf.slice().buffer as ArrayBuffer], { type: 'application/pdf' }), name);
  return name;
}

export async function exportDeck(deck: Deck): Promise<ExportResult> {
  const { tex } = emitDeck(deck);
  const name = baseName(deck);

  if (deck.resources.length === 0) {
    download(new Blob([tex], { type: 'text/x-tex' }), `${name}.tex`);
    return { filename: `${name}.tex`, missing: [] };
  }

  const zip = new JSZip();
  zip.file('main.tex', tex);

  const missing: string[] = [];
  for (const res of deck.resources) {
    const bytes = await getResourceBytes(res.id);
    if (bytes === undefined) {
      missing.push(res.path);
      continue;
    }
    zip.file(res.path, bytes);
  }

  if (missing.length > 0) {
    // Ship a note rather than silently producing a project that will not build.
    zip.file(
      'MISSING-FILES.txt',
      [
        'These files are referenced by main.tex but were not stored in BeamerPoint,',
        'so they are not in this archive. Add them at these paths before compiling:',
        '',
        ...missing.map((p) => `  ${p}`),
        '',
      ].join('\n'),
    );
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  download(blob, `${name}.zip`);
  return { filename: `${name}.zip`, missing };
}
