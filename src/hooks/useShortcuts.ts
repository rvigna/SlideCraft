import { useEffect } from 'react';
import * as ed from '../store/editor';
import { useUi, openDialog } from '../store/ui';
import { openPptxFile, savePptxFile, saveToBrowser, printDeck } from '../io/files';
import { toggleFormat } from '../components/formatting';
import { closeContextMenu } from '../components/ContextMenu';
import { addTextBox } from '../components/Toolbar';

export function isTypingTarget(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || !!el.closest('input, textarea, select, [contenteditable="true"]'));
}

/** Editor keyboard shortcuts (presentation mode has its own handler) */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const state = ed.useEditor.getState();
      if (state.presentation) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const modal = !!document.querySelector('.cds--modal.is-visible');

      // Global shortcuts that work everywhere, even while typing
      if (mod && key === 's') { e.preventDefault(); if (e.shiftKey) void savePptxFile(); else saveToBrowser(true); return; }
      if (mod && key === 'o') { e.preventDefault(); void openPptxFile(); return; }
      if (mod && key === 'p') { e.preventDefault(); printDeck(); return; }
      if (e.key === 'F5') {
        e.preventDefault();
        ed.startPresentation(e.shiftKey ? 0 : state.slideIndex, e.altKey);
        return;
      }
      if (modal || useUi.getState().menu) return;
      if (isTypingTarget(e.target)) return;

      if (mod) {
        switch (key) {
          case 'z': e.preventDefault(); if (e.shiftKey) ed.redo(); else ed.undo(); return;
          case 'y': e.preventDefault(); ed.redo(); return;
          case 'a': e.preventDefault(); ed.selectAll(); return;
          case 'd': e.preventDefault(); ed.duplicateSelection(); return;
          case 'b': e.preventDefault(); toggleFormat('bold'); return;
          case 'i': e.preventDefault(); toggleFormat('italic'); return;
          case 'u': e.preventDefault(); toggleFormat('underline'); return;
          case 'm': e.preventDefault(); ed.addSlide(); return;
          case ']': case '}': e.preventDefault(); ed.reorderSelection(e.shiftKey ? 'front' : 'forward'); return;
          case '[': case '{': e.preventDefault(); ed.reorderSelection(e.shiftKey ? 'back' : 'backward'); return;
          case '=': case '+': e.preventDefault(); ed.setZoom(state.zoom + 10); return;
          case '-': e.preventDefault(); ed.setZoom(state.zoom - 10); return;
          case '0': e.preventDefault(); window.dispatchEvent(new Event('slidecraft:zoom-fit')); return;
          case '/': e.preventDefault(); openDialog('shortcuts'); return;
        }
        if (e.shiftKey && key === 'x') { e.preventDefault(); toggleFormat('strikethrough'); }
        return; // leave copy/cut/paste to the clipboard events
      }

      const hasSel = state.selection.length > 0;
      switch (e.key) {
        case 'Delete': case 'Backspace':
          if (hasSel) { e.preventDefault(); ed.deleteSelection(); }
          return;
        case 'Escape':
          closeContextMenu();
          ed.clearSelection();
          return;
        case 'Enter': {
          const p = ed.primaryObject();
          if (p && state.selection.length === 1 && (p.type === 'text' || p.type === 'table' || (p.type === 'shape' && p.shapeType !== 'line'))) {
            e.preventDefault();
            ed.setEditing(p.id);
          } else if (p?.type === 'chart' && state.selection.length === 1) {
            e.preventDefault();
            openDialog('chart');
          }
          return;
        }
        case 't': case 'T':
          e.preventDefault(); addTextBox(); return;
        case 'PageDown': e.preventDefault(); ed.goToSlide(state.slideIndex + 1); return;
        case 'PageUp': e.preventDefault(); ed.goToSlide(state.slideIndex - 1); return;
        case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
          e.preventDefault();
          if (!hasSel) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') ed.goToSlide(state.slideIndex + 1);
            else ed.goToSlide(state.slideIndex - 1);
            return;
          }
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          ed.nudgeSelection(dx, dy);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
