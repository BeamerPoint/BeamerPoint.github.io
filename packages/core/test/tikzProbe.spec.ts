/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { emitDeck } from '../src/emit/deck.js';
import { newDeck, newFrame, newTikzElement } from '../src/model/factory.js';
import { addShape } from '../src/model/shapeOps.js';
import type { TikzElement, TikzShape } from '../src/model/types.js';

/**
 * Not a test: a generator.
 *
 * Writes the emitter's real output to a file the browser can fetch, so the shapes can
 * be compiled by the actual engine and measured in the PDF. Skipped unless
 * BP_WRITE_PROBE is set, so it never runs in an ordinary `npm test`.
 */
const run = process.env.BP_WRITE_PROBE === '1' ? it : it.skip;

describe('tikz probe', () => {
  run('writes a probe deck for the browser engine', () => {
    let el: TikzElement = newTikzElement(120, 60);
    const shapes: TikzShape[] = [
      { id: 'box', t: 'rect', x: 10, y: 5, w: 30, h: 15, style: { draw: { k: 'structure' }, fill: { k: 'mix', expr: 'blue!20' } } },
      { id: 'round', t: 'rect', x: 10, y: 30, w: 30, h: 15, rx: 2, style: { draw: { k: 'named', name: 'black' } } },
      { id: 'oval', t: 'ellipse', cx: 90, cy: 12.5, rx: 15, ry: 10, style: { fill: { k: 'mix', expr: 'red!15' }, draw: { k: 'named', name: 'black' } } },
      { id: 'poly', t: 'path', points: [[55, 30], [85, 30], [70, 45]], closed: true, smooth: false, style: { draw: { k: 'named', name: 'black' }, dash: 'dashed', fill: { k: 'mix', expr: 'green!20' } } },
      { id: 'curve', t: 'path', points: [[10, 50], [40, 58], [70, 50]], closed: false, smooth: true, style: { lineWidth: { v: 0.6, u: 'mm' } } },
      { id: 'link', t: 'arrow', from: { kind: 'shape', shapeId: 'box', side: 'e' }, to: { kind: 'shape', shapeId: 'oval', side: 'w' }, head: 'latex', style: {} },
      { id: 'bent', t: 'arrow', from: { kind: 'point', x: 45, y: 50 }, to: { kind: 'point', x: 100, y: 50 }, bend: 25, head: 'stealth', style: { draw: { k: 'named', name: 'gray' } } },
      { id: 'tag', t: 'node', x: 45, y: 5, content: [{ t: 'text', s: 'PROBETAG' }], shape: 'none', style: { textColor: { k: 'structure' } } },
      { id: 'boxed', t: 'node', x: 45, y: 15, content: [{ t: 'text', s: 'PROBEBOX' }], shape: 'rect', style: { draw: { k: 'named', name: 'black' } } },
    ];
    for (const s of shapes) el = addShape(el, s);

    const deck = newDeck({ title: 'Tikz probe' });
    deck.nodes = [newFrame('Shapes', [el])];
    writeFileSync('packages/app/public/tikzprobe.tex', emitDeck(deck).tex);
  });
});
