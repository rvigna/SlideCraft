import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { deckToPptxArrayBuffer } from '../io/pptxExport';
import { pptxToDeck } from '../io/pptxImport';
import { iconSvg } from '../io/iconRaster';
import { createChartObject, createDeck, createIconObject, createShapeObject, createTableObject, createTextObject, IdSource, normalizeDeck } from '../model/factory';
import type { ChartObject, Deck, TableObject, TextObject } from '../model/types';

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

  it('round-trips tables with header and banded styling', async () => {
    const src = sampleDeck();
    const ids = new IdSource(src.nextObjectId);
    const table = createTableObject(ids, 4, 3, { headerFill: '#0f62fe', headerColor: '#ffffff', bandFill: '#e5f0ff', backgroundColor: '#ffffff' });
    table.rows[1][0].text = 'Revenue';
    table.rows[1][1].text = '12%';
    src.slides[0].objects.push(table);
    src.nextObjectId = ids.next;
    const deck = normalizeDeck((await pptxToDeck(await deckToPptxArrayBuffer(src))).deck);
    const back = deck.slides[0].objects.find((o): o is TableObject => o.type === 'table')!;
    expect(back.rows).toHaveLength(4);
    expect(back.colWidths).toHaveLength(3);
    expect(back.rows[0][0].text).toBe('Header 1');
    expect(back.rows[1].map(c => c.text)).toEqual(['Revenue', '12%', '']);
    expect(back.headerRow).toBe(true);
    expect(back.headerFill.toLowerCase()).toBe('#0f62fe');
    expect(back.bandedRows).toBe(true);
    expect(back.bandFill.toLowerCase()).toBe('#e5f0ff');
    expect(back.rows.flat().every(c => c.fill === undefined)).toBe(true);
  });

  it('round-trips charts as native PowerPoint charts', async () => {
    const src = sampleDeck();
    const ids = new IdSource(src.nextObjectId);
    src.slides[0].objects.push(createChartObject(ids, 'bar', { title: 'Sales' }), createChartObject(ids, 'doughnut', { title: '' }));
    src.nextObjectId = ids.next;
    const buf = await deckToPptxArrayBuffer(src);
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files).some(f => /ppt\/charts\/chart\d+\.xml$/.test(f))).toBe(true);
    const deck = normalizeDeck((await pptxToDeck(buf)).deck);
    const charts = deck.slides[0].objects.filter((o): o is ChartObject => o.type === 'chart');
    expect(charts.map(c => c.chartType)).toEqual(['bar', 'doughnut']);
    expect(charts[0].title).toBe('Sales');
    expect(charts[0].categories).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(charts[0].series.map(s => s.name)).toEqual(['2025', '2026']);
    expect(charts[0].series[1].values).toEqual([16, 23, 20, 28]);
    expect(charts[0].series[0].color.toLowerCase()).toBe('#0f62fe');
  });

  it('imports SmartArt from its cached drawing, positioned inside the frame', async () => {
    const deck = createDeck();
    deck.slides[0].objects = [];
    const zip = await JSZip.loadAsync(await deckToPptxArrayBuffer(deck));
    const slidePath = 'ppt/slides/slide1.xml';
    const frame = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="99" name="Diagram"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>' +
      '<p:xfrm><a:off x="914400" y="914400"/><a:ext cx="4572000" cy="2286000"/></p:xfrm><a:graphic>' +
      '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">' +
      '<dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" r:dm="rIdDm" r:lo="rIdDm" r:qs="rIdDm" r:cs="rIdDm"/>' +
      '</a:graphicData></a:graphic></p:graphicFrame>';
    const slideXml = (await zip.file(slidePath)!.async('string')).replace('</p:spTree>', frame + '</p:spTree>');
    zip.file(slidePath, slideXml);
    const relsPath = 'ppt/slides/_rels/slide1.xml.rels';
    zip.file(relsPath, (await zip.file(relsPath)!.async('string')).replace('</Relationships>',
      '<Relationship Id="rIdDm" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData" Target="../diagrams/data1.xml"/>' +
      '<Relationship Id="rIdDraw" Type="http://schemas.microsoft.com/office/2007/relationships/diagramDrawing" Target="../diagrams/drawing1.xml"/></Relationships>'));
    zip.file('ppt/diagrams/data1.xml', '<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
      '<dgm:extLst><a:ext uri="x"><dsp:dataModelExt xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" relId="rIdDraw"/></a:ext></dgm:extLst></dgm:dataModel>');
    zip.file('ppt/diagrams/drawing1.xml', '<dsp:drawing xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
      '<dsp:spTree><dsp:nvGrpSpPr/><dsp:grpSpPr/><dsp:sp><dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr>' +
      '<dsp:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1828800" cy="914400"/></a:xfrm><a:prstGeom prst="chevron"><a:avLst/></a:prstGeom>' +
      '<a:solidFill><a:srgbClr val="0F62FE"/></a:solidFill></dsp:spPr><dsp:txBody><a:bodyPr/><a:p><a:r><a:t>Plan</a:t></a:r></a:p></dsp:txBody></dsp:sp></dsp:spTree></dsp:drawing>');
    const { deck: raw, warnings } = await pptxToDeck(await zip.generateAsync({ type: 'arraybuffer' }));
    const objs = normalizeDeck(raw).slides[0].objects;
    const plan = objs.find(o => o.type === 'text' && o.text.includes('Plan'))!;
    expect(warnings).toEqual([]);
    expect([plan.x, plan.y, plan.w, plan.h]).toEqual([96, 96, 192, 96]); // 1in offset, 2in × 1in at 96px/in
    expect(plan.backgroundColor.toLowerCase()).toBe('#0f62fe');
  });

  it('rejects files that are not presentations', async () => {
    await expect(pptxToDeck(new Uint8Array([1, 2, 3]))).rejects.toThrow(/not a valid PowerPoint/);
  });
});
