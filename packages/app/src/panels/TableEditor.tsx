/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import {
  richTextToPlain, type Color, type TableColumn, type TableElement,
} from '@beamerpoint/core';
import { useStore } from '../state/store.js';

interface Props {
  el: TableElement;
  slideId: string;
  locked: boolean;
}

const ALIGNS: Array<{ v: TableColumn['align']; label: string; title: string }> = [
  { v: 'l', label: 'L', title: 'Left' },
  { v: 'c', label: 'C', title: 'Centre' },
  { v: 'r', label: 'R', title: 'Right' },
  { v: 'p', label: '¶', title: 'Fixed width, text wraps' },
  { v: 'X', label: 'X', title: 'Share the leftover width (needs Fit to width)' },
];

/**
 * Structure controls for the selected table.
 *
 * Cell text is edited on the canvas, not here — retyping a table into a form is the
 * thing this app exists to avoid. What this panel owns is everything that is not
 * text: shape, alignment, rules and how the table is sized.
 */
export function TableEditor({ el, slideId, locked }: Props): React.ReactElement {
  const addTableRow = useStore((s) => s.addTableRow);
  const removeTableRow = useStore((s) => s.removeTableRow);
  const addTableColumn = useStore((s) => s.addTableColumn);
  const removeTableColumn = useStore((s) => s.removeTableColumn);
  const setTableColumnAlign = useStore((s) => s.setTableColumnAlign);
  const setTableStyle = useStore((s) => s.setTableStyle);
  const setTableFit = useStore((s) => s.setTableFit);
  const setTableCaption = useStore((s) => s.setTableCaption);
  const setTableRowFill = useStore((s) => s.setTableRowFill);
  const setTableVerticalRules = useStore((s) => s.setTableVerticalRules);
  const setTableHeaderRow = useStore((s) => s.setTableHeaderRow);

  const rows = el.rows.length;
  const cols = el.columns.length;

  return (
    <div className="bp-table-props">
      <h4>Table</h4>

      <div className="bp-field-row">
        <span className="bp-field-label">{rows} × {cols}</span>
        <div className="bp-btn-row">
          <button
            disabled={locked}
            title="Add a row at the bottom"
            onClick={() => addTableRow(slideId, el.id, rows - 1)}
          >
            + Row
          </button>
          <button
            disabled={locked || rows <= 1}
            title="Remove the last row"
            onClick={() => removeTableRow(slideId, el.id, rows - 1)}
          >
            − Row
          </button>
          <button
            disabled={locked}
            title="Add a column on the right"
            onClick={() => addTableColumn(slideId, el.id, cols - 1)}
          >
            + Col
          </button>
          <button
            disabled={locked || cols <= 1}
            title="Remove the last column"
            onClick={() => removeTableColumn(slideId, el.id, cols - 1)}
          >
            − Col
          </button>
        </div>
      </div>

      <div className="bp-col-aligns">
        <span className="bp-field-label">Column alignment</span>
        {el.columns.map((col, i) => (
          <div key={col.id} className="bp-col-align-row">
            <span className="bp-col-name" title={richTextToPlain(el.rows[0]?.cells[i]?.content ?? [])}>
              {i + 1}
            </span>
            <div className="bp-btn-row">
              {ALIGNS.map((a) => (
                <button
                  key={a.v}
                  title={a.title}
                  className={col.align === a.v ? 'is-active' : ''}
                  disabled={locked || (a.v === 'X' && el.fit !== 'tabularx')}
                  onClick={() => setTableColumnAlign(slideId, el.id, i, a.v)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* The flag decides which row gets the booktabs midrule, so it has to be visible:
          without a control, deleting the header row lost it permanently. */}
      <label className="bp-field bp-field-inline">
        <input
          type="checkbox"
          disabled={locked || el.rows.length === 0}
          checked={el.rows[0]?.isHeader === true}
          onChange={(e) => setTableHeaderRow(slideId, el.id, e.target.checked)}
        />
        <span title="The first row is a header — booktabs draws a rule under it">
          Header row
        </span>
      </label>

      <div className="bp-field-row">
        <span className="bp-field-label">Rules</span>
        <div className="bp-btn-row">
          {([
            ['booktabs', 'Booktabs', 'Horizontal rules only — the typographic convention'],
            ['hline', 'Grid', 'A line under every row'],
            ['plain', 'None', 'No rules at all'],
          ] as const).map(([v, label, title]) => (
            <button
              key={v}
              title={title}
              className={el.style === v ? 'is-active' : ''}
              disabled={locked}
              onClick={() => setTableStyle(slideId, el.id, v)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/*
        * Vertical rules live on the column that FOLLOWS them, plus `endRule` for the
        * last one -- all three fields were modelled and parsed with nothing able to set
        * them, so an imported table's rules could be seen and never changed.
        */}
      <div className="bp-field-row">
        <span className="bp-field-label">Borders</span>
        <div className="bp-btn-row">
          {([
            ['none', 'None', 'Horizontal rules only'],
            ['outer', 'Outer', 'A rule down each side'],
            ['all', 'Grid', 'A rule between every column'],
          ] as const).map(([v, label, title]) => (
            <button
              key={v}
              title={title}
              className={verticalRules(el) === v ? 'is-active' : ''}
              disabled={locked}
              onClick={() => setTableVerticalRules(slideId, el.id, v)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bp-field-row">
        <span className="bp-field-label">Shading</span>
        <div className="bp-swatches">
          {SHADES.map((sh) => (
            <button
              key={sh.label}
              title={`${sh.label} — applied to the header row`}
              className={`bp-swatch${sh.color === undefined ? ' is-none' : ''}${
                sameFill(el.rows[0]?.fill, sh.color) ? ' is-active' : ''}`}
              style={{ background: sh.css }}
              disabled={locked}
              onClick={() => setTableRowFill(slideId, el.id, 0, sh.color ?? null)}
            />
          ))}
        </div>
      </div>
      <p className="bp-hint">
        Shading needs <code>colortbl</code>, which is added to the preamble for you.
      </p>

      <div className="bp-field-row">
        <span className="bp-field-label">Banding</span>
        <div className="bp-btn-row">
          <button
            disabled={locked}
            title="Shade every other row"
            onClick={() => {
              for (let i = 1; i < el.rows.length; i += 1) {
                setTableRowFill(slideId, el.id, i, i % 2 === 1 ? BAND : null);
              }
            }}
          >
            Banded
          </button>
          <button
            disabled={locked}
            title="Remove all shading"
            onClick={() => {
              for (let i = 0; i < el.rows.length; i += 1) {
                setTableRowFill(slideId, el.id, i, null);
              }
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="bp-field-row">
        <span className="bp-field-label">Fit</span>
        <div className="bp-btn-row">
          {([
            ['natural', 'Natural', 'As wide as the content needs'],
            ['tabularx', 'Fit to width', 'Stretch the X columns to fill the slide'],
            ['resizebox', 'Scale down', 'Shrink the whole table, text included'],
          ] as const).map(([v, label, title]) => (
            <button
              key={v}
              title={title}
              className={el.fit === v ? 'is-active' : ''}
              disabled={locked}
              onClick={() => setTableFit(slideId, el.id, v)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {el.fit === 'tabularx' && !el.columns.some((c) => c.align === 'X') && (
        <p className="bp-hint bp-hint-warn">
          Fit to width needs at least one X column, or the table will not compile.
        </p>
      )}

      <label>
        Caption
        <input
          type="text"
          disabled={locked}
          placeholder="none"
          value={el.caption === undefined ? '' : richTextToPlain(el.caption)}
          onChange={(e) => setTableCaption(slideId, el.id, e.target.value)}
        />
      </label>
      {el.caption !== undefined && (
        <p className="bp-hint">
          A caption puts the table in a float, so LaTeX decides exactly where it sits.
        </p>
      )}
    </div>
  );
}

/** Which vertical-rule preset a table currently matches. */
function verticalRules(el: TableElement): 'none' | 'all' | 'outer' {
  const inner = el.columns.slice(1).some((c) => c.leftRule !== undefined && c.leftRule !== 'none');
  if (inner) return 'all';
  const first = el.columns[0]?.leftRule;
  if (first !== undefined && first !== 'none') return 'outer';
  return el.endRule === undefined ? 'none' : 'outer';
}

const BAND: Color = { k: 'structure', shade: 10 };

/**
 * Shades offered for a header row.
 *
 * Theme-relative by default, so a shaded table still follows the deck's colour when the
 * theme changes; the CSS beside each is only what the swatch button shows.
 */
const SHADES: Array<{ label: string; color: Color | undefined; css: string }> = [
  { label: 'None', color: undefined, css: 'transparent' },
  { label: 'Theme 10%', color: { k: 'structure', shade: 10 }, css: '#e8e8f6' },
  { label: 'Theme 25%', color: { k: 'structure', shade: 25 }, css: '#ccccec' },
  { label: 'Theme 50%', color: { k: 'structure', shade: 50 }, css: '#9999d9' },
  { label: 'Grey', color: { k: 'mix', expr: 'black!12' }, css: '#e0e0e0' },
];

function sameFill(a: Color | undefined, b: Color | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}
