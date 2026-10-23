import { useEffect } from 'react';
import { useEditor } from '../store/editor';
import { useUi } from '../store/ui';
import { lintDeck } from '../model/lint';
import { lintContext } from '../components/lintActions';

/** Re-run the design checks shortly after every change */
export function useLint() {
  useEffect(() => {
    let timer: number | undefined;
    const run = () => useUi.setState({ issues: lintDeck(useEditor.getState().deck, lintContext()) });
    // Fonts change text metrics; wait for them before the first pass
    void document.fonts?.ready.then(run);
    run();
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.deck === prev.deck) return;
      clearTimeout(timer);
      timer = window.setTimeout(run, 400);
    });
    return () => { unsub(); clearTimeout(timer); };
  }, []);
}
