/* Motion presets: tasteful slide transitions plus entrance animations for content. */
import type { Deck, EntranceEffect, ObjectAnimation, Slide, SlideObject, Transition } from './types';
import { SLIDE_H, SLIDE_W } from './types';
import { isHeadingSize } from './themes';

export interface MotionPreset {
  id: 'none' | 'subtle' | 'smooth' | 'focus' | 'lively';
  name: string;
  description: string;
  transition: Transition;
  /** Seconds at normal speed */
  duration: number;
  content: { effect: EntranceEffect; duration: number; stagger: number } | null;
}

export const MOTION_PRESETS: MotionPreset[] = [
  { id: 'subtle', name: 'Subtle', description: 'A soft cross-fade between slides; content drifts up gently, one piece after another.', transition: 'fade', duration: 0.45, content: { effect: 'rise', duration: 0.5, stagger: 0.08 } },
  { id: 'smooth', name: 'Smooth', description: 'Each slide rises into place and its content fades in calmly.', transition: 'rise', duration: 0.6, content: { effect: 'fade', duration: 0.7, stagger: 0.15 } },
  { id: 'focus', name: 'Focus', description: 'A gentle zoom draws the eye; content settles in from slightly larger.', transition: 'soft-zoom', duration: 0.55, content: { effect: 'zoom', duration: 0.45, stagger: 0.1 } },
  { id: 'lively', name: 'Lively', description: 'Slides push in from the side; content wipes in left to right.', transition: 'slide-left', duration: 0.5, content: { effect: 'wipe', duration: 0.5, stagger: 0.12 } },
  { id: 'none', name: 'None', description: 'No transitions or animations. Every slide appears instantly.', transition: 'none', duration: 0.5, content: null },
];

export type MotionSpeed = 'slow' | 'normal' | 'fast';
export const SPEED_FACTOR: Record<MotionSpeed, number> = { slow: 1.5, normal: 1, fast: 0.65 };

export interface MotionOptions {
  preset: MotionPreset['id'];
  scope: 'all' | 'current';
  /** Slide the "current" scope applies to */
  slideIndex: number;
  animateContent: boolean;
  /** Each item waits for a click; lists reveal one bullet per click */
  revealOnClick: boolean;
  speed: MotionSpeed;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Objects that are part of the backdrop (full-bleed images/shapes, thin rules) don't animate */
function isBackdrop(o: SlideObject): boolean {
  if (o.w >= SLIDE_W - 40 && o.h >= SLIDE_H - 40) return true;
  return o.type === 'shape' && (o.shapeType === 'line' || (o.w > SLIDE_W * 0.45 && o.h > SLIDE_H * 0.8));
}

/** Reading order: titles first, then top-to-bottom, left-to-right */
export function readingOrder(objects: SlideObject[]): SlideObject[] {
  const title = (o: SlideObject) => (o.type === 'text' && isHeadingSize(o.fontSize, o.fontWeight) ? 0 : 1);
  return [...objects].sort((a, b) => title(a) - title(b) || Math.round(a.y / 24) - Math.round(b.y / 24) || a.x - b.x);
}

export function applyMotionToSlide(slide: Slide, opts: MotionOptions): void {
  const preset = MOTION_PRESETS.find(p => p.id === opts.preset) ?? MOTION_PRESETS[0];
  const k = SPEED_FACTOR[opts.speed];
  slide.transition = preset.transition;
  slide.transitionDuration = round(preset.duration * k);
  slide.objects.forEach(o => { delete o.animation; });
  if (!preset.content || !opts.animateContent) return;

  const animated = readingOrder(slide.objects).filter(o => !isBackdrop(o));
  animated.forEach((o, i) => {
    const isTitle = i === 0 && o.type === 'text' && isHeadingSize(o.fontSize, o.fontWeight);
    const anim: ObjectAnimation = {
      effect: preset.content!.effect,
      duration: round(preset.content!.duration * k),
      // Titles arrive with the slide; with click reveal everything else waits its turn
      delay: opts.revealOnClick ? 0 : round(i * preset.content!.stagger * k + (slide.transition !== 'none' ? slide.transitionDuration * 0.4 : 0)),
      onClick: opts.revealOnClick && !isTitle,
    };
    if (o.type === 'text' && /<li>/.test(o.text)) anim.byParagraph = true;
    o.animation = anim;
  });
}

export function applyMotion(deck: Deck, opts: MotionOptions): number {
  const targets = opts.scope === 'all' ? deck.slides : [deck.slides[opts.slideIndex]].filter(Boolean);
  targets.forEach(s => applyMotionToSlide(s, opts));
  return targets.length;
}

/** Guess which preset a slide uses, for pre-filling the wizard */
export function detectPreset(slide: Slide): MotionPreset['id'] {
  const match = MOTION_PRESETS.find(p => p.transition === slide.transition && p.id !== 'none');
  return slide.transition === 'none' && !slide.objects.some(o => o.animation) ? 'none' : match?.id ?? 'subtle';
}

// ---------------------------------------------------------------
// Click steps during a presentation
// ---------------------------------------------------------------
export interface BuildStep { objectId: number; paragraph?: number }

function topLevelItems(html: string): number {
  if (typeof DOMParser === 'undefined') return (html.match(/<li>/g) ?? []).length;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return doc.querySelectorAll('div > ul > li, div > ol > li').length;
}

/** The ordered list of things a click reveals on this slide */
export function buildSteps(slide: Slide): BuildStep[] {
  const steps: BuildStep[] = [];
  readingOrder(slide.objects).forEach(o => {
    if (!o.animation?.onClick) return;
    if (o.type === 'text' && o.animation.byParagraph) {
      const n = topLevelItems(o.text);
      for (let p = 0; p < n; p++) steps.push({ objectId: o.id, paragraph: p });
      if (!n) steps.push({ objectId: o.id });
    } else {
      steps.push({ objectId: o.id });
    }
  });
  return steps;
}
