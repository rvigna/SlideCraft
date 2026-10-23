import { useEffect } from 'react';
import * as ed from '../store/editor';
import { createTextObject } from '../model/factory';
import { plainToHtml } from '../model/richtext';
import { insertImageFiles } from '../io/images';
import { isTypingTarget } from './useShortcuts';

const MARKER = 'SLIDECRAFT_OBJECTS:';

/**
 * System clipboard integration: copied objects travel as text so they paste
 * into other SlideCraft tabs; pasted images and plain text become objects.
 */
export function useClipboard() {
  useEffect(() => {
    const blocked = () => !!ed.useEditor.getState().presentation || !!document.querySelector('.cds--modal.is-visible');

    const onCopy = (cut: boolean) => (e: ClipboardEvent) => {
      if (blocked() || isTypingTarget(document.activeElement) || !ed.useEditor.getState().selection.length) return;
      const data = ed.copySelection();
      if (!data || !e.clipboardData) return;
      e.clipboardData.setData('text/plain', MARKER + JSON.stringify(data));
      e.preventDefault();
      if (cut) ed.deleteSelection();
    };
    const copy = onCopy(false);
    const cut = onCopy(true);

    const paste = (e: ClipboardEvent) => {
      if (blocked() || isTypingTarget(document.activeElement)) return;
      const dt = e.clipboardData;
      const images = [...(dt?.files ?? [])].filter(f => f.type.startsWith('image/'));
      const text = dt?.getData('text/plain') ?? '';
      e.preventDefault();
      if (images.length) { void insertImageFiles(images); return; }
      if (text.startsWith(MARKER)) {
        try { ed.pasteObjects(JSON.parse(text.slice(MARKER.length))); } catch { ed.pasteObjects(); }
        return;
      }
      if (text.trim()) {
        const lines = text.trim().split(/\r?\n/);
        ed.addObjects((ids, t) => [createTextObject(ids, {
          x: 120, y: 120, w: 720, h: Math.min(400, 40 + lines.length * 34),
          text: plainToHtml(text.trim()), fontFamily: t.bodyFont, color: t.body,
        })]);
        return;
      }
      ed.pasteObjects();
    };

    document.addEventListener('copy', copy);
    document.addEventListener('cut', cut);
    document.addEventListener('paste', paste);
    return () => {
      document.removeEventListener('copy', copy);
      document.removeEventListener('cut', cut);
      document.removeEventListener('paste', paste);
    };
  }, []);
}
