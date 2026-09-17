import { useRef, useState } from 'react';
import {
  DECK_FONTS, DECK_FONT_PACKAGES, FONT_SIZES_ORDERED, THEME_IDS, resolveTheme,
  themeUnavailableReason,
  type AspectRatio, type BeamerFontSize, type Color, type InlineStyle, type TexProgram,
} from '@beamerpoint/core';
import { selectCanvasLocked, selectCurrentFrame, useStore } from '../state/store.js';
import { useImageImport } from './useImageImport.js';
import { canLinkFile, useLinkFile } from './SaveIndicator.js';
import { ShapeGallery } from '../panels/ShapeGallery.js';
import { colorToCss } from '../canvas/shapeColors.js';
import { useInlineFormat } from './useInlineFormat.js';
import { SmartArtPicker } from '../panels/SmartArtPicker.js';
import {
  IconBackward, IconBlock, IconBullets, IconCompile, IconDelete, IconDiagram,
  IconCode, IconEquation, IconExport, IconForward, IconGrid, IconGuides, IconImage,
  IconChart, IconOutline, IconMoveUp, IconMoveDown,
  IconCopy, IconCut, IconPaste, IconDuplicate, IconTitleSlide, IconLockAspect,
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
/**
 * Text colours worth one click.
 *
 * Strong and legible, unlike the shape palette's 20% mixes: this colours words, not
 * fills. `structure` follows the deck's theme, which is the one that stays right when
 * the theme changes.
 */
const TEXT_SWATCHES: Array<{ label: string; color: Color }> = [
  { label: 'Theme', color: { k: 'structure' } },
  { label: 'Black', color: { k: 'named', name: 'black' } },
  { label: 'Grey', color: { k: 'named', name: 'gray' } },
  { label: 'Red', color: { k: 'named', name: 'red' } },
  { label: 'Blue', color: { k: 'named', name: 'blue' } },
  { label: 'Green', color: { k: 'named', name: 'green' } },
  { label: 'Orange', color: { k: 'named', name: 'orange' } },
  { label: 'Purple', color: { k: 'named', name: 'violet' } },
];

const TOGGLES: Array<{ style: InlineStyle; label: string; title: string }> = [
  { style: 'bf', label: 'B', title: 'Bold (Ctrl+B)' },
  { style: 'it', label: 'I', title: 'Italic (Ctrl+I)' },
  { style: 'ul', label: 'U', title: 'Underline (Ctrl+U)' },
  { style: 'tt', label: 'M', title: 'Monospace' },
  { style: 'sc', label: 'SC', title: 'Small caps' },
  { style: 'alert', label: 'A', title: "Alert -- the theme's emphasis colour" },
];

/**
 * Formatting for the words that are selected.
 *
 * Every control here takes `onMouseDown` and cancels it. Clicking a button moves the
 * focus, which destroys the browser's selection before the click handler ever runs, and
 * then there is nothing left to format. Preventing the default on mousedown keeps the
 * focus — and the selection — inside the text box.
 */
function FontGroup(): React.ReactElement {
  const fmt = useInlineFormat();
  const themeName = useStore((s) => s.deck.preamble.theme.name);
  const theme = resolveTheme(themeName);
  const hold = (e: React.MouseEvent): void => e.preventDefault();

  return (
    <Group label="Font">
      <div className="bp-font-grid">
        <div className="bp-font-row">
          {TOGGLES.map((t) => (
            <button
              key={t.style}
              className={`bp-font-btn bp-font-${t.style}${
                fmt.active.styles.includes(t.style) ? ' is-active' : ''}`}
              title={t.title}
              disabled={!fmt.enabled}
              onMouseDown={hold}
              onClick={() => fmt.apply({ style: t.style })}
            >
              {t.label}
            </button>
          ))}
          <select
            className="bp-font-size"
            title="Size of the selected text"
            disabled={!fmt.enabled}
            value={fmt.active.size ?? ''}
            onMouseDown={hold}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') fmt.clear('size');
              else fmt.apply({ style: 'size', size: v as BeamerFontSize });
            }}
          >
            <option value="">Size</option>
            {FONT_SIZES_ORDERED.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>

        <div className="bp-font-row">
          {TEXT_SWATCHES.map((sw) => (
            <button
              key={sw.label}
              className="bp-font-swatch"
              style={{ background: colorToCss(sw.color, theme, 'transparent') }}
              title={sw.label}
              disabled={!fmt.enabled}
              onMouseDown={hold}
              onClick={() => fmt.apply({ style: 'color', color: sw.color })}
            />
          ))}
          <input
            className="bp-font-swatch bp-font-swatch-custom"
            type="color"
            title="Any colour"
            disabled={!fmt.enabled}
            onMouseDown={hold}
            onChange={(e) => fmt.apply({ style: 'color', color: hexToRgb(e.target.value) })}
          />
          <button
            className="bp-font-btn bp-font-clear"
            title="Remove the colour"
            disabled={!fmt.enabled}
            onMouseDown={hold}
            onClick={() => fmt.clear('color')}
          >
            &#8709;
          </button>
        </div>
      </div>
    </Group>
  );
}

