import { useEffect } from 'react';
import { useEditor } from '../store/editor';
import { saveToBrowser } from '../io/files';

const AUTO_SAVE_DELAY = 1200;

/** Debounced auto-save to localStorage, plus a final save when the tab closes */
export function usePersistence() {
  useEffect(() => {
    let timer: number | undefined;
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.deck === prev.deck || !s.dirty) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => saveToBrowser(), AUTO_SAVE_DELAY);
    });
    const onUnload = () => { if (useEditor.getState().dirty) saveToBrowser(); };
    window.addEventListener('beforeunload', onUnload);
    return () => { unsub(); clearTimeout(timer); window.removeEventListener('beforeunload', onUnload); };
  }, []);
}
