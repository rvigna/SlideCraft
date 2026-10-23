import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { applyMotion, buildSteps, MOTION_PRESETS, readingOrder } from '../model/motion';
import { createDeck, createShapeObject, createTextObject, IdSource, normalizeDeck } from '../model/factory';
import { markdownToDeck } from '../model/markdown';
import { AnimatedSlide } from '../components/AnimatedSlide';
import { deckToHtml } from '../io/htmlExport';
import type { Deck } from '../model/types';

function contentDeck(): Deck {
  const deck = createDeck('Carbon');
  const ids = new IdSource(deck.nextObjectId);
  const s = deck.slides[0];
  s.objects = [
    createShapeObject(ids, 'rect', { x: 0, y: 0, w: 960, h: 540, backgroundColor: '#eee' }), // backdrop
    createTextObject(ids, { x: 60, y: 300, w: 400, h: 200, text: '<ul><li>One</li><li>Two</li><li>Three</li></ul>', fontSize: 22 }),
    createTextObject(ids, { x: 60, y: 36, w: 840, h: 64, text: 'Title', fontSize: 36, fontWeight: '700' }),
    createShapeObject(ids, 'circle', { x: 600, y: 300, w: 100, h: 100 }),
  ];
  deck.nextObjectId = ids.next;
  return deck;
}

describe('motion presets', () => {
  it('orders content title-first, then top-to-bottom and left-to-right', () => {
    const order = readingOrder(contentDeck().slides[0].objects).map(o => (o.type === 'text' ? o.text.slice(0, 5) : o.type));
    expect(order[0]).toBe('Title');
  });

  it('applies a subtle transition and staggered entrances, skipping the backdrop', () => {
    const deck = contentDeck();
    applyMotion(deck, { preset: 'subtle', scope: 'all', slideIndex: 0, animateContent: true, revealOnClick: false, speed: 'normal' });
    const [backdrop, list, title, circle] = deck.slides[0].objects;
    expect(deck.slides[0].transition).toBe('fade');
    expect(backdrop.animation).toBeUndefined();
    expect(title.animation?.effect).toBe('rise');
    expect(title.animation!.delay).toBeLessThan(list.animation!.delay);
    expect(list.animation?.byParagraph).toBe(true);
    expect(circle.animation?.onClick).toBe(false);
    expect(buildSteps(deck.slides[0])).toEqual([]);
  });

  it('reveals bullets one per click, title arriving with the slide', () => {
    const deck = contentDeck();
    applyMotion(deck, { preset: 'smooth', scope: 'all', slideIndex: 0, animateContent: true, revealOnClick: true, speed: 'normal' });
    const steps = buildSteps(deck.slides[0]);
    expect(steps.map(s => s.paragraph ?? 'obj')).toEqual([0, 1, 2, 'obj']);
    const title = deck.slides[0].objects[2];
    expect(title.animation?.onClick).toBe(false);
  });

  it('scales timing with speed and removes everything with "none"', () => {
    const slow = contentDeck(), fast = contentDeck();
    applyMotion(slow, { preset: 'subtle', scope: 'all', slideIndex: 0, animateContent: true, revealOnClick: false, speed: 'slow' });
    applyMotion(fast, { preset: 'subtle', scope: 'all', slideIndex: 0, animateContent: true, revealOnClick: false, speed: 'fast' });
    expect(slow.slides[0].transitionDuration).toBeGreaterThan(fast.slides[0].transitionDuration);
    applyMotion(slow, { preset: 'none', scope: 'all', slideIndex: 0, animateContent: true, revealOnClick: false, speed: 'normal' });
    expect(slow.slides[0].transition).toBe('none');
    expect(slow.slides[0].objects.every(o => !o.animation)).toBe(true);
  });

  it('every preset is valid', () => {
    expect(MOTION_PRESETS.map(p => p.id)).toEqual(['subtle', 'smooth', 'focus', 'lively', 'none']);
  });
});

describe('rendering motion', () => {
  it('hides click steps until revealed, animating only the newest bullet', () => {
    const deck = contentDeck();
    applyMotion(deck, { preset: 'subtle', scope: 'all', slideIndex: 0, animateContent: true, revealOnClick: true, speed: 'normal' });
    const at = (step: number) => renderToStaticMarkup(createElement(AnimatedSlide, { slide: deck.slides[0], step }));
    expect((at(0).match(/<li class="sc-hidden"/g) ?? []).length).toBe(3);
    const two = at(2);
    expect((two.match(/<li class="sc-hidden"/g) ?? []).length).toBe(1);
    expect((two.match(/<li class="sc-anim/g) ?? []).length).toBe(1);
  });

  it('plays everything automatically in HTML exports', () => {
    const deck = contentDeck();
    applyMotion(deck, { preset: 'lively', scope: 'all', slideIndex: 0, animateContent: true, revealOnClick: true, speed: 'normal' });
    const html = deckToHtml(deck);
    expect(html).toContain('sc-anim-wipe');
    expect(html).not.toContain('sc-hidden');
    expect(html).toContain('data-transition="slide-left"');
  });

  it('reads "motion:" from Markdown front matter and survives JSON round trips', () => {
    const deck = markdownToDeck('---\nmotion: subtle\n---\n# Hello\n\n---\n\n# Points\n- A\n- B\n');
    expect(deck.slides.every(s => s.transition === 'fade')).toBe(true);
    expect(deck.slides[1].objects.some(o => o.animation?.byParagraph)).toBe(true);
    const again = normalizeDeck(JSON.parse(JSON.stringify(deck)));
    expect(again.slides[1].objects.map(o => o.animation?.effect)).toEqual(deck.slides[1].objects.map(o => o.animation?.effect));
  });
});
