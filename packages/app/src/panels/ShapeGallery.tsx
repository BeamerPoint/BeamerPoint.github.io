import {
  POLYGON_LABEL, polygonPoints, type PolygonKind, type ShapeTool,
} from '@beamerpoint/core';

/** Groups mirror PowerPoint's shape gallery: lines first, then blocks, then the rest. */
const GROUPS: Array<{ label: string; tools: ShapeTool[] }> = [
  { label: 'Lines', tools: ['line', 'arrow'] },
  { label: 'Rectangles', tools: ['rect', 'rounded', 'parallelogram', 'trapezium'] },
  { label: 'Basic shapes', tools: ['ellipse', 'circle', 'triangle', 'rightTriangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'cross', 'cylinder', 'document'] },
  { label: 'Arrows and flow', tools: ['arrowBlock', 'chevron', 'bracePair'] },
  { label: 'Stars', tools: ['star5', 'star6'] },
  { label: 'Text', tools: ['text'] },
];

const BASIC_LABEL: Partial<Record<ShapeTool, string>> = {
  line: 'Line',
  arrow: 'Arrow — drop an end on a box or ellipse to attach it',
  rect: 'Rectangle',
  rounded: 'Rounded rectangle',
  ellipse: 'Ellipse',
  circle: 'Circle',
  text: 'Text label',
};

function labelOf(tool: ShapeTool): string {
  return BASIC_LABEL[tool] ?? POLYGON_LABEL[tool as PolygonKind] ?? tool;
}

/**
 * A 24×24 preview of the shape, drawn from the very function that produces the real
 * geometry — so the icon cannot drift from what the tool actually draws.
 */
function Preview({ tool }: { tool: ShapeTool }): React.ReactElement {
  const common = {
    fill: 'currentColor', fillOpacity: 0.14, stroke: 'currentColor', strokeWidth: 1.2,
    strokeLinejoin: 'round' as const,
  };

  if (tool === 'line') {
    return <svg viewBox="0 0 24 24" width="20" height="20"><path d="M3 20 21 4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" /></svg>;
  }
  if (tool === 'arrow') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12h16M15 7l5 5-5 5" />
      </svg>
    );
  }
  if (tool === 'text') {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M6 5h12M12 5v14M9 19h6" />
      </svg>
    );
  }
  if (tool === 'rect' || tool === 'rounded') {
    return <svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="6" width="18" height="12" rx={tool === 'rounded' ? 3.5 : 0} {...common} /></svg>;
  }
  if (tool === 'ellipse') {
    return <svg viewBox="0 0 24 24" width="20" height="20"><ellipse cx="12" cy="12" rx="9" ry="6" {...common} /></svg>;
  }
  if (tool === 'circle') {
    return <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="8" {...common} /></svg>;
  }

  // Everything else is a polygon, so draw it with the real geometry function.
  const pts = polygonPoints(tool as PolygonKind, 3, 4, 18, 16)
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  return <svg viewBox="0 0 24 24" width="20" height="20"><polygon points={pts} {...common} /></svg>;
}

interface Props {
  active: ShapeTool | null;
  disabled: boolean;
  onPick(tool: ShapeTool): void;
}

/** The full shape gallery, shown as a flyout from the ribbon. */
export function ShapeGallery({ active, disabled, onPick }: Props): React.ReactElement {
  return (
    <div className="bp-gallery">
      {GROUPS.map((g) => (
        <div key={g.label} className="bp-gallery-group">
          <div className="bp-gallery-label">{g.label}</div>
          <div className="bp-gallery-grid">
            {g.tools.map((tool) => (
              <button
                key={tool}
                className={`bp-gallery-btn${active === tool ? ' is-active' : ''}`}
                title={labelOf(tool)}
                disabled={disabled}
                onClick={() => onPick(tool)}
              >
                <Preview tool={tool} />
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="bp-gallery-note">
        Pick a shape, then drag on the slide. Arrows attach to rectangles, ellipses and
        labels; other shapes are joined by dropping the arrow end on empty space.
      </p>
    </div>
  );
}
