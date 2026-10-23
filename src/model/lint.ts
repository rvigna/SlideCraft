/* ========================================================
   Design linting: find layout, legibility and consistency
   problems, and fix most of them in one click.
   Pure functions over the deck; text measurement is injected
   so the same rules run in the browser (DOM) and the CLI.
   ======================================================== */
import type { Deck, Slide, SlideObject, TextObject } from './types';
import { SLIDE_H, SLIDE_W, isTextual } from './types';
import { gradientStops, parseColor } from './color';
import { getTheme, isHeadingSize, type DeckTheme } from './themes';
import { htmlToPlain } from './richtext';
import { intersects } from './geometry';

export type Severity = 'error' | 'warning' | 'info';

export type RuleId =
  | 'text-overflow' | 'off-slide' | 'low-contrast' | 'tiny-text' | 'too-many-fonts'
  | 'misaligned' | 'empty-text' | 'crowded' | 'text-overlap' | 'no-title';

export interface LintIssue {
  /** Stable key: rule + slide + objects */
  key: string;
  rule: RuleId;
  severity: Severity;
  /** Slide index, or -1 for deck-wide issues */
  slide: number;
  objectIds: number[];
  message: string;
  /** Label for the one-click fix, when the rule has one */
  fix?: string;
  /** Rule-specific data the fix needs */
  data?: Record<string, number | string>;
}

export interface LintContext {
  /** Height the text content needs at the object's width (slide units) */
  measureText: (obj: TextObject) => number;
  theme: DeckTheme;
}

export const RULES: Record<RuleId, { title: string; description: string }> = {
  'text-overflow': { title: 'Text overflows its box', description: 'Text runs past the bottom of its box and gets clipped.' },
  'off-slide': { title: 'Object off the slide', description: 'Part of the object sits outside the slide and will be cut off.' },
  'low-contrast': { title: 'Low contrast text', description: 'Text color is too close to its background to read comfortably (WCAG AA).' },
  'tiny-text': { title: 'Text too small', description: 'Text under 12pt is hard to read from the back of a room.' },
  'too-many-fonts': { title: 'Too many fonts', description: 'More than three typefaces makes a deck look inconsistent.' },
  misaligned: { title: 'Almost aligned', description: 'Edges a few pixels apart look like a mistake. Snap them together.' },
  'empty-text': { title: 'Empty text box', description: 'An empty box shows nothing when presenting.' },
  crowded: { title: 'Crowded slide', description: 'Too many words or bullets. Consider splitting the slide.' },
  'text-overlap': { title: 'Overlapping text', description: 'Two text objects overlap, so neither reads cleanly.' },
  'no-title': { title: 'No slide title', description: 'Slides without a title are harder to navigate and less accessible.' },
};

