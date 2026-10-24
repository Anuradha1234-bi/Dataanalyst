import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Database,
  UploadCloud,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Layers,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  BarChart3,
  BarChart2,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Calendar,
  ChevronDown,
  Check,
  ExternalLink,
  Brain,
  Clock,
  Activity,
  FileText,
  Info,
} from 'lucide-react';
import { datasetService } from '../services/datasetService';
import { analyticsService } from '../services/analyticsService';
import { analysisService } from '../services/analysisService';
import { AnalyticalChart } from '../components/AnalyticalChart';

// Smart categorical dimension selector: prefers meaningful categorical columns (city, region, category, customer_type, etc.)
// and avoids unique identifiers, emails, names, or near-unique text columns.
const findBestCategoryCol = (catCols, summaries = []) => {
  if (!catCols || catCols.length === 0) return '';
  const isAvoidable = (name) => {
    const l = name.toLowerCase();
    return l.includes('name') || l.includes('email') || l.includes('phone') || l.includes('address') || l.includes('id') || l.includes('code');
  };
  const isPreferred = (name) => {
    const l = name.toLowerCase();
    return ['city', 'region', 'category', 'type', 'status', 'country', 'segment', 'method', 'department', 'gender', 'state', 'tier', 'channel', 'priority', 'level'].some((term) => l.includes(term));
  };

  // 1. High-priority business category columns
  const preferred = catCols.find((c) => isPreferred(c));
  if (preferred) return preferred;

  // 2. Non-avoidable columns with healthy low/moderate cardinality
  const nonAvoidable = catCols.filter((c) => !isAvoidable(c));
  if (nonAvoidable.length > 0) {
    if (summaries && summaries.length > 0) {
      const scored = nonAvoidable.map((c) => {
        const s = summaries.find((sum) => sum.name === c);
        return { c, uniq: s?.unique_count || 999 };
      }).sort((a, b) => a.uniq - b.uniq);
      return scored[0].c;
    }
    return nonAvoidable[0];
  }

  // 3. Fallback
  return catCols[0];
};

// Determines whether a metric column represents an intensive rate/income/price/score (where average is standard)
const prefersAverageAggregation = (colName) => {
  if (!colName) return false;
  const l = colName.toLowerCase();
  return ['income', 'salary', 'price', 'rate', 'pct', 'percent', 'age', 'score', 'ratio', 'margin', 'avg'].some((t) => l.includes(t));
};

