import { PX_PER_MM, type AspectRatio } from '@beamerpoint/core';
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
  const step = Math.max(1, aids.gridMm) * PX_PER_MM;

  // A repeating-linear-gradient is one element and one paint, rather than a few hundred
  // divs that would have to re-layout on every canvas resize.
  return (
    <div
      className="bp-grid"
      aria-hidden="true"
      style={{
        backgroundImage:
          `repeating-linear-gradient(to right, rgba(47,91,215,0.16) 0 1px, transparent 1px ${step}px),` +
          `repeating-linear-gradient(to bottom, rgba(47,91,215,0.16) 0 1px, transparent 1px ${step}px)`,
      }}
    />
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
  if (!aids.rulers) return null;
  const paper = PAPER[aspect];

  const ticks = (lengthMm: number): number[] => {
    const out: number[] = [];
    for (let mm = 0; mm <= lengthMm; mm += 10) out.push(mm);
    return out;
  };

  const click = (axis: 'v' | 'h') => (e: React.MouseEvent<HTMLDivElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const host = e.currentTarget.closest('.bp-paper') as HTMLElement | null;
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
        style={{ height: RULER_PX, top: -RULER_PX }}
        title="Click to add a vertical guide"
        onClick={click('v')}
      >
        {ticks(paper.w).map((mm) => (
          <span key={mm} className="bp-tick" style={{ left: `${mm * PX_PER_MM}px` }}>
            {mm}
          </span>
        ))}
      </div>
      <div
        className="bp-ruler bp-ruler-left"
        style={{ width: RULER_PX, left: -RULER_PX }}
        title="Click to add a horizontal guide"
        onClick={click('h')}
      >
        {ticks(paper.h).map((mm) => (
          <span key={mm} className="bp-tick" style={{ top: `${mm * PX_PER_MM}px` }}>
            {mm}
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
