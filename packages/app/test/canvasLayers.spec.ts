/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Full-bleed layers over the slide must not take the pointer.
 *
 * The canvas stacks several `position: absolute; inset: 0` layers on top of `.bp-body` —
 * gridlines, guides, the absolute-placement layer, the selection overlay. Each spans the
 * whole page, so any one of them that accepts pointer events swallows every click aimed
 * at the slide underneath.
 *
 * `.bp-guides` did exactly that. It sits at z-index 3, above the flow content, and an
 * EMPTY guide layer — no guides defined at all — made text, lists and diagrams
 * unselectable and stopped a drag inside a diagram from ever reaching the SVG, so no
 * shape could be drawn and nothing could be moved. The layer is inert now and the guide
 * LINES take the pointer instead.
 *
 * jsdom has no layout, so this cannot be hit-tested here; the rule is asserted against
 * the stylesheet instead, which is where the mistake is made.
 */

const CSS = readFileSync(
  fileURLToPath(new URL('../src/styles.css', import.meta.url)),
  'utf8',
);

/** The declaration block of a rule, by exact selector. */
function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(CSS);
  if (m === null) throw new Error(`no rule for ${selector}`);
  return m[2]!;
}

const OVERLAY_LAYERS = ['.bp-grid', '.bp-guides', '.bp-abs-layer', '.bp-overlay'];

describe('canvas overlay layers', () => {
  it('are inert, so they do not swallow clicks meant for the slide', () => {
    for (const selector of OVERLAY_LAYERS) {
      const rule = ruleFor(selector);
      expect(rule, selector).toMatch(/pointer-events:\s*none/);
    }
  });

  it('still let their own controls be grabbed', () => {
    // A layer that is inert has to hand the pointer back to the things inside it, or the
    // guides cannot be dragged and the selection handles cannot be pulled.
    expect(ruleFor('.bp-guide')).toMatch(/pointer-events:\s*auto/);
    expect(ruleFor('.bp-overlay > *')).toMatch(/pointer-events:\s*auto/);
    expect(ruleFor('.bp-abs-layer > .bp-el')).toMatch(/pointer-events:\s*auto/);
  });
});
