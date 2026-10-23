import { beforeEach, describe, expect, it } from 'vitest';
import * as ed from '../store/editor';
import { createDeck, createShapeObject, createTextObject } from '../model/factory';

const state = () => ed.useEditor.getState();

beforeEach(() => {
  ed.loadDeck(createDeck(), { resetHistory: true });
});

describe('editor store', () => {
  it('undoes and redoes commits', () => {
    ed.addObjects(ids => [createShapeObject(ids, 'rect')]);
    expect(ed.currentSlide().objects).toHaveLength(3);
    ed.undo();
    expect(ed.currentSlide().objects).toHaveLength(2);
    ed.redo();
    expect(ed.currentSlide().objects).toHaveLength(3);
  });

  it('coalesces rapid edits with the same key into one undo step', () => {
    const [id] = ed.addObjects(ids => [createShapeObject(ids, 'rect', { opacity: 100 })]);
    const depth = state().past.length;
    for (const v of [90, 80, 70]) ed.commitSelection(o => { o.opacity = v; }, undefined, { coalesce: 'opacity' });
    expect(state().past.length).toBe(depth + 1);
    ed.undo();
    expect(ed.currentSlide().objects.find(o => o.id === id)?.opacity).toBe(100);
  });

  it('records a whole drag gesture as a single undo step', () => {
    const [id] = ed.addObjects(ids => [createShapeObject(ids, 'rect', { x: 0 })]);
    const depth = state().past.length;
    ed.beginGesture();
    for (let x = 1; x <= 20; x++) ed.gestureUpdate(s => { s.objects.find(o => o.id === id)!.x = x; });
    ed.endGesture();
    expect(state().past.length).toBe(depth + 1);
    ed.undo();
    expect(ed.currentSlide().objects.find(o => o.id === id)?.x).toBe(0);
  });

  it('copies and pastes multiple objects with fresh ids', () => {
    ed.selectAll();
    expect(state().selection).toHaveLength(2);
    ed.copySelection();
    ed.pasteObjects();
    const objs = ed.currentSlide().objects;
    expect(objs).toHaveLength(4);
    expect(new Set(objs.map(o => o.id)).size).toBe(4);
    expect(state().selection).toHaveLength(2);
    expect(objs[2].x).toBe(objs[0].x + 20);
  });

  it('deletes the selection and prunes it', () => {
    ed.selectAll();
    ed.deleteSelection();
    expect(ed.currentSlide().objects).toHaveLength(0);
    expect(state().selection).toEqual([]);
  });

  it('adds, duplicates, moves and deletes slides', () => {
    ed.addSlide();
    expect(state().deck.slides).toHaveLength(2);
    expect(state().slideIndex).toBe(1);
    ed.duplicateSlide(0);
    expect(state().deck.slides).toHaveLength(3);
    const ids = state().deck.slides.flatMap(s => s.objects.map(o => o.id));
    expect(new Set(ids).size).toBe(ids.length);
    const first = state().deck.slides[0].id;
    ed.moveSlide(0, 3);
    expect(state().deck.slides[2].id).toBe(first);
    ed.deleteSlide(2);
    expect(state().deck.slides).toHaveLength(2);
  });

  it('applies a theme to every slide', () => {
    ed.addObjects(ids => [createTextObject(ids, { fontSize: 18 })]);
    ed.applyTheme('Carbon Dark');
    const slide = ed.currentSlide();
    expect(slide.background).toBe('#161616');
    expect(slide.objects.filter(o => o.type === 'text').every(o => o.type === 'text' && o.fontFamily === 'IBM Plex Sans')).toBe(true);
  });

  it('aligns the selection', () => {
    ed.selectAll();
    ed.alignSelection('left');
    const xs = ed.currentSlide().objects.map(o => o.x);
    expect(new Set(xs).size).toBe(1);
  });
});
