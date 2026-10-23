import { describe, expect, it } from 'vitest';
import { alignObjects, bestSnap, boundsOf, distributeObjects, reorder, resizeBox, snapLines, snapMove } from '../model/geometry';
import { createShapeObject, IdSource } from '../model/factory';

const ids = () => new IdSource(1);

describe('geometry', () => {
  it('computes bounds of several boxes', () => {
    expect(boundsOf([{ x: 10, y: 20, w: 30, h: 40 }, { x: 100, y: 0, w: 10, h: 10 }])).toEqual({ x: 10, y: 0, w: 100, h: 60 });
  });

  it('snaps to the nearest line within the threshold only', () => {
    expect(bestSnap([97], [0, 100, 200], 5)).toEqual({ d: 3, line: 100 });
    expect(bestSnap([90], [0, 100, 200], 5)).toBeNull();
  });

  it('snaps a moving box center to the slide center', () => {
    const lines = snapLines([]);
    const snap = snapMove({ x: 378, y: 10, w: 200, h: 100 }, lines, 6);
    expect(snap.dx).toBe(2); // center 478 → 480
    expect(snap.guidesX).toEqual([480]);
  });

  it('resizes from the west edge keeping the east edge fixed', () => {
    const r = resizeBox({ x: 100, y: 100, w: 200, h: 100 }, 'w', 50, 0);
    expect(r.box).toEqual({ x: 150, y: 100, w: 150, h: 100 });
  });

  it('keeps aspect ratio on corner handles when asked', () => {
    const r = resizeBox({ x: 0, y: 0, w: 200, h: 100 }, 'se', 100, 0, { keepRatio: true });
    expect(r.box).toEqual({ x: 0, y: 0, w: 300, h: 150 });
  });

  it('aligns one object to the slide and several to their bounds', () => {
    const src = ids();
    const a = createShapeObject(src, 'rect', { x: 10, y: 10, w: 100, h: 50 });
    alignObjects([a], 'center');
    expect(a.x).toBe(430);
    const b = createShapeObject(src, 'rect', { x: 300, y: 200, w: 50, h: 50 });
    alignObjects([a, b], 'left');
    expect(a.x).toBe(300);
    expect(b.x).toBe(300);
  });

  it('distributes objects with equal gaps', () => {
    const src = ids();
    const objs = [0, 50, 400].map(x => createShapeObject(src, 'rect', { x, y: 0, w: 100, h: 10 }));
    distributeObjects(objs, 'h');
    expect(objs.map(o => o.x)).toEqual([0, 200, 400]);
  });

  it('reorders selected objects in z-order', () => {
    const arr = [1, 2, 3, 4].map(id => ({ id }));
    expect(reorder(arr, new Set([2]), 'front').map(o => o.id)).toEqual([1, 3, 4, 2]);
    expect(reorder(arr, new Set([3]), 'back').map(o => o.id)).toEqual([3, 1, 2, 4]);
    expect(reorder(arr, new Set([2]), 'forward').map(o => o.id)).toEqual([1, 3, 2, 4]);
    expect(reorder(arr, new Set([2]), 'backward').map(o => o.id)).toEqual([2, 1, 3, 4]);
  });
});
