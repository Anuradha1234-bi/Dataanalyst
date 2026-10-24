import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  PieChart as PieIcon,
  Disc,
  BarChart2,
  Activity,
  Grid,
  Download,
  RefreshCw,
  Sliders,
  Filter,
  Table as TableIcon,
  Database,
  Hash,
  Columns,
  Layers,
  AlertCircle,
  CheckCircle2,
  Info,
  Calendar,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { datasetService } from '../services/datasetService';
import { analyticsService } from '../services/analyticsService';
import { extractErrorMessage } from '../services/api';
import { AnalyticalChart, exportSvgToPng } from '../components/AnalyticalChart';

const CHART_TYPES = [
  { id: 'bar', label: 'Bar Chart', icon: BarChart3, desc: 'Compare categories and metrics' },
  { id: 'line', label: 'Line Chart', icon: TrendingUp, desc: 'Track trends over time or sequence' },
  { id: 'pie', label: 'Pie Chart', icon: PieIcon, desc: 'Inspect proportional distribution' },
  { id: 'donut', label: 'Donut Chart', icon: Disc, desc: 'Category breakdown with center metric' },
  { id: 'histogram', label: 'Histogram', icon: BarChart2, desc: 'Analyze numeric frequency distribution' },
  { id: 'scatter', label: 'Scatter Plot', icon: Activity, desc: 'Correlate two continuous variables' },
  { id: 'boxplot', label: 'Box Plot', icon: Layers, desc: 'Quartiles, distributions & outliers' },
  { id: 'heatmap', label: 'Correlation Heatmap', icon: Grid, desc: 'Matrix of feature correlations' },
];

const AGGREGATIONS = [
  { id: 'sum', label: 'Sum (Total)' },
  { id: 'mean', label: 'Average (Mean)' },
  { id: 'count', label: 'Count (Frequency)' },
  { id: 'min', label: 'Minimum' },
  { id: 'max', label: 'Maximum' },
];

