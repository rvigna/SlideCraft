/* Tools the AI assistant can call. Each one edits the deck through the same store as the UI. */
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import * as ed from '../store/editor';
import type { Deck, Slide, SlideObject } from '../model/types';
import { THEMES, getTheme } from '../model/themes';
import { deckToMarkdown, markdownToDeck } from '../model/markdown';
import { htmlToPlain, sanitizeHtml, plainToHtml } from '../model/richtext';
import { lintDeck, fixIssue, RULES } from '../model/lint';
import { lintContext } from '../components/lintActions';
import { newSlideId } from '../model/factory';

/** Report of what the assistant changed, shown in the chat */
export type Activity = (summary: string) => void;

function objectLine(o: SlideObject): string {
  const box = `${Math.round(o.x)},${Math.round(o.y)} ${Math.round(o.w)}×${Math.round(o.h)}`;
  switch (o.type) {
    case 'text': return `#${o.id} text (${box}) ${Math.round(o.fontSize)}px${parseInt(o.fontWeight) >= 700 ? ' bold' : ''}: ${JSON.stringify(htmlToPlain(o.text).slice(0, 400))}`;
    case 'shape': return `#${o.id} ${o.shapeType} shape (${box}) fill ${o.backgroundColor}${o.text ? `: ${JSON.stringify(o.text)}` : ''}`;
    case 'image': return `#${o.id} image (${box})${o.src.startsWith('data:') ? ' [embedded]' : ` ${o.src.slice(0, 120)}`}`;
    case 'icon': return `#${o.id} icon ${o.icon} (${box})`;
    case 'table': return `#${o.id} table ${o.rows.length}×${o.colWidths.length} (${box}): ${JSON.stringify(o.rows.slice(0, 6).map(r => r.map(c => c.text)))}`;
    case 'chart': return `#${o.id} ${o.chartType} chart (${box}) "${o.title}" categories ${JSON.stringify(o.categories)} series ${JSON.stringify(o.series.map(s => ({ name: s.name, values: s.values })))}`;
  }
}

/** Compact, model-readable description of the deck */
export function describeDeck(deck: Deck, current: number): string {
  const lines = [`Title: ${deck.title}`, `Theme: ${deck.themeName}`, `Slides: ${deck.slides.length} (960×540 units). Current slide: ${current + 1}`];
  deck.slides.forEach((s, i) => {
    lines.push('', `Slide ${i + 1}${i === current ? ' (current)' : ''}${s.transition !== 'none' ? ` transition=${s.transition}` : ''}`);
    s.objects.forEach(o => lines.push(`  ${objectLine(o)}`));
    if (s.notes.trim()) lines.push(`  notes: ${JSON.stringify(s.notes.slice(0, 600))}`);
  });
  return lines.join('\n');
}

/** Build slides from Markdown in the deck's theme, with ids that can't collide with existing objects */
function slidesFromMarkdown(markdown: string, d: Deck, ids: { take(): number }): Slide[] {
  const body = markdown.replace(/^﻿?---\s*\n[\s\S]*?\n---\s*\n/, '');
  const built = markdownToDeck(`---\ntheme: ${d.themeName}\n---\n${body}`);
  return built.slides.map(s => ({ ...s, id: newSlideId(), objects: s.objects.map(o => ({ ...o, id: ids.take() })) }));
}

function slideIndex(i: unknown): number {
  const n = Number(i) - 1;
  const count = ed.useEditor.getState().deck.slides.length;
  if (!Number.isInteger(n) || n < 0 || n >= count) throw new Error(`There is no slide ${i}. The deck has ${count} slides (numbered from 1).`);
  return n;
}

const MARKDOWN_HELP = 'Slide Markdown: "# Title", "## Subtitle", paragraphs, "- bullets" (indent 2 spaces to nest), GFM tables, ```chart column|bar|line|area|pie|doughnut blocks (lines "title: …", "categories: A, B", "Series name: 1, 2"), "![alt](url)" images, "> quote", "<!-- layout: title|section|content|quote|big-number -->", "Note: speaker notes". Separate slides with a line containing only "---".';

