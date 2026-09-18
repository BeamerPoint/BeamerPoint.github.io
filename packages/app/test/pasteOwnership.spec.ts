/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Ctrl+V has exactly one owner.
 *
 * Two features want that key — pasting a copied ELEMENT and importing an image from the
 * system clipboard — and a real Ctrl+V fires both a `keydown` and a `paste` event. When
 * they were handled separately, one press did both: measured in the browser, a single
 * Ctrl+V added THREE elements, because the image handler was also registered once per
 * call site of `useImageImport` and the ribbon and the canvas both call it.
 *
 * The rule now: the `paste` event decides, because only it can see what the clipboard
 * actually holds. Files win; anything else is the element clipboard.
 *
 * Asserted against the source, like `canvasLayers.spec.ts`, because the failure is two
 * global listeners racing — there is no rendered thing to inspect, and the bug was
 * invisible until a real key was pressed with a real clipboard.
 */

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/ui/${name}`, import.meta.url)), 'utf8');

describe('paste ownership', () => {
  it('has exactly one window `paste` listener in the app', () => {
    const files = ['usePaste.ts', 'useShortcuts.ts', 'useImageImport.ts', 'useTexImport.ts'];
    const owners = files.filter((f) => /addEventListener\(\s*'paste'/.test(read(f)));
    expect(owners).toEqual(['usePaste.ts']);
  });

  it('does not also bind Ctrl+V on keydown', () => {
    const src = read('useShortcuts.ts');
    // Copy, cut and duplicate stay on keydown; they produce no competing event.
    expect(src).toMatch(/'c'/);
    expect(src).toMatch(/'x'/);
    expect(src).toMatch(/'d'/);
    // The key itself must not be dispatched on, in any of the comparisons.
    const comparisons = [...src.matchAll(/e\.key === '(\w)'/g)].map((m) => m[1]);
    expect(comparisons).not.toContain('v');
  });

  it('imports files through the one shared module-level function', () => {
    // Per-call-site copies are what made one paste import the same picture twice.
    const src = read('useImageImport.ts');
    expect(src).toMatch(/export async function addImageFiles/);
    expect(read('usePaste.ts')).toMatch(/addImageFiles/);
  });

  it('lets a file on the clipboard win over the element clipboard', () => {
    const src = read('usePaste.ts');
    const files = src.indexOf('files.length > 0');
    const element = src.indexOf('pasteElement()');
    expect(files).toBeGreaterThan(-1);
    expect(element).toBeGreaterThan(files);
  });

  it('leaves the browser to paste inside a text box', () => {
    expect(read('usePaste.ts')).toMatch(/isContentEditable/);
  });
});
