/* Import PowerPoint (.pptx) files by reading the Office Open XML directly. */
import JSZip from 'jszip';
import { SLIDE_H, SLIDE_W, type ShapeType } from '../model/types';
import { hslToRgb, parseColor, rgbaToCss, rgbToHsl, type Rgba } from '../model/color';
import { paragraphsToHtml, type Paragraph, type TextRun } from '../model/richtext';

// ---------------------------------------------------------------
// XML helpers (namespace-agnostic: match on local names)
// ---------------------------------------------------------------
type El = Element;

const kids = (el: El | null | undefined, name: string): El[] =>
  el ? [...el.children].filter(c => c.localName === name) : [];
const kid = (el: El | null | undefined, name: string): El | null =>
  el ? [...el.children].find(c => c.localName === name) ?? null : null;
const path = (el: El | null | undefined, ...names: string[]): El | null =>
  names.reduce<El | null>((cur, n) => kid(cur, n), el ?? null);
function desc(el: El | null | undefined, name: string): El | null {
  if (!el) return null;
  for (const c of el.getElementsByTagName('*')) if (c.localName === name) return c;
  return null;
}
const attr = (el: El | null | undefined, name: string): string | null => el?.getAttribute(name) ?? null;
const numAttr = (el: El | null | undefined, name: string): number | null => {
  const v = attr(el, name);
  return v == null ? null : Number(v);
};
/** r:embed / r:id style attributes regardless of prefix */
function relAttr(el: El | null | undefined, local: string): string | null {
  if (!el) return null;
  for (const a of el.attributes) if (a.localName === local && (a.prefix === 'r' || a.namespaceURI?.includes('relationships'))) return a.value;
  return null;
}

function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp',
  svg: 'image/svg+xml', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff',
};

interface Rel { type: string; target: string }

class Package {
  private xml = new Map<string, Document | null>();
  private rels = new Map<string, Map<string, Rel>>();
  private media = new Map<string, string | null>();
  constructor(private zip: JSZip) {}

  async doc(p: string): Promise<Document | null> {
    if (!this.xml.has(p)) {
      const file = this.zip.file(p);
      const text = file ? await file.async('string') : null;
      this.xml.set(p, text ? new DOMParser().parseFromString(text, 'application/xml') : null);
    }
    return this.xml.get(p) ?? null;
  }

  async relsOf(p: string): Promise<Map<string, Rel>> {
    if (!this.rels.has(p)) {
      const dir = p.split('/').slice(0, -1).join('/');
      const name = p.split('/').pop();
      const doc = await this.doc(`${dir}/_rels/${name}.rels`);
      const map = new Map<string, Rel>();
      doc?.documentElement && [...doc.documentElement.children].forEach(r => {
        const id = r.getAttribute('Id');
        const target = r.getAttribute('Target');
        if (!id || !target || r.getAttribute('TargetMode') === 'External') return;
        map.set(id, { type: r.getAttribute('Type')?.split('/').pop() ?? '', target: resolvePath(p, target) });
      });
      this.rels.set(p, map);
    }
    return this.rels.get(p)!;
  }

  async relOfType(p: string, type: string): Promise<string | null> {
    for (const r of (await this.relsOf(p)).values()) if (r.type === type) return r.target;
    return null;
  }

  /** Embedded image as a data URL; null for formats browsers can't show (EMF/WMF) */
  async mediaUrl(p: string): Promise<string | null> {
    if (!this.media.has(p)) {
      const ext = p.split('.').pop()?.toLowerCase() ?? '';
      const file = this.zip.file(p);
      const mime = MIME[ext];
      this.media.set(p, file && mime ? `data:${mime};base64,${await file.async('base64')}` : null);
    }
    return this.media.get(p) ?? null;
  }
}

// ---------------------------------------------------------------
// Theme & colors
// ---------------------------------------------------------------
interface ThemeInfo {
  colors: Record<string, string>; // dk1, lt1, accent1… → #rrggbb
  majorFont: string;
  minorFont: string;
  lineWidths: number[]; // EMU, from fmtScheme/lnStyleLst
  bgFills: El[];        // fmtScheme/bgFillStyleLst
}

function readTheme(doc: Document | null): ThemeInfo {
  const root = doc?.documentElement;
  const scheme = desc(root, 'clrScheme');
  const colors: Record<string, string> = {};
  [...(scheme?.children ?? [])].forEach(c => {
    const v = attr(kid(c, 'srgbClr'), 'val') ?? attr(kid(c, 'sysClr'), 'lastClr');
    if (v) colors[c.localName] = '#' + v;
  });
  const fonts = desc(root, 'fontScheme');
  return {
    colors,
    majorFont: attr(path(fonts, 'majorFont', 'latin'), 'typeface') ?? 'Calibri Light',
    minorFont: attr(path(fonts, 'minorFont', 'latin'), 'typeface') ?? 'Calibri',
    lineWidths: kids(desc(root, 'lnStyleLst'), 'ln').map(l => numAttr(l, 'w') ?? 12700),
    bgFills: [...(desc(root, 'bgFillStyleLst')?.children ?? [])],
  };
}

interface ColorCtx { theme: ThemeInfo; clrMap: Record<string, string>; placeholderColor?: string }

