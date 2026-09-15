import type {
  Deck,
  Element,
  FrameNode,
  ListElement,
  ListItem,
  Preamble,
  RichText,
  TextElement,
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
