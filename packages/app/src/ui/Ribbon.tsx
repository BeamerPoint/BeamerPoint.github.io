import { useRef, useState } from 'react';
import { THEME_IDS, themeUnavailableReason, type AspectRatio, type TexProgram } from '@beamerpoint/core';
import { selectCanvasLocked, selectCurrentFrame, useStore } from '../state/store.js';
import { useImageImport } from './useImageImport.js';
import { canLinkFile, useLinkFile } from './SaveIndicator.js';
import { ShapeGallery } from '../panels/ShapeGallery.js';
import { SmartArtPicker } from '../panels/SmartArtPicker.js';
import {
  IconBackward, IconBlock, IconBullets, IconCompile, IconDelete, IconDiagram,
  IconEquation, IconExport, IconForward, IconGrid, IconGuides, IconImage,
  IconNew, IconOpen, IconRedo, IconRuler, IconSave, IconShapes, IconSlideAdd,
  IconSmartArt, IconSnap, IconTable, IconText, IconTextBox, IconUndo,
} from './icons.js';

export type RibbonTab = 'home' | 'insert' | 'design' | 'view';

const TABS: Array<{ id: RibbonTab; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'insert', label: 'Insert' },
  { id: 'design', label: 'Design' },
  { id: 'view', label: 'View' },
];

const ASPECTS: Array<{ v: AspectRatio; label: string }> = [
  { v: '169', label: '16:9' },
  { v: '43', label: '4:3' },
  { v: '1610', label: '16:10' },
  { v: '32', label: '3:2' },
];

const PROGRAMS: TexProgram[] = ['pdflatex', 'xelatex', 'lualatex'];

/* ------------------------------------------------------------- primitives */

/** A group of related commands with its name underneath, as a ribbon does. */
function Group({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="bp-rgroup">
      <div className="bp-rgroup-body">{children}</div>
      <div className="bp-rgroup-label">{label}</div>
    </div>
  );
}

interface CmdProps {
  icon: React.ReactElement;
  label: string;
  title?: string;
  disabled?: boolean;
  active?: boolean;
  onClick(): void;
}

/** A tall button: icon over label. Used for the primary command in a group. */
function Big({ icon, label, title, disabled, active, onClick }: CmdProps): React.ReactElement {
  return (
    <button
      className={`bp-cmd bp-cmd-big${active === true ? ' is-active' : ''}`}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="bp-cmd-icon">{icon}</span>
      <span className="bp-cmd-label">{label}</span>
    </button>
  );
}

/** A short button: icon beside label, stacked three to a group. */
function Small({ icon, label, title, disabled, active, onClick }: CmdProps): React.ReactElement {
  return (
    <button
      className={`bp-cmd bp-cmd-small${active === true ? ' is-active' : ''}`}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="bp-cmd-icon">{icon}</span>
      <span className="bp-cmd-label">{label}</span>
    </button>
  );
}