// ---------------------------------------------------------------
// Color contrast (WCAG 2.x)
// ---------------------------------------------------------------
function luminance(color: string): number | null {
  const c = parseColor(color);
  if (!c) return null;
  const ch = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a), lb = luminance(b);
  if (la == null || lb == null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Background colors behind an object: its own fill, filled shapes below it, else the slide */
function backgroundsBehind(slide: Slide, obj: SlideObject): string[] | null {
  if (obj.backgroundColor && obj.backgroundColor !== 'transparent' && (parseColor(obj.backgroundColor)?.a ?? 1) > 0.5) return [obj.backgroundColor];
  const idx = slide.objects.indexOf(obj);
  const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
  for (let i = idx - 1; i >= 0; i--) {
    const o = slide.objects[i];
    if (cx < o.x || cx > o.x + o.w || cy < o.y || cy > o.y + o.h) continue;
    if (o.type === 'image') return null; // can't know what the photo looks like there
    if ((o.type === 'shape' || o.type === 'text') && o.backgroundColor !== 'transparent' && o.opacity >= 60) {
      if (o.type === 'shape' && o.shapeType === 'line') continue;
      return [o.backgroundColor];
    }
  }
  if (slide.backgroundImage) return null;
  return /gradient/i.test(slide.background) ? gradientStops(slide.background).map(s => s.color) : [slide.background];
}

function isLargeText(fontSize: number, fontWeight: string): boolean {
  // WCAG "large": 18pt (24px) or 14pt (18.66px) bold
  return fontSize >= 24 || (fontSize >= 18.66 && parseInt(fontWeight) >= 700);
}

function textOf(o: SlideObject): string {
  if (o.type === 'text') return htmlToPlain(o.text);
  if (o.type === 'shape') return o.text;
  if (o.type === 'table') return o.rows.flat().map(c => c.text).join(' ');
  return '';
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

// ---------------------------------------------------------------
// Rules
// ---------------------------------------------------------------
export function lintDeck(deck: Deck, ctx: LintContext): LintIssue[] {
  const issues: LintIssue[] = [];
  const push = (i: Omit<LintIssue, 'key'>) => issues.push({ ...i, key: `${i.rule}:${i.slide}:${i.objectIds.join(',')}` });

  deck.slides.forEach((slide, s) => {
    const objs = slide.objects;

    for (const o of objs) {
      // Off-slide
      const out = o.x < -2 || o.y < -2 || o.x + o.w > SLIDE_W + 2 || o.y + o.h > SLIDE_H + 2;
      const fullBleed = o.w >= SLIDE_W - 2 && o.h >= SLIDE_H - 2;
      if (out && !fullBleed && !o.rotation) {
        push({ rule: 'off-slide', severity: 'warning', slide: s, objectIds: [o.id], message: `${label(o)} extends past the slide edge`, fix: 'Move inside' });
      }

      const text = textOf(o);
      if (o.type === 'text') {
        if (!text.trim()) {
          push({ rule: 'empty-text', severity: 'info', slide: s, objectIds: [o.id], message: 'Empty text box', fix: 'Delete' });
          continue;
        }
        const needed = ctx.measureText(o);
        if (needed > o.h + 4) {
          push({ rule: 'text-overflow', severity: 'warning', slide: s, objectIds: [o.id], message: `“${snippet(text)}” needs ${Math.round(needed)}px but its box is ${Math.round(o.h)}px tall`, fix: 'Fit text', data: { needed } });
        }
      }

      if (isTextual(o) && text.trim()) {
        if (o.fontSize < 12) {
          push({ rule: 'tiny-text', severity: 'warning', slide: s, objectIds: [o.id], message: `“${snippet(text)}” is ${Math.round(o.fontSize)}px`, fix: 'Set to 14px' });
        }
        const bgs = backgroundsBehind(slide, o);
        if (bgs && o.type !== 'table') {
          const ratio = Math.min(...bgs.map(bg => contrastRatio(o.color, bg) ?? 21));
          const needed = isLargeText(o.fontSize, o.fontWeight) ? 3 : 4.5;
          if (ratio < needed) {
            push({
              rule: 'low-contrast', severity: ratio < 2 ? 'error' : 'warning', slide: s, objectIds: [o.id],
              message: `“${snippet(text)}” has contrast ${ratio.toFixed(1)}:1 (needs ${needed}:1)`, fix: 'Fix color',
            });
          }
        }
      }
    }

    // Text on text
    const textual = objs.filter(o => isTextual(o) && textOf(o).trim());
    for (let i = 0; i < textual.length; i++) {
      for (let j = i + 1; j < textual.length; j++) {
        const a = textual[i], b = textual[j];
        if (!intersects(a, b)) continue;
        const iw = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const ih = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        const smaller = Math.min(a.w * a.h, b.w * b.h);
        // A shape behind a text box is a deliberate callout; only flag two text-bearing boxes on top of each other
        if (a.type === 'shape' && !a.text) continue;
        if (iw * ih > smaller * 0.15) {
          push({ rule: 'text-overlap', severity: 'warning', slide: s, objectIds: [a.id, b.id], message: `“${snippet(textOf(a))}” overlaps “${snippet(textOf(b))}”` });
        }
      }
    }

    // Near-miss alignment: left or top edges 1–5px apart
    const seen = new Set<string>();
    for (const a of objs) {
      for (const b of objs) {
        if (a.id >= b.id) continue;
        for (const edge of ['x', 'y'] as const) {
          const d = Math.abs(a[edge] - b[edge]);
          const k = `${Math.min(a.id, b.id)}-${Math.max(a.id, b.id)}-${edge}`;
          if (d >= 1 && d <= 5 && !seen.has(k)) {
            seen.add(k);
            // The earlier (lower) object is the anchor
            const [anchor, mover] = objs.indexOf(a) < objs.indexOf(b) ? [a, b] : [b, a];
            push({
              rule: 'misaligned', severity: 'info', slide: s, objectIds: [mover.id, anchor.id],
              message: `${label(mover)} is ${Math.round(d)}px off ${edge === 'x' ? 'the left edge' : 'the top edge'} of ${label(anchor)}`,
              fix: 'Snap', data: { edge, to: anchor[edge] },
            });
          }
        }
      }
    }

    // Crowding
    const allText = objs.map(textOf).join(' ');
    const bullets = objs.reduce((n, o) => n + (o.type === 'text' ? (o.text.match(/<li>/g) ?? []).length : 0), 0);
    if (words(allText) > 90 || bullets > 8) {
      push({ rule: 'crowded', severity: 'warning', slide: s, objectIds: [], message: `${words(allText)} words${bullets ? ` and ${bullets} bullets` : ''} on one slide` });
    }

    // Titles
    const hasTitle = objs.some(o => o.type === 'text' && isHeadingSize(o.fontSize, o.fontWeight) && htmlToPlain(o.text).trim());
    if (objs.length && !hasTitle && !objs.some(o => o.type === 'image' && o.w >= SLIDE_W - 2)) {
      push({ rule: 'no-title', severity: 'info', slide: s, objectIds: [], message: 'This slide has no title' });
    }
  });

  // Deck-wide font count
  const fonts = new Set<string>();
  deck.slides.forEach(s => s.objects.forEach(o => { if (isTextual(o) || o.type === 'chart') fonts.add(o.fontFamily); }));
  if (fonts.size > 3) {
    issues.push({
      key: 'too-many-fonts', rule: 'too-many-fonts', severity: 'warning', slide: -1, objectIds: [],
      message: `${fonts.size} typefaces in use: ${[...fonts].join(', ')}`, fix: `Use ${ctx.theme.headingFont}${ctx.theme.bodyFont !== ctx.theme.headingFont ? ` + ${ctx.theme.bodyFont}` : ''}`,
    });
  }
  const order: Severity[] = ['error', 'warning', 'info'];
  return issues.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || a.slide - b.slide);
}

function snippet(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 28 ? t.slice(0, 26) + '…' : t;
}

function label(o: SlideObject): string {
  const t = textOf(o).trim();
  if (t) return `“${snippet(t)}”`;
  return { text: 'A text box', shape: 'A shape', image: 'An image', icon: 'An icon', table: 'A table', chart: 'A chart' }[o.type];
}

// ---------------------------------------------------------------
// Fixes — mutate a draft deck (call inside the store's commit)
// ---------------------------------------------------------------
export function fixIssue(deck: Deck, issue: LintIssue, ctx: LintContext): boolean {
  const slide = deck.slides[issue.slide];
  const find = (id: number) => slide?.objects.find(o => o.id === id);
  switch (issue.rule) {
    case 'off-slide': {
      const o = find(issue.objectIds[0]);
      if (!o) return false;
      o.w = Math.min(o.w, SLIDE_W);
      o.h = Math.min(o.h, SLIDE_H);
      o.x = Math.max(0, Math.min(SLIDE_W - o.w, o.x));
      o.y = Math.max(0, Math.min(SLIDE_H - o.h, o.y));
      return true;
    }
    case 'empty-text':
      if (!slide) return false;
      slide.objects = slide.objects.filter(o => o.id !== issue.objectIds[0]);
      return true;
    case 'text-overflow': {
      const o = find(issue.objectIds[0]);
      if (o?.type !== 'text') return false;
      const needed = ctx.measureText(o);
      const grown = { x: o.x, y: o.y, w: o.w, h: Math.ceil(needed) + 2 };
      // Grow the box when there's room and it won't run into other content; otherwise shrink the type
      const collides = slide.objects.some(other => other.id !== o.id && !intersects(other, o) && intersects(other, grown));
      if (o.y + grown.h <= SLIDE_H - 12 && !collides) { o.h = grown.h; return true; }
      const below = slide.objects.filter(other => other.id !== o.id && other.y >= o.y + o.h - 1 && other.x < o.x + o.w && other.x + other.w > o.x);
      const limit = Math.min(SLIDE_H - 12, ...below.map(b => b.y - 8));
      // Use the room up to whatever sits below, then shrink the type until it fits
      o.h = Math.max(o.h, limit - o.y);
      const scaleRun = (html: string, k: number) => html.replace(/font-size:\s*(\d+(?:\.\d+)?)px/g, (_, px) => `font-size: ${Math.max(12, Math.round(parseFloat(px) * k))}px`);
      // Never below the legibility floor the tiny-text rule enforces
      for (let i = 0; i < 30 && ctx.measureText(o) > o.h && o.fontSize > 12; i++) {
        const k = Math.max(0.8, Math.min(0.95, Math.sqrt(o.h / ctx.measureText(o))));
        o.fontSize = Math.max(12, Math.round(o.fontSize * k));
        o.text = scaleRun(o.text, k);
      }
      // Still too long at the smallest readable size: let the box grow (an overlap beats clipped text)
      const still = ctx.measureText(o);
      if (still > o.h) o.h = Math.min(SLIDE_H - o.y, Math.ceil(still) + 2);
      return true;
    }
    case 'tiny-text': {
      const o = find(issue.objectIds[0]);
      if (!o || !isTextual(o)) return false;
      o.fontSize = 14;
      return true;
    }
    case 'low-contrast': {
      const o = find(issue.objectIds[0]);
      if (!o || !isTextual(o)) return false;
      const bgs = backgroundsBehind(slide, o) ?? [slide.background];
      const candidates = [ctx.theme.heading, ctx.theme.body, ctx.theme.sectionText, '#161616', '#ffffff'];
      const score = (c: string) => Math.min(...bgs.map(bg => contrastRatio(c, bg) ?? 0));
      // Prefer theme colors that pass; otherwise whichever reads best
      const needed = isLargeText(o.fontSize, o.fontWeight) ? 3 : 4.5;
      o.color = candidates.find(c => score(c) >= needed) ?? candidates.reduce((a, b) => (score(b) > score(a) ? b : a));
      if (o.type === 'text') o.text = o.text.replace(/color:\s*[^;"]+;?\s*/g, '');
      return true;
    }
    case 'misaligned': {
      const o = find(issue.objectIds[0]);
      if (!o || !issue.data) return false;
      o[issue.data.edge as 'x' | 'y'] = Number(issue.data.to);
      return true;
    }
    case 'too-many-fonts': {
      deck.slides.forEach(s => s.objects.forEach(o => {
        if (isTextual(o)) o.fontFamily = o.type === 'text' && isHeadingSize(o.fontSize, o.fontWeight) ? ctx.theme.headingFont : ctx.theme.bodyFont;
        if (o.type === 'chart') o.fontFamily = ctx.theme.bodyFont;
        if (o.type === 'text') o.text = o.text.replace(/font-family:\s*[^;"]+;?\s*/g, '');
      }));
      return true;
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------
// Text measurement without a browser (CLI): average glyph widths
// ---------------------------------------------------------------
export function estimateTextHeight(obj: TextObject): number {
  const innerW = Math.max(10, obj.w - 24);
  const charW = obj.fontSize * (/mono|code|courier/i.test(obj.fontFamily) ? 0.6 : 0.5);
  const perLine = Math.max(1, Math.floor(innerW / charW));
  const paragraphs = htmlToPlain(obj.text).split('\n');
  const lines = paragraphs.reduce((n, p) => n + Math.max(1, Math.ceil(p.length / perLine)), 0);
  return lines * obj.fontSize * (obj.lineHeight || 1.4) + 16;
}

export function defaultLintContext(deck: Deck, measureText: LintContext['measureText'] = estimateTextHeight): LintContext {
  return { measureText, theme: getTheme(deck.themeName) };
}
