import {
  AlignHorizontalCenter, AlignHorizontalLeft, AlignHorizontalRight, AlignVerticalBottom, AlignVerticalCenter,
  AlignVerticalTop, BringToFront, ColorPalette, Copy, Cut, DistributeHorizontalCenter, DistributeVerticalCenter,
  DocumentAdd, DocumentExport, DocumentImport, DocumentPdf, Download, Edit, FitToScreen, FolderOpen, Html,
  Image, Information, Keyboard, Json, Maximize, Paste, Play, Printer, Redo, Save, SendToBack, Shapes, Template,
  TextBold, TextFont, TextItalic, TextUnderline, TrashCan, Undo, ZoomIn, ZoomOut, ColorSwitch, Screen, Copy as CopySlide,
  ArrowUp, ArrowDown, Add, SelectWindow, Idea, DataTable, ChartColumn, Code,
} from '@carbon/icons-react';
import { insertChart, insertTable } from './objectOps';
import type { MenuItem } from '../store/ui';
import { openDialog } from '../store/ui';
import * as ed from '../store/editor';
import { hasClipboard } from '../store/editor';
import { exportHtmlFile, exportJsonFile, importJsonFile, openPptxFile, printDeck, savePptxFile, saveToBrowser } from '../io/files';
import { formatSelection, toggleFormat } from './formatting';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl+';
export const SHIFT = isMac ? '⇧' : 'Shift+';
export const ALT = isMac ? '⌥' : 'Alt+';

const sel = () => ed.useEditor.getState().selection;
const editingOff = () => ed.setEditing(null);

export function arrangeItems(): MenuItem[] {
  const count = sel().length;
  const none = count === 0;
  return [
    { label: 'Bring to Front', icon: BringToFront, shortcut: `${MOD}${SHIFT}]`, disabled: none, onClick: () => ed.reorderSelection('front') },
    { label: 'Bring Forward', shortcut: `${MOD}]`, disabled: none, onClick: () => ed.reorderSelection('forward') },
    { label: 'Send Backward', shortcut: `${MOD}[`, disabled: none, onClick: () => ed.reorderSelection('backward') },
    { label: 'Send to Back', icon: SendToBack, shortcut: `${MOD}${SHIFT}[`, disabled: none, onClick: () => ed.reorderSelection('back') },
    'divider',
    { label: count > 1 ? 'Align Left' : 'Align Left (to slide)', icon: AlignHorizontalLeft, disabled: none, onClick: () => ed.alignSelection('left') },
    { label: 'Align Center', icon: AlignHorizontalCenter, disabled: none, onClick: () => ed.alignSelection('center') },
    { label: 'Align Right', icon: AlignHorizontalRight, disabled: none, onClick: () => ed.alignSelection('right') },
    { label: 'Align Top', icon: AlignVerticalTop, disabled: none, onClick: () => ed.alignSelection('top') },
    { label: 'Align Middle', icon: AlignVerticalCenter, disabled: none, onClick: () => ed.alignSelection('middle') },
    { label: 'Align Bottom', icon: AlignVerticalBottom, disabled: none, onClick: () => ed.alignSelection('bottom') },
    'divider',
    { label: 'Distribute Horizontally', icon: DistributeHorizontalCenter, disabled: count < 3, onClick: () => ed.distributeSelection('h') },
    { label: 'Distribute Vertically', icon: DistributeVerticalCenter, disabled: count < 3, onClick: () => ed.distributeSelection('v') },
  ];
}

export function slideItems(index: number): MenuItem[] {
  const n = ed.useEditor.getState().deck.slides.length;
  return [
    { label: 'New Slide', icon: Add, shortcut: `${MOD}M`, onClick: () => ed.addSlide(index) },
    { label: 'Duplicate Slide', icon: CopySlide, onClick: () => ed.duplicateSlide(index) },
    'divider',
    { label: 'Move Up', icon: ArrowUp, disabled: index === 0, onClick: () => ed.moveSlide(index, index - 1) },
    { label: 'Move Down', icon: ArrowDown, disabled: index === n - 1, onClick: () => ed.moveSlide(index, index + 2) },
    'divider',
    { label: 'Background…', icon: ColorPalette, onClick: () => openDialog('background', index) },
    { label: 'Layout…', icon: Template, onClick: () => openDialog('layout', index) },
    'divider',
    { label: 'Present from Here', icon: Play, onClick: () => ed.startPresentation(index) },
    'divider',
    { label: 'Delete Slide', icon: TrashCan, danger: true, disabled: n <= 1, onClick: () => ed.deleteSlide(index) },
  ];
}

