import type {
  Deck, IconObject, ImageObject, ShapeObject, ShapeType, Slide, SlideObject, TextObject, TextStyle,
} from './types';
import { getTheme, type DeckTheme } from './themes';
import { resolveIconName } from './icons';

/** Hands out object ids; bound to a deck so ids never collide after load or undo */
export class IdSource {
  constructor(public next: number) {}
  take(): number { return this.next++; }
}

const baseBox = {
  rotation: 0,
  opacity: 100,
  backgroundColor: 'transparent',
  borderStyle: 'none' as const,
  borderWidth: 0,
  borderColor: '#000000',
  borderRadius: 0,
  shadow: 'none' as const,
};

const baseText: TextStyle = {
  fontFamily: 'IBM Plex Sans',
  fontSize: 24,
  fontWeight: '400',
  fontStyle: 'normal',
  textDecoration: 'none',
  textAlign: 'left',
  color: '#161616',
  lineHeight: 1.4,
};

export function newSlideId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function createBlankSlide(t: DeckTheme): Slide {
  return {
    id: newSlideId(),
    background: t.bg,
    backgroundImage: '',
    transition: 'none',
    transitionDuration: 0.5,
    objects: [],
    notes: '',
  };
}

export function createTextObject(ids: IdSource, overrides: Partial<TextObject> = {}): TextObject {
  return { id: ids.take(), type: 'text', x: 100, y: 100, w: 300, h: 60, ...baseBox, ...baseText, verticalAlign: 'top', text: 'Text', ...overrides };
}

export function createShapeObject(ids: IdSource, shapeType: ShapeType, overrides: Partial<ShapeObject> = {}): ShapeObject {
  return {
    id: ids.take(), type: 'shape', shapeType, x: 380, y: 195, w: 200, h: 150,
    ...baseBox, ...baseText,
    backgroundColor: '#0f62fe', borderStyle: 'solid', borderColor: '#0f62fe',
    fontSize: 16, color: '#ffffff', textAlign: 'center', text: '',
    ...(shapeType === 'line' ? { w: 300, h: 8 } : {}),
    ...overrides,
  };
}

export function createImageObject(ids: IdSource, src: string, overrides: Partial<ImageObject> = {}): ImageObject {
  return { id: ids.take(), type: 'image', x: 100, y: 100, w: 300, h: 200, ...baseBox, src, objectFit: 'cover', ...overrides };
}

export function createIconObject(ids: IdSource, icon: string, overrides: Partial<IconObject> = {}): IconObject {
  return { id: ids.take(), type: 'icon', x: 440, y: 230, w: 80, h: 80, ...baseBox, icon, color: '#0f62fe', ...overrides };
}

export function createTitleSlide(ids: IdSource, t: DeckTheme): Slide {
  const slide = createBlankSlide(t);
  slide.objects.push(
    createTextObject(ids, {
      x: 80, y: 170, w: 800, h: 90, text: 'Presentation Title',
      fontSize: 48, fontWeight: '700', textAlign: 'center', fontFamily: t.headingFont, color: t.heading,
    }),
    createTextObject(ids, {
      x: 180, y: 275, w: 600, h: 50, text: 'Double-click to add a subtitle',
      fontSize: 22, textAlign: 'center', fontFamily: t.bodyFont, color: t.body,
    }),
  );
  return slide;
}

export function createDeck(themeName = 'Carbon'): Deck {
  const t = getTheme(themeName);
  const ids = new IdSource(1);
  const slides = [createTitleSlide(ids, t)];
  return { title: 'Untitled Presentation', themeName: t.name, slides, nextObjectId: ids.next };
}

// ---------------------------------------------------------------
// Normalisation: accept decks from older SlideCraft versions, JSON
// files and PPTX imports, filling in any missing fields.
// ---------------------------------------------------------------
type Loose = Record<string, unknown>;

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeObject(raw: Loose, ids: IdSource): SlideObject | null {
  // Ids are reassigned so a loaded deck can never contain duplicates
  const { id: _oldId, ...base } = raw;
  void _oldId;
  const shared = {
    x: num(raw.x, 100), y: num(raw.y, 100), w: Math.max(4, num(raw.w, 200)), h: Math.max(4, num(raw.h, 100)),
    rotation: num(raw.rotation, 0), opacity: num(raw.opacity, 100), borderWidth: num(raw.borderWidth, 0),
    borderRadius: num(raw.borderRadius, 0),
  };
  switch (raw.type) {
    case 'text':
      return createTextObject(ids, { ...(base as Partial<TextObject>), ...shared, fontSize: num(raw.fontSize, 24), fontWeight: String(raw.fontWeight ?? '400') === 'bold' ? '700' : String(raw.fontWeight ?? '400') });
    case 'shape':
      return createShapeObject(ids, (raw.shapeType as ShapeType) ?? 'rect', { ...(base as Partial<ShapeObject>), ...shared, fontSize: num(raw.fontSize, 16) });
    case 'image':
      if (!raw.src) return null;
      return createImageObject(ids, String(raw.src), { ...(base as Partial<ImageObject>), ...shared });
    case 'icon':
      return createIconObject(ids, resolveIconName((raw.icon ?? raw.iconClass) as string), {
        ...(base as Partial<IconObject>), ...shared,
      });
    default:
      return null;
  }
}

export function normalizeDeck(raw: unknown): Deck {
  const data = (raw ?? {}) as Loose;
  const themeName = getTheme(data.themeName as string | undefined).name;
  const t = getTheme(themeName);
  const ids = new IdSource(1);
  const rawSlides = Array.isArray(data.slides) ? (data.slides as Loose[]) : [];
  const slides: Slide[] = rawSlides.map(rs => ({
    ...createBlankSlide(t),
    background: typeof rs.background === 'string' && rs.background ? rs.background : '#ffffff',
    backgroundImage: typeof rs.backgroundImage === 'string' ? rs.backgroundImage : '',
    transition: (rs.transition as Slide['transition']) ?? 'none',
    transitionDuration: num(rs.transitionDuration, 0.5),
    notes: typeof rs.notes === 'string' ? rs.notes : '',
    objects: (Array.isArray(rs.objects) ? (rs.objects as Loose[]) : [])
      .map(o => normalizeObject(o, ids))
      .filter((o): o is SlideObject => !!o),
  }));
  if (!slides.length) slides.push(createTitleSlide(ids, t));
  return {
    title: typeof data.title === 'string' && data.title ? data.title : 'Untitled Presentation',
    themeName,
    slides,
    nextObjectId: ids.next,
  };
}
