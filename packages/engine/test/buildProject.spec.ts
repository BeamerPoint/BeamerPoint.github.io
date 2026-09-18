import { describe, expect, it } from 'vitest';
import { newDeck, newFrame, newTextElement, plain } from '@beamerpoint/core';
import type { Deck, Element, ResourceRef } from '@beamerpoint/core';
import { buildProject, jobForProject, type ResourceResolver } from '../src/buildProject.js';
import { attachDiagnostics } from '../src/attachDiagnostics.js';
import type { Diagnostic } from '../src/LatexEngine.js';

/**
 * Turning a deck into a compile job, and a TeX error back into a slide.
 *
 * Neither had a test. Both are pure and node-safe -- only the WASM backend needs a
 * browser -- so the whole path from deck to diagnostic can be pinned here.
 */

const P = { mode: 'flow' as const };

function deckOf(children: Element[], patch: Partial<Deck> = {}): Deck {
  return { ...newDeck({ title: 'T' }), nodes: [{ ...newFrame('F', children), id: 'f1' }], ...patch };
}

const resolverFrom = (bytes: Record<string, Uint8Array>): ResourceResolver => ({
  getBytes: async (id) => bytes[id],
});

const imageRes: ResourceRef = {
  id: 'img', path: 'images/a.png', kind: 'image', mime: 'image/png', bytes: 3, sha256: 'x', originalName: 'a.png',
};
const bibRes: ResourceRef = {
  id: 'bib', path: 'refs.bib', kind: 'bib', mime: 'text/plain', bytes: 3, sha256: 'y', originalName: 'refs.bib',
};
const imageEl: Element = { id: 'i1', kind: 'image', placement: P, resourceId: 'img', keepAspect: true };
const bibEl: Element = { id: 'b1', kind: 'bibliography', placement: P, files: ['refs'] };

describe('buildProject', () => {
  it('ships the main file and every stored resource at its path', async () => {
    const p = await buildProject(
      deckOf([imageEl], { resources: [imageRes] }),
      resolverFrom({ img: new Uint8Array([1, 2, 3]) }), { target: 'preview' },
    );
    expect(p.files.map((f) => f.path)).toEqual(['main.tex', 'images/a.png']);
    expect(p.warnings).toEqual([]);
    expect(p.tex).toContain('images/a.png');
  });

  it('warns about a missing image the document asks for', async () => {
    const p = await buildProject(deckOf([imageEl], { resources: [imageRes] }), resolverFrom({}), { target: 'preview' });
    expect(p.warnings).toEqual(['Missing resource: images/a.png']);
  });

  it('does not warn about a stored resource no element uses any more', async () => {
    // A deleted picture leaves its resource behind; warning about it made a clean
    // compile look broken.
    const p = await buildProject(deckOf([newTextElement('x')], { resources: [imageRes] }), resolverFrom({}), { target: 'preview' });
    expect(p.warnings).toEqual([]);
  });

  // F-012, fixed. The path is `refs.bib` while the document says `\bibliography{refs}`, so
  // looking for the path in the text never matched and every citation became [?] silently.
  it('warns about a missing .bib the reference list asks for', async () => {
    const p = await buildProject(deckOf([bibEl], { resources: [bibRes] }), resolverFrom({}), { target: 'preview' });
    expect(p.warnings).toEqual(['Missing resource: refs.bib']);
  });

  it('does not warn about a stored .bib that no reference list uses', async () => {
    const p = await buildProject(deckOf([newTextElement('x')], { resources: [bibRes] }), resolverFrom({}), { target: 'preview' });
    expect(p.warnings).toEqual([]);
  });

  it('appends cached aux files after the resources', async () => {
    const p = await buildProject(deckOf([]), resolverFrom({}), {
      target: 'preview', auxFiles: [{ path: 'main.aux', content: 'x' }],
    });
    expect(p.files.map((f) => f.path)).toEqual(['main.tex', 'main.aux']);
  });

  it('records the line each frame starts on', async () => {
    const p = await buildProject(deckOf([newTextElement('x')]), resolverFrom({}), { target: 'preview' });
    const line = p.frameLines.get('f1')!;
    expect(p.tex.split('\n')[line - 1]).toContain('\\begin{frame}');
  });

  describe('minted, on an engine with no shell escape', () => {
    // F-001: minted cannot run here, and measured, it produces NO PDF at all.
    const code: Element = {
      id: 'c1', kind: 'code', placement: P, backend: 'minted', language: 'python', code: 'x = 1', options: {},
    };
    const noShell = {
      programs: ['pdflatex' as const], bibtex: true, shellEscape: false, offlineAfterInstall: true, approxAssetBytes: 0,
    };

    it('previews it with listings, as a note rather than a warning', async () => {
      const p = await buildProject(deckOf([code]), resolverFrom({}), { target: 'preview', capabilities: noShell });
      expect(p.tex).toContain('\\begin{lstlisting}[language=Python]');
      expect(p.tex).not.toContain('minted');
      expect(p.warnings).toEqual([]);
      expect(p.notes).toHaveLength(1);
    });

    it('keeps minted for the exported file', async () => {
      const p = await buildProject(deckOf([code]), resolverFrom({}), { target: 'export', capabilities: noShell });
      expect(p.tex).toContain('\\begin{minted}');
      expect(p.notes).toEqual([]);
    });

    it('keeps the element id, so a TeX error on the listing still lands on it', async () => {
      const p = await buildProject(deckOf([code]), resolverFrom({}), { target: 'preview', capabilities: noShell });
      expect(p.sourceMap.some((e) => e.nodeId === 'c1')).toBe(true);
    });
  });
});

