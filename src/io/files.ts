/* File menu actions: open/save PPTX, JSON, HTML, print, browser storage. */
import { flushSync } from 'react-dom';
import { loadDeck, markSaved, toast, useEditor } from '../store/editor';
import { setBusy, useUi } from '../store/ui';
import { normalizeDeck } from '../model/factory';
import { exportPptxOffThread, importPptxOffThread } from './pptxWorker';
import { downloadBlob, pickFile, safeFileName } from './images';
import { idbGet, idbSet } from './storage';

export const STORAGE_KEY = 'slidecraft-data';

interface SavedDeck { savedAt: string; currentSlideIndex: number; version: number }

function snapshot() {
  const { deck, slideIndex } = useEditor.getState();
  return { deck, data: { ...deck, currentSlideIndex: slideIndex, savedAt: new Date().toISOString(), version: 2 } };
}

function saveFailed(err: unknown, announce: boolean) {
  const quota = err instanceof DOMException && /quota/i.test(err.name + err.message);
  markSaved(quota ? 'Browser storage is full' : 'Could not save');
  if (announce || quota) {
    toast('error', quota ? 'Browser storage is full' : 'Could not save',
      quota ? 'Free up disk space, or use File › Save as PowerPoint to keep your work.' : String(err));
  }
}

/** Save the deck in this browser (IndexedDB, falling back to localStorage) */
export async function saveToBrowser(announce = false): Promise<boolean> {
  const { deck, data } = snapshot();
  try {
    await idbSet(STORAGE_KEY, data);
    // Drop the older localStorage copy so a stale one never wins on restore
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage blocked */ }
  } catch {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (err) { saveFailed(err, announce); return false; }
  }
  // Only clear "unsaved" if nothing changed while the write was in flight
  if (useEditor.getState().deck === deck) markSaved();
  if (announce) toast('success', 'Saved in this browser');
  return true;
}

/** Best-effort synchronous save while the tab is closing (IndexedDB writes may not finish) */
export function saveOnExit() {
  if (!useEditor.getState().dirty || !restoreSettled) return;
  void saveToBrowser();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot().data)); } catch { /* too big: IndexedDB copy only */ }
}

let restoreSettled = typeof indexedDB === 'undefined';
/** False until the saved session has been read; auto-save waits so a blank deck can't overwrite it */
export const isRestoreSettled = () => restoreSettled;

function applySaved(data: SavedDeck) {
  loadDeck(data, { resetHistory: true });
  const index = Math.min(Number(data.currentSlideIndex) || 0, useEditor.getState().deck.slides.length - 1);
  useEditor.setState({ slideIndex: Math.max(0, index) });
  markSaved();
}

const newer = (a: SavedDeck | null | undefined, b: SavedDeck | null | undefined) => (a && (!b || (a.savedAt ?? '') >= (b.savedAt ?? '')) ? a : b) ?? null;

/** Load the last session. Resolves within `timeoutMs` even if storage is slow; a late copy still loads if nothing was edited yet. */
export async function restoreFromBrowser(timeoutMs = 3000): Promise<boolean> {
  let local: SavedDeck | null = null;
  try { const raw = localStorage.getItem(STORAGE_KEY); local = raw ? JSON.parse(raw) : null; } catch { /* corrupt or blocked */ }
  const stored = idbGet<SavedDeck>(STORAGE_KEY).catch(() => undefined);
  const late = Symbol('late');
  const first = await Promise.race([stored, new Promise<typeof late>(r => setTimeout(() => r(late), timeoutMs))]);
  try {
    if (first !== late) {
      restoreSettled = true;
      // Whichever copy is newer (localStorage holds decks from older versions and exit snapshots)
      const data = newer(first, local);
      if (data) applySaved(data);
      return !!data;
    }
    if (local) applySaved(local);
    void stored.then(data => {
      restoreSettled = true;
      if (data && newer(data, local) === data && data !== local && !useEditor.getState().dirty) applySaved(data);
    });
    return !!local;
  } catch {
    restoreSettled = true;
    return false;
  }
}

