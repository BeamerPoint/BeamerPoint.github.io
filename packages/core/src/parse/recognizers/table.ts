import type {
  CellMerge,
  Color,
  Length,
  RowRule,
  TableColumn,
  TableElement,
  TableRow,
} from '../../model/types.js';
import type { CstNode } from '../cst.js';
import { parseInline, trimRichText } from '../inline.js';
import type { RecognizeCtx } from './elements.js';
import { parseLength } from './elements.js';
import { parseTikzColor } from './tikz.js';

/**
 * Tables.
 *
 * Every function here is all-or-nothing: anything a `tabular` can express that the
 * model cannot — a `@{}` column, a `>{\bfseries}` prefix, `\multirow`, two rules in
 * a row — returns `null`, and the caller keeps the original bytes as a raw block.
 * A half-read table would be far worse than a raw one: the user would edit a grid
 * that silently differs from the LaTeX it replaces.
 */

const RULE_COMMANDS: ReadonlySet<string> = new Set([
  'toprule', 'midrule', 'bottomrule', 'hline', 'cmidrule',
]);

/* ------------------------------------------------------------- column spec */

/**
 * `{|l|cc|p{3cm}}` and friends.
 *
 * Only the shapes the emitter produces are accepted. A spec with anything else in it
 * declines, because re-emitting it would drop the part we did not understand.
 */
export function parseColumnSpec(
  spec: string,
  ctx: RecognizeCtx,
): { columns: TableColumn[]; endRule?: 'single' | 'double' } | null {
  const columns: TableColumn[] = [];
  let pendingRule: TableColumn['leftRule'] = 'none';
  let i = 0;

  while (i < spec.length) {
    const c = spec[i]!;

    if (/\s/.test(c)) { i += 1; continue; }

    if (c === '|') {
      if (pendingRule === 'double') return null;   // `|||` has no model slot
      pendingRule = pendingRule === 'none' ? 'single' : 'double';
      i += 1;
      continue;
    }

    if (c === 'l' || c === 'c' || c === 'r' || c === 'X') {
      columns.push({
        id: ctx.newId(),
        align: c,
        ...(pendingRule !== 'none' ? { leftRule: pendingRule } : {}),
      });
      pendingRule = 'none';
      i += 1;
      continue;
    }

    if (c === 'p') {
      if (spec[i + 1] !== '{') return null;
      const close = spec.indexOf('}', i + 2);
      if (close === -1) return null;
      const width = parseLength(spec.slice(i + 2, close));
      if (width === null) return null;
      columns.push({
        id: ctx.newId(),
        align: 'p',
        width,
        ...(pendingRule !== 'none' ? { leftRule: pendingRule } : {}),
      });
      pendingRule = 'none';
      i = close + 1;
      continue;
    }

    // `@{}`, `>{...}`, `*{3}{c}`, `m`, `b`, `!{...}` — all real, none modelled.
    return null;
  }

  if (columns.length === 0) return null;
  // A trailing `|` belongs to no column, so it lives on the table itself.
  return pendingRule === 'none' ? { columns } : { columns, endRule: pendingRule };
}

/* -------------------------------------------------------- splitting the body */

interface RawRow {
  cells: CstNode[][];
  ruleBelow?: RowRule;
  fill?: Color;
}

/**
 * A colour argument to `\rowcolor` / `\cellcolor`, in either of the two forms the
 * emitter writes: `{spec}` for a named or mixed colour, `[rgb]{r,g,b}` for a literal.
 */
function readColorCommand(
  node: Extract<CstNode, { n: 'cmd' }>,
  src: string,
): Color | null {
  if (node.args.length !== 1) return null;
  const arg = src.slice(node.args[0]!.span.start + 1, node.args[0]!.span.end - 1).trim();

  if (node.opts.length === 0) return parseTikzColor(arg);
  if (node.opts.length !== 1) return null;

  const model = src.slice(node.opts[0]!.span.start + 1, node.opts[0]!.span.end - 1).trim();
  if (model !== 'rgb') return null;
  const parts = arg.split(',').map((v) => Number(v.trim()));
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return null;
  return { k: 'rgb', r: parts[0]!, g: parts[1]!, b: parts[2]! };
}

interface SplitBody {
  topRule?: RowRule;
  rows: RawRow[];
}

