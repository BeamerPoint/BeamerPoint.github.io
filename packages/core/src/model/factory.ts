import type {
  CodeElement,
  Deck,
  Element,
  FrameNode,
  ListElement,
  ListItem,
  Preamble,
  RichText,
  TableColumn,
  TableElement,
  TableRow,
  TikzElement,
  TextElement,
  TocElement,
} from './types.js';
import { newId } from './ids.js';

export function plain(s: string): RichText {
  const str = typeof s === 'string' ? s : String(s ?? '');
  return str === '' ? [] : [{ t: 'text', s: str }];
}

export function defaultPreamble(): Preamble {
  return {
    documentClass: {
      name: 'beamer',
      fontSize: 11,
      aspectRatio: '169',
      handout: false,
      t: false,
      extraOptions: [],
    },
    theme: { name: 'Madrid', options: [] },
    navigationSymbols: false,
    packages: [],
    suppressedDerived: [],
    colorDefs: [],
    beamerSettings: [],
    custom: [],
  };
}

export function newTextElement(text = ''): TextElement {
  return {
    id: newId(),
    kind: 'text',
    placement: { mode: 'flow' },
    content: plain(text),
  };
}

export function newListItem(text = ''): ListItem {
  return { id: newId(), content: plain(text) };
}

export function newListElement(
  items: string[] = ['', '', ''],
  listType: ListElement['listType'] = 'itemize',
): ListElement {
  return {
    id: newId(),
    kind: 'list',
    placement: { mode: 'flow' },
    listType,
    items: items.map(newListItem),
  };
}

/**
 * A booktabs table with a header row.
 *
 * The rules are stored explicitly rather than derived from `style`, so a user who
 * edits them in the source keeps what they wrote.
 */
export function newTableElement(rowCount = 3, colCount = 3): TableElement {
  const columns: TableColumn[] = Array.from({ length: Math.max(1, colCount) }, (_, i) => ({
    id: newId(),
    align: i === 0 ? 'l' : 'c',
  }));

  const rows: TableRow[] = Array.from({ length: Math.max(1, rowCount) }, (_, r) => ({
    id: newId(),
    cells: columns.map((_c, i) => ({
      id: newId(),
      content: plain(r === 0 ? `Column ${i + 1}` : ''),
    })),
    ...(r === 0 ? { isHeader: true, ruleBelow: { k: 'midrule' as const } } : {}),
  }));

  const last = rows[rows.length - 1]!;
  last.ruleBelow = { k: 'bottomrule' };

  return {
    id: newId(),
    kind: 'table',
    placement: { mode: 'flow' },
    style: 'booktabs',
    columns,
    topRule: { k: 'toprule' },
    rows,
    merges: [],
    fit: 'natural',
    floatWrapper: 'none',
  };
}

/**
 * An empty drawing canvas.
 *
 * The default is wide and short so it sits naturally in the flow under a frame title
 * rather than pushing everything else off the slide.
 */
export function newTikzElement(w = 100, h = 45): TikzElement {
  return {
    id: newId(),
    kind: 'tikz',
    placement: { mode: 'flow' },
    mode: 'shapes',
    shapes: [],
    canvasSize: { w, h },
  };
}

/**
 * A source listing.
 *
 * `code` is what the user sees: no leading or trailing newline, because those two are
 * structural — listings needs the body to start on its own line — and the emitter writes
 * them and the parser strips them again. Everything between is byte-exact, which is what
 * the round-trip guard compares.
 */
export function newCodeElement(
  language = 'Python',
  code = 'def greet(name):\n    print(f"Hello, {name}")',
): CodeElement {
  return {
    id: newId(),
    kind: 'code',
    placement: { mode: 'flow' },
    backend: 'listings',
    language,
    code,
    options: {},
  };
}

/**
 * An outline slide's `	ableofcontents`.
 *
 * Beamer builds the list from the deck's sections, so the element carries only the
 * option group -- `[currentsection]` and friends -- and nothing to type.
 */
export function newTocElement(options = ''): TocElement {
  return {
    id: newId(),
    kind: 'toc',
    placement: { mode: 'flow' },
    options,
  };
}

export function newFrame(title = 'Untitled slide', children: Element[] = []): FrameNode {
  return {
    kind: 'frame',
    id: newId(),
    title: plain(title),
    options: {},
    children,
    notes: [],
  };
}

/** A title frame, which in Beamer is just a frame containing `\titlepage`. */
export function newTitleFrame(): FrameNode {
  return {
    kind: 'frame',
    id: newId(),
    options: { plain: true },
    children: [
      {
        id: newId(),
        kind: 'raw',
        placement: { mode: 'flow' },
        tex: '\\titlepage',
        reason: 'user-forced',
        label: '\\titlepage',
      },
    ],
    notes: [],
  };
}

export interface NewDeckOptions {
  title?: string;
  author?: string;
  institute?: string;
}

export function newDeck(opts: NewDeckOptions = {}): Deck {
  const title = opts.title ?? 'Untitled Presentation';
  return {
    schemaVersion: 1,
    id: newId(),
    meta: {
      title: plain(title),
      ...(opts.author !== undefined ? { author: plain(opts.author) } : {}),
      ...(opts.institute !== undefined ? { institute: plain(opts.institute) } : {}),
      date: [{ t: 'raw', tex: '\\today' }],
    },
    preamble: defaultPreamble(),
    nodes: [
      newTitleFrame(),
      newFrame('First slide', [
        newTextElement('Replace this with your content.'),
        newListElement(['First point', 'Second point', 'Third point']),
      ]),
    ],
    resources: [],
  };
}
