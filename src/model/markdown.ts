/* ========================================================
   Decks as code: Markdown ⇄ slides.

   ---                      front matter: title, theme, motion,
   title: Q3 Review         footer (text on every slide), paginate (slide numbers)
   theme: Carbon Dark
   ---
   # Slide title            one "# " heading per slide
   ## Subtitle              subtitle on title/section slides, sub-heading elsewhere
   ### Point               2–4 "###" sections side by side become cards
   Text, **bold**, *italic*, ~~strike~~, `code`
   - bullets                long lists continue on extra slides
     - nested bullets (2-space indent)
   1. numbered
   | tables | in | GFM |
   ```chart column          charts: column, bar, line, area, pie, doughnut
   title: Revenue
   categories: Q1, Q2, Q3
   EMEA: 90, 104, 118
   ```
   ```js                    any other fenced block is a code box
   ![alt](image-url)        ![bg](url) background · ![bg left](url) / ![bg right](url) half-slide picture
   > A quote               a slide with only a quote uses the Quote layout
   # 42%                    a number as the title uses the Big Number layout
   |||                      starts the next column (or <!-- column -->)
   <!-- layout: section -->   directives: layout, background, transition, motion
   Note: speaker notes…     everything after "Note:" (or <!-- notes: … -->)
   ---                      a line with only --- starts a new slide. Without any,
                            each "# " heading starts one (each "## " when there is a single "# " title)
   ======================================================== */
import type { ChartType, Deck, ImageObject, Slide, SlideObject, TableObject, TextObject, Transition } from './types';
import { SLIDE_H, SLIDE_W } from './types';
import {
  createBlankSlide, createChartObject, createImageObject, createTableObject, createTextObject, IdSource, newSlideId,
} from './factory';
import { getTheme, isHeadingSize, THEMES, type DeckTheme } from './themes';
import { htmlToParagraphs, htmlToPlain, paragraphsToHtml, type Paragraph, type TextRun } from './richtext';
import { seriesColor, tableColors } from './palette';
import { contrastText, mixColors } from './color';
import { contrastRatio, estimateTextHeight } from './lint';
import { LAYOUTS } from './layouts';
import { applyMotionToSlide, detectPreset, MOTION_PRESETS, type MotionOptions } from './motion';

// ---------------------------------------------------------------
// Inline formatting
// ---------------------------------------------------------------
const INLINE = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\[[^\]]+\]\([^)]+\))/;

