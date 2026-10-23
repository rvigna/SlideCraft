/* Measure how tall text really renders, using an offscreen element styled like a slide text box. */
import type { TextObject } from '../model/types';
import { fontStack } from '../model/fonts';

let probe: HTMLDivElement | null = null;
// Unchanged objects keep their identity across edits (Immer), so their measurement can be reused
let cache = new WeakMap<TextObject, number>();
if (typeof document !== 'undefined') document.fonts?.addEventListener?.('loadingdone', () => { cache = new WeakMap(); });

/** measureTextHeight, remembered per object until web fonts change */
export function measureTextHeightCached(obj: TextObject): number {
  let h = cache.get(obj);
  if (h === undefined) { h = measureTextHeight(obj); if (Object.isFrozen(obj)) cache.set(obj, h); }
  return h;
}

export function measureTextHeight(obj: TextObject): number {
  if (typeof document === 'undefined') return 0;
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    Object.assign(probe.style, { position: 'absolute', left: '-20000px', top: '0', visibility: 'hidden', pointerEvents: 'none' });
    probe.className = 'slide-canvas-probe';
    document.body.appendChild(probe);
  }
  Object.assign(probe.style, {
    width: `${obj.w}px`,
    padding: '8px 12px',
    boxSizing: 'border-box',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    fontFamily: fontStack(obj.fontFamily),
    fontSize: `${obj.fontSize}px`,
    fontWeight: obj.fontWeight,
    fontStyle: obj.fontStyle,
    lineHeight: String(obj.lineHeight || 1.4),
    border: obj.borderStyle !== 'none' && obj.borderWidth ? `${obj.borderWidth}px solid transparent` : '0',
  });
  probe.innerHTML = `<div class="obj-text">${obj.text}</div>`;
  return probe.getBoundingClientRect().height;
}
