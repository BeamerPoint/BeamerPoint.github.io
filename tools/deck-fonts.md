# Which font packages actually change a beamer slide

Re-runnable probe behind `themes/fonts.ts`. Run it after touching `DECK_FONTS`.

## The question

A package being installed does not mean it changes anything. **Beamer typesets in
sans**, so `mathptmx` and `mathpazo` — the obvious way to offer Times and Palatino — set
`\rmdefault` and leave `\familydefault` at `cmss`. Loading either on its own compiles
cleanly, produces a PDF, and looks exactly like not loading it. That is a control that
lies, which is the same trap the theme catalogue exists to avoid.

So the question is not "does it compile" but "what is `\familydefault` afterwards".

## The probe

Reading the PDF's `/BaseFont` entries does not work here: busytex writes object streams,
so the names are compressed and the regex finds nothing. Ask LaTeX instead, in the
preamble, and read the log.

In dev, with `window.bpEngine` ready (press Compile once):

```js
window.__probe = async function (cands) {
  const out = []; let n = 0;
  for (const c of cands) {
    const tex = [
      '\\documentclass[aspectratio=169,11pt]{beamer}',
      '\\usetheme{Madrid}',
      c.pre,
      '\\begin{document}',
      '\\makeatletter\\typeout{BPFONT rm=\\rmdefault sf=\\sfdefault fam=\\familydefault}\\makeatother',
      '\\begin{frame}\\frametitle{Probe}The quick brown fox.\\end{frame}',
      '\\end{document}',
    ].filter(Boolean).join('\n');
    const r = await window.bpEngine.compile({
      jobId: 'f' + (n++), mainFile: 'main.tex',
      files: [{ path: 'main.tex', content: tex }],
      program: 'pdflatex', passes: 1, runBibtex: false, timeoutMs: 60000,
    });
    out.push({
      id: c.id,
      ok: r.ok && !!r.pdf,
      info: (r.log || '').split('\n').find((l) => l.startsWith('BPFONT')) ?? '',
      err: (r.log || '').split('\n').filter((l) => l.startsWith('!')).slice(0, 2).join(' | '),
    });
  }
  return out;
};
```

Note `\makeatletter` must NOT be used inside a `frame`: beamer reads a frame's body in
a special mode and `\f@family` there fails with *Undefined control sequence*, taking the
compile down. Ask in the preamble.

## What it said

Madrid, 11pt, pdfLaTeX. `\familydefault` after the preamble:

| `\usepackage{...}` | rm | sf | familydefault | verdict |
| --- | --- | --- | --- | --- |
| — | cmr | cmss | **cmss** | the default |
| `lmodern` | lmr | lmss | **lmss** | works alone |
| `helvet` | cmr | phv | **phv** | works alone |
| `avant` | cmr | pag | **pag** | works alone |
| `mathptmx` | ptm | cmss | **cmss** | **no visible change** |
| `mathpazo` | ppl | cmss | **cmss** | **no visible change** |
| `mathptmx` + `\usefonttheme{serif}` | ptm | cmss | **ptm** | Times |
| `mathpazo` + `\usefonttheme{serif}` | ppl | cmss | **ppl** | Palatino |
| `charter` + serif | bch | cmss | **bch** | Charter |
| `bookman` + serif | pbk | pag | **pbk** | Bookman |
| `newcent` + serif | pnc | pag | **pnc** | New Century Schoolbook |
| `utopia` + serif | put | cmss | **put** | Utopia |
| `libertine` + serif | LinuxLibertineT | LinuxBiolinumT | **LinuxLibertineT** | Libertine |
| `\usefonttheme{serif}` alone | cmr | cmss | **cmr** | Computer Modern Roman |

All eleven offered combinations then compiled a full slide with inline math, with no
errors and a PDF out.

**Not bundled** — `\usepackage` fails with *File `x.sty' not found*, so they are not
offered: `fourier`, `kpfonts`, `cmbright`, `iwona`, `berasans`, `mathdesign`.
