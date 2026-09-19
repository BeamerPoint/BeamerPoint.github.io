/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { useCallback, useState } from 'react';
import { newId, type Deck, type ResourceRef } from '@beamerpoint/core';
import { useStore } from '../state/store.js';
import { attachResourceFile } from '../state/images.js';
import { putResourceBytes } from '../state/resources.js';
import { analyseImport, type ImportAnalysis } from '../io/importTex.js';
import {
  analyseProject, findMainCandidates, isZipFile, readProjectZip,
  type Project, type ProjectAnalysis,
} from '../io/importProject.js';

export interface PendingImport {
  filename: string;
  analysis: ImportAnalysis | ProjectAnalysis;
  /** Set for a `.zip` project import. */
  project?: Project;
}

/** Guess a MIME type from a project path, for files that arrive as bare bytes. */
function mimeOf(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const known: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', pdf: 'application/pdf',
    svg: 'image/svg+xml', webp: 'image/webp', gif: 'image/gif', eps: 'application/postscript',
    bib: 'text/x-bibtex', tex: 'text/x-tex', sty: 'text/x-tex', cls: 'text/x-tex',
  };
  return known[ext] ?? 'application/octet-stream';
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', buf as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface TexImport {
  /** Open a picker for a `.tex` file. */
  choose(): void;
  /** Analyse a file the user dropped or picked: a `.tex`, or a project `.zip`. */
  offer(file: File): Promise<void>;
  /** For a project with several documents: analyse it from a different main file. */
  chooseMain(path: string): void;
  pending: PendingImport | null;
  cancel(): void;
  /** Apply the pending import, attaching any image files matched by name. */
  confirm(files: Map<string, File>): Promise<void>;
  notice: string | null;
  dismissNotice(): void;
}

/** True for a file the import flow should take, rather than the image importer. */
export function isTexFile(file: File): boolean {
  return /\.(tex|ltx)$/i.test(file.name) || file.type === 'text/x-tex';
}

/**
 * Importing an external `.tex`.
 *
 * Two steps on purpose: analyse and report, then apply. An import replaces the open
 * deck, so the user gets to see what survived as editable structure and what did not
 * before anything of theirs is thrown away.
 */
export function useTexImport(): TexImport {
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loadDeck = useStore((s) => s.loadDeck);

  const offer = useCallback(async (file: File): Promise<void> => {
    try {
      if (isZipFile(file)) {
        const project = await readProjectZip(file, file.name);
        const main = findMainCandidates(project)[0];
        if (main === undefined) {
          setNotice(`${file.name} contains no LaTeX document: no .tex file with a documentclass and a document environment.`);
          return;
        }
        setPending({ filename: file.name, analysis: analyseProject(project, main), project });
        return;
      }
      const text = await file.text();
      setPending({ filename: file.name, analysis: analyseImport(text) });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const chooseMain = useCallback((path: string): void => {
    setPending((p) => (p?.project === undefined
      ? p
      : { ...p, analysis: analyseProject(p.project, path) }));
  }, []);

  const choose = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.tex,.ltx,.zip,text/x-tex,application/zip';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file !== undefined) void offer(file);
    };
    input.click();
  }, [offer]);

  const confirm = useCallback(async (files: Map<string, File>): Promise<void> => {
    const current = pending;
    if (current === null) return;

    let deck: Deck = current.analysis.deck;
    const failures: string[] = [];
    const plan = 'project' in current.analysis ? current.analysis.project : undefined;
    const project = current.project;

    // Store bytes against the ids the parser already assigned, so the elements that
    // reference them keep working. Paths can shift if a file needs rasterising.
    const taken = new Set(deck.resources.map((r) => r.path));
    const updated: ResourceRef[] = [];
    for (const original of deck.resources) {
      let ref = original;
      let file = files.get(ref.path);
      // A project supplies its own images. The resource takes the file's REAL path --
      // `\includegraphics{plot}` via \graphicspath becomes `figures/plot.png` -- so the
      // bytes keep their folder and extension, and attaching does not rename them into
      // `images/`. The emitted path is explicit, which works with or without \graphicspath.
      const resolved = plan?.images.get(ref.id);
      if (file === undefined && resolved !== undefined && project !== undefined) {
        const pf = project.files.get(resolved)!;
        const name = resolved.split('/').pop() ?? resolved;
        file = new File([pf.bytes.slice()], name, { type: mimeOf(resolved) });
        taken.delete(ref.path);
        taken.add(resolved);
        ref = { ...ref, path: resolved };
      }
      if (file === undefined) { updated.push(ref); continue; }
      try {
        const { ref: next } = await attachResourceFile(ref, file, taken);
        taken.delete(ref.path);
        taken.add(next.path);
        updated.push(next);
      } catch (err) {
        updated.push(ref);
        failures.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // Every other project file is stored as it is, at its own path: a local theme or
    // .sty, a .bib, an image only raw LaTeX names, a data file. The compiler receives
    // every stored resource, so the project compiles as it did for its author, and
    // export writes them all back.
    if (plan !== undefined) {
      for (const pf of plan.support) {
        const id = newId();
        await putResourceBytes(id, pf.bytes);
        updated.push({
          id,
          path: pf.path,
          kind: /\.bib$/i.test(pf.path) ? 'bib' : 'other',
          mime: mimeOf(pf.path),
          bytes: pf.bytes.byteLength,
          sha256: await sha256Hex(pf.bytes),
          originalName: pf.path.split('/').pop() ?? pf.path,
        });
      }
    }
    deck = { ...deck, resources: updated };

    loadDeck(deck);
    setPending(null);
    setNotice(
      failures.length > 0
        ? `Imported ${current.filename}, but some images could not be read — ${failures.join('; ')}`
        : `Imported ${current.filename}.`,
    );
  }, [pending, loadDeck]);

  return {
    choose,
    offer,
    chooseMain,
    pending,
    cancel: () => setPending(null),
    confirm,
    notice,
    dismissNotice: () => setNotice(null),
  };
}
