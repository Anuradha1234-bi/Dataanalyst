import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Database,
  RefreshCw,
  FileSearch,
  Search,
  ChevronDown,
  Plus,
  BarChart3,
  PieChart as PieIcon,
  Disc,
  Copy,
  Layers,
  Activity,
  Sliders,
  Check,
  Hash,
  Percent,
} from 'lucide-react';
import { datasetService } from '../services/datasetService';
import { extractErrorMessage } from '../services/api';
import { AnalyticalChart } from '../components/AnalyticalChart';

export const DataQualityPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [qualityData, setQualityData] = useState(null);

  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [loadingQuality, setLoadingQuality] = useState(false);
  const [error, setError] = useState('');
  const [columnSearch, setColumnSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState('columns');

  // Chart Interactive Toggles
  const [missingChartMode, setMissingChartMode] = useState('percentage'); // 'percentage' | 'count'
  const [uniqueChartMode, setUniqueChartMode] = useState('count'); // 'count' | 'percentage'

  // Load datasets list on mount
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
        } else {
          // Empty state: please select a dataset first
          setSelectedDatasetId(null);
        }
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoadingDatasets(false);
      }
    };

    fetchDatasets();
  }, []);

  // Fetch quality analysis whenever selectedDatasetId changes
  useEffect(() => {
    if (!selectedDatasetId) {
      setQualityData(null);
      return;
    }

    setQualityData(null);
    setError('');
    setLoadingQuality(true);

    setSearchParams({ dataset_id: selectedDatasetId }, { replace: true });
    localStorage.setItem('selected_dataset_id', String(selectedDatasetId));

    const loadQuality = async () => {
      try {
        const data = await datasetService.getDatasetQuality(selectedDatasetId);
        setQualityData(data);
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoadingQuality(false);
      }
    };

    loadQuality();
  }, [selectedDatasetId]);

  const currentDataset = useMemo(() => {
    return datasets.find((d) => d.id === selectedDatasetId) || null;
  }, [datasets, selectedDatasetId]);

  // Filter columns based on search and status filter
  const filteredColumns = useMemo(() => {
    if (!qualityData?.columns) return [];
    return qualityData.columns.filter((col) => {
      const matchesSearch = col.column_name.toLowerCase().includes(columnSearch.toLowerCase());
      if (!matchesSearch) return false;

      if (statusFilter === 'ISSUES_ONLY') return col.quality_status !== 'Good';
      if (statusFilter === 'GOOD_ONLY') return col.quality_status === 'Good';
      if (statusFilter === 'MISSING_ONLY') return col.missing_count > 0;
      return true;
    });
  }, [qualityData, columnSearch, statusFilter]);

  // Helper for status badge colors
  const getStatusBadge = (status) => {
    if (status === 'Good') {
      return {
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
        icon: CheckCircle2,
      };
    }
    if (status === 'Needs Attention' || status === 'Warning') {
      return {
        bg: 'bg-amber-50 text-amber-700 border-amber-200',
        dot: 'bg-amber-500',
        icon: AlertTriangle,
      };
    }
    return {
      bg: 'bg-rose-50 text-rose-700 border-rose-200',
      dot: 'bg-rose-500',
      icon: AlertCircle,
    };
  };

  const getTypeBadgeColor = (type) => {
    switch (type) {
      case 'Integer':
      case 'Float':
      case 'Numeric':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Categorical':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Datetime':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Boolean':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      {/* Page Header & Dataset Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">Data Quality</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Analysis Only
            </span>
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            Comprehensive data hygiene assessment, missing value diagnostics, schema conformance, and structural integrity checks.
          </p>
        </div>

        {/* Dataset Selector Dropdown */}
        <div className="flex items-center gap-2.5">
          <div className="relative min-w-[220px]">
            <Database className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedDatasetId || ''}
              onChange={(e) => setSelectedDatasetId(e.target.value ? Number(e.target.value) : null)}
              disabled={loadingDatasets}
              className="w-full pl-8 pr-8 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all appearance-none cursor-pointer disabled:opacity-50"
            >
              <option value="">-- Select a Dataset --</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.filename} ({d.rows} rows, {d.columns} cols)
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#64748B] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {selectedDatasetId && (
            <>
              <button
                onClick={() => {
                  setQualityData(null);
                  setError('');
                  setLoadingQuality(true);
                  datasetService.getDatasetQuality(selectedDatasetId)
                    .then(setQualityData)
                    .catch((err) => setError(extractErrorMessage(err)))
                    .finally(() => setLoadingQuality(false));
                }}
                disabled={loadingQuality}
                title="Refresh Quality Analysis"
                className="p-2 rounded-lg bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingQuality ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => navigate(`/profile-data?dataset_id=${selectedDatasetId}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#DBEAFE] border border-[#BFDBFE] transition-colors cursor-pointer"
                title="View statistical profile for this dataset"
              >
                <FileSearch className="w-3.5 h-3.5" />
                <span>View Profile</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
          <div className="text-xs">
            <span className="font-semibold">Quality Analysis Error: </span>
            {error}
          </div>
        </div>
      )}

      {/* Empty State: No Dataset Selected */}
      {!selectedDatasetId && !loadingDatasets && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#0F172A]">Please select a dataset first.</h3>
          <p className="text-xs text-[#64748B] max-w-md mx-auto mt-1.5 mb-6">
            Choose an uploaded dataset from the selector above or browse your datasets to inspect missing values, duplicate records, data types, and potential quality issues.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => navigate('/datasets')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#CBD5E1] text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-[#64748B]" />
              <span>Browse Datasets</span>
            </button>
            <button
              onClick={() => navigate('/upload')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-xs font-medium hover:bg-[#1D4ED8] transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Upload New Dataset</span>
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loadingQuality && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full border-3 border-[#2563EB]/20 border-t-[#2563EB] animate-spin mx-auto mb-4"></div>
          <h3 className="text-sm font-bold text-[#0F172A]">Analyzing Dataset Quality...</h3>
          <p className="text-xs text-[#64748B] mt-1">
            Inspecting {currentDataset?.filename || 'dataset'} for missing values, duplicates, and column conformance.
          </p>
        </div>
      )}

      {/* Quality Results */}
      {qualityData && !loadingQuality && (
        <div className="space-y-6">
          {/* Overall Quality Banner */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                    getStatusBadge(qualityData.summary.overall_status).bg
                  }`}
                >
                  {React.createElement(getStatusBadge(qualityData.summary.overall_status).icon, {
                    className: 'w-6 h-6',
                  })}
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
                      Overall Quality Status
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                        getStatusBadge(qualityData.summary.overall_status).bg
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          getStatusBadge(qualityData.summary.overall_status).dot
                        }`}
                      ></span>
                      {qualityData.summary.overall_status}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[#0F172A] mt-1">
                    {qualityData.summary.status_message}
                  </p>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Target Dataset: <span className="font-medium text-[#0F172A]">{qualityData.filename}</span>
                  </p>
                </div>
              </div>

              {/* Quality Score Gauge */}
              <div className="flex items-center gap-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 px-5 shrink-0">
                <div className="text-right">
                  <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                    Calculated Score
                  </div>
                  <div className="text-2xl font-black text-[#0F172A] tracking-tight">
                    {qualityData.summary.quality_score}
                    <span className="text-xs font-normal text-[#94A3B8]"> / 100</span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-full border-4 border-[#2563EB]/20 border-t-[#2563EB] flex items-center justify-center font-bold text-xs text-[#2563EB]">
                  {Math.round(qualityData.summary.quality_score)}%
                </div>
              </div>
            </div>
          </div>

          {/* Metric Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
              <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Total Rows</div>
              <div className="text-lg font-bold text-[#0F172A] mt-1">
                {qualityData.summary.total_rows.toLocaleString()}
              </div>
              <div className="text-[10px] text-[#64748B] mt-0.5">Records evaluated</div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
              <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Total Columns</div>
              <div className="text-lg font-bold text-[#0F172A] mt-1">
                {qualityData.summary.total_columns}
              </div>
              <div className="text-[10px] text-[#64748B] mt-0.5">
                {qualityData.summary.total_cells.toLocaleString()} total cells
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
              <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Missing Cells</div>
              <div className={`text-lg font-bold mt-1 ${qualityData.summary.missing_cells > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {qualityData.summary.missing_cells.toLocaleString()}
              </div>
              <div className="text-[10px] text-[#64748B] mt-0.5">
                {qualityData.summary.missing_percentage}% of total cells
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
              <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Duplicate Rows</div>
              <div className={`text-lg font-bold mt-1 ${qualityData.summary.duplicate_rows > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {qualityData.summary.duplicate_rows}
              </div>
              <div className="text-[10px] text-[#64748B] mt-0.5">
                {qualityData.summary.duplicate_percentage}% duplicates
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
              <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Problematic Cols</div>
              <div className={`text-lg font-bold mt-1 ${qualityData.summary.problematic_columns_count > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {qualityData.summary.problematic_columns_count}
              </div>
              <div className="text-[10px] text-[#64748B] mt-0.5">
                of {qualityData.summary.total_columns} columns
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
              <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Quality Issues</div>
              <div className={`text-lg font-bold mt-1 ${qualityData.summary.quality_issues_count > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {qualityData.summary.quality_issues_count}
              </div>
              <div className="text-[10px] text-[#64748B] mt-0.5">Total detected anomalies</div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SEPARATE GRAPHICAL REPRESENTATION SECTION (7 Real CSV Quality Graphs)    */}
          {/* ========================================================================= */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#2563EB]" />
                  <h2 className="text-base font-bold text-[#0F172A]">
                    Graphical Diagnostics & Quality Analytics
                  </h2>
                </div>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Dynamic visual telemetry calculated from active CSV dataset:{' '}
                  <span className="font-semibold text-[#0F172A]">{qualityData.filename}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-[#2563EB] border border-blue-200">
                  {qualityData.summary.total_columns} Columns · {qualityData.summary.total_rows.toLocaleString()} Records
                </span>
              </div>
            </div>

            {/* Row 1: Executive Overview — Score Gauge, Column Conformance Status, Duplicate Rows */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 1. Overall Quality Score — Speedometer Gauge */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center">
                      <Activity className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#0F172A]">Overall Quality Score</h3>
                      <p className="text-[10px] text-[#64748B]">Deterministic score</p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      qualityData.summary.quality_score >= 80
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : qualityData.summary.quality_score >= 60
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {qualityData.summary.overall_status}
                  </span>
                </div>

                {/* Gauge Chart SVG */}
                <div className="py-2 flex flex-col items-center justify-center">
                  {(() => {
                    const score = Math.min(Math.max(Number(qualityData.summary.quality_score ?? 0), 0), 100);
                    const strokeColor =
                      score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444';
                    const arcLength = 235.62; // Math.PI * 75
                    const strokeOffset = ((100 - score) / 100) * arcLength;
                    const angleRad = Math.PI - (score / 100) * Math.PI;
                    const nx = 100 + 55 * Math.cos(angleRad);
                    const ny = 95 - 55 * Math.sin(angleRad);

                    return (
                      <div className="relative w-full max-w-[210px] flex flex-col items-center">
                        <svg viewBox="0 0 200 115" className="w-full">
                          {/* Background Arc Track */}
                          <path
                            d="M 25 95 A 75 75 0 0 1 175 95"
                            fill="none"
                            stroke="#E2E8F0"
                            strokeWidth="14"
                            strokeLinecap="round"
                          />
                          {/* Colored Score Arc */}
                          <path
                            d="M 25 95 A 75 75 0 0 1 175 95"
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth="14"
                            strokeLinecap="round"
                            strokeDasharray={arcLength}
                            strokeDashoffset={strokeOffset}
                            className="transition-all duration-700 ease-out"
                          />
                          {/* Needle Indicator */}
                          <line
                            x1="100"
                            y1="95"
                            x2={nx}
                            y2={ny}
                            stroke="#0F172A"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            className="transition-all duration-700 ease-out"
                          />
                          <circle cx="100" cy="95" r="5" fill="#0F172A" />
                          <circle cx="100" cy="95" r="2" fill="#FFFFFF" />

                          {/* Reference Labels */}
                          <text x="25" y="110" textAnchor="middle" className="text-[9px] font-bold fill-[#94A3B8]">
                            0
                          </text>
                          <text x="100" y="35" textAnchor="middle" className="text-[9px] font-bold fill-[#94A3B8]">
                            50
                          </text>
                          <text x="175" y="110" textAnchor="middle" className="text-[9px] font-bold fill-[#94A3B8]">
                            100
                          </text>
                        </svg>

                        {/* Centered Score */}
                        <div className="text-center -mt-2">
                          <div className="text-2xl font-black text-[#0F172A] tracking-tight">
                            {score.toFixed(1)}
                            <span className="text-xs font-semibold text-[#94A3B8]"> / 100</span>
                          </div>
                          <p
                            className="text-[10px] text-[#64748B] max-w-[190px] mx-auto truncate mt-0.5"
                            title={qualityData.summary.status_message}
                          >
                            {qualityData.summary.status_message}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Benchmark Scale Footer */}
                <div className="pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-[9px] text-[#64748B]">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    &lt;60 Critical
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    60-79 Fair
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    80-100 Good
                  </span>
                </div>
              </div>

              {/* 5. Column Quality Status — Conformance Breakdown */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#0F172A]">Column Quality Status</h3>
                      <p className="text-[10px] text-[#64748B]">Quality assessment tiers</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-[#475569]">
                    {qualityData.columns?.length || 0} Columns
                  </span>
                </div>

                {/* Donut & Conformance Summary */}
                <div className="py-2 flex items-center justify-around gap-2">
                  {(() => {
                    const cols = qualityData.columns || [];
                    const total = cols.length || 1;
                    const goodCount = cols.filter((c) => c.quality_status === 'Good').length;
                    const warningCount = cols.filter(
                      (c) => c.quality_status === 'Warning' || c.quality_status === 'Needs Attention'
                    ).length;
                    const criticalCount = cols.filter((c) => c.quality_status === 'Critical').length;

                    const segments = [
                      { label: 'Good', count: goodCount, color: '#10B981' },
                      { label: 'Warning', count: warningCount, color: '#F59E0B' },
                      { label: 'Critical', count: criticalCount, color: '#EF4444' },
                    ].filter((s) => s.count > 0);

                    const cx = 50;
                    const cy = 50;
                    const outerR = 40;
                    const innerR = 24;
                    let accAngle = -Math.PI / 2;

                    return (
                      <>
                        <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                          <svg viewBox="0 0 100 100" className="w-full h-full">
                            {segments.length === 1 ? (
                              <circle
                                cx={cx}
                                cy={cy}
                                r={(outerR + innerR) / 2}
                                stroke={segments[0].color}
                                strokeWidth={outerR - innerR}
                                fill="none"
                              />
                            ) : (
                              segments.map((seg, idx) => {
                                const sliceAngle = (seg.count / total) * 2 * Math.PI;
                                const startAngle = accAngle;
                                const endAngle = startAngle + sliceAngle;
                                accAngle = endAngle;

                                const x1 = cx + outerR * Math.cos(startAngle);
                                const y1 = cy + outerR * Math.sin(startAngle);
                                const x2 = cx + outerR * Math.cos(endAngle);
                                const y2 = cy + outerR * Math.sin(endAngle);
                                const x3 = cx + innerR * Math.cos(endAngle);
                                const y3 = cy + innerR * Math.sin(endAngle);
                                const x4 = cx + innerR * Math.cos(startAngle);
                                const y4 = cy + innerR * Math.sin(startAngle);
                                const largeArc = sliceAngle > Math.PI ? 1 : 0;
                                const d = `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4} Z`;

                                return (
                                  <path
                                    key={idx}
                                    d={d}
                                    fill={seg.color}
                                    className="hover:opacity-85 transition-opacity cursor-pointer"
                                  >
                                    <title>{`${seg.label}: ${seg.count} columns (${((seg.count / total) * 100).toFixed(1)}%)`}</title>
                                  </path>
                                );
                              })
                            )}
                          </svg>
                          <div className="absolute text-center">
                            <div className="text-xs font-black text-[#0F172A]">
                              {((goodCount / total) * 100).toFixed(0)}%
                            </div>
                            <div className="text-[8px] font-semibold text-[#64748B]">Pass</div>
                          </div>
                        </div>

                        <div className="flex-1 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-[11px] text-[#475569]">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              Good
                            </span>
                            <span className="font-bold text-[#0F172A] text-[11px]">
                              {goodCount}{' '}
                              <span className="text-[10px] text-[#64748B]">
                                ({((goodCount / total) * 100).toFixed(0)}%)
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-[11px] text-[#475569]">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              Warning
                            </span>
                            <span className="font-bold text-[#0F172A] text-[11px]">
                              {warningCount}{' '}
                              <span className="text-[10px] text-[#64748B]">
                                ({((warningCount / total) * 100).toFixed(0)}%)
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-[11px] text-[#475569]">
                              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                              Critical
                            </span>
                            <span className="font-bold text-[#0F172A] text-[11px]">
                              {criticalCount}{' '}
                              <span className="text-[10px] text-[#64748B]">
                                ({((criticalCount / total) * 100).toFixed(0)}%)
                              </span>
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="pt-2 border-t border-[#F1F5F9] text-[10px] text-[#64748B] flex items-center justify-between">
                  <span>Pass Rate Standard</span>
                  <span className="font-semibold text-emerald-700">
                    {(
                      ((qualityData.columns?.filter((c) => c.quality_status === 'Good').length || 0) /
                        (qualityData.columns?.length || 1)) *
                      100
                    ).toFixed(1)}
                    % Passing
                  </span>
                </div>
              </div>

              {/* 7. Duplicate Rows — Unique vs Redundant Rows Visualization */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Copy className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#0F172A]">Duplicate Rows</h3>
                      <p className="text-[10px] text-[#64748B]">Record uniqueness</p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      qualityData.summary.duplicate_rows > 0
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {qualityData.summary.duplicate_rows > 0 ? 'Duplicates Detected' : 'Zero Duplicates'}
                  </span>
                </div>

                {/* Donut & Stats Breakdown */}
                <div className="py-2 flex items-center justify-around gap-2">
                  {(() => {
                    const total = qualityData.summary.total_rows || 1;
                    const dupCount = qualityData.summary.duplicate_rows || 0;
                    const uniqueCount = Math.max(0, total - dupCount);
                    const dupPct = Number(qualityData.summary.duplicate_percentage ?? 0);
                    const uniquePct = parseFloat((100 - dupPct).toFixed(1));

                    const segments = [
                      { label: 'Unique Records', count: uniqueCount, pct: uniquePct, color: '#10B981' },
                      ...(dupCount > 0
                        ? [{ label: 'Duplicate Rows', count: dupCount, pct: dupPct, color: '#EF4444' }]
                        : []),
                    ];

                    const cx = 50;
                    const cy = 50;
                    const outerR = 40;
                    const innerR = 24;
                    let accAngle = -Math.PI / 2;

                    return (
                      <>
                        <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                          <svg viewBox="0 0 100 100" className="w-full h-full">
                            {segments.length === 1 ? (
                              <circle
                                cx={cx}
                                cy={cy}
                                r={(outerR + innerR) / 2}
                                stroke={segments[0].color}
                                strokeWidth={outerR - innerR}
                                fill="none"
                              />
                            ) : (
                              segments.map((seg, idx) => {
                                const sliceAngle = (seg.count / total) * 2 * Math.PI;
                                const startAngle = accAngle;
                                const endAngle = startAngle + sliceAngle;
                                accAngle = endAngle;

                                const x1 = cx + outerR * Math.cos(startAngle);
                                const y1 = cy + outerR * Math.sin(startAngle);
                                const x2 = cx + outerR * Math.cos(endAngle);
                                const y2 = cy + outerR * Math.sin(endAngle);
                                const x3 = cx + innerR * Math.cos(endAngle);
                                const y3 = cy + innerR * Math.sin(endAngle);
                                const x4 = cx + innerR * Math.cos(startAngle);
                                const y4 = cy + innerR * Math.sin(startAngle);
                                const largeArc = sliceAngle > Math.PI ? 1 : 0;
                                const d = `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4} Z`;

                                return (
                                  <path
                                    key={idx}
                                    d={d}
                                    fill={seg.color}
                                    className="hover:opacity-85 transition-opacity cursor-pointer"
                                  >
                                    <title>{`${seg.label}: ${seg.count.toLocaleString()} rows (${seg.pct}%)`}</title>
                                  </path>
                                );
                              })
                            )}
                          </svg>
                          <div className="absolute text-center">
                            <div className="text-xs font-black text-[#0F172A]">{uniquePct}%</div>
                            <div className="text-[8px] font-semibold text-[#64748B]">Unique</div>
                          </div>
                        </div>

                        <div className="flex-1 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-[11px] text-[#475569]">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              Unique Rows
                            </span>
                            <span className="font-bold text-[#0F172A] text-[11px]">
                              {uniqueCount.toLocaleString()}{' '}
                              <span className="text-[10px] text-[#64748B]">({uniquePct}%)</span>
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-[11px] text-[#475569]">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  dupCount > 0 ? 'bg-rose-500' : 'bg-slate-300'
                                }`}
                              ></span>
                              Duplicate Rows
                            </span>
                            <span
                              className={`font-bold text-[11px] ${
                                dupCount > 0 ? 'text-rose-600' : 'text-[#0F172A]'
                              }`}
                            >
                              {dupCount.toLocaleString()}{' '}
                              <span className="text-[10px] text-[#64748B]">({dupPct}%)</span>
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className="pt-2 border-t border-[#F1F5F9] text-[10px] text-[#64748B] flex items-center justify-between">
                  <span>Evaluated Records</span>
                  <span className="font-semibold text-[#0F172A]">
                    {qualityData.summary.total_rows.toLocaleString()} total rows
                  </span>
                </div>
              </div>
            </div>

            {/* Row 2: Schema & Distribution — Data Type Distribution & Constant Columns Detection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 3. Data Type Distribution — Based on actual column data types */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center">
                      <Disc className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#0F172A]">Data Type Distribution</h3>
                      <p className="text-[10px] text-[#64748B]">Column schema classification</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#2563EB] border border-blue-200">
                    {qualityData.summary.total_columns} Columns
                  </span>
                </div>

                {(() => {
                  const num = qualityData.types_report?.numeric_columns?.length || 0;
                  const cat = qualityData.types_report?.categorical_columns?.length || 0;
                  const dt = qualityData.types_report?.datetime_columns?.length || 0;
                  const bool = qualityData.types_report?.boolean_columns?.length || 0;
                  const total = qualityData.summary?.total_columns || qualityData.columns?.length || 1;
                  const other = Math.max(0, total - (num + cat + dt + bool));

                  const typeSlices = [
                    { label: 'Numeric', count: num, color: '#3B82F6' },
                    { label: 'Categorical / Text', count: cat, color: '#8B5CF6' },
                    { label: 'Datetime', count: dt, color: '#F59E0B' },
                    { label: 'Boolean', count: bool, color: '#10B981' },
                    ...(other > 0 ? [{ label: 'Other', count: other, color: '#64748B' }] : []),
                  ].filter((s) => s.count > 0);

                  const cx = 55;
                  const cy = 55;
                  const outerR = 46;
                  const innerR = 28;
                  let accAngle = -Math.PI / 2;

                  return (
                    <div className="flex flex-col sm:flex-row items-center gap-5 pt-1">
                      <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                        <svg viewBox="0 0 110 110" className="w-full h-full">
                          {typeSlices.length === 1 ? (
                            <circle
                              cx={cx}
                              cy={cy}
                              r={(outerR + innerR) / 2}
                              stroke={typeSlices[0].color}
                              strokeWidth={outerR - innerR}
                              fill="none"
                            />
                          ) : (
                            typeSlices.map((seg, idx) => {
                              const sliceAngle = (seg.count / total) * 2 * Math.PI;
                              const startAngle = accAngle;
                              const endAngle = startAngle + sliceAngle;
                              accAngle = endAngle;

                              const x1 = cx + outerR * Math.cos(startAngle);
                              const y1 = cy + outerR * Math.sin(startAngle);
                              const x2 = cx + outerR * Math.cos(endAngle);
                              const y2 = cy + outerR * Math.sin(endAngle);
                              const x3 = cx + innerR * Math.cos(endAngle);
                              const y3 = cy + innerR * Math.sin(endAngle);
                              const x4 = cx + innerR * Math.cos(startAngle);
                              const y4 = cy + innerR * Math.sin(startAngle);
                              const largeArc = sliceAngle > Math.PI ? 1 : 0;
                              const d = `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4} Z`;

                              return (
                                <path
                                  key={idx}
                                  d={d}
                                  fill={seg.color}
                                  className="hover:opacity-85 transition-opacity cursor-pointer"
                                >
                                  <title>{`${seg.label}: ${seg.count} columns (${((seg.count / total) * 100).toFixed(1)}%)`}</title>
                                </path>
                              );
                            })
                          )}
                        </svg>
                        <div className="absolute text-center">
                          <div className="text-base font-black text-[#0F172A]">{total}</div>
                          <div className="text-[8px] font-semibold text-[#64748B]">Columns</div>
                        </div>
                      </div>

                      {/* Legend Grid */}
                      <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        {typeSlices.map((t) => (
                          <div
                            key={t.label}
                            className="p-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: t.color }}
                              ></span>
                              <span className="text-[11px] font-medium text-[#475569] truncate">
                                {t.label}
                              </span>
                            </div>
                            <span className="font-bold text-[#0F172A] text-[11px] shrink-0">
                              {t.count}{' '}
                              <span className="text-[10px] text-[#64748B] font-normal">
                                ({((t.count / total) * 100).toFixed(0)}%)
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* 6. Constant Columns Detection — Identify columns with only 1 distinct non-null value */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                      <Sliders className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#0F172A]">Constant Columns Detection</h3>
                      <p className="text-[10px] text-[#64748B]">Zero-variance feature identification</p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      (qualityData.constant_report?.constant_columns?.length || 0) > 0
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}
                  >
                    {(qualityData.constant_report?.constant_columns?.length || 0) > 0
                      ? `${qualityData.constant_report.constant_columns.length} Constant Detected`
                      : 'Zero Constant Cols'}
                  </span>
                </div>

                {(() => {
                  const constantList = qualityData.constant_report?.constant_columns || [];
                  const nearConstantList = qualityData.constant_report?.near_constant_columns || [];
                  const hasIssues = constantList.length > 0 || nearConstantList.length > 0;

                  if (!hasIssues) {
                    return (
                      <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-emerald-900">
                            Optimal Variance Across All Columns
                          </div>
                          <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                            Every column in this dataset exhibits &gt;1 distinct non-null value. No constant
                            features found.
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                      {constantList.map((c) => (
                        <div
                          key={c.column_name}
                          className="p-3 rounded-xl bg-rose-50/70 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-rose-900">{c.column_name}</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-200 text-rose-800 uppercase tracking-wider">
                                Constant (1 Value)
                              </span>
                            </div>
                            <p className="text-[10px] text-rose-700 mt-0.5 truncate">
                              Fixed value:{' '}
                              <span className="font-semibold text-rose-900 font-mono">
                                "{c.constant_value ?? 'Static'}"
                              </span>{' '}
                              across 100% of rows
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <div className="w-24 h-2 bg-rose-200 rounded-full overflow-hidden">
                              <div className="h-full bg-rose-600 rounded-full w-full"></div>
                            </div>
                            <span className="text-xs font-black text-rose-800 w-9 text-right">100%</span>
                          </div>
                        </div>
                      ))}

                      {nearConstantList.map((c) => (
                        <div
                          key={c.column_name}
                          className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-amber-900">{c.column_name}</span>
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-200 text-amber-800 uppercase tracking-wider">
                                Near-Constant
                              </span>
                            </div>
                            <p className="text-[10px] text-amber-700 mt-0.5 truncate">
                              Dominant value:{' '}
                              <span className="font-semibold text-amber-900 font-mono">
                                "{c.constant_value ?? 'Dominant'}"
                              </span>
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <div className="w-24 h-2 bg-amber-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-600 rounded-full"
                                style={{ width: `${Math.min(c.percentage, 100)}%` }}
                              ></div>
                            </div>
                            <span className="text-xs font-black text-amber-800 w-9 text-right">{c.percentage}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Row 3: Granular Column Diagnostics — Missing Values & Column-wise Unique Values */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 4. Missing Values by Column — Calculated from actual CSV values */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#0F172A]">Missing Values by Column</h3>
                      <p className="text-[10px] text-[#64748B]">Completeness telemetry across schema</p>
                    </div>
                  </div>

                  {/* Toggle: % vs Count */}
                  <div className="flex items-center bg-[#F1F5F9] p-0.5 rounded-lg">
                    <button
                      onClick={() => setMissingChartMode('percentage')}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                        missingChartMode === 'percentage'
                          ? 'bg-[#2563EB] text-white shadow-2xs'
                          : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      %
                    </button>
                    <button
                      onClick={() => setMissingChartMode('count')}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                        missingChartMode === 'count'
                          ? 'bg-[#2563EB] text-white shadow-2xs'
                          : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      Count
                    </button>
                  </div>
                </div>

                {(() => {
                  const missingCols = (qualityData.columns || []).filter(
                    (c) => (c.missing_count ?? 0) > 0
                  );

                  if (missingCols.length === 0) {
                    return (
                      <div className="p-6 rounded-xl bg-emerald-50/70 border border-emerald-200 text-center flex flex-col items-center justify-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-emerald-900">100% Data Completeness</div>
                          <p className="text-[11px] text-emerald-700 mt-0.5 max-w-sm mx-auto">
                            Zero missing cells detected across all {qualityData.summary.total_columns} columns (
                            {qualityData.summary.total_cells.toLocaleString()} cells perfectly populated).
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                      {missingCols.map((col) => {
                        const val =
                          missingChartMode === 'percentage'
                            ? `${col.missing_percentage}%`
                            : `${col.missing_count} cells`;
                        const barWidth = Math.min(col.missing_percentage || 0, 100);
                        const barColor = (col.missing_percentage || 0) > 15 ? 'bg-rose-500' : 'bg-amber-500';

                        return (
                          <div
                            key={col.column_name}
                            className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span
                                className="font-mono text-[11px] font-semibold text-[#0F172A] truncate max-w-[200px]"
                                title={col.column_name}
                              >
                                {col.column_name}
                              </span>
                              <span className="font-bold text-[#0F172A] text-[11px]">{val}</span>
                            </div>
                            <div className="h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                style={{ width: `${barWidth}%` }}
                              ></div>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-[#64748B]">
                              <span>Type: {col.inferred_type || col.data_type}</span>
                              <span>
                                {col.missing_count} / {qualityData.summary.total_rows} missing
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* 2. Column-wise Unique Values — Bar Chart calculated from actual CSV */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-[#F1F5F9]">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-50 text-[#2563EB] flex items-center justify-center">
                      <BarChart3 className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#0F172A]">Column-wise Unique Values</h3>
                      <p className="text-[10px] text-[#64748B]">Distinct non-null values per column</p>
                    </div>
                  </div>

                  {/* Toggle: Count vs % */}
                  <div className="flex items-center bg-[#F1F5F9] p-0.5 rounded-lg">
                    <button
                      onClick={() => setUniqueChartMode('count')}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                        uniqueChartMode === 'count'
                          ? 'bg-[#2563EB] text-white shadow-2xs'
                          : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      Count
                    </button>
                    <button
                      onClick={() => setUniqueChartMode('percentage')}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                        uniqueChartMode === 'percentage'
                          ? 'bg-[#2563EB] text-white shadow-2xs'
                          : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      %
                    </button>
                  </div>
                </div>

                {(() => {
                  const cols = qualityData.columns || [];
                  const maxUnique = Math.max(...cols.map((c) => c.unique_count ?? 0), 1);

                  if (cols.length === 0) {
                    return (
                      <div className="p-6 text-center text-xs text-[#64748B]">
                        No columns available to plot unique values.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                      {cols.map((col) => {
                        const count = col.unique_count ?? 0;
                        const pct = col.unique_percentage ?? 0;
                        const widthPct =
                          uniqueChartMode === 'count'
                            ? Math.min((count / maxUnique) * 100, 100)
                            : Math.min(pct, 100);
                        const displayVal =
                          uniqueChartMode === 'count'
                            ? `${count.toLocaleString()} unique`
                            : `${pct}%`;

                        return (
                          <div
                            key={col.column_name}
                            className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1.5"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span
                                className="font-mono text-[11px] font-semibold text-[#0F172A] truncate max-w-[200px]"
                                title={col.column_name}
                              >
                                {col.column_name}
                              </span>
                              <span className="font-bold text-[#0F172A] text-[11px]">{displayVal}</span>
                            </div>
                            <div className="h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#2563EB] transition-all duration-500"
                                style={{ width: `${Math.max(widthPct, 2)}%` }}
                              ></div>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-[#64748B]">
                              <span>Type: {col.inferred_type || col.data_type}</span>
                              <span>
                                {count.toLocaleString()} unique ({pct}% uniqueness)
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Diagnostic Sections Tabs */}
          <div className="flex border-b border-[#E2E8F0] gap-2">
            <button
              onClick={() => setActiveTab('columns')}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === 'columns'
                  ? 'border-[#2563EB] text-[#2563EB]'
                  : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Column Quality Assessment ({qualityData.columns.length})
            </button>
            <button
              onClick={() => setActiveTab('missing')}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === 'missing'
                  ? 'border-[#2563EB] text-[#2563EB]'
                  : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Missing Values Breakdown ({qualityData.missing_report.affected_columns_count})
            </button>
            <button
              onClick={() => setActiveTab('consistency')}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === 'consistency'
                  ? 'border-[#2563EB] text-[#2563EB]'
                  : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Data Types & Consistency
            </button>
          </div>

          {/* TAB 1: Column Quality Table */}
          {activeTab === 'columns' && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search columns..."
                      value={columnSearch}
                      onChange={(e) => setColumnSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all w-52"
                    />
                  </div>
                </div>

                {/* Filter Chips */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setStatusFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      statusFilter === 'ALL'
                        ? 'bg-[#2563EB] text-white'
                        : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                    }`}
                  >
                    All ({qualityData.columns.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('ISSUES_ONLY')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      statusFilter === 'ISSUES_ONLY'
                        ? 'bg-amber-600 text-white'
                        : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                    }`}
                  >
                    Needs Attention ({qualityData.summary.problematic_columns_count})
                  </button>
                  <button
                    onClick={() => setStatusFilter('GOOD_ONLY')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      statusFilter === 'GOOD_ONLY'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                    }`}
                  >
                    Good ({qualityData.columns.length - qualityData.summary.problematic_columns_count})
                  </button>
                  <button
                    onClick={() => setStatusFilter('MISSING_ONLY')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      statusFilter === 'MISSING_ONLY'
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                    }`}
                  >
                    Has Missing ({qualityData.missing_report.affected_columns_count})
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569] font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Column</th>
                      <th className="py-3 px-4">Data Type</th>
                      <th className="py-3 px-4">Missing</th>
                      <th className="py-3 px-4">Missing %</th>
                      <th className="py-3 px-4">Unique</th>
                      <th className="py-3 px-4">Duplicate / Constant Issue</th>
                      <th className="py-3 px-4 text-right">Quality Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredColumns.map((col) => {
                      const statusBadge = getStatusBadge(col.quality_status);
                      const StatusIcon = statusBadge.icon;
                      return (
                        <tr key={col.column_name} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="py-3 px-4 font-semibold text-[#0F172A]">
                            <div className="flex items-center gap-1.5">
                              <span>{col.column_name}</span>
                            </div>
                            {col.issues.length > 0 && (
                              <div className="text-[10px] text-[#64748B] font-normal mt-0.5">
                                {col.issues.join(' • ')}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getTypeBadgeColor(col.inferred_type)}`}>
                              {col.inferred_type}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-[#0F172A]">
                            {col.missing_count}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <div className="flex-1 h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    col.missing_percentage > 20
                                      ? 'bg-rose-500'
                                      : col.missing_percentage > 0
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.min(100, col.missing_percentage)}%` }}
                                ></div>
                              </div>
                              <span className="text-[11px] font-medium text-[#64748B] w-10 text-right">
                                {col.missing_percentage}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono text-[#0F172A]">{col.unique_count}</span>
                            <span className="text-[10px] text-[#64748B] ml-1">({col.unique_percentage}%)</span>
                          </td>
                          <td className="py-3 px-4">
                            {col.duplicate_constant_issue !== 'None' ? (
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                                  col.is_constant
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : col.is_near_constant
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}
                              >
                                {col.duplicate_constant_issue}
                              </span>
                            ) : (
                              <span className="text-[#94A3B8] text-xs">None</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusBadge.bg}`}
                            >
                              <StatusIcon className="w-3 h-3" />
                              {col.quality_status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: Missing Values Diagnostic */}
          {activeTab === 'missing' && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">Missing Values Report</h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Columns containing null, empty, or undefined cells in {qualityData.filename}.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-[#64748B]">Total Missing Cells: </span>
                  <span className="text-sm font-bold text-amber-600 font-mono">
                    {qualityData.missing_report.total_missing_cells} ({qualityData.missing_report.missing_percentage}%)
                  </span>
                </div>
              </div>

              {qualityData.missing_report.columns_with_missing.length === 0 ? (
                <div className="p-8 text-center bg-emerald-50/50 rounded-xl border border-emerald-100">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                  <div className="text-xs font-bold text-emerald-800">Zero Missing Values Detected</div>
                  <div className="text-[11px] text-emerald-600 mt-0.5">
                    All cells in all {qualityData.summary.total_columns} columns are 100% populated.
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {qualityData.missing_report.columns_with_missing.map((col) => (
                    <div
                      key={col.column_name}
                      className="p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex items-center justify-between gap-4"
                    >
                      <div className="min-w-[180px]">
                        <div className="text-xs font-bold text-[#0F172A]">{col.column_name}</div>
                        <div className="text-[10px] text-[#64748B] mt-0.5">
                          {col.missing_count} missing out of {qualityData.summary.total_rows} rows
                        </div>
                      </div>

                      <div className="flex-1 max-w-md">
                        <div className="h-2 bg-[#E2E8F0] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              col.missing_percentage > 20 ? 'bg-rose-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.min(100, col.missing_percentage)}%` }}
                          ></div>
                        </div>
                      </div>

                      <div className="text-right min-w-[70px]">
                        <span className="text-xs font-bold text-[#0F172A]">{col.missing_percentage}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Data Types & Consistency */}
          {activeTab === 'consistency' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Data Types Summary */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-[#0F172A]">Data Types Distribution</h3>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                    <span className="font-medium text-[#475569]">Numeric Columns</span>
                    <span className="font-bold text-blue-600 font-mono">
                      {qualityData.types_report.numeric_columns.length} ({qualityData.types_report.numeric_columns.join(', ') || 'None'})
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                    <span className="font-medium text-[#475569]">Categorical / Text Columns</span>
                    <span className="font-bold text-purple-600 font-mono">
                      {qualityData.types_report.categorical_columns.length} ({qualityData.types_report.categorical_columns.join(', ') || 'None'})
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                    <span className="font-medium text-[#475569]">Datetime Columns</span>
                    <span className="font-bold text-amber-600 font-mono">
                      {qualityData.types_report.datetime_columns.length} ({qualityData.types_report.datetime_columns.join(', ') || 'None'})
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                    <span className="font-medium text-[#475569]">Boolean Columns</span>
                    <span className="font-bold text-teal-600 font-mono">
                      {qualityData.types_report.boolean_columns.length} ({qualityData.types_report.boolean_columns.join(', ') || 'None'})
                    </span>
                  </div>
                </div>
              </div>

              {/* Consistency & Anomaly Details */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
                <h3 className="text-sm font-bold text-[#0F172A]">Consistency & Formatting Checks</h3>
                <div className="space-y-2.5">
                  <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#475569]">Constant Columns</span>
                      <span className={`font-bold ${qualityData.constant_report.constant_columns.length > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {qualityData.constant_report.constant_columns.length > 0
                          ? qualityData.constant_report.constant_columns.map(c => `${c.column_name} ('${c.constant_value}')`).join(', ')
                          : 'None detected'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#475569]">Near-Constant Columns</span>
                      <span className={`font-bold ${qualityData.constant_report.near_constant_columns.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {qualityData.constant_report.near_constant_columns.length > 0
                          ? qualityData.constant_report.near_constant_columns.map(c => `${c.column_name} (${c.percentage}% '${c.constant_value}')`).join(', ')
                          : 'None detected'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#475569]">Empty Rows / Empty Columns</span>
                      <span className={`font-bold ${qualityData.empty_report.empty_rows_count > 0 || qualityData.empty_report.empty_columns_count > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {qualityData.empty_report.empty_rows_count} empty rows, {qualityData.empty_report.empty_columns_count} empty columns
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#475569]">Null-like String Tokens</span>
                      <span className={`font-bold ${qualityData.consistency_report.null_like_values_detected.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {qualityData.consistency_report.null_like_values_detected.length > 0
                          ? `${qualityData.consistency_report.null_like_values_detected.length} token(s) detected`
                          : 'None detected'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DataQualityPage;
