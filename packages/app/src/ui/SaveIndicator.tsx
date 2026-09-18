/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

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
 * Save status text.
 *
 * Autosave to browser storage always runs; this says whether it has. The control for
 * linking a real file lives in `FileLinkButton` so the two can sit in different parts
 * of the chrome — status in the footer, the file link up by the document title, which
 * is where a desktop app puts it.
 */
export function SaveIndicator(): React.ReactElement {
  const { status, lastSavedAt, error } = useSaveState();
  const [, forceTick] = useState(0);

  // Keep the "saved 12s ago" label honest without re-rendering the whole app.
  useEffect(() => {
    const t = window.setInterval(() => forceTick((n) => n + 1), 5000);
    return () => window.clearInterval(t);
  }, []);

  if (status === 'error') {
    return <span className="bp-status-item is-error" title={error ?? ''}>Save failed</span>;
  }
  return (
    <span className="bp-status-item">
      {status === 'saving' ? 'Saving…'
        : lastSavedAt !== null ? `Saved ${agoLabel(lastSavedAt)}`
        : 'Autosave on'}
    </span>
  );
}

/**
 * Link the deck to a real file on disk.
 *
 * Shared so the ribbon and the title bar run the same code. The ribbon used to reach
 * into the DOM and click the other button, which works right up until the markup moves.
 */
export function useLinkFile(): () => Promise<void> {
  const deck = useStore((s) => s.deck);
  return async () => {
    const suggested = deck.meta.title
      ? `${richTextToPlain(deck.meta.title).replace(/[^\w -]+/g, '').trim() || 'presentation'}.tex`
      : 'presentation.tex';
    const name = await linkFile(suggested);
    if (name !== null) await flushSave();
  };
}

/** Whether this browser can write files directly at all. */
export const canLinkFile = isSupported;

/** The link-a-real-file control, and the reconnect prompt when permission lapses. */
export function FileLinkButton(): React.ReactElement {
  const { fileName, needsPermission } = useSaveState();
  const onLink = useLinkFile();

  const onRegrant = async (): Promise<void> => {
    if (await ensureWritable()) await flushSave();
  };

  const onUnlink = async (): Promise<void> => {
    await unlinkFile();
    useSaveState.getState().set({ fileName: null, needsPermission: false });
  };

  if (needsPermission && fileName !== null) {
    return (
      <button className="bp-linkbtn is-warn bp-save-link" onClick={() => void onRegrant()}>
        Reconnect {fileName}
      </button>
    );
  }

  if (fileName !== null) {
    return (
      <button
        className="bp-linkbtn is-linked bp-save-link"
        title="Autosaving to this file. Click to stop."
        onClick={() => void onUnlink()}
      >
        {fileName}
      </button>
    );
  }

  if (!isSupported()) {
    return (
      <span
        className="bp-linkbtn is-disabled"
        title="This browser cannot write files directly. Use Export .tex to save a copy."
      >
        Browser storage only
      </span>
    );
  }

  return (
    <button
      className="bp-linkbtn bp-save-link"
      title="Autosave straight to a .tex file on disk, so a crash cannot lose it"
      onClick={() => void onLink()}
    >
      Save to file…
    </button>
  );
}