function ruleFromCommand(node: Extract<CstNode, { n: 'cmd' }>, src: string): RowRule | null {
  if (node.name !== 'cmidrule') {
    if (node.args.length > 0 || node.opts.length > 0) return null;
    return { k: node.name as 'toprule' | 'midrule' | 'bottomrule' | 'hline' };
  }

  // \cmidrule(lr){2-4} — the trim spec is a parenthesised group, not a TeX argument,
  // so the lexer leaves it as ordinary text and the caller matches it instead.
  if (node.args.length !== 1) return null;
  const inner = src.slice(node.args[0]!.span.start + 1, node.args[0]!.span.end - 1);
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(inner);
  if (m === null) return null;
  return { k: 'cmidrule', from: Number(m[1]), to: Number(m[2]) };
}

/** Split a `text` node on unescaped `&`, keeping every span exact. */
function splitOnAmpersand(
  node: Extract<CstNode, { n: 'text' }>,
): Array<CstNode | '&'> {
  if (!node.value.includes('&')) return [node];

  const out: Array<CstNode | '&'> = [];
  let start = 0;
  for (let i = 0; i <= node.value.length; i++) {
    if (i < node.value.length && node.value[i] !== '&') continue;
    const value = node.value.slice(start, i);
    if (value !== '') {
      out.push({
        n: 'text',
        value,
        span: {
          start: node.span.start + start,
          end: node.span.start + i,
          line: node.span.line,
        },
      });
    }
    if (i < node.value.length) out.push('&');
    start = i + 1;
  }
  return out;
}

function isBlankNodes(nodes: CstNode[]): boolean {
  return nodes.every((n) =>
    (n.n === 'text' && n.value.trim() === '') || n.n === 'parbreak');
}

/**
 * Turn a tabular body into rows of cells.
 *
 * Rules are attached to the row they follow; a rule before any row is the table's
 * top rule. Two rules in the same position decline, because the model has one slot.
 */
