import { expectRoundTrip } from './helpers/roundTrip.js';
import { describe, expect, it } from 'vitest';
import { SMART_ART, buildSmartArt, newSmartArtElement } from '../src/model/smartArt.js';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import { shapeBounds } from '../src/model/shapeOps.js';
import { richTextToPlain } from '../src/emit/inline.js';

const CANVAS = { w: 110, h: 55 };

describe('prebuilt diagram layouts', () => {
  it('every layout produces shapes that stay inside the canvas', () => {
    // A layout that overflows is worse than none: the picture is silently clipped by
    // the bounding box the emitter writes, so part of it just disappears in the PDF.
    for (const spec of SMART_ART) {
      const shapes = buildSmartArt(spec.kind, spec.sample, CANVAS);
      expect(shapes.length, spec.kind).toBeGreaterThan(0);

      for (const s of shapes) {
        const b = shapeBounds(s);
        if (b === null) continue;
        expect(b.x, `${spec.kind} left`).toBeGreaterThanOrEqual(-0.51);
        expect(b.y, `${spec.kind} top`).toBeGreaterThanOrEqual(-0.51);
        expect(b.x + b.w, `${spec.kind} right`).toBeLessThanOrEqual(CANVAS.w + 0.51);
        expect(b.y + b.h, `${spec.kind} bottom`).toBeLessThanOrEqual(CANVAS.h + 0.51);
      }
    }
  });

  it('uses the labels it is given', () => {
    const shapes = buildSmartArt('process', ['Alpha', 'Beta', 'Gamma'], CANVAS);
    const labels = shapes
      .filter((s) => s.t === 'node')
      .map((s) => (s.t === 'node' ? richTextToPlain(s.content) : ''));
    expect(labels).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('falls back to the sample rather than producing an empty diagram', () => {
    const shapes = buildSmartArt('process', [], CANVAS);
    const labels = shapes
      .filter((s) => s.t === 'node')
      .map((s) => (s.t === 'node' ? richTextToPlain(s.content) : ''));
    expect(labels).toEqual(SMART_ART.find((s) => s.kind === 'process')!.sample);
  });

  it('clamps the label count to what the layout can show', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Item ${i + 1}`);
    for (const spec of SMART_ART) {
      const shapes = buildSmartArt(spec.kind, many, CANVAS);
      const labels = shapes.filter((s) => s.t === 'node');
      expect(labels.length, spec.kind).toBeLessThanOrEqual(spec.max);
    }
  });

  it('produces an editable diagram of ordinary shapes, not a special element', () => {
    const el = newSmartArtElement('cycle', ['A', 'B', 'C', 'D']);
    expect(el.kind).toBe('tikz');
    expect(el.mode).toBe('shapes');
    // Only kinds the drawing tools also produce, so every part stays editable.
    const kinds = new Set((el.shapes ?? []).map((s) => s.t));
    for (const k of kinds) expect(['rect', 'ellipse', 'path', 'arrow', 'node']).toContain(k);
  });

  it('round-trips every layout through LaTeX without degrading', () => {
    for (const spec of SMART_ART) {
      const deck = newDeck({ title: 'T' });
      deck.nodes = [newFrame('D', [newSmartArtElement(spec.kind, spec.sample)])];

      const tex = emitDeck(deck).tex;
      expectRoundTrip(deck);
      const round = parseDeck(tex, { newId: makeSeededIdFactory('r') });

      expect(emitDeck(round.deck).tex, spec.kind).toBe(tex);
      expect(round.guard.ok, spec.kind).toBe(true);
      expect(round.health.demoted, spec.kind).toBe(0);
    }
  });

  it('emits no dangling node references in any layout', () => {
    for (const spec of SMART_ART) {
      const deck = newDeck({ title: 'T' });
      deck.nodes = [newFrame('D', [newSmartArtElement(spec.kind, spec.sample)])];
      const tex = emitDeck(deck).tex;
      expectRoundTrip(deck);

      const defined = new Set(
        [...tex.matchAll(/\\node\[[^\]]*\]\s*\((bp\w+)\)/g)].map((m) => m[1]!),
      );
      const used = [...tex.matchAll(/\((bp\w+)\.(?:north|south|east|west|center)\)/g)]
        .map((m) => m[1]!);
      expect(used.filter((u) => !defined.has(u)), spec.kind).toEqual([]);
    }
  });
});
