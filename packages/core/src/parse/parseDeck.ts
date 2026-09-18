/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import type { Deck, Element } from '../model/types.js';
import { newId } from '../model/ids.js';
import { buildCst } from './lexer.js';
import type { ParseDiagnostic } from './cst.js';
import { toModel } from './toModel.js';
import { guardDeck, significantTokens, tokensEqual, type GuardReport } from './guard.js';
import { emitDeck } from '../emit/deck.js';
import { reassignIds } from './reid.js';

export interface ParseOptions {
  /** Previous deck, used to carry ids onto structurally-matching nodes. */
  previous?: Deck;
  /** Id factory; injectable so tests can assert on exact models. */
  newId?: () => string;
}

export interface ParseHealth {
  /** True when the whole document re-emits to the same token stream. */
  fixpoint: boolean;
  /** Elements the guard demoted to raw. */
  demoted: number;
  /** Fraction of the source preserved as raw rather than modelled. */
  rawRatio: number;
  parseErrors: number;
}

export interface ParseResult {
  deck: Deck;
  diagnostics: ParseDiagnostic[];
  guard: GuardReport;
  health: ParseHealth;
}

/**
 * Parse LaTeX into a deck.
 *
 * Three stages, in order: a total CST build, all-or-nothing recognizers, then the
 * round-trip guard that demotes anything which does not re-emit identically. The
 * result always represents the input faithfully — at worst as raw blocks.
 */
export function parseDeck(source: string, opts: ParseOptions = {}): ParseResult {
  const idFactory = opts.newId ?? newId;
  const { root, diagnostics } = buildCst(source);

  const deckId = opts.previous?.id ?? idFactory();
  const { deck: rawDeck } = toModel(root, source, idFactory, deckId, {
    ...(opts.previous !== undefined ? { previous: opts.previous } : {}),
  });
  const { deck: guarded, report } = guardDeck(rawDeck, source);

  const deck = opts.previous === undefined
    ? guarded
    : reassignIds(guarded, opts.previous).deck;

  // The guard works frame by frame, so on its own it says nothing about the preamble.
  // Compare the whole document to get an honest fixpoint signal.
  const fixpoint = tokensEqual(
    significantTokens(source),
    significantTokens(emitDeck(deck).tex),
  );

  return {
    deck,
    diagnostics,
    guard: report,
    health: {
      fixpoint,
      demoted: report.demoted,
      rawRatio: rawCharRatio(deck, source),
      parseErrors: diagnostics.filter((d) => d.severity === 'error').length,
    },
  };
}

/**
 * Fraction of the document held as raw rather than modelled.
 *
 * This is the health metric worth tracking against a corpus of real decks — far more
 * useful than chasing individual unsupported macros.
 */
function rawCharRatio(deck: Deck, source: string): number {
  if (source.length === 0) return 0;
  let raw = 0;

  const visitElements = (els: Element[]): void => {
    for (const el of els) {
      if (el.kind === 'raw') raw += el.tex.length;
      else if (el.kind === 'block') visitElements(el.children);
      else if (el.kind === 'columns') el.columns.forEach((c) => visitElements(c.children));
    }
  };

  for (const node of deck.nodes) {
    if (node.kind === 'rawdoc') raw += node.tex.length;
    else if (node.kind === 'frame') visitElements(node.children);
  }

  return Math.min(1, raw / source.length);
}
