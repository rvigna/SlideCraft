import { IconButton, Slider } from '@carbon/react';
import { FitToScreen, ZoomIn, ZoomOut } from '@carbon/icons-react';
import { setZoom, useEditor } from '../store/editor';

export function StatusBar() {
  const index = useEditor(s => s.slideIndex);
  const total = useEditor(s => s.deck.slides.length);
  const objects = useEditor(s => s.deck.slides[s.slideIndex].objects.length);
  const selected = useEditor(s => s.selection.length);
  const zoom = useEditor(s => s.zoom);
  const theme = useEditor(s => s.deck.themeName);
  return (
    <footer className="sc-status">
      <span>Slide {index + 1} of {total}</span>
      <span>{objects} object{objects !== 1 ? 's' : ''}{selected ? ` · ${selected} selected` : ''}</span>
      <span>Theme: {theme}</span>
      <span className="sc-status-spacer" />
      <div className="sc-zoom">
        <IconButton kind="ghost" size="xs" label="Zoom out" onClick={() => setZoom(zoom - 10)}><ZoomOut /></IconButton>
        <Slider id="sc-zoom" labelText="Zoom" hideLabel hideTextInput min={25} max={200} step={5} value={zoom} onChange={({ value }) => setZoom(value ?? 100)} className="sc-zoom-slider" />
        <IconButton kind="ghost" size="xs" label="Zoom in" onClick={() => setZoom(zoom + 10)}><ZoomIn /></IconButton>
        <span className="sc-zoom-level">{zoom}%</span>
        <IconButton kind="ghost" size="xs" label="Zoom to fit" align="top-end" onClick={() => window.dispatchEvent(new Event('slidecraft:zoom-fit'))}><FitToScreen /></IconButton>
      </div>
    </footer>
  );
}