export function canvasMenuItems(onObject: boolean): MenuItem[] {
  const state = ed.useEditor.getState();
  if (!onObject) {
    return [
      { label: 'Paste', icon: Paste, shortcut: `${MOD}V`, disabled: !hasClipboard(), onClick: () => ed.pasteObjects() },
      { label: 'Select All', icon: SelectWindow, shortcut: `${MOD}A`, disabled: !ed.currentSlide().objects.length, onClick: ed.selectAll },
      'divider',
      { label: 'Add Text Box', icon: TextFont, shortcut: 'T', onClick: () => window.dispatchEvent(new Event('slidecraft:add-text')) },
      { label: 'Add Image…', icon: Image, onClick: () => openDialog('image') },
      'divider',
      { label: 'Background…', icon: ColorPalette, onClick: () => openDialog('background', state.slideIndex) },
      { label: 'Layout…', icon: Template, onClick: () => openDialog('layout', state.slideIndex) },
    ];
  }
  const objs = ed.selectedObjects();
  const multi = objs.length > 1;
  const first = objs[0];
  const items: MenuItem[] = [
    { label: 'Cut', icon: Cut, shortcut: `${MOD}X`, onClick: ed.cutSelection },
    { label: 'Copy', icon: Copy, shortcut: `${MOD}C`, onClick: ed.copySelection },
    { label: 'Paste', icon: Paste, shortcut: `${MOD}V`, disabled: !hasClipboard(), onClick: () => ed.pasteObjects() },
    { label: 'Duplicate', shortcut: `${MOD}D`, onClick: ed.duplicateSelection },
    'divider',
  ];
  if (!multi && first && (first.type === 'text' || (first.type === 'shape' && first.shapeType !== 'line'))) {
    items.push({ label: 'Edit Text', icon: Edit, shortcut: 'Enter', onClick: () => ed.setEditing(first.id) });
  }
  if (!multi && first?.type === 'table') {
    items.push({ label: 'Edit Cells', icon: Edit, shortcut: 'Enter', onClick: () => ed.setEditing(first.id) });
  }
  if (!multi && first?.type === 'chart') {
    items.push({ label: 'Edit Chart Data…', icon: ChartColumn, shortcut: 'Enter', onClick: () => openDialog('chart') });
  }
  if (!multi && first?.type === 'image') {
    items.push({ label: 'Replace Image…', icon: Image, onClick: () => window.dispatchEvent(new CustomEvent('slidecraft:replace-image', { detail: first.id })) });
  }
  items.push(
    { label: 'Arrange', icon: BringToFront, children: arrangeItems() },
    'divider',
    { label: multi ? `Delete ${objs.length} Objects` : 'Delete', icon: TrashCan, danger: true, shortcut: 'Del', onClick: ed.deleteSelection },
  );
  return items;
}

