import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Close, Maximize, Reset } from '@carbon/icons-react';
import { exitPresentation, setPresentationIndex, toast, useEditor } from '../store/editor';
import { SlideStage } from './SlideObjectView';

function useWindowSize(win: Window | null = window) {
  const [size, setSize] = useState(() => ({ w: win?.innerWidth ?? 1280, h: win?.innerHeight ?? 720 }));
  useEffect(() => {
    if (!win) return;
    const on = () => setSize({ w: win.innerWidth, h: win.innerHeight });
    on();
    win.addEventListener('resize', on);
    return () => win.removeEventListener('resize', on);
  }, [win]);
  return size;
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Copy the app's stylesheets into another window so Carbon and slide styles apply there */
function cloneStyles(target: Document) {
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
    const copy = node.cloneNode(true) as HTMLElement;
    if (copy instanceof HTMLLinkElement) copy.href = (node as HTMLLinkElement).href;
    target.head.appendChild(copy);
  });
}

function PresenterWindow({ win, index, onNav, onExit, startedAt, onResetTimer }: {
  win: Window; index: number; onNav: (i: number) => void; onExit: () => void; startedAt: number; onResetTimer: () => void;
}) {
  const slides = useEditor(s => s.deck.slides);
  const title = useEditor(s => s.deck.title);
  const [now, setNow] = useState(Date.now());
  const { w, h } = useWindowSize(win);
  useEffect(() => { const t = win.setInterval(() => setNow(Date.now()), 500); return () => win.clearInterval(t); }, [win]);
  useEffect(() => { win.document.title = `Presenter — ${title}`; }, [win, title]);

  const current = slides[index];
  const next = slides[index + 1];
  const mainW = Math.max(240, Math.min(w * 0.62 - 48, (h - 220) * 16 / 9));
  const sideW = Math.max(160, Math.min(w - mainW - 96, 420));

  return (
    <div className="sc-presenter">
      <header className="sc-presenter-bar">
        <span className="sc-presenter-timer" aria-label="Elapsed time">{formatTime(now - startedAt)}</span>
        <button className="sc-presenter-btn" onClick={onResetTimer} title="Restart timer"><Reset size={16} /> Restart</button>
        <span className="sc-presenter-clock">{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <span className="sc-presenter-spacer" />
        <span className="sc-presenter-count">Slide {index + 1} of {slides.length}</span>
        <button className="sc-presenter-btn" onClick={() => onNav(index - 1)} disabled={index === 0}><ChevronLeft size={16} /> Previous</button>
        <button className="sc-presenter-btn is-primary" onClick={() => onNav(index + 1)} disabled={index >= slides.length - 1}>Next <ChevronRight size={16} /></button>
        <button className="sc-presenter-btn" onClick={onExit}><Close size={16} /> End show</button>
      </header>
      <main className="sc-presenter-main">
        <section>
          <h3>Current</h3>
          {current && <SlideStage slide={current} width={mainW} className="sc-presenter-slide" />}
        </section>
        <section className="sc-presenter-side" style={{ width: sideW }}>
          <h3>Next</h3>
          {next ? <SlideStage slide={next} width={sideW} className="sc-presenter-slide" /> : <div className="sc-presenter-end" style={{ width: sideW, height: sideW * 9 / 16 }}>End of presentation</div>}
          <h3>Notes</h3>
          <div className="sc-presenter-notes">{current?.notes?.trim() || <em>No speaker notes for this slide.</em>}</div>
        </section>
      </main>
    </div>
  );
}

export function Presentation() {
  const presentation = useEditor(s => s.presentation);
  if (!presentation) return null;
  return <PresentationView presenter={presentation.presenter} />;
}

function PresentationView({ presenter }: { presenter: boolean }) {
  const index = useEditor(s => s.presentation?.index ?? 0);
  const slides = useEditor(s => s.deck.slides);
  const { w, h } = useWindowSize();
  const [blank, setBlank] = useState<null | 'black' | 'white'>(null);
  const [idle, setIdle] = useState(false);
  const [popup, setPopup] = useState<Window | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  // Presenter mode: the browser won't stay full screen while the notes window opens,
  // so the audience window asks for one click (move it to the projector first)
  const [askFullscreen, setAskFullscreen] = useState(presenter);
  const jump = useRef('');
  const rootRef = useRef<HTMLDivElement>(null);
  const enteredFullscreen = useRef(false);
  const slide = slides[Math.min(index, slides.length - 1)];

  const go = useCallback((i: number) => { setBlank(null); setPresentationIndex(i); }, []);
  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    exitPresentation();
  }, []);

  // Full screen on entry; leaving full screen (Esc) ends the show.
  // Presenter mode skips this: opening the presenter window would knock the browser out of
  // full screen, so the audience window gets a full-screen button instead.
  useEffect(() => {
    rootRef.current?.focus();
    if (presenter) return;
    document.documentElement.requestFullscreen?.().then(() => { enteredFullscreen.current = true; }).catch(() => {});
    const onFs = () => { if (!document.fullscreenElement && enteredFullscreen.current) exitPresentation(); };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [presenter]);

  // Presenter view lives in its own window, rendered through a portal
  useEffect(() => {
    if (!presenter) return;
    const win = window.open('', 'slidecraft-presenter', 'width=1200,height=760');
    if (!win) {
      toast('warning', 'Presenter view was blocked', 'Allow pop-ups for this site to see notes, timer and next slide.');
      return;
    }
    win.document.body.innerHTML = '';
    win.document.head.innerHTML = '<meta charset="utf-8">';
    cloneStyles(win.document);
    win.document.body.className = 'sc-presenter-body';
    setPopup(win);
    const onUnload = () => setPopup(null);
    win.addEventListener('beforeunload', onUnload);
    return () => { win.removeEventListener('beforeunload', onUnload); win.close(); };
  }, [presenter]);

  const onKey = useCallback((e: KeyboardEvent) => {
    const st = useEditor.getState();
    const i = st.presentation?.index ?? 0;
    const n = st.deck.slides.length;
    if (/^\d$/.test(e.key)) { jump.current += e.key; return; }
    if (e.key === 'Enter' && jump.current) { go(Math.min(n, parseInt(jump.current)) - 1); jump.current = ''; e.preventDefault(); return; }
    jump.current = '';
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter': case 'n':
        e.preventDefault(); if (i < n - 1) go(i + 1); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': case 'p':
        e.preventDefault(); if (i > 0) go(i - 1); break;
      case 'Home': go(0); break;
      case 'End': go(n - 1); break;
      case 'b': case 'B': case '.': setBlank(b => (b === 'black' ? null : 'black')); break;
      case 'w': case 'W': case ',': setBlank(b => (b === 'white' ? null : 'white')); break;
      case 'Escape': e.preventDefault(); exit(); break;
    }
  }, [exit, go]);

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    popup?.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); popup?.removeEventListener('keydown', onKey); };
  }, [onKey, popup]);

  // Hide the cursor and controls after a moment of stillness
  useEffect(() => {
    let t = window.setTimeout(() => setIdle(true), 2000);
    const on = () => { setIdle(false); clearTimeout(t); t = window.setTimeout(() => setIdle(true), 2000); };
    window.addEventListener('mousemove', on);
    return () => { clearTimeout(t); window.removeEventListener('mousemove', on); };
  }, []);

  const scale = Math.min(w / 960, h / 540);
  const transition = slide.transition !== 'none' ? `sc-trans-${slide.transition}` : '';

  return createPortal(
    <div
      ref={rootRef}
      className={`sc-show${idle ? ' is-idle' : ''}`}
      tabIndex={-1}
      role="presentation"
      onClick={e => {
        if (askFullscreen) {
          setAskFullscreen(false);
          document.documentElement.requestFullscreen?.().catch(() => {});
          return;
        }
        if (!(e.target as HTMLElement).closest('.sc-show-controls')) go(Math.min(slides.length - 1, index + 1));
      }}
      onContextMenu={e => { e.preventDefault(); go(Math.max(0, index - 1)); }}
    >
      <div key={`${slide.id}-${index}`} className={`sc-show-slide ${transition}`} style={{ width: 960 * scale, height: 540 * scale, animationDuration: `${slide.transitionDuration}s` }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }}><SlideStage slide={slide} /></div>
      </div>
      {blank && <div className={`sc-show-blank is-${blank}`} />}
      {askFullscreen && (
        <div className="sc-show-fsprompt" role="button">
          <Maximize size={32} />
          <strong>Click to go full screen</strong>
          <span>Move this window to the projector or second display first. Your notes and timer are in the presenter window.</span>
        </div>
      )}
      <div className="sc-show-progress" style={{ width: `${((index + 1) / slides.length) * 100}%` }} />
      <div className="sc-show-controls">
        <button aria-label="Previous slide" onClick={() => go(Math.max(0, index - 1))}><ChevronLeft size={20} /></button>
        <span>{index + 1} / {slides.length}</span>
        <button aria-label="Next slide" onClick={() => go(Math.min(slides.length - 1, index + 1))}><ChevronRight size={20} /></button>
        <button aria-label="Toggle full screen" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}><Maximize size={20} /></button>
        <button aria-label="End presentation" onClick={exit}><Close size={20} /></button>
      </div>
      {popup && createPortal(
        <PresenterWindow win={popup} index={index} onNav={i => go(Math.max(0, Math.min(slides.length - 1, i)))} onExit={exit} startedAt={startedAt} onResetTimer={() => setStartedAt(Date.now())} />,
        popup.document.body,
      )}
    </div>,
    document.body,
  );
}
