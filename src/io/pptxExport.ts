/* Export a deck to PowerPoint (.pptx) with PptxGenJS. */
import PptxGenJS from 'pptxgenjs';
import type { Deck, ShapeObject, Slide, SlideObject, TextObject } from '../model/types';
import { SLIDE_W } from '../model/types';
import { alphaOf, toHex6 } from '../model/color';
import { htmlToParagraphs } from '../model/richtext';
import { fitImage, iconPng, rasterizeGradient } from './raster';

// 960 px ⇄ 10 in, so 1 px = 1/96 in = 0.75 pt
const IN = (px: number) => +(px / 96).toFixed(4);
const PT = (px: number) => +(px * 0.75).toFixed(2);

type PptxShapeName = PptxGenJS.ShapeType;

const SHAPE_MAP: Record<ShapeObject['shapeType'], string> = {
  rect: 'rect',
  'rounded-rect': 'roundRect',
  circle: 'ellipse',
  ellipse: 'ellipse',
  triangle: 'triangle',
  diamond: 'diamond',
  star: 'star5',
  hexagon: 'hexagon',
  'arrow-right': 'rightArrow',
  'arrow-left': 'leftArrow',
  line: 'line',
};

const DASH: Record<string, 'solid' | 'dash' | 'sysDot'> = { solid: 'solid', dashed: 'dash', dotted: 'sysDot' };

const SHADOWS: Record<string, PptxGenJS.ShadowProps> = {
  sm: { type: 'outer', blur: 2, offset: 1, angle: 90, color: '000000', opacity: 0.15 },
  md: { type: 'outer', blur: 9, offset: 3, angle: 90, color: '000000', opacity: 0.2 },
  lg: { type: 'outer', blur: 22, offset: 6, angle: 90, color: '000000', opacity: 0.25 },
};

/** PptxGenJS wants "image/png;base64,…" without the "data:" prefix */
const pptxData = (dataUrl: string) => dataUrl.replace(/^data:/, '');

function box(o: SlideObject) {
  return { x: IN(o.x), y: IN(o.y), w: IN(o.w), h: IN(o.h), rotate: o.rotation || undefined };
}

function fillOf(o: SlideObject): PptxGenJS.ShapeFillProps | undefined {
  if (!o.backgroundColor || o.backgroundColor === 'transparent' || alphaOf(o.backgroundColor) === 0) return undefined;
  const alpha = alphaOf(o.backgroundColor) * (o.opacity / 100);
  return { color: toHex6(o.backgroundColor), transparency: Math.round((1 - alpha) * 100) || undefined };
}

function lineOf(o: SlideObject): PptxGenJS.ShapeLineProps | undefined {
  if (o.borderStyle === 'none' || !o.borderWidth) return undefined;
  return { color: toHex6(o.borderColor), width: PT(o.borderWidth), dashType: DASH[o.borderStyle] };
}

function textRuns(o: TextObject): PptxGenJS.TextProps[] {
  const paragraphs = htmlToParagraphs(o.text);
  const runs: PptxGenJS.TextProps[] = [];
  paragraphs.forEach((p, pi) => {
    const pieces = p.runs.length ? p.runs : [{ text: '' }];
    pieces.forEach((r, ri) => {
      const last = ri === pieces.length - 1 && pi < paragraphs.length - 1;
      runs.push({
        text: r.text,
        options: {
          bold: r.bold || undefined,
          italic: r.italic || undefined,
          underline: r.underline ? { style: 'sng' } : undefined,
          strike: r.strike ? 'sngStrike' : undefined,
          color: r.color ? toHex6(r.color) : undefined,
          fontSize: r.fontSize ? PT(r.fontSize) : undefined,
          fontFace: r.fontFamily,
          bullet: p.bullet === 'bullet' ? true : p.bullet === 'number' ? { type: 'number' } : undefined,
          indentLevel: p.bullet && p.level ? p.level : undefined,
          breakLine: last || undefined,
        },
      });
    });
  });
  return runs;
}

function textOptions(o: TextObject | ShapeObject): PptxGenJS.TextPropsOptions {
  const bold = o.fontWeight === 'bold' || parseInt(o.fontWeight) >= 600;
  return {
    fontFace: o.fontFamily,
    fontSize: PT(o.fontSize),
    color: toHex6(o.color),
    bold: bold || undefined,
    italic: o.fontStyle === 'italic' || undefined,
    underline: o.textDecoration === 'underline' ? { style: 'sng' } : undefined,
    strike: o.textDecoration === 'line-through' ? 'sngStrike' : undefined,
    align: o.textAlign,
    lineSpacingMultiple: o.lineHeight ? +(o.lineHeight / 1.2).toFixed(2) : undefined,
    paraSpaceAfter: 0,
    paraSpaceBefore: 0,
  };
}

