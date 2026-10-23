import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { Deck, Slide, SlideObject } from '../model/types';
import { createBlankSlide, createDeck, IdSource, newSlideId, normalizeDeck } from '../model/factory';
import { applyThemeToSlide, getTheme, type DeckTheme } from '../model/themes';
import { alignObjects, distributeObjects, reorder, type AlignMode, type ZOrder } from '../model/geometry';
import { LAYOUTS } from '../model/layouts';

interface HistoryEntry { deck: Deck; slideIndex: number }

export interface Toast { id: number; kind: 'success' | 'error' | 'info' | 'warning'; title: string; subtitle?: string }

export interface ClipboardData { slideId: string; objects: SlideObject[] }

export interface EditorState {
  deck: Deck;
  slideIndex: number;
  /** Selected object ids on the current slide, in selection order */
  selection: number[];
  /** The object the properties panel shows */
  primaryId: number | null;
  editingId: number | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
  zoom: number;
  dirty: boolean;
  savedAt: number | null;
  saveError: string | null;
  presentation: { index: number; presenter: boolean } | null;
  toasts: Toast[];
}

const HISTORY_LIMIT = 100;
const COALESCE_MS = 1500;

let coalesceKey: string | null = null;
let coalesceAt = 0;
let gestureBase: HistoryEntry | null = null;
let batchDepth = 0;
let batchBase: HistoryEntry | null = null;
let clipboard: ClipboardData | null = null;
let pasteCount = 0;
let toastId = 1;

export const useEditor = create<EditorState>(() => ({
  deck: createDeck(),
  slideIndex: 0,
  selection: [],
  primaryId: null,
  editingId: null,
  past: [],
  future: [],
  zoom: 100,
  dirty: false,
  savedAt: null,
  saveError: null,
  presentation: null,
  toasts: [],
}));

const get = useEditor.getState;
const set = useEditor.setState;

// ---------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------
export const currentSlide = (s: EditorState = get()): Slide => s.deck.slides[s.slideIndex];
export const theme = (s: EditorState = get()): DeckTheme => getTheme(s.deck.themeName);
export function selectedObjects(s: EditorState = get()): SlideObject[] {
  const ids = new Set(s.selection);
  return currentSlide(s).objects.filter(o => ids.has(o.id));
}
export function primaryObject(s: EditorState = get()): SlideObject | null {
  return currentSlide(s).objects.find(o => o.id === s.primaryId) ?? null;
}
export const hasClipboard = () => !!clipboard?.objects.length;

// ---------------------------------------------------------------
// History
// ---------------------------------------------------------------
type Recipe = (deck: Draft<Deck>, ids: IdSource) => void;

function runRecipe(deck: Deck, recipe: Recipe): Deck {
  return produce(deck, d => {
    const ids = new IdSource(d.nextObjectId);
    recipe(d, ids);
    d.nextObjectId = ids.next;
  });
}

/** Keep the selection consistent with whatever is on the current slide */
function pruneSelection(deck: Deck, slideIndex: number, selection: number[], primaryId: number | null) {
  const ids = new Set(deck.slides[slideIndex]?.objects.map(o => o.id) ?? []);
  const sel = selection.filter(id => ids.has(id));
  const primary = primaryId != null && ids.has(primaryId) ? primaryId : sel[sel.length - 1] ?? null;
  return { selection: sel, primaryId: primary };
}

/**
 * Apply an undoable change to the deck.
 * Changes sharing a `coalesce` key within a short window (dragging a color picker
 * or slider) collapse into a single undo step.
 */
export function commit(recipe: Recipe, opts: { coalesce?: string; slideIndex?: number } = {}): void {
  const s = get();
  const next = runRecipe(s.deck, recipe);
  if (next === s.deck) return;
  const now = Date.now();
  // Inside batch() the whole run becomes one undo step, recorded when the batch ends
  const merge = batchDepth > 0 || (!!opts.coalesce && opts.coalesce === coalesceKey && now - coalesceAt < COALESCE_MS);
  coalesceKey = opts.coalesce ?? null;
  coalesceAt = now;
  const slideIndex = Math.min(opts.slideIndex ?? s.slideIndex, next.slides.length - 1);
  set({
    deck: next,
    slideIndex,
    past: merge ? s.past : [...s.past, { deck: s.deck, slideIndex: s.slideIndex }].slice(-HISTORY_LIMIT),
    future: [],
    dirty: true,
    ...pruneSelection(next, slideIndex, s.selection, s.primaryId),
  });
}

/** Change applied to the current slide */
export function commitSlide(fn: (slide: Draft<Slide>, ids: IdSource, deck: Draft<Deck>) => void, opts?: { coalesce?: string }) {
  const index = get().slideIndex;
  commit((d, ids) => fn(d.slides[index], ids, d), opts);
}

/** Change applied to every selected object passing `filter` */
export function commitSelection(fn: (o: Draft<SlideObject>) => void, filter: (o: SlideObject) => boolean = () => true, opts?: { coalesce?: string }) {
  const ids = new Set(get().selection);
  if (!ids.size) return;
  commitSlide(slide => slide.objects.forEach(o => { if (ids.has(o.id) && filter(o as SlideObject)) fn(o); }), opts);
}

