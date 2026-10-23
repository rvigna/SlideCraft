import { useEffect, useState } from 'react';
import { Button, Checkbox, ClickableTile, Modal, TextInput } from '@carbon/react';
import { Upload } from '@carbon/icons-react';
import { closeDialog, useUi } from '../../store/ui';
import * as ed from '../../store/editor';
import { createBlankSlide, createDeck, IdSource } from '../../model/factory';
import { LAYOUTS } from '../../model/layouts';
import { applyThemeToSlide, THEMES } from '../../model/themes';
import { createTextObject, createShapeObject } from '../../model/factory';
import type { Slide } from '../../model/types';
import { SlideStage } from '../SlideObjectView';
import { insertImage, pickFile, readFileAsDataURL } from '../../io/images';
import { MOD, SHIFT, ALT } from '../menus';
import { toHex6 } from '../../model/color';

const PREVIEW_W = 168;

function ImageDialog() {
  const [url, setUrl] = useState('');
  const insert = (src: string) => { closeDialog(); void insertImage(src); };
  return (
    <Modal
      open
      modalHeading="Insert image"
      primaryButtonText="Insert"
      secondaryButtonText="Cancel"
      primaryButtonDisabled={!url.trim()}
      onRequestClose={closeDialog}
      onRequestSubmit={() => url.trim() && insert(url.trim())}
      size="sm"
    >
      <TextInput id="sc-img-url" labelText="Image URL" placeholder="https://example.com/photo.jpg" value={url} onChange={e => setUrl(e.target.value)} data-modal-primary-focus />
      <div className="sc-dialog-row">
        <span className="sc-dialog-or">or</span>
        <Button kind="tertiary" size="sm" renderIcon={Upload} onClick={async () => {
          const file = await pickFile('image/*');
          if (file) insert(await readFileAsDataURL(file));
        }}>Upload from computer</Button>
      </div>
      <p className="sc-dialog-hint">Tip: you can also drag image files onto the slide, or paste them with {MOD}V.</p>
    </Modal>
  );
}

const SWATCHES = ['#ffffff', '#f4f4f4', '#e0e0e0', '#8d8d8d', '#393939', '#161616', '#001141', '#0f62fe',
  '#d0e2ff', '#a6c8ff', '#24a148', '#defbe6', '#f1c21b', '#fcf4d6', '#da1e28', '#fff1f1',
  '#8a3ffc', '#f6f2ff', '#1192e8', '#e5f6ff', '#ff7eb6', '#fff0f7', '#007d79', '#d9fbfb'];

const GRADIENTS = [
  'linear-gradient(135deg, #0f62fe, #8a3ffc)', 'linear-gradient(135deg, #667eea, #764ba2)',
  'linear-gradient(135deg, #ff7e5f, #feb47b)', 'linear-gradient(160deg, #1e3a8a, #0ea5e9)',
  'linear-gradient(135deg, #11998e, #38ef7d)', 'linear-gradient(180deg, #161616, #393939)',
];