export function buildTools(activity: Activity) {
  return [
    betaTool({
      name: 'get_deck',
      description: 'Read the whole deck: every slide with its objects (ids, positions, text, tables, chart data) and speaker notes. Call this before editing.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: () => describeDeck(ed.useEditor.getState().deck, ed.useEditor.getState().slideIndex),
    }),
    betaTool({
      name: 'get_slides_markdown',
      description: 'Get slides as editable Markdown (the same format replace_slide and add_slides accept). Omit "slides" for the whole deck.',
      inputSchema: { type: 'object', properties: { slides: { type: 'array', items: { type: 'integer' }, description: 'Slide numbers, starting at 1' } }, additionalProperties: false },
      run: ({ slides }) => {
        const deck = ed.useEditor.getState().deck;
        const pick = slides?.length ? slides.map(slideIndex) : deck.slides.map((_, i) => i);
        return pick.map(i => `<!-- slide ${i + 1} -->\n` + deckToMarkdown({ ...deck, slides: [deck.slides[i]] }).replace(/^---[\s\S]*?---\n\n/, '')).join('\n---\n\n');
      },
    }),
    betaTool({
      name: 'create_deck',
      description: `Replace the entire presentation with new slides written in Markdown. Use for "make me a deck about…". ${MARKDOWN_HELP}`,
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          theme: { type: 'string', enum: THEMES.map(t => t.name) },
          markdown: { type: 'string', description: 'All slides, separated by lines containing only ---' },
        },
        required: ['title', 'markdown'],
        additionalProperties: false,
      },
      eager_input_streaming: true,
      run: ({ title, theme, markdown }) => {
        if (typeof markdown !== 'string' || !markdown.trim()) throw new Error('markdown is required');
        const deck = markdownToDeck(`---\ntitle: ${title}\ntheme: ${getTheme(theme).name}\n---\n${markdown.replace(/^﻿?---\s*\n[\s\S]*?\n---\s*\n/, '')}`);
        ed.commit(d => {
          d.title = deck.title;
          d.themeName = deck.themeName;
          d.slides = deck.slides;
          d.nextObjectId = Math.max(d.nextObjectId, deck.nextObjectId);
        }, { slideIndex: 0 });
        ed.clearSelection();
        activity(`Created “${deck.title}” with ${deck.slides.length} slides`);
        return `Created ${deck.slides.length} slides.`;
      },
    }),
    betaTool({
      name: 'add_slides',
      description: `Insert new slides written in Markdown after slide "after" (0 = at the start; default: after the current slide). ${MARKDOWN_HELP}`,
      inputSchema: {
        type: 'object',
        properties: { markdown: { type: 'string' }, after: { type: 'integer', minimum: 0 } },
        required: ['markdown'],
        additionalProperties: false,
      },
      eager_input_streaming: true,
      run: ({ markdown, after }) => {
        if (typeof markdown !== 'string' || !markdown.trim()) throw new Error('markdown is required');
        const state = ed.useEditor.getState();
        const at = after == null ? state.slideIndex + 1 : Math.max(0, Math.min(state.deck.slides.length, Number(after)));
        let count = 0;
        ed.commit((d, ids) => {
          const slides = slidesFromMarkdown(markdown, d as Deck, ids);
          count = slides.length;
          d.slides.splice(at, 0, ...slides);
        }, { slideIndex: at });
        ed.clearSelection();
        activity(`Added ${count} slide${count !== 1 ? 's' : ''}`);
        return `Inserted ${count} slide(s) as slide ${at + 1}${count > 1 ? `–${at + count}` : ''}.`;
      },
    }),
    betaTool({
      name: 'replace_slide',
      description: `Rewrite one slide from Markdown (re-lays it out). Speaker notes are kept unless the Markdown includes a "Note:" line. ${MARKDOWN_HELP}`,
      inputSchema: {
        type: 'object',
        properties: { slide: { type: 'integer', description: 'Slide number, starting at 1' }, markdown: { type: 'string' } },
        required: ['slide', 'markdown'],
        additionalProperties: false,
      },
      eager_input_streaming: true,
      run: ({ slide, markdown }) => {
        const i = slideIndex(slide);
        if (typeof markdown !== 'string' || !markdown.trim()) throw new Error('markdown is required');
        ed.commit((d, ids) => {
          const [next] = slidesFromMarkdown(markdown.split(/\n\s*---\s*\n/)[0], d as Deck, ids);
          const old = d.slides[i];
          d.slides[i] = { ...next, id: old.id, notes: next.notes || old.notes, transition: old.transition, transitionDuration: old.transitionDuration };
        }, { slideIndex: i });
        ed.clearSelection();
        activity(`Rewrote slide ${i + 1}`);
        return `Slide ${i + 1} replaced.`;
      },
    }),
    betaTool({
      name: 'update_object',
      description: 'Change properties of one object by id: text (plain text, or HTML with <b> <i> <ul><li>), x, y, w, h, fontSize, color, backgroundColor, fontWeight, textAlign, rows (tables: array of rows of cell strings), categories/series (charts: series = [{name, values}]), title (charts).',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'integer' }, changes: { type: 'object', additionalProperties: true } },
        required: ['id', 'changes'],
        additionalProperties: false,
      },
      run: ({ id, changes }) => {
        const deck = ed.useEditor.getState().deck;
        const si = deck.slides.findIndex(s => s.objects.some(o => o.id === id));
        if (si < 0) throw new Error(`No object #${id}. Call get_deck to see object ids.`);
        const patch = { ...(changes as Record<string, unknown>) };
        delete patch.id; delete patch.type;
        ed.commit(d => {
          const o = d.slides[si].objects.find(x => x.id === id)!;
          if (typeof patch.text === 'string' && o.type === 'text') {
            patch.text = /<[a-z][\s\S]*>/i.test(patch.text) ? sanitizeHtml(patch.text) : plainToHtml(patch.text);
          }
          if (o.type === 'table' && Array.isArray(patch.rows)) {
            const rows = (patch.rows as unknown[][]).map(r => r.map(c => ({ text: String((c as { text?: string })?.text ?? c ?? '') })));
            const cols = Math.max(...rows.map(r => r.length));
            o.rows = rows.map(r => Array.from({ length: cols }, (_, c) => r[c] ?? { text: '' }));
            if (o.colWidths.length !== cols) o.colWidths = Array(cols).fill(1 / cols);
            delete patch.rows;
          }
          if (o.type === 'chart' && Array.isArray(patch.series)) {
            o.series = (patch.series as { name: string; values: number[]; color?: string }[]).map((s, k) => ({
              name: String(s.name), values: (s.values ?? []).map(Number), color: s.color ?? o.series[k]?.color ?? o.series[0]?.color ?? '#0f62fe',
            }));
            delete patch.series;
          }
          Object.assign(o, patch);
        }, { slideIndex: si });
        activity(`Edited ${deck.slides[si].objects.find(o => o.id === id)!.type} on slide ${si + 1}`);
        return 'Updated.';
      },
    }),
    betaTool({
      name: 'delete',
      description: 'Delete objects by id and/or whole slides by number.',
      inputSchema: {
        type: 'object',
        properties: { objects: { type: 'array', items: { type: 'integer' } }, slides: { type: 'array', items: { type: 'integer' } } },
        additionalProperties: false,
      },
      run: ({ objects, slides }) => {
        const drop = new Set((slides ?? []).map(slideIndex));
        const ids = new Set(objects ?? []);
        const total = ed.useEditor.getState().deck.slides.length;
        if (drop.size >= total) throw new Error('Cannot delete every slide; use create_deck to start over.');
        ed.commit(d => {
          d.slides.forEach(s => { s.objects = s.objects.filter(o => !ids.has(o.id)); });
          d.slides = d.slides.filter((_, i) => !drop.has(i));
        }, { slideIndex: 0 });
        ed.clearSelection();
        activity(`Deleted ${ids.size ? `${ids.size} object${ids.size !== 1 ? 's' : ''}` : ''}${ids.size && drop.size ? ' and ' : ''}${drop.size ? `${drop.size} slide${drop.size !== 1 ? 's' : ''}` : ''}`);
        return 'Deleted.';
      },
    }),
    betaTool({
      name: 'move_slide',
      description: 'Move a slide to a new position (both numbered from 1).',
      inputSchema: { type: 'object', properties: { from: { type: 'integer' }, to: { type: 'integer' } }, required: ['from', 'to'], additionalProperties: false },
      run: ({ from, to }) => {
        const f = slideIndex(from), t = slideIndex(to);
        ed.moveSlide(f, t > f ? t + 1 : t);
        activity(`Moved slide ${f + 1} to ${t + 1}`);
        return 'Moved.';
      },
    }),
    betaTool({
      name: 'set_notes',
      description: 'Set the speaker notes of a slide (replaces existing notes).',
      inputSchema: { type: 'object', properties: { slide: { type: 'integer' }, notes: { type: 'string' } }, required: ['slide', 'notes'], additionalProperties: false },
      run: ({ slide, notes }) => {
        const i = slideIndex(slide);
        ed.commit(d => { d.slides[i].notes = String(notes); });
        activity(`Wrote notes for slide ${i + 1}`);
        return 'Notes saved.';
      },
    }),
    betaTool({
      name: 'set_theme',
      description: `Restyle the whole deck with a theme: ${THEMES.map(t => t.name).join(', ')}.`,
      inputSchema: { type: 'object', properties: { name: { type: 'string', enum: THEMES.map(t => t.name) } }, required: ['name'], additionalProperties: false },
      run: ({ name }) => {
        ed.applyTheme(String(name));
        activity(`Applied the ${name} theme`);
        return `Theme set to ${name}.`;
      },
    }),
    betaTool({
      name: 'check_design',
      description: 'Run the design checker (overflowing text, contrast, off-slide objects, tiny text, too many fonts, misalignment, crowding, overlaps, missing titles). Returns issues with keys.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: () => {
        const issues = lintDeck(ed.useEditor.getState().deck, lintContext());
        if (!issues.length) return 'No design issues.';
        return issues.map(i => `${i.key} | ${i.severity} | ${i.slide >= 0 ? `slide ${i.slide + 1}` : 'deck'} | ${RULES[i.rule].title}: ${i.message}${i.fix ? ` | auto-fix: ${i.fix}` : ''}`).join('\n');
      },
    }),
    betaTool({
      name: 'fix_design_issues',
      description: 'Apply the automatic fix for design issues by key (from check_design). Omit keys to fix everything fixable.',
      inputSchema: { type: 'object', properties: { keys: { type: 'array', items: { type: 'string' } } }, additionalProperties: false },
      run: ({ keys }) => {
        const ctx = lintContext();
        const issues = lintDeck(ed.useEditor.getState().deck, ctx).filter(i => i.fix && (!keys?.length || keys.includes(i.key)));
        ed.commit(d => issues.forEach(i => fixIssue(d as Deck, i, ctx)));
        activity(`Fixed ${issues.length} design issue${issues.length !== 1 ? 's' : ''}`);
        return `Fixed ${issues.length} issue(s).`;
      },
    }),
    betaTool({
      name: 'go_to_slide',
      description: 'Show a slide in the editor so the user can see it.',
      inputSchema: { type: 'object', properties: { slide: { type: 'integer' } }, required: ['slide'], additionalProperties: false },
      run: ({ slide }) => { ed.goToSlide(slideIndex(slide)); return 'Showing it.'; },
    }),
  ];
}
