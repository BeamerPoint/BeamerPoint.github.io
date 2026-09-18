/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { useState } from 'react';
import {
  emitInline,
  isApproximateTheme,
  richTextFromTex,
  richTextToPlain,
  themeNeedsUnicodeEngine,
  themeUnavailableReason,
  type Element,
  type RichText,
} from '@beamerpoint/core';
import { findElement, selectCurrentFrame, useStore, type DeckMetaField } from '../state/store.js';
import { MathEditor } from './MathEditor.js';
import { TableEditor } from './TableEditor.js';
import { ShapeEditor } from './ShapeEditor.js';
import { CodeEditor } from './CodeEditor.js';
import { BibliographyPanel } from './BibliographyPanel.js';
import { ChartEditor } from './ChartEditor.js';
import { ArrangePane } from './ArrangePane.js';
import { ListEditor } from './ListEditor.js';
import { isTitlePageTex } from '../canvas/TitlePage.js';

const KIND_NAME: Partial<Record<Element['kind'], string>> = {
  text: 'Text', list: 'List', block: 'Block', columns: 'Columns', image: 'Picture',
  table: 'Table', math: 'Equation', tikz: 'Diagram', code: 'Code', raw: 'Raw LaTeX',
  pause: 'Pause',
};

/**
 * The format pane.
 *
 * Properties of what is selected, and nothing else. Commands that CREATE things live
 * in the ribbon — mixing "insert a table" in with "this table's column alignment" is
 * what made the old panel an undifferentiated wall of buttons.
 */