export function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Backslash escapes (\*) become private-use placeholders so the patterns skip them
  const unescape = (s: string) => s.replace(/[-]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xE000));
  text = text.replace(/\\([\\`*_~[\]()#|>!-])/g, (_, c: string) => String.fromCharCode(0xE000 + c.charCodeAt(0)));
  for (const raw of text.split(INLINE)) {
    if (!raw) continue;
    const part = unescape(raw);
    if (part.startsWith('***') && part.length > 6) runs.push({ text: part.slice(3, -3), bold: true, italic: true });
    else if (/^(\*\*|__)/.test(part) && part.length > 4) runs.push({ text: part.slice(2, -2), bold: true });
    else if (part.startsWith('~~')) runs.push({ text: part.slice(2, -2), strike: true });
    else if (part.startsWith('`')) runs.push({ text: part.slice(1, -1), fontFamily: 'IBM Plex Mono' });
    else if (/^[*_]/.test(part) && part.length > 2 && /[*_]$/.test(part)) runs.push({ text: part.slice(1, -1), italic: true });
    else if (part.startsWith('[') && part.includes('](')) runs.push({ text: part.slice(1, part.indexOf('](')) });
    else runs.push({ text: part });
  }
  return runs;
}

function runsToMarkdown(runs: TextRun[]): string {
  return runs.map(r => {
    let t = r.text;
    if (!t.trim()) return t;
    if (r.fontFamily && /mono|code|courier/i.test(r.fontFamily)) return `\`${t}\``;
    if (r.bold) t = `**${t}**`;
    if (r.italic) t = `*${t}*`;
    if (r.strike) t = `~~${t}~~`;
    return t;
  }).join('');
}

export function htmlToMarkdown(html: string): string {
  const paras = htmlToParagraphs(html);
  return paras.map((p, i) => {
    const text = runsToMarkdown(p.runs);
    const line = p.bullet ? `${'  '.repeat(p.level ?? 0)}${p.bullet === 'number' ? '1.' : '-'} ${text}` : text;
    // List items sit on consecutive lines; anything else needs a blank line to stay a separate paragraph
    const sep = i === 0 ? '' : p.bullet && paras[i - 1].bullet ? '\n' : '\n\n';
    return sep + line;
  }).join('').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------
type ImagePlace = 'inline' | 'bg' | 'left' | 'right';
type Block = (
  | { kind: 'h1' | 'h2' | 'h3'; text: string }
  | { kind: 'text'; paragraphs: Paragraph[] }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'chart'; chartType: ChartType; title: string; categories: string[]; series: { name: string; values: number[] }[]; showLegend: boolean; showValues: boolean }
  | { kind: 'image'; src: string; alt: string; place: ImagePlace }
  | { kind: 'code'; lang: string; lines: string[] }
  | { kind: 'quote'; text: string }
) & { col: number };

interface ParsedSlide { blocks: Block[]; notes: string; directives: Record<string, string> }

const CHART_TYPES: ChartType[] = ['column', 'bar', 'line', 'area', 'pie', 'doughnut'];
const SEPARATOR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*(```|~~~)/;
const COLUMN_BREAK = /^\s*\|\|\|\s*$/;

/** Split lines at `isBreak` (outside code fences). `keep` keeps the breaking line at the start of the next chunk. */
function splitAt(lines: string[], isBreak: (line: string) => boolean, keep: boolean): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let fence = false;
  for (const line of lines) {
    if (FENCE.test(line)) fence = !fence;
    if (!fence && isBreak(line)) {
      chunks.push(current.join('\n'));
      current = keep ? [line] : [];
      continue;
    }
    current.push(line);
  }
  chunks.push(current.join('\n'));
  return chunks.filter(s => s.trim());
}

/** The slide's own "## Heading" becomes its "# Title"; deeper headings keep their level */
function promoteTitle(src: string): string {
  return src.replace(/^(\s*)##(\s)/, '$1#$2');
}

export interface MarkdownOptions {
  /** Without "---" separators, start a slide at each heading (default true). Off for single-slide snippets. */
  autoSplit?: boolean;
}

function splitSlides(body: string, autoSplit: boolean): string[] {
  const lines = body.split('\n');
  const explicit = splitAt(lines, l => SEPARATOR.test(l), false);
  if (explicit.length > 1 || !autoSplit) return explicit;
  // No separators (pasted notes, a README…): headings start slides
  let fence = false, h1 = 0, h2 = 0;
  for (const l of lines) {
    if (FENCE.test(l)) fence = !fence;
    else if (!fence && /^#\s/.test(l)) h1++;
    else if (!fence && /^##\s/.test(l)) h2++;
  }
  if (h1 >= 2) return splitAt(lines, l => /^#\s/.test(l), true);
  if (h2 >= 2) {
    // One "# Title" (the title slide) and "## Sections" (one slide each); a "##" right under the title is its subtitle
    let onlyTitle = false;
    const chunks = splitAt(lines, l => {
      const isH1 = /^#\s/.test(l);
      const breaks = isH1 || (/^##\s/.test(l) && !onlyTitle);
      if (breaks || l.trim()) onlyTitle = isH1;
      return breaks;
    }, true);
    return chunks.map(c => (/^\s*##\s/.test(c) ? promoteTitle(c) : c));
  }
  return explicit;
}

function parseChart(info: string, lines: string[]) {
  const chartType = (CHART_TYPES.find(t => info.split(/\s+/).includes(t)) ?? 'column') as ChartType;
  let title = '', categories: string[] = [], showLegend = true, showValues = false;
  const series: { name: string; values: number[] }[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim(), value = m[2].trim();
    const lower = key.toLowerCase();
    if (lower === 'title') title = value;
    else if (lower === 'categories' || lower === 'labels') categories = value.split(',').map(s => s.trim()).filter(Boolean);
    else if (lower === 'legend') showLegend = !/^(false|no|off)$/i.test(value);
    else if (lower === 'values' || lower === 'labels-on') showValues = /^(true|yes|on)$/i.test(value);
    else series.push({ name: key, values: value.split(',').map(v => parseFloat(v) || 0) });
  }
  if (!categories.length && series.length) categories = series[0].values.map((_, i) => String(i + 1));
  return { kind: 'chart' as const, chartType, title, categories, series, showLegend, showValues };
}

function imagePlace(alt: string): ImagePlace {
  const words = alt.toLowerCase().trim().split(/\s+/);
  if (words[0] === 'bg') return words.includes('left') ? 'left' : words.includes('right') ? 'right' : 'bg';
  return 'inline';
}

function parseSlide(src: string): ParsedSlide {
  const directives: Record<string, string> = {};
  let notes = '';
  src = src.replace(/<!--\s*column\s*-->/gi, '|||');
  // Comment directives and notes
  src = src.replace(/<!--\s*([\w-]+)\s*:\s*([\s\S]*?)\s*-->/g, (_, k: string, v: string) => {
    if (k.toLowerCase() === 'notes' || k.toLowerCase() === 'note') notes += (notes ? '\n' : '') + v.trim();
    else directives[k.toLowerCase()] = v.trim();
    return '';
  });
  src = src.replace(/<!--[\s\S]*?-->/g, ''); // other comments are just comments
  const noteAt = src.search(/^(Notes?|Speaker notes)\s*:/im);
  if (noteAt >= 0) {
    notes = (notes ? notes + '\n' : '') + src.slice(noteAt).replace(/^(Notes?|Speaker notes)\s*:\s*/i, '').trim();
    src = src.slice(0, noteAt);
  }

  const blocks: Block[] = [];
  const lines = src.split('\n');
  let para: Paragraph[] = [];
  let col = 0;
  const flushText = () => { if (para.length) blocks.push({ kind: 'text', paragraphs: para, col }); para = []; };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE.test(line)) {
      flushText();
      const info = line.replace(FENCE, '').trim();
      const body: string[] = [];
      for (i++; i < lines.length && !FENCE.test(lines[i]); i++) body.push(lines[i]);
      if (/^chart\b/i.test(info)) blocks.push({ ...parseChart(info, body), col });
      else {
        while (body.length && !body[body.length - 1].trim()) body.pop();
        blocks.push({ kind: 'code', lang: info, lines: body, col });
      }
      continue;
    }
    if (COLUMN_BREAK.test(line)) { flushText(); col++; continue; }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#\s+(.*)$/))) { flushText(); blocks.push({ kind: 'h1', text: m[1].trim(), col }); continue; }
    if ((m = line.match(/^##\s+(.*)$/))) { flushText(); blocks.push({ kind: 'h2', text: m[1].trim(), col }); continue; }
    if ((m = line.match(/^#{3,6}\s+(.*)$/))) { flushText(); blocks.push({ kind: 'h3', text: m[1].trim(), col }); continue; }
    if ((m = line.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)[^)]*\)\s*$/))) { flushText(); blocks.push({ kind: 'image', alt: m[1], src: m[2], place: imagePlace(m[1]), col }); continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushText();
      const rows: string[][] = [];
      for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]) && !COLUMN_BREAK.test(lines[i]); i++) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) continue; // separator row
        rows.push(lines[i].trim().slice(1, -1).split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|')));
      }
      i--;
      blocks.push({ kind: 'table', rows, col });
      continue;
    }
    if ((m = line.match(/^\s*>\s?(.*)$/))) {
      flushText();
      const quote = [m[1]];
      for (i++; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s*>\s?/, ''));
      i--;
      blocks.push({ kind: 'quote', text: quote.join(' ').trim(), col });
      continue;
    }
    if ((m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/))) {
      para.push({ runs: inlineRuns(m[3]), bullet: /\d/.test(m[2]) ? 'number' : 'bullet', level: Math.floor(m[1].replace(/\t/g, '  ').length / 2) });
      continue;
    }
    if (!line.trim()) {
      // Blank lines separate paragraphs (and end lists)
      if (para.length && !para[para.length - 1].bullet) flushText();
      continue;
    }
    // Plain text: join soft-wrapped lines into one paragraph ("  " or "\" at the end forces a break)
    const last = para[para.length - 1];
    const prev = lines[i - 1] ?? '';
    const hardBreak = / {2,}$|\\$/.test(prev);
    const text = line.trim().replace(/\\$/, '');
    if (last && !last.bullet && i > 0 && prev.trim() && !hardBreak && !/^(\s*)([-*+]|\d+[.)])\s/.test(prev)) last.runs.push({ text: ' ' }, ...inlineRuns(text));
    else para.push({ runs: inlineRuns(text) });
  }
  flushText();
  return { blocks, notes, directives };
}

function parseFrontMatter(md: string): { meta: Record<string, string>; body: string } {
  const m = md.match(/^﻿?---\s*\n([\s\S]*?)\n---\s*(\n|$)/);
  if (!m) return { meta: {}, body: md };
  const meta: Record<string, string> = {};
  m[1].split('\n').forEach(l => { const kv = l.match(/^\s*([\w-]+)\s*:\s*(.*)$/); if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, ''); });
  return { meta, body: md.slice(m[0].length) };
}

// ---------------------------------------------------------------
// Layout
// ---------------------------------------------------------------
const MARGIN = 60;
const GAP = 32;
const FOOTER_Y = 498;
const LAYOUT_ALIASES: Record<string, string> = {
  title: 'Title Slide', section: 'Section Header', content: 'Title + Content', 'two-column': 'Two Columns',
  blank: 'Blank', quote: 'Quote', 'big-number': 'Big Number', image: 'Image + Text', 'three-points': 'Three Points',
};
const BIG_NUMBER = /^[~≈<>+\-−]?\s*[$€£¥]?\s*\d[\d.,]*\s*(%|x|×|k|m|bn|b|pts?|\+|[KMB])?\+?\s*$/;
const MONO = /mono|courier|consol|menlo|code/i;

type Box = { x: number; y: number; w: number; h: number };
const round = (b: Box): Box => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });

/** Estimated height with a little headroom: browsers wrap slightly earlier than the estimate */
function textHeight(html: string, w: number, fontSize: number, fontFamily: string, lineHeight = 1.4): number {
  return estimateTextHeight(createTextObject(new IdSource(0), { w, fontSize, text: html, fontFamily, lineHeight })) * 1.08;
}

function fits(paragraphs: Paragraph[], w: number, h: number, fontSize: number, t: DeckTheme): boolean {
  return textHeight(paragraphsToHtml(paragraphs), w, fontSize, t.bodyFont) <= h;
}

function fitFontSize(paragraphs: Paragraph[], w: number, h: number, t: DeckTheme, sizes = [24, 22, 20, 18, 16, 14]): number {
  return sizes.find(s => fits(paragraphs, w, h, s, t)) ?? sizes[sizes.length - 1];
}

// The design check calls a slide crowded above 90 words or 8 bullets; leave room for the title and footer
const MAX_BULLETS = 8;
const MAX_WORDS = 75;
const wordCount = (ps: Paragraph[]) => ps.reduce((n, p) => n + p.runs.map(r => r.text).join('').split(/\s+/).filter(Boolean).length, 0);
const bulletCount = (ps: Paragraph[]) => ps.filter(p => p.bullet).length;

function fitsOneSlide(ps: Paragraph[], w: number, h: number, fontSize: number, t: DeckTheme): boolean {
  return fits(ps, w, h, fontSize, t) && bulletCount(ps) <= MAX_BULLETS && wordCount(ps) <= MAX_WORDS;
}

/** Break a long list into slide-sized chunks of similar length, keeping nested items with their parent */
function chunkParagraphs(paragraphs: Paragraph[], w: number, h: number, fontSize: number, t: DeckTheme): Paragraph[][] {
  const items: Paragraph[][] = [];
  for (const p of paragraphs) {
    if ((p.level ?? 0) > 0 && items.length) items[items.length - 1].push(p);
    else items.push([p]);
  }
  const greedy: Paragraph[][] = [];
  let current: Paragraph[] = [];
  for (const item of items) {
    if (current.length && !fitsOneSlide([...current, ...item], w, h, fontSize, t)) { greedy.push(current); current = []; }
    current.push(...item);
  }
  if (current.length) greedy.push(current);
  // Same number of slides, but balanced (8 + 8 reads better than 11 + 5)
  const n = greedy.length;
  const even: Paragraph[][] = Array.from({ length: n }, (_, k) => items.slice(Math.round((k * items.length) / n), Math.round(((k + 1) * items.length) / n)).flat());
  return even.every(c => c.length && fitsOneSlide(c, w, h, fontSize, t)) ? even : greedy;
}

function codeColors(t: DeckTheme) {
  const darkBg = contrastText(t.bg) === '#ffffff';
  return darkBg
    ? { backgroundColor: mixColors(t.bg, '#ffffff', 0.1), color: '#f4f4f4' }
    : { backgroundColor: '#f2f4f8', color: '#161616' };
}

function visualObject(block: Block, ids: IdSource, t: DeckTheme, box: Box): SlideObject | null {
  if (block.kind === 'table') {
    const cols = Math.max(1, ...block.rows.map(r => r.length));
    const rowH = Math.min(48, Math.max(30, box.h / block.rows.length));
    const table = createTableObject(ids, block.rows.length, cols, {
      ...box, h: Math.min(box.h, rowH * block.rows.length), fontFamily: t.bodyFont, color: t.body, ...tableColors(t.accent, t.bg),
      fontSize: rowH < 36 ? 15 : 18,
    });
    table.rows = block.rows.map(r => Array.from({ length: cols }, (_, c) => ({ text: htmlToPlain(paragraphsToHtml([{ runs: inlineRuns(r[c] ?? '') }])) })));
    return table;
  }
  if (block.kind === 'chart') {
    return createChartObject(ids, block.chartType, {
      ...box, title: block.title, categories: block.categories, showLegend: block.showLegend, showValues: block.showValues,
      fontFamily: t.bodyFont, color: t.body,
      series: block.series.map((s, i) => ({ name: s.name, values: block.categories.map((_, k) => s.values[k] ?? 0), color: seriesColor(i, t.accent) })),
    });
  }
  if (block.kind === 'image') return createImageObject(ids, block.src, { ...box, objectFit: 'contain' });
  if (block.kind === 'code') {
    const html = paragraphsToHtml((block.lines.length ? block.lines : ['']).map(l => ({ runs: [{ text: l || ' ' }] })));
    const font = 'IBM Plex Mono';
    const fontSize = [18, 16, 14, 13].find(s => textHeight(html, box.w, s, font, 1.35) <= box.h) ?? 13;
    const h = Math.min(box.h, Math.ceil(textHeight(html, box.w, fontSize, font, 1.35)));
    return createTextObject(ids, { ...box, h, text: html, fontFamily: font, fontSize, lineHeight: 1.35, borderRadius: 6, ...codeColors(t) });
  }
  return null;
}

const blockParagraphs = (b: Block): Paragraph[] =>
  b.kind === 'text' ? b.paragraphs
    : b.kind === 'h2' || b.kind === 'h3' ? [{ runs: inlineRuns(b.text).map(r => ({ ...r, bold: true })) }]
      : b.kind === 'quote' ? [{ runs: [{ text: `“${b.text}”`, italic: true }] }]
        : [];
const isVisual = (b: Block) => b.kind === 'table' || b.kind === 'chart' || b.kind === 'code' || (b.kind === 'image' && b.place === 'inline');

interface BuildOptions { reserveBottom: number }

function buildSlides(parsed: ParsedSlide, index: number, ids: IdSource, t: DeckTheme, opts: BuildOptions): Slide[] {
  const slide = createBlankSlide(t);
  slide.notes = parsed.notes;
  const { blocks, directives } = parsed;
  const h1 = blocks.find(b => b.kind === 'h1') as { text: string } | undefined;
  const bg = blocks.find(b => b.kind === 'image' && b.place === 'bg') as { src: string } | undefined;
  const side = blocks.find(b => b.kind === 'image' && (b.place === 'left' || b.place === 'right')) as { src: string; place: 'left' | 'right' } | undefined;
  const rest = blocks.filter(b => b !== h1 && !(b.kind === 'image' && b.place !== 'inline'));
  const visuals = rest.filter(isVisual);
  const textBlocks = rest.filter(b => b.kind === 'text' || b.kind === 'h2' || b.kind === 'h3');
  const quote = rest.find(b => b.kind === 'quote') as { text: string } | undefined;
  const bottom = SLIDE_H - 30 - opts.reserveBottom;

  if (bg) slide.backgroundImage = bg.src;
  // Region the content flows in: the whole slide, or the half next to a side picture
  const half = SLIDE_W / 2;
  const region = side ? { x: side.place === 'left' ? half + 48 : 48, w: half - 96 } : { x: MARGIN, w: SLIDE_W - MARGIN * 2 };
  if (side) slide.objects.push(createImageObject(ids, side.src, { x: side.place === 'left' ? 0 : half, y: 0, w: half, h: SLIDE_H, objectFit: 'cover' }));
  // Centered layouts are designed for the full slide; map their x/width into the region
  const rx = (x: number) => Math.round(region.x + ((x - MARGIN) / (SLIDE_W - MARGIN * 2)) * region.w);
  const rw = (w: number) => Math.round(Math.min(region.w, (w / (SLIDE_W - MARGIN * 2)) * region.w));

  const heading = (text: string, o: Partial<TextObject>) => createTextObject(ids, { fontFamily: t.headingFont, color: t.heading, fontWeight: '700', text: paragraphsToHtml([{ runs: inlineRuns(text) }]), ...o });
  const body = (paragraphs: Paragraph[], o: Partial<TextObject>) => createTextObject(ids, { fontFamily: t.bodyFont, color: t.body, text: paragraphsToHtml(paragraphs), ...o });
  const plain = (b: Block) => (b.kind === 'h2' || b.kind === 'h3' ? b.text : b.kind === 'text' ? b.paragraphs.map(p => p.runs.map(r => r.text).join('')).join(' ') : '');

  let layout = LAYOUT_ALIASES[directives.layout?.toLowerCase() ?? ''] ?? directives.layout;
  if (!layout) {
    const short = rest.every(b => b.kind === 'h2' || (b.kind === 'text' && b.paragraphs.length <= 2 && !b.paragraphs.some(p => p.bullet)));
    if (h1 && !visuals.length && !quote && short) {
      // "# 42%" with a line of context: big number
      if (BIG_NUMBER.test(h1.text.replace(/[*_`]/g, '')) && index > 0) layout = 'Big Number';
      // First slide: title slide. Later: a lone heading is a section break, heading + "## subtitle" a title slide
      else if (index === 0) layout = 'Title Slide';
      else if (!rest.length) layout = 'Section Header';
      else if (rest.every(b => b.kind === 'h2')) layout = 'Title Slide';
    }
    else if (quote && !visuals.length && !textBlocks.length) layout = 'Quote';
  }

  const extra: Slide[] = [];
  if (layout && LAYOUTS.some(l => l.name === layout) && ['Title Slide', 'Section Header', 'Quote', 'Big Number', 'Blank'].includes(layout)) {
    const sub = rest.map(plain).filter(Boolean).join(' ');
    if (layout === 'Section Header') {
      if (!side && !bg) slide.background = t.sectionBg;
      const color = side || bg ? t.heading : t.sectionText;
      slide.objects.push(heading(h1?.text ?? sub, { x: rx(80), y: 180, w: rw(800), h: 80, fontSize: 48, textAlign: 'center', color }));
      if (h1 && sub) slide.objects.push(body([{ runs: inlineRuns(sub) }], { x: rx(180), y: 280, w: rw(600), h: 50, fontSize: 22, textAlign: 'center', color }));
    } else if (layout === 'Quote') {
      const q = quote?.text ?? sub;
      slide.objects.push(heading(q, { x: rx(120), y: 150, w: rw(720), h: 180, fontSize: q.length > 120 || side ? 26 : 32, fontStyle: 'italic', fontWeight: '600', textAlign: 'center', verticalAlign: 'middle' }));
      const by = (h1?.text ?? (quote ? sub : '')).trim();
      if (by) slide.objects.push(body([{ runs: inlineRuns(by.startsWith('—') ? by : `— ${by}`) }], { x: rx(240), y: 350, w: rw(480), h: 40, fontSize: 18, textAlign: 'center' }));
    } else if (layout === 'Big Number') {
      slide.objects.push(heading(h1?.text ?? '', { x: rx(80), y: 100, w: rw(800), h: 150, fontSize: 96, textAlign: 'center', color: t.accent }));
      if (sub) slide.objects.push(body([{ runs: inlineRuns(sub) }], { x: rx(180), y: 300, w: rw(600), h: 60, fontSize: 22, textAlign: 'center' }));
    } else if (layout === 'Title Slide') {
      slide.objects.push(heading(h1?.text ?? '', { x: rx(80), y: 170, w: rw(800), h: 90, fontSize: side ? 40 : 48, textAlign: 'center', verticalAlign: 'bottom' }));
      if (sub) slide.objects.push(body([{ runs: inlineRuns(sub) }], { x: rx(140), y: 275, w: rw(680), h: 60, fontSize: 22, textAlign: 'center' }));
    }
  } else {
    // Content slide: title on top, then columns, or text and visuals
    const top = h1 ? 116 : 40;
    if (h1) slide.objects.push(heading(h1.text, { x: region.x, y: 36, w: region.w, h: 64, fontSize: side ? 32 : 36 }));
    const area: Box = { x: region.x, y: top, w: region.w, h: bottom - top };

    // Columns: explicit "|||" breaks, or 2–4 "###" sections with no charts or tables (cards)
    const sub = rest[0]?.kind === 'h2' || rest[0]?.kind === 'h3' ? rest[0].kind : null;
    const subs = rest.filter(b => b.kind === sub).length;
    const cards = !!sub && !visuals.length && subs >= 2 && subs <= 4 && !side && !rest.some(b => b.col > 0)
      && rest.every(b => b.kind === sub || (b.kind === 'text' && b.paragraphs.length <= 4));
    let columns: Block[][] = [];
    if (cards) rest.forEach(b => { if (b.kind === sub) columns.push([]); columns[columns.length - 1].push(b); });
    else if (rest.some(b => b.col > 0)) {
      rest.forEach(b => { (columns[b.col] ??= []).push(b); });
      columns = columns.filter(c => c?.length);
    }

    if (columns.length > 1) {
      const colW = Math.floor((area.w - GAP * (columns.length - 1)) / columns.length);
      columns.forEach((col, c) => placeColumn(col, { ...area, x: Math.round(area.x + c * (colW + GAP)), w: colW }, cards));
    } else {
      const paragraphs = textBlocks.flatMap(blockParagraphs);
      if (quote) paragraphs.push(...blockParagraphs(quote as Block));
      const twoCol = paragraphs.length > 0 && visuals.length > 0;
      const textW = twoCol ? Math.round(area.w * 0.48) : area.w;
      if (paragraphs.length > 1 && !visuals.length && !fitsOneSlide(paragraphs, textW, area.h, 18, t)) {
        // Too long for one slide: continue on the next ones rather than shrinking the text
        const [first, ...more] = chunkParagraphs(paragraphs, textW, area.h, 20, t);
        slide.objects.push(body(first, { ...area, fontSize: fitFontSize(first, textW, area.h, t, [22, 20, 18]) }));
        for (const chunk of more) {
          const cont = createBlankSlide(t);
          if (h1) cont.objects.push(heading(`${h1.text} (continued)`, { x: region.x, y: 36, w: region.w, h: 64, fontSize: side ? 32 : 36 }));
          cont.objects.push(body(chunk, { ...area, fontSize: fitFontSize(chunk, textW, area.h, t, [22, 20, 18]) }));
          extra.push(cont);
        }
      } else if (paragraphs.length) {
        slide.objects.push(body(paragraphs, { ...area, w: textW, fontSize: fitFontSize(paragraphs, textW, area.h, t) }));
      }
      if (visuals.length) {
        const x0 = twoCol ? area.x + textW + 40 : area.x;
        const w = twoCol ? area.x + area.w - x0 : area.w;
        // Side by side when there's room, stacked otherwise
        const sideBySide = !twoCol && visuals.length > 1 && !visuals.some(v => v.kind === 'code');
        visuals.forEach((v, i) => {
          const box = sideBySide
            ? { x: x0 + i * ((w + GAP) / visuals.length), y: top, w: (w + GAP) / visuals.length - GAP, h: area.h }
            : { x: x0, y: top + i * (area.h / visuals.length), w, h: area.h / visuals.length - (visuals.length > 1 ? GAP / 2 : 0) };
          const obj = visualObject(v, ids, t, round(box));
          if (obj) slide.objects.push(obj);
        });
      }
    }
  }

  /** One column: an optional heading, then text, then charts/tables/images/code */
  function placeColumn(col: Block[], box: Box, card: boolean) {
    let y = box.y;
    const head = col[0]?.kind === 'h2' || col[0]?.kind === 'h3' ? (col[0] as { text: string }) : null;
    if (head) {
      const fontSize = box.w < 260 ? 20 : 24;
      const html = paragraphsToHtml([{ runs: inlineRuns(head.text) }]);
      const h = Math.ceil(textHeight(html, box.w, fontSize, t.headingFont, 1.25));
      slide.objects.push(heading(head.text, { x: box.x, y, w: box.w, h, fontSize, lineHeight: 1.25, color: card ? t.accent : t.heading }));
      y += h + 4;
    }
    const items = head ? col.slice(1) : col;
    const paragraphs = items.filter(b => !isVisual(b)).flatMap(blockParagraphs);
    const vis = items.filter(isVisual);
    const avail = box.y + box.h - y;
    if (paragraphs.length) {
      const sizes = [20, 18, 16, 14];
      const fontSize = vis.length ? 16 : fitFontSize(paragraphs, box.w, avail, t, sizes);
      const needed = Math.ceil(textHeight(paragraphsToHtml(paragraphs), box.w, fontSize, t.bodyFont));
      const h = vis.length ? Math.min(needed, Math.round(avail * 0.45)) : avail;
      slide.objects.push(body(paragraphs, { x: box.x, y, w: box.w, h, fontSize }));
      y += h + (vis.length ? 16 : 0);
    }
    const left = box.y + box.h - y;
    vis.forEach((v, i) => {
      const each = left / vis.length;
      const obj = visualObject(v, ids, t, round({ x: box.x, y: y + i * each, w: box.w, h: each - (vis.length > 1 ? GAP / 2 : 0) }));
      if (obj) slide.objects.push(obj);
    });
  }

  for (const s of [slide, ...extra]) {
    if (directives.background) {
      if (/^(url\()?https?:|^data:/.test(directives.background)) s.backgroundImage = directives.background.replace(/^url\(|\)$/g, '');
      else s.background = directives.background;
    }
    if (bg) s.backgroundImage = bg.src;
    if (directives.transition) {
      const [kind, dur] = directives.transition.split(/\s+/);
      s.transition = kind as Transition;
      if (dur) s.transitionDuration = parseFloat(dur) || 0.5;
    }
  }
  return [slide, ...extra];
}

