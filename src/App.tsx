import { useEffect, useState } from 'react';
import { Theme } from '@carbon/react';
import { DocumentImport } from '@carbon/icons-react';
import { AppHeader } from './components/AppHeader';
import { Toolbar } from './components/Toolbar';
import { SlidePanel } from './components/SlidePanel';
import { Canvas } from './components/Canvas';
import { PropertiesPanel } from './components/PropertiesPanel';
import { StatusBar } from './components/StatusBar';
import { ContextMenuHost } from './components/ContextMenu';
import { Dialogs } from './components/dialogs/Dialogs';
import { Presentation } from './components/Presentation';
import { PrintView } from './components/PrintView';
import { Toasts } from './components/Toasts';
import { useShortcuts } from './hooks/useShortcuts';
import { useClipboard } from './hooks/useClipboard';
import { usePersistence } from './hooks/usePersistence';
import { commitSlide } from './store/editor';
import { openAnyFile } from './io/files';
import { pickFile, readFileAsDataURL } from './io/images';
import { DesignCheckPanel } from './components/DesignCheckPanel';
import { AssistantPanel } from './components/AssistantPanel';
import { useLint } from './hooks/useLint';
import { useUi } from './store/ui';

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
  if (panel === 'assistant') return <AssistantPanel />;
  return <PropertiesPanel />;
}

export default function App() {
  useLint();
  useShortcuts();
  useClipboard();
  usePersistence();
  useReplaceImage();
  const dropping = useFileDrop();

  return (
    <div className="sc-app">
      <Theme theme="g100"><AppHeader /></Theme>
      <Theme theme="white" className="sc-body">
        <Toolbar />
        <div className="sc-main">
          <SlidePanel />
          <Canvas />
          <RightPanel />
        </div>
        <StatusBar />
        <Dialogs />
        <ContextMenuHost />
        <Toasts />
        {dropping && (
          <div className="sc-file-drop"><DocumentImport size={48} /><p>Drop a PowerPoint (.pptx), Markdown (.md) or SlideCraft JSON file to open it</p></div>
        )}
      </Theme>
      <Presentation />
      <PrintView />
    </div>
  );
}
