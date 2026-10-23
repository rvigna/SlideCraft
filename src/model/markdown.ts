/* ========================================================
   Decks as code: Markdown ⇄ slides.

   ---                      front matter: title, theme
   title: Q3 Review
   theme: Carbon Dark
   ---
   # Slide title            one "# " heading per slide
   ## Subtitle              subtitle on title/section slides, sub-heading elsewhere
   Text, **bold**, *italic*, ~~strike~~, `code`
   - bullets
     - nested bullets (2-space indent)
   1. numbered
   | tables | in | GFM |
   ```chart column          charts: column, bar, line, area, pie, doughnut
   title: Revenue
   categories: Q1, Q2, Q3
   EMEA: 90, 104, 118
   ```
   ![alt](image-url)
   > A quote               a slide with only a quote uses the Quote layout
   <!-- layout: section -->   directives: layout, background, transition
   Note: speaker notes…     everything after "Note:" (or <!-- notes: … -->)
   ---                      a line with only --- starts a new slide
   ======================================================== */
import type { ChartType, Deck, Slide, SlideObject, TableObject, TextObject, Transition } from './types';
import { SLIDE_H, SLIDE_W } from './types';
import {
  createBlankSlide, createChartObject, createImageObject, createTableObject, createTextObject, IdSource,
} from './factory';
import { getTheme, isHeadingSize, THEMES, type DeckTheme } from './themes';
import { htmlToParagraphs, htmlToPlain, paragraphsToHtml, type Paragraph, type TextRun } from './richtext';
import { seriesColor, tableColors } from './palette';
import { estimateTextHeight } from './lint';
import { LAYOUTS } from './layouts';
import { applyMotionToSlide, MOTION_PRESETS } from './motion';

// ---------------------------------------------------------------
// Inline formatting
// ---------------------------------------------------------------
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\[[^\]]+\]\([^)]+\))/;

export function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  for (const part of text.split(INLINE)) {
    if (!part) continue;
    if (/^(\*\*|__)/.test(part) && part.length > 4) runs.push({ text: part.slice(2, -2), bold: true });
    else if (part.startsWith('~~')) runs.push({ text: part.slice(2, -2), strike: true });
    else if (part.startsWith('`')) runs.push({ text: part.slice(1, -1), fontFamily: 'IBM Plex Mono' });
    else if (/^[*_]/.test(part) && part.length > 2 && /[*_]$/.test(part)) runs.push({ text: part.slice(1, -1), italic: true });
    else if (part.startsWith('[')) runs.push({ text: part.slice(1, part.indexOf('](')) });
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
type Block =
  | { kind: 'h1' | 'h2'; text: string }
  | { kind: 'text'; paragraphs: Paragraph[] }
  | { kind: 'table'; rows: string[][] }
  | { kind: 'chart'; chartType: ChartType; title: string; categories: string[]; series: { name: string; values: number[] }[]; showLegend: boolean; showValues: boolean }
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'quote'; text: string };

interface ParsedSlide { blocks: Block[]; notes: string; directives: Record<string, string> }

const CHART_TYPES: ChartType[] = ['column', 'bar', 'line', 'area', 'pie', 'doughnut'];

function splitSlides(body: string): string[] {
  const slides: string[] = [];
  let current: string[] = [];
  let fence = false;
  for (const line of body.split('\n')) {
    if (/^\s*```/.test(line)) fence = !fence;
    if (!fence && /^\s*---\s*$/.test(line)) { slides.push(current.join('\n')); current = []; continue; }
    current.push(line);
  }
  slides.push(current.join('\n'));
  return slides.filter(s => s.trim());
}

function parseChart(info: string, lines: string[]): Block {
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
  return { kind: 'chart', chartType, title, categories, series, showLegend, showValues };
}

function parseSlide(src: string): ParsedSlide {
  const directives: Record<string, string> = {};
  let notes = '';
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
  const flushText = () => { if (para.length) blocks.push({ kind: 'text', paragraphs: para }); para = []; };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flushText();
      const info = line.replace(/^\s*```/, '').trim();
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
      if (/^chart\b/i.test(info)) blocks.push(parseChart(info, body));
      else para.push(...body.map(b => ({ runs: [{ text: b, fontFamily: 'IBM Plex Mono' }] })));
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#\s+(.*)$/))) { flushText(); blocks.push({ kind: 'h1', text: m[1].trim() }); continue; }
    if ((m = line.match(/^#{2,6}\s+(.*)$/))) { flushText(); blocks.push({ kind: 'h2', text: m[1].trim() }); continue; }
    if ((m = line.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)[^)]*\)\s*$/))) { flushText(); blocks.push({ kind: 'image', alt: m[1], src: m[2] }); continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushText();
      const rows: string[][] = [];
      for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) continue; // separator row
        rows.push(lines[i].trim().slice(1, -1).split('|').map(c => c.trim()));
      }
      i--;
      blocks.push({ kind: 'table', rows });
      continue;
    }
    if ((m = line.match(/^\s*>\s?(.*)$/))) {
      flushText();
      const quote = [m[1]];
      for (i++; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s*>\s?/, ''));
      i--;
      blocks.push({ kind: 'quote', text: quote.join(' ').trim() });
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
    // Plain text: join soft-wrapped lines into one paragraph
    const last = para[para.length - 1];
    if (last && !last.bullet && i > 0 && lines[i - 1].trim() && !/^(\s*)([-*+]|\d+[.)])\s/.test(lines[i - 1])) last.runs.push({ text: ' ' }, ...inlineRuns(line.trim()));
    else para.push({ runs: inlineRuns(line.trim()) });
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
const LAYOUT_ALIASES: Record<string, string> = {
  title: 'Title Slide', section: 'Section Header', content: 'Title + Content', 'two-column': 'Two Columns',
  blank: 'Blank', quote: 'Quote', 'big-number': 'Big Number', image: 'Image + Text', 'three-points': 'Three Points',
};

