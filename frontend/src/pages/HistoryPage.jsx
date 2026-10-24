import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Clock,
  RefreshCw,
  Search,
  Trash2,
  MessageSquare,
  BarChart3,
  Calendar,
  Database,
  ArrowRight,
  AlertCircle,
  ChevronDown,
  X,
  Sparkles,
} from 'lucide-react';
import { datasetService } from '../services/datasetService';
import { analysisService } from '../services/analysisService';
import { extractErrorMessage } from '../services/api';

export const HistoryPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Datasets state
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [loadingDatasets, setLoadingDatasets] = useState(true);

  // History state
  const [historyItems, setHistoryItems] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [confirmClearModal, setConfirmClearModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Fetch user datasets
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
        }
      } catch (err) {
        setHistoryError(extractErrorMessage(err));
      } finally {
        setLoadingDatasets(false);
      }
    };
    fetchDatasets();
  }, [searchParams]);

  // 2. Fetch history entries
  const fetchHistory = async () => {
    setLoadingHistory(true);
    setHistoryError('');
    try {
      const response = await analysisService.getHistory(selectedDatasetId || null, 100);
      setHistoryItems(response?.history || []);
    } catch (err) {
      setHistoryError(extractErrorMessage(err));
      setHistoryItems([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [selectedDatasetId]);

  // Format date helper
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // Delete single history item
  const handleDeleteItem = async (historyId) => {
    setDeletingId(historyId);
    try {
      await analysisService.deleteHistoryItem(historyId);
      setHistoryItems((prev) => prev.filter((item) => item.id !== historyId));
    } catch (err) {
      setHistoryError(extractErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  // Clear all history
  const handleClearHistory = async () => {
    setIsClearing(true);
    try {
      await analysisService.clearHistory(selectedDatasetId || null);
      setHistoryItems([]);
      setConfirmClearModal(false);
    } catch (err) {
      setHistoryError(extractErrorMessage(err));
    } finally {
      setIsClearing(false);
    }
  };

  // Re-run query in Data Analyst
  const handleRerunQuery = (item) => {
    const dsId = item.dataset_id || selectedDatasetId;
    if (dsId) {
      localStorage.setItem('selected_dataset_id', String(dsId));
      navigate(`/data-analyst?dataset_id=${dsId}&q=${encodeURIComponent(item.query)}`);
    } else {
      navigate(`/data-analyst?q=${encodeURIComponent(item.query)}`);
    }
  };

  // Filtered history list
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return historyItems;
    const q = searchQuery.toLowerCase();
    return historyItems.filter((item) => {
      const matchesQuery = item.query?.toLowerCase().includes(q);
      const matchesAnswer = item.answer_preview?.toLowerCase().includes(q);
      const matchesDsName = item.dataset_name?.toLowerCase().includes(q);
      const matchesType = item.analysis_type?.toLowerCase().includes(q);
      return matchesQuery || matchesAnswer || matchesDsName || matchesType;
    });
  }, [historyItems, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-[#EFF6FF] text-[#2563EB]">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#0F172A]">Analysis History</h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                Audit trail of questions asked, autonomous queries, and historical insights.
              </p>
            </div>
          </div>
        </div>

        {/* Filter Controls & Bulk Action */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Dataset Filter Dropdown */}
          <div className="relative min-w-[220px]">
            <select
              value={selectedDatasetId || ''}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value, 10) : null;
                setSelectedDatasetId(val);
                if (val) {
                  setSearchParams({ dataset_id: val }, { replace: true });
                } else {
                  setSearchParams({}, { replace: true });
                }
              }}
              disabled={loadingDatasets}
              className="w-full appearance-none bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3.5 py-2 pr-9 text-xs font-semibold text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 cursor-pointer disabled:opacity-50"
            >
              <option value="">All Datasets (Global)</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.original_filename || d.filename} (#{d.id})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-[#64748B] absolute right-3 top-2.5 pointer-events-none" />
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchHistory}
            disabled={loadingHistory}
            className="p-2 border border-[#CBD5E1] rounded-xl hover:bg-[#F8FAFC] text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh History"
          >
            <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin text-[#2563EB]' : ''}`} />
          </button>

          {/* Clear History Button */}
          {historyItems.length > 0 && (
            <button
              onClick={() => setConfirmClearModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 rounded-xl transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {historyError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{historyError}</span>
          </div>
          <button
            onClick={fetchHistory}
            className="px-3 py-1 bg-white border border-red-300 rounded-lg text-red-700 hover:bg-red-50 font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Search Bar */}
      {!loadingHistory && historyItems.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-white border border-[#E2E8F0] rounded-xl px-4 py-2.5 shadow-xs">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#94A3B8]" />
            <input
              type="text"
              placeholder="Search previous questions, answers, or dataset names..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none w-full bg-transparent"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-[#94A3B8] hover:text-[#0F172A]">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="text-xs text-[#64748B] font-medium">
            Showing {filteredHistory.length} of {historyItems.length} records
          </div>
        </div>
      )}

      {/* Loading State */}
      {loadingHistory && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-16 text-center shadow-xs">
          <RefreshCw className="w-8 h-8 text-[#2563EB] animate-spin mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-[#0F172A]">Loading query history...</h3>
          <p className="text-xs text-[#64748B] mt-1">Retrieving your analysis audit trail.</p>
        </div>
      )}

      {/* Empty State */}
      {!loadingHistory && historyItems.length === 0 && !historyError && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-16 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center mx-auto mb-4">
            <Clock className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#0F172A]">No Execution History</h3>
          <p className="text-xs text-[#64748B] max-w-sm mx-auto mt-2 leading-relaxed">
            Questions asked to the AI Data Analyst, generated SQL queries, and calculated answers will appear here.
          </p>
          <button
            onClick={() => navigate('/data-analyst')}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Go to AI Data Analyst</span>
          </button>
        </div>
      )}

      {/* History Items List */}
      {!loadingHistory && filteredHistory.length > 0 && (
        <div className="space-y-3">
          {filteredHistory.map((item) => (
            <div
              key={item.id}
              className="bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] rounded-2xl p-5 shadow-xs transition-all space-y-3"
            >
              {/* Card Header: Question & Metadata */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <div className="p-2 rounded-xl bg-[#EFF6FF] text-[#2563EB] shrink-0 mt-0.5">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#0F172A] leading-snug">
                      {item.query}
                    </h3>

                    {/* Metadata tags */}
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
                      {item.dataset_name && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F1F5F9] text-[#475569] font-medium border border-[#E2E8F0]">
                          <Database className="w-3 h-3 text-[#64748B]" />
                          <span>{item.dataset_name}</span>
                        </span>
                      )}

                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-medium border border-blue-200 uppercase tracking-wider text-[10px]">
                        {item.analysis_type || 'General'}
                      </span>

                      {item.has_chart && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium border border-emerald-200 text-[10px]">
                          <BarChart3 className="w-3 h-3" />
                          <span>Visualization</span>
                        </span>
                      )}

                      <span className="text-[#94A3B8] flex items-center gap-1 ml-1">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(item.created_at)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <button
                    onClick={() => handleRerunQuery(item)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#2563EB] text-xs font-semibold rounded-xl border border-[#BFDBFE] transition-colors cursor-pointer"
                    title="Open query in Data Analyst"
                  >
                    <span>Ask Again</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    disabled={deletingId === item.id}
                    className="p-1.5 text-[#94A3B8] hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    title="Delete item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Answer Preview */}
              {item.answer_preview && (
                <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#334155] leading-relaxed">
                  <div className="font-semibold text-[#0F172A] mb-1 flex items-center gap-1.5 text-[11px]">
                    <Sparkles className="w-3 h-3 text-[#2563EB]" />
                    <span>Answer Summary:</span>
                  </div>
                  <p>{item.answer_preview}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Confirmation Modal for Clearing History */}
      {confirmClearModal && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-[#E2E8F0] shadow-xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-bold text-[#0F172A]">Clear Analysis History?</h3>
              <p className="text-xs text-[#64748B] mt-1">
                {selectedDatasetId
                  ? 'This will permanently remove all question history for the currently selected dataset.'
                  : 'This will permanently remove all analytical query history across all your datasets.'}
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmClearModal(false)}
                className="px-4 py-2 border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-xl text-xs font-semibold text-[#0F172A] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleClearHistory}
                disabled={isClearing}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {isClearing ? 'Clearing...' : 'Yes, Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
