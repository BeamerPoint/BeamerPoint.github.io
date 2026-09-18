/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { PX_PER_MM, type AspectRatio } from '@beamerpoint/core';
import { useCanvasGeometry } from './CanvasContext.js';
import { PAPER } from '@beamerpoint/core';

/**
 * Rulers, gridlines and guides.
 *
 * All three are canvas-only: nothing here reaches the document. They exist so that
 * absolute placement is something you can aim, rather than nudge and re-check.
 *
 * Drawn in slide millimetres via `PX_PER_MM`, never CSS `mm` — see docs/ENGINEERING.md.
 */

export interface AidSettings {
  rulers: boolean;
  grid: boolean;
  /** Grid spacing in millimetres. */
  gridMm: number;
  guides: boolean;
  /** Snap dragged elements to the grid and to guides. */
  snap: boolean;
  /**
   * Keep the proportions when a CORNER handle is dragged.
   *
   * A workspace preference, not a document property — `ImageElement.keepAspect` is the
   * document one, and it says what `\includegraphics` should do with a box it is given.
   * This says what dragging a corner means. Holding Shift inverts it for one gesture,
   * as it does everywhere else.
   */
  lockAspect: boolean;
  /** User-placed guides, in millimetres from the top-left of the page. */
  vertical: number[];
  horizontal: number[];
}

export const DEFAULT_AIDS: AidSettings = {
  rulers: false,
  grid: false,
  gridMm: 10,
  guides: true,
  snap: true,
  lockAspect: true,
  vertical: [],
  horizontal: [],
};

/** Ruler thickness in design pixels. Sits outside the page, over the canvas backdrop. */
export const RULER_PX = 16;

