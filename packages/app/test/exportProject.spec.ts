// @vitest-environment happy-dom
/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { newDeck, newFrame, plain } from '@beamerpoint/core';
import type { Deck, ResourceRef } from '@beamerpoint/core';

/**
 * Exporting: a bare `.tex` while the deck is self-contained, a zip the moment it
 * references files, and a note inside the zip when a referenced file is not stored.
 * None of it was tested.
 */

const stored = new Map<string, Uint8Array>();
vi.mock('../src/state/resources.js', () => ({
  getResourceBytes: async (id: string) => stored.get(id),
}));

const { exportDeck } = await import('../src/io/exportProject.js');

let downloads: Array<{ name: string; blob: Blob }> = [];
beforeEach(() => {
  stored.clear();
  downloads = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:x');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ name: this.download, blob: lastBlob! });
  });
});

let lastBlob: Blob | null = null;
const RealBlob = globalThis.Blob;
globalThis.Blob = class extends RealBlob {
  constructor(parts?: BlobPart[], opts?: BlobPropertyBag) { super(parts, opts); lastBlob = this; }
} as typeof Blob;

function deckTitled(title: string, resources: ResourceRef[] = []): Deck {
  return { ...newDeck({ title: 'x' }), meta: { title: plain(title) }, nodes: [newFrame('F', [])], resources };
}

const image = (id: string, path: string): ResourceRef => ({
  id, path, kind: 'image', mime: 'image/png', bytes: 3, sha256: id, originalName: path,
});

describe('exporting', () => {
  it('writes a bare .tex when the deck references no files', async () => {
    const r = await exportDeck(deckTitled('My Talk'));
    expect(r).toEqual({ filename: 'My-Talk.tex', missing: [] });
    expect(await downloads[0]!.blob.text()).toContain('\\begin{document}');
  });

  it('zips the source with every stored file at the path the source names', async () => {
    stored.set('a', new Uint8Array([1, 2, 3]));
    const r = await exportDeck(deckTitled('Deck', [image('a', 'images/a.png')]));
    expect(r.filename).toBe('Deck.zip');
    const zip = await JSZip.loadAsync(await downloads[0]!.blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['images/', 'images/a.png', 'main.tex']);
  });

  it('names a missing file inside the archive instead of shipping one that cannot build', async () => {
    const r = await exportDeck(deckTitled('Deck', [image('gone', 'images/gone.png')]));
    expect(r.missing).toEqual(['images/gone.png']);
    const zip = await JSZip.loadAsync(await downloads[0]!.blob.arrayBuffer());
    expect(await zip.file('MISSING-FILES.txt')!.async('string')).toContain('images/gone.png');
  });

  it('falls back to a generic name for an empty title', async () => {
    expect((await exportDeck(deckTitled(''))).filename).toBe('presentation.tex');
  });

  // F-011, fixed.
  it('keeps accented and non-Latin letters in the file name', async () => {
    // The sanitiser used ASCII `\w`, which drops every letter outside A-Z: an accented
    // title lost letters mid-word and a Persian or Greek one became "presentation".
    expect((await exportDeck(deckTitled('Présentation über Physik'))).filename)
      .toBe('Présentation-über-Physik.tex');
    expect((await exportDeck(deckTitled('ارائه نهایی'))).filename).toBe('ارائه-نهایی.tex');
  });

  it('keeps the zero-width non-joiner a Persian word is spelled with', async () => {
    const word = `می${String.fromCharCode(0x200c)}خواهم`;
    expect((await exportDeck(deckTitled(word))).filename).toBe(`${word}.tex`);
  });

  it('truncates by character, never splitting one outside the BMP', async () => {
    const letter = String.fromCodePoint(0x1d538);
    const name = (await exportDeck(deckTitled(letter.repeat(70)))).filename.replace(/\.tex$/, '');
    expect(name).toBe(letter.repeat(60));
  });
});
