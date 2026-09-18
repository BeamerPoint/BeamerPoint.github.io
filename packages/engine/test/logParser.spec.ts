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

  // F-013, fixed. busytex's log is several runs of sections -- TEXMFLOG, LOG, STDOUT,
  // STDERR -- and the final run's LOG and STDOUT carry the same messages, so every
  // diagnostic used to be reported twice.
  it('reports each diagnostic once', () => {
    const all = parseLog(log).map((d) => `${d.severity}:${d.message}`);
    expect(all).toEqual([...new Set(all)]);
    expect(errors.filter((e) => e.message.startsWith('Package minted Error'))).toHaveLength(1);
  });

  it('ends an error where TeX ended it, not at the next line starting with "!"', () => {
    // Joining against the accumulated line glued TeX's help text and memory statistics on.
    const minted = errors.find((e) => e.message.startsWith('Package minted Error'))!;
    expect(minted.message.endsWith('attempting to substitute fallback style.')).toBe(true);
    expect(minted.message).not.toContain('Hercule Poirot');
    expect(minted.message).not.toContain('memory');
  });

  it('does not call the engine having no shell escape a warning', () => {
    // epstopdf says so on every compile, whatever the deck; nothing the user does clears it.
    const notice = parseLog(log).filter((d) => d.message === 'Shell escape feature is not enabled.');
    expect(notice.map((d) => d.severity)).toEqual(['info']);
  });

  it('still reads the minted package\'s own shell-escape warning as a warning', () => {
    expect(parseLog(log).some((d) => d.severity === 'warning' && /Shell escape disabled/.test(d.message)))
      .toBe(true);
  });
});

describe('a busytex transcript of several runs', () => {
  const run = (log: string, stdout: string): string[] => [
    '$ pdflatex main.tex', 'EXITCODE: 0', '', 'TEXMFLOG:', '/texlive/x.sty', '==',
    'MISSFONTLOG:', '', '==', 'LOG:', log, '==', 'STDOUT:', stdout, '==', 'STDERR:', '', '======', '',
  ];

  it('reads only the final run, whose pass is the one that counts', () => {
    const transcript = [
      ...run("LaTeX Warning: Reference `eq' on page 1 undefined on input line 9.", ''),
      ...run('(./main.tex)', ''),
    ].join('\n');
    expect(parseLog(transcript)).toEqual([]);
  });

  it('falls back to the final run\'s terminal output when it wrote no log', () => {
    const transcript = run('', '! Undefined control sequence.\nl.4 \\foo').join('\n');
    expect(parseLog(transcript).map((d) => d.line)).toEqual([4]);
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
