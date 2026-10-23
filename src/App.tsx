import { lazy, Suspense, useEffect, useState } from 'react';
import { Theme } from '@carbon/react';
import { DocumentImport } from '@carbon/icons-react';
import { AppHeader } from './components/AppHeader';
import { Toolbar } from './components/Toolbar';
import { SlidePanel } from './components/SlidePanel';
import { Canvas } from './components/Canvas';
import { PropertiesPanel } from './components/PropertiesPanel';
import { StatusBar } from './components/StatusBar';
import { ContextMenuHost } from './components/ContextMenu';
import { Toasts } from './components/Toasts';
import { useShortcuts } from './hooks/useShortcuts';
import { useClipboard } from './hooks/useClipboard';
import { usePersistence } from './hooks/usePersistence';
import { commitSlide } from './store/editor';
import { openAnyFile } from './io/files';
import { pickFile, readFileAsDataURL } from './io/images';
import { DesignCheckPanel } from './components/DesignCheckPanel';
import { useLint } from './hooks/useLint';
import { useUi } from './store/ui';
import { useEditor } from './store/editor';

// Loaded on first use: the AI SDK, dialogs, slideshow and print view stay out of the startup bundle
const AssistantPanel = lazy(() => import('./components/AssistantPanel').then(m => ({ default: m.AssistantPanel })));
const Dialogs = lazy(() => import('./components/dialogs/Dialogs').then(m => ({ default: m.Dialogs })));
const Presentation = lazy(() => import('./components/Presentation').then(m => ({ default: m.Presentation })));
const PrintView = lazy(() => import('./components/PrintView').then(m => ({ default: m.PrintView })));

function LazyDialogs() {
  const dialog = useUi(s => s.dialog);
  return dialog ? <Suspense fallback={null}><Dialogs /></Suspense> : null;
}

function LazyPresentation() {
  const presenting = useEditor(s => !!s.presentation);
  return presenting ? <Suspense fallback={null}><Presentation /></Suspense> : null;
}

function LazyPrintView() {
  // PrintView listens for beforeprint itself, so load it once the page is idle
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    idle(() => setReady(true));
  }, []);
  return ready ? <Suspense fallback={null}><PrintView /></Suspense> : null;
}

/** Dropping a .pptx/.json anywhere opens it; image drops are handled by the canvas */
function useFileDrop() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const isDeckFile = (e: DragEvent) => [...(e.dataTransfer?.items ?? [])].some(i => i.kind === 'file' && !i.type.startsWith('image/'));
    const over = (e: DragEvent) => { if (isDeckFile(e)) { e.preventDefault(); setActive(true); } };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setActive(false); };
    const drop = (e: DragEvent) => {
      setActive(false);
      const file = [...(e.dataTransfer?.files ?? [])].find(f => /\.(pptx|json|md|markdown)$/i.test(f.name));
      if (!file) return;
      e.preventDefault();
      void openAnyFile(file);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); };
  }, []);
  return active;
}

function useReplaceImage() {
  useEffect(() => {
    const on = async (e: Event) => {
      const id = (e as CustomEvent<number>).detail;
      const file = await pickFile('image/*');
      if (!file) return;
      const src = await readFileAsDataURL(file);
      commitSlide(slide => { const o = slide.objects.find(x => x.id === id); if (o?.type === 'image') o.src = src; });
    };
    window.addEventListener('slidecraft:replace-image', on);
    return () => window.removeEventListener('slidecraft:replace-image', on);
  }, []);
}

function RightPanel() {
  const panel = useUi(s => s.panel);
  if (panel === 'check') return <DesignCheckPanel />;
  if (panel === 'assistant') return <Suspense fallback={<aside className="sc-properties sc-ai" />}><AssistantPanel /></Suspense>;
  if (panel === 'properties') return <PropertiesPanel />;
  return null;
}

export default function App() {
  useLint();
  useShortcuts();
  useClipboard();
  usePersistence();
  useReplaceImage();
  const dropping = useFileDrop();
  const showSlides = useUi(s => s.showSlides);

  return (
    <div className="sc-app">
      <Theme theme="g100"><AppHeader /></Theme>
      <Theme theme="white" className="sc-body">
        <Toolbar />
        <div className="sc-main">
          {showSlides && <SlidePanel />}
          <Canvas />
          <RightPanel />
        </div>
        <StatusBar />
        <LazyDialogs />
        <ContextMenuHost />
        <Toasts />
        {dropping && (
          <div className="sc-file-drop"><DocumentImport size={48} /><p>Drop a PowerPoint (.pptx), Markdown (.md) or SlideCraft JSON file to open it</p></div>
        )}
      </Theme>
      <LazyPresentation />
      <LazyPrintView />
    </div>
  );
}
