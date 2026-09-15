import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { latex } from 'codemirror-lang-latex';
import { useStore } from '../state/store.js';

/**
 * The LaTeX source view.
 *
 * Editing here takes an exclusive lock on the document: the canvas goes read-only
 * until the change is applied or reverted. Auto-apply only fires when the text is
 * structurally healthy, so a half-typed `\begin{` never flips the whole deck to raw.
 */
const AUTO_APPLY_IDLE_MS = 800;

export function SourcePanel(): React.ReactElement {
  const text = useStore((s) => s.source.text);
  const status = useStore((s) => s.source.status);
  const health = useStore((s) => s.source.health);
  const editSource = useStore((s) => s.editSource);
  const applySource = useStore((s) => s.applySource);
  const revertSource = useStore((s) => s.revertSource);

  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  /** Text this component last pushed into the store, to avoid echoing it back. */
  const localRef = useRef(text);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          latex(),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            const value = u.state.doc.toString();
            localRef.current = value;
            editSource(value);

            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => {
              const s = useStore.getState();
              // Only auto-apply when the edit is structurally sound and has not
              // turned modelled content into raw blocks.
              if (
                s.source.status === 'dirty' &&
                s.source.health !== null &&
                s.source.health.balanced &&
                s.source.health.rawDelta <= 0
              ) {
                s.applySource();
              }
            }, AUTO_APPLY_IDLE_MS);
          }),
        ],
      }),
    });
    viewRef.current = view;

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      view.destroy();
      viewRef.current = null;
    };
    // Mount once; document updates are pushed through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push store -> editor only when the change did not originate here.
  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    if (text === localRef.current) return;
    localRef.current = text;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
    });
  }, [text]);

  return (
    <div className="bp-source">
      <div className={`bp-source-bar status-${status}`}>
        {status === 'synced' && <span className="bp-ok">In sync with the canvas</span>}
        {status === 'dirty' && (
          <>
            <span className="bp-warn">
              Unapplied source edits — the canvas is read-only
              {health !== null && !health.balanced && ' (unbalanced braces or environments)'}
              {health !== null && health.rawDelta > 0 &&
                ` (${health.rawDelta} block${health.rawDelta === 1 ? '' : 's'} would become raw)`}
            </span>
            <span className="bp-source-actions">
              <button onClick={applySource}>Apply</button>
              <button onClick={revertSource}>Revert</button>
            </span>
          </>
        )}
      </div>
      <div className="bp-source-editor" ref={hostRef} />
    </div>
  );
}
