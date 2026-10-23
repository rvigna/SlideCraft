import { addObjects, toast } from '../store/editor';
import { createImageObject } from '../model/factory';
import { SLIDE_H, SLIDE_W } from '../model/types';

export function readFileAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 350, h: img.naturalHeight || 250 });
    img.onerror = () => resolve({ w: 350, h: 250 });
    img.src = src;
  });
}

/** Insert an image at its natural aspect ratio, centered on `at` (slide coords) */
export async function insertImage(src: string, at?: { x: number; y: number }) {
  const nat = await imageSize(src);
  const fit = Math.min(1, 480 / nat.w, 360 / nat.h);
  const w = Math.round(nat.w * fit);
  const h = Math.round(nat.h * fit);
  const cx = at?.x ?? SLIDE_W / 2;
  const cy = at?.y ?? SLIDE_H / 2;
  addObjects(ids => [createImageObject(ids, src, {
    x: Math.round(Math.max(0, Math.min(SLIDE_W - w, cx - w / 2))),
    y: Math.round(Math.max(0, Math.min(SLIDE_H - h, cy - h / 2))),
    w, h,
  })]);
}

export async function insertImageFiles(files: File[], at?: { x: number; y: number }) {
  for (const [i, file] of files.entries()) {
    try {
      const src = await readFileAsDataURL(file);
      await insertImage(src, at ? { x: at.x + i * 24, y: at.y + i * 24 } : undefined);
    } catch {
      toast('error', `Could not read ${file.name}`);
    }
  }
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.click();
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(title: string): string {
  return (title || 'presentation').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'presentation';
}
