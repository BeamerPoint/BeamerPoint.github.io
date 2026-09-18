/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import type { Deck, Element, PackageSpec, RichText } from '../model/types.js';
import { TIKZ_LIBRARIES, TIKZ_LIBRARIES_LEGACY } from './tikz.js';
import { LST_SETUP_LINES, lstSetupLines } from './lstLanguages.js';

/**
 * Compute the packages a deck's content requires, so the user never has to think
 * about `\usepackage` lines.
 *
 * This is also what makes `emit -> parse -> emit` a fixpoint: on parse, a
 * `\usepackage` that exactly matches a derived entry is absorbed with `derived: true`
 * rather than being recorded as user-owned, so re-emitting produces the same file.
 */
export interface DerivedPackage extends PackageSpec {
  derived: true;
  /** Preamble lines that must follow the \usepackage, e.g. pgfplots compat. */
  setup?: string[];
}

/**
 * Preamble lines the emitter generates as part of a derived package's setup.
 *
 * The parser must absorb these rather than recording them as user-owned chunks:
 * otherwise a round trip emits them once from the derived package and once from the
 * chunk, and the preamble grows a duplicate on every edit.
 *
 * This set is the single source of truth for that ownership; both sides read it.
 */
export const DERIVED_SETUP_LINES: ReadonlySet<string> = new Set([
  TIKZ_LIBRARIES,
  TIKZ_LIBRARIES_LEGACY,
  ...LST_SETUP_LINES,
  '\\pgfplotsset{compat=1.18}',
  '\\setlength{\\TPHorizModule}{1mm}',
  '\\setlength{\\TPVertModule}{1mm}',
  '\\textblockorigin{0mm}{0mm}',
]);

/** True when a preamble line is owned by the emitter's derived-package machinery. */
export function isDerivedSetupLine(tex: string): boolean {
  return DERIVED_SETUP_LINES.has(tex.replace(/\s+/g, ''))
    || DERIVED_SETUP_LINES.has(tex.trim());
}

