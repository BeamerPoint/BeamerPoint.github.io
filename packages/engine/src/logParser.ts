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

/** Rejoin lines that TeX wrapped at exactly the print-line limit. */
function unwrap(log: string, limit = 79): string[] {
  const raw = log.split(/\r?\n/);
  const out: string[] = [];
  for (const line of raw) {
    const prev = out[out.length - 1];
    if (prev !== undefined && prev.length >= limit && !/^[!(]/.test(line)) {
      out[out.length - 1] = prev + line;
      continue;
    }
    out.push(line);
  }
  return out;
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
  const lines = unwrap(log);
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
        severity: 'warning',
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
