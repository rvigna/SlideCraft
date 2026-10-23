import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useEditor } from '../store/editor';
import { useUi } from '../store/ui';
import { SlideStage } from './SlideObjectView';

/** Every slide, one per page, rendered only while printing (File › Print / Save as PDF) */
export function PrintView() {
  const printing = useUi(s => s.printing);
  const slides = useEditor(s => s.deck.slides);

  useEffect(() => {
    const before = () => useUi.setState({ printing: true });
    const after = () => useUi.setState({ printing: false });
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);

  if (!printing) return null;
  return createPortal(
    <div className="sc-print-root" aria-hidden>
      {slides.map(s => <div key={s.id} className="sc-print-page"><SlideStage slide={s} /></div>)}
    </div>,
    document.body,
  );
}
