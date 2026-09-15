import { useCallback, useEffect, useState } from 'react';

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

  const resize = useCallback((key: keyof ColumnWidths, deltaPx: number) => {
    setWidths((w) => ({ ...w, [key]: clamp(key, w[key] + deltaPx) }));
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

  // Keep the layout usable if the window shrinks below the sum of the fixed columns.
  useEffect(() => {
    const onResize = (): void => {
      const available = window.innerWidth;
      setWidths((w) => {
        const fixed = w.slides + w.panel + w.inspector;
        // Leave at least 280px for the canvas.
        if (fixed + 280 <= available) return w;
        const overflow = fixed + 280 - available;
        return { ...w, panel: clamp('panel', w.panel - overflow) };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const gridTemplate =
    `${widths.slides}px var(--bp-splitter) minmax(280px, 1fr) ` +
    `var(--bp-splitter) ${widths.panel}px var(--bp-splitter) ${widths.inspector}px`;

  return { widths, resize, commit, reset, gridTemplate };
}
