import type { Diagnostic } from './LatexEngine.js';

/**
 * Parse a TeX log into diagnostics.
 *
 * The non-obvious part is line rewrapping: TeX hard-wraps its log at
 * `max_print_line` characters, splitting messages and file paths mid-token. We ask
 * the engine for a large `max_print_line`, but also rejoin defensively here — a
 * parser that skips this appears to fail at random on long file paths.
 */

const MAIN_FILE = './main.tex';

/** A package or class the document needs and TeX could not find. */
export interface MissingFile {
  /** e.g. "Alegreya.sty". */
  file: string;
  /** The package name, i.e. the file without its extension. */
  pkg: string;
  kind: 'package' | 'class' | 'graphic' | 'other';
}

/**
 * Pull out what the document asked for and could not get.
 *
 * A missing `.sty` is the most common compile failure there is, and the raw TeX log
 * buries it in hundreds of lines. Surfacing it as a named package with a plain
 * explanation is the difference between "it broke" and "this theme needs a font
 * package the bundled TeX Live does not carry".
 */
export function findMissingFiles(log: string): MissingFile[] {
  const out = new Map<string, MissingFile>();
  const re = /File `([^']+)' not found/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(log)) !== null) {
    const file = m[1]!;
    const ext = file.split('.').pop()?.toLowerCase() ?? '';
    const kind: MissingFile['kind'] =
      ext === 'sty' ? 'package'
      : ext === 'cls' ? 'class'
      : ['png', 'jpg', 'jpeg', 'pdf', 'eps', 'svg'].includes(ext) ? 'graphic'
      : 'other';
    out.set(file, { file, pkg: file.replace(/\.[^.]+$/, ''), kind });
  }
  return [...out.values()];
}

/**
 * Rejoin lines that TeX wrapped at exactly the print-line limit.
 *
 * Whether to join is a question about the PREVIOUS PHYSICAL line -- was it cut at the
 * limit? -- not about the joined line built so far. Asking the joined line, as this
 * used to, meant that once one wrap was repaired the result was always over the limit,
 * and every following line was glued on until one happened to start with `!` or `(`:
 * a minted error arrived carrying TeX's help text, "Pretend that you're Hercule Poirot"
 * and the memory statistics (F-013).
 */
function unwrap(log: string, limit = 79): string[] {
  const raw = log.split(/\r?\n/);
  const out: string[] = [];
  let prevPhysical = 0;
  for (const line of raw) {
    if (out.length > 0 && prevPhysical >= limit && line !== '' && !/^[!(]/.test(line)) {
      out[out.length - 1] += line;
    } else {
      out.push(line);
    }
    prevPhysical = line.length;
  }
  return out;
}

/**
 * The part of busytex's output that is the TeX log of the final run.
 *
 * busytex returns a transcript of every run it made, each a `$ command` header followed
 * by `TEXMFLOG:`, `MISSFONTLOG:`, `LOG:`, `STDOUT:` and `STDERR:` sections separated by
 * `==` lines, with `======` between runs. The final run's `LOG` and `STDOUT` carry the
 * SAME messages, so parsing the whole transcript reported every error and warning twice
 * (F-013); and an earlier run's log holds the warnings a later pass resolved. So: the
 * last run's `LOG`, or failing that its `STDOUT`. Anything not in this shape -- a plain
 * TeX log from another engine -- is returned whole.
 */
function finalRunLog(log: string): string {
  const lines = log.split(/\r?\n/);
  if (!lines.includes('LOG:')) return log;

  const runs: Array<Map<string, string[]>> = [];
  let run = new Map<string, string[]>();
  let section: string[] | null = null;
  for (const line of lines) {
    if (line === '======') { runs.push(run); run = new Map(); section = null; continue; }
    if (line === '==') { section = null; continue; }
    const head = /^(TEXMFLOG|MISSFONTLOG|LOG|STDOUT|STDERR):$/.exec(line);
    if (head !== null) { section = []; run.set(head[1]!, section); continue; }
    section?.push(line);
  }
  runs.push(run);

  const lastWith = (key: string): string[] | undefined => runs
    .map((r) => r.get(key))
    .filter((s): s is string[] => s !== undefined && s.some((l) => l.trim() !== ''))
    .at(-1);
  const body = lastWith('LOG') ?? lastWith('STDOUT');
  return body === undefined ? log : body.join('\n');
}

/**
 * Track which file the current log position refers to by counting `(` and `)`.
 * Only diagnostics reported against the main file can be attributed to the model.
 */
class FileStack {
  private stack: string[] = [];

  feed(line: string): void {
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '(') {
        const m = /^\(([^()\s]*)/.exec(line.slice(i));
        const name = m?.[1];
        if (name !== undefined && name !== '') {
          this.stack.push(name);
          i += m![0].length - 1;
        }
      } else if (c === ')') {
        this.stack.pop();
      }
    }
  }

  current(): string | undefined {
    return this.stack[this.stack.length - 1];
  }

  inMain(): boolean {
    const c = this.current();
    return c === undefined || c === MAIN_FILE || c === 'main.tex' || c.endsWith('/main.tex');
  }
}

export function parseLog(log: string): Diagnostic[] {
  const lines = unwrap(finalRunLog(log));
  const out: Diagnostic[] = [];
  const files = new FileStack();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Errors: "! ..." possibly followed by context and an "l.NNN" line marker.
    if (line.startsWith('!')) {
      const message = line.replace(/^!\s*/, '').trim();
      let lineNo: number | undefined;
      const context: string[] = [line];
      for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
        const l = lines[j]!;
        context.push(l);
        const m = /^l\.(\d+)/.exec(l);
        if (m !== null) { lineNo = Number(m[1]); break; }
        if (l.startsWith('!')) break;
      }
      out.push({
        severity: 'error',
        code: classifyError(message),
        message,
        ...(files.current() !== undefined ? { file: files.current()! } : {}),
        ...(lineNo !== undefined && files.inMain() ? { line: lineNo } : {}),
        raw: context.join('\n'),
      });
      files.feed(line);
      continue;
    }

    // Overfull / underfull boxes: the canvas's own honesty signal.
    const box = /^(Overfull|Underfull)\s+\\([hv])box\s+\(([^)]*)\)(.*)$/.exec(line);
    if (box !== null) {
      const at = /at lines? (\d+)(?:--(\d+))?/.exec(line + ' ' + (lines[i + 1] ?? ''));
      out.push({
        severity: 'fidelity',
        code: `tex.${box[1]!.toLowerCase()}-${box[2] === 'h' ? 'hbox' : 'vbox'}`,
        message: `${box[1]} \\${box[2]}box (${box[3]})${box[4] ?? ''}`.trim(),
        ...(at !== null && files.inMain() ? { line: Number(at[1]) } : {}),
        raw: line,
      });
      files.feed(line);
      continue;
    }

    // Warnings, which carry their own input-line reference.
    const warn = /^(LaTeX|Package|Class)\s*(\S*)\s*Warning:\s*(.*)$/.exec(line);
    if (warn !== null) {
      let message = warn[3]!;
      // LaTeX indents a wrapped warning with the emitting package in parentheses,
      // e.g. "(hyperref)   ...". Only those lines continue the message; anything else
      // is the next log entry, and swallowing it produces messages with file paths
      // and stray parentheses glued onto the end.
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const l = lines[j]!;
        if (!/^\([A-Za-z][^)]*\)\s/.test(l)) break;
        message += ' ' + l.replace(/^\([^)]*\)\s*/, '').trim();
      }
      const at = /on input line (\d+)/.exec(message);
      out.push({
        severity: isEnvironmentNotice(warn[2] ?? '', message) ? 'info' : 'warning',
        code: `latex.${(warn[2] || warn[1]!).toLowerCase()}-warning`,
        message: message.trim(),
        ...(at !== null && files.inMain() ? { line: Number(at[1]) } : {}),
        raw: line,
      });
      files.feed(line);
      continue;
    }

    files.feed(line);
  }

  return out;
}

/**
 * A warning that describes the engine rather than the document.
 *
 * graphicx loads `epstopdf` for every deck, and in a browser with no shell escape it
 * announces "Shell escape feature is not enabled." on every compile. Nothing in the
 * deck caused it and nothing the user does will clear it, so as a warning it only
 * teaches people to ignore the warnings list (F-013). Kept, as information.
 */
function isEnvironmentNotice(pkg: string, message: string): boolean {
  return pkg === 'epstopdf' && /^Shell escape feature is not enabled\.?$/.test(message.trim());
}

function classifyError(message: string): string {
  if (/Undefined control sequence/i.test(message)) return 'tex.undefined-control-sequence';
  if (/File .* not found/i.test(message)) return 'tex.file-not-found';
  if (/Missing \$ inserted/i.test(message)) return 'tex.missing-math-shift';
  if (/Missing .* inserted/i.test(message)) return 'tex.missing-token';
  if (/Runaway argument/i.test(message)) return 'tex.runaway-argument';
  if (/Emergency stop/i.test(message)) return 'tex.emergency-stop';
  if (/Unknown graphics extension/i.test(message)) return 'tex.unknown-graphics-extension';
  if (/LaTeX Error/i.test(message)) return 'latex.error';
  return 'tex.error';
}

/** True when the log indicates the run produced no usable PDF. */
export function logIndicatesFailure(log: string): boolean {
  return /^!\s/m.test(log) || /Emergency stop/.test(log) || /No pages of output/.test(log);
}