function fitFontSize(paragraphs: Paragraph[], w: number, h: number, t: DeckTheme, sizes = [24, 22, 20, 18, 16, 14]): number {
  const html = paragraphsToHtml(paragraphs);
  for (const fontSize of sizes) {
    const probe = createTextObject(new IdSource(0), { w, h, fontSize, text: html, fontFamily: t.bodyFont });
    if (estimateTextHeight(probe) <= h) return fontSize;
  }
  return sizes[sizes.length - 1];
}

function visualObject(block: Block, ids: IdSource, t: DeckTheme, box: { x: number; y: number; w: number; h: number }): SlideObject | null {
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
  return null;
}

function buildSlide(parsed: ParsedSlide, index: number, ids: IdSource, t: DeckTheme): Slide {
  const slide = createBlankSlide(t);
  slide.notes = parsed.notes;
  const { blocks, directives } = parsed;
  const h1 = blocks.find(b => b.kind === 'h1') as { text: string } | undefined;
  const rest = blocks.filter(b => b !== h1);
  const visuals = rest.filter(b => b.kind === 'table' || b.kind === 'chart' || b.kind === 'image');
  const textBlocks = rest.filter(b => b.kind === 'text' || b.kind === 'h2');
  const quote = rest.find(b => b.kind === 'quote') as { text: string } | undefined;

  const heading = (text: string, o: Partial<TextObject>) => createTextObject(ids, { fontFamily: t.headingFont, color: t.heading, fontWeight: '700', text: paragraphsToHtml([{ runs: inlineRuns(text) }]), ...o });
  const body = (paragraphs: Paragraph[], o: Partial<TextObject>) => createTextObject(ids, { fontFamily: t.bodyFont, color: t.body, text: paragraphsToHtml(paragraphs), ...o });

  let layout = LAYOUT_ALIASES[directives.layout?.toLowerCase() ?? ''] ?? directives.layout;
  if (!layout) {
    const onlyHeadings = rest.every(b => b.kind === 'h2' || (b.kind === 'text' && b.paragraphs.length <= 2 && !b.paragraphs.some(p => p.bullet)));
    if (h1 && !visuals.length && !quote && onlyHeadings) {
      // First slide: title slide. Later: a lone heading is a section break, heading + "## subtitle" a title slide
      if (index === 0) layout = 'Title Slide';
      else if (!rest.length) layout = 'Section Header';
      else if (rest.every(b => b.kind === 'h2')) layout = 'Title Slide';
    }
    else if (quote && !visuals.length && !textBlocks.length) layout = 'Quote';
  }

  if (layout && LAYOUTS.some(l => l.name === layout) && ['Title Slide', 'Section Header', 'Quote', 'Big Number', 'Blank'].includes(layout)) {
    const sub = rest.map(b => (b.kind === 'h2' ? b.text : b.kind === 'text' ? b.paragraphs.map(p => p.runs.map(r => r.text).join('')).join(' ') : '')).filter(Boolean).join(' ');
    if (layout === 'Section Header') {
      slide.background = t.sectionBg;
      slide.objects.push(heading(h1?.text ?? sub, { x: 80, y: 180, w: 800, h: 80, fontSize: 48, textAlign: 'center', color: t.sectionText }));
      if (h1 && sub) slide.objects.push(body([{ runs: inlineRuns(sub) }], { x: 180, y: 280, w: 600, h: 50, fontSize: 22, textAlign: 'center', color: t.sectionText }));
    } else if (layout === 'Quote') {
      const q = quote?.text ?? sub;
      slide.objects.push(heading(q, { x: 120, y: 150, w: 720, h: 180, fontSize: q.length > 120 ? 26 : 32, fontStyle: 'italic', fontWeight: '600', textAlign: 'center', verticalAlign: 'middle' }));
      const by = (h1?.text ?? (quote ? sub : '')).trim();
      if (by) slide.objects.push(body([{ runs: inlineRuns(by.startsWith('—') ? by : `— ${by}`) }], { x: 240, y: 350, w: 480, h: 40, fontSize: 18, textAlign: 'center' }));
    } else if (layout === 'Big Number') {
      slide.objects.push(heading(h1?.text ?? '', { x: 80, y: 100, w: 800, h: 150, fontSize: 96, textAlign: 'center', color: t.accent }));
      if (sub) slide.objects.push(body([{ runs: inlineRuns(sub) }], { x: 180, y: 300, w: 600, h: 60, fontSize: 22, textAlign: 'center' }));
    } else if (layout === 'Title Slide') {
      slide.objects.push(heading(h1?.text ?? '', { x: 80, y: 170, w: 800, h: 90, fontSize: 48, textAlign: 'center', verticalAlign: 'bottom' }));
      if (sub) slide.objects.push(body([{ runs: inlineRuns(sub) }], { x: 140, y: 275, w: 680, h: 60, fontSize: 22, textAlign: 'center' }));
    }
  } else {
    // Content slide: title on top, text and visuals below
    const top = h1 ? 116 : 40;
    if (h1) slide.objects.push(heading(h1.text, { x: MARGIN, y: 36, w: SLIDE_W - MARGIN * 2, h: 64, fontSize: 36 }));
    const paragraphs: Paragraph[] = [];
    textBlocks.forEach(b => {
      if (b.kind === 'h2') paragraphs.push({ runs: [{ text: b.text, bold: true }] });
      else if (b.kind === 'text') paragraphs.push(...b.paragraphs);
    });
    if (quote) paragraphs.push({ runs: [{ text: `“${quote.text}”`, italic: true }] });
    const areaH = SLIDE_H - 30 - top;
    const fullW = SLIDE_W - MARGIN * 2;
    const twoCol = paragraphs.length > 0 && visuals.length > 0;
    const textW = twoCol ? 400 : fullW;
    if (paragraphs.length) {
      const fontSize = fitFontSize(paragraphs, textW, areaH, t);
      slide.objects.push(body(paragraphs, { x: MARGIN, y: top, w: textW, h: areaH, fontSize }));
    }
    if (visuals.length) {
      const x0 = twoCol ? MARGIN + textW + 40 : MARGIN;
      const w = twoCol ? SLIDE_W - MARGIN - x0 : fullW;
      // Side by side when there's room, stacked otherwise
      const sideBySide = !twoCol && visuals.length > 1;
      const gap = 24;
      visuals.forEach((v, i) => {
        const box = sideBySide
          ? { x: x0 + i * ((w + gap) / visuals.length), y: top, w: (w + gap) / visuals.length - gap, h: areaH }
          : { x: x0, y: top + i * (areaH / visuals.length), w, h: areaH / visuals.length - (visuals.length > 1 ? gap / 2 : 0) };
        const obj = visualObject(v, ids, t, { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) });
        if (obj) slide.objects.push(obj);
      });
    }
  }

  if (directives.background) {
    if (/^(url\()?https?:|^data:/.test(directives.background)) slide.backgroundImage = directives.background.replace(/^url\(|\)$/g, '');
    else slide.background = directives.background;
  }
  if (directives.transition) {
    const [kind, dur] = directives.transition.split(/\s+/);
    slide.transition = kind as Transition;
    if (dur) slide.transitionDuration = parseFloat(dur) || 0.5;
  }
  return slide;
}

