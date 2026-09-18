/*
 * BeamerPoint
 *
 * Author: Abolfazl Mohebbi, PhD
 *         Professor in Mechanical and Biomedical Engineering,
 *         Polytechnique Montreal
 *         abolfazl.mohebbi@polymtl.ca
 */

import { useCallback, useState } from 'react';
import type { Deck, ResourceRef } from '@beamerpoint/core';
import { useStore } from '../state/store.js';
import { attachResourceFile } from '../state/images.js';
import { analyseImport, type ImportAnalysis } from '../io/importTex.js';

export interface PendingImport {
  filename: string;
  analysis: ImportAnalysis;
}

export interface TexImport {
  /** Open a picker for a `.tex` file. */
  choose(): void;
  /** Analyse a file the user dropped or picked. */
  offer(file: File): Promise<void>;
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
      const text = await file.text();
      setPending({ filename: file.name, analysis: analyseImport(text) });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const choose = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.tex,.ltx,text/x-tex';
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

    // Store bytes against the ids the parser already assigned, so the elements that
    // reference them keep working. Paths can shift if a file needs rasterising.
    const taken = new Set(deck.resources.map((r) => r.path));
    const updated: ResourceRef[] = [];
    for (const ref of deck.resources) {
      const file = files.get(ref.path);
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
    pending,
    cancel: () => setPending(null),
    confirm,
    notice,
    dismissNotice: () => setNotice(null),
  };
}
