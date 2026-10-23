import { useEffect } from 'react';
import { useEditor } from '../store/editor';
import { isRestoreSettled, saveOnExit, saveToBrowser } from '../io/files';

const AUTO_SAVE_DELAY = 1200;

/** Debounced auto-save, plus a final save when the tab is hidden or closed */
export function usePersistence() {
  useEffect(() => {
    let timer: number | undefined;
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.deck === prev.deck || !s.dirty) return;
      clearTimeout(timer);
      const save = () => { if (isRestoreSettled()) void saveToBrowser(); else timer = window.setTimeout(save, AUTO_SAVE_DELAY); };
      timer = window.setTimeout(save, AUTO_SAVE_DELAY);
    });
    // "hidden" fires reliably on mobile and before unload; IndexedDB writes started there complete
    const onHide = () => { if (document.visibilityState === 'hidden' && useEditor.getState().dirty && isRestoreSettled()) void saveToBrowser(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', saveOnExit);
    return () => { unsub(); clearTimeout(timer); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('beforeunload', saveOnExit); };
  }, []);
}
