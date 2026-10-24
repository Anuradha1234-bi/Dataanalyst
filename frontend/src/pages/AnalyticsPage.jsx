import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  TrendingUp,
  Activity,
  Grid,
  Filter,
  Calendar,
  Table as TableIcon,
  Download,
  RefreshCw,
  SlidersHorizontal,
  Layers,
  Search,
  Database,
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Info,
  FileText,
  ChevronDown,
  Plus,
  Trash2,
  PieChart,
  ArrowUpDown,
  Hash,
  AlertCircle,
} from 'lucide-react';
import { datasetService } from '../services/datasetService';
import { analyticsService } from '../services/analyticsService';
import { extractErrorMessage } from '../services/api';
import { AnalyticalChart } from '../components/AnalyticalChart';

export const AnalyticsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Dataset repository & active selection
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState('original');
  const [loadingDatasets, setLoadingDatasets] = useState(true);

  // Active top-level tab
  // 'explorer' | 'trends' | 'compare' | 'stats' | 'insights'
  const [activeTab, setActiveTab] = useState('explorer');

  // Overview & Schema state
  const [overview, setOverview] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState('');

  // -------------------------------------------------------------
  // View 1: Chart Explorer State
  // -------------------------------------------------------------
  const [chartType, setChartType] = useState('bar');
  const [xColumn, setXColumn] = useState('');
  const [yColumn, setYColumn] = useState('');
  const [aggregation, setAggregation] = useState('sum');
  const [limit, setLimit] = useState(10);
  const [sortDirection, setSortDirection] = useState('desc');
  const [bins, setBins] = useState(10);
  const [filters, setFilters] = useState([]);
  const [chartResponse, setChartResponse] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartError, setChartError] = useState('');
  const [showTableUnderChart, setShowTableUnderChart] = useState(false);

  // -------------------------------------------------------------
  // View 2: Time-Series Trends State
  // -------------------------------------------------------------
  const [trendDateCol, setTrendDateCol] = useState('');
  const [trendMetricCol, setTrendMetricCol] = useState('');
  const [trendInterval, setTrendInterval] = useState('daily');
  const [trendAgg, setTrendAgg] = useState('sum');
  const [trendResponse, setTrendResponse] = useState(null);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [trendError, setTrendError] = useState('');

  // -------------------------------------------------------------
  // View 3: Group Compare State
  // -------------------------------------------------------------
  const [groupCols, setGroupCols] = useState([]);
  const [groupMetricCol, setGroupMetricCol] = useState('');
  const [groupAgg, setGroupAgg] = useState('sum');
  const [groupLimit, setGroupLimit] = useState(15);
  const [groupSortDir, setGroupSortDir] = useState('desc');
  const [groupResponse, setGroupResponse] = useState(null);
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [groupError, setGroupError] = useState('');

  // -------------------------------------------------------------
  // View 4: Deep Statistics & Outliers State
  // -------------------------------------------------------------
  const [statsResponse, setStatsResponse] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState('');
  const [statsSearch, setStatsSearch] = useState('');

  // -------------------------------------------------------------
  // View 5: Automated Insights State
  // -------------------------------------------------------------
  const [insightsResponse, setInsightsResponse] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState('');

  // Report Export Modal State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // 1. Initial Load: Fetch User's Real Datasets
  useEffect(() => {
    const fetchUserDatasets = async () => {
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
    fetchUserDatasets();
  }, [searchParams]);

  // Synchronize selectedDatasetId to localStorage when changed
  useEffect(() => {
    if (selectedDatasetId) {
      localStorage.setItem('selected_dataset_id', String(selectedDatasetId));
    }
  }, [selectedDatasetId]);

  // Selected dataset object helper
  const selectedDataset = useMemo(() => {
    return datasets.find((d) => d.id === selectedDatasetId) || null;
  }, [datasets, selectedDatasetId]);

  // 2. Fetch Overview when Dataset or Version changes
  useEffect(() => {
    if (!selectedDatasetId) {
      setOverview(null);
      return;
    }

    const loadOverview = async () => {
      setLoadingOverview(true);
      setOverviewError('');
      try {
        const data = await analyticsService.getOverview(selectedDatasetId, selectedVersion);
        setOverview(data);

        // Pre-populate sensible defaults for chart and trend pickers
        if (data.available_categorical_columns && data.available_categorical_columns.length > 0) {
          setXColumn(data.available_categorical_columns[0]);
          setGroupCols([data.available_categorical_columns[0]]);
        } else if (data.column_summary && data.column_summary.length > 0) {
          setXColumn(data.column_summary[0].name);
          setGroupCols([data.column_summary[0].name]);
        }

        if (data.available_numeric_columns && data.available_numeric_columns.length > 0) {
          setYColumn(data.available_numeric_columns[0]);
          setGroupMetricCol(data.available_numeric_columns[0]);
          setTrendMetricCol(data.available_numeric_columns[0]);
        } else {
          setYColumn('');
          setGroupMetricCol('');
          setTrendMetricCol('');
        }

        if (data.available_date_columns && data.available_date_columns.length > 0) {
          setTrendDateCol(data.available_date_columns[0]);
        } else {
          setTrendDateCol('');
        }
      } catch (err) {
        setOverviewError(extractErrorMessage(err));
      } finally {
        setLoadingOverview(false);
      }
    };

    loadOverview();
  }, [selectedDatasetId, selectedVersion]);

  // Sync dataset selection with URL params
  const handleDatasetChange = (newId) => {
    setSelectedDatasetId(newId);
    setSearchParams({ dataset_id: newId });
    setChartResponse(null);
    setTrendResponse(null);
    setGroupResponse(null);
    setStatsResponse(null);
    setInsightsResponse(null);
  };

  // Switch between Original and Cleaned version without stale data contamination
  const handleVersionToggle = (newVersion) => {
    if (newVersion === selectedVersion) return;
    setSelectedVersion(newVersion);
    setChartResponse(null);
    setTrendResponse(null);
    setGroupResponse(null);
    setStatsResponse(null);
    setInsightsResponse(null);
  };

  // -------------------------------------------------------------
  // Explorer Actions: Generate Dynamic Chart
  // -------------------------------------------------------------
  const handleGenerateChart = async () => {
    if (!selectedDatasetId) return;
    setLoadingChart(true);
    setChartError('');
    try {
      const payload = {
        dataset_id: selectedDatasetId,
        version: selectedVersion,
        chart_type: chartType,
        x_column: xColumn || null,
        y_column: yColumn || null,
        aggregation,
        limit: parseInt(limit, 10),
        sort_direction: sortDirection,
        bins: parseInt(bins, 10),
        filters: filters.filter((f) => f.column && f.operator && f.value !== ''),
      };
      const res = await analyticsService.generateChart(payload);
      setChartResponse(res);
    } catch (err) {
      setChartError(extractErrorMessage(err));
    } finally {
      setLoadingChart(false);
    }
  };

  // Auto-generate initial chart when overview loads
  useEffect(() => {
    if (overview && selectedDatasetId && !chartResponse && !loadingChart) {
      handleGenerateChart();
    }
  }, [overview]);

  // Add / Remove Filter
  const addFilter = () => {
    if (!overview || !overview.column_summary.length) return;
    setFilters([
      ...filters,
      {
        column: overview.column_summary[0].name,
        operator: '==',
        value: '',
      },
    ]);
  };

  const updateFilter = (index, field, val) => {
    const next = [...filters];
    next[index][field] = val;
    setFilters(next);
  };

  const removeFilter = (index) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  // -------------------------------------------------------------
  // Trend Analysis Actions
  // -------------------------------------------------------------
  const handleRunTrend = async () => {
    if (!selectedDatasetId || !trendDateCol || !trendMetricCol) return;
    setLoadingTrend(true);
    setTrendError('');
    try {
      const payload = {
        dataset_id: selectedDatasetId,
        version: selectedVersion,
        date_column: trendDateCol,
        metric_column: trendMetricCol,
        interval: trendInterval,
        aggregation: trendAgg,
      };
      const res = await analyticsService.analyzeTrend(payload);
      setTrendResponse(res);
    } catch (err) {
      setTrendError(extractErrorMessage(err));
    } finally {
      setLoadingTrend(false);
    }
  };

  // -------------------------------------------------------------
  // Group Compare Actions
  // -------------------------------------------------------------
  const handleRunGroupCompare = async () => {
    if (!selectedDatasetId || groupCols.length === 0 || !groupMetricCol) return;
    setLoadingGroup(true);
    setGroupError('');
    try {
      const payload = {
        dataset_id: selectedDatasetId,
        version: selectedVersion,
        group_by_columns: groupCols,
        metric_column: groupMetricCol,
        aggregation: groupAgg,
        limit: parseInt(groupLimit, 10),
        sort_direction: groupSortDir,
        filters: filters.filter((f) => f.column && f.operator && f.value !== ''),
      };
      const res = await analyticsService.groupCompare(payload);
      setGroupResponse(res);
    } catch (err) {
      setGroupError(extractErrorMessage(err));
    } finally {
      setLoadingGroup(false);
    }
  };

  // -------------------------------------------------------------
  // Deep Statistics Actions
  // -------------------------------------------------------------
  const handleLoadStats = async () => {
    if (!selectedDatasetId) return;
    setLoadingStats(true);
    setStatsError('');
    try {
      const res = await analyticsService.getStats({
        dataset_id: selectedDatasetId,
        version: selectedVersion,
      });
      setStatsResponse(res);
    } catch (err) {
      setStatsError(extractErrorMessage(err));
    } finally {
      setLoadingStats(false);
    }
  };

  // -------------------------------------------------------------
  // Automated Insights Actions
  // -------------------------------------------------------------
  const handleLoadInsights = async () => {
    if (!selectedDatasetId) return;
    setLoadingInsights(true);
    setInsightsError('');
    try {
      const res = await analyticsService.getInsights(selectedDatasetId, selectedVersion);
      setInsightsResponse(res);
    } catch (err) {
      setInsightsError(extractErrorMessage(err));
    } finally {
      setLoadingInsights(false);
    }
  };

  // Load tab-specific data on tab switch
  useEffect(() => {
    if (activeTab === 'stats' && !statsResponse && !loadingStats) {
      handleLoadStats();
    } else if (activeTab === 'insights' && !insightsResponse && !loadingInsights) {
      handleLoadInsights();
    } else if (activeTab === 'trends' && !trendResponse && trendDateCol && trendMetricCol && !loadingTrend) {
      handleRunTrend();
    } else if (activeTab === 'compare' && !groupResponse && groupCols.length > 0 && groupMetricCol && !loadingGroup) {
      handleRunGroupCompare();
    }
  }, [activeTab, selectedDatasetId, selectedVersion]);

  // -------------------------------------------------------------
  // CSV & Report Exports
  // -------------------------------------------------------------
  const handleDownloadCSV = async (customFilename, columns, rows) => {
    if (!columns || !rows || rows.length === 0) return;
    try {
      const name = customFilename || `analytics_${selectedDataset?.filename || 'data'}.csv`;
      await analyticsService.downloadCSV(name, columns, rows);
    } catch (err) {
      alert(`Export failed: ${extractErrorMessage(err)}`);
    }
  };

  const handleOpenReportModal = async () => {
    if (!selectedDatasetId) return;
    setLoadingReport(true);
    setReportModalOpen(true);
    try {
      const rep = await analyticsService.generateReport({
        dataset_id: selectedDatasetId,
        version: selectedVersion,
        include_kpis: true,
        include_stats: true,
        include_insights: true,
      });
      setReportData(rep);
    } catch (err) {
      setReportData({ error: extractErrorMessage(err) });
    } finally {
      setLoadingReport(false);
    }
  };

  // Filtered descriptive statistics
  const filteredStatsRows = useMemo(() => {
    if (!statsResponse || !statsResponse.descriptive_table) return [];
    if (!statsSearch.trim()) return statsResponse.descriptive_table;
    const term = statsSearch.toLowerCase();
    return statsResponse.descriptive_table.filter((r) => r.column.toLowerCase().includes(term));
  }, [statsResponse, statsSearch]);

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      {/* ------------------------------------------------------------- */}
      {/* Page Header & Dataset Selector Bar */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#2563EB]" />
              <h1 className="text-xl font-bold text-[#0F172A]">Advanced Analytics</h1>
              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#2563EB] text-[11px] font-semibold border border-blue-200">
                Verified Engine
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-1">
              Deterministic multidimensional exploration, time-series trends, correlation matrices, and IQR outlier detection.
            </p>
          </div>

          {/* Dataset & Version Selectors */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Dataset Picker */}
            <div className="relative min-w-[240px]">
              <Database className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedDatasetId || ''}
                onChange={(e) => handleDatasetChange(parseInt(e.target.value, 10))}
                disabled={loadingDatasets || datasets.length === 0}
                className="w-full pl-9 pr-8 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 transition-all cursor-pointer disabled:opacity-50"
              >
                {datasets.length === 0 ? (
                  <option value="">No datasets uploaded yet</option>
                ) : (
                  datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      [ID #{d.id}] {d.original_filename || d.filename} ({d.rows || 0} rows, {d.columns || 0} cols){d.has_cleaned ? ' • Cleaned Available' : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Version Toggle (Original vs Cleaned) */}
            {selectedDataset && (
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  onClick={() => handleVersionToggle('original')}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${
                    selectedVersion === 'original'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Original
                </button>
                <button
                  onClick={() => handleVersionToggle('cleaned')}
                  disabled={!selectedDataset.has_cleaned}
                  title={!selectedDataset.has_cleaned ? 'No cleaned version available for this dataset' : ''}
                  className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                    selectedVersion === 'cleaned'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : selectedDataset.has_cleaned
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 cursor-not-allowed opacity-50'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  Cleaned
                </button>
              </div>
            )}

            {/* Report Export Button */}
            <button
              onClick={handleOpenReportModal}
              disabled={!selectedDatasetId}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              Executive Report
            </button>
          </div>
        </div>

        {/* Dataset Provenance & Integrity Status Bar */}
        {selectedDataset && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                Active Dataset ID #{selectedDataset.id}
              </span>
              <span className="font-mono text-slate-700 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200">
                {selectedDataset.original_filename || selectedDataset.filename}
              </span>
              <span className="bg-slate-100 px-2.5 py-1 rounded-lg text-slate-600">
                Version: <strong className="text-slate-900 uppercase">{selectedVersion}</strong>
              </span>
              <span className="bg-slate-100 px-2.5 py-1 rounded-lg text-slate-600">
                Records: <strong className="text-slate-900 font-mono">{(overview?.rows || selectedDataset.rows || 0).toLocaleString()}</strong> rows × <strong className="text-slate-900 font-mono">{overview?.columns || selectedDataset.columns || 0}</strong> cols
              </span>
            </div>
            {overview?.analysis_timestamp && (
              <span className="text-[11px] text-slate-400">
                Analyzed at: {new Date(overview.analysis_timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>
        )}

        {/* Duplicate Columns / Duplicate Rows Integrity Warnings */}
        {(overview?.duplicate_column_warnings?.length > 0 || (overview?.duplicate_row_count && overview.duplicate_row_count > 0)) && (
          <div className="mt-3 p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Dataset Integrity Notice (Columns & Records Preserved Without Alteration)</span>
            </div>
            {overview.duplicate_row_count > 0 && (
              <p className="text-[11px] text-amber-800 ml-5">
                • Identified <strong>{overview.duplicate_row_count.toLocaleString()}</strong> duplicate rows in active dataset version.
              </p>
            )}
            {overview.duplicate_column_warnings?.map((warn, wIdx) => (
              <p key={wIdx} className="text-[11px] text-amber-800 ml-5">
                • {warn}
              </p>
            ))}
          </div>
        )}

        {/* Global Overview Error Message */}
        {overviewError && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{overviewError}</span>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Dynamic KPI Cards Section (Grounded in Actual Dataset) */}
      {/* ------------------------------------------------------------- */}
      {loadingOverview ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 animate-pulse space-y-2">
              <div className="h-3 w-16 bg-slate-200 rounded" />
              <div className="h-6 w-24 bg-slate-200 rounded" />
              <div className="h-2 w-20 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : overview && overview.kpi_cards && overview.kpi_cards.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {overview.kpi_cards.map((card) => {
            const isQuality = card.category === 'quality';
            const isMonetary = card.category === 'monetary';
            const isOutliers = card.id === 'kpi_outliers';

            return (
              <div
                key={card.id}
                className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs flex flex-col justify-between hover:border-blue-300 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="text-[11px] font-semibold text-[#64748B] truncate" title={card.label}>
                      {card.label}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                        isQuality
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : isMonetary
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : isOutliers
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {card.category}
                    </span>
                  </div>
                  <div className="text-lg font-bold text-[#0F172A] tracking-tight truncate" title={card.formatted_value}>
                    {card.formatted_value}
                  </div>
                </div>
                <p className="text-[10px] text-[#94A3B8] mt-2 line-clamp-2" title={card.subtext}>
                  {card.subtext}
                </p>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* ------------------------------------------------------------- */}
      {/* Navigation Tabs Bar */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-2 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveTab('explorer')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap ${
            activeTab === 'explorer'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Visual Explorer
        </button>

        <button
          onClick={() => setActiveTab('trends')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap ${
            activeTab === 'trends'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Time-Series & Trends
        </button>

        <button
          onClick={() => setActiveTab('compare')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap ${
            activeTab === 'compare'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          Multidimensional Compare
        </button>

        <button
          onClick={() => setActiveTab('stats')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap ${
            activeTab === 'stats'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100'
          }`}
        >
          <Activity className="w-4 h-4" />
          Descriptive Stats & IQR
        </button>

        <button
          onClick={() => setActiveTab('insights')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap ${
            activeTab === 'insights'
              ? 'bg-[#2563EB] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Automated Insights
        </button>
      </div>

      {/* ============================================================= */}
      {/* TAB 1: VISUAL EXPLORER & CUSTOM CHARTS */}
      {/* ============================================================= */}
      {activeTab === 'explorer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Controls Column (Chart Builder) */}
          <div className="lg:col-span-4 bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-[#0F172A]">Chart Specification</h3>
              </div>
              <button
                onClick={handleGenerateChart}
                disabled={loadingChart || !selectedDatasetId}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loadingChart ? 'animate-spin' : ''}`} />
                Update
              </button>
            </div>

            {/* Chart Type Picker */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-700">Visualization Type</label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {[
                  { id: 'bar', label: 'Bar', icon: BarChart3 },
                  { id: 'line', label: 'Line', icon: TrendingUp },
                  { id: 'donut', label: 'Donut', icon: PieChart },
                  { id: 'pie', label: 'Pie', icon: PieChart },
                  { id: 'histogram', label: 'Hist', icon: BarChart3 },
                  { id: 'scatter', label: 'Scatter', icon: Activity },
                  { id: 'heatmap', label: 'Matrix', icon: Grid },
                  { id: 'boxplot', label: 'Box', icon: Activity },
                  { id: 'table', label: 'Table', icon: TableIcon },
                ].map((t) => {
                  const Icon = t.icon;
                  const isActive = chartType === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setChartType(t.id)}
                      className={`py-1.5 px-2 rounded-lg text-[10px] font-semibold flex flex-col items-center gap-1 transition-all border ${
                        isActive
                          ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Intelligent Chart Recommendations Card */}
            {chartResponse?.recommendations && chartResponse.recommendations.length > 0 && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 text-blue-800 font-bold text-[11px]">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Intelligent Chart Recommendations</span>
                </div>
                {chartResponse.recommendations.map((rec, rIdx) => (
                  <p key={rIdx} className="text-[11px] text-blue-900/85 leading-relaxed">
                    • {rec}
                  </p>
                ))}
              </div>
            )}

            {/* X-Axis Dimension Selector */}
            {chartType !== 'heatmap' && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-700">
                  {chartType === 'histogram' ? 'Target Numeric Feature' : 'X-Axis Dimension (Group)'}
                </label>
                <select
                  value={xColumn}
                  onChange={(e) => setXColumn(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {overview?.column_summary?.map((col) => (
                    <option key={col.name} value={col.name}>
                      {col.name} ({col.role})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Y-Axis Metric Selector */}
            {chartType !== 'heatmap' && chartType !== 'histogram' && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-700">Y-Axis Metric</label>
                <select
                  value={yColumn}
                  onChange={(e) => setYColumn(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Count of records (Frequency)</option>
                  {overview?.available_numeric_columns?.map((col) => (
                    <option key={col} value={col}>
                      {col} (numeric)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Aggregation Function & Limit */}
            {chartType !== 'heatmap' && chartType !== 'scatter' && chartType !== 'histogram' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-700">Aggregation</label>
                  <select
                    value={aggregation}
                    onChange={(e) => setAggregation(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="sum">Sum</option>
                    <option value="mean">Average (Mean)</option>
                    <option value="median">Median</option>
                    <option value="min">Minimum</option>
                    <option value="max">Maximum</option>
                    <option value="count">Count</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-700">Top Records</label>
                  <select
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="5">Top 5</option>
                    <option value="10">Top 10</option>
                    <option value="15">Top 15</option>
                    <option value="25">Top 25</option>
                    <option value="50">Top 50</option>
                  </select>
                </div>
              </div>
            )}

            {/* Histogram Bins */}
            {chartType === 'histogram' && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-700">Bin Partitions: {bins}</label>
                <input
                  type="range"
                  min="4"
                  max="30"
                  value={bins}
                  onChange={(e) => setBins(parseInt(e.target.value, 10))}
                  className="w-full accent-blue-600"
                />
              </div>
            )}

            {/* Filter Builder */}
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                  <Filter className="w-3.5 h-3.5 text-blue-600" />
                  <span>Conditional Filters ({filters.length})</span>
                </div>
                <button
                  onClick={addFilter}
                  className="text-[10px] text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Add Filter
                </button>
              </div>

              {filters.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic">No active filters applied across dataset.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {filters.map((flt, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                      <select
                        value={flt.column}
                        onChange={(e) => updateFilter(idx, 'column', e.target.value)}
                        className="text-[10px] bg-white border border-slate-200 rounded px-1.5 py-1 text-slate-700 w-28 truncate"
                      >
                        {overview?.column_summary?.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>

                      <select
                        value={flt.operator}
                        onChange={(e) => updateFilter(idx, 'operator', e.target.value)}
                        className="text-[10px] bg-white border border-slate-200 rounded px-1 py-1 text-slate-700 w-16"
                      >
                        <option value="==">==</option>
                        <option value="!=">!=</option>
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                        <option value="contains">contains</option>
                      </select>

                      <input
                        type="text"
                        placeholder="Value..."
                        value={flt.value}
                        onChange={(e) => updateFilter(idx, 'value', e.target.value)}
                        className="text-[10px] bg-white border border-slate-200 rounded px-1.5 py-1 text-slate-800 flex-1 min-w-0"
                      />

                      <button
                        onClick={() => removeFilter(idx)}
                        className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Display Column (Chart Canvas & Table) */}
          <div className="lg:col-span-8 space-y-4">
            {chartError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{chartError}</span>
              </div>
            )}

            {/* Chart Container */}
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      Graphical Representation
                    </span>
                    <h3 className="text-xs font-bold text-[#0F172A]">
                      {chartResponse?.title || 'Visual Explorer from Actual Selected CSV'}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-1">
                    <span>
                      Dataset: <strong className="text-slate-800 font-mono">[ID #{selectedDatasetId}] {selectedDataset?.original_filename || selectedDataset?.filename}</strong>
                    </span>
                    <span>
                      Version: <strong className="text-blue-700 uppercase font-semibold">{selectedVersion}</strong>
                    </span>
                    {chartResponse?.records_used !== undefined && (
                      <span>
                        Records Analyzed: <strong className="text-slate-800 font-mono">{chartResponse.records_used.toLocaleString()}</strong> rows
                      </span>
                    )}
                    {chartResponse?.records_excluded !== undefined && chartResponse.records_excluded > 0 && (
                      <span className="text-amber-700">
                        ({chartResponse.records_excluded.toLocaleString()} filtered/missing rows excluded)
                      </span>
                    )}
                  </div>

                  {chartResponse?.summary_stats && (
                    <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1 pt-1 border-t border-slate-50">
                      <span>Total: <strong className="text-slate-800 font-mono">{chartResponse.summary_stats.sum}</strong></span>
                      <span>Mean: <strong className="text-slate-800 font-mono">{chartResponse.summary_stats.mean}</strong></span>
                      <span>Points: <strong className="text-slate-800 font-mono">{chartResponse.summary_stats.count}</strong></span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setShowTableUnderChart(!showTableUnderChart)}
                    className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <TableIcon className="w-3 h-3" />
                    {showTableUnderChart ? 'Hide Table' : 'Show Table'}
                  </button>

                  {chartResponse?.table_data?.rows?.length > 0 && (
                    <button
                      onClick={() =>
                        handleDownloadCSV(
                          `chart_${chartType}_${selectedDataset?.filename || 'export'}.csv`,
                          chartResponse.table_data.columns,
                          chartResponse.table_data.rows
                        )
                      }
                      className="px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      CSV
                    </button>
                  )}
                </div>
              </div>

              {/* Chart Warning Callout */}
              {chartResponse?.warnings?.length > 0 && (
                <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  {chartResponse.warnings.map((w, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Render Chart Component */}
              {loadingChart ? (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="text-xs">Executing deterministic aggregation on dataset...</span>
                </div>
              ) : chartResponse ? (
                <div>
                  <AnalyticalChart chartData={chartResponse} />
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-slate-400 text-xs">
                  Configure dimensions on the left and click 'Update' to render visualization.
                </div>
              )}

              {/* Toggleable Data Table */}
              {showTableUnderChart && chartResponse?.table_data && (
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <h4 className="text-[11px] font-bold text-slate-700">Underlying Tabular Data</h4>
                  <div className="overflow-x-auto max-h-60 border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                        <tr>
                          {chartResponse.table_data.columns.map((col, cIdx) => (
                            <th key={cIdx} className="px-3 py-2">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                        {chartResponse.table_data.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-50">
                            {chartResponse.table_data.columns.map((col, cIdx) => (
                              <td key={cIdx} className="px-3 py-1.5 text-slate-800 truncate max-w-[200px]">
                                {row[col] !== undefined && row[col] !== null ? String(row[col]) : '—'}
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
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 2: TIME-SERIES & TREND ANALYSIS */}
      {/* ============================================================= */}
      {activeTab === 'trends' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  Time-Series & Period-over-Period Trajectory
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Aggregates chronological observations into standard intervals and computes period deltas.
                </p>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Date Column */}
                <select
                  value={trendDateCol}
                  onChange={(e) => setTrendDateCol(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Select Date Column</option>
                  {overview?.available_date_columns?.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                  {overview?.column_summary?.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.role})
                    </option>
                  ))}
                </select>

                {/* Metric Column */}
                <select
                  value={trendMetricCol}
                  onChange={(e) => setTrendMetricCol(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Select Metric Column</option>
                  {overview?.available_numeric_columns?.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>

                {/* Interval Toggle */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                  {['daily', 'weekly', 'monthly', 'quarterly'].map((intv) => (
                    <button
                      key={intv}
                      onClick={() => setTrendInterval(intv)}
                      className={`px-2.5 py-1 rounded-md font-medium capitalize text-[11px] ${
                        trendInterval === intv ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      {intv}
                    </button>
                  ))}
                </div>

                {/* Run Button */}
                <button
                  onClick={handleRunTrend}
                  disabled={loadingTrend || !trendDateCol || !trendMetricCol}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingTrend ? 'animate-spin' : ''}`} />
                  Analyze Trend
                </button>
              </div>
            </div>

            {trendError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{trendError}</span>
              </div>
            )}

            {/* Results Area */}
            {loadingTrend ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                <span className="text-xs">Parsing datetime indices and calculating interval aggregates...</span>
              </div>
            ) : trendResponse ? (
              <div className="mt-4 space-y-4">
                {/* Metric Summary Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      Overall Trajectory
                    </span>
                    <div className="text-base font-bold text-slate-800 capitalize mt-0.5 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-blue-600" />
                      {trendResponse.trend_direction}
                    </div>
                  </div>

                  {trendResponse.previous_period_comparison && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Period-over-Period Delta
                      </span>
                      <div className="text-base font-bold text-slate-800 mt-0.5 flex items-center gap-2">
                        <span>
                          {trendResponse.previous_period_comparison.change_pct !== null
                            ? `${trendResponse.previous_period_comparison.change_pct > 0 ? '+' : ''}${
                                trendResponse.previous_period_comparison.change_pct
                              }%`
                            : trendResponse.previous_period_comparison.change_direction === 'baseline_zero'
                            ? 'Baseline Zero'
                            : 'N/A'}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                            trendResponse.previous_period_comparison.change_direction === 'increasing'
                              ? 'bg-emerald-100 text-emerald-800'
                              : trendResponse.previous_period_comparison.change_direction === 'decreasing'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {trendResponse.previous_period_comparison.change_direction}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Current: {trendResponse.previous_period_comparison.current_period_val} vs Prev:{' '}
                        {trendResponse.previous_period_comparison.prev_period_val}
                      </p>
                    </div>
                  )}

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      Observed Interval Buckets
                    </span>
                    <div className="text-base font-bold text-slate-800 mt-0.5">
                      {trendResponse.data_points.length} {trendResponse.interval} points
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      Date Range & Observations
                    </span>
                    <div className="text-xs font-bold text-slate-800 mt-1 truncate" title={`${trendResponse.start_date || 'N/A'} to ${trendResponse.end_date || 'N/A'}`}>
                      {trendResponse.start_date || '—'} → {trendResponse.end_date || '—'}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {trendResponse.observations_count ? `${trendResponse.observations_count.toLocaleString()} valid observations` : 'Validated dates'}
                    </p>
                  </div>
                </div>

                {/* Line Chart Component */}
                <AnalyticalChart
                  chartData={{
                    chart_type: 'line',
                    title: `${trendResponse.interval.toUpperCase()} Trend: ${trendResponse.metric_column} over ${trendResponse.date_column}`,
                    x_axis: trendResponse.date_column,
                    y_axis: trendResponse.metric_column,
                    data_points: trendResponse.data_points,
                  }}
                />

                {/* Causal Caveat Alert Banner */}
                {trendResponse.causal_caveat && (
                  <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold block mb-0.5">Critical Scientific & Causal Caveat</strong>
                      <span className="text-[11px] leading-relaxed">{trendResponse.causal_caveat}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-400 text-xs">
                Select a valid Date column and Metric column above to compute time-series trajectory.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 3: MULTIDIMENSIONAL GROUP COMPARE */}
      {/* ============================================================= */}
      {activeTab === 'compare' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-600" />
                  Multidimensional Grouping & Comparison
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Segment and cross-tabulate metrics across single or composite categorical attributes.
                </p>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Metric Column */}
                <select
                  value={groupMetricCol}
                  onChange={(e) => setGroupMetricCol(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Select Metric</option>
                  {overview?.available_numeric_columns?.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>

                {/* Aggregation */}
                <select
                  value={groupAgg}
                  onChange={(e) => setGroupAgg(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="sum">Sum</option>
                  <option value="mean">Mean (Avg)</option>
                  <option value="median">Median</option>
                  <option value="min">Min</option>
                  <option value="max">Max</option>
                  <option value="count">Count</option>
                </select>

                {/* Limit */}
                <select
                  value={groupLimit}
                  onChange={(e) => setGroupLimit(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="10">Top 10</option>
                  <option value="15">Top 15</option>
                  <option value="25">Top 25</option>
                  <option value="50">Top 50</option>
                </select>

                {/* Run Button */}
                <button
                  onClick={handleRunGroupCompare}
                  disabled={loadingGroup || groupCols.length === 0 || !groupMetricCol}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingGroup ? 'animate-spin' : ''}`} />
                  Execute Group By
                </button>
              </div>
            </div>

            {/* Group By Columns Multi-select Chips */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-700">Group By Dimension(s):</label>
              <div className="flex flex-wrap gap-1.5">
                {overview?.column_summary?.map((col) => {
                  const isSelected = groupCols.includes(col.name);
                  return (
                    <button
                      key={col.name}
                      onClick={() => {
                        if (isSelected) {
                          setGroupCols(groupCols.filter((c) => c !== col.name));
                        } else {
                          setGroupCols([...groupCols, col.name]);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                        isSelected
                          ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {col.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {groupError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{groupError}</span>
              </div>
            )}

            {/* Results Table */}
            {loadingGroup ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                <span className="text-xs">Computing multidimensional grouped aggregations...</span>
              </div>
            ) : groupResponse ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Total unique groups identified: <strong>{groupResponse.total_groups}</strong>
                  </span>
                  <button
                    onClick={() =>
                      handleDownloadCSV(
                        `grouped_${groupMetricCol}_by_${groupCols.join('_')}.csv`,
                        groupResponse.columns,
                        groupResponse.rows
                      )
                    }
                    className="px-2.5 py-1 text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" /> Export CSV
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        {groupResponse.columns.map((col, idx) => (
                          <th key={idx} className="px-3 py-2">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {groupResponse.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50">
                          {groupResponse.columns.map((col, cIdx) => (
                            <td key={cIdx} className="px-3 py-2 text-slate-800">
                              {row[col] !== undefined && row[col] !== null ? String(row[col]) : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 4: DEEP STATS & IQR OUTLIERS */}
      {/* ============================================================= */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {statsError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{statsError}</span>
            </div>
          )}

          {loadingStats ? (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
              <p className="text-xs">Computing moments, quantiles, and Tukey IQR boundaries...</p>
            </div>
          ) : statsResponse ? (
            <>
              {/* Section 1: Descriptive Statistics Table */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-blue-600" />
                      Descriptive Statistics Matrix
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Standard moments, quartiles (Q1, Median, Q3), skewness, and kurtosis per numeric attribute.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search attribute..."
                        value={statsSearch}
                        onChange={(e) => setStatsSearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
                      />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Column</th>
                        <th className="px-3 py-2">Count</th>
                        <th className="px-3 py-2">Missing %</th>
                        <th className="px-3 py-2">Mean</th>
                        <th className="px-3 py-2">Std</th>
                        <th className="px-3 py-2">Min</th>
                        <th className="px-3 py-2">Q25</th>
                        <th className="px-3 py-2">Median</th>
                        <th className="px-3 py-2">Q75</th>
                        <th className="px-3 py-2">Max</th>
                        <th className="px-3 py-2">Skew</th>
                        <th className="px-3 py-2">Outliers (IQR 1.5x)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {filteredStatsRows.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-sans font-semibold text-slate-800">{r.column}</td>
                          <td className="px-3 py-2 text-slate-600">{r.count}</td>
                          <td className="px-3 py-2 text-slate-600">{r.missing_pct}%</td>
                          <td className="px-3 py-2 text-blue-700 font-bold">{r.mean}</td>
                          <td className="px-3 py-2 text-slate-600">{r.std !== null ? r.std : '—'}</td>
                          <td className="px-3 py-2 text-slate-600">{r.min}</td>
                          <td className="px-3 py-2 text-slate-600">{r.q25}</td>
                          <td className="px-3 py-2 text-slate-800 font-medium">{r.median}</td>
                          <td className="px-3 py-2 text-slate-600">{r.q75}</td>
                          <td className="px-3 py-2 text-slate-600">{r.max}</td>
                          <td className="px-3 py-2 text-slate-600">{r.skewness !== null ? r.skewness : '—'}</td>
                          <td className="px-3 py-2 text-amber-700 font-bold">
                            {r.outlier_count} / {r.count} ({r.outlier_pct}%)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 2: IQR Outlier Breakdown */}
              {statsResponse.outliers && statsResponse.outliers.length > 0 && (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
                  <div className="border-b border-slate-100 pb-2">
                    <h3 className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-600" />
                      Tukey IQR Anomaly & Outlier Distribution
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Threshold: Values outside [Q1 - 1.5*IQR, Q3 + 1.5*IQR]. Denominator is strictly valid column observations.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {statsResponse.outliers.map((o, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800">{o.column}</span>
                          <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-full">
                            {o.outlier_count} outliers ({o.outlier_pct}%)
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 font-mono space-y-0.5">
                          <div>Lower Cutoff: {o.lower_bound}</div>
                          <div>Upper Cutoff: {o.upper_bound}</div>
                        </div>
                        {o.sample_outliers && o.sample_outliers.length > 0 && (
                          <div className="text-[10px] text-slate-500">
                            Sample: {o.sample_outliers.slice(0, 5).join(', ')}
                            {o.sample_outliers.length > 5 ? '…' : ''}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Statistical Notes & Invariant Columns Callout */}
              {statsResponse.limitations && statsResponse.limitations.length > 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs text-slate-600">
                  <span className="font-bold text-slate-700 block">Statistical Method & Sample Scope Notes:</span>
                  {statsResponse.limitations.map((lim, lIdx) => (
                    <div key={lIdx} className="text-[11px] text-slate-500">
                      • {lim}
                    </div>
                  ))}
                </div>
              )}

              {/* Section 3: Pearson Correlation Heatmap */}
              {statsResponse.correlation_matrix?.columns?.length >= 2 && (
                <AnalyticalChart
                  chartData={{
                    chart_type: 'heatmap',
                    title: 'Bivariate Pearson Correlation Matrix',
                    categories: statsResponse.correlation_matrix.columns,
                    matrix: statsResponse.correlation_matrix.matrix,
                  }}
                />
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 5: AUTOMATED EVIDENCE-GROUNDED INSIGHTS */}
      {/* ============================================================= */}
      {activeTab === 'insights' && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Automated Evidence-Grounded Observations
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Algorithmic detection of class concentration, missingness, strong correlations, and outlier clusters.
                </p>
              </div>

              <button
                onClick={handleLoadInsights}
                disabled={loadingInsights}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${loadingInsights ? 'animate-spin' : ''}`} />
                Re-evaluate
              </button>
            </div>

            {insightsError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{insightsError}</span>
              </div>
            )}

            {loadingInsights ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                <span className="text-xs">Evaluating dataset against deterministic heuristic rules...</span>
              </div>
            ) : insightsResponse?.insights ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insightsResponse.insights.map((item) => {
                  const isWarning = item.severity === 'Warning';
                  const isActionable = item.severity === 'Actionable';

                  return (
                    <div
                      key={item.id}
                      className={`border rounded-2xl p-4.5 space-y-2.5 transition-all shadow-xs ${
                        isWarning
                          ? 'bg-amber-50/50 border-amber-200 hover:border-amber-300'
                          : isActionable
                          ? 'bg-blue-50/40 border-blue-200 hover:border-blue-300'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900">{item.title}</span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              isWarning
                                ? 'bg-amber-100 text-amber-800'
                                : isActionable
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {item.severity}
                          </span>
                          <span className="text-[9px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                            {item.metric}
                          </span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed">{item.statement}</p>

                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 pt-1.5 border-t border-slate-100">
                        {item.observations_used !== undefined && item.observations_used !== null && (
                          <span className="bg-slate-100 px-2 py-0.5 rounded font-mono font-medium text-slate-700">
                            n = {item.observations_used.toLocaleString()} observations
                          </span>
                        )}
                        {item.calculation_method && (
                          <span className="text-slate-500">
                            Method: <em>{item.calculation_method}</em>
                          </span>
                        )}
                      </div>

                      {item.next_step && (
                        <div className="text-[11px] text-blue-800 bg-blue-50/70 p-2 rounded-xl flex items-start gap-1.5 border border-blue-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                          <span><strong>Recommended Action:</strong> {item.next_step}</span>
                        </div>
                      )}

                      {item.limitations && (
                        <div className="text-[10px] text-slate-400 italic pt-0.5">
                          Limitation: {item.limitations}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* EXECUTIVE REPORT MODAL */}
      {/* ============================================================= */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[85vh] shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {reportData?.title || 'Executive Analytics Report'}
                </h3>
              </div>
              <button
                onClick={() => setReportModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-semibold px-2 py-1 rounded"
              >
                Close
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs text-slate-700">
              {loadingReport ? (
                <div className="h-48 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                  <span>Synthesizing structured analytics executive report...</span>
                </div>
              ) : reportData?.error ? (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl">{reportData.error}</div>
              ) : reportData ? (
                <div className="space-y-4 font-mono text-[11px] bg-slate-900 text-slate-100 p-4 rounded-xl overflow-x-auto">
                  <pre>{JSON.stringify(reportData, null, 2)}</pre>
                </div>
              ) : null}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                onClick={() => {
                  if (!reportData) return;
                  const blob = new Blob([JSON.stringify(reportData, null, 2)], {
                    type: 'application/json',
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `analytics_report_${selectedDataset?.filename || 'dataset'}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={!reportData || loadingReport}
                className="px-4 py-2 bg-blue-600 text-white font-semibold text-xs rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download JSON Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalyticsPage;
