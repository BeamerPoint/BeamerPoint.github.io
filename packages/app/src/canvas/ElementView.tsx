import type { Element, ListElement, RichText, ThemeSpec } from '@beamerpoint/core';
import { InlineText, MathView } from './InlineText.js';
import { readInlineFromDom } from './domInline.js';

interface Props {
  el: Element;
  theme: ThemeSpec;
  selected: boolean;
  locked: boolean;
  onSelect(id: string): void;
  onEditContent(elementId: string, content: RichText): void;
  onEditItem(elementId: string, itemId: string, content: RichText): void;
}

/**
 * One element on the canvas.
 *
 * Text is edited in place via contentEditable rather than a modal, which is what
 * makes the surface feel like PowerPoint rather than a form.
 */
export function ElementView(props: Props): React.ReactElement {
  const { el, selected, onSelect } = props;

  const absolute = el.placement.mode === 'absolute' ? el.placement : null;
  const style: React.CSSProperties = absolute
    ? {
        position: 'absolute',
        left: `${absolute.x}mm`,
        top: `${absolute.y}mm`,
        width: `${absolute.w}mm`,
        zIndex: absolute.z,
        ...(absolute.rotate ? { transform: `rotate(${absolute.rotate}deg)` } : {}),
      }
    : {};

  return (
    <div
      className={`bp-el bp-el-${el.kind}${selected ? ' is-selected' : ''}`}
      style={style}
      onMouseDown={(e) => { e.stopPropagation(); onSelect(el.id); }}
      data-element-id={el.id}
    >
      {el.overlay !== undefined && <span className="bp-overlay-badge">{el.overlay}</span>}
      <Body {...props} />
    </div>
  );
}

function Body(props: Props): React.ReactElement {
  const { el, theme, locked, onEditContent, onEditItem } = props;

  switch (el.kind) {
    case 'text':
      return (
        <div
          className="bp-text"
          style={{ textAlign: el.align === 'justify' ? 'justify' : el.align }}
          contentEditable={!locked}
          suppressContentEditableWarning
          onBlur={(e) => onEditContent(el.id, readInlineFromDom(e.currentTarget, el.content))}
        >
          <InlineText content={el.content} />
        </div>
      );

    case 'list':
      return <ListView el={el} theme={theme} locked={locked} onEditItem={onEditItem} depth={0} />;

    case 'block': {
      const style =
        el.variant === 'alertblock' ? theme.block.alert
        : el.variant === 'exampleblock' ? theme.block.example
        : theme.block;
      return (
        <div className="bp-block" style={{ borderRadius: `${theme.block.radiusMm}mm` }}>
          {el.title !== undefined && (
            <div
              className="bp-block-title"
              style={{ background: style.titleBg, color: style.titleFg }}
            >
              <InlineText content={el.title} />
            </div>
          )}
          <div
            className="bp-block-body"
            style={{
              background: style.bodyBg,
              color: style.bodyFg,
              padding: `${theme.block.paddingMm}mm`,
            }}
          >
            {el.children.map((child) => (
              <ElementView key={child.id} {...props} el={child} selected={false} />
            ))}
          </div>
        </div>
      );
    }

    case 'columns':
      return (
        <div className="bp-columns">
          {el.columns.map((col) => (
            <div
              key={col.id}
              className="bp-column"
              style={{
                flex: col.width.u === 'textwidth' || col.width.u === 'linewidth'
                  ? `0 0 ${col.width.v * 100}%`
                  : `0 0 ${col.width.v}${col.width.u}`,
                alignSelf: col.valign === 't' ? 'flex-start'
                  : col.valign === 'b' ? 'flex-end' : 'stretch',
              }}
            >
              {col.children.map((child) => (
                <ElementView key={child.id} {...props} el={child} selected={false} />
              ))}
            </div>
          ))}
        </div>
      );

    case 'math':
      return <MathView tex={el.tex} display />;

    case 'raw':
      return (
        <div className="bp-raw" title={`Preserved verbatim (${el.reason})`}>
          <div className="bp-raw-label">{el.label ?? 'LaTeX'}</div>
          <pre>{el.tex}</pre>
        </div>
      );

    default:
      return (
        <div className="bp-unsupported">
          {el.kind} — not yet rendered on the canvas
        </div>
      );
  }
}

function ListView({
  el, theme, locked, onEditItem, depth,
}: {
  el: ListElement;
  theme: ThemeSpec;
  locked: boolean;
  onEditItem(elementId: string, itemId: string, content: RichText): void;
  depth: number;
}): React.ReactElement {
  const marker = theme.itemMarkers[Math.min(depth, 2) as 0 | 1 | 2];

  return (
    <ul className="bp-list" data-depth={depth}>
      {el.items.map((item, i) => (
        <li key={item.id}>
          <span className="bp-marker" style={{ color: theme.structure }}>
            {el.listType === 'enumerate' ? `${i + 1}.` : marker}
          </span>
          <span
            className="bp-item-body"
            contentEditable={!locked}
            suppressContentEditableWarning
            onBlur={(e) => onEditItem(el.id, item.id, readInlineFromDom(e.currentTarget, item.content))}
          >
            <InlineText content={item.content} />
          </span>
          {item.sublist !== undefined && (
            <ListView
              el={item.sublist}
              theme={theme}
              locked={locked}
              onEditItem={onEditItem}
              depth={depth + 1}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
