/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import type { InlineStyle } from '@beamerpoint/core';
import { applyFormatToSelection } from '../ui/applyFormat.js';

const SHORTCUTS: Readonly<Record<string, InlineStyle>> = {
  b: 'bf',
  i: 'it',
  u: 'ul',
};

/**
 * Ctrl+B / Ctrl+I / Ctrl+U inside an editable box on the canvas.
 *
 * Without this the browser handles them itself and inserts a bare `<strong>`, `<em>` or
 * `<u>` with no `data-bp-i` — and `readInlineFromDom` flattens anything without one to
 * plain text, so the formatting looked right until the box lost focus and then silently
 * vanished. Routed to the same model operation the ribbon uses instead.
 */
export function onFormatKey(e: React.KeyboardEvent): void {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const style = SHORTCUTS[e.key.toLowerCase()];
  if (style === undefined) return;
  e.preventDefault();
  applyFormatToSelection({ style });
}
