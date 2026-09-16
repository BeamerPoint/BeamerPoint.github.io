import { useEffect, useState } from 'react';
import { emitDeck, parseDeck, richTextToPlain } from '@beamerpoint/core';
import { SlideCanvas } from './canvas/SlideCanvas.js';
import { SlideThumbs } from './panels/SlideThumbs.js';
import { SourcePanel } from './panels/SourcePanel.js';
import { PdfPanel } from './panels/PdfPanel.js';
import { LogPanel } from './panels/LogPanel.js';
import { FormatPane } from './panels/FormatPane.js';
import { selectCanvasLocked, selectCurrentFrame, selectFrames, useStore } from './state/store.js';
import { loadSavedDeck, readEmergencyTex, startAutosave } from './state/persist.js';
import { useColumnLayout } from './ui/useColumnLayout.js';
import { Splitter } from './ui/Splitter.js';
import { Ribbon } from './ui/Ribbon.js';
import { StatusBar } from './ui/StatusBar.js';
import { FileLinkButton } from './ui/SaveIndicator.js';
import { useImageImport } from './ui/useImageImport.js';
import { useTexImport, isTexFile } from './ui/useTexImport.js';
import { useEngine } from './engine/useEngine.js';
import { ImportDialog } from './panels/ImportDialog.js';
import { exportDeck } from './io/exportProject.js';
import { IconLog, IconPdf, IconSource } from './ui/icons.js';

type Tab = 'source' | 'pdf' | 'log';

const TABS: Array<{ id: Tab; label: string; icon: React.ReactElement }> = [
  { id: 'source', label: 'LaTeX', icon: <IconSource /> },
  { id: 'pdf', label: 'PDF', icon: <IconPdf /> },
  { id: 'log', label: 'Log', icon: <IconLog /> },
];

export function App(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('source');
  const layout = useColumnLayout();
  const images = useImageImport();
  const texImport = useTexImport();
  const engine = useEngine();
  const [recovery, setRecovery] = useState<{ at: number; tex: string } | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);

  const overlayMode = useStore((s) => s.overlayMode);
  const nudgeImageWidth = useStore((s) => s.nudgeImageWidth);
  const moveElementBy = useStore((s) => s.moveElementBy);
  const resizeElementBy = useStore((s) => s.resizeElementBy);
  const setImageTrim = useStore((s) => s.setImageTrim);
  const aids = useStore((s) => s.aids);
  const addGuide = useStore((s) => s.addGuide);
  const moveGuide = useStore((s) => s.moveGuide);
  const removeGuide = useStore((s) => s.removeGuide);

  const deck = useStore((s) => s.deck);
  const frame = useStore(selectCurrentFrame);
  const frames = useStore(selectFrames);
  const selection = useStore((s) => s.selection);
  const locked = useStore(selectCanvasLocked);
  const engineStatus = useStore((s) => s.engine.status);
  const compiling = useStore((s) => s.engine.compiling);
  const selectElement = useStore((s) => s.selectElement);
  const setElementContent = useStore((s) => s.setElementContent);
  const setListItemContent = useStore((s) => s.setListItemContent);
  const setTableCell = useStore((s) => s.setTableCell);
  const loadDeck = useStore((s) => s.loadDeck);
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
  const deckTitle = deck.meta.title ? richTextToPlain(deck.meta.title) : 'Untitled presentation';

  const onExport = (): void => {
    void (async () => {
      const result = await exportDeck(deck);
      if (result.missing.length > 0) {
        setExportNote(
          `Exported ${result.filename}, but ${result.missing.length} referenced `
          + `file${result.missing.length === 1 ? ' is' : 's are'} not stored here. `
          + 'See MISSING-FILES.txt in the archive.',
        );
      }
    })();
  };

  const onCompile = (): void => {
    setTab('pdf');
    if (engineStatus.s === 'uninitialised' || engineStatus.s === 'failed') {
      void engine.install();
      return;
    }
    void engine.compile();
  };

  return (
    <div className="bp-app">
      <header className="bp-titlebar">
        <span className="bp-brand">
          <span className="bp-brand-mark">BP</span>
          BeamerPoint
        </span>
        <span className="bp-doctitle" title={deckTitle}>{deckTitle}</span>
        <span className="bp-titlebar-spacer" />
        <FileLinkButton />
      </header>

      <Ribbon
        onImportTex={texImport.choose}
        onExport={onExport}
        onCompile={onCompile}
        compileDisabled={compiling}
      />

      {texImport.pending !== null && (
        <ImportDialog
          filename={texImport.pending.filename}
          analysis={texImport.pending.analysis}
          onCancel={texImport.cancel}
          onConfirm={(files) => void texImport.confirm(files)}
        />
      )}

      <div className="bp-notice-stack">
        {texImport.notice !== null && (
          <div className="bp-notice">
            <span>{texImport.notice}</span>
            <button onClick={texImport.dismissNotice}>Dismiss</button>
          </div>
        )}
        {exportNote !== null && (
          <div className="bp-notice">
            <span>{exportNote}</span>
            <button onClick={() => setExportNote(null)}>Dismiss</button>
          </div>
        )}
        {images.notice !== null && (
          <div className="bp-notice">
            <span>{images.notice}</span>
            <button onClick={images.dismissNotice}>Dismiss</button>
          </div>
        )}
        {recovery !== null && (
          <div className="bp-notice is-prompt">
            <span>
              Unsaved changes were found from {new Date(recovery.at).toLocaleString()} —
              the tab probably closed before they were written.
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
      </div>

      <div className="bp-main" style={{ gridTemplateColumns: layout.gridTemplate }}>
        <SlideThumbs />

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
            onMoveElement={(elementId, dx, dy) => {
              if (selection.slideId !== null) moveElementBy(selection.slideId, elementId, dx, dy);
            }}
            onResizeElement={(elementId, dx, dy, grip) => {
              if (selection.slideId !== null) {
                resizeElementBy(selection.slideId, elementId, dx, dy, grip);
              }
            }}
            onTrimImage={(elementId, trim) => {
              if (selection.slideId !== null) setImageTrim(selection.slideId, elementId, trim);
            }}
          />

          <p className="bp-approx-note">
            The canvas is an approximation — use the PDF tab for the exact result.
          </p>
        </div>

        <Splitter
          label="Resize the source and preview panel"
          onResize={(d) => layout.resize('panel', -d)}
          onCommit={layout.commit}
          onReset={() => layout.reset('panel')}
        />

        <div className="bp-right">
          <nav className="bp-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? 'is-active' : ''}
                onClick={() => setTab(t.id)}
              >
                {t.icon}
                {t.label}
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

        <FormatPane />
      </div>

      <StatusBar />
    </div>
  );
}
