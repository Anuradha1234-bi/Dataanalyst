/**
 * Centralised Independent Chart Colour Palette
 * 
 * Strict Requirement:
 * These 6 series colours are completely independent of UI theme colours (Dark/Light).
 * They do NOT inherit or switch to emerald, grey, or white when the UI theme changes.
 */

export const CHART_PALETTE = [
  '#A78BFA', // Chart 1 — Purple
  '#38BDF8', // Chart 2 — Sky Blue
  '#FB7185', // Chart 3 — Coral Pink
  '#FBBF24', // Chart 4 — Amber
  '#2DD4BF', // Chart 5 — Teal
  '#F97316', // Chart 6 — Orange
];

export const CHART_SERIES = {
  purple: '#A78BFA',
  skyBlue: '#38BDF8',
  coralPink: '#FB7185',
  amber: '#FBBF24',
  teal: '#2DD4BF',
  orange: '#F97316',
};

/**
 * Returns a consistent chart color by index.
 */
export const getChartColor = (index = 0) => {
  return CHART_PALETTE[Math.abs(index) % CHART_PALETTE.length];
};

/**
 * Returns an RGBA string for a chart series color at index with given alpha.
 */
export const getChartColorRgba = (index = 0, alpha = 0.25) => {
  const hex = getChartColor(index);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default CHART_PALETTE;
