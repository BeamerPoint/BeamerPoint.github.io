/**
 * BeamerPoint document model.
 *
 * Invariants the rest of the codebase depends on:
 *  - Geometry is in millimetres, because that is Beamer's own unit. Model values map
 *    1:1 onto textpos/TikZ coordinates with no conversion.
 *  - Every structure that can hold user content has a raw escape hatch at its own level
 *    (`RawElement` for blocks, `{ t: 'raw' }` for inlines, `RawDocNode` for document level).
 *    This is what makes content loss structurally impossible rather than merely unlikely.
 *  - `overlay` is preserved everywhere it can legally appear even though v1 cannot author
 *    overlays. Dropping it would destroy animated decks on import.
 */

export type Id = string;
/** Millimetres, in the page coordinate space (origin = top-left of the paper). */
export type Mm = number;
export type Deg = number;
/** LaTeX source, already escaped/authored. Never escape this again. */
export type TexString = string;
/** User-facing text, NOT escaped. Never concatenate this into TeX directly. */
export type PlainText = string;

export interface SrcSpan {
  start: number;
  end: number;
  line: number;
}

export type LengthUnit =
  | 'mm' | 'cm' | 'pt' | 'ex' | 'em'
  | 'textwidth' | 'linewidth' | 'textheight' | 'paperwidth' | 'paperheight';

export interface Length {
  v: number;
  u: LengthUnit;
}

/** xcolor values. `mix` keeps the original expression verbatim so `blue!20!white` round-trips. */
export type Color =
  | { k: 'named'; name: string }
  | { k: 'rgb'; r: number; g: number; b: number }
  | { k: 'mix'; expr: string }
  | { k: 'structure'; shade?: number };

export type BeamerFontSize =
  | 'tiny' | 'scriptsize' | 'footnotesize' | 'small' | 'normalsize'
  | 'large' | 'Large' | 'LARGE' | 'huge' | 'Huge';

/** The ten sizes, smallest first, which is the order a picker has to offer them in. */
export const FONT_SIZES_ORDERED: readonly BeamerFontSize[] = [
  'tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize',
  'large', 'Large', 'LARGE', 'huge', 'Huge',
];

/* ------------------------------------------------------------------- inline */

export type InlineStyle =
  | 'bf' | 'it' | 'ul' | 'tt' | 'sc' | 'emph'
  | 'alert' | 'structure' | 'color' | 'size';

export type Inline =
  | { t: 'text'; s: PlainText }
  | { t: 'style'; style: InlineStyle; color?: Color; size?: BeamerFontSize; children: Inline[] }
  | { t: 'math'; tex: TexString }
  | { t: 'cite'; keys: string[]; pre?: PlainText; post?: PlainText }
  | { t: 'ref'; kind: 'ref' | 'pageref' | 'nameref' | 'eqref'; target: string }
  | { t: 'link'; url: string; children: Inline[] }
  | { t: 'sym'; name: string }
  | { t: 'break' }
  /** Unrecognised inline island. Rendered as an inert chip; never lost. */
  | { t: 'raw'; tex: TexString };

export type RichText = Inline[];

/* ---------------------------------------------------------------- placement */

/**
 * Structured = laid out by Beamer. Absolute = the user dragged it.
 * Absolute coordinates are page-relative, matching textpos with
 * \textblockorigin{0mm}{0mm} and matching the canvas coordinate system 1:1.
 */
export type Placement =
  | { mode: 'flow' }
  | {
      mode: 'absolute';
      x: Mm; y: Mm; w: Mm; h?: Mm;
      z: number;
      rotate?: Deg;
      driver: 'textpos' | 'tikz';
    };

export interface ElementBase {
  id: Id;
  placement: Placement;
  /** Verbatim beamer overlay spec, e.g. "<2->". Preserved, not authored, in v1. */
  overlay?: TexString;
  /** Comments immediately preceding this element in the source, kept verbatim. */
  leadingComments?: string[];
  /** Provenance from the last parse. Advisory only; invalidated by any model edit. */
  src?: SrcSpan;
}

/* ----------------------------------------------------------------- elements */

export interface TextElement extends ElementBase {
  kind: 'text';
  content: RichText;
  align?: 'left' | 'center' | 'right' | 'justify';
  size?: BeamerFontSize;
  color?: Color;
}

export interface ListItem {
  id: Id;
  /** description term, or \item[custom] */
  label?: RichText;
  content: RichText;
  overlay?: TexString;
  sublist?: ListElement;
}

export interface ListElement extends ElementBase {
  kind: 'list';
  listType: 'itemize' | 'enumerate' | 'description';
  /** Verbatim env options, preserved opaquely. */
  envOptions?: TexString;
  items: ListItem[];
}

