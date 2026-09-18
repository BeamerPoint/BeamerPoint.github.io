import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { emitDeck } from '../src/emit/deck.js';
import { newDeck, newFrame, newTikzElement } from '../src/model/factory.js';
import { addShape, shapeFromDrag } from '../src/model/shapeOps.js';
import { POLYGON_KINDS } from '../src/model/polygons.js';
import { SMART_ART, newSmartArtElement } from '../src/model/smartArt.js';
import type { TikzElement } from '../src/model/types.js';

/**
 * Not a test: a generator.
 *
 * Writes every polygon shape and every prebuilt layout to a deck the browser engine
 * can compile, so "it renders" is checked against real LaTeX rather than asserted.
 * Skipped unless BP_WRITE_PROBE=1.
 */
const run = process.env.BP_WRITE_PROBE === '1' ? it : it.skip;

describe('shape probe', () => {
  run('writes a deck exercising every shape and layout', () => {
    const deck = newDeck({ title: 'Shape and layout probe' });

    // One frame of every polygon, laid out in a grid.
    let grid: TikzElement = newTikzElement(150, 70);
    POLYGON_KINDS.forEach((kind, i) => {
      const col = i % 6;
      const row = Math.floor(i / 6);
      const x = 2 + col * 25;
      const y = 2 + row * 23;
      grid = addShape(grid, shapeFromDrag(kind, { x, y }, { x: x + 21, y: y + 18 }));
    });

    deck.nodes = [
      newFrame('Every shape', [grid]),
      ...SMART_ART.map((s) => newFrame(s.label, [newSmartArtElement(s.kind, s.sample, 120, 58)])),
    ];

    writeFileSync('packages/app/public/shapeprobe.tex', emitDeck(deck).tex);
  });
});