export function endCoalesce() { coalesceKey = null; }

/** Run several changes as a single undo step (used by the automation API) */
export function batch<T>(fn: () => T): T {
  if (batchDepth === 0) {
    const s = get();
    batchBase = { deck: s.deck, slideIndex: s.slideIndex };
  }
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0 && batchBase) {
      const s = get();
      if (s.deck !== batchBase.deck) set({ past: [...s.past, batchBase].slice(-HISTORY_LIMIT), future: [], dirty: true });
      batchBase = null;
    }
  }
}

/** Start a drag/resize/rotate: intermediate states skip history until endGesture() */
export function beginGesture() {
  const s = get();
  gestureBase = { deck: s.deck, slideIndex: s.slideIndex };
}

export function gestureUpdate(fn: (slide: Draft<Slide>) => void) {
  const s = get();
  const index = s.slideIndex;
  set({ deck: produce(s.deck, d => fn(d.slides[index])) });
}

export function endGesture() {
  const s = get();
  if (gestureBase && gestureBase.deck !== s.deck) {
    set({ past: [...s.past, gestureBase].slice(-HISTORY_LIMIT), future: [], dirty: true });
  }
  gestureBase = null;
  coalesceKey = null;
}

export function undo() {
  const s = get();
  const prev = s.past[s.past.length - 1];
  if (!prev) return;
  coalesceKey = null;
  set({
    deck: prev.deck,
    slideIndex: Math.min(prev.slideIndex, prev.deck.slides.length - 1),
    past: s.past.slice(0, -1),
    future: [{ deck: s.deck, slideIndex: s.slideIndex }, ...s.future],
    editingId: null,
    dirty: true,
    ...pruneSelection(prev.deck, Math.min(prev.slideIndex, prev.deck.slides.length - 1), s.selection, s.primaryId),
  });
}

export function redo() {
  const s = get();
  const next = s.future[0];
  if (!next) return;
  coalesceKey = null;
  set({
    deck: next.deck,
    slideIndex: Math.min(next.slideIndex, next.deck.slides.length - 1),
    past: [...s.past, { deck: s.deck, slideIndex: s.slideIndex }],
    future: s.future.slice(1),
    editingId: null,
    dirty: true,
    ...pruneSelection(next.deck, Math.min(next.slideIndex, next.deck.slides.length - 1), s.selection, s.primaryId),
  });
}

/** Replace the whole deck (open file, new presentation). Undoable unless `resetHistory`. */
export function loadDeck(raw: unknown, opts: { resetHistory?: boolean } = {}) {
  const deck = normalizeDeck(raw);
  const s = get();
  set({
    deck,
    slideIndex: 0,
    selection: [],
    primaryId: null,
    editingId: null,
    past: opts.resetHistory ? [] : [...s.past, { deck: s.deck, slideIndex: s.slideIndex }].slice(-HISTORY_LIMIT),
    future: [],
    dirty: !opts.resetHistory,
  });
}

// ---------------------------------------------------------------
// Selection
// ---------------------------------------------------------------
export function select(ids: number[], primary?: number | null) {
  const unique = [...new Set(ids)];
  set({ selection: unique, primaryId: primary !== undefined ? primary : unique[unique.length - 1] ?? null });
}
export const clearSelection = () => set({ selection: [], primaryId: null });
export function toggleSelected(id: number) {
  const s = get();
  if (s.selection.includes(id)) {
    const rest = s.selection.filter(x => x !== id);
    set({ selection: rest, primaryId: s.primaryId === id ? rest[rest.length - 1] ?? null : s.primaryId });
  } else {
    set({ selection: [...s.selection, id], primaryId: id });
  }
}
export const selectAll = () => {
  set({ editingId: null });
  select(currentSlide().objects.map(o => o.id));
};
export const setEditing = (id: number | null) => set({ editingId: id });

// ---------------------------------------------------------------
// Slides
// ---------------------------------------------------------------
export function goToSlide(index: number) {
  const s = get();
  if (index < 0 || index >= s.deck.slides.length || index === s.slideIndex) return;
  set({ slideIndex: index, selection: [], primaryId: null, editingId: null });
}

export function addSlide(afterIndex = get().slideIndex) {
  commit(d => { d.slides.splice(afterIndex + 1, 0, createBlankSlide(getTheme(d.themeName))); }, { slideIndex: afterIndex + 1 });
  clearSelection();
}

export function duplicateSlide(index = get().slideIndex) {
  commit((d, ids) => {
    const dup = JSON.parse(JSON.stringify(d.slides[index])) as Slide;
    dup.id = newSlideId();
    dup.objects.forEach(o => { o.id = ids.take(); });
    d.slides.splice(index + 1, 0, dup);
  }, { slideIndex: index + 1 });
  clearSelection();
}

