/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import {
  parseDeck,
  themeUnavailableReason,
  type Deck,
  type Element,
  type ElementKind,
} from '@beamerpoint/core';

/**
 * Importing someone else's `.tex`.
 *
 * The parser already reads arbitrary LaTeX — that is the whole point of the total
 * lexer and the verify-and-degrade guard. What an import needs on top is an honest
 * account of what happened, BEFORE the user replaces their deck: how much became
 * editable, how much stayed raw, and what will stop it compiling here.
 *
 * Nothing in this file is allowed to describe an import as better than it is.
 */

export interface RawBlock {
  /** Best-effort label, e.g. `\begin{tcolorbox}`. */
  label: string;
  /** 1-based slide number it sits on, or null for a document-level block. */
  slide: number | null;
  lines: number;
}

export interface ImportReport {
  /** Frames found. A file with none is almost certainly not a Beamer deck. */
  slides: number;
  /** Count by element kind, for the "what you get" summary. */
  elements: Partial<Record<ElementKind, number>>;
  raw: RawBlock[];
  /** Proportion of the source kept verbatim rather than modelled, 0..1. */
  rawRatio: number;
  parseErrors: number;
  /** Image and .bib paths the document references, which we do not have bytes for. */
  missingResources: string[];
  /** Packages the document loads, for the bundled-or-not check. */
  packages: string[];
  theme: string | null;
  /** Set when the theme is one that cannot compile with the bundled collections. */
  themeProblem: string | null;
}

function countElements(els: readonly Element[], into: Partial<Record<ElementKind, number>>): void {
  for (const el of els) {
    into[el.kind] = (into[el.kind] ?? 0) + 1;
    if (el.kind === 'block') countElements(el.children, into);
    else if (el.kind === 'columns') el.columns.forEach((c) => countElements(c.children, into));
  }
}

function collectRaw(deck: Deck): RawBlock[] {
  const out: RawBlock[] = [];
  let slide = 0;

  const visit = (els: readonly Element[], on: number): void => {
    for (const el of els) {
      if (el.kind === 'raw') {
        out.push({
          label: el.label ?? 'LaTeX',
          slide: on === 0 ? null : on,
          lines: el.tex.split('\n').length,
        });
      } else if (el.kind === 'block') visit(el.children, on);
      else if (el.kind === 'columns') el.columns.forEach((c) => visit(c.children, on));
    }
  };

  for (const node of deck.nodes) {
    if (node.kind === 'frame') {
      slide += 1;
      visit(node.children, slide);
    } else if (node.kind === 'rawdoc') {
      out.push({ label: 'document-level LaTeX', slide: null, lines: node.tex.split('\n').length });
    }
  }
  return out;
}

export interface ImportAnalysis {
  deck: Deck;
  report: ImportReport;
}

/**
 * Parse an external `.tex` and describe what came of it.
 *
 * The deck is returned but NOT applied — the caller shows the report first, because
 * an import replaces whatever the user currently has open.
 */
export function analyseImport(source: string): ImportAnalysis {
  const parsed = parseDeck(source);
  const deck = parsed.deck;

  const elements: Partial<Record<ElementKind, number>> = {};
  let slides = 0;
  for (const node of deck.nodes) {
    if (node.kind !== 'frame') continue;
    slides += 1;
    countElements(node.children, elements);
  }

  const themeName = deck.preamble.theme?.name ?? null;
  const themeProblem = themeName === null ? null : themeUnavailableReason(themeName) ?? null;

  return {
    deck,
    report: {
      slides,
      elements,
      raw: collectRaw(deck),
      rawRatio: parsed.health.rawRatio,
      parseErrors: parsed.health.parseErrors,
      // Every resource is missing on import: the .tex names paths, and we have none
      // of the bytes until the user supplies the files.
      missingResources: deck.resources.map((r) => r.path),
      packages: deck.preamble.packages.filter((p) => p.derived !== true).map((p) => p.name),
      theme: themeName,
      themeProblem,
    },
  };
}

/**
 * Match picked files onto the paths a deck references.
 *
 * Matching is by basename, because a deck written elsewhere refers to
 * `figures/plot.png` while the file the user picks is just `plot.png`. Ambiguous
 * basenames are reported rather than guessed at.
 */
export interface ResourceMatch {
  path: string;
  file: File | null;
  /** True when more than one picked file has this basename. */
  ambiguous: boolean;
}

export function matchResources(paths: readonly string[], files: readonly File[]): ResourceMatch[] {
  const byName = new Map<string, File[]>();
  for (const f of files) {
    const name = f.name.toLowerCase();
    byName.set(name, [...(byName.get(name) ?? []), f]);
  }

  return paths.map((path) => {
    const base = (path.split('/').pop() ?? path).toLowerCase();
    const hits = byName.get(base) ?? [];
    return {
      path,
      file: hits.length === 1 ? hits[0]! : null,
      ambiguous: hits.length > 1,
    };
  });
}
