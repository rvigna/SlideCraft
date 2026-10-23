import type { Slide } from './types';
import { CHART_PALETTE, tableColors } from './palette';

export interface DeckTheme {
  name: string;
  bg: string;
  heading: string;
  body: string;
  accent: string;
  headingFont: string;
  bodyFont: string;
  sectionBg: string;
  sectionText: string;
}

export const THEMES: DeckTheme[] = [
  { name: 'Carbon', bg: '#ffffff', heading: '#161616', body: '#525252', accent: '#0f62fe', headingFont: 'IBM Plex Sans', bodyFont: 'IBM Plex Sans', sectionBg: '#161616', sectionText: '#ffffff' },
  { name: 'Carbon Dark', bg: '#161616', heading: '#f4f4f4', body: '#c6c6c6', accent: '#78a9ff', headingFont: 'IBM Plex Sans', bodyFont: 'IBM Plex Sans', sectionBg: '#0f62fe', sectionText: '#ffffff' },
  { name: 'Classic', bg: '#ffffff', heading: '#1f2937', body: '#6b7280', accent: '#4361ee', headingFont: 'Montserrat', bodyFont: 'Inter', sectionBg: '#1e293b', sectionText: '#ffffff' },
  { name: 'Midnight', bg: '#0f172a', heading: '#f8fafc', body: '#94a3b8', accent: '#38bdf8', headingFont: 'Poppins', bodyFont: 'Inter', sectionBg: '#38bdf8', sectionText: '#0f172a' },
  { name: 'Aurora', bg: 'linear-gradient(135deg, #667eea, #764ba2)', heading: '#ffffff', body: '#ede9fe', accent: '#fde68a', headingFont: 'Poppins', bodyFont: 'Poppins', sectionBg: '#1e1b4b', sectionText: '#fde68a' },
  { name: 'Sunset', bg: 'linear-gradient(135deg, #ff7e5f, #feb47b)', heading: '#ffffff', body: '#fff7ed', accent: '#7c2d12', headingFont: 'Playfair Display', bodyFont: 'Lato', sectionBg: '#7c2d12', sectionText: '#ffedd5' },
  { name: 'Forest', bg: '#f0fdf4', heading: '#14532d', body: '#3f6212', accent: '#16a34a', headingFont: 'Lato', bodyFont: 'Open Sans', sectionBg: '#14532d', sectionText: '#f0fdf4' },
  { name: 'Editorial', bg: '#faf7f2', heading: '#111111', body: '#525252', accent: '#b91c1c', headingFont: 'IBM Plex Serif', bodyFont: 'IBM Plex Serif', sectionBg: '#111111', sectionText: '#faf7f2' },
  { name: 'Terminal', bg: '#0b0f0c', heading: '#42be65', body: '#a7f0ba', accent: '#42be65', headingFont: 'IBM Plex Mono', bodyFont: 'IBM Plex Mono', sectionBg: '#044317', sectionText: '#a7f0ba' },
];

export function getTheme(name: string | undefined): DeckTheme {
  return THEMES.find(t => t.name === name) ?? THEMES[0];
}

/** Heuristic used when re-theming existing content: big or bold text is a heading */
export function isHeadingSize(fontSize: number, fontWeight: string): boolean {
  return fontSize >= 32 || (fontSize >= 26 && parseInt(fontWeight) >= 700);
}

/** Restyle one slide in place. Section-header slides keep their contrasting look. */
export function applyThemeToSlide(slide: Slide, t: DeckTheme, previous?: DeckTheme): void {
  const isSection = !!previous && slide.background === previous.sectionBg && previous.sectionBg !== previous.bg;
  slide.background = isSection ? t.sectionBg : t.bg;
  slide.backgroundImage = '';
  slide.objects.forEach(obj => {
    if (obj.type === 'text') {
      const heading = isHeadingSize(obj.fontSize, obj.fontWeight);
      obj.color = isSection ? t.sectionText : heading ? t.heading : t.body;
      obj.fontFamily = heading ? t.headingFont : t.bodyFont;
    } else if (obj.type === 'shape') {
      const fill = isSection ? t.sectionText : t.accent;
      if (obj.backgroundColor !== 'transparent') obj.backgroundColor = fill;
      obj.borderColor = fill;
      obj.fontFamily = t.bodyFont;
    } else if (obj.type === 'icon') {
      obj.color = isSection ? t.sectionText : t.accent;
    } else if (obj.type === 'table') {
      Object.assign(obj, tableColors(t.accent, t.bg));
      obj.fontFamily = t.bodyFont;
      obj.color = t.body;
      obj.rows.forEach(row => row.forEach(cell => { delete cell.fill; delete cell.color; }));
    } else if (obj.type === 'chart') {
      obj.fontFamily = t.bodyFont;
      obj.color = t.body;
      obj.series.forEach((s, i) => { s.color = i === 0 ? t.accent : CHART_PALETTE[(i - 1) % CHART_PALETTE.length]; });
      delete obj.pointColors;
    }
  });
}
