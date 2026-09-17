import { useCallback, useState, useSyncExternalStore } from 'react';
import { useStore } from '../state/store.js';
import { importImageFile, isImageFile } from '../state/images.js';

/**
 * The last conversion or failure, shared across every caller of the hook.
 *
 * The hook is used in two places — the ribbon's Picture command and the canvas drop
 * target — and React state inside a hook is per-call-site. A notice raised by the
 * ribbon would have gone into the ribbon's own copy and never reached the banner the
 * app renders, so this one piece of state lives outside React.
 */
let currentNotice: string | null = null;
const noticeListeners = new Set<() => void>();

function setNotice(value: string | null): void {
  currentNotice = value;
  for (const fn of noticeListeners) fn();
}

function subscribeNotice(fn: () => void): () => void {
  noticeListeners.add(fn);
  return () => { noticeListeners.delete(fn); };
}

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
  /** Drop the drag highlight when someone else takes the drop. */
  cancelDrag(): void;
  dropHandlers: {
    onDragOver(e: React.DragEvent): void;
    onDragLeave(e: React.DragEvent): void;
    onDrop(e: React.DragEvent): void;
  };
}

/**
 * Bring files onto the current slide.
 *
 * Module scope, not a `useCallback`, for the same reason `currentNotice` is: this is
 * shared behaviour, and giving each call site its own copy is what let one paste import
 * the same picture twice.
 */
export async function addImageFiles(files: readonly File[]): Promise<void> {
  const state = useStore.getState();
  const slideId = state.selection.slideId;
  if (slideId === null) {
    setNotice('Select a slide first.');
    return;
  }
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
}

export function useImageImport(): ImageImport {
  const [dragging, setDragging] = useState(false);
  const notice = useSyncExternalStore(subscribeNotice, () => currentNotice, () => null);
  const addFiles = addImageFiles;

  const choose = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.multiple = true;
    input.onchange = () => { void addFiles([...(input.files ?? [])]); };
    input.click();
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

  return {
    choose,
    dragging,
    notice,
    dismissNotice: () => setNotice(null),
    cancelDrag: () => setDragging(false),
    dropHandlers,
  };
}