/**
 * Which of the offered families the deck is using.
 *
 * Read from the preamble's package list rather than stored separately: the packages
 * already round-trip, so there is nothing new in the file and an imported deck that
 * happens to load `helvet` shows up here correctly.
 */
function currentDeckFont(packages: readonly { name: string }[]): string | null {
  return packages.map((p) => p.name).find((n) => DECK_FONT_PACKAGES.includes(n)) ?? null;
}

/** `#rrggbb` to the model's 0..1 triple. The parser reads this form back as a colour. */
function hexToRgb(hex: string): Color {
  const n = parseInt(hex.slice(1), 16);
  const to1 = (v: number): number => Math.round((v / 255) * 1000) / 1000;
  return { k: 'rgb', r: to1((n >> 16) & 255), g: to1((n >> 8) & 255), b: to1(n & 255) };
}

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
  const addCodeElement = useStore((s) => s.addCodeElement);
  const addChartElement = useStore((s) => s.addChartElement);
  const addOutlineSlide = useStore((s) => s.addOutlineSlide);
  const addTableElement = useStore((s) => s.addTableElement);
  const addTikzElement = useStore((s) => s.addTikzElement);
  const addTextBox = useStore((s) => s.addTextBox);
  const deleteElement = useStore((s) => s.deleteElement);

  const setTheme = useStore((s) => s.setTheme);
  const setAspect = useStore((s) => s.setAspect);
  const setTexProgram = useStore((s) => s.setTexProgram);
  const setDeckFont = useStore((s) => s.setDeckFont);
  const addTitleSlide = useStore((s) => s.addTitleSlide);
  const copyElement = useStore((s) => s.copyElement);
  const cutElement = useStore((s) => s.cutElement);
  const pasteElement = useStore((s) => s.pasteElement);
  const duplicateElement = useStore((s) => s.duplicateElement);
  const canPaste = useStore((s) => s.clipboard !== null);

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
              {/* `\titlepage` is a raw element by design, so nothing in the UI could
                  write it back once the deck's own title slide was deleted. */}
              <Big
                icon={<IconTitleSlide size={20} />}
                label="Title slide"
                title="A \titlepage slide, built by beamer from the deck's title and author"
                disabled={locked}
                onClick={addTitleSlide}
              />
              <Stack>
                {/* IconForward/IconBackward are the Z-ORDER arrows, and were being
                    used here for reordering slides. The right pair existed already
                    and had never been used anywhere. */}
                <Small icon={<IconMoveUp />} label="Move up" disabled={noFrame} onClick={() => fid && moveSlide(fid, -1)} />
                <Small icon={<IconMoveDown />} label="Move down" disabled={noFrame} onClick={() => fid && moveSlide(fid, 1)} />
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
              {/*
                * Code is content you put ON a slide, like the three blocks beside it,
                * not a symbol you insert into text -- but it goes in its OWN column.
                * A fourth row in that stack is taller than a Big button, so it grew
                * the whole ribbon by the height of one row, on every tab.
                */}
              <Stack>
                <Small
                  icon={<IconCode />}
                  label="Code"
                  title="A source listing, typeset by listings"
                  disabled={noFrame}
                  onClick={() => fid && addCodeElement(fid)}
                />
              </Stack>
            </Group>

            <FontGroup />

            <Group label="Selection">
              <Stack>
                <Small
                  icon={<IconCopy />}
                  label="Copy"
                  title="Copy this element (Ctrl+C)"
                  disabled={locked || selected === undefined}
                  onClick={() => fid && selection.elementId && copyElement(fid, selection.elementId)}
                />
                <Small
                  icon={<IconCut />}
                  label="Cut"
                  title="Cut this element (Ctrl+X)"
                  disabled={locked || selected === undefined}
                  onClick={() => fid && selection.elementId && cutElement(fid, selection.elementId)}
                />
                <Small
                  icon={<IconDelete />}
                  label="Delete"
                  title="Delete this element (Delete)"
                  disabled={locked || selected === undefined}
                  onClick={() => fid && selection.elementId && deleteElement(fid, selection.elementId)}
                />
              </Stack>
              <Stack>
                <Small
                  icon={<IconPaste />}
                  label="Paste"
                  title="Paste onto this slide (Ctrl+V)"
                  disabled={locked || noFrame || !canPaste}
                  onClick={pasteElement}
                />
                <Small
                  icon={<IconDuplicate />}
                  label="Duplicate"
                  title="Copy and paste in one step (Ctrl+D)"
                  disabled={locked || selected === undefined}
                  onClick={() => fid && selection.elementId && duplicateElement(fid, selection.elementId)}
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
              {/* Beside the button it changes the behaviour of. On the Design tab it
                  sat among the things that change how the deck LOOKS, which is not
                  what choosing pdfLaTeX or XeLaTeX is. */}
              <label className="bp-field bp-ribbon-field">
                <span>Engine</span>
                <select
                  value={deck.preamble.texProgram ?? 'pdflatex'}
                  onChange={(e) => setTexProgram(e.target.value as TexProgram)}
                  disabled={locked}
                  title="Which LaTeX program compiles this deck"
                >
                  {PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
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
              <Big
                icon={<IconChart size={20} />}
                label="Chart"
                title="A pgfplots chart with a small data grid"
                disabled={noFrame}
                onClick={() => fid && addChartElement(fid)}
              />
              <Big
                icon={<IconOutline size={20} />}
                label="Outline"
                title="A slide listing the deck's sections, built by beamer"
                disabled={locked}
                onClick={() => addOutlineSlide()}
              />
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

            <Group label="Font">
              <label className="bp-field">
                <span>Font family</span>
                <select
                  value={currentDeckFont(deck.preamble.packages) ?? ''}
                  onChange={(e) => setDeckFont(e.target.value === '' ? null : e.target.value)}
                  disabled={locked}
                  title="One family for the whole deck"
                >
                  {DECK_FONTS.map((f) => (
                    <option key={f.label} value={f.pkg ?? ''}>{f.label}</option>
                  ))}
                </select>
              </label>
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
                {/* A workspace preference, like snapping, not a property of anything
                    on the slide -- it says what dragging a CORNER means. Shift inverts
                    it for one drag, as it does in every drawing program. */}
                <Small
                  icon={<IconLockAspect />}
                  label="Lock aspect"
                  title="Keep the proportions when a corner is dragged (hold Shift to invert)"
                  active={aids.lockAspect}
                  onClick={() => setAids({ lockAspect: !aids.lockAspect })}
                />
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
