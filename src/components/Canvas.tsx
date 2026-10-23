import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { SlideObject } from '../model/types';
import { SLIDE_H, SLIDE_W } from '../model/types';
import { boundsOf, intersects, resizeBox, snapLines, snapMove, type Box, type ResizeHandle } from '../model/geometry';
import { htmlToPlain, sanitizeHtml } from '../model/richtext';
import {
  beginGesture, clearSelection, commitSlide, currentSlide, endGesture, gestureUpdate, select, setEditing,
  setZoom, toggleSelected, useEditor,
} from '../store/editor';
import { ObjectContent, objectBoxStyle, slideBackground, textStyle } from './SlideObjectView';
import { insertImageFiles } from '../io/images';
import { openContextMenu } from './ContextMenu';
import { canvasMenuItems } from './menus';

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const DRAG_THRESHOLD = 3;
const SNAP_PX = 6;

type Gesture =
  | { kind: 'drag'; startX: number; startY: number; starts: Map<number, Box>; moved: boolean; narrowTo: number | null }
  | { kind: 'resize'; handle: ResizeHandle; startX: number; startY: number; start: Box; id: number }
  | { kind: 'rotate'; cx: number; cy: number; startAngle: number; startRotation: number; id: number }
  | { kind: 'marquee'; origin: { x: number; y: number }; base: number[] };

// ---------------------------------------------------------------
// In-place text editing (text boxes keep HTML, shapes keep plain text)
// ---------------------------------------------------------------
function EditableText({ obj }: { obj: Extract<SlideObject, { type: 'text' | 'shape' }> }) {
  const ref = useRef<HTMLDivElement>(null);
  // Captured once so React never rewrites the DOM the user is typing into
  const initialHtml = useMemo(() => (obj.type === 'text' ? obj.text : obj.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')), [obj.id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  const finish = () => {
    const el = ref.current;
    if (!el) return;
    const id = obj.id;
    if (obj.type === 'text') {
      const html = sanitizeHtml(el.innerHTML);
      if (html !== obj.text) commitSlide(slide => { const o = slide.objects.find(x => x.id === id); if (o && o.type === 'text') o.text = html; });
    } else {
      const text = htmlToPlain(el.innerHTML);
      if (text !== obj.text) commitSlide(slide => { const o = slide.objects.find(x => x.id === id); if (o && o.type === 'shape') o.text = text; });
    }
    if (useEditor.getState().editingId === id) setEditing(null);
  };

  // Text boxes: the flex wrapper comes from ObjectContent; shapes need their own centered overlay
  const style = obj.type === 'text'
    ? { outline: 'none', minHeight: '1em' }
    : { ...textStyle(obj), position: 'absolute' as const, inset: 0, display: 'flex', flexDirection: 'column' as const, justifyContent: 'center', padding: 8, whiteSpace: 'pre-wrap' as const, outline: 'none' };

  return (
    <div
      ref={ref}
      className="obj-text editing-surface"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      style={style}
      dangerouslySetInnerHTML={{ __html: initialHtml }}
      onBlur={finish}
      onMouseDown={e => e.stopPropagation()}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); ref.current?.blur(); }
        if (e.key === 'Tab') {
          // Tab / Shift+Tab nest list items; outside lists Tab is swallowed so focus stays put
          e.preventDefault();
          const anchor = window.getSelection()?.anchorNode;
          const inList = !!(anchor instanceof Element ? anchor : anchor?.parentElement)?.closest('li');
          if (inList) document.execCommand(e.shiftKey ? 'outdent' : 'indent');
        }
        e.stopPropagation();
      }}
      onPaste={e => {
        // Keep pasted text plain so foreign styles don't leak in
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
      }}
    />
  );
}

function EditorObject({ obj, selected, showHandles, editing }: { obj: SlideObject; selected: boolean; showHandles: boolean; editing: boolean }) {
  const editable = editing && (obj.type === 'text' || obj.type === 'shape');
  return (
    <div
      className={`slide-object${selected ? ' selected' : ''}${editable ? ' editing' : ''}`}
      data-id={obj.id}
      style={objectBoxStyle(obj)}
    >
      {editable && obj.type === 'shape' ? (
        <>
          <ObjectContent obj={{ ...obj, text: '' }} />
          <EditableText obj={obj} />
        </>
      ) : (
        <ObjectContent obj={obj} textOverride={editable && obj.type === 'text' ? <EditableText obj={obj} /> : undefined} />
      )}
      {showHandles && !editable && (
        <>
          {HANDLES.map(h => <div key={h} className={`resize-handle ${h}`} data-handle={h} />)}
          <div className="rotate-handle" data-rotate />
        </>
      )}
    </div>
  );
}

