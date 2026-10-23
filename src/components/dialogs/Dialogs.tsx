import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { deckToMarkdown, markdownToDeck, slidesFromMarkdown } from '../../model/markdown';
import { Button, Checkbox, ClickableTile, ContentSwitcher, Modal, Select, SelectItem, Switch, TextInput } from '@carbon/react';
import { ChartView } from '../ChartView';
import { MotionWizard } from './MotionWizard';
import { seriesColor } from '../../model/palette';
import { Upload } from '@carbon/icons-react';
import { closeDialog, useUi } from '../../store/ui';
import * as ed from '../../store/editor';
import { createBlankSlide, createDeck, IdSource } from '../../model/factory';
import { LAYOUTS } from '../../model/layouts';
import { applyThemeToSlide, THEMES } from '../../model/themes';
import { createTextObject, createShapeObject } from '../../model/factory';
import type { ChartObject, ChartType, Deck, Slide } from '../../model/types';
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

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: 'column', label: 'Column' }, { value: 'bar', label: 'Bar' }, { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' }, { value: 'pie', label: 'Pie' }, { value: 'doughnut', label: 'Doughnut' },
];

function ChartDialog() {
  const chart = ed.useEditor(s => ed.primaryObject(s));
  const [draft, setDraft] = useState(() => (chart?.type === 'chart' ? JSON.parse(JSON.stringify(chart)) as ChartObject : null));
  if (!draft || chart?.type !== 'chart') return null;
  const update = (fn: (d: ChartObject) => void) => setDraft(d => { const copy = JSON.parse(JSON.stringify(d)) as ChartObject; fn(copy); return copy; });
  const isPie = draft.chartType === 'pie' || draft.chartType === 'doughnut';

  return (
    <Modal
      open size="lg"
      modalHeading="Edit chart"
      primaryButtonText="Apply"
      secondaryButtonText="Cancel"
      onRequestClose={closeDialog}
      onRequestSubmit={() => {
        const id = chart.id;
        ed.commitSlide(slide => {
          const i = slide.objects.findIndex(o => o.id === id);
          if (i >= 0) slide.objects[i] = { ...draft, id, x: slide.objects[i].x, y: slide.objects[i].y, w: slide.objects[i].w, h: slide.objects[i].h };
        });
        closeDialog();
      }}
    >
      <div className="sc-chart-dialog">
        <div className="sc-chart-editor">
          <div className="sc-chart-options">
            <Select id="sc-chart-type" size="sm" labelText="Chart type" value={draft.chartType} onChange={e => update(d => { d.chartType = e.target.value as ChartType; })}>
              {CHART_TYPES.map(t => <SelectItem key={t.value} value={t.value} text={t.label} />)}
            </Select>
            <TextInput id="sc-chart-title" size="sm" labelText="Title" value={draft.title} onChange={e => update(d => { d.title = e.target.value; })} />
          </div>
          <div className="sc-chart-options">
            <Checkbox id="sc-chart-legend" labelText="Show legend" checked={draft.showLegend} onChange={(_, { checked }) => update(d => { d.showLegend = checked; })} />
            <Checkbox id="sc-chart-values" labelText={isPie ? 'Show percentages' : 'Show values'} checked={draft.showValues} onChange={(_, { checked }) => update(d => { d.showValues = checked; })} />
          </div>
          <div className="sc-data-grid-wrap">
            <table className="sc-data-grid">
              <thead>
                <tr>
                  <th />
                  {draft.series.map((s, si) => (
                    <th key={si}>
                      <span className="sc-data-series">
                        <input type="color" aria-label={`Color of ${s.name}`} value={'#' + toHex6(s.color).toLowerCase()} onChange={e => update(d => { d.series[si].color = e.target.value; })} />
                        <input className="cds--text-input cds--text-input--sm" aria-label="Series name" value={s.name} onChange={e => update(d => { d.series[si].name = e.target.value; })} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draft.categories.map((cat, ci) => (
                  <tr key={ci}>
                    <th><input className="cds--text-input cds--text-input--sm" aria-label="Category" value={cat} onChange={e => update(d => { d.categories[ci] = e.target.value; })} /></th>
                    {draft.series.map((s, si) => (
                      <td key={si}>
                        <input className="cds--text-input cds--text-input--sm" type="number" aria-label={`${s.name} ${cat}`} value={Number.isFinite(s.values[ci]) ? s.values[ci] : 0}
                          onChange={e => update(d => { d.series[si].values[ci] = parseFloat(e.target.value) || 0; })} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sc-dialog-row">
            <Button kind="ghost" size="sm" onClick={() => update(d => { d.categories.push(`Item ${d.categories.length + 1}`); d.series.forEach(s => s.values.push(0)); })}>Add row</Button>
            <Button kind="ghost" size="sm" disabled={draft.categories.length <= 1} onClick={() => update(d => { d.categories.pop(); d.series.forEach(s => s.values.pop()); })}>Remove row</Button>
            <Button kind="ghost" size="sm" onClick={() => update(d => { d.series.push({ name: `Series ${d.series.length + 1}`, values: d.categories.map(() => 0), color: seriesColor(d.series.length, d.series[0]?.color) }); })}>Add series</Button>
            <Button kind="ghost" size="sm" disabled={draft.series.length <= 1} onClick={() => update(d => { d.series.pop(); })}>Remove series</Button>
          </div>
          {isPie && draft.series.length > 1 && <p className="sc-dialog-hint">Pie and doughnut charts show the first series only.</p>}
        </div>
        <div className="sc-chart-preview" style={{ width: 360, height: 360 * draft.h / draft.w }}>
          <ChartView obj={{ ...draft, w: draft.w, h: draft.h }} />
        </div>
      </div>
    </Modal>
  );
}

const MD_SNIPPETS: { label: string; text: string }[] = [
  { label: 'Slide', text: '\n\n---\n\n# Title\n- Point\n- Point\n' },
  { label: 'Columns', text: '\n\n---\n\n# Compare\n### Before\n- Manual\n\n|||\n\n### After\n- Automatic\n' },
  { label: 'Cards', text: '\n\n---\n\n# Three ideas\n### Fast\nOne line about it\n### Simple\nOne line about it\n### Open\nOne line about it\n' },
  { label: 'Chart', text: '\n\n---\n\n# Revenue\n```chart column\ntitle: Revenue ($M)\ncategories: Q1, Q2, Q3\nEMEA: 90, 104, 118\nAPAC: 70, 88, 97\n```\n' },
  { label: 'Table', text: '\n\n---\n\n# Numbers\n| Region | Q2 | Q3 |\n|---|---|---|\n| EMEA | 104 | 118 |\n' },
  { label: 'Code', text: '\n\n---\n\n# Getting started\n```bash\nnpm install\nnpm run dev\n```\n' },
  { label: 'Big number', text: '\n\n---\n\n# 42%\nof customers came back within a week\n' },
  { label: 'Picture', text: '\n\n---\n\n# Our team\n![bg left](https://picsum.photos/id/1005/800/900)\n- Remote first\n- 12 countries\n' },
  { label: 'Quote', text: '\n\n---\n\n> Simplicity is the ultimate sophistication.\n\n# Leonardo da Vinci\n' },
];

function MarkdownDialog() {
  const deck = ed.useEditor(s => s.deck);
  const slideIndex = ed.useEditor(s => s.slideIndex);
  const [mode, setMode] = useState<'replace' | 'insert'>('replace');
  const [deckText, setDeckText] = useState(() => deckToMarkdown(deck));
  const [newText, setNewText] = useState('');
  const text = mode === 'replace' ? deckText : newText;
  const setText = mode === 'replace' ? setDeckText : setNewText;
  const ref = useRef<HTMLTextAreaElement>(null);
  // Parsing and drawing thumbnails can lag typing on long decks: preview the latest text when React has time
  const deferred = useDeferredValue(text);
  const preview = useMemo(() => {
    if (mode === 'insert' && !deferred.trim()) return null;
    try {
      return mode === 'replace' ? markdownToDeck(deferred) : { ...deck, slides: slidesFromMarkdown(deferred, deck, new IdSource(1)) };
    } catch { return null; }
  }, [deferred, mode, deck]);
  const insert = (snippet: string) => {
    const el = ref.current;
    const at = el ? el.selectionEnd : text.length;
    const piece = mode === 'insert' && !text.trim() ? snippet.replace(/^\n\n---\n\n/, '') : snippet;
    const next = text.slice(0, at) + piece + text.slice(at);
    setText(next);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + piece.length, at + piece.length); });
  };
  const apply = () => {
    if (!preview) return;
    if (mode === 'replace') ed.loadDeck(preview);
    else {
      let added = 0;
      ed.commit((d, ids) => {
        const slides = slidesFromMarkdown(newText, d as Deck, ids);
        added = slides.length;
        d.slides.splice(slideIndex + 1, 0, ...slides);
      });
      ed.goToSlide(slideIndex + 1);
      ed.toast('success', `Added ${added} slide${added === 1 ? '' : 's'}`);
    }
    closeDialog();
  };
  const count = preview?.slides.length ?? 0;
  return (
    <Modal
      open size="lg"
      modalHeading="Markdown"
      primaryButtonText={mode === 'replace' ? 'Replace deck' : `Add ${count || ''} slide${count === 1 ? '' : 's'} after slide ${slideIndex + 1}`}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={!preview}
      onRequestClose={closeDialog}
      onRequestSubmit={apply}
    >
      <div className="sc-md-bar">
        <ContentSwitcher size="sm" selectedIndex={mode === 'replace' ? 0 : 1} onChange={({ index }) => setMode(index === 0 ? 'replace' : 'insert')} className="sc-md-mode">
          <Switch name="replace" text="Whole deck" />
          <Switch name="insert" text="Add slides" />
        </ContentSwitcher>
        <div className="sc-md-snippets" role="group" aria-label="Insert snippet">
          {MD_SNIPPETS.map(s => <Button key={s.label} kind="ghost" size="sm" onClick={() => insert(s.text)}>{s.label}</Button>)}
        </div>
      </div>
      <div className="sc-md-dialog">
        <textarea
          ref={ref} className="sc-md-editor" spellCheck={false} aria-label="Markdown" value={text}
          placeholder={'Paste notes, an outline or a README.\n\n# Each heading starts a slide\n- bullets, tables, ```chart blocks, images…\n\nOr use the snippet buttons above.'}
          onChange={e => setText(e.target.value)}
        />
        <div className="sc-md-preview" aria-label="Preview">
          <p className="sc-md-count" aria-live="polite">{count ? `${count} slide${count === 1 ? '' : 's'}` : 'Preview'}</p>
          {preview?.slides.map((s, i) => (
            <div key={i} className="sc-md-thumb"><span>{mode === 'insert' ? slideIndex + 2 + i : i + 1}</span><SlideStage slide={s} width={200} /></div>
          ))}
        </div>
      </div>
      <p className="sc-dialog-hint">
        Slides are separated by “---”. Without separators, each “#” heading starts a slide (each “##” when there’s a single “#” title).
        “|||” starts a column, “###” sections become cards, “![bg left](url)” adds a half-slide picture, long lists continue onto extra slides.
        Front matter can set <code>theme</code>, <code>motion</code>, <code>footer</code> and <code>paginate: true</code>. Undo with {MOD}Z.
      </p>
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
  // Capture phase: Carbon tooltips inside the modal would otherwise swallow Escape
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !useUi.getState().menu) { e.stopPropagation(); closeDialog(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dialog]);
  switch (dialog) {
    case 'image': return <ImageDialog />;
    case 'background': return <BackgroundDialog />;
    case 'layout': return <LayoutDialog />;
    case 'theme': return <ThemeDialog />;
    case 'shortcuts': return <ShortcutsDialog />;
    case 'about': return <AboutDialog />;
    case 'new': return <NewDialog />;
    case 'chart': return <ChartDialog />;
    case 'markdown': return <MarkdownDialog />;
    case 'motion': return <MotionWizard />;
    default: return null;
  }
}
