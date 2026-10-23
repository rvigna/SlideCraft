import type { ChartObject } from '../model/types';
import { fontStack } from '../model/fonts';
import { sliceColor } from '../model/palette';

/** Round an axis range out to "nice" tick steps (1, 2, 2.5, 5 × 10ⁿ) */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString() : String(+v.toFixed(2)));

function slicePath(cx: number, cy: number, r: number, inner: number, a0: number, a1: number): string {
  const p = (rad: number, a: number) => `${cx + rad * Math.sin(a)},${cy - rad * Math.cos(a)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4; // a full circle needs two arcs
  if (inner <= 0) return `M${cx},${cy} L${p(r, a0)} A${r},${r} 0 ${large} 1 ${p(r, a1)} Z`;
  return `M${p(r, a0)} A${r},${r} 0 ${large} 1 ${p(r, a1)} L${p(inner, a1)} A${inner},${inner} 0 ${large} 0 ${p(inner, a0)} Z`;
}

export function ChartView({ obj }: { obj: ChartObject }) {
  const { w, h, categories, series, chartType } = obj;
  const fs = Math.max(10, Math.min(18, Math.min(w, h) / 22));
  const pad = fs * 0.8;
  const isPie = chartType === 'pie' || chartType === 'doughnut';
  const titleH = obj.title ? fs * 2 : 0;
  const legendItems = isPie
    ? categories.map((c, i) => ({ label: c, color: sliceColor(obj, i) }))
    : series.map(s => ({ label: s.name, color: s.color }));
  const legendH = obj.showLegend && legendItems.length ? fs * 2 : 0;
  const font = fontStack(obj.fontFamily);
  const text = { fill: obj.color, fontFamily: font, fontSize: fs };

  const top = pad + titleH;
  const bottom = h - pad - legendH;
  const parts: React.ReactNode[] = [];

  if (isPie) {
    const values = (series[0]?.values ?? []).map(v => Math.max(0, v));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const r = Math.max(4, Math.min(w - pad * 2, bottom - top) / 2);
    const cx = w / 2, cy = top + (bottom - top) / 2;
    const inner = chartType === 'doughnut' ? r * 0.55 : 0;
    let a = 0;
    values.forEach((v, i) => {
      const a1 = a + (v / total) * Math.PI * 2;
      if (v > 0) {
        parts.push(<path key={`s${i}`} d={slicePath(cx, cy, r, inner, a, a1)} fill={sliceColor(obj, i)} stroke="#fff" strokeWidth={1} />);
        if (obj.showValues && v / total > 0.04) {
          const mid = (a + a1) / 2, lr = inner ? (r + inner) / 2 : r * 0.65;
          parts.push(<text key={`l${i}`} x={cx + lr * Math.sin(mid)} y={cy - lr * Math.cos(mid)} textAnchor="middle" dominantBaseline="central" {...text} fill="#fff" fontWeight={600}>{Math.round((v / total) * 100)}%</text>);
        }
      }
      a = a1;
    });
  } else {
    const all = series.flatMap(s => s.values);
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all, 1));
    const vMin = ticks[0], vMax = ticks[ticks.length - 1];
    const horizontal = chartType === 'bar';
    const valueLabelW = Math.max(...ticks.map(t => fmt(t).length)) * fs * 0.62 + pad;
    const catLabelW = horizontal ? Math.min(w * 0.3, Math.max(...categories.map(c => c.length), 1) * fs * 0.6 + pad) : 0;
    const left = pad + (horizontal ? catLabelW : valueLabelW);
    const right = w - pad;
    const plotBottom = bottom - (horizontal ? fs * 1.6 : fs * 1.8);
    const plotW = Math.max(1, right - left), plotH = Math.max(1, plotBottom - top);
    const n = Math.max(1, categories.length);
    const scale = (v: number) => (v - vMin) / (vMax - vMin || 1);

    // Grid lines and value axis labels
    ticks.forEach((t, i) => {
      if (horizontal) {
        const x = left + scale(t) * plotW;
        parts.push(<line key={`g${i}`} x1={x} x2={x} y1={top} y2={plotBottom} stroke={obj.color} strokeOpacity={t === 0 ? 0.6 : 0.15} />);
        parts.push(<text key={`t${i}`} x={x} y={plotBottom + fs * 1.2} textAnchor="middle" {...text}>{fmt(t)}</text>);
      } else {
        const y = plotBottom - scale(t) * plotH;
        parts.push(<line key={`g${i}`} x1={left} x2={right} y1={y} y2={y} stroke={obj.color} strokeOpacity={t === 0 ? 0.6 : 0.15} />);
        parts.push(<text key={`t${i}`} x={left - pad / 2} y={y} textAnchor="end" dominantBaseline="central" {...text}>{fmt(t)}</text>);
      }
    });
    // Category labels
    categories.forEach((c, i) => {
      if (horizontal) {
        const y = top + (i + 0.5) * (plotH / n);
        parts.push(<text key={`c${i}`} x={left - pad / 2} y={y} textAnchor="end" dominantBaseline="central" {...text}>{c}</text>);
      } else {
        const x = left + (i + 0.5) * (plotW / n);
        parts.push(<text key={`c${i}`} x={x} y={plotBottom + fs * 1.3} textAnchor="middle" {...text}>{c}</text>);
      }
    });

    const zero = scale(Math.max(vMin, Math.min(vMax, 0)));
    if (chartType === 'column' || chartType === 'bar') {
      const slot = (horizontal ? plotH : plotW) / n;
      const barW = (slot * 0.75) / Math.max(1, series.length);
      series.forEach((s, si) => s.values.forEach((v, ci) => {
        const offset = ci * slot + slot * 0.125 + si * barW;
        const a = scale(v), lo = Math.min(a, zero), len = Math.abs(a - zero);
        if (horizontal) {
          parts.push(<rect key={`b${si}-${ci}`} x={left + lo * plotW} y={top + offset} width={len * plotW} height={barW * 0.92} fill={s.color} />);
          if (obj.showValues) parts.push(<text key={`v${si}-${ci}`} x={left + a * plotW + (v >= 0 ? 4 : -4)} y={top + offset + barW / 2} textAnchor={v >= 0 ? 'start' : 'end'} dominantBaseline="central" {...text} fontSize={fs * 0.85}>{fmt(v)}</text>);
        } else {
          parts.push(<rect key={`b${si}-${ci}`} x={left + offset} y={plotBottom - (lo + len) * plotH} width={barW * 0.92} height={len * plotH} fill={s.color} />);
          if (obj.showValues) parts.push(<text key={`v${si}-${ci}`} x={left + offset + barW * 0.46} y={plotBottom - a * plotH + (v >= 0 ? -4 : fs)} textAnchor="middle" {...text} fontSize={fs * 0.85}>{fmt(v)}</text>);
        }
      }));
    } else {
      series.forEach((s, si) => {
        const pts = s.values.map((v, ci) => [left + (ci + 0.5) * (plotW / n), plotBottom - scale(v) * plotH] as const);
        if (chartType === 'area' && pts.length) {
          const base = plotBottom - zero * plotH;
          parts.push(<polygon key={`a${si}`} points={`${pts[0][0]},${base} ${pts.map(p => p.join(',')).join(' ')} ${pts[pts.length - 1][0]},${base}`} fill={s.color} fillOpacity={0.35} />);
        }
        parts.push(<polyline key={`p${si}`} points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth={Math.max(2, fs / 6)} strokeLinejoin="round" />);
        pts.forEach(([x, y], ci) => {
          parts.push(<circle key={`m${si}-${ci}`} cx={x} cy={y} r={Math.max(2.5, fs / 4)} fill={s.color} />);
          if (obj.showValues) parts.push(<text key={`v${si}-${ci}`} x={x} y={y - fs * 0.6} textAnchor="middle" {...text} fontSize={fs * 0.85}>{fmt(s.values[ci])}</text>);
        });
      });
    }
  }

  // Legend: centered row of swatches
  if (legendH) {
    const sw = fs * 0.8, gap = fs * 1.2;
    const widths = legendItems.map(it => sw + 6 + it.label.length * fs * 0.58);
    let x = (w - (widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1))) / 2;
    const y = h - pad - legendH / 2;
    legendItems.forEach((it, i) => {
      parts.push(<rect key={`lg${i}`} x={x} y={y - sw / 2} width={sw} height={sw} fill={it.color} />);
      parts.push(<text key={`lt${i}`} x={x + sw + 6} y={y} dominantBaseline="central" {...text}>{it.label}</text>);
      x += widths[i] + gap;
    });
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }} role="img" aria-label={obj.title || 'Chart'}>
      {obj.title && <text x={w / 2} y={pad + fs * 0.8} textAnchor="middle" {...text} fontSize={fs * 1.25} fontWeight={600}>{obj.title}</text>}
      {parts}
    </svg>
  );
}
