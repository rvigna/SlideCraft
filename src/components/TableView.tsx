import { useEffect, useRef, type CSSProperties } from 'react';
import type { TableObject } from '../model/types';
import { cellStyle } from '../model/table';
import { fontStack } from '../model/fonts';
import { plainToHtml } from '../model/richtext';
import { commitSlide, setEditing, useEditor } from '../store/editor';

function gridBorder(obj: TableObject): string {
  return obj.borderStyle !== 'none' && obj.borderWidth > 0 ? `${obj.borderWidth}px ${obj.borderStyle} ${obj.borderColor}` : 'none';
}

/** Which cell a double-click landed on, so editing starts there */
let pendingFocus: { r: number; c: number } | null = null;
export const focusCellOnEdit = (r: number, c: number) => { pendingFocus = { r, c }; };

export function TableView({ obj, editing = false }: { obj: TableObject; editing?: boolean }) {
  const tableRef = useRef<HTMLTableElement>(null);
  // Text captured when editing starts so React never rewrites cells being typed in
  const initial = useRef(obj.rows.map(row => row.map(c => c.text)));
  if (!editing) initial.current = obj.rows.map(row => row.map(c => c.text));

  useEffect(() => {
    if (!editing) return;
    const target = pendingFocus ?? { r: 0, c: 0 };
    pendingFocus = null;
    const el = tableRef.current?.querySelector<HTMLElement>(`[data-r="${target.r}"][data-c="${target.c}"]`);
    el?.focus();
    if (el) window.getSelection()?.selectAllChildren(el);
  }, [editing]);

  const finish = () => {
    const cells = tableRef.current?.querySelectorAll<HTMLElement>('[data-r]');
    if (!cells) return;
    const texts = obj.rows.map(row => row.map(c => c.text));
    cells.forEach(el => { texts[Number(el.dataset.r)][Number(el.dataset.c)] = el.innerText.replace(/\n$/, ''); });
    const changed = texts.some((row, r) => row.some((t, c) => t !== obj.rows[r][c].text));
    const id = obj.id;
    if (changed) {
      commitSlide(slide => {
        const t = slide.objects.find(o => o.id === id);
        if (t?.type === 'table') texts.forEach((row, r) => row.forEach((text, c) => { if (t.rows[r]?.[c]) t.rows[r][c].text = text; }));
      });
    }
    if (useEditor.getState().editingId === id) setEditing(null);
  };

  const border = gridBorder(obj);
  const base: CSSProperties = {
    fontFamily: fontStack(obj.fontFamily), fontSize: obj.fontSize, lineHeight: obj.lineHeight || 1.3,
    fontStyle: obj.fontStyle, textDecoration: obj.textDecoration,
  };

  return (
    <table
      ref={tableRef}
      style={{ ...base, width: '100%', height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}
      onBlur={editing ? e => { if (!tableRef.current?.contains(e.relatedTarget as Node)) finish(); } : undefined}
      onKeyDown={editing ? e => { if (e.key === 'Escape') { e.preventDefault(); (document.activeElement as HTMLElement)?.blur(); } e.stopPropagation(); } : undefined}
      onMouseDown={editing ? e => e.stopPropagation() : undefined}
    >
      <colgroup>{obj.colWidths.map((cw, i) => <col key={i} style={{ width: `${cw * 100}%` }} />)}</colgroup>
      <tbody>
        {obj.rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => {
              const st = cellStyle(obj, r, cell);
              return (
                <td
                  key={c}
                  data-cell={`${r},${c}`}
                  style={{
                    border, background: st.fill, color: st.color, fontWeight: st.bold ? 700 : (obj.fontWeight as CSSProperties['fontWeight']),
                    textAlign: st.align, padding: '4px 10px', verticalAlign: 'middle', overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
                  }}
                >
                  {editing ? (
                    <div
                      className="editing-surface"
                      data-r={r}
                      data-c={c}
                      contentEditable
                      suppressContentEditableWarning
                      style={{ outline: 'none', minHeight: '1.2em' }}
                      onPaste={e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }}
                      dangerouslySetInnerHTML={{ __html: plainToHtml(initial.current[r]?.[c] ?? cell.text) }}
                    />
                  ) : cell.text}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
