import { useEffect, useRef, useState } from 'react';
import { Button, Header, HeaderGlobalBar, HeaderName, IconButton, InlineLoading } from '@carbon/react';
import { CheckmarkOutline, Play, Screen, WarningAlt } from '@carbon/icons-react';
import { setTitle, startPresentation, useEditor } from '../store/editor';
import { useUi } from '../store/ui';
import { menubar, ALT } from './menus';
import { closeContextMenu, openContextMenu } from './ContextMenu';

function SaveStatus() {
  const dirty = useEditor(s => s.dirty);
  const savedAt = useEditor(s => s.savedAt);
  const error = useEditor(s => s.saveError);
  const busy = useUi(s => s.busy);
  if (busy) return <InlineLoading className="sc-save-status" description={`${busy}…`} />;
  if (error) return <span className="sc-save-status is-error"><WarningAlt size={16} /> {error}</span>;
  if (dirty) return <span className="sc-save-status">Unsaved changes</span>;
  if (savedAt) return <span className="sc-save-status"><CheckmarkOutline size={16} /> Saved</span>;
  return null;
}

function TitleInput() {
  const title = useEditor(s => s.deck.title);
  const [value, setValue] = useState(title);
  useEffect(() => setValue(title), [title]);
  return (
    <input
      className="sc-doc-title"
      aria-label="Presentation title"
      value={value}
      spellCheck={false}
      onChange={e => setValue(e.target.value)}
      onBlur={() => { const v = value.trim() || 'Untitled Presentation'; setValue(v); if (v !== title) setTitle(v); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

export function AppHeader() {
  const menus = menubar();
  const openMenu = useUi(s => s.menu?.label);
  const barRef = useRef<HTMLDivElement>(null);

  const show = (id: string, el: HTMLElement) => {
    const menu = menus.find(m => m.id === id)!;
    const rect = el.getBoundingClientRect();
    openContextMenu(rect.left, rect.bottom, menu.items(), menu.label);
  };

  return (
    <Header aria-label="SlideCraft" className="sc-header">
      <HeaderName prefix="" href="#" onClick={e => e.preventDefault()}>
        <span className="sc-logo" aria-hidden>▣</span> SlideCraft
      </HeaderName>
      <div className="sc-menubar" role="menubar" ref={barRef}>
        {menus.map(m => (
          <button
            key={m.id}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={openMenu === m.label}
            className={`sc-menubar-item${openMenu === m.label ? ' is-open' : ''}`}
            onMouseDown={e => e.preventDefault()}
            onClick={e => (openMenu === m.label ? closeContextMenu() : show(m.id, e.currentTarget))}
            onMouseEnter={e => { if (openMenu && openMenu !== m.label && menus.some(x => x.label === openMenu)) show(m.id, e.currentTarget); }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="sc-title-wrap"><TitleInput /></div>
      <HeaderGlobalBar>
        <SaveStatus />
        <IconButton kind="ghost" size="lg" label={`Presenter view (${ALT}F5)`} align="bottom-end" onClick={() => startPresentation(undefined, true)}>
          <Screen />
        </IconButton>
        <Button kind="primary" size="lg" renderIcon={Play} className="sc-present-btn" onClick={() => startPresentation()}>
          Present
        </Button>
      </HeaderGlobalBar>
    </Header>
  );
}
