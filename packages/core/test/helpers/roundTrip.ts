/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { expect } from 'vitest';
import { emitDeck } from '../../src/emit/deck.js';
import { parseDeck, type ParseResult } from '../../src/parse/parseDeck.js';
import { makeSeededIdFactory } from '../../src/model/ids.js';
import type { Deck, Element } from '../../src/model/types.js';

/**
 * The round-trip assertion, meaning what it says.
 *
 * Byte fixpoint and `guard.ok` are NOT evidence that parsing worked. A `raw` element
 * re-emits its captured bytes verbatim, so a deck the recognizers understood none of is
 * byte-perfect and guard-clean. `health.demoted` does not close that either: it counts
 * only what the GUARD demoted, and a recognizer that declines -- the all-or-nothing rule
 * doing its job -- produces raw that never reaches the guard at all (`guard.ts` returns
 * early for anything already raw). Measured on the live model: one unmodelled
 * environment round-trips with fixpoint, `guard.ok` and `demoted: 0` all true.
 *
 * So the load-bearing clause is the CENSUS: the element kinds that went in must be the
 * kinds that came out. That also catches the quieter failure where two elements fold into
 * one -- a bare control word absorbed into the preceding paragraph as a `sym` -- which
 * leaves every health number clean.
 */

export interface RoundTripOptions {
  /** Cycles of emit → parse → emit to require byte-identical. Default 3. */
  cycles?: number;
}

/** Every element in the deck, depth-first, including those nested in blocks and columns. */
export function allElements(deck: Deck): Element[] {
  const out: Element[] = [];
  const visit = (els: readonly Element[]): void => {
    for (const el of els) {
      out.push(el);
      if (el.kind === 'block') visit(el.children);
      else if (el.kind === 'columns') for (const c of el.columns) visit(c.children);
    }
  };
  for (const n of deck.nodes) if (n.kind === 'frame') visit(n.children);
  return out;
}

/**
 * A sorted multiset of what the deck is made of -- document nodes as `node:<kind>` and
 * elements as their kind. Order-insensitive, count-sensitive. Node kinds are included
 * because a whole frame can degrade to a document-level `rawdoc`, which `rawRatio` counts
 * and an element-only census would see merely as elements going missing.
 */
export function kindCensus(deck: Deck): string[] {
  return [
    ...deck.nodes.map((n) => `node:${n.kind}`),
    ...allElements(deck).map((e) => e.kind),
  ].sort();
}

/** Raw elements plus document-level raw nodes: exactly what `rawRatio` measures. */
function rawCount(deck: Deck): number {
  return deck.nodes.filter((n) => n.kind === 'rawdoc').length
    + allElements(deck).filter((e) => e.kind === 'raw').length;
}

function parse(tex: string, seed: string): ParseResult {
  return parseDeck(tex, { newId: makeSeededIdFactory(seed) });
}

/**
 * Emit a deck, parse it back, and require that nothing about it changed.
 *
 * Clauses, in order, so the first failure is the most specific one: bytes over several
 * cycles; the guard; the guard's demotion count; the whole-document token fixpoint, which
 * is the only signal covering the PREAMBLE because the guard is frame-scoped; no parse
 * errors; no raw; and the census.
 */
export function expectRoundTrip(
  deck: Deck,
  opts: RoundTripOptions = {},
): { tex: string; round: ParseResult } {
  const cycles = opts.cycles ?? 3;
  const tex = emitDeck(deck).tex;

  let round = parse(tex, 'r');
  let current = tex;
  for (let i = 1; i <= cycles; i++) {
    const again = emitDeck(round.deck).tex;
    expect(again, `byte fixpoint, cycle ${i}`).toBe(current);
    current = again;
    if (i < cycles) round = parse(again, `r${i}`);
  }

  round = parse(tex, 'r');
  expect(round.guard.ok, 'guard.ok').toBe(true);
  expect(round.health.demoted, 'health.demoted').toBe(0);
  expect(round.health.fixpoint, 'health.fixpoint (whole document, incl. preamble)').toBe(true);
  expect(round.health.parseErrors, 'parse errors').toBe(0);

  // Raw that went in may come out; raw that did not go in must not appear.
  if (rawCount(deck) === 0) expect(round.health.rawRatio, 'rawRatio').toBe(0);
  expect(rawCount(round.deck), 'raw elements and raw document nodes').toBe(rawCount(deck));
  expect(kindCensus(round.deck), 'what the deck is made of, after the round trip')
    .toEqual(kindCensus(deck));

  return { tex, round };
}

/**
 * Parse SOURCE text and require it to come back as the given kinds -- for tests that
 * start from LaTeX (import, degradation) rather than from a model.
 */
export function expectParsesTo(
  tex: string,
  kinds: readonly string[],
): ParseResult {
  const round = parse(tex, 'p');
  expect(round.guard.ok, 'guard.ok').toBe(true);
  expect(kindCensus(round.deck), 'element kinds').toEqual([...kinds].sort());
  return round;
}
