import { richTextToPlain, type Deck, type ThemeSpec, type TocElement } from '@beamerpoint/core';

interface Props {
  el: TocElement;
  deck: Deck;
  theme: ThemeSpec;
}

/**
 * An outline slide.
 *
 * Beamer builds the list from the deck's `\section` headings at compile time, so there is
 * nothing here to edit — the canvas simply shows which headings exist, and adding one in
 * the slide rail changes what appears. `[currentsection]` and friends are preserved in
 * `el.options` and are honoured by the PDF, not by this.
 */
export function TocView({ el, deck, theme }: Props): React.ReactElement {
  const sections = deck.nodes.filter((n) => n.kind === 'section');

  if (sections.length === 0) {
    return (
      <div className="bp-toc bp-toc-empty">
        No sections yet — add one in the slide list and it appears here.
      </div>
    );
  }

  return (
    <ol className="bp-toc">
      {sections.map((n, i) => (
        <li
          key={n.id}
          className={`bp-toc-item bp-toc-${n.level}`}
          style={{ color: theme.structure }}
        >
          <span className="bp-toc-num">{i + 1}</span>
          <span className="bp-toc-title" style={{ color: theme.foreground }}>
            {richTextToPlain(n.title)}
          </span>
        </li>
      ))}
      {el.options !== '' && (
        <li className="bp-toc-options" title="Passed to \tableofcontents">
          {el.options}
        </li>
      )}
    </ol>
  );
}
