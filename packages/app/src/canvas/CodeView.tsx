/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { PX_PER_MM, type CodeElement, type ThemeSpec } from '@beamerpoint/core';

interface Props {
  el: CodeElement;
  theme: ThemeSpec;
  locked: boolean;
  onEditCode(elementId: string, code: string): void;
}

/**
 * A source listing on the canvas.
 *
 * Edited in place, like everything else here — but NOT through `readInlineFromDom`.
 * `CodeElement.code` is a plain string, not `RichText`: there are no bold runs or inline
 * math to reassemble, and the whitespace IS the content. So the text comes back from
 * `textContent`, and the box is `white-space: pre` so that newlines and leading spaces
 * survive the trip.
 *
 * No syntax highlighting. A highlighter would have to re-render on every keystroke and
 * fight the caret for control of the DOM, and it would be lying anyway: the colours in
 * the PDF are `listings`' idea of the language, not ours. The compiled PDF is one click
 * away, as it is for everything else the canvas approximates.
 */
export function CodeView({ el, theme, locked, onEditCode }: Props): React.ReactElement {
  // Measured from the emitted `\lstset`: `\ttfamily\small` at an 11pt base is 10pt.
  const fontPx = 10 * (PX_PER_MM / 2.845);

  return (
    <div className="bp-code">
      {el.language !== '' && (
        <span className="bp-code-lang" style={{ color: theme.structure }}>
          {el.language}
        </span>
      )}
      <pre
        className={`bp-code-body${el.frameStyle !== undefined && el.frameStyle !== 'none'
          ? ` bp-code-frame-${el.frameStyle}` : ''}`}
        style={{ fontSize: fontPx, color: theme.foreground }}
        contentEditable={locked ? false : 'plaintext-only'}
        suppressContentEditableWarning
        spellCheck={false}
        onBlur={(e) => onEditCode(el.id, readCode(e.currentTarget))}
      >
        {el.code}
      </pre>
      {el.caption !== undefined && (
        <div className="bp-code-caption" style={{ color: theme.foreground }}>
          {captionText(el)}
        </div>
      )}
    </div>
  );
}

/**
 * Read the edited listing back.
 *
 * `textContent` is NOT enough: pressing Enter in a contentEditable inserts a `<br>` or a
 * `<div>`, and `textContent` skips both — so every line break the user typed vanished and
 * the lines ran together. `innerText` reports the RENDERED text, which under
 * `white-space: pre` is exactly the bytes. `contentEditable="plaintext-only"` keeps the
 * browser from building that markup in the first place; this is the belt to its braces.
 */
function readCode(node: HTMLElement): string {
  return (node.innerText ?? node.textContent ?? '').replace(/\r\n?/g, '\n');
}

function captionText(el: CodeElement): string {
  return (el.caption ?? [])
    .map((n) => (n.t === 'text' ? n.s : ''))
    .join('');
}
