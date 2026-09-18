import { describe, expect, it } from 'vitest';
import { emitDeck } from '../src/emit/deck.js';
import { parseDeck } from '../src/parse/parseDeck.js';
import { newDeck, newFrame } from '../src/model/factory.js';
import { makeSeededIdFactory } from '../src/model/ids.js';
import type { Deck, Element, ImageElement } from '../src/model/types.js';
import { expectRoundTrip } from './helpers/roundTrip.js';

/**
 * A see-through picture.
 *
 * `\includegraphics` has no option for it, and the obvious package does not work:
 * measured against the engine with `\pdfcompresslevel=0` so the graphics state is
 * readable, `\usepackage{transparent}` + `\transparent{0.4}{...}` compiles, produces a
 * PDF, and writes `ca 1, CA 1` — no transparency at all. A TikZ node with `opacity=0.4`
 * writes `ca 0.4, CA 0.4`. So the emitter wraps the graphic in a one-node
 * `tikzpicture`, and everything here is about that wrapper being invisible to a picture
 * that does not ask for it.
 */

function deckWith(image: Partial<ImageElement>): Deck {
  const base = newDeck({ title: 'T' });
  const el: Element = {
    id: 'i1',
    kind: 'image',
    placement: { mode: 'flow' },
    resourceId: 'r1',
    keepAspect: false,
    width: { v: 0.6, u: 'textwidth' },
    ...image,
  } as Element;
  return {
    ...base,
    resources: [{
      id: 'r1', path: 'pic.png', kind: 'image', mime: 'image/png',
      bytes: 0, sha256: '', originalName: 'pic.png',
    }],
    nodes: [newFrame('S', [el])],
  };
}

function round(tex: string) {
  return parseDeck(tex, { newId: makeSeededIdFactory('r') });
}

function imageOf(deck: Deck): ImageElement | undefined {
  const frame = deck.nodes.find((n) => n.kind === 'frame');
  const el = frame?.kind === 'frame' ? frame.children[0] : undefined;
  return el?.kind === 'image' ? el : undefined;
}

describe('picture transparency', () => {
  it('emits nothing extra for an opaque picture', () => {
    const tex = emitDeck(deckWith({})).tex;
    expect(tex).toContain('\\includegraphics[width=0.6\\textwidth]{pic.png}');
    expect(tex).not.toContain('tikzpicture');
    // ...and does not pull in tikz for a deck that has no diagram in it.
    expect(tex).not.toContain('\\usepackage{tikz}');
  });

  it('is byte-identical to an opacity of 1, which means opaque', () => {
    expect(emitDeck(deckWith({ opacity: 1 })).tex).toBe(emitDeck(deckWith({})).tex);
  });

  it('wraps a faded picture in the node that actually applies an alpha', () => {
    const tex = emitDeck(deckWith({ opacity: 0.5 })).tex;
    expect(tex).toContain(
      '\\begin{tikzpicture}\\node[opacity=0.5,inner sep=0pt]'
      + '{\\includegraphics[width=0.6\\textwidth]{pic.png}};\\end{tikzpicture}',
    );
    // tikz has to be loaded, or the wrapper is an undefined environment.
    expect(tex).toContain('\\usepackage{tikz}');
  });

  it('reads back as a picture, not as a diagram', () => {
    // The recognizer runs before the chart and drawing ones. Without that, this
    // becomes a canvas holding one raw shape and the slider has nothing to drive.
    const tex = emitDeck(deckWith({ opacity: 0.35 })).tex;
    expectRoundTrip(deckWith({ opacity: 0.35 }));
    const r = round(tex);
    const img = imageOf(r.deck);
    expect(img?.kind).toBe('image');
    expect(img?.opacity).toBe(0.35);
    expect(r.health.demoted).toBe(0);
    expect(emitDeck(r.deck).tex).toBe(tex);
  });

  it('declines a tikzpicture that is not exactly this shape', () => {
    // Someone else's node, with a fill and a shape, is a DRAWING and has to stay one.
    const base = emitDeck(deckWith({})).tex;
    const foreign = base.replace(
      '\\includegraphics[width=0.6\\textwidth]{pic.png}',
      '\\begin{tikzpicture}\\node[opacity=0.4,fill=red]{x};\\end{tikzpicture}',
    );
    const img = imageOf(round(foreign).deck);
    expect(img).toBeUndefined();
    // ...and whatever it is, it survives.
    expect(emitDeck(round(foreign).deck).tex).toContain('fill=red');
  });

  it('declines a node holding something other than one graphic', () => {
    const base = emitDeck(deckWith({})).tex;
    const two = base.replace(
      '\\includegraphics[width=0.6\\textwidth]{pic.png}',
      '\\begin{tikzpicture}\\node[opacity=0.4,inner sep=0pt]'
      + '{\\includegraphics{a.png}\\includegraphics{b.png}};\\end{tikzpicture}',
    );
    expect(imageOf(round(two).deck)).toBeUndefined();
  });

  it('keeps the crop, rotation and caption of a faded picture', () => {
    const tex = emitDeck(deckWith({
      opacity: 0.4,
      rotate: 15,
      height: { v: 30, u: 'mm' },
    })).tex;
    expect(tex).toContain('angle=15');
    const img = imageOf(round(tex).deck);
    expect(img?.opacity).toBe(0.4);
    expect(img?.rotate).toBe(15);
    expect(emitDeck(round(tex).deck).tex).toBe(tex);
  });
});