async function addBackground(ps: PptxGenJS.Slide, slide: Slide) {
  if (slide.backgroundImage) {
    const fitted = await fitImage(slide.backgroundImage, SLIDE_W, 540, 'cover');
    if (fitted) { ps.background = { data: pptxData(fitted) }; return; }
  }
  if (/gradient/i.test(slide.background)) {
    const png = rasterizeGradient(slide.background);
    if (png) { ps.background = { data: pptxData(png) }; return; }
  }
  ps.background = { color: toHex6(slide.background, 'FFFFFF') };
}

async function addObject(pptx: PptxGenJS, ps: PptxGenJS.Slide, o: SlideObject, warnings: string[]) {
  const shadow = o.shadow !== 'none' ? SHADOWS[o.shadow] : undefined;
  switch (o.type) {
    case 'text': {
      ps.addText(textRuns(o), {
        ...box(o),
        ...textOptions(o),
        valign: o.verticalAlign ?? 'top',
        margin: [6, 9, 6, 9],
        fill: fillOf(o),
        line: lineOf(o),
        shadow,
        rectRadius: o.borderRadius ? Math.min(1, o.borderRadius / Math.min(o.w, o.h)) : undefined,
        shape: o.borderRadius ? (pptx.ShapeType.roundRect as PptxShapeName) : undefined,
        transparency: o.opacity < 100 ? 100 - o.opacity : undefined,
        fit: 'none',
        isTextBox: true,
      });
      break;
    }
    case 'shape': {
      const shapeName = SHAPE_MAP[o.shapeType] as PptxShapeName;
      if (o.shapeType === 'line') {
        ps.addShape(shapeName, {
          x: IN(o.x), y: IN(o.y + o.h / 2), w: IN(o.w), h: 0, rotate: o.rotation || undefined,
          line: { color: toHex6(o.backgroundColor), width: PT(Math.max(2, o.h / 2)), transparency: o.opacity < 100 ? 100 - o.opacity : undefined },
        });
        break;
      }
      const opts = {
        ...box(o),
        fill: fillOf(o),
        line: lineOf(o),
        shadow,
        rectRadius: o.shapeType === 'rounded-rect' ? Math.min(0.5, Math.max(o.borderRadius, 12) / Math.min(o.w, o.h)) : undefined,
      };
      if (o.text) {
        ps.addText(o.text, { ...opts, ...textOptions(o), shape: shapeName, valign: 'middle', margin: 6 });
      } else {
        ps.addShape(shapeName, opts);
      }
      break;
    }
    case 'image': {
      const data = await fitImage(o.src, o.w, o.h, o.objectFit);
      if (!data) { warnings.push('An image could not be embedded (it may block cross-origin access).'); break; }
      ps.addImage({ ...box(o), data: pptxData(data), transparency: o.opacity < 100 ? 100 - o.opacity : undefined, shadow });
      break;
    }
    case 'icon': {
      const data = await iconPng(o.icon, o.color, Math.min(o.w, o.h));
      if (!data) { warnings.push('Some icons could not be converted and were skipped.'); break; }
      // Icons render at 80% of their box, centered
      const s = Math.min(o.w, o.h) * 0.8;
      ps.addImage({
        x: IN(o.x + (o.w - s) / 2), y: IN(o.y + (o.h - s) / 2), w: IN(s), h: IN(s),
        rotate: o.rotation || undefined, data: pptxData(data),
        transparency: o.opacity < 100 ? 100 - o.opacity : undefined,
      });
      break;
    }
  }
}

export interface PptxExportResult { blob: Blob; warnings: string[] }

async function buildPptx(deck: Deck) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = deck.title;
  pptx.company = 'SlideCraft';
  pptx.author = 'SlideCraft';
  const warnings: string[] = [];

  for (const slide of deck.slides) {
    const ps = pptx.addSlide();
    await addBackground(ps, slide);
    for (const o of slide.objects) {
      try {
        await addObject(pptx, ps, o, warnings);
      } catch (err) {
        warnings.push(`Skipped a ${o.type}: ${(err as Error).message}`);
      }
    }
    if (slide.notes.trim()) ps.addNotes(slide.notes);
  }
  return { pptx, warnings: [...new Set(warnings)] };
}

export async function deckToPptx(deck: Deck): Promise<PptxExportResult> {
  const { pptx, warnings } = await buildPptx(deck);
  return { blob: (await pptx.write({ outputType: 'blob' })) as Blob, warnings };
}

/** Node-friendly variant (used by the round-trip tests) */
export async function deckToPptxArrayBuffer(deck: Deck): Promise<ArrayBuffer> {
  const { pptx } = await buildPptx(deck);
  return (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
}
