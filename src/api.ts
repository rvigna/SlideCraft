/* ========================================================
   window.slidecraft — automation API for the browser console,
   Playwright/Puppeteer scripts and browser extensions.
   Every call goes through the same store as the UI, so changes
   are undoable, auto-saved and rendered immediately.
   ======================================================== */
import * as ed from './store/editor';
import type { AlignMode, ZOrder } from './model/geometry';
import type {
  ChartObject, ChartType, Deck, ShapeType, Slide, SlideObject, TableObject, TextObject,
} from './model/types';
import {
  createChartObject, createIconObject, createImageObject, createShapeObject, createTableObject, createTextObject, IdSource,
} from './model/factory';
import { LAYOUTS } from './model/layouts';
import { THEMES, getTheme, isHeadingSize } from './model/themes';
import { ICON_NAMES } from './model/icons';
import { plainToHtml, sanitizeHtml, htmlToPlain } from './model/richtext';
import { seriesColor, tableColors } from './model/palette';
import { imageSize } from './io/images';
import { exportJsonFile, printDeck, saveToBrowser } from './io/files';
import { lintDeck, type LintIssue } from './model/lint';
import { fixAll, lintContext } from './components/lintActions';
import { deckToMarkdown, markdownToDeck } from './model/markdown';
import { safeFileName, downloadBlob } from './io/images';

type Box = Partial<Pick<SlideObject, 'x' | 'y' | 'w' | 'h' | 'rotation' | 'opacity'>>;
type Target = { slide?: number };
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function slideIndex(i?: number): number {
  const s = ed.useEditor.getState();
  const index = i ?? s.slideIndex;
  if (!Number.isInteger(index) || index < 0 || index >= s.deck.slides.length) {
    throw new RangeError(`slidecraft: no slide ${index} (deck has ${s.deck.slides.length})`);
  }
  return index;
}

/** Add objects to a slide (current by default); returns their ids */
function add(make: (ids: IdSource) => SlideObject[], target: Target = {}): number[] {
  const index = slideIndex(target.slide);
  let added: number[] = [];
  ed.commit((d, ids) => {
    const objs = make(ids);
    added = objs.map(o => o.id);
    d.slides[index].objects.push(...objs);
  });
  if (index === ed.useEditor.getState().slideIndex) ed.select(added);
  return added;
}

function locate(id: number): { slide: number; object: SlideObject } {
  const slides = ed.useEditor.getState().deck.slides;
  for (let i = 0; i < slides.length; i++) {
    const object = slides[i].objects.find(o => o.id === id);
    if (object) return { slide: i, object };
  }
  throw new Error(`slidecraft: no object with id ${id}`);
}

const t = () => ed.theme();

