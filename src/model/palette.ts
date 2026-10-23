import { contrastText, mixColors } from './color';

/** IBM Carbon categorical palette, used for chart series */
export const CHART_PALETTE = ['#6929c4', '#1192e8', '#005d5d', '#9f1853', '#fa4d56', '#570408', '#198038', '#002d9c', '#ee538b', '#b28600'];

export function seriesColor(index: number, accent?: string): string {
  if (index === 0 && accent) return accent;
  return CHART_PALETTE[(index - (accent ? 1 : 0) + CHART_PALETTE.length) % CHART_PALETTE.length];
}

/** Color of slice `i` in a pie or doughnut chart */
export function sliceColor(chart: { pointColors?: string[]; series: { color: string }[] }, i: number): string {
  return chart.pointColors?.[i] ?? seriesColor(i, chart.series[0]?.color);
}

/** Table colors derived from a theme accent and slide background */
export function tableColors(accent: string, bg: string) {
  return { headerFill: accent, headerColor: contrastText(accent), bandFill: mixColors(bg, accent, 0.12) };
}
