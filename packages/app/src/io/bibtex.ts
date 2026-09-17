/**
 * Just enough BibTeX to build a citation picker.
 *
 * This is NOT a BibTeX implementation and does not try to be: BibTeX itself compiles the
 * file, and whatever this reader makes of it changes nothing about the output. All it has
 * to do is list the keys in a `.bib` so the user can pick one, and show enough of each
 * entry to tell them apart.
 *
 * So it declines rather than guesses. `@string` macros, `@preamble`, concatenation with
 * `#` and cross-references are not resolved — an entry that uses them still appears, with
 * whatever plain text could be read, because a key the user cannot see is worse than a
 * title rendered without its macro.
 */

export interface BibEntry {
  key: string;
  /** `article`, `book`, … lower-cased. */
  type: string;
  author?: string;
  title?: string;
  year?: string;
}

/** Fields worth showing in a picker. Everything else is skipped. */
const WANTED: ReadonlySet<string> = new Set(['author', 'title', 'year']);

export function parseBib(text: string): BibEntry[] {
  const out: BibEntry[] = [];

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '@') continue;

    const head = /^@(\w+)\s*[{(]\s*([^,\s}]+)\s*,/.exec(text.slice(i));
    if (head === null) continue;

    const type = head[1]!.toLowerCase();
    if (type === 'string' || type === 'preamble' || type === 'comment') continue;

    const body = takeBalanced(text, i + head[0].length);
    const entry: BibEntry = { key: head[2]!, type };

    for (const [field, value] of readFields(body.inner)) {
      if (!WANTED.has(field)) continue;
      entry[field as 'author' | 'title' | 'year'] = value;
    }

    out.push(entry);
    i = body.end - 1;
  }

  return out;
}

/** From just after the opening brace to its match, so nested braces survive. */
function takeBalanced(text: string, from: number): { inner: string; end: number } {
  let depth = 1;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (c === '\\') { i += 1; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return { inner: text.slice(from, i), end: i + 1 };
    }
  }
  return { inner: text.slice(from), end: text.length };
}

/** `field = {value}` / `field = "value"` / `field = 1984`, split on top-level commas. */
function readFields(body: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];

  for (const chunk of splitTopLevel(body)) {
    const eq = chunk.indexOf('=');
    if (eq === -1) continue;
    const field = chunk.slice(0, eq).trim().toLowerCase();
    const raw = chunk.slice(eq + 1).trim();
    out.push([field, cleanValue(raw)]);
  }

  return out;
}

function splitTopLevel(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;

  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === '\\') { i += 1; continue; }
    if (c === '"' && depth === 0) quoted = !quoted;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === ',' && depth === 0 && !quoted) {
      out.push(body.slice(start, i));
      start = i + 1;
    }
  }
  out.push(body.slice(start));
  return out;
}

/**
 * A field value as text for the picker.
 *
 * The braces that BibTeX uses to protect capitals are dropped, and a `\TeX`-style macro
 * is left as written — this is a label in a list, not typeset output.
 */
function cleanValue(raw: string): string {
  let v = raw.trim();
  if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('"') && v.endsWith('"'))) {
    v = v.slice(1, -1);
  }
  return v.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

/** "Knuth and Lamport" → "Knuth et al.", for a one-line label. */
export function shortAuthor(author: string | undefined): string {
  if (author === undefined || author.trim() === '') return '';
  const names = author.split(/\s+and\s+/i);
  const first = names[0]!.includes(',')
    ? names[0]!.split(',')[0]!.trim()
    : names[0]!.trim().split(/\s+/).pop() ?? names[0]!;
  return names.length > 1 ? `${first} et al.` : first;
}