export const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // All user datasets
  const [datasets, setDatasets] = useState([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);

  // Selected dataset
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [datasetDropdownOpen, setDatasetDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Dataset-driven analytical state
  const [overview, setOverview] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(false);

  // Quality data
  const [qualityData, setQualityData] = useState(null);
  const [loadingQuality, setLoadingQuality] = useState(false);

  // Automated Insights
  const [insights, setInsights] = useState([]);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Recent Activity / Query History
  const [recentActivity, setRecentActivity] = useState([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  // Trend Chart State (Dynamic)
  const [trendDateCol, setTrendDateCol] = useState('');
  const [trendMetricCol, setTrendMetricCol] = useState('');
  const [trendAgg, setTrendAgg] = useState('sum');
  const [trendChartData, setTrendChartData] = useState(null);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [trendError, setTrendError] = useState('');

  // Category Bar Chart State (Dynamic)
  const [catCategoryCol, setCatCategoryCol] = useState('');
  const [catMetricCol, setCatMetricCol] = useState('');
  const [categoryChartData, setCategoryChartData] = useState(null);
  const [loadingCategoryChart, setLoadingCategoryChart] = useState(false);
  const [categoryError, setCategoryError] = useState('');

  // 1. Numeric Distribution — Histogram State (Dynamic)
  const [histCol, setHistCol] = useState('');
  const [histBins, setHistBins] = useState(10);
  const [histChartData, setHistChartData] = useState(null);
  const [loadingHist, setLoadingHist] = useState(false);
  const [histError, setHistError] = useState('');

  // 2. Relationship Analysis — Scatter Plot State (Dynamic)
  const [scatterXCol, setScatterXCol] = useState('');
  const [scatterYCol, setScatterYCol] = useState('');
  const [scatterChartData, setScatterChartData] = useState(null);
  const [loadingScatter, setLoadingScatter] = useState(false);
  const [scatterError, setScatterError] = useState('');

  // 1. Initial Load: Fetch All Datasets & Determine Active Dataset
  useEffect(() => {
    let isMounted = true;
    const fetchDatasets = async () => {
      try {
        setLoadingDatasets(true);
        const data = await datasetService.getDatasets();
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : [];
        setDatasets(list);

        if (list.length > 0) {
          // Check URL query param -> localStorage -> default to first
          const params = new URLSearchParams(location.search);
          const paramId = params.get('dataset_id') || params.get('id');
          const savedId = localStorage.getItem('selected_dataset_id');

          let active = null;
          if (paramId) {
            active = list.find((d) => String(d.id) === String(paramId));
          }
          if (!active && savedId) {
            active = list.find((d) => String(d.id) === String(savedId));
          }
          if (!active) {
            active = list[0];
          }
          setSelectedDataset(active);
          try {
            localStorage.setItem('selected_dataset_id', String(active.id));
          } catch {}
        } else {
          setSelectedDataset(null);
        }
      } catch (err) {
        if (isMounted) setDatasets([]);
      } finally {
        if (isMounted) setLoadingDatasets(false);
      }
    };

    fetchDatasets();
    return () => {
      isMounted = false;
    };
  }, [location.search]);

  // Close dataset dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDatasetDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // 2. Fetch Dataset-Driven Details when selectedDataset changes
  useEffect(() => {
    if (!selectedDataset) {
      setOverview(null);
      setQualityData(null);
      setInsights([]);
      setRecentActivity([]);
      setTrendChartData(null);
      setCategoryChartData(null);
      setHistChartData(null);
      setScatterChartData(null);
      return;
    }

    const datasetId = selectedDataset.id;
    let isMounted = true;

    // A. Overview (Metadata, Schema, Date/Numeric/Categorical column detection)
    const loadOverview = async () => {
      try {
        setLoadingOverview(true);
        const ov = await analyticsService.getOverview(datasetId);
        if (!isMounted) return;
        setOverview(ov);

        // Pre-configure Trend Chart columns & intelligent aggregation
        const dateCols = ov.available_date_columns || [];
        const numCols = ov.available_numeric_columns || [];
        const catCols = ov.available_categorical_columns || [];
        const colSummaries = ov.column_summary || [];

        if (dateCols.length > 0 && numCols.length > 0) {
          setTrendDateCol(dateCols[0]);
          const defaultMetric = numCols[0];
          setTrendMetricCol(defaultMetric);
          setTrendAgg(prefersAverageAggregation(defaultMetric) ? 'mean' : 'sum');
        } else {
          setTrendDateCol('');
          setTrendMetricCol('');
          setTrendChartData(null);
        }

        // Pre-configure Category Chart columns using smart category selector
        if (catCols.length > 0 && numCols.length > 0) {
          const bestCat = findBestCategoryCol(catCols, colSummaries);
          setCatCategoryCol(bestCat);
          setCatMetricCol(numCols[0]);
        } else {
          setCatCategoryCol('');
          setCatMetricCol('');
          setCategoryChartData(null);
        }

        // Pre-configure Histogram column
        if (numCols.length > 0) {
          setHistCol(numCols[0]);
        } else {
          setHistCol('');
          setHistChartData(null);
        }

        // Pre-configure Scatter columns (requires >= 2 numeric columns for relationship analysis)
        if (numCols.length >= 2) {
          setScatterXCol(numCols[0]);
          setScatterYCol(numCols[1]);
        } else if (numCols.length === 1) {
          setScatterXCol(numCols[0]);
          setScatterYCol('');
          setScatterChartData(null);
        } else {
          setScatterXCol('');
          setScatterYCol('');
          setScatterChartData(null);
        }
      } catch (err) {
        if (isMounted) setOverview(null);
      } finally {
        if (isMounted) setLoadingOverview(false);
      }
    };

    // B. Quality Data (aligned to original version to match overview and insights)
    const loadQuality = async () => {
      try {
        setLoadingQuality(true);
        const q = await datasetService.getDatasetQuality(datasetId, 'original');
        if (isMounted) setQualityData(q);
      } catch {
        if (isMounted) setQualityData(null);
      } finally {
        if (isMounted) setLoadingQuality(false);
      }
    };

    // C. Automated Insights
    const loadInsights = async () => {
      try {
        setLoadingInsights(true);
        const res = await analyticsService.getInsights(datasetId, 'original');
        if (isMounted) setInsights(res?.insights || []);
      } catch {
        if (isMounted) setInsights([]);
      } finally {
        if (isMounted) setLoadingInsights(false);
      }
    };

    // D. Recent Analysis History
    const loadActivity = async () => {
      try {
        setLoadingActivity(true);
        const hist = await analysisService.getHistory(datasetId, 5);
        if (isMounted) setRecentActivity(hist?.history || []);
      } catch {
        if (isMounted) setRecentActivity([]);
      } finally {
        if (isMounted) setLoadingActivity(false);
      }
    };

    loadOverview();
    loadQuality();
    loadInsights();
    loadActivity();

    return () => {
      isMounted = false;
    };
  }, [selectedDataset]);

  // 3. Generate Time-Series Trend Chart dynamically when columns or aggregation are selected
  useEffect(() => {
    if (!selectedDataset || !trendDateCol || !trendMetricCol) {
      setTrendChartData(null);
      return;
    }

    let isMounted = true;
    const fetchTrend = async () => {
      try {
        setLoadingTrend(true);
        setTrendError('');
        const res = await analyticsService.generateChart({
          dataset_id: selectedDataset.id,
          chart_type: 'line',
          x_column: trendDateCol,
          y_column: trendMetricCol,
          aggregation: trendAgg,
        });
        if (isMounted) {
          setTrendChartData(res);
        }
      } catch (err) {
        if (isMounted) {
          setTrendError(err?.response?.data?.detail || 'Unable to compute trendline for selected columns.');
          setTrendChartData(null);
        }
      } finally {
        if (isMounted) setLoadingTrend(false);
      }
    };

    fetchTrend();
    return () => {
      isMounted = false;
    };
  }, [selectedDataset, trendDateCol, trendMetricCol, trendAgg]);

  // 4. Generate Category Bar Chart dynamically when columns are selected
  useEffect(() => {
    if (!selectedDataset || !catCategoryCol || !catMetricCol) {
      setCategoryChartData(null);
      return;
    }

    let isMounted = true;
    const fetchCategory = async () => {
      try {
        setLoadingCategoryChart(true);
        setCategoryError('');
        const res = await analyticsService.generateChart({
          dataset_id: selectedDataset.id,
          chart_type: 'bar',
          x_column: catCategoryCol,
          y_column: catMetricCol,
          aggregation: 'sum',
          limit: 8,
        });
        if (isMounted) {
          setCategoryChartData(res);
        }
      } catch (err) {
        if (isMounted) {
          setCategoryError(err?.response?.data?.detail || 'Unable to compute category breakdown for selected columns.');
          setCategoryChartData(null);
        }
      } finally {
        if (isMounted) setLoadingCategoryChart(false);
      }
    };

    fetchCategory();
    return () => {
      isMounted = false;
    };
  }, [selectedDataset, catCategoryCol, catMetricCol]);

  // 5. Generate Numeric Distribution Histogram dynamically
  useEffect(() => {
    if (!selectedDataset || !histCol) {
      setHistChartData(null);
      return;
    }

    let isMounted = true;
    const fetchHistogram = async () => {
      try {
        setLoadingHist(true);
        setHistError('');
        const res = await analyticsService.generateChart({
          dataset_id: selectedDataset.id,
          chart_type: 'histogram',
          x_column: histCol,
          bins: histBins,
        });
        if (isMounted) {
          setHistChartData(res);
        }
      } catch (err) {
        if (isMounted) {
          setHistError(err?.response?.data?.detail || 'Unable to compute distribution histogram.');
          setHistChartData(null);
        }
      } finally {
        if (isMounted) setLoadingHist(false);
      }
    };

    fetchHistogram();
    return () => {
      isMounted = false;
    };
  }, [selectedDataset, histCol, histBins]);

  // 6. Generate Relationship Analysis Scatter Plot dynamically
  useEffect(() => {
    if (!selectedDataset || !scatterXCol || !scatterYCol) {
      setScatterChartData(null);
      return;
    }

    let isMounted = true;
    const fetchScatter = async () => {
      try {
        setLoadingScatter(true);
        setScatterError('');
        const res = await analyticsService.generateChart({
          dataset_id: selectedDataset.id,
          chart_type: 'scatter',
          x_column: scatterXCol,
          y_column: scatterYCol,
        });
        if (isMounted) {
          setScatterChartData(res);
        }
      } catch (err) {
        if (isMounted) {
          setScatterError(err?.response?.data?.detail || 'Unable to compute scatter plot.');
          setScatterChartData(null);
        }
      } finally {
        if (isMounted) setLoadingScatter(false);
      }
    };

    fetchScatter();
    return () => {
      isMounted = false;
    };
  }, [selectedDataset, scatterXCol, scatterYCol]);

  // Switch Dataset Handler
  const handleSelectDataset = (d) => {
    setSelectedDataset(d);
    setDatasetDropdownOpen(false);
    try {
      localStorage.setItem('selected_dataset_id', String(d.id));
    } catch {}
    const searchParams = new URLSearchParams(location.search);
    searchParams.set('dataset_id', String(d.id));
    navigate(`${location.pathname}?${searchParams.toString()}`);
  };

  // Calculations for KPI Cards
  const displayName = user?.full_name || user?.name || 'Analyst';
  const totalDatasets = datasets.length;
  const totalRowsIngested = datasets.reduce(
    (acc, d) => acc + (d.row_count ?? d.rows ?? 0),
    0
  );

  const selectedRows = selectedDataset
    ? selectedDataset.row_count ?? selectedDataset.rows ?? overview?.rows ?? 0
    : totalRowsIngested;

  const selectedCols = selectedDataset
    ? selectedDataset.column_count ?? selectedDataset.columns ?? overview?.columns ?? 0
    : 0;

  const qualityScore = qualityData?.summary?.quality_score !== undefined
    ? Math.round(qualityData.summary.quality_score)
    : null;

  const missingCount = qualityData?.summary?.missing_cells ?? 0;
  const missingPct = qualityData?.summary?.missing_percentage !== undefined
    ? qualityData.summary.missing_percentage.toFixed(1)
    : '0.0';

  // Visualization 3: Missing Values by Column — Bar Chart Data Formatting
  const missingColumnsList = qualityData?.missing_report?.columns_with_missing || [];
  const missingChartData = missingColumnsList.length > 0 ? {
    chart_type: 'bar',
    title: 'Missing Values by Column',
    x_axis_label: 'Feature Column',
    y_axis_label: 'Missing Count',
    data_points: missingColumnsList.map((col) => ({
      label: col.column_name,
      value: col.missing_count,
      color: '#F59E0B',
      pct: col.missing_percentage,
    })),
  } : null;

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const recentDatasets = datasets.slice(0, 5);
  const selectedName = selectedDataset?.original_filename || selectedDataset?.filename || 'No Dataset Selected';

  return (
    <div className="max-w-7xl mx-auto space-y-8 py-4 sm:py-6 px-3 sm:px-6">
      {/* =========================================================================
          SECTION 1: WELCOME BANNER WITH DATASET SELECTOR & PRIMARY ACTIONS
      ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs relative overflow-hidden transition-colors">
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 text-[#059669] text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Data Analyst Workspace</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111827] dark:text-white">
              Welcome, {displayName}
            </h1>

            <p className="text-xs sm:text-sm text-[#64748B] dark:text-slate-400 leading-relaxed">
              Your dataset-driven workspace is connected. Metrics, time-series trends, categorical distributions, and automated insights are dynamically computed from your active dataset.
            </p>

            {/* Working Dataset Selector Switcher */}
            <div className="pt-1 flex items-center gap-2 flex-wrap text-xs">
              <span className="font-semibold text-slate-500 dark:text-slate-400">Working Dataset:</span>
              <div className="relative inline-block text-left" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDatasetDropdownOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E2E8F0] dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[#111827] dark:text-white font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#059669]" />
                  <span className="truncate max-w-[200px] sm:max-w-[280px]">{selectedName}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {datasetDropdownOpen && (
                  <div className="absolute left-0 mt-1.5 w-72 rounded-2xl bg-white dark:bg-slate-800 border border-[#E2E8F0] dark:border-slate-700 shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700">
                      Switch Working Dataset
                    </div>
                    {datasets.length === 0 ? (
                      <div className="px-3.5 py-2.5 text-xs text-slate-500">
                        No datasets uploaded yet
                      </div>
                    ) : (
                      <div className="max-h-60 overflow-y-auto py-1">
                        {datasets.map((d) => {
                          const isSelected = selectedDataset?.id === d.id;
                          const name = d.original_filename || d.filename;
                          return (
                            <button
                              key={d.id}
                              onClick={() => handleSelectDataset(d)}
                              className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/60 cursor-pointer ${
                                isSelected
                                  ? 'text-[#059669] font-bold bg-emerald-50/60 dark:bg-emerald-950/30'
                                  : 'text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              <div className="truncate pr-2">
                                <div className="truncate font-medium">{name}</div>
                                <div className="text-[10px] text-slate-400">
                                  {(d.row_count ?? d.rows ?? 0).toLocaleString()} rows · {(d.column_count ?? d.columns ?? 0)} cols
                                </div>
                              </div>
                              {isSelected && <Check className="w-3.5 h-3.5 text-[#059669] shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0 max-w-full">
            <button
              onClick={() => navigate('/upload')}
              className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold rounded-xl shadow-xs hover:shadow transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <UploadCloud className="w-4 h-4 shrink-0" />
              <span>Upload Dataset</span>
            </button>

            <button
              onClick={() => navigate('/datasets')}
              className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 border border-[#E2E8F0] dark:border-slate-700 text-[#111827] dark:text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <Database className="w-4 h-4 text-[#059669] shrink-0" />
              <span>Explore Datasets ({totalDatasets})</span>
            </button>

            <button
              onClick={() =>
                navigate(
                  selectedDataset ? `/data-analyst?dataset_id=${selectedDataset.id}` : '/data-analyst'
                )
              }
              className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/40 text-[#059669] text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <Brain className="w-4 h-4 shrink-0" />
              <span>Ask AI Analyst</span>
            </button>
          </div>
        </div>

        {/* Decorative subtle background gradient element */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-emerald-500/5 dark:from-emerald-500/10 to-transparent pointer-events-none hidden md:block" />
      </div>

      {/* =========================================================================
          SECTION 2: DYNAMIC DATASET-DRIVEN KPI METRIC CARDS (5 CARDS)
      ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* 1. Total Rows */}
        <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors min-w-0 overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1.5 min-w-0">
              <span className="text-xs font-medium text-[#64748B] dark:text-slate-400 truncate">Total Rows</span>
              <div className="p-1.5 sm:p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-[#059669] border border-emerald-100 dark:border-emerald-900/30 shrink-0">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5 text-xl sm:text-2xl font-bold text-[#111827] dark:text-white truncate">
              {loadingOverview ? (
                <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
              ) : (
                selectedRows.toLocaleString()
              )}
            </div>
          </div>
          <div className="mt-1 text-[11px] text-[#059669] font-medium truncate" title={selectedDataset ? 'Active dataset records' : 'Across all files'}>
            {selectedDataset ? 'Active dataset records' : 'Across all files'}
          </div>
        </div>

        {/* 2. Total Columns */}
        <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors min-w-0 overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1.5 min-w-0">
              <span className="text-xs font-medium text-[#64748B] dark:text-slate-400 truncate">Total Columns</span>
              <div className="p-1.5 sm:p-2 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-[#0D9488] border border-teal-100 dark:border-teal-900/30 shrink-0">
                <Database className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5 text-xl sm:text-2xl font-bold text-[#111827] dark:text-white truncate">
              {loadingOverview ? (
                <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
              ) : (
                selectedCols
              )}
            </div>
          </div>
          <div className="mt-1 text-[11px] text-[#0D9488] font-medium truncate" title={overview ? `Num: ${overview.available_numeric_columns?.length || 0} · Cat: ${overview.available_categorical_columns?.length || 0}` : 'Attributes in schema'}>
            {overview
              ? `Num: ${overview.available_numeric_columns?.length || 0} · Cat: ${overview.available_categorical_columns?.length || 0}`
              : 'Attributes in schema'}
          </div>
        </div>

        {/* 3. Data Quality Score */}
        <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors min-w-0 overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1.5 min-w-0">
              <span className="text-xs font-medium text-[#64748B] dark:text-slate-400 truncate">Quality Score</span>
              <div className="p-1.5 sm:p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5 text-xl sm:text-2xl font-bold text-[#111827] dark:text-white truncate">
              {loadingQuality ? (
                <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
              ) : qualityScore !== null ? (
                `${qualityScore}%`
              ) : (
                '—'
              )}
            </div>
          </div>
          <div className="mt-1 text-[11px] font-medium truncate">
            {qualityData?.summary?.overall_status ? (
              <span
                className={
                  qualityData.summary.overall_status === 'Good'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }
              >
                {qualityData.summary.overall_status}
              </span>
            ) : (
              <span className="text-slate-400">Automated Hygiene</span>
            )}
          </div>
        </div>

        {/* 4. Missing Values */}
        <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors min-w-0 overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1.5 min-w-0">
              <span className="text-xs font-medium text-[#64748B] dark:text-slate-400 truncate">Missing Values</span>
              <div className="p-1.5 sm:p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5 text-xl sm:text-2xl font-bold text-[#111827] dark:text-white truncate">
              {loadingQuality ? (
                <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
              ) : (
                missingCount.toLocaleString()
              )}
            </div>
          </div>
          <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium truncate" title={`${missingPct}% of all cells`}>
            {missingPct}% of all cells
          </div>
        </div>

        {/* 5. Available Insights */}
        <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors min-w-0 overflow-hidden flex flex-col justify-between col-span-2 sm:col-span-1">
          <div>
            <div className="flex items-center justify-between gap-1.5 min-w-0">
              <span className="text-xs font-medium text-[#64748B] dark:text-slate-400 truncate">AI Insights</span>
              <div className="p-1.5 sm:p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30 shrink-0">
                <Brain className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2.5 text-xl sm:text-2xl font-bold text-[#111827] dark:text-white truncate">
              {loadingInsights ? (
                <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
              ) : (
                insights.length
              )}
            </div>
          </div>
          <div className="mt-1 text-[11px] text-purple-600 dark:text-purple-400 font-medium truncate" title="Evidence-grounded findings">
            Evidence-grounded findings
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 3: MIDDLE ROW — TIME-SERIES TREND CHART + ANALYTICAL INSIGHTS
      ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Dynamic Time-Series Trendline Chart (8 cols on lg) */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between transition-colors min-h-[390px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#E2E8F0] dark:border-slate-800 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0 max-w-full">
                <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-[#0284C7] border border-sky-100 dark:border-sky-900/30 shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[#111827] dark:text-white truncate">
                    Chronological Trend Analysis
                  </h2>
                  <p className="text-[11px] text-[#64748B] dark:text-slate-400 truncate">
                    {trendDateCol && trendMetricCol
                      ? `Trend of ${trendMetricCol} over ${trendDateCol}`
                      : 'Time-series evolution across observations'}
                  </p>
                </div>
              </div>

              {/* Dynamic Column Selectors (when dataset has date + numeric cols) */}
              {overview?.available_date_columns?.length > 0 && overview?.available_numeric_columns?.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <select
                      value={trendDateCol}
                      onChange={(e) => setTrendDateCol(e.target.value)}
                      className="text-[11px] bg-transparent text-[#111827] dark:text-white font-medium focus:outline-none cursor-pointer max-w-[120px] sm:max-w-[150px] truncate"
                      title="Select Date Column"
                    >
                      {overview.available_date_columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
                    <BarChart3 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <select
                      value={trendMetricCol}
                      onChange={(e) => {
                        const m = e.target.value;
                        setTrendMetricCol(m);
                        setTrendAgg(prefersAverageAggregation(m) ? 'mean' : 'sum');
                      }}
                      className="text-[11px] bg-transparent text-[#111827] dark:text-white font-medium focus:outline-none cursor-pointer max-w-[120px] sm:max-w-[150px] truncate"
                      title="Select Metric Column"
                    >
                      {overview.available_numeric_columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
                    <Activity className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={trendAgg}
                      onChange={(e) => setTrendAgg(e.target.value)}
                      className="text-[11px] bg-transparent text-[#111827] dark:text-white font-medium focus:outline-none cursor-pointer"
                      title="Aggregation Method"
                    >
                      <option value="sum">Sum</option>
                      <option value="mean">Average</option>
                      <option value="median">Median</option>
                      <option value="max">Max</option>
                      <option value="min">Min</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Chart Content Area */}
            {!selectedDataset ? (
              <div className="py-20 text-center text-xs text-[#64748B] dark:text-slate-400 space-y-2">
                <Database className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <p>No dataset selected. Select or upload a dataset to compute dynamic charts.</p>
              </div>
            ) : overview?.available_date_columns?.length === 0 ? (
              <div className="my-8 py-10 px-6 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-center space-y-2.5">
                <Info className="w-6 h-6 text-slate-400 mx-auto" />
                <div className="text-xs font-semibold text-[#111827] dark:text-white">
                  Time-series trend unavailable for this dataset
                </div>
                <p className="text-[11px] text-[#64748B] dark:text-slate-400 max-w-md mx-auto">
                  The selected dataset <span className="font-semibold text-slate-700 dark:text-slate-300">"{selectedName}"</span> does not contain suitable date/time columns.
                </p>
                {overview?.column_summary && (
                  <div className="pt-2 flex flex-wrap justify-center gap-1.5 text-[10px]">
                    <span className="text-slate-400 self-center">Available columns:</span>
                    {overview.column_summary.slice(0, 8).map((c) => (
                      <span key={c.name} className="px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
                        {c.name} ({c.role})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : loadingTrend ? (
              <div className="py-24 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#0284C7]" />
                <span>Calculating time-series trend...</span>
              </div>
            ) : trendError ? (
              <div className="py-16 text-center text-xs text-amber-600 dark:text-amber-400">
                {trendError}
              </div>
            ) : trendChartData ? (
              <div className="w-full pt-1">
                <AnalyticalChart chartData={trendChartData} headless={true} height={230} />
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-slate-500">
                No trend data available for current selection.
              </div>
            )}
          </div>

          {/* Bottom Card Footer */}
          {trendChartData && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-slate-400">
              <span className="truncate">Points: {trendChartData.data_points?.length || 0} observations</span>
              <span className="font-medium text-slate-500 dark:text-slate-400 shrink-0">
                Aggregation: {trendAgg === 'mean' ? 'Average' : trendAgg.charAt(0).toUpperCase() + trendAgg.slice(1)}
              </span>
            </div>
          )}
        </div>

        {/* Right: Analytical Insights (4 cols on lg) */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between transition-colors min-h-[390px]">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] dark:border-slate-800 gap-2 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30 shrink-0">
                  <Brain className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-[#111827] dark:text-white truncate">
                  Automated Insights
                </h2>
              </div>
              {selectedDataset && (
                <button
                  onClick={() => navigate(`/insights?dataset_id=${selectedDataset.id}`)}
                  className="text-xs font-semibold text-[#059669] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <span>Explore all</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {loadingInsights ? (
              <div className="py-20 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
                <span>Generating automated insights...</span>
              </div>
            ) : !selectedDataset ? (
              <div className="py-16 text-center text-xs text-slate-400">
                Select a dataset to view automated analytical insights.
              </div>
            ) : insights.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500 space-y-2">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                <p>No critical warnings or anomalies detected in this dataset.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {insights.slice(0, 3).map((ins, idx) => (
                  <div
                    key={ins.id || idx}
                    className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#111827] dark:text-white truncate">
                        {ins.title}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                          ins.severity === 'Critical'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                            : ins.severity === 'Warning'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900'
                            : 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900'
                        }`}
                      >
                        {ins.severity || 'INFO'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748B] dark:text-slate-400 leading-relaxed line-clamp-2">
                      {ins.statement}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedDataset && (
            <button
              onClick={() => navigate(`/data-analyst?dataset_id=${selectedDataset.id}`)}
              className="w-full mt-3 py-2 text-xs font-semibold text-[#059669] hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/40 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Ask questions about these findings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          SECTION 4: BOTTOM ROW — CATEGORY BAR CHART + QUALITY BREAKDOWN + ACTIVITY
      ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Col 1: Dynamic Category-wise Bar Chart */}
        <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between transition-colors min-h-[400px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-[#E2E8F0] dark:border-slate-800 min-w-0">
              <div className="flex items-center gap-2 min-w-0 max-w-full">
                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-[#059669] shrink-0">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[#111827] dark:text-white truncate">
                    Category Breakdown
                  </h2>
                  <p className="text-[10px] text-slate-400 truncate">
                    {catCategoryCol && catMetricCol ? `${catMetricCol} by ${catCategoryCol}` : 'Grouped comparative metrics'}
                  </p>
                </div>
              </div>

              {/* Dynamic Category & Metric Selectors */}
              {overview?.available_categorical_columns?.length > 0 && overview?.available_numeric_columns?.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs flex-wrap">
                  <select
                    value={catCategoryCol}
                    onChange={(e) => setCatCategoryCol(e.target.value)}
                    className="text-[10px] px-2 py-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[#111827] dark:text-white focus:outline-none cursor-pointer font-medium max-w-[85px] sm:max-w-[100px] truncate"
                    title="Select Categorical Column"
                  >
                    {overview.available_categorical_columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  <select
                    value={catMetricCol}
                    onChange={(e) => setCatMetricCol(e.target.value)}
                    className="text-[10px] px-2 py-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[#111827] dark:text-white focus:outline-none cursor-pointer font-medium max-w-[85px] sm:max-w-[100px] truncate"
                    title="Select Numeric Metric"
                  >
                    {overview.available_numeric_columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Chart Content Area */}
            {!selectedDataset ? (
              <div className="py-16 text-center text-xs text-slate-400">
                No dataset selected.
              </div>
            ) : overview?.available_categorical_columns?.length === 0 ? (
              <div className="my-6 py-8 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-center space-y-2">
                <Info className="w-5 h-5 text-slate-400 mx-auto" />
                <div className="text-xs font-semibold text-[#111827] dark:text-white">
                  Categorical breakdown unavailable
                </div>
                <p className="text-[11px] text-slate-500">
                  The selected dataset does not contain categorical group columns.
                </p>
              </div>
            ) : loadingCategoryChart ? (
              <div className="py-20 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#059669]" />
                <span>Computing category aggregation...</span>
              </div>
            ) : categoryError ? (
              <div className="py-16 text-center text-xs text-amber-600">
                {categoryError}
              </div>
            ) : categoryChartData ? (
              <div className="w-full pt-1">
                <AnalyticalChart chartData={categoryChartData} headless={true} height={220} />
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-slate-400">
                Select categorical and numeric columns to visualize.
              </div>
            )}
          </div>

          {/* Bottom Card Footer */}
          {categoryChartData && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-slate-400">
              <span className="truncate">Top {categoryChartData.data_points?.length || 0} categories</span>
              <span className="font-medium text-slate-500 dark:text-slate-400 shrink-0">Sum aggregation</span>
            </div>
          )}
        </div>


        {/* Col 2: Data Quality Breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4 flex flex-col justify-between transition-colors">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] dark:border-slate-800 gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                <h2 className="text-sm font-bold text-[#111827] dark:text-white truncate">
                  Data Quality Breakdown
                </h2>
              </div>
              {selectedDataset && (
                <button
                  onClick={() => navigate(`/data-quality?dataset_id=${selectedDataset.id}`)}
                  className="text-xs font-semibold text-[#059669] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <span>Details</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {loadingQuality ? (
              <div className="py-16 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
                <span>Assessing quality dimensions...</span>
              </div>
            ) : !selectedDataset || !qualityData ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Select a dataset to view data quality score and dimensions.
              </div>
            ) : (
              <div className="space-y-3.5">
                {/* Overall Score Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-[#64748B] dark:text-slate-400">Overall Quality Health</span>
                    <span className="font-bold text-[#111827] dark:text-white">{qualityScore}%</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${
                        qualityScore >= 80 ? 'bg-[#059669]' : qualityScore >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${qualityScore}%` }}
                    />
                  </div>
                </div>

                {/* Dimension 1: Completeness */}
                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 text-xs">
                  <span className="text-[#64748B] dark:text-slate-400">Data Completeness</span>
                  <span className="font-semibold text-[#111827] dark:text-white">
                    {(100 - parseFloat(missingPct)).toFixed(1)}%
                  </span>
                </div>

                {/* Dimension 2: Uniqueness */}
                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 text-xs">
                  <span className="text-[#64748B] dark:text-slate-400">Row Uniqueness</span>
                  <span className="font-semibold text-[#111827] dark:text-white">
                    {qualityData.summary?.duplicate_percentage !== undefined
                      ? `${(100 - qualityData.summary.duplicate_percentage).toFixed(1)}%`
                      : '100%'}
                  </span>
                </div>

                {/* Dimension 3: Problematic Columns */}
                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 text-xs">
                  <span className="text-[#64748B] dark:text-slate-400">Affected Columns</span>
                  <span className="font-semibold text-[#111827] dark:text-white">
                    {qualityData.missing_report?.affected_columns_count || 0} columns
                  </span>
                </div>

                {/* Dimension 4: Duplicate Rows */}
                <div className="flex items-center justify-between py-2 text-xs">
                  <span className="text-[#64748B] dark:text-slate-400">Duplicate Rows</span>
                  <span className="font-semibold text-[#111827] dark:text-white">
                    {qualityData.summary?.duplicate_rows || 0} rows
                  </span>
                </div>
              </div>
            )}
          </div>

          {selectedDataset && (
            <button
              onClick={() => navigate(`/data-cleaning?dataset_id=${selectedDataset.id}`)}
              className="w-full mt-2 py-2 text-xs font-semibold text-[#059669] hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/40 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Clean and repair issues</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Col 3: Real Recent Activity / Analysis History */}
        <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-4 flex flex-col justify-between transition-colors">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] dark:border-slate-800 gap-2 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <h2 className="text-sm font-bold text-[#111827] dark:text-white truncate">
                  Recent Activity
                </h2>
              </div>
              <button
                onClick={() => navigate('/history')}
                className="text-xs font-semibold text-[#059669] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span>All History</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {loadingActivity ? (
              <div className="py-16 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Loading activity history...</span>
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#64748B] dark:text-slate-400 space-y-2.5">
                <Activity className="w-6 h-6 text-slate-300 dark:text-slate-600 mx-auto" />
                <p>No query history recorded yet for this dataset.</p>
                <button
                  onClick={() =>
                    navigate(
                      selectedDataset
                        ? `/data-analyst?dataset_id=${selectedDataset.id}`
                        : '/data-analyst'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-[#059669] border border-emerald-200 dark:border-emerald-800/40 text-xs font-semibold cursor-pointer"
                >
                  Ask First Question
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.slice(0, 4).map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1 transition-colors"
                  >
                    <div className="text-xs font-semibold text-[#111827] dark:text-white line-clamp-1 truncate">
                      "{item.question || item.prompt || 'Analytical Query'}"
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 gap-2">
                      <span className="truncate">{item.intent ? `Intent: ${item.intent}` : 'Analytical execution'}</span>
                      <span className="shrink-0">{formatDate(item.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => navigate('/history')}
            className="w-full mt-2 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-[#E2E8F0] dark:border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>View complete audit history</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* =========================================================================
          SECTION 5: ADVANCED VISUALIZATIONS (HISTOGRAM, SCATTER, MISSING VALUES)
      ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Card 1: Numeric Distribution — Histogram */}
        <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between transition-colors min-h-[400px] min-w-0">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-[#E2E8F0] dark:border-slate-800 min-w-0">
              <div className="flex items-center gap-2 min-w-0 max-w-full">
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30 shrink-0">
                  <BarChart2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[#111827] dark:text-white truncate">
                    Numeric Distribution
                  </h2>
                  <p className="text-[10px] text-slate-400 truncate" title={histCol ? `Histogram of ${histCol}` : 'Continuous frequency distribution'}>
                    {histCol ? `Histogram of ${histCol}` : 'Continuous frequency distribution'}
                  </p>
                </div>
              </div>

              {/* Dynamic Numeric Feature & Bins Selectors */}
              {overview?.available_numeric_columns?.length > 0 && (
                <div className="flex items-center gap-1.5 text-xs flex-wrap">
                  <select
                    value={histCol}
                    onChange={(e) => setHistCol(e.target.value)}
                    className="text-[10px] px-2 py-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[#111827] dark:text-white focus:outline-none cursor-pointer font-medium max-w-[85px] sm:max-w-[100px] truncate"
                    title="Select Numeric Feature"
                  >
                    {overview.available_numeric_columns.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  <select
                    value={histBins}
                    onChange={(e) => setHistBins(parseInt(e.target.value, 10))}
                    className="text-[10px] px-1.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[#111827] dark:text-white focus:outline-none cursor-pointer font-medium shrink-0"
                    title="Select Number of Bins"
                  >
                    <option value={5}>5 Bins</option>
                    <option value={10}>10 Bins</option>
                    <option value={15}>15 Bins</option>
                    <option value={20}>20 Bins</option>
                  </select>
                </div>
              )}
            </div>

            {/* Content Area */}
            {!selectedDataset ? (
              <div className="py-16 text-center text-xs text-slate-400">
                No dataset selected.
              </div>
            ) : overview?.available_numeric_columns?.length === 0 ? (
              <div className="my-6 py-8 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-center space-y-2">
                <Info className="w-5 h-5 text-slate-400 mx-auto" />
                <div className="text-xs font-semibold text-[#111827] dark:text-white">
                  Numeric distribution unavailable
                </div>
                <p className="text-[11px] text-slate-500">
                  The selected dataset does not contain numeric features.
                </p>
              </div>
            ) : loadingHist ? (
              <div className="py-20 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Computing distribution histogram...</span>
              </div>
            ) : histError ? (
              <div className="py-16 text-center text-xs text-amber-600">
                {histError}
              </div>
            ) : histChartData ? (
              <div className="w-full pt-1">
                <AnalyticalChart chartData={histChartData} headless={true} height={220} />
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-slate-400">
                Select a numeric feature to inspect distribution.
              </div>
            )}
          </div>

          {/* Bottom Card Footer */}
          {histChartData && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-slate-400">
              <span className="truncate">{histChartData.data_points?.length || 0} discrete bins</span>
              <span className="font-mono shrink-0">Histogram ({histBins} intervals)</span>
            </div>
          )}
        </div>

        {/* Card 2: Relationship Analysis — Scatter Plot */}
        <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between transition-colors min-h-[400px] min-w-0">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-[#E2E8F0] dark:border-slate-800 min-w-0">
              <div className="flex items-center gap-2 min-w-0 max-w-full">
                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-[#059669] border border-emerald-100 dark:border-emerald-900/30 shrink-0">
                  <Activity className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[#111827] dark:text-white truncate">
                    Relationship Analysis
                  </h2>
                  <p className="text-[10px] text-slate-400 truncate" title={scatterXCol && scatterYCol ? `${scatterYCol} vs ${scatterXCol}` : 'Bivariate correlation & trend'}>
                    {scatterXCol && scatterYCol ? `${scatterYCol} vs ${scatterXCol}` : 'Bivariate correlation & trend'}
                  </p>
                </div>
              </div>

              {/* Dynamic Scatter X & Y Selectors */}
              {overview?.available_numeric_columns?.length >= 2 && (
                <div className="flex items-center gap-1.5 text-xs flex-wrap">
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">X</span>
                    <select
                      value={scatterXCol}
                      onChange={(e) => setScatterXCol(e.target.value)}
                      className="text-[10px] px-1.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[#111827] dark:text-white focus:outline-none cursor-pointer font-medium max-w-[70px] sm:max-w-[85px] truncate"
                      title="Select X-Axis Feature"
                    >
                      {overview.available_numeric_columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">Y</span>
                    <select
                      value={scatterYCol}
                      onChange={(e) => setScatterYCol(e.target.value)}
                      className="text-[10px] px-1.5 py-1 rounded-lg border border-[#E2E8F0] dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[#111827] dark:text-white focus:outline-none cursor-pointer font-medium max-w-[70px] sm:max-w-[85px] truncate"
                      title="Select Y-Axis Feature"
                    >
                      {overview.available_numeric_columns.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Content Area */}
            {!selectedDataset ? (
              <div className="py-16 text-center text-xs text-slate-400">
                No dataset selected.
              </div>
            ) : overview?.available_numeric_columns?.length < 2 ? (
              <div className="my-6 py-8 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-center space-y-2">
                <Info className="w-5 h-5 text-slate-400 mx-auto" />
                <div className="text-xs font-semibold text-[#111827] dark:text-white">
                  Scatter correlation unavailable
                </div>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  Bivariate relationship analysis requires at least 2 numeric features. Currently {overview?.available_numeric_columns?.length || 0} numeric column detected.
                </p>
              </div>
            ) : loadingScatter ? (
              <div className="py-20 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#059669]" />
                <span>Computing bivariate correlation...</span>
              </div>
            ) : scatterError ? (
              <div className="py-16 text-center text-xs text-amber-600">
                {scatterError}
              </div>
            ) : scatterChartData ? (
              <div className="w-full pt-1">
                <AnalyticalChart chartData={scatterChartData} headless={true} height={220} />
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-slate-400">
                Select two continuous variables to analyze correlation.
              </div>
            )}
          </div>

          {/* Bottom Card Footer */}
          {scatterChartData && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-slate-400">
              <span className="truncate">{scatterChartData.data_points?.length || 0} observations</span>
              <span className="font-mono text-rose-500 dark:text-rose-400 font-semibold shrink-0">
                Fitted regression line
              </span>
            </div>
          )}
        </div>

        {/* Card 3: Missing Values by Column — Bar Chart */}
        <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between transition-colors min-h-[400px] min-w-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0] dark:border-slate-800 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30 shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[#111827] dark:text-white truncate">
                    Missing Values by Column
                  </h2>
                  <p className="text-[10px] text-slate-400 truncate" title={missingColumnsList.length > 0 ? `${missingColumnsList.length} affected columns identified` : 'Attribute completeness diagnostic'}>
                    {missingColumnsList.length > 0
                      ? `${missingColumnsList.length} affected columns identified`
                      : 'Attribute completeness diagnostic'}
                  </p>
                </div>
              </div>

              {selectedDataset && (
                <button
                  onClick={() => navigate(`/data-quality?dataset_id=${selectedDataset.id}`)}
                  className="text-xs font-semibold text-[#059669] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <span>Audit</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Content Area */}
            {!selectedDataset ? (
              <div className="py-16 text-center text-xs text-slate-400">
                No dataset selected.
              </div>
            ) : loadingQuality ? (
              <div className="py-20 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
                <span>Scanning column completeness...</span>
              </div>
            ) : missingColumnsList.length === 0 ? (
              <div className="my-6 py-8 px-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-center space-y-2">
                <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto" />
                <div className="text-xs font-bold text-emerald-800 dark:text-emerald-200">
                  100% Complete — Zero Missing Values
                </div>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300 max-w-xs mx-auto">
                  No missing or null-like values detected across any column in this dataset.
                </p>
              </div>
            ) : missingChartData ? (
              <div className="w-full pt-1">
                <AnalyticalChart chartData={missingChartData} headless={true} height={220} />
              </div>
            ) : (
              <div className="py-16 text-center text-xs text-slate-400">
                Data quality diagnostics unavailable.
              </div>
            )}
          </div>

          {/* Bottom Card Footer */}
          {selectedDataset && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-slate-400">
              <span className="truncate">{missingCount.toLocaleString()} total missing cells</span>
              <span className="font-mono text-amber-600 dark:text-amber-400 font-semibold shrink-0">
                {missingColumnsList.length > 0 ? `${missingColumnsList.length} columns affected` : 'Complete'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          SECTION 5: RECENT DATASETS REPOSITORY TABLE (PRESERVED ORIGINAL FEATURE)
      ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-[#059669]">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#111827] dark:text-white">Active Repository Datasets</h2>
              <p className="text-[11px] text-[#64748B] dark:text-slate-400">Quick access to manage, clean, and profile uploaded tabular data</p>
            </div>
          </div>
          {datasets.length > 0 && (
            <button
              onClick={() => navigate('/datasets')}
              className="text-xs font-semibold text-[#059669] hover:text-[#047857] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>View all ({totalDatasets})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {loadingDatasets ? (
          <div className="py-12 text-center text-xs text-[#64748B] dark:text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#059669]" />
            <span>Loading datasets...</span>
          </div>
        ) : datasets.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-[#059669] flex items-center justify-center mx-auto border border-emerald-100 dark:border-emerald-900/30">
              <Database className="w-6 h-6" />
            </div>
            <p className="text-xs text-[#64748B] dark:text-slate-400 max-w-sm mx-auto">
              No datasets uploaded yet. Upload your first CSV, XLS, or XLSX file to begin automated profiling and analytics.
            </p>
            <button
              onClick={() => navigate('/upload')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Upload Dataset</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
            {recentDatasets.map((dataset) => {
              const fname = dataset.original_filename || dataset.filename;
              const ftype = (dataset.file_type || '').toUpperCase();
              const rowCount = dataset.row_count ?? dataset.rows ?? 0;
              const colCount = dataset.column_count ?? dataset.columns ?? 0;
              const fsize = dataset.file_size ?? dataset.file_size_bytes ?? 0;
              const isSelected = selectedDataset?.id === dataset.id;

              return (
                <div
                  key={dataset.id}
                  className={`py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 rounded-xl transition-colors ${
                    isSelected
                      ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/30'
                      : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-[#059669] border border-emerald-100 dark:border-emerald-900/30 shrink-0">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSelectDataset(dataset)}
                          className="text-xs font-semibold text-[#111827] dark:text-white hover:text-[#059669] dark:hover:text-[#059669] cursor-pointer truncate max-w-md transition-colors text-left"
                          title={fname}
                        >
                          {fname}
                        </button>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                          #{dataset.id}
                        </span>
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950 text-[#059669] border border-emerald-200 dark:border-emerald-800/40">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#64748B] dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                        <span>{rowCount.toLocaleString()} rows</span>
                        <span>•</span>
                        <span>{colCount} columns</span>
                        <span>•</span>
                        <span>{formatFileSize(fsize)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 shrink-0 self-end sm:self-center">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                        ftype === 'CSV'
                          ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900'
                          : ftype === 'XLSX' || ftype === 'XLS'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900'
                      }`}
                    >
                      {ftype || 'DATA'}
                    </span>
                    <span className="text-[11px] text-[#94A3B8] hidden md:inline">
                      {formatDate(dataset.created_at)}
                    </span>
                    <div className="flex items-center gap-1.5 ml-2">
                      <button
                        onClick={() => navigate(`/profile-data?dataset_id=${dataset.id}`)}
                        className="px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-[#059669] hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors border border-[#E2E8F0] dark:border-slate-700 cursor-pointer"
                        title="Profile dataset"
                      >
                        Profile
                      </button>
                      <button
                        onClick={() => navigate(`/data-cleaning?dataset_id=${dataset.id}`)}
                        className="px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-[#059669] hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition-colors border border-[#E2E8F0] dark:border-slate-700 cursor-pointer"
                        title="Clean dataset"
                      >
                        Clean
                      </button>
                      <button
                        onClick={() => navigate(`/data-analyst?dataset_id=${dataset.id}`)}
                        className="px-2.5 py-1 text-[11px] font-medium text-white bg-[#059669] hover:bg-[#047857] rounded-lg shadow-xs transition-colors cursor-pointer"
                        title="Ask questions in plain English"
                      >
                        Analyze
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