const PRESET_COLORS: Record<string, string> = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', gray: '#808080', darkGray: '#a9a9a9', lightGray: '#d3d3d3' };

/** Resolve a DrawingML color element (srgbClr, schemeClr…) with its modifiers */
function colorOf(el: El | null, ctx: ColorCtx): Rgba | null {
  if (!el) return null;
  let base: string | null = null;
  switch (el.localName) {
    case 'srgbClr': base = '#' + attr(el, 'val'); break;
    case 'sysClr': base = '#' + (attr(el, 'lastClr') ?? '000000'); break;
    case 'prstClr': base = PRESET_COLORS[attr(el, 'val') ?? ''] ?? '#000000'; break;
    case 'scrgbClr': {
      const pct = (n: string) => Math.round((numAttr(el, n) ?? 0) / 100000 * 255);
      base = rgbaToCss({ r: pct('r'), g: pct('g'), b: pct('b'), a: 1 });
      break;
    }
    case 'schemeClr': {
      let key = attr(el, 'val') ?? 'tx1';
      if (key === 'phClr') { base = ctx.placeholderColor ?? '#000000'; break; }
      key = ctx.clrMap[key] ?? ({ bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' } as Record<string, string>)[key] ?? key;
      base = ctx.theme.colors[key] ?? '#000000';
      break;
    }
    default: return null;
  }
  const rgba = parseColor(base);
  if (!rgba) return null;
  let [h, s, l] = rgbToHsl(rgba);
  let { r, g, b } = rgba;
  let a = 1;
  let hslDirty = false;
  for (const m of el.children) {
    const v = (numAttr(m, 'val') ?? 0) / 100000;
    switch (m.localName) {
      case 'alpha': a = v; break;
      case 'lumMod': if (hslDirty === false) [h, s, l] = rgbToHsl({ r, g, b, a }); l *= v; hslDirty = true; break;
      case 'lumOff': if (hslDirty === false) [h, s, l] = rgbToHsl({ r, g, b, a }); l += v; hslDirty = true; break;
      case 'satMod': if (hslDirty === false) [h, s, l] = rgbToHsl({ r, g, b, a }); s *= v; hslDirty = true; break;
      case 'tint': ({ r, g, b } = applyHsl()); r += (255 - r) * (1 - v); g += (255 - g) * (1 - v); b += (255 - b) * (1 - v); break;
      case 'shade': ({ r, g, b } = applyHsl()); r *= v; g *= v; b *= v; break;
    }
  }
  function applyHsl() {
    if (hslDirty) { const c = hslToRgb(h, Math.min(1, s), Math.max(0, Math.min(1, l))); hslDirty = false; return c; }
    return { r, g, b, a };
  }
  ({ r, g, b } = applyHsl());
  return { r, g, b, a };
}

function firstColorChild(el: El | null): El | null {
  return el ? [...el.children].find(c => /Clr$/.test(c.localName)) ?? null : null;
}

type Fill =
  | { kind: 'none' }
  | { kind: 'color'; color: string; alpha: number }
  | { kind: 'gradient'; css: string; color: string }
  | { kind: 'image'; rid: string };

function fillOf(container: El | null, ctx: ColorCtx): Fill | null {
  if (!container) return null;
  for (const c of container.children) {
    switch (c.localName) {
      case 'noFill': return { kind: 'none' };
      case 'solidFill': {
        const rgba = colorOf(firstColorChild(c), ctx);
        return rgba ? { kind: 'color', color: rgbaToCss({ ...rgba, a: 1 }), alpha: rgba.a } : null;
      }
      case 'gradFill': {
        const stops = kids(kid(c, 'gsLst'), 'gs')
          .map(gs => ({ pos: (numAttr(gs, 'pos') ?? 0) / 1000, color: colorOf(firstColorChild(gs), ctx) }))
          .filter((s): s is { pos: number; color: Rgba } => !!s.color)
          .sort((a, b) => a.pos - b.pos);
        if (!stops.length) return null;
        const ang = (numAttr(kid(c, 'lin'), 'ang') ?? 5400000) / 60000;
        const css = `linear-gradient(${Math.round(ang + 90)}deg, ${stops.map(s => `${rgbaToCss(s.color)} ${Math.round(s.pos)}%`).join(', ')})`;
        return { kind: 'gradient', css, color: rgbaToCss({ ...stops[0].color, a: 1 }) };
      }
      case 'blipFill': {
        const rid = relAttr(kid(c, 'blip'), 'embed');
        return rid ? { kind: 'image', rid } : null;
      }
      case 'pattFill': {
        const rgba = colorOf(firstColorChild(kid(c, 'fgClr')), ctx);
        return rgba ? { kind: 'color', color: rgbaToCss({ ...rgba, a: 1 }), alpha: rgba.a } : null;
      }
      case 'grpFill': return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------
interface Xf { sx: number; sy: number; tx: number; ty: number }
interface Geo { x: number; y: number; w: number; h: number; rot: number }

function readXfrm(xfrm: El | null): { off: [number, number]; ext: [number, number]; rot: number; chOff?: [number, number]; chExt?: [number, number] } | null {
  if (!xfrm) return null;
  const off = kid(xfrm, 'off'), ext = kid(xfrm, 'ext');
  if (!off || !ext) return null;
  const chOff = kid(xfrm, 'chOff'), chExt = kid(xfrm, 'chExt');
  return {
    off: [numAttr(off, 'x') ?? 0, numAttr(off, 'y') ?? 0],
    ext: [numAttr(ext, 'cx') ?? 0, numAttr(ext, 'cy') ?? 0],
    rot: (numAttr(xfrm, 'rot') ?? 0) / 60000,
    chOff: chOff ? [numAttr(chOff, 'x') ?? 0, numAttr(chOff, 'y') ?? 0] : undefined,
    chExt: chExt ? [numAttr(chExt, 'cx') ?? 0, numAttr(chExt, 'cy') ?? 0] : undefined,
  };
}

function applyXf(xf: Xf, x: ReturnType<typeof readXfrm> & object): Geo {
  return {
    x: x.off[0] * xf.sx + xf.tx,
    y: x.off[1] * xf.sy + xf.ty,
    w: x.ext[0] * xf.sx,
    h: x.ext[1] * xf.sy,
    rot: ((x.rot % 360) + 360) % 360,
  };
}

// ---------------------------------------------------------------
// Text styles: run → paragraph → list styles up the placeholder chain
// ---------------------------------------------------------------
interface TextCtx {
  colors: ColorCtx;
  theme: ThemeInfo;
  chain: El[];        // lstStyle / txStyles elements, most specific first
  ownStyles: number;  // how many chain entries belong to the shape itself
  fontPx: number;     // px per pt
  fontScale: number;  // normAutofit fontScale
  lnSpcReduction: number;
  defaultColor?: string;
}

function levelProps(ctx: TextCtx, level: number): El[] {
  return ctx.chain.map(s => kid(s, `lvl${level + 1}pPr`)).filter((e): e is El => !!e);
}

/** Inherited run defaults; the shape style's font color outranks inherited list styles */
function levelRunDefaults(ctx: TextCtx, level: number, into: RunStyle) {
  ctx.chain.forEach((s, i) => {
    const defRPr = kid(kid(s, `lvl${level + 1}pPr`), 'defRPr');
    if (!defRPr) return;
    const keepColor = into.color;
    readRunProps(defRPr, ctx, into);
    if (i >= ctx.ownStyles && ctx.defaultColor && keepColor == null) into.color = ctx.defaultColor;
  });
  if (into.color == null && ctx.defaultColor) into.color = ctx.defaultColor;
}

function resolveFont(face: string | null, ctx: TextCtx): string | undefined {
  if (!face) return undefined;
  if (face.startsWith('+mj')) return ctx.theme.majorFont;
  if (face.startsWith('+mn')) return ctx.theme.minorFont;
  return face;
}

interface RunStyle { sz?: number; b?: boolean; i?: boolean; u?: boolean; strike?: boolean; color?: string; font?: string }

function readRunProps(rPr: El | null, ctx: TextCtx, into: RunStyle) {
  if (!rPr) return;
  const sz = numAttr(rPr, 'sz');
  if (sz != null && into.sz == null) into.sz = sz / 100;
  const b = attr(rPr, 'b');
  if (b != null && into.b == null) into.b = b === '1' || b === 'true';
  const i = attr(rPr, 'i');
  if (i != null && into.i == null) into.i = i === '1' || i === 'true';
  const u = attr(rPr, 'u');
  if (u != null && into.u == null) into.u = u !== 'none';
  const st = attr(rPr, 'strike');
  if (st != null && into.strike == null) into.strike = st !== 'noStrike';
  if (into.color == null) {
    const fill = fillOf(rPr, ctx.colors);
    if (fill?.kind === 'color') into.color = fill.color;
    else if (fill?.kind === 'gradient') into.color = fill.color;
  }
  if (into.font == null) into.font = resolveFont(attr(kid(rPr, 'latin'), 'typeface'), ctx);
}

function paragraphProp(pPr: El | null, levels: El[], name: string): string | null {
  return attr(pPr, name) ?? levels.map(l => attr(l, name)).find(v => v != null) ?? null;
}

function bulletOf(pPr: El | null, levels: El[]): Paragraph['bullet'] {
  for (const el of [pPr, ...levels]) {
    if (!el) continue;
    if (kid(el, 'buNone')) return undefined;
    if (kid(el, 'buAutoNum')) return 'number';
    if (kid(el, 'buChar') || kid(el, 'buBlip')) return 'bullet';
  }
  return undefined;
}

interface ParsedText {
  paragraphs: Paragraph[];
  align: 'left' | 'center' | 'right' | 'justify';
  base: Required<Pick<TextRun, 'fontSize'>> & { color: string; fontFamily: string; bold: boolean; italic: boolean };
  lineHeight: number;
  plain: string;
}

const ALIGN: Record<string, ParsedText['align']> = { l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify' };

function parseText(txBody: El | null, ctx: TextCtx): ParsedText | null {
  if (!txBody) return null;
  const paragraphs: Paragraph[] = [];
  const sizes: number[] = [];
  let align: ParsedText['align'] | null = null;
  let lineHeight: number | null = null;
  let first: Required<ParsedText['base']> | null = null;

  for (const p of kids(txBody, 'p')) {
    const pPr = kid(p, 'pPr');
    const level = numAttr(pPr, 'lvl') ?? 0;
    const levels = levelProps(ctx, level);
    align ??= ALIGN[paragraphProp(pPr, levels, 'algn') ?? ''] ?? null;
    if (lineHeight == null) {
      const spc = attr(path(pPr, 'lnSpc', 'spcPct'), 'val') ?? levels.map(l => attr(path(l, 'lnSpc', 'spcPct'), 'val')).find(v => v != null);
      if (spc) lineHeight = Math.max(0.8, (Number(spc) / 100000 - ctx.lnSpcReduction) * 1.2);
    }
    const para: Paragraph = { runs: [], bullet: bulletOf(pPr, levels) };
    const defaults: RunStyle = {};
    readRunProps(kid(pPr, 'defRPr'), ctx, defaults);
    levelRunDefaults(ctx, level, defaults);

    for (const r of p.children) {
      if (r.localName === 'br') { paragraphs.push(para.runs.length ? { ...para, runs: [...para.runs] } : { runs: [] }); para.runs = []; continue; }
      if (r.localName !== 'r' && r.localName !== 'fld') continue;
      const text = kid(r, 't')?.textContent ?? '';
      const st: RunStyle = {};
      readRunProps(kid(r, 'rPr'), ctx, st);
      const merged = { ...defaults, ...Object.fromEntries(Object.entries(st).filter(([, v]) => v != null)) } as RunStyle;
      const fontSize = (merged.sz ?? 18) * ctx.fontScale * ctx.fontPx;
      const run: TextRun = {
        text,
        bold: merged.b, italic: merged.i, underline: merged.u, strike: merged.strike,
        color: merged.color ?? ctx.defaultColor ?? ctx.theme.colors[ctx.colors.clrMap.tx1 ?? 'dk1'] ?? '#000000',
        fontSize,
        fontFamily: merged.font ?? ctx.theme.minorFont,
      };
      if (text) {
        sizes.push(fontSize);
        first ??= { fontSize, color: run.color!, fontFamily: run.fontFamily!, bold: !!run.bold, italic: !!run.italic };
      }
      para.runs.push(run);
    }
    paragraphs.push(para);
  }
  // Drop trailing empty paragraphs
  while (paragraphs.length && !paragraphs[paragraphs.length - 1].runs.some(r => r.text)) paragraphs.pop();
  const plain = paragraphs.map(p => p.runs.map(r => r.text).join('')).join('\n');
  if (!plain.trim() || !first) return null;

  // Runs that match the object-level style don't need inline formatting
  const base = first;
  paragraphs.forEach(p => p.runs.forEach(r => {
    if (r.bold === base.bold) r.bold = undefined;
    if (r.italic === base.italic) r.italic = undefined;
  }));
  return { paragraphs, align: align ?? 'left', base, lineHeight: lineHeight ?? 1.2, plain };
}

// ---------------------------------------------------------------
// Slide parsing
// ---------------------------------------------------------------
const PRST_MAP: Record<string, ShapeType> = {
  rect: 'rect', roundRect: 'rounded-rect', snipRoundRect: 'rounded-rect', round2SameRect: 'rounded-rect',
  ellipse: 'ellipse', triangle: 'triangle', rtTriangle: 'triangle', diamond: 'diamond',
  star4: 'star', star5: 'star', star6: 'star', star7: 'star', star8: 'star', star10: 'star', star12: 'star',
  hexagon: 'hexagon', octagon: 'hexagon', rightArrow: 'arrow-right', leftArrow: 'arrow-left',
  line: 'line', straightConnector1: 'line', bentConnector3: 'line', curvedConnector3: 'line',
};

interface PlaceholderInfo { type: string; idx: string | null }

interface Layer {
  part: string;
  doc: Document;
  spTree: El | null;
}

interface SlideCtx {
  pkg: Package;
  part: string;          // the part whose rels resolve r:embed (slide, layout or master)
  theme: ThemeInfo;
  colors: ColorCtx;
  layout: Layer | null;
  master: Layer | null;
  masterTx: { title: El | null; body: El | null; other: El | null };
  defaultTextStyle: El | null;
  fontPx: number;
  warnings: Set<string>;
  out: Record<string, unknown>[];
}

function placeholderOf(el: El): PlaceholderInfo | null {
  const nv = [...el.children].find(c => c.localName.startsWith('nv'));
  const ph = path(nv, 'nvPr', 'ph');
  if (!ph) return null;
  return { type: attr(ph, 'type') ?? 'obj', idx: attr(ph, 'idx') };
}

function findPlaceholder(spTree: El | null, ph: PlaceholderInfo): El | null {
  if (!spTree) return null;
  const all = [...spTree.getElementsByTagName('*')].filter(e => e.localName === 'sp');
  const norm = (t: string) => (t === 'ctrTitle' ? 'title' : t === 'subTitle' || t === 'obj' ? 'body' : t);
  return (
    (ph.idx != null ? all.find(s => placeholderOf(s)?.idx === ph.idx) : null) ??
    all.find(s => placeholderOf(s)?.type === ph.type) ??
    all.find(s => norm(placeholderOf(s)?.type ?? '') === norm(ph.type)) ??
    null
  );
}

function isTitle(ph: PlaceholderInfo | null) { return ph?.type === 'title' || ph?.type === 'ctrTitle'; }

async function emitImage(ctx: SlideCtx, rid: string, geo: Geo, opacity = 100, crop?: El | null) {
  const target = (await ctx.pkg.relsOf(ctx.part)).get(rid)?.target;
  const src = target ? await ctx.pkg.mediaUrl(target) : null;
  if (!src) { ctx.warnings.add('Some images use formats browsers cannot display (EMF/WMF) and were skipped.'); return; }
  const cropped = crop ? await cropImage(src, crop) : src;
  ctx.out.push({ type: 'image', src: cropped, x: geo.x, y: geo.y, w: geo.w, h: geo.h, rotation: geo.rot, objectFit: 'fill', opacity });
}

/** Apply a:srcRect cropping (values in 1/1000 of a percent) */
async function cropImage(src: string, rect: El): Promise<string> {
  const [l, t, r, b] = ['l', 't', 'r', 'b'].map(k => (numAttr(rect, k) ?? 0) / 100000);
  if (!l && !t && !r && !b) return src;
  if (typeof document === 'undefined') return src;
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const sx = img.naturalWidth * l, sy = img.naturalHeight * t;
        const sw = img.naturalWidth * (1 - l - r), sh = img.naturalHeight * (1 - t - b);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(sw)); c.height = Math.max(1, Math.round(sh));
        const g = c.getContext('2d');
        if (!g) return resolve(src);
        g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        resolve(c.toDataURL(src.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png'));
      } catch { resolve(src); }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

function lineOf(spPr: El | null, style: El | null, ctx: SlideCtx): { color: string; width: number; dash: 'solid' | 'dashed' | 'dotted' } | null {
  const ln = kid(spPr, 'ln');
  if (ln && kid(ln, 'noFill')) return null;
  let fill = fillOf(ln, ctx.colors);
  let w = numAttr(ln, 'w');
  const lnRef = kid(style, 'lnRef');
  if (!fill && lnRef && (numAttr(lnRef, 'idx') ?? 0) > 0) {
    const rgba = colorOf(firstColorChild(lnRef), ctx.colors);
    if (rgba) fill = { kind: 'color', color: rgbaToCss({ ...rgba, a: 1 }), alpha: rgba.a };
    w ??= ctx.theme.lineWidths[(numAttr(lnRef, 'idx') ?? 1) - 1] ?? 12700;
  }
  if (!fill || fill.kind === 'none' || fill.kind === 'image') return null;
  const prstDash = attr(kid(ln, 'prstDash'), 'val') ?? 'solid';
  const dash = /dot/i.test(prstDash) ? 'dotted' : prstDash === 'solid' ? 'solid' : 'dashed';
  return { color: fill.kind === 'color' ? fill.color : fill.color, width: Math.max(1, ((w ?? 12700) / 12700) * ctx.fontPx), dash };
}

async function parseShape(sp: El, xf: Xf, ctx: SlideCtx, inheritedFromLayout = false) {
  const ph = placeholderOf(sp);
  const spPr = kid(sp, 'spPr');
  const style = kid(sp, 'style');

  // Geometry: own xfrm, else the matching placeholder on the layout, then the master
  const layoutPh = ph && !inheritedFromLayout ? findPlaceholder(ctx.layout?.spTree ?? null, ph) : null;
  const masterPh = ph ? findPlaceholder(ctx.master?.spTree ?? null, ph) : null;
  const xfrm = readXfrm(kid(spPr, 'xfrm')) ?? readXfrm(kid(kid(layoutPh, 'spPr'), 'xfrm')) ?? readXfrm(kid(kid(masterPh, 'spPr'), 'xfrm'));
  if (!xfrm) return;
  const geo = applyXf(xf, xfrm);
  if (geo.w < 1 && geo.h < 1) return;

  const prst = attr(kid(spPr, 'prstGeom'), 'prst') ?? (kid(spPr, 'custGeom') ? 'rect' : 'rect');
  let fill = fillOf(spPr, ctx.colors);
  const fillRef = kid(style, 'fillRef');
  if (!fill && fillRef && (numAttr(fillRef, 'idx') ?? 0) > 0) {
    const rgba = colorOf(firstColorChild(fillRef), ctx.colors);
    if (rgba) fill = { kind: 'color', color: rgbaToCss({ ...rgba, a: 1 }), alpha: rgba.a };
  }
  const line = lineOf(spPr, style, ctx);

  // Text styling chain: shape → layout placeholder → master placeholder → master text styles
  const txBody = kid(sp, 'txBody');
  const ownStyle = kid(txBody, 'lstStyle');
  const chain = [
    ownStyle,
    kid(kid(layoutPh, 'txBody'), 'lstStyle'),
    kid(kid(masterPh, 'txBody'), 'lstStyle'),
    ph ? (isTitle(ph) ? ctx.masterTx.title : ctx.masterTx.body) : ctx.defaultTextStyle ?? ctx.masterTx.other,
  ].filter((e): e is El => !!e);
  const bodyPr = kid(txBody, 'bodyPr');
  const autofit = kid(bodyPr, 'normAutofit');
  const fontRefColor = colorOf(firstColorChild(kid(style, 'fontRef')), ctx.colors);
  const text = parseText(txBody, {
    colors: ctx.colors,
    theme: ctx.theme,
    chain,
    ownStyles: ownStyle ? 1 : 0,
    fontPx: ctx.fontPx,
    fontScale: (numAttr(autofit, 'fontScale') ?? 100000) / 100000,
    lnSpcReduction: (numAttr(autofit, 'lnSpcReduction') ?? 0) / 100000,
    defaultColor: fontRefColor ? rgbaToCss({ ...fontRefColor, a: 1 }) : undefined,
  });
  const anchor = attr(bodyPr, 'anchor') ?? attr(kid(kid(layoutPh, 'txBody'), 'bodyPr'), 'anchor') ?? attr(kid(kid(masterPh, 'txBody'), 'bodyPr'), 'anchor');
  const verticalAlign = anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top';

  if (fill?.kind === 'image') {
    await emitImage(ctx, fill.rid, geo, 100, desc(kid(spPr, 'blipFill'), 'srcRect'));
    return;
  }

  const fillColor = fill?.kind === 'color' ? fill.color : fill?.kind === 'gradient' ? fill.color : 'transparent';
  const fillAlpha = fill?.kind === 'color' ? fill.alpha : 1;
  const border = line ? { borderStyle: line.dash, borderWidth: Math.round(line.width), borderColor: line.color } : {};
  const visible = fillColor !== 'transparent' || !!line;
  const shapeType = PRST_MAP[prst];

  if (shapeType === 'line') {
    if (!line) return;
    ctx.out.push({ type: 'shape', shapeType: 'line', x: geo.x, y: geo.y + geo.h / 2 - Math.max(4, line.width), w: Math.max(geo.w, 2), h: Math.max(8, line.width * 2), rotation: geo.rot, backgroundColor: line.color });
    return;
  }

  const textFields = text ? {
    fontFamily: text.base.fontFamily, fontSize: Math.round(text.base.fontSize * 10) / 10, color: text.base.color,
    fontWeight: text.base.bold ? '700' : '400', fontStyle: text.base.italic ? 'italic' : 'normal',
    textAlign: text.align, lineHeight: +text.lineHeight.toFixed(2),
  } : {};

  const isRectLike = !shapeType || shapeType === 'rect';
  const singleStyle = text && text.paragraphs.length === 1 && text.paragraphs[0].runs.every(r => !r.bold && !r.italic && !r.underline && r.color === text.base.color && Math.abs((r.fontSize ?? 0) - text.base.fontSize) < 0.5);

  if (text && (isRectLike || !singleStyle)) {
    if (!isRectLike && visible) {
      // Non-rectangular shape with rich text: draw the shape, then the text on top
      ctx.out.push({ type: 'shape', shapeType, x: geo.x, y: geo.y, w: geo.w, h: geo.h, rotation: geo.rot, backgroundColor: fillColor, opacity: Math.round(fillAlpha * 100), ...border });
    }
    ctx.out.push({
      type: 'text', x: geo.x, y: geo.y, w: geo.w, h: geo.h, rotation: geo.rot,
      backgroundColor: isRectLike && fillColor !== 'transparent' ? fillColor : 'transparent',
      opacity: isRectLike && fillColor !== 'transparent' ? Math.round(fillAlpha * 100) : 100,
      ...(isRectLike ? border : {}),
      ...textFields,
      verticalAlign,
      text: paragraphsToHtml(text.paragraphs, { color: text.base.color, fontSize: text.base.fontSize, fontFamily: text.base.fontFamily }),
    });
    return;
  }

  if (!visible && !text) return; // empty, invisible placeholder
  ctx.out.push({
    type: 'shape', shapeType: shapeType ?? 'rect', x: geo.x, y: geo.y, w: geo.w, h: geo.h, rotation: geo.rot,
    backgroundColor: fillColor, opacity: Math.round(fillAlpha * 100), ...border,
    ...(shapeType === 'ellipse' && Math.abs(geo.w - geo.h) < 1 ? { shapeType: 'circle' } : {}),
    ...(prst === 'roundRect' ? { borderRadius: Math.round(Math.min(geo.w, geo.h) * 0.166) } : {}),
    ...textFields,
    text: text?.plain ?? '',
  });
}

async function parseTree(tree: El | null, xf: Xf, ctx: SlideCtx, opts: { skipPlaceholders?: boolean; fromLayout?: boolean } = {}) {
  if (!tree) return;
  for (const el of tree.children) {
    switch (el.localName) {
      case 'sp':
        if (opts.skipPlaceholders && placeholderOf(el)) break;
        await parseShape(el, xf, ctx, opts.fromLayout);
        break;
      case 'cxnSp': {
        const spPr = kid(el, 'spPr');
        const x = readXfrm(kid(spPr, 'xfrm'));
        const line = lineOf(spPr, kid(el, 'style'), ctx);
        if (!x || !line) break;
        const g = applyXf(xf, x);
        // Connectors are drawn as straight lines along their bounding box diagonal
        const len = Math.hypot(g.w, g.h);
        const angle = g.w || g.h ? Math.atan2(g.h, g.w) * 180 / Math.PI : 0;
        const flip = attr(kid(spPr, 'xfrm'), 'flipV') === '1' ? -1 : 1;
        const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
        const h = Math.max(8, line.width * 2);
        ctx.out.push({ type: 'shape', shapeType: 'line', x: cx - len / 2, y: cy - h / 2, w: Math.max(len, 2), h, rotation: ((g.rot + angle * flip) % 360 + 360) % 360, backgroundColor: line.color });
        break;
      }
      case 'pic': {
        if (opts.skipPlaceholders && placeholderOf(el)) break;
        const blipFill = kid(el, 'blipFill');
        const rid = relAttr(kid(blipFill, 'blip'), 'embed');
        const x = readXfrm(kid(kid(el, 'spPr'), 'xfrm'));
        if (rid && x) await emitImage(ctx, rid, applyXf(xf, x), 100, kid(blipFill, 'srcRect'));
        break;
      }
      case 'grpSp': {
        const gx = readXfrm(kid(kid(el, 'grpSpPr'), 'xfrm'));
        let inner = xf;
        if (gx?.chOff && gx.chExt && gx.chExt[0] && gx.chExt[1]) {
          const kx = gx.ext[0] / gx.chExt[0], ky = gx.ext[1] / gx.chExt[1];
          inner = {
            sx: xf.sx * kx, sy: xf.sy * ky,
            tx: xf.tx + xf.sx * (gx.off[0] - gx.chOff[0] * kx),
            ty: xf.ty + xf.sy * (gx.off[1] - gx.chOff[1] * ky),
          };
        }
        await parseTree(el, inner, ctx, opts);
        break;
      }
      case 'graphicFrame': {
        const x = readXfrm(kid(el, 'xfrm'));
        const tbl = desc(el, 'tbl');
        if (x && tbl) {
          // Tables become a text box: one line per row, cells separated by a gap
          const rows = kids(tbl, 'tr').map(tr => kids(tr, 'tc').map(tc => (desc(tc, 'txBody')?.textContent ?? '').trim()).join('   ·   '));
          const g = applyXf(xf, x);
          ctx.out.push({ type: 'text', x: g.x, y: g.y, w: g.w, h: g.h, fontSize: 14, color: ctx.theme.colors.dk1 ?? '#000000', fontFamily: ctx.theme.minorFont, text: rows.map(r => r.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>') });
          ctx.warnings.add('Tables were converted to plain text boxes.');
        } else if (desc(el, 'chart')) {
          ctx.warnings.add('Charts are not supported yet and were skipped.');
        } else {
          ctx.warnings.add('Some embedded objects (SmartArt, media) were skipped.');
        }
        break;
      }
      case 'AlternateContent': {
        const choice = kid(el, 'Fallback') ?? kid(el, 'Choice');
        await parseTree(choice, xf, ctx, opts);
        break;
      }
    }
  }
}

async function backgroundOf(layers: { doc: Document; part: string }[], ctx: SlideCtx): Promise<{ background: string; backgroundImage: string }> {
  for (const layer of layers) {
    const bg = path(layer.doc.documentElement, 'cSld', 'bg');
    if (!bg) continue;
    const bgPr = kid(bg, 'bgPr');
    const bgRef = kid(bg, 'bgRef');
    let fill: Fill | null = null;
    if (bgPr) fill = fillOf(bgPr, ctx.colors);
    else if (bgRef) {
      const idx = numAttr(bgRef, 'idx') ?? 0;
      const refColor = colorOf(firstColorChild(bgRef), ctx.colors);
      const placeholderColor = refColor ? rgbaToCss({ ...refColor, a: 1 }) : undefined;
      const styleFill = idx >= 1001 ? ctx.theme.bgFills[idx - 1001] : null;
      if (styleFill) {
        const wrapper = styleFill.ownerDocument.createElement('wrap');
        wrapper.appendChild(styleFill.cloneNode(true));
        fill = fillOf(wrapper, { ...ctx.colors, placeholderColor });
      }
      if (!fill && placeholderColor) fill = { kind: 'color', color: placeholderColor, alpha: 1 };
    }
    if (!fill) continue;
    if (fill.kind === 'color') return { background: fill.color, backgroundImage: '' };
    if (fill.kind === 'gradient') return { background: fill.css, backgroundImage: '' };
    if (fill.kind === 'image') {
      const target = (await ctx.pkg.relsOf(layer.part)).get(fill.rid)?.target;
      const src = target ? await ctx.pkg.mediaUrl(target) : null;
      if (src) return { background: '#ffffff', backgroundImage: src };
    }
    if (fill.kind === 'none') return { background: '#ffffff', backgroundImage: '' };
  }
  return { background: ctx.colors.theme.colors[ctx.colors.clrMap.bg1 ?? 'lt1'] ?? '#ffffff', backgroundImage: '' };
}

async function notesOf(pkg: Package, slidePart: string): Promise<string> {
  const notesPart = await pkg.relOfType(slidePart, 'notesSlide');
  const doc = notesPart ? await pkg.doc(notesPart) : null;
  if (!doc) return '';
  const body = [...doc.getElementsByTagName('*')].filter(e => e.localName === 'sp').find(sp => placeholderOf(sp)?.type === 'body');
  if (!body) return '';
  return kids(kid(body, 'txBody'), 'p').map(p => [...p.getElementsByTagName('*')].filter(e => e.localName === 't').map(t => t.textContent).join('')).join('\n').trim();
}

export interface PptxImportResult {
  deck: { title: string; slides: Record<string, unknown>[] };
  warnings: string[];
}

export async function pptxToDeck(data: ArrayBuffer | Blob | Uint8Array, fileName = 'Presentation.pptx'): Promise<PptxImportResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error('This file is not a valid PowerPoint (.pptx) document.');
  }
  const pkg = new Package(zip);
  const presPart = 'ppt/presentation.xml';
  const pres = await pkg.doc(presPart);
  if (!pres) {
    if (zip.file('[Content_Types].xml') && !zip.file(presPart)) throw new Error('This file is not a PowerPoint presentation.');
    throw new Error('This file is not a valid PowerPoint (.pptx) document.');
  }
  const root = pres.documentElement;
  const sldSz = kid(root, 'sldSz');
  const cx = numAttr(sldSz, 'cx') ?? 12192000;
  const cy = numAttr(sldSz, 'cy') ?? 6858000;
  // Fit the source page into 960×540, letterboxing other aspect ratios
  const s = Math.min(SLIDE_W / cx, SLIDE_H / cy);
  const xf: Xf = { sx: s, sy: s, tx: (SLIDE_W - cx * s) / 2, ty: (SLIDE_H - cy * s) / 2 };
  const fontPx = 12700 * s; // 1 pt = 12700 EMU

  const presRels = await pkg.relsOf(presPart);
  const slideParts = kids(kid(root, 'sldIdLst'), 'sldId')
    .map(el => presRels.get(relAttr(el, 'id') ?? '')?.target)
    .filter((p): p is string => !!p);

  const warnings = new Set<string>();
  const slides: Record<string, unknown>[] = [];

  for (const part of slideParts) {
    const doc = await pkg.doc(part);
    if (!doc) continue;
    const layoutPart = await pkg.relOfType(part, 'slideLayout');
    const layoutDoc = layoutPart ? await pkg.doc(layoutPart) : null;
    const masterPart = layoutPart ? await pkg.relOfType(layoutPart, 'slideMaster') : null;
    const masterDoc = masterPart ? await pkg.doc(masterPart) : null;
    const themePart = masterPart ? await pkg.relOfType(masterPart, 'theme') : null;
    const theme = readTheme(themePart ? await pkg.doc(themePart) : null);

    const clrMapEl = kid(masterDoc?.documentElement, 'clrMap');
    const override = path(doc.documentElement, 'clrMapOvr', 'overrideClrMapping') ?? path(layoutDoc?.documentElement, 'clrMapOvr', 'overrideClrMapping');
    const clrMap: Record<string, string> = {};
    [...((override ?? clrMapEl)?.attributes ?? [])].forEach(a => { clrMap[a.localName] = a.value; });

    const txStyles = kid(masterDoc?.documentElement, 'txStyles');
    const ctx: SlideCtx = {
      pkg, part, theme,
      colors: { theme, clrMap },
      layout: layoutDoc && layoutPart ? { part: layoutPart, doc: layoutDoc, spTree: path(layoutDoc.documentElement, 'cSld', 'spTree') } : null,
      master: masterDoc && masterPart ? { part: masterPart, doc: masterDoc, spTree: path(masterDoc.documentElement, 'cSld', 'spTree') } : null,
      masterTx: { title: kid(txStyles, 'titleStyle'), body: kid(txStyles, 'bodyStyle'), other: kid(txStyles, 'otherStyle') },
      defaultTextStyle: kid(root, 'defaultTextStyle'),
      fontPx,
      warnings,
      out: [],
    };

    const layers = [
      { doc, part },
      ...(layoutDoc && layoutPart ? [{ doc: layoutDoc, part: layoutPart }] : []),
      ...(masterDoc && masterPart ? [{ doc: masterDoc, part: masterPart }] : []),
    ];
    const bg = await backgroundOf(layers, ctx);

    // Decorative master/layout artwork sits behind the slide's own content
    const showMaster = attr(doc.documentElement, 'showMasterSp') !== '0';
    const layoutShowsMaster = attr(layoutDoc?.documentElement, 'showMasterSp') !== '0';
    if (showMaster && layoutShowsMaster && ctx.master) {
      await parseTree(ctx.master.spTree, xf, { ...ctx, part: ctx.master.part }, { skipPlaceholders: true, fromLayout: true });
    }
    if (showMaster && ctx.layout) {
      await parseTree(ctx.layout.spTree, xf, { ...ctx, part: ctx.layout.part }, { skipPlaceholders: true, fromLayout: true });
    }
    await parseTree(path(doc.documentElement, 'cSld', 'spTree'), xf, ctx);

    const transitionEl = kid(doc.documentElement, 'transition');
    const transition = transitionEl ? (kid(transitionEl, 'push') || kid(transitionEl, 'wipe') ? 'slide-left' : kid(transitionEl, 'zoom') ? 'zoom-in' : 'fade') : 'none';

    slides.push({
      ...bg,
      transition,
      transitionDuration: 0.5,
      notes: await notesOf(pkg, part),
      objects: ctx.out.map(o => ({ ...o, x: Math.round(o.x as number), y: Math.round(o.y as number), w: Math.round(o.w as number), h: Math.round(o.h as number) })),
    });
  }

  if (!slides.length) throw new Error('No slides were found in this presentation.');

  const core = await pkg.doc('docProps/core.xml');
  const docTitle = [...(core?.getElementsByTagName('*') ?? [])].find(e => e.localName === 'title')?.textContent?.trim();
  const title = docTitle || fileName.replace(/\.pptx$/i, '');
  return { deck: { title, slides }, warnings: [...warnings] };
}
