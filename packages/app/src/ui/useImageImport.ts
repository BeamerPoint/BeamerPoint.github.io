import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../state/store.js';
import { importImageFile, isImageFile } from '../state/images.js';

/**
 * Bringing images into the deck: file picker, drag-and-drop, and paste.
 *
 * All three end up in the same place, so the conversion and naming rules cannot drift
 * between them.
 */
export interface ImageImport {
  /** Open a file picker. */
  choose(): void;
  /** True while a file is being dragged over the canvas. */
  dragging: boolean;
  /** Last conversion or failure, for the UI to report. */
  notice: string | null;
  dismissNotice(): void;
  dropHandlers: {
    onDragOver(e: React.DragEvent): void;
    onDragLeave(e: React.DragEvent): void;
    onDrop(e: React.DragEvent): void;
  };
}

export function useImageImport(): ImageImport {
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const addFiles = useCallback(async (files: readonly File[]): Promise<void> => {
    const state = useStore.getState();
    const slideId = state.selection.slideId;
    if (slideId === null) return;
    if (state.source.status !== 'synced') {
      setNotice('Apply or revert the source edits first — the canvas is locked.');
      return;
    }

    for (const file of files) {
      if (!isImageFile(file)) {
        setNotice(`${file.name} is not an image.`);
        continue;
      }
      try {
        // Re-read paths each time: every import adds one, and they must not collide.
        const taken = new Set(useStore.getState().deck.resources.map((r) => r.path));
        const { ref, converted } = await importImageFile(file, taken);
        useStore.getState().addImageElement(slideId, ref);
        if (converted !== undefined) {
          setNotice(`${file.name} was converted to PNG — ${converted.reason}.`);
        }
      } catch (err) {
        setNotice(err instanceof Error ? err.message : String(err));
      }
    }
  }, []);

  const choose = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.multiple = true;
    input.onchange = () => { void addFiles([...(input.files ?? [])]); };
    input.click();
  }, [addFiles]);

  // Paste: an image on the clipboard goes onto the current slide, but only when the
  // user is not typing into something — otherwise Ctrl+V in a text box would insert a
  // picture instead of text.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target !== null && (target.isContentEditable
        || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      e.preventDefault();
      void addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const dropHandlers = {
    onDragOver: (e: React.DragEvent): void => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: React.DragEvent): void => {
      // Ignore the transient leave fired when crossing a child element.
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDragging(false);
    },
    onDrop: (e: React.DragEvent): void => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      setDragging(false);
      void addFiles([...e.dataTransfer.files]);
    },
  };

  return { choose, dragging, notice, dismissNotice: () => setNotice(null), dropHandlers };
}
