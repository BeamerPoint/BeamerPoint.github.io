import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findMissingFiles, logIndicatesFailure, parseLog } from '../src/logParser.js';

/**
 * Reading a TeX log, against logs the bundled engine really wrote.
 *
 * Nothing had ever parsed a log in a test. The fixtures here are captured by the engine
 * conformance runner (`npm run test:engine`), not typed by hand -- an imitation log tests
 * the imitation. Short synthetic logs are used only for rules that are about TeX's log
 * FORMAT rather than about this engine.
 */

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/logs/${name}`, import.meta.url), 'utf8');

describe('a real failure: minted without shell escape', () => {
  const log = fixture('minted-no-shell-escape.log');
  const errors = parseLog(log).filter((d) => d.severity === 'error');

  it('knows the run produced no PDF', () => {
    expect(logIndicatesFailure(log)).toBe(true);
  });

  it('rejoins a message TeX wrapped mid-word at 79 columns', () => {
    // The raw log reads "...style "default" (mi" / "nted executable is unavailable...".
    // The engine is meant to be asked for a wide print line; it is not honoured, so the
    // unwrapping here is doing all of the work.
    const minted = errors.find((e) => e.message.startsWith('Package minted Error'));
    expect(minted?.message).toContain('(minted executable is unavailable or disabled)');
  });

  it('reports no missing files, because none are missing', () => {
    expect(findMissingFiles(log)).toEqual([]);
  });

  // F-013 (tools/audit-2026-09.md). busytex's log is several sections -- TEXMFLOG, LOG,
  // STDOUT, STDERR -- and LOG and STDOUT both carry the same error, so every diagnostic is
  // reported twice. Remove `.fails` when it is fixed.
  it.fails('reports each error once', () => {
    const messages = errors.map((e) => e.message);
    expect(messages).toEqual([...new Set(messages)]);
  });
});

describe('the TeX log format', () => {
  it('gives an error the line number of its l.NNN marker, when it is in the main file', () => {
    const log = [
      '(./main.tex',
      '! Undefined control sequence.',
      'l.12 \\foo',
      ')',
    ].join('\n');
    const [e] = parseLog(log);
    expect(e).toMatchObject({ severity: 'error', code: 'tex.undefined-control-sequence', line: 12 });
  });

  it('does not attribute an error inside an included file to a line of main.tex', () => {
    const log = [
      '(./main.tex (/texlive/texmf-dist/tex/latex/foo/foo.sty',
      '! Undefined control sequence.',
      'l.40 \\bar',
      '))',
    ].join('\n');
    expect(parseLog(log)[0]!.line).toBeUndefined();
  });

  it('reads an overfull box as a fidelity signal with its line', () => {
    const log = '(./main.tex\nOverfull \\hbox (12.3pt too wide) in paragraph at lines 20--22\n)';
    expect(parseLog(log)[0]).toMatchObject({ severity: 'fidelity', code: 'tex.overfull-hbox', line: 20 });
  });

  it('continues a warning only onto lines indented with the package name', () => {
    const log = [
      '(./main.tex',
      'Package hyperref Warning: Token not allowed in a PDF string',
      '(hyperref)                removing `math shift\' on input line 9.',
      '(./main.aux)',
      ')',
    ].join('\n');
    const [w] = parseLog(log);
    expect(w!.message).toBe(
      "Token not allowed in a PDF string removing `math shift' on input line 9.",
    );
    expect(w!.line).toBe(9);
  });

  it('names a missing package, class and graphic by kind', () => {
    const log = [
      "! LaTeX Error: File `nonesuch.sty' not found.",
      "! LaTeX Error: File `weird.cls' not found.",
      "! LaTeX Error: File `plot.png' not found.",
    ].join('\n');
    expect(findMissingFiles(log).map((m) => [m.file, m.kind])).toEqual([
      ['nonesuch.sty', 'package'], ['weird.cls', 'class'], ['plot.png', 'graphic'],
    ]);
  });
});