export function deleteSlide(index = get().slideIndex) {
  const s = get();
  if (s.deck.slides.length <= 1) return;
  const nextIndex = s.slideIndex > index || s.slideIndex === s.deck.slides.length - 1 ? s.slideIndex - 1 : s.slideIndex;
  commit(d => { d.slides.splice(index, 1); }, { slideIndex: Math.max(0, nextIndex) });
  clearSelection();
}

/** Move slide `from` so it lands before the slide currently at `to` */
export function moveSlide(from: number, to: number) {
  if (to > from) to--;
  if (from === to || from < 0) return;
  commit(d => {
    const [moved] = d.slides.splice(from, 1);
    d.slides.splice(to, 0, moved);
  }, { slideIndex: to });
  clearSelection();
}

export function applyLayout(index: number, layoutName: string) {
  const layout = LAYOUTS.find(l => l.name === layoutName);
  if (!layout) return;
  commit((d, ids) => layout.apply(d.slides[index] as Slide, ids, getTheme(d.themeName)), { slideIndex: index });
  clearSelection();
}

export function applyTheme(name: string) {
  const t = getTheme(name);
  commit(d => {
    const previous = getTheme(d.themeName);
    d.themeName = t.name;
    d.slides.forEach(slide => applyThemeToSlide(slide as Slide, t, previous));
  });
}

export function setTitle(title: string) {
  commit(d => { d.title = title; }, { coalesce: 'title' });
}

// ---------------------------------------------------------------
// Objects
// ---------------------------------------------------------------
/** Add objects built by `make` to the current slide and select them */
export function addObjects(make: (ids: IdSource, t: DeckTheme) => SlideObject[]) {
  let added: number[] = [];
  commitSlide((slide, ids, d) => {
    const objs = make(ids, getTheme(d.themeName));
    added = objs.map(o => o.id);
    slide.objects.push(...objs);
  });
  select(added);
  return added;
}

export function deleteSelection() {
  const ids = new Set(get().selection);
  if (!ids.size) return;
  commitSlide(slide => { slide.objects = slide.objects.filter(o => !ids.has(o.id)); });
  set({ selection: [], primaryId: null, editingId: null });
}

export function reorderSelection(mode: ZOrder) {
  const ids = new Set(get().selection);
  if (!ids.size) return;
  commitSlide(slide => { slide.objects = reorder(slide.objects, ids, mode); });
}

export function alignSelection(mode: AlignMode) {
  const ids = new Set(get().selection);
  commitSlide(slide => alignObjects(slide.objects.filter(o => ids.has(o.id)) as SlideObject[], mode));
}

export function distributeSelection(axis: 'h' | 'v') {
  const ids = new Set(get().selection);
  commitSlide(slide => distributeObjects(slide.objects.filter(o => ids.has(o.id)) as SlideObject[], axis));
}

export function nudgeSelection(dx: number, dy: number) {
  commitSelection(o => { o.x += dx; o.y += dy; }, undefined, { coalesce: 'nudge' });
}

// ---------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------
export function copySelection(): ClipboardData | null {
  const objs = selectedObjects();
  if (!objs.length) return null;
  clipboard = { slideId: currentSlide().id, objects: JSON.parse(JSON.stringify(objs)) };
  pasteCount = 0;
  return clipboard;
}

export function cutSelection() {
  if (copySelection()) deleteSelection();
}

/** Paste objects; on the slide they came from they cascade so copies stay visible */
export function pasteObjects(data: ClipboardData | null = clipboard) {
  if (!data?.objects.length) return;
  const offset = data.slideId === currentSlide().id ? 20 * ++pasteCount : 0;
  addObjects(ids => (JSON.parse(JSON.stringify(data.objects)) as SlideObject[]).map(o => ({
    ...o, id: ids.take(), x: o.x + offset, y: o.y + offset,
  })));
}

export function duplicateSelection() {
  const objs = selectedObjects();
  if (!objs.length) return;
  addObjects(ids => objs.map(o => ({ ...JSON.parse(JSON.stringify(o)), id: ids.take(), x: o.x + 30, y: o.y + 30 })));
}

// ---------------------------------------------------------------
// View, presentation, notifications
// ---------------------------------------------------------------
export const setZoom = (zoom: number) => set({ zoom: Math.max(25, Math.min(200, Math.round(zoom))) });

export function startPresentation(index = get().slideIndex, presenter = false) {
  set({ presentation: { index, presenter }, editingId: null });
}
export const setPresentationIndex = (index: number) => {
  const s = get();
  if (!s.presentation) return;
  set({ presentation: { ...s.presentation, index: Math.max(0, Math.min(s.deck.slides.length - 1, index)) } });
};
export const exitPresentation = () => set({ presentation: null });

export function toast(kind: Toast['kind'], title: string, subtitle?: string) {
  const id = toastId++;
  set({ toasts: [...get().toasts, { id, kind, title, subtitle }] });
  setTimeout(() => dismissToast(id), kind === 'error' ? 8000 : 4000);
}
export const dismissToast = (id: number) => set({ toasts: get().toasts.filter(t => t.id !== id) });

export const markSaved = (error: string | null = null) =>
  set(error ? { saveError: error } : { dirty: false, savedAt: Date.now(), saveError: null });
