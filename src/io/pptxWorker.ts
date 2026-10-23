/* Main-thread side of the PPTX worker: same API as the exporter and importer, but the packaging runs in a worker.
   Falls back to running in place when workers aren't available. */
import type { Deck, SlideObject } from '../model/types';
import type { PptxExportResult } from './pptxExport';
import type { PptxImportResult } from './pptxImport';
import type { PptxRequest, PptxResponse } from './pptx.worker';
import { prepareIcons } from './iconRaster';

type Pending = { resolve: (r: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null | undefined; // undefined: not created yet; null: unavailable
let nextId = 1;
const pending = new Map<number, Pending>();

function failAll(message: string) {
  for (const p of pending.values()) p.reject(new Error(message));
  pending.clear();
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./pptx.worker.ts', import.meta.url), { type: 'module', name: 'pptx' });
    worker.onmessage = ({ data }: MessageEvent<PptxResponse>) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.ok) p.resolve(data.result);
      else p.reject(new Error(data.error));
    };
    worker.onerror = e => {
      // The worker failed to start or crashed: fail the work in flight and use the in-place path from now on
      failAll(e.message || 'PowerPoint worker failed');
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

function send<T>(build: (id: number) => { message: PptxRequest; transfer?: Transferable[] }): Promise<T> {
  const w = getWorker()!;
  const id = nextId++;
  const { message, transfer } = build(id);
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (r: unknown) => void, reject });
    w.postMessage(message, transfer ?? []);
  });
}

/** Package a deck as .pptx (icons are rasterized here first; the packaging itself runs in the worker) */
export async function exportPptxOffThread(deck: Deck): Promise<PptxExportResult> {
  const icons = await prepareIcons(deck.slides.flatMap(s => s.objects as SlideObject[]));
  if (getWorker()) {
    return send<PptxExportResult>(id => ({ message: { id, op: 'export', deck, assets: { icons } } }));
  }
  const { deckToPptx } = await import('./pptxExport');
  return deckToPptx(deck, { icons });
}

/** Read a .pptx into a deck (parsing runs in the worker) */
export async function importPptxOffThread(data: ArrayBuffer, fileName?: string): Promise<PptxImportResult> {
  if (getWorker()) {
    return send<PptxImportResult>(id => ({ message: { id, op: 'import', data, fileName: fileName ?? 'Presentation.pptx' }, transfer: [data] }));
  }
  const { pptxToDeck } = await import('./pptxImport');
  return pptxToDeck(data, fileName);
}