export function menubar(): { id: string; label: string; items: () => MenuItem[] }[] {
  return [
    {
      id: 'file', label: 'File', items: () => [
        { label: 'New Presentation', icon: DocumentAdd, onClick: () => openDialog('new') },
        { label: 'Open PowerPoint (.pptx)…', icon: FolderOpen, shortcut: `${MOD}O`, onClick: openPptxFile },
        { label: 'Open SlideCraft JSON…', icon: DocumentImport, onClick: importJsonFile },
        'divider',
        { label: 'Save in Browser', icon: Save, shortcut: `${MOD}S`, onClick: () => saveToBrowser(true) },
        { label: 'Save as PowerPoint (.pptx)', icon: DocumentExport, shortcut: `${MOD}${SHIFT}S`, onClick: savePptxFile },
        {
          label: 'Download As', icon: Download, children: [
            { label: 'PowerPoint (.pptx)', icon: DocumentExport, onClick: savePptxFile },
            { label: 'PDF (via Print)', icon: DocumentPdf, onClick: printDeck },
            { label: 'HTML Slideshow', icon: Html, onClick: exportHtmlFile },
            { label: 'SlideCraft JSON', icon: Json, onClick: exportJsonFile },
          ],
        },
        'divider',
        { label: 'Print…', icon: Printer, shortcut: `${MOD}P`, onClick: printDeck },
      ],
    },
    {
      id: 'edit', label: 'Edit', items: () => {
        const s = ed.useEditor.getState();
        const none = !s.selection.length;
        return [
          { label: 'Undo', icon: Undo, shortcut: `${MOD}Z`, disabled: !s.past.length, onClick: ed.undo },
          { label: 'Redo', icon: Redo, shortcut: `${MOD}${SHIFT}Z`, disabled: !s.future.length, onClick: ed.redo },
          'divider',
          { label: 'Cut', icon: Cut, shortcut: `${MOD}X`, disabled: none, onClick: ed.cutSelection },
          { label: 'Copy', icon: Copy, shortcut: `${MOD}C`, disabled: none, onClick: ed.copySelection },
          { label: 'Paste', icon: Paste, shortcut: `${MOD}V`, disabled: !hasClipboard(), onClick: () => ed.pasteObjects() },
          { label: 'Duplicate', shortcut: `${MOD}D`, disabled: none, onClick: ed.duplicateSelection },
          'divider',
          { label: 'Select All', icon: SelectWindow, shortcut: `${MOD}A`, onClick: ed.selectAll },
          { label: 'Delete', icon: TrashCan, shortcut: 'Del', disabled: none, danger: true, onClick: ed.deleteSelection },
        ];
      },
    },
    {
      id: 'view', label: 'View', items: () => [
        { label: 'Zoom In', icon: ZoomIn, shortcut: `${MOD}+`, onClick: () => ed.setZoom(ed.useEditor.getState().zoom + 10) },
        { label: 'Zoom Out', icon: ZoomOut, shortcut: `${MOD}-`, onClick: () => ed.setZoom(ed.useEditor.getState().zoom - 10) },
        { label: 'Zoom to Fit', icon: FitToScreen, shortcut: `${MOD}0`, onClick: () => window.dispatchEvent(new Event('slidecraft:zoom-fit')) },
        { label: 'Actual Size (100%)', onClick: () => ed.setZoom(100) },
        'divider',
        { label: 'Full Screen', icon: Maximize, onClick: () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); } },
      ],
    },
    {
      id: 'insert', label: 'Insert', items: () => [
        { label: 'Text Box', icon: TextFont, shortcut: 'T', onClick: () => window.dispatchEvent(new Event('slidecraft:add-text')) },
        { label: 'Image…', icon: Image, onClick: () => openDialog('image') },
        { label: 'Shape', icon: Shapes, onClick: () => window.dispatchEvent(new Event('slidecraft:open-shapes')) },
        { label: 'Icon', icon: Idea, onClick: () => window.dispatchEvent(new Event('slidecraft:open-icons')) },
        { label: 'Table', icon: DataTable, onClick: () => insertTable() },
        {
          label: 'Chart', icon: ChartColumn, children: [
            { label: 'Column', onClick: () => insertChart('column') },
            { label: 'Bar', onClick: () => insertChart('bar') },
            { label: 'Line', onClick: () => insertChart('line') },
            { label: 'Area', onClick: () => insertChart('area') },
            { label: 'Pie', onClick: () => insertChart('pie') },
            { label: 'Doughnut', onClick: () => insertChart('doughnut') },
          ],
        },
        'divider',
        { label: 'New Slide', icon: Add, shortcut: `${MOD}M`, onClick: () => ed.addSlide() },
      ],
    },
    {
      id: 'format', label: 'Format', items: () => [
        { label: 'Bold', icon: TextBold, shortcut: `${MOD}B`, onClick: () => toggleFormat('bold') },
        { label: 'Italic', icon: TextItalic, shortcut: `${MOD}I`, onClick: () => toggleFormat('italic') },
        { label: 'Underline', icon: TextUnderline, shortcut: `${MOD}U`, onClick: () => toggleFormat('underline') },
        'divider',
        { label: 'Align Text Left', onClick: () => formatSelection({ textAlign: 'left' }) },
        { label: 'Align Text Center', onClick: () => formatSelection({ textAlign: 'center' }) },
        { label: 'Align Text Right', onClick: () => formatSelection({ textAlign: 'right' }) },
        'divider',
        { label: 'Design Theme…', icon: ColorSwitch, onClick: () => { editingOff(); openDialog('theme'); } },
        { label: 'Slide Background…', icon: ColorPalette, onClick: () => openDialog('background', ed.useEditor.getState().slideIndex) },
      ],
    },
    { id: 'arrange', label: 'Arrange', items: arrangeItems },
    {
      id: 'slide', label: 'Slide', items: () => [
        ...slideItems(ed.useEditor.getState().slideIndex).slice(0, 8),
        'divider',
        { label: 'Present from Beginning', icon: Play, shortcut: `${SHIFT}F5`, onClick: () => ed.startPresentation(0) },
        { label: 'Present from Current Slide', icon: Play, shortcut: 'F5', onClick: () => ed.startPresentation() },
        { label: 'Presenter View', icon: Screen, shortcut: `${ALT}F5`, onClick: () => ed.startPresentation(undefined, true) },
      ],
    },
    {
      id: 'help', label: 'Help', items: () => [
        { label: 'Keyboard Shortcuts', icon: Keyboard, shortcut: `${MOD}/`, onClick: () => openDialog('shortcuts') },
        {
          label: 'Automation API (Console)', icon: Code, onClick: () => {
            window.slidecraft?.help();
            ed.toast('info', 'window.slidecraft is ready', 'Open the browser console (F12) — the API reference is printed there.');
          },
        },
        { label: 'About SlideCraft', icon: Information, onClick: () => openDialog('about') },
      ],
    },
  ];
}
