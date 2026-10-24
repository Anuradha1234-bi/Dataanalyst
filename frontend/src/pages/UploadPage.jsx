import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  UploadCloud,
  FileSpreadsheet,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  X,
  RefreshCw,
  ScanSearch,
  Filter,
  Brain,
  ChevronRight,
  Database,
  Columns,
  Table,
  Check,
  FileText,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { datasetService } from '../services/datasetService';
import { extractErrorMessage } from '../services/api';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

export const UploadPage = () => {
  const [fileList, setFileList] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [generalError, setGeneralError] = useState('');
  const [uploadSummary, setUploadSummary] = useState(null);

  // Dataset preview states
  const [uploadedDatasets, setUploadedDatasets] = useState([]);
  const [selectedPreviewIndex, setSelectedPreviewIndex] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const validateFile = (file) => {
    const ext = `.${file.name.split('.').pop().toLowerCase()}`;
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return 'This file type is not supported. Supported formats: CSV, XLSX, XLS.';
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return 'The file is too large. Maximum allowed size is 50 MB.';
    }
    if (file.size === 0) {
      return 'The file is empty (0 bytes). Please provide a file with data.';
    }
    return null;
  };

  const handleAddFiles = (newRawFiles) => {
    setGeneralError('');
    setUploadSummary(null);

    const newEntries = Array.from(newRawFiles).map((file) => {
      const validationError = validateFile(file);
      return {
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        name: file.name,
        size: file.size,
        status: validationError ? 'error' : 'pending',
        error: validationError,
      };
    });

    setFileList((prev) => [...prev, ...newEntries]);
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleAddFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAddFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (id) => {
    setFileList((prev) => prev.filter((item) => item.id !== id));
  };

  const clearAll = () => {
    setFileList([]);
    setGeneralError('');
    setUploadSummary(null);
    setUploadedDatasets([]);
    setSelectedPreviewIndex(0);
    setPreviewError('');
  };

  const handleUploadAll = async () => {
    setGeneralError('');
    setUploadSummary(null);
    // Invalidate prior preview data to prevent stale preview presentation
    setUploadedDatasets([]);
    setSelectedPreviewIndex(0);
    setPreviewError('');

    // Filter valid files that are not yet uploaded
    const filesToUpload = fileList.filter(
      (item) => item.status === 'pending' || (item.status === 'error' && !validateFile(item.file))
    );

    if (filesToUpload.length === 0) {
      setGeneralError('No valid files ready for upload. Please add CSV, XLSX, or XLS files.');
      return;
    }

    // Set status to uploading for selected files
    setFileList((prev) =>
      prev.map((item) =>
        filesToUpload.some((target) => target.id === item.id)
          ? { ...item, status: 'uploading', error: null }
          : item
      )
    );

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const rawFiles = filesToUpload.map((item) => item.file);
      const res = await datasetService.uploadDatasets(rawFiles, (percent) => {
        setUploadProgress(percent);
      });

      const uploadedNames = new Set(
        (res.uploaded || []).map((d) => d.original_filename || d.filename)
      );
      const failedMap = new Map();
      (res.failed || []).forEach((f) => {
        failedMap.set(f.filename, f.error);
      });

      // Update item statuses based on server response
      setFileList((prev) =>
        prev.map((item) => {
          if (uploadedNames.has(item.name)) {
            return { ...item, status: 'uploaded', error: null };
          }
          if (failedMap.has(item.name)) {
            return {
              ...item,
              status: 'error',
              error: failedMap.get(item.name) || 'Unable to upload the file.',
            };
          }
          return item;
        })
      );

      setUploadSummary({
        totalUploaded: res.total_uploaded || (res.uploaded ? res.uploaded.length : 0),
        totalFailed: res.total_failed || (res.failed ? res.failed.length : 0),
      });

      // Process uploaded datasets for preview
      if (res.uploaded && res.uploaded.length > 0) {
        setUploadedDatasets(res.uploaded);
        setSelectedPreviewIndex(0);

        // Check if preview rows are already included in response
        const firstDataset = res.uploaded[0];
        if (!firstDataset.preview_rows && firstDataset.id) {
          // Fallback to fetch preview explicitly if backend response did not attach them
          setPreviewLoading(true);
          try {
            const previewData = await datasetService.getDatasetPreview(firstDataset.id);
            setUploadedDatasets((prev) =>
              prev.map((d) => (d.id === firstDataset.id ? { ...d, ...previewData } : d))
            );
          } catch (pErr) {
            setPreviewError('Unable to load dataset preview records.');
          } finally {
            setPreviewLoading(false);
          }
        }
      }
    } catch (err) {
      const friendlyMsg = extractErrorMessage(err);
      setGeneralError(friendlyMsg);
      // Revert uploading status to error on failure
      setFileList((prev) =>
        prev.map((item) =>
          item.status === 'uploading'
            ? { ...item, status: 'error', error: friendlyMsg }
            : item
        )
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleSelectPreviewDataset = async (index) => {
    setSelectedPreviewIndex(index);
    const target = uploadedDatasets[index];
    if (target && !target.preview_rows && target.id) {
      setPreviewLoading(true);
      setPreviewError('');
      try {
        const previewData = await datasetService.getDatasetPreview(target.id);
        setUploadedDatasets((prev) =>
          prev.map((d, i) => (i === index ? { ...d, ...previewData } : d))
        );
      } catch (err) {
        setPreviewError('Unable to load preview for this dataset.');
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  const hasPending = fileList.some((item) => item.status === 'pending');
  const activeDataset = uploadedDatasets[selectedPreviewIndex] || null;

  // Resolve preview rows, columns, and missing values safely
  const previewRows = activeDataset?.preview_rows || [];
  const previewColumns =
    activeDataset?.column_names && activeDataset.column_names.length > 0
      ? activeDataset.column_names
      : previewRows.length > 0
      ? Object.keys(previewRows[0])
      : [];

  const totalMissingCells = activeDataset?.total_missing_cells ?? null;
  const missingColumnsList = activeDataset?.missing_columns || [];
  const totalCells =
    activeDataset && activeDataset.rows && activeDataset.columns
      ? activeDataset.rows * activeDataset.columns
      : 0;
  const missingPercentage =
    totalMissingCells !== null && totalCells > 0
      ? ((totalMissingCells / totalCells) * 100).toFixed(2)
      : null;

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#111827] dark:text-white">
            Upload Dataset
          </h1>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
            Ingest tabular datasets securely into your private analytics environment.
          </p>
        </div>
        <Link
          to="/datasets"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#059669] hover:text-[#047857] dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline transition-colors shrink-0"
        >
          <span>View My Datasets</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* 2. Compact Project Workflow Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Upload Dataset (Active / Completed) */}
        <div
          className={`relative p-3.5 rounded-2xl border transition-all ${
            uploadedDatasets.length > 0
              ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60 shadow-xs'
              : 'bg-white dark:bg-slate-900 border-[#059669]/40 dark:border-emerald-700/60 shadow-xs ring-1 ring-[#059669]/10'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div
              className={`p-2 rounded-xl shrink-0 ${
                uploadedDatasets.length > 0
                  ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-[#059669] dark:text-emerald-400'
              }`}
            >
              {uploadedDatasets.length > 0 ? (
                <Check className="w-4 h-4" />
              ) : (
                <UploadCloud className="w-4 h-4" />
              )}
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                uploadedDatasets.length > 0
                  ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                  : 'bg-emerald-100 dark:bg-emerald-950 text-[#059669] dark:text-emerald-300'
              }`}
            >
              {uploadedDatasets.length > 0 ? 'Completed' : 'Current Step'}
            </span>
          </div>
          <div className="mt-2.5">
            <h3 className="text-xs font-bold text-[#26334A] dark:text-slate-200">
              1. Upload Dataset
            </h3>
            <p className="text-[11px] text-[#6B7890] dark:text-slate-400 mt-0.5 leading-snug">
              Upload CSV, XLSX, or XLS files.
            </p>
          </div>
          <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-slate-300 dark:text-slate-700 pointer-events-none">
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>

        {/* Card 2: Data Profiling */}
        <div className="relative p-3.5 rounded-2xl border border-[#DFE7F2] dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all">
          <div className="flex items-start justify-between gap-2">
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
              <ScanSearch className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              Step 2
            </span>
          </div>
          <div className="mt-2.5">
            <h3 className="text-xs font-bold text-[#26334A] dark:text-slate-200">
              2. Data Profiling
            </h3>
            <p className="text-[11px] text-[#6B7890] dark:text-slate-400 mt-0.5 leading-snug">
              Inspect rows, columns, data types, and missing values.
            </p>
          </div>
          <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-slate-300 dark:text-slate-700 pointer-events-none">
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>

        {/* Card 3: Data Cleaning */}
        <div className="relative p-3.5 rounded-2xl border border-[#DFE7F2] dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all">
          <div className="flex items-start justify-between gap-2">
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
              <Filter className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              Step 3
            </span>
          </div>
          <div className="mt-2.5">
            <h3 className="text-xs font-bold text-[#26334A] dark:text-slate-200">
              3. Data Cleaning
            </h3>
            <p className="text-[11px] text-[#6B7890] dark:text-slate-400 mt-0.5 leading-snug">
              Handle missing values, duplicates, and supported cleaning operations.
            </p>
          </div>
          <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-slate-300 dark:text-slate-700 pointer-events-none">
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>

        {/* Card 4: AI Data Analysis */}
        <div className="p-3.5 rounded-2xl border border-[#DFE7F2] dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all">
          <div className="flex items-start justify-between gap-2">
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
              <Brain className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              Step 4
            </span>
          </div>
          <div className="mt-2.5">
            <h3 className="text-xs font-bold text-[#26334A] dark:text-slate-200">
              4. AI Data Analysis
            </h3>
            <p className="text-[11px] text-[#6B7890] dark:text-slate-400 mt-0.5 leading-snug">
              Discover trends, comparisons, and analytical insights.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Supported File Format Graphics & Size Limit */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-[#DFE7F2] dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#26334A] dark:text-slate-200">
            Supported File Formats:
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[#294C9B] dark:text-blue-300 text-[11px] font-semibold">
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#4778E8]" />
              <span>CSV</span>
              <span className="text-[10px] text-blue-500 font-normal">(.csv)</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300 text-[11px] font-semibold">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>XLSX</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">
                (.xlsx)
              </span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-300 text-[11px] font-semibold">
              <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600" />
              <span>XLS</span>
              <span className="text-[10px] text-teal-600 dark:text-teal-400 font-normal">
                (.xls)
              </span>
            </span>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium">
          <Database className="w-3.5 h-3.5 text-slate-500" />
          <span>Maximum size:</span>
          <strong className="text-[#26334A] dark:text-slate-100 font-bold">50 MB</strong>
          <span className="text-[10px] text-slate-500">per file</span>
        </div>
      </div>

      {/* General Error Banner */}
      {generalError && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
          <span>{generalError}</span>
        </div>
      )}

      {/* Upload Success Summary Banner */}
      {uploadSummary && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
            uploadSummary.totalFailed === 0
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200'
              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2
              className={`w-4 h-4 shrink-0 ${
                uploadSummary.totalFailed === 0 ? 'text-emerald-600' : 'text-amber-600'
              }`}
            />
            <span>
              {uploadSummary.totalUploaded}{' '}
              {uploadSummary.totalUploaded === 1 ? 'dataset' : 'datasets'} uploaded successfully.
              {uploadSummary.totalFailed > 0 &&
                ` (${uploadSummary.totalFailed} file failed to process)`}
            </span>
          </div>
          <button
            onClick={() => navigate('/datasets')}
            className="px-3.5 py-1.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            Go to My Datasets
          </button>
        </div>
      )}

      {/* Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-3xl p-10 text-center transition-all ${
          isDragging
            ? 'border-[#059669] bg-emerald-50/20 dark:bg-emerald-950/20 shadow-md scale-[1.01]'
            : 'border-[#E2E8F0] dark:border-slate-800 bg-gradient-to-b from-emerald-50/20 to-white dark:from-slate-900/60 dark:to-slate-900 hover:border-[#059669] shadow-xs'
        }`}
      >
        <div className="inline-flex p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-[#059669] dark:text-emerald-400 mb-3 shadow-xs">
          <UploadCloud className="w-8 h-8" />
        </div>
        <h3 className="text-sm font-bold text-[#111827] dark:text-slate-200">
          Drag & drop your CSV or Excel files here
        </h3>
        <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">or</p>

        <div className="mt-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,.xlsx,.xls"
            onChange={handleFileInputChange}
            className="hidden"
            id="dataset-file-input"
            disabled={isUploading}
          />
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold rounded-xl shadow-xs hover:shadow transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Browse Files
          </button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-6 text-[11px] text-[#64748B] dark:text-slate-400">
          <span>
            Supported: <strong className="text-[#111827] dark:text-slate-300">CSV, XLSX, XLS</strong>
          </span>
          <span>•</span>
          <span>
            Maximum size: <strong className="text-[#111827] dark:text-slate-300">50 MB</strong> per file
          </span>
        </div>
      </div>

      {/* Selected Files Section */}
      {fileList.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0] dark:border-slate-800">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#0F172A] dark:text-slate-100">
                Selected Files
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-[#EFF6FF] dark:bg-blue-950 text-[#2563EB] dark:text-blue-300 text-[11px] font-semibold">
                {fileList.length}
              </span>
            </div>
            <button
              onClick={clearAll}
              disabled={isUploading}
              className="text-xs text-[#64748B] hover:text-red-600 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Clear All
            </button>
          </div>

          {/* Progress bar when uploading */}
          {isUploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-[#64748B] dark:text-slate-400">
                <span>Uploading datasets to secure storage...</span>
                <span className="font-semibold text-[#2563EB] dark:text-blue-400">
                  {uploadProgress}%
                </span>
              </div>
              <div className="w-full bg-[#E2E8F0] dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#2563EB] h-2 transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* File Rows */}
          <div className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
            {fileList.map((item) => (
              <div
                key={item.id}
                className="py-3 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`p-2 rounded-lg shrink-0 ${
                      item.status === 'uploaded'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                        : item.status === 'error'
                        ? 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400'
                        : 'bg-[#EFF6FF] dark:bg-blue-950/60 text-[#2563EB] dark:text-blue-400'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#0F172A] dark:text-slate-100 truncate">
                      {item.name}
                    </div>
                    <div className="text-[11px] text-[#64748B] dark:text-slate-400">
                      {formatFileSize(item.size)}
                    </div>
                    {item.error && (
                      <div className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{item.error}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Status Badges */}
                  {item.status === 'uploading' && (
                    <div className="flex items-center gap-1.5 text-xs text-[#2563EB] dark:text-blue-400">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Uploading...</span>
                    </div>
                  )}

                  {item.status === 'uploaded' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-medium border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Uploaded</span>
                    </span>
                  )}

                  {item.status === 'error' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-xs font-medium border border-red-200 dark:border-red-800">
                      <X className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                      <span>Failed</span>
                    </span>
                  )}

                  {/* Remove Button */}
                  {!isUploading && (
                    <button
                      onClick={() => removeFile(item.id)}
                      className="p-1.5 text-[#94A3B8] hover:text-red-600 transition-colors cursor-pointer"
                      title="Remove file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-4 py-2.5 border border-[#CBD5E1] dark:border-slate-700 hover:bg-[#F8FAFC] dark:hover:bg-slate-800 text-[#0F172A] dark:text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-60"
            >
              Add more files
            </button>

            <button
              type="button"
              onClick={handleUploadAll}
              disabled={isUploading || (!hasPending && !fileList.some((f) => f.status === 'error'))}
              className="px-6 py-2.5 bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <span>Upload All Files</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 4, 5, 6. Dataset Preview & Summary Cards Section (Rendered upon successful upload) */}
      {uploadedDatasets.length > 0 && activeDataset && (
        <div className="bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-6 animate-in fade-in duration-300">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#E2E8F0] dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
                <h2 className="text-base font-bold text-[#0F172A] dark:text-slate-100">
                  Dataset Preview & Metadata
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold uppercase">
                  Uploaded
                </span>
              </div>
              <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
                Verified tabular schema and actual record preview from backend ingestion.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <Link
                to={`/profiling?dataset=${activeDataset.id}`}
                className="px-3 py-1.5 bg-[#EFF6FF] dark:bg-blue-950/60 hover:bg-[#DBEAFE] dark:hover:bg-blue-900/60 text-[#2563EB] dark:text-blue-300 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5"
              >
                <ScanSearch className="w-3.5 h-3.5" />
                <span>Profile Dataset</span>
              </Link>
              <Link
                to={`/data-cleaning?dataset=${activeDataset.id}`}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Clean Dataset</span>
              </Link>
            </div>
          </div>

          {/* Dataset Tabs (if multiple datasets were uploaded) */}
          {uploadedDatasets.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs text-slate-500 font-medium shrink-0">
                Uploaded Files:
              </span>
              {uploadedDatasets.map((d, idx) => (
                <button
                  key={d.id || idx}
                  onClick={() => handleSelectPreviewDataset(idx)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    selectedPreviewIndex === idx
                      ? 'bg-[#2563EB] text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[150px]">
                    {d.filename || d.original_filename}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Active Dataset Identity Banner */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-50/50 via-slate-50/50 to-white dark:from-slate-800/40 dark:via-slate-800/20 dark:to-slate-900 border border-[#DFE7F2] dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-950/80 text-[#294C9B] dark:text-blue-300 shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[#0F172A] dark:text-slate-100 truncate">
                  {activeDataset.filename || activeDataset.original_filename}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    Format: {activeDataset.file_type?.toUpperCase() || 'CSV'}
                  </span>
                  <span>•</span>
                  <span>
                    Size: {formatFileSize(activeDataset.file_size_bytes || activeDataset.file_size)}
                  </span>
                </div>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Parsed & Stored</span>
            </span>
          </div>

          {/* 5. Dataset Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Total Rows */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-medium">Total Rows</span>
                <Table className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <div className="text-lg font-bold text-[#0F172A] dark:text-slate-100 mt-1">
                {activeDataset.rows !== undefined && activeDataset.rows !== null
                  ? activeDataset.rows.toLocaleString()
                  : '0'}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                Observed records
              </div>
            </div>

            {/* Total Columns */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-medium">Total Columns</span>
                <Columns className="w-3.5 h-3.5 text-indigo-500" />
              </div>
              <div className="text-lg font-bold text-[#0F172A] dark:text-slate-100 mt-1">
                {activeDataset.columns !== undefined && activeDataset.columns !== null
                  ? activeDataset.columns.toLocaleString()
                  : '0'}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                Features detected
              </div>
            </div>

            {/* Missing Values */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-medium">Missing Values</span>
                <AlertTriangle
                  className={`w-3.5 h-3.5 ${
                    totalMissingCells && totalMissingCells > 0 ? 'text-amber-500' : 'text-emerald-500'
                  }`}
                />
              </div>
              <div className="text-lg font-bold text-[#0F172A] dark:text-slate-100 mt-1 flex items-baseline gap-1.5">
                {totalMissingCells !== null ? (
                  <>
                    <span>{totalMissingCells.toLocaleString()}</span>
                    {missingPercentage !== null && (
                      <span
                        className={`text-xs font-semibold ${
                          totalMissingCells > 0
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        ({missingPercentage}%)
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-slate-400 text-sm font-normal">N/A</span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                {totalMissingCells === 0 ? 'Zero missing cells' : 'Unfilled cells'}
              </div>
            </div>

            {/* File Format & Size */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                <span className="text-[11px] font-medium">File Format</span>
                <FileText className="w-3.5 h-3.5 text-teal-500" />
              </div>
              <div className="text-lg font-bold text-[#0F172A] dark:text-slate-100 mt-1">
                {activeDataset.file_type?.toUpperCase() || 'CSV'}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                {formatFileSize(activeDataset.file_size_bytes || activeDataset.file_size)}
              </div>
            </div>
          </div>

          {/* 6C. Missing Values Graphical Representation (if reliable profiling data is available) */}
          {missingColumnsList && missingColumnsList.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <h3 className="text-xs font-bold text-amber-950 dark:text-amber-200">
                    Missing Values by Column (Actual Profiling)
                  </h3>
                </div>
                <span className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                  {missingColumnsList.length}{' '}
                  {missingColumnsList.length === 1 ? 'column affected' : 'columns affected'}
                </span>
              </div>

              {/* Graphical horizontal bar chart */}
              <div className="space-y-2 pt-1">
                {missingColumnsList.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700 dark:text-slate-200 font-mono truncate max-w-xs">
                        {item.column}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 font-medium">
                        {item.missing_count} missing ({item.missing_percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-amber-500 dark:bg-amber-400 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(Math.max(item.missing_percentage, 4), 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {missingColumnsList.length > 5 && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 text-right pt-0.5">
                    + {missingColumnsList.length - 5} more columns with missing values
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 6C. Positive Data Hygiene Card (when 0 missing values detected) */}
          {totalMissingCells === 0 && (
            <div className="p-3.5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/50 flex items-center justify-between gap-3 text-xs text-emerald-900 dark:text-emerald-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  <strong>Data Hygiene:</strong> 100% complete dataset — zero missing cells detected across all columns.
                </span>
              </div>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                Optimal Quality
              </span>
            </div>
          )}

          {/* Preview Loading State */}
          {previewLoading && (
            <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-[#2563EB]" />
              <span>Fetching dataset preview records...</span>
            </div>
          )}

          {/* Preview Error State */}
          {previewError && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{previewError}</span>
            </div>
          )}

          {/* 4. First 5 Rows Table Preview */}
          {!previewLoading && previewRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Table className="w-4 h-4 text-[#2563EB]" />
                  <h3 className="text-xs font-bold text-[#0F172A] dark:text-slate-100">
                    First 5 Rows Preview
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    ({Math.min(previewRows.length, 5)} of {activeDataset.rows || previewRows.length} rows)
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Original schema & column ordering preserved
                </span>
              </div>

              {/* Table Container with Horizontal Scrolling */}
              <div className="border border-[#E2E8F0] dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xs">
                <div className="overflow-x-auto max-h-[380px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#EAF3FF] dark:bg-slate-800/80 sticky top-0 z-10 border-b border-[#DFE7F2] dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-3 font-bold text-[#294C9B] dark:text-blue-300 text-[11px] w-12 text-center border-r border-[#DFE7F2] dark:border-slate-700">
                          #
                        </th>
                        {previewColumns.map((col, idx) => (
                          <th
                            key={idx}
                            className="py-2.5 px-3 font-bold text-[#294C9B] dark:text-blue-300 text-[11px] whitespace-nowrap"
                          >
                            <span title={String(col)} className="truncate inline-block max-w-[200px]">
                              {String(col)}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                      {previewRows.slice(0, 5).map((row, rowIdx) => (
                        <tr
                          key={rowIdx}
                          className="hover:bg-[#F7FAFF] dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-2 px-3 text-[11px] text-slate-400 font-mono text-center border-r border-[#E2E8F0] dark:border-slate-800">
                            {rowIdx + 1}
                          </td>
                          {previewColumns.map((col, colIdx) => {
                            const val = row[col];
                            const isNull = val === null || val === undefined || val === '';
                            return (
                              <td
                                key={colIdx}
                                className="py-2 px-3 text-[11px] text-[#26334A] dark:text-slate-300 whitespace-nowrap max-w-xs truncate"
                                title={!isNull ? String(val) : 'Missing value (null)'}
                              >
                                {isNull ? (
                                  <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 font-medium">
                                    null
                                  </span>
                                ) : typeof val === 'boolean' ? (
                                  <span className="font-mono text-blue-600 dark:text-blue-400">
                                    {String(val)}
                                  </span>
                                ) : (
                                  String(val)
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Empty State (Valid Dataset with 0 Data Rows) */}
          {!previewLoading && previewRows.length === 0 && (
            <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-2">
              <Info className="w-5 h-5 text-slate-400 mx-auto" />
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Zero Data Rows Detected
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                The file schema was read successfully with{' '}
                <strong>{activeDataset.columns || previewColumns.length} columns</strong>, but no
                data records were found in the dataset.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UploadPage;
