/* Carbon icons as PNG for PowerPoint. Main thread only: SVG needs an <img> to decode, which workers don't have. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ICONS } from '../model/icons';
import type { SlideObject } from '../model/types';

/** SVG markup for a Carbon icon in a given color */
export function iconSvg(name: string, color: string): string {
  const Icon = ICONS[name] ?? ICONS.Star;
  return renderToStaticMarkup(createElement(Icon, { size: 32, style: { color } }))
    .replace(/currentColor/g, color);
}

/** Rasterize a Carbon icon to PNG; null if the browser can't (the exporter then skips it) */
export async function iconPng(name: string, color: string, size: number): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const svg = iconSvg(name, color);
  const svgUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  const px = Math.min(1024, Math.max(64, Math.round(size * 3)));
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const timer = setTimeout(() => reject(new Error('icon timed out')), 8000);
      img.onload = () => { clearTimeout(timer); resolve(img); };
      img.onerror = () => { clearTimeout(timer); reject(new Error('icon failed to load')); };
      img.src = svgUrl;
    });
    ctx.drawImage(img, 0, 0, px, px);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** PNGs for every icon in a deck, keyed by object id; computed here so the export worker never needs SVG */
export async function prepareIcons(objects: SlideObject[]): Promise<Record<number, string | null>> {
  const out: Record<number, string | null> = {};
  for (const o of objects) {
    if (o.type === 'icon') out[o.id] = await iconPng(o.icon, o.color, Math.min(o.w, o.h));
  }
  return out;
}
