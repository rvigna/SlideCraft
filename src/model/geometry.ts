import { SLIDE_H, SLIDE_W, type SlideObject } from './types';

export interface Box { x: number; y: number; w: number; h: number }

export const SLIDE_BOX: Box = { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H };

/** Bounding box of a list of boxes (rotation ignored) */
export function boundsOf(boxes: Box[]): Box {
  const x1 = Math.min(...boxes.map(o => o.x));
  const y1 = Math.min(...boxes.map(o => o.y));
  const x2 = Math.max(...boxes.map(o => o.x + o.w));
  const y2 = Math.max(...boxes.map(o => o.y + o.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------------------------------------------------------------
// Smart guides
// ---------------------------------------------------------------
export interface SnapLines { xs: number[]; ys: number[] }

/** Lines worth snapping to: slide edges and center plus the edges and centers of `others` */
export function snapLines(others: Box[]): SnapLines {
  const xs = [0, SLIDE_W / 2, SLIDE_W];
  const ys = [0, SLIDE_H / 2, SLIDE_H];
  others.forEach(o => {
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + o.h / 2, o.y + o.h);
  });
  return { xs, ys };
}

export interface Snap { d: number; line: number }

/** Smallest offset that brings one of `edges` onto one of `lines`, within `threshold` */
export function bestSnap(edges: number[], lines: number[], threshold: number): Snap | null {
  let best: Snap | null = null;
  for (const edge of edges) {
    for (const line of lines) {
      const d = line - edge;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line };
    }
  }
  return best;
}

export interface MoveSnap { dx: number; dy: number; guidesX: number[]; guidesY: number[] }

/** Snap a moving box (its edges and center) to the given lines */
export function snapMove(box: Box, lines: SnapLines, threshold: number): MoveSnap {
  const sx = bestSnap([box.x, box.x + box.w / 2, box.x + box.w], lines.xs, threshold);
  const sy = bestSnap([box.y, box.y + box.h / 2, box.y + box.h], lines.ys, threshold);
  return {
    dx: sx?.d ?? 0,
    dy: sy?.d ?? 0,
    guidesX: sx ? [sx.line] : [],
    guidesY: sy ? [sy.line] : [],
  };
}

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface ResizeResult { box: Box; guidesX: number[]; guidesY: number[] }

/**
 * New box for dragging `handle` by (dx, dy) from `start`.
 * `keepRatio` locks the aspect ratio on corner handles; otherwise moving edges snap to `lines`.
 */
export function resizeBox(
  start: Box, handle: ResizeHandle, dx: number, dy: number,
  opts: { keepRatio?: boolean; lines?: SnapLines; threshold?: number; min?: number } = {},
): ResizeResult {
  const min = opts.min ?? 20;
  let { x, y, w, h } = start;
  if (handle.includes('e')) w = Math.max(min, start.w + dx);
  if (handle.includes('w')) { w = Math.max(min, start.w - dx); x = start.x + start.w - w; }
  if (handle.includes('s')) h = Math.max(min, start.h + dy);
  if (handle.includes('n')) { h = Math.max(min, start.h - dy); y = start.y + start.h - h; }

  const guidesX: number[] = [];
  const guidesY: number[] = [];
  const corner = handle.length === 2;
  if (opts.keepRatio && corner) {
    const ratio = start.w / start.h;
    h = w / ratio;
    if (handle.includes('n')) y = start.y + start.h - h;
  } else if (opts.lines) {
    const t = opts.threshold ?? 6;
    const { xs, ys } = opts.lines;
    if (handle.includes('e')) { const s = bestSnap([x + w], xs, t); if (s) { w += s.d; guidesX.push(s.line); } }
    if (handle.includes('w')) { const s = bestSnap([x], xs, t); if (s) { x += s.d; w -= s.d; guidesX.push(s.line); } }
    if (handle.includes('s')) { const s = bestSnap([y + h], ys, t); if (s) { h += s.d; guidesY.push(s.line); } }
    if (handle.includes('n')) { const s = bestSnap([y], ys, t); if (s) { y += s.d; h -= s.d; guidesY.push(s.line); } }
  }
  return { box: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }, guidesX, guidesY };
}

// ---------------------------------------------------------------
// Align & distribute (mutate in place — callers run inside immer)
// ---------------------------------------------------------------
export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** A single object aligns to the slide; several align to their shared bounds */
export function alignObjects(objs: SlideObject[], mode: AlignMode): void {
  if (!objs.length) return;
  const b = objs.length === 1 ? SLIDE_BOX : boundsOf(objs);
  objs.forEach(o => {
    if (mode === 'left') o.x = b.x;
    if (mode === 'center') o.x = Math.round(b.x + (b.w - o.w) / 2);
    if (mode === 'right') o.x = b.x + b.w - o.w;
    if (mode === 'top') o.y = b.y;
    if (mode === 'middle') o.y = Math.round(b.y + (b.h - o.h) / 2);
    if (mode === 'bottom') o.y = b.y + b.h - o.h;
  });
}

/** Equal gaps between objects, keeping the outermost two in place */
export function distributeObjects(objs: SlideObject[], axis: 'h' | 'v'): void {
  if (objs.length < 3) return;
  const pos = axis === 'h' ? 'x' : 'y';
  const size = axis === 'h' ? 'w' : 'h';
  const sorted = [...objs].sort((a, b) => a[pos] - b[pos]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = last[pos] + last[size] - first[pos];
  const total = sorted.reduce((sum, o) => sum + o[size], 0);
  const gap = (span - total) / (sorted.length - 1);
  let cursor = first[pos];
  sorted.forEach(o => { o[pos] = Math.round(cursor); cursor += o[size] + gap; });
}

export type ZOrder = 'front' | 'forward' | 'backward' | 'back';

/** Reorder `objects` so the selected ones move in z-order; returns a new array */
export function reorder<T extends { id: number }>(objects: T[], selected: Set<number>, mode: ZOrder): T[] {
  const arr = [...objects];
  if (mode === 'front' || mode === 'back') {
    const picked = arr.filter(o => selected.has(o.id));
    const rest = arr.filter(o => !selected.has(o.id));
    return mode === 'front' ? [...rest, ...picked] : [...picked, ...rest];
  }
  if (mode === 'forward') {
    for (let i = arr.length - 2; i >= 0; i--) {
      if (selected.has(arr[i].id) && !selected.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
    }
  } else {
    for (let i = 1; i < arr.length; i++) {
      if (selected.has(arr[i].id) && !selected.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
    }
  }
  return arr;
}
