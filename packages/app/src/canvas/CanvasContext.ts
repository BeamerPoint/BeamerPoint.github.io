import { createContext, useContext } from 'react';

/**
 * Geometry the interaction handles need to convert pointer movement into document
 * units.
 *
 * The slide is drawn at a fixed design resolution and then CSS-scaled to fit, so a
 * pointer delta in screen pixels means nothing until it is divided by that scale.
 * Keeping the conversion in one place stops every handle from re-deriving it.
 */
export interface CanvasGeometry {
  /** CSS scale applied to the slide root. */
  scale: number;
  /** Design pixels per millimetre, before the scale. */
  pxPerMm: number;
  /** Width of the text column in millimetres — the denominator for \textwidth. */
  bodyWidthMm: number;
}

export const CanvasContext = createContext<CanvasGeometry>({
  scale: 1,
  pxPerMm: 10,
  bodyWidthMm: 140,
});

export function useCanvasGeometry(): CanvasGeometry {
  return useContext(CanvasContext);
}

/** Screen pixels to millimetres on the slide. */
export function screenPxToMm(px: number, g: CanvasGeometry): number {
  return px / (g.scale * g.pxPerMm);
}