function BackgroundDialog() {
  const index = useUi(s => s.dialogSlide);
  const slide = ed.useEditor(s => s.deck.slides[Math.min(index, s.deck.slides.length - 1)]);
  const [bg, setBg] = useState(slide.background);
  const [img, setImg] = useState(slide.backgroundImage);
  const [all, setAll] = useState(false);
  const preview: Slide = { ...slide, background: bg, backgroundImage: img };
  const isGradient = /gradient/i.test(bg);

  return (
    <Modal
      open
      modalHeading="Slide background"
      primaryButtonText={all ? 'Apply to all slides' : 'Apply'}
      secondaryButtonText="Cancel"
      onRequestClose={closeDialog}
      onRequestSubmit={() => {
        ed.commit(d => (all ? d.slides : [d.slides[index]]).forEach(s => { s.background = bg; s.backgroundImage = img; }));
        closeDialog();
      }}
    >
      <div className="sc-bg-dialog">
        <div className="sc-bg-preview"><SlideStage slide={preview} width={280} /></div>
        <div className="sc-bg-controls">
          <p className="cds--label">Color</p>
          <div className="sc-swatches">
            {SWATCHES.map(c => (
              <button key={c} className={`sc-swatch${bg === c && !img ? ' is-active' : ''}`} style={{ background: c }} aria-label={c} onClick={() => { setBg(c); setImg(''); }} />
            ))}
            <label className="sc-swatch sc-swatch-custom" title="Custom color">
              <input type="color" aria-label="Custom color" value={'#' + toHex6(isGradient ? '#ffffff' : bg, 'FFFFFF').toLowerCase()} onChange={e => { setBg(e.target.value); setImg(''); }} />
            </label>
          </div>
          <p className="cds--label">Gradient</p>
          <div className="sc-swatches">
            {GRADIENTS.map(g => (
              <button key={g} className={`sc-swatch${bg === g && !img ? ' is-active' : ''}`} style={{ background: g }} aria-label={g} onClick={() => { setBg(g); setImg(''); }} />
            ))}
          </div>
          <TextInput id="sc-bg-css" size="sm" labelText="CSS color or gradient" value={bg} onChange={e => setBg(e.target.value)} />
          <div className="sc-dialog-row">
            <TextInput id="sc-bg-img" size="sm" labelText="Background image URL" placeholder="https://…" value={img.startsWith('data:') ? '(uploaded image)' : img} onChange={e => setImg(e.target.value)} />
            <Button kind="tertiary" size="sm" renderIcon={Upload} onClick={async () => {
              const file = await pickFile('image/*');
              if (file) setImg(await readFileAsDataURL(file));
            }}>Upload</Button>
            {img && <Button kind="ghost" size="sm" onClick={() => setImg('')}>Remove</Button>}
          </div>
          <Checkbox id="sc-bg-all" labelText="Apply to all slides" checked={all} onChange={(_, { checked }) => setAll(checked)} />
        </div>
      </div>
    </Modal>
  );
}

function previewSlide(build: (s: Slide, ids: IdSource) => void, base: Slide): Slide {
  const s: Slide = { ...base, objects: [] };
  build(s, new IdSource(1));
  return s;
}

function LayoutDialog() {
  const index = useUi(s => s.dialogSlide);
  const deck = ed.useEditor(s => s.deck);
  const slide = deck.slides[Math.min(index, deck.slides.length - 1)];
  const t = ed.theme();
  return (
    <Modal open passiveModal modalHeading="Choose a layout" onRequestClose={closeDialog} size="lg">
      <p className="sc-dialog-hint">Applying a layout replaces the content of slide {index + 1}. Undo with {MOD}Z.</p>
      <div className="sc-preview-grid">
        {LAYOUTS.map(layout => (
          <ClickableTile key={layout.name} className="sc-preview-tile" onClick={() => { ed.applyLayout(index, layout.name); closeDialog(); }}>
            <SlideStage slide={previewSlide((s, ids) => layout.apply(s, ids, t), { ...slide, background: slide.background })} width={PREVIEW_W} />
            <span className="sc-preview-label">{layout.name}</span>
          </ClickableTile>
        ))}
      </div>
    </Modal>
  );
}

function ThemeDialog() {
  const current = ed.useEditor(s => s.deck.themeName);
  return (
    <Modal open passiveModal modalHeading="Design theme" onRequestClose={closeDialog} size="lg">
      <p className="sc-dialog-hint">A theme restyles every slide — backgrounds, fonts and colors. New slides and layouts follow it too.</p>
      <div className="sc-preview-grid">
        {THEMES.map(t => {
          const sample = createBlankSlide(t);
          const ids = new IdSource(1);
          sample.objects = [
            createTextObject(ids, { x: 80, y: 150, w: 800, h: 100, text: t.name, fontSize: 64, fontWeight: '700', textAlign: 'center' }),
            createTextObject(ids, { x: 140, y: 265, w: 680, h: 50, text: 'The quick brown fox jumps over the lazy dog', fontSize: 26, textAlign: 'center' }),
            createShapeObject(ids, 'rect', { x: 400, y: 350, w: 160, h: 12 }),
          ];
          applyThemeToSlide(sample, t);
          return (
            <ClickableTile key={t.name} className={`sc-preview-tile${t.name === current ? ' is-active' : ''}`} onClick={() => {
              ed.applyTheme(t.name);
              closeDialog();
              ed.toast('success', `Theme “${t.name}” applied`);
            }}>
              <SlideStage slide={sample} width={PREVIEW_W} />
              <span className="sc-preview-label">{t.name}{t.name === current ? ' · current' : ''}</span>
            </ClickableTile>
          );
        })}
      </div>
    </Modal>
  );
}

