import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '../api';
import * as ed from '../store/editor';
import { createDeck } from '../model/factory';
import type { ChartObject, TableObject, TextObject } from '../model/types';

beforeEach(() => ed.loadDeck(createDeck(), { resetHistory: true }));

describe('window.slidecraft API', () => {
  it('builds slides with text, bullets, tables and charts', () => {
    const s = api.addSlide({ layout: 'Blank', notes: 'Speak slowly' });
    expect(s).toBe(1);
    const title = api.addText('Results <2026>', { slide: s, fontSize: 40 });
    const bullets = api.addBullets(['Growth', ['EMEA', 'APAC'], 'Retention'], { slide: s });
    const table = api.addTable([['Region', 'Q1'], ['EMEA', 12]], { slide: s });
    const chart = api.addChart('line', { slide: s, categories: ['Q1', 'Q2'], series: [{ name: 'Sales', values: [3, 5] }] });

    const slide = api.getSlide(s);
    expect(slide.notes).toBe('Speak slowly');
    expect((api.getObject(title) as TextObject).text).toBe('Results &lt;2026&gt;');
    expect((api.getObject(bullets) as TextObject).text).toBe('<ul><li>Growth<ul><li>EMEA</li><li>APAC</li></ul></li><li>Retention</li></ul>');
    expect((api.getObject(table) as TableObject).rows[1].map(c => c.text)).toEqual(['EMEA', '12']);
    expect((api.getObject(chart) as ChartObject).series[0].values).toEqual([3, 5]);
    expect(api.find({ type: 'table' })).toHaveLength(1);
    expect(api.find({ text: 'Results' })).toHaveLength(1);
  });

  it('makes a batch a single undo step', () => {
    const depth = ed.useEditor.getState().past.length;
    api.batch(() => {
      api.addSlide();
      api.addText('One');
      api.addText('Two');
    });
    expect(ed.useEditor.getState().past.length).toBe(depth + 1);
    expect(api.slideCount).toBe(2);
    api.undo();
    expect(api.slideCount).toBe(1);
  });

  it('updates and removes objects anywhere in the deck', () => {
    const id = api.addText('Hello');
    api.goToSlide(api.addSlide());
    api.update(id, { x: 10, color: '#da1e28', text: 'Bye' });
    const o = api.getObject(id) as TextObject;
    expect([o.x, o.color, o.text]).toEqual([10, '#da1e28', 'Bye']);
    api.remove(id);
    expect(() => api.getObject(id)).toThrow(/no object/);
  });

  it('validates names', () => {
    expect(() => api.setTheme('Nope')).toThrow(/unknown theme/);
    expect(() => api.addIcon('Nope')).toThrow(/unknown icon/);
    expect(() => api.getSlide(9)).toThrow(RangeError);
  });

  it('notifies listeners on change', () => {
    let calls = 0;
    const off = api.onChange(() => { calls++; });
    api.addText('x');
    off();
    api.addText('y');
    expect(calls).toBe(1);
  });
});
