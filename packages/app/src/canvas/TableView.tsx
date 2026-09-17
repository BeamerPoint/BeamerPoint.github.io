import {
  PX_PER_MM,
  ptToMm,
  type Length,
  type RichText,
  type RowRule,
  type TableElement,
  type ThemeSpec,
} from '@beamerpoint/core';
import { InlineText } from './InlineText.js';
import { readInlineFromDom } from './domInline.js';
import { useCanvasGeometry } from './CanvasContext.js';
import { colorToCss } from './shapeColors.js';
import { HOST_CELL_ATTR, HOST_EL_ATTR, HOST_ROW_ATTR } from './textSelection.js';
import { onFormatKey } from './formatKeys.js';

interface Props {
  el: TableElement;
  theme: ThemeSpec;
  locked: boolean;
  onEditCell(elementId: string, rowId: string, cellId: string, content: RichText): void;
}

/** LaTeX's \tabcolsep is 6pt on each side of every cell. */
const COL_SEP_MM = ptToMm(6);

/*
 * Note: booktabs' \aboverulesep / \belowrulesep are deliberately NOT reproduced here.
 * Adding them is the obvious-looking fix for the header row sitting 1.3mm high, but
 * measuring against the PDF showed it made every row worse — residuals grew from
 * (+1.3, -0.2, +0.1) to (+2.4, +2.7, +3.0), because frame content is centred and the
 * table then overshot its true height. See tools/fidelity-audit.md.
 */

/** booktabs: \toprule and \bottomrule are 0.08em, \midrule is 0.05em. */
function ruleWidthPx(rule: RowRule): number {
  switch (rule.k) {
    case 'toprule':
    case 'bottomrule':
      return 1.6;
    case 'midrule':
    case 'cmidrule':
      return 1;
    default:
      return 0.8;
  }
}

function lengthToMm(l: Length | undefined, bodyWidthMm: number, fallbackMm: number): number {
  if (l === undefined) return fallbackMm;
  switch (l.u) {
    case 'mm': return l.v;
    case 'cm': return l.v * 10;
    case 'pt': return ptToMm(l.v);
    case 'em': return l.v * 4;        // rough: 1em at 11pt
    case 'ex': return l.v * 2;
    default: return l.v * bodyWidthMm; // textwidth / linewidth and friends
  }
}

/**
 * A table on the canvas.
 *
 * Deliberately NOT styled beyond what the document actually says: a header row is not
 * drawn in bold, because LaTeX would not embolden it either unless the cells say so.
 * A canvas that flatters the document is worse than one that is plain.
 */
export function TableView({ el, theme, locked, onEditCell }: Props): React.ReactElement {
  const { bodyWidthMm } = useCanvasGeometry();

  const vRule = (kind: 'single' | 'double' | 'none' | undefined): string =>
    kind === 'single' ? `0.8px solid ${theme.foreground}`
    : kind === 'double' ? `3px double ${theme.foreground}`
    : 'none';

  // tabularx and resizebox both pin the table to a width; a natural tabular is as
  // wide as its content.
  const pinnedMm = el.fit === 'natural'
    ? undefined
    : lengthToMm(el.fitWidth, bodyWidthMm, bodyWidthMm);

  return (
    <table
      className="bp-table"
      style={{
        width: pinnedMm === undefined ? 'auto' : `${pinnedMm * PX_PER_MM}px`,
        borderTop: el.topRule === undefined
          ? 'none'
          : `${ruleWidthPx(el.topRule)}px solid ${theme.foreground}`,
      }}
    >
      <tbody>
        {el.rows.map((row, r) => (
          <tr key={row.id}>
            {el.columns.map((col, c) => {
              const merge = el.merges.find(
                (m) => m.row === r && m.col === c && m.colspan > 1,
              );
              const covered = el.merges.some(
                (m) => m.row === r && m.colspan > 1 && c > m.col && c < m.col + m.colspan,
              );
              if (covered) return null;

              const cell = row.cells[c];
              const span = merge === undefined ? 1 : Math.min(merge.colspan, el.columns.length - c);
              const align = merge?.align ?? col.align;

              const rule = row.ruleBelow;
              const ruled = rule !== undefined
                && (rule.k !== 'cmidrule' || (c + 1 >= rule.from && c + 1 <= rule.to));

              return (
                <td
                  key={cell?.id ?? `${row.id}-${c}`}
                  colSpan={span}
                  style={{
                    textAlign: align === 'c' ? 'center' : align === 'r' ? 'right' : 'left',
                    padding: `0 ${COL_SEP_MM * PX_PER_MM}px`,
                    // A cell's own shading wins over the row's, as \cellcolor does.
                    ...(cell?.fill !== undefined || row.fill !== undefined
                      ? { background: colorToCss(cell?.fill ?? row.fill, theme, 'transparent') }
                      : {}),
                    borderLeft: vRule(col.leftRule),
                    ...(c + span === el.columns.length
                      ? { borderRight: vRule(el.endRule) }
                      : {}),
                    ...(ruled
                      ? { borderBottom: `${ruleWidthPx(rule)}px solid ${theme.foreground}` }
                      : {}),
                    ...(col.align === 'p' || col.align === 'X'
                      ? {
                          width: col.align === 'p'
                            ? `${lengthToMm(col.width, bodyWidthMm, 20) * PX_PER_MM}px`
                            : 'auto',
                          whiteSpace: 'normal' as const,
                        }
                      : { whiteSpace: 'nowrap' as const }),
                  }}
                >
                  <span
                    className="bp-cell-body"
                    contentEditable={!locked}
                    suppressContentEditableWarning
                    {...(cell === undefined ? {} : {
                      [HOST_EL_ATTR]: el.id,
                      [HOST_ROW_ATTR]: row.id,
                      [HOST_CELL_ATTR]: cell.id,
                    })}
                    onKeyDown={onFormatKey}
                    onBlur={(e) => cell !== undefined && onEditCell(
                      el.id, row.id, cell.id, readInlineFromDom(e.currentTarget, cell.content),
                    )}
                  >
                    <InlineText content={cell?.content ?? []} />
                  </span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