/** A vertical stack of small buttons, which is how a ribbon fills its height. */
function Stack({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="bp-cmd-stack">{children}</div>;
}

/* ------------------------------------------------------------------ ribbon */

interface Props {
  onImportTex(): void;
  onExport(): void;
  onCompile(): void;
  compileDisabled: boolean;
}

export function Ribbon(props: Props): React.ReactElement {
  const [tab, setTab] = useState<RibbonTab>('home');
  const [gallery, setGallery] = useState<{ top: number; left: number } | null>(null);
  const galleryHost = useRef<HTMLDivElement>(null);
  const [smartArt, setSmartArt] = useState(false);
  const images = useImageImport();
  const linkFile = useLinkFile();

  const frame = useStore(selectCurrentFrame);
  const locked = useStore(selectCanvasLocked);
  const deck = useStore((s) => s.deck);
  const selection = useStore((s) => s.selection);

  const resetDeck = useStore((s) => s.resetDeck);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const addSlide = useStore((s) => s.addSlide);
  const deleteSlide = useStore((s) => s.deleteSlide);
  const moveSlide = useStore((s) => s.moveSlide);

  const addTextElement = useStore((s) => s.addTextElement);
  const addListElement = useStore((s) => s.addListElement);
  const addBlockElement = useStore((s) => s.addBlockElement);
  const addColumnsElement = useStore((s) => s.addColumnsElement);
  const addMathElement = useStore((s) => s.addMathElement);
  const addTableElement = useStore((s) => s.addTableElement);
  const addTikzElement = useStore((s) => s.addTikzElement);
  const addTextBox = useStore((s) => s.addTextBox);
  const deleteElement = useStore((s) => s.deleteElement);

  const setTheme = useStore((s) => s.setTheme);
  const setAspect = useStore((s) => s.setAspect);
  const setTexProgram = useStore((s) => s.setTexProgram);

  const aids = useStore((s) => s.aids);
  const setAids = useStore((s) => s.setAids);

  const shapeTool = useStore((s) => s.shapeTool);
  const setShapeTool = useStore((s) => s.setShapeTool);
  const reorderShape = useStore((s) => s.reorderShape);
  const addSmartArt = useStore((s) => s.addSmartArt);

  const noFrame = locked || frame === undefined;
  const fid = frame?.id;

  /** The selected element, so the ribbon can offer what applies to it. */
  const selected = frame?.children.find((e) => e.id === selection.elementId);
  const selectedTikz = selected?.kind === 'tikz' && selected.mode === 'shapes' ? selected : undefined;

  const themeName = deck.preamble.theme.name;
  const themeWarning = themeUnavailableReason(themeName);

  return (
    <div className="bp-ribbon">
      <div className="bp-ribbon-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`bp-ribbon-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div className="bp-ribbon-tabs-spacer" />
        {locked && (
          <span className="bp-lock-chip" title="Apply or revert the source edits to unlock">
            Source editor has unapplied changes
          </span>
        )}
      </div>

      <div className="bp-ribbon-body" role="tabpanel">
        {tab === 'home' && (
          <>
            <Group label="File">
              <Big icon={<IconNew size={20} />} label="New" title="Start an empty deck" onClick={resetDeck} />
              <Stack>
                <Small icon={<IconOpen />} label="Import .tex" onClick={props.onImportTex} />
                <Small icon={<IconExport />} label={deck.resources.length > 0 ? 'Export project' : 'Export .tex'} onClick={props.onExport} />
                <Small icon={<IconSave />} label="Save as…" title="Autosave straight to a .tex file on disk" disabled={!canLinkFile()} onClick={() => void linkFile()} />
              </Stack>
            </Group>

            <Group label="Undo">
              <Stack>
                <Small icon={<IconUndo />} label="Undo" title="Undo (Ctrl+Z)" onClick={undo} />
                <Small icon={<IconRedo />} label="Redo" title="Redo (Ctrl+Y)" onClick={redo} />
              </Stack>
            </Group>

            <Group label="Slides">
              <Big icon={<IconSlideAdd size={20} />} label="New slide" disabled={locked} onClick={addSlide} />
              <Stack>
                <Small icon={<IconForward />} label="Move up" disabled={noFrame} onClick={() => fid && moveSlide(fid, -1)} />
                <Small icon={<IconBackward />} label="Move down" disabled={noFrame} onClick={() => fid && moveSlide(fid, 1)} />
                <Small icon={<IconDelete />} label="Delete slide" disabled={noFrame} onClick={() => fid && deleteSlide(fid)} />
              </Stack>
            </Group>

            <Group label="Content">
              <Big icon={<IconText size={20} />} label="Text" disabled={noFrame} onClick={() => fid && addTextElement(fid)} />
              <Big icon={<IconBullets size={20} />} label="Bullets" disabled={noFrame} onClick={() => fid && addListElement(fid)} />
              <Stack>
                <Small icon={<IconBlock />} label="Block" disabled={noFrame} onClick={() => fid && addBlockElement(fid, 'block')} />
                <Small icon={<IconBlock />} label="Alert block" disabled={noFrame} onClick={() => fid && addBlockElement(fid, 'alertblock')} />
                <Small icon={<IconBlock />} label="Example block" disabled={noFrame} onClick={() => fid && addBlockElement(fid, 'exampleblock')} />
              </Stack>
            </Group>

            <Group label="Selection">
              <Stack>
                <Small
                  icon={<IconDelete />}
                  label="Delete element"
                  disabled={locked || selected === undefined}
                  onClick={() => fid && selection.elementId && deleteElement(fid, selection.elementId)}
                />
              </Stack>
            </Group>

            <Group label="Compile">
              <Big
                icon={<IconCompile size={20} />}
                label="Compile"
                title="Render the deck with real LaTeX"
                disabled={props.compileDisabled}
                onClick={props.onCompile}
              />
            </Group>
          </>
        )}

        {tab === 'insert' && (
          <>
            <Group label="Text">
              <Big icon={<IconText size={20} />} label="Text" disabled={noFrame} onClick={() => fid && addTextElement(fid)} />
              <Big icon={<IconTextBox size={20} />} label="Text box" title="A box you can position anywhere on the slide" disabled={noFrame} onClick={() => fid && addTextBox(fid)} />
              <Big icon={<IconBullets size={20} />} label="Bullets" disabled={noFrame} onClick={() => fid && addListElement(fid)} />
            </Group>

            <Group label="Layout">
              <Big icon={<IconColumnsIcon />} label="Columns" disabled={noFrame} onClick={() => fid && addColumnsElement(fid)} />
              <Big icon={<IconBlock size={20} />} label="Block" disabled={noFrame} onClick={() => fid && addBlockElement(fid, 'block')} />
            </Group>

            <Group label="Illustrations">
              <Big icon={<IconImage size={20} />} label="Picture" title="Insert a picture, or drag one onto the slide" disabled={noFrame} onClick={images.choose} />
              <Big icon={<IconDiagram size={20} />} label="Diagram" title="A drawing canvas for shapes and arrows" disabled={noFrame} onClick={() => fid && addTikzElement(fid)} />
              <Big icon={<IconTable size={20} />} label="Table" disabled={noFrame} onClick={() => fid && addTableElement(fid)} />
            </Group>

            <Group label="Shapes">
              <div className="bp-flyout-host" ref={galleryHost}>
                <Big
                  icon={<IconShapes size={20} />}
                  label="Shapes"
                  title="Rectangles, arrows, stars and the rest"
                  active={gallery !== null}
                  disabled={noFrame}
                  onClick={() => {
                    // Positioned fixed from the button's own rect: the ribbon body
                    // scrolls horizontally, and an absolutely-positioned flyout inside
                    // it gets clipped to a single visible row.
                    if (gallery !== null) { setGallery(null); return; }
                    const r = galleryHost.current?.getBoundingClientRect();
                    if (r !== undefined) setGallery({ top: r.bottom + 2, left: r.left });
                  }}
                />
                {gallery !== null && (
                  <>
                    <div className="bp-flyout-scrim" onClick={() => setGallery(null)} />
                    <div className="bp-flyout" style={{ top: gallery.top, left: gallery.left }}>
                      <ShapeGallery
                        active={shapeTool}
                        disabled={locked}
                        onPick={(t) => {
                          // Drawing needs a diagram to draw into; make one if the
                          // selection is not already a diagram.
                          if (fid !== undefined && selectedTikz === undefined) addTikzElement(fid);
                          setShapeTool(t);
                          setGallery(null);
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
              <Big
                icon={<IconSmartArt size={20} />}
                label="Layouts"
                title="Prebuilt diagrams: process, cycle, hierarchy, pyramid…"
                disabled={noFrame}
                onClick={() => setSmartArt(true)}
              />
            </Group>

            <Group label="Symbols">
              <Big icon={<IconEquation size={20} />} label="Equation" disabled={noFrame} onClick={() => fid && addMathElement(fid)} />
            </Group>

            {selectedTikz !== undefined && (
              <Group label="Arrange">
                <Stack>
                  <Small
                    icon={<IconForward />}
                    label="Bring forward"
                    disabled={locked || selection.shapeId == null}
                    onClick={() => fid && selection.shapeId && reorderShape(fid, selectedTikz.id, selection.shapeId, 1)}
                  />
                  <Small
                    icon={<IconBackward />}
                    label="Send backward"
                    disabled={locked || selection.shapeId == null}
                    onClick={() => fid && selection.shapeId && reorderShape(fid, selectedTikz.id, selection.shapeId, -1)}
                  />
                </Stack>
              </Group>
            )}
          </>
        )}

        {tab === 'design' && (
          <>
            <Group label="Theme">
              <label className="bp-field">
                <span>Presentation theme</span>
                <select value={themeName} onChange={(e) => setTheme(e.target.value)} disabled={locked}>
                  {/*
                    * No "approximate on canvas" suffix here: almost every theme is
                    * approximate, so the note on each row was noise that made the list
                    * hard to scan. The format pane says it once for the chosen theme.
                    */}
                  {THEME_IDS.map((name) => <option key={name} value={name}>{name}</option>)}
                  {!THEME_IDS.includes(themeName) && <option value={themeName}>{themeName}</option>}
                </select>
              </label>
              {themeWarning !== undefined && (
                <p className="bp-ribbon-warn">Needs {themeWarning}, which is not bundled.</p>
              )}
            </Group>

            <Group label="Slide size">
              <div className="bp-seg">
                {ASPECTS.map((a) => (
                  <button
                    key={a.v}
                    className={deck.preamble.documentClass.aspectRatio === a.v ? 'is-active' : ''}
                    disabled={locked}
                    onClick={() => setAspect(a.v)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </Group>

            <Group label="Engine">
              <label className="bp-field">
                <span>Compile with</span>
                <select
                  value={deck.preamble.texProgram ?? 'pdflatex'}
                  onChange={(e) => setTexProgram(e.target.value as TexProgram)}
                  disabled={locked}
                >
                  {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            </Group>
          </>
        )}

        {tab === 'view' && (
          <>
            <Group label="Show">
              <Stack>
                <Small icon={<IconRuler />} label="Rulers" active={aids.rulers} onClick={() => setAids({ rulers: !aids.rulers })} />
                <Small icon={<IconGrid />} label="Gridlines" active={aids.grid} onClick={() => setAids({ grid: !aids.grid })} />
                <Small icon={<IconGuides />} label="Guides" active={aids.guides} onClick={() => setAids({ guides: !aids.guides })} />
              </Stack>
              <Stack>
                <Small icon={<IconSnap />} label="Snap to grid" active={aids.snap} onClick={() => setAids({ snap: !aids.snap })} />
                <label className="bp-field bp-field-inline">
                  <span>Spacing</span>
                  <select value={aids.gridMm} onChange={(e) => setAids({ gridMm: Number(e.target.value) })}>
                    {[5, 10, 20].map((n) => <option key={n} value={n}>{n} mm</option>)}
                  </select>
                </label>
                <Small
                  icon={<IconDelete />}
                  label="Clear guides"
                  disabled={aids.vertical.length === 0 && aids.horizontal.length === 0}
                  onClick={() => setAids({ vertical: [], horizontal: [] })}
                />
              </Stack>
            </Group>
          </>
        )}
      </div>

      {smartArt && (
        <SmartArtPicker
          onCancel={() => setSmartArt(false)}
          onInsert={(kind, labels) => {
            if (fid !== undefined) addSmartArt(fid, kind, labels);
            setSmartArt(false);
          }}
        />
      )}
    </div>
  );
}

/** Local alias so the Insert tab reads consistently with the other big buttons. */
function IconColumnsIcon(): React.ReactElement {
  return (
    <svg className="bp-icon" width="20" height="20" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.8" y="3" width="5" height="10" rx="0.9" />
      <rect x="9.2" y="3" width="5" height="10" rx="0.9" />
    </svg>
  );
}
