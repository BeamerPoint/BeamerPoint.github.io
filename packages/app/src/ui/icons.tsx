/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

/**
 * The icon set.
 *
 * Inline SVG on a 16×16 grid, stroked with `currentColor` so every icon inherits the
 * colour of the control it sits in — that is what keeps a disabled button's icon
 * disabled-looking without a second asset. No icon font and no sprite sheet: at this
 * count the markup is smaller than either, and it cannot fail to load.
 *
 * `size` is the box; ribbon buttons use 20, everything else 16.
 */
interface IconProps {
  size?: number;
  className?: string;
}

function svg(
  path: React.ReactNode,
  { size = 16, className }: IconProps,
  filled = false,
): React.ReactElement {
  return (
    <svg
      className={`bp-icon${className === undefined ? '' : ` ${className}`}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}

/* ------------------------------------------------------------------- file */

export const IconNew = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M9 1.5H4.2A1.2 1.2 0 0 0 3 2.7v10.6a1.2 1.2 0 0 0 1.2 1.2h7.6a1.2 1.2 0 0 0 1.2-1.2V5.5Z" />
    <path d="M9 1.5V5.5H13" />
  </>, p);

export const IconOpen = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M1.8 12.5V4a1 1 0 0 1 1-1h3.1l1.4 1.6h5.9a1 1 0 0 1 1 1v.9" />
    <path d="M1.8 12.5 3.6 7h11.1l-1.9 5.5a1 1 0 0 1-.95.7H2.75a1 1 0 0 1-.95-.7Z" />
  </>, p);

export const IconExport = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M8 10.5V2" />
    <path d="M5 5 8 2l3 3" />
    <path d="M2.5 10v3a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3" />
  </>, p);

export const IconSave = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M2.5 3.5a1 1 0 0 1 1-1h7.2L13.5 5.3V12.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1Z" />
    <path d="M5 2.5v3.6h5V2.5M5 13.5v-3.6h6v3.6" />
  </>, p);

/* ------------------------------------------------------------------- edit */

export const IconUndo = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M3 7.5h6.3a3.2 3.2 0 0 1 0 6.4H6" />
    <path d="M5.6 4.4 2.5 7.5l3.1 3.1" />
  </>, p);

export const IconRedo = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M13 7.5H6.7a3.2 3.2 0 0 0 0 6.4H10" />
    <path d="M10.4 4.4 13.5 7.5l-3.1 3.1" />
  </>, p);

export const IconDelete = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M2.8 4h10.4" />
    <path d="M6.4 4V2.7a.9.9 0 0 1 .9-.9h1.4a.9.9 0 0 1 .9.9V4" />
    <path d="M4.2 4l.6 9.1a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9L11.8 4" />
    <path d="M6.6 6.6v4.8M9.4 6.6v4.8" />
  </>, p);

/* --------------------------------------------------------------- elements */

export const IconText = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M3 3.2h10" />
    <path d="M8 3.2v9.6" />
    <path d="M5.8 12.8h4.4" />
  </>, p);

export const IconTextBox = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1" strokeDasharray="2.2 1.6" />
    <path d="M5.2 6.2h5.6M8 6.2v4M6.6 10.2h2.8" />
  </>, p);

export const IconBullets = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <circle cx="3.2" cy="4.2" r="1.05" fill="currentColor" stroke="none" />
    <circle cx="3.2" cy="8" r="1.05" fill="currentColor" stroke="none" />
    <circle cx="3.2" cy="11.8" r="1.05" fill="currentColor" stroke="none" />
    <path d="M6.4 4.2h7M6.4 8h7M6.4 11.8h7" />
  </>, p);

/** Axes with a rising line: a pgfplots chart. */
export const IconChart = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M2.6 2.4v11h11" />
    <path d="M4.6 10.8l2.6-3.2 2.4 1.8 3.2-4.6" />
  </>, p);

/** A numbered outline: the deck's sections, as `\tableofcontents` prints them. */
export const IconInfo = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 7.2v4" />
    <path d="M8 4.8v.1" />
  </>, p);

export const IconOutline = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M2.4 4.2h1.4M2.4 8h1.4M2.4 11.8h1.4" />
    <path d="M5.8 4.2h7.8M5.8 8h6.2M5.8 11.8h7.2" />
  </>, p);

export const IconBlock = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="1.8" y="3" width="12.4" height="10" rx="1.2" />
    <path d="M1.8 6.4h12.4" />
    <path d="M4.2 9h5.4M4.2 11h7" />
  </>, p);

export const IconColumns = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="1.8" y="3" width="5" height="10" rx="0.9" />
    <rect x="9.2" y="3" width="5" height="10" rx="0.9" />
  </>, p);

export const IconImage = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="1.8" y="3" width="12.4" height="10" rx="1.2" />
    <circle cx="5.7" cy="6.5" r="1.25" />
    <path d="M2.4 11.6 6 8.6l2.6 2.1 2.3-2 2.7 2.4" />
  </>, p);

export const IconTable = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="1.8" y="3" width="12.4" height="10" rx="1" />
    <path d="M1.8 6.4h12.4M1.8 9.7h12.4M6 3v10M10 3v10" />
  </>, p);

export const IconEquation = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M2.6 3.2h4.1L4.3 8l2.4 4.8H2.6" />
    <path d="M9.2 6.6h4.2M9.2 9.8h4.2" />
  </>, p);

export const IconDiagram = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="1.6" y="2.6" width="5" height="3.8" rx="0.8" />
    <circle cx="11.9" cy="11.2" r="2.4" />
    <path d="M4.1 6.4v3.1a1 1 0 0 0 1 1h4.2" />
    <path d="M8 9.1l1.6 1.4L8 11.9" />
  </>, p);

export const IconCode = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M5.4 4.8 2.2 8l3.2 3.2" />
    <path d="M10.6 4.8 13.8 8l-3.2 3.2" />
    <path d="M9.2 3.2 6.8 12.8" />
  </>, p);

/* ------------------------------------------------------------- shape tools */

export const IconRect = (p: IconProps = {}): React.ReactElement => svg(
  <rect x="2" y="4" width="12" height="8" />, p);

export const IconRounded = (p: IconProps = {}): React.ReactElement => svg(
  <rect x="2" y="4" width="12" height="8" rx="2.6" />, p);

export const IconEllipse = (p: IconProps = {}): React.ReactElement => svg(
  <ellipse cx="8" cy="8" rx="6" ry="4.4" />, p);

export const IconLine = (p: IconProps = {}): React.ReactElement => svg(
  <path d="M2.6 13 13.4 3" />, p);

export const IconArrow = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M2.4 8h10.2" />
    <path d="M9.6 4.8 13.4 8l-3.8 3.2" />
  </>, p);

export const IconLabel = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M4 3.6h8" />
    <path d="M8 3.6v8.8" />
    <path d="M6.1 12.4h3.8" />
  </>, p);

/* ------------------------------------------------------------------- view */

export const IconRuler = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="1.6" y="5.2" width="12.8" height="5.6" rx="0.9" />
    <path d="M4.2 5.2v2.1M6.6 5.2v3M9 5.2v2.1M11.4 5.2v3" />
  </>, p);

export const IconGrid = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="2" y="2" width="12" height="12" rx="1" />
    <path d="M6 2v12M10 2v12M2 6h12M2 10h12" />
  </>, p);

export const IconGuides = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M8 1.6v12.8" strokeDasharray="2.4 1.8" />
    <path d="M1.6 8h12.8" strokeDasharray="2.4 1.8" />
  </>, p);

export const IconSnap = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M4 2.4v6.2a4 4 0 0 0 8 0V2.4" />
    <path d="M2.4 2.4h3.2M10.4 2.4h3.2" />
  </>, p);

export const IconCompile = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M3.4 2.6 13 8l-9.6 5.4Z" />
  </>, p);

export const IconSource = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="1.8" y="2.6" width="12.4" height="10.8" rx="1.1" />
    <path d="M5.6 6.2 3.8 8l1.8 1.8M10.4 6.2 12.2 8l-1.8 1.8" />
  </>, p);

export const IconPdf = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M9 1.6H4.4a1.2 1.2 0 0 0-1.2 1.2v10.4a1.2 1.2 0 0 0 1.2 1.2h7.2a1.2 1.2 0 0 0 1.2-1.2V5.6Z" />
    <path d="M9 1.6v4h3.8" />
    <path d="M5.6 11.2h4.8" />
  </>, p);

export const IconLog = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 4.8v3.6M8 11.1v.1" />
  </>, p);

export const IconTheme = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M8 1.8a6.2 6.2 0 1 0 0 12.4c.8 0 1.2-.5 1.2-1.1 0-.9-.7-1.2-.7-1.9 0-.6.5-1 1.1-1h1.2a3.4 3.4 0 0 0 3.4-3.4C14.2 4 11.4 1.8 8 1.8Z" />
    <circle cx="5.2" cy="7.2" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="8" cy="5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="10.9" cy="7" r="0.9" fill="currentColor" stroke="none" />
  </>, p);

export const IconSlideAdd = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="1.8" y="3.2" width="9" height="7" rx="1" />
    <path d="M12.4 9.4v4.4M10.2 11.6h4.4" />
  </>, p);

export const IconMoveUp = (p: IconProps = {}): React.ReactElement => svg(
  <path d="M8 12.6V3.6M4.4 7.2 8 3.6l3.6 3.6" />, p);

export const IconMoveDown = (p: IconProps = {}): React.ReactElement => svg(
  <path d="M8 3.4v9M4.4 8.8 8 12.4l3.6-3.6" />, p);

export const IconForward = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="1.8" y="1.8" width="8" height="8" rx="1" />
    <path d="M6.2 12.4v1.8h8v-8h-1.8" />
  </>, p);

export const IconBackward = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="6.2" y="6.2" width="8" height="8" rx="1" />
    <path d="M9.8 3.6V1.8h-8v8h1.8" />
  </>, p);

export const IconShapes = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="1.6" y="1.8" width="7" height="5.4" rx="0.8" />
    <circle cx="11.2" cy="11" r="3.2" />
    <path d="M5.1 8.6 1.9 14.2h6.4Z" />
  </>, p);

export const IconSmartArt = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="5.6" y="1.6" width="4.8" height="3.4" rx="0.7" />
    <rect x="1.2" y="10.8" width="4.6" height="3.4" rx="0.7" />
    <rect x="10.2" y="10.8" width="4.6" height="3.4" rx="0.7" />
    <path d="M8 5v2.8M3.5 10.8V7.8h9V10.8" />
  </>, p);

/* ------------------------------------------------- clipboard and slides */

export const IconCopy = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="5.4" y="5.4" width="8.8" height="8.8" rx="1.2" />
    <path d="M10.6 5.4V2.9a1 1 0 0 0-1-1H2.8a1 1 0 0 0-1 1v6.8a1 1 0 0 0 1 1h2.6" />
  </>, p);

export const IconCut = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M4.6 2.2 11 11.2M11.4 2.2 5 11.2" />
    <circle cx="4.2" cy="12.6" r="1.7" />
    <circle cx="11.8" cy="12.6" r="1.7" />
  </>, p);

export const IconPaste = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <path d="M5.4 2.8H3.6a1 1 0 0 0-1 1v9.4a1 1 0 0 0 1 1h8.8a1 1 0 0 0 1-1V3.8a1 1 0 0 0-1-1h-1.8" />
    <rect x="5.4" y="1.6" width="5.2" height="2.6" rx="0.8" />
  </>, p);

export const IconDuplicate = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="1.8" y="1.8" width="8.4" height="8.4" rx="1.2" />
    <rect x="5.8" y="5.8" width="8.4" height="8.4" rx="1.2" />
  </>, p);

/** A slide with a title bar and a byline: what `\titlepage` builds. */
export const IconTitleSlide = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="1.6" y="2.6" width="12.8" height="10.8" rx="1.2" />
    <path d="M4.4 6.6h7.2M5.8 9.2h4.4M6.8 11.2h2.4" />
  </>, p);

/** A box with a padlock: proportions held while a corner is dragged. */
export const IconLockAspect = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="1.7" y="4.2" width="8.4" height="8.4" rx="1" />
    <path d="M10.6 7.6V6.1a2 2 0 0 1 4 0v1.5" />
    <rect x="9.8" y="7.6" width="5.6" height="4.6" rx="0.9" />
  </>, p);

/** Two bars: beamer's `\pause`, where the slide breaks. */
export const IconPause = (p: IconProps = {}): React.ReactElement => svg(
  <>
    <rect x="4.2" y="3" width="2.6" height="10" rx="0.7" />
    <rect x="9.2" y="3" width="2.6" height="10" rx="0.7" />
  </>, p);
