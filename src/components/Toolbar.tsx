import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconButton, Popover, PopoverContent, Search, Select, SelectItem } from '@carbon/react';
import {
  AlignBoxMiddleCenter, BringToFront, ColorPalette, ColorSwitch, Image, Idea, ListBulleted, ListNumbered, PaintBrush,
  Redo, SendToBack, Shapes, Subtract, Add, TextAlignCenter, TextAlignLeft, TextAlignRight, TextBold, TextColor,
  TextFont, TextItalic, TextStrikethrough, TextUnderline, Template, TrashCan, Undo, BorderFull, DataTable, ChartColumn, TaskView, MagicWand,
  OverflowMenuHorizontal, RightPanelClose, RightPanelOpen, Movement,
} from '@carbon/icons-react';
import { getTheme } from '../model/themes';
import type { MenuItem } from '../store/ui';
import { insertChart, insertTable } from './objectOps';
import type { ShapeType } from '../model/types';
import { isTextual } from '../model/types';
import { createShapeObject, createIconObject, createTextObject } from '../model/factory';
import { ICON_NAMES, ICONS, iconLabel } from '../model/icons';
import * as ed from '../store/editor';
import { openDialog, setPanel, toggleSidebar, useUi } from '../store/ui';
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

/** A toolbar group: rendered inline when it fits, otherwise offered through the "More" menu */
interface ToolGroup {
  id: string;
  /** Higher stays on the toolbar longer when space runs out */
  priority: number;
  node: ReactNode;
  menu: () => MenuItem[];
}

const SWATCHES = ['#161616', '#525252', '#ffffff', '#0f62fe', '#24a148', '#da1e28', '#f1c21b', '#8a3ffc', '#007d79', '#ff7eb6'];
const swatchItems = (apply: (c: string) => void, extra: string[] = []): MenuItem[] =>
  [...new Set([...extra, ...SWATCHES])].map(c => ({ label: c, icon: swatchIcon(c), onClick: () => apply(c) }));
function swatchIcon(color: string) {
  const Swatch = () => <span className="sc-menu-swatch" style={{ background: color }} />;
  return Swatch;
}

const MORE_WIDTH = 40;