const SHORTCUTS: [string, string][] = [
  [`${MOD}S`, 'Save in browser'], [`${MOD}${SHIFT}S`, 'Save as PowerPoint'], [`${MOD}O`, 'Open PowerPoint'],
  [`${MOD}Z / ${MOD}${SHIFT}Z`, 'Undo / redo'], [`${MOD}C / X / V`, 'Copy / cut / paste (works across tabs)'],
  [`${MOD}D`, 'Duplicate'], [`${MOD}A`, 'Select all'], ['Shift-click / drag', 'Multi-select'],
  ['Del / Backspace', 'Delete selection'], ['Arrows / Shift+Arrows', 'Nudge 1px / 10px'],
  ['Enter', 'Edit selected text'], ['Esc', 'Stop editing / clear selection'], ['T', 'New text box'],
  [`${MOD}B / I / U`, 'Bold / italic / underline'], [`${MOD}] / [`, 'Bring forward / send backward'],
  [`${MOD}${SHIFT}] / [`, 'Bring to front / send to back'], ['Alt while dragging', 'Disable smart guides'],
  ['Shift while resizing', 'Keep aspect ratio'], [`${MOD}M`, 'New slide'], ['PageUp / PageDown', 'Previous / next slide'],
  ['F5 / Shift+F5', 'Present from current / first slide'], [`${ALT}F5`, 'Presenter view'],
  ['→ Space / ←', 'Next / previous (presenting)'], ['B / W', 'Black / white screen (presenting)'],
  ['Number + Enter', 'Jump to slide (presenting)'],
];

function ShortcutsDialog() {
  return (
    <Modal open passiveModal modalHeading="Keyboard shortcuts" onRequestClose={closeDialog}>
      <dl className="sc-shortcuts">
        {SHORTCUTS.map(([k, v]) => (<div key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></div>))}
      </dl>
    </Modal>
  );
}

function AboutDialog() {
  return (
    <Modal open passiveModal modalHeading="About SlideCraft" onRequestClose={closeDialog} size="sm">
      <p>SlideCraft is a presentation editor built with React, TypeScript and the IBM Carbon Design System.</p>
      <p className="sc-dialog-hint">Opens and saves PowerPoint (.pptx) files, exports HTML slideshows and PDFs, and keeps your work in this browser.</p>
      <p className="sc-dialog-hint">Built by Rodrigo Vigna · MIT License</p>
    </Modal>
  );
}

function NewDialog() {
  return (
    <Modal
      open danger size="xs"
      modalHeading="Start a new presentation?"
      primaryButtonText="Discard and start new"
      secondaryButtonText="Cancel"
      onRequestClose={closeDialog}
      onRequestSubmit={() => {
        ed.loadDeck(createDeck(ed.useEditor.getState().deck.themeName));
        closeDialog();
      }}
    >
      <p>The current presentation will be replaced. You can still undo with {MOD}Z, or save it as PowerPoint first.</p>
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useUi(s => s.dialog);
  // Close dialogs when entering presentation mode
  const presenting = ed.useEditor(s => !!s.presentation);
  useEffect(() => { if (presenting) closeDialog(); }, [presenting]);
  switch (dialog) {
    case 'image': return <ImageDialog />;
    case 'background': return <BackgroundDialog />;
    case 'layout': return <LayoutDialog />;
    case 'theme': return <ThemeDialog />;
    case 'shortcuts': return <ShortcutsDialog />;
    case 'about': return <AboutDialog />;
    case 'new': return <NewDialog />;
    default: return null;
  }
}
