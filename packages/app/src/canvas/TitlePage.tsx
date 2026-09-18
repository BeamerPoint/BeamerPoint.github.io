import {
  PX_PER_MM,
  canvasFontStack,
  richTextToPlain,
  type Deck,
  type RichText,
  type ThemeSpec,
  type TitleField,
  type TitleLine,
} from '@beamerpoint/core';
import { InlineText } from './InlineText.js';

/**
 * `\titlepage` and `\maketitle` drawn as a title page.
 *
 * These stay `RawElement`s in the model — the emitter writes the one command and beamer
 * builds the slide — so this is purely a canvas rendering. Before it existed the canvas
 * drew the literal characters `\titlepage` in a dashed grey box, which told the user
 * nothing about the slide they were making.
 *
 * Positions, font sizes and line order come from `theme.titleLayout`, measured off a
 * compiled `\titlepage` per theme. The measurement is of single-line content, so this
 * places the first line at its measured baseline and then gives each following line its
 * measured baseline GAP; a title long enough to wrap pushes the rest down instead of
 * being overlapped by it.
 */

const PT_PER_MM = 72.27 / 25.4;

/** Vertical padding of beamer's `beamercolorbox`, which the default template sets to 8pt. */
const BOX_PAD_MM = 8 / PT_PER_MM;

/** Where a field's text comes from. */
function fieldText(field: TitleField, deck: Deck): RichText | undefined {
  const m = deck.meta;
  switch (field) {
    case 'title': return m.title;
    case 'subtitle': return m.subtitle;
    case 'author': return m.author;
    case 'institute': return m.institute;
    case 'date': return m.date;
  }
}

function colourOf(field: TitleField, theme: ThemeSpec): string {
  const t = theme.titlePage;
  switch (field) {
    case 'title': return t.titleFg;
    case 'subtitle': return t.subtitleFg;
    case 'author': return t.authorFg;
    case 'institute': return t.instituteFg;
    case 'date': return t.dateFg;
  }
}

/** Millimetres from a line's own top edge down to its baseline, at `line-height: 1.2`. */
function ascentMm(sizePt: number): number {
  return (0.9 * sizePt) / PT_PER_MM;
}

/** Millimetres from a line's baseline down to its own bottom edge. */
function descentMm(sizePt: number): number {
  return (0.3 * sizePt) / PT_PER_MM;
}

interface Props {
  deck: Deck;
  theme: ThemeSpec;
  /** Empty placeholders are drawn so the slide is never a blank rectangle. */
  showPlaceholders: boolean;
}

export function TitlePage({ deck, theme, showPlaceholders }: Props): React.ReactElement {
  const layout = theme.titleLayout;
  const mm = (n: number): string => `${n * PX_PER_MM}px`;

  /**
   * Beamer's default template sets the title and subtitle in ONE `beamercolorbox`, so
   * a theme whose `title` colour carries a background — Madrid's blue bar — paints both
   * of them, and its 8pt padding is inside the block rather than between lines. Getting
   * that wrong put every line below the title 2.8mm low.
   */
  const boxed = theme.titlePage.titleBg !== undefined;
  const inBox = (line: TitleLine): boolean =>
    boxed && line.fields.every((f) => f === 'title' || f === 'subtitle');

  const line = (l: TitleLine, marginMm: number): React.ReactElement | null => {
    const parts = l.fields
      .map((f) => ({ field: f, content: fieldText(f, deck) }))
      .filter((p) => p.content !== undefined || showPlaceholders);
    if (parts.length === 0) return null;

    return (
      <div
        key={l.fields.join('+')}
        className={`bp-title-line bp-title-${l.fields[0]}`}
        style={{
          marginTop: mm(marginMm),
          fontSize: mm(l.sizePt / PT_PER_MM),
          lineHeight: 1.2,
          color: colourOf(l.fields[0]!, theme),
        }}
      >
        {parts.map((p, i) => (
          <span key={p.field} style={{ color: colourOf(p.field, theme) }}>
            {i > 0 && ' '}
            {p.content === undefined
              ? <span className="bp-title-placeholder">{p.field}</span>
              : isToday(p.content)
                // A new deck's date is `\today`, and drawing those seven characters is
                // not what the compiled slide shows.
                ? today()
                : <InlineText content={p.content} />}
          </span>
        ))}
      </div>
    );
  };

  const boxLines: React.ReactElement[] = [];
  const looseLines: React.ReactElement[] = [];
  let prev: TitleLine | undefined;
  let prevWasBoxed = false;

  for (const l of layout.lines) {
    const gapMm = prev === undefined ? 0 : l.baselineMm - prev.baselineMm;
    const marginMm = prev === undefined
      ? 0
      : gapMm - descentMm(prev.sizePt) - ascentMm(l.sizePt)
        // Crossing out of the colour box costs its bottom padding.
        - (prevWasBoxed && !inBox(l) ? BOX_PAD_MM : 0);

    const node = line(l, marginMm);
    if (node === null) continue;
    (inBox(l) ? boxLines : looseLines).push(node);
    prev = l;
    prevWasBoxed = inBox(l);
  }

  const first = layout.lines[0];
  const topMm = first === undefined
    ? 0
    // The block's top edge, so the first line's baseline lands where it was measured.
    : first.baselineMm - ascentMm(first.sizePt) - (inBox(first) ? BOX_PAD_MM : 0);

  return (
    <div
      className={`bp-titlepage bp-titlepage-${layout.align}`}
      style={{
        top: mm(topMm),
        ...(layout.align === 'center'
          ? { left: mm(layout.anchorMm), transform: 'translateX(-50%)' }
          : { left: mm(layout.anchorMm) }),
        fontFamily: canvasFontStack(deck.preamble, theme.fontFamily === 'serif'),
      }}
    >
      {boxLines.length > 0 && (
        <div
          className="bp-titlebox"
          style={{
            background: theme.titlePage.titleBg,
            padding: `${mm(BOX_PAD_MM)} ${mm(4)}`,
            margin: `0 ${mm(-4)}`,
          }}
        >
          {boxLines}
        </div>
      )}
      {looseLines}
    </div>
  );
}

/**
 * True for a date that is just `\today`.
 *
 * A new deck's date is a single RAW inline span, not text — `\today` is a macro, so the
 * parser and the factory both keep it verbatim — which is why this looks at the spans
 * rather than at `richTextToPlain`.
 */
function isToday(content: RichText): boolean {
  const spans = content.filter((s) => s.t !== 'text' || s.s.trim() !== '');
  return spans.length === 1
    && ((spans[0]!.t === 'raw' && spans[0]!.tex.trim() === '\\today')
      || richTextToPlain(content).trim() === '\\today');
}

/** What `\today` puts on the slide, in the same shape as LaTeX's English default. */
function today(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

/** True when this raw tex is a title page beamer builds for us. */
export function isTitlePageTex(tex: string): boolean {
  const t = tex.trim();
  return t === '\\titlepage' || t === '\\maketitle';
}
