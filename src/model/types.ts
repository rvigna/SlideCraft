/* ========================================================
   SlideCraft — data model
   All geometry is in slide units: a slide is 960 × 540.
   ======================================================== */

export const SLIDE_W = 960;
export const SLIDE_H = 540;

export type BorderStyle = 'none' | 'solid' | 'dashed' | 'dotted';
export type Shadow = 'none' | 'sm' | 'md' | 'lg';
export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type ObjectFit = 'cover' | 'contain' | 'fill';

export type ShapeType =
  | 'rect' | 'rounded-rect' | 'circle' | 'ellipse' | 'triangle' | 'diamond'
  | 'star' | 'hexagon' | 'arrow-right' | 'arrow-left' | 'line';

export type Transition =
  | 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom-in' | 'zoom-out';

interface BaseObject {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number; // 0–100
  backgroundColor: string;
  borderStyle: BorderStyle;
  borderWidth: number;
  borderColor: string;
  borderRadius: number;
  shadow: Shadow;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline' | 'line-through';
  textAlign: TextAlign;
  color: string;
  lineHeight: number;
}

export type VerticalAlign = 'top' | 'middle' | 'bottom';

export interface TextObject extends BaseObject, TextStyle {
  type: 'text';
  verticalAlign: VerticalAlign;
  /** Rich text as sanitized HTML (b, i, u, span, ul/ol/li, br, div) */
  text: string;
}

export interface ShapeObject extends BaseObject, TextStyle {
  type: 'shape';
  shapeType: ShapeType;
  /** Plain-text label drawn centered in the shape */
  text: string;
}

export interface ImageObject extends BaseObject {
  type: 'image';
  src: string;
  objectFit: ObjectFit;
}

export interface IconObject extends BaseObject {
  type: 'icon';
  /** Name of a Carbon icon, see model/icons.ts */
  icon: string;
  color: string;
}

export interface TableCell {
  text: string;
  fill?: string;
  color?: string;
  bold?: boolean;
  align?: TextAlign;
}

/** Grid lines use the object's border style/width/color; empty cells use backgroundColor */
export interface TableObject extends BaseObject, TextStyle {
  type: 'table';
  rows: TableCell[][];
  /** Column widths as fractions of the table width */
  colWidths: number[];
  headerRow: boolean;
  bandedRows: boolean;
  headerFill: string;
  headerColor: string;
  bandFill: string;
}

export type ChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut';

export interface ChartSeries {
  name: string;
  values: number[];
  color: string;
}

export interface ChartObject extends BaseObject {
  type: 'chart';
  chartType: ChartType;
  title: string;
  categories: string[];
  series: ChartSeries[];
  showLegend: boolean;
  showValues: boolean;
  /** Pie/doughnut slice colors by category; falls back to the series palette */
  pointColors?: string[];
  fontFamily: string;
  /** Axis, label and legend text color */
  color: string;
}

export type SlideObject = TextObject | ShapeObject | ImageObject | IconObject | TableObject | ChartObject;
export type ObjectType = SlideObject['type'];

export interface Slide {
  id: string;
  background: string; // color or CSS gradient
  backgroundImage: string;
  transition: Transition;
  transitionDuration: number;
  objects: SlideObject[];
  notes: string;
}

export interface Deck {
  title: string;
  themeName: string;
  slides: Slide[];
  nextObjectId: number;
}

/** Objects the text toolbar (font, size, bold, alignment…) applies to */
export const isTextual = (o: SlideObject): o is TextObject | ShapeObject | TableObject =>
  o.type === 'text' || o.type === 'shape' || o.type === 'table';
