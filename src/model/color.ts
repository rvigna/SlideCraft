/* Color parsing shared by the PPTX importer/exporter. */

const NAMED: Record<string, string> = {
  black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', yellow: 'ffff00',
  gray: '808080', grey: '808080', orange: 'ffa500', purple: '800080', transparent: '',
};

export interface Rgba { r: number; g: number; b: number; a: number }

export function parseColor(input: string | undefined | null): Rgba | null {
  if (!input) return null;
  const c = input.trim().toLowerCase();
  if (c in NAMED) {
    const hex = NAMED[c];
    return hex ? parseColor('#' + hex) : null;
  }
  let m = c.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = hex.split('').map(ch => ch + ch).join('');
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  m = c.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(p => p.endsWith('%') ? parseFloat(p) * 2.55 : parseFloat(p));
    if (parts.length >= 3) return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  }
  return null;
}

/** "#0f62fe" → "0F62FE"; gradients use their first color stop */
export function toHex6(input: string | undefined | null, fallback = '000000'): string {
  const first = input && /gradient/i.test(input) ? gradientStops(input)[0]?.color : input;
  const rgba = parseColor(first);
  if (!rgba) return fallback;
  return [rgba.r, rgba.g, rgba.b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function alphaOf(input: string | undefined | null): number {
  return parseColor(input)?.a ?? 1;
}

export interface GradientStop { color: string; pos: number }

/** Parse the color stops of a CSS linear-gradient(); positions 0–1 */
export function gradientStops(css: string): GradientStop[] {
  const inner = css.slice(css.indexOf('(') + 1, css.lastIndexOf(')'));
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  const stops = parts.filter(p => !/^(to |\d+(\.\d+)?(deg|turn|rad))/.test(p));
  return stops.map((p, i) => {
    const m = p.match(/^(.*?)(?:\s+(\d+(?:\.\d+)?)%)?$/);
    const color = (m?.[1] ?? p).trim();
    const pos = m?.[2] != null ? parseFloat(m[2]) / 100 : stops.length > 1 ? i / (stops.length - 1) : 0;
    return { color, pos };
  });
}

/** Gradient angle in degrees (CSS convention: 180 = top → bottom) */
export function gradientAngle(css: string): number {
  const m = css.match(/\(\s*(-?\d+(?:\.\d+)?)deg/);
  if (m) return parseFloat(m[1]);
  const dir = css.match(/\(\s*to ([a-z ]+),/);
  const map: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270, 'top right': 45, 'bottom right': 135, 'bottom left': 225, 'top left': 315 };
  return dir ? map[dir[1].trim()] ?? 180 : 180;
}

// ---- HSL helpers for DrawingML lumMod/lumOff/tint/shade ----
export function rgbToHsl({ r, g, b }: Rgba): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb(h: number, s: number, l: number): Rgba {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255, a: 1 };
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: hue(p, q, h + 1 / 3) * 255, g: hue(p, q, h) * 255, b: hue(p, q, h - 1 / 3) * 255, a: 1 };
}

export function rgbaToCss({ r, g, b, a }: Rgba): string {
  const hex = '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  return a < 1 ? `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+a.toFixed(3)})` : hex;
}
