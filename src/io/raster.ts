/* Canvas helpers for turning things PowerPoint can't draw natively into images.
   Works in workers (OffscreenCanvas + createImageBitmap) and on the main thread (<canvas> + <img>).
   SVG icons are rasterized separately on the main thread (see iconRaster.ts). */
import { gradientAngle, gradientStops } from '../model/color';

type Surface = { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D };

function surfaceOf(w: number, h: number): Surface | null {
  const width = Math.max(1, Math.round(w)), height = Math.max(1, Math.round(h));
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      return ctx ? { canvas, ctx } : null;
    }
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
  } catch {
    return null;
  }
}

/** Encode a canvas as a data URL (OffscreenCanvas has no toDataURL, so it goes through a Blob) */
async function dataUrlOf(canvas: OffscreenCanvas | HTMLCanvasElement, type: string, quality?: number): Promise<string> {
  if ('toDataURL' in canvas) return canvas.toDataURL(type, quality);
  const blob = await canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** A decoded image ready to draw. */
interface Picture { width: number; height: number; source: CanvasImageSource }

// Decoded pictures and fitted results, kept for one export or import so repeated images are only processed once
let decoded: Map<string, Promise<Picture | null>> | null = null;
let fitted: Map<string, Map<string, Promise<string | null>>> | null = null;

/** Run `fn` with a shared cache of decoded and fitted images; the cache is released afterwards */
export async function withImageCache<T>(fn: () => Promise<T>): Promise<T> {
  const outerDecoded = decoded, outerFitted = fitted;
  decoded ??= new Map();
  fitted ??= new Map();
  try {
    return await fn();
  } finally {
    decoded = outerDecoded;
    fitted = outerFitted;
  }
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('image timed out')), ms);
    p.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}

async function decodeOnce(src: string): Promise<Picture> {
  if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
    const res = await fetch(src);
    if (!res.ok) throw new Error('image failed to load');
    const bitmap = await createImageBitmap(await res.blob());
    return { width: bitmap.width, height: bitmap.height, source: bitmap };
  }
  return new Promise<Picture>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, source: img });
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

/** Decode an image (data URL, blob or http URL); null when it can't be loaded or drawn */
export function loadPicture(src: string, timeoutMs = 8000): Promise<Picture | null> {
  const cache = decoded;
  const cached = cache?.get(src);
  if (cached) return cached;
  const p = timeout(decodeOnce(src), timeoutMs).catch(() => null);
  cache?.set(src, p);
  return p;
}

/** Draw a CSS linear-gradient into a PNG; null when canvas is unavailable */
export async function rasterizeGradient(css: string, w = 1920, h = 1080): Promise<string | null> {
  const surface = surfaceOf(w, h);
  if (!surface) return null;
  const { canvas, ctx } = surface;
  const stops = gradientStops(css);
  if (!stops.length) return null;
  // CSS angles: 0deg points up, increasing clockwise
  const rad = (gradientAngle(css) - 90) * Math.PI / 180;
  const half = Math.abs(w / 2 * Math.cos(rad)) + Math.abs(h / 2 * Math.sin(rad));
  const cx = w / 2, cy = h / 2;
  const g = ctx.createLinearGradient(cx - Math.cos(rad) * half, cy - Math.sin(rad) * half, cx + Math.cos(rad) * half, cy + Math.sin(rad) * half);
  stops.forEach(s => { try { g.addColorStop(Math.max(0, Math.min(1, s.pos)), s.color); } catch { /* bad color */ } });
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return dataUrlOf(canvas, 'image/png');
}

/** Crop a picture by a fraction on each side (a:srcRect); returns the source unchanged when there's nothing to crop */
export async function cropPicture(src: string, crop: { l: number; t: number; r: number; b: number }): Promise<string> {
  const { l, t, r, b } = crop;
  if (!l && !t && !r && !b) return src;
  const pic = await loadPicture(src);
  if (!pic) return src;
  try {
    const sx = pic.width * l, sy = pic.height * t;
    const sw = pic.width * (1 - l - r), sh = pic.height * (1 - t - b);
    const surface = surfaceOf(sw, sh);
    if (!surface) return src;
    surface.ctx.drawImage(pic.source, sx, sy, sw, sh, 0, 0, surface.canvas.width, surface.canvas.height);
    return await dataUrlOf(surface.canvas, src.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png');
  } catch {
    return src;
  }
}

/**
 * Bake object-fit into the pixels so PowerPoint shows exactly what the editor shows.
 * Also converts formats PowerPoint dislikes (webp, avif…) and inlines remote URLs.
 */
export function fitImage(src: string, boxW: number, boxH: number, fit: 'cover' | 'contain' | 'fill'): Promise<string | null> {
  const cache = fitted;
  const key = `${Math.round(boxW)}x${Math.round(boxH)}|${fit}`;
  const bySrc = cache?.get(src) ?? new Map<string, Promise<string | null>>();
  const cached = bySrc.get(key);
  if (cached) return cached;
  const p = fitUncached(src, boxW, boxH, fit);
  if (cache) { bySrc.set(key, p); cache.set(src, bySrc); }
  return p;
}

async function fitUncached(src: string, boxW: number, boxH: number, fit: 'cover' | 'contain' | 'fill'): Promise<string | null> {
  const passThrough = src.startsWith('data:') ? src : null;
  if (!surfaceOf(1, 1)) return passThrough;
  const pic = await loadPicture(src);
  if (!pic) return passThrough;
  const { width: nw, height: nh } = pic;
  if (!nw || !nh) return passThrough;
  const boxRatio = boxW / boxH;
  // Output resolution: native pixels, capped
  const scale = Math.min(1, 2400 / Math.max(nw, nh));
  let outW: number, outH: number;
  if (fit === 'fill') { outW = nw * scale; outH = nh * scale; } else if (fit === 'cover') {
    outW = Math.min(nw, nh * boxRatio) * scale; outH = outW / boxRatio;
  } else {
    outW = Math.max(nw, nh * boxRatio) * scale; outH = outW / boxRatio;
  }
  const surface = surfaceOf(outW, outH);
  if (!surface) return passThrough;
  const { canvas, ctx } = surface;
  if (fit === 'fill') ctx.drawImage(pic.source, 0, 0, canvas.width, canvas.height);
  else {
    const s = fit === 'cover' ? Math.max(canvas.width / nw, canvas.height / nh) : Math.min(canvas.width / nw, canvas.height / nh);
    const dw = nw * s, dh = nh * s;
    ctx.drawImage(pic.source, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  }
  const jpeg = /^data:image\/jpe?g/i.test(src) || /\.jpe?g($|\?)/i.test(src);
  try {
    return await dataUrlOf(canvas, jpeg && fit !== 'contain' ? 'image/jpeg' : 'image/png', 0.92);
  } catch {
    return passThrough; // tainted or unencodable (cross-origin on the main thread)
  }
}