/** Build a deck from Markdown */
export function markdownToDeck(md: string): Deck {
  const { meta, body } = parseFrontMatter(md.replace(/\r\n/g, '\n'));
  const theme = getTheme(THEMES.find(t => t.name.toLowerCase() === (meta.theme ?? '').toLowerCase())?.name);
  const ids = new IdSource(1);
  const parsed = splitSlides(body).map(parseSlide);
  const slides = parsed.map((p, i) => buildSlide(p, i, ids, theme));
  // "motion: subtle" (or smooth, focus, lively) in the front matter animates the whole deck
  const motion = MOTION_PRESETS.find(m => m.id === (meta.motion ?? '').toLowerCase());
  if (motion) slides.forEach(s => applyMotionToSlide(s, { preset: motion.id, scope: 'all', slideIndex: 0, animateContent: true, revealOnClick: /click/i.test(meta.motion ?? '') || meta.reveal === 'click', speed: 'normal' }));
  const firstH1 = parsed[0]?.blocks.find(b => b.kind === 'h1') as { text: string } | undefined;
  return {
    title: meta.title || (firstH1 ? firstH1.text.replace(/[*_`~]/g, '') : 'Untitled Presentation'),
    themeName: theme.name,
    slides: slides.length ? slides : [createBlankSlide(theme)],
    nextObjectId: ids.next,
  };
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

/** Serialize a deck as Markdown (layout is re-derived on import; shapes and icons are not represented) */
export function deckToMarkdown(deck: Deck): string {
  const t = getTheme(deck.themeName);
  const front = `---\ntitle: ${deck.title}\ntheme: ${deck.themeName}\n---\n\n`;
  const out: string[] = [];
  deck.slides.forEach((slide, si) => {
    const lines: string[] = [];
    const objs = [...slide.objects].sort((a, b) => a.y - b.y || a.x - b.x);
    const texts = objs.filter((o): o is TextObject => o.type === 'text' && !!htmlToPlain(o.text).trim());
    const title = texts.find(o => isHeadingSize(o.fontSize, o.fontWeight));
    const isSection = slide.background === t.sectionBg && t.sectionBg !== t.bg;
    const others = objs.filter(o => o !== title);
    const textOnly = others.every(o => o.type === 'text');
    if (isSection) lines.push('<!-- layout: section -->');
    else if (si > 0 && title && textOnly && others.length === 1 && texts.length === 2 && !/<li>/.test((others[0] as TextObject).text)) lines.push('<!-- layout: title -->');
    if (!isSection && slide.background !== t.bg && !slide.backgroundImage) lines.push(`<!-- background: ${slide.background} -->`);
    if (slide.backgroundImage && !slide.backgroundImage.startsWith('data:')) lines.push(`<!-- background: ${slide.backgroundImage} -->`);
    if (slide.transition !== 'none') lines.push(`<!-- transition: ${slide.transition} ${slide.transitionDuration} -->`);
    // Quote slides: the italic headline is the quote, any other text the attribution
    if (title && title.fontStyle === 'italic' && textOnly && others.length <= 1) {
      lines.push(`> ${htmlToMarkdown(title.text).replace(/\n+/g, ' ')}`);
      const by = others[0] ? htmlToMarkdown((others[0] as TextObject).text).replace(/^—\s*/, '') : '';
      if (by) lines.push(`# ${by}`);
      if (slide.notes.trim()) lines.push(`Note: ${slide.notes.trim()}`);
      out.push(lines.join('\n\n'));
      return;
    }
    if (title) lines.push(`# ${htmlToMarkdown(title.text).replace(/\n+/g, ' ')}`);

    let skipped = 0;
    for (const o of others) {
      if (o.type === 'text') {
        const md = htmlToMarkdown(o.text);
        if (!md) continue;
        const single = !md.includes('\n') && !/^\s*(-|\d+\.)\s/.test(md);
        lines.push(single && (si === 0 || isSection || lines.some(l => l.startsWith('<!-- layout'))) && title ? `## ${md}` : md);
      } else if (o.type === 'table') {
        lines.push(tableToMarkdown(o));
      } else if (o.type === 'chart') {
        lines.push(['```chart ' + o.chartType,
          ...(o.title ? [`title: ${o.title}`] : []),
          `categories: ${o.categories.join(', ')}`,
          ...o.series.map(s => `${s.name.replace(/:/g, ' ')}: ${s.values.join(', ')}`),
          ...(!o.showLegend ? ['legend: false'] : []),
          ...(o.showValues ? ['values: true'] : []),
          '```'].join('\n'));
      } else if (o.type === 'image') {
        lines.push(`![image](${o.src})`);
      } else if (o.type === 'shape' && o.text) {
        lines.push(o.text);
      } else {
        skipped++;
      }
    }
    if (skipped) lines.push(`<!-- ${skipped} shape${skipped !== 1 ? 's' : ''}/icon${skipped !== 1 ? 's' : ''} not represented in Markdown -->`);
    if (slide.notes.trim()) lines.push(`Note: ${slide.notes.trim()}`);
    out.push(lines.join('\n\n'));
  });
  return front + out.join('\n\n---\n\n') + '\n';
}
