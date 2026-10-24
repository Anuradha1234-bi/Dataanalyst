import React, { useState, useEffect, useMemo } from 'react';
import {
  GitMerge,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  RefreshCw,
  Check,
  X,
  Sparkles,
  LayoutGrid,
  Table as TableIcon,
  ShieldCheck,
  ShieldAlert,
  Info,
  HelpCircle,
  ArrowRight,
  ArrowLeftRight,
  Copy,
  Eye,
  EyeOff,
  Layers,
  FileSearch,
  CheckCheck,
  Split,
} from 'lucide-react';
import { relationshipService } from '../services/relationshipService';
import { extractErrorMessage } from '../services/api';

export const RelationshipManager = ({
  datasets = [],
  selectedDatasetId = null,
  onDatasetCreated = () => {},
  onSwitchToSingle = () => {},
}) => {
  // Selection of datasets to analyze
  const [selectedIds, setSelectedIds] = useState(() => {
    if (selectedDatasetId) {
      const others = datasets.filter((d) => d.id !== selectedDatasetId).map((d) => d.id);
      return [selectedDatasetId, ...others.slice(0, 2)];
    }
    return datasets.slice(0, 5).map((d) => d.id);
  });

  const [relationships, setRelationships] = useState([]);
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [scanSummary, setScanSummary] = useState(null);
  const [hasScanned, setHasScanned] = useState(false);

  // Status map for user reviews: { [relationshipId]: 'ACCEPTED' | 'REJECTED' | 'IGNORED' }
  const [reviewStatuses, setReviewStatuses] = useState({});

  // Feature 1: Smart Duplicate Datasets State
  const [duplicateDatasets, setDuplicateDatasets] = useState([]);
  const [ignoredPairs, setIgnoredPairs] = useState(new Set());
  const [showIgnoredDuplicates, setShowIgnoredDuplicates] = useState(false);
  const [scanningDuplicates, setScanningDuplicates] = useState(false);
  const [comparisonModalPair, setComparisonModalPair] = useState(null);
  const [differencesModalPair, setDifferencesModalPair] = useState(null);
  const [differencesActiveTab, setDifferencesActiveTab] = useState(1); // 1 for D1, 2 for D2

  // Loading & notification states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // View mode: 'cards' | 'table'
  const [viewMode, setViewMode] = useState('cards');

  // Filter tabs: 'all', 'strong', 'possible', 'accepted', 'rejected'
  const [activeFilter, setActiveFilter] = useState('all');

  // Join Preview & Apply Modal State
  const [activeJoinRel, setActiveJoinRel] = useState(null);
  const [joinType, setJoinType] = useState('inner');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [customName, setCustomName] = useState('');
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);
  const [applyingJoin, setApplyingJoin] = useState(false);

  // Load existing duplicates on mount if datasets are available
  useEffect(() => {
    const loadSavedDuplicates = async () => {
      try {
        const data = await relationshipService.getDuplicates();
        if (data && data.duplicate_datasets && data.duplicate_datasets.length > 0) {
          setDuplicateDatasets(data.duplicate_datasets);
          const ignored = new Set();
          data.duplicate_datasets.forEach((p) => {
            if (p.ignored) ignored.add(p.id);
          });
          setIgnoredPairs(ignored);
        }
      } catch (err) {
        // Silently tolerate if no duplicates saved yet
      }
    };
    if (datasets.length >= 2) {
      loadSavedDuplicates();
    }
  }, [datasets.length]);

  // Sync selectedIds if empty and datasets change
  useEffect(() => {
    if (datasets.length > 0 && selectedIds.length === 0) {
      if (selectedDatasetId) {
        const others = datasets.filter((d) => d.id !== selectedDatasetId).map((d) => d.id);
        setSelectedIds([selectedDatasetId, ...others.slice(0, 2)]);
      } else {
        setSelectedIds(datasets.slice(0, 5).map((d) => d.id));
      }
    }
  }, [datasets, selectedDatasetId, selectedIds.length]);

  // Handle toggling dataset checkbox
  const toggleDatasetSelection = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllDatasets = () => {
    setSelectedIds(datasets.map((d) => d.id));
  };

  const clearDatasetSelection = () => {
    setSelectedIds([]);
  };

  // Discover relationships and smart duplicates across selected datasets
  const handleDiscover = async () => {
    if (selectedIds.length < 2) {
      setError('Please select at least 2 datasets to detect relationships between them.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccessMessage('');
    setHasScanned(true);

    try {
      const data = await relationshipService.detectRelationships(selectedIds);
      const rels = data.relationships || [];
      const dups = data.duplicate_datasets || [];
      setRelationships(rels);
      setDuplicateDatasets(dups);
      setAnalyzedCount(data.analyzed_datasets_count || selectedIds.length);
      setScanSummary(data.scan_summary || null);

      // Initialize review status from items
      const initialStatuses = {};
      rels.forEach((r) => {
        initialStatuses[r.id] = r.user_status || 'PENDING';
      });
      setReviewStatuses(initialStatuses);

      // Initialize ignored duplicate set
      const initialIgnored = new Set();
      dups.forEach((p) => {
        if (p.ignored) initialIgnored.add(p.id);
      });
      setIgnoredPairs(initialIgnored);

      let msg = `Scan complete: Discovered ${rels.length} relationship candidate(s)`;
      if (dups.length > 0) {
        msg += ` and identified ${dups.length} duplicate/overlap dataset pair(s)`;
      }
      msg += ` across ${data.analyzed_datasets_count || selectedIds.length} datasets.`;
      setSuccessMessage(msg);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Dedicated Duplicate Scanner
  const handleScanDuplicates = async () => {
    if (selectedIds.length < 2) {
      setError('Please select at least 2 datasets to scan for duplicates.');
      return;
    }
    setScanningDuplicates(true);
    setError('');
    try {
      const data = await relationshipService.detectDuplicates(selectedIds);
      const dups = data.duplicate_datasets || [];
      setDuplicateDatasets(dups);
      const initialIgnored = new Set();
      dups.forEach((p) => {
        if (p.ignored) initialIgnored.add(p.id);
      });
      setIgnoredPairs(initialIgnored);
      if (dups.length === 0) {
        setSuccessMessage('Duplicate scan complete: No duplicate datasets or high-overlap pairs found.');
      } else {
        setSuccessMessage(`Duplicate scan complete: Found ${dups.length} duplicate/overlap dataset pair(s).`);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setScanningDuplicates(false);
    }
  };

  // Non-destructive ignore toggle
  const handleToggleIgnoreDuplicate = async (pair) => {
    const isIgnored = ignoredPairs.has(pair.id);
    const newIgnored = !isIgnored;
    try {
      await relationshipService.ignoreDuplicate(pair.id, newIgnored);
      setIgnoredPairs((prev) => {
        const next = new Set(prev);
        if (newIgnored) {
          next.add(pair.id);
        } else {
          next.delete(pair.id);
        }
        return next;
      });
    } catch (err) {
      // Local fallback state
      setIgnoredPairs((prev) => {
        const next = new Set(prev);
        if (newIgnored) {
          next.add(pair.id);
        } else {
          next.delete(pair.id);
        }
        return next;
      });
    }
  };

  // Update status (Accept, Reject, Ignore)
  const handleStatusChange = async (relId, newStatus) => {
    try {
      await relationshipService.updateStatus(relId, newStatus);
      setReviewStatuses((prev) => ({ ...prev, [relId]: newStatus }));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  // Open Join Preview Modal
  const openJoinPreview = async (rel) => {
    setActiveJoinRel(rel);
    setJoinType('inner');
    setPreviewError('');
    setConfirmCheckbox(false);
    const leftStem = rel.source_dataset_name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const rightStem = rel.target_dataset_name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    setCustomName(`joined_${leftStem}_${rightStem}`);
    await fetchJoinPreview(rel, 'inner');
  };

  const fetchJoinPreview = async (rel, type) => {
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const preview = await relationshipService.previewJoin({
        leftDatasetId: rel.source_dataset_id,
        leftColumn: rel.source_column,
        rightDatasetId: rel.target_dataset_id,
        rightColumn: rel.target_column,
        joinType: type,
        limit: 10,
      });
      setPreviewData(preview);
    } catch (err) {
      setPreviewError(extractErrorMessage(err));
      setPreviewData(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleJoinTypeChange = (type) => {
    setJoinType(type);
    if (activeJoinRel) {
      fetchJoinPreview(activeJoinRel, type);
    }
  };

  // Apply Join and create derived dataset
  const handleApplyJoin = async () => {
    if (!activeJoinRel || !confirmCheckbox) return;
    setApplyingJoin(true);
    setPreviewError('');
    try {
      const result = await relationshipService.applyJoin({
        leftDatasetId: activeJoinRel.source_dataset_id,
        leftColumn: activeJoinRel.source_column,
        rightDatasetId: activeJoinRel.target_dataset_id,
        rightColumn: activeJoinRel.target_column,
        joinType,
        customDatasetName: customName.trim() || null,
        userConfirmed: true,
      });

      // Mark relationship as accepted
      setReviewStatuses((prev) => ({ ...prev, [activeJoinRel.id]: 'ACCEPTED' }));
      setActiveJoinRel(null);
      setPreviewData(null);

      setSuccessMessage(
        `Successfully joined datasets into new derived dataset: "${result.derived_dataset_name}" (${result.rows} rows, ${result.columns} columns).`
      );

      // Trigger reload of datasets list in parent
      onDatasetCreated(result.derived_dataset_id);
    } catch (err) {
      setPreviewError(extractErrorMessage(err));
    } finally {
      setApplyingJoin(false);
    }
  };

  // Filtered relationships
  const filteredRelationships = useMemo(() => {
    return relationships.filter((r) => {
      const status = reviewStatuses[r.id] || r.user_status;
      if (activeFilter === 'strong') return r.confidence === 'HIGH';
      if (activeFilter === 'possible') return r.confidence === 'MEDIUM';
      if (activeFilter === 'accepted') return status === 'ACCEPTED';
      if (activeFilter === 'rejected') return status === 'REJECTED';
      return true;
    });
  }, [relationships, activeFilter, reviewStatuses]);

  // Statistics
  const stats = useMemo(() => {
    const total = relationships.length;
    const strong = relationships.filter((r) => r.confidence === 'HIGH').length;
    const pkFkPairs = relationships.filter((r) => r.source_is_pk_candidate || r.target_is_pk_candidate).length;
    const accepted = Object.values(reviewStatuses).filter((s) => s === 'ACCEPTED').length;
    return { total, strong, pkFkPairs, accepted };
  }, [relationships, reviewStatuses]);

  // Helper for cardinality badge styling
  const renderCardinalityBadge = (symbol, type) => {
    const sym = symbol || (type === 'One-to-One' ? '1:1' : type === 'One-to-Many' ? '1:N' : type === 'Many-to-One' ? 'N:1' : 'M:N');
    if (sym === '1:1') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          1:1 (One-to-One)
        </span>
      );
    }
    if (sym === '1:N') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          1:N (One-to-Many)
        </span>
      );
    }
    if (sym === 'N:1') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          N:1 (Many-to-One)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
        M:N (Many-to-Many)
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSwitchToSingle()}
              className="underline font-semibold hover:text-emerald-950"
            >
              Switch to Single Cleaning
            </button>
            <button onClick={() => setSuccessMessage('')} className="text-emerald-500 hover:text-emerald-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Dataset Selection Section */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F1F5F9] pb-4">
          <div>
            <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <Database className="w-4 h-4 text-[#2563EB]" />
              <span>Select Datasets for Cross-Analysis</span>
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Choose two or more uploaded datasets to discover common keys, cardinality (1:1, 1:N, N:1, M:N), and join candidates.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={selectAllDatasets}
              className="px-2.5 py-1 text-xs text-[#2563EB] hover:bg-blue-50 rounded-lg transition-colors font-medium cursor-pointer"
            >
              Select All
            </button>
            <span className="text-[#CBD5E1]">|</span>
            <button
              onClick={clearDatasetSelection}
              className="px-2.5 py-1 text-xs text-[#64748B] hover:bg-slate-100 rounded-lg transition-colors font-medium cursor-pointer"
            >
              Clear
            </button>
            <button
              onClick={handleDiscover}
              disabled={loading || selectedIds.length < 2}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Analyzing Relationships...' : 'Discover Relationships'}</span>
            </button>
          </div>
        </div>

        {/* Dataset Checkbox Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {datasets.map((ds) => {
            const isSelected = selectedIds.includes(ds.id);
            return (
              <label
                key={ds.id}
                className={`flex items-center gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                  isSelected
                    ? 'border-[#2563EB] bg-[#EFF6FF]/60 shadow-xs'
                    : 'border-[#E2E8F0] hover:border-[#CBD5E1] bg-white'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleDatasetSelection(ds.id)}
                  className="rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB] w-4 h-4 cursor-pointer"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[#0F172A] truncate">{ds.filename}</div>
                  <div className="text-[11px] text-[#64748B] flex items-center gap-2 mt-0.5">
                    <span>{ds.rows?.toLocaleString()} rows</span>
                    <span>•</span>
                    <span>{ds.columns} cols</span>
                    {ds.has_cleaned && (
                      <span className="text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded text-[10px] font-semibold border border-emerald-200">
                        Cleaned
                      </span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* ---------------- FEATURE 1: SMART DUPLICATE DATASET DETECTION ---------------- */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F1F5F9] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600">
                <Copy className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-[#0F172A]">
                Smart Duplicate Dataset Detection
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                Content-Based
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
              Detects duplicate and substantially overlapping datasets by comparing real tabular contents — invariant to filenames, extensions (CSV/XLSX), row order, column order, and header casing.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {ignoredPairs.size > 0 && (
              <button
                onClick={() => setShowIgnoredDuplicates((prev) => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium cursor-pointer"
              >
                {showIgnoredDuplicates ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showIgnoredDuplicates ? 'Hide Ignored' : `Show Ignored (${ignoredPairs.size})`}</span>
              </button>
            )}

            <button
              onClick={handleScanDuplicates}
              disabled={scanningDuplicates || selectedIds.length < 2}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanningDuplicates ? 'animate-spin' : ''}`} />
              <span>{scanningDuplicates ? 'Comparing Tabular Data...' : 'Scan Duplicates'}</span>
            </button>
          </div>
        </div>

        {/* List of Detected Duplicate Pairs */}
        {(() => {
          const visiblePairs = duplicateDatasets.filter(
            (p) => showIgnoredDuplicates || !ignoredPairs.has(p.id)
          );

          if (duplicateDatasets.length === 0) {
            return (
              <div className="p-6 text-center border border-dashed border-[#CBD5E1] rounded-xl space-y-1.5 text-xs text-[#64748B]">
                <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto text-slate-500">
                  <CheckCheck className="w-4 h-4" />
                </div>
                <div className="font-semibold text-[#0F172A]">No Duplicate Datasets Identified</div>
                <p className="text-[11px] max-w-md mx-auto">
                  Click <strong>Scan Duplicates</strong> or <strong>Discover Relationships</strong> to compare actual cell values across your selected datasets.
                </p>
              </div>
            );
          }

          if (visiblePairs.length === 0 && duplicateDatasets.length > 0) {
            return (
              <div className="p-4 text-center border border-slate-200 rounded-xl text-xs text-[#64748B] space-y-2">
                <span>All {duplicateDatasets.length} detected duplicate pair(s) are currently ignored.</span>
                <div>
                  <button
                    onClick={() => setShowIgnoredDuplicates(true)}
                    className="text-xs text-[#2563EB] font-semibold underline hover:text-[#1D4ED8]"
                  >
                    View ignored duplicate pairs
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div className="space-y-3.5">
              {visiblePairs.map((pair) => {
                const isIgnored = ignoredPairs.has(pair.id);
                const isExact = pair.status === 'EXACT_DUPLICATE';
                const isPotential = pair.status === 'POTENTIAL_DUPLICATE';
                const isPartial = pair.status === 'PARTIAL_OVERLAP';

                return (
                  <div
                    key={pair.id}
                    className={`border rounded-xl p-4.5 transition-all space-y-3 ${
                      isIgnored
                        ? 'opacity-60 bg-slate-50/70 border-slate-200'
                        : isExact
                        ? 'bg-emerald-50/20 border-emerald-300 ring-1 ring-emerald-200'
                        : isPotential
                        ? 'bg-amber-50/20 border-amber-300 ring-1 ring-amber-200'
                        : 'bg-blue-50/20 border-blue-200'
                    }`}
                  >
                    {/* Header: Detection Status & ID */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Status Badge */}
                        {isExact && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Exact Duplicate (100% Match)
                          </span>
                        )}
                        {isPotential && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            Potential Duplicate ({pair.overlap_pct}%)
                          </span>
                        )}
                        {isPartial && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300 shadow-2xs">
                            <Layers className="w-3.5 h-3.5 text-blue-600" />
                            Partial Overlap ({pair.overlap_pct}%)
                          </span>
                        )}

                        {isIgnored && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
                            Ignored
                          </span>
                        )}

                        <span className="text-[11px] text-[#64748B] font-mono">
                          Pair ID: {pair.id}
                        </span>
                      </div>

                      {/* Overlap Percentage Bar / Pill */}
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#64748B]">Content Match:</span>
                        <div className="w-24 h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isExact ? 'bg-emerald-500' : isPotential ? 'bg-amber-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(5, pair.overlap_pct))}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold font-mono text-[#0F172A]">
                          {pair.overlap_pct}%
                        </span>
                      </div>
                    </div>

                    {/* Dataset Comparison Cards Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* Dataset 1 */}
                      <div className="p-3 bg-white border border-[#E2E8F0] rounded-lg shadow-2xs space-y-1">
                        <div className="text-[10px] uppercase font-bold text-[#64748B] flex items-center justify-between">
                          <span>Dataset 1</span>
                          <span className="font-mono text-slate-400">ID #{pair.dataset1_id}</span>
                        </div>
                        <div className="font-bold text-[#0F172A] truncate" title={pair.dataset1_name}>
                          {pair.dataset1_name}
                        </div>
                        <div className="text-[11px] text-[#64748B] flex items-center gap-2 pt-0.5">
                          <span>{pair.dataset1_rows?.toLocaleString()} rows</span>
                          <span>•</span>
                          <span>{pair.dataset1_columns} columns</span>
                        </div>
                      </div>

                      {/* Dataset 2 */}
                      <div className="p-3 bg-white border border-[#E2E8F0] rounded-lg shadow-2xs space-y-1">
                        <div className="text-[10px] uppercase font-bold text-[#64748B] flex items-center justify-between">
                          <span>Dataset 2</span>
                          <span className="font-mono text-slate-400">ID #{pair.dataset2_id}</span>
                        </div>
                        <div className="font-bold text-[#0F172A] truncate" title={pair.dataset2_name}>
                          {pair.dataset2_name}
                        </div>
                        <div className="text-[11px] text-[#64748B] flex items-center gap-2 pt-0.5">
                          <span>{pair.dataset2_rows?.toLocaleString()} rows</span>
                          <span>•</span>
                          <span>{pair.dataset2_columns} columns</span>
                        </div>
                      </div>
                    </div>

                    {/* Content Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0]">
                        <div className="text-[10px] uppercase font-bold text-[#64748B]">Matching Records</div>
                        <div className="text-sm font-bold text-[#0F172A] font-mono mt-0.5">
                          {pair.matching_records_count?.toLocaleString()}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0]">
                        <div className="text-[10px] uppercase font-bold text-[#64748B]">Unique to D1</div>
                        <div className="text-sm font-bold text-[#0F172A] font-mono mt-0.5">
                          {pair.unique_records_dataset1_count?.toLocaleString()}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0]">
                        <div className="text-[10px] uppercase font-bold text-[#64748B]">Unique to D2</div>
                        <div className="text-sm font-bold text-[#0F172A] font-mono mt-0.5">
                          {pair.unique_records_dataset2_count?.toLocaleString()}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0]">
                        <div className="text-[10px] uppercase font-bold text-[#64748B]">Overlap Ratio</div>
                        <div className="text-sm font-bold text-[#0F172A] font-mono mt-0.5">
                          {pair.overlap_pct}%
                        </div>
                      </div>
                    </div>

                    {/* Differences & Comparison Method Banner */}
                    <div className="p-3 bg-white/80 border border-[#E2E8F0] rounded-lg text-xs space-y-1.5 text-[#334155]">
                      <div className="flex items-center gap-1.5 font-bold text-[#0F172A] text-[11px]">
                        <Info className="w-3.5 h-3.5 text-blue-600" />
                        <span>Comparison Method:</span>
                        <span className="font-normal text-[#64748B]">{pair.comparison_method}</span>
                      </div>

                      {pair.differences && pair.differences.length > 0 && (
                        <div className="flex items-start gap-1.5 text-[11px] pt-1 border-t border-[#F1F5F9]">
                          <span className="font-semibold text-slate-700 shrink-0">Differences Noted:</span>
                          <div className="flex flex-wrap gap-1">
                            {pair.differences.map((diff, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px]"
                              >
                                {diff}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Safe Actions Toolbar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E2E8F0]">
                      <div className="text-[11px] text-[#64748B] flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Non-destructive inspection only. Source datasets remain unchanged.</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setComparisonModalPair(pair)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#0F172A] rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                        >
                          <FileSearch className="w-3.5 h-3.5 text-blue-600" />
                          <span>View Comparison</span>
                        </button>

                        <button
                          onClick={() => {
                            setDifferencesModalPair(pair);
                            setDifferencesActiveTab(1);
                          }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-slate-50 border border-[#CBD5E1] text-[#0F172A] rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                        >
                          <Split className="w-3.5 h-3.5 text-amber-600" />
                          <span>Preview Differences</span>
                        </button>

                        <button
                          onClick={() => handleToggleIgnoreDuplicate(pair)}
                          className={`flex items-center gap-1 px-3 py-1.5 border rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer ${
                            isIgnored
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                              : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          {isIgnored ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          <span>{isIgnored ? 'Restore' : 'Ignore'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Empty State when Scanned and 0 Relationships Detected */}
      {hasScanned && !loading && relationships.length === 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center shadow-xs space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
            <HelpCircle className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-sm font-bold text-[#0F172A]">
              No Strong Column Relationships Detected
            </h3>
            <p className="text-xs text-[#64748B] leading-relaxed">
              We evaluated {scanSummary?.columns_profiled || 'all'} column combinations across {analyzedCount} selected datasets.
              No matching identifier columns with valid overlapping records were found.
            </p>
          </div>

          {/* Diagnostic Details Card */}
          <div className="max-w-lg mx-auto p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-left text-xs space-y-2 text-[#475569]">
            <div className="font-bold text-[#0F172A] flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <Info className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>What was checked:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-[11px] text-[#64748B]">
              <li>Normalized column names (case-insensitive, whitespace-trimmed, abbreviations like <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">cust_id = customer_id</code>).</li>
              <li>Data type compatibility (numbers, strings, categorical, and convertible identifiers).</li>
              <li>Exact matching key records, uniqueness, and duplicate value distributions.</li>
            </ul>
            <div className="pt-2 border-t border-[#E2E8F0] text-[11px] text-[#2563EB] font-semibold">
              Tip: Ensure the selected datasets share a common identifier column (e.g., ID, Code, Name, or Date) with matching values.
            </div>
          </div>
        </div>
      )}

      {/* Discovery Results & Metrics */}
      {relationships.length > 0 && (
        <div className="space-y-4">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] shadow-xs">
              <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Total Detected</div>
              <div className="text-2xl font-bold text-[#0F172A] mt-1">{stats.total}</div>
              <div className="text-[11px] text-[#64748B] mt-0.5">Across {analyzedCount} datasets</div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-emerald-200 shadow-xs bg-emerald-50/20">
              <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Strong Matches</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{stats.strong}</div>
              <div className="text-[11px] text-emerald-600 mt-0.5">High confidence & overlap</div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-blue-200 shadow-xs bg-blue-50/20">
              <div className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">PK / FK Candidates</div>
              <div className="text-2xl font-bold text-blue-700 mt-1">{stats.pkFkPairs}</div>
              <div className="text-[11px] text-blue-600 mt-0.5">Verified unique keys</div>
            </div>

            <div className="p-4 rounded-xl bg-white border border-purple-200 shadow-xs bg-purple-50/20">
              <div className="text-[11px] font-bold text-purple-800 uppercase tracking-wider">Accepted Joins</div>
              <div className="text-2xl font-bold text-purple-700 mt-1">{stats.accepted}</div>
              <div className="text-[11px] text-purple-600 mt-0.5">Ready for merging</div>
            </div>
          </div>

          {/* Filter Pills & View Mode Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-2 text-xs">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeFilter === 'all'
                    ? 'bg-[#0F172A] text-white shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100'
                }`}
              >
                All Matches ({stats.total})
              </button>
              <button
                onClick={() => setActiveFilter('strong')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeFilter === 'strong'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-[#64748B] hover:text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                Strong ({stats.strong})
              </button>
              <button
                onClick={() => setActiveFilter('possible')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeFilter === 'possible'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-[#64748B] hover:text-amber-700 hover:bg-amber-50'
                }`}
              >
                Possible ({stats.total - stats.strong})
              </button>
              <button
                onClick={() => setActiveFilter('accepted')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  activeFilter === 'accepted'
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : 'text-[#64748B] hover:text-[#2563EB] hover:bg-blue-50'
                }`}
              >
                Accepted ({stats.accepted})
              </button>
            </div>

            {/* View Switcher: Cards vs Table */}
            <div className="flex items-center gap-1 bg-[#F1F5F9] p-1 rounded-lg border border-[#E2E8F0]">
              <button
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Cards</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Table</span>
              </button>
            </div>
          </div>

          {/* Table View */}
          {viewMode === 'table' && (
            <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[10px] text-[#475569] font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-3.5">Source Dataset & Key</th>
                      <th className="py-3 px-3.5">Target Dataset & Key</th>
                      <th className="py-3 px-3.5">Cardinality</th>
                      <th className="py-3 px-3.5">Key Overlap</th>
                      <th className="py-3 px-3.5">Unmatched (A / B)</th>
                      <th className="py-3 px-3.5">Join Safety</th>
                      <th className="py-3 px-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {filteredRelationships.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-xs text-[#64748B]">
                          No relationships match the selected filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRelationships.map((rel) => {
                        const userStatus = reviewStatuses[rel.id] || rel.user_status;
                        const isAccepted = userStatus === 'ACCEPTED';
                        const isSafe = rel.safe_for_join !== false && rel.relationship_type !== 'Many-to-Many';

                        return (
                          <tr key={rel.id} className="hover:bg-[#F8FAFC]/80 transition-colors">
                            <td className="py-3 px-3.5">
                              <div className="font-semibold text-[#0F172A] truncate max-w-[180px]">{rel.source_dataset_name}</div>
                              <div className="font-mono text-[11px] text-[#2563EB] font-bold mt-0.5">{rel.source_column}</div>
                            </td>
                            <td className="py-3 px-3.5">
                              <div className="font-semibold text-[#0F172A] truncate max-w-[180px]">{rel.target_dataset_name}</div>
                              <div className="font-mono text-[11px] text-[#2563EB] font-bold mt-0.5">{rel.target_column}</div>
                            </td>
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {renderCardinalityBadge(rel.cardinality_symbol, rel.relationship_type)}
                            </td>
                            <td className="py-3 px-3.5">
                              <div className="font-bold text-[#0F172A] font-mono">{rel.value_overlap_pct}%</div>
                              <div className="text-[10px] text-[#64748B]">{rel.matching_values_count?.toLocaleString()} keys</div>
                            </td>
                            <td className="py-3 px-3.5 font-mono text-[11px] text-[#64748B] whitespace-nowrap">
                              {rel.unmatched_values_source || 0} / {rel.unmatched_values_target || 0}
                            </td>
                            <td className="py-3 px-3.5 whitespace-nowrap">
                              {isSafe ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  <ShieldCheck className="w-3.5 h-3.5" /> Safe
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" /> Caution (M:N)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleStatusChange(rel.id, isAccepted ? 'PENDING' : 'ACCEPTED')}
                                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                    isAccepted
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : 'bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-200'
                                  }`}
                                  title={isAccepted ? 'Accepted' : 'Accept Relationship'}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => openJoinPreview(rel)}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                                >
                                  <GitMerge className="w-3.5 h-3.5" />
                                  <span>Preview</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cards View */}
          {viewMode === 'cards' && (
            <div className="space-y-4">
              {filteredRelationships.length === 0 ? (
                <div className="p-8 text-center bg-white border border-[#E2E8F0] rounded-xl text-xs text-[#64748B]">
                  No relationships match the selected filter.
                </div>
              ) : (
                filteredRelationships.map((rel) => {
                  const userStatus = reviewStatuses[rel.id] || rel.user_status;
                  const isAccepted = userStatus === 'ACCEPTED';
                  const isRejected = userStatus === 'REJECTED';
                  const isSafe = rel.safe_for_join !== false && rel.relationship_type !== 'Many-to-Many';

                  return (
                    <div
                      key={rel.id}
                      className={`bg-white border rounded-xl p-5 shadow-xs transition-all space-y-4 ${
                        isAccepted
                          ? 'border-emerald-300 ring-1 ring-emerald-200'
                          : isRejected
                          ? 'border-slate-200 opacity-60 bg-slate-50/50'
                          : 'border-[#E2E8F0] hover:border-[#CBD5E1]'
                      }`}
                    >
                      {/* Header: Badges & Join Risk */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                              rel.confidence === 'HIGH'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : rel.confidence === 'MEDIUM'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            {rel.confidence_label || rel.confidence} ({rel.confidence_score}%)
                          </span>

                          {renderCardinalityBadge(rel.cardinality_symbol, rel.relationship_type)}

                          {isSafe ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" /> Safe Join
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3 text-amber-600" /> Row Multiplication Risk
                            </span>
                          )}

                          {rel.is_recommended && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                              <Sparkles className="w-2.5 h-2.5" /> Best Key Match
                            </span>
                          )}
                        </div>

                        {/* Review State Badge */}
                        <div className="flex items-center gap-2">
                          {isAccepted && (
                            <span className="text-xs font-semibold text-emerald-700 bg-emerald-100/60 px-2.5 py-1 rounded-lg flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Accepted
                            </span>
                          )}
                          {isRejected && (
                            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5" /> Rejected
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Direction Banner */}
                      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 border border-[#E2E8F0] rounded-xl text-xs">
                        <div className="flex items-center gap-2 font-mono text-[#334155]">
                          <span className="text-[10px] uppercase font-bold text-[#64748B] font-sans">Direction:</span>
                          <span className="font-bold text-[#2563EB]">
                            {rel.direction || `${rel.source_dataset_name}.${rel.source_column} -> ${rel.target_dataset_name}.${rel.target_column}`}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#64748B]">
                          Cardinality:{' '}
                          <strong className="text-[#0F172A] font-bold">
                            {rel.cardinality || rel.relationship_type} ({rel.cardinality_symbol || '1:N'})
                          </strong>
                        </div>
                      </div>

                      {/* Plain English Cardinality Explanation */}
                      {rel.cardinality_explanation && (
                        <div className="p-3 bg-blue-50/50 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                          <Info className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                          <div className="leading-relaxed">
                            <span className="font-bold">Relationship Semantics: </span>
                            {rel.cardinality_explanation}
                          </div>
                        </div>
                      )}

                      {/* Visual Connection Diagram */}
                      <div className="p-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
                        {/* Left Entity */}
                        <div className="flex-1 w-full text-left bg-white p-3.5 rounded-lg border border-[#E2E8F0] shadow-2xs">
                          <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider truncate">
                            {rel.source_dataset_name}
                          </div>
                          <div className="text-sm font-bold text-[#0F172A] mt-1 font-mono flex items-center gap-1.5">
                            <span>{rel.source_column}</span>
                            <span className="text-[10px] font-normal text-[#64748B] font-sans">
                              ({rel.source_dtype})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            {rel.source_pk_fk_hint ? (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                                rel.source_pk_fk_hint.includes('Primary')
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : rel.source_pk_fk_hint.includes('Foreign')
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {rel.source_pk_fk_hint}
                              </span>
                            ) : rel.source_is_pk_candidate ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                                Primary Key Candidate
                              </span>
                            ) : (
                              <span className="text-[10px] text-[#64748B]">Standard Column</span>
                            )}
                          </div>
                        </div>

                        {/* Connection Bridge */}
                        <div className="flex flex-col items-center justify-center shrink-0 px-3">
                          <div className="w-8 h-8 rounded-full bg-white border border-[#CBD5E1] flex items-center justify-center text-[#2563EB] shadow-xs">
                            {rel.cardinality_symbol === '1:1' ? (
                              <ArrowLeftRight className="w-4 h-4" />
                            ) : (
                              <ArrowRight className="w-4 h-4" />
                            )}
                          </div>
                          <div className="text-[10px] text-[#64748B] mt-1 font-semibold text-center">
                            {rel.value_overlap_pct}% Overlap ({rel.matching_values_count?.toLocaleString()} keys)
                          </div>
                        </div>

                        {/* Right Entity */}
                        <div className="flex-1 w-full text-left bg-white p-3.5 rounded-lg border border-[#E2E8F0] shadow-2xs">
                          <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider truncate">
                            {rel.target_dataset_name}
                          </div>
                          <div className="text-sm font-bold text-[#0F172A] mt-1 font-mono flex items-center gap-1.5">
                            <span>{rel.target_column}</span>
                            <span className="text-[10px] font-normal text-[#64748B] font-sans">
                              ({rel.target_dtype})
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            {rel.target_pk_fk_hint ? (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                                rel.target_pk_fk_hint.includes('Primary')
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : rel.target_pk_fk_hint.includes('Foreign')
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {rel.target_pk_fk_hint}
                              </span>
                            ) : rel.target_is_pk_candidate ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                                Primary Key Candidate
                              </span>
                            ) : (
                              <span className="text-[10px] text-[#64748B]">Standard Column</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Value Distribution & Matching Metrics Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0]">
                        <div>
                          <span className="text-[#64748B] block text-[10px] uppercase font-bold">Matching Keys:</span>
                          <span className="font-bold text-emerald-700 font-mono text-xs">
                            {rel.matching_values_count?.toLocaleString() || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#64748B] block text-[10px] uppercase font-bold">Unmatched (A / B):</span>
                          <span className="font-bold text-[#0F172A] font-mono text-xs">
                            {rel.unmatched_values_source || 0} / {rel.unmatched_values_target || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#64748B] block text-[10px] uppercase font-bold">Unique Keys (A / B):</span>
                          <span className="font-bold text-[#0F172A] font-mono text-xs">
                            {rel.source_unique_count || 0} / {rel.target_unique_count || 0}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#64748B] block text-[10px] uppercase font-bold">Null Count (A / B):</span>
                          <span className="font-bold text-[#64748B] font-mono text-xs">
                            {rel.source_null_count || 0} / {rel.target_null_count || 0}
                          </span>
                        </div>
                      </div>

                      {/* Warnings Display */}
                      {rel.warning_messages?.length > 0 && (
                        <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-1">
                          <div className="font-bold flex items-center gap-1.5 text-amber-950">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>Relationship Notices & Join Safeguards:</span>
                          </div>
                          <ul className="list-disc pl-5 text-[11px] space-y-0.5 text-amber-800">
                            {rel.warning_messages.map((w, idx) => (
                              <li key={idx}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Evidence & Confidence Reasons */}
                      {rel.confidence_reasons?.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-bold text-[#475569] uppercase tracking-wider">Detection Evidence:</div>
                          <div className="flex flex-wrap gap-1.5">
                            {rel.confidence_reasons.map((reason, idx) => (
                              <span
                                key={idx}
                                className="text-[11px] text-[#334155] bg-[#F1F5F9] px-2.5 py-1 rounded-md border border-[#E2E8F0]"
                              >
                                ✓ {reason}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions Toolbar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#F1F5F9]">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleStatusChange(rel.id, 'ACCEPTED')}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                              isAccepted
                                ? 'bg-emerald-600 text-white'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Accept</span>
                          </button>
                          <button
                            onClick={() => handleStatusChange(rel.id, 'REJECTED')}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                              isRejected
                                ? 'bg-slate-700 text-white'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                          <button
                            onClick={() => handleStatusChange(rel.id, 'IGNORED')}
                            className="px-2.5 py-1.5 text-xs text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer"
                          >
                            Ignore
                          </button>
                        </div>

                        {/* Join Preview Trigger */}
                        <button
                          onClick={() => openJoinPreview(rel)}
                          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                        >
                          <GitMerge className="w-3.5 h-3.5" />
                          <span>Preview Join / Merge</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Join Preview & Apply Modal */}
      {activeJoinRel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#CBD5E1] shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between shrink-0 bg-[#F8FAFC]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center">
                  <GitMerge className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">Safe Dataset Join & Merge</h3>
                  <p className="text-[11px] text-[#64748B]">
                    Simulate join impact before creating a new combined dataset
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveJoinRel(null)}
                className="text-[#94A3B8] hover:text-[#0F172A] p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Join Key Specifier */}
              <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 text-xs flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-blue-900 uppercase">Join Key Condition</div>
                  <div className="font-mono font-bold text-blue-800 mt-0.5 text-xs">
                    {activeJoinRel.source_dataset_name}.{activeJoinRel.source_column} ={' '}
                    {activeJoinRel.target_dataset_name}.{activeJoinRel.target_column}
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                  {activeJoinRel.relationship_type} ({activeJoinRel.cardinality_symbol || '1:N'})
                </span>
              </div>

              {/* Join Type Selector */}
              <div>
                <label className="text-xs font-bold text-[#0F172A] block mb-2">Select Join Type:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'inner', name: 'Inner Join', desc: 'Only rows with matching keys in both' },
                    { id: 'left', name: 'Left Join', desc: 'All left rows + matching right rows' },
                    { id: 'right', name: 'Right Join', desc: 'All right rows + matching left rows' },
                    { id: 'outer', name: 'Full Outer', desc: 'All rows from both datasets' },
                  ].map((jt) => (
                    <button
                      key={jt.id}
                      type="button"
                      onClick={() => handleJoinTypeChange(jt.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        joinType === jt.id
                          ? 'border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] ring-1 ring-[#2563EB]'
                          : 'border-[#E2E8F0] hover:border-[#CBD5E1] bg-white text-[#475569]'
                      }`}
                    >
                      <div className="text-xs font-bold">{jt.name}</div>
                      <div className="text-[10px] mt-0.5 opacity-80">{jt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview Loading / Error / Metrics */}
              {previewLoading && (
                <div className="p-8 text-center bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] space-y-2">
                  <RefreshCw className="w-5 h-5 text-[#2563EB] animate-spin mx-auto" />
                  <p className="text-xs text-[#64748B]">Simulating {joinType.toUpperCase()} join metrics...</p>
                </div>
              )}

              {previewError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                  {previewError}
                </div>
              )}

              {previewData && !previewLoading && (
                <div className="space-y-4">
                  {/* Row Count Impact Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <div className="text-[10px] font-bold text-[#64748B] uppercase">Left Rows</div>
                      <div className="text-base font-bold text-[#0F172A] mt-0.5 font-mono">
                        {previewData.left_total_rows?.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-[#64748B] truncate">{previewData.left_dataset_name}</div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <div className="text-[10px] font-bold text-[#64748B] uppercase">Right Rows</div>
                      <div className="text-base font-bold text-[#0F172A] mt-0.5 font-mono">
                        {previewData.right_total_rows?.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-[#64748B] truncate">{previewData.right_dataset_name}</div>
                    </div>

                    <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200">
                      <div className="text-[10px] font-bold text-emerald-800 uppercase">Estimated Result</div>
                      <div className="text-base font-bold text-emerald-700 mt-0.5 font-mono">
                        {previewData.estimated_resulting_rows?.toLocaleString()} rows
                      </div>
                      <div className="text-[10px] text-emerald-600">{previewData.resulting_columns?.length} columns</div>
                    </div>

                    <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200">
                      <div className="text-[10px] font-bold text-blue-800 uppercase">Matching Keys</div>
                      <div className="text-base font-bold text-blue-700 mt-0.5 font-mono">
                        {previewData.matching_rows_count?.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-blue-600">
                        {previewData.unmatched_left_rows} unmatched left
                      </div>
                    </div>
                  </div>

                  {/* Warnings */}
                  {previewData.warnings?.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-xs text-amber-800">
                      <div className="font-bold flex items-center gap-1.5 text-amber-900">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Join Safeguard Notices:</span>
                      </div>
                      <ul className="list-disc pl-5 text-[11px] space-y-0.5">
                        {previewData.warnings.map((w, idx) => (
                          <li key={idx}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Sample Merged Table Preview */}
                  {previewData.sample_rows?.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-[#475569] uppercase tracking-wider flex items-center justify-between">
                        <span>Resulting Schema & Sample Preview (Top {previewData.sample_rows.length} Rows)</span>
                        <span className="text-[10px] font-normal text-[#64748B]">
                          {previewData.resulting_columns.length} total columns
                        </span>
                      </div>
                      <div className="border border-[#E2E8F0] rounded-xl overflow-x-auto max-h-48">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[10px] text-[#475569] font-bold uppercase sticky top-0">
                            <tr>
                              {previewData.resulting_columns.map((col) => (
                                <th key={col} className="py-1.5 px-2.5 whitespace-nowrap bg-[#F8FAFC]">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E2E8F0]">
                            {previewData.sample_rows.map((row, idx) => (
                              <tr key={idx} className="hover:bg-[#F8FAFC]">
                                {previewData.resulting_columns.map((col) => (
                                  <td
                                    key={col}
                                    className="py-1.5 px-2.5 font-mono text-[11px] text-[#0F172A] whitespace-nowrap"
                                  >
                                    {row[col] !== null && row[col] !== undefined ? (
                                      String(row[col])
                                    ) : (
                                      <span className="text-[#94A3B8]">null</span>
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Custom Dataset Name Input */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#0F172A]">Derived Dataset Name:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="e.g. customers_orders_merged"
                        className="flex-1 px-3 py-2 text-xs border border-[#CBD5E1] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2563EB] font-mono"
                      />
                      <span className="text-xs text-[#64748B] font-mono">.csv</span>
                    </div>
                  </div>

                  {/* Explicit User Confirmation */}
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={confirmCheckbox}
                      onChange={(e) => setConfirmCheckbox(e.target.checked)}
                      className="mt-0.5 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB] w-4 h-4 shrink-0 cursor-pointer"
                    />
                    <span className="text-[#334155] leading-relaxed">
                      <strong className="text-[#0F172A]">Confirm Derived Dataset Creation:</strong> I explicitly confirm
                      the execution of this {joinType.toUpperCase()} join. Both source datasets will remain completely
                      unmodified and preserved on storage disk.
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-[#E2E8F0] flex items-center justify-between shrink-0 bg-[#F8FAFC]">
              <button
                type="button"
                onClick={() => setActiveJoinRel(null)}
                className="px-4 py-2 border border-[#CBD5E1] text-xs font-medium text-[#475569] hover:bg-white rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleApplyJoin}
                disabled={!confirmCheckbox || applyingJoin || !previewData}
                className="flex items-center gap-1.5 px-5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <GitMerge className={`w-3.5 h-3.5 ${applyingJoin ? 'animate-spin' : ''}`} />
                <span>{applyingJoin ? 'Creating Joined Dataset...' : 'Confirm and Apply Join'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ---------------- MODAL 1: VIEW DETAILED COMPARISON ---------------- */}
      {comparisonModalPair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-[#CBD5E1] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between shrink-0 bg-[#F8FAFC]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 border border-blue-200 text-[#2563EB]">
                  <FileSearch className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
                    <span>Detailed Dataset Comparison</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        comparisonModalPair.status === 'EXACT_DUPLICATE'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : comparisonModalPair.status === 'POTENTIAL_DUPLICATE'
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-blue-100 text-blue-800 border-blue-300'
                      }`}
                    >
                      {comparisonModalPair.status_label || comparisonModalPair.status}
                    </span>
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5 font-mono">
                    Pair ID: {comparisonModalPair.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setComparisonModalPair(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Datasets Comparison Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                  <div className="text-[10px] font-bold text-[#64748B] uppercase">Dataset 1</div>
                  <div className="font-bold text-[#0F172A] truncate" title={comparisonModalPair.dataset1_name}>
                    {comparisonModalPair.dataset1_name}
                  </div>
                  <div className="text-[11px] text-[#64748B] font-mono">
                    ID #{comparisonModalPair.dataset1_id} · {comparisonModalPair.dataset1_rows} rows · {comparisonModalPair.dataset1_columns} cols
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                  <div className="text-[10px] font-bold text-[#64748B] uppercase">Dataset 2</div>
                  <div className="font-bold text-[#0F172A] truncate" title={comparisonModalPair.dataset2_name}>
                    {comparisonModalPair.dataset2_name}
                  </div>
                  <div className="text-[11px] text-[#64748B] font-mono">
                    ID #{comparisonModalPair.dataset2_id} · {comparisonModalPair.dataset2_rows} rows · {comparisonModalPair.dataset2_columns} cols
                  </div>
                </div>
              </div>

              {/* Exact Formula & Metrics Breakdown */}
              <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-2 text-blue-900">
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-blue-600" />
                  <span>Overlap Percentage Calculation Method:</span>
                </div>
                <div className="font-mono text-[11px] bg-white p-2.5 rounded-lg border border-blue-200">
                  {comparisonModalPair.calculation_method ||
                    `Overlap % = 2 × Matching Records (${comparisonModalPair.matching_records_count}) / (${comparisonModalPair.dataset1_rows} + ${comparisonModalPair.dataset2_rows}) = ${comparisonModalPair.overlap_pct}%`}
                </div>
                <ul className="list-disc pl-5 text-[11px] space-y-1 text-blue-800">
                  <li>
                    <strong>Safe normalization applied:</strong> Case-insensitive and whitespace-trimmed column matching without altering source cell values.
                  </li>
                  <li>
                    <strong>Multiplicity preservation:</strong> Repeated records must occur with matching frequencies in both datasets to qualify as an Exact Duplicate.
                  </li>
                  <li>
                    <strong>Invariance:</strong> Row ordering and column ordering differences are recognized and safely handled.
                  </li>
                </ul>
              </div>

              {/* Logical Column Mapping */}
              {comparisonModalPair.column_mapping && Object.keys(comparisonModalPair.column_mapping).length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-[#475569] uppercase tracking-wider">
                    Logical Column Alignment ({Object.keys(comparisonModalPair.column_mapping).length} Matched Columns)
                  </div>
                  <div className="border border-[#E2E8F0] rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[10px] text-[#475569] font-bold uppercase sticky top-0">
                        <tr>
                          <th className="py-2 px-3">Dataset 1 Column</th>
                          <th className="py-2 px-3 text-center">↔</th>
                          <th className="py-2 px-3">Dataset 2 Column</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {Object.entries(comparisonModalPair.column_mapping).map(([col1, col2], idx) => (
                          <tr key={idx} className="hover:bg-[#F8FAFC]">
                            <td className="py-1.5 px-3 font-mono text-[11px] text-[#0F172A]">{col1}</td>
                            <td className="py-1.5 px-3 text-center text-slate-400">↔</td>
                            <td className="py-1.5 px-3 font-mono text-[11px] text-[#2563EB]">{col2}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Detected Differences */}
              {comparisonModalPair.differences && comparisonModalPair.differences.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold text-[#475569] uppercase tracking-wider">
                    Detected Differences
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-[11px] text-[#475569]">
                    {comparisonModalPair.differences.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Safety Confirmation Notice */}
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Strict Safeguard:</strong> This comparison is strictly read-only. Datasets are never automatically deleted, overwritten, or modified.
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-[#E2E8F0] flex items-center justify-end shrink-0 bg-[#F8FAFC]">
              <button
                onClick={() => setComparisonModalPair(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close Comparison
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- MODAL 2: PREVIEW DIFFERENCES ---------------- */}
      {differencesModalPair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-[#CBD5E1] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between shrink-0 bg-[#F8FAFC]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-600">
                  <Split className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">
                    Preview Differing Records
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Records unique to each dataset (sample of up to 10 rows shown)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDifferencesModalPair(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Switcher: Dataset 1 vs Dataset 2 */}
            <div className="px-6 pt-3 border-b border-[#E2E8F0] flex items-center gap-3 text-xs bg-slate-50/50">
              <button
                onClick={() => setDifferencesActiveTab(1)}
                className={`pb-2.5 font-semibold transition-colors cursor-pointer border-b-2 ${
                  differencesActiveTab === 1
                    ? 'border-[#2563EB] text-[#2563EB]'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Unique to {differencesModalPair.dataset1_name} ({differencesModalPair.unique_records_dataset1_count} records)
              </button>
              <button
                onClick={() => setDifferencesActiveTab(2)}
                className={`pb-2.5 font-semibold transition-colors cursor-pointer border-b-2 ${
                  differencesActiveTab === 2
                    ? 'border-[#2563EB] text-[#2563EB]'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Unique to {differencesModalPair.dataset2_name} ({differencesModalPair.unique_records_dataset2_count} records)
              </button>
            </div>

            {/* Modal Content Table */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {(() => {
                const rows =
                  differencesActiveTab === 1
                    ? differencesModalPair.sample_differences_dataset1 || []
                    : differencesModalPair.sample_differences_dataset2 || [];

                const count =
                  differencesActiveTab === 1
                    ? differencesModalPair.unique_records_dataset1_count
                    : differencesModalPair.unique_records_dataset2_count;

                if (count === 0 || rows.length === 0) {
                  return (
                    <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl space-y-1.5 text-xs text-[#64748B]">
                      <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
                      <div className="font-bold text-[#0F172A]">No Differing Records</div>
                      <p className="text-[11px]">
                        All records in this dataset are matched in the other dataset.
                      </p>
                    </div>
                  );
                }

                const columns = Object.keys(rows[0] || {});

                return (
                  <div className="space-y-2">
                    <div className="text-[11px] text-[#64748B] flex items-center justify-between">
                      <span>Showing {rows.length} of {count} unique row(s):</span>
                    </div>
                    <div className="border border-[#E2E8F0] rounded-xl overflow-x-auto max-h-64">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[10px] text-[#475569] font-bold uppercase sticky top-0">
                          <tr>
                            <th className="py-2 px-3 bg-[#F8FAFC]">#</th>
                            {columns.map((c) => (
                              <th key={c} className="py-2 px-3 whitespace-nowrap bg-[#F8FAFC]">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]">
                          {rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-[#F8FAFC]">
                              <td className="py-1.5 px-3 text-[10px] text-slate-400 font-mono">
                                {idx + 1}
                              </td>
                              {columns.map((col) => (
                                <td
                                  key={col}
                                  className="py-1.5 px-3 font-mono text-[11px] text-[#0F172A] whitespace-nowrap"
                                >
                                  {row[col] !== null && row[col] !== undefined ? (
                                    String(row[col])
                                  ) : (
                                    <span className="text-slate-400 italic">null</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-[#E2E8F0] flex items-center justify-end shrink-0 bg-[#F8FAFC]">
              <button
                onClick={() => setDifferencesModalPair(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RelationshipManager;
