import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  FileSearch,
  Database,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Search,
  Hash,
  Columns,
  Layers,
  Calendar,
  Sparkles,
  ShieldCheck,
  Activity,
  Plus,
  ArrowRight,
  Filter,
  Check,
  CheckSquare,
  Square,
  GitMerge,
  BarChart3,
  Table,
  SlidersHorizontal,
  Info,
  ShieldAlert,
  X,
  PieChart as PieIcon,
  MapPin,
  Tag,
  Package,
  TrendingUp,
  LayoutGrid,
} from 'lucide-react';
import { datasetService } from '../services/datasetService';
import { extractErrorMessage } from '../services/api';
import { AnalyticalChart } from '../components/AnalyticalChart';

export const ProfilingPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Dataset repository & selection state
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);

  // Analysis result state
  const [multiResult, setMultiResult] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState('');

  // Active view tab state: 'combined' | 'comparison' | 'individual' | 'relationships'
  const [activeTab, setActiveTab] = useState('combined');
  const [selectedIndividualId, setSelectedIndividualId] = useState(null);

  // Column search & filters inside individual profile
  const [columnSearch, setColumnSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Comparison matrix search
  const [comparisonSearch, setComparisonSearch] = useState('');
  const [comparisonFilter, setComparisonFilter] = useState('ALL'); // 'ALL' | 'SHARED' | 'UNIQUE' | 'MISMATCH'

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
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  // Interactive visualization state for individual profile
  const [selectedNumericCol, setSelectedNumericCol] = useState('');
  const [numericChartType, setNumericChartType] = useState('bar'); // 'bar' | 'line' | 'scatter'
  const [selectedCategoricalCol, setSelectedCategoricalCol] = useState('');
  const [missingChartType, setMissingChartType] = useState('bar'); // 'bar' | 'line' | 'scatter'
  const [cardDeckView, setCardDeckView] = useState('deck'); // 'deck' | 'grid'
  const [hoveredTip, setHoveredTip] = useState(null);

  const formatCompact = (val) => {
    if (val === null || val === undefined || isNaN(val)) return '0';
    const num = Number(val);
    const abs = Math.abs(num);
    if (abs >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (abs >= 1000) {
      const k = num / 1000;
      return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
    }
    if (Number.isInteger(num)) return num.toLocaleString();
    return num.toFixed(1).replace(/\.0$/, '');
  };

  const formatStatNumber = (val) => {
    if (val === null || val === undefined || isNaN(val)) return 'N/A';
    const num = Number(val);
    const abs = Math.abs(num);
    if (abs >= 1000000000) return `${(num / 1000000000).toFixed(2)}B`;
    if (abs >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (abs >= 10000) return `${(num / 1000).toFixed(1)}k`;
    if (Number.isInteger(num)) return num.toLocaleString();
    return Number(num.toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const polarToCartesian = (cx, cy, r, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: cx + r * Math.cos(angleInRadians),
      y: cy + r * Math.sin(angleInRadians),
    };
  };

  const getDonutSlicePath = (cx, cy, rOuter, rInner, startAngle, endAngle) => {
    const diff = endAngle - startAngle;
    const clampedEnd = diff >= 359.99 ? startAngle + 359.99 : endAngle;
    const p1 = polarToCartesian(cx, cy, rOuter, clampedEnd);
    const p2 = polarToCartesian(cx, cy, rOuter, startAngle);
    const p3 = polarToCartesian(cx, cy, rInner, startAngle);
    const p4 = polarToCartesian(cx, cy, rInner, clampedEnd);
    const largeArcFlag = diff <= 180 ? 0 : 1;
    return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 ${largeArcFlag} 0 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 ${largeArcFlag} 1 ${p4.x} ${p4.y} Z`;
  };

  const getPieSlicePath = (cx, cy, r, startAngle, endAngle) => {
    const diff = endAngle - startAngle;
    const clampedEnd = diff >= 359.99 ? startAngle + 359.99 : endAngle;
    const p1 = polarToCartesian(cx, cy, r, startAngle);
    const p2 = polarToCartesian(cx, cy, r, clampedEnd);
    const largeArcFlag = diff <= 180 ? 0 : 1;
    return `M ${cx} ${cy} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${p2.x} ${p2.y} Z`;
  };

  const getColumnIcon = (col) => {
    const name = (col?.name || '').toLowerCase();
    const st = (col?.semantic_type || '').toUpperCase();
    if (name.includes('price') || name.includes('amount') || name.includes('cost') || name.includes('salary') || name.includes('revenue')) {
      return <span className="font-bold text-xs text-blue-600 dark:text-blue-400">₹</span>;
    }
    if (name.includes('date') || name.includes('time') || st === 'DATETIME') {
      return <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />;
    }
    if (name.includes('region') || name.includes('city') || name.includes('country') || name.includes('state')) {
      return <MapPin className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />;
    }
    if (name.includes('category') || name.includes('type')) {
      return <Tag className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />;
    }
    if (name.includes('product') || name.includes('item')) {
      return <Package className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />;
    }
    if (st === 'NUMERIC') {
      return <Hash className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />;
    }
    return <Layers className="w-3.5 h-3.5 text-slate-500" />;
  };

  // 1. Initial Load: Fetch user datasets and parse query parameters
  useEffect(() => {
    const fetchDatasets = async () => {
      setLoadingDatasets(true);
      setError('');
      try {
        const data = await datasetService.getDatasets();
        const list = data || [];
        setDatasets(list);

        // Check query parameters: dataset_ids (comma separated) or single dataset_id / id or saved ID
        const rawIds = searchParams.get('dataset_ids');
        const singleId = searchParams.get('dataset_id') || searchParams.get('id');
        const savedId = localStorage.getItem('selected_dataset_id');

        let initialIds = [];
        if (rawIds) {
          initialIds = rawIds
            .split(',')
            .map((s) => Number(s.trim()))
            .filter((n) => !isNaN(n) && list.some((d) => d.id === n));
        } else if (singleId) {
          const num = Number(singleId);
          if (!isNaN(num) && list.some((d) => d.id === num)) {
            initialIds = [num];
          }
        } else if (savedId) {
          const num = Number(savedId);
          if (!isNaN(num) && list.some((d) => d.id === num)) {
            initialIds = [num];
          }
        }

        if (initialIds.length > 0) {
          setSelectedDatasetIds(initialIds);
          runAnalysis(initialIds);
        } else if (list.length > 0) {
          // Default: select the most recently uploaded dataset
          const defaultId = list[0].id;
          setSelectedDatasetIds([defaultId]);
          runAnalysis([defaultId]);
        }
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoadingDatasets(false);
      }
    };

    fetchDatasets();
  }, []);

  // 2. Run multi-dataset analysis for a list of dataset IDs
  const runAnalysis = async (ids) => {
    if (!ids || ids.length === 0) {
      setMultiResult(null);
      return;
    }

    setIsAnalyzing(true);
    setError('');

    // Sync URL search params
    if (ids.length === 1) {
      setSearchParams({ dataset_id: ids[0] }, { replace: true });
      localStorage.setItem('selected_dataset_id', String(ids[0]));
    } else {
      setSearchParams({ dataset_ids: ids.join(',') }, { replace: true });
    }

    try {
      const resp = await datasetService.analyzeMultiDatasets(ids, 'all');
      setMultiResult(resp);

      // Choose appropriate default tab: if 2+ datasets succeeded, show combined; if only 1, default to individual
      if (resp?.total_successful >= 2) {
        setActiveTab('combined');
      } else {
        setActiveTab('individual');
      }

      // Default the individual profile viewer to the first successful dataset
      if (resp?.individual_profiles && Object.keys(resp.individual_profiles).length > 0) {
        const keys = Object.keys(resp.individual_profiles);
        const firstSuccessId = Number(keys[0]);
        setSelectedIndividualId((prev) => {
          if (prev && (resp.individual_profiles[prev] || resp.individual_profiles[String(prev)])) {
            return prev;
          }
          return firstSuccessId;
        });
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Selection handlers
  const handleToggleDataset = (id) => {
    const isSelected = selectedDatasetIds.includes(id);
    let next;
    if (isSelected) {
      next = selectedDatasetIds.filter((dId) => dId !== id);
    } else {
      next = [...selectedDatasetIds, id];
    }
    setSelectedDatasetIds(next);
  };

  const handleSelectAll = () => {
    const allIds = datasets.map((d) => d.id);
    setSelectedDatasetIds(allIds);
  };

  const handleClearSelection = () => {
    setSelectedDatasetIds([]);
    setMultiResult(null);
    setSearchParams({});
  };

  // Quality badge styling
  const getQualityBadge = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('excellent')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s.includes('good')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (s.includes('moderate')) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-red-50 text-red-700 border-red-200';
  };

  const getSemanticBadge = (type) => {
    switch (type) {
      case 'NUMERIC': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'CATEGORICAL': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'DATETIME': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'BOOLEAN': return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case 'TEXT': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  // Active individual profile
  const activeProfile = useMemo(() => {
    if (!multiResult?.individual_profiles) return null;
    const profiles = multiResult.individual_profiles;
    if (selectedIndividualId != null) {
      if (profiles[selectedIndividualId]) return profiles[selectedIndividualId];
      if (profiles[String(selectedIndividualId)]) return profiles[String(selectedIndividualId)];
      if (profiles[Number(selectedIndividualId)]) return profiles[Number(selectedIndividualId)];
    }
    const keys = Object.keys(profiles);
    if (keys.length > 0) {
      return profiles[keys[0]];
    }
    return null;
  }, [multiResult, selectedIndividualId]);

  // Filtered columns for active individual profile
  const filteredColumns = useMemo(() => {
    if (!activeProfile?.columns) return [];
    return activeProfile.columns.filter((col) => {
      const matchesSearch = col.name.toLowerCase().includes(columnSearch.toLowerCase());
      if (!matchesSearch) return false;

      if (typeFilter === 'NUMERIC') return col.semantic_type === 'NUMERIC';
      if (typeFilter === 'CATEGORICAL') return col.semantic_type === 'CATEGORICAL' || col.semantic_type === 'TEXT';
      if (typeFilter === 'MISSING') return col.missing_count > 0;
      return true;
    });
  }, [activeProfile, columnSearch, typeFilter]);

  // Filtered column comparison matrix
  const filteredComparisonMatrix = useMemo(() => {
    if (!multiResult?.comparison?.column_matrix) return [];
    return multiResult.comparison.column_matrix.filter((item) => {
      const matchesSearch =
        item.column_name.toLowerCase().includes(comparisonSearch.toLowerCase()) ||
        item.normalized_name.includes(comparisonSearch.toLowerCase());
      if (!matchesSearch) return false;

      if (comparisonFilter === 'SHARED') return item.is_shared;
      if (comparisonFilter === 'UNIQUE') return !item.is_shared;
      if (comparisonFilter === 'MISMATCH') return !item.type_compatible;
      return true;
    });
  }, [multiResult, comparisonSearch, comparisonFilter]);

  // Auto-select initial columns when active profile changes
  useEffect(() => {
    if (activeProfile?.columns && activeProfile.columns.length > 0) {
      const numCols = activeProfile.columns.filter((c) => c.semantic_type === 'NUMERIC');
      if (numCols.length > 0) {
        const preferred =
          numCols.find((c) =>
            ['total_amount', 'unit_price', 'amount', 'quantity', 'sales', 'price'].includes(c.name.toLowerCase())
          ) || numCols[0];
        setSelectedNumericCol(preferred.name);
      } else {
        setSelectedNumericCol('');
      }

      const catCols = activeProfile.columns.filter(
        (c) => c.semantic_type === 'CATEGORICAL' || c.semantic_type === 'TEXT'
      );
      if (catCols.length > 0) {
        const preferred =
          catCols.find((c) =>
            ['category', 'region', 'product', 'payment_method', 'type'].includes(c.name.toLowerCase())
          ) || catCols[0];
        setSelectedCategoricalCol(preferred.name);
      } else {
        setSelectedCategoricalCol('');
      }
    }
  }, [activeProfile]);

  // Derived column subsets
  const numericColumns = useMemo(() => {
    if (!activeProfile?.columns) return [];
    return activeProfile.columns.filter((c) => c.semantic_type === 'NUMERIC');
  }, [activeProfile]);

  const categoricalColumns = useMemo(() => {
    if (!activeProfile?.columns) return [];
    return activeProfile.columns.filter(
      (c) => c.semantic_type === 'CATEGORICAL' || c.semantic_type === 'TEXT'
    );
  }, [activeProfile]);

  // Type Breakdown for Card A (Column Data Types)
  const columnTypeBreakdown = useMemo(() => {
    if (!activeProfile?.columns || activeProfile.columns.length === 0) {
      return { total: 0, items: [] };
    }
    const counts = {
      NUMERIC: 0,
      CATEGORICAL: 0,
      DATETIME: 0,
      BOOLEAN: 0,
      OTHER: 0,
    };

    activeProfile.columns.forEach((c) => {
      const st = (c.semantic_type || '').toUpperCase();
      if (st === 'NUMERIC') counts.NUMERIC++;
      else if (st === 'CATEGORICAL' || st === 'TEXT') counts.CATEGORICAL++;
      else if (st === 'DATETIME' || st === 'DATE') counts.DATETIME++;
      else if (st === 'BOOLEAN') counts.BOOLEAN++;
      else counts.OTHER++;
    });

    const total = activeProfile.columns.length;
    let accAngle = 0;
    const items = [
      {
        label: 'Numeric',
        typeKey: 'NUMERIC',
        count: counts.NUMERIC,
        percentage: Math.round((counts.NUMERIC / total) * 100),
        color: '#3B82F6',
      },
      {
        label: 'Categorical',
        typeKey: 'CATEGORICAL',
        count: counts.CATEGORICAL,
        percentage: Math.round((counts.CATEGORICAL / total) * 100),
        color: '#8B5CF6',
      },
      {
        label: 'Date',
        typeKey: 'DATETIME',
        count: counts.DATETIME,
        percentage: Math.round((counts.DATETIME / total) * 100),
        color: '#F59E0B',
      },
      {
        label: 'Boolean',
        typeKey: 'BOOLEAN',
        count: counts.BOOLEAN,
        percentage: Math.round((counts.BOOLEAN / total) * 100),
        color: '#10B981',
      },
      {
        label: 'Other',
        typeKey: 'OTHER',
        count: counts.OTHER,
        percentage: Math.round((counts.OTHER / total) * 100),
        color: '#94A3B8',
      },
    ].map((item) => {
      const sweepAngle = (item.count / total) * 360;
      const startAngle = accAngle;
      const endAngle = accAngle + sweepAngle;
      accAngle += sweepAngle;
      return { ...item, startAngle, endAngle };
    });

    return { total, items };
  }, [activeProfile]);

  // Top Missing features for Card B (Missing Values per Column)
  const topMissingFeatures = useMemo(() => {
    if (!activeProfile?.columns) return [];
    // If some columns have missing values, prioritize them; else show top columns
    const sorted = [...activeProfile.columns].sort((a, b) => (b.missing_count || 0) - (a.missing_count || 0));
    return sorted.slice(0, 5);
  }, [activeProfile]);

  // Active numeric object and bins for Card C (Data Distribution)
  const activeNumericColObj = useMemo(() => {
    if (!numericColumns.length) return null;
    return numericColumns.find((c) => c.name === selectedNumericCol) || numericColumns[0];
  }, [numericColumns, selectedNumericCol]);

  const activeNumericBins = useMemo(() => {
    if (!activeNumericColObj) return [];
    if (activeNumericColObj.numeric_stats?.histogram?.length > 0) {
      return activeNumericColObj.numeric_stats.histogram;
    }
    const stats = activeNumericColObj.numeric_stats;
    if (!stats || stats.count === 0) return [];
    const min = stats.min;
    const max = stats.max;
    if (min === max) {
      return [{ bin_start: min, bin_end: max, count: stats.count }];
    }
    const numBins = 6;
    const step = (max - min) / numBins;
    const bins = [];
    for (let i = 0; i < numBins; i++) {
      const bStart = min + i * step;
      const bEnd = min + (i + 1) * step;
      const mid = (bStart + bEnd) / 2;
      const distFromMedian = Math.abs(mid - stats.median) / ((stats.std || (max - min) / 4) + 0.001);
      const weight = Math.exp(-0.5 * distFromMedian * distFromMedian);
      bins.push({
        bin_start: Math.round(bStart * 100) / 100,
        bin_end: Math.round(bEnd * 100) / 100,
        count: Math.max(1, Math.round(weight * (stats.count / 2))),
      });
    }
    return bins;
  }, [activeNumericColObj]);

  const activeHistMax = useMemo(() => {
    if (!activeNumericBins.length) return 10;
    const m = Math.max(...activeNumericBins.map((b) => b.count));
    return Math.ceil(m / 2) * 2 || 10;
  }, [activeNumericBins]);

  // Active categorical object and values for Card D (Categorical Value Distribution)
  const activeCategoricalColObj = useMemo(() => {
    if (!categoricalColumns.length) return null;
    return categoricalColumns.find((c) => c.name === selectedCategoricalCol) || categoricalColumns[0];
  }, [categoricalColumns, selectedCategoricalCol]);

  const activeCategoricalSlices = useMemo(() => {
    if (!activeCategoricalColObj?.categorical_stats?.top_values) return [];
    const raw = activeCategoricalColObj.categorical_stats.top_values;
    if (raw.length === 0) return [];

    const PALETTE = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4', '#6366F1', '#E11D48'];
    const totalCount = raw.reduce((acc, it) => acc + (it.count || 0), 0) || 1;

    let accAngle = 0;
    return raw.slice(0, 6).map((it, idx) => {
      const count = it.count || 0;
      const pct = it.percentage ?? Math.round((count / totalCount) * 100);
      const sweepAngle = (count / totalCount) * 360;
      const startAngle = accAngle;
      const endAngle = accAngle + sweepAngle;
      accAngle += sweepAngle;

      return {
        label: it.value || '(empty)',
        count,
        percentage: pct,
        startAngle,
        endAngle,
        color: PALETTE[idx % PALETTE.length],
      };
    });
  }, [activeCategoricalColObj]);

  const selectedDatasetsCount = selectedDatasetIds.length;

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      {/* Header & Multi-File Picker Controls */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#2563EB] mb-1">
            <Layers className="w-3.5 h-3.5" />
            <span>Data Profiling & Multi-Dataset Analysis</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#0F172A] dark:text-white">
            Individual Profiles
          </h1>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
            Explore detailed statistics, data types and distributions for each column in your dataset.
          </p>
        </div>

        {/* Selected count and Quick Actions */}
        {!loadingDatasets && datasets.length > 0 && (
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Multi-Dataset Ready
            </span>

            <button
              onClick={() => runAnalysis(selectedDatasetIds)}
              disabled={selectedDatasetsCount === 0 || isAnalyzing}
              className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>{isAnalyzing ? 'Analyzing...' : 'Run Analysis'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Dataset Multi-Select Selector Card & Individual Profiles Summary */}
      {!loadingDatasets && datasets.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Select Datasets to Analyze */}
          <div
            className={`${
              activeProfile ? 'lg:col-span-5' : 'lg:col-span-12'
            } bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3 flex flex-col justify-between`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9] dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#2563EB]" />
                <span className="text-xs font-bold text-[#0F172A] dark:text-white">Select Datasets to Analyze</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSelectAll}
                  className="text-[11px] font-semibold text-[#2563EB] hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-gray-300 dark:text-slate-700">|</span>
                <button
                  onClick={handleClearSelection}
                  className="text-[11px] font-semibold text-[#64748B] hover:text-[#0F172A] dark:text-slate-400 dark:hover:text-white cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>
            </div>

            {/* Dataset Pill Grid / List */}
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
              {datasets.map((d) => {
                const isSelected = selectedDatasetIds.includes(d.id);
                const fname = d.original_filename || d.filename;
                const ftype = (d.file_type || 'CSV').toUpperCase();
                const rowCount = d.row_count ?? d.rows ?? 0;
                const colCount = d.column_count ?? d.columns ?? 0;
                const totalCells = rowCount * colCount;
                const sizeStr = formatFileSize(d.file_size_bytes || d.file_size || 0);

                return (
                  <div
                    key={d.id}
                    onClick={() => handleToggleDataset(d.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'bg-[#EFF6FF] dark:bg-blue-950/30 border-[#2563EB] shadow-2xs'
                        : 'bg-white dark:bg-slate-900 border-[#E2E8F0] dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-[#F8FAFC] dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={isSelected ? 'text-[#2563EB]' : 'text-slate-400'}>
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-[#2563EB]" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </div>
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400">{ftype}</span>
                      </div>
                      <div className="min-w-0">
                        <div
                          className={`text-xs font-semibold truncate ${
                            isSelected ? 'text-[#1D4ED8] dark:text-blue-400' : 'text-[#0F172A] dark:text-white'
                          }`}
                          title={fname}
                        >
                          {fname}
                        </div>
                        <div className="text-[10px] text-[#64748B] dark:text-slate-400 mt-0.5 truncate">
                          {sizeStr} · {totalCells.toLocaleString()} total cells · Uploaded: {formatDate(d.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Individual Profiles 5 KPI Summary Boxes */}
          {activeProfile && (
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3 flex flex-col justify-between min-w-0 overflow-hidden box-border">
              <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9] dark:border-slate-800 min-w-0">
                <span className="text-xs font-bold text-[#0F172A] dark:text-white truncate">Individual Profiles</span>
                {Object.keys(multiResult?.individual_profiles || {}).length > 1 && (
                  <span className="text-[10px] font-semibold text-[#2563EB] bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full shrink-0">
                    Dataset {selectedIndividualId} active
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 min-w-0">
                {/* Total Rows */}
                <div className="bg-[#F8FAFC] dark:bg-slate-800/60 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between min-w-0 overflow-hidden box-border">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-[#2563EB] mb-2 shrink-0">
                    <Hash className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-[#64748B] dark:text-slate-400 font-medium truncate">Total Rows</div>
                    <div className="text-lg font-bold text-[#0F172A] dark:text-white truncate font-mono" title={activeProfile.dataset_info.rows.toLocaleString()}>
                      {activeProfile.dataset_info.rows.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">Observed records</div>
                  </div>
                </div>

                {/* Columns */}
                <div className="bg-[#F8FAFC] dark:bg-slate-800/60 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between min-w-0 overflow-hidden box-border">
                  <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center text-purple-600 mb-2 shrink-0">
                    <Columns className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-[#64748B] dark:text-slate-400 font-medium truncate">Columns</div>
                    <div className="text-lg font-bold text-[#0F172A] dark:text-white truncate font-mono" title={String(activeProfile.dataset_info.columns)}>
                      {activeProfile.dataset_info.columns}
                    </div>
                    <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">Features / attributes</div>
                  </div>
                </div>

                {/* Missing Values */}
                <div className="bg-[#F8FAFC] dark:bg-slate-800/60 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between min-w-0 overflow-hidden box-border">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-500 mb-2 shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-[#64748B] dark:text-slate-400 font-medium truncate">Missing Values</div>
                    <div className="text-lg font-bold text-[#0F172A] dark:text-white truncate font-mono" title={activeProfile.quality_summary.total_missing_cells.toLocaleString()}>
                      {activeProfile.quality_summary.total_missing_cells.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                      {activeProfile.quality_summary.missing_percentage}% of cells
                    </div>
                  </div>
                </div>

                {/* Duplicate Rows */}
                <div className="bg-[#F8FAFC] dark:bg-slate-800/60 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between min-w-0 overflow-hidden box-border">
                  <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-950/50 flex items-center justify-center text-red-500 mb-2 shrink-0">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-[#64748B] dark:text-slate-400 font-medium truncate">Duplicate Rows</div>
                    <div className="text-lg font-bold text-[#0F172A] dark:text-white truncate font-mono" title={activeProfile.quality_summary.duplicate_rows.toLocaleString()}>
                      {activeProfile.quality_summary.duplicate_rows.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                      {activeProfile.quality_summary.duplicate_percentage}% duplicate
                    </div>
                  </div>
                </div>

                {/* Quality Status */}
                <div className="bg-[#F8FAFC] dark:bg-slate-800/60 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between col-span-2 sm:col-span-1 min-w-0 overflow-hidden box-border">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 mb-2 shrink-0">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-[#64748B] dark:text-slate-400 font-medium truncate">Quality Status</div>
                    <div className="text-lg font-bold text-[#0F172A] dark:text-white truncate font-mono" title={`${activeProfile.quality_summary.health_score} / 100`}>
                      {activeProfile.quality_summary.health_score}{' '}
                      <span className="text-xs text-slate-400 font-normal">/ 100</span>
                    </div>
                    <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5 truncate" title={activeProfile.quality_summary.health_status}>
                      {activeProfile.quality_summary.health_status}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error & Partial Success Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            onClick={() => runAnalysis(selectedDatasetIds)}
            className="text-xs font-semibold text-red-700 underline hover:no-underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Partial Failure Notice if any dataset failed in batch */}
      {multiResult?.status === 'partial' && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs space-y-2 shadow-xs">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>Partial Analysis Notice ({multiResult.total_successful} of {multiResult.total_selected} datasets succeeded)</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-[11px] text-amber-700 dark:text-amber-400">
            {multiResult.errors.map((err, idx) => (
              <li key={idx}>
                <strong>{err.dataset_name || `Dataset #${err.dataset_id}`}:</strong> {err.error}
              </li>
            ))}
          </ul>
          {multiResult.errors?.length > 0 && multiResult.total_successful > 0 && (
            <div className="pt-1 flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  const failedIds = new Set(multiResult.errors.map((e) => e.dataset_id));
                  const validIds = selectedDatasetIds.filter((id) => !failedIds.has(id));
                  setSelectedDatasetIds(validIds);
                  runAnalysis(validIds);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium text-[11px] rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <span>Deselect Missing &amp; Analyze Remaining ({multiResult.total_successful})</span>
              </button>
              <span className="text-[11px] text-amber-700 dark:text-amber-400">
                The {multiResult.total_successful} valid dataset(s) remain fully accessible below.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {isAnalyzing && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-16 text-center shadow-xs">
          <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-[#0F172A]">Analyzing Selected Datasets...</h3>
          <p className="text-xs text-[#64748B] mt-1">
            Profiling data distributions, comparing schema attributes, and evaluating relationships
          </p>
        </div>
      )}

      {/* Empty State: No Datasets Uploaded */}
      {!loadingDatasets && datasets.length === 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-14 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center mx-auto mb-4">
            <Database className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#0F172A]">No Datasets Available</h3>
          <p className="text-xs text-[#64748B] max-w-md mx-auto mt-2 leading-relaxed">
            Upload your CSV or Excel files to run individual and combined multi-dataset profiling.
          </p>
          <button
            onClick={() => navigate('/upload')}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Dataset</span>
          </button>
        </div>
      )}

      {/* Empty State: Datasets exist but none selected */}
      {!loadingDatasets && datasets.length > 0 && selectedDatasetsCount === 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-14 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center mx-auto mb-4">
            <FileSearch className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#0F172A]">No datasets selected</h3>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto mt-2 leading-relaxed">
            Select one or more datasets from the grid above to profile distributions and discover cross-dataset relationships.
          </p>
          <button
            onClick={handleSelectAll}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white text-xs font-semibold rounded-xl shadow-xs cursor-pointer"
          >
            <span>Select All ({datasets.length})</span>
          </button>
        </div>
      )}

      {/* ANALYSIS WORKSPACE (Rendered when results are available) */}
      {!isAnalyzing && multiResult && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Top Mode Navigation Tabs */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-1.5 shadow-xs flex items-center gap-1 overflow-x-auto">
            {/* Combined Overview Tab (Available when 2+ datasets) */}
            {selectedDatasetsCount >= 2 && (
              <button
                onClick={() => setActiveTab('combined')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'combined'
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-50'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Combined Overview</span>
              </button>
            )}

            {/* Dataset Comparison Tab (Available when 2+ datasets) */}
            {selectedDatasetsCount >= 2 && (
              <button
                onClick={() => setActiveTab('comparison')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'comparison'
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-50'
                }`}
              >
                <Table className="w-4 h-4" />
                <span>Schema Comparison</span>
                {multiResult.comparison?.shared_columns?.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      activeTab === 'comparison' ? 'bg-white/20 text-white' : 'bg-blue-100 text-[#2563EB]'
                    }`}
                  >
                    {multiResult.comparison.shared_columns.length} shared
                  </span>
                )}
              </button>
            )}

            {/* Cross-Dataset Relationships Tab (Available when 2+ datasets) */}
            {selectedDatasetsCount >= 2 && (
              <button
                onClick={() => setActiveTab('relationships')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'relationships'
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-50'
                }`}
              >
                <GitMerge className="w-4 h-4" />
                <span>Relationships</span>
                {multiResult.relationships?.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      activeTab === 'relationships' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {multiResult.relationships.length} detected
                  </span>
                )}
              </button>
            )}

            {/* Individual Profiles Tab */}
            <button
              onClick={() => setActiveTab('individual')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'individual'
                  ? 'bg-[#2563EB] text-white shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-50'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Individual Profiles</span>
            </button>
          </div>

          {/* ========================================================= */}
          {/* TAB 1: COMBINED OVERVIEW                                 */}
          {/* ========================================================= */}
          {activeTab === 'combined' && multiResult.combined_overview && (
            <div className="space-y-6">
              {/* Aggregated KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 min-w-0">
                {/* Total Datasets */}
                <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4 shadow-xs min-w-0 overflow-hidden box-border">
                  <div className="flex items-center justify-between text-[#64748B] dark:text-slate-400 text-[11px] font-medium min-w-0">
                    <span className="truncate">Analyzed Datasets</span>
                    <Database className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                  </div>
                  <div className="mt-2 text-xl font-bold text-[#0F172A] dark:text-white truncate font-mono" title={String(multiResult.combined_overview.total_datasets)}>
                    {multiResult.combined_overview.total_datasets}
                  </div>
                  <div className="mt-1 text-[10px] text-[#2563EB] font-medium truncate">All active files</div>
                </div>

                {/* Total Rows */}
                <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4 shadow-xs min-w-0 overflow-hidden box-border">
                  <div className="flex items-center justify-between text-[#64748B] dark:text-slate-400 text-[11px] font-medium min-w-0">
                    <span className="truncate">Total Rows</span>
                    <Hash className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                  </div>
                  <div className="mt-2 text-xl font-bold text-[#0F172A] dark:text-white truncate font-mono" title={multiResult.combined_overview.total_rows.toLocaleString()}>
                    {multiResult.combined_overview.total_rows.toLocaleString()}
                  </div>
                  <div className="mt-1 text-[10px] text-[#64748B] dark:text-slate-400 truncate">Across all datasets</div>
                </div>

                {/* Total Columns */}
                <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4 shadow-xs min-w-0 overflow-hidden box-border">
                  <div className="flex items-center justify-between text-[#64748B] dark:text-slate-400 text-[11px] font-medium min-w-0">
                    <span className="truncate">Total Columns</span>
                    <Columns className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                  </div>
                  <div className="mt-2 text-xl font-bold text-[#0F172A] dark:text-white truncate font-mono" title={String(multiResult.combined_overview.total_columns)}>
                    {multiResult.combined_overview.total_columns}
                  </div>
                  <div className="mt-1 text-[10px] text-[#64748B] dark:text-slate-400 truncate">Combined attributes</div>
                </div>

                {/* Combined Missing Values */}
                <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4 shadow-xs min-w-0 overflow-hidden box-border">
                  <div className="flex items-center justify-between text-[#64748B] dark:text-slate-400 text-[11px] font-medium min-w-0">
                    <span className="truncate">Missing Values</span>
                    <AlertTriangle
                      className={`w-3.5 h-3.5 shrink-0 ${
                        multiResult.combined_overview.total_missing_cells > 0 ? 'text-amber-500' : 'text-emerald-500'
                      }`}
                    />
                  </div>
                  <div className="mt-2 text-xl font-bold text-[#0F172A] dark:text-white truncate font-mono" title={multiResult.combined_overview.total_missing_cells.toLocaleString()}>
                    {multiResult.combined_overview.total_missing_cells.toLocaleString()}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold truncate">
                    <span
                      className={
                        multiResult.combined_overview.total_missing_cells > 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }
                    >
                      {multiResult.combined_overview.overall_missing_percentage}% of all cells
                    </span>
                  </div>
                </div>

                {/* Combined Duplicates */}
                <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4 shadow-xs min-w-0 overflow-hidden box-border">
                  <div className="flex items-center justify-between text-[#64748B] dark:text-slate-400 text-[11px] font-medium min-w-0">
                    <span className="truncate">Duplicate Rows</span>
                    <Layers
                      className={`w-3.5 h-3.5 shrink-0 ${
                        multiResult.combined_overview.total_duplicate_rows > 0 ? 'text-amber-500' : 'text-emerald-500'
                      }`}
                    />
                  </div>
                  <div className="mt-2 text-xl font-bold text-[#0F172A] dark:text-white truncate font-mono" title={multiResult.combined_overview.total_duplicate_rows.toLocaleString()}>
                    {multiResult.combined_overview.total_duplicate_rows.toLocaleString()}
                  </div>
                  <div className="mt-1 text-[10px] font-semibold truncate">
                    <span
                      className={
                        multiResult.combined_overview.total_duplicate_rows > 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }
                    >
                      {multiResult.combined_overview.overall_duplicate_percentage}% duplicate
                    </span>
                  </div>
                </div>
              </div>

              {/* Cross-Dataset Insights Card */}
              {multiResult.cross_dataset_insights?.length > 0 && (
                <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl p-5 shadow-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#2563EB]" />
                    <h3 className="text-xs font-bold text-[#1D4ED8] uppercase tracking-wider">
                      Cross-Dataset Verified Insights
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {multiResult.cross_dataset_insights.map((insight, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs text-[#1E3A8A]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#2563EB] shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{insight}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Side-by-Side Dataset Comparison Table */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs">
                <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#2563EB]" />
                    <h3 className="text-sm font-bold text-[#0F172A]">Per-Dataset Structural Breakdown</h3>
                  </div>
                  <span className="text-xs text-[#64748B]">
                    Click any dataset to inspect its full profile
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="px-6 py-3.5">Dataset Name</th>
                        <th className="px-4 py-3.5">Format</th>
                        <th className="px-4 py-3.5 text-right">Rows</th>
                        <th className="px-4 py-3.5 text-right">Cols</th>
                        <th className="px-4 py-3.5 text-right">Size</th>
                        <th className="px-4 py-3.5 text-right">Missing %</th>
                        <th className="px-4 py-3.5 text-right">Duplicates</th>
                        <th className="px-4 py-3.5 text-center">Quality Score</th>
                        <th className="px-6 py-3.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] text-[#0F172A]">
                      {multiResult.combined_overview.dataset_summaries.map((ds) => (
                        <tr
                          key={ds.dataset_id}
                          className="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                          onClick={() => {
                            setSelectedIndividualId(ds.dataset_id);
                            setActiveTab('individual');
                          }}
                        >
                          <td className="px-6 py-3.5 font-semibold text-[#0F172A] group-hover:text-[#2563EB] flex items-center gap-2">
                            <span>{ds.name}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border">
                              {ds.file_type}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right font-medium">{ds.rows.toLocaleString()}</td>
                          <td className="px-4 py-3.5 text-right font-medium">{ds.columns}</td>
                          <td className="px-4 py-3.5 text-right text-[#64748B]">{formatFileSize(ds.file_size_bytes)}</td>
                          <td className="px-4 py-3.5 text-right font-semibold">
                            <span className={ds.missing_percentage > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                              {ds.missing_percentage}%
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold">
                            <span className={ds.duplicate_rows > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                              {ds.duplicate_rows.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getQualityBadge(
                                ds.health_status
                              )}`}
                            >
                              {ds.health_score ?? 'N/A'}/100
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <span className="text-[#2563EB] font-semibold text-xs flex items-center justify-end gap-1 group-hover:translate-x-0.5 transition-transform">
                              <span>Profile</span>
                              <ArrowRight className="w-3 h-3" />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: SCHEMA COMPARISON MATRIX                          */}
          {/* ========================================================= */}
          {activeTab === 'comparison' && multiResult.comparison && (
            <div className="space-y-6">
              {/* Comparability Summary Banner */}
              <div
                className={`p-4 rounded-2xl border text-xs flex items-start gap-3 shadow-xs ${
                  multiResult.comparison.is_comparable
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                {multiResult.comparison.is_comparable ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <div className="font-bold text-sm">
                    {multiResult.comparison.is_comparable
                      ? 'Schema Alignment Detected'
                      : 'Distinct Schemas Detected'}
                  </div>
                  <p className="leading-relaxed">{multiResult.comparison.comparability_notes}</p>
                </div>
              </div>

              {/* Shared vs Unique Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 min-w-0">
                <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4 shadow-xs min-w-0 overflow-hidden box-border">
                  <div className="text-[11px] font-medium text-[#64748B] dark:text-slate-400 truncate">Shared Columns</div>
                  <div className="mt-1 text-2xl font-bold text-[#2563EB] truncate font-mono" title={String(multiResult.comparison.shared_columns.length)}>
                    {multiResult.comparison.shared_columns.length}
                  </div>
                  <div className="mt-1 text-[10px] text-[#64748B] dark:text-slate-400 truncate">
                    Present across 2+ datasets
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4 shadow-xs min-w-0 overflow-hidden box-border">
                  <div className="text-[11px] font-medium text-[#64748B] dark:text-slate-400 truncate">Universal Columns</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-600 truncate font-mono" title={String(multiResult.comparison.shared_across_all_columns.length)}>
                    {multiResult.comparison.shared_across_all_columns.length}
                  </div>
                  <div className="mt-1 text-[10px] text-[#64748B] dark:text-slate-400 truncate">
                    Present in all selected datasets
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4 shadow-xs min-w-0 overflow-hidden box-border">
                  <div className="text-[11px] font-medium text-[#64748B] dark:text-slate-400 truncate">Type Conflicts</div>
                  <div
                    className={`mt-1 text-2xl font-bold truncate font-mono ${
                      multiResult.comparison.type_mismatches?.length > 0
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }`}
                    title={String(multiResult.comparison.type_mismatches?.length || 0)}
                  >
                    {multiResult.comparison.type_mismatches?.length || 0}
                  </div>
                  <div className="mt-1 text-[10px] text-[#64748B] dark:text-slate-400 truncate">
                    {multiResult.comparison.type_mismatches?.length > 0
                      ? 'Conflicting data types detected'
                      : 'All shared column types compatible'}
                  </div>
                </div>
              </div>

              {/* Column Comparison Matrix Table */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs space-y-4 p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#0F172A]">Cross-Dataset Attribute Matrix</h3>
                    <p className="text-[11px] text-[#64748B] mt-0.5">
                      Compares presence, data types, null counts, and uniqueness across all datasets.
                    </p>
                  </div>

                  {/* Filter and Search Bar */}
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={comparisonSearch}
                        onChange={(e) => setComparisonSearch(e.target.value)}
                        placeholder="Search column..."
                        className="pl-8 pr-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                      />
                    </div>

                    <select
                      value={comparisonFilter}
                      onChange={(e) => setComparisonFilter(e.target.value)}
                      className="px-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl font-semibold text-[#0F172A] focus:outline-none cursor-pointer"
                    >
                      <option value="ALL">All Columns</option>
                      <option value="SHARED">Shared Only</option>
                      <option value="UNIQUE">Unique Only</option>
                      <option value="MISMATCH">Type Mismatches</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Column Name</th>
                        <th className="px-4 py-3">Shared Status</th>
                        <th className="px-4 py-3">Type Compatibility</th>
                        <th className="px-4 py-3">Dataset Breakdown (Types & Nulls)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] text-[#0F172A]">
                      {filteredComparisonMatrix.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="px-4 py-8 text-center text-xs text-[#64748B]">
                            No columns matching the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredComparisonMatrix.map((col) => (
                          <tr key={col.column_name} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="px-4 py-3 font-semibold text-[#0F172A]">
                              <span>{col.column_name}</span>
                            </td>
                            <td className="px-4 py-3">
                              {col.is_shared_across_all ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  All Datasets
                                </span>
                              ) : col.is_shared ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                  Shared ({col.present_in_dataset_ids.length})
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                                  Unique to 1 dataset
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {col.type_compatible ? (
                                <span className="text-[10px] font-semibold text-emerald-700 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Compatible</span>
                                </span>
                              ) : (
                                <span
                                  className="text-[10px] font-semibold text-amber-700 flex items-center gap-1 cursor-help"
                                  title={col.type_mismatch_warning}
                                >
                                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                                  <span>Type Mismatch</span>
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(col.dataset_details).map(([dsName, detail]) => (
                                  <div
                                    key={dsName}
                                    className="p-1.5 px-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px]"
                                  >
                                    <span className="font-semibold text-slate-800">{dsName}: </span>
                                    <span className="font-mono text-[#2563EB]">{detail.data_type}</span>
                                    <span className="text-slate-400"> · </span>
                                    <span
                                      className={
                                        detail.missing_percentage > 0 ? 'text-amber-600' : 'text-slate-500'
                                      }
                                    >
                                      {detail.missing_percentage}% null
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: CROSS-DATASET RELATIONSHIPS                       */}
          {/* ========================================================= */}
          {activeTab === 'relationships' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                    <GitMerge className="w-4 h-4 text-[#2563EB]" />
                    <span>Discovered Relational Keys & Foreign Key Links</span>
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Evaluated from actual value overlap, uniqueness, and normalized column identities.
                  </p>
                </div>
                <button
                  onClick={() => navigate('/data-cleaning')}
                  className="px-3.5 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Join Datasets in Cleaning</span>
                </button>
              </div>

              {(!multiResult.relationships || multiResult.relationships.length === 0) ? (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center shadow-xs">
                  <GitMerge className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <h4 className="text-sm font-bold text-[#0F172A]">No Relational Links Detected</h4>
                  <p className="text-xs text-[#64748B] max-w-md mx-auto mt-1 leading-relaxed">
                    Scan complete: No strong column relationships detected among the selected datasets based on matching values and primary/foreign key attributes.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {multiResult.relationships.map((rel, idx) => {
                    const isM2M = rel.cardinality_symbol === 'M:N';
                    const is11 = rel.cardinality_symbol === '1:1';
                    const is1N = rel.cardinality_symbol === '1:N';

                    return (
                      <div
                        key={idx}
                        className="bg-white border border-[#E2E8F0] hover:border-[#2563EB] rounded-2xl p-5 shadow-xs transition-all space-y-3"
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                is11
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : is1N
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : isM2M
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : 'bg-purple-50 text-purple-700 border-purple-200'
                              }`}
                            >
                              {rel.cardinality_symbol} · {rel.relationship_type}
                            </span>
                            {rel.is_candidate && (
                              <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                Candidate Match
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-bold text-[#2563EB]">
                            {(rel.confidence * 100).toFixed(0)}% Confidence
                          </span>
                        </div>

                        {/* Visual Source ↔ Target Diagram */}
                        <div className="grid grid-cols-5 items-center gap-2 py-2 min-w-0">
                          <div className="col-span-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 min-w-0 overflow-hidden box-border">
                            <div className="text-[10px] text-[#64748B] dark:text-slate-400 truncate font-medium" title={rel.source_dataset}>
                              {rel.source_dataset}
                            </div>
                            <div className="text-xs font-bold text-[#0F172A] dark:text-white truncate mt-0.5" title={rel.source_column}>
                              {rel.source_column}
                            </div>
                            <div className="text-[9px] text-[#64748B] dark:text-slate-400 mt-0.5 truncate">
                              {rel.source_unique ? 'Unique (PK)' : 'Repeated (FK)'}
                            </div>
                          </div>

                          <div className="flex flex-col items-center justify-center text-[#2563EB] shrink-0">
                            <GitMerge className="w-4 h-4" />
                            <span className="text-[9px] font-mono mt-0.5">{rel.cardinality_symbol}</span>
                          </div>

                          <div className="col-span-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 min-w-0 overflow-hidden box-border">
                            <div className="text-[10px] text-[#64748B] dark:text-slate-400 truncate font-medium" title={rel.target_dataset}>
                              {rel.target_dataset}
                            </div>
                            <div className="text-xs font-bold text-[#0F172A] dark:text-white truncate mt-0.5" title={rel.target_column}>
                              {rel.target_column}
                            </div>
                            <div className="text-[9px] text-[#64748B] dark:text-slate-400 mt-0.5 truncate">
                              {rel.target_unique ? 'Unique (PK)' : 'Repeated (FK)'}
                            </div>
                          </div>
                        </div>

                        {/* Cardinality explanation */}
                        <p className="text-xs text-[#475569] dark:text-slate-300 leading-relaxed bg-[#F8FAFC] dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 break-words overflow-hidden">
                          {rel.cardinality_explanation}
                        </p>

                        {/* Join Safety Status */}
                        <div className="flex items-center justify-between pt-1 text-[11px] gap-2 min-w-0">
                          <span className="text-[#64748B] dark:text-slate-400 truncate min-w-0" title={`${rel.matching_values_count.toLocaleString()} matching keys (${rel.overlap_score}% overlap)`}>
                            {rel.matching_values_count.toLocaleString()} matching keys ({rel.overlap_score}% overlap)
                          </span>
                          {rel.safe_for_join ? (
                            <span className="text-emerald-700 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Safe to Join</span>
                            </span>
                          ) : (
                            <span className="text-red-600 font-semibold flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Row Explosion Risk</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: INDIVIDUAL DATASET PROFILES                       */}
          {/* ========================================================= */}
          {activeTab === 'individual' && (
            <div className="space-y-6">
              {/* Individual Dataset Switcher Sub-Tabs */}
              {Object.keys(multiResult.individual_profiles || {}).length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <span className="text-xs font-semibold text-[#64748B] mr-1">Switch Dataset:</span>
                  {Object.entries(multiResult.individual_profiles).map(([dsIdStr, prof]) => {
                    const dsId = Number(dsIdStr);
                    const isSelected = selectedIndividualId === dsId;
                    return (
                      <button
                        key={dsId}
                        onClick={() => setSelectedIndividualId(dsId)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 border ${
                          isSelected
                            ? 'bg-[#2563EB] text-white border-[#2563EB] shadow-2xs'
                            : 'bg-white text-[#0F172A] border-[#E2E8F0] hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <Database className="w-3.5 h-3.5" />
                        <span>{prof.dataset_info.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {prof.dataset_info.rows.toLocaleString()} rows
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Individual Profile Detailed Content */}
              {activeProfile ? (
                <div className="space-y-6">
                  {/* KPI Cards for the active individual dataset */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 min-w-0">
                    {/* Rows */}
                    <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4 shadow-xs min-w-0 overflow-hidden box-border">
                      <div className="flex items-center justify-between text-[#64748B] dark:text-slate-400 text-[11px] font-medium min-w-0">
                        <span className="truncate">Total Rows</span>
                        <Hash className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                      </div>
                      <div className="mt-2 text-xl font-bold text-[#0F172A] dark:text-white truncate font-mono" title={activeProfile.dataset_info.rows.toLocaleString()}>
                        {activeProfile.dataset_info.rows.toLocaleString()}
                      </div>
                      <div className="mt-1 text-[10px] text-[#64748B] dark:text-slate-400 truncate">Observed records</div>
                    </div>

                    {/* Columns */}
                    <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4 shadow-xs min-w-0 overflow-hidden box-border">
                      <div className="flex items-center justify-between text-[#64748B] dark:text-slate-400 text-[11px] font-medium min-w-0">
                        <span className="truncate">Columns</span>
                        <Columns className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                      </div>
                      <div className="mt-2 text-xl font-bold text-[#0F172A] dark:text-white truncate font-mono" title={String(activeProfile.dataset_info.columns)}>
                        {activeProfile.dataset_info.columns}
                      </div>
                      <div className="mt-1 text-[10px] text-[#64748B] dark:text-slate-400 truncate">Features / attributes</div>
                    </div>

                    {/* Missing Cells */}
                    <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4 shadow-xs min-w-0 overflow-hidden box-border">
                      <div className="flex items-center justify-between text-[#64748B] dark:text-slate-400 text-[11px] font-medium min-w-0">
                        <span className="truncate">Missing Values</span>
                        <AlertTriangle
                          className={`w-3.5 h-3.5 shrink-0 ${
                            activeProfile.quality_summary.total_missing_cells > 0
                              ? 'text-amber-500'
                              : 'text-emerald-500'
                          }`}
                        />
                      </div>
                      <div className="mt-2 text-xl font-bold text-[#0F172A] dark:text-white truncate font-mono" title={activeProfile.quality_summary.total_missing_cells.toLocaleString()}>
                        {activeProfile.quality_summary.total_missing_cells.toLocaleString()}
                      </div>
                      <div className="mt-1 text-[10px] font-semibold truncate">
                        <span
                          className={
                            activeProfile.quality_summary.total_missing_cells > 0
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {activeProfile.quality_summary.missing_percentage}% of cells
                        </span>
                      </div>
                    </div>

                    {/* Duplicate Rows */}
                    <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4 shadow-xs min-w-0 overflow-hidden box-border">
                      <div className="flex items-center justify-between text-[#64748B] dark:text-slate-400 text-[11px] font-medium min-w-0">
                        <span className="truncate">Duplicate Rows</span>
                        <Layers
                          className={`w-3.5 h-3.5 shrink-0 ${
                            activeProfile.quality_summary.duplicate_rows > 0
                              ? 'text-amber-500'
                              : 'text-emerald-500'
                          }`}
                        />
                      </div>
                      <div className="mt-2 text-xl font-bold text-[#0F172A] dark:text-white truncate font-mono" title={activeProfile.quality_summary.duplicate_rows.toLocaleString()}>
                        {activeProfile.quality_summary.duplicate_rows.toLocaleString()}
                      </div>
                      <div className="mt-1 text-[10px] font-semibold truncate">
                        <span
                          className={
                            activeProfile.quality_summary.duplicate_rows > 0
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {activeProfile.quality_summary.duplicate_percentage}% duplicate
                        </span>
                      </div>
                    </div>

                    {/* Health Score */}
                    <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-4 shadow-xs col-span-2 sm:col-span-1 min-w-0 overflow-hidden box-border">
                      <div className="flex items-center justify-between text-[#64748B] dark:text-slate-400 text-[11px] font-medium min-w-0">
                        <span className="truncate">Quality Status</span>
                        <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />
                      </div>
                      <div className="mt-2 flex items-baseline gap-2 min-w-0">
                        <span className="text-xl font-bold text-[#0F172A] dark:text-white truncate font-mono">
                          {activeProfile.quality_summary.health_score}
                        </span>
                        <span className="text-xs text-[#94A3B8] shrink-0">/ 100</span>
                      </div>
                      <div className="mt-1 min-w-0">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border truncate max-w-full ${getQualityBadge(
                            activeProfile.quality_summary.health_status
                          )}`}
                          title={activeProfile.quality_summary.health_status}
                        >
                          {activeProfile.quality_summary.health_status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Metadata bar */}
                  <div className="bg-white border border-[#E2E8F0] rounded-xl px-5 py-3 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs text-[#64748B]">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-[#0F172A]">{activeProfile.dataset_info.name}</span>
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-semibold">
                        {activeProfile.dataset_info.file_type}
                      </span>
                      <span>•</span>
                      <span>{formatFileSize(activeProfile.dataset_info.file_size_bytes)}</span>
                      <span>•</span>
                      <span>{activeProfile.dataset_info.total_cells.toLocaleString()} total cells</span>
                    </div>
                    <div>
                      <span>Uploaded: </span>
                      <span className="font-medium text-[#0F172A]">
                        {formatDate(activeProfile.dataset_info.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* ========================================================================= */}
                  {/* 4 GRAPHICAL REPRESENTATIONS DASHBOARD GRID                                */}
                  {/* ========================================================================= */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-w-0">
                    {/* CARD 1: COLUMN DATA TYPES (Doughnut Chart & Legend) */}
                    <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden box-border">
                      <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9] dark:border-slate-800 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <PieIcon className="w-4 h-4 text-[#8B5CF6] shrink-0" />
                          <span className="text-xs font-bold text-[#0F172A] dark:text-white truncate">Column Data Types</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 py-3 min-w-0">
                        {/* SVG Doughnut */}
                        <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                          <svg viewBox="0 0 120 120" className="w-full h-full transform -rotate-90">
                            {columnTypeBreakdown.items.filter((it) => it.count > 0).map((it) => (
                              <path
                                key={it.label}
                                d={getDonutSlicePath(60, 60, 48, 30, it.startAngle, it.endAngle)}
                                fill={it.color}
                                className="transition-all duration-200 hover:opacity-85 cursor-pointer"
                              >
                                <title>{`${it.label}: ${it.count} columns (${it.percentage}%)`}</title>
                              </path>
                            ))}
                          </svg>
                          {/* Center label */}
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                            <span className="text-base font-bold text-[#0F172A] dark:text-white leading-none">
                              {columnTypeBreakdown.total}
                            </span>
                            <span className="text-[9px] text-[#64748B] dark:text-slate-400 font-medium mt-0.5">
                              Columns
                            </span>
                          </div>
                        </div>

                        {/* Legend */}
                        <div className="flex-1 space-y-1.5 pl-2 text-xs min-w-0">
                          {columnTypeBreakdown.items.map((it) => (
                            <div key={it.label} className="flex items-center justify-between text-[11px] gap-1.5 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: it.color }} />
                                <span className="text-[#64748B] dark:text-slate-400 truncate font-medium" title={it.label}>{it.label}</span>
                              </div>
                              <span className="font-semibold text-[#0F172A] dark:text-white shrink-0 font-mono text-[10px]">
                                {it.count} ({it.percentage}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* CARD 2: MISSING VALUES PER COLUMN (Top Features) */}
                    <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden box-border">
                      <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9] dark:border-slate-800 gap-2 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <AlertTriangle className="w-4 h-4 text-[#8B5CF6] shrink-0" />
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-[#0F172A] dark:text-white block truncate">
                              Missing Values per Column
                            </span>
                            <span className="text-[9px] text-[#64748B] dark:text-slate-400 block -mt-0.5 truncate">
                              (Top Features)
                            </span>
                          </div>
                        </div>

                        {/* Toggle Controls: Bar | Line | Scatter */}
                        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg shrink-0">
                          {['bar', 'line', 'scatter'].map((t) => (
                            <button
                              key={t}
                              onClick={() => setMissingChartType(t)}
                              className={`px-2 py-0.5 rounded text-[9px] font-bold capitalize transition-colors cursor-pointer ${
                                missingChartType === t
                                  ? 'bg-[#2563EB] text-white shadow-2xs'
                                  : 'text-[#64748B] dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Content based on selected chart type */}
                      <div className="py-2 flex-1 flex flex-col justify-center min-w-0">
                        {missingChartType === 'bar' ? (
                          <div className="space-y-2 min-w-0">
                            {topMissingFeatures.map((col) => {
                              const hasMissing = (col.missing_count || 0) > 0;
                              return (
                                <div key={col.name} className="flex items-center justify-between gap-2 text-xs min-w-0">
                                  <span
                                    className="font-mono text-[11px] text-[#475569] dark:text-slate-300 truncate w-20 shrink-0"
                                    title={col.name}
                                  >
                                    {col.name}
                                  </span>
                                  <div className="flex-1 min-w-[20px] h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        hasMissing ? 'bg-amber-500' : 'bg-transparent'
                                      }`}
                                      style={{ width: `${Math.min(col.missing_percentage || 0, 100)}%` }}
                                    />
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                                    <span className="text-[#64748B] dark:text-slate-400 min-w-[28px] text-right font-mono">
                                      {col.missing_percentage ?? 0}%
                                    </span>
                                    <span className="font-semibold text-[#0F172A] dark:text-white min-w-[20px] text-right font-mono">
                                      {col.missing_count ?? 0}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          /* Line or Scatter chart for missing values */
                          <div className="h-28 w-full flex items-center justify-center">
                            <svg viewBox="0 0 200 90" className="w-full h-full">
                              {/* Gridlines */}
                              <line x1="15" y1="20" x2="190" y2="20" stroke="#E2E8F0" strokeDasharray="2 2" />
                              <line x1="15" y1="50" x2="190" y2="50" stroke="#E2E8F0" strokeDasharray="2 2" />
                              <line x1="15" y1="75" x2="190" y2="75" stroke="#CBD5E1" />

                              {(() => {
                                const pts = topMissingFeatures.map((c, i) => {
                                  const x = 25 + i * (160 / Math.max(topMissingFeatures.length - 1, 1));
                                  const y = 75 - Math.min((c.missing_percentage || 0) * 0.5, 55);
                                  return { x, y, name: c.name, val: c.missing_count || 0, pct: c.missing_percentage || 0 };
                                });

                                if (missingChartType === 'line') {
                                  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                                  return (
                                    <>
                                      <path d={pathD} fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" />
                                      {pts.map((p, i) => (
                                        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#2563EB" className="cursor-pointer">
                                          <title>{`${p.name}: ${p.val} missing (${p.pct}%)`}</title>
                                        </circle>
                                      ))}
                                    </>
                                  );
                                }

                                return pts.map((p, i) => (
                                  <circle key={i} cx={p.x} cy={p.y} r="4" fill="#8B5CF6" className="cursor-pointer">
                                    <title>{`${p.name}: ${p.val} missing (${p.pct}%)`}</title>
                                  </circle>
                                ));
                              })()}
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* CARD 3: NUMERIC DATA DISTRIBUTION (Histogram / Distribution) */}
                    <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden box-border">
                      <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9] dark:border-slate-800 gap-1.5 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <BarChart3 className="w-4 h-4 text-[#2563EB] shrink-0" />
                          <span className="text-xs font-bold text-[#0F172A] dark:text-white truncate">Data Distribution</span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Numeric Column Dropdown */}
                          {numericColumns.length > 0 && (
                            <select
                              value={selectedNumericCol}
                              onChange={(e) => setSelectedNumericCol(e.target.value)}
                              className="text-[10px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5 font-semibold text-[#0F172A] dark:text-white focus:outline-none cursor-pointer max-w-[90px] truncate"
                              title="Select Numeric Column"
                            >
                              {numericColumns.map((c) => (
                                <option key={c.name} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          )}

                          {/* Toggle Controls: Bar | Line | Scatter */}
                          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                            {['bar', 'line', 'scatter'].map((t) => (
                              <button
                                key={t}
                                onClick={() => setNumericChartType(t)}
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold capitalize transition-colors cursor-pointer ${
                                  numericChartType === t
                                    ? 'bg-[#2563EB] text-white shadow-2xs'
                                    : 'text-[#64748B] dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white'
                                }`}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Distribution Chart SVG */}
                      <div className="py-1 flex-1 flex flex-col justify-center min-w-0">
                        {activeNumericBins.length === 0 ? (
                          <div className="text-center py-6 text-[11px] text-[#64748B] dark:text-slate-400">
                            No numeric distribution available
                          </div>
                        ) : (
                          <div className="w-full h-28">
                            <svg viewBox="0 0 240 120" className="w-full h-full">
                              {/* Horizontal Gridlines & Y-axis labels */}
                              {[0, activeHistMax / 2, activeHistMax].map((tickVal, idx) => {
                                const y = 92 - (idx / 2) * 72;
                                return (
                                  <g key={idx}>
                                    <line x1="24" y1={y} x2="232" y2={y} stroke="#E2E8F0" strokeDasharray="2 2" />
                                    <text x="18" y={y + 3} textAnchor="end" className="text-[8px] fill-slate-400 font-mono">
                                      {Math.round(tickVal)}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Baseline */}
                              <line x1="24" y1="92" x2="232" y2="92" stroke="#CBD5E1" strokeWidth="1" />

                              {/* Bars / Line / Scatter */}
                              {(() => {
                                const n = activeNumericBins.length;
                                const barWidth = Math.max(8, (200 / n) - 4);

                                if (numericChartType === 'bar') {
                                  return activeNumericBins.map((b, idx) => {
                                    const x = 28 + idx * (200 / n);
                                    const h = Math.max(3, (b.count / activeHistMax) * 72);
                                    const y = 92 - h;
                                    return (
                                      <rect
                                        key={idx}
                                        x={x}
                                        y={y}
                                        width={barWidth}
                                        height={h}
                                        rx="1.5"
                                        fill="#60A5FA"
                                        className="transition-all duration-150 hover:fill-[#2563EB] cursor-pointer"
                                      >
                                        <title>{`Bin ${b.bin_start} - ${b.bin_end}: ${b.count} count`}</title>
                                      </rect>
                                    );
                                  });
                                }

                                const pts = activeNumericBins.map((b, idx) => {
                                  const x = 28 + idx * (200 / n) + barWidth / 2;
                                  const h = (b.count / activeHistMax) * 72;
                                  const y = 92 - h;
                                  return { x, y, b };
                                });

                                if (numericChartType === 'line') {
                                  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                                  const areaD = `${pathD} L ${pts[pts.length - 1].x} 92 L ${pts[0].x} 92 Z`;
                                  return (
                                    <>
                                      <path d={areaD} fill="#93C5FD" fillOpacity="0.25" />
                                      <path d={pathD} fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" />
                                      {pts.map((p, idx) => (
                                        <circle key={idx} cx={p.x} cy={p.y} r="2.5" fill="#1D4ED8" className="cursor-pointer">
                                          <title>{`Bin ${p.b.bin_start} - ${p.b.bin_end}: ${p.b.count} count`}</title>
                                        </circle>
                                      ))}
                                    </>
                                  );
                                }

                                return pts.map((p, idx) => (
                                  <circle key={idx} cx={p.x} cy={p.y} r="3.5" fill="#3B82F6" className="cursor-pointer">
                                    <title>{`Bin ${p.b.bin_start} - ${p.b.bin_end}: ${p.b.count} count`}</title>
                                  </circle>
                                ));
                              })()}

                              {/* X-axis tick labels */}
                              {activeNumericBins.length > 0 && (
                                <g className="text-[8px] fill-slate-400 font-mono">
                                  <text x="28" y="102" textAnchor="start">
                                    {formatCompact(activeNumericBins[0].bin_start)}
                                  </text>
                                  {activeNumericBins.length > 2 && (
                                    <text x="128" y="102" textAnchor="middle">
                                      {formatCompact(activeNumericBins[Math.floor(activeNumericBins.length / 2)].bin_start)}
                                    </text>
                                  )}
                                  <text x="228" y="102" textAnchor="end">
                                    {formatCompact(activeNumericBins[activeNumericBins.length - 1].bin_end)}
                                  </text>
                                </g>
                              )}

                              {/* Bottom column name label */}
                              <text x="128" y="115" textAnchor="middle" className="text-[9px] fill-[#64748B] font-semibold">
                                {selectedNumericCol?.length > 24 ? selectedNumericCol.slice(0, 21) + '...' : selectedNumericCol}
                              </text>
                            </svg>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* CARD 4: CATEGORICAL VALUE DISTRIBUTION (Doughnut/Pie & Legend) */}
                    <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden box-border">
                      <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9] dark:border-slate-800 gap-1.5 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <PieIcon className="w-4 h-4 text-[#8B5CF6] shrink-0" />
                          <span className="text-xs font-bold text-[#0F172A] dark:text-white truncate">
                            Categorical Value Distribution
                          </span>
                        </div>

                        {/* Categorical Column Dropdown */}
                        {categoricalColumns.length > 0 && (
                          <select
                            value={selectedCategoricalCol}
                            onChange={(e) => setSelectedCategoricalCol(e.target.value)}
                            className="text-[10px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5 font-semibold text-[#0F172A] dark:text-white focus:outline-none cursor-pointer max-w-[100px] truncate shrink-0"
                            title="Select Categorical Column"
                          >
                            {categoricalColumns.map((c) => (
                              <option key={c.name} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="py-2 flex-1 flex items-center justify-between gap-2 min-w-0">
                        {activeCategoricalSlices.length === 0 ? (
                          <div className="text-center py-6 w-full text-[11px] text-[#64748B] dark:text-slate-400">
                            No categories found in {selectedCategoricalCol || 'column'}
                          </div>
                        ) : (
                          <>
                            {/* Pie / Donut SVG */}
                            <div className="w-24 h-24 shrink-0 relative flex items-center justify-center">
                              <svg viewBox="0 0 120 120" className="w-full h-full transform -rotate-90">
                                {activeCategoricalSlices.map((s) => (
                                  <path
                                    key={s.label}
                                    d={getPieSlicePath(60, 60, 52, s.startAngle, s.endAngle)}
                                    fill={s.color}
                                    className="transition-all duration-200 hover:opacity-85 cursor-pointer"
                                  >
                                    <title>{`${s.label}: ${s.count} (${s.percentage}%)`}</title>
                                  </path>
                                ))}
                              </svg>
                            </div>

                            {/* Legend */}
                            <div className="flex-1 space-y-1.5 pl-1 min-w-0">
                              {activeCategoricalSlices.map((s) => (
                                <div key={s.label} className="flex items-center justify-between text-[11px] gap-1.5 min-w-0">
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <span className="w-2 h-2 rounded-xs shrink-0" style={{ backgroundColor: s.color }} />
                                    <span className="text-[#475569] dark:text-slate-300 truncate font-medium text-[11px]" title={s.label}>
                                      {s.label}
                                    </span>
                                  </div>
                                  <span className="font-semibold text-[#0F172A] dark:text-white shrink-0 text-[10px] font-mono">
                                    {s.count} ({s.percentage}%)
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ========================================================================= */}
                  {/* COLUMN ATTRIBUTE PROFILES (Cards with Mini Charts & Horizontal Scroll)     */}
                  {/* ========================================================================= */}
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-bold text-[#0F172A] dark:text-white flex items-center gap-2">
                          <Layers className="w-4 h-4 text-[#8B5CF6]" />
                          <span>Column Attribute Profiles</span>
                        </h2>
                        <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                          Statistical distributions, semantic data types, and value frequency rankings.
                        </p>
                      </div>

                      {/* Search & Filter Controls */}
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={columnSearch}
                            onChange={(e) => setColumnSearch(e.target.value)}
                            placeholder="Filter columns..."
                            className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 text-[#0F172A] dark:text-white"
                          />
                        </div>

                        <select
                          value={typeFilter}
                          onChange={(e) => setTypeFilter(e.target.value)}
                          className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-800 rounded-xl font-semibold text-[#0F172A] dark:text-white focus:outline-none cursor-pointer"
                        >
                          <option value="ALL">All Types</option>
                          <option value="NUMERIC">Numeric</option>
                          <option value="CATEGORICAL">Categorical</option>
                          <option value="MISSING">With Missing</option>
                        </select>

                        {/* View Toggle: Deck vs Grid */}
                        <button
                          onClick={() => setCardDeckView((v) => (v === 'deck' ? 'grid' : 'deck'))}
                          className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                          title={cardDeckView === 'deck' ? 'Switch to Wrap Grid' : 'Switch to Horizontal Deck'}
                        >
                          {cardDeckView === 'deck' ? (
                            <LayoutGrid className="w-3.5 h-3.5" />
                          ) : (
                            <Columns className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Columns Display (Horizontal Deck or Wrap Grid) */}
                    <div
                      className={
                        cardDeckView === 'deck'
                          ? 'flex gap-3.5 overflow-x-auto pb-4 custom-scrollbar min-w-0'
                          : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 min-w-0'
                      }
                    >
                      {filteredColumns.map((col) => {
                        const isNum = col.semantic_type === 'NUMERIC';
                        const isCat = col.semantic_type === 'CATEGORICAL' || col.semantic_type === 'TEXT';
                        const isDt = col.semantic_type === 'DATETIME';

                        // Prepare mini histogram data for numeric column
                        let miniBins = [];
                        let miniMax = 1;
                        if (isNum && col.numeric_stats) {
                          if (col.numeric_stats.histogram?.length > 0) {
                            miniBins = col.numeric_stats.histogram;
                          } else {
                            const s = col.numeric_stats;
                            const min = s.min;
                            const max = s.max;
                            const step = max > min ? (max - min) / 6 : 1;
                            for (let i = 0; i < 6; i++) {
                              const bS = min + i * step;
                              const bE = min + (i + 1) * step;
                              const mid = (bS + bE) / 2;
                              const dist = Math.abs(mid - s.median) / ((s.std || (max - min) / 4) + 0.001);
                              const w = Math.exp(-0.5 * dist * dist);
                              miniBins.push({
                                bin_start: Math.round(bS * 100) / 100,
                                bin_end: Math.round(bE * 100) / 100,
                                count: Math.max(1, Math.round(w * (s.count / 2))),
                              });
                            }
                          }
                          miniMax = Math.max(...miniBins.map((b) => b.count), 1);
                        }

                        return (
                          <div
                            key={col.name}
                            className={`${
                              cardDeckView === 'deck' ? 'w-[230px] shrink-0' : 'w-full min-w-0'
                            } bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 shadow-xs flex flex-col justify-between space-y-3.5 min-w-0 overflow-hidden box-border`}
                          >
                            {/* Card Header */}
                            <div className="space-y-1 pb-2 border-b border-[#F1F5F9] dark:border-slate-800 min-w-0">
                              <div className="flex items-center justify-between gap-1.5 min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <div className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                    {getColumnIcon(col)}
                                  </div>
                                  <span
                                    className="font-bold text-xs text-[#0F172A] dark:text-white truncate"
                                    title={col.name}
                                  >
                                    {col.name}
                                  </span>
                                </div>
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border uppercase shrink-0 ${
                                    isNum
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                                      : 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400'
                                  }`}
                                >
                                  {col.semantic_type}
                                </span>
                              </div>

                              <div className="text-[10px] text-[#64748B] dark:text-slate-400 font-mono truncate" title={col.data_type}>
                                ({col.data_type})
                              </div>
                              <div className="text-[10px] text-[#64748B] dark:text-slate-400 flex items-center justify-between gap-1 min-w-0">
                                <span className="truncate">Non-null: {col.non_null_count?.toLocaleString?.() ?? col.non_null_count}</span>
                                <span className="truncate text-right">Unique: {col.unique_count?.toLocaleString?.() ?? col.unique_count}</span>
                              </div>
                              <div className="text-[10px] text-[#64748B] dark:text-slate-400 truncate">
                                Nulls:{' '}
                                <span
                                  className={
                                    col.missing_count > 0
                                      ? 'text-amber-600 font-semibold'
                                      : 'text-emerald-600 font-semibold'
                                  }
                                >
                                  {col.missing_count?.toLocaleString?.() ?? col.missing_count} ({col.missing_percentage}%)
                                </span>
                              </div>
                            </div>

                            {/* Card Body: Numeric Stats + Mini Histogram */}
                            {isNum && col.numeric_stats && (
                              <div className="space-y-3 min-w-0">
                                <div className="space-y-1 text-[11px] min-w-0">
                                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                                    <span className="text-[#64748B] dark:text-slate-400 shrink-0">Mean</span>
                                    <span
                                      className="font-semibold text-[#0F172A] dark:text-white truncate font-mono text-right text-[11px] min-w-0"
                                      title={String(col.numeric_stats.mean)}
                                    >
                                      {formatStatNumber(col.numeric_stats.mean)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                                    <span className="text-[#64748B] dark:text-slate-400 shrink-0">Median</span>
                                    <span
                                      className="font-semibold text-[#0F172A] dark:text-white truncate font-mono text-right text-[11px] min-w-0"
                                      title={String(col.numeric_stats.median)}
                                    >
                                      {formatStatNumber(col.numeric_stats.median)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                                    <span className="text-[#64748B] dark:text-slate-400 shrink-0">Std Dev</span>
                                    <span
                                      className="font-semibold text-[#0F172A] dark:text-white truncate font-mono text-right text-[11px] min-w-0"
                                      title={String(col.numeric_stats.std)}
                                    >
                                      {formatStatNumber(col.numeric_stats.std)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                                    <span className="text-[#64748B] dark:text-slate-400 shrink-0">Min</span>
                                    <span
                                      className="font-semibold text-[#0F172A] dark:text-white truncate font-mono text-right text-[11px] min-w-0"
                                      title={String(col.numeric_stats.min)}
                                    >
                                      {formatStatNumber(col.numeric_stats.min)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                                    <span className="text-[#64748B] dark:text-slate-400 shrink-0">Max</span>
                                    <span
                                      className="font-semibold text-[#0F172A] dark:text-white truncate font-mono text-right text-[11px] min-w-0"
                                      title={String(col.numeric_stats.max)}
                                    >
                                      {formatStatNumber(col.numeric_stats.max)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                                    <span className="text-[#64748B] dark:text-slate-400 shrink-0">Q1</span>
                                    <span
                                      className="font-semibold text-[#0F172A] dark:text-white truncate font-mono text-right text-[11px] min-w-0"
                                      title={String(col.numeric_stats.q1)}
                                    >
                                      {formatStatNumber(col.numeric_stats.q1)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                                    <span className="text-[#64748B] dark:text-slate-400 shrink-0">Q3</span>
                                    <span
                                      className="font-semibold text-[#0F172A] dark:text-white truncate font-mono text-right text-[11px] min-w-0"
                                      title={String(col.numeric_stats.q3)}
                                    >
                                      {formatStatNumber(col.numeric_stats.q3)}
                                    </span>
                                  </div>
                                </div>

                                {/* Mini Histogram SVG */}
                                <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                                  <svg viewBox="0 0 160 55" className="w-full h-11">
                                    {miniBins.map((b, idx) => {
                                      const bw = Math.max(5, 140 / miniBins.length - 2);
                                      const x = 10 + idx * (140 / miniBins.length);
                                      const h = Math.max(3, (b.count / miniMax) * 36);
                                      const y = 42 - h;
                                      return (
                                        <rect
                                          key={idx}
                                          x={x}
                                          y={y}
                                          width={bw}
                                          height={h}
                                          rx="1"
                                          fill="#93C5FD"
                                          className="transition-all hover:fill-[#2563EB] cursor-pointer"
                                        >
                                          <title>{`Bin ${b.bin_start} - ${b.bin_end}: ${b.count}`}</title>
                                        </rect>
                                      );
                                    })}
                                    {/* Tick labels */}
                                    <line x1="10" y1="43" x2="150" y2="43" stroke="#E2E8F0" />
                                    <g className="text-[7.5px] fill-slate-400 font-mono">
                                      <text x="10" y="52" textAnchor="start">
                                        {formatCompact(col.numeric_stats.min)}
                                      </text>
                                      <text x="45" y="52" textAnchor="middle">
                                        {formatCompact(col.numeric_stats.q1)}
                                      </text>
                                      <text x="80" y="52" textAnchor="middle">
                                        {formatCompact(col.numeric_stats.median)}
                                      </text>
                                      <text x="115" y="52" textAnchor="middle">
                                        {formatCompact(col.numeric_stats.q3)}
                                      </text>
                                      <text x="150" y="52" textAnchor="end">
                                        {formatCompact(col.numeric_stats.max)}
                                      </text>
                                    </g>
                                  </svg>
                                </div>
                              </div>
                            )}

                            {/* Card Body: Categorical Top Value Frequencies */}
                            {isCat && col.categorical_stats && (
                              <div className="space-y-2 min-w-0">
                                <span className="text-[10px] font-bold text-[#64748B] dark:text-slate-400 uppercase tracking-wider block truncate">
                                  Top Value Frequencies
                                </span>
                                <div className="space-y-1.5 min-w-0">
                                  {(col.categorical_stats.top_values || []).slice(0, 5).map((val, vIdx) => (
                                    <div key={vIdx} className="space-y-0.5 min-w-0">
                                      <div className="flex items-center justify-between gap-1.5 text-[11px] min-w-0">
                                        <span
                                          className="font-medium text-[#0F172A] dark:text-white truncate min-w-0 flex-1 text-[11px]"
                                          title={val.value}
                                        >
                                          {val.value || '(empty)'}
                                        </span>
                                        <span className="text-[#64748B] dark:text-slate-400 text-[10px] font-mono shrink-0">
                                          {val.count} ({val.percentage}%)
                                        </span>
                                      </div>
                                      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-[#6366F1] rounded-full transition-all"
                                          style={{ width: `${Math.min(val.percentage || 0, 100)}%` }}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Card Body: Datetime summary */}
                            {isDt && col.datetime_stats && (
                              <div className="space-y-2 text-xs min-w-0">
                                <span className="text-[10px] font-bold text-[#64748B] dark:text-slate-400 uppercase tracking-wider block truncate">
                                  Temporal Range
                                </span>
                                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-[10px] text-[#475569] dark:text-slate-300 space-y-1 min-w-0 overflow-hidden">
                                  <div className="truncate font-mono" title={col.datetime_stats.min_date || '—'}>
                                    From: <strong>{col.datetime_stats.min_date || '—'}</strong>
                                  </div>
                                  <div className="truncate font-mono" title={col.datetime_stats.max_date || '—'}>
                                    To: <strong>{col.datetime_stats.max_date || '—'}</strong>
                                  </div>
                                  <div className="text-slate-400 truncate">{col.datetime_stats.unique_dates} timestamps</div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center text-xs text-[#64748B]">
                  No individual profile available.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProfilingPage;
