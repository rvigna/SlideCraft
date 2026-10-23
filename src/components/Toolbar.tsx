import { useEffect, useMemo, useState } from 'react';
import { IconButton, Popover, PopoverContent, Search, Select, SelectItem } from '@carbon/react';
import {
  AlignBoxMiddleCenter, BringToFront, ColorPalette, ColorSwitch, Image, Idea, ListBulleted, ListNumbered, PaintBrush,
  Redo, SendToBack, Shapes, Subtract, Add, TextAlignCenter, TextAlignLeft, TextAlignRight, TextBold, TextColor,
  TextFont, TextItalic, TextStrikethrough, TextUnderline, Template, TrashCan, Undo, BorderFull, DataTable, ChartColumn, TaskView, MagicWand,
} from '@carbon/icons-react';
import { insertChart, insertTable } from './objectOps';
import type { ShapeType } from '../model/types';
import { isTextual } from '../model/types';
import { createShapeObject, createIconObject, createTextObject } from '../model/factory';
import { ICON_NAMES, ICONS, iconLabel } from '../model/icons';
import * as ed from '../store/editor';
import { openDialog, setPanel, useUi } from '../store/ui';
import { formatSelection, isFormatActive, styleSelection, toggleFormat, toggleList, type FormatToggle } from './formatting';
import { ColorButton, NumField } from './fields';
import { SHAPE_POLYGONS } from './SlideObjectView';
import { openContextMenu } from './ContextMenu';
import { arrangeItems, MOD } from './menus';

export const FONTS = [
  'IBM Plex Sans', 'IBM Plex Serif', 'IBM Plex Mono', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
  'Poppins', 'Playfair Display', 'Source Code Pro', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
  'Verdana', 'Courier New', 'Calibri', 'Cambria', 'Aptos',
];

const SHAPES: { type: ShapeType; label: string }[] = [
  { type: 'rect', label: 'Rectangle' }, { type: 'rounded-rect', label: 'Rounded rectangle' },
  { type: 'circle', label: 'Circle' }, { type: 'ellipse', label: 'Ellipse' }, { type: 'triangle', label: 'Triangle' },
  { type: 'diamond', label: 'Diamond' }, { type: 'star', label: 'Star' }, { type: 'hexagon', label: 'Hexagon' },
  { type: 'arrow-right', label: 'Arrow right' }, { type: 'arrow-left', label: 'Arrow left' }, { type: 'line', label: 'Line' },
];

function ShapeIcon({ type }: { type: ShapeType }) {
  const poly = SHAPE_POLYGONS[type];
  return (
    <svg viewBox="0 0 100 100" width="24" height="24" aria-hidden>
      {type === 'rect' && <rect x="8" y="20" width="84" height="60" />}
      {type === 'rounded-rect' && <rect x="8" y="20" width="84" height="60" rx="14" />}
      {type === 'circle' && <circle cx="50" cy="50" r="40" />}
      {type === 'ellipse' && <ellipse cx="50" cy="50" rx="44" ry="28" />}
      {type === 'line' && <line x1="6" y1="50" x2="94" y2="50" strokeWidth="10" stroke="currentColor" />}
      {poly && <polygon points={poly.points} transform={poly.viewBox === '0 0 100 60' ? 'translate(0 20)' : undefined} />}
    </svg>
  );
}

export function addTextBox() {
  const [id] = ed.addObjects((ids, t) => [createTextObject(ids, {
    x: 240, y: 220, w: 480, h: 70, text: 'Text', fontFamily: t.bodyFont, color: t.body,
  })]);
  ed.setEditing(id);
}

