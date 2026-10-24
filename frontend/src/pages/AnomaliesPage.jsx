import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Activity,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Download,
  Filter,
  Search,
  RefreshCw,
  Eye,
  X,
  Info,
  Layers,
  Database,
  ArrowRight,
} from 'lucide-react';
import { datasetService } from '../services/datasetService';
import { anomalyService } from '../services/anomalyService';
import { extractErrorMessage } from '../services/api';
import { AnalyticalChart } from '../components/AnalyticalChart';

export const AnomaliesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Dataset states
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState('original');
  const [availableColumns, setAvailableColumns] = useState([]);
  const [excludedColumns, setExcludedColumns] = useState([]);

  // Config parameters
  const [method, setMethod] = useState('both'); // 'both', 'iqr', 'isolation_forest'
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [iqrMultiplier, setIqrMultiplier] = useState(1.5);
  const [customMultiplier, setCustomMultiplier] = useState('1.5');
  const [contamination, setContamination] = useState(0.05);

  // Results & status
  const [results, setResults] = useState(null);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [infoNotice, setInfoNotice] = useState('');

  // Results filtering & row inspect modal
  const [recordSearch, setRecordSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [inspectRow, setInspectRow] = useState(null);

  // 1. Initial dataset loading
  useEffect(() => {
    const fetchDatasets = async () => {
      setLoadingDatasets(true);
      setError('');
      try {
        const data = await datasetService.getDatasets();
        const list = data || [];
        setDatasets(list);

        const queryId = searchParams.get('dataset_id') || searchParams.get('id');
        const savedId = localStorage.getItem('selected_dataset_id');

        if (queryId && list.some((d) => String(d.id) === String(queryId))) {
          setSelectedDatasetId(Number(queryId));
        } else if (savedId && list.some((d) => String(d.id) === String(savedId))) {
          setSelectedDatasetId(Number(savedId));
        } else if (list.length > 0) {
          setSelectedDatasetId(list[0].id);
        }
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoadingDatasets(false);
      }
    };

    fetchDatasets();
  }, [searchParams]);

  // 2. Fetch numeric columns whenever dataset or version changes
  useEffect(() => {
    if (!selectedDatasetId) {
      setAvailableColumns([]);
      setSelectedColumns([]);
      setResults(null);
      return;
    }

    const fetchColumns = async () => {
      setLoadingColumns(true);
      setError('');
      try {
        const colData = await anomalyService.getNumericColumns(selectedDatasetId, selectedVersion);
        const suitable = colData.suitable_numeric_columns || [];
        setAvailableColumns(suitable);
        setSelectedColumns(suitable); // Default select all eligible numeric features
        setExcludedColumns(colData.excluded_columns || []);
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoadingColumns(false);
      }
    };

    fetchColumns();
  }, [selectedDatasetId, selectedVersion]);

  // Handlers for dataset and column selection
  const handleDatasetChange = (id) => {
    const numId = Number(id);
    setSelectedDatasetId(numId);
    setSearchParams({ dataset_id: numId });
    localStorage.setItem('selected_dataset_id', numId);
    setResults(null);
  };

  const toggleColumn = (col) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const selectAllColumns = () => setSelectedColumns(availableColumns);
  const clearAllColumns = () => setSelectedColumns([]);

  const handleMultiplierPreset = (mult) => {
    setIqrMultiplier(mult);
    setCustomMultiplier(String(mult));
  };

  const handleCustomMultiplierChange = (val) => {
    setCustomMultiplier(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 5.0) {
      setIqrMultiplier(parsed);
    }
  };

  // Run anomaly detection
  const handleRunDetection = async () => {
    if (!selectedDatasetId) {
      setError('Please select a dataset to analyze.');
      return;
    }

    if (selectedColumns.length === 0) {
      setError('Please select at least one numeric feature for outlier detection.');
      return;
    }

    setAnalyzing(true);
    setError('');
    setInfoNotice('');

    try {
      const payload = {
        dataset_id: selectedDatasetId,
        version: selectedVersion,
        method,
        columns: selectedColumns,
        multiplier: iqrMultiplier,
        contamination: parseFloat(contamination),
        random_state: 42,
      };

      const res = await anomalyService.detectAnomalies(payload);
      setResults(res);
      if (res.warnings && res.warnings.length > 0) {
        setInfoNotice(res.warnings.join(' '));
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setAnalyzing(false);
    }
  };

  // Filtered flagged records
  const filteredRecords = useMemo(() => {
    if (!results || !results.flagged_records) return [];

    return results.flagged_records.filter((rec) => {
      // Method filter
      if (methodFilter !== 'ALL') {
        const hasIqr = rec.methods.some((m) => m.toLowerCase().includes('iqr'));
        const hasIf = rec.methods.some((m) => m.toLowerCase().includes('isolation'));

        if (methodFilter === 'both' && !(hasIqr && hasIf)) return false;
        if (methodFilter === 'iqr_only' && !(hasIqr && !hasIf)) return false;
        if (methodFilter === 'if_only' && !(!hasIqr && hasIf)) return false;
        if ((methodFilter === 'iqr_all' || methodFilter === 'iqr') && !hasIqr) return false;
        if ((methodFilter === 'if_all' || methodFilter === 'isolation') && !hasIf) return false;
      }

      // Text search across row number, reasons, and values
      if (recordSearch.trim()) {
        const query = recordSearch.toLowerCase().trim();
        const rowMatch = String(rec.row_number).includes(query);
        const reasonMatch = rec.reasons.some((r) => r.toLowerCase().includes(query));
        const colMatch = rec.flagged_columns.some((c) => c.toLowerCase().includes(query));
        const valMatch = Object.values(rec.values).some((v) =>
          String(v).toLowerCase().includes(query)
        );
        return rowMatch || reasonMatch || colMatch || valMatch;
      }

      return true;
    });
  }, [results, methodFilter, recordSearch]);

  // Export flagged records to CSV
  const handleExportCSV = () => {
    if (!results || !results.flagged_records || results.flagged_records.length === 0) return;

    // Collect all unique keys from full_row
    const allRowKeys = Array.from(
      new Set(results.flagged_records.flatMap((r) => Object.keys(r.full_row || {})))
    );

    const headers = [
      'Row_Number',
      'Original_Index',
      'Detection_Methods',
      'Flagged_Columns',
      'Outlier_Reasons',
      'Isolation_Forest_Score',
      ...allRowKeys,
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = results.flagged_records.map((r) => {
      const base = [
        r.row_number,
        r.row_index,
        r.methods.join('; '),
        r.flagged_columns.join('; '),
        r.reasons.join(' | '),
        r.isolation_forest_score !== null && r.isolation_forest_score !== undefined
          ? r.isolation_forest_score
          : 'N/A',
      ];
      const dataCols = allRowKeys.map((k) => r.full_row?.[k]);
      return [...base, ...dataCols].map(escapeCsv).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `outliers_${results.summary.dataset_name}_${selectedVersion}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const currentDataset = datasets.find((d) => d.id === selectedDatasetId);

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">
            Anomaly & Outlier Detection
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Statistical IQR bounds and multivariate Isolation Forest machine learning detection.
          </p>
        </div>

        {/* Non-destructive guarantee badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E40AF] text-xs font-medium self-start sm:self-auto">
          <Info className="w-4 h-4 text-[#2563EB] shrink-0" />
          <span>Non-destructive: Original dataset records remain 100% unchanged.</span>
        </div>
      </div>

      {/* Error and Warning Banners */}
      {error && (
        <div className="flex items-center gap-3 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError('')}
            className="text-red-400 hover:text-red-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {infoNotice && (
        <div className="flex items-center gap-3 p-3.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
          <span className="flex-1">{infoNotice}</span>
          <button
            onClick={() => setInfoNotice('')}
            className="text-amber-400 hover:text-amber-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dataset Selection & Configuration Card */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* 1. Dataset & Version */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider">
              1. Select Dataset
            </label>
            {loadingDatasets ? (
              <div className="h-10 bg-slate-100 animate-pulse rounded-lg"></div>
            ) : datasets.length === 0 ? (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-[#64748B]">
                No datasets found.{' '}
                <button
                  onClick={() => navigate('/upload')}
                  className="text-[#2563EB] font-semibold underline hover:text-[#1D4ED8]"
                >
                  Upload a dataset
                </button>
              </div>
            ) : (
              <select
                value={selectedDatasetId || ''}
                onChange={(e) => handleDatasetChange(e.target.value)}
                className="w-full text-xs font-medium text-[#0F172A] bg-white border border-[#CBD5E1] rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.filename} ({d.rows?.toLocaleString()} rows, {d.columns} cols)
                  </option>
                ))}
              </select>
            )}

            {currentDataset && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-[#64748B]">Version:</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedVersion('original');
                    setResults(null);
                  }}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    selectedVersion === 'original'
                      ? 'bg-[#2563EB] text-white shadow-xs'
                      : 'bg-slate-100 text-[#475569] hover:bg-slate-200'
                  }`}
                >
                  Original Data
                </button>
                {currentDataset.has_cleaned && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVersion('cleaned');
                      setResults(null);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                      selectedVersion === 'cleaned'
                        ? 'bg-[#2563EB] text-white shadow-xs'
                        : 'bg-slate-100 text-[#475569] hover:bg-slate-200'
                    }`}
                  >
                    Cleaned Version
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 2. Detection Algorithm */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider">
              2. Detection Method
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMethod('both')}
                className={`py-2 px-2 text-center rounded-lg border text-xs font-semibold transition-all ${
                  method === 'both'
                    ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] shadow-xs'
                    : 'border-[#E2E8F0] bg-white text-[#475569] hover:bg-slate-50'
                }`}
              >
                Both Methods
              </button>
              <button
                type="button"
                onClick={() => setMethod('iqr')}
                className={`py-2 px-2 text-center rounded-lg border text-xs font-semibold transition-all ${
                  method === 'iqr'
                    ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] shadow-xs'
                    : 'border-[#E2E8F0] bg-white text-[#475569] hover:bg-slate-50'
                }`}
              >
                IQR Bounds
              </button>
              <button
                type="button"
                onClick={() => setMethod('isolation_forest')}
                className={`py-2 px-2 text-center rounded-lg border text-xs font-semibold transition-all ${
                  method === 'isolation_forest'
                    ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] shadow-xs'
                    : 'border-[#E2E8F0] bg-white text-[#475569] hover:bg-slate-50'
                }`}
              >
                Isolation Forest
              </button>
            </div>

            <p className="text-[11px] text-[#64748B]">
              {method === 'both' && 'Runs both IQR per-column thresholds and Isolation Forest multivariate clustering.'}
              {method === 'iqr' && 'Univariate detection calculating Q1, Q3, and configurable multiplier boundaries.'}
              {method === 'isolation_forest' && 'Multivariate tree isolation scoring statistical anomaly across numeric features.'}
            </p>
          </div>

          {/* 3. Algorithm Parameters */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-[#0F172A] uppercase tracking-wider">
              3. Sensitivity Settings
            </label>

            {/* IQR Multiplier Controls */}
            {(method === 'iqr' || method === 'both') && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#475569]">IQR Multiplier:</span>
                  <span className="text-xs font-bold text-[#0F172A]">{iqrMultiplier}x</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleMultiplierPreset(1.5)}
                    className={`flex-1 py-1 px-2 rounded text-[11px] font-medium border ${
                      iqrMultiplier === 1.5
                        ? 'bg-[#2563EB] text-white border-[#2563EB]'
                        : 'bg-slate-50 text-[#475569] border-[#CBD5E1] hover:bg-slate-100'
                    }`}
                  >
                    1.5x (Standard)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMultiplierPreset(3.0)}
                    className={`flex-1 py-1 px-2 rounded text-[11px] font-medium border ${
                      iqrMultiplier === 3.0
                        ? 'bg-[#2563EB] text-white border-[#2563EB]'
                        : 'bg-slate-50 text-[#475569] border-[#CBD5E1] hover:bg-slate-100'
                    }`}
                  >
                    3.0x (Extreme)
                  </button>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="5.0"
                    value={customMultiplier}
                    onChange={(e) => handleCustomMultiplierChange(e.target.value)}
                    className="w-16 px-1.5 py-1 text-[11px] border border-[#CBD5E1] rounded text-center font-semibold"
                    placeholder="Custom"
                    title="Custom multiplier between 0.5 and 5.0"
                  />
                </div>
              </div>
            )}

            {/* Isolation Forest Contamination Controls */}
            {(method === 'isolation_forest' || method === 'both') && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#475569]">Contamination Ratio:</span>
                  <span className="text-xs font-bold text-[#0F172A]">
                    {(contamination * 100).toFixed(1)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.01"
                  max="0.25"
                  step="0.01"
                  value={contamination}
                  onChange={(e) => setContamination(parseFloat(e.target.value))}
                  className="w-full accent-[#2563EB] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#94A3B8]">
                  <span>1% (Rare)</span>
                  <span>5% (Default)</span>
                  <span>25% (Broad)</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Feature / Column Selector */}
        <div className="border-t border-[#E2E8F0] pt-4 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                Select Numerical Features to Analyze
              </span>
              <span className="ml-2 text-xs text-[#64748B]">
                ({selectedColumns.length} of {availableColumns.length} selected)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllColumns}
                className="text-xs font-medium text-[#2563EB] hover:underline"
              >
                Select All
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={clearAllColumns}
                className="text-xs font-medium text-[#64748B] hover:underline"
              >
                Clear All
              </button>
            </div>
          </div>

          {loadingColumns ? (
            <div className="h-12 bg-slate-50 animate-pulse rounded-lg"></div>
          ) : availableColumns.length === 0 ? (
            <p className="text-xs text-[#64748B] italic">
              No suitable numeric columns identified in this dataset.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
              {availableColumns.map((col) => {
                const isSelected = selectedColumns.includes(col);
                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => toggleColumn(col)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-[#2563EB] text-white shadow-xs'
                        : 'bg-white text-[#475569] border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span>{col}</span>
                  </button>
                );
              })}
            </div>
          )}

          {excludedColumns.length > 0 && (
            <p className="text-[11px] text-[#94A3B8]">
              Excluded non-numeric, ID, or constant columns: {excludedColumns.join(', ')}
            </p>
          )}
        </div>

        {/* Action Button */}
        <div className="flex items-center justify-between border-t border-[#E2E8F0] pt-4">
          <div className="text-xs text-[#64748B]">
            Original dataset remains unchanged. Outliers are non-destructively flagged for review.
          </div>
          <button
            type="button"
            onClick={handleRunDetection}
            disabled={analyzing || selectedColumns.length === 0 || !selectedDatasetId}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {analyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Running Outlier Detection...</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4" />
                <span>Detect Outliers & Anomalies</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results View */}
      {results && (
        <div className="space-y-6">
          {/* Diagnostic Warnings */}
          {results.warnings && results.warnings.length > 0 && (
            <div className="space-y-2">
              {results.warnings.map((warn, wIdx) => (
                <div
                  key={wIdx}
                  className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{warn}</span>
                </div>
              ))}
            </div>
          )}

          {/* Executive KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider block">
                Total Rows Analyzed
              </span>
              <div className="text-2xl font-black text-[#0F172A] mt-1">
                {results.summary.total_records_analyzed?.toLocaleString()}
              </div>
              <span className="text-[11px] text-[#94A3B8] mt-0.5 block">
                Dataset: {results.summary.dataset_name} ({results.summary.dataset_version})
              </span>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider block">
                Outliers Detected
              </span>
              <div className="text-2xl font-black text-amber-600 mt-1">
                {results.summary.unique_flagged_records?.toLocaleString()}
              </div>
              <span className="text-[11px] text-amber-700/80 mt-0.5 block">
                {results.iqr_results && results.isolation_forest_results
                  ? `${results.summary.unique_flagged_records} unique (${results.summary.iqr_unique_records} IQR, ${results.summary.isolation_forest_unique_records} IF, ${results.summary.both_methods_records} overlap)`
                  : `${results.summary.unique_flagged_records} of ${results.summary.total_records_analyzed} dataset records`}
              </span>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider block">
                Outlier Percentage
              </span>
              <div className="text-2xl font-black text-[#0F172A] mt-1">
                {results.summary.flagged_percentage?.toFixed(2)}%
              </div>
              <span className="text-[11px] text-[#94A3B8] mt-0.5 block">
                Dataset-level ({results.summary.unique_flagged_records}/{results.summary.total_records_analyzed})
              </span>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
              <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider block">
                Features Analyzed
              </span>
              <div className="text-2xl font-black text-[#2563EB] mt-1">
                {results.summary.numeric_columns_analyzed}
              </div>
              <span className="text-[11px] text-[#94A3B8] mt-0.5 block">
                Methods: {results.summary.methods_used?.join(', ')}
              </span>
            </div>
          </div>

          {/* Multi-Method Overlap & Deduplication Accounting Banner */}
          {results.iqr_results && results.isolation_forest_results && (
            <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-amber-50/70 border border-indigo-100 rounded-2xl p-4 shadow-xs space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#0F172A] flex items-center gap-1.5 uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                  <span>Multi-Method Outlier Accounting (Set Union & Overlap)</span>
                </span>
                <span className="text-[11px] font-semibold text-indigo-700 bg-white px-2.5 py-0.5 rounded-full border border-indigo-200">
                  |IQR ∪ IF| = {results.summary.iqr_unique_records} + {results.summary.isolation_forest_unique_records} − {results.summary.both_methods_records} = {results.summary.unique_flagged_records} Unique
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-[#64748B] uppercase block">Total Unique Outliers</span>
                  <span className="text-lg font-black text-[#0F172A]">{results.summary.unique_flagged_records}</span>
                  <span className="text-[10px] text-[#64748B] block">Deduplicated Union</span>
                </div>
                <div className="bg-white/90 p-2.5 rounded-xl border border-amber-200">
                  <span className="text-[10px] font-bold text-amber-700 uppercase block">IQR Only</span>
                  <span className="text-lg font-black text-amber-600">
                    {results.summary.iqr_only_records ?? Math.max(0, (results.summary.iqr_unique_records || 0) - (results.summary.both_methods_records || 0))}
                  </span>
                  <span className="text-[10px] text-amber-800/80 block">Univariate bounds only</span>
                </div>
                <div className="bg-white/90 p-2.5 rounded-xl border border-purple-200">
                  <span className="text-[10px] font-bold text-purple-700 uppercase block">Isolation Forest Only</span>
                  <span className="text-lg font-black text-purple-600">
                    {results.summary.isolation_forest_only_records ?? Math.max(0, (results.summary.isolation_forest_unique_records || 0) - (results.summary.both_methods_records || 0))}
                  </span>
                  <span className="text-[10px] text-purple-800/80 block">Multivariate trees only</span>
                </div>
                <div className="bg-white/90 p-2.5 rounded-xl border border-indigo-200">
                  <span className="text-[10px] font-bold text-indigo-700 uppercase block">Both Methods Overlap</span>
                  <span className="text-lg font-black text-indigo-600">{results.summary.both_methods_records || 0}</span>
                  <span className="text-[10px] text-indigo-800/80 block">Confirmed by both</span>
                </div>
              </div>
            </div>
          )}

          {/* Exact Duplicate Columns Callout Banner */}
          {results.duplicate_columns && Object.keys(results.duplicate_columns).length > 0 && (
            <div className="flex items-start gap-3 p-3.5 bg-blue-50/80 border border-blue-200 text-blue-900 rounded-xl text-xs">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block">Exact Duplicate Numerical Features Identified</span>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  {Object.entries(results.duplicate_columns).map(([can, dups]) => (
                    <span key={can} className="block">
                      Canonical representative feature <strong>'{can}'</strong> retained. Exact duplicate column(s) <strong>{dups.map(d => `'${d}'`).join(', ')}</strong> excluded from multivariate Isolation Forest to prevent collinear model bias.
                    </span>
                  ))}
                </p>
              </div>
            </div>
          )}

          {/* Real Outlier Visualizations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 1. Feature-Wise Outlier Rate Comparison */}
            {(() => {
              const colResults = results.iqr_results?.column_results || {};
              const points = Object.values(colResults).map((col) => ({
                label: col.column,
                value: parseFloat((col.outlier_pct ?? 0).toFixed(2)),
                color: col.outlier_pct > 5 ? '#E97A62' : col.outlier_pct > 0 ? '#F2A18D' : '#38A995',
              }));

              if (points.length === 0) {
                return (
                  <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 text-center text-xs text-[#64748B]">
                    Insufficient data to generate this chart.
                  </div>
                );
              }

              return (
                <AnalyticalChart
                  chartData={{
                    recommended: true,
                    chart_type: 'bar',
                    title: 'Outlier Rate per Evaluated Feature (%)',
                    x_axis_label: 'Feature Name',
                    data_points: points,
                  }}
                  emptyMessage="Insufficient data to generate this chart."
                />
              );
            })()}

            {/* 2. Record Distribution: Normal vs Flagged Anomalies */}
            {(() => {
              const total = results.summary.total_records_analyzed || 0;
              const outliers = results.summary.unique_flagged_records || 0;
              const normal = Math.max(0, total - outliers);

              if (total === 0) {
                return (
                  <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 text-center text-xs text-[#64748B]">
                    Insufficient data to generate this chart.
                  </div>
                );
              }

              const points = [
                {
                  label: 'Normal Records',
                  value: normal,
                  color: '#38A995',
                },
                {
                  label: 'Flagged Anomalies',
                  value: outliers,
                  color: '#E97A62',
                },
              ];

              return (
                <AnalyticalChart
                  chartData={{
                    recommended: true,
                    chart_type: 'bar',
                    title: 'Observations Integrity Breakdown (Normal vs Outliers)',
                    x_axis_label: 'Observation Category',
                    data_points: points,
                  }}
                  emptyMessage="Insufficient data to generate this chart."
                />
              );
            })()}
          </div>

          {/* Column-by-Column IQR Breakdown Table */}
          {results.iqr_results && Object.keys(results.iqr_results.column_results || {}).length > 0 && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#2563EB]" />
                    <span>Univariate IQR Boundaries & Outlier Counts</span>
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Threshold multiplier: {results.iqr_results.multiplier}x IQR. Feature outlier rate = (outliers / valid evaluated rows) × 100. Overall dataset outlier rate = (unique flagged rows / total rows) × 100.
                  </p>
                </div>
                <div className="text-xs font-semibold text-[#475569]">
                  Total Outlier Rows: {results.iqr_results.total_outlier_rows} ({(results.iqr_results.outlier_rate).toFixed(2)}%)
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-slate-50 text-[#475569] font-bold">
                      <th className="py-2.5 px-3">Column</th>
                      <th className="py-2.5 px-3">Evaluated Rows</th>
                      <th className="py-2.5 px-3">Q1 (25%)</th>
                      <th className="py-2.5 px-3">Q3 (75%)</th>
                      <th className="py-2.5 px-3">IQR</th>
                      <th className="py-2.5 px-3">Lower Bound</th>
                      <th className="py-2.5 px-3">Upper Bound</th>
                      <th className="py-2.5 px-3">Lower Outliers</th>
                      <th className="py-2.5 px-3">Upper Outliers</th>
                      <th className="py-2.5 px-3">Total Outliers</th>
                      <th className="py-2.5 px-3 text-right">Outlier Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {Object.values(results.iqr_results.column_results).map((col) => (
                      <tr key={col.column} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 font-semibold text-[#0F172A]">{col.column}</td>
                        <td className="py-2 px-3">
                          <div className="font-mono text-[11px] font-medium text-slate-700">
                            {col.valid_count ?? results.summary.total_records_analyzed} / {col.total_rows || results.summary.total_records_analyzed}
                          </div>
                          {col.missing_count > 0 ? (
                            <span
                              className="inline-block mt-0.5 px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold"
                              title={col.evaluation_note || `${col.missing_count} missing value(s) excluded`}
                            >
                              {col.missing_count} null excluded
                            </span>
                          ) : (
                            <span className="inline-block mt-0.5 text-[10px] text-slate-400">
                              100% valid
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono">{col.q1.toLocaleString()}</td>
                        <td className="py-2 px-3 font-mono">{col.q3.toLocaleString()}</td>
                        <td className="py-2 px-3 font-mono">{col.iqr.toLocaleString()}</td>
                        <td className="py-2 px-3 font-mono text-blue-700">{col.lower_bound.toLocaleString()}</td>
                        <td className="py-2 px-3 font-mono text-blue-700">{col.upper_bound.toLocaleString()}</td>
                        <td className="py-2 px-3 text-amber-600 font-semibold">{col.lower_outliers_count}</td>
                        <td className="py-2 px-3 text-amber-600 font-semibold">{col.upper_outliers_count}</td>
                        <td className="py-2 px-3 font-bold text-[#0F172A]">{col.total_outliers}</td>
                        <td className="py-2 px-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              col.outlier_pct > 5
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : col.outlier_pct > 0
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-green-50 text-green-700 border border-green-200'
                            }`}
                          >
                            {col.outlier_pct.toFixed(2)}%
                          </span>
                          <span className="block text-[10px] text-[#64748B] mt-0.5">
                            {col.total_outliers} of {col.valid_count ?? results.summary.total_records_analyzed} valid
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Isolation Forest Summary Card */}
          {results.isolation_forest_results && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#2563EB]" />
                  <span>Multivariate Isolation Forest Model Diagnostics</span>
                </h3>
                <span className="text-xs font-semibold text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#BFDBFE]">
                  Contamination: {(results.isolation_forest_results.contamination * 100).toFixed(1)}%
                </span>
              </div>

              <p className="text-xs text-[#64748B]">
                {results.isolation_forest_results.explanation}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                    Multivariate Anomalies
                  </span>
                  <span className="text-lg font-bold text-[#0F172A]">
                    {results.isolation_forest_results.anomaly_count} ({results.isolation_forest_results.anomaly_pct.toFixed(2)}%)
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                    Features in Decision Trees
                  </span>
                  <span className="text-xs font-semibold text-[#0F172A]">
                    {results.isolation_forest_results.features_used?.join(', ') || 'None'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-[#64748B] block">
                    Preprocessing Strategy
                  </span>
                  <span className="text-xs text-[#475569]">
                    {results.isolation_forest_results.preprocessing_notes?.join('; ') || 'Standard scaling & median imputation'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Flagged Records Review & CSV Export */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                  <Filter className="w-4 h-4 text-[#2563EB]" />
                  <span>Flagged Records Review ({filteredRecords.length} records)</span>
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Review original values and per-method explanations. Records are never deleted automatically.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={results.flagged_records.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search flagged records by row #, column, or reason..."
                  value={recordSearch}
                  onChange={(e) => setRecordSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-[#64748B]">Method:</span>
                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                  className="text-xs font-medium border border-slate-300 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  <option value="ALL">All Unique Flagged ({results.summary.unique_flagged_records})</option>
                  {results.iqr_results && results.isolation_forest_results && (
                    <option value="both">Both Methods Overlap ({results.summary.both_methods_records || 0})</option>
                  )}
                  {results.iqr_results && (
                    <option value="iqr_all">All IQR Outliers ({results.summary.iqr_unique_records || 0})</option>
                  )}
                  {results.iqr_results && results.isolation_forest_results && (
                    <option value="iqr_only">
                      IQR Only ({results.summary.iqr_only_records ?? Math.max(0, (results.summary.iqr_unique_records || 0) - (results.summary.both_methods_records || 0))})
                    </option>
                  )}
                  {results.isolation_forest_results && (
                    <option value="if_all">All Isolation Forest ({results.summary.isolation_forest_unique_records || 0})</option>
                  )}
                  {results.iqr_results && results.isolation_forest_results && (
                    <option value="if_only">
                      Isolation Forest Only ({results.summary.isolation_forest_only_records ?? Math.max(0, (results.summary.isolation_forest_unique_records || 0) - (results.summary.both_methods_records || 0))})
                    </option>
                  )}
                </select>
              </div>
            </div>

            {/* Flagged Records Table */}
            {filteredRecords.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
                <div className="text-xs font-bold text-[#0F172A]">
                  No Outliers Found Matching Filter
                </div>
                <p className="text-[11px] text-[#64748B]">
                  {results.flagged_records.length === 0
                    ? 'No records exceeded the configured outlier thresholds in this dataset.'
                    : 'Try clearing your search query or switching method filter.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[500px] border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 text-[#475569] font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Row #</th>
                      <th className="py-2.5 px-3">Methods</th>
                      <th className="py-2.5 px-3">Flagged Columns</th>
                      <th className="py-2.5 px-3">Value Highlights</th>
                      <th className="py-2.5 px-3">Reason / Details</th>
                      <th className="py-2.5 px-3 text-center">Inspect</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredRecords.map((rec) => (
                      <tr key={rec.row_index} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 font-mono font-bold text-[#0F172A]">
                          #{rec.row_number}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            {rec.methods.map((m) => (
                              <span
                                key={m}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  m.includes('IQR')
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 px-3 font-medium text-[#0F172A]">
                          {rec.flagged_columns.join(', ') || 'Multivariate Pattern'}
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]">
                          {Object.entries(rec.values).map(([k, v]) => (
                            <div key={k}>
                              <span className="text-[#64748B]">{k}:</span>{' '}
                              <span className="font-bold text-[#0F172A]">{String(v)}</span>
                            </div>
                          ))}
                        </td>
                        <td className="py-2 px-3 text-[#475569] text-[11px] max-w-xs">
                          {rec.reasons.map((r, rIdx) => (
                            <div key={rIdx} className="truncate" title={r}>
                              • {r}
                            </div>
                          ))}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setInspectRow(rec)}
                            className="p-1.5 rounded-lg hover:bg-slate-200 text-[#2563EB] transition-colors"
                            title="Inspect full row data"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Row Inspection Modal */}
      {inspectRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">
                  Observation Details: Row #{inspectRow.row_number}
                </h3>
                <span className="text-xs text-[#64748B]">
                  Original index: {String(inspectRow.row_index)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setInspectRow(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                <span className="text-xs font-bold text-amber-900 block">Outlier Reasons:</span>
                {inspectRow.reasons.map((r, idx) => (
                  <div key={idx} className="text-xs text-amber-800">
                    • {r}
                  </div>
                ))}
              </div>

              <div>
                <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider block mb-2">
                  All Column Values in Observation
                </span>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 font-bold text-[#475569] border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Column Name</th>
                        <th className="py-2 px-3">Value</th>
                        <th className="py-2 px-3">Flag Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {Object.entries(inspectRow.full_row || {}).map(([key, val]) => {
                        const isFlagged = inspectRow.flagged_columns.includes(key);
                        return (
                          <tr
                            key={key}
                            className={isFlagged ? 'bg-amber-50/60 font-semibold' : ''}
                          >
                            <td className="py-1.5 px-3 font-medium text-[#0F172A]">{key}</td>
                            <td className="py-1.5 px-3 font-mono">{String(val)}</td>
                            <td className="py-1.5 px-3">
                              {isFlagged ? (
                                <span className="text-amber-700 font-bold text-[11px]">
                                  IQR Outlier
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectRow(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-xs font-semibold text-[#0F172A]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnomaliesPage;
