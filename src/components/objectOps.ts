/* Insert and restructure tables and charts. */
import type { ChartType, TableObject } from '../model/types';
import { createChartObject, createTableObject } from '../model/factory';
import { seriesColor, tableColors } from '../model/palette';
import { addObjects, commitSlide, primaryObject } from '../store/editor';

export function insertTable(rows = 4, cols = 3) {
  return addObjects((ids, t) => [createTableObject(ids, rows, cols, {
    x: 120, y: 140, w: 720, h: 44 * rows,
    fontFamily: t.bodyFont, color: t.body, ...tableColors(t.accent, t.bg),
  })]);
}

export function insertChart(chartType: ChartType = 'column') {
  return addObjects((ids, t) => {
    const chart = createChartObject(ids, chartType, { fontFamily: t.bodyFont, color: t.body });
    chart.series.forEach((s, i) => { s.color = seriesColor(i, t.accent); });
    return [chart];
  });
}

/** Change the structure of the primary table */
function editTable(fn: (t: TableObject) => void) {
  const p = primaryObject();
  if (p?.type !== 'table') return;
  const id = p.id;
  commitSlide(slide => {
    const t = slide.objects.find(o => o.id === id);
    if (t?.type === 'table') fn(t as TableObject);
  });
}

export const addTableRow = () => editTable(t => {
  t.rows.push(t.rows[0].map(() => ({ text: '' })));
  t.h += Math.round(t.h / (t.rows.length - 1));
});

export const removeTableRow = () => editTable(t => {
  if (t.rows.length <= 1) return;
  t.rows.pop();
  t.h = Math.max(24, Math.round(t.h * t.rows.length / (t.rows.length + 1)));
});

export const addTableColumn = () => editTable(t => {
  const n = t.colWidths.length + 1;
  t.rows.forEach((row, r) => row.push({ text: r === 0 && t.headerRow ? `Header ${n}` : '' }));
  t.colWidths = Array(n).fill(1 / n);
});

export const removeTableColumn = () => editTable(t => {
  if (t.colWidths.length <= 1) return;
  t.rows.forEach(row => row.pop());
  const n = t.colWidths.length - 1;
  t.colWidths = Array(n).fill(1 / n);
});
