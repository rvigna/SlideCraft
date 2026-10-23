/* Canvas helpers for turning things PowerPoint can't draw natively into images. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ICONS } from '../model/icons';
import { gradientAngle, gradientStops } from '../model/color';

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  let ctx: CanvasRenderingContext2D | null = null;
  try { ctx = c.getContext('2d'); } catch { ctx = null; }
  return ctx ? [c, ctx] : null;
}

function loadImage(src: string, timeoutMs = 8000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('image timed out')), timeoutMs);
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('image failed to load')); };
    img.src = src;
  });
}

/** Draw a CSS linear-gradient into a PNG; null when canvas is unavailable */
export function rasterizeGradient(css: string, w = 1920, h = 1080): string | null {
  const surface = canvas2d(w, h);
  if (!surface) return null;
  const [c, ctx] = surface;
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
  return c.toDataURL('image/png');
}

/** SVG markup for a Carbon icon in a given color */
export function iconSvg(name: string, color: string): string {
  const Icon = ICONS[name] ?? ICONS.Star;
  return renderToStaticMarkup(createElement(Icon, { size: 32, style: { color } }))
    .replace(/currentColor/g, color);
}

/** Rasterize a Carbon icon to PNG; null if the browser can't (the exporter then skips it) */
export async function iconPng(name: string, color: string, size: number): Promise<string | null> {
  const svg = iconSvg(name, color);
  const svgUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  const px = Math.min(1024, Math.max(64, Math.round(size * 3)));
  const surface = canvas2d(px, px);
  if (!surface) return null;
  try {
    const img = await loadImage(svgUrl);
    surface[1].drawImage(img, 0, 0, px, px);
    return surface[0].toDataURL('image/png');
  } catch {
    return null;
  }
}

/**
 * Bake object-fit into the pixels so PowerPoint shows exactly what the editor shows.
 * Also converts formats PowerPoint dislikes (webp, avif…) and inlines remote URLs.
 */
export async function fitImage(src: string, boxW: number, boxH: number, fit: 'cover' | 'contain' | 'fill'): Promise<string | null> {
  if (!canvas2d(1, 1)) return src.startsWith('data:') ? src : null;
  let img: HTMLImageElement;
  try { img = await loadImage(src); } catch { return src.startsWith('data:') ? src : null; }
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if (!nw || !nh) return src.startsWith('data:') ? src : null;
  const boxRatio = boxW / boxH;
  // Output resolution: native pixels, capped
  const scale = Math.min(1, 2400 / Math.max(nw, nh));
  let outW: number, outH: number;
  if (fit === 'fill') { outW = nw * scale; outH = nh * scale; } else if (fit === 'cover') {
    outW = Math.min(nw, nh * boxRatio) * scale; outH = outW / boxRatio;
  } else {
    outW = Math.max(nw, nh * boxRatio) * scale; outH = outW / boxRatio;
  }
  const surface = canvas2d(outW, outH);
  if (!surface) return src.startsWith('data:') ? src : null;
  const [c, ctx] = surface;
  if (fit === 'fill') ctx.drawImage(img, 0, 0, c.width, c.height);
  else {
    const s = fit === 'cover' ? Math.max(c.width / nw, c.height / nh) : Math.min(c.width / nw, c.height / nh);
    const dw = nw * s, dh = nh * s;
    ctx.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
  }
  const jpeg = /^data:image\/jpe?g/i.test(src) || /\.jpe?g($|\?)/i.test(src);
  try {
    return jpeg && fit !== 'contain' ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png');
  } catch {
    return src.startsWith('data:') ? src : null; // tainted canvas (cross-origin)
  }
}
