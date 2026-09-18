/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { describe, expect, it } from 'vitest';
import { analyseImport, matchResources } from '../src/io/importTex.js';

/** A small but realistic third-party deck, written the way people actually write them. */
const FOREIGN = String.raw`\documentclass[10pt]{beamer}
\usetheme{Warsaw}
\usepackage{graphicx}
\usepackage{tcolorbox}

\title{Foreign Deck}
\author{Someone Else}

\begin{document}

\frame{\titlepage}

\begin{frame}{Overview}
  Some ordinary prose.
  \begin{itemize}
    \item First point
    \item Second point
  \end{itemize}
\end{frame}

\begin{frame}
  \frametitle{Results}
  \begin{columns}
    \begin{column}{0.5\textwidth}
      \includegraphics[width=\textwidth]{figures/plot.png}
    \end{column}
    \begin{column}{0.5\textwidth}
      \begin{tcolorbox}[title=Careful]
        This package is not modelled.
      \end{tcolorbox}
    \end{column}
  \end{columns}
\end{frame}

\end{document}`;

describe('importing an external .tex', () => {
  it('reports the slides and the structure it understood', () => {
    const { report } = analyseImport(FOREIGN);

    expect(report.slides).toBe(3);
    expect(report.elements.list).toBe(1);
    expect(report.elements.columns).toBe(1);
    expect(report.elements.image).toBe(1);
    expect(report.theme).toBe('Warsaw');
    expect(report.themeProblem).toBeNull();
  });

  it('names what it could not model rather than hiding it', () => {
    const { report } = analyseImport(FOREIGN);

    // tcolorbox has no model, so it must surface as a raw block the user can see --
    // silently dropping it, or counting it as a success, is the failure mode here.
    const labels = report.raw.map((r) => r.label);
    expect(labels).toContain('\\begin{tcolorbox}');
    expect(report.raw.every((r) => r.slide === null || r.slide >= 1)).toBe(true);
  });

  it('lists the images the file references but does not carry', () => {
    const { report } = analyseImport(FOREIGN);
    expect(report.missingResources).toEqual(['figures/plot.png']);
  });

  it('reports user packages, not the ones the emitter derives', () => {
    const { report } = analyseImport(FOREIGN);
    expect(report.packages).toContain('tcolorbox');
    // graphicx is derived from the image, so it is the emitter's, not the user's.
    expect(report.packages).not.toContain('booktabs');
  });

  it('flags a theme that cannot compile with the bundled collections', () => {
    const { report } = analyseImport(
      FOREIGN.replace('\\usetheme{Warsaw}', '\\usetheme{focus}'),
    );
    expect(report.theme).toBe('focus');
    expect(report.themeProblem).not.toBeNull();
  });

  it('recognises a file that is not a presentation at all', () => {
    const { report } = analyseImport(
      '\\documentclass{article}\n\\begin{document}\nJust an article.\n\\end{document}',
    );
    expect(report.slides).toBe(0);
  });

  it('never loses content: the import re-emits what it read', () => {
    const { deck } = analyseImport(FOREIGN);
    // Everything unmodelled is raw, so the tcolorbox body must still be in the deck.
    const asText = JSON.stringify(deck);
    expect(asText).toContain('tcolorbox');
    expect(asText).toContain('This package is not modelled.');
  });
});

describe('matching picked files onto referenced paths', () => {
  const file = (name: string): File =>
    new File([new Uint8Array([1])], name, { type: 'image/png' });

  it('matches by basename, because the deck holds a path and the picker gives a name', () => {
    const matched = matchResources(['figures/plot.png', 'img/logo.png'], [file('plot.png')]);
    expect(matched[0]!.file?.name).toBe('plot.png');
    expect(matched[1]!.file).toBeNull();
  });

  it('is case-insensitive', () => {
    const matched = matchResources(['figures/Plot.PNG'], [file('plot.png')]);
    expect(matched[0]!.file?.name).toBe('plot.png');
  });

  it('refuses to guess when two picked files share a name', () => {
    // Picking two different plot.png files from different folders is easy to do by
    // accident, and quietly choosing one would put the wrong image in the deck.
    const matched = matchResources(['a/plot.png'], [file('plot.png'), file('plot.png')]);
    expect(matched[0]!.file).toBeNull();
    expect(matched[0]!.ambiguous).toBe(true);
  });
});
