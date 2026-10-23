/* Rich text helpers: text objects store a small, sanitized subset of HTML. */
import { fontStack } from './fonts';

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SPAN', 'BR', 'DIV', 'P', 'UL', 'OL', 'LI', 'SUB', 'SUP']);
const ALLOWED_STYLES = ['color', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-decoration', 'background-color'];

/** Strip anything that is not simple formatting (scripts, handlers, links, images…) */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;
  const clean = (node: Element) => {
    [...node.children].forEach(child => {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(child.tagName)) {
          child.remove();
          return;
        }
        // Unwrap unknown elements, keeping their text
        clean(child);
        child.replaceWith(...child.childNodes);
        return;
      }
      const style = (child as HTMLElement).style;
      const kept = ALLOWED_STYLES
        .map(p => [p, style.getPropertyValue(p)] as const)
        .filter(([, v]) => v && !/url\(|expression/i.test(v));
      [...child.attributes].forEach(a => child.removeAttribute(a.name));
      if (kept.length) child.setAttribute('style', kept.map(([p, v]) => `${p}: ${v}`).join('; '));
      clean(child);
    });
  };
  clean(root);
  return root.innerHTML;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function plainToHtml(text: string): string {
  return text.split(/\r?\n/).map(escapeHtml).join('<br>');
}

export function htmlToPlain(html: string): string {
  const doc = new DOMParser().parseFromString(
    `<div>${html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li)>/gi, '\n')}</div>`, 'text/html');
  return (doc.body.textContent ?? '').replace(/\n+$/, '');
}

// ---------------------------------------------------------------
// Paragraph model (used by PPTX import/export)
// ---------------------------------------------------------------
export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  fontSize?: number; // px, slide units
  fontFamily?: string;
}

export interface Paragraph {
  runs: TextRun[];
  bullet?: 'bullet' | 'number';
  /** Nesting depth for list items, 0 = top level */
  level?: number;
}

interface ListCtx { type: 'bullet' | 'number'; depth: number }

/** Flatten rich-text HTML into paragraphs of styled runs */
export function htmlToParagraphs(html: string): Paragraph[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const paragraphs: Paragraph[] = [];
  let current: Paragraph = { runs: [] };
  let list: ListCtx | null = null;

  const startParagraph = () => {
    current = { runs: [] };
    if (list) { current.bullet = list.type; current.level = list.depth; }
  };
  const flush = (force = false) => {
    if (force || current.runs.length) paragraphs.push(current);
    startParagraph();
  };

  const walk = (node: Node, style: Omit<TextRun, 'text'>) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text) current.runs.push({ text, ...style });
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName;
    if (tag === 'BR') { flush(true); return; }

    const next = { ...style };
    if (tag === 'B' || tag === 'STRONG') next.bold = true;
    if (tag === 'I' || tag === 'EM') next.italic = true;
    if (tag === 'U') next.underline = true;
    if (tag === 'S' || tag === 'STRIKE') next.strike = true;
    const css = (node as HTMLElement).style;
    if (css) {
      if (css.color) next.color = css.color;
      if (css.fontSize && css.fontSize.endsWith('px')) next.fontSize = parseFloat(css.fontSize);
      if (css.fontFamily) next.fontFamily = css.fontFamily.replace(/["']/g, '').split(',')[0].trim();
      if (css.fontWeight) next.bold = css.fontWeight === 'bold' || parseInt(css.fontWeight) >= 600;
      if (css.fontStyle === 'italic') next.italic = true;
      if (css.textDecoration.includes('underline')) next.underline = true;
      if (css.textDecoration.includes('line-through')) next.strike = true;
    }

    if (tag === 'UL' || tag === 'OL') {
      flush();
      const outer = list;
      list = { type: tag === 'UL' ? 'bullet' : 'number', depth: outer ? outer.depth + 1 : 0 };
      startParagraph();
      node.childNodes.forEach(child => walk(child, next));
      flush();
      list = outer;
      startParagraph();
      return;
    }
    if (tag === 'LI') {
      flush();
      const before = paragraphs.length;
      node.childNodes.forEach(child => walk(child, next));
      // An empty item still counts as a (blank) bullet
      if (current.runs.length || paragraphs.length === before) flush(true); else startParagraph();
      return;
    }
    const block = tag === 'DIV' || tag === 'P';
    if (block) flush();
    node.childNodes.forEach(child => walk(child, next));
    if (block) flush(tag === 'P');
  };

  doc.body.firstChild?.childNodes.forEach(n => walk(n, {}));
  flush();
  return paragraphs.length ? paragraphs : [{ runs: [] }];
}

/** Inverse of htmlToParagraphs; runs matching the object defaults get no inline style */
export function paragraphsToHtml(paragraphs: Paragraph[], defaults: { color?: string; fontSize?: number; fontFamily?: string } = {}): string {
  const runHtml = (r: TextRun) => {
    let html = escapeHtml(r.text);
    const styles: string[] = [];
    if (r.color && r.color.toLowerCase() !== defaults.color?.toLowerCase()) styles.push(`color: ${r.color}`);
    if (r.fontSize && Math.abs(r.fontSize - (defaults.fontSize ?? 0)) > 0.5) styles.push(`font-size: ${Math.round(r.fontSize)}px`);
    if (r.fontFamily && r.fontFamily !== defaults.fontFamily) styles.push(`font-family: ${fontStack(r.fontFamily)}`);
    if (styles.length) html = `<span style="${styles.join('; ')}">${html}</span>`;
    if (r.bold) html = `<b>${html}</b>`;
    if (r.italic) html = `<i>${html}</i>`;
    if (r.underline) html = `<u>${html}</u>`;
    if (r.strike) html = `<s>${html}</s>`;
    return html;
  };

  let out = '';
  // Open lists, innermost last; nested lists live inside their parent <li>
  const stack: { type: 'bullet' | 'number'; liOpen: boolean }[] = [];
  const tagOf = (t: 'bullet' | 'number') => (t === 'bullet' ? 'ul' : 'ol');
  const closeTop = () => {
    const top = stack.pop()!;
    if (top.liOpen) out += '</li>';
    out += `</${tagOf(top.type)}>`;
  };
  paragraphs.forEach((p, i) => {
    const content = p.runs.map(runHtml).join('');
    if (p.bullet) {
      const depth = Math.max(0, p.level ?? 0);
      while (stack.length > depth + 1) closeTop();
      if (stack.length === depth + 1 && stack[depth].type !== p.bullet) closeTop();
      if (stack.length === depth + 1 && stack[depth].liOpen) { out += '</li>'; stack[depth].liOpen = false; }
      while (stack.length < depth + 1) { out += `<${tagOf(p.bullet)}>`; stack.push({ type: p.bullet, liOpen: false }); }
      out += `<li>${content}`;
      stack[depth].liOpen = true;
    } else {
      const afterList = stack.length > 0;
      while (stack.length) closeTop();
      out += (i > 0 && !afterList ? '<br>' : '') + content;
    }
  });
  while (stack.length) closeTop();
  return out;
}
