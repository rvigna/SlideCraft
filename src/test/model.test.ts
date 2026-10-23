import { describe, expect, it } from 'vitest';
import { normalizeDeck } from '../model/factory';
import { htmlToParagraphs, paragraphsToHtml, sanitizeHtml } from '../model/richtext';
import { gradientStops, toHex6 } from '../model/color';

describe('normalizeDeck', () => {
  it('migrates SlideCraft 1.x decks (Font Awesome icons, duplicate ids)', () => {
    const deck = normalizeDeck({
      title: 'Old deck',
      slides: [{ background: '#fff', objects: [
        { id: 1, type: 'icon', iconClass: 'fa-solid fa-rocket', x: 1, y: 2, w: 3, h: 4 },
        { id: 1, type: 'text', text: 'Hi', fontWeight: 'bold' },
        { id: 2, type: 'bogus' },
      ] }],
    });
    const objs = deck.slides[0].objects;
    expect(objs).toHaveLength(2);
    expect(objs[0].type === 'icon' && objs[0].icon).toBe('Rocket');
    expect(objs[1].type === 'text' && objs[1].fontWeight).toBe('700');
    expect(new Set(objs.map(o => o.id)).size).toBe(2);
    expect(deck.nextObjectId).toBeGreaterThan(Math.max(...objs.map(o => o.id)));
  });

  it('creates a title slide for empty input', () => {
    expect(normalizeDeck({}).slides).toHaveLength(1);
  });
});

describe('rich text', () => {
  it('strips scripts and event handlers', () => {
    const out = sanitizeHtml('<b onclick="x()">bold</b><script>alert(1)</script><img src=x onerror=y>');
    expect(out).toBe('<b>bold</b>');
  });

  it('round-trips paragraphs, lists and styles', () => {
    const html = 'Intro <b>bold</b><ul><li>One</li><li><i>Two</i></li></ul>';
    const paras = htmlToParagraphs(html);
    expect(paras).toHaveLength(3);
    expect(paras[0].runs.map(r => r.text).join('')).toBe('Intro bold');
    expect(paras[0].runs[1].bold).toBe(true);
    expect(paras[1].bullet).toBe('bullet');
    expect(paras[2].runs[0].italic).toBe(true);
    expect(paragraphsToHtml(paras)).toBe(html);
  });
});

describe('colors', () => {
  it('converts CSS colors to PowerPoint hex', () => {
    expect(toHex6('#0f62fe')).toBe('0F62FE');
    expect(toHex6('#abc')).toBe('AABBCC');
    expect(toHex6('rgb(255, 0, 128)')).toBe('FF0080');
    expect(toHex6('linear-gradient(135deg, #667eea, #764ba2)')).toBe('667EEA');
  });

  it('parses gradient stops', () => {
    expect(gradientStops('linear-gradient(90deg, rgb(1, 2, 3) 0%, #fff 100%)')).toEqual([
      { color: 'rgb(1, 2, 3)', pos: 0 }, { color: '#fff', pos: 1 },
    ]);
  });
});
