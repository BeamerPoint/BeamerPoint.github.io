import { useEffect, useState } from 'react';
import { emitDeck, parseDeck } from '@beamerpoint/core';
import { SlideCanvas } from './canvas/SlideCanvas.js';
import { SlideList } from './panels/SlideList.js';
import { SourcePanel } from './panels/SourcePanel.js';
import { PdfPanel } from './panels/PdfPanel.js';
import { LogPanel } from './panels/LogPanel.js';
import { Inspector } from './panels/Inspector.js';
import { selectCanvasLocked, selectCurrentFrame, selectFrames, useStore } from './state/store.js';
import { loadSavedDeck, readEmergencyTex, startAutosave } from './state/persist.js';
import { useColumnLayout } from './ui/useColumnLayout.js';
import { Splitter } from './ui/Splitter.js';
import { SaveIndicator } from './ui/SaveIndicator.js';
import { useImageImport } from './ui/useImageImport.js';
import { useTexImport, isTexFile } from './ui/useTexImport.js';
import { ImportDialog } from './panels/ImportDialog.js';
import { exportDeck } from './io/exportProject.js';

type Tab = 'source' | 'pdf' | 'log';

export function App(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('source');
  const layout = useColumnLayout();
  const images = useImageImport();
  const texImport = useTexImport();
  const [recovery, setRecovery] = useState<{ at: number; tex: string } | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const overlayMode = useStore((s) => s.overlayMode);
  const nudgeImageWidth = useStore((s) => s.nudgeImageWidth);
  const moveElementBy = useStore((s) => s.moveElementBy);
  const setImageTrim = useStore((s) => s.setImageTrim);
  const aids = useStore((s) => s.aids);
  const setAids = useStore((s) => s.setAids);
  const addGuide = useStore((s) => s.addGuide);
  const moveGuide = useStore((s) => s.moveGuide);
  const removeGuide = useStore((s) => s.removeGuide);
  const addTextBox = useStore((s) => s.addTextBox);

  const deck = useStore((s) => s.deck);
  const frame = useStore(selectCurrentFrame);
  const frames = useStore(selectFrames);
  const selection = useStore((s) => s.selection);
  const locked = useStore(selectCanvasLocked);
  const selectElement = useStore((s) => s.selectElement);
  const setElementContent = useStore((s) => s.setElementContent);
  const setListItemContent = useStore((s) => s.setListItemContent);
  const setTableCell = useStore((s) => s.setTableCell);
  const loadDeck = useStore((s) => s.loadDeck);
  const resetDeck = useStore((s) => s.resetDeck);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  // Restore the last session, then keep autosaving.
  useEffect(() => {
    void (async () => {
      const saved = await loadSavedDeck();
      if (saved !== undefined) loadDeck(saved);

      // The synchronous .tex mirror is written during teardown, so it can be ahead of
      // the structured deck if the tab was closed or crashed mid-edit. Offer it rather
      // than silently picking one, because either choice discards work.
      const emergency = readEmergencyTex();
      if (emergency === null) return;
      const current = saved === undefined ? null : emitDeck(saved, { target: 'export' }).tex;
      if (current !== emergency.tex) setRecovery(emergency);
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

  const onExport = (): void => {
    void (async () => {
      const result = await exportDeck(deck);
      if (result.missing.length > 0) {
        setExportNote(
          `Exported ${result.filename}, but ${result.missing.length} referenced ` +
          `file${result.missing.length === 1 ? ' is' : 's are'} not stored here. ` +
          'See MISSING-FILES.txt in the archive.',
        );
      }
    })();
  };

  return (
    <div className="bp-app">
      <header className="bp-ribbon">
        <span className="bp-brand">BeamerPoint</span>
        <div className="bp-ribbon-group">
          <button onClick={resetDeck}>New</button>
          <button
            onClick={texImport.choose}
            title="Open a Beamer .tex file and work on it here"
          >
            Import .tex
          </button>
          <button
            onClick={onExport}
            title={deck.resources.length > 0
              ? 'Export a zip with the source and every image it uses'
              : 'Export the LaTeX source'}
          >
            {deck.resources.length > 0 ? 'Export project' : 'Export .tex'}
          </button>
        </div>
        <div className="bp-ribbon-group">
          <button onClick={undo} title="Undo (Ctrl+Z)">Undo</button>
          <button onClick={redo} title="Redo (Ctrl+Y)">Redo</button>
        </div>
        <SaveIndicator />
        {locked && (
          <span className="bp-lock-banner">
            Source editor has unapplied changes — the canvas is read-only
          </span>
        )}
      </header>

      {texImport.pending !== null && (
        <ImportDialog
          filename={texImport.pending.filename}
          analysis={texImport.pending.analysis}
          onCancel={texImport.cancel}
          onConfirm={(files) => void texImport.confirm(files)}
        />
      )}

      {texImport.notice !== null && (
        <div className="bp-recovery">
          <span>{texImport.notice}</span>
          <button onClick={texImport.dismissNotice}>Dismiss</button>
        </div>
      )}

      {exportNote !== null && (
        <div className="bp-recovery">
          <span>{exportNote}</span>
          <button onClick={() => setExportNote(null)}>Dismiss</button>
        </div>
      )}

      {recovery !== null && (
        <div className="bp-recovery">
          <span>
            Unsaved changes were found from{' '}
            {new Date(recovery.at).toLocaleString()} — the tab probably closed before
            they were written.
          </span>
          <button
            className="bp-primary"
            onClick={() => {
              loadDeck(parseDeck(recovery.tex).deck);
              setRecovery(null);
            }}
          >
            Recover them
          </button>
          <button onClick={() => setRecovery(null)}>Discard</button>
        </div>
      )}

      <div className="bp-main" style={{ gridTemplateColumns: layout.gridTemplate }}>
        <SlideList />

        <Splitter
          label="Resize slide list"
          onResize={(d) => layout.resize('slides', d)}
          onCommit={layout.commit}
          onReset={() => layout.reset('slides')}
        />

        <div
          className={`bp-center${images.dragging ? ' is-dropping' : ''}`}
          {...images.dropHandlers}
          onDrop={(e) => {
            // A dropped .tex is an import, not an image. Intercept it before the
            // image handler tells the user it is "not an image".
            const tex = [...e.dataTransfer.files].find(isTexFile);
            if (tex !== undefined) {
              e.preventDefault();
              e.stopPropagation();
              void texImport.offer(tex);
              return;
            }
            images.dropHandlers.onDrop(e);
          }}
        >
          {images.dragging && (
            <div className="bp-drop-overlay">Drop to add the image to this slide</div>
          )}
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
            onEditCell={(elementId, rowId, cellId, content) => {
              if (selection.slideId !== null) {
                setTableCell(selection.slideId, elementId, rowId, cellId, content);
              }
            }}
            onEditItem={(elementId, itemId, content) => {
              if (selection.slideId !== null) {
                setListItemContent(selection.slideId, elementId, itemId, content);
              }
            }}
            overlayMode={overlayMode}
            aids={aids}
            onAddGuide={addGuide}
            onMoveGuide={moveGuide}
            onRemoveGuide={removeGuide}
            onResizeImage={(elementId, deltaMm, deltaFraction) => {
              if (selection.slideId !== null) {
                nudgeImageWidth(selection.slideId, elementId, deltaMm, deltaFraction);
              }
            }}
            onMoveImage={(elementId, dx, dy) => {
              if (selection.slideId !== null) moveElementBy(selection.slideId, elementId, dx, dy);
            }}
            onTrimImage={(elementId, trim) => {
              if (selection.slideId !== null) setImageTrim(selection.slideId, elementId, trim);
            }}
          />
          <div className="bp-canvas-bar">
            <button
              className={aids.rulers ? 'is-active' : ''}
              title="Rulers — click one to drop a guide"
              onClick={() => setAids({ rulers: !aids.rulers })}
            >
              Rulers
            </button>
            <button
              className={aids.grid ? 'is-active' : ''}
              title="Gridlines"
              onClick={() => setAids({ grid: !aids.grid })}
            >
              Grid
            </button>
            <select
              title="Grid spacing"
              value={aids.gridMm}
              onChange={(e) => setAids({ gridMm: Number(e.target.value) })}
            >
              {[5, 10, 20].map((n) => <option key={n} value={n}>{n}mm</option>)}
            </select>
            <button
              className={aids.guides ? 'is-active' : ''}
              title="Show guides"
              onClick={() => setAids({ guides: !aids.guides })}
            >
              Guides
            </button>
            <button
              className={aids.snap ? 'is-active' : ''}
              title="Snap dragged elements to the grid and guides"
              onClick={() => setAids({ snap: !aids.snap })}
            >
              Snap
            </button>
            {(aids.vertical.length > 0 || aids.horizontal.length > 0) && (
              <button
                title="Remove every guide"
                onClick={() => setAids({ vertical: [], horizontal: [] })}
              >
                Clear guides
              </button>
            )}
            <button
              disabled={locked || !frame}
              title="Insert a text box you can position anywhere"
              onClick={() => frame && addTextBox(frame.id)}
            >
              + Text box
            </button>
            <span className="bp-approx-note">
              Approximation — use the PDF tab for the exact result.
            </span>
          </div>
        </div>

        <Splitter
          label="Resize the source and preview panel"
          onResize={(d) => layout.resize('panel', -d)}
          onCommit={layout.commit}
          onReset={() => layout.reset('panel')}
        />

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

        <Splitter
          label="Resize the properties panel"
          onResize={(d) => layout.resize('inspector', -d)}
          onCommit={layout.commit}
          onReset={() => layout.reset('inspector')}
        />

        <Inspector />
      </div>
    </div>
  );
}
