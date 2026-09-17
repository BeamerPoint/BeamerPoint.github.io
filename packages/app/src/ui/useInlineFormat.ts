import { inlineMarksIn, type InlineMarks, type InlineStyle, type StyleSpec } from '@beamerpoint/core';
import { useStore } from '../state/store.js';
import { contentOfHost, useTextSelection } from '../canvas/textSelection.js';
import { applyFormatToSelection, clearFormatOnSelection } from './applyFormat.js';

/**
 * The state of the ribbon's formatting controls.
 *
 * Everything that changes the document lives in `applyFormat.ts`, because the Ctrl+B
 * handler inside the editable box needs the same operation and is not a component.
 * This only answers "is there something to format, and what is it already".
 */
export interface InlineFormat {
  /** A non-empty selection inside an editable host, and the canvas is writable. */
  enabled: boolean;
  /** The styles the WHOLE selection shares, for the controls' active state. */
  active: InlineMarks;
  apply(spec: StyleSpec): void;
  clear(style: InlineStyle): void;
}

export function useInlineFormat(): InlineFormat {
  const selection = useTextSelection();
  const deck = useStore((s) => s.deck);
  const slideId = useStore((s) => s.selection.slideId);
  const locked = useStore((s) => s.source.status !== 'synced');

  const content = selection === null || slideId === null
    ? null
    : contentOfHost(deck, slideId, selection);

  return {
    enabled: !locked && selection !== null && selection.from !== selection.to
      && content !== null,
    active: content !== null && selection !== null
      ? inlineMarksIn(content, selection)
      : { styles: [] },
    apply: applyFormatToSelection,
    clear: clearFormatOnSelection,
  };
}