export function Gridlines({
  aspect,
  aids,
}: {
  aspect: AspectRatio;
  aids: AidSettings;
}): React.ReactElement | null {
  if (!aids.grid) return null;

  const paper = PAPER[aspect];
  const step = Math.max(1, aids.gridMm);

  /*
   * Drawn as SVG lines with a non-scaling stroke, NOT as a repeating-linear-gradient.
   *
   * The page is CSS-scaled to fit (around 0.31), so a 1px gradient stop lands on a
   * third of a device pixel. The browser resolves each repeat independently, so the
   * lines came out at visibly unequal spacing and varying weight. `non-scaling-stroke`
   * keeps every line exactly one device pixel whatever the zoom, and the positions are
   * exact millimetres rather than accumulated repeats.
   */
  const verticals: number[] = [];
  for (let mm = 0; mm <= paper.w + 0.001; mm += step) verticals.push(mm);
  const horizontals: number[] = [];
  for (let mm = 0; mm <= paper.h + 0.001; mm += step) horizontals.push(mm);

  const major = (mm: number): boolean => Math.abs(mm % (step * 5)) < 0.001;

  return (
    <svg
      className="bp-grid"
      aria-hidden="true"
      width={paper.w * PX_PER_MM}
      height={paper.h * PX_PER_MM}
      viewBox={`0 0 ${paper.w} ${paper.h}`}
      preserveAspectRatio="none"
    >
      {verticals.map((mm) => (
        <line
          key={`v${mm}`}
          x1={mm} y1={0} x2={mm} y2={paper.h}
          className={major(mm) ? 'bp-grid-major' : 'bp-grid-minor'}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {horizontals.map((mm) => (
        <line
          key={`h${mm}`}
          x1={0} y1={mm} x2={paper.w} y2={mm}
          className={major(mm) ? 'bp-grid-major' : 'bp-grid-minor'}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export function Guides({
  aids,
  onMoveGuide,
  onRemoveGuide,
}: {
  aids: AidSettings;
  onMoveGuide(axis: 'v' | 'h', index: number, mm: number): void;
  onRemoveGuide(axis: 'v' | 'h', index: number): void;
}): React.ReactElement | null {
  if (!aids.guides) return null;

  const drag = (axis: 'v' | 'h', index: number) => (e: React.PointerEvent): void => {
    e.stopPropagation();
    e.preventDefault();
    const paper = (e.currentTarget as HTMLElement).closest('.bp-paper');
    if (paper === null) return;
    const rect = paper.getBoundingClientRect();
    const scale = rect.width / (paper as HTMLElement).offsetWidth;

    const move = (ev: PointerEvent): void => {
      const mm = axis === 'v'
        ? (ev.clientX - rect.left) / scale / PX_PER_MM
        : (ev.clientY - rect.top) / scale / PX_PER_MM;
      onMoveGuide(axis, index, Math.round(mm * 10) / 10);
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="bp-guides" aria-hidden="true">
      {aids.vertical.map((mm, i) => (
        <div
          key={`v${i}`}
          className="bp-guide bp-guide-v"
          style={{ left: `${mm * PX_PER_MM}px` }}
          title="Drag to move, double-click to remove"
          onPointerDown={drag('v', i)}
          onDoubleClick={() => onRemoveGuide('v', i)}
        />
      ))}
      {aids.horizontal.map((mm, i) => (
        <div
          key={`h${i}`}
          className="bp-guide bp-guide-h"
          style={{ top: `${mm * PX_PER_MM}px` }}
          title="Drag to move, double-click to remove"
          onPointerDown={drag('h', i)}
          onDoubleClick={() => onRemoveGuide('h', i)}
        />
      ))}
    </div>
  );
}

/**
 * Rulers along the top and left edges.
 *
 * Clicking one drops a guide at that position, which is the interaction people expect
 * from every drawing tool.
 */
export function Rulers({
  aspect,
  aids,
  onAddGuide,
}: {
  aspect: AspectRatio;
  aids: AidSettings;
  onAddGuide(axis: 'v' | 'h', mm: number): void;
}): React.ReactElement | null {
  const { scale } = useCanvasGeometry();
  if (!aids.rulers) return null;
  const paper = PAPER[aspect];

  /*
   * The rulers sit inside the scaled stage so they line up with the page exactly, but
   * a ruler that shrinks with the zoom is unreadable — at a typical 0.31 scale the
   * labels would be three pixels tall. Dividing by the scale cancels it out, so the
   * ruler is a constant size on screen while its tick POSITIONS stay in page units.
   */
  const inv = 1 / Math.max(scale, 0.01);
  const thickness = RULER_PX * inv;
  const font = 9 * inv;
  const hair = 1 * inv;

  const ticks = (lengthMm: number, stepMm: number): number[] => {
    const out: number[] = [];
    for (let mm = 0; mm <= lengthMm + 0.001; mm += stepMm) out.push(mm);
    return out;
  };

  const click = (axis: 'v' | 'h') => (e: React.MouseEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    // The stage, not the paper: the rulers are siblings of the page now, so the page
    // is no longer an ancestor to walk up to.
    const host = e.currentTarget.closest('.bp-stage') as HTMLElement | null;
    if (host === null) return;
    const scale = host.getBoundingClientRect().width / host.offsetWidth;
    const mm = axis === 'v'
      ? (e.clientX - rect.left) / scale / PX_PER_MM
      : (e.clientY - rect.top) / scale / PX_PER_MM;
    onAddGuide(axis, Math.round(mm * 10) / 10);
  };

  return (
    <>
      <div
        className="bp-ruler bp-ruler-top"
        style={{ height: thickness, top: -thickness, fontSize: font }}
        title="Click to add a vertical guide"
        onClick={click('v')}
      >
        {ticks(paper.w, 5).map((mm) => (
          <span
            key={mm}
            className={`bp-tick${mm % 10 === 0 ? ' is-major' : ''}`}
            style={{
              left: `${mm * PX_PER_MM}px`,
              borderLeftWidth: hair,
              height: mm % 10 === 0 ? thickness * 0.55 : thickness * 0.3,
            }}
          >
            {mm % 10 === 0 ? mm : ''}
          </span>
        ))}
      </div>
      <div
        className="bp-ruler bp-ruler-left"
        style={{ width: thickness, left: -thickness, fontSize: font }}
        title="Click to add a horizontal guide"
        onClick={click('h')}
      >
        {ticks(paper.h, 5).map((mm) => (
          <span
            key={mm}
            className={`bp-tick${mm % 10 === 0 ? ' is-major' : ''}`}
            style={{
              top: `${mm * PX_PER_MM}px`,
              borderTopWidth: hair,
              width: mm % 10 === 0 ? thickness * 0.55 : thickness * 0.3,
            }}
          >
            {mm % 10 === 0 ? mm : ''}
          </span>
        ))}
      </div>
    </>
  );
}

/**
 * Snap a millimetre position to the grid and to any guide within range.
 *
 * Guides win over the grid: a guide is something the user placed deliberately.
 */
export function snapMm(value: number, aids: AidSettings, axis: 'v' | 'h'): number {
  if (!aids.snap) return value;
  const TOLERANCE_MM = 1.5;

  const guides = axis === 'v' ? aids.vertical : aids.horizontal;
  for (const g of guides) {
    if (Math.abs(g - value) <= TOLERANCE_MM) return g;
  }

  if (aids.grid && aids.gridMm > 0) {
    const snapped = Math.round(value / aids.gridMm) * aids.gridMm;
    if (Math.abs(snapped - value) <= TOLERANCE_MM) return snapped;
  }
  return value;
}
