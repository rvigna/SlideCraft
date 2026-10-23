/* Runs PPTX export and import off the main thread, so the editor stays responsive while a large deck is packaged or read. */
import { deckToPptx, type PptxAssets, type PptxExportResult } from './pptxExport';
import { pptxToDeck, type PptxImportResult } from './pptxImport';
import type { Deck } from '../model/types';

export type PptxRequest =
  | { id: number; op: 'export'; deck: Deck; assets: PptxAssets }
  | { id: number; op: 'import'; data: ArrayBuffer; fileName: string };

export type PptxResponse =
  | { id: number; ok: true; result: PptxExportResult | PptxImportResult }
  | { id: number; ok: false; error: string };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<PptxRequest>) => void) | null;
  postMessage(message: PptxResponse): void;
};

scope.onmessage = async ({ data: req }: MessageEvent<PptxRequest>) => {
  try {
    const result = req.op === 'export'
      ? await deckToPptx(req.deck, req.assets)
      : await pptxToDeck(req.data, req.fileName);
    scope.postMessage({ id: req.id, ok: true, result });
  } catch (err) {
    scope.postMessage({ id: req.id, ok: false, error: (err as Error).message || 'PowerPoint conversion failed' });
  }
};
