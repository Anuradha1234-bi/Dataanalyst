import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  BrainCircuit,
  Database,
  Calendar,
  Layers,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Download,
  UploadCloud,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  Play,
  Clock,
  Trash2,
  HelpCircle,
  Eye,
  Sliders,
  ExternalLink,
  Target,
  BarChart,
  Grid,
} from 'lucide-react';

import { datasetService } from '../services/datasetService';
import { predictionService } from '../services/predictionService';
import { extractErrorMessage } from '../services/api';
import { AnalyticalChart } from '../components/AnalyticalChart';

export const PredictionPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Datasets State
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const analysisReqIdRef = useRef(0);
  const runsReqIdRef = useRef(0);

  // Candidate Models Catalog
  const [modelCatalog, setModelCatalog] = useState([]);

  // Pre-flight Analysis State
  const [analysisData, setAnalysisData] = useState(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  // Configuration Form State
  const [taskMode, setTaskMode] = useState('auto'); // auto, regression, classification, forecasting
  const [operationMode, setOperationMode] = useState('auto'); // auto, manual
  const [targetColumn, setTargetColumn] = useState('');
  const [dateColumn, setDateColumn] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [excludedFeatures, setExcludedFeatures] = useState([]);
  const [forecastHorizon, setForecastHorizon] = useState(7);
  const [testSize, setTestSize] = useState(0.20);
  const [excludeAnomalies, setExcludeAnomalies] = useState(false);

  // Training & Execution State
  const [training, setTraining] = useState(false);
  const [trainingStage, setTrainingStage] = useState('');
  const [currentRun, setCurrentRun] = useState(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // History State
  const [runsHistory, setRunsHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Active Main Tab
  const [activeTab, setActiveTab] = useState('studio'); // studio, results, infer, history

  // Results Pagination & Search
  const [predSearch, setPredSearch] = useState('');
  const [predPage, setPredPage] = useState(1);
  const pageSize = 10;

  // New Data Prediction State
  const [inferFile, setInferFile] = useState(null);
  const [inferLoading, setInferLoading] = useState(false);
  const [inferResult, setInferResult] = useState(null);
  const [inferError, setInferError] = useState('');

  // 1. Initial Load: Fetch Datasets & Model Catalog
  useEffect(() => {
    const initData = async () => {
      setLoadingDatasets(true);
      setError('');
      try {
        const [dsData, catData] = await Promise.all([
          datasetService.getDatasets(),
          predictionService.getCandidateModels().catch(() => []),
        ]);
        const list = dsData || [];
        setDatasets(list);
        setModelCatalog(catData || []);

        const queryId = searchParams.get('dataset_id') || searchParams.get('id');
        const savedId = localStorage.getItem('selected_dataset_id');

        if (queryId && list.some((d) => String(d.id) === String(queryId))) {
          setSelectedDatasetId(Number(queryId));
        } else if (savedId && list.some((d) => String(d.id) === String(savedId))) {
          setSelectedDatasetId(Number(savedId));
        } else if (list.length > 0) {
          setSelectedDatasetId(Number(list[0].id));
        }
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoadingDatasets(false);
      }
    };

    initData();
  }, []);

  // 2. Fetch Pre-flight Analysis whenever Dataset or Key Target settings change
  useEffect(() => {
    if (!selectedDatasetId) {
      setAnalysisData(null);
      return;
    }

    localStorage.setItem('selected_dataset_id', String(selectedDatasetId));
    setSearchParams({ dataset_id: selectedDatasetId }, { replace: true });
    
    // If a run is already active and belongs to this dataset, preserve its configured target/mode
    if (currentRun && currentRun.dataset_id === selectedDatasetId) {
      fetchAnalysis(selectedDatasetId, currentRun.target_column, currentRun.date_column, currentRun.mode);
    } else {
      fetchAnalysis(selectedDatasetId, '', '', taskMode);
    }
    fetchRuns(selectedDatasetId);
  }, [selectedDatasetId]);

  const fetchAnalysis = async (dsId, target = null, date = null, mode = 'auto') => {
    const reqId = ++analysisReqIdRef.current;
    setLoadingAnalysis(true);
    setError('');
    try {
      const data = await predictionService.analyzeDataset({
        dataset_id: dsId,
        target_column: target || undefined,
        date_column: date || undefined,
        mode: mode || 'auto',
      });
      if (reqId !== analysisReqIdRef.current) return;
      setAnalysisData(data);

      // Auto-populate target if not explicitly selected or if adapting to new mode
      if (!target) {
        if (data.recommended_target) {
          setTargetColumn(data.recommended_target);
        }
      } else {
        setTargetColumn(target);
      }

      if (!date) {
        if (data.recommended_date_column) {
          setDateColumn(data.recommended_date_column);
        }
      } else {
        setDateColumn(date);
      }

      // Initialize selected features: select non-leaking, non-identifier, non-duplicate features
      const curTarget = target || data.recommended_target;
      const curDate = date || data.recommended_date_column;
      const usableCols = data.columns_summary
        .filter(
          (c) =>
            c.name !== curTarget &&
            c.name !== curDate &&
            c.role !== 'constant' &&
            c.role !== 'identifier' &&
            c.role !== 'duplicate' &&
            c.role !== 'leakage' &&
            !c.leakage_risk
        )
        .map((c) => c.name);
      setSelectedFeatures(usableCols);
      setExcludedFeatures([]);
    } catch (err) {
      if (reqId === analysisReqIdRef.current) {
        setError(extractErrorMessage(err));
      }
    } finally {
      if (reqId === analysisReqIdRef.current) {
        setLoadingAnalysis(false);
      }
    }
  };

  const fetchRuns = async (dsId) => {
    const reqId = ++runsReqIdRef.current;
    setLoadingHistory(true);
    try {
      const runs = await predictionService.getRuns(dsId);
      if (reqId !== runsReqIdRef.current) return;
      setRunsHistory(runs || []);
    } catch {
      // Non-critical background fetch failure
    } finally {
      if (reqId === runsReqIdRef.current) {
        setLoadingHistory(false);
      }
    }
  };

  // Switch selected dataset cleanly without stale selections
  const handleDatasetChange = (newId) => {
    const idNum = Number(newId);
    setSelectedDatasetId(idNum);
    setTargetColumn('');
    setDateColumn('');
    setSelectedFeatures([]);
    setExcludedFeatures([]);
    setCurrentRun(null);
    setAnalysisData(null);
    setError('');
    setSuccessMessage('');
    setInferResult(null);
    setInferError('');
    setActiveTab('studio');
  };

  // Task Mode change trigger
  const handleTaskModeChange = (newMode) => {
    setTaskMode(newMode);
    setError('');
    setSuccessMessage('');
    if (selectedDatasetId) {
      let targetForMode = null;
      if (newMode === 'regression' && analysisData?.target_candidates) {
        const regTarget = analysisData.target_candidates.find((tc) => tc.problem_type === 'regression');
        if (regTarget) targetForMode = regTarget.column;
      } else if (newMode === 'classification' && analysisData?.target_candidates) {
        const clsTarget = analysisData.target_candidates.find((tc) => tc.problem_type.includes('classification') && tc.score >= 0.3);
        if (clsTarget) targetForMode = clsTarget.column;
      } else if (newMode === 'forecasting' && analysisData?.target_candidates) {
        const fcTarget = analysisData.target_candidates.find((tc) => tc.problem_type === 'regression');
        if (fcTarget) targetForMode = fcTarget.column;
      }
      setTargetColumn(targetForMode || '');
      fetchAnalysis(selectedDatasetId, targetForMode, dateColumn, newMode);
    }
  };

  // Target change trigger
  const handleTargetChange = (newTarget) => {
    setTargetColumn(newTarget);
    if (selectedDatasetId) {
      fetchAnalysis(selectedDatasetId, newTarget, dateColumn, taskMode);
    }
  };

  // Toggle Feature Selection
  const toggleFeature = (colName) => {
    if (selectedFeatures.includes(colName)) {
      setSelectedFeatures(selectedFeatures.filter((f) => f !== colName));
      setExcludedFeatures([...new Set([...excludedFeatures, colName])]);
    } else {
      setSelectedFeatures([...selectedFeatures, colName]);
      setExcludedFeatures(excludedFeatures.filter((f) => f !== colName));
    }
  };

  // Bulk Feature Actions
  const handleSelectAllFeatures = () => {
    if (!analysisData) return;
    const all = analysisData.columns_summary
      .filter((c) => c.name !== targetColumn && c.name !== dateColumn)
      .map((c) => c.name);
    setSelectedFeatures(all);
    setExcludedFeatures([]);
  };

  const handleExcludeLeakageOnly = () => {
    if (!analysisData) return;
    const nonLeaking = analysisData.columns_summary
      .filter((c) => c.name !== targetColumn && c.name !== dateColumn && !c.leakage_risk)
      .map((c) => c.name);
    const leaking = analysisData.columns_summary
      .filter((c) => c.leakage_risk)
      .map((c) => c.name);
    setSelectedFeatures(nonLeaking);
    setExcludedFeatures(leaking);
  };

  // Filter compatible candidate models for manual mode
  const compatibleModels = useMemo(() => {
    if (!analysisData || !modelCatalog.length) return [];
    const effectiveProblem =
      taskMode !== 'auto'
        ? taskMode === 'forecasting'
          ? 'time_series_forecast'
          : taskMode
        : analysisData.recommended_problem_type;

    return modelCatalog.filter((m) =>
      m.supported_problems.some((sp) => sp.toLowerCase().includes(effectiveProblem?.toLowerCase() || ''))
    );
  }, [analysisData, modelCatalog, taskMode]);

  // Execute Training
  const handleTrainModel = async () => {
    if (!selectedDatasetId || !targetColumn) {
      setError('Please select an uploaded dataset and a target column.');
      return;
    }

    if (taskMode === 'forecasting' && !dateColumn) {
      setError('Time-series forecasting requires selecting a valid date/time column.');
      return;
    }

    setTraining(true);
    setTrainingStage('Validating dataset partitions and checking data leakage safeguards...');
    setError('');
    setSuccessMessage('');

    try {
      const payload = {
        dataset_id: selectedDatasetId,
        target_column: targetColumn,
        date_column: dateColumn || undefined,
        mode: taskMode,
        candidate_model: operationMode === 'manual' ? selectedModelId || undefined : undefined,
        selected_features: selectedFeatures.length > 0 ? selectedFeatures : undefined,
        excluded_features: excludedFeatures.length > 0 ? excludedFeatures : undefined,
        forecast_horizon: Number(forecastHorizon),
        test_size: Number(testSize),
        exclude_anomalies: excludeAnomalies,
      };

      setTrainingStage('Training candidate models on empirical validation partitions...');
      const runResult = await predictionService.trainModel(payload);
      setCurrentRun(runResult);
      setActiveTab('results');
      setSuccessMessage(`Successfully trained ${runResult.selected_model}! Validation evaluation complete.`);
      fetchRuns(selectedDatasetId);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setTraining(false);
      setTrainingStage('');
    }
  };

  // Load Past Run
  const handleLoadRun = async (runId) => {
    setError('');
    try {
      const detail = await predictionService.getRunDetail(runId);
      setCurrentRun(detail);
      if (detail.dataset_id) {
        if (detail.dataset_id !== selectedDatasetId) {
          setSelectedDatasetId(detail.dataset_id);
          localStorage.setItem('selected_dataset_id', String(detail.dataset_id));
          setSearchParams({ dataset_id: detail.dataset_id }, { replace: true });
        }
        fetchAnalysis(detail.dataset_id, detail.target_column, detail.date_column, detail.mode);
        fetchRuns(detail.dataset_id);
      }
      setActiveTab('results');
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  // Delete Past Run
  const handleDeleteRun = async (runId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this prediction run?')) return;
    try {
      await predictionService.deleteRun(runId);
      if (currentRun?.run_id === runId) {
        setCurrentRun(null);
      }
      fetchRuns(selectedDatasetId);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  // Download Handlers
  const handleDownloadCsv = async () => {
    if (!currentRun) return;
    try {
      await predictionService.downloadPredictionsCsv(currentRun.run_id);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleDownloadReport = async () => {
    if (!currentRun) return;
    try {
      await predictionService.downloadEvaluationReport(currentRun.run_id);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  // Predict on New Data
  const handleInferSubmit = async (e) => {
    e.preventDefault();
    if (!currentRun || !inferFile) return;

    setInferLoading(true);
    setInferError('');
    setInferResult(null);

    try {
      const res = await predictionService.predictNewData(currentRun.run_id, inferFile);
      setInferResult(res);
    } catch (err) {
      setInferError(extractErrorMessage(err));
    } finally {
      setInferLoading(false);
    }
  };

  // Selected Dataset metadata
  const selectedDataset = useMemo(
    () => datasets.find((d) => d.id === selectedDatasetId),
    [datasets, selectedDatasetId]
  );

  // Paginated Predictions
  const filteredPredictions = useMemo(() => {
    if (!currentRun?.predictions) return [];
    if (!predSearch.trim()) return currentRun.predictions;
    const q = predSearch.toLowerCase();
    return currentRun.predictions.filter(
      (p) =>
        String(p.index_or_date).toLowerCase().includes(q) ||
        String(p.predicted_value).toLowerCase().includes(q) ||
        (p.actual_value !== null && String(p.actual_value).toLowerCase().includes(q))
    );
  }, [currentRun, predSearch]);

  const totalPredPages = Math.ceil(filteredPredictions.length / pageSize) || 1;
  const currentPredSlice = filteredPredictions.slice((predPage - 1) * pageSize, predPage * pageSize);

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">
              Predictive Modeling & Forecasting
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#2563EB]/10 text-[#2563EB] border border-[#2563EB]/20">
              PRODUCTION ML
            </span>
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            Automated task recommendation (Regression, Classification, Time-Series Forecasting), data leakage prevention, empirical validation metrics, and versioned artifact deployment.
          </p>
        </div>

        {/* Action Controls & Navigation Tabs */}
        <div className="flex items-center gap-2">
          <div className="bg-white border border-[#E2E8F0] p-1 rounded-xl flex items-center shadow-2xs">
            <button
              onClick={() => setActiveTab('studio')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'studio'
                  ? 'bg-[#2563EB] text-white shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              Model Studio
            </button>
            <button
              onClick={() => setActiveTab('results')}
              disabled={!currentRun}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'results'
                  ? 'bg-[#2563EB] text-white shadow-xs'
                  : currentRun
                  ? 'text-[#64748B] hover:text-[#0F172A]'
                  : 'text-[#CBD5E1] cursor-not-allowed'
              }`}
            >
              Evaluation Results
            </button>
            <button
              onClick={() => setActiveTab('infer')}
              disabled={!currentRun}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'infer'
                  ? 'bg-[#2563EB] text-white shadow-xs'
                  : currentRun
                  ? 'text-[#64748B] hover:text-[#0F172A]'
                  : 'text-[#CBD5E1] cursor-not-allowed'
              }`}
            >
              Predict New Data
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-[#2563EB] text-white shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              History ({runsHistory.length})
            </button>
          </div>
        </div>
      </div>

      {/* Dataset Selector Card */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center shrink-0">
              <Database className="w-5 h-5 text-[#2563EB]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                Active Dataset Source
              </div>
              <div className="flex items-center gap-2 mt-0.5 min-w-0">
                <select
                  value={selectedDatasetId || ''}
                  onChange={(e) => handleDatasetChange(e.target.value)}
                  disabled={loadingDatasets || training}
                  className="text-sm font-bold text-[#0F172A] bg-transparent border-none focus:outline-hidden cursor-pointer w-full max-w-[220px] sm:max-w-xs md:max-w-md truncate"
                >
                  {datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.filename} ({d.rows?.toLocaleString()} rows × {d.columns} cols)
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-[#64748B] pointer-events-none shrink-0" />
              </div>
            </div>
          </div>

          {selectedDataset && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="px-2.5 py-1 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[11px] text-[#475569] font-medium">
                Format: <span className="font-bold text-[#0F172A] uppercase">{selectedDataset.file_type}</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[11px] text-[#475569] font-medium">
                Total Rows: <span className="font-bold text-[#0F172A]">{selectedDataset.rows?.toLocaleString()}</span>
              </div>
              <div className="px-2.5 py-1 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[11px] text-[#475569] font-medium">
                Features: <span className="font-bold text-[#0F172A]">{selectedDataset.columns}</span>
              </div>
              {selectedDataset.has_cleaned && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Cleaned Pipeline
                </span>
              )}
              <button
                onClick={() => fetchAnalysis(selectedDatasetId, targetColumn, dateColumn, taskMode)}
                disabled={loadingAnalysis}
                className="p-1.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] border border-[#E2E8F0] cursor-pointer"
                title="Refresh pre-flight analysis"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingAnalysis ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2 shadow-2xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Error:</span> {error}
          </div>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700 font-bold ml-2">
            ×
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2 shadow-2xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
          <div className="flex-1 font-medium">{successMessage}</div>
          <button onClick={() => setSuccessMessage('')} className="text-emerald-500 hover:text-emerald-700 font-bold ml-2">
            ×
          </button>
        </div>
      )}

      {/* ---------------- TAB 1: MODEL STUDIO ---------------- */}
      {activeTab === 'studio' && (
        <div className="space-y-6">
          {/* Pre-flight Diagnostic Notice */}
          {analysisData?.suitability && (
            <div
              className={`p-4 rounded-2xl border text-xs flex flex-col gap-3 ${
                !analysisData.suitability.is_suitable
                  ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                  : analysisData.suitability.has_leakage
                  ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                  : 'bg-blue-50/50 border-blue-200 text-blue-900'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  {!analysisData.suitability.is_suitable ? (
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  ) : analysisData.suitability.has_leakage ? (
                    <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold flex items-center gap-2">
                      <span>
                        Dataset Diagnostics:{' '}
                        {analysisData.suitability.is_suitable ? 'Ready for Training' : 'Preconditions Not Met'}
                      </span>
                      <span className="px-2 py-0.2 rounded-full text-[10px] uppercase font-semibold bg-white/70 border border-current">
                        Task: {analysisData.recommended_problem_type}
                      </span>
                    </div>
                    <p className="mt-0.5 opacity-90">
                      {analysisData.suitability.usable_rows?.toLocaleString()} usable rows across{' '}
                      {analysisData.suitability.features_count} candidate predictors.
                      {analysisData.suitability.has_leakage && (
                        <span className="font-semibold text-amber-700 ml-1">
                          Data leakage detected: {Object.keys(analysisData.suitability.flagged_leakage_features).length} column(s) will be automatically intercepted.
                        </span>
                      )}
                    </p>

                    {!analysisData.suitability.is_suitable && analysisData.suitability.reasons?.length > 0 && (
                      <div className="mt-2 space-y-1 bg-white/90 border border-rose-200 p-2.5 rounded-xl text-rose-800">
                        <span className="font-bold block text-[11px]">Actionable Diagnostics:</span>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                          {analysisData.suitability.reasons.map((r, idx) => (
                            <li key={idx}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!analysisData.suitability.is_suitable &&
                    targetColumn !== 'annual_income_inr' &&
                    analysisData.target_candidates?.some((tc) => tc.column === 'annual_income_inr') && (
                      <button
                        onClick={() => {
                          handleTargetChange('annual_income_inr');
                          setTaskMode('regression');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs cursor-pointer shadow-2xs"
                      >
                        Switch to Regression (annual_income_inr)
                      </button>
                    )}
                  {analysisData.suitability.has_leakage && (
                    <button
                      onClick={handleExcludeLeakageOnly}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shrink-0 cursor-pointer shadow-2xs"
                    >
                      Apply Leakage Safeguards
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Configuration Panel Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1: Task & Target Setup */}
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-[#F1F5F9] pb-3">
                <Target className="w-4 h-4 text-[#2563EB]" />
                <h3 className="text-sm font-bold text-[#0F172A]">1. Task & Target Definition</h3>
              </div>

              {/* Task Selector Pills */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#475569]">Prediction Task Type</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'auto', label: 'Auto (Recommended)' },
                    { id: 'regression', label: 'Regression' },
                    { id: 'classification', label: 'Classification' },
                    { id: 'forecasting', label: 'Time-Series' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleTaskModeChange(t.id)}
                      className={`py-2 px-2.5 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer ${
                        taskMode === t.id
                          ? 'bg-[#2563EB] text-white border-[#2563EB] shadow-2xs font-semibold'
                          : 'bg-[#F8FAFC] text-[#475569] border-[#E2E8F0] hover:bg-[#F1F5F9]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Column Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#475569]">Target Column</label>
                <select
                  value={targetColumn}
                  onChange={(e) => handleTargetChange(e.target.value)}
                  className="w-full text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#0F172A] focus:outline-hidden focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]"
                >
                  <option value="">Select target column...</option>
                  {analysisData?.target_candidates?.map((tc) => (
                    <option key={tc.column} value={tc.column}>
                      {tc.column} ({tc.problem_type}, Score: {Math.round(tc.score * 100)}%)
                    </option>
                  ))}
                  {/* Fallback to any other column */}
                  {analysisData?.columns_summary
                    ?.filter((c) => !analysisData.target_candidates?.some((tc) => tc.column === c.name))
                    .map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.role})
                      </option>
                    ))}
                </select>
                {analysisData?.target_candidates?.find((tc) => tc.column === targetColumn)?.reasons && (
                  <p className="text-[11px] text-[#64748B] italic">
                    Reason: {analysisData.target_candidates.find((tc) => tc.column === targetColumn).reasons[0]}
                  </p>
                )}
              </div>

              {/* Date Column (Forecasting specific) */}
              {(taskMode === 'forecasting' ||
                analysisData?.recommended_problem_type?.includes('time_series')) && (
                <div className="space-y-1.5 p-3 rounded-xl bg-blue-50/40 border border-blue-100">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-blue-900 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#2563EB]" /> Date/Time Column
                    </label>
                    <span className="text-[10px] font-bold text-[#2563EB] uppercase">Required for TS</span>
                  </div>
                  <select
                    value={dateColumn}
                    onChange={(e) => setDateColumn(e.target.value)}
                    className="w-full text-xs font-semibold bg-white border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#0F172A] focus:outline-hidden"
                  >
                    <option value="">Select date column...</option>
                    {analysisData?.date_candidates?.map((dc) => (
                      <option key={dc.column} value={dc.column}>
                        {dc.column} ({dc.frequency || 'inferred'}, {dc.valid_count} valid dates)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Column 2: Algorithm Mode & Parameters */}
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-[#F1F5F9] pb-3">
                <BrainCircuit className="w-4 h-4 text-[#2563EB]" />
                <h3 className="text-sm font-bold text-[#0F172A]">2. Model Selection & Tuning</h3>
              </div>

              {/* Mode Toggle */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#475569]">Model Selection Mode</label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-[#F1F5F9] rounded-xl">
                  <button
                    type="button"
                    onClick={() => setOperationMode('auto')}
                    className={`py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      operationMode === 'auto'
                        ? 'bg-white text-[#0F172A] shadow-xs'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    Automatic (AutoML)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOperationMode('manual')}
                    className={`py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      operationMode === 'manual'
                        ? 'bg-white text-[#0F172A] shadow-xs'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    Manual Selection
                  </button>
                </div>
              </div>

              {/* Candidate Model (Manual Mode) */}
              {operationMode === 'manual' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#475569]">Candidate Algorithm</label>
                  <select
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="w-full text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-2 text-[#0F172A] focus:outline-hidden"
                  >
                    <option value="">Select candidate model...</option>
                    {compatibleModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.is_baseline ? '(Baseline)' : ''}
                      </option>
                    ))}
                  </select>
                  {selectedModelId && (
                    <p className="text-[11px] text-[#64748B]">
                      {compatibleModels.find((m) => m.id === selectedModelId)?.description}
                    </p>
                  )}
                </div>
              )}

              {/* Validation Split Ratio */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-[#475569]">
                  <span>Validation Split Ratio</span>
                  <span className="text-[#2563EB]">{Math.round(testSize * 100)}% Holdout</span>
                </div>
                <input
                  type="range"
                  min="0.10"
                  max="0.40"
                  step="0.05"
                  value={testSize}
                  onChange={(e) => setTestSize(parseFloat(e.target.value))}
                  className="w-full accent-[#2563EB] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#94A3B8]">
                  <span>10% (More training)</span>
                  <span>40% (Stricter validation)</span>
                </div>
              </div>

              {/* Forecast Horizon (when relevant) */}
              {(taskMode === 'forecasting' ||
                analysisData?.recommended_problem_type?.includes('time_series')) && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-[#475569]">
                    <span>Forecast Horizon</span>
                    <span className="text-[#2563EB]">{forecastHorizon} steps ahead</span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={forecastHorizon}
                    onChange={(e) => setForecastHorizon(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full text-xs font-semibold bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3 py-1.5 text-[#0F172A]"
                  />
                </div>
              )}

              {/* Exclude Anomalies Checkbox */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[#334155]">
                  <input
                    type="checkbox"
                    checked={excludeAnomalies}
                    onChange={(e) => setExcludeAnomalies(e.target.checked)}
                    className="rounded text-[#2563EB] focus:ring-[#2563EB] w-4 h-4 cursor-pointer"
                  />
                  <span>Exclude flagged Phase 4 anomalies before fitting</span>
                </label>
              </div>
            </div>

            {/* Column 3: Features & Leakage Guardian */}
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#2563EB]" />
                    <h3 className="text-sm font-bold text-[#0F172A]">3. Predictor Features</h3>
                  </div>
                  <span className="text-[11px] font-bold text-[#2563EB]">
                    {selectedFeatures.length} selected
                  </span>
                </div>

                <div className="flex items-center justify-between mt-2 mb-2 text-[11px]">
                  <button
                    onClick={handleSelectAllFeatures}
                    className="text-[#2563EB] hover:underline font-semibold cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setSelectedFeatures([])}
                    className="text-[#64748B] hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>

                {/* Features Scrollable List */}
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 border border-[#F1F5F9] rounded-xl p-2 bg-[#F8FAFC]">
                  {analysisData?.columns_summary
                    ?.filter((c) => c.name !== targetColumn && c.name !== dateColumn)
                    .map((col) => {
                      const isSelected = selectedFeatures.includes(col.name);
                      const isLeaking = !!col.leakage_risk;

                      return (
                        <div
                          key={col.name}
                          onClick={() => toggleFeature(col.name)}
                          className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer border transition-all ${
                            isSelected
                              ? 'bg-white border-[#BFDBFE] shadow-2xs'
                              : 'bg-transparent border-transparent hover:bg-slate-100 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded text-[#2563EB] pointer-events-none"
                            />
                            <span className="font-semibold text-[#0F172A] truncate" title={col.name}>
                              {col.name}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {isLeaking ? (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 flex items-center gap-0.5"
                                title={col.leakage_risk}
                              >
                                <ShieldAlert className="w-2.5 h-2.5" /> Leakage
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 text-slate-600">
                                {col.role}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Train Trigger Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleTrainModel}
                  disabled={
                    training ||
                    !targetColumn ||
                    (taskMode !== 'forecasting' && selectedFeatures.length === 0) ||
                    (analysisData?.suitability && !analysisData.suitability.is_suitable)
                  }
                  className="w-full py-3 px-4 rounded-xl font-bold text-xs text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-slate-300 disabled:cursor-not-allowed shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {training ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{trainingStage || 'Training Predictive Pipeline...'}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" />
                      <span>Train & Evaluate Models</span>
                    </>
                  )}
                </button>
                {analysisData?.suitability && !analysisData.suitability.is_suitable && (
                  <p className="text-[11px] text-rose-600 font-medium text-center mt-1">
                    Preconditions not met for current target/task. Review diagnostics above.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 2: EVALUATION RESULTS ---------------- */}
      {activeTab === 'results' && currentRun && (
        <div className="space-y-6">
          {/* Results Header Card */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[#0F172A]">{currentRun.selected_model}</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-50 text-[#2563EB] border border-blue-200">
                    {currentRun.task_type}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    Trained on: {currentRun.dataset_name} (Dataset #{currentRun.dataset_id})
                  </span>
                </div>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Selected via: <span className="font-semibold text-[#0F172A]">{currentRun.selection_metric}</span> •{' '}
                  {currentRun.train_rows?.toLocaleString()} train observations, {currentRun.validation_rows?.toLocaleString()} holdout samples
                </p>
              </div>
            </div>

            {/* Export Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadCsv}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-[#CBD5E1] text-[#0F172A] hover:bg-[#F8FAFC] flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5 text-[#2563EB]" /> Export CSV
              </button>
              <button
                onClick={handleDownloadReport}
                className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] text-white flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <FileText className="w-3.5 h-3.5" /> Full Model Report (.md)
              </button>
            </div>
          </div>

          {/* Dataset Mismatch Alert */}
          {selectedDataset && currentRun.dataset_id !== selectedDataset.id && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Active dropdown selection is <strong>{selectedDataset.filename}</strong>, but this evaluation report is for <strong>{currentRun.dataset_name}</strong> (Dataset #{currentRun.dataset_id}, Run #{currentRun.run_id}).
                </span>
              </div>
              <button
                onClick={() => handleDatasetChange(currentRun.dataset_id)}
                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] transition cursor-pointer shrink-0"
              >
                Switch to {currentRun.dataset_name}
              </button>
            </div>
          )}

          {/* Primary Metric Score Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(currentRun.metrics || {})
              .filter(([k]) => k !== 'confusion_matrix')
              .slice(0, 4)
              .map(([key, val]) => (
                <div key={key} className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-xs">
                  <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">
                    {key}
                  </div>
                  <div className="text-xl font-bold text-[#0F172A] mt-1">
                    {typeof val === 'number' ? val.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(val)}
                  </div>
                  <div className="text-[10px] text-[#94A3B8] mt-1 truncate">
                    {key === 'mae' && 'Average absolute difference on holdout'}
                    {key === 'rmse' && 'Root mean squared error'}
                    {key === 'r2' && 'Variance explained by predictors'}
                    {key === 'f1' && 'Harmonic mean of precision & recall'}
                    {key === 'accuracy' && 'Ratio of correct class predictions'}
                    {key === 'smape' && 'Symmetric % error on holdout'}
                  </div>
                </div>
              ))}
          </div>

          {/* Model Comparison Leaderboard Table */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
              <div className="flex items-center gap-2">
                <BarChart className="w-4 h-4 text-[#2563EB]" />
                <h3 className="text-sm font-bold text-[#0F172A]">Candidate Model Comparison (Holdout Split)</h3>
              </div>
              <span className="text-[11px] text-[#64748B]">
                {currentRun.model_comparison?.length || 0} candidate algorithms evaluated
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                    <th className="pb-2">Algorithm</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Primary Metric</th>
                    <th className="pb-2">Training Time</th>
                    <th className="pb-2 text-right">Selection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {currentRun.model_comparison?.map((mc) => {
                    const primaryVal = Object.values(mc.metrics || {})[0];
                    return (
                      <tr key={mc.model_id} className={mc.is_best ? 'bg-blue-50/40 font-semibold' : ''}>
                        <td className="py-2.5 font-medium text-[#0F172A]">{mc.model_name}</td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              mc.status === 'success'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-700'
                            }`}
                          >
                            {mc.status}
                          </span>
                        </td>
                        <td className="py-2.5 font-bold text-[#0F172A]">
                          {typeof primaryVal === 'number'
                            ? primaryVal.toLocaleString(undefined, { maximumFractionDigits: 4 })
                            : 'N/A'}
                        </td>
                        <td className="py-2.5 text-[#64748B]">{mc.training_time_seconds}s</td>
                        <td className="py-2.5 text-right">
                          {mc.is_best ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#2563EB] text-white">
                              Selected
                            </span>
                          ) : (
                            <span className="text-[#94A3B8]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Visualizations Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Classification Confusion Matrix */}
            {currentRun.task_type === 'classification' && currentRun.metrics?.confusion_matrix && (
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
                  <div className="flex items-center gap-2">
                    <Grid className="w-4 h-4 text-[#2563EB]" />
                    <h3 className="text-sm font-bold text-[#0F172A]">Confusion Matrix</h3>
                  </div>
                  <span className="text-[10px] text-[#64748B]">Actual vs Predicted Counts</span>
                </div>

                <div className="overflow-x-auto py-2">
                  <table className="w-full text-xs text-center border-collapse">
                    <thead>
                      <tr>
                        <th className="p-2 text-left font-semibold text-[#64748B]">Actual \ Predicted</th>
                        {currentRun.metrics.confusion_matrix.labels?.map((lbl) => (
                          <th key={lbl} className="p-2 font-bold text-[#0F172A]">
                            {lbl}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {currentRun.metrics.confusion_matrix.labels?.map((actualLbl, rIdx) => (
                        <tr key={actualLbl}>
                          <td className="p-2 text-left font-bold text-[#0F172A]">{actualLbl}</td>
                          {currentRun.metrics.confusion_matrix.matrix[rIdx]?.map((cnt, cIdx) => {
                            const isCorrect = rIdx === cIdx;
                            return (
                              <td
                                key={cIdx}
                                className={`p-3 border border-[#E2E8F0] font-bold text-sm ${
                                  isCorrect
                                    ? 'bg-emerald-50 text-emerald-800'
                                    : cnt > 0
                                    ? 'bg-amber-50 text-amber-800'
                                    : 'bg-white text-slate-400'
                                }`}
                              >
                                {cnt}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Feature Importance Horizontal Bars */}
            {currentRun.feature_importance?.length > 0 && (
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[#2563EB]" />
                    <h3 className="text-sm font-bold text-[#0F172A]">Feature Importance Rankings</h3>
                  </div>
                  <span className="text-[10px] text-[#64748B]">Influence %</span>
                </div>

                <div className="space-y-2 py-1">
                  {currentRun.feature_importance.slice(0, 6).map((fi) => (
                    <div key={fi.feature} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-[#0F172A] truncate max-w-[200px]" title={fi.feature}>
                          {fi.feature}
                        </span>
                        <span className="font-bold text-[#2563EB]">{fi.percentage}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                        <div
                          className="h-full bg-[#2563EB] rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(5, fi.percentage))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Regression / Forecasting Actual vs Predicted Sample */}
            {currentRun.task_type !== 'classification' && (
              <div className="lg:col-span-2">
                {currentRun.predictions && currentRun.predictions.length > 0 ? (
                  <AnalyticalChart
                    chartData={{
                      recommended: true,
                      chart_type: 'line',
                      title:
                        currentRun.task_type === 'time_series'
                          ? `Future Projections (${currentRun.target_column || 'Target'})`
                          : `Validation Holdout: Predicted Trend (${currentRun.target_column || 'Target'})`,
                      x_axis_label: currentRun.date_column || 'Sequence Index',
                      data_points: currentRun.predictions.slice(0, 30).map((pt) => ({
                        label: String(pt.index_or_date || ''),
                        value: parseFloat(pt.predicted_value) || 0,
                      })),
                    }}
                    emptyMessage="Insufficient data to generate this chart."
                  />
                ) : (
                  <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 text-center text-xs text-[#64748B]">
                    Insufficient data to generate this chart.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Explanation & Limitations */}
          {(currentRun.explanation || currentRun.limitations?.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {currentRun.explanation && (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0F172A]">
                    <BrainCircuit className="w-4 h-4 text-[#2563EB]" /> Plain-Language Model Explanation
                  </div>
                  <p className="text-xs text-[#475569] leading-relaxed whitespace-pre-line">
                    {currentRun.explanation}
                  </p>
                </div>
              )}

              {currentRun.limitations?.length > 0 && (
                <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600" /> Operational Caveats & Limitations
                  </div>
                  <ul className="text-xs text-[#475569] space-y-1 list-disc pl-4">
                    {currentRun.limitations.map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Time-Series: Two Separate Tables (Validation Holdout vs Future Projections) */}
          {currentRun.task_type === 'time_series' ? (
            <div className="space-y-6">
              {/* Table 1: Validation Holdout (Actual vs Predicted) */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F1F5F9] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A]">Validation Holdout (Actual vs Predicted)</h3>
                      <p className="text-[11px] text-[#64748B]">
                        Model validation performance on {currentRun.validation_predictions?.length || currentRun.validation_rows || 0} chronological holdout observations.
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Ground Truth Verified
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                        <th className="pb-2">Date</th>
                        <th className="pb-2">Actual {currentRun.target_column}</th>
                        <th className="pb-2">Predicted {currentRun.target_column}</th>
                        <th className="pb-2">Absolute Error</th>
                        <th className="pb-2 text-right">Percentage Error (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {(currentRun.validation_predictions || []).map((p, idx) => {
                        const actVal = typeof p.actual_value === 'number' ? p.actual_value : parseFloat(p.actual_value);
                        const predVal = typeof p.predicted_value === 'number' ? p.predicted_value : parseFloat(p.predicted_value);
                        const absErr = p.absolute_error !== null && p.absolute_error !== undefined
                          ? p.absolute_error
                          : (!isNaN(actVal) && !isNaN(predVal) ? Math.abs(actVal - predVal) : null);
                        const pctErr = p.percentage_error !== null && p.percentage_error !== undefined
                          ? p.percentage_error
                          : (!isNaN(actVal) && Math.abs(actVal) > 1e-9 && absErr !== null ? (absErr / Math.abs(actVal)) * 100 : null);

                        return (
                          <tr key={idx} className="hover:bg-[#F8FAFC]">
                            <td className="py-2.5 font-medium text-[#0F172A]">{p.index_or_date}</td>
                            <td className="py-2.5 font-bold text-[#0F172A]">
                              {!isNaN(actVal) ? actVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—'}
                            </td>
                            <td className="py-2.5 font-semibold text-[#2563EB]">
                              {!isNaN(predVal) ? predVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—'}
                            </td>
                            <td className="py-2.5 text-[#475569]">
                              {absErr !== null ? absErr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—'}
                            </td>
                            <td className="py-2.5 text-right">
                              {pctErr !== null ? (
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                  pctErr <= 15 ? 'bg-emerald-50 text-emerald-700' :
                                  pctErr <= 50 ? 'bg-blue-50 text-blue-700' :
                                  'bg-amber-50 text-amber-700'
                                }`}>
                                  {pctErr.toFixed(2)}%
                                </span>
                              ) : (
                                <span className="text-slate-400">N/A (Actual is 0)</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table 2: Future Horizon Projections */}
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F1F5F9] pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                      <TrendingUp className="w-4 h-4 text-[#2563EB]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A]">Future Horizon Projections</h3>
                      <p className="text-[11px] text-[#64748B]">
                        Recursive multi-step forward projection ({currentRun.predictions?.length || currentRun.forecast_horizon || 0} horizon steps).
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                    Out-of-sample forward projections • Real-world accuracy unverified
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                        <th className="pb-2">Forecast Date</th>
                        <th className="pb-2">Predicted {currentRun.target_column}</th>
                        <th className="pb-2">Lower Bound (95%)</th>
                        <th className="pb-2">Upper Bound (95%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {(currentRun.predictions || []).map((p, idx) => {
                        const predVal = typeof p.predicted_value === 'number' ? p.predicted_value : parseFloat(p.predicted_value);
                        return (
                          <tr key={idx} className="hover:bg-[#F8FAFC]">
                            <td className="py-2.5 font-medium text-[#0F172A]">{p.index_or_date}</td>
                            <td className="py-2.5 font-bold text-[#2563EB]">
                              {!isNaN(predVal) ? predVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                            </td>
                            <td className="py-2.5 text-[#64748B]">
                              {p.lower_bound !== null && p.lower_bound !== undefined ? Number(p.lower_bound).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                            </td>
                            <td className="py-2.5 text-[#64748B]">
                              {p.upper_bound !== null && p.upper_bound !== undefined ? Number(p.upper_bound).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* Non-Time-Series Detailed Prediction Records Table */
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">Detailed Prediction Records</h3>
                  <p className="text-[11px] text-[#64748B]">
                    Viewing {filteredPredictions.length} prediction observations
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search index/value..."
                      value={predSearch}
                      onChange={(e) => {
                        setPredSearch(e.target.value);
                        setPredPage(1);
                      }}
                      className="pl-8 pr-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl focus:outline-hidden w-44"
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                      <th className="pb-2">Step / Date</th>
                      <th className="pb-2">Predicted {currentRun.target_column}</th>
                      {currentRun.predictions[0]?.actual_value !== null && <th className="pb-2">Actual Value</th>}
                      {currentRun.predictions[0]?.lower_bound !== null && <th className="pb-2">Lower Bound (95%)</th>}
                      {currentRun.predictions[0]?.upper_bound !== null && <th className="pb-2">Upper Bound (95%)</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {currentPredSlice.map((p, idx) => (
                      <tr key={idx} className="hover:bg-[#F8FAFC]">
                        <td className="py-2 font-medium text-[#0F172A]">{p.index_or_date}</td>
                        <td className="py-2 font-bold text-[#2563EB]">{p.predicted_value}</td>
                        {p.actual_value !== null && <td className="py-2 font-semibold text-[#334155]">{p.actual_value}</td>}
                        {p.lower_bound !== null && <td className="py-2 text-[#64748B]">{p.lower_bound}</td>}
                        {p.upper_bound !== null && <td className="py-2 text-[#64748B]">{p.upper_bound}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div className="flex items-center justify-between border-t border-[#F1F5F9] pt-3 text-xs text-[#64748B]">
                <span>
                  Page {predPage} of {totalPredPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={predPage <= 1}
                    onClick={() => setPredPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg border border-[#E2E8F0] disabled:opacity-40 cursor-pointer"
                  >
                    Previous
                  </button>
                  <button
                    disabled={predPage >= totalPredPages}
                    onClick={() => setPredPage((p) => Math.min(totalPredPages, p + 1))}
                    className="px-2.5 py-1 rounded-lg border border-[#E2E8F0] disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------- TAB 3: PREDICT NEW DATA ---------------- */}
      {activeTab === 'infer' && currentRun && (
        <div className="w-full min-w-0 space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#0F172A]">Score Unseen Data with Trained Model</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  Artifact: {currentRun.dataset_name} (Dataset #{currentRun.dataset_id}, Run #{currentRun.run_id})
                </span>
              </div>
              <p className="text-xs text-[#64748B] mt-1">
                Upload a separate CSV or Excel file matching the predictor schema of{' '}
                <span className="font-semibold text-[#0F172A]">{currentRun.selected_model}</span> (target: <span className="font-semibold text-[#2563EB]">{currentRun.target_column}</span>).
                The saved pipeline transformations (imputation, encoding, scaling) will be applied directly.
              </p>
            </div>

            {/* Dataset Discrepancy Banner */}
            {selectedDataset && currentRun.dataset_id !== selectedDataset.id && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Active dataset source is <strong>{selectedDataset.filename}</strong>, but this model was trained on <strong>{currentRun.dataset_name}</strong>.
                  </span>
                </div>
                <button
                  onClick={() => handleDatasetChange(currentRun.dataset_id)}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] transition cursor-pointer shrink-0"
                >
                  Switch to {currentRun.dataset_name}
                </button>
              </div>
            )}

            <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs space-y-1">
              <span className="font-semibold text-[#0F172A]">Required Input Predictors:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {currentRun.features_used?.map((f) => (
                  <span key={f} className="px-2 py-0.5 rounded bg-white border border-[#CBD5E1] text-[10px] font-mono text-[#334155]">
                    {f}
                  </span>
                ))}
              </div>
            </div>

            <form onSubmit={handleInferSubmit} className="space-y-4">
              <div className="border-2 border-dashed border-[#CBD5E1] rounded-2xl p-8 text-center bg-[#F8FAFC] hover:bg-[#F1F5F9] transition-all">
                <UploadCloud className="w-10 h-10 text-[#2563EB] mx-auto mb-2" />
                <label className="cursor-pointer">
                  <span className="text-xs font-bold text-[#2563EB] hover:underline">Choose file</span>
                  <span className="text-xs text-[#64748B]"> or drag and drop CSV / Excel</span>
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    onChange={(e) => setInferFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
                {inferFile && (
                  <p className="text-xs font-semibold text-[#0F172A] mt-2">
                    Selected: {inferFile.name} ({(inferFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              {inferError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
                  {inferError}
                </div>
              )}

              <button
                type="submit"
                disabled={!inferFile || inferLoading}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-slate-300 disabled:cursor-not-allowed shadow-xs transition-all cursor-pointer"
              >
                {inferLoading ? 'Scoring Uploaded Data...' : 'Run Predictions'}
              </button>
            </form>

            {inferResult && (
              <div className="mt-6 border-t border-[#F1F5F9] pt-4 space-y-3">
                {inferResult.warnings && inferResult.warnings.length > 0 && (
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs space-y-1 shadow-2xs">
                    <span className="font-bold flex items-center gap-1.5 text-blue-800">
                      <Info className="w-3.5 h-3.5" /> Pipeline Schema Notice:
                    </span>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                      {inferResult.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#0F172A]">
                    Prediction Output ({inferResult.total_rows?.toLocaleString()} rows scored)
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Predicted: {inferResult.predicted_column_name}
                  </span>
                </div>

                <div className="max-h-64 overflow-auto border border-[#E2E8F0] rounded-xl text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B]">
                      <tr>
                        {Object.keys(inferResult.predicted_rows[0] || {}).map((col) => (
                          <th key={col} className={`p-2 font-semibold ${col === inferResult.predicted_column_name ? 'text-[#2563EB]' : ''}`}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {inferResult.predicted_rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-[#F8FAFC]">
                          {Object.entries(row).map(([k, v], cIdx) => (
                            <td key={cIdx} className={`p-2 font-mono ${k === inferResult.predicted_column_name ? 'font-bold text-[#2563EB] bg-blue-50/30' : 'text-[#334155]'}`}>
                              {v !== null ? String(v) : '—'}
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
      )}

      {/* ---------------- TAB 4: RUN HISTORY ---------------- */}
      {activeTab === 'history' && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
            <div>
              <h3 className="text-sm font-bold text-[#0F172A]">Saved Prediction Runs</h3>
              <p className="text-xs text-[#64748B]">
                Historical models trained and evaluated on your uploaded datasets.
              </p>
            </div>
            <button
              onClick={() => fetchRuns(selectedDatasetId)}
              className="p-1.5 rounded-lg border border-[#E2E8F0] hover:bg-slate-50 text-[#64748B] cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {runsHistory.length === 0 ? (
            <div className="text-center py-12 text-[#94A3B8]">
              <Clock className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-xs font-semibold">No saved prediction runs found for this dataset.</p>
              <p className="text-[11px] mt-0.5">Train your first model using the Model Studio tab above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[#E2E8F0] text-[#64748B] font-semibold">
                    <th className="pb-2">Algorithm</th>
                    <th className="pb-2">Task</th>
                    <th className="pb-2">Target</th>
                    <th className="pb-2">Primary Metric</th>
                    <th className="pb-2">Date Created</th>
                    <th className="pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {runsHistory.map((run) => {
                    const primaryVal = Object.values(run.metrics || {})[0];
                    return (
                      <tr key={run.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 font-bold text-[#0F172A]">{run.selected_model}</td>
                        <td className="py-2.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-slate-100 text-slate-700">
                            {run.task_type}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-[#334155]">{run.target_column}</td>
                        <td className="py-2.5 font-semibold text-[#2563EB]">
                          {typeof primaryVal === 'number'
                            ? primaryVal.toLocaleString(undefined, { maximumFractionDigits: 4 })
                            : 'N/A'}
                        </td>
                        <td className="py-2.5 text-[#64748B]">
                          {new Date(run.created_at).toLocaleString()}
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleLoadRun(run.id)}
                              className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#2563EB] font-bold text-[11px] cursor-pointer"
                            >
                              View Results
                            </button>
                            <button
                              onClick={(e) => handleDeleteRun(run.id, e)}
                              className="p-1 rounded-lg text-red-500 hover:bg-red-50 cursor-pointer"
                              title="Delete Run"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PredictionPage;
