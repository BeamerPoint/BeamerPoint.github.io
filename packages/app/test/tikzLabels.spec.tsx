// @vitest-environment happy-dom
/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { newSmartArtElement, resolveTheme } from '@beamerpoint/core';
import { TikzView } from '../src/canvas/TikzView.js';

/**
 * Every word in a diagram is drawn once.
 *
 * A text node's words were drawn by the wrapping label (`ShapeLabel`) AND again as an SVG
 * `<text>` left over from before labels wrapped, a few tenths of a millimetre apart -- so
 * every SmartArt label, which is a text node, appeared doubled on the canvas. Found in the
 * README screenshots.
 */

const noop = (): void => {};

function render(labels: string[]): HTMLElement {
  const el = newSmartArtElement('chevrons', labels);
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(
    <TikzView
      el={el} theme={resolveTheme('Madrid')} locked={false} tool={null}
      selectedShapeId={null} showBounds={false}
      onSelectShape={noop} onDrawShape={noop} onMoveShape={noop} onResizeShape={noop}
      onEditLabel={noop} onMoveEndpoint={noop} onDragStart={noop} onDragEnd={noop}
    />,
  );
  return host;
}

describe('diagram labels', () => {
  it('draws each SmartArt label exactly once', () => {
    const host = render(['Acquire', 'Filter', 'Segment']);
    const text = host.textContent ?? '';
    for (const word of ['Acquire', 'Filter', 'Segment']) {
      expect(text.split(word).length - 1, word).toBe(1);
    }
    expect(host.querySelectorAll('svg text')).toHaveLength(0);
  });
});