function motionOptions(value: string, revealFlag?: string): MotionOptions | null {
  const preset = MOTION_PRESETS.find(m => m.id === value.toLowerCase().split(/\s+/)[0]);
  if (!preset) return null;
  return { preset: preset.id, scope: 'all', slideIndex: 0, animateContent: true, revealOnClick: /click/i.test(value) || revealFlag === 'click', speed: 'normal' };
}

/** Build a deck from Markdown */
export function markdownToDeck(md: string, options: MarkdownOptions = {}): Deck {
  const { meta, body } = parseFrontMatter(md.replace(/\r\n/g, '\n'));
  const theme = getTheme(THEMES.find(t => t.name.toLowerCase() === (meta.theme ?? '').toLowerCase())?.name);
  const ids = new IdSource(1);
  const parsed = splitSlides(body, options.autoSplit ?? true).map(parseSlide);
  const footer = meta.footer ?? '';
  const paginate = /^(true|yes|on)$/i.test(meta.paginate ?? '');
  const reserveBottom = footer || paginate ? 28 : 0;
  const slides: Slide[] = [];
  const slideMotion: (MotionOptions | null)[] = [];
  parsed.forEach((p, i) => {
    const built = buildSlides(p, i, ids, theme, { reserveBottom });
    slides.push(...built);
    built.forEach(() => slideMotion.push(p.directives.motion ? motionOptions(p.directives.motion) : null));
  });

  // Footer and slide numbers on every slide but the first
  slides.forEach((s, i) => {
    if (i === 0 || !(footer || paginate)) return;
    // Readable on this slide's background, and clear of a half-slide picture
    const color = (contrastRatio(theme.body, s.background) ?? 21) >= 4.5 ? theme.body : contrastText(s.background);
    const side = s.objects.find(isSideImage);
    const left = side && side.x <= 1 ? SLIDE_W / 2 + 48 : MARGIN;
    const right = side && side.x > 1 ? SLIDE_W / 2 - 48 : SLIDE_W - MARGIN;
    const small = { y: FOOTER_Y, h: 34, fontSize: 12, fontFamily: theme.bodyFont, color };
    if (footer) s.objects.push(createTextObject(ids, { ...small, x: left, w: Math.min(600, right - left - (paginate ? 90 : 0)), text: paragraphsToHtml([{ runs: inlineRuns(footer) }]) }));
    if (paginate) s.objects.push(createTextObject(ids, { ...small, x: right - 80, w: 80, textAlign: 'right', text: String(i + 1) }));
  });

  // "motion: subtle" (or smooth, focus, lively) in the front matter animates the whole deck; <!-- motion: … --> one slide
  const deckMotion = meta.motion ? motionOptions(meta.motion, meta.reveal) : null;
  slides.forEach((s, i) => {
    const m = slideMotion[i] ?? deckMotion;
    if (m) applyMotionToSlide(s, m);
  });
  const firstH1 = parsed[0]?.blocks.find(b => b.kind === 'h1') as { text: string } | undefined;
  return {
    title: meta.title || (firstH1 ? firstH1.text.replace(/[*_`~]/g, '') : 'Untitled Presentation'),
    themeName: theme.name,
    slides: slides.length ? slides : [createBlankSlide(theme)],
    nextObjectId: ids.next,
  };
}

/** Slides from Markdown, styled for `deck` and with fresh ids, ready to insert into it */
export function slidesFromMarkdown(markdown: string, deck: Pick<Deck, 'themeName'>, ids: { take(): number }, options: MarkdownOptions = {}): Slide[] {
  const { meta, body } = parseFrontMatter(markdown.replace(/\r\n/g, '\n'));
  const front = Object.entries({ ...meta, theme: deck.themeName }).map(([k, v]) => `${k}: ${v}`).join('\n');
  const built = markdownToDeck(`---\n${front}\n---\n${body}`, options);
  return built.slides.map(s => ({ ...s, id: newSlideId(), objects: s.objects.map(o => ({ ...o, id: ids.take() })) }));
}

// ---------------------------------------------------------------
// Export
// ---------------------------------------------------------------
function tableToMarkdown(t: TableObject): string {
  const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const rows = t.rows.map(r => `| ${r.map(c => esc(c.text)).join(' | ')} |`);
  rows.splice(1, 0, `|${t.rows[0].map(() => '---').join('|')}|`);
  return rows.join('\n');
}

const isCodeBox = (o: SlideObject): boolean => o.type === 'text' && MONO.test(o.fontFamily) && !!o.backgroundColor && o.backgroundColor !== 'transparent';
const isFooterText = (o: SlideObject): o is TextObject => o.type === 'text' && o.y >= FOOTER_Y - 12 && o.fontSize <= 13 && o.h <= 40;
const isSideImage = (o: SlideObject): o is ImageObject => o.type === 'image' && o.y <= 1 && o.h >= SLIDE_H - 2 && Math.abs(o.w - SLIDE_W / 2) < 4 && (o.x <= 1 || Math.abs(o.x - SLIDE_W / 2) < 4);
const isColumnHeading = (o: SlideObject): o is TextObject => o.type === 'text' && !isCodeBox(o) && parseInt(o.fontWeight) >= 600 && o.fontSize >= 18 && o.fontSize < 30 && !htmlToPlain(o.text).includes('\n') && !/<li>/.test(o.text);

/** Group objects into side-by-side columns (by horizontal overlap) */
function columnsOf(objs: SlideObject[]): SlideObject[][] {
  const sorted = [...objs].sort((a, b) => a.x - b.x);
  const cols: { right: number; items: SlideObject[] }[] = [];
  for (const o of sorted) {
    const last = cols[cols.length - 1];
    if (last && o.x < last.right - 8) { last.items.push(o); last.right = Math.max(last.right, o.x + o.w); }
    else cols.push({ right: o.x + o.w, items: [o] });
  }
  return cols.map(c => c.items.sort((a, b) => a.y - b.y || a.x - b.x));
}

function objectToMarkdown(o: SlideObject, asHeading: boolean): string | null {
  if (isCodeBox(o)) return '```\n' + htmlToPlain((o as TextObject).text).replace(/ /g, ' ').replace(/\n+$/, '') + '\n```';
  if (o.type === 'text') {
    const md = htmlToMarkdown(o.text);
    return md ? (asHeading ? `### ${md}` : md) : '';
  }
  if (o.type === 'table') return tableToMarkdown(o);
  if (o.type === 'chart') {
    return ['```chart ' + o.chartType,
      ...(o.title ? [`title: ${o.title}`] : []),
      `categories: ${o.categories.join(', ')}`,
      ...o.series.map(s => `${s.name.replace(/:/g, ' ')}: ${s.values.join(', ')}`),
      ...(!o.showLegend ? ['legend: false'] : []),
      ...(o.showValues ? ['values: true'] : []),
      '```'].join('\n');
  }
  if (o.type === 'image') return `![image](${o.src})`;
  if (o.type === 'shape' && o.text) return o.text;
  return null;
}

/** Serialize a deck as Markdown (layout is re-derived on import; shapes and icons are not represented) */
export function deckToMarkdown(deck: Deck): string {
  const t = getTheme(deck.themeName);

  // Footer and slide numbers repeated on every slide after the first go back into the front matter
  const later = deck.slides.slice(1);
  const footers = later.map(s => s.objects.filter(isFooterText));
  const footerText = later.length && footers.every(f => f.length) ? htmlToPlain(footers[0].find(o => o.textAlign !== 'right')?.text ?? '') : '';
  const hasFooter = !!footerText && footers.every(f => f.some(o => htmlToPlain(o.text) === footerText));
  const paginate = later.length > 0 && footers.every((f, i) => f.some(o => htmlToPlain(o.text) === String(i + 2)));
  const strip = (s: Slide, i: number) => (i === 0 ? [...s.objects] : s.objects.filter(o => !(isFooterText(o) && ((hasFooter && htmlToPlain(o.text) === footerText) || (paginate && htmlToPlain(o.text) === String(i + 1))))));

  const presets = deck.slides.map(detectPreset);
  const animated = deck.slides.every(s => s.objects.length === 0 || s.objects.some(o => o.animation));
  const motion = animated && presets.every(p => p === presets[0]) && presets[0] !== 'none' ? presets[0] : '';
  const front = `---\ntitle: ${deck.title}\ntheme: ${deck.themeName}\n${motion ? `motion: ${motion}\n` : ''}${hasFooter ? `footer: ${footerText}\n` : ''}${paginate ? 'paginate: true\n' : ''}---\n\n`;

  const out: string[] = [];
  deck.slides.forEach((slide, si) => {
    const lines: string[] = [];
    const objs = strip(slide, si).sort((a, b) => a.y - b.y || a.x - b.x);
    const side = objs.find(isSideImage);
    const texts = objs.filter((o): o is TextObject => o.type === 'text' && !isCodeBox(o) && !!htmlToPlain(o.text).trim());
    const title = texts.find(o => isHeadingSize(o.fontSize, o.fontWeight));
    const isSection = slide.background === t.sectionBg && t.sectionBg !== t.bg;
    const others = objs.filter(o => o !== title && o !== side);
    const textOnly = others.every(o => o.type === 'text' && !isCodeBox(o));
    if (isSection) lines.push('<!-- layout: section -->');
    else if (title && title.fontSize >= 80 && textOnly && !BIG_NUMBER.test(htmlToPlain(title.text))) lines.push('<!-- layout: big-number -->');
    else if (si > 0 && title && textOnly && others.length === 1 && texts.length === 2 && !/<li>/.test((others[0] as TextObject).text) && title.fontSize < 80) lines.push('<!-- layout: title -->');
    if (!isSection && slide.background !== t.bg && !slide.backgroundImage) lines.push(`<!-- background: ${slide.background} -->`);
    if (slide.transition !== 'none' && !motion) lines.push(`<!-- transition: ${slide.transition} ${slide.transitionDuration} -->`);
    if (slide.backgroundImage && !slide.backgroundImage.startsWith('data:')) lines.push(`![bg](${slide.backgroundImage})`);
    if (side) lines.push(`![bg ${side.x <= 1 ? 'left' : 'right'}](${side.src})`);
    // Quote slides: the italic headline is the quote, any other text the attribution
    if (title && title.fontStyle === 'italic' && textOnly && others.length <= 1) {
      lines.push(`> ${htmlToMarkdown(title.text).replace(/\n+/g, ' ')}`);
      const by = others[0] ? htmlToMarkdown((others[0] as TextObject).text).replace(/^—\s*/, '') : '';
      if (by) lines.push(`# ${by}`);
      if (slide.notes.trim()) lines.push(`Note: ${slide.notes.trim()}`);
      out.push(lines.join('\n\n'));
      return;
    }
    if (title) lines.push(`# ${htmlToMarkdown(title.text).replace(/\n+/g, ' ').replace(/ \(continued\)$/, '')}`);

    let skipped = 0;
    const emit = (list: SlideObject[], target: string[], headings: boolean) => {
      for (const o of list) {
        const md = objectToMarkdown(o, headings && isColumnHeading(o));
        if (md === null) { skipped++; continue; }
        if (!md) continue;
        const single = o.type === 'text' && !md.includes('\n') && !/^\s*(-|\d+\.)\s/.test(md) && !md.startsWith('#');
        target.push(single && (si === 0 || isSection || lines.some(l => l.startsWith('<!-- layout'))) && title ? `## ${md}` : md);
      }
    };
    // Two or more columns of text side by side: write them as columns
    const cols = columnsOf(others);
    const textCols = cols.filter(c => c.some(o => o.type === 'text'));
    if (cols.length > 1 && textCols.length > 1) {
      const cards = cols.every(c => isColumnHeading(c[0]) && c[0].color.toLowerCase() === t.accent.toLowerCase() && c.every(o => o.type === 'text' && !isCodeBox(o)));
      const parts = cols.map(c => { const part: string[] = []; emit(c, part, true); return part.join('\n\n'); });
      lines.push(parts.join(cards ? '\n\n' : '\n\n|||\n\n'));
    } else {
      emit(others, lines, false);
    }
    if (skipped) lines.push(`<!-- ${skipped} shape${skipped !== 1 ? 's' : ''}/icon${skipped !== 1 ? 's' : ''} not represented in Markdown -->`);
    if (slide.notes.trim()) lines.push(`Note: ${slide.notes.trim()}`);
    out.push(lines.join('\n\n'));
  });
  return front + out.join('\n\n---\n\n') + '\n';
}
