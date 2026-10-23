import type { Slide, TextObject } from './types';
import type { DeckTheme } from './themes';
import { createIconObject, createShapeObject, createTextObject, type IdSource } from './factory';

export interface Layout {
  name: string;
  apply: (slide: Slide, ids: IdSource, t: DeckTheme) => void;
}

const heading = (ids: IdSource, t: DeckTheme, o: Partial<TextObject>) =>
  createTextObject(ids, { fontFamily: t.headingFont, color: t.heading, fontWeight: '700', ...o });
const body = (ids: IdSource, t: DeckTheme, o: Partial<TextObject>) =>
  createTextObject(ids, { fontFamily: t.bodyFont, color: t.body, ...o });

export const LAYOUTS: Layout[] = [
  { name: 'Blank', apply: (s) => { s.objects = []; } },
  {
    name: 'Title Slide',
    apply: (s, ids, t) => {
      s.objects = [
        heading(ids, t, { x: 80, y: 170, w: 800, h: 90, text: 'Title', fontSize: 48, textAlign: 'center' }),
        body(ids, t, { x: 180, y: 275, w: 600, h: 50, text: 'Subtitle', fontSize: 22, textAlign: 'center' }),
      ];
    },
  },
  {
    name: 'Title + Content',
    apply: (s, ids, t) => {
      s.objects = [
        heading(ids, t, { x: 60, y: 36, w: 840, h: 64, text: 'Slide Title', fontSize: 36 }),
        body(ids, t, { x: 60, y: 116, w: 840, h: 380, text: '<ul><li>First point</li><li>Second point</li><li>Third point</li></ul>', fontSize: 22 }),
      ];
    },
  },
  {
    name: 'Two Columns',
    apply: (s, ids, t) => {
      s.objects = [
        heading(ids, t, { x: 60, y: 36, w: 840, h: 64, text: 'Slide Title', fontSize: 36 }),
        body(ids, t, { x: 60, y: 116, w: 400, h: 380, text: 'Left column', fontSize: 18 }),
        body(ids, t, { x: 500, y: 116, w: 400, h: 380, text: 'Right column', fontSize: 18 }),
      ];
    },
  },
  {
    name: 'Image + Text',
    apply: (s, ids, t) => {
      s.objects = [
        createShapeObject(ids, 'rect', { x: 0, y: 0, w: 480, h: 540, backgroundColor: t.accent, borderColor: t.accent, opacity: 25 }),
        heading(ids, t, { x: 510, y: 100, w: 420, h: 60, text: 'Title Here', fontSize: 32 }),
        body(ids, t, { x: 510, y: 180, w: 420, h: 280, text: 'Description text goes here. Drop an image onto the tinted area.', fontSize: 18 }),
      ];
    },
  },
  {
    name: 'Section Header',
    apply: (s, ids, t) => {
      s.background = t.sectionBg;
      s.backgroundImage = '';
      s.objects = [
        heading(ids, t, { x: 80, y: 180, w: 800, h: 80, text: 'Section Title', fontSize: 48, fontWeight: '700', textAlign: 'center', color: t.sectionText }),
        createShapeObject(ids, 'line', { x: 360, y: 280, w: 240, h: 4, backgroundColor: t.sectionText, borderColor: t.sectionText }),
      ];
    },
  },
  {
    name: 'Big Number',
    apply: (s, ids, t) => {
      s.objects = [
        heading(ids, t, { x: 80, y: 100, w: 800, h: 150, text: '100%', fontSize: 96, textAlign: 'center', color: t.accent }),
        body(ids, t, { x: 180, y: 300, w: 600, h: 60, text: 'Description of this statistic', fontSize: 22, textAlign: 'center' }),
      ];
    },
  },
  {
    name: 'Three Points',
    apply: (s, ids, t) => {
      s.objects = [heading(ids, t, { x: 60, y: 40, w: 840, h: 64, text: 'Three Key Ideas', fontSize: 36, textAlign: 'center' })];
      ['Idea', 'Rocket', 'Growth'].forEach((icon, i) => {
        const x = 60 + i * 290;
        s.objects.push(
          createIconObject(ids, icon, { x: x + 95, y: 150, w: 72, h: 72, color: t.accent }),
          heading(ids, t, { x, y: 250, w: 260, h: 50, text: `Point ${i + 1}`, fontSize: 24, textAlign: 'center' }),
          body(ids, t, { x, y: 305, w: 260, h: 120, text: 'A short sentence that explains this idea.', fontSize: 16, textAlign: 'center' }),
        );
      });
    },
  },
  {
    name: 'Quote',
    apply: (s, ids, t) => {
      s.objects = [
        createIconObject(ids, 'Quotes', { x: 120, y: 90, w: 64, h: 64, color: t.accent }),
        heading(ids, t, { x: 120, y: 170, w: 720, h: 160, text: 'A memorable quote that captures the essence of your message.', fontSize: 32, fontStyle: 'italic', fontWeight: '600', textAlign: 'center' }),
        body(ids, t, { x: 240, y: 360, w: 480, h: 40, text: '— Author Name', fontSize: 18, textAlign: 'center' }),
      ];
    },
  },
];
