/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { useCallback, useRef } from 'react';

interface Props {
  /** Label for assistive tech, e.g. "Resize slide list". */
  label: string;
  /**
   * Called with the pointer delta in pixels. The sign convention is the caller's:
   * a splitter to the LEFT of a fixed column passes the delta through, one to the
   * RIGHT negates it, so both grow the column the user is dragging toward.
   */
  onResize(deltaPx: number): void;
  onCommit(): void;
  onReset(): void;
}

/**
 * A draggable divider between two columns.
 *
 * Uses pointer capture rather than document-level listeners so the drag keeps
 * tracking when the cursor moves over an iframe or leaves the window, and cannot get
 * stuck if a pointerup is missed.
 */
export function Splitter({ label, onResize, onCommit, onReset }: Props): React.ReactElement {
  const lastX = useRef<number | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    lastX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.classList.add('bp-resizing');
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (lastX.current === null) return;
    const delta = e.clientX - lastX.current;
    if (delta === 0) return;
    lastX.current = e.clientX;
    onResize(delta);
  }, [onResize]);

  const end = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (lastX.current === null) return;
    lastX.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    document.body.classList.remove('bp-resizing');
    onCommit();
  }, [onCommit]);

  // Keyboard resizing, so the layout is not mouse-only.
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10;
    if (e.key === 'ArrowLeft') { e.preventDefault(); onResize(-step); onCommit(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onResize(step); onCommit(); }
    else if (e.key === 'Home') { e.preventDefault(); onReset(); }
  }, [onResize, onCommit, onReset]);

  return (
    <div
      className="bp-splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      title={`${label} — drag, or double-click to reset`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    >
      <span className="bp-splitter-grip" aria-hidden="true" />
    </div>
  );
}
