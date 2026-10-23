import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@carbon/react';
import { Add, Notebook } from '@carbon/icons-react';
import type { Slide } from '../model/types';
import { addSlide, goToSlide, moveSlide, useEditor } from '../store/editor';
import { SlideStage } from './SlideObjectView';
import { openContextMenu } from './ContextMenu';
import { slideItems } from './menus';

const THUMB_W = 176;
const THUMB_W_COMPACT = 128;

/** Narrower thumbnails on small screens leave more room for the slide */
function useCompact() {
  const [compact, setCompact] = useState(() => window.innerWidth < 1280);
  useEffect(() => {
    const on = () => setCompact(window.innerWidth < 1280);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return compact;
}

const Thumb = memo(function Thumb({ slide, index, active, dropSide, width, onDragStart, onDragOver, onDrop, onDragEnd }: {
  slide: Slide; index: number; active: boolean; dropSide: 'before' | 'after' | null; width: number;
  onDragStart: (i: number) => void; onDragOver: (i: number, side: 'before' | 'after') => void;
  onDrop: (i: number, side: 'before' | 'after') => void; onDragEnd: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (active) ref.current?.scrollIntoView({ block: 'nearest' }); }, [active]);
  const side = (e: React.DragEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY > r.top + r.height / 2 ? 'after' : 'before';
  };
  return (
    <button
      ref={ref}
      className={`sc-thumb${active ? ' is-active' : ''}${dropSide ? ` drop-${dropSide}` : ''}`}
      aria-label={`Slide ${index + 1}`}
      aria-current={active ? 'true' : undefined}
      draggable
      onClick={() => goToSlide(index)}
      onContextMenu={e => { e.preventDefault(); goToSlide(index); openContextMenu(e.clientX, e.clientY, slideItems(index), 'Slide'); }}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-slidecraft-slide', String(index)); onDragStart(index); }}
      onDragOver={e => { e.preventDefault(); onDragOver(index, side(e)); }}
      onDrop={e => { e.preventDefault(); onDrop(index, side(e)); }}
      onDragEnd={onDragEnd}
    >
      <span className="sc-thumb-num">{index + 1}</span>
      <span className="sc-thumb-frame">
        <SlideStage slide={slide} width={width} />
      </span>
      {slide.notes.trim() && <Notebook className="sc-thumb-notes" size={12} aria-label="Has speaker notes" />}
    </button>
  );
});

export function SlidePanel() {
  const slides = useEditor(s => s.deck.slides);
  const current = useEditor(s => s.slideIndex);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ index: number; side: 'before' | 'after' } | null>(null);
  const compact = useCompact();
  const width = compact ? THUMB_W_COMPACT : THUMB_W;
  // Stable handlers keep memoized thumbnails from re-rendering on every edit
  const dragRef = useRef<number | null>(null);
  dragRef.current = dragFrom;
  const onDragOver = useCallback((index: number, side: 'before' | 'after') => {
    if (dragRef.current != null) setDrop(d => (d?.index === index && d.side === side ? d : { index, side }));
  }, []);
  const onDrop = useCallback((index: number, side: 'before' | 'after') => {
    if (dragRef.current != null) moveSlide(dragRef.current, side === 'after' ? index + 1 : index);
    setDragFrom(null);
    setDrop(null);
  }, []);
  const onDragEnd = useCallback(() => { setDragFrom(null); setDrop(null); }, []);

  return (
    <nav className={`sc-slide-panel${compact ? ' is-compact' : ''}`} aria-label="Slides">
      <div className="sc-slide-list">
        {slides.map((slide, i) => (
          <Thumb
            key={slide.id}
            slide={slide}
            index={i}
            active={i === current}
            width={width}
            dropSide={dragFrom != null && drop?.index === i ? drop.side : null}
            onDragStart={setDragFrom}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
      <Button kind="tertiary" size="sm" renderIcon={Add} className="sc-add-slide" onClick={() => addSlide()}>New slide</Button>
    </nav>
  );
}
