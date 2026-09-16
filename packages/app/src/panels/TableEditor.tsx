import { richTextToPlain, type TableColumn, type TableElement } from '@beamerpoint/core';
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
