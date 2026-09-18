/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import type { Id } from '../model/types.js';

/**
 * Where a model node ended up in the emitted source.
 *
 * This is the mechanism that replaces marker comments: instead of polluting the .tex
 * with anchors, the emitter records offsets as it writes. Selection sync and compile
 * error attribution both read this, and the output stays clean.
 */
export interface SourceMapEntry {
  nodeId: Id;
  kind: string;
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  /** Nesting depth; the innermost entry wins on lookup. */
  depth: number;
}

export type SourceMap = SourceMapEntry[];

export interface TexWriterOptions {
  indent?: string;
  collectSourceMap?: boolean;
}

export class TexWriter {
  private chunks: string[] = [];
  private len = 0;
  private line = 1;
  private depth = 0;
  private indentLevel = 0;
  private readonly indentUnit: string;
  private readonly collect: boolean;
  private readonly map: SourceMapEntry[] = [];
  /** True when nothing has been written on the current line yet. */
  private atLineStart = true;

  constructor(opts: TexWriterOptions = {}) {
    this.indentUnit = opts.indent ?? '  ';
    this.collect = opts.collectSourceMap ?? true;
  }

  /** Append text exactly, with no indentation handling. */
  raw(s: string): this {
    if (s.length === 0) return this;
    this.chunks.push(s);
    this.len += s.length;
    let nl = 0;
    for (let i = 0; i < s.length; i++) if (s[i] === '\n') nl += 1;
    if (nl > 0) {
      this.line += nl;
      this.atLineStart = s.endsWith('\n');
    } else {
      this.atLineStart = false;
    }
    return this;
  }

  /** Write one indented line. */
  line_(s = ''): this {
    if (!this.atLineStart) this.raw('\n');
    if (s.length > 0) this.raw(this.indentUnit.repeat(this.indentLevel) + s);
    this.raw('\n');
    return this;
  }

  /** Write text at the current position, indenting first if at a line start. */
  text(s: string): this {
    if (this.atLineStart && s.length > 0) {
      this.raw(this.indentUnit.repeat(this.indentLevel));
    }
    return this.raw(s);
  }

  /** Ensure the cursor is at the start of a fresh line. */
  nl(): this {
    if (!this.atLineStart) this.raw('\n');
    return this;
  }

  /** One blank line, collapsing consecutive calls. */
  blank(): this {
    this.nl();
    const tail = this.chunks.length > 0 ? this.chunks.join('').slice(-2) : '';
    if (!tail.endsWith('\n\n') && this.len > 0) this.raw('\n');
    return this;
  }

  indented(fn: () => void): this {
    this.indentLevel += 1;
    try {
      fn();
    } finally {
      this.indentLevel -= 1;
    }
    return this;
  }

  /** Record the span that `fn` writes under `nodeId`. */
  span<T>(nodeId: Id, kind: string, fn: () => T): T {
    if (!this.collect) return fn();
    const start = this.len;
    const startLine = this.line;
    this.depth += 1;
    let result: T;
    try {
      result = fn();
    } finally {
      this.depth -= 1;
    }
    this.map.push({
      nodeId,
      kind,
      start,
      end: this.len,
      startLine,
      endLine: this.line,
      depth: this.depth,
    });
    return result;
  }

  finish(): { tex: string; sourceMap: SourceMap } {
    const tex = this.chunks.join('');
    // Sort by start, then by descending depth so the innermost entry is found first.
    const sourceMap = [...this.map].sort((a, b) => a.start - b.start || b.depth - a.depth);
    return { tex, sourceMap };
  }
}

/** Innermost entry whose span contains `offset`. */
export function lookupByOffset(map: SourceMap, offset: number): SourceMapEntry | undefined {
  let best: SourceMapEntry | undefined;
  for (const e of map) {
    if (e.start > offset) break;
    if (offset < e.end && (best === undefined || e.depth >= best.depth)) best = e;
  }
  return best;
}

/** Innermost entry covering a 1-based line number. */
export function lookupByLine(map: SourceMap, line: number): SourceMapEntry | undefined {
  let best: SourceMapEntry | undefined;
  for (const e of map) {
    if (e.startLine <= line && line <= e.endLine) {
      if (best === undefined || e.depth >= best.depth) best = e;
    }
  }
  return best;
}

/** All entries of a given kind, in document order. */
export function entriesOfKind(map: SourceMap, kind: string): SourceMapEntry[] {
  return map.filter((e) => e.kind === kind).sort((a, b) => a.start - b.start);
}
