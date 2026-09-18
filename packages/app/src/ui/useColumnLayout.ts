/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Widths of the three fixed columns. The canvas column takes whatever is left, so it
 * is the one that grows when the window does — which is what you want, since it is the
 * thing being edited.
 */
export interface ColumnWidths {
  slides: number;
  panel: number;
  inspector: number;
}

export const DEFAULT_WIDTHS: ColumnWidths = { slides: 210, panel: 460, inspector: 230 };

/** The canvas column never goes below this. */
const CANVAS_MIN = 220;
/** Three splitters of `--bp-splitter` (6px). */
const SPLITTERS_PX = 18;
/** Which column gives way first when the window is too narrow, in order. */
const SHRINK_ORDER: readonly (keyof ColumnWidths)[] = ['panel', 'slides', 'inspector'];

/**
 * The widths to DRAW at a given window width: the chosen ones, narrowed until the
 * canvas keeps `CANVAS_MIN`.
 *
 * This used to be a resize listener that wrote the narrowed width back into the chosen
 * one, which had three faults (F-020): it never ran at load, so a window that opened
 * narrow simply overflowed -- at 800px the page scrolled sideways and only 32px of the
 * format pane was on screen; it shrank only the source panel, so it gave up long before
 * the other columns had anything left to give; and it overwrote the user's layout, so
 * making the window narrow once lost it for good. Derived at render, the chosen widths
 * come back as soon as the window is wide enough again. Below the sum of the minimums
 * (788px) the page still scrolls, which is a better failure than a crushed canvas.
 */
export function fitColumns(widths: ColumnWidths, available: number): ColumnWidths {
  const out = { ...widths };
  let overflow = out.slides + out.panel + out.inspector + SPLITTERS_PX + CANVAS_MIN - available;
  for (const key of SHRINK_ORDER) {
    if (overflow <= 0) break;
    const give = Math.min(overflow, out[key] - LIMITS[key].min);
    if (give > 0) { out[key] -= give; overflow -= give; }
  }
  return out;
}

/** Per-column bounds. Below the minimum a column stops being usable. */
const LIMITS: Readonly<Record<keyof ColumnWidths, { min: number; max: number }>> = {
  slides: { min: 120, max: 480 },
  panel: { min: 260, max: 1000 },
  inspector: { min: 170, max: 460 },
};

const STORAGE_KEY = 'bp:layout:columns';

function clamp(key: keyof ColumnWidths, value: number): number {
  const { min, max } = LIMITS[key];
  return Math.min(max, Math.max(min, Math.round(value)));
}

function load(): ColumnWidths {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_WIDTHS;
    const parsed = JSON.parse(raw) as Partial<ColumnWidths>;
    return {
      slides: clamp('slides', parsed.slides ?? DEFAULT_WIDTHS.slides),
      panel: clamp('panel', parsed.panel ?? DEFAULT_WIDTHS.panel),
      inspector: clamp('inspector', parsed.inspector ?? DEFAULT_WIDTHS.inspector),
    };
  } catch {
    // Private windows and blocked site data both throw here; the default layout is fine.
    return DEFAULT_WIDTHS;
  }
}

export interface ColumnLayout {
  widths: ColumnWidths;
  /** Apply a drag delta in pixels to one column. */
  resize(key: keyof ColumnWidths, deltaPx: number): void;
  /** Commit the current widths to storage. Called once at the end of a drag. */
  commit(): void;
  reset(key?: keyof ColumnWidths): void;
  gridTemplate: string;
}

export function useColumnLayout(): ColumnLayout {
  const [widths, setWidths] = useState<ColumnWidths>(load);

  // What is on screen, which a drag starts from: dragging a column the window has
  // narrowed must move it at once, not first "use up" the width it was not given.
  const drawn = useRef<ColumnWidths>(widths);
  const resize = useCallback((key: keyof ColumnWidths, deltaPx: number) => {
    setWidths((w) => {
      const from = Math.min(w[key], drawn.current[key]);
      return { ...w, [key]: clamp(key, from + deltaPx) };
    });
  }, []);

  const commit = useCallback(() => {
    setWidths((w) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
      } catch {
        // Not being able to remember the layout is not worth surfacing.
      }
      return w;
    });
  }, []);

  const reset = useCallback((key?: keyof ColumnWidths) => {
    setWidths((w) => {
      const next = key === undefined ? DEFAULT_WIDTHS : { ...w, [key]: DEFAULT_WIDTHS[key] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  // The window's width, so the columns can be FITTED to it at render time.
  const [available, setAvailable] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = (): void => setAvailable(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const fitted = fitColumns(widths, available);
  drawn.current = fitted;
  const gridTemplate =
    `${fitted.slides}px var(--bp-splitter) minmax(${CANVAS_MIN}px, 1fr) ` +
    `var(--bp-splitter) ${fitted.panel}px var(--bp-splitter) ${fitted.inspector}px`;

  return { widths, resize, commit, reset, gridTemplate };
}
