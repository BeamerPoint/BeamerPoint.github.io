import { useState } from 'react';
import { richTextToPlain } from '@beamerpoint/core';
import { selectCurrentFrame, useStore } from '../state/store.js';

/**
 * Speaker notes for the current slide.
 *
 * `\note{...}` has been emitted and parsed from the first commit and nothing in the app
 * ever showed it — a note written elsewhere survived every round trip, invisibly. This
 * is the whole feature: a box under the canvas.
 *
 * The compiled PDF does not change. Beamer prints notes only under
 * `\setbeameroption{show notes}`, which the app does not set, so a note is for the person
 * presenting and not for the audience.
 */
export function NotesPane(): React.ReactElement {
  const frame = useStore(selectCurrentFrame);
  const locked = useStore((s) => s.source.status !== 'synced');
  const setFrameNote = useStore((s) => s.setFrameNote);
  const [open, setOpen] = useState(false);

  const note = frame?.notes[0];
  const text = note === undefined ? '' : richTextToPlain(note.content);
  const extra = (frame?.notes.length ?? 0) - 1;

  return (
    <div className={`bp-notes${open ? ' is-open' : ''}`}>
      <button
        className="bp-notes-toggle"
        onClick={() => setOpen(!open)}
        title="Speaker notes for this slide. They do not appear in the PDF."
      >
        <span>Notes</span>
        {text !== '' && <span className="bp-notes-dot" />}
        <span className="bp-notes-chevron">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <textarea
          className="bp-notes-input"
          placeholder={frame === undefined ? 'No slide selected' : 'Notes for this slide…'}
          disabled={locked || frame === undefined}
          value={text}
          onChange={(e) => frame && setFrameNote(
            frame.id,
            e.target.value === '' ? [] : [{ t: 'text', s: e.target.value }],
          )}
        />
      )}

      {open && extra > 0 && (
        <p className="bp-hint">
          This slide has {extra} more {extra === 1 ? 'note' : 'notes'} in the source.
          They are kept as they are; this box edits the first.
        </p>
      )}
    </div>
  );
}
