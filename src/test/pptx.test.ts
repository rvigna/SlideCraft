import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { deckToPptxArrayBuffer } from '../io/pptxExport';
import { pptxToDeck } from '../io/pptxImport';
import { iconSvg } from '../io/raster';
import { createDeck, createIconObject, createShapeObject, createTextObject, IdSource, normalizeDeck } from '../model/factory';
import type { Deck, TextObject } from '../model/types';

function sampleDeck(): Deck {
  const deck = createDeck('Carbon');
  const ids = new IdSource(deck.nextObjectId);
  deck.title = 'Round trip';
  deck.slides[0].notes = 'Say hello';
  deck.slides.push({
    ...deck.slides[0],
    id: 'two',
    background: '#161616',
    notes: '',
    objects: [
      createTextObject(ids, { x: 60, y: 40, w: 840, h: 64, text: 'Agenda', fontSize: 36, fontWeight: '700', color: '#ffffff' }),
      createTextObject(ids, { x: 60, y: 120, w: 840, h: 300, text: '<ul><li>First <b>bold</b></li><li>Second</li></ul>', fontSize: 24, color: '#c6c6c6' }),
      createShapeObject(ids, 'ellipse', { x: 700, y: 380, w: 120, h: 120, backgroundColor: '#0f62fe', text: 'Go' }),
      createShapeObject(ids, 'star', { x: 100, y: 400, w: 80, h: 80, backgroundColor: '#f1c21b' }),
      createIconObject(ids, 'Rocket', { x: 850, y: 20, w: 60, h: 60 }),
    ],
  });
  deck.nextObjectId = ids.next;
  return deck;
}

describe('PPTX export → import round trip', () => {
  it('writes a valid package with every slide and notes', async () => {
    const buf = await deckToPptxArrayBuffer(sampleDeck());
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file('ppt/slides/slide1.xml')).toBeTruthy();
    expect(zip.file('ppt/slides/slide2.xml')).toBeTruthy();
    const slide2 = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(slide2).toContain('Agenda');
    expect(slide2).toContain('prst="ellipse"');
    expect(slide2).toContain('prst="star5"');
  });

  it('reads back text, formatting, shapes, backgrounds and notes', async () => {
    const buf = await deckToPptxArrayBuffer(sampleDeck());
    const { deck: raw } = await pptxToDeck(buf, 'Round trip.pptx');
    const deck = normalizeDeck(raw);
    expect(deck.title).toBe('Round trip');
    expect(deck.slides).toHaveLength(2);
    expect(deck.slides[0].notes).toBe('Say hello');

    const [title, subtitle] = deck.slides[0].objects as TextObject[];
    expect(title.text).toContain('Presentation Title');
    expect(title.fontSize).toBeCloseTo(48, 0);
    expect(title.fontWeight).toBe('700');
    expect(title.textAlign).toBe('center');
    expect(title.x).toBeCloseTo(80, -1);
    expect(subtitle.color.toLowerCase()).toBe('#525252');

    const s2 = deck.slides[1];
    expect(s2.background.toLowerCase()).toBe('#161616');
    const texts = s2.objects.filter((o): o is TextObject => o.type === 'text');
    const list = texts.find(t => t.text.includes('First'))!;
    expect(list.text).toContain('<ul>');
    expect(list.text).toContain('<b>bold</b>');
    const ellipse = s2.objects.find(o => o.type === 'shape' && (o.shapeType === 'circle' || o.shapeType === 'ellipse'));
    expect(ellipse && ellipse.type === 'shape' && ellipse.text).toBe('Go');
    expect(ellipse?.backgroundColor.toLowerCase()).toBe('#0f62fe');
    expect(s2.objects.some(o => o.type === 'shape' && o.shapeType === 'star')).toBe(true);
  });

  it('renders icons as well-formed SVG for rasterizing', () => {
    const svg = iconSvg('Rocket', '#0f62fe');
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(svg).not.toContain('currentColor');
  });

  it('round-trips the deck theme and slide transitions', async () => {
    const src = sampleDeck();
    src.themeName = 'Midnight';
    src.slides[0].transition = 'fade';
    src.slides[0].transitionDuration = 0.5;
    src.slides[1].transition = 'slide-up';
    src.slides[1].transitionDuration = 1;
    const buf = await deckToPptxArrayBuffer(src);
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file('ppt/slides/slide2.xml')!.async('string');
    expect(xml).toMatch(/<p:transition spd="slow"><p:push dir="u"\/><\/p:transition>/);
    // Transition must precede p:timing / extLst per the schema
    expect(xml.indexOf('<p:transition')).toBeGreaterThan(xml.indexOf('</p:clrMapOvr>'));
    const deck = normalizeDeck((await pptxToDeck(buf)).deck);
    expect(deck.themeName).toBe('Midnight');
    expect(deck.slides.map(s => [s.transition, s.transitionDuration])).toEqual([['fade', 0.5], ['slide-up', 1]]);
  });

  it('keeps nested bullet levels', async () => {
    const src = sampleDeck();
    const list = src.slides[1].objects[1] as TextObject;
    list.text = '<ul><li>Top<ul><li>Nested</li></ul></li></ul>';
    const deck = normalizeDeck((await pptxToDeck(await deckToPptxArrayBuffer(src))).deck);
    const back = deck.slides[1].objects.find((o): o is TextObject => o.type === 'text' && o.text.includes('Nested'))!;
    expect(back.text).toBe('<ul><li>Top<ul><li>Nested</li></ul></li></ul>');
  });

  it('rejects files that are not presentations', async () => {
    await expect(pptxToDeck(new Uint8Array([1, 2, 3]))).rejects.toThrow(/not a valid PowerPoint/);
  });
});
