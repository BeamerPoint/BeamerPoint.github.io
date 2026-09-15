import { useEffect, useState } from 'react';
import { emitDeck } from '@beamerpoint/core';
import { SlideCanvas } from './canvas/SlideCanvas.js';
import { SlideList } from './panels/SlideList.js';
import { SourcePanel } from './panels/SourcePanel.js';
import { PdfPanel } from './panels/PdfPanel.js';
import { LogPanel } from './panels/LogPanel.js';
import { Inspector } from './panels/Inspector.js';
import { selectCanvasLocked, selectCurrentFrame, selectFrames, useStore } from './state/store.js';
import { loadSavedDeck, startAutosave } from './state/persist.js';

type Tab = 'source' | 'pdf' | 'log';

export function App(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('source');

  const deck = useStore((s) => s.deck);
  const frame = useStore(selectCurrentFrame);
  const frames = useStore(selectFrames);
  const selection = useStore((s) => s.selection);
  const locked = useStore(selectCanvasLocked);
  const selectElement = useStore((s) => s.selectElement);
  const setElementContent = useStore((s) => s.setElementContent);
  const setListItemContent = useStore((s) => s.setListItemContent);
  const loadDeck = useStore((s) => s.loadDeck);
  const resetDeck = useStore((s) => s.resetDeck);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  // Restore the last session, then keep autosaving.
  useEffect(() => {
    void (async () => {
      const saved = await loadSavedDeck();
      if (saved !== undefined) loadDeck(saved);
    })();
    return startAutosave();
  }, [loadDeck]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const frameNumber = frames.findIndex((f) => f.id === selection.slideId) + 1;

  const exportTex = (): void => {
    const { tex } = emitDeck(deck, { target: 'export' });
    const blob = new Blob([tex], { type: 'text/x-tex' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'presentation.tex';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bp-app">
      <header className="bp-ribbon">
        <span className="bp-brand">BeamerPoint</span>
        <div className="bp-ribbon-group">
          <button onClick={resetDeck}>New</button>
          <button onClick={exportTex}>Export .tex</button>
        </div>
        <div className="bp-ribbon-group">
          <button onClick={undo} title="Undo (Ctrl+Z)">Undo</button>
          <button onClick={redo} title="Redo (Ctrl+Y)">Redo</button>
        </div>
        {locked && (
          <span className="bp-lock-banner">
            Source editor has unapplied changes — the canvas is read-only
          </span>
        )}
      </header>

      <div className="bp-main">
        <SlideList />

        <div className="bp-center">
          <SlideCanvas
            deck={deck}
            frame={frame}
            frameNumber={frameNumber}
            selectedElementId={selection.elementId}
            locked={locked}
            onSelectElement={(id) => selection.slideId && selectElement(selection.slideId, id)}
            onEditContent={(elementId, content) => {
              if (selection.slideId !== null) {
                setElementContent(selection.slideId, elementId, content);
              }
            }}
            onEditItem={(elementId, itemId, content) => {
              if (selection.slideId !== null) {
                setListItemContent(selection.slideId, elementId, itemId, content);
              }
            }}
          />
          <p className="bp-approx-note">
            This canvas is an approximation of Beamer&rsquo;s output. Use the PDF tab for
            the exact result.
          </p>
        </div>

        <div className="bp-right">
          <nav className="bp-tabs">
            {(['source', 'pdf', 'log'] as Tab[]).map((t) => (
              <button
                key={t}
                className={tab === t ? 'is-active' : ''}
                onClick={() => setTab(t)}
              >
                {t === 'source' ? 'LaTeX source' : t === 'pdf' ? 'PDF' : 'Log'}
              </button>
            ))}
          </nav>
          <div className="bp-tabbody">
            {tab === 'source' && <SourcePanel />}
            {tab === 'pdf' && <PdfPanel />}
            {tab === 'log' && <LogPanel />}
          </div>
        </div>

        <Inspector />
      </div>
    </div>
  );
}
