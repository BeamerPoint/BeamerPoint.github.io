import { selectCurrentFrame, selectFrames, useStore } from '../state/store.js';
import { SaveIndicator } from './SaveIndicator.js';

/**
 * The status strip.
 *
 * Everything here is state the user would otherwise have to hunt for: where they are
 * in the deck, what will be compiled, and whether their work is saved.
 */
export function StatusBar(): React.ReactElement {
  const frames = useStore(selectFrames);
  const frame = useStore(selectCurrentFrame);
  const deck = useStore((s) => s.deck);
  const engine = useStore((s) => s.engine);
  const locked = useStore((s) => s.source.status !== 'synced');

  const index = frames.findIndex((f) => f.id === frame?.id);
  const errors = (engine.result?.diagnostics ?? []).filter((d) => d.severity === 'error').length;

  return (
    <footer className="bp-status">
      <span className="bp-status-item">
        {index >= 0 ? `Slide ${index + 1} of ${frames.length}` : `${frames.length} slides`}
      </span>
      <span className="bp-status-sep" />
      <span className="bp-status-item">{deck.preamble.theme.name}</span>
      <span className="bp-status-sep" />
      <span className="bp-status-item">{deck.preamble.texProgram ?? 'pdflatex'}</span>

      <span className="bp-status-spacer" />

      {locked && <span className="bp-status-item is-warn">Canvas locked — source has unapplied edits</span>}
      {engine.compiling && <span className="bp-status-item">Compiling…</span>}
      {!engine.compiling && engine.result !== null && (
        errors > 0
          ? <span className="bp-status-item is-error">{errors} error{errors === 1 ? '' : 's'}</span>
          : <span className="bp-status-item is-ok">Compiled cleanly</span>
      )}
      <span className="bp-status-sep" />
      <SaveIndicator />
    </footer>
  );
}
