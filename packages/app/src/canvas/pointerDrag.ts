/**
 * A pointer drag that survives the element it started on being unmounted.
 *
 * This is the whole reason resizing did not work. `resizeElementBy` converts an element
 * to absolute placement on the FIRST pointermove, and `SlideCanvas` renders flow
 * children under `.bp-body` but absolute ones under `.bp-abs-layer` — a different DOM
 * parent, so React unmounts and remounts the element, taking the handle that held the
 * pointer capture with it. The remounted handle had no drag in progress, so every later
 * move was discarded: the box moved a pixel or two and then froze.
 *
 * So the gesture belongs to the DOCUMENT, not to a node — and not to a React hook
 * either. A `useEffect` that installs the window listeners is torn down by that same
 * remount, which kills the drag just as thoroughly as losing the capture did; measured,
 * after making exactly that mistake. Everything here is module state.
 *
 * Capture is taken on `document.body`, which nothing unmounts, so the drag also keeps
 * its events when the pointer leaves the window — which a fast drag does constantly.
 *
 * Deltas are per-move (movement since the previous event), not cumulative, because that
 * is what the store's `moveElementBy` and `resizeElementBy` take.
 */
/** Modifier keys as they are AT THE MOMENT OF THE MOVE, not at pointer-down. */
export interface DragMods {
  shift: boolean;
  alt: boolean;
}

export interface DragSpec {
  onMove(dx: number, dy: number, mods: DragMods): void;
  onEnd?(): void;
}

interface Session extends DragSpec {
  x: number;
  y: number;
  pointerId: number;
}

let session: Session | null = null;

function handleMove(e: PointerEvent): void {
  const s = session;
  if (s === null || e.pointerId !== s.pointerId) return;
  const dx = e.clientX - s.x;
  const dy = e.clientY - s.y;
  if (dx === 0 && dy === 0) return;
  s.x = e.clientX;
  s.y = e.clientY;
  s.onMove(dx, dy, { shift: e.shiftKey, alt: e.altKey });
}

function handleStop(e: PointerEvent): void {
  const s = session;
  if (s === null || e.pointerId !== s.pointerId) return;
  endDrag();
}

/** Finish the drag in progress, if any. Idempotent. */
export function endDrag(): void {
  const s = session;
  if (s === null) return;
  session = null;
  window.removeEventListener('pointermove', handleMove);
  window.removeEventListener('pointerup', handleStop);
  window.removeEventListener('pointercancel', handleStop);
  document.body.classList.remove('bp-dragging');
  try {
    if (document.body.hasPointerCapture(s.pointerId)) {
      document.body.releasePointerCapture(s.pointerId);
    }
  } catch { /* the pointer is already gone; nothing to release */ }
  s.onEnd?.();
}

/** Begin a drag from a React pointer-down event. */
export function startPointerDrag(e: React.PointerEvent, spec: DragSpec): void {
  e.stopPropagation();
  e.preventDefault();
  endDrag(); // a second button down mid-drag ends the first one cleanly
  session = { ...spec, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleStop);
  window.addEventListener('pointercancel', handleStop);
  document.body.classList.add('bp-dragging');
  try {
    document.body.setPointerCapture(e.pointerId);
  } catch { /* happy-dom and old Safari; the window listeners still work */ }
}
