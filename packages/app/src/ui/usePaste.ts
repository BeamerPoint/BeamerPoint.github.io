import { useEffect } from 'react';
import { useStore } from '../state/store.js';
import { addImageFiles } from './useImageImport.js';

/**
 * Ctrl+V, in one place.
 *
 * Two features want it: pasting a copied ELEMENT, and importing an image from the system
 * clipboard. They were handled separately — the element on `keydown`, the image on
 * `paste` — and a real Ctrl+V fires BOTH, so one press inserted the copied element and
 * the image. Measured: a single Ctrl+V added three elements, because the image handler
 * was also registered once per call site of `useImageImport` and the ribbon and the
 * canvas both call it.
 *
 * So the `paste` EVENT is the only authority, and it can see what the clipboard actually
 * holds: files win, because putting an image on the clipboard is an explicit act, and
 * anything else falls through to the element clipboard.
 *
 * Mounted exactly once, by the app.
 */
export function usePaste(): void {
  const pasteElement = useStore((s) => s.pasteElement);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      // Inside a text box the browser's own paste is the right one.
      const target = e.target as HTMLElement | null;
      if (target !== null && (target.isContentEditable
        || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      const files = [...(e.clipboardData?.files ?? [])];
      e.preventDefault();
      if (files.length > 0) {
        void addImageFiles(files);
        return;
      }
      pasteElement();
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [pasteElement]);
}
