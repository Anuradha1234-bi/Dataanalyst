import React, { useState, useRef } from 'react';
import {
  BarChart3,
  TrendingUp,
  Activity,
  Grid,
  PieChart as PieIcon,
  Disc,
  BarChart2,
  Download,
} from 'lucide-react';

import {
  CHART_PALETTE,
  CHART_SERIES,
  getChartColor,
  getChartColorRgba,
} from '../utils/chartPalette';

// Backward compatibility alias: references the independent 6-color chart palette
const PALETTE = CHART_PALETTE;

/**
 * Universal SVG to PNG Exporter for download
 */
export const exportSvgToPng = (svgElement, filename = 'chart') => {
  if (!svgElement) return;
  try {
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgElement);

    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2; // High-DPI export
      const width = (svgElement.clientWidth || 800) * scale;
      const height = (svgElement.clientHeight || 450) * scale;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      const isDark =
        document.documentElement.classList.contains('dark') ||
        document.documentElement.getAttribute('data-theme') === 'dark';
      ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
      ctx.fillRect(0, 0, width, height);

      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `${filename}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    };

    img.src = url;
  } catch (err) {
    console.error('PNG export failed:', err);
  }
};

export const AnalyticalChart = ({
  chartData,
  emptyMessage,
  showExport = false,
  downloadFilename = 'chart',
  headless = false,
  height = 240,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [activeTypeOverride, setActiveTypeOverride] = useState(null);
  const svgRef = useRef(null);

  if (!chartData || chartData.recommended === false) {
    if (emptyMessage) {
      return (
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-6 text-center text-xs text-[var(--text-secondary)] shadow-xs">
          {emptyMessage}
        </div>
      );
    }
    return null;
  }

  const effectiveType = (
    activeTypeOverride ||
    chartData.chart_type ||
    'bar'
  ).toLowerCase();

  const title = chartData.title;
  const x_axis = chartData.x_axis || chartData.x_axis_label;
  const y_axis = chartData.y_axis || chartData.y_axis_label;
  const data_points = chartData.data_points;
  const trendline = chartData.trendline;
  const matrix = chartData.matrix;
  const categories = chartData.categories;

  const handleExportClick = () => {
    if (svgRef.current) {
      exportSvgToPng(svgRef.current, downloadFilename);
    }
  };

  // 1. Correlation Heatmap View
  if (effectiveType === 'heatmap' && matrix && categories && categories.length > 0) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-5 shadow-xs space-y-3 transition-colors duration-200">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <div className="flex items-center gap-2">
            <Grid className="w-4 h-4 text-blue-500" />
            <h4 className="text-xs font-bold text-[var(--text-primary)]">
              {title || 'Correlation Matrix Heatmap'}
            </h4>
          </div>
          <span className="font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[10px]">
            HEATMAP
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-center border-collapse">
            <thead>
              <tr>
                <th className="p-2 border border-[var(--border-color)] bg-[var(--card-bg-subtle)] text-left font-semibold text-[var(--text-primary)]">
                  Feature
                </th>
                {categories.map((c, i) => (
                  <th
                    key={i}
                    className="p-2 border border-[var(--border-color)] bg-[var(--card-bg-subtle)] font-semibold text-[var(--text-primary)] truncate max-w-[100px]"
                    title={c}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((rowCat, rIdx) => (
                <tr key={rIdx}>
                  <td
                    className="p-2 border border-[var(--border-color)] bg-[var(--card-bg-subtle)] text-left font-semibold text-[var(--text-primary)] truncate max-w-[120px]"
                    title={rowCat}
                  >
                    {rowCat}
                  </td>
                  {matrix[rIdx]?.map((val, cIdx) => {
                    const isSelf = rIdx === cIdx;
                    const r = val !== null && val !== undefined ? val : 0;
                    let bg = 'transparent';
                    if (isSelf) {
                      bg = 'rgba(148, 163, 184, 0.15)';
                    } else if (r > 0) {
                      const alpha = Math.min(Math.abs(r), 1);
                      bg = `rgba(37, 99, 235, ${alpha * 0.45})`;
                    } else if (r < 0) {
                      const alpha = Math.min(Math.abs(r), 1);
                      bg = `rgba(239, 68, 68, ${alpha * 0.45})`;
                    }

                    return (
                      <td
                        key={cIdx}
                        className="p-2 border border-[var(--border-color)] font-mono text-[11px] font-medium transition-colors hover:brightness-110"
                        style={{ backgroundColor: bg }}
                        title={`${rowCat} ↔ ${categories[cIdx]}: r = ${r}`}
                      >
                        {val !== null && val !== undefined ? val.toFixed(2) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 1.5 Box Plot View (Five-number summary + Outliers)
  if (effectiveType === 'boxplot') {
    const boxes = chartData.boxplot_data || [];
    if (boxes.length === 0) {
      return (
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-6 text-center text-xs text-[var(--text-secondary)] shadow-xs">
          {emptyMessage || 'No sufficient numeric data (at least 4 non-null numeric values per category required) to compute box plot quartiles.'}
        </div>
      );
    }

    const allValues = boxes.flatMap((b) => [
      b.min_val,
      b.q1,
      b.median,
      b.q3,
      b.max_val,
      ...(b.outliers || []),
    ]).filter((v) => typeof v === 'number' && !isNaN(v));

    const yMinRaw = Math.min(...allValues);
    const yMaxRaw = Math.max(...allValues);
    const spread = (yMaxRaw - yMinRaw) || 1;
    const yMin = yMinRaw - spread * 0.08;
    const yMax = yMaxRaw + spread * 0.08;
    const yRange = yMax - yMin || 1;

    const svgWidth = 640;
    const svgHeight = 320;
    const padding = { top: 30, right: 30, bottom: 50, left: 60 };
    const chartWidth = svgWidth - padding.left - padding.right;
    const chartHeight = svgHeight - padding.top - padding.bottom;

    const getYPos = (val) =>
      padding.top + chartHeight - ((val - yMin) / yRange) * chartHeight;

    const numTicks = 5;
    const yTicks = Array.from({ length: numTicks + 1 }, (_, i) => {
      const val = yMin + (i / numTicks) * yRange;
      return { val, y: getYPos(val) };
    });

    const formatNumberLocal = (num) => {
      if (num === null || num === undefined || isNaN(num)) return '—';
      if (Math.abs(num) >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
      if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1)}k`;
      return Number.isInteger(num) ? String(num) : num.toFixed(2);
    };

    return (
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-5 shadow-xs space-y-4 transition-colors duration-200">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <div>
              <h4 className="text-xs font-bold text-[var(--text-primary)]">
                {title || 'Box Plot Quartile Distribution'}
              </h4>
              <p className="text-[10px] text-[var(--text-secondary)]">
                Five-number summary: Min, Q1 (25%), Median, Q3 (75%), Max, and Outliers
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 text-[10px]">
              BOX PLOT
            </span>
            {showExport && (
              <button
                onClick={handleExportClick}
                className="p-1 rounded-lg border border-[var(--border-color)] hover:bg-[var(--card-bg-subtle)] text-[var(--text-secondary)] transition-colors"
                title="Download PNG"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="relative overflow-x-auto">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto max-h-[380px] select-none"
          >
            {/* Grid lines and Y axis ticks */}
            {yTicks.map((tick, i) => (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={tick.y}
                  x2={svgWidth - padding.right}
                  y2={tick.y}
                  stroke="var(--chart-grid)"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 8}
                  y={tick.y + 3}
                  textAnchor="end"
                  fill="var(--chart-axis)"
                  className="text-[9px] font-mono"
                >
                  {formatNumberLocal(tick.val)}
                </text>
              </g>
            ))}

            {/* Render Boxplots */}
            {boxes.map((b, idx) => {
              const colWidth = chartWidth / boxes.length;
              const boxCenter = padding.left + (idx + 0.5) * colWidth;
              const boxWidth = Math.min(50, colWidth * 0.5);

              const yMaxP = getYPos(b.max_val);
              const yQ3P = getYPos(b.q3);
              const yMedP = getYPos(b.median);
              const yQ1P = getYPos(b.q1);
              const yMinP = getYPos(b.min_val);

              const isHovered = hoveredPoint === idx;

              return (
                <g
                  key={idx}
                  onMouseEnter={() => setHoveredPoint(idx)}
                  onMouseLeave={() => setHoveredPoint(null)}
                  className="cursor-pointer"
                >
                  {/* Whisker from Q3 to Max */}
                  <line
                    x1={boxCenter}
                    y1={yQ3P}
                    x2={boxCenter}
                    y2={yMaxP}
                    stroke="#8B7CE8"
                    strokeWidth="1.5"
                  />
                  {/* Top whisker cap */}
                  <line
                    x1={boxCenter - boxWidth * 0.25}
                    y1={yMaxP}
                    x2={boxCenter + boxWidth * 0.25}
                    y2={yMaxP}
                    stroke="#8B7CE8"
                    strokeWidth="1.5"
                  />

                  {/* Whisker from Q1 to Min */}
                  <line
                    x1={boxCenter}
                    y1={yQ1P}
                    x2={boxCenter}
                    y2={yMinP}
                    stroke="#8B7CE8"
                    strokeWidth="1.5"
                  />
                  {/* Bottom whisker cap */}
                  <line
                    x1={boxCenter - boxWidth * 0.25}
                    y1={yMinP}
                    x2={boxCenter + boxWidth * 0.25}
                    y2={yMinP}
                    stroke="#8B7CE8"
                    strokeWidth="1.5"
                  />

                  {/* IQR Box (Q1 to Q3) */}
                  <rect
                    x={boxCenter - boxWidth / 2}
                    y={Math.min(yQ3P, yQ1P)}
                    width={boxWidth}
                    height={Math.max(2, Math.abs(yQ1P - yQ3P))}
                    rx={3}
                    fill={isHovered ? 'rgba(139, 124, 232, 0.4)' : 'rgba(139, 124, 232, 0.2)'}
                    stroke={isHovered ? '#6366F1' : '#8B7CE8'}
                    strokeWidth="2"
                    className="transition-colors duration-150"
                  />

                  {/* Median Line */}
                  <line
                    x1={boxCenter - boxWidth / 2}
                    y1={yMedP}
                    x2={boxCenter + boxWidth / 2}
                    y2={yMedP}
                    stroke="#4338CA"
                    strokeWidth="2.5"
                  />

                  {/* Outlier Dots */}
                  {(b.outliers || []).map((outVal, oIdx) => (
                    <circle
                      key={oIdx}
                      cx={boxCenter}
                      cy={getYPos(outVal)}
                      r={3}
                      fill="#EF4444"
                      stroke="#B91C1C"
                      strokeWidth="1"
                    />
                  ))}

                  {/* Category label */}
                  <text
                    x={boxCenter}
                    y={padding.top + chartHeight + 16}
                    textAnchor="middle"
                    className="text-[9px] fill-slate-600 dark:fill-slate-400 font-medium"
                  >
                    {b.category && b.category.length > 10
                      ? b.category.slice(0, 9) + '…'
                      : b.category}
                  </text>
                </g>
              );
            })}

            {/* Axis labels */}
            {x_axis && (
              <text
                x={svgWidth / 2}
                y={svgHeight - 4}
                textAnchor="middle"
                className="text-[10px] fill-slate-500 dark:fill-slate-400 font-medium"
              >
                {x_axis}
              </text>
            )}
            {y_axis && (
              <text
                x={12}
                y={svgHeight / 2}
                textAnchor="middle"
                transform={`rotate(-90 12 ${svgHeight / 2})`}
                className="text-[10px] fill-slate-500 dark:fill-slate-400 font-medium"
              >
                {y_axis}
              </text>
            )}
          </svg>

          {/* Hover Tooltip Overlay for Box Plot */}
          {hoveredPoint !== null && boxes[hoveredPoint] && (
            <div className="absolute top-2 right-4 bg-[var(--chart-tooltip-bg)] text-[var(--chart-tooltip-text)] border border-[var(--chart-tooltip-border)] px-3.5 py-2 rounded-xl text-xs shadow-xl backdrop-blur-xs pointer-events-none z-10 space-y-1 font-mono">
              <div className="font-bold border-b border-[var(--chart-tooltip-border)] pb-1 font-sans opacity-95">
                {boxes[hoveredPoint].category}
              </div>
              <div className="text-[11px] grid grid-cols-2 gap-x-3 gap-y-0.5">
                <span className="text-slate-400">Max:</span>
                <span className="text-right text-emerald-400 font-bold">{boxes[hoveredPoint].max_val}</span>
                <span className="text-slate-400">Q3 (75%):</span>
                <span className="text-right text-blue-300">{boxes[hoveredPoint].q3}</span>
                <span className="text-slate-400">Median:</span>
                <span className="text-right text-amber-300 font-bold">{boxes[hoveredPoint].median}</span>
                <span className="text-slate-400">Q1 (25%):</span>
                <span className="text-right text-blue-300">{boxes[hoveredPoint].q1}</span>
                <span className="text-slate-400">Min:</span>
                <span className="text-right text-emerald-400 font-bold">{boxes[hoveredPoint].min_val}</span>
                {boxes[hoveredPoint].outliers?.length > 0 && (
                  <>
                    <span className="text-red-400">Outliers:</span>
                    <span className="text-right text-red-400 font-bold">
                      {boxes[hoveredPoint].outliers.length} detected
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Filter valid numeric data points
  const validPoints = (data_points || []).filter(
    (p) => p && typeof p.value === 'number' && !isNaN(p.value)
  );

  if (validPoints.length === 0) {
    if (emptyMessage) {
      return (
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-6 text-center text-xs text-[var(--text-secondary)] shadow-xs">
          {emptyMessage}
        </div>
      );
    }
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-6 text-center text-xs text-[var(--text-secondary)] shadow-xs">
        No numeric records available to plot for the current column selection.
      </div>
    );
  }

  const formatNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '—';
    if (Math.abs(num) >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return Number.isInteger(num) ? String(num) : num.toFixed(2);
  };

  // 2. PIE & DONUT CHART RENDERING
  if (effectiveType === 'pie' || effectiveType === 'donut') {
    const isDonut = effectiveType === 'donut';
    const total =
      validPoints.reduce((acc, p) => acc + (p.value > 0 ? p.value : 0), 0) || 1;
    const radius = 95;
    const innerRadius = isDonut ? 52 : 0;
    const cx = 140;
    const cy = 120;

    let currentAngle = -Math.PI / 2; // Start from top 12 o'clock
    const slices = validPoints.map((pt, idx) => {
      const val = pt.value > 0 ? pt.value : 0;
      const sliceAngle = (val / total) * 2 * Math.PI;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sliceAngle;
      currentAngle = endAngle;

      const x1 = cx + radius * Math.cos(startAngle);
      const y1 = cy + radius * Math.sin(startAngle);
      const x2 = cx + radius * Math.cos(endAngle);
      const y2 = cy + radius * Math.sin(endAngle);

      const x1_in = cx + innerRadius * Math.cos(startAngle);
      const y1_in = cy + innerRadius * Math.sin(startAngle);
      const x2_in = cx + innerRadius * Math.cos(endAngle);
      const y2_in = cy + innerRadius * Math.sin(endAngle);

      const largeArc = sliceAngle > Math.PI ? 1 : 0;
      let path = '';
      if (isDonut) {
        path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${x2_in} ${y2_in} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1_in} ${y1_in} Z`;
      } else {
        path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      }

      const pct = ((val / total) * 100).toFixed(1);
      const color = pt.color || PALETTE[idx % PALETTE.length];
      return { ...pt, path, pct, color, idx };
    });

    return (
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-5 shadow-xs space-y-4 transition-colors duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <div className="flex items-center gap-2">
            {isDonut ? (
              <Disc className="w-4 h-4 text-blue-500" />
            ) : (
              <PieIcon className="w-4 h-4 text-blue-500" />
            )}
            <h4 className="text-xs font-bold text-[var(--text-primary)]">
              {title || (isDonut ? 'Donut Chart' : 'Pie Chart')}
            </h4>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[10px]">
              {isDonut ? 'DONUT' : 'PIE'}
            </span>
            {showExport && (
              <button
                onClick={handleExportClick}
                className="p-1 text-slate-500 hover:text-blue-600 rounded transition-colors cursor-pointer"
                title="Download chart as PNG"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col md:flex-row items-center justify-around gap-6 pt-2">
          <div className="relative">
            <svg
              ref={svgRef}
              viewBox="0 0 280 240"
              className="w-56 h-56 select-none"
            >
              {slices.map((slice) => {
                const isHovered = hoveredPoint === slice.idx;
                return (
                  <path
                    key={slice.idx}
                    d={slice.path}
                    fill={slice.color}
                    stroke="currentColor"
                    className="text-white dark:text-slate-900 transition-all duration-200 cursor-pointer"
                    style={{
                      opacity: hoveredPoint === null || isHovered ? 1 : 0.5,
                      filter: isHovered ? 'brightness(1.15)' : 'none',
                    }}
                    strokeWidth="2"
                    onMouseEnter={() => setHoveredPoint(slice.idx)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                );
              })}
              {isDonut && (
                <g className="pointer-events-none">
                  <text
                    x={cx}
                    y={cy - 2}
                    textAnchor="middle"
                    className="text-sm font-bold fill-slate-800 dark:fill-slate-100 font-mono"
                  >
                    {formatNumber(total)}
                  </text>
                  <text
                    x={cx}
                    y={cy + 14}
                    textAnchor="middle"
                    className="text-[10px] fill-slate-400 font-medium"
                  >
                    Total
                  </text>
                </g>
              )}
            </svg>

            {/* Hover Tooltip */}
            {hoveredPoint !== null && validPoints[hoveredPoint] && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-2.5 py-1 rounded text-[11px] shadow-md pointer-events-none z-10 whitespace-nowrap">
                <strong>{validPoints[hoveredPoint].label}</strong>:{' '}
                {formatNumber(validPoints[hoveredPoint].value)} (
                {((validPoints[hoveredPoint].value / total) * 100).toFixed(1)}%)
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-2 w-full md:w-56 text-xs">
            {slices.map((s) => (
              <div
                key={s.idx}
                onMouseEnter={() => setHoveredPoint(s.idx)}
                onMouseLeave={() => setHoveredPoint(null)}
                className={`flex items-center gap-2 p-1 rounded-lg transition-colors cursor-pointer ${
                  hoveredPoint === s.idx
                    ? 'bg-blue-50 dark:bg-blue-950/40 font-semibold'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate max-w-[120px]">{s.label}</span>
                <span className="text-slate-400 font-mono text-[11px] ml-auto">
                  {s.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // 3. CARTESIAN CHARTS: BAR, LINE, HISTOGRAM, SCATTER
  const isLine = effectiveType === 'line';
  const isBar = effectiveType === 'bar' || effectiveType === 'histogram';
  const isScatter = effectiveType === 'scatter';

  const values = validPoints.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const ySpread = maxVal - minVal || 1;
  const safeMin = isScatter
    ? (minVal < 0 ? minVal - ySpread * 0.05 : Math.max(0, minVal - ySpread * 0.05))
    : (minVal < 0 ? minVal : 0);
  const safeMax = isScatter
    ? maxVal + ySpread * 0.05
    : (maxVal === minVal ? (maxVal > 0 ? maxVal * 1.2 : 10) : maxVal);
  const range = safeMax - safeMin || 1;

  // Continuous X-axis scale for Scatter plots
  const xValues = isScatter ? validPoints.map((p) => (typeof p.x === 'number' ? p.x : 0)) : [];
  const minX = isScatter && xValues.length > 0 ? Math.min(...xValues) : 0;
  const maxX = isScatter && xValues.length > 0 ? Math.max(...xValues) : 1;
  const xSpread = maxX - minX || 1;
  const safeMinX = minX < 0 ? minX - xSpread * 0.05 : Math.max(0, minX - xSpread * 0.05);
  const safeMaxX = maxX + xSpread * 0.05;
  const xRange = safeMaxX - safeMinX || 1;

  // Sizing tailored for crisp rendering without clipping
  const svgWidth = isLine || isScatter ? 720 : 560;
  const svgHeight = height || 250;
  const padding = isLine || isScatter
    ? { top: 20, right: 30, bottom: 45, left: 58 }
    : { top: 20, right: 20, bottom: validPoints.length > 5 ? 56 : 45, left: 54 };

  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  const getYPos = (val) => {
    const ratio = (val - safeMin) / range;
    return padding.top + chartHeight - ratio * chartHeight;
  };

  const getXPos = (idx) => {
    if (validPoints.length <= 1) return padding.left + chartWidth / 2;
    return padding.left + (idx / (validPoints.length - 1)) * chartWidth;
  };

  const getScatterXPos = (xVal) =>
    padding.left + ((xVal - safeMinX) / xRange) * chartWidth;

  // Human-readable axis date/label formatter
  const formatAxisLabel = (label) => {
    if (label === null || label === undefined) return '';
    const str = String(label).trim();

    // Check if ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH...)
    if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(str)) {
      const parts = str.split(/[-/T ]/);
      if (parts.length >= 3) {
        const monthNum = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        if (monthNum >= 0 && monthNum < 12 && !isNaN(day)) {
          return `${months[monthNum]} ${day}`;
        }
      }
    }

    if (str.length > 12) {
      return str.slice(0, 10) + '…';
    }
    return str;
  };

  // Determine if bar labels should angle to avoid colliding
  const shouldRotateBarLabels = isBar && (validPoints.length >= 5 || validPoints.some((p) => p.label && p.label.length > 6));

  const chartBody = (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-auto select-none"
        style={{ maxHeight: `${svgHeight + 20}px` }}
      >
        <defs>
          {/* Subtle line area gradient */}
          <linearGradient id="lineAreaGradientSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.0" />
          </linearGradient>
          <filter id="lineGlowSky" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#38BDF8" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* Horizontal Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
          const y = padding.top + chartHeight * (1 - pct);
          const val = safeMin + range * pct;
          return (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={y}
                x2={svgWidth - padding.right}
                y2={y}
                stroke="var(--chart-grid, #E2E8F0)"
                strokeWidth="1"
                strokeDasharray={idx === 0 ? '0' : '4 4'}
              />
              <text
                x={padding.left - 8}
                y={y + 3.5}
                textAnchor="end"
                fill="var(--chart-axis, #64748B)"
                className="text-[10px] font-mono select-none"
              >
                {formatNumber(val)}
              </text>
            </g>
          );
        })}

        {/* Hover Crosshair Guide Line (for line chart) */}
        {isLine && hoveredPoint !== null && (
          <line
            x1={getXPos(hoveredPoint)}
            y1={padding.top}
            x2={getXPos(hoveredPoint)}
            y2={padding.top + chartHeight}
            stroke="var(--chart-axis, #94A3B8)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.6"
          />
        )}

        {/* BAR & HISTOGRAM RENDERING */}
        {isBar &&
          (() => {
            const isHist = effectiveType === 'histogram';
            const slotWidth = chartWidth / validPoints.length;
            const barWidth = isHist
              ? Math.max(4, slotWidth - 2)
              : Math.max(14, Math.min(slotWidth * 0.55, 42));

            return validPoints.map((pt, idx) => {
              const x = isHist
                ? padding.left + idx * slotWidth + 1
                : padding.left + idx * slotWidth + (slotWidth - barWidth) / 2;
              const y = getYPos(pt.value);
              const height = padding.top + chartHeight - y;
              const isHovered = hoveredPoint === idx;
              const barFill = pt.color || CHART_PALETTE[idx % CHART_PALETTE.length];
              const displayLabel = formatAxisLabel(pt.label);

              const labelX = x + barWidth / 2;
              const labelY = padding.top + chartHeight + 14;

              return (
                <g
                  key={idx}
                  onMouseEnter={() => setHoveredPoint(idx)}
                  onMouseLeave={() => setHoveredPoint(null)}
                  className="cursor-pointer"
                >
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(2, height)}
                    rx={5}
                    ry={5}
                    fill={barFill}
                    className="transition-all duration-200"
                    style={{
                      opacity: hoveredPoint === null || isHovered ? 1 : 0.65,
                      filter: isHovered ? 'brightness(1.18)' : 'none',
                    }}
                  />
                  {/* Category Label */}
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor={shouldRotateBarLabels ? 'end' : 'middle'}
                    transform={
                      shouldRotateBarLabels
                        ? `rotate(-28, ${labelX}, ${labelY})`
                        : undefined
                    }
                    fill="var(--chart-axis, #64748B)"
                    className="text-[10px] font-medium select-none"
                  >
                    {displayLabel}
                  </text>
                </g>
              );
            });
          })()}

        {/* LINE CHART RENDERING */}
        {isLine &&
          (() => {
            const pointsCoords = validPoints.map(
              (pt, idx) => `${getXPos(idx)},${getYPos(pt.value)}`
            );
            const polylinePoints = pointsCoords.join(' ');
            const areaPoints = `${getXPos(0)},${padding.top + chartHeight} ${polylinePoints} ${getXPos(validPoints.length - 1)},${padding.top + chartHeight}`;

            return (
              <g>
                <polygon points={areaPoints} fill="url(#lineAreaGradientSky)" />
                <polyline
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylinePoints}
                  filter="url(#lineGlowSky)"
                />
                {validPoints.map((pt, idx) => {
                  const cx = getXPos(idx);
                  const cy = getYPos(pt.value);
                  const isHovered = hoveredPoint === idx;
                  const displayLabel = formatAxisLabel(pt.label);

                  return (
                    <g
                      key={idx}
                      onMouseEnter={() => setHoveredPoint(idx)}
                      onMouseLeave={() => setHoveredPoint(null)}
                      className="cursor-pointer"
                    >
                      {isHovered && (
                        <circle cx={cx} cy={cy} r={10} fill="rgba(56, 189, 248, 0.22)" />
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 6 : 4}
                        fill="#38BDF8"
                        stroke="#FFFFFF"
                        strokeWidth="2"
                        className="transition-all duration-150"
                      />
                      {(idx === 0 ||
                        idx === validPoints.length - 1 ||
                        validPoints.length <= 10 ||
                        idx % Math.ceil(validPoints.length / 7) === 0 ||
                        isHovered) && (
                        <text
                          x={cx}
                          y={padding.top + chartHeight + 16}
                          textAnchor="middle"
                          fill={isHovered ? "var(--text-primary, #0F172A)" : "var(--chart-axis, #64748B)"}
                          className={`text-[10px] select-none ${isHovered ? 'font-bold' : 'font-medium'}`}
                        >
                          {displayLabel}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })()}

        {/* SCATTER PLOT RENDERING */}
        {isScatter &&
          (() => {
            return (
              <g>
                {/* Continuous X-axis ticks */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                  const x = padding.left + chartWidth * pct;
                  const val = safeMinX + xRange * pct;
                  return (
                    <g key={idx}>
                      <line
                        x1={x}
                        y1={padding.top + chartHeight}
                        x2={x}
                        y2={padding.top + chartHeight + 4}
                        stroke="var(--chart-axis, #94A3B8)"
                        strokeWidth="1"
                      />
                      <text
                        x={x}
                        y={padding.top + chartHeight + 16}
                        textAnchor="middle"
                        fill="var(--chart-axis, #64748B)"
                        className="text-[10px] font-mono select-none"
                      >
                        {formatNumber(val)}
                      </text>
                    </g>
                  );
                })}

                {/* Regression Trendline */}
                {Array.isArray(trendline) && trendline.length >= 2 && (
                  <line
                    x1={getScatterXPos(trendline[0].x)}
                    y1={getYPos(trendline[0].y)}
                    x2={getScatterXPos(trendline[1].x)}
                    y2={getYPos(trendline[1].y)}
                    stroke="#EF4444"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    strokeLinecap="round"
                  />
                )}

                {/* Scatter Points */}
                {validPoints.map((pt, idx) => {
                  const cx = getScatterXPos(pt.x !== undefined ? pt.x : idx);
                  const cy = getYPos(pt.value);
                  const isHovered = hoveredPoint === idx;

                  return (
                    <g
                      key={idx}
                      onMouseEnter={() => setHoveredPoint(idx)}
                      onMouseLeave={() => setHoveredPoint(null)}
                      className="cursor-pointer"
                    >
                      {isHovered && (
                        <circle cx={cx} cy={cy} r={10} fill="rgba(16, 185, 129, 0.25)" />
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 6 : 4}
                        fill="#059669"
                        stroke="#FFFFFF"
                        strokeWidth="1.5"
                        className="transition-all duration-150"
                      />
                    </g>
                  );
                })}
              </g>
            );
          })()}

        {/* Axis Titles if provided */}
        {x_axis && (
          <text
            x={svgWidth / 2}
            y={svgHeight - 4}
            textAnchor="middle"
            fill="var(--chart-axis, #64748B)"
            className="text-[10px] font-semibold"
          >
            {x_axis}
          </text>
        )}
        {y_axis && (
          <text
            x={14}
            y={svgHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${svgHeight / 2})`}
            fill="var(--chart-axis, #64748B)"
            className="text-[10px] font-semibold"
          >
            {y_axis}
          </text>
        )}
      </svg>

      {/* Floating Hover Tooltip Overlay */}
      {hoveredPoint !== null && validPoints[hoveredPoint] && (
        <div className="absolute top-2 right-4 bg-slate-900/95 dark:bg-slate-800/95 text-white border border-slate-700/80 px-3.5 py-2 rounded-xl text-xs shadow-xl backdrop-blur-md pointer-events-none z-20 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{
                backgroundColor: isScatter
                  ? '#059669'
                  : isBar
                  ? validPoints[hoveredPoint].color || CHART_PALETTE[hoveredPoint % CHART_PALETTE.length]
                  : '#38BDF8',
              }}
            />
            <span className="font-semibold text-white">
              {isScatter
                ? `Observation #${hoveredPoint + 1}`
                : validPoints[hoveredPoint].label || `Item ${hoveredPoint + 1}`}
            </span>
          </div>
          {isScatter ? (
            <div className="text-[11px] font-mono text-slate-300 space-y-0.5">
              <div>
                {x_axis || 'X'}:{' '}
                <span className="text-emerald-400 font-bold">
                  {validPoints[hoveredPoint].x !== undefined
                    ? validPoints[hoveredPoint].x
                    : validPoints[hoveredPoint].label}
                </span>
              </div>
              <div>
                {y_axis || 'Y'}:{' '}
                <span className="text-white font-bold">
                  {validPoints[hoveredPoint].value?.toLocaleString()}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-[11px] font-mono text-slate-300">
              Value:{' '}
              <span className="text-white font-bold">
                {validPoints[hoveredPoint].value?.toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (headless) {
    return chartBody;
  }

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-5 shadow-xs space-y-3 transition-colors duration-200">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
        <div className="flex items-center gap-2">
          {effectiveType === 'line' ? (
            <TrendingUp className="w-4 h-4 text-sky-500" />
          ) : effectiveType === 'scatter' ? (
            <Activity className="w-4 h-4 text-emerald-500" />
          ) : (
            <BarChart3 className="w-4 h-4 text-emerald-500" />
          )}
          <h4 className="text-xs font-bold text-[var(--text-primary)]">
            {title || 'Analytical Visualization'}
          </h4>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px]">
            {effectiveType}
          </span>
          {showExport && (
            <button
              onClick={handleExportClick}
              className="p-1 text-slate-500 hover:text-emerald-600 rounded transition-colors cursor-pointer"
              title="Download chart as PNG"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {chartBody}
    </div>
  );
};

export default AnalyticalChart;