export function FormatPane(): React.ReactElement {
  const deck = useStore((s) => s.deck);
  const frame = useStore(selectCurrentFrame);
  const locked = useStore((s) => s.source.status !== 'synced');
  const selection = useStore((s) => s.selection);

  const setSlideTitle = useStore((s) => s.setSlideTitle);
  const setImageWidth = useStore((s) => s.setImageWidth);
  const setImageCaption = useStore((s) => s.setImageCaption);
  const setImageAlign = useStore((s) => s.setImageAlign);
  const setImageTrim = useStore((s) => s.setImageTrim);
  const setImageHeightMm = useStore((s) => s.setImageHeightMm);
  const setImageRotate = useStore((s) => s.setImageRotate);
  const setImageKeepAspect = useStore((s) => s.setImageKeepAspect);
  const setImageOpacity = useStore((s) => s.setImageOpacity);
  const overlayMode = useStore((s) => s.overlayMode);
  const setOverlayMode = useStore((s) => s.setOverlayMode);

  // At any depth: a text box inside a block or a column is as selectable as one in
  // the frame's own list, and the pane has to be able to format it.
  const selected = frame === undefined || selection.slideId === null
    ? undefined
    : findElement(deck, selection.slideId, selection.elementId ?? '');
  // The title page's content IS the presentation's metadata, so selecting it opens the
  // same editor that is otherwise offered when nothing in particular is selected.
  const showPresentation = selected === undefined
    || (selected.kind === 'raw' && isTitlePageTex(selected.tex));
  const themeName = deck.preamble.theme.name;
  const themeMissing = themeUnavailableReason(themeName);
  const needsUnicode = themeNeedsUnicodeEngine(themeName)
    && (deck.preamble.texProgram ?? 'pdflatex') === 'pdflatex';

  return (
    <aside className="bp-format">
      <div className="bp-pane-head">
        <span>{selected === undefined ? 'Slide' : `Format ${KIND_NAME[selected.kind] ?? selected.kind}`}</span>
      </div>

      <div className="bp-format-body">
        {(themeMissing !== undefined || needsUnicode || isApproximateTheme(themeName)) && (
          <div className="bp-notices">
            {themeMissing !== undefined && (
              <p className="bp-hint bp-hint-warn">
                <strong>{themeName}</strong> needs <code>{themeMissing}</code>, which is
                not bundled. Pick another theme on the Design tab, or compile elsewhere.
              </p>
            )}
            {needsUnicode && (
              <p className="bp-hint bp-hint-warn">
                {themeName} needs XeLaTeX or LuaLaTeX for its fonts. Under pdfLaTeX it
                compiles, but falls back to Computer Modern.
              </p>
            )}
            {isApproximateTheme(themeName) && (
              <p className="bp-hint">
                The canvas approximates this theme. Compile to see it properly.
              </p>
            )}
          </div>
        )}

        <section className="bp-format-section">
          <TexAwareField
            key={frame?.id}
            label="Slide title"
            placeholder="Untitled slide"
            disabled={locked || frame === undefined}
            value={frame?.title}
            onChange={(v) => frame && setSlideTitle(frame.id, v)}
          />
        </section>

        {showPresentation && <DeckMetaEditor locked={locked} />}

        {/* Citing needs a text box selected, so this stays visible for one too. */}
        {(showPresentation || selected?.kind === 'text' || selected?.kind === 'bibliography')
          && <BibliographyPanel />}

        {selected === undefined && (
          <p className="bp-empty-hint">
            Select something on the slide to format it, or use the Insert tab to add
            something new.
          </p>
        )}

        {selected?.kind === 'list' && frame !== undefined && (
          <ListEditor el={selected} slideId={frame.id} locked={locked} />
        )}

        {selected?.kind === 'math' && frame !== undefined && (
          <MathEditor el={selected} slideId={frame.id} locked={locked} />
        )}

        {selected?.kind === 'table' && frame !== undefined && (
          <TableEditor el={selected} slideId={frame.id} locked={locked} />
        )}

        {selected?.kind === 'code' && frame !== undefined && (
          <CodeEditor el={selected} slideId={frame.id} locked={locked} />
        )}

        {selected?.kind === 'chart' && frame !== undefined && (
          <ChartEditor el={selected} slideId={frame.id} locked={locked} />
        )}

        {selected?.kind === 'tikz' && frame !== undefined && (
          <ShapeEditor el={selected} slideId={frame.id} locked={locked} />
        )}

        {selected?.kind === 'image' && frame !== undefined && (
          <section className="bp-format-section">
            <h4>Picture</h4>
            <label className="bp-field">
              <span>Width — {Math.round((selected.width?.v ?? 0.6) * 100)}% of text width</span>
              <input
                type="range" min={5} max={100} step={5}
                disabled={locked}
                value={Math.round((selected.width?.v ?? 0.6) * 100)}
                onChange={(e) => setImageWidth(frame.id, selected.id, Number(e.target.value) / 100)}
              />
            </label>

            {/*
              * Height, rotation and keep-aspect were all modelled and emitted from the
              * start -- `height=`, `angle=`, `keepaspectratio` -- with no control able
              * to set any of them.
              */}
            <div className="bp-num-grid">
              <label className="bp-field bp-field-num">
                <span>Height (mm)</span>
                <input
                  type="number" min={0} step={1}
                  disabled={locked}
                  placeholder="auto"
                  value={selected.height?.u === 'mm' ? selected.height.v : ''}
                  onChange={(e) => setImageHeightMm(
                    frame.id, selected.id,
                    e.target.value === '' ? null : Number(e.target.value),
                  )}
                />
              </label>
              <label className="bp-field bp-field-num">
                <span title="Anticlockwise, as LaTeX measures it">Rotation (&deg; ccw)</span>
                <input
                  type="number" step={5}
                  disabled={locked}
                  value={selected.rotate ?? 0}
                  onChange={(e) => setImageRotate(frame.id, selected.id, Number(e.target.value))}
                />
              </label>
            </div>

            <label className="bp-field bp-field-inline">
              <input
                type="checkbox"
                disabled={locked}
                checked={selected.keepAspect}
                onChange={(e) => setImageKeepAspect(frame.id, selected.id, e.target.checked)}
              />
              <span>Keep aspect ratio</span>
            </label>

            {/*
              * The same slider a shape has. `\includegraphics` has no option for this,
              * and `\usepackage{transparent}` does NOT do it -- measured, it writes a
              * graphics state carrying `ca 1`. A one-node tikzpicture does, and that is
              * what the emitter writes when this is below 100%.
              */}
            <label className="bp-field">
              <span>Transparency &mdash; {100 - Math.round((selected.opacity ?? 1) * 100)}%</span>
              <input
                type="range" min={0} max={100} step={5}
                disabled={locked}
                value={100 - Math.round((selected.opacity ?? 1) * 100)}
                onChange={(e) => setImageOpacity(
                  frame.id, selected.id, (100 - Number(e.target.value)) / 100,
                )}
              />
            </label>

            <div className="bp-field">
              <span>Align</span>
              <div className="bp-seg">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button
                    key={a}
                    disabled={locked || selected.placement.mode === 'absolute'}
                    className={selected.align === a ? 'is-active' : ''}
                    title={selected.placement.mode === 'absolute'
                      ? 'Alignment does not apply to a freely positioned picture'
                      : `Align ${a}`}
                    onClick={() => setImageAlign(frame.id, selected.id, a)}
                  >
                    {a === 'left' ? 'Left' : a === 'center' ? 'Centre' : 'Right'}
                  </button>
                ))}
              </div>
            </div>

            <div className="bp-btn-row">
              <button
                disabled={locked}
                className={overlayMode === 'crop' ? 'is-active' : ''}
                title="Drag the edge handles on the canvas to crop"
                onClick={() => setOverlayMode(overlayMode === 'crop' ? 'transform' : 'crop')}
              >
                {overlayMode === 'crop' ? 'Done cropping' : 'Crop'}
              </button>
              <button
                disabled={locked || selected.trim === undefined}
                onClick={() => setImageTrim(frame.id, selected.id, null)}
              >
                Reset crop
              </button>
            </div>

            <label className="bp-field">
              <span>Caption</span>
              <input
                type="text"
                placeholder="none"
                disabled={locked}
                value={selected.caption ? richTextToPlain(selected.caption) : ''}
                onChange={(e) => setImageCaption(frame.id, selected.id, e.target.value || null)}
              />
            </label>
          </section>
        )}

        {selected !== undefined && frame !== undefined && (
          <ArrangePane el={selected} slideId={frame.id} locked={locked} />
        )}
      </div>
    </aside>
  );
}

