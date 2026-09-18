/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { useRef } from 'react';
import { cellText, type ChartElement } from '@beamerpoint/core';
import { useStore } from '../state/store.js';

interface Props {
  el: ChartElement;
  slideId: string;
  locked: boolean;
}

const TYPES: ReadonlyArray<{ v: ChartElement['chartType']; label: string }> = [
  { v: 'line', label: 'Line' },
  { v: 'bar', label: 'Bars' },
  { v: 'hbar', label: 'Bars ⇢' },
  { v: 'scatter', label: 'Points' },
];

const LEGEND_POSITIONS = [
  'north west', 'north east', 'south west', 'south east', 'outer north east',
];

const MARKERS = ['', '*', 'square*', 'triangle*', 'diamond*', 'o', 'x'];

/**
 * The chart's data and axes.
 *
 * The grid is the point: a chart is a table of numbers, and retyping one into a form of
 * labelled fields is exactly what this app exists to avoid. Paste splits on tabs or
 * commas so a copy straight out of a spreadsheet lands correctly, and a dropped `.csv`
 * goes through the same reader.
 */
export function ChartEditor({ el, slideId, locked }: Props): React.ReactElement {
  const setChartCell = useStore((s) => s.setChartCell);
  const addChartRow = useStore((s) => s.addChartRow);
  const removeChartRow = useStore((s) => s.removeChartRow);
  const addChartColumn = useStore((s) => s.addChartColumn);
  const removeChartColumn = useStore((s) => s.removeChartColumn);
  const renameChartColumn = useStore((s) => s.renameChartColumn);
  const setChartSeries = useStore((s) => s.setChartSeries);
  const replaceChartData = useStore((s) => s.replaceChartData);
  const setChartType = useStore((s) => s.setChartType);
  const setChartAxis = useStore((s) => s.setChartAxis);
  const setChartSize = useStore((s) => s.setChartSize);

  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="bp-chart-editor">
      <h4>Chart</h4>

      <div className="bp-field-row">
        <span className="bp-field-label">Type</span>
        <div className="bp-btn-row">
          {TYPES.map((t) => (
            <button
              key={t.v}
              disabled={locked}
              className={el.chartType === t.v ? 'is-active' : ''}
              onClick={() => setChartType(slideId, el.id, t.v)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* The data grid. Paste anywhere in it to replace the whole table. */}
      <div className="bp-field">
        <span>Data — paste from a spreadsheet to replace it</span>
        <div
          className="bp-chart-grid"
          onPaste={(e) => {
            const text = e.clipboardData.getData('text/plain');
            if (!text.includes('\n')) return;      // a single cell: let it through
            e.preventDefault();
            replaceChartData(slideId, el.id, text);
          }}
        >
          <table>
            <thead>
              <tr>
                <th />
                {el.data.columns.map((c, i) => (
                  <th key={i}>
                    <input
                      value={c}
                      disabled={locked}
                      onChange={(e) => renameChartColumn(slideId, el.id, i, e.target.value)}
                    />
                    <button
                      disabled={locked || el.data.columns.length <= 2}
                      title="Remove this column and the series that plots it"
                      onClick={() => removeChartColumn(slideId, el.id, i)}
                    >
                      ×
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {el.data.rows.map((row, r) => (
                <tr key={r}>
                  <th>
                    <button
                      disabled={locked || el.data.rows.length <= 1}
                      title="Remove this row"
                      onClick={() => removeChartRow(slideId, el.id, r)}
                    >
                      ×
                    </button>
                  </th>
                  {el.data.columns.map((_c, c) => (
                    <td key={c}>
                      <input
                        value={cellText(row[c] ?? null)}
                        disabled={locked}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const n = Number(raw);
                          setChartCell(
                            slideId, el.id, r, c,
                            raw === '' ? null : (Number.isFinite(n) ? n : raw),
                          );
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv,text/plain"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file === undefined) return;
          replaceChartData(slideId, el.id, await file.text());
        }}
      />

      <div className="bp-btn-row">
        <button disabled={locked} onClick={() => addChartRow(slideId, el.id)}>+ Row</button>
        <button disabled={locked} onClick={() => addChartColumn(slideId, el.id)}>+ Series</button>
        <button disabled={locked} onClick={() => fileInput.current?.click()}>Load .csv</button>
      </div>

      <div className="bp-field">
        <span>Series</span>
        {el.series.map((s) => (
          <div key={s.id} className="bp-chart-series">
            <input
              className="bp-chart-series-label"
              placeholder={el.data.columns[s.yCol] ?? 'Series'}
              value={s.label ?? ''}
              disabled={locked}
              onChange={(e) => setChartSeries(slideId, el.id, s.id, {
                label: e.target.value === '' ? undefined : e.target.value,
              })}
            />
            <select
              value={s.marker ?? ''}
              disabled={locked}
              title="Marker"
              onChange={(e) => setChartSeries(slideId, el.id, s.id, {
                marker: e.target.value === '' ? undefined : e.target.value,
              })}
            >
              {MARKERS.map((m) => <option key={m} value={m}>{m === '' ? 'no mark' : m}</option>)}
            </select>
            <label title="Dashed">
              <input
                type="checkbox"
                checked={s.dashed === true}
                disabled={locked}
                onChange={(e) => setChartSeries(slideId, el.id, s.id, {
                  dashed: e.target.checked ? true : undefined,
                })}
              />
              <span>– –</span>
            </label>
            {/* Removes the COLUMN, not just the series. `emitChart` writes only the two
                columns each `\addplot` names, so a column no series plots is not in the
                `.tex` at all -- dropping the series alone would keep its numbers in memory
                and lose them at the next parse, after a reload or a source round trip.
                `removeChartColumn` also does the index remapping and refuses to go below
                two columns, so this disables itself on the last series. */}
            <button
              className="bp-chart-series-del"
              disabled={locked || el.data.columns.length <= 2}
              title="Remove this series and the column it plots"
              onClick={() => removeChartColumn(slideId, el.id, s.yCol)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="bp-num-grid">
        <label className="bp-field bp-field-num">
          <span>Width (mm)</span>
          <input
            type="number" min={20} step={5} disabled={locked}
            value={el.size.w.v}
            onChange={(e) => setChartSize(slideId, el.id, Number(e.target.value), el.size.h.v)}
          />
        </label>
        <label className="bp-field bp-field-num">
          <span>Height (mm)</span>
          <input
            type="number" min={20} step={5} disabled={locked}
            value={el.size.h.v}
            onChange={(e) => setChartSize(slideId, el.id, el.size.w.v, Number(e.target.value))}
          />
        </label>
      </div>

      <label className="bp-field">
        <span>Title</span>
        <input
          type="text" placeholder="none" disabled={locked}
          value={el.axis.title ?? ''}
          onChange={(e) => setChartAxis(slideId, el.id, {
            title: e.target.value === '' ? undefined : e.target.value,
          })}
        />
      </label>

      <div className="bp-num-grid">
        <label className="bp-field bp-field-num">
          <span>X label</span>
          <input
            type="text" placeholder="none" disabled={locked}
            value={el.axis.xLabel ?? ''}
            onChange={(e) => setChartAxis(slideId, el.id, {
              xLabel: e.target.value === '' ? undefined : e.target.value,
            })}
          />
        </label>
        <label className="bp-field bp-field-num">
          <span>Y label</span>
          <input
            type="text" placeholder="none" disabled={locked}
            value={el.axis.yLabel ?? ''}
            onChange={(e) => setChartAxis(slideId, el.id, {
              yLabel: e.target.value === '' ? undefined : e.target.value,
            })}
          />
        </label>
      </div>

      <div className="bp-field-row">
        <span className="bp-field-label">Grid</span>
        <div className="bp-btn-row">
          {(['none', 'major', 'both'] as const).map((g) => (
            <button
              key={g}
              disabled={locked}
              className={el.axis.grid === g ? 'is-active' : ''}
              onClick={() => setChartAxis(slideId, el.id, { grid: g })}
            >
              {g === 'none' ? 'None' : g === 'major' ? 'Major' : 'Both'}
            </button>
          ))}
        </div>
      </div>

      <label className="bp-field">
        <span>Legend</span>
        <select
          disabled={locked}
          value={el.axis.legendPos ?? ''}
          onChange={(e) => setChartAxis(slideId, el.id, {
            legendPos: e.target.value === '' ? undefined : e.target.value,
          })}
        >
          <option value="">Hidden</option>
          {LEGEND_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>

      <label className="bp-field bp-field-inline">
        <input
          type="checkbox"
          disabled={locked}
          checked={el.axis.ymode === 'log'}
          onChange={(e) => setChartAxis(slideId, el.id, {
            ymode: e.target.checked ? 'log' : undefined,
          })}
        />
        <span>Logarithmic y axis</span>
      </label>
    </div>
  );
}