export const VisualizationPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const chartContainerRef = useRef(null);

  // Datasets list & selection
  const [datasets, setDatasets] = useState([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);

  // Dataset overview metadata
  const [overview, setOverview] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState('');

  // Chart configuration state
  const [chartType, setChartType] = useState('bar');
  const [xColumn, setXColumn] = useState('');
  const [yColumn, setYColumn] = useState('');
  const [aggregation, setAggregation] = useState('sum');
  const [limit, setLimit] = useState(10);
  const [bins, setBins] = useState(10);
  const [sortDirection, setSortDirection] = useState('desc');

  // Chart response state
  const [chartResponse, setChartResponse] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartError, setChartError] = useState('');

  // Active view tab: 'chart' or 'table'
  const [activeTab, setActiveTab] = useState('chart');

  // 1. Initial Load: Fetch all datasets for dropdown switcher and determine active dataset
  useEffect(() => {
    const fetchDatasets = async () => {
      setLoadingDatasets(true);
      try {
        const list = await datasetService.getDatasets();
        const validList = list || [];
        setDatasets(validList);

        const paramId = searchParams.get('dataset_id') || searchParams.get('id');
        const savedId = localStorage.getItem('selected_dataset_id');

        if (paramId && validList.some((d) => d.id === parseInt(paramId, 10))) {
          setSelectedDatasetId(parseInt(paramId, 10));
        } else if (savedId && validList.some((d) => d.id === parseInt(savedId, 10))) {
          setSelectedDatasetId(parseInt(savedId, 10));
        } else if (validList.length > 0) {
          setSelectedDatasetId(validList[0].id);
        }
      } catch (err) {
        setOverviewError(extractErrorMessage(err));
      } finally {
        setLoadingDatasets(false);
      }
    };
    fetchDatasets();
  }, [searchParams]);

  // Synchronize URL and localStorage when selectedDatasetId changes
  const handleDatasetChange = (newId) => {
    const numId = parseInt(newId, 10);
    setSelectedDatasetId(numId);
    setSearchParams({ dataset_id: numId }, { replace: true });
    localStorage.setItem('selected_dataset_id', String(numId));
  };

  const selectedDataset = useMemo(() => {
    return datasets.find((d) => d.id === selectedDatasetId) || null;
  }, [datasets, selectedDatasetId]);

  // 2. Fetch Overview when selectedDatasetId changes
  useEffect(() => {
    if (!selectedDatasetId) {
      setOverview(null);
      return;
    }

    const loadOverview = async () => {
      setLoadingOverview(true);
      setOverviewError('');
      setChartError('');
      try {
        const data = await analyticsService.getOverview(selectedDatasetId, 'original');
        setOverview(data);

        // Pre-populate intelligent defaults
        const categoricals = data.available_categorical_columns || [];
        const numerics = data.available_numeric_columns || [];
        const dates = data.available_date_columns || [];

        // Default X column (prefer date for line, categorical for bar/pie)
        if (categoricals.length > 0) {
          setXColumn(categoricals[0]);
        } else if (dates.length > 0) {
          setXColumn(dates[0]);
        } else if (data.column_summary && data.column_summary.length > 0) {
          setXColumn(data.column_summary[0].name);
        }

        // Default Y column (first numeric column)
        if (numerics.length > 0) {
          setYColumn(numerics[0]);
        } else {
          setYColumn('');
          setAggregation('count');
        }
      } catch (err) {
        setOverviewError(extractErrorMessage(err));
      } finally {
        setLoadingOverview(false);
      }
    };
    loadOverview();
  }, [selectedDatasetId]);

  // 3. Automatically generate chart when configuration changes
  const handleGenerateChart = async () => {
    if (!selectedDatasetId) return;

    setLoadingChart(true);
    setChartError('');

    try {
      const payload = {
        dataset_id: selectedDatasetId,
        version: 'original',
        chart_type: chartType,
        x_column: xColumn || undefined,
        y_column: aggregation === 'count' && !['histogram', 'scatter', 'boxplot'].includes(chartType) ? undefined : (yColumn || undefined),
        aggregation: aggregation,
        limit: parseInt(limit, 10),
        bins: parseInt(bins, 10),
        sort_direction: sortDirection,
      };

      const res = await analyticsService.generateChart(payload);
      setChartResponse(res);
    } catch (err) {
      setChartError(extractErrorMessage(err));
    } finally {
      setLoadingChart(false);
    }
  };

  // Trigger chart generation once overview is ready or configuration changes
  useEffect(() => {
    if (overview && selectedDatasetId) {
      handleGenerateChart();
    }
  }, [overview, chartType, xColumn, yColumn, aggregation, limit, bins, sortDirection]);

  // Export current chart as high-resolution PNG
  const handleExportPNG = () => {
    if (!chartContainerRef.current) return;
    const svgEl = chartContainerRef.current.querySelector('svg');
    if (svgEl) {
      const filename = `${selectedDataset?.original_filename || selectedDataset?.filename || 'dataset'}_${chartType}`;
      exportSvgToPng(svgEl, filename);
    }
  };

  // Categorize columns from overview
  const numericColumns = useMemo(() => overview?.available_numeric_columns || [], [overview]);
  const categoricalColumns = useMemo(() => overview?.available_categorical_columns || [], [overview]);
  const dateColumns = useMemo(() => overview?.available_date_columns || [], [overview]);
  const allColumns = useMemo(() => overview?.column_summary?.map((c) => c.name) || [], [overview]);

  // Validation: Check if current chart type requires numeric columns
  const isNumericRequired = ['histogram', 'scatter', 'heatmap', 'boxplot'].includes(chartType);
  const lacksNumericColumns = isNumericRequired && numericColumns.length === 0;
  const lacksTwoNumericColumns = chartType === 'scatter' && numericColumns.length < 2;

  // Format numbers nicely
  const formatCompact = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '—';
    if (Math.abs(num) >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (Math.abs(num) >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return Number.isInteger(num) ? String(num) : num.toFixed(2);
  };

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      {/* 1. Top Header & Breadcrumb Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-[#DFE7F2] dark:border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/datasets')}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
            title="Back to My Datasets"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to My Datasets</span>
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-[#294C9B] dark:text-blue-300">
                Graphical Representation & Interactive Visualizer
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 text-[10px] font-bold uppercase tracking-wider">
                Live CSV/Excel Data
              </span>
            </div>
            <p className="text-xs text-[#6B7890] dark:text-slate-400 mt-0.5">
              Explore dynamic multi-dimensional graphical representations generated directly from your actual uploaded tabular datasets.
            </p>
          </div>
        </div>

        {/* Dataset Switcher & Export */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Dataset Selector Dropdown */}
          <div className="relative">
            <select
              value={selectedDatasetId || ''}
              onChange={(e) => handleDatasetChange(e.target.value)}
              disabled={loadingDatasets || datasets.length === 0}
              className="appearance-none pl-3 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 shadow-2xs focus:ring-2 focus:ring-[#2563EB]/20 focus:outline-none cursor-pointer disabled:opacity-50"
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.original_filename || d.filename} (#{d.id})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Export PNG */}
          <button
            onClick={handleExportPNG}
            disabled={loadingChart || !chartResponse || Boolean(chartError)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download high-resolution PNG image"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export PNG</span>
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {overviewError && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{overviewError}</span>
        </div>
      )}

      {/* 2. Dataset Metadata & Column Summary Bar */}
      {overview && (
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-[#DFE7F2] dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[#0F172A] dark:text-slate-100">
                    {overview.dataset_name}
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    {overview.version.toUpperCase()}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  ID: #{overview.dataset_id} · File Size:{' '}
                  {overview.file_size_bytes
                    ? `${(overview.file_size_bytes / 1024).toFixed(1)} KB`
                    : '—'}
                </p>
              </div>
            </div>

            {/* Quick Dimension Badges */}
            <div className="flex items-center gap-2">
              <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-blue-500" />
                <span>
                  <strong>{overview.rows.toLocaleString()}</strong> rows
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Columns className="w-3.5 h-3.5 text-purple-500" />
                <span>
                  <strong>{overview.columns}</strong> columns
                </span>
              </div>
            </div>
          </div>

          {/* Numeric & Categorical Feature Pills */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Numeric Features ({numericColumns.length}):
              </span>
              {numericColumns.length > 0 ? (
                numericColumns.slice(0, 8).map((col, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-mono"
                  >
                    #{col}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-slate-400 italic">No numeric columns</span>
              )}
              {numericColumns.length > 8 && (
                <span className="text-[10px] text-slate-400">+{numericColumns.length - 8} more</span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Categorical ({categoricalColumns.length}):
              </span>
              {categoricalColumns.length > 0 ? (
                categoricalColumns.slice(0, 6).map((col, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-mono"
                  >
                    {col}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-slate-400 italic">No categorical columns</span>
              )}
              {categoricalColumns.length > 6 && (
                <span className="text-[10px] text-slate-400">+{categoricalColumns.length - 6} more</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Main Workspace: Configuration Sidebar + Interactive Chart Display */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Chart Configuration Panel (4 cols) */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-[#DFE7F2] dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#2563EB]" />
              <h3 className="text-xs font-bold text-[#0F172A] dark:text-slate-100 uppercase tracking-wider">
                Chart Controls
              </h3>
            </div>
            <button
              onClick={handleGenerateChart}
              disabled={loadingChart}
              className="text-xs text-[#2563EB] hover:underline inline-flex items-center gap-1 font-semibold cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingChart ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Chart Type Picker Grid */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              1. Select Chart Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CHART_TYPES.map((t) => {
                const Icon = t.icon;
                const isSelected = chartType === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setChartType(t.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-[#EFF6FF] dark:bg-blue-950/60 border-[#2563EB] text-[#2563EB] dark:text-blue-300 shadow-2xs ring-1 ring-[#2563EB]/20'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-xs font-bold truncate">{t.label}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                      {t.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Column Inputs tailored to Chart Type */}
          <div className="space-y-4 pt-1">
            {/* Histogram Configuration */}
            {chartType === 'histogram' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Target Numeric Feature:
                  </label>
                  <select
                    value={yColumn || xColumn || ''}
                    onChange={(e) => {
                      setYColumn(e.target.value);
                      setXColumn(e.target.value);
                    }}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  >
                    {numericColumns.map((c) => (
                      <option key={c} value={c}>
                        {c} (Numeric)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    <span>Number of Bins:</span>
                    <span className="font-mono text-[#2563EB]">{bins}</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="30"
                    step="5"
                    value={bins}
                    onChange={(e) => setBins(parseInt(e.target.value, 10))}
                    className="w-full accent-[#2563EB] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>5 (Coarse)</span>
                    <span>15</span>
                    <span>30 (Fine)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Scatter Plot Configuration */}
            {chartType === 'scatter' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    X-Axis Variable (Continuous):
                  </label>
                  <select
                    value={xColumn}
                    onChange={(e) => setXColumn(e.target.value)}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  >
                    {numericColumns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Y-Axis Variable (Continuous):
                  </label>
                  <select
                    value={yColumn}
                    onChange={(e) => setYColumn(e.target.value)}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  >
                    {numericColumns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Heatmap Notice */}
            {chartType === 'heatmap' && (
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-900 dark:text-blue-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Info className="w-3.5 h-3.5 text-blue-600" />
                  <span>Automatic Correlation Matrix</span>
                </div>
                <p className="text-[11px] text-blue-800 dark:text-blue-400">
                  Computes Pearson correlation coefficients (r) across all{' '}
                  <strong>{numericColumns.length} numeric features</strong> in this dataset.
                </p>
              </div>
            )}

            {/* Box Plot Configuration */}
            {chartType === 'boxplot' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Target Metric Variable (Quartiles & Outliers):
                  </label>
                  <select
                    value={yColumn}
                    onChange={(e) => setYColumn(e.target.value)}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  >
                    {numericColumns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Grouping Category (Optional):
                  </label>
                  <select
                    value={xColumn}
                    onChange={(e) => setXColumn(e.target.value)}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  >
                    <option value="">Overall (Single Distribution)</option>
                    {allColumns.map((c) => (
                      <option key={c} value={c}>
                        {c} {categoricalColumns.includes(c) ? '(Categorical)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Bar, Line, Pie, Donut Configuration */}
            {['bar', 'line', 'pie', 'donut'].includes(chartType) && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Category Dimension (X-Axis):
                  </label>
                  <select
                    value={xColumn}
                    onChange={(e) => setXColumn(e.target.value)}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  >
                    {allColumns.map((c) => (
                      <option key={c} value={c}>
                        {c} {categoricalColumns.includes(c) ? '(Categorical)' : dateColumns.includes(c) ? '(Date)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Metric Value (Y-Axis):
                  </label>
                  <select
                    value={aggregation === 'count' ? '' : yColumn}
                    onChange={(e) => setYColumn(e.target.value)}
                    disabled={aggregation === 'count'}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 disabled:opacity-50"
                  >
                    {aggregation === 'count' ? (
                      <option value="">(Row Count)</option>
                    ) : (
                      numericColumns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Aggregation Method:
                  </label>
                  <select
                    value={aggregation}
                    onChange={(e) => setAggregation(e.target.value)}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  >
                    {AGGREGATIONS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Limit Slices:
                    </label>
                    <select
                      value={limit}
                      onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                    >
                      <option value="5">Top 5</option>
                      <option value="10">Top 10</option>
                      <option value="15">Top 15</option>
                      <option value="20">Top 20</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Sort Order:
                    </label>
                    <select
                      value={sortDirection}
                      onChange={(e) => setSortDirection(e.target.value)}
                      className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                    >
                      <option value="desc">High to Low</option>
                      <option value="asc">Low to High</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Warnings / Guidance */}
            {lacksNumericColumns && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-bold">No numeric features detected</p>
                <p className="text-[11px]">
                  This chart type requires numeric columns. Switch to Bar or Pie with Count
                  aggregation.
                </p>
                <button
                  onClick={() => {
                    setChartType('bar');
                    setAggregation('count');
                  }}
                  className="mt-1 text-xs text-blue-600 dark:text-blue-400 font-semibold underline cursor-pointer"
                >
                  Switch to Bar Chart (Count)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Visualization Canvas & Data Table (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* View Mode Tabs & Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold">
              <button
                onClick={() => setActiveTab('chart')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'chart'
                    ? 'bg-white dark:bg-slate-900 text-[#2563EB] dark:text-blue-300 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Interactive Chart</span>
              </button>
              <button
                onClick={() => setActiveTab('table')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'table'
                    ? 'bg-white dark:bg-slate-900 text-[#2563EB] dark:text-blue-300 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Underlying Data Table</span>
              </button>
            </div>

            {chartResponse && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">
                {chartResponse.data_points?.length || 0} data records evaluated
              </span>
            )}
          </div>

          {/* Chart Error Banner */}
          {chartError && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{chartError}</span>
            </div>
          )}

          {/* Canvas Container */}
          <div ref={chartContainerRef}>
            {loadingChart && (
              <div className="bg-white dark:bg-slate-900 border border-[#DFE7F2] dark:border-slate-800 rounded-3xl p-16 text-center shadow-xs flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin" />
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Calculating Aggregations...
                </h4>
                <p className="text-xs text-slate-500">
                  Processing dataset records with zero mock data.
                </p>
              </div>
            )}

            {!loadingChart && !chartError && activeTab === 'chart' && (
              <AnalyticalChart
                chartData={chartResponse}
                showExport={true}
                downloadFilename={`${selectedDataset?.original_filename || selectedDataset?.filename || 'dataset'}_${chartType}`}
                emptyMessage="No matching data found for the current configuration. Try adjusting your axes or aggregation."
              />
            )}

            {/* Underlying Tabular Data View */}
            {!loadingChart && activeTab === 'table' && chartResponse?.table_data && (
              <div className="bg-white dark:bg-slate-900 border border-[#DFE7F2] dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <h4 className="text-xs font-bold text-[#0F172A] dark:text-slate-100">
                    Tabular Results ({chartResponse.table_data.rows?.length || 0} rows)
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Aggregated live from database
                  </span>
                </div>

                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        {chartResponse.table_data.columns?.map((col, idx) => (
                          <th
                            key={idx}
                            className="py-2.5 px-3 font-bold text-slate-700 dark:text-slate-300"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {chartResponse.table_data.rows?.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          {chartResponse.table_data.columns?.map((col, cIdx) => (
                            <td
                              key={cIdx}
                              className="py-2 px-3 text-slate-700 dark:text-slate-300 font-mono text-[11px]"
                            >
                              {row[col] !== null && row[col] !== undefined
                                ? String(row[col])
                                : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* 4. Statistical Summary Cards (Ground Truth from Actual Chart Points) */}
          {chartResponse && chartResponse.data_points?.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Data Points
                </div>
                <div className="text-base font-bold text-[#0F172A] dark:text-slate-100 mt-1">
                  {chartResponse.data_points.length}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Distinct categories</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Total Aggregate
                </div>
                <div className="text-base font-bold text-[#0F172A] dark:text-slate-100 mt-1">
                  {formatCompact(
                    chartResponse.data_points.reduce(
                      (acc, p) => acc + (typeof p.value === 'number' ? p.value : 0),
                      0
                    )
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Sum of plotted values</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Mean Value
                </div>
                <div className="text-base font-bold text-[#0F172A] dark:text-slate-100 mt-1">
                  {formatCompact(
                    chartResponse.data_points.reduce(
                      (acc, p) => acc + (typeof p.value === 'number' ? p.value : 0),
                      0
                    ) / chartResponse.data_points.length
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Average per category</div>
              </div>

              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Top Category
                </div>
                <div className="text-sm font-bold text-[#0F172A] dark:text-slate-100 mt-1 truncate">
                  {chartResponse.data_points[0]?.label || '—'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Val: {formatCompact(chartResponse.data_points[0]?.value)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VisualizationPage;