async function withBusy<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (useUi.getState().busy) return undefined;
  setBusy(label);
  try {
    return await fn();
  } catch (err) {
    toast('error', `${label} failed`, (err as Error).message);
    return undefined;
  } finally {
    setBusy(null);
  }
}

export async function openPptx(file: File) {
  await withBusy('Opening presentation', async () => {
    const { deck, warnings } = await importPptxOffThread(await file.arrayBuffer(), file.name);
    loadDeck(deck);
    const n = useEditor.getState().deck.slides.length;
    toast(warnings.length ? 'warning' : 'success', `Opened “${file.name}” — ${n} slide${n !== 1 ? 's' : ''}`, warnings.join(' '));
  });
}

export async function openPptxFile() {
  const file = await pickFile('.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation');
  if (file) await openPptx(file);
}

export async function savePptxFile() {
  await withBusy('Saving PowerPoint', async () => {
    const { deck } = useEditor.getState();
    const { blob, warnings } = await exportPptxOffThread(deck);
    downloadBlob(blob, `${safeFileName(deck.title)}.pptx`);
    toast(warnings.length ? 'warning' : 'success', 'PowerPoint file downloaded', warnings.join(' '));
  });
}

export function exportJsonFile() {
  const { deck } = useEditor.getState();
  downloadBlob(new Blob([JSON.stringify({ ...deck, version: 2 }, null, 2)], { type: 'application/json' }), `${safeFileName(deck.title)}.json`);
}

export async function openJson(file: File) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data?.slides)) throw new Error('No slides found in this file.');
    loadDeck(normalizeDeck(data));
    toast('success', `Opened “${file.name}”`);
  } catch (err) {
    toast('error', 'Could not open JSON file', (err as Error).message);
  }
}

export async function importJsonFile() {
  const file = await pickFile('.json,application/json');
  if (file) await openJson(file);
}

export async function openMarkdown(file: File) {
  try {
    const { markdownToDeck } = await import('../model/markdown');
    loadDeck(markdownToDeck(await file.text()));
    const n = useEditor.getState().deck.slides.length;
    toast('success', `Opened “${file.name}” — ${n} slide${n !== 1 ? 's' : ''}`);
  } catch (err) {
    toast('error', 'Could not open Markdown file', (err as Error).message);
  }
}

export async function openMarkdownFile() {
  const file = await pickFile('.md,.markdown,text/markdown');
  if (file) await openMarkdown(file);
}

export async function exportMarkdownFile() {
  const { deckToMarkdown } = await import('../model/markdown');
  const { deck } = useEditor.getState();
  downloadBlob(new Blob([deckToMarkdown(deck)], { type: 'text/markdown' }), `${safeFileName(deck.title)}.md`);
}

/** Open whatever was dropped or picked: PPTX, Markdown or SlideCraft JSON */
export async function openAnyFile(file: File) {
  if (/\.pptx$/i.test(file.name)) return openPptx(file);
  if (/\.(md|markdown)$/i.test(file.name)) return openMarkdown(file);
  if (/\.json$/i.test(file.name)) return openJson(file);
  toast('error', 'Unsupported file', 'SlideCraft opens .pptx, .md and .json presentations.');
}

export async function exportHtmlFile() {
  const { deckToHtml } = await import('./htmlExport');
  const { deck } = useEditor.getState();
  downloadBlob(new Blob([deckToHtml(deck)], { type: 'text/html' }), `${safeFileName(deck.title)}.html`);
  toast('success', 'HTML slideshow downloaded', 'Open it in any browser — arrow keys navigate, F toggles full screen.');
}

/** Render every slide into the print root, then open the print dialog (Save as PDF) */
export function printDeck() {
  flushSync(() => useUi.setState({ printing: true }));
  // Give images a moment to decode before the print snapshot
  setTimeout(() => {
    window.print();
  }, 300);
}