const META_FIELDS: readonly { key: DeckMetaField; label: string; placeholder: string }[] = [
  { key: 'title', label: 'Title', placeholder: 'Untitled Presentation' },
  { key: 'subtitle', label: 'Subtitle', placeholder: 'Optional' },
  { key: 'author', label: 'Author', placeholder: 'Your name' },
  { key: 'institute', label: 'Institute', placeholder: 'Optional' },
  { key: 'date', label: 'Date', placeholder: '\\today' },
];

/**
 * The presentation's own title, author and date.
 *
 * These drive the title page AND the footline of every other slide, and before this
 * existed there was no way to set them except by typing in the source panel.
 */
function DeckMetaEditor({ locked }: { locked: boolean }): React.ReactElement {
  const meta = useStore((s) => s.deck.meta);
  const setDeckMeta = useStore((s) => s.setDeckMeta);
  return (
    <section className="bp-format-section">
      <h4>Presentation</h4>
      {META_FIELDS.map((f) => (
        <TexAwareField
          key={f.key}
          label={f.label}
          placeholder={f.placeholder}
          disabled={locked}
          value={meta[f.key]}
          onChange={(v) => setDeckMeta({ [f.key]: v })}
        />
      ))}
    </section>
  );
}

/** Plain words only -- nothing a plain-text field would lose by round-tripping it. */
function isPlainText(rt: RichText): boolean {
  return rt.every((n) => n.t === 'text');
}

/**
 * A one-line field over rich text: the slide title, and the presentation's title,
 * author, institute and date.
 *
 * It used to show `richTextToPlain` and write back plain text, which is lossy: a raw
 * island has no plain form, so `\author{A \and B}` showed as "A  B" and the first
 * keystroke saved ONE author, and the default deck's `\date{\today}` showed as an empty
 * box (F-018). A field whose value is plain words is still edited as words and escaped
 * on the way out, so "R&D" still works; a field holding any LaTeX at all is shown AS
 * LaTeX and read back with `richTextFromTex`. The mode is decided when the field takes
 * the focus and held until it loses it, so deleting the last command mid-edit does not
 * switch the field under the caret. Text that could not stand inside the command --
 * an unbalanced brace while typing one, a bare `&` -- is kept in the field and not
 * committed, rather than breaking the document around it.
 */
export function TexAwareField({ label, placeholder, disabled, value, onChange }: {
  label: string;
  placeholder: string;
  disabled: boolean;
  value: RichText | undefined;
  /** A string is plain text, to be escaped; rich text is stored as it is. */
  onChange(v: string | RichText): void;
}): React.ReactElement {
  const [editing, setEditing] = useState<{ tex: boolean; text: string } | null>(null);

  const texMode = editing?.tex ?? (value !== undefined && !isPlainText(value));
  const shown = editing?.text
    ?? (value === undefined ? '' : texMode ? emitInline(value) : richTextToPlain(value));
  const invalid = editing !== null && editing.tex && richTextFromTex(editing.text) === null;

  return (
    <label className="bp-field">
      <span>
        {label}
        {texMode && <em className="bp-field-badge" title="This field holds LaTeX and is edited as LaTeX">LaTeX</em>}
      </span>
      <input
        type="text"
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={!texMode}
        aria-invalid={invalid || undefined}
        title={invalid ? 'Not committed: unbalanced braces, a comment, or a bare & # ^ _' : undefined}
        value={shown}
        onFocus={() => setEditing({ tex: texMode, text: shown })}
        onBlur={() => setEditing(null)}
        onChange={(e) => {
          const text = e.target.value;
          setEditing({ tex: texMode, text });
          if (!texMode) {
            onChange(text);
            return;
          }
          const rt = richTextFromTex(text);
          if (rt !== null) onChange(rt);
        }}
      />
    </label>
  );
}