describe('jobForProject', () => {
  it('runs BibTeX, with the passes it needs, when the deck prints references', async () => {
    const withRefs = deckOf([bibEl]);
    const job = jobForProject(await buildProject(withRefs, resolverFrom({}), { target: 'preview' }), withRefs);
    expect(job.runBibtex).toBe(true);
    expect(job.passes).toBe(3);
  });

  it('finds a reference list nested in a block or a column', async () => {
    const nested = deckOf([{
      id: 'blk', kind: 'block', placement: P, variant: 'block', title: plain('R'), children: [bibEl],
    }]);
    expect(jobForProject(await buildProject(nested, resolverFrom({}), { target: 'preview' }), nested).runBibtex).toBe(true);
  });

  it('does not run BibTeX for a deck without references', async () => {
    const plainDeck = deckOf([newTextElement('x')]);
    const job = jobForProject(await buildProject(plainDeck, resolverFrom({}), { target: 'preview' }), plainDeck);
    expect(job.runBibtex).toBe(false);
    expect(job.passes).toBe('auto');
  });
});

describe('attachDiagnostics', () => {
  it('names the slide and the element a TeX error came from', async () => {
    const d = deckOf([{ ...newTextElement('first'), id: 'e1' }, { ...newTextElement('second'), id: 'e2' }]);
    const p = await buildProject(d, resolverFrom({}), { target: 'preview' });
    const line = p.tex.split('\n').findIndex((l) => l.includes('second')) + 1;
    const diag: Diagnostic = { severity: 'error', code: 'latex.error', message: 'x', raw: 'x', line };
    const [out] = attachDiagnostics([diag], p.sourceMap);
    expect(out!.frameId).toBe('f1');
    expect(out!.elementId).toBe('e2');
  });

  it('leaves a diagnostic with no line, or a line outside every frame, as it was', async () => {
    const p = await buildProject(deckOf([newTextElement('x')]), resolverFrom({}), { target: 'preview' });
    const noLine: Diagnostic = { severity: 'warning', code: 'w', message: 'x', raw: 'x' };
    const preamble: Diagnostic = { ...noLine, line: 1 };
    const [a, b] = attachDiagnostics([noLine, preamble], p.sourceMap);
    expect(a).toEqual(noLine);
    expect(b!.frameId).toBeUndefined();
  });
});
