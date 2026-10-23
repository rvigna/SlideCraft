import { memo, type CSSProperties, type ReactNode } from 'react';
import type { ShapeObject, ShapeType, Slide, SlideObject } from '../model/types';
import { ICONS } from '../model/icons';
import { fontStack } from '../model/fonts';

export const SHADOWS: Record<string, string> = {
  sm: '0 1px 3px rgba(0,0,0,0.15)',
  md: '0 4px 12px rgba(0,0,0,0.2)',
  lg: '0 8px 30px rgba(0,0,0,0.25)',
};

/** Polygon outlines in a 100×100 box (lines and arrows use their own viewBox) */
export const SHAPE_POLYGONS: Partial<Record<ShapeType, { viewBox: string; points: string }>> = {
  triangle: { viewBox: '0 0 100 100', points: '50,0 100,100 0,100' },
  diamond: { viewBox: '0 0 100 100', points: '50,0 100,50 50,100 0,50' },
  star: { viewBox: '0 0 100 100', points: '50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35' },
  hexagon: { viewBox: '0 0 100 100', points: '25,0 75,0 100,50 75,100 25,100 0,50' },
  'arrow-right': { viewBox: '0 0 100 60', points: '0,10 70,10 70,0 100,30 70,60 70,50 0,50' },
  'arrow-left': { viewBox: '0 0 100 60', points: '30,0 30,10 100,10 100,50 30,50 30,60 0,30' },
};

export function slideBackground(slide: Pick<Slide, 'background' | 'backgroundImage'>): string {
  return slide.backgroundImage ? `url("${slide.backgroundImage}") center/cover no-repeat` : slide.background;
}

const usesSvg = (t: ShapeType) => t === 'line' || !!SHAPE_POLYGONS[t];

function dashArray(o: ShapeObject): string | undefined {
  if (o.borderStyle === 'dashed') return `${o.borderWidth * 3} ${o.borderWidth * 2}`;
  if (o.borderStyle === 'dotted') return `${o.borderWidth} ${o.borderWidth}`;
  return undefined;
}

function ShapeBody({ o }: { o: ShapeObject }) {
  if (o.shapeType === 'line') {
    return (
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
        <line x1="0" y1="5" x2="100" y2="5" stroke={o.backgroundColor} strokeWidth={Math.max(2, o.h / 2)} vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }
  const poly = SHAPE_POLYGONS[o.shapeType];
  if (!poly) return null;
  const hasBorder = o.borderStyle !== 'none' && o.borderWidth > 0;
  return (
    <svg viewBox={poly.viewBox} preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      <polygon
        points={poly.points}
        fill={o.backgroundColor}
        stroke={hasBorder ? o.borderColor : 'none'}
        strokeWidth={hasBorder ? o.borderWidth : 0}
        strokeDasharray={hasBorder ? dashArray(o) : undefined}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Inline styles for the object box — self-contained so static markup can be exported as-is */
export function objectBoxStyle(obj: SlideObject): CSSProperties {
  const style: CSSProperties = {
    position: 'absolute',
    left: obj.x,
    top: obj.y,
    width: obj.w,
    height: obj.h,
    opacity: (obj.opacity ?? 100) / 100,
    boxSizing: 'border-box',
  };
  if (obj.rotation) style.transform = `rotate(${obj.rotation}deg)`;
  const svgShape = obj.type === 'shape' && usesSvg(obj.shapeType);
  if (!svgShape) {
    if (obj.borderStyle !== 'none' && obj.borderWidth > 0) {
      style.border = `${obj.borderWidth}px ${obj.borderStyle} ${obj.borderColor}`;
    }
    if (obj.borderRadius) style.borderRadius = obj.borderRadius;
    if (obj.shadow !== 'none') style.boxShadow = SHADOWS[obj.shadow];
    if (obj.backgroundColor && obj.backgroundColor !== 'transparent') style.backgroundColor = obj.backgroundColor;
  } else if (obj.shadow !== 'none') {
    style.filter = `drop-shadow(${SHADOWS[obj.shadow].replace(/^0 /, '0px ')})`;
  }
  if (obj.type === 'shape') {
    if (obj.shapeType === 'circle' || obj.shapeType === 'ellipse') style.borderRadius = '50%';
    if (obj.shapeType === 'rounded-rect') style.borderRadius = Math.max(obj.borderRadius, 12);
  }
  if (obj.type === 'image') style.overflow = 'hidden';
  return style;
}

export function textStyle(obj: Extract<SlideObject, { type: 'text' | 'shape' }>): CSSProperties {
  return {
    fontFamily: fontStack(obj.fontFamily),
    fontSize: obj.fontSize,
    fontWeight: obj.fontWeight as CSSProperties['fontWeight'],
    fontStyle: obj.fontStyle,
    textDecoration: obj.textDecoration,
    textAlign: obj.textAlign,
    color: obj.color,
    lineHeight: obj.lineHeight || 1.4,
  };
}

export function ObjectContent({ obj, textOverride }: { obj: SlideObject; textOverride?: ReactNode }) {
  switch (obj.type) {
    case 'text':
      return (
        <div style={{ ...textStyle(obj), ...TEXT_BOX, justifyContent: JUSTIFY[obj.verticalAlign ?? 'top'] }}>
          {textOverride ?? <div className="obj-text" dangerouslySetInnerHTML={{ __html: obj.text }} />}
        </div>
      );
    case 'image':
      return <img src={obj.src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: obj.objectFit, display: 'block', pointerEvents: 'none' }} />;
    case 'shape':
      return (
        <>
          <ShapeBody o={obj} />
          {obj.text && obj.shapeType !== 'line' && (
            <div style={{ ...textStyle(obj), position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: obj.textAlign === 'left' ? 'flex-start' : obj.textAlign === 'right' ? 'flex-end' : 'center', padding: 8, pointerEvents: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {obj.text}
            </div>
          )}
        </>
      );
    case 'icon': {
      const Icon = ICONS[obj.icon] ?? ICONS.Star;
      return (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: obj.color }}>
          <Icon size={Math.min(obj.w, obj.h) * 0.8} style={{ width: '80%', height: '80%' }} />
        </div>
      );
    }
  }
}

const JUSTIFY = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

export const TEXT_BOX: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100%',
  padding: '8px 12px',
  overflow: 'hidden',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
  boxSizing: 'border-box',
};

/** Non-interactive rendering of one object */
export const StaticObject = memo(function StaticObject({ obj }: { obj: SlideObject }) {
  return (
    <div className="slide-object-static" style={objectBoxStyle(obj)}>
      <ObjectContent obj={obj} />
    </div>
  );
});

/** A full 960×540 slide, scaled to `width` pixels wide */
export const SlideStage = memo(function SlideStage({ slide, width, className }: { slide: Slide; width?: number; className?: string }) {
  const scale = width ? width / 960 : 1;
  const inner = (
    <div className="slide-stage" style={{ width: 960, height: 540, position: 'relative', overflow: 'hidden', background: slideBackground(slide), transform: width ? `scale(${scale})` : undefined, transformOrigin: '0 0' }}>
      {slide.objects.map(o => <StaticObject key={o.id} obj={o} />)}
    </div>
  );
  if (!width) return inner;
  return (
    <div className={className} style={{ width, height: width * 540 / 960, overflow: 'hidden', position: 'relative' }}>
      {inner}
    </div>
  );
});
