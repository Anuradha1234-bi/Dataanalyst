import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Lightbulb,
  RefreshCw,
  Search,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Database,
  Layers,
  Sparkles,
  ShieldAlert,
  ArrowUpRight,
  TrendingUp,
  BarChart3,
  PieChart,
  Target,
  Columns,
  Activity,
  Grid,
  BarChart2,
} from 'lucide-react';
import { datasetService } from '../services/datasetService';
import { analyticsService } from '../services/analyticsService';
import { extractErrorMessage } from '../services/api';
import { AnalyticalChart } from '../components/AnalyticalChart';

// ─── Summary Metric Cards ─────────────────────────────────────────────────────
const SummaryMetrics = ({ insightsData }) => {
  const insights = insightsData?.insights || [];
  const total = insights.length;
  const critical = insights.filter((i) => (i.severity || '').toLowerCase() === 'critical').length;
  const warning = insights.filter((i) => (i.severity || '').toLowerCase() === 'warning').length;
  const informational = insights.filter((i) => (i.severity || '').toLowerCase() === 'informational').length;
  const affectedCols = new Set(
    insights
      .flatMap((i) => i.columns_involved || [])
      .filter((c) => c && typeof c === 'string' && c.trim() !== '' && c !== 'All Columns')
  ).size;

  const metrics = [
    {
      label: 'Total Insights',
      value: total,
      icon: Lightbulb,
      color: 'text-[#4778E8]',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
    },
    {
      label: 'Critical',
      value: critical,
      icon: ShieldAlert,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
    },
    {
      label: 'Warnings',
      value: warning,
      icon: AlertTriangle,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    },
    {
      label: 'Informational',
      value: informational,
      icon: Info,
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
      border: 'border-blue-400/20',
    },
    {
      label: 'Affected Columns',
      value: affectedCols,
      icon: Columns,
      color: 'text-[#8B7CE8]',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {metrics.map((m) => {
        const Icon = m.icon;
        return (
          <div
            key={m.label}
            className={`bg-[var(--card-bg)] border ${m.border} rounded-xl p-3.5 shadow-xs flex items-center gap-3 transition-all hover:shadow-sm`}
          >
            <div className={`w-9 h-9 rounded-lg ${m.bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-4.5 h-4.5 ${m.color}`} />
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold text-[var(--text-primary)] leading-tight">{m.value}</div>
              <div className="text-[10px] text-[var(--text-muted)] font-medium leading-tight truncate">{m.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Graphical Visual Analytics Section ───────────────────────────────────────
const VisualAnalyticsSection = ({ chartsData, filteredInsights, isFiltered, totalDatasetRows }) => {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'quality', 'outliers', 'correlations', 'all'
  const [selectedNumCol, setSelectedNumCol] = useState(null);
  const [selectedCatCol, setSelectedCatCol] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (chartsData?.numeric_distribution?.available_columns?.length > 0) {
      setSelectedNumCol(chartsData.numeric_distribution.available_columns[0]);
    }
    if (chartsData?.category_distribution?.available_columns?.length > 0) {
      setSelectedCatCol(chartsData.category_distribution.available_columns[0]);
    }
  }, [chartsData]);

  if (!chartsData) return null;

  // A. Severity Distribution
  const severityChartData = useMemo(() => {
    if (isFiltered) {
      const crit = filteredInsights.filter((i) => (i.severity || '').toLowerCase() === 'critical').length;
      const warn = filteredInsights.filter((i) => (i.severity || '').toLowerCase() === 'warning').length;
      const info = filteredInsights.filter((i) => (i.severity || '').toLowerCase() === 'informational').length;
      return {
        chart_type: 'donut',
        title: 'Filtered Insight Severity Distribution',
        data_points: [
          { label: 'Critical', value: crit, color: '#EF4444', x: 'Critical', y: crit },
          { label: 'Warning', value: warn, color: '#F59E0B', x: 'Warning', y: warn },
          { label: 'Informational', value: info, color: '#4778E8', x: 'Informational', y: info },
        ].filter((p) => p.value > 0),
      };
    }
    return chartsData.severity_distribution;
  }, [chartsData, filteredInsights, isFiltered]);

  // B. Insights by Type
  const typeChartData = useMemo(() => {
    if (isFiltered) {
      const counts = {};
      const typeLabels = {
        missing_values: 'Missing Values',
        duplicate_columns: 'Duplicate / Redundant',
        correlation: 'Correlation',
        trend: 'Trend',
        outlier: 'Anomaly / Outlier',
        distribution: 'Distribution',
        concentration: 'Category Concentration',
        data_quality: 'General Data Quality',
      };
      const typeColors = {
        missing_values: '#EF4444',
        duplicate_columns: '#E9BD62',
        correlation: '#38A995',
        trend: '#4778E8',
        outlier: '#F2A18D',
        distribution: '#06B6D4',
        concentration: '#8B7CE8',
        data_quality: '#9BA6B8',
      };
      filteredInsights.forEach((ins) => {
        const t = ins.type || 'data_quality';
        counts[t] = (counts[t] || 0) + 1;
      });
      const points = Object.entries(counts).map(([k, cnt]) => ({
        label: typeLabels[k] || k.replace(/_/g, ' '),
        value: cnt,
        color: typeColors[k] || '#4778E8',
        x: typeLabels[k] || k.replace(/_/g, ' '),
        y: cnt,
      })).sort((a, b) => b.value - a.value);

      return {
        chart_type: 'bar',
        title: 'Filtered Insights by Type',
        x_axis_label: 'Classification Type',
        y_axis_label: 'Insight Count',
        data_points: points,
      };
    }
    return chartsData.type_distribution;
  }, [chartsData, filteredInsights, isFiltered]);

  // F. Numeric Distribution with Column Switching
  const activeNumDistData = useMemo(() => {
    if (!chartsData?.numeric_distribution) return null;
    const base = chartsData.numeric_distribution;
    const col = selectedNumCol || base.column;
    const points = base.columns_data?.[col] || base.data_points || [];
    return {
      ...base,
      title: `Numeric Distribution: ${col || 'Feature'}`,
      x_axis_label: col || 'Value Range',
      data_points: points,
    };
  }, [chartsData, selectedNumCol]);

  // G. Category Distribution with Column Switching
  const activeCatDistData = useMemo(() => {
    if (!chartsData?.category_distribution) return null;
    const base = chartsData.category_distribution;
    const col = selectedCatCol || base.column;
    const points = base.columns_data?.[col] || base.data_points || [];
    return {
      ...base,
      title: `Category Distribution: ${col || 'Category'}`,
      x_axis_label: col || 'Category',
      data_points: points,
    };
  }, [chartsData, selectedCatCol]);

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-5 shadow-xs space-y-4">
      {/* Visual Analytics Header & Tab Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[var(--border-color)] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[#8B7CE8]">
            <BarChart3 className="w-4.5 h-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">Graphical Analytics & Visual Evidence</h2>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                7 Visualizations
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Dynamic, dataset-aware visual distributions, missing values, outliers, correlations, and frequency analysis.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Tab Navigation */}
          <div className="flex items-center bg-[var(--card-bg-subtle)] rounded-xl p-1 border border-[var(--border-color)] text-xs font-semibold overflow-x-auto">
            <button
              onClick={() => { setActiveTab('overview'); setIsCollapsed(false); }}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => { setActiveTab('quality'); setIsCollapsed(false); }}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'quality'
                  ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Missing Values
            </button>
            <button
              onClick={() => { setActiveTab('outliers'); setIsCollapsed(false); }}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'outliers'
                  ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Outliers & Distribution
            </button>
            <button
              onClick={() => { setActiveTab('correlations'); setIsCollapsed(false); }}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'correlations'
                  ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Correlations & Categories
            </button>
            <button
              onClick={() => { setActiveTab('all'); setIsCollapsed(false); }}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'all'
                  ? 'bg-[#4778E8] text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              All Charts
            </button>
          </div>

          {/* Collapse/Expand Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 border border-[var(--border-color)] rounded-xl hover:bg-[var(--card-bg-subtle)] text-[var(--text-secondary)] transition-colors cursor-pointer"
            title={isCollapsed ? 'Expand Charts Section' : 'Collapse Charts Section'}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Render Chart Content if Not Collapsed */}
      {!isCollapsed && (
        <div className="space-y-6 pt-1">
          {/* 1. OVERVIEW TAB: Severity Donut + Type Distribution Bar */}
          {(activeTab === 'overview' || activeTab === 'all') && (
            <div className="space-y-2">
              {activeTab === 'all' && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  <PieChart className="w-3.5 h-3.5 text-blue-500" />
                  <span>1. Insight Distribution Overview</span>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="min-w-0">
                  <AnalyticalChart
                    chartData={severityChartData}
                    showExport={true}
                    downloadFilename="insight_severity_distribution"
                    emptyMessage="No insights available to plot severity distribution."
                  />
                </div>
                <div className="min-w-0">
                  <AnalyticalChart
                    chartData={typeChartData}
                    showExport={true}
                    downloadFilename="insights_by_type_distribution"
                    emptyMessage="No insights available to plot type breakdown."
                  />
                </div>
              </div>
            </div>
          )}

          {/* 2. QUALITY TAB: Missing Values Analysis Bar */}
          {(activeTab === 'quality' || activeTab === 'all') && (
            <div className="space-y-2">
              {activeTab === 'all' && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  <span>2. Missing Values Analysis</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-normal ml-auto">Dataset-Wide Metric</span>
                </div>
              )}
              <div className="min-w-0">
                {chartsData.missing_values?.data_points?.length > 0 ? (
                  <AnalyticalChart
                    chartData={chartsData.missing_values}
                    showExport={true}
                    downloadFilename="missing_values_analysis"
                  />
                ) : (
                  <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-8 text-center text-xs text-[var(--text-secondary)] shadow-xs flex flex-col items-center justify-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    <span className="font-semibold text-[var(--text-primary)]">Zero Missing Values Detected</span>
                    <span>All attributes across {chartsData.total_rows?.toLocaleString() || totalDatasetRows || 'this'} records are 100% complete.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. OUTLIERS & DISTRIBUTION TAB: Box Plot + Histogram */}
          {(activeTab === 'outliers' || activeTab === 'all') && (
            <div className="space-y-2">
              {activeTab === 'all' && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  <Target className="w-3.5 h-3.5 text-purple-500" />
                  <span>3. Outlier IQR Bounds & Numerical Distributions</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-normal ml-auto">Dataset-Wide Metric</span>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Outlier Box Plot */}
                <div className="min-w-0">
                  {chartsData.outlier_analysis?.boxplot_data?.length > 0 ? (
                    <AnalyticalChart
                      chartData={chartsData.outlier_analysis}
                      showExport={true}
                      downloadFilename="outliers_boxplot_analysis"
                    />
                  ) : (
                    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-8 text-center text-xs text-[var(--text-secondary)] shadow-xs flex flex-col items-center justify-center gap-2">
                      <Target className="w-6 h-6 text-purple-400 opacity-60" />
                      <span className="font-semibold text-[var(--text-primary)]">No Substantial Outliers Detected</span>
                      <span>Numerical values are within normal Tukey 1.5x IQR boundary limits or insufficient sample size.</span>
                    </div>
                  )}
                </div>

                {/* Numeric Histogram */}
                <div className="min-w-0 space-y-2">
                  {chartsData.numeric_distribution?.available_columns?.length > 1 && (
                    <div className="flex items-center justify-end gap-2 text-xs">
                      <span className="text-[var(--text-muted)] font-medium">Select Feature:</span>
                      <select
                        value={selectedNumCol || ''}
                        onChange={(e) => setSelectedNumCol(e.target.value)}
                        className="bg-[var(--card-bg-subtle)] border border-[var(--border-color)] rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                      >
                        {chartsData.numeric_distribution.available_columns.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {activeNumDistData && activeNumDistData.data_points?.length > 0 ? (
                    <AnalyticalChart
                      chartData={activeNumDistData}
                      showExport={true}
                      downloadFilename={`numeric_dist_${selectedNumCol || 'feature'}`}
                    />
                  ) : (
                    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-8 text-center text-xs text-[var(--text-secondary)] shadow-xs flex flex-col items-center justify-center gap-2">
                      <BarChart2 className="w-6 h-6 text-teal-400 opacity-60" />
                      <span className="font-semibold text-[var(--text-primary)]">No Continuous Numeric Features</span>
                      <span>Frequency histograms require non-identifier continuous numeric variables.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 4. CORRELATIONS & CATEGORIES TAB: Heatmap + Category Bar */}
          {(activeTab === 'correlations' || activeTab === 'all') && (
            <div className="space-y-2">
              {activeTab === 'all' && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  <Grid className="w-3.5 h-3.5 text-teal-500" />
                  <span>4. Correlation Matrix & Category Breakdown</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-normal ml-auto">Dataset-Wide Metric</span>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Correlation Heatmap */}
                <div className="min-w-0">
                  {chartsData.correlation_heatmap?.categories?.length >= 2 ? (
                    <div className="space-y-1.5">
                      <AnalyticalChart
                        chartData={chartsData.correlation_heatmap}
                        showExport={true}
                        downloadFilename="numeric_correlation_matrix"
                      />
                      <p className="text-[10px] text-[var(--text-muted)] px-2 italic">
                        * Note: High correlation (r) measures linear association only and does not establish a causal relationship.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-8 text-center text-xs text-[var(--text-secondary)] shadow-xs flex flex-col items-center justify-center gap-2">
                      <Grid className="w-6 h-6 text-blue-400 opacity-60" />
                      <span className="font-semibold text-[var(--text-primary)]">Insufficient Numeric Columns for Correlation</span>
                      <span>A bivariate Pearson correlation matrix requires at least 2 non-constant numeric features.</span>
                    </div>
                  )}
                </div>

                {/* Category Breakdown Bar Chart */}
                <div className="min-w-0 space-y-2">
                  {chartsData.category_distribution?.available_columns?.length > 1 && (
                    <div className="flex items-center justify-end gap-2 text-xs">
                      <span className="text-[var(--text-muted)] font-medium">Select Category:</span>
                      <select
                        value={selectedCatCol || ''}
                        onChange={(e) => setSelectedCatCol(e.target.value)}
                        className="bg-[var(--card-bg-subtle)] border border-[var(--border-color)] rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                      >
                        {chartsData.category_distribution.available_columns.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {activeCatDistData && activeCatDistData.data_points?.length > 0 ? (
                    <AnalyticalChart
                      chartData={activeCatDistData}
                      showExport={true}
                      downloadFilename={`category_dist_${selectedCatCol || 'feature'}`}
                    />
                  ) : (
                    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-8 text-center text-xs text-[var(--text-secondary)] shadow-xs flex flex-col items-center justify-center gap-2">
                      <BarChart3 className="w-6 h-6 text-purple-400 opacity-60" />
                      <span className="font-semibold text-[var(--text-primary)]">No Categorical Attributes Available</span>
                      <span>Category frequency distribution requires non-identifier categorical variables.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main InsightsPage ────────────────────────────────────────────────────────
export const InsightsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Dataset states
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState('original');
  const [loadingDatasets, setLoadingDatasets] = useState(true);

  // Insights data states
  const [insightsData, setInsightsData] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [insightsError, setInsightsError] = useState('');

  // UI Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');

  // 1. Fetch user's real datasets
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
        setInsightsError(extractErrorMessage(err));
      } finally {
        setLoadingDatasets(false);
      }
    };
    fetchDatasets();
  }, [searchParams]);

  // Persist dataset selection to localStorage
  useEffect(() => {
    if (selectedDatasetId) {
      localStorage.setItem('selected_dataset_id', String(selectedDatasetId));
    }
  }, [selectedDatasetId]);

  // 2. Fetch insights when dataset or version changes
  const fetchInsights = async () => {
    if (!selectedDatasetId) {
      setInsightsData(null);
      return;
    }

    setLoadingInsights(true);
    setInsightsError('');
    try {
      const data = await analyticsService.getInsights(selectedDatasetId, selectedVersion);
      setInsightsData(data);
    } catch (err) {
      setInsightsError(extractErrorMessage(err));
      setInsightsData(null);
    } finally {
      setLoadingInsights(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [selectedDatasetId, selectedVersion]);

  // Selected dataset object helper
  const selectedDataset = useMemo(() => {
    return datasets.find((d) => d.id === selectedDatasetId) || null;
  }, [datasets, selectedDatasetId]);

  const hasCleanedVersion = Boolean(
    selectedDataset?.cleaned_filename || selectedDataset?.has_cleaned_version
  );

  // Filtered insights list
  const filteredInsights = useMemo(() => {
    if (!insightsData?.insights) return [];
    return insightsData.insights.filter((item) => {
      // Type filter
      if (typeFilter !== 'all') {
        const itemType = (item.type || '').toLowerCase();
        const targetType = typeFilter.toLowerCase();
        if (targetType === 'outlier' || targetType === 'anomaly') {
          if (itemType !== 'outlier' && itemType !== 'anomaly') return false;
        } else if (itemType !== targetType) {
          return false;
        }
      }
      // Severity filter
      if (severityFilter !== 'all' && (item.severity || '').toLowerCase() !== severityFilter.toLowerCase()) {
        return false;
      }
      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(q);
        const matchesStatement = item.statement?.toLowerCase().includes(q);
        const matchesMetric = item.metric?.toLowerCase().includes(q);
        const matchesCols = item.columns_involved?.some((c) => c?.toLowerCase().includes(q));
        if (!matchesTitle && !matchesStatement && !matchesMetric && !matchesCols) return false;
      }
      return true;
    });
  }, [insightsData, typeFilter, severityFilter, searchQuery]);

  const isFiltered = typeFilter !== 'all' || severityFilter !== 'all' || searchQuery.trim() !== '';

  // Export insights as Markdown report
  const handleExportMarkdown = () => {
    if (!insightsData || !insightsData.insights) return;
    const title = `# Automated Insights Report: ${insightsData.dataset_name || 'Dataset'}\n\n`;
    const meta = `*Generated on:* ${new Date().toLocaleString()}\n` +
      `*Dataset ID:* #${insightsData.dataset_id}\n` +
      `*Version:* ${insightsData.version || selectedVersion}\n` +
      `*Total Dataset Rows:* ${insightsData.total_rows?.toLocaleString() || 'N/A'}\n` +
      `*Total Dataset Columns:* ${insightsData.total_columns?.toLocaleString() || 'N/A'}\n\n` +
      `### Summary Overview\n` +
      `- **Total Unique Insights:** ${insightsData.insights.length}\n` +
      `- **Critical Alerts:** ${insightsData.insights.filter((i) => (i.severity || '').toLowerCase() === 'critical').length}\n` +
      `- **Warnings:** ${insightsData.insights.filter((i) => (i.severity || '').toLowerCase() === 'warning').length}\n` +
      `- **Informational Findings:** ${insightsData.insights.filter((i) => (i.severity || '').toLowerCase() === 'informational').length}\n` +
      `- **Affected Columns:** ${new Set(insightsData.insights.flatMap((i) => i.columns_involved || []).filter((c) => c && c !== 'All Columns')).size}\n` +
      `- **High Confidence Observations:** ${insightsData.insights.filter((i) => (i.confidence || '').toLowerCase() === 'high').length}\n\n` +
      `---\n\n`;

    const body = insightsData.insights
      .map((ins, idx) => {
        return `### ${idx + 1}. ${ins.title}\n\n` +
          `- **Classification Type:** ${ins.type}\n` +
          `- **Severity:** ${ins.severity}\n` +
          `- **Confidence:** ${ins.confidence}\n` +
          (ins.metric ? `- **Key Metric:** ${ins.metric}\n` : '') +
          `- **Columns Involved:** ${ins.columns_involved?.join(', ') || 'N/A'}\n` +
          (ins.observations_used !== null && ins.observations_used !== undefined ? `- **Observations Analyzed:** ${ins.observations_used.toLocaleString()}\n` : '') +
          (ins.calculation_method ? `- **Methodology:** ${ins.calculation_method}\n` : '') +
          `\n**Statement:** ${ins.statement}\n\n` +
          (ins.limitations ? `*Limitations & Caveats:* ${ins.limitations}\n\n` : '') +
          (ins.next_step ? `*Recommended Action:* ${ins.next_step}\n\n` : '') +
          `---\n\n`;
      })
      .join('');

    const blob = new Blob([title + meta + body], { type: 'text/markdown;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `automated_insights_report_${insightsData.dataset_id}_${selectedVersion}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Severity badge styling
  const getSeverityBadge = (severity) => {
    const s = (severity || '').toLowerCase();
    if (s === 'critical') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
          <ShieldAlert className="w-3 h-3" />
          Critical
        </span>
      );
    }
    if (s === 'warning') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <AlertTriangle className="w-3 h-3" />
          Warning
        </span>
      );
    }
    if (s === 'positive') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3" />
          Positive
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
        <Info className="w-3 h-3" />
        Informational
      </span>
    );
  };

  // Type badge styling
  const getTypeBadge = (type) => {
    const t = (type || '').toLowerCase();
    const configMap = {
      missing_values: {
        label: 'Missing Values',
        style: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
      },
      duplicate_columns: {
        label: 'Duplicate / Redundant',
        style: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
      },
      correlation: {
        label: 'Correlation',
        style: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
      },
      trend: {
        label: 'Trend',
        style: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
      },
      outlier: {
        label: 'Anomaly / Outlier',
        style: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
      },
      anomaly: {
        label: 'Anomaly / Outlier',
        style: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
      },
      distribution: {
        label: 'Distribution',
        style: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
      },
      concentration: {
        label: 'Category Concentration',
        style: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
      },
      data_quality: {
        label: 'Data Quality',
        style: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
      },
    };
    const cfg = configMap[t] || {
      label: type ? type.replace(/_/g, ' ') : 'General',
      style: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
    };
    return (
      <span
        className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border uppercase tracking-wider ${cfg.style}`}
      >
        {cfg.label}
      </span>
    );
  };

  // Severity left border color
  const getSeverityBorderColor = (severity) => {
    const s = (severity || '').toLowerCase();
    if (s === 'critical') return 'border-l-red-500';
    if (s === 'warning') return 'border-l-amber-500';
    if (s === 'positive') return 'border-l-emerald-500';
    return 'border-l-blue-400';
  };

  const hasInsights = !loadingInsights && insightsData?.insights && insightsData.insights.length > 0;

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      {/* ── Top Header & Dataset Selection Bar ─────────────────────────────── */}
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[#4778E8]">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[var(--text-primary)]">Automated Insights</h1>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Autonomous dataset observations, category concentrations, distributions, and key drivers.
              </p>
            </div>
          </div>

          {/* Dataset & Version Selectors */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Dataset Dropdown */}
            <div className="relative min-w-[220px]">
              <select
                value={selectedDatasetId || ''}
                onChange={(e) => {
                  const id = parseInt(e.target.value, 10);
                  setSelectedDatasetId(id);
                  setSearchParams({ dataset_id: id }, { replace: true });
                }}
                disabled={loadingDatasets || datasets.length === 0}
                className="w-full appearance-none bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl px-3.5 py-2 pr-9 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#4778E8]/25 cursor-pointer disabled:opacity-50 transition-colors"
              >
                {datasets.length === 0 ? (
                  <option value="">No datasets available</option>
                ) : (
                  datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.original_filename || d.filename} (#{d.id})
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="w-4 h-4 text-[var(--text-muted)] absolute right-3 top-2.5 pointer-events-none" />
            </div>

            {/* Cleaned vs Original Version Toggle */}
            {hasCleanedVersion && (
              <div className="flex items-center bg-[var(--card-bg-subtle)] rounded-xl p-1 border border-[var(--border-color)] text-xs font-semibold">
                <button
                  onClick={() => setSelectedVersion('original')}
                  className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                    selectedVersion === 'original'
                      ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Original
                </button>
                <button
                  onClick={() => setSelectedVersion('cleaned')}
                  className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                    selectedVersion === 'cleaned'
                      ? 'bg-[#4778E8] text-white shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Cleaned
                </button>
              </div>
            )}

            {/* Refresh Button */}
            <button
              onClick={fetchInsights}
              disabled={loadingInsights || !selectedDatasetId}
              className="p-2 border border-[var(--border-color)] rounded-xl hover:bg-[var(--card-bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh Insights"
            >
              <RefreshCw className={`w-4 h-4 ${loadingInsights ? 'animate-spin text-[#4778E8]' : ''}`} />
            </button>

            {/* Export Report */}
            <button
              onClick={handleExportMarkdown}
              disabled={!insightsData || !insightsData.insights || insightsData.insights.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--card-bg)] border border-[var(--border-color)] hover:bg-[var(--card-bg-subtle)] text-xs font-semibold text-[var(--text-primary)] rounded-xl shadow-2xs transition-colors cursor-pointer disabled:opacity-40"
              title="Export Insights Summary as Markdown"
            >
              <Download className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
              <span>Export Report</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Error Alert ──────────────────────────────────────────────────────── */}
      {insightsError && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{insightsError}</span>
          </div>
          <button
            onClick={fetchInsights}
            className="px-3 py-1 bg-[var(--card-bg)] border border-red-500/20 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10 font-semibold cursor-pointer transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Summary Metrics (shown when insights exist) ───────────────────── */}
      {hasInsights && (
        <SummaryMetrics insightsData={insightsData} />
      )}

      {/* ── Graphical Visual Analytics Section (7 Charts) ────────────────────── */}
      {hasInsights && insightsData?.charts_data && (
        <VisualAnalyticsSection
          chartsData={insightsData.charts_data}
          filteredInsights={filteredInsights}
          isFiltered={isFiltered}
          totalDatasetRows={insightsData.total_rows}
        />
      )}

      {/* ── Search & Filters Bar ─────────────────────────────────────────────── */}
      {hasInsights && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl px-4 py-3 shadow-xs">
          {/* Search Input */}
          <div className="flex items-center gap-2 flex-1 w-full max-w-sm">
            <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              placeholder="Search insights by title, column, or statement..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none w-full bg-transparent"
            />
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs bg-[var(--card-bg-subtle)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-[var(--text-primary)] font-medium cursor-pointer transition-colors"
            >
              <option value="all">All Types</option>
              <option value="missing_values">Missing Values</option>
              <option value="duplicate_columns">Duplicate / Redundant</option>
              <option value="correlation">Correlation</option>
              <option value="trend">Trend</option>
              <option value="outlier">Anomaly / Outlier</option>
              <option value="distribution">Distribution</option>
              <option value="concentration">Category Concentration</option>
              <option value="data_quality">General Data Quality</option>
            </select>

            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="text-xs bg-[var(--card-bg-subtle)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-[var(--text-primary)] font-medium cursor-pointer transition-colors"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="informational">Informational</option>
            </select>

            <span className="text-xs text-[var(--text-secondary)] font-medium ml-1 whitespace-nowrap">
              {filteredInsights.length} of {insightsData.insights.length}
            </span>
          </div>
        </div>
      )}

      {/* ── Loading Skeleton ──────────────────────────────────────────────────── */}
      {loadingInsights && (
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-16 text-center shadow-xs">
          <RefreshCw className="w-8 h-8 text-[#4778E8] animate-spin mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Synthesizing automated insights...</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Analyzing distributions, key drivers, and statistical patterns across records.
          </p>
        </div>
      )}

      {/* ── Empty State: No Datasets ─────────────────────────────────────────── */}
      {!loadingDatasets && datasets.length === 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-14 text-center shadow-xs">
          <Database className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">No Datasets Available</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto mt-1">
            Please upload a dataset to generate automated insights and observations.
          </p>
        </div>
      )}

      {/* ── Empty State: No Insights for Dataset ─────────────────────────────── */}
      {!loadingInsights && selectedDatasetId && (!insightsData?.insights || insightsData.insights.length === 0) && !insightsError && (
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-14 text-center shadow-xs">
          <Sparkles className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">No Substantial Insights Detected</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto mt-1">
            All variables in this dataset appear normally balanced without critical class skew or correlations above baseline thresholds.
          </p>
        </div>
      )}

      {/* ── Insights Cards Grid ───────────────────────────────────────────────── */}
      {!loadingInsights && filteredInsights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredInsights.map((insight) => (
            <div
              key={insight.id}
              className={`bg-[var(--card-bg)] border border-[var(--border-color)] border-l-4 ${getSeverityBorderColor(insight.severity)} hover:shadow-sm rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between`}
            >
              <div>
                {/* Header tags: Type, Severity, Confidence */}
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getTypeBadge(insight.type)}
                    {getSeverityBadge(insight.severity)}
                  </div>
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">
                    {insight.confidence} Confidence
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-sm font-bold text-[var(--text-primary)] leading-snug">
                  {insight.title}
                </h3>

                {/* Metric callout if available */}
                {insight.metric && (
                  <div className="mt-2.5 inline-block px-2.5 py-1 rounded-lg bg-[var(--primary-light)] text-[#4778E8] dark:text-blue-300 text-xs font-semibold">
                    {insight.metric}
                  </div>
                )}

                {/* Narrative Statement */}
                <p className="text-xs text-[var(--text-secondary)] mt-2.5 leading-relaxed">
                  {insight.statement}
                </p>

                {/* Limitations / Caveats Note */}
                {insight.limitations && (
                  <div className="mt-3 p-2.5 rounded-xl bg-[var(--card-bg-subtle)] border border-[var(--border-color)] text-[11px] text-[var(--text-muted)] flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 mt-0.5" />
                    <span>{insight.limitations}</span>
                  </div>
                )}
              </div>

              {/* Columns involved footer */}
              {insight.columns_involved && insight.columns_involved.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] gap-2 flex-wrap">
                  <span className="text-[var(--text-muted)] font-medium shrink-0">Columns:</span>
                  <div className="flex flex-wrap gap-1">
                    {insight.columns_involved.map((col, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded bg-[var(--card-bg-subtle)] text-[var(--text-secondary)] font-mono text-[10px] border border-[var(--border-subtle)]"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── No matching filter results ────────────────────────────────────────── */}
      {!loadingInsights && insightsData?.insights && insightsData.insights.length > 0 && filteredInsights.length === 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-12 text-center shadow-xs">
          <Search className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3 opacity-50" />
          <p className="text-sm font-semibold text-[var(--text-primary)]">No insights match your filters</p>
          <p className="text-xs text-[var(--text-secondary)] mt-1 mb-3">
            Try adjusting the search query or clearing the active filters.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setTypeFilter('all');
              setSeverityFilter('all');
            }}
            className="text-xs font-semibold text-[#4778E8] hover:underline cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
};

export default InsightsPage;
