/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  analyseProject, findMainCandidates, isZipFile, readProjectZip,
} from '../src/io/importProject.js';

/**
 * Importing a project `.zip`, shaped like Overleaf's "Download source": a wrapping folder,
 * a main file that `\input`s its slides, figures found through `\graphicspath`, a
 * bibliography, a local theme, and the litter an archive usually carries.
 */

const R = String.raw;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const PDF = new TextEncoder().encode('%PDF-1.4 fake');

const MAIN = [
  R`\documentclass{beamer}`,
  R`\usetheme{Local}`,
  R`\graphicspath{{figures/}}`,
  R`\title{Gait}`,
  R`\begin{document}`,
  R`\input{slides/intro}`,
  R`\input{slides/results}`,
  R`\end{document}`,
].join('\n');

async function overleafZip(extra: Record<string, string | Uint8Array> = {}): Promise<Blob> {
  const zip = new JSZip();
  const put = (path: string, content: string | Uint8Array): void => { zip.file(`gait-talk/${path}`, content); };
  put('main.tex', MAIN);
  put('slides/intro.tex', [R`\begin{frame}`, R`\frametitle{Intro}`, R`\includegraphics[width=0.5\textwidth]{plot}`, R`\end{frame}`].join('\n'));
  put('slides/results.tex', [R`\begin{frame}`, R`\frametitle{Results}`, R`\includegraphics{curve}`, R`\end{frame}`].join('\n'));
  put('figures/plot.png', PNG);
  put('figures/curve.pdf', PDF);
  put('figures/unused.png', PNG);
  put('refs.bib', '@article{a, title={A}}');
  put('beamerthemeLocal.sty', R`\ProvidesPackage{beamerthemeLocal}`);
  put('main.pdf', PDF);
  put('main.aux', 'aux');
  zip.file('__MACOSX/gait-talk/._main.tex', 'junk');
  for (const [p, c] of Object.entries(extra)) put(p, c);
  return zip.generateAsync({ type: 'blob' });
}

describe('reading a project archive', () => {
  it('drops the wrapping folder, the macOS litter and the build output', async () => {
    const project = await readProjectZip(await overleafZip());
    expect([...project.files.keys()].sort()).toEqual([
      'beamerthemeLocal.sty', 'figures/curve.pdf', 'figures/plot.png', 'figures/unused.png',
      'main.pdf', 'main.tex', 'refs.bib', 'slides/intro.tex', 'slides/results.tex',
    ]);
    expect(project.files.get('main.tex')!.text).toBe(MAIN);
    expect(project.files.get('figures/plot.png')!.text).toBeNull();
  });

  it('finds the main document, preferring main.tex', async () => {
    const project = await readProjectZip(await overleafZip({
      'handout.tex': R`\documentclass{article}\begin{document}x\end{document}`,
    }));
    expect(findMainCandidates(project)).toEqual(['main.tex', 'handout.tex']);
  });

  it('recognises a zip by name or type', () => {
    expect(isZipFile(new File([], 'talk.zip'))).toBe(true);
    expect(isZipFile(new File([], 'talk.tex'))).toBe(false);
  });
});

describe('analysing a project', () => {
  it('merges the slide files into one deck of editable slides', async () => {
    const a = analyseProject(await readProjectZip(await overleafZip()), 'main.tex');
    expect(a.project.inlined).toEqual(['slides/intro.tex', 'slides/results.tex']);
    expect(a.project.missingInputs).toEqual([]);
    expect(a.report.slides).toBe(2);
    expect(a.report.elements.image).toBe(2);
    expect(a.report.raw.filter((r) => r.slide !== null)).toEqual([]);
  });

  it('finds every image in the archive, through \\graphicspath and without extensions', async () => {
    const a = analyseProject(await readProjectZip(await overleafZip()), 'main.tex');
    expect([...a.project.images.values()].sort()).toEqual(['figures/curve.pdf', 'figures/plot.png']);
    // So nothing is left for the user to pick by hand.
    expect(a.report.missingResources).toEqual([]);
  });

  it('keeps the other files for the compiler, but not the merged text or the old PDF', async () => {
    const a = analyseProject(await readProjectZip(await overleafZip()), 'main.tex');
    expect(a.project.support.map((f) => f.path).sort()).toEqual([
      'beamerthemeLocal.sty', 'figures/unused.png', 'refs.bib',
    ]);
  });

  it('reports an include the archive cannot supply', async () => {
    const project = await readProjectZip(await overleafZip());
    project.files.delete('slides/results.tex');
    const a = analyseProject(project, 'main.tex');
    expect(a.project.missingInputs).toEqual(['slides/results']);
  });

  it('flags EPS figures, which the in-browser engine cannot convert', async () => {
    const a = analyseProject(await readProjectZip(await overleafZip({ 'figures/old.eps': '%!PS' })), 'main.tex');
    expect(a.project.eps).toEqual(['figures/old.eps']);
  });
});
