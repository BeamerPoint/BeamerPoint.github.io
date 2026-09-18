/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import type { AspectRatio, Mm } from '../model/types.js';

/**
 * Beamer page geometry.
 *
 * Beamer's paper is always 128mm wide in 4:3 and 160mm wide in every widescreen
 * ratio; only the height changes. Font sizes do NOT scale with the ratio — 11pt is
 * 11pt on both — which is why the canvas keeps PX_PER_MM constant and lets the
 * physical page change size instead.
 */
export const PAPER: Readonly<Record<AspectRatio, { w: Mm; h: Mm }>> = {
  '43': { w: 128, h: 96 },
  '169': { w: 160, h: 90 },
  '1610': { w: 160, h: 100 },
  '54': { w: 125, h: 100 },
  '32': { w: 135, h: 90 },
  '141': { w: 148.5, h: 105 },
};

/** Beamer's default side margin. Themes with a sidebar override this. */
export const DEFAULT_H_MARGIN_MM = 10;

/**
 * Fixed design resolution for the canvas. The slide root is rendered at exactly
 * `widthMm * PX_PER_MM` design pixels and then CSS-scaled to fit its container, so
 * nothing but the outermost wrapper ever needs to know about zoom.
 */
export const PX_PER_MM = 10;

/** TeX points per millimetre (1in = 72.27pt = 25.4mm). */
export const PT_PER_MM = 72.27 / 25.4;

export const mmToPx = (mm: Mm): number => mm * PX_PER_MM;
export const pxToMm = (px: number): Mm => px / PX_PER_MM;
export const ptToMm = (pt: number): Mm => pt / PT_PER_MM;
export const mmToPt = (mm: Mm): number => mm * PT_PER_MM;

export interface PaperGeometry {
  widthMm: Mm;
  heightMm: Mm;
  hMarginMm: Mm;
  textWidthMm: Mm;
}

export function paperGeometry(aspect: AspectRatio, hMarginMm = DEFAULT_H_MARGIN_MM): PaperGeometry {
  const { w, h } = PAPER[aspect];
  return {
    widthMm: w,
    heightMm: h,
    hMarginMm,
    textWidthMm: w - 2 * hMarginMm,
  };
}

/** Round to a sensible precision for emitted coordinates (0.01mm is far below print resolution). */
export function roundMm(v: Mm): Mm {
  return Math.round(v * 100) / 100;
}