export const api = {
  version: '2.0',

  /** Print the API reference to the console */
  help() {
    console.log(HELP);
    return 'See the table above, or the README section "Automation API".';
  },

  // ---------------- Reading ----------------
  /** A copy of the whole deck (title, theme, slides, objects) */
  getDeck: (): Deck => clone(ed.useEditor.getState().deck),
  getSlides: (): Slide[] => clone(ed.useEditor.getState().deck.slides),
  getSlide: (i?: number): Slide => clone(ed.useEditor.getState().deck.slides[slideIndex(i)]),
  getObject: (id: number): SlideObject => clone(locate(id).object),
  /** Objects on a slide, optionally filtered by type or matching text */
  find(query: { type?: SlideObject['type']; text?: string | RegExp; slide?: number } = {}): SlideObject[] {
    const slides = ed.useEditor.getState().deck.slides;
    const pool = query.slide != null ? slides[slideIndex(query.slide)].objects : slides.flatMap(s => s.objects);
    return clone(pool.filter(o => {
      if (query.type && o.type !== query.type) return false;
      if (query.text != null) {
        const text = 'text' in o ? htmlToPlain(o.text) : o.type === 'table' ? o.rows.flat().map(c => c.text).join(' ') : o.type === 'chart' ? o.title : '';
        return typeof query.text === 'string' ? text.includes(query.text) : query.text.test(text);
      }
      return true;
    }));
  },
  get currentSlide() { return ed.useEditor.getState().slideIndex; },
  get slideCount() { return ed.useEditor.getState().deck.slides.length; },
  get selection() { return [...ed.useEditor.getState().selection]; },
  themes: () => THEMES.map(th => th.name),
  layouts: () => LAYOUTS.map(l => l.name),
  icons: () => [...ICON_NAMES],

  // ---------------- Deck ----------------
  /** Replace the deck with JSON (same shape as getDeck / File › Download JSON) */
  load(deck: unknown) { ed.loadDeck(clone(deck)); return api.slideCount; },
  newDeck(theme = 'Carbon') {
    ed.loadDeck({ title: 'Untitled Presentation', themeName: getTheme(theme).name, slides: [] });
    return api.slideCount;
  },
  setTitle(title: string) { ed.setTitle(String(title)); },
  setTheme(name: string) {
    if (!THEMES.some(th => th.name === name)) throw new Error(`slidecraft: unknown theme "${name}". Try: ${api.themes().join(', ')}`);
    ed.applyTheme(name);
  },

  // ---------------- Slides ----------------
  /** Add a slide after `after` (default: current), optionally from a layout; returns its index */
  addSlide(opts: { layout?: string; after?: number; background?: string; notes?: string } = {}): number {
    const after = opts.after ?? ed.useEditor.getState().slideIndex;
    ed.batch(() => {
      ed.addSlide(after);
      const index = after + 1;
      if (opts.layout) {
        if (!LAYOUTS.some(l => l.name === opts.layout)) throw new Error(`slidecraft: unknown layout "${opts.layout}". Try: ${api.layouts().join(', ')}`);
        ed.applyLayout(index, opts.layout);
      }
      if (opts.background || opts.notes) api.updateSlide(index, { background: opts.background, notes: opts.notes });
    });
    return after + 1;
  },
  updateSlide(i: number, patch: Partial<Pick<Slide, 'background' | 'backgroundImage' | 'notes' | 'transition' | 'transitionDuration'>>) {
    const index = slideIndex(i);
    ed.commit(d => {
      Object.entries(patch).forEach(([k, v]) => { if (v !== undefined) (d.slides[index] as unknown as Record<string, unknown>)[k] = v; });
      if (patch.background) d.slides[index].backgroundImage = patch.backgroundImage ?? '';
    });
  },
  duplicateSlide: (i?: number) => { ed.duplicateSlide(slideIndex(i)); return ed.useEditor.getState().slideIndex; },
  deleteSlide: (i?: number) => ed.deleteSlide(slideIndex(i)),
  /** Move slide `from` to position `to` */
  moveSlide: (from: number, to: number) => ed.moveSlide(slideIndex(from), to > from ? to + 1 : to),
  goToSlide: (i: number) => ed.goToSlide(slideIndex(i)),
  applyLayout: (i: number, layout: string) => ed.applyLayout(slideIndex(i), layout),

  // ---------------- Objects ----------------
  /** Add a text box. Plain text by default; pass { html: true } for rich text. Returns the id. */
  addText(text: string, opts: Box & Partial<Omit<TextObject, 'id' | 'type' | 'text'>> & Target & { html?: boolean } = {}): number {
    const { slide, html, ...rest } = opts;
    const heading = isHeadingSize(rest.fontSize ?? 24, rest.fontWeight ?? '400');
    return add(ids => [createTextObject(ids, {
      x: 120, y: 120, w: 720, h: 80, fontFamily: heading ? t().headingFont : t().bodyFont, color: heading ? t().heading : t().body,
      ...rest, text: html ? sanitizeHtml(text) : plainToHtml(String(text)),
    })], { slide })[0];
  },
  /** Bulleted list from an array; nest arrays for sub-bullets */
  addBullets(items: unknown[], opts: Box & Partial<Omit<TextObject, 'id' | 'type' | 'text'>> & Target = {}): number {
    type Items = (string | Items)[];
    // A nested array holds the sub-bullets of the item before it
    const list = (entries: Items): string => `<ul>${entries.map((it, i) => {
      if (Array.isArray(it)) return '';
      const next = entries[i + 1];
      return `<li>${plainToHtml(it)}${Array.isArray(next) ? list(next) : ''}</li>`;
    }).join('')}</ul>`;
    return api.addText(list(items as Items), { h: 300, fontSize: 22, ...opts, html: true });
  },
  addShape(shapeType: ShapeType, opts: Box & Partial<Omit<Extract<SlideObject, { type: 'shape' }>, 'id' | 'type' | 'shapeType'>> & Target = {}): number {
    const { slide, ...rest } = opts;
    return add(ids => [createShapeObject(ids, shapeType, { backgroundColor: t().accent, borderColor: t().accent, fontFamily: t().bodyFont, ...rest })], { slide })[0];
  },
  /** Add an image by URL or data URL; sized to its natural aspect ratio unless w/h given */
  async addImage(src: string, opts: Box & Target & { objectFit?: 'cover' | 'contain' | 'fill' } = {}): Promise<number> {
    const { slide, ...rest } = opts;
    let { w, h } = rest;
    if (w == null || h == null) {
      const nat = await imageSize(src);
      const fit = Math.min(1, 480 / nat.w, 360 / nat.h);
      w ??= h != null ? Math.round(h * nat.w / nat.h) : Math.round(nat.w * fit);
      h ??= Math.round(w * nat.h / nat.w);
    }
    return add(ids => [createImageObject(ids, src, { x: (960 - w!) / 2, y: (540 - h!) / 2, ...rest, w, h })], { slide })[0];
  },
  addIcon(name: string, opts: Box & Target & { color?: string } = {}): number {
    if (!ICON_NAMES.includes(name)) throw new Error(`slidecraft: unknown icon "${name}". See slidecraft.icons()`);
    const { slide, ...rest } = opts;
    return add(ids => [createIconObject(ids, name, { color: t().accent, ...rest })], { slide })[0];
  },
  /** Add a table from rows of cell text; the first row is the header */
  addTable(rows: (string | number)[][], opts: Box & Partial<Omit<TableObject, 'id' | 'type' | 'rows'>> & Target = {}): number {
    const { slide, ...rest } = opts;
    const cols = Math.max(1, ...rows.map(r => r.length));
    return add(ids => {
      const table = createTableObject(ids, rows.length, cols, {
        x: 120, y: 140, w: 720, h: 44 * rows.length, fontFamily: t().bodyFont, color: t().body,
        ...tableColors(t().accent, t().bg), ...rest,
      });
      table.rows = rows.map(r => Array.from({ length: cols }, (_, c) => ({ text: String(r[c] ?? '') })));
      return [table];
    }, { slide })[0];
  },
  /**
   * Add a chart: slidecraft.addChart('column', { categories: ['Q1','Q2'], series: [{ name: 'Sales', values: [3, 5] }] })
   */
  addChart(chartType: ChartType, data: { categories: string[]; series: { name: string; values: number[]; color?: string }[]; title?: string } & Box & Target & Partial<Pick<ChartObject, 'showLegend' | 'showValues'>>): number {
    const { slide, categories, series, ...rest } = data;
    return add(ids => [createChartObject(ids, chartType, {
      fontFamily: t().bodyFont, color: t().body, title: '', ...rest,
      categories: categories.map(String),
      series: series.map((s, i) => ({ name: s.name, values: categories.map((_, k) => Number(s.values[k]) || 0), color: s.color ?? seriesColor(i, t().accent) })),
    })], { slide })[0];
  },
  /** Change any properties of an object, e.g. update(id, { x: 100, color: '#da1e28' }) */
  update(id: number, patch: Partial<SlideObject> & { text?: string }) {
    const { slide } = locate(id);
    ed.commit(d => {
      const o = d.slides[slide].objects.find(x => x.id === id);
      if (!o) return;
      const { id: _ignore, type: _t, ...rest } = patch as Record<string, unknown>;
      void _ignore; void _t;
      if (typeof rest.text === 'string' && o.type === 'text' && !/<[a-z][\s\S]*>/i.test(rest.text)) rest.text = plainToHtml(rest.text);
      if (typeof rest.text === 'string' && o.type === 'text') rest.text = sanitizeHtml(rest.text as string);
      Object.assign(o, rest);
    });
  },
  remove(ids: number | number[]) {
    const set = new Set(Array.isArray(ids) ? ids : [ids]);
    ed.commit(d => d.slides.forEach(s => { s.objects = s.objects.filter(o => !set.has(o.id)); }));
  },
  select(ids: number | number[]) {
    const list = Array.isArray(ids) ? ids : [ids];
    if (list.length) api.goToSlide(locate(list[0]).slide);
    ed.select(list.filter(id => locate(id).slide === ed.useEditor.getState().slideIndex));
  },
  selectAll: () => ed.selectAll(),
  clearSelection: () => ed.clearSelection(),
  /** Align the selection (or the given ids) — to the slide when only one object */
  align(mode: AlignMode, ids?: number[]) { if (ids) api.select(ids); ed.alignSelection(mode); },
  distribute(axis: 'h' | 'v', ids?: number[]) { if (ids) api.select(ids); ed.distributeSelection(axis); },
  arrange(mode: ZOrder, ids?: number[]) { if (ids) api.select(ids); ed.reorderSelection(mode); },

  // ---------------- History ----------------
  undo: () => ed.undo(),
  redo: () => ed.redo(),
  /** Run several API calls as one undo step: slidecraft.batch(() => { … }) */
  batch: <T>(fn: () => T): T => ed.batch(fn),

  // ---------------- Files ----------------
  save: () => saveToBrowser(),
  /** Build the .pptx; returns a Blob (and downloads it unless { download: false }) */
  async exportPptx(opts: { download?: boolean; filename?: string } = {}): Promise<Blob> {
    const { deckToPptx } = await import('./io/pptxExport');
    const { blob } = await deckToPptx(ed.useEditor.getState().deck);
    if (opts.download !== false) downloadBlob(blob, opts.filename ?? `${safeFileName(ed.useEditor.getState().deck.title)}.pptx`);
    return blob;
  },
  /** Open a .pptx from a URL, Blob, File or ArrayBuffer; returns import warnings */
  async openPptx(source: string | Blob | ArrayBuffer): Promise<string[]> {
    const data = typeof source === 'string' ? await (await fetch(source)).arrayBuffer() : source instanceof Blob ? await source.arrayBuffer() : source;
    const { pptxToDeck } = await import('./io/pptxImport');
    const { deck, warnings } = await pptxToDeck(data, typeof source === 'string' ? source.split('/').pop() : undefined);
    ed.loadDeck(deck);
    return warnings;
  },
  /** Self-contained HTML slideshow (async: the renderer loads on first use) */
  exportHtml: async (): Promise<string> => (await import('./io/htmlExport')).deckToHtml(ed.useEditor.getState().deck),
  exportJson: (opts: { download?: boolean } = {}): string => {
    if (opts.download) exportJsonFile();
    return JSON.stringify(ed.useEditor.getState().deck, null, 2);
  },
  print: () => printDeck(),

  // ---------------- Design check ----------------
  /** Design issues (overflow, contrast, off-slide, tiny text, fonts, alignment, crowding…) */
  lint: (): LintIssue[] => clone(lintDeck(ed.useEditor.getState().deck, lintContext())),
  /** Apply automatic fixes (all, or the given issue keys) as one undo step; returns how many were fixed */
  fixIssues(keys?: string[]): number {
    const issues = lintDeck(ed.useEditor.getState().deck, lintContext()).filter(i => !keys || keys.includes(i.key));
    return fixAll(issues);
  },

  // ---------------- Markdown ----------------
  /** The deck as Markdown (decks-as-code format) */
  toMarkdown: (): string => deckToMarkdown(ed.useEditor.getState().deck),
  /** Replace the deck with one built from Markdown; returns the slide count */
  fromMarkdown(md: string): number { ed.loadDeck(markdownToDeck(String(md))); return api.slideCount; },

  // ---------------- AI ----------------
  /** Ask the AI assistant to change the deck (needs an Anthropic API key, set in the panel or via setApiKey) */
  async ask(prompt: string): Promise<string> {
    const { runAssistant, useAssistant } = await import('./ai/assistant');
    await runAssistant(prompt);
    const items = useAssistant.getState().items;
    const errors = items.filter(i => i.kind === 'error');
    const last = [...items].reverse().find(i => i.kind === 'assistant');
    if (errors.length && items.indexOf(errors[errors.length - 1]) > items.indexOf(last!)) throw new Error(errors[errors.length - 1].text);
    return last?.text ?? '';
  },
  setApiKey: async (key: string) => (await import('./ai/assistant')).setApiKey(key),

  // ---------------- Presenting ----------------
  present: (from = 0) => ed.startPresentation(slideIndex(from)),
  presenterView: (from = 0) => ed.startPresentation(slideIndex(from), true),
  next: () => { const p = ed.useEditor.getState().presentation; if (p) ed.setPresentationIndex(p.index + 1); },
  prev: () => { const p = ed.useEditor.getState().presentation; if (p) ed.setPresentationIndex(p.index - 1); },
  exitPresentation: () => ed.exitPresentation(),

  // ---------------- Events ----------------
  /** Call `fn(deck)` after every change to the deck; returns an unsubscribe function */
  onChange(fn: (deck: Deck) => void): () => void {
    return ed.useEditor.subscribe((s, prev) => { if (s.deck !== prev.deck) fn(clone(s.deck)); });
  },
  /** Show a notification in the app */
  notify: (title: string, kind: 'info' | 'success' | 'warning' | 'error' = 'info') => ed.toast(kind, title),
};