export function Canvas() {
  const slide = useEditor(s => s.deck.slides[s.slideIndex]);
  const selection = useEditor(s => s.selection);
  const editingId = useEditor(s => s.editingId);
  const zoom = useEditor(s => s.zoom);
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [guides, setGuides] = useState<{ xs: number[]; ys: number[] }>({ xs: [], ys: [] });
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const scale = zoom / 100;
  const selected = useMemo(() => new Set(selection), [selection]);

  // Fit the slide to the editor on first render and whenever the window resizes
  useLayoutEffect(() => {
    const fit = () => {
      const area = areaRef.current;
      if (!area) return;
      const z = Math.min((area.clientWidth - 96) / SLIDE_W, (area.clientHeight - 96) / SLIDE_H, 1.5) * 100;
      setZoom(z);
    };
    fit();
    const onFit = () => fit();
    window.addEventListener('slidecraft:zoom-fit', onFit);
    window.addEventListener('resize', onFit);
    return () => { window.removeEventListener('slidecraft:zoom-fit', onFit); window.removeEventListener('resize', onFit); };
  }, []);

  const toSlide = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };

  // ---- Pointer gestures ----
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const g = gesture.current;
      if (!g) return;
      const state = useEditor.getState();
      const objs = currentSlide(state).objects;

      if (g.kind === 'marquee') {
        const p = toSlide(e.clientX, e.clientY);
        const box = { x: Math.min(p.x, g.origin.x), y: Math.min(p.y, g.origin.y), w: Math.abs(p.x - g.origin.x), h: Math.abs(p.y - g.origin.y) };
        if (box.w < 2 && box.h < 2) return;
        setMarquee(box);
        const hits = objs.filter(o => intersects(o, box)).map(o => o.id);
        const next = [...new Set([...g.base, ...hits])];
        if (next.length !== state.selection.length || next.some(id => !state.selection.includes(id))) select(next);
        return;
      }

      if (g.kind === 'drag') {
        if (!g.moved) {
          if (Math.abs(e.clientX - g.startX) < DRAG_THRESHOLD && Math.abs(e.clientY - g.startY) < DRAG_THRESHOLD) return;
          g.moved = true;
          g.narrowTo = null;
          beginGesture();
        }
        let dx = (e.clientX - g.startX) / scale;
        let dy = (e.clientY - g.startY) / scale;
        const start = boundsOf([...g.starts.values()]);
        let gx: number[] = [], gy: number[] = [];
        if (!e.altKey) {
          // Snap the selection's edges and center to the slide and other objects (Alt disables)
          const lines = snapLines(objs.filter(o => !g.starts.has(o.id)));
          const snap = snapMove({ ...start, x: start.x + dx, y: start.y + dy }, lines, SNAP_PX / scale);
          dx += snap.dx; dy += snap.dy; gx = snap.guidesX; gy = snap.guidesY;
        }
        setGuides({ xs: gx, ys: gy });
        gestureUpdate(s => s.objects.forEach(o => {
          const b = g.starts.get(o.id);
          if (b) { o.x = Math.round(b.x + dx); o.y = Math.round(b.y + dy); }
        }));
        return;
      }

      if (g.kind === 'resize') {
        const dx = (e.clientX - g.startX) / scale;
        const dy = (e.clientY - g.startY) / scale;
        const lines = e.altKey ? undefined : snapLines(objs.filter(o => o.id !== g.id));
        const r = resizeBox(g.start, g.handle, dx, dy, { keepRatio: e.shiftKey, lines, threshold: SNAP_PX / scale });
        setGuides({ xs: r.guidesX, ys: r.guidesY });
        gestureUpdate(s => { const o = s.objects.find(x => x.id === g.id); if (o) Object.assign(o, r.box); });
        return;
      }

      if (g.kind === 'rotate') {
        const angle = Math.atan2(e.clientY - g.cy, e.clientX - g.cx) * 180 / Math.PI + 90;
        let deg = g.startRotation + (angle - g.startAngle);
        if (e.shiftKey) deg = Math.round(deg / 15) * 15; // Shift snaps to 15°
        deg = ((Math.round(deg) % 360) + 360) % 360;
        gestureUpdate(s => { const o = s.objects.find(x => x.id === g.id); if (o) o.rotation = deg; });
      }
    };

    const onUp = () => {
      const g = gesture.current;
      if (!g) return;
      if (g.kind === 'drag') {
        if (g.moved) endGesture();
        else if (g.narrowTo != null) select([g.narrowTo]);
      } else if (g.kind === 'resize' || g.kind === 'rotate') {
        endGesture();
      }
      gesture.current = null;
      setMarquee(null);
      setGuides({ xs: [], ys: [] });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  });

  const onMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const state = useEditor.getState();
    const objEl = target.closest<HTMLElement>('.slide-object');
    const id = objEl ? Number(objEl.dataset.id) : null;
    const obj = id != null ? currentSlide(state).objects.find(o => o.id === id) : undefined;

    if (state.editingId != null && state.editingId !== id) (document.activeElement as HTMLElement | null)?.blur();

    const handle = target.closest<HTMLElement>('[data-handle]')?.dataset.handle as ResizeHandle | undefined;
    if (handle && obj) {
      e.preventDefault();
      beginGesture();
      gesture.current = { kind: 'resize', handle, startX: e.clientX, startY: e.clientY, start: { x: obj.x, y: obj.y, w: obj.w, h: obj.h }, id: obj.id };
      return;
    }
    if (target.closest('[data-rotate]') && obj) {
      e.preventDefault();
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = rect.left + (obj.x + obj.w / 2) * scale;
      const cy = rect.top + (obj.y + obj.h / 2) * scale;
      beginGesture();
      gesture.current = { kind: 'rotate', cx, cy, startAngle: Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI + 90, startRotation: obj.rotation, id: obj.id };
      return;
    }

    if (obj) {
      if (state.editingId === obj.id) return; // clicks inside the text being edited
      e.preventDefault();
      let narrowTo: number | null = null;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        toggleSelected(obj.id);
        if (!useEditor.getState().selection.includes(obj.id)) return; // just deselected
      } else if (!state.selection.includes(obj.id)) {
        select([obj.id]);
      } else if (state.selection.length > 1) {
        // A click without dragging inside a group narrows the selection to this object
        select(state.selection, obj.id);
        narrowTo = obj.id;
      }
      const sel = new Set(useEditor.getState().selection);
      const starts = new Map(currentSlide().objects.filter(o => sel.has(o.id)).map(o => [o.id, { x: o.x, y: o.y, w: o.w, h: o.h }]));
      gesture.current = { kind: 'drag', startX: e.clientX, startY: e.clientY, starts, moved: false, narrowTo };
      return;
    }

    // Empty space: marquee selection (Shift extends the current selection)
    e.preventDefault();
    const base = e.shiftKey ? state.selection : [];
    if (!e.shiftKey) clearSelection();
    gesture.current = { kind: 'marquee', origin: toSlide(e.clientX, e.clientY), base };
  };

  const onDoubleClick = (e: ReactMouseEvent) => {
    gesture.current = null;
    const objEl = (e.target as HTMLElement).closest<HTMLElement>('.slide-object');
    if (!objEl) return;
    const obj = currentSlide().objects.find(o => o.id === Number(objEl.dataset.id));
    if (!obj) return;
    if (obj.type === 'text' || (obj.type === 'shape' && obj.shapeType !== 'line')) {
      select([obj.id]);
      setEditing(obj.id);
    } else if (obj.type === 'image') {
      window.dispatchEvent(new CustomEvent('slidecraft:replace-image', { detail: obj.id }));
    }
  };

  const onContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    const objEl = (e.target as HTMLElement).closest<HTMLElement>('.slide-object');
    const state = useEditor.getState();
    if (objEl) {
      const id = Number(objEl.dataset.id);
      if (!state.selection.includes(id)) select([id]);
    } else {
      clearSelection();
    }
    openContextMenu(e.clientX, e.clientY, canvasMenuItems(!!objEl));
  };

  const single = selection.length === 1;

  return (
    <div
      ref={areaRef}
      className={`editor-area${dropActive ? ' drop-target' : ''}`}
      onMouseDown={onMouseDown}
      onDragOver={e => {
        if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDropActive(true); }
      }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false); }}
      onDrop={e => {
        setDropActive(false);
        const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
        if (!files.length) return;
        e.preventDefault();
        insertImageFiles(files, toSlide(e.clientX, e.clientY));
      }}
    >
      <div className="canvas-sizer" style={{ width: SLIDE_W * scale, height: SLIDE_H * scale }}>
        <div className="canvas-scaler" style={{ transform: `scale(${scale})` }}>
          <div
            ref={canvasRef}
            id="slide-canvas"
            className={`slide-canvas${selection.length > 1 ? ' multi-select' : ''}`}
            style={{ background: slideBackground(slide) }}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            data-testid="slide-canvas"
          >
            {slide.objects.map(o => (
              <EditorObject key={o.id} obj={o} selected={selected.has(o.id)} showHandles={single && selected.has(o.id)} editing={editingId === o.id} />
            ))}
          </div>
          <div className="guide-layer" style={{ '--zoom': scale } as React.CSSProperties}>
            {guides.xs.map((x, i) => <div key={`x${i}`} className="guide-line vertical" style={{ left: x }} />)}
            {guides.ys.map((y, i) => <div key={`y${i}`} className="guide-line horizontal" style={{ top: y }} />)}
            {marquee && <div className="selection-box" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
          </div>
        </div>
      </div>
    </div>
  );
}