export function Toolbar() {
  const primary = ed.useEditor(s => ed.primaryObject(s));
  const selCount = ed.useEditor(s => s.selection.length);
  const editing = ed.useEditor(s => s.editingId != null);
  const canUndo = ed.useEditor(s => s.past.length > 0);
  const canRedo = ed.useEditor(s => s.future.length > 0);
  const slideIndex = ed.useEditor(s => s.slideIndex);
  const slideBg = ed.useEditor(s => s.deck.slides[s.slideIndex].background);
  const themeName = ed.useEditor(s => s.deck.themeName);
  const [picker, setPicker] = useState<'shape' | 'icon' | null>(null);
  const panel = useUi(s => s.panel);
  const issueCount = useUi(s => s.issues.filter(i => i.severity !== 'info').length);
  const barRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<string[]>([]);
  const [width, setWidth] = useState(0);

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
  const t = getTheme(themeName);
  const fmt = (k: FormatToggle, label: string, Icon: React.ElementType, key: string) => (
    <IconButton kind="ghost" size="sm" label={`${label} (${MOD}${key})`} isSelected={isFormatActive(primary, k)} onClick={() => toggleFormat(k)}>
      <Icon />
    </IconButton>
  );
  const fontFamily = textual ? primary.fontFamily : '';
  const textColor = (c: string) => styleSelection({ color: c } as never, 'text-color', o => o.type !== 'image');
  const fillColor = (c: string) => styleSelection({ backgroundColor: c }, 'fill-color');
  const borderColor = (c: string) => ed.commitSelection(o => { o.borderColor = c; if (o.borderStyle === 'none') o.borderStyle = 'solid'; if (!o.borderWidth) o.borderWidth = 2; }, undefined, { coalesce: 'border-color' });
  const themeColors = [t.heading, t.body, t.accent];

  const groups: ToolGroup[] = [
    {
      id: 'history', priority: 100,
      node: <>
        <IconButton kind="ghost" size="sm" label={`Undo (${MOD}Z)`} disabled={!canUndo} onClick={ed.undo}><Undo /></IconButton>
        <IconButton kind="ghost" size="sm" label={`Redo (${MOD}⇧Z)`} disabled={!canRedo} onClick={ed.redo}><Redo /></IconButton>
      </>,
      menu: () => [
        { label: 'Undo', icon: Undo, shortcut: `${MOD}Z`, disabled: !canUndo, onClick: ed.undo },
        { label: 'Redo', icon: Redo, shortcut: `${MOD}⇧Z`, disabled: !canRedo, onClick: ed.redo },
      ],
    },
    {
      id: 'insert', priority: 90,
      node: <>
        <IconButton kind="ghost" size="sm" label="Text box (T)" onClick={addTextBox}><TextFont /></IconButton>
        <IconButton kind="ghost" size="sm" label="Image" onClick={() => openDialog('image')}><Image /></IconButton>
        <InsertPicker kind="shape" open={picker === 'shape'} setOpen={v => setPicker(v ? 'shape' : null)} />
        <InsertPicker kind="icon" open={picker === 'icon'} setOpen={v => setPicker(v ? 'icon' : null)} />
        <IconButton kind="ghost" size="sm" label="Table" onClick={() => insertTable()}><DataTable /></IconButton>
        <IconButton kind="ghost" size="sm" label="Chart" onClick={() => insertChart()}><ChartColumn /></IconButton>
      </>,
      menu: () => [{
        label: 'Insert', icon: Add, children: [
          { label: 'Text box', icon: TextFont, shortcut: 'T', onClick: addTextBox },
          { label: 'Image…', icon: Image, onClick: () => openDialog('image') },
          { label: 'Shape', icon: Shapes, onClick: () => setPicker('shape') },
          { label: 'Icon', icon: Idea, onClick: () => setPicker('icon') },
          { label: 'Table', icon: DataTable, onClick: () => insertTable() },
          { label: 'Chart', icon: ChartColumn, onClick: () => insertChart() },
        ],
      }],
    },
  ];

  if (textual || editing) {
    groups.push({
      id: 'text', priority: 80,
      node: <>
        <Select id="sc-font-family" className="sc-font-select" size="sm" labelText="Font" hideLabel inline value={fontFamily}
          onChange={e => formatSelection({ fontFamily: e.target.value })}>
          {textual && !FONTS.includes(fontFamily) && <SelectItem value={fontFamily} text={fontFamily} />}
          {FONTS.map(f => <SelectItem key={f} value={f} text={f} />)}
        </Select>
        <IconButton kind="ghost" size="sm" label="Smaller text" onClick={() => textual && formatSelection({ fontSize: Math.max(4, Math.round(primary.fontSize) - 2) }, 'font-size')}><Subtract /></IconButton>
        <NumField className="sc-font-size" label="Font size" hideLabel hideSteppers value={textual ? primary.fontSize : 24} min={4} max={400} onCommit={v => formatSelection({ fontSize: v })} />
        <IconButton kind="ghost" size="sm" label="Larger text" onClick={() => textual && formatSelection({ fontSize: Math.min(400, Math.round(primary.fontSize) + 2) }, 'font-size')}><Add /></IconButton>
        {fmt('bold', 'Bold', TextBold, 'B')}
        {fmt('italic', 'Italic', TextItalic, 'I')}
        {fmt('underline', 'Underline', TextUnderline, 'U')}
        {fmt('strikethrough', 'Strikethrough', TextStrikethrough, '⇧X')}
      </>,
      menu: () => [{
        label: 'Text', icon: TextFont, children: [
          { label: 'Font', children: FONTS.map(f => ({ label: f, onClick: () => formatSelection({ fontFamily: f }) })) },
          { label: 'Larger', icon: Add, onClick: () => textual && formatSelection({ fontSize: Math.min(400, Math.round(primary.fontSize) + 2) }) },
          { label: 'Smaller', icon: Subtract, onClick: () => textual && formatSelection({ fontSize: Math.max(4, Math.round(primary.fontSize) - 2) }) },
          'divider',
          { label: 'Bold', icon: TextBold, shortcut: `${MOD}B`, onClick: () => toggleFormat('bold') },
          { label: 'Italic', icon: TextItalic, shortcut: `${MOD}I`, onClick: () => toggleFormat('italic') },
          { label: 'Underline', icon: TextUnderline, shortcut: `${MOD}U`, onClick: () => toggleFormat('underline') },
          { label: 'Strikethrough', icon: TextStrikethrough, onClick: () => toggleFormat('strikethrough') },
        ],
      }],
    });
    groups.push({
      id: 'paragraph', priority: 50,
      node: <>
        {(['left', 'center', 'right'] as const).map(a => (
          <IconButton key={a} kind="ghost" size="sm" label={`Align ${a}`} isSelected={textual && primary.textAlign === a} onClick={() => formatSelection({ textAlign: a })}>
            {a === 'left' ? <TextAlignLeft /> : a === 'center' ? <TextAlignCenter /> : <TextAlignRight />}
          </IconButton>
        ))}
        <IconButton kind="ghost" size="sm" label="Bulleted list" disabled={primary?.type !== 'text'} isSelected={primary?.type === 'text' && primary.text.includes('<ul>')} onClick={() => toggleList('ul')}><ListBulleted /></IconButton>
        <IconButton kind="ghost" size="sm" label="Numbered list" disabled={primary?.type !== 'text'} isSelected={primary?.type === 'text' && primary.text.includes('<ol>')} onClick={() => toggleList('ol')}><ListNumbered /></IconButton>
      </>,
      menu: () => [{
        label: 'Paragraph', icon: TextAlignLeft, children: [
          { label: 'Align left', icon: TextAlignLeft, onClick: () => formatSelection({ textAlign: 'left' }) },
          { label: 'Align center', icon: TextAlignCenter, onClick: () => formatSelection({ textAlign: 'center' }) },
          { label: 'Align right', icon: TextAlignRight, onClick: () => formatSelection({ textAlign: 'right' }) },
          'divider',
          { label: 'Bulleted list', icon: ListBulleted, disabled: primary?.type !== 'text', onClick: () => toggleList('ul') },
          { label: 'Numbered list', icon: ListNumbered, disabled: primary?.type !== 'text', onClick: () => toggleList('ol') },
        ],
      }],
    });
  }

  if (selCount) {
    groups.push({
      id: 'style', priority: 70,
      node: <>
        {primary?.type !== 'image' && (
          <ColorButton label="Text color" icon={<TextColor />} value={primary && 'color' in primary ? primary.color : '#161616'} onPick={textColor} />
        )}
        <ColorButton label="Fill color" icon={<PaintBrush />} value={primary?.backgroundColor ?? 'transparent'} onPick={fillColor} />
        <ColorButton label="Border color" icon={<BorderFull />} value={primary?.borderColor ?? '#000000'} onPick={borderColor} />
      </>,
      menu: () => [
        { label: 'Text color', icon: TextColor, children: swatchItems(textColor, themeColors) },
        { label: 'Fill color', icon: PaintBrush, children: [{ label: 'No fill', onClick: () => fillColor('transparent') }, ...swatchItems(fillColor, themeColors)] },
        { label: 'Border color', icon: BorderFull, children: swatchItems(borderColor, themeColors) },
      ],
    });
    groups.push({
      id: 'arrange', priority: 60,
      node: <>
        <IconButton kind="ghost" size="sm" label="Align & distribute" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); openContextMenu(r.left, r.bottom, arrangeItems(), 'Arrange'); }}><AlignBoxMiddleCenter /></IconButton>
        <IconButton kind="ghost" size="sm" label="Bring to front" onClick={() => ed.reorderSelection('front')}><BringToFront /></IconButton>
        <IconButton kind="ghost" size="sm" label="Send to back" onClick={() => ed.reorderSelection('back')}><SendToBack /></IconButton>
        <IconButton kind="ghost" size="sm" label="Delete (Del)" onClick={ed.deleteSelection}><TrashCan /></IconButton>
      </>,
      menu: () => [
        { label: 'Arrange', icon: AlignBoxMiddleCenter, children: arrangeItems() },
        { label: 'Delete', icon: TrashCan, danger: true, onClick: ed.deleteSelection },
      ],
    });
  } else {
    groups.push({
      id: 'slide', priority: 85,
      node: <>
        <ColorButton label="Slide background" icon={<ColorPalette />} value={slideBg}
          onPick={c => ed.commitSlide(s => { s.background = c; s.backgroundImage = ''; }, { coalesce: 'slide-bg' })} />
        <IconButton kind="ghost" size="sm" label="Layout" onClick={() => openDialog('layout', slideIndex)}><Template /></IconButton>
        <IconButton kind="ghost" size="sm" label="Theme" onClick={() => openDialog('theme')}><ColorSwitch /></IconButton>
        <IconButton kind="ghost" size="sm" label="Transitions & animation" onClick={() => openDialog('motion')}><Movement /></IconButton>
      </>,
      menu: () => [
        { label: 'Slide background…', icon: ColorPalette, onClick: () => openDialog('background', slideIndex) },
        { label: 'Layout…', icon: Template, onClick: () => openDialog('layout', slideIndex) },
        { label: 'Theme…', icon: ColorSwitch, onClick: () => openDialog('theme') },
        { label: 'Transitions & animation…', icon: Movement, onClick: () => openDialog('motion') },
      ],
    });
  }

  // Decide which groups fit: measure each group (hidden ones stay in the DOM, out of flow),
  // keep the highest-priority ones, and show the rest in the "More" menu
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const observer = new ResizeObserver(() => setWidth(bar.clientWidth));
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar || !width) return;
    const widths = new Map<string, number>();
    bar.querySelectorAll<HTMLElement>('[data-group]').forEach(el => widths.set(el.dataset.group!, el.offsetWidth + 9));
    const room = width - (pinnedRef.current?.offsetWidth ?? 0) - 24;
    const byPriority = [...groups].sort((a, b) => b.priority - a.priority);
    const fit = (limit: number) => {
      let used = 0;
      const hidden: string[] = [];
      for (const g of byPriority) {
        const w = widths.get(g.id) ?? 0;
        if (used + w <= limit) used += w; else hidden.push(g.id);
      }
      return hidden;
    };
    let hidden = fit(room);
    if (hidden.length) hidden = fit(room - MORE_WIDTH);
    if (hidden.join(',') !== overflow.join(',')) setOverflow(hidden);
  }); // re-measures every render; cheap, and group contents change with the selection

  const hiddenGroups = groups.filter(g => overflow.includes(g.id));
  const visible = groups.filter(g => !overflow.includes(g.id));

  return (
    // Buttons must not steal focus from text being edited, so inline formatting keeps its selection
    <div ref={barRef} className="sc-toolbar" role="toolbar" aria-label="Editing tools" onMouseDown={e => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); }}>
      {groups.map(g => (
        <div key={g.id} data-group={g.id} className={`sc-tgroup${overflow.includes(g.id) ? ' is-overflow' : ''}${visible[0]?.id === g.id ? ' is-first' : ''}`} aria-hidden={overflow.includes(g.id) || undefined}>
          {g.node}
        </div>
      ))}
      {hiddenGroups.length > 0 && (
        <div className="sc-tgroup">
          <IconButton kind="ghost" size="sm" label="More tools" onClick={e => {
            const r = e.currentTarget.getBoundingClientRect();
            openContextMenu(r.left, r.bottom, hiddenGroups.flatMap((g, i) => (i ? ['divider' as const, ...g.menu()] : g.menu())), 'More tools');
          }}><OverflowMenuHorizontal /></IconButton>
        </div>
      )}
      <span className="sc-toolbar-spacer" />
      <div ref={pinnedRef} className="sc-tpinned">
        <IconButton kind="ghost" size="sm" label="Design check" align="bottom-end" isSelected={panel === 'check'} badgeCount={issueCount || undefined} onClick={() => setPanel('check')}><TaskView /></IconButton>
        <IconButton kind="ghost" size="sm" label="AI assistant" align="bottom-end" isSelected={panel === 'assistant'} onClick={() => setPanel('assistant')}><MagicWand /></IconButton>
        <IconButton kind="ghost" size="sm" label={panel ? 'Hide side panel' : 'Show properties'} align="bottom-end" isSelected={!!panel} onClick={toggleSidebar}>{panel ? <RightPanelClose /> : <RightPanelOpen />}</IconButton>
      </div>
    </div>
  );
}
