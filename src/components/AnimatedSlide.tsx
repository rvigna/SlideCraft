import { memo, type CSSProperties } from 'react';
import type { ObjectAnimation, Slide, SlideObject, TextObject } from '../model/types';
import { buildSteps } from '../model/motion';
import { ObjectContent, objectBoxStyle, slideBackground } from './SlideObjectView';

/** Seconds between list items that animate on their own */
const ITEM_STAGGER = 0.14;

/**
 * - "present": click steps are hidden until `step` reveals them (slideshow)
 * - "auto": everything plays in sequence without clicks (previews, HTML export)
 */
export type AnimationMode = 'present' | 'auto';

interface ItemState { hidden: boolean; anim: ObjectAnimation | null; delay: number }

function animClass(state: ItemState): { className: string; style: CSSProperties } {
  if (state.hidden) return { className: 'sc-hidden', style: {} };
  if (!state.anim) return { className: '', style: {} };
  return {
    className: `sc-anim sc-anim-${state.anim.effect}`,
    style: { animationDuration: `${state.anim.duration}s`, animationDelay: `${state.delay}s` },
  };
}

/** Add animation classes/styles to the top-level list items of a text box's HTML */
function animateListItems(html: string, item: (index: number) => ItemState): string {
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild!;
  root.querySelectorAll(':scope > ul > li, :scope > ol > li').forEach((li, i) => {
    const { className, style } = animClass(item(i));
    if (className) li.setAttribute('class', className);
    const css = Object.entries(style).map(([k, v]) => `${k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}: ${v}`).join('; ');
    if (css) li.setAttribute('style', css);
  });
  return root.innerHTML;
}

function AnimatedObject({ obj, state, items }: { obj: SlideObject; state: ItemState; items?: (i: number) => ItemState }) {
  const { className, style } = animClass(state);
  const content = items && obj.type === 'text'
    ? <ObjectContent obj={{ ...obj, text: animateListItems(obj.text, items) } as TextObject} />
    : <ObjectContent obj={obj} />;
  return (
    <div className={`slide-object-static ${className}`.trim()} style={{ ...objectBoxStyle(obj), ...style }}>
      {content}
    </div>
  );
}

export const AnimatedSlide = memo(function AnimatedSlide({ slide, step = 0, mode = 'present', still = false }: {
  slide: Slide; step?: number; mode?: AnimationMode;
  /** Show the finished state without animating (e.g. when stepping back to a slide) */
  still?: boolean;
}) {
  const steps = buildSteps(slide);
  const stepIndex = (id: number, paragraph?: number) => steps.findIndex(s => s.objectId === id && s.paragraph === paragraph);
  // In auto mode click steps play one after another after the automatic ones
  const autoEnd = Math.max(0, ...slide.objects.filter(o => o.animation && !o.animation.onClick).map(o => o.animation!.delay + o.animation!.duration * 0.6));
  const autoDelay = (i: number) => autoEnd + i * 0.45;

  return (
    <div className="slide-stage" style={{ width: 960, height: 540, position: 'relative', overflow: 'hidden', background: slideBackground(slide) }}>
      {slide.objects.map(o => {
        const a = still ? undefined : o.animation;
        if (!a) return <AnimatedObject key={o.id} obj={o} state={{ hidden: false, anim: null, delay: 0 }} />;

        if (a.byParagraph && o.type === 'text') {
          const items = (p: number): ItemState => {
            if (!a.onClick) return { hidden: false, anim: a, delay: a.delay + p * ITEM_STAGGER };
            const idx = stepIndex(o.id, p);
            if (mode === 'auto') return { hidden: false, anim: a, delay: autoDelay(idx) };
            if (idx >= step) return { hidden: true, anim: a, delay: 0 };
            // Revealing an item rewrites the list's HTML, so only the newest item may animate
            return { hidden: false, anim: idx === step - 1 ? a : null, delay: 0 };
          };
          // The box itself stays put; its items do the moving
          return <AnimatedObject key={o.id} obj={o} state={{ hidden: false, anim: null, delay: 0 }} items={items} />;
        }

        if (!a.onClick) return <AnimatedObject key={o.id} obj={o} state={{ hidden: false, anim: a, delay: a.delay }} />;
        const idx = stepIndex(o.id);
        if (mode === 'auto') return <AnimatedObject key={o.id} obj={o} state={{ hidden: false, anim: a, delay: autoDelay(idx) }} />;
        return <AnimatedObject key={o.id} obj={o} state={{ hidden: idx >= step, anim: a, delay: 0 }} />;
      })}
    </div>
  );
});

/** Total seconds for a slide to finish animating in auto mode (for preview loops) */
export function autoDuration(slide: Slide): number {
  const steps = buildSteps(slide).length;
  const ends = slide.objects.map(o => (o.animation ? o.animation.delay + o.animation.duration : 0));
  return Math.max(slide.transition !== 'none' ? slide.transitionDuration : 0, ...ends) + steps * 0.45 + 0.6;
}
