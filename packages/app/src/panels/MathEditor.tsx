import { useMemo } from 'react';
import katex from 'katex';
import type { MathElement } from '@beamerpoint/core';
import { useStore, type MathEnv } from '../state/store.js';
import { wrapForKatex } from '../canvas/mathPreview.js';

const ENVS: Array<{ value: MathEnv; label: string }> = [
  { value: 'equation', label: 'equation (numbered)' },
  { value: 'equation*', label: 'equation* (unnumbered)' },
  { value: 'align', label: 'align (numbered)' },
  { value: 'align*', label: 'align* (unnumbered)' },
  { value: 'gather', label: 'gather (numbered)' },
  { value: 'gather*', label: 'gather* (unnumbered)' },
  { value: 'displaymath', label: 'displaymath \\[ \\]' },
];

/**
 * Editor for a display-math element.
 *
 * The body is edited as raw LaTeX and stored verbatim. Math is the one place where a
 * structural model buys nothing and risks a lot: people paste equations out of papers,
 * and anything the model could not represent would have to be mangled to fit. So the
 * editor's job is to show what the maths will look like and to report errors early,
 * not to constrain what can be typed.
 *
 * KaTeX is a preview, not a validator: it covers less than LaTeX, so an error here
 * means "KaTeX cannot draw this", not "this will not compile".
 */
export function MathEditor({
  el,
  slideId,
  locked,
}: {
  el: MathElement;
  slideId: string;
  locked: boolean;
}): React.ReactElement {
  const setMathTex = useStore((s) => s.setMathTex);
  const setMathEnv = useStore((s) => s.setMathEnv);

  const preview = useMemo(() => {
    try {
      const wrapped = wrapForKatex(el.tex, el.env);
      return {
        html: katex.renderToString(wrapped, { displayMode: true, throwOnError: true }),
        error: null,
      };
    } catch (err) {
      return { html: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [el.tex, el.env]);

  return (
    <div className="bp-math-editor">
      <label>
        Environment
        <select
          disabled={locked}
          value={el.env}
          onChange={(e) => setMathEnv(slideId, el.id, e.target.value as MathEnv)}
        >
          {ENVS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>

      <label>
        LaTeX
        <textarea
          className="bp-math-input"
          spellCheck={false}
          rows={5}
          disabled={locked}
          value={el.tex}
          onChange={(e) => setMathTex(slideId, el.id, e.target.value)}
        />
      </label>

      <div className="bp-math-preview">
        {preview.html !== null ? (
          <span dangerouslySetInnerHTML={{ __html: preview.html }} />
        ) : (
          <span className="bp-math-preview-error" title={preview.error ?? ''}>
            {firstLine(preview.error)}
          </span>
        )}
      </div>
      {preview.html === null && (
        <p className="bp-hint">
          The preview could not render this. KaTeX supports less than LaTeX, so it may
          still compile — use the PDF tab to check.
        </p>
      )}
    </div>
  );
}

function firstLine(msg: string | null): string {
  if (msg === null) return 'Could not render';
  return msg.replace(/^KaTeX parse error:\s*/, '').split('\n')[0]!.slice(0, 120);
}
