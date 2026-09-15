import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

/**
 * Syntax colouring for the LaTeX source panel.
 *
 * The tags below are exactly the ones `codemirror-lang-latex` emits, so every
 * construct the grammar distinguishes gets a colour rather than falling through to the
 * default black. The palette is GitHub Light, which is well-tested for contrast on a
 * white background.
 *
 * Structural things (control sequences, environment names) are the most useful to pick
 * out at a glance, so they carry the strongest colours; braces and brackets are
 * deliberately muted, because in LaTeX there are a great many of them and colouring
 * them loudly makes the document harder to read, not easier.
 */

const KEYWORD = '#0550ae';      // \frametitle, \begin, \end, \usepackage
const DEFINITION = '#8250df';   // \documentclass
const ENVIRONMENT = '#116329';  // frame, itemize, block
const COMMENT = '#6e7781';
const PUNCTUATION = '#8c959f';  // braces and brackets
const STRING = '#0a3069';
const NUMBER = '#953800';
const LABEL = '#1b7c83';        // \label, \ref
const HEADING = '#0550ae';      // \section, \title, \author
const CITATION = '#116329';     // \cite
const OPERATOR = '#cf222e';     // & ~ \\ and other control symbols
const MATH_DELIM = '#bf3989';   // $
const MATH_VAR = '#953800';
const VERBATIM = '#57606a';
const INVALID = '#cf222e';

export const latexHighlightStyle = HighlightStyle.define([
  // Control sequences and structure.
  { tag: t.keyword, color: KEYWORD },
  { tag: t.definitionKeyword, color: DEFINITION, fontWeight: '600' },
  { tag: t.className, color: ENVIRONMENT, fontWeight: '600' },
  { tag: t.heading, color: HEADING, fontWeight: '600' },

  // Arguments and values.
  { tag: t.string, color: STRING },
  { tag: t.number, color: NUMBER },
  { tag: t.labelName, color: LABEL },
  { tag: t.quote, color: CITATION },

  // Math.
  { tag: t.processingInstruction, color: MATH_DELIM, fontWeight: '600' },
  { tag: t.variableName, color: MATH_VAR },

  // Punctuation stays quiet: LaTeX is mostly braces, and colouring them all is noise.
  { tag: t.bracket, color: PUNCTUATION },
  { tag: t.operator, color: OPERATOR },

  // Verbatim and comments.
  { tag: t.comment, color: COMMENT, fontStyle: 'italic' },
  { tag: t.meta, color: VERBATIM },

  // Inline formatting mirrors what it produces, so the source hints at the output.
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.monospace, fontFamily: 'Consolas, "Courier New", monospace' },

  { tag: t.content, color: '#1b1d21' },
  { tag: t.invalid, color: INVALID, textDecoration: 'underline wavy' },
]);

/** Editor chrome: gutter, active line, selection and cursor. */
export const latexEditorTheme = EditorView.theme({
  '&': { fontSize: '12px', backgroundColor: '#ffffff' },
  '.cm-content': { caretColor: '#2f5bd7', padding: '6px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#2f5bd7', borderLeftWidth: '2px' },
  '.cm-gutters': {
    backgroundColor: '#fafbfc',
    color: '#8c959f',
    border: 'none',
    borderRight: '1px solid #eef0f3',
  },
  '.cm-activeLine': { backgroundColor: '#f6f8fa' },
  '.cm-activeLineGutter': { backgroundColor: '#eef2f6', color: '#57606a' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: '#d7e3fb',
  },
  '.cm-selectionMatch': { backgroundColor: '#fff2c6' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: '#dcf2e3',
    outline: '1px solid #74c58a',
  },
  '.cm-nonmatchingBracket': { backgroundColor: '#ffdcd7' },
});