function InsertPicker({ kind, open, setOpen }: { kind: 'shape' | 'icon'; open: boolean; setOpen: (v: boolean) => void }) {
  const [query, setQuery] = useState('');
  const icons = useMemo(() => ICON_NAMES.filter(n => iconLabel(n).includes(query.toLowerCase())), [query]);
  return (
    <Popover open={open} onRequestClose={() => setOpen(false)} align="bottom-start" isTabTip={false} dropShadow autoAlign>
      {kind === 'shape' ? (
        <IconButton kind="ghost" size="sm" label="Insert shape" isSelected={open} onClick={() => setOpen(!open)}><Shapes /></IconButton>
      ) : (
        <IconButton kind="ghost" size="sm" label="Insert icon" isSelected={open} onClick={() => setOpen(!open)}><Idea /></IconButton>
      )}
      <PopoverContent className="sc-picker">
        {kind === 'shape' ? (
          <div className="sc-picker-grid shapes" role="listbox" aria-label="Shapes">
            {SHAPES.map(s => (
              <button key={s.type} className="sc-picker-item" title={s.label} aria-label={s.label} onClick={() => {
                ed.addObjects((ids, t) => [createShapeObject(ids, s.type, { backgroundColor: t.accent, borderColor: t.accent, fontFamily: t.bodyFont })]);
                setOpen(false);
              }}>
                <ShapeIcon type={s.type} />
              </button>
            ))}
          </div>
        ) : (
          <>
            <Search size="sm" labelText="Search icons" placeholder="Search icons" value={query} onChange={e => setQuery(e.target.value)} autoFocus />
            <div className="sc-picker-grid icons" role="listbox" aria-label="Icons">
              {icons.map(name => {
                const Icon = ICONS[name];
                return (
                  <button key={name} className="sc-picker-item" title={iconLabel(name)} aria-label={iconLabel(name)} onClick={() => {
                    ed.addObjects((ids, t) => [createIconObject(ids, name, { color: t.accent })]);
                    setOpen(false);
                  }}>
                    <Icon size={20} />
                  </button>
                );
              })}
              {!icons.length && <p className="sc-picker-empty">No icons match “{query}”</p>}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

const Sep = () => <span className="sc-toolbar-sep" aria-hidden />;

export function Toolbar() {
  const primary = ed.useEditor(s => ed.primaryObject(s));
  const selCount = ed.useEditor(s => s.selection.length);
  const canUndo = ed.useEditor(s => s.past.length > 0);
  const canRedo = ed.useEditor(s => s.future.length > 0);
  const slideIndex = ed.useEditor(s => s.slideIndex);
  const slideBg = ed.useEditor(s => s.deck.slides[s.slideIndex].background);
  const [picker, setPicker] = useState<'shape' | 'icon' | null>(null);
  const panel = useUi(s => s.panel);
  const issueCount = useUi(s => s.issues.filter(i => i.severity !== 'info').length);

  useEffect(() => {
    const shapes = () => setPicker('shape');
    const icons = () => setPicker('icon');
    window.addEventListener('slidecraft:open-shapes', shapes);
    window.addEventListener('slidecraft:open-icons', icons);
    window.addEventListener('slidecraft:add-text', addTextBox);
    return () => {
      window.removeEventListener('slidecraft:open-shapes', shapes);
      window.removeEventListener('slidecraft:open-icons', icons);
      window.removeEventListener('slidecraft:add-text', addTextBox);
    };
  }, []);

  const textual = !!primary && isTextual(primary);
  const fmt = (k: FormatToggle, label: string, Icon: React.ElementType, key: string) => (
    <IconButton kind="ghost" size="sm" label={`${label} (${MOD}${key})`} disabled={!textual} isSelected={isFormatActive(primary, k)} onClick={() => toggleFormat(k)}>
      <Icon />
    </IconButton>
  );
  const fontFamily = textual ? primary.fontFamily : '';

  return (
    // Buttons must not steal focus from text being edited, so inline formatting keeps its selection
    <div className="sc-toolbar" role="toolbar" aria-label="Editing tools" onMouseDown={e => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }}>
      <IconButton kind="ghost" size="sm" label={`Undo (${MOD}Z)`} disabled={!canUndo} onClick={ed.undo}><Undo /></IconButton>
      <IconButton kind="ghost" size="sm" label={`Redo (${MOD}⇧Z)`} disabled={!canRedo} onClick={ed.redo}><Redo /></IconButton>
      <Sep />
      <IconButton kind="ghost" size="sm" label="Insert text box (T)" onClick={addTextBox}><TextFont /></IconButton>
      <IconButton kind="ghost" size="sm" label="Insert image" onClick={() => openDialog('image')}><Image /></IconButton>
      <InsertPicker kind="shape" open={picker === 'shape'} setOpen={v => setPicker(v ? 'shape' : null)} />
      <InsertPicker kind="icon" open={picker === 'icon'} setOpen={v => setPicker(v ? 'icon' : null)} />
      <IconButton kind="ghost" size="sm" label="Insert table" onClick={() => insertTable()}><DataTable /></IconButton>
      <IconButton kind="ghost" size="sm" label="Insert chart" onClick={() => insertChart()}><ChartColumn /></IconButton>
      <Sep />
      <Select
        id="sc-font-family" className="sc-font-select" size="sm" labelText="Font" hideLabel inline
        disabled={!textual} value={fontFamily}
        onChange={e => formatSelection({ fontFamily: e.target.value })}
      >
        {textual && !FONTS.includes(fontFamily) && <SelectItem value={fontFamily} text={fontFamily} />}
        {!textual && <SelectItem value="" text="Font" />}
        {FONTS.map(f => <SelectItem key={f} value={f} text={f} />)}
      </Select>
      <IconButton kind="ghost" size="sm" label="Decrease font size" disabled={!textual} onClick={() => textual && formatSelection({ fontSize: Math.max(4, Math.round(primary.fontSize) - 2) }, 'font-size')}><Subtract /></IconButton>
      <NumField className="sc-font-size" label="Font size" hideLabel hideSteppers value={textual ? primary.fontSize : 24} min={4} max={400} disabled={!textual} onCommit={v => formatSelection({ fontSize: v })} />
      <IconButton kind="ghost" size="sm" label="Increase font size" disabled={!textual} onClick={() => textual && formatSelection({ fontSize: Math.min(400, Math.round(primary.fontSize) + 2) }, 'font-size')}><Add /></IconButton>
      <Sep />
      {fmt('bold', 'Bold', TextBold, 'B')}
      {fmt('italic', 'Italic', TextItalic, 'I')}
      {fmt('underline', 'Underline', TextUnderline, 'U')}
      {fmt('strikethrough', 'Strikethrough', TextStrikethrough, '⇧X')}
      <Sep />
      <ColorButton label="Text color" icon={<TextColor />} disabled={!primary || primary.type === 'image'}
        value={primary && 'color' in primary ? primary.color : '#161616'}
        onPick={c => styleSelection({ color: c } as never, 'text-color', o => o.type !== 'image')} />
      <ColorButton label="Fill color" icon={<PaintBrush />} disabled={!primary}
        value={primary?.backgroundColor ?? 'transparent'}
        onPick={c => styleSelection({ backgroundColor: c }, 'fill-color')} />
      <ColorButton label="Border color" icon={<BorderFull />} disabled={!primary}
        value={primary?.borderColor ?? '#000000'}
        onPick={c => ed.commitSelection(o => { o.borderColor = c; if (o.borderStyle === 'none') o.borderStyle = 'solid'; if (!o.borderWidth) o.borderWidth = 2; }, undefined, { coalesce: 'border-color' })} />
      <Sep />
      {(['left', 'center', 'right'] as const).map(a => (
        <IconButton key={a} kind="ghost" size="sm" label={`Align text ${a}`} disabled={!textual} isSelected={textual && primary.textAlign === a} onClick={() => formatSelection({ textAlign: a })}>
          {a === 'left' ? <TextAlignLeft /> : a === 'center' ? <TextAlignCenter /> : <TextAlignRight />}
        </IconButton>
      ))}
      <IconButton kind="ghost" size="sm" label="Bulleted list" disabled={primary?.type !== 'text'} isSelected={primary?.type === 'text' && primary.text.includes('<ul>')} onClick={() => toggleList('ul')}><ListBulleted /></IconButton>
      <IconButton kind="ghost" size="sm" label="Numbered list" disabled={primary?.type !== 'text'} isSelected={primary?.type === 'text' && primary.text.includes('<ol>')} onClick={() => toggleList('ol')}><ListNumbered /></IconButton>
      <Sep />
      <IconButton kind="ghost" size="sm" label="Align & distribute" disabled={!selCount} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); openContextMenu(r.left, r.bottom, arrangeItems(), 'Arrange'); }}><AlignBoxMiddleCenter /></IconButton>
      <IconButton kind="ghost" size="sm" label="Bring to front" disabled={!selCount} onClick={() => ed.reorderSelection('front')}><BringToFront /></IconButton>
      <IconButton kind="ghost" size="sm" label="Send to back" disabled={!selCount} onClick={() => ed.reorderSelection('back')}><SendToBack /></IconButton>
      <IconButton kind="ghost" size="sm" label="Delete (Del)" disabled={!selCount} onClick={ed.deleteSelection}><TrashCan /></IconButton>
      <Sep />
      <ColorButton label="Slide background" icon={<ColorPalette />} value={slideBg}
        onPick={c => ed.commitSlide(s => { s.background = c; s.backgroundImage = ''; }, { coalesce: 'slide-bg' })} />
      <IconButton kind="ghost" size="sm" label="Slide layout" onClick={() => openDialog('layout', slideIndex)}><Template /></IconButton>
      <IconButton kind="ghost" size="sm" label="Design theme" onClick={() => openDialog('theme')}><ColorSwitch /></IconButton>
      <Sep />
      <IconButton kind="ghost" size="sm" label="Design check" isSelected={panel === 'check'} badgeCount={issueCount || undefined} onClick={() => setPanel('check')}><TaskView /></IconButton>
      <IconButton kind="ghost" size="sm" label="AI assistant" isSelected={panel === 'assistant'} onClick={() => setPanel('assistant')}><MagicWand /></IconButton>
    </div>
  );
}
