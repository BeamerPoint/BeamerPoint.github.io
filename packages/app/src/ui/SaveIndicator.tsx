import { useEffect, useState } from 'react';
import { richTextToPlain } from '@beamerpoint/core';
import { useStore } from '../state/store.js';
import { flushSave, useSaveState } from '../state/persist.js';
import { ensureWritable, isSupported, linkFile, unlinkFile } from '../state/fileLink.js';

function agoLabel(at: number | null): string {
  if (at === null) return '';
  const secs = Math.round((Date.now() - at) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  return mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`;
}

/**
 * Save status, and the control for linking a real file on disk.
 *
 * Autosave to browser storage always runs. Linking a file is the part that makes the
 * work recoverable outside this browser, so it is surfaced rather than buried.
 */
export function SaveIndicator(): React.ReactElement {
  const { status, lastSavedAt, fileName, needsPermission, error } = useSaveState();
  const deck = useStore((s) => s.deck);
  const [, forceTick] = useState(0);

  // Keep the "saved 12s ago" label honest without re-rendering the whole app.
  useEffect(() => {
    const t = window.setInterval(() => forceTick((n) => n + 1), 5000);
    return () => window.clearInterval(t);
  }, []);

  const onLink = async (): Promise<void> => {
    const suggested = deck.meta.title
      ? `${richTextToPlain(deck.meta.title).replace(/[^\w -]+/g, '').trim() || 'presentation'}.tex`
      : 'presentation.tex';
    const name = await linkFile(suggested);
    if (name !== null) await flushSave();
  };

  const onRegrant = async (): Promise<void> => {
    if (await ensureWritable()) await flushSave();
  };

  const onUnlink = async (): Promise<void> => {
    await unlinkFile();
    useSaveState.getState().set({ fileName: null, needsPermission: false });
  };

  if (needsPermission && fileName !== null) {
    return (
      <span className="bp-save bp-save-warn">
        <button className="bp-linkbtn" onClick={() => void onRegrant()}>
          Reconnect {fileName}
        </button>
        <span className="bp-save-note">browser needs permission again after reload</span>
      </span>
    );
  }

  return (
    <span className="bp-save">
      {status === 'error' && (
        <span className="bp-save-error" title={error ?? ''}>Save failed</span>
      )}
      {status !== 'error' && (
        <span className={status === 'saving' ? 'bp-save-busy' : 'bp-save-ok'}>
          {status === 'saving' ? 'Saving…'
            : lastSavedAt !== null ? `Saved ${agoLabel(lastSavedAt)}`
            : 'Autosave on'}
        </span>
      )}

      {fileName !== null ? (
        <button
          className="bp-linkbtn"
          title="Autosaving to this file. Click to stop."
          onClick={() => void onUnlink()}
        >
          → {fileName}
        </button>
      ) : isSupported() ? (
        <button
          className="bp-linkbtn"
          title="Autosave straight to a .tex file on disk, so a crash cannot lose it"
          onClick={() => void onLink()}
        >
          Save to file…
        </button>
      ) : (
        <span
          className="bp-save-note"
          title="This browser cannot write files directly. Use Export .tex to save a copy."
        >
          browser storage only
        </span>
      )}
    </span>
  );
}
