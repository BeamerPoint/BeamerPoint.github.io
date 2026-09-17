import { useCallback, useRef, useState } from 'react';
import { useStore } from '../state/store.js';

/**
 * Dragging a slide to a new place in the rail.
 *
 * Pointer events rather than HTML5 drag-and-drop. The thumbnails are real `<button>`s
 * carrying the listbox semantics, and making one `draggable` hands the browser control
 * of the gesture: it takes over the click, paints its own ghost image, and fires
 * `dragover` only over registered targets. Pointer events keep the button a button.
 *
 * A press is not a drag until it has moved `THRESHOLD_PX`, so an ordinary click still
 * selects the slide — and once it IS a drag, the click that pointerup would otherwise
 * produce is swallowed, or dropping a slide on itself would look like a selection
 * change that did not happen.
 *
 * The drop target is an ID, not an index: the rail interleaves section headings with
 * slides, so "put it here" means "in front of that node", and the store resolves it
 * against `deck.nodes`.
 */

/** How far the pointer must travel before a press becomes a drag. */
const THRESHOLD_PX = 4;

export interface SlideReorder {
  /** The slide being dragged, so its row can be shown lifted. */
  draggingId: string | null;
  /** The node the drop indicator sits in front of; `null` means after the last row. */
  dropBeforeId: string | null;
  /** True while a drag is in progress, for the indicator at the end of the list. */
  active: boolean;
  onPointerDown(e: React.PointerEvent, slideId: string): void;
  /** True when the click that follows this pointerup is the tail of a drag. */
  consumeClick(): boolean;
}

export function useSlideReorder(listRef: React.RefObject<HTMLElement | null>): SlideReorder {
  const moveSlideBefore = useStore((s) => s.moveSlideBefore);
  const locked = useStore((s) => s.source.status !== 'synced');

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const justDragged = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent, slideId: string): void => {
    if (locked || e.button !== 0) return;
    const startY = e.clientY;
    let dragging = false;

    /** Which row the pointer is above, as a node id, or null for past the end. */
    const targetAt = (y: number): string | null => {
      const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-node-id]');
      if (rows === undefined) return null;
      for (const row of rows) {
        const box = row.getBoundingClientRect();
        if (y < box.top + box.height / 2) return row.dataset.nodeId ?? null;
      }
      return null;
    };

    const move = (ev: PointerEvent): void => {
      if (!dragging) {
        if (Math.abs(ev.clientY - startY) < THRESHOLD_PX) return;
        dragging = true;
        setDraggingId(slideId);
        setActive(true);
        document.body.classList.add('bp-dragging');
      }
      setDropBeforeId(targetAt(ev.clientY));
    };

    const stop = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.classList.remove('bp-dragging');
      setDraggingId(null);
      setActive(false);
      setDropBeforeId(null);
      if (!dragging) return;
      justDragged.current = true;
      moveSlideBefore(slideId, targetAt(ev.clientY));
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }, [listRef, locked, moveSlideBefore]);

  const consumeClick = useCallback((): boolean => {
    if (!justDragged.current) return false;
    justDragged.current = false;
    return true;
  }, []);

  return { draggingId, dropBeforeId, active, onPointerDown, consumeClick };
}
