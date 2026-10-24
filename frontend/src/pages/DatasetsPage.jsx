import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Database,
  Plus,
  Download,
  Trash2,
  ExternalLink,
  FileSpreadsheet,
  AlertCircle,
  Calendar,
  Layers,
  Search,
  X,
  RefreshCw,
  Hash,
  Columns,
  FileSearch,
  ShieldCheck,
  CheckSquare,
  Square,
  Activity,
  BarChart3,
} from 'lucide-react';
import { datasetService } from '../services/datasetService';
import { extractErrorMessage } from '../services/api';

export const DatasetsPage = () => {
  const [datasets, setDatasets] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const navigate = useNavigate();

  const fetchDatasets = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await datasetService.getDatasets();
      setDatasets(data || []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDatasets();
  }, []);

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

  const handleDownload = async (dataset) => {
    setDownloadingId(dataset.id);
    try {
      await datasetService.downloadDataset(
        dataset.id,
        dataset.original_filename || dataset.filename
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (datasetId) => {
    setDeletingId(datasetId);
    try {
      await datasetService.deleteDataset(datasetId);
      setDatasets((prev) => prev.filter((d) => d.id !== datasetId));
      if (selectedDataset?.id === datasetId) {
        setSelectedDataset(null);
      }
      setConfirmDeleteId(null);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  };

  const filteredDatasets = datasets.filter((d) => {
    const name = d.original_filename || d.filename || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((dId) => dId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredDatasets.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredDatasets.map((d) => d.id));
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#111827] dark:text-white">My Datasets</h1>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
            Manage your uploaded tabular files, inspect schema metadata, and export data.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/upload')}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold rounded-xl shadow-xs hover:shadow transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Dataset</span>
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError('')}
            className="text-red-500 hover:text-red-700 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search and Filters Bar (when datasets exist) */}
      {!isLoading && datasets.length > 0 && (
        <div className="flex items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-xl px-4 py-2.5 shadow-xs">
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <Search className="w-4 h-4 text-[#94A3B8]" />
            <input
              type="text"
              placeholder="Search datasets by filename..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs text-[#111827] dark:text-white placeholder-[#94A3B8] focus:outline-none w-full bg-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-[#94A3B8] hover:text-[#111827] dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="text-xs font-medium text-[#64748B] dark:text-slate-400">
            Showing {filteredDatasets.length} of {datasets.length} {datasets.length === 1 ? 'dataset' : 'datasets'}
          </div>
        </div>
      )}

      {/* Multi-Selection Bulk Action Banner */}
      {!isLoading && selectedIds.length > 0 && (
        <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900/60 rounded-xl px-4 py-2.5 flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#064E3B] dark:text-emerald-300">
            <CheckSquare className="w-4 h-4 text-[#059669]" />
            <span>{selectedIds.length} dataset{selectedIds.length > 1 ? 's' : ''} selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/profiling?dataset_ids=${selectedIds.join(',')}`)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold rounded-lg shadow-2xs cursor-pointer transition-colors"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Analyze Together ({selectedIds.length})</span>
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-[#64748B] hover:text-[#111827] dark:hover:text-white px-2 py-1 cursor-pointer font-medium"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-16 text-center shadow-xs">
          <RefreshCw className="w-8 h-8 text-[#059669] animate-spin mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-[#111827] dark:text-white">Loading datasets...</h3>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">Retrieving your private dataset repository</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && datasets.length === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-14 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-[#059669] flex items-center justify-center mx-auto mb-4">
            <Database className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#111827] dark:text-white">No datasets yet.</h3>
          <p className="text-xs text-[#64748B] dark:text-slate-400 max-w-md mx-auto mt-2 leading-relaxed">
            Upload your first CSV or Excel file to start analyzing your data.
          </p>
          <button
            onClick={() => navigate('/upload')}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Dataset</span>
          </button>
        </div>
      )}

      {/* Datasets Table */}
      {!isLoading && datasets.length > 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] uppercase tracking-wider font-semibold text-[11px]">
                <tr>
                  <th className="px-4 py-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredDatasets.length > 0 && selectedIds.length === filteredDatasets.length}
                      onChange={handleSelectAll}
                      className="rounded text-[#2563EB] focus:ring-[#2563EB]/20 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3.5">Filename</th>
                  <th className="px-4 py-3.5">File Type</th>
                  <th className="px-4 py-3.5">Dimensions</th>
                  <th className="px-4 py-3.5">File Size</th>
                  <th className="px-4 py-3.5">Uploaded Date</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-[#0F172A]">
                {filteredDatasets.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-8 text-center text-xs text-[#64748B]">
                      No datasets matching "{searchQuery}"
                    </td>
                  </tr>
                ) : (
                  filteredDatasets.map((dataset) => {
                    const fname = dataset.original_filename || dataset.filename;
                    const ftype = (dataset.file_type || '').toUpperCase();
                    const rowCount = dataset.row_count ?? dataset.rows ?? 0;
                    const colCount = dataset.column_count ?? dataset.columns ?? 0;
                    const fsize = dataset.file_size ?? dataset.file_size_bytes ?? 0;

                    return (
                      <tr
                        key={dataset.id}
                        className="hover:bg-[#F8FAFC] transition-colors group"
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-4 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(dataset.id)}
                            onChange={() => handleToggleSelect(dataset.id)}
                            className="rounded text-[#2563EB] focus:ring-[#2563EB]/20 cursor-pointer"
                          />
                        </td>
                        {/* Filename */}
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-[#EFF6FF] text-[#2563EB] shrink-0">
                              <FileSpreadsheet className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div
                                onClick={() => setSelectedDataset(dataset)}
                                className="font-semibold text-xs text-[#0F172A] hover:text-[#2563EB] cursor-pointer truncate max-w-xs"
                                title={fname}
                              >
                                {fname}
                              </div>
                              <div className="text-[11px] text-[#94A3B8]">
                                ID: #{dataset.id}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* File Type */}
                        <td className="px-4 py-4">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                              ftype === 'CSV'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : ftype === 'XLSX'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            }`}
                          >
                            {ftype}
                          </span>
                        </td>

                        {/* Dimensions */}
                        <td className="px-4 py-4 whitespace-nowrap text-[#64748B]">
                          <span className="font-semibold text-[#0F172A]">
                            {rowCount.toLocaleString()}
                          </span>{' '}
                          rows ·{' '}
                          <span className="font-semibold text-[#0F172A]">
                            {colCount}
                          </span>{' '}
                          cols
                        </td>

                        {/* File Size */}
                        <td className="px-4 py-4 whitespace-nowrap text-[#64748B]">
                          {formatFileSize(fsize)}
                        </td>

                        {/* Uploaded Date */}
                        <td className="px-4 py-4 whitespace-nowrap text-[#64748B]">
                          {formatDate(dataset.created_at)}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Open */}
                            <button
                              onClick={() => setSelectedDataset(dataset)}
                              className="px-2.5 py-1 text-xs font-semibold text-[#2563EB] hover:bg-[#EFF6FF] rounded-lg transition-colors cursor-pointer"
                              title="View details"
                            >
                              Open
                            </button>

                            <button
                              onClick={() => {
                                localStorage.setItem('selected_dataset_id', String(dataset.id));
                                navigate(`/profiling?dataset_id=${dataset.id}`);
                              }}
                              className="px-2 py-1 text-xs font-semibold text-[#16A34A] hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                              title="Profile dataset"
                            >
                              <FileSearch className="w-3.5 h-3.5" />
                              <span>Profile</span>
                            </button>

                            {/* Quality */}
                            <button
                              onClick={() => {
                                localStorage.setItem('selected_dataset_id', String(dataset.id));
                                navigate(`/data-quality?dataset_id=${dataset.id}`);
                              }}
                              className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer"
                              title="Analyze data quality"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Quality</span>
                            </button>

                            {/* Visualize */}
                            <button
                              onClick={() => {
                                localStorage.setItem('selected_dataset_id', String(dataset.id));
                                navigate(`/visualize?dataset_id=${dataset.id}`);
                              }}
                              className="px-2 py-1 text-xs font-semibold text-[#7C3AED] hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                              title="Visualize dataset"
                            >
                              <BarChart3 className="w-3.5 h-3.5" />
                              <span>Visualize</span>
                            </button>

                            {/* Download */}
                            <button
                              onClick={() => handleDownload(dataset)}
                              disabled={downloadingId === dataset.id}
                              className="p-1.5 text-[#64748B] hover:text-[#2563EB] hover:bg-[#EFF6FF] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              title="Download dataset"
                            >
                              {downloadingId === dataset.id ? (
                                <RefreshCw className="w-4 h-4 animate-spin text-[#2563EB]" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                            </button>

                            {/* Delete with inline confirmation */}
                            {confirmDeleteId === dataset.id ? (
                              <div className="inline-flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200">
                                <span className="text-[10px] text-red-700 font-semibold px-1">
                                  Confirm?
                                </span>
                                <button
                                  onClick={() => handleDelete(dataset.id)}
                                  disabled={deletingId === dataset.id}
                                  className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-semibold cursor-pointer disabled:opacity-60"
                                >
                                  {deletingId === dataset.id ? '...' : 'Yes'}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-1.5 py-0.5 text-gray-600 hover:text-black text-[10px] cursor-pointer"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(dataset.id)}
                                className="p-1.5 text-[#94A3B8] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete dataset"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
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

      {/* Dataset Details Modal */}
      {selectedDataset && (
        <div className="fixed inset-0 z-50 bg-[#0F172A]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-[#E2E8F0] shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#EFF6FF] text-[#2563EB]">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A] truncate max-w-xs">
                    {selectedDataset.original_filename || selectedDataset.filename}
                  </h3>
                  <span className="text-[11px] text-[#64748B]">Dataset Details</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedDataset(null)}
                className="p-1.5 text-[#94A3B8] hover:text-[#0F172A] rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
                    <Hash className="w-3.5 h-3.5" />
                    <span>Row Count</span>
                  </div>
                  <div className="mt-1 text-base font-bold text-[#0F172A]">
                    {(selectedDataset.row_count ?? selectedDataset.rows ?? 0).toLocaleString()}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
                    <Columns className="w-3.5 h-3.5" />
                    <span>Column Count</span>
                  </div>
                  <div className="mt-1 text-base font-bold text-[#0F172A]">
                    {selectedDataset.column_count ?? selectedDataset.columns ?? 0}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Format & Size</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-[#0F172A]">
                    {(selectedDataset.file_type || '').toUpperCase()} ·{' '}
                    {formatFileSize(selectedDataset.file_size ?? selectedDataset.file_size_bytes)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Uploaded</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-[#0F172A] truncate">
                    {formatDate(selectedDataset.created_at)}
                  </div>
                </div>
              </div>

              {/* Column Names if available */}
              {selectedDataset.column_names && selectedDataset.column_names.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-[#0F172A] mb-2">
                    Column Schema ({selectedDataset.column_names.length})
                  </h4>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    {selectedDataset.column_names.map((col, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md bg-white border border-[#CBD5E1] text-[11px] text-[#334155] font-mono"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-between">
              <button
                onClick={() => {
                  const id = selectedDataset.id;
                  handleDelete(id);
                }}
                disabled={deletingId === selectedDataset.id}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(selectedDataset)}
                  disabled={downloadingId === selectedDataset.id}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-[#CBD5E1] hover:bg-[#F1F5F9] text-xs font-semibold text-[#0F172A] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem('selected_dataset_id', String(selectedDataset.id));
                    navigate(`/profiling?dataset_id=${selectedDataset.id}`);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-xs font-semibold text-[#2563EB] rounded-lg transition-colors cursor-pointer border border-[#BFDBFE]"
                >
                  <FileSearch className="w-3.5 h-3.5" />
                  <span>Profile Dataset</span>
                </button>
                <button
                  onClick={() => {
                    localStorage.setItem('selected_dataset_id', String(selectedDataset.id));
                    navigate(`/visualize?dataset_id=${selectedDataset.id}`);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-xs font-semibold text-[#7C3AED] dark:text-purple-300 rounded-lg transition-colors cursor-pointer border border-purple-200 dark:border-purple-800"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Visualize</span>
                </button>
                <button
                  onClick={() => setSelectedDataset(null)}
                  className="px-4 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatasetsPage;
