import { memo, useEffect, useRef, useState } from 'react';
import { Button } from '@carbon/react';
import { Add, Notebook } from '@carbon/icons-react';
import type { Slide } from '../model/types';
import { addSlide, goToSlide, moveSlide, useEditor } from '../store/editor';
import { SlideStage } from './SlideObjectView';
import { openContextMenu } from './ContextMenu';
import { slideItems } from './menus';

const THUMB_W = 176;

const Thumb = memo(function Thumb({ slide, index, active, dropSide, onDragStart, onDragOver, onDrop, onDragEnd }: {
  slide: Slide; index: number; active: boolean; dropSide: 'before' | 'after' | null;
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
        <SlideStage slide={slide} width={THUMB_W} />
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

  return (
    <nav className="sc-slide-panel" aria-label="Slides">
      <div className="sc-slide-list">
        {slides.map((slide, i) => (
          <Thumb
            key={slide.id}
            slide={slide}
            index={i}
            active={i === current}
            dropSide={dragFrom != null && drop?.index === i ? drop.side : null}
            onDragStart={setDragFrom}
            onDragOver={(index, side) => { if (dragFrom != null) setDrop({ index, side }); }}
            onDrop={(index, side) => { if (dragFrom != null) moveSlide(dragFrom, side === 'after' ? index + 1 : index); setDragFrom(null); setDrop(null); }}
            onDragEnd={() => { setDragFrom(null); setDrop(null); }}
          />
        ))}
      </div>
      <Button kind="tertiary" size="sm" renderIcon={Add} className="sc-add-slide" onClick={() => addSlide()}>New slide</Button>
    </nav>
  );
}
