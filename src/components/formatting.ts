import { isTextual, type SlideObject, type TextStyle } from '../model/types';
import { commitSelection, primaryObject, useEditor } from '../store/editor';

/** Apply text style props to every selected text box / shape */
export function formatSelection(patch: Partial<TextStyle>, coalesce?: string) {
  commitSelection(o => { Object.assign(o, patch); }, isTextual, coalesce ? { coalesce } : undefined);
}

/** Apply box props (fill, border, opacity…) to every selected object */
export function styleSelection(patch: Partial<SlideObject>, coalesce?: string, filter?: (o: SlideObject) => boolean) {
  commitSelection(o => { Object.assign(o, patch); }, filter, coalesce ? { coalesce } : undefined);
}

/** True while the user has a text range selected inside the box being edited */
function hasInlineSelection(): boolean {
  if (useEditor.getState().editingId == null) return false;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
  return !!(sel.anchorNode && (sel.anchorNode.parentElement?.closest('.editing-surface')));
}

const isBold = (w: string) => w === 'bold' || parseInt(w) >= 600;

export type FormatToggle = 'bold' | 'italic' | 'underline' | 'strikethrough';

/**
 * Toolbar B/I/U/S: formats the highlighted words while editing text,
 * otherwise the whole of every selected object.
 */
export function toggleFormat(kind: FormatToggle) {
  if (hasInlineSelection()) {
    document.execCommand(kind === 'strikethrough' ? 'strikeThrough' : kind);
    return;
  }
  const primary = primaryObject();
  if (!primary || !isTextual(primary)) return;
  switch (kind) {
    case 'bold': formatSelection({ fontWeight: isBold(primary.fontWeight) ? '400' : '700' }); break;
    case 'italic': formatSelection({ fontStyle: primary.fontStyle === 'italic' ? 'normal' : 'italic' }); break;
    case 'underline': formatSelection({ textDecoration: primary.textDecoration === 'underline' ? 'none' : 'underline' }); break;
    case 'strikethrough': formatSelection({ textDecoration: primary.textDecoration === 'line-through' ? 'none' : 'line-through' }); break;
  }
}

export function isFormatActive(obj: SlideObject | null, kind: FormatToggle): boolean {
  if (!obj || !isTextual(obj)) return false;
  if (kind === 'bold') return isBold(obj.fontWeight);
  if (kind === 'italic') return obj.fontStyle === 'italic';
  if (kind === 'underline') return obj.textDecoration === 'underline';
  return obj.textDecoration === 'line-through';
}

/** Toggle a bullet or numbered list on the selected text boxes */
export function toggleList(tag: 'ul' | 'ol') {
  commitSelection(o => {
    if (o.type !== 'text') return;
    if (o.text.includes(`<${tag}>`)) {
      o.text = o.text.replace(/<\/?[uo]l>/g, '').replace(/<li>/g, '').replace(/<\/li>/g, '<br>').replace(/(<br>)+$/, '');
    } else {
      const lines = (o.text || 'Item 1')
        .replace(/<\/?[uo]l>/g, '')
        .replace(/<br\s*\/?>|<\/li>|<\/div>|<\/p>/g, '\n')
        .replace(/<(?!\/?(b|i|u|s|span|strong|em)\b)[^>]+>/g, '')
        .split('\n').filter(l => l.trim());
      o.text = `<${tag}>${lines.map(l => `<li>${l}</li>`).join('')}</${tag}>`;
    }
  }, o => o.type === 'text');
}
