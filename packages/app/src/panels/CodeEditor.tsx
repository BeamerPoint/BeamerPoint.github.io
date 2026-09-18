/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { useEffect, useRef, useState } from 'react';
import {
  LST_LANGUAGES, lstNeedsDefinition, richTextToPlain, type CodeElement,
} from '@beamerpoint/core';
import { useStore } from '../state/store.js';

interface Props {
  el: CodeElement;
  slideId: string;
  locked: boolean;
}

const BACKENDS: ReadonlyArray<{ value: CodeElement['backend']; label: string; title: string }> = [
  { value: 'listings', label: 'listings', title: 'Highlighted, and it compiles here' },
  { value: 'verbatim', label: 'verbatim', title: 'Plain monospace, no highlighting, no package' },
  { value: 'minted', label: 'minted', title: 'Pygments — kept in the exported file; previewed here with listings' },
];

const FRAMES: ReadonlyArray<{ value: NonNullable<CodeElement['frameStyle']>; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'single', label: 'Box' },
  { value: 'lines', label: 'Lines' },
  { value: 'shadowbox', label: 'Shadow' },
];

/**
 * Properties of the selected listing. The code itself is typed on the canvas.
 *
 * The language is a fixed list, not a text field, because `listings` treats an unknown
 * language as a HARD ERROR — `language=Nonesuch` aborts the compile and produces no PDF.
 * The list was measured against the bundled TeX Live; the seven names marked "added" are
 * ones `listings` does not ship and the emitter defines in the preamble.
 */
export function CodeEditor({ el, slideId, locked }: Props): React.ReactElement {
  const setCodeText = useStore((s) => s.setCodeText);
  const setCodeLanguage = useStore((s) => s.setCodeLanguage);
  const setCodeBackend = useStore((s) => s.setCodeBackend);
  const setCodeFrameStyle = useStore((s) => s.setCodeFrameStyle);
  const setCodeCaption = useStore((s) => s.setCodeCaption);
  const setCodeOption = useStore((s) => s.setCodeOption);

  const numbered = el.options['numbers'] === 'left';

  return (
    <div className="bp-code-editor">
      <h4>Code</h4>

      <label className="bp-field">
        <span>Language</span>
        <select
          disabled={locked || el.backend === 'verbatim'}
          value={el.language}
          onChange={(e) => setCodeLanguage(slideId, el.id, e.target.value)}
        >
          <option value="">None</option>
          {LST_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {lstNeedsDefinition(l) ? `${l} (added)` : l}
            </option>
          ))}
        </select>
      </label>

      <label className="bp-field">
        <span>Typeset with</span>
        <select
          disabled={locked}
          value={el.backend}
          onChange={(e) => setCodeBackend(slideId, el.id, e.target.value as CodeElement['backend'])}
        >
          {BACKENDS.map((b) => (
            <option key={b.value} value={b.value} title={b.title}>{b.label}</option>
          ))}
        </select>
      </label>

      {el.backend === 'minted' && (
        <p className="bp-hint">
          minted needs shell escape, which the in-browser engine does not have, so the
          preview here uses listings. The exported file keeps minted for a local TeX.
        </p>
      )}

      {el.backend !== 'verbatim' && (
        <>
          <div className="bp-field">
            <span>Border</span>
            <div className="bp-seg">
              {FRAMES.map((f) => (
                <button
                  key={f.value}
                  disabled={locked}
                  className={(el.frameStyle ?? 'none') === f.value ? 'is-active' : ''}
                  onClick={() => setCodeFrameStyle(slideId, el.id, f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <label className="bp-field bp-field-inline">
            <input
              type="checkbox"
              disabled={locked}
              checked={numbered}
              onChange={(e) => setCodeOption(
                slideId, el.id, 'numbers', e.target.checked ? 'left' : null,
              )}
            />
            <span>Line numbers</span>
          </label>

          <label className="bp-field">
            <span>Caption</span>
            <input
              type="text"
              placeholder="none"
              disabled={locked}
              value={el.caption === undefined ? '' : richTextToPlain(el.caption)}
              onChange={(e) => setCodeCaption(slideId, el.id, e.target.value)}
            />
          </label>
        </>
      )}

      <CodeTextArea
        code={el.code}
        locked={locked}
        onCommit={(code) => setCodeText(slideId, el.id, code)}
      />
    </div>
  );
}

/**
 * The listing's text, for when the canvas is an awkward place to type.
 *
 * Debounced, unlike `MathEditor`'s field: every commit re-emits the WHOLE deck and pushes
 * an undo entry, and a code block is long enough that doing that per keystroke is felt.
 */
function CodeTextArea({
  code, locked, onCommit,
}: {
  code: string;
  locked: boolean;
  onCommit(code: string): void;
}): React.ReactElement {
  const [draft, setDraft] = useState(code);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the model when it changes from elsewhere — typing on the canvas, undo, or a
  // source-panel edit — but not while this field owns the text.
  useEffect(() => { setDraft(code); }, [code]);

  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);

  return (
    <label className="bp-field">
      <span>Code</span>
      <textarea
        className="bp-code-input"
        rows={8}
        spellCheck={false}
        disabled={locked}
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (timer.current !== null) clearTimeout(timer.current);
          timer.current = setTimeout(() => onCommit(next), 400);
        }}
        onBlur={() => {
          if (timer.current !== null) clearTimeout(timer.current);
          if (draft !== code) onCommit(draft);
        }}
      />
    </label>
  );
}
