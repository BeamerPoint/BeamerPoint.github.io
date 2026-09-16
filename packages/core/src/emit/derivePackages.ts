import type { Deck, Element, PackageSpec } from '../model/types.js';
import { TIKZ_LIBRARIES } from './tikz.js';

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
  let sawNonAscii = false;

  const visitElement = (el: Element): void => {
    if (el.placement.mode === 'absolute') {
      if (el.placement.driver === 'textpos') sawAbsoluteTextpos = true;
      else add('tikz');
      if (el.placement.rotate) add('graphicx');
    }

    switch (el.kind) {
      case 'image':
        add('graphicx');
        break;
      case 'table': {
        // Derive from the rules actually present, not from `style`: `style` is a UI
        // hint, and a table whose rules were hand-edited in the source would
        // otherwise compile with \toprule undefined.
        const rules = [el.topRule, ...el.rows.map((r) => r.ruleBelow)];
        if (rules.some((r) => r !== undefined && r.k !== 'hline')) add('booktabs');
        if (el.fit === 'tabularx') add('tabularx');
        if (el.fit === 'resizebox') add('graphicx');
        break;
      }
      case 'math':
        add('amsmath');
        add('amssymb');
        break;
      case 'code':
        if (el.backend === 'listings') { add('listings'); add('xcolor'); }
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

  if (deck.meta.titlegraphicResourceId !== undefined) add('graphicx');
  if (deck.preamble.bibliography !== undefined) add('');

  // Any inline math anywhere also wants amsmath; cheap to detect via a serialised scan
  // of text content would be fragile, so keep it content-driven above only.

  if (sawAbsoluteTextpos) {
    add('textpos', ['absolute', 'overlay'], [
      '\\setlength{\\TPHorizModule}{1mm}',
      '\\setlength{\\TPVertModule}{1mm}',
      '\\textblockorigin{0mm}{0mm}',
    ]);
  }

  // Non-ASCII is only a problem under pdflatex; beamer already loads fontenc for us
  // under xelatex/lualatex. We derive conservatively.
  if (sawNonAscii) {
    add('inputenc', ['utf8']);
    add('fontenc', ['T1']);
  }

  need.delete('');

  const suppressed = new Set(deck.preamble.suppressedDerived);
  return [...need.values()].filter((p) => !suppressed.has(p.name));
}

/** Format a `\usepackage` line. */
export function packageLine(p: PackageSpec): string {
  const opts = p.options.length > 0 ? `[${p.options.join(',')}]` : '';
  return `\\usepackage${opts}{${p.name}}`;
}