export interface BeamerBlockElement extends ElementBase {
  kind: 'block';
  variant:
    | 'block' | 'alertblock' | 'exampleblock'
    | 'theorem' | 'definition' | 'lemma' | 'corollary' | 'proof' | 'example';
  title?: RichText;
  children: Element[];
}

export interface ColumnSpec {
  id: Id;
  width: Length;
  valign?: 't' | 'c' | 'b';
  children: Element[];
}

export interface ColumnsElement extends ElementBase {
  kind: 'columns';
  envOptions?: TexString;
  columns: ColumnSpec[];
}

/**
 * Crop, as big points removed from each edge, applied before any scaling.
 *
 * Absolute rather than fractional because graphicx rejects `\width` inside `trim`
 * (verified against the engine: it fails with "File ended while scanning use of
 * \Gread@parse@vp"). Storing the same units LaTeX consumes also keeps the round trip
 * exact, with no rounding drift. For an image with no embedded resolution — which is
 * every screenshot, every plot, and everything BeamerPoint rasterises itself — one big
 * point is one pixel, so the UI can map these straight onto the image.
 */
export interface ImageTrim {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

export interface ImageElement extends ElementBase {
  kind: 'image';
  resourceId: Id;
  width?: Length;
  height?: Length;
  keepAspect: boolean;
  rotate?: Deg;
  /** Horizontal placement within the text column. Ignored when absolutely placed. */
  align?: 'left' | 'center' | 'right';
  trim?: ImageTrim;
  caption?: RichText;
  /** Anything unrecognised in \includegraphics[...], preserved verbatim. */
  altGraphicsOptions?: TexString;
}

export type RowRule =
  | { k: 'toprule' | 'midrule' | 'bottomrule' | 'hline' }
  | { k: 'cmidrule'; from: number; to: number; trim?: string };

export interface TableColumn {
  id: Id;
  align: 'l' | 'c' | 'r' | 'p' | 'X';
  width?: Length;
  leftRule?: 'none' | 'single' | 'double';
}
/**
 * A cell, and optionally its own background.
 *
 * Fill lives on the id-keyed cell and row rather than in an index-keyed side table, so
 * inserting a row or a column does not need the index fixing that `shiftMerges` does
 * for merges.
 */
export interface TableCell { id: Id; content: RichText; fill?: Color }
export interface TableRow {
  id: Id; cells: TableCell[]; ruleBelow?: RowRule; isHeader?: boolean; fill?: Color;
}
export interface CellMerge {
  row: number; col: number; colspan: number; rowspan: number;
  align?: 'l' | 'c' | 'r';
}

export interface TableElement extends ElementBase {
  kind: 'table';
  style: 'booktabs' | 'hline' | 'plain';
  columns: TableColumn[];
  /**
   * The rule above the first row. Every other rule hangs off the row it follows, so
   * this is the one position `ruleBelow` cannot express — without it a `\toprule`
   * would have nowhere to live and the table could not round-trip.
   */
  topRule?: RowRule;
  /** The vertical rule after the last column; `leftRule` cannot express it. */
  endRule?: 'single' | 'double';
  rows: TableRow[];
  merges: CellMerge[];
  caption?: RichText;
  label?: string;
  fontSize?: BeamerFontSize;
  fit: 'natural' | 'resizebox' | 'tabularx';
  fitWidth?: Length;
  floatWrapper: 'none' | 'table' | 'center';
}

export interface MathElement extends ElementBase {
  kind: 'math';
  env: 'equation' | 'equation*' | 'align' | 'align*' | 'gather' | 'gather*' | 'displaymath';
  /** Body only, verbatim. NEVER structurally parsed. */
  tex: TexString;
  label?: string;
}

export interface CodeElement extends ElementBase {
  kind: 'code';
  backend: 'listings' | 'minted' | 'verbatim';
  language: string;
  /** Verbatim, byte-exact, including trailing newlines. */
  code: string;
  caption?: RichText;
  frameStyle?: 'none' | 'single' | 'lines' | 'shadowbox';
  options: Record<string, string>;
}

export interface TikzStyle {
  draw?: Color; fill?: Color; lineWidth?: Length;
  dash?: 'solid' | 'dashed' | 'dotted'; opacity?: number; textColor?: Color;
  /** Degrees, clockwise on screen. Needs no TikZ library. */
  rotate?: Deg;
  /** `drop shadow`, which DOES need `\usetikzlibrary{shadows}`. */
  shadow?: boolean;
}
export type Anchor =
  | { kind: 'point'; x: Mm; y: Mm }
  | { kind: 'shape'; shapeId: Id; side: 'n' | 's' | 'e' | 'w' | 'center' };
export type ArrowHead = 'none' | 'latex' | 'stealth' | 'to';
export type TikzShape =
  | { id: Id; t: 'rect'; x: Mm; y: Mm; w: Mm; h: Mm; rx?: Mm; style: TikzStyle }
  | { id: Id; t: 'ellipse'; cx: Mm; cy: Mm; rx: Mm; ry: Mm; style: TikzStyle }
  | { id: Id; t: 'path'; points: Array<[Mm, Mm]>; closed: boolean; smooth: boolean; style: TikzStyle }
  | { id: Id; t: 'arrow'; from: Anchor; to: Anchor; bend?: Deg; head: ArrowHead; style: TikzStyle }
  | {
      id: Id; t: 'node'; x: Mm; y: Mm; content: RichText;
      shape: 'none' | 'rect' | 'circle'; style: TikzStyle;
    };

export interface TikzElement extends ElementBase {
  kind: 'tikz';
  mode: 'shapes' | 'raw';
  shapes?: TikzShape[];
  /** Verbatim tikzpicture body when mode === 'raw'. */
  raw?: TexString;
  pictureOptions?: TexString;
  canvasSize: { w: Mm; h: Mm };
}

export interface DataTable { columns: string[]; rows: Array<Array<number | string | null>> }
export interface SeriesSpec {
  id: Id; xCol: number; yCol: number;
  label?: PlainText; color?: Color; marker?: string; dashed?: boolean;
}
export interface AxisSpec {
  xLabel?: PlainText; yLabel?: PlainText; title?: PlainText;
  legendPos?: string; grid: 'none' | 'major' | 'both';
  xmin?: number; xmax?: number; ymin?: number; ymax?: number;
  xmode?: 'normal' | 'log'; ymode?: 'normal' | 'log';
}
export interface ChartElement extends ElementBase {
  kind: 'chart';
  chartType: 'line' | 'bar' | 'hbar' | 'scatter';
  data: DataTable;
  series: SeriesSpec[];
  axis: AxisSpec;
  size: { w: Length; h: Length };
  extraAxisOptions?: TexString;
}

export interface TocElement extends ElementBase {
  kind: 'toc';
  options: TexString;
}

export interface BibliographyElement extends ElementBase {
  kind: 'bibliography';
  /** A `\bibliographystyle` written inside the frame rather than in the preamble. */
  style?: string;
  /** `.bib` names without the extension, as `\bibliography{a,b}` takes them. */
  files: string[];
  sizeHint?: BeamerFontSize;
}

export type RawReason = 'unrecognised' | 'guard-mismatch' | 'parse-error' | 'user-forced';

/** The universal escape hatch. Byte-exact. */
export interface RawElement extends ElementBase {
  kind: 'raw';
  tex: TexString;
  reason: RawReason;
  /** Best-effort human label for the outline. */
  label?: string;
}

export type Element =
  | TextElement | ListElement | BeamerBlockElement | ColumnsElement
  | ImageElement | TableElement | MathElement | CodeElement
  | TikzElement | ChartElement | TocElement | BibliographyElement
  | RawElement;

export type ElementKind = Element['kind'];

/* ------------------------------------------------------------ document tree */

export interface SectionNode {
  kind: 'section';
  id: Id;
  level: 'part' | 'section' | 'subsection' | 'subsubsection';
  title: RichText;
  shortTitle?: RichText;
  starred: boolean;
  leadingComments?: string[];
  src?: SrcSpan;
}

export interface FrameOptions {
  vAlign?: 't' | 'c' | 'b';
  /** Auto-set by the emitter when a CodeElement is present. */
  fragile?: boolean | 'singleslide';
  plain?: boolean;
  allowframebreaks?: boolean;
  label?: string;
  noframenumbering?: boolean;
  shrink?: number | true;
  squeeze?: boolean;
  /** Any [option] we did not recognise, preserved verbatim and re-emitted. */
  extra?: TexString[];
}

export interface NoteSpec { id: Id; content: RichText; options?: TexString }

export interface FrameNode {
  kind: 'frame';
  id: Id;
  title?: RichText;
  shortTitle?: RichText;
  subtitle?: RichText;
  overlay?: TexString;
  /**
   * How the title was written in the source.
   *
   * `\begin{frame}{Title}` and `\begin{frame}` + `\frametitle{Title}` mean the same
   * thing, and the app writes the second. Without remembering which one an imported
   * file used, re-emitting differs from the source, the round-trip guard demotes the
   * whole frame to a raw block, and the commonest way people write Beamer becomes
   * unimportable. Absent means `\frametitle`, which is what new frames use.
   */
  titleStyle?: 'argument';
  /** Set when the frame was written as `\frame{...}` rather than as an environment. */
  form?: 'command';
  options: FrameOptions;
  /** Flow order. Absolute elements keep their slot so toggling back restores position. */
  children: Element[];
  notes: NoteSpec[];
  background?: { color?: Color; imageResourceId?: Id };
  leadingComments?: string[];
  src?: SrcSpan;
}

export interface RawDocNode {
  kind: 'rawdoc';
  id: Id;
  tex: TexString;
  reason: RawReason;
  src?: SrcSpan;
}

export type DocNode = FrameNode | SectionNode | RawDocNode;

/* -------------------------------------------------------------------- preamble */

export type AspectRatio = '43' | '169' | '1610' | '54' | '32' | '141';

/** The TeX binary a deck should be compiled with. */
export type TexProgram = 'pdflatex' | 'xelatex' | 'lualatex';

export interface ThemeRef { name: string; options: string[] }
export interface PackageSpec { name: string; options: string[]; derived?: boolean; comment?: string }
export interface ColorDef {
  id: Id; name: string;
  model: 'rgb' | 'RGB' | 'HTML' | 'cmyk' | 'gray' | 'named';
  spec: string;
}
export interface BeamerSetting {
  id: Id;
  cmd: 'setbeamercolor' | 'setbeamerfont' | 'setbeamertemplate' | 'setbeamersize' | 'setbeamercovered';
  target: string;
  /** Verbatim, e.g. "{bg=blue!20,fg=black}". */
  value: TexString;
}
export type PreambleSlot =
  | 'after-documentclass' | 'after-packages' | 'after-theme'
  | 'after-settings' | 'before-document';
export interface PreambleChunk { id: Id; slot: PreambleSlot; tex: TexString; order: number }

export interface DocumentClassSpec {
  name: 'beamer';
  fontSize: 8 | 9 | 10 | 11 | 12 | 14 | 17 | 20;
  aspectRatio: AspectRatio;
  handout: boolean;
  /** Global top alignment. */
  t: boolean;
  extraOptions: string[];
}

export interface Preamble {
  documentClass: DocumentClassSpec;
  /**
   * Which TeX binary to compile with.
   *
   * Recorded in the file as a `% !TEX program = ...` magic comment, the convention
   * Overleaf, TeXShop and TeXstudio already understand, so an exported deck keeps
   * working outside BeamerPoint. Themes built on fontspec (metropolis, moloch) need
   * xelatex or lualatex: under pdflatex they compile but silently fall back to
   * Computer Modern, which does not look like the theme.
   */
  texProgram?: TexProgram;
  theme: ThemeRef;
  colorTheme?: ThemeRef;
  fontTheme?: ThemeRef;
  innerTheme?: ThemeRef;
  outerTheme?: ThemeRef;
  navigationSymbols: boolean;
  /** User-declared packages. The emitter UNIONS these with the derived set. */
  packages: PackageSpec[];
  /** Derived packages the user explicitly does not want. */
  suppressedDerived: string[];
  colorDefs: ColorDef[];
  beamerSettings: BeamerSetting[];
  /**
   * The `\bibliographystyle` line.
   *
   * The FILES are not here: `\bibliography{refs}` belongs in the document body, where
   * the reference list prints, and lives on a `BibliographyElement`. This field used to
   * carry a `files` array that the parser always set to `[]` and the emitter never
   * wrote — a value that could only ever be wrong.
   */
  bibliography?: { style: string; backend: 'bibtex' };
  custom: PreambleChunk[];
}

/* ------------------------------------------------------------------------ deck */

export interface DeckMeta {
  title?: RichText; shortTitle?: RichText;
  subtitle?: RichText;
  author?: RichText; shortAuthor?: RichText;
  institute?: RichText; shortInstitute?: RichText;
  date?: RichText;
}

export interface ResourceRef {
  id: Id;
  /** Path inside the virtual filesystem, e.g. 'images/plot.png'. */
  path: string;
  kind: 'image' | 'bib' | 'other';
  mime: string;
  bytes: number;
  sha256: string;
  originalName: string;
  intrinsic?: { w: number; h: number };
}

export interface Deck {
  schemaVersion: 1;
  id: Id;
  meta: DeckMeta;
  preamble: Preamble;
  nodes: DocNode[];
  resources: ResourceRef[];
  documentPrologue?: TexString;
  documentEpilogue?: TexString;
}