export function derivePackages(deck: Deck): DerivedPackage[] {
  const need = new Map<string, DerivedPackage>();

  const add = (name: string, options: string[] = [], setup?: string[]): void => {
    const existing = need.get(name);
    if (existing === undefined) {
      need.set(name, { name, options, derived: true, ...(setup ? { setup } : {}) });
      return;
    }
    // Union options, preserving first-seen order.
    for (const o of options) if (!existing.options.includes(o)) existing.options.push(o);
  };

  let sawAbsoluteTextpos = false;
  let sawNatbibCite = false;

  /**
   * Look through rich text for a natbib citation.
   *
   * `\citep` and `\citet` are natbib's, not LaTeX's, and without the package they are
   * undefined control sequences -- no PDF at all, the same class of failure as an
   * unknown `listings` language. natbib rides the `\bibliographystyle` +
   * `\bibliography` + BibTeX pipeline the deck already uses, so this is additive.
   * biblatex's `\autocite`/`\textcite` derive NOTHING: biblatex replaces that
   * pipeline, so the deck that uses them brings its own preamble.
   */
  const visitRich = (rt: RichText): void => {
    for (const n of rt) {
      if (n.t === 'cite' && (n.style === 'p' || n.style === 't')) sawNatbibCite = true;
      else if (n.t === 'style' || n.t === 'link') visitRich(n.children);
    }
  };
  const codeLanguages = new Set<string>();

  const visitElement = (el: Element): void => {
    switch (el.kind) {
      case 'text': visitRich(el.content); break;
      case 'list': el.items.forEach(function walk(i): void {
        visitRich(i.content);
        i.sublist?.items.forEach(walk);
      }); break;
      case 'table':
        el.rows.forEach((r) => r.cells.forEach((c) => visitRich(c.content)));
        break;
      case 'block':
        if (el.title !== undefined) visitRich(el.title);
        break;
      default: break;
    }

    if (el.placement.mode === 'absolute') {
      if (el.placement.driver === 'textpos') sawAbsoluteTextpos = true;
      else add('tikz');
      if (el.placement.rotate) add('graphicx');
    }

    switch (el.kind) {
      case 'image':
        add('graphicx');
        // A see-through picture is wrapped in a one-node tikzpicture, because that is
        // the only thing measured to actually put an alpha in the PDF. No libraries:
        // the node is a plain rectangle with no shape key.
        if (el.opacity !== undefined && el.opacity < 1) add('tikz');
        break;
      case 'table': {
        // Derive from the rules actually present, not from `style`: `style` is a UI
        // hint, and a table whose rules were hand-edited in the source would
        // otherwise compile with \toprule undefined.
        const rules = [el.topRule, ...el.rows.map((r) => r.ruleBelow)];
        if (rules.some((r) => r !== undefined && r.k !== 'hline')) add('booktabs');
        if (el.fit === 'tabularx') add('tabularx');
        if (el.fit === 'resizebox') add('graphicx');
        // Measured: without colortbl, `\rowcolor` is an undefined control sequence and
        // the deck does not compile. beamer already loads xcolor, so colortbl on its
        // own is the smaller ask than re-loading xcolor with its `table` option.
        if (el.rows.some((r) => r.fill !== undefined || r.cells.some((c) => c.fill !== undefined))) {
          add('colortbl');
        }
        break;
      }
      case 'math':
        add('amsmath');
        add('amssymb');
        break;
      case 'code':
        // The house style and any `\lstdefinelanguage` are added once at the end, from
        // the languages the deck actually uses -- a per-element `setup` would repeat
        // them and the order would depend on which listing came first.
        if (el.backend === 'listings') {
          add('listings');
          add('xcolor');
          if (el.language !== '') codeLanguages.add(el.language);
        }
        if (el.backend === 'minted') add('minted');
        break;
      case 'tikz':
        // Verified against the engine: without these libraries an `ellipse` node
        // fails with "I do not know the key '/tikz/ellipse'" and produces no PDF.
        add('tikz', [], [TIKZ_LIBRARIES]);
        break;
      case 'chart':
        add('pgfplots', [], ['\\pgfplotsset{compat=1.18}']);
        break;
      case 'block':
        el.children.forEach(visitElement);
        break;
      case 'columns':
        el.columns.forEach((c) => c.children.forEach(visitElement));
        break;
      default:
        break;
    }
  };

  for (const node of deck.nodes) {
    if (node.kind !== 'frame') continue;
    node.children.forEach(visitElement);
  }

  // BibTeX needs no package: `\bibliography` and `\bibliographystyle` are LaTeX's own.
  // (There used to be an `add('')` here, which `need.delete('')` removed again.)

  // Any inline math anywhere also wants amsmath; cheap to detect via a serialised scan
  // of text content would be fragile, so keep it content-driven above only.

  if (need.has('listings')) {
    const listings = need.get('listings')!;
    listings.setup = lstSetupLines(codeLanguages);
  }

  if (sawNatbibCite) add('natbib');

  if (sawAbsoluteTextpos) {
    add('textpos', ['absolute', 'overlay'], [
      '\\setlength{\\TPHorizModule}{1mm}',
      '\\setlength{\\TPVertModule}{1mm}',
      '\\textblockorigin{0mm}{0mm}',
    ]);
  }

  // No inputenc/fontenc derivation. The flag that would have driven it was declared and
  // never set, so this never ran -- and measuring showed it would have been useless in
  // both directions. This TeX Live's pdflatex reads UTF-8 natively: `é ü ß ï ñ å ç` and
  // `— “ ” …` all compile bare with no Missing character warnings, and adding
  // `inputenc`+`fontenc` changes nothing. What DOES fail -- a Greek `α` -- fails
  // identically with them loaded, because that needs a Unicode engine, not an encoding
  // package. So the derivation could not fix the case that breaks and was not needed by
  // the case that works.

  need.delete('');

  const suppressed = new Set(deck.preamble.suppressedDerived);
  return [...need.values()].filter((p) => !suppressed.has(p.name));
}

/** Format a `\usepackage` line. */
export function packageLine(p: PackageSpec): string {
  const opts = p.options.length > 0 ? `[${p.options.join(',')}]` : '';
  return `\\usepackage${opts}{${p.name}}`;
}