function splitBody(children: CstNode[], src: string): SplitBody | null {
  const rows: RawRow[] = [];
  let cells: CstNode[][] = [];
  let cell: CstNode[] = [];
  let topRule: RowRule | undefined;
  let pendingFill: Color | undefined;

  const rowPending = (): boolean => cells.length > 0 || !isBlankNodes(cell);

  const endRow = (): void => {
    cells.push(cell);
    rows.push({ cells, ...(pendingFill !== undefined ? { fill: pendingFill } : {}) });
    cells = [];
    cell = [];
    pendingFill = undefined;
  };

  for (let i = 0; i < children.length; i++) {
    const node = children[i]!;

    if (node.n === 'cmd' && node.name === '\\') {
      // `\\[2pt]` leaves the optional argument as text the model cannot carry.
      const next = children[i + 1];
      if (next !== undefined && next.n === 'text' && /^\s*\[/.test(next.value)) return null;
      endRow();
      continue;
    }

    if (node.n === 'cmd' && RULE_COMMANDS.has(node.name)) {
      if (rowPending()) return null;          // a rule in the middle of a row
      const rule = ruleFromCommand(node, src);
      if (rule === null) return null;
      if (rows.length === 0) {
        if (topRule !== undefined) return null;
        topRule = rule;
      } else {
        const last = rows[rows.length - 1]!;
        if (last.ruleBelow !== undefined) return null;
        last.ruleBelow = rule;
      }
      cell = [];
      continue;
    }

    // `\rowcolor` is a row prefix: it stands before the row's first cell and colours
    // the whole row, so it is read here rather than inside a cell.
    if (node.n === 'cmd' && node.name === 'rowcolor') {
      if (rowPending()) return null;
      const fill = readColorCommand(node, src);
      if (fill === null) return null;
      pendingFill = fill;
      continue;
    }

    if (node.n === 'text') {
      for (const piece of splitOnAmpersand(node)) {
        if (piece === '&') { cells.push(cell); cell = []; }
        else cell.push(piece);
      }
      continue;
    }

    cell.push(node);
  }

  // LaTeX allows the final `\\` to be omitted. Accept it here; the round-trip guard
  // decides whether re-emitting with the `\\` still matches what the user wrote.
  if (rowPending()) endRow();

  return rows.length > 0 ? { rows, ...(topRule !== undefined ? { topRule } : {}) } : null;
}

/* ------------------------------------------------------------------- cells */

interface ReadCell {
  content: ReturnType<typeof trimRichText>;
  colspan: number;
  align?: 'l' | 'c' | 'r';
  fill?: Color;
}

/** A cell, which may be a whole `\multicolumn` spanning several columns. */
function readCell(nodes: CstNode[], ctx: RecognizeCtx): ReadCell | null {
  let significant = nodes.filter(
    (n) => !(n.n === 'parbreak' || (n.n === 'text' && n.value.trim() === '')),
  );

  // `\cellcolor` prefixes the cell's content and is not part of it.
  let fill: Color | undefined;
  const head = significant[0];
  if (head !== undefined && head.n === 'cmd' && head.name === 'cellcolor') {
    const read = readColorCommand(head, ctx.src);
    if (read === null) return null;
    fill = read;
    significant = significant.slice(1);
    nodes = nodes.slice(nodes.indexOf(head) + 1);
  }

  const only = significant[0];
  if (significant.length === 1 && only !== undefined
      && only.n === 'cmd' && only.name === 'multicolumn') {
    if (only.args.length !== 3) return null;
    const spanText = ctx.src.slice(only.args[0]!.span.start + 1, only.args[0]!.span.end - 1);
    const colspan = Number.parseInt(spanText.trim(), 10);
    if (!Number.isInteger(colspan) || colspan < 1) return null;

    const alignText = ctx.src.slice(only.args[1]!.span.start + 1, only.args[1]!.span.end - 1).trim();
    if (alignText !== 'l' && alignText !== 'c' && alignText !== 'r') return null;

    return {
      content: trimRichText(parseInline(only.args[2]!.children, ctx.src)),
      colspan,
      align: alignText,
      ...(fill !== undefined ? { fill } : {}),
    };
  }

  return {
    content: trimRichText(parseInline(nodes, ctx.src)),
    colspan: 1,
    ...(fill !== undefined ? { fill } : {}),
  };
}

/* ------------------------------------------------------------------ tabular */

interface TabularShape {
  columns: TableColumn[];
  endRule?: 'single' | 'double';
  topRule?: RowRule;
  rows: TableRow[];
  merges: CellMerge[];
  style: TableElement['style'];
}

function recognizeTabularShape(
  node: Extract<CstNode, { n: 'env' }>,
  spec: string,
  ctx: RecognizeCtx,
): TabularShape | null {
  const parsedSpec = parseColumnSpec(spec, ctx);
  if (parsedSpec === null) return null;
  const { columns } = parsedSpec;

  const body = splitBody(node.children, ctx.src);
  if (body === null) return null;

  const rows: TableRow[] = [];
  const merges: CellMerge[] = [];

  for (let r = 0; r < body.rows.length; r++) {
    const raw = body.rows[r]!;
    const cells: TableRow['cells'] = [];
    let col = 0;

    for (const cellNodes of raw.cells) {
      const read = readCell(cellNodes, ctx);
      if (read === null) return null;
      if (col + read.colspan > columns.length) return null;

      cells.push({
        id: ctx.newId(),
        content: read.content,
        ...(read.fill !== undefined ? { fill: read.fill } : {}),
      });
      if (read.colspan > 1) {
        merges.push({
          row: r,
          col,
          colspan: read.colspan,
          ...(read.align !== undefined ? { align: read.align } : {}),
        });
        // Keep one cell per column so the grid stays rectangular for the editor.
        for (let k = 1; k < read.colspan; k++) cells.push({ id: ctx.newId(), content: [] });
      }
      col += read.colspan;
    }

    // A short or long row would change shape on re-emit; leave it raw instead.
    if (col !== columns.length) return null;

    rows.push({
      id: ctx.newId(),
      cells,
      ...(raw.fill !== undefined ? { fill: raw.fill } : {}),
      ...(raw.ruleBelow !== undefined ? { ruleBelow: raw.ruleBelow } : {}),
    });
  }

  const allRules = [body.topRule, ...rows.map((x) => x.ruleBelow)]
    .filter((x): x is RowRule => x !== undefined);
  const style: TableElement['style'] =
    allRules.some((x) => x.k !== 'hline') ? 'booktabs'
    : allRules.length > 0 ? 'hline'
    : 'plain';

  // The row above a midrule is the header, which is what the canvas styles in bold.
  if (rows.length > 1 && rows[0]!.ruleBelow !== undefined) rows[0]!.isHeader = true;

  return {
    columns,
    ...(parsedSpec.endRule !== undefined ? { endRule: parsedSpec.endRule } : {}),
    ...(body.topRule !== undefined ? { topRule: body.topRule } : {}),
    rows,
    merges,
    style,
  };
}

/** `tabular` or `tabularx`, with no wrapper. */
function recognizeBareTabular(
  node: Extract<CstNode, { n: 'env' }>,
  ctx: RecognizeCtx,
): Omit<TableElement, 'id' | 'kind' | 'placement' | 'floatWrapper'> | null {
  const argText = (i: number): string =>
    ctx.src.slice(node.args[i]!.span.start + 1, node.args[i]!.span.end - 1);

  if (node.name === 'tabular') {
    if (node.args.length !== 1) return null;
    const shape = recognizeTabularShape(node, argText(0), ctx);
    if (shape === null) return null;
    return { ...shape, merges: shape.merges, fit: 'natural' };
  }

  if (node.name === 'tabularx') {
    if (node.args.length !== 2) return null;
    const width = parseLength(argText(0));
    if (width === null) return null;
    const shape = recognizeTabularShape(node, argText(1), ctx);
    if (shape === null) return null;
    return { ...shape, fit: 'tabularx', fitWidth: width };
  }

  return null;
}

/** `\resizebox{W}{!}{ <tabular> }`. */
function unwrapResizebox(
  node: Extract<CstNode, { n: 'cmd' }>,
  ctx: RecognizeCtx,
): { shape: NonNullable<ReturnType<typeof recognizeBareTabular>>; } | null {
  if (node.name !== 'resizebox' || node.args.length !== 3) return null;

  const width = parseLength(ctx.src.slice(node.args[0]!.span.start + 1, node.args[0]!.span.end - 1));
  if (width === null) return null;
  if (ctx.src.slice(node.args[1]!.span.start + 1, node.args[1]!.span.end - 1).trim() !== '!') {
    return null;
  }

  // The emitter writes `{%` so the newline after the brace does not become a space
  // inside the box, so a comment here is expected. A comment the *user* put there
  // would be dropped on re-emit, which the round-trip guard turns into a raw block.
  const inner = node.args[2]!.children.filter(
    (c) => !(c.n === 'parbreak' || c.n === 'comment' || (c.n === 'text' && c.value.trim() === '')),
  );
  if (inner.length !== 1) return null;
  const env = inner[0]!;
  if (env.n !== 'env') return null;

  const shape = recognizeBareTabular(env, ctx);
  if (shape === null || shape.fit !== 'natural') return null;
  return { shape: { ...shape, fit: 'resizebox', fitWidth: width } };
}

/**
 * Anything that can stand in for the tabular itself: the environment, or a
 * `\resizebox` around one.
 */
function readTabularOrResizebox(
  node: CstNode,
  ctx: RecognizeCtx,
): NonNullable<ReturnType<typeof recognizeBareTabular>> | null {
  if (node.n === 'env') return recognizeBareTabular(node, ctx);
  if (node.n === 'cmd') return unwrapResizebox(node, ctx)?.shape ?? null;
  return null;
}

/* ------------------------------------------------------------------- entry */

/**
 * Recognize a table in any of the forms the emitter produces: a bare `tabular`, one
 * inside `\begin{center}`, or one inside a `table` float with a caption.
 */
export function recognizeTable(node: CstNode, ctx: RecognizeCtx): TableElement | null {
  const base = (
    shape: NonNullable<ReturnType<typeof recognizeBareTabular>>,
    floatWrapper: TableElement['floatWrapper'],
    extra: Partial<TableElement> = {},
  ): TableElement => ({
    id: ctx.newId(),
    kind: 'table',
    placement: { mode: 'flow' },
    ...shape,
    floatWrapper,
    ...extra,
    src: node.span,
  });

  const direct = readTabularOrResizebox(node, ctx);
  if (direct !== null) return base(direct, 'none');

  if (node.n !== 'env') return null;

  const significant = node.children.filter(
    (c) => !(c.n === 'parbreak' || (c.n === 'text' && c.value.trim() === '')),
  );

  if (node.name === 'center') {
    if (significant.length !== 1) return null;
    const shape = readTabularOrResizebox(significant[0]!, ctx);
    return shape === null ? null : base(shape, 'center');
  }

  if (node.name !== 'table') return null;
  if (node.opts.length > 0) return null;   // [htbp] has no model slot

  let shape: NonNullable<ReturnType<typeof recognizeBareTabular>> | null = null;
  let caption: TableElement['caption'];
  let label: string | undefined;

  for (const child of significant) {
    if (child.n === 'cmd' && child.name === 'centering' && child.args.length === 0) continue;

    if (child.n === 'cmd' && child.name === 'caption' && child.args.length === 1) {
      if (caption !== undefined) return null;
      caption = trimRichText(parseInline(child.args[0]!.children, ctx.src));
      continue;
    }

    if (child.n === 'cmd' && child.name === 'label' && child.args.length === 1) {
      if (label !== undefined) return null;
      label = ctx.src.slice(child.args[0]!.span.start + 1, child.args[0]!.span.end - 1);
      continue;
    }

    const read = readTabularOrResizebox(child, ctx);
    if (read === null || shape !== null) return null;
    shape = read;
  }

  if (shape === null) return null;
  return base(shape, 'table', {
    ...(caption !== undefined ? { caption } : {}),
    ...(label !== undefined ? { label } : {}),
  });
}

/** Lengths the emitter may produce for a table, exported for tests. */
export type { Length };