export type SlideCraftAPI = typeof api;

const HELP = `
SlideCraft automation API  —  window.slidecraft  (v${api.version})

READ      getDeck() · getSlides() · getSlide(i) · getObject(id) · find({ type, text, slide })
          currentSlide · slideCount · selection · themes() · layouts() · icons()
DECK      newDeck(theme) · load(json) · setTitle(t) · setTheme(name)
SLIDES    addSlide({ layout, after, background, notes }) · updateSlide(i, patch) · duplicateSlide(i)
          deleteSlide(i) · moveSlide(from, to) · goToSlide(i) · applyLayout(i, name)
OBJECTS   addText(text, opts) · addBullets(['a', ['sub'], 'b']) · addShape(type, opts) · addImage(src, opts)
          addIcon(name, opts) · addTable(rows, opts) · addChart(type, { categories, series, title })
          update(id, patch) · remove(id|ids) · select(ids) · selectAll() · align(mode) · distribute('h'|'v')
          arrange('front'|'back'|'forward'|'backward')
HISTORY   undo() · redo() · batch(fn)  — batch makes many calls one undo step
DESIGN    lint() · fixIssues(keys?)
MARKDOWN  toMarkdown() · fromMarkdown(md)
AI        ask(prompt) · setApiKey(key)
FILES     exportPptx({ download }) · openPptx(url|Blob|ArrayBuffer) · exportHtml() · exportJson() · save() · print()
PRESENT   present(i) · presenterView(i) · next() · prev() · exitPresentation()
EVENTS    onChange(fn) → unsubscribe · notify(title, kind)

All geometry is in slide units (960 × 540). opts accept x, y, w, h, rotation, opacity and
any object property (fontSize, color, backgroundColor…), plus { slide: index }.

Example:
  slidecraft.batch(() => {
    const s = slidecraft.addSlide({ layout: 'Blank' });
    slidecraft.addText('Quarterly results', { slide: s, fontSize: 40, fontWeight: '700' });
    slidecraft.addChart('column', { slide: s, y: 140, categories: ['Q1','Q2','Q3'],
      series: [{ name: 'Revenue', values: [12, 18, 25] }] });
  });
`;

declare global {
  interface Window { slidecraft: SlideCraftAPI }
}

export function installApi() {
  window.slidecraft = api;
  console.info('%cSlideCraft%c automation API ready — type slidecraft.help()', 'font-weight:bold;color:#0f62fe', 'color:inherit');
}
