import { useEffect } from 'react';
import { useStore } from '../state/store.js';

/**
 * Is this event coming from somewhere the key already means something?
 *
 * Every unmodified-key shortcut needs this, and so does Ctrl+Z: the app's only keyboard
 * handler bound undo on `window` with no guard at all, so pressing it inside the source
 * editor or a canvas text box undid a whole document edit instead of the last word
 * typed. The browser's own undo for that field never ran.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * The application's keyboard shortcuts.
 *
 * Deliberately few, and all of them guarded. Anything more specific — moving the
 * selection in the slide rail, inserting a slide from it — belongs to the widget that
 * owns the focus, so that it works the way the rest of that widget does and does not
 * fire when the user is somewhere else entirely.
 */
export function useShortcuts(): void {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const deleteElement = useStore((s) => s.deleteElement);
  const deleteSlide = useStore((s) => s.deleteSlide);
  const copyElement = useStore((s) => s.copyElement);
  const cutElement = useStore((s) => s.cutElement);
  const duplicateElement = useStore((s) => s.duplicateElement);

  useEffect(() => {
    /**
     * Copy, cut, paste and duplicate for the SELECTED ELEMENT.
     *
     * Only reached when the event did not come from a typing target, so Ctrl+C inside a
     * text box still copies the text the user highlighted -- the browser's own handling
     * is the right one there, and stealing it would be a regression dressed as a
     * feature.
     */
    const clip = (e: KeyboardEvent): void => {
      const { selection, source } = useStore.getState();
      if (source.status !== 'synced' || selection.slideId === null) return;
      const id = selection.elementId;

      if (id === null) return;
      e.preventDefault();
      if (e.key === 'c') copyElement(selection.slideId, id);
      else if (e.key === 'x') cutElement(selection.slideId, id);
      else if (e.key === 'd') duplicateElement(selection.slideId, id);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target)) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
        // NOT 'v': a real Ctrl+V also fires a `paste` event, and handling it here as
        // well meant one press pasted the copied element AND whatever the system
        // clipboard held. `usePaste` owns it, because only the paste event can see
        // which of the two the user actually meant.
        else if (e.key === 'c' || e.key === 'x' || e.key === 'd') {
          clip(e);
        }
        return;
      }
      if (e.altKey) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selection, source } = useStore.getState();
        if (source.status !== 'synced' || selection.slideId === null) return;
        e.preventDefault();
        // What is selected, not what is focused: Delete on a slide with something
        // picked out on it means that thing, exactly as it does in PowerPoint.
        if (selection.elementId !== null) deleteElement(selection.slideId, selection.elementId);
        else deleteSlide(selection.slideId);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, deleteElement, deleteSlide, copyElement, cutElement, duplicateElement]);
}
