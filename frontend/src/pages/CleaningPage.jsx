import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  GitMerge,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Database,
  RefreshCw,
  ChevronDown,
  Download,
  RotateCcw,
  Check,
  ArrowRight,
  ArrowLeft,
  Eye,
  History,
  Plus,
  Type,
  Calendar,
  FileText,
  AlignLeft,
  Columns,
  Table,
  Filter,
  Sliders,
  Search,
  Hash,
  ShieldAlert,
  Trash2,
  BarChart3,
  ListPlus,
  Wand2,
  FileSpreadsheet,
  ShieldCheck,
  X,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { RelationshipManager } from '../components/RelationshipManager';
import { datasetService } from '../services/datasetService';
import { cleaningService } from '../services/cleaningService';
import { extractErrorMessage } from '../services/api';
import { AnalyticalChart } from '../components/AnalyticalChart';

export const CleaningPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Datasets & Current Selection
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [overview, setOverview] = useState(null);
  const [history, setHistory] = useState([]);

  // Workflow Step Management (Steps 1 to 6)
  // Step 1: Dataset, Step 2: Issues, Step 3: Clean, Step 4: Preview, Step 5: Save, Step 6: Download
  const [workflowStep, setWorkflowStep] = useState(1);

  // Loading & Error States
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // UX Toggle States
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedCategory, setAdvancedCategory] = useState('missing'); // 'missing' | 'duplicates' | 'text' | 'numeric' | 'dates' | 'outliers' | 'rules'
  const [showWhyScoreModal, setShowWhyScoreModal] = useState(false);
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showCleanedPreview, setShowCleanedPreview] = useState(false);

  // Phase 1 Operations State
  const [removeDuplicates, setRemoveDuplicates] = useState(false);
  const [removeEmptyRows, setRemoveEmptyRows] = useState(false);
  const [removeEmptyColumns, setRemoveEmptyColumns] = useState(false);
  const [convertBlanksToNa, setConvertBlanksToNa] = useState(false);
  const [standardizeColumnNames, setStandardizeColumnNames] = useState(false);
  const [imputations, setImputations] = useState({});
  const [typeConversions, setTypeConversions] = useState({});
  const [dropColumns, setDropColumns] = useState({});

  // Phase 2 Operations State
  const [textStandardizations, setTextStandardizations] = useState([]);
  const [categoryNormalizations, setCategoryNormalizations] = useState([]);
  const [numericCleanings, setNumericCleanings] = useState([]);
  const [dateCleanings, setDateCleanings] = useState([]);
  const [valueValidations, setValueValidations] = useState([]);
  const [customReplacements, setCustomReplacements] = useState([]);
  const [findReplaces, setFindReplaces] = useState([]);
  const [cleaningRules, setCleaningRules] = useState([]);

  // Phase 2 Sub-tools Form State
  const [advSubTab, setAdvSubTab] = useState('text');

  // Form States
  const [tsForm, setTsForm] = useState({
    column: '',
    trim_whitespace: true,
    collapse_spaces: true,
    case_conversion: 'lowercase',
    remove_special_chars: false,
  });

  const [catCol, setCatCol] = useState('');
  const [catClusters, setCatClusters] = useState([]);
  const [loadingClusters, setLoadingClusters] = useState(false);
  const [catMappingsInput, setCatMappingsInput] = useState({});

  const [numForm, setNumForm] = useState({
    column: '',
    strip_currency: true,
    remove_commas: true,
    percentage_handling: 'keep_number',
    handle_invalid: 'coerce_na',
  });

  const [dateCol, setDateCol] = useState('');
  const [dateInspection, setDateInspection] = useState(null);
  const [loadingDateInspection, setLoadingDateInspection] = useState(false);
  const [dateOutputFormat, setDateOutputFormat] = useState('%Y-%m-%d');
  const [dateHandleInvalid, setDateHandleInvalid] = useState('coerce_na');

  const [valForm, setValForm] = useState({
    column: '',
    min_value: '',
    max_value: '',
    action: 'set_missing',
    replacement_value: '',
  });

  const [crForm, setCrForm] = useState({
    column: '',
    find_value: 'Unknown',
    replace_value: 'NaN',
    exact_match: true,
  });

  const [frForm, setFrForm] = useState({
    column: '',
    find_value: '',
    replace_value: '',
    exact_match: false,
    case_sensitive: true,
  });

  const [ruleForm, setRuleForm] = useState({
    column: '',
    condition: 'less_than',
    condition_value: '',
    action: 'set_missing',
    action_value: '',
  });

  const [summaryCol, setSummaryCol] = useState('');
  const [columnSummaryData, setColumnSummaryData] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Post-apply summary
  const [applyResult, setApplyResult] = useState(null);

  // Phase 4: Workflow, Validation, Score, & Report States
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [validationReport, setValidationReport] = useState(null);
  const [versionTimeline, setVersionTimeline] = useState([]);
  const [bulkPreviewData, setBulkPreviewData] = useState(null);
  const [cleaningReportData, setCleaningReportData] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [showOriginalModal, setShowOriginalModal] = useState(false);
  const [originalData, setOriginalData] = useState(null);
  const [loadingOriginal, setLoadingOriginal] = useState(false);
  const [outlierCleanings, setOutlierCleanings] = useState([]);
  const [outlierForm, setOutlierForm] = useState({
    column: '',
    method: 'iqr',
    multiplier: 1.5,
    action: 'cap',
  });

  // Preview & Confirm State
  const [previewData, setPreviewData] = useState(null);
  const [previewRowsLimit, setPreviewRowsLimit] = useState(10);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pageMode, setPageMode] = useState('single');
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Phase 5: Smart Suggestions, Consistency Checks, & Version Compare States
  const [smartSuggestions, setSmartSuggestions] = useState(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [consistencyChecks, setConsistencyChecks] = useState(null);
  const [loadingConsistency, setLoadingConsistency] = useState(false);
  const [selectedViolationCheck, setSelectedViolationCheck] = useState(null);
  const [customRuleForm, setCustomRuleForm] = useState({
    rule_name: '',
    column_a: '',
    operator: '>',
    compare_mode: 'column',
    column_b: '',
    constant_value: '',
  });
  const [customRuleResult, setCustomRuleResult] = useState(null);
  const [loadingCustomRule, setLoadingCustomRule] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareV1, setCompareV1] = useState('Original');
  const [compareV2, setCompareV2] = useState('');
  const [compareResult, setCompareResult] = useState(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // 1. Load datasets list on mount
  const fetchDatasets = async (targetId = null) => {
    setLoadingDatasets(true);
    setError('');
    try {
      const data = await datasetService.getDatasets();
      const list = data || [];
      setDatasets(list);

      const queryId = targetId || searchParams.get('dataset_id') || searchParams.get('id');
      const savedId = localStorage.getItem('selected_dataset_id');

      if (queryId && list.some((d) => String(d.id) === String(queryId))) {
        setSelectedDatasetId(Number(queryId));
      } else if (savedId && list.some((d) => String(d.id) === String(savedId))) {
        setSelectedDatasetId(Number(savedId));
      } else if (list.length > 0 && !selectedDatasetId) {
        setSelectedDatasetId(list[0].id);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingDatasets(false);
    }
  };

  useEffect(() => {
    fetchDatasets();
  }, []);

  const loadCleaningData = async (id) => {
    setLoadingOverview(true);
    setError('');
    // Invalidate stale previews on dataset reload/change
    setPreviewData(null);
    setBulkPreviewData(null);
    try {
      const [overviewData, historyData, summaryData, valData, timelineData, suggData, consistData] = await Promise.all([
        cleaningService.getOverview(id),
        cleaningService.getHistory(id).catch(() => []),
        cleaningService.getDashboardSummary(id).catch(() => null),
        cleaningService.getValidationReport(id).catch(() => null),
        cleaningService.getVersionTimeline(id).catch(() => []),
        cleaningService.getSmartSuggestions(id).catch(() => null),
        cleaningService.getConsistencyChecks(id).catch(() => null),
      ]);

      setOverview(overviewData);
      setHistory(historyData);
      setDashboardSummary(summaryData);
      setValidationReport(valData);
      setVersionTimeline(timelineData);
      setSmartSuggestions(suggData);
      setConsistencyChecks(consistData);

      // Default column selections
      if (overviewData?.columns?.length > 0) {
        const firstCol = overviewData.columns[0].column_name;
        setTsForm((prev) => ({ ...prev, column: prev.column || firstCol }));
        setNumForm((prev) => ({ ...prev, column: prev.column || firstCol }));
        setValForm((prev) => ({ ...prev, column: prev.column || firstCol }));
        setCrForm((prev) => ({ ...prev, column: prev.column || firstCol }));
        setFrForm((prev) => ({ ...prev, column: prev.column || firstCol }));
        setRuleForm((prev) => ({ ...prev, column: prev.column || firstCol }));
        setOutlierForm((prev) => ({ ...prev, column: prev.column || firstCol }));
        setCatCol((prev) => prev || firstCol);
        setDateCol((prev) => prev || firstCol);
        setCustomRuleForm((prev) => ({
          ...prev,
          column_a: prev.column_a || firstCol,
          column_b: prev.column_b || (overviewData.columns[1]?.column_name || firstCol),
        }));
      }

      // Reset configurations
      setRemoveDuplicates(false);
      setRemoveEmptyRows(false);
      setRemoveEmptyColumns(false);
      setConvertBlanksToNa(false);
      setStandardizeColumnNames(false);
      setImputations({});
      setTypeConversions({});
      setDropColumns({});
      setTextStandardizations([]);
      setCategoryNormalizations([]);
      setNumericCleanings([]);
      setDateCleanings([]);
      setValueValidations([]);
      setCustomReplacements([]);
      setFindReplaces([]);
      setCleaningRules([]);
      setOutlierCleanings([]);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingOverview(false);
    }
  };

  // 2. Load cleaning overview & history when selectedDatasetId changes
  useEffect(() => {
    if (!selectedDatasetId) {
      setOverview(null);
      setHistory([]);
      setPreviewData(null);
      setBulkPreviewData(null);
      setApplyResult(null);
      setDownloadSuccess(false);
      setWorkflowStep(1);
      return;
    }

    setSearchParams({ dataset_id: selectedDatasetId }, { replace: true });
    localStorage.setItem('selected_dataset_id', String(selectedDatasetId));
    setDownloadSuccess(false);
    loadCleaningData(selectedDatasetId);
  }, [selectedDatasetId]);

  const currentDataset = datasets.find((d) => d.id === selectedDatasetId);

  const missingColumns = useMemo(() => {
    if (!overview?.columns) return [];
    return overview.columns.filter((c) => c.missing_count > 0);
  }, [overview]);

  const numericColumns = useMemo(() => {
    if (!overview?.columns) return [];
    return overview.columns.filter((c) =>
      ['Integer', 'Float', 'Numeric'].includes(c.inferred_type)
    );
  }, [overview]);

  const textColumns = useMemo(() => {
    if (!overview?.columns) return [];
    return overview.columns.filter((c) =>
      ['Text', 'Categorical'].includes(c.inferred_type)
    );
  }, [overview]);

  const dateColumns = useMemo(() => {
    if (!overview?.columns) return [];
    return overview.columns.filter((c) =>
      ['Date', 'DateTime'].includes(c.inferred_type)
    );
  }, [overview]);

  // Priority Ordered Pending Operations List
  const pendingOperationsList = useMemo(() => {
    const list = [];
    let order = 1;

    if (convertBlanksToNa) {
      list.push({
        id: 'convert_blanks',
        order: order++,
        type: 'Blank / Whitespace',
        column: 'All',
        details: 'Convert to Missing (NaN)',
        remove: () => setConvertBlanksToNa(false),
      });
    }

    if (removeDuplicates) {
      list.push({
        id: 'remove_dups',
        order: order++,
        type: 'Duplicate Removal',
        column: 'All',
        details: 'Remove Duplicates',
        remove: () => setRemoveDuplicates(false),
      });
    }

    if (standardizeColumnNames) {
      list.push({
        id: 'std_col_names',
        order: order++,
        type: 'Column Naming',
        column: 'All',
        details: 'Standardize format (snake_case)',
        remove: () => setStandardizeColumnNames(false),
      });
    }

    if (removeEmptyRows) {
      list.push({
        id: 'rem_empty_rows',
        order: order++,
        type: 'Drop Empty Rows',
        column: 'All',
        details: 'Drop Completely Empty Rows',
        remove: () => setRemoveEmptyRows(false),
      });
    }
    if (removeEmptyColumns) {
      list.push({
        id: 'rem_empty_cols',
        order: order++,
        type: 'Drop Empty Columns',
        column: 'All',
        details: 'Drop Completely Empty Columns',
        remove: () => setRemoveEmptyColumns(false),
      });
    }

    Object.entries(imputations).forEach(([col, cfg]) => {
      if (cfg.strategy) {
        list.push({
          id: `imp_${col}`,
          order: order++,
          type: 'Missing Value',
          column: col,
          details: `Impute (${cfg.strategy}${cfg.fill_value ? `: ${cfg.fill_value}` : ''})`,
          remove: () => {
            const next = { ...imputations };
            delete next[col];
            setImputations(next);
          },
        });
      }
    });

    textStandardizations.forEach((item, idx) => {
      list.push({
        id: `ts_${idx}`,
        order: order++,
        type: 'Text Standardize',
        column: item.column,
        details: `Case: ${item.case_conversion}, Trim: ${item.trim_whitespace}`,
        remove: () => setTextStandardizations((prev) => prev.filter((_, i) => i !== idx)),
      });
    });

    categoryNormalizations.forEach((item, idx) => {
      list.push({
        id: `cat_${idx}`,
        order: order++,
        type: 'Category Normalize',
        column: item.column,
        details: `${Object.keys(item.mappings || {}).length} variant mapping(s)`,
        remove: () => setCategoryNormalizations((prev) => prev.filter((_, i) => i !== idx)),
      });
    });

    numericCleanings.forEach((item, idx) => {
      list.push({
        id: `num_${idx}`,
        order: order++,
        type: 'Numeric Clean',
        column: item.column,
        details: `Strip Currency: ${item.strip_currency}, Remove Commas: ${item.remove_commas}`,
        remove: () => setNumericCleanings((prev) => prev.filter((_, i) => i !== idx)),
      });
    });

    dateCleanings.forEach((item, idx) => {
      list.push({
        id: `date_${idx}`,
        order: order++,
        type: 'Date Clean',
        column: item.column,
        details: `Target: ${item.target_format || '%Y-%m-%d'}`,
        remove: () => setDateCleanings((prev) => prev.filter((_, i) => i !== idx)),
      });
    });

    Object.entries(typeConversions).forEach(([col, targetType]) => {
      if (targetType) {
        list.push({
          id: `tc_${col}`,
          order: order++,
          type: 'Data Type Correction',
          column: col,
          details: `Convert to ${targetType}`,
          remove: () => {
            const next = { ...typeConversions };
            delete next[col];
            setTypeConversions(next);
          },
        });
      }
    });

    valueValidations.forEach((item, idx) => {
      list.push({
        id: `val_${idx}`,
        order: order++,
        type: 'Value Validation',
        column: item.column,
        details: `Range [${item.min_value ?? '-inf'}, ${item.max_value ?? '+inf'}] -> ${item.action}`,
        remove: () => setValueValidations((prev) => prev.filter((_, i) => i !== idx)),
      });
    });

    customReplacements.forEach((item, idx) => {
      list.push({
        id: `cr_${idx}`,
        order: order++,
        type: 'Custom Replacement',
        column: item.column,
        details: `'${item.find_value}' -> '${item.replace_value}'`,
        remove: () => setCustomReplacements((prev) => prev.filter((_, i) => i !== idx)),
      });
    });

    findReplaces.forEach((item, idx) => {
      list.push({
        id: `fr_${idx}`,
        order: order++,
        type: 'Find & Replace',
        column: item.column,
        details: `'${item.find_value}' -> '${item.replace_value}'`,
        remove: () => setFindReplaces((prev) => prev.filter((_, i) => i !== idx)),
      });
    });

    cleaningRules.forEach((item, idx) => {
      list.push({
        id: `rule_${idx}`,
        order: order++,
        type: 'Cleaning Rule',
        column: item.column,
        details: `IF ${item.condition} THEN ${item.action}`,
        remove: () => setCleaningRules((prev) => prev.filter((_, i) => i !== idx)),
      });
    });

    outlierCleanings.forEach((item, idx) => {
      list.push({
        id: `outlier_${idx}`,
        order: order++,
        type: 'Outlier Treatment',
        column: item.column,
        details: `${item.method.toUpperCase()} (${item.action})`,
        remove: () => setOutlierCleanings((prev) => prev.filter((_, i) => i !== idx)),
      });
    });

    Object.entries(dropColumns).forEach(([col, shouldDrop]) => {
      if (shouldDrop) {
        list.push({
          id: `drop_${col}`,
          order: order++,
          type: 'Drop Column',
          column: col,
          details: 'Permanent removal',
          remove: () => {
            const next = { ...dropColumns };
            delete next[col];
            setDropColumns(next);
          },
        });
      }
    });

    return list;
  }, [
    convertBlanksToNa,
    removeDuplicates,
    standardizeColumnNames,
    removeEmptyRows,
    removeEmptyColumns,
    imputations,
    textStandardizations,
    categoryNormalizations,
    numericCleanings,
    dateCleanings,
    typeConversions,
    valueValidations,
    customReplacements,
    findReplaces,
    cleaningRules,
    outlierCleanings,
    dropColumns,
  ]);

  const activeOpsCount = pendingOperationsList.length;

  // Discrete Step States
  const datasetState = useMemo(() => {
    if (error && !overview) return 'DATASET_ERROR';
    if (loadingDatasets || (loadingOverview && !overview)) return 'DATASET_LOADING';
    if (selectedDatasetId && overview) return 'DATASET_SELECTED';
    return 'NO_DATASET';
  }, [error, overview, loadingDatasets, loadingOverview, selectedDatasetId]);

  const missingCount = useMemo(() => {
    return dashboardSummary?.missing_values ?? (overview?.has_cleaned && overview?.cleaned_metrics ? overview.cleaned_metrics.missing_cells : overview?.original_metrics?.missing_cells ?? 0);
  }, [dashboardSummary, overview]);

  const duplicateCount = useMemo(() => {
    return dashboardSummary?.duplicate_rows ?? (overview?.has_cleaned && overview?.cleaned_metrics ? overview.cleaned_metrics.duplicate_rows : overview?.original_metrics?.duplicate_rows ?? 0);
  }, [dashboardSummary, overview]);

  const blankCount = useMemo(() => {
    return dashboardSummary?.blank_values ?? (overview?.total_blank_cells || 0);
  }, [dashboardSummary, overview]);

  const outliersCount = useMemo(() => {
    return dashboardSummary?.outliers_detected ?? 0;
  }, [dashboardSummary]);

  const invalidValuesCount = useMemo(() => {
    if (!validationReport?.checks) return 0;
    const invCheck = validationReport.checks.find(c => c.check_name.toLowerCase().includes('invalid value'));
    return invCheck?.after_value ?? 0;
  }, [validationReport]);

  const totalIssuesCount = missingCount + duplicateCount + blankCount + outliersCount + invalidValuesCount;

  // =========================================================================
  // WORKFLOW STATES SPECIFICATION:
  // Step 1 - Dataset: NO_DATASET, DATASET_SELECTED, DATASET_LOADING, DATASET_ERROR
  // Step 2 - Issues: ANALYSIS_PENDING, ANALYZING, ANALYSIS_COMPLETE, ANALYSIS_ERROR, NO_ISSUES
  // Step 3 - Clean: NO_ACTIONS_SELECTED, ACTIONS_SELECTED, ACTIONS_CONFIGURED, CLEANING_IN_PROGRESS, CLEANING_ERROR
  // Step 4 - Preview: PREVIEW_PENDING, PREVIEW_GENERATING, PREVIEW_READY, PREVIEW_ERROR
  // Step 5 - Save: SAVE_CONFIRMATION, SAVING, SAVE_SUCCESS, SAVE_ERROR
  // Step 6 - Download: DOWNLOAD_READY, DOWNLOAD_IN_PROGRESS, DOWNLOAD_SUCCESS, DOWNLOAD_ERROR
  // =========================================================================

  const issuesState = useMemo(() => {
    if (datasetState !== 'DATASET_SELECTED') return 'ANALYSIS_PENDING';
    if (loadingOverview) return 'ANALYZING';
    if (error) return 'ANALYSIS_ERROR';
    if (totalIssuesCount === 0) return 'NO_ISSUES';
    return 'ANALYSIS_COMPLETE';
  }, [datasetState, loadingOverview, error, totalIssuesCount]);

  const cleanState = useMemo(() => {
    if (loadingAction && workflowStep === 3) return 'CLEANING_IN_PROGRESS';
    if (error && workflowStep === 3) return 'CLEANING_ERROR';
    if (activeOpsCount > 0) return 'ACTIONS_CONFIGURED';
    if (showAdvanced || advancedCategory) return 'ACTIONS_SELECTED';
    return 'NO_ACTIONS_SELECTED';
  }, [loadingAction, workflowStep, error, activeOpsCount, showAdvanced, advancedCategory]);

  const previewState = useMemo(() => {
    if (loadingAction && workflowStep === 4) return 'PREVIEW_GENERATING';
    if (error && workflowStep === 4) return 'PREVIEW_ERROR';
    if (bulkPreviewData || previewData) return 'PREVIEW_READY';
    return 'PREVIEW_PENDING';
  }, [loadingAction, workflowStep, error, bulkPreviewData, previewData]);

  const saveState = useMemo(() => {
    if (loadingAction && (workflowStep === 5 || showConfirmModal)) return 'SAVING';
    if (error && workflowStep === 5) return 'SAVE_ERROR';
    if (applyResult) return 'SAVE_SUCCESS';
    if (showConfirmModal) return 'SAVE_CONFIRMATION';
    return 'SAVE_CONFIRMATION';
  }, [loadingAction, workflowStep, showConfirmModal, error, applyResult]);

  const downloadState = useMemo(() => {
    if (loadingAction && workflowStep === 6) return 'DOWNLOAD_IN_PROGRESS';
    if (error && workflowStep === 6) return 'DOWNLOAD_ERROR';
    if (downloadSuccess) return 'DOWNLOAD_SUCCESS';
    if (overview?.has_cleaned) return 'DOWNLOAD_READY';
    return 'DOWNLOAD_READY';
  }, [loadingAction, workflowStep, error, downloadSuccess, overview?.has_cleaned]);

  const cleaningScore = useMemo(() => {
    return validationReport?.cleaning_score ?? dashboardSummary?.cleaning_score ?? dashboardSummary?.quality_score ?? (overview?.has_cleaned ? 85 : 50);
  }, [validationReport, dashboardSummary, overview]);

  const scoreStatus = useMemo(() => {
    if (validationReport?.score_status) return validationReport.score_status;
    if (cleaningScore >= 90) return 'CLEAN';
    if (cleaningScore >= 75) return 'GOOD';
    if (cleaningScore >= 50) return 'NEEDS REVIEW';
    return 'CRITICAL';
  }, [validationReport, cleaningScore]);

  // Deterministic Suggestion Prioritization Algorithm:
  // Impact Score = 100 * (Affected Records / Total Records) clamped [0, 100]
  // Priority Score = (Severity Weight * 0.60) + (Impact Score * 0.40)
  // Severity Weights: Critical = 100, High = 75, Medium = 50, Low = 25
  // Sorted by: 1. Priority Score desc, 2. Severity desc, 3. Affected records desc, 4. Issue name asc
  const prioritizedSuggestions = useMemo(() => {
    const totalRows = overview?.original_metrics?.total_rows || dashboardSummary?.rows || 1;
    const severityWeights = {
      critical: 100.0,
      high: 75.0,
      medium: 50.0,
      low: 25.0,
    };

    let rawList = [];

    if (smartSuggestions?.suggestions && smartSuggestions.suggestions.length > 0) {
      rawList = smartSuggestions.suggestions.map((s) => {
        const affCount = Number(s.affected_count) || 0;
        const imp = totalRows > 0 ? Math.min(100.0, Math.max(0.0, (100.0 * affCount) / totalRows)) : 0.0;
        const pct = totalRows > 0 ? Math.round(((affCount / totalRows) * 100) * 10) / 10 : 0.0;
        const pLower = (s.priority || 'medium').toLowerCase();
        const sevWeight = severityWeights[pLower] || 50.0;
        const pScore = Math.round(((sevWeight * 0.60) + (imp * 0.40)) * 100) / 100;

        return {
          ...s,
          impact_score: imp,
          affected_percentage: pct,
          priority_score: pScore,
          severity: pLower.charAt(0).toUpperCase() + pLower.slice(1),
        };
      });
    } else {
      // Fallback data-driven suggestions directly from dataset metrics
      if (duplicateCount > 0) {
        const imp = totalRows > 0 ? (100.0 * duplicateCount) / totalRows : 0;
        const pct = totalRows > 0 ? Math.round(((duplicateCount / totalRows) * 100) * 10) / 10 : 0;
        rawList.push({
          id: 'fallback-dups',
          priority: 'high',
          category: 'duplicates',
          issue: 'Duplicate rows detected',
          affected_columns: [],
          affected_count: duplicateCount,
          affected_percentage: pct,
          impact_score: imp,
          priority_score: Math.round(((75.0 * 0.60) + (imp * 0.40)) * 100) / 100,
          evidence: `${duplicateCount} duplicate row(s) found (${pct}% of rows).`,
          recommended_action: 'Review and remove duplicate records if they represent repeated entries.',
          action_type: 'remove_duplicates',
          severity: 'High',
        });
      }
      if (missingCount > 0) {
        const imp = totalRows > 0 ? (100.0 * missingCount) / totalRows : 0;
        const pct = totalRows > 0 ? Math.round(((missingCount / totalRows) * 100) * 10) / 10 : 0;
        rawList.push({
          id: 'fallback-missing',
          priority: 'high',
          category: 'missing',
          issue: 'Missing values in dataset',
          affected_columns: missingColumns.slice(0, 2).map((c) => c.column_name),
          affected_count: missingCount,
          affected_percentage: pct,
          impact_score: imp,
          priority_score: Math.round(((75.0 * 0.60) + (imp * 0.40)) * 100) / 100,
          evidence: `${missingCount} missing cells across ${missingColumns.length} columns (${pct}% of rows).`,
          recommended_action: 'Impute missing values using median/mean for numeric and mode for categories.',
          action_type: 'missing_imputation',
          severity: 'High',
        });
      }
      if (outliersCount > 0) {
        const imp = totalRows > 0 ? (100.0 * outliersCount) / totalRows : 0;
        const pct = totalRows > 0 ? Math.round(((outliersCount / totalRows) * 100) * 10) / 10 : 0;
        rawList.push({
          id: 'fallback-outliers',
          priority: 'medium',
          category: 'outliers',
          issue: 'Statistical outliers detected',
          affected_columns: [],
          affected_count: outliersCount,
          affected_percentage: pct,
          impact_score: imp,
          priority_score: Math.round(((50.0 * 0.60) + (imp * 0.40)) * 100) / 100,
          evidence: `${outliersCount} statistical outlier(s) detected in distribution.`,
          recommended_action: 'Review outlier values before treatment (options: view, keep, remove, cap, median).',
          action_type: 'outliers',
          severity: 'Medium',
        });
      }
    }

    // Sort deterministically:
    // 1. Priority Score descending
    // 2. Severity Weight descending
    // 3. Affected records descending
    // 4. Stable issue-type name ascending
    rawList.sort((a, b) => {
      if (b.priority_score !== a.priority_score) {
        return (b.priority_score || 0) - (a.priority_score || 0);
      }
      const sevA = severityWeights[(a.priority || '').toLowerCase()] || 0;
      const sevB = severityWeights[(b.priority || '').toLowerCase()] || 0;
      if (sevB !== sevA) {
        return sevB - sevA;
      }
      if (b.affected_count !== a.affected_count) {
        return (b.affected_count || 0) - (a.affected_count || 0);
      }
      return String(a.issue || '').localeCompare(String(b.issue || ''));
    });

    return rawList;
  }, [smartSuggestions, overview, dashboardSummary, duplicateCount, missingCount, outliersCount, missingColumns]);

  const topSuggestions = useMemo(() => {
    return prioritizedSuggestions.slice(0, 3);
  }, [prioritizedSuggestions]);

  const buildOperationsPayload = () => {
    const missing_imputations = Object.entries(imputations)
      .filter(([_, cfg]) => Boolean(cfg.strategy))
      .map(([col, cfg]) => ({
        column: col,
        strategy: cfg.strategy,
        fill_value: cfg.fill_value || undefined,
      }));

    const type_conversions = Object.entries(typeConversions)
      .filter(([_, t]) => Boolean(t))
      .map(([col, target_type]) => ({
        column: col,
        target_type,
      }));

    const drop_columns = Object.entries(dropColumns)
      .filter(([_, shouldDrop]) => shouldDrop)
      .map(([col]) => col);

    return {
      remove_duplicates: removeDuplicates,
      remove_empty_rows: removeEmptyRows,
      remove_empty_columns: removeEmptyColumns,
      convert_blanks_to_na: convertBlanksToNa,
      standardize_column_names: standardizeColumnNames,
      missing_imputations,
      type_conversions,
      drop_columns,
      text_standardizations: textStandardizations,
      category_normalizations: categoryNormalizations,
      numeric_cleanings: numericCleanings,
      date_cleanings: dateCleanings,
      value_validations: valueValidations,
      custom_replacements: customReplacements,
      find_replaces: findReplaces,
      cleaning_rules: cleaningRules,
      outlier_cleanings: outlierCleanings,
    };
  };

  const handlePreview = async () => {
    if (!selectedDatasetId) return;
    setLoadingAction(true);
    setError('');
    try {
      const payload = buildOperationsPayload();
      const res = await cleaningService.previewCleaning(selectedDatasetId, payload);
      setPreviewData(res);
      setSuccessMessage('Preview generated successfully. Review changes below.');
      setWorkflowStep(4);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingAction(false);
    }
  };

  const handleBulkPreview = async () => {
    if (!selectedDatasetId) return;
    setLoadingAction(true);
    setError('');
    try {
      const payload = buildOperationsPayload();
      const res = await cleaningService.previewBulkOperations(selectedDatasetId, payload);
      setBulkPreviewData(res);
      setPreviewData(res);
      setSuccessMessage('Preview generated successfully. Review staged changes below.');
      setWorkflowStep(4);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingAction(false);
    }
  };

  const handleApply = async () => {
    if (!selectedDatasetId) return;
    setLoadingAction(true);
    setError('');
    setShowConfirmModal(false);
    try {
      const payload = buildOperationsPayload();
      const res = await cleaningService.applyCleaning(selectedDatasetId, payload);
      setApplyResult(res);
      setSuccessMessage(`Cleaning applied successfully! Created version '${res.version || 'Cleaned v1'}'.`);
      setPreviewData(null);
      setBulkPreviewData(null);
      await loadCleaningData(selectedDatasetId);
      setWorkflowStep(6); // Transition directly to Download / Finished Result
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingAction(false);
    }
  };

  const handleBulkApply = async () => {
    return handleApply();
  };

  const handleResetPending = () => {
    setRemoveDuplicates(false);
    setRemoveEmptyRows(false);
    setRemoveEmptyColumns(false);
    setConvertBlanksToNa(false);
    setStandardizeColumnNames(false);
    setImputations({});
    setTypeConversions({});
    setDropColumns({});
    setTextStandardizations([]);
    setCategoryNormalizations([]);
    setNumericCleanings([]);
    setDateCleanings([]);
    setValueValidations([]);
    setCustomReplacements([]);
    setFindReplaces([]);
    setCleaningRules([]);
    setOutlierCleanings([]);
    setPreviewData(null);
    setBulkPreviewData(null);
    setSuccessMessage('Pending cleaning operations have been cleared.');
  };

  // Review button opens existing cleaning controls without applying changes immediately
  const handleReviewSuggestion = (sugg) => {
    const col = sugg.affected_columns?.[0] || '';
    setWorkflowStep(3); // Navigate to Step 3: Clean
    setShowAdvanced(true); // Open Advanced Cleaning

    switch (sugg.action_type) {
      case 'numeric_cleaning':
        setAdvancedCategory('numeric');
        setAdvSubTab('numeric');
        if (col) setNumForm((prev) => ({ ...prev, column: col }));
        break;
      case 'category_normalization':
        setAdvancedCategory('text');
        setAdvSubTab('category');
        if (col) {
          setCatCol(col);
          handleDetectCategoryInconsistencies(col);
        }
        break;
      case 'missing_imputation':
        setAdvancedCategory('missing');
        if (col && sugg.action_payload?.strategy) {
          setImputations((prev) => ({
            ...prev,
            [col]: { strategy: sugg.action_payload.strategy, fill_value: '' },
          }));
        }
        break;
      case 'date_cleaning':
        setAdvancedCategory('dates');
        setAdvSubTab('date');
        if (col) {
          setDateCol(col);
          handleInspectDate(col);
        }
        break;
      case 'duplicates':
        setAdvancedCategory('duplicates');
        setRemoveDuplicates(true);
        break;
      case 'convert_blanks_to_na':
        setAdvancedCategory('duplicates');
        setConvertBlanksToNa(true);
        break;
      case 'outliers':
        setAdvancedCategory('outliers');
        if (col) setOutlierForm((prev) => ({ ...prev, column: col }));
        break;
      case 'type_conversion':
        setAdvancedCategory('missing');
        if (col && sugg.action_payload?.suggested_type) {
          setTypeConversions((prev) => ({ ...prev, [col]: sugg.action_payload.suggested_type }));
        }
        break;
      case 'column_name_cleaning':
        setAdvancedCategory('missing');
        setStandardizeColumnNames(true);
        break;
      default:
        setAdvancedCategory('missing');
    }
  };

  const handleDownloadCleaned = async () => {
    if (!selectedDatasetId) return;
    try {
      await cleaningService.downloadCleanedDataset(selectedDatasetId, overview?.cleaned_filename);
      setDownloadSuccess(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleDownloadExcel = async () => {
    if (!selectedDatasetId) return;
    try {
      await cleaningService.downloadCleanedExcel(selectedDatasetId, overview?.cleaned_filename);
      setDownloadSuccess(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleDownloadReport = async (fmt = 'json') => {
    if (!selectedDatasetId) return;
    try {
      await cleaningService.downloadCleaningReport(selectedDatasetId, fmt);
      setDownloadSuccess(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleRestoreVersion = async (versionTag) => {
    if (!selectedDatasetId) return;
    setLoadingAction(true);
    setError('');
    try {
      const res = await cleaningService.restoreVersion(selectedDatasetId, versionTag);
      setSuccessMessage(res.message || `Version '${versionTag}' successfully restored.`);
      await loadCleaningData(selectedDatasetId);
      setWorkflowStep(6);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingAction(false);
    }
  };

  const handleOpenOriginalPreview = async () => {
    if (!selectedDatasetId) return;
    setLoadingOriginal(true);
    setError('');
    try {
      const data = await cleaningService.getOriginalPreview(selectedDatasetId);
      setOriginalData(data);
      setShowOriginalModal(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingOriginal(false);
    }
  };

  const handleDetectCategoryInconsistencies = async (targetCol = null) => {
    const colToScan = targetCol || catCol;
    if (!selectedDatasetId || !colToScan) return;
    setLoadingClusters(true);
    setError('');
    try {
      const res = await cleaningService.getCategoryInconsistencies(selectedDatasetId, colToScan);
      setCatClusters(res.clusters || []);
      const defaults = {};
      (res.clusters || []).forEach((c) => {
        (c.variants || []).forEach((v) => {
          defaults[v.value] = c.suggested_target;
        });
      });
      setCatMappingsInput(defaults);
      if ((res.clusters || []).length === 0) {
        setSuccessMessage(`No category inconsistencies detected in '${colToScan}'.`);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingClusters(false);
    }
  };

  const handleInspectDate = async (targetCol = null) => {
    const colToScan = targetCol || dateCol;
    if (!selectedDatasetId || !colToScan) return;
    setLoadingDateInspection(true);
    setError('');
    try {
      const res = await cleaningService.inspectDateColumn(selectedDatasetId, colToScan);
      setDateInspection(res);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingDateInspection(false);
    }
  };

  const handleCompareVersions = async (v1, v2) => {
    if (!selectedDatasetId || !v1 || !v2) return;
    setLoadingCompare(true);
    try {
      const res = await cleaningService.compareVersions(selectedDatasetId, v1, v2);
      setCompareResult(res);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoadingCompare(false);
    }
  };

  const handleOpenCompareModal = (targetV2 = '') => {
    if (!versionTimeline || versionTimeline.length < 2) {
      setError('At least 2 dataset versions are required to compare.');
      return;
    }
    const defaultV1 = versionTimeline[0].version_tag;
    const defaultV2 = targetV2 || versionTimeline[versionTimeline.length - 1].version_tag;
    setCompareV1(defaultV1);
    setCompareV2(defaultV2);
    setShowCompareModal(true);
    handleCompareVersions(defaultV1, defaultV2);
  };

  const handleAddOutlierCleaning = () => {
    if (!outlierForm.column) return;
    setOutlierCleanings((prev) => [
      ...prev.filter((c) => c.column !== outlierForm.column),
      {
        column: outlierForm.column,
        method: outlierForm.method,
        threshold: parseFloat(outlierForm.threshold) || 1.5,
        treatment: outlierForm.treatment,
      },
    ]);
    setSuccessMessage(
      `Configured ${outlierForm.method.toUpperCase()} outlier treatment (${outlierForm.treatment}) on column '${outlierForm.column}'.`
    );
  };

  // Step Status Helper
  const getStepStatus = (stepIndex) => {
    if (workflowStep === stepIndex) return 'current';
    if (workflowStep > stepIndex) return 'completed';
    return 'upcoming';
  };

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      {/* 1. Header & Dataset Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">Data Cleaning</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Safe & Versioned
            </span>
          </div>
          <p className="text-xs text-[#64748B] mt-0.5">
            Identify dataset hygiene issues, choose recommended fixes, and save cleaned versions.
          </p>
        </div>

        {/* Dataset Selector Dropdown */}
        <div className="flex items-center gap-2">
          <div className="relative min-w-[220px]">
            <Database className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedDatasetId || ''}
              onChange={(e) => {
                const nextId = e.target.value ? Number(e.target.value) : null;
                setSelectedDatasetId(nextId);
                // Invalidate stale analyses and previews on dataset change
                handleResetPending();
              }}
              disabled={loadingDatasets || loadingAction}
              className="w-full pl-8 pr-8 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all appearance-none cursor-pointer disabled:opacity-50 shadow-2xs"
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
            <button
              onClick={() => loadCleaningData(selectedDatasetId)}
              disabled={loadingOverview || loadingAction}
              title="Refresh Cleaning Status"
              className="p-2 rounded-lg bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#64748B] hover:text-[#0F172A] transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingOverview ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex bg-[#F1F5F9] p-1 rounded-lg border border-[#E2E8F0]">
          <button
            onClick={() => setPageMode('single')}
            className={`flex items-center gap-2 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              pageMode === 'single'
                ? 'bg-white text-[#2563EB] shadow-2xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Single Dataset Cleaning</span>
          </button>
          <button
            onClick={() => setPageMode('relationships')}
            className={`flex items-center gap-2 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              pageMode === 'relationships'
                ? 'bg-white text-[#2563EB] shadow-2xs'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <GitMerge className="w-3.5 h-3.5" />
            <span>Cross-Dataset Relationships</span>
          </button>
        </div>
      </div>

      {pageMode === 'relationships' ? (
        <RelationshipManager
          datasets={datasets}
          selectedDatasetId={selectedDatasetId}
          onDatasetCreated={(newId) => fetchDatasets(newId)}
          onSwitchToSingle={(newId) => {
            if (newId) setSelectedDatasetId(newId);
            setPageMode('single');
          }}
        />
      ) : (
        <>
          {/* SIX-STEP WORKFLOW PROGRESS STEPPER */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-3 shadow-2xs">
            <div className="flex items-center justify-between overflow-x-auto text-xs font-semibold gap-2">
              {[
                { step: 1, label: 'Dataset', disabled: false },
                { step: 2, label: 'Issues', disabled: !selectedDatasetId || !overview },
                { step: 3, label: 'Clean', disabled: !selectedDatasetId || !overview },
                { step: 4, label: 'Preview', disabled: !selectedDatasetId || activeOpsCount === 0 },
                { step: 5, label: 'Save', disabled: !selectedDatasetId || activeOpsCount === 0 },
                { step: 6, label: 'Download', disabled: !selectedDatasetId || (!overview?.has_cleaned && !applyResult) },
              ].map(({ step, label, disabled }) => {
                const status = getStepStatus(step);
                return (
                  <React.Fragment key={step}>
                    <button
                      onClick={() => !disabled && setWorkflowStep(step)}
                      disabled={disabled}
                      className={`flex items-center gap-2 px-3 py-1 rounded-lg transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                        status === 'current'
                          ? 'bg-blue-50 text-[#2563EB] font-bold border border-blue-200'
                          : status === 'completed'
                          ? 'text-emerald-700 hover:bg-emerald-50'
                          : 'text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${
                        status === 'current'
                          ? 'bg-blue-600 text-white'
                          : status === 'completed'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-700'
                      }`}>
                        {status === 'completed' ? '✓' : step}
                      </span>
                      <span>{label}</span>
                    </button>
                    {step < 6 && <span className="text-slate-300">→</span>}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* System Notifications / Alerts */}
          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{successMessage}</span>
              </div>
              <button onClick={() => setSuccessMessage('')} className="text-emerald-700 hover:text-emerald-900 font-bold ml-2 cursor-pointer">✕</button>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 space-y-2.5 text-xs shadow-2xs">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold text-rose-950">
                    Operation Notice
                  </div>
                  <p className="mt-0.5 text-rose-800 leading-relaxed">
                    {error}
                  </p>
                  <p className="mt-1 text-[11px] text-rose-700 font-medium">
                    {error.toLowerCase().includes('load') || error.toLowerCase().includes('not found')
                      ? 'The dataset could not be loaded. Please refresh analysis or select another dataset.'
                      : error.toLowerCase().includes('analysis') || error.toLowerCase().includes('profile')
                      ? 'Analysis failed. Please check the dataset format and try refreshing.'
                      : error.toLowerCase().includes('preview')
                      ? 'Preview could not be generated for the current operations. You may review selections or retry.'
                      : error.toLowerCase().includes('version')
                      ? 'The dataset version was modified. Refreshing analysis will synchronize with the latest state.'
                      : error.toLowerCase().includes('save') || error.toLowerCase().includes('apply')
                      ? 'Save failed. Your original source dataset remains safe and unmodified.'
                      : error.toLowerCase().includes('export') || error.toLowerCase().includes('download')
                      ? 'Export failed. Please retry or choose an alternate export format.'
                      : 'You can retry the current action, navigate back to review selections, or refresh analysis.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rose-200/60">
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    if (workflowStep === 4) handleBulkPreview();
                    else if (workflowStep === 5) handleBulkApply();
                    else if (selectedDatasetId) loadCleaningData(selectedDatasetId);
                  }}
                  className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[11px] shadow-2xs cursor-pointer transition-colors"
                >
                  Retry
                </button>
                {workflowStep > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setWorkflowStep((prev) => Math.max(1, prev - 1));
                    }}
                    className="px-3 py-1 rounded-lg bg-white border border-rose-300 text-rose-800 hover:bg-rose-100 font-semibold text-[11px] cursor-pointer transition-colors"
                  >
                    Go Back
                  </button>
                )}
                {selectedDatasetId && (
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      loadCleaningData(selectedDatasetId);
                    }}
                    className="px-3 py-1 rounded-lg bg-white border border-rose-300 text-rose-800 hover:bg-rose-100 font-semibold text-[11px] cursor-pointer transition-colors"
                  >
                    Refresh Analysis
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setSelectedDatasetId('');
                    setWorkflowStep(1);
                  }}
                  className="px-3 py-1 rounded-lg bg-white border border-rose-300 text-rose-800 hover:bg-rose-100 font-semibold text-[11px] cursor-pointer transition-colors"
                >
                  Select Another Dataset
                </button>
                <button
                  type="button"
                  onClick={() => setError('')}
                  className="px-2.5 py-1 rounded-lg text-rose-600 hover:text-rose-800 text-[11px] ml-auto cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* STEP 1: DATASET STATE: NO_DATASET */}
          {!selectedDatasetId && !loadingDatasets && (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center shadow-2xs">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-[#0F172A]">Select a dataset to start cleaning</h3>
              <p className="text-xs text-[#64748B] max-w-sm mx-auto mt-1 mb-4">
                Choose an uploaded dataset from the selector above to analyze issues and apply recommended fixes.
              </p>
              <button
                onClick={() => navigate('/upload')}
                className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Upload New Dataset</span>
              </button>
            </div>
          )}

          {/* STEP 1: DATASET STATE: DATASET_LOADING */}
          {loadingOverview && (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-12 text-center shadow-2xs">
              <div className="w-8 h-8 rounded-full border-2 border-blue-600/20 border-t-blue-600 animate-spin mx-auto mb-3" />
              <h3 className="text-sm font-bold text-[#0F172A]">Analyzing dataset...</h3>
              <p className="text-xs text-[#64748B] mt-1">Evaluating hygiene metrics and smart suggestions.</p>
            </div>
          )}

          {/* MAIN ACTIVE DATASET CONTENT */}
          {overview && !loadingOverview && (
            <div className="space-y-5">
              {/* STEP 1: DATASET CARD */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#64748B] tracking-wider">Step 1 — Dataset</span>
                    <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2 mt-0.5">
                      {dashboardSummary?.dataset_name || overview.filename}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {dashboardSummary?.current_version || (overview.has_cleaned ? (overview.cleaned_filename || 'Cleaned v1') : 'Original')}
                      </span>
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-5 text-xs text-[#334155]">
                    <div><span className="text-[#64748B]">Rows:</span> <strong className="font-mono text-[#0F172A]">{dashboardSummary?.rows ?? overview?.original_metrics?.total_rows ?? 0}</strong></div>
                    <div><span className="text-[#64748B]">Columns:</span> <strong className="font-mono text-[#0F172A]">{dashboardSummary?.columns ?? overview?.original_metrics?.total_columns ?? 0}</strong></div>
                    <div><span className="text-[#64748B]">Current Version:</span> <strong className="font-mono text-blue-700">{dashboardSummary?.current_version || (overview?.has_cleaned ? 'Cleaned v1' : 'Original')}</strong></div>
                    <div><span className="text-[#64748B]">Status: </span><strong className="font-semibold text-blue-700">{dashboardSummary?.cleaning_status || (overview?.has_cleaned ? 'Partially Cleaned' : 'Not Cleaned')}</strong></div>

                    {workflowStep === 1 && (
                      <button
                        onClick={() => setWorkflowStep(2)}
                        className="ml-auto px-3.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
                      >
                        <span>Continue to Issues</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* STEP 2: ISSUES & HEALTH SUMMARY CARD */}
              {(workflowStep >= 2 || totalIssuesCount > 0) && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#F1F5F9]">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center font-bold text-base font-mono shrink-0">
                        <span className={cleaningScore >= 75 ? 'text-blue-600' : 'text-amber-600'}>{cleaningScore}/100</span>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-bold text-[#64748B] tracking-wider">Step 2 — Issues & Data Cleaning Score</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-sm font-extrabold text-[#0F172A] font-mono">{cleaningScore}/100</span>
                          <span className="text-xs text-slate-400">•</span>
                          <span className="text-xs font-bold text-slate-700 uppercase">{scoreStatus}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowWhyScoreModal(true)}
                      className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] hover:underline flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                    >
                      <span>Why this score?</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* 4 Health Metrics Bullets or Clean state */}
                  {totalIssuesCount === 0 ? (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between text-xs font-semibold">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Your dataset looks good. No cleaning is required.</span>
                      </div>
                      {workflowStep === 2 && (
                        <button
                          onClick={() => setWorkflowStep(6)}
                          className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium cursor-pointer"
                        >
                          Skip to Export
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                        <div className="text-[10px] font-bold text-[#64748B] uppercase">Missing values</div>
                        <div className="text-sm font-bold font-mono mt-1 text-slate-900">{missingCount}</div>
                      </div>
                      <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                        <div className="text-[10px] font-bold text-[#64748B] uppercase">Duplicate rows</div>
                        <div className="text-sm font-bold font-mono mt-1 text-slate-900">{duplicateCount}</div>
                      </div>
                      <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                        <div className="text-[10px] font-bold text-[#64748B] uppercase">Invalid values</div>
                        <div className="text-sm font-bold font-mono mt-1 text-slate-900">{invalidValuesCount}</div>
                      </div>
                      <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
                        <div className="text-[10px] font-bold text-[#64748B] uppercase">Outliers</div>
                        <div className="text-sm font-bold font-mono mt-1 text-slate-900">{outliersCount}</div>
                      </div>
                    </div>
                  )}

                  {/* Prioritized Top 3 Suggestions */}
                  {topSuggestions.length > 0 && (
                    <div className="pt-2 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                          Recommended based on dataset statistics ({topSuggestions.length} prioritized issues)
                        </h4>
                        {prioritizedSuggestions.length > 3 && (
                          <button
                            onClick={() => setShowAllIssues(!showAllIssues)}
                            className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] hover:underline cursor-pointer"
                          >
                            {showAllIssues ? 'Hide extra issues' : `View all issues (${prioritizedSuggestions.length})`}
                          </button>
                        )}
                      </div>

                      <div className="space-y-2.5">
                        {topSuggestions.map((sugg) => (
                          <div
                            key={sugg.id}
                            className="p-4 rounded-xl border border-slate-200 bg-[#F8FAFC] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  sugg.priority?.toLowerCase() === 'critical' ? 'bg-red-100 text-red-800' :
                                  sugg.priority?.toLowerCase() === 'high' ? 'bg-rose-100 text-rose-800' :
                                  sugg.priority?.toLowerCase() === 'medium' ? 'bg-amber-100 text-amber-800' :
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  Priority: {sugg.priority?.toUpperCase()}
                                </span>
                                <h5 className="text-xs font-bold text-[#0F172A]">{sugg.issue}</h5>
                                {sugg.affected_columns?.length > 0 && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                                    {sugg.affected_columns.join(', ')}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-600 font-medium">
                                {sugg.affected_count} affected records {sugg.affected_percentage !== undefined ? `· ${sugg.affected_percentage}% of rows` : ''}
                              </div>
                              <p className="text-[11px] text-[#475569] italic">
                                "{sugg.evidence}"
                              </p>
                              <p className="text-[11px] text-blue-900 font-medium">
                                <strong>Recommended action:</strong> {sugg.recommended_action}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                              <button
                                onClick={() => handleReviewSuggestion(sugg)}
                                className="px-3.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                              >
                                Review
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Expandable All Issues */}
                      {showAllIssues && (
                        <div className="pt-3 border-t border-slate-200 space-y-2">
                          {prioritizedSuggestions.slice(3).map((sugg) => (
                            <div key={sugg.id} className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between text-xs">
                              <div>
                                <span className="font-semibold text-slate-800">{sugg.issue}</span>
                                <span className="text-slate-500 text-[11px] ml-2">({sugg.affected_count} records)</span>
                              </div>
                              <button
                                onClick={() => handleReviewSuggestion(sugg)}
                                className="px-2.5 py-1 rounded border border-slate-300 text-xs font-medium hover:bg-slate-50 cursor-pointer"
                              >
                                Review
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {workflowStep === 2 && (
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <button
                        onClick={() => setWorkflowStep(1)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back to Dataset</span>
                      </button>
                      <button
                        onClick={() => setWorkflowStep(3)}
                        className="px-4 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer shadow-xs flex items-center gap-1"
                      >
                        <span>Continue to Clean</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: CLEAN — CONFIGURE CLEANING OPERATIONS */}
              {workflowStep >= 3 && (
                <div className="space-y-4">
                  {/* Staged Operations & Queue */}
                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F1F5F9]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {activeOpsCount}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-[#0F172A]">
                            Step 3 — Bulk Cleaning Workflow ({activeOpsCount} configured operations)
                          </h4>
                          <p className="text-[11px] text-[#64748B]">
                            Select operations below. Nothing is modified until changes are previewed and saved.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeOpsCount > 0 && (
                          <button
                            onClick={handleResetPending}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium cursor-pointer"
                          >
                            Reset Pending Changes
                          </button>
                        )}
                        <button
                          onClick={handleBulkPreview}
                          disabled={loadingAction || activeOpsCount === 0}
                          className="px-3 py-1.5 rounded-lg border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 text-xs font-semibold cursor-pointer disabled:opacity-40"
                        >
                          Review All Changes
                        </button>
                        <button
                          onClick={() => setWorkflowStep(4)}
                          disabled={activeOpsCount === 0}
                          className="px-4 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer shadow-xs disabled:opacity-40 flex items-center gap-1"
                        >
                          <span>Continue to Preview</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Execution Order Chips */}
                    {activeOpsCount > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-blue-900 uppercase">Execution Order:</span>
                        {pendingOperationsList.map((op) => (
                          <span key={op.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-[11px] text-slate-800 font-medium">
                            <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[9px] font-bold flex items-center justify-center">{op.order}</span>
                            <span>{op.type}</span>
                            <span className="text-slate-500 font-mono text-[10px]">({op.column})</span>
                            <button onClick={op.remove} className="text-slate-400 hover:text-rose-600 ml-0.5 cursor-pointer">✕</button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-500 italic">
                        No operations staged yet. Use Advanced Cleaning below to configure transformations.
                      </div>
                    )}
                  </div>

                  {/* Advanced Cleaning Accordion */}
                  <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-2xs overflow-hidden">
                    <button
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="w-full px-5 py-4 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-2.5">
                        <Sliders className="w-4 h-4 text-[#2563EB]" />
                        <span className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">Advanced Cleaning ⚙️</span>
                        <span className="text-[11px] text-[#64748B]">
                          (Detailed configuration for missing values, duplicates, text, numbers, dates, outliers, custom rules)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {activeOpsCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                            {activeOpsCount} configured
                          </span>
                        )}
                        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {showAdvanced && (
                      <div className="border-t border-[#E2E8F0] p-5 space-y-4">
                        <div className="flex items-center gap-1.5 border-b border-[#E2E8F0] pb-2 overflow-x-auto text-xs font-semibold">
                          {[
                            { id: 'missing', label: `Missing Values (${missingColumns.length})` },
                            { id: 'duplicates', label: `Duplicates (${overview.duplicate_rows_count})` },
                            { id: 'text', label: `Text & Categories` },
                            { id: 'numeric', label: `Numeric Data` },
                            { id: 'dates', label: `Dates` },
                            { id: 'outliers', label: `Outliers` },
                            { id: 'rules', label: `Custom Rules` },
                          ].map((cat) => (
                            <button
                              key={cat.id}
                              onClick={() => setAdvancedCategory(cat.id)}
                              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                                advancedCategory === cat.id
                                  ? 'bg-blue-600 text-white font-bold shadow-2xs'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                            >
                              {cat.label}
                            </button>
                          ))}
                        </div>

                        {/* Sub-tools forms */}
                        {advancedCategory === 'missing' && (
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold text-[#0F172A]">Missing Value Resolution</h4>
                            {missingColumns.length === 0 ? (
                              <div className="p-4 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-medium">No missing values detected.</div>
                            ) : (
                              <div className="border border-slate-200 rounded-lg overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-[#F8FAFC] border-b border-slate-200 text-[10px] text-slate-600 uppercase font-bold">
                                    <tr>
                                      <th className="p-2.5">Column</th>
                                      <th className="p-2.5">Type</th>
                                      <th className="p-2.5">Missing</th>
                                      <th className="p-2.5">Imputation Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200">
                                    {missingColumns.map((col) => {
                                      const currentImp = imputations[col.column_name] || { strategy: '', fill_value: '' };
                                      const isNumeric = ['Integer', 'Float', 'Numeric'].includes(col.inferred_type);
                                      return (
                                        <tr key={col.column_name}>
                                          <td className="p-2.5 font-semibold">{col.column_name}</td>
                                          <td className="p-2.5 text-slate-600">{col.inferred_type}</td>
                                          <td className="p-2.5 font-mono text-amber-700 font-bold">{col.missing_count}</td>
                                          <td className="p-2.5">
                                            <select
                                              value={currentImp.strategy || ''}
                                              onChange={(e) => setImputations({ ...imputations, [col.column_name]: { ...currentImp, strategy: e.target.value } })}
                                              className="px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                                            >
                                              <option value="">-- Do Not Clean --</option>
                                              {isNumeric && <option value="median">Median Imputation</option>}
                                              {isNumeric && <option value="mean">Mean Imputation</option>}
                                              {!isNumeric && <option value="mode">Mode Imputation</option>}
                                              <option value="constant">Constant Value</option>
                                              <option value="ffill">Forward Fill</option>
                                              <option value="bfill">Backward Fill</option>
                                              <option value="drop_rows">Drop Rows</option>
                                            </select>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            <div className="flex items-center gap-4 pt-2">
                              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={standardizeColumnNames}
                                  onChange={(e) => setStandardizeColumnNames(e.target.checked)}
                                  className="rounded border-slate-300 text-blue-600"
                                />
                                <span>Standardize column names to snake_case</span>
                              </label>
                            </div>
                          </div>
                        )}

                        {advancedCategory === 'duplicates' && (
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold text-[#0F172A]">Duplicate & Blank Whitespace Handling</h4>
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={removeDuplicates}
                                  onChange={(e) => setRemoveDuplicates(e.target.checked)}
                                  className="rounded border-slate-300 text-blue-600"
                                />
                                <span>Remove duplicate rows ({overview.duplicate_rows_count} duplicate row(s) found)</span>
                              </label>
                              <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={convertBlanksToNa}
                                  onChange={(e) => setConvertBlanksToNa(e.target.checked)}
                                  className="rounded border-slate-300 text-blue-600"
                                />
                                <span>Convert blank / whitespace-only values to missing (NaN)</span>
                              </label>
                            </div>
                          </div>
                        )}

                        {advancedCategory === 'text' && (
                          <div className="space-y-4">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Target Column</label>
                                  <select
                                    value={tsForm.column}
                                    onChange={(e) => setTsForm({ ...tsForm, column: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                                  >
                                    {overview.columns.map((c) => (
                                      <option key={c.column_name} value={c.column_name}>{c.column_name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Case Conversion</label>
                                  <select
                                    value={tsForm.case_conversion}
                                    onChange={(e) => setTsForm({ ...tsForm, case_conversion: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                                  >
                                    <option value="none">Keep Original Case</option>
                                    <option value="lowercase">lowercase</option>
                                    <option value="uppercase">UPPERCASE</option>
                                    <option value="title">Title Case</option>
                                  </select>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  if (!tsForm.column) return;
                                  setTextStandardizations((prev) => [...prev, { ...tsForm }]);
                                  setSuccessMessage(`Added text standardization rule for '${tsForm.column}'.`);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                              >
                                Add Standardization Rule
                              </button>
                            </div>
                          </div>
                        )}

                        {advancedCategory === 'numeric' && (
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold text-[#0F172A]">Numeric Value Cleaning</h4>
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Target Column</label>
                                  <select
                                    value={numForm.column}
                                    onChange={(e) => setNumForm({ ...numForm, column: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                                  >
                                    {overview.columns.map((c) => (
                                      <option key={c.column_name} value={c.column_name}>{c.column_name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Invalid Treatment</label>
                                  <select
                                    value={numForm.handle_invalid}
                                    onChange={(e) => setNumForm({ ...numForm, handle_invalid: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                                  >
                                    <option value="coerce_na">Convert to NaN</option>
                                    <option value="remove_rows">Drop Rows</option>
                                  </select>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  if (!numForm.column) return;
                                  setNumericCleanings((prev) => [...prev, { ...numForm }]);
                                  setSuccessMessage(`Added numeric rule for '${numForm.column}'.`);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                              >
                                Add Numeric Rule
                              </button>
                            </div>
                          </div>
                        )}

                        {advancedCategory === 'dates' && (
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold text-[#0F172A]">Date Format Standardization</h4>
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Date Column</label>
                                  <select
                                    value={dateCol}
                                    onChange={(e) => setDateCol(e.target.value)}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                                  >
                                    {overview.columns.map((c) => (
                                      <option key={c.column_name} value={c.column_name}>{c.column_name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Format</label>
                                  <select
                                    value={dateOutputFormat}
                                    onChange={(e) => setDateOutputFormat(e.target.value)}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                                  >
                                    <option value="%Y-%m-%d">ISO (YYYY-MM-DD)</option>
                                    <option value="%d/%m/%Y">DD/MM/YYYY</option>
                                  </select>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  if (!dateCol) return;
                                  setDateCleanings((prev) => [...prev, { column: dateCol, target_format: dateOutputFormat, handle_invalid: dateHandleInvalid }]);
                                  setSuccessMessage(`Added date rule for '${dateCol}'.`);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                              >
                                Add Date Rule
                              </button>
                            </div>
                          </div>
                        )}

                        {advancedCategory === 'outliers' && (
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold text-[#0F172A]">Outlier Detection & Treatment</h4>
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Column</label>
                                  <select
                                    value={outlierForm.column}
                                    onChange={(e) => setOutlierForm({ ...outlierForm, column: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                                  >
                                    {overview.columns.map((c) => (
                                      <option key={c.column_name} value={c.column_name}>{c.column_name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Method</label>
                                  <select
                                    value={outlierForm.method}
                                    onChange={(e) => setOutlierForm({ ...outlierForm, method: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                                  >
                                    <option value="iqr">IQR</option>
                                    <option value="zscore">Z-score</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Threshold</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={outlierForm.threshold || 1.5}
                                    onChange={(e) => setOutlierForm({ ...outlierForm, threshold: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Treatment</label>
                                  <select
                                    value={outlierForm.treatment || 'cap'}
                                    onChange={(e) => setOutlierForm({ ...outlierForm, treatment: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                                  >
                                    <option value="cap">Cap</option>
                                    <option value="median">Median</option>
                                    <option value="mean">Mean</option>
                                    <option value="remove">Remove</option>
                                  </select>
                                </div>
                              </div>
                              <button
                                onClick={handleAddOutlierCleaning}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                              >
                                Add Outlier Treatment
                              </button>
                            </div>
                          </div>
                        )}

                        {advancedCategory === 'rules' && (
                          <div className="space-y-4">
                            <h4 className="text-xs font-bold text-[#0F172A]">Cleaning Rule Builder</h4>
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Column</label>
                                  <select
                                    value={ruleForm.column}
                                    onChange={(e) => setRuleForm({ ...ruleForm, column: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                                  >
                                    {overview.columns.map((c) => (
                                      <option key={c.column_name} value={c.column_name}>{c.column_name}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Condition</label>
                                  <select
                                    value={ruleForm.condition}
                                    onChange={(e) => setRuleForm({ ...ruleForm, condition: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                                  >
                                    <option value="less_than">Less Than</option>
                                    <option value="greater_than">Greater Than</option>
                                    <option value="is_negative">Is Negative</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Value</label>
                                  <input
                                    type="text"
                                    value={ruleForm.condition_value}
                                    onChange={(e) => setRuleForm({ ...ruleForm, condition_value: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Action</label>
                                  <select
                                    value={ruleForm.action}
                                    onChange={(e) => setRuleForm({ ...ruleForm, action: e.target.value })}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                                  >
                                    <option value="set_missing">Set NaN</option>
                                    <option value="remove_rows">Remove Rows</option>
                                  </select>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  if (!ruleForm.column) return;
                                  setCleaningRules((prev) => [...prev, { ...ruleForm }]);
                                  setSuccessMessage(`Added rule for '${ruleForm.column}'.`);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                              >
                                Add Rule
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 4: PREVIEW CHANGES */}
              {workflowStep >= 4 && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F1F5F9]">
                    <div>
                      <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                        Step 4 — Cleaning Preview Table
                      </h4>
                      <p className="text-[11px] text-[#64748B]">
                        Verify projected effects before committing changes. Your source file remains untouched.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setWorkflowStep(3)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium cursor-pointer flex items-center gap-1"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back to Clean</span>
                      </button>
                      {(bulkPreviewData || previewData) && (
                        <button
                          onClick={() => setShowConfirmModal(true)}
                          disabled={loadingAction}
                          className="px-4 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer shadow-xs flex items-center gap-1 disabled:opacity-40"
                        >
                          <span>Apply All Cleaning Operations</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {loadingAction && workflowStep === 4 && (
                    <div className="py-8 text-center">
                      <div className="w-8 h-8 rounded-full border-2 border-blue-600/20 border-t-blue-600 animate-spin mx-auto mb-2" />
                      <p className="text-xs text-slate-600 font-medium">Generating preview of selected operations...</p>
                    </div>
                  )}

                  {!loadingAction && !(bulkPreviewData || previewData) && (
                    <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200">
                      <p className="text-xs text-slate-600 mb-3">
                        You have <strong>{activeOpsCount}</strong> configured cleaning operation(s). Generate a preview to review before saving.
                      </p>
                      <button
                        onClick={handleBulkPreview}
                        disabled={loadingAction || activeOpsCount === 0}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-40"
                      >
                        Generate Cleaning Preview
                      </button>
                    </div>
                  )}

                  {!loadingAction && (bulkPreviewData || previewData) && (
                    <>
                      {/* Impact Summary Statistics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Rows Before → After</span>
                          <div className="font-mono font-bold mt-1 text-slate-900">
                            {previewData?.before?.total_rows ?? overview.original_metrics.total_rows} → {previewData?.after?.total_rows ?? overview.original_metrics.total_rows}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Columns Before → After</span>
                          <div className="font-mono font-bold mt-1 text-slate-900">
                            {previewData?.before?.total_columns ?? overview.original_metrics.total_columns} → {previewData?.after?.total_columns ?? overview.original_metrics.total_columns}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Missing Values Remaining</span>
                          <div className="font-mono font-bold mt-1 text-emerald-700">
                            {previewData?.after?.missing_cells ?? 0}
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase">Total Cells Affected</span>
                          <div className="font-mono font-bold mt-1 text-blue-700">
                            {previewData?.total_cells_changed || bulkPreviewData?.total_cells_affected || 0}
                          </div>
                        </div>
                      </div>

                      {/* Step 4 Preview Table */}
                      {(() => {
                        const rawSample = bulkPreviewData?.sample_preview || previewData?.sample_preview || [];
                        const sampleRows = Array.isArray(rawSample) ? rawSample.slice(0, previewRowsLimit) : [];
                        const cols = previewData?.sample_columns || previewData?.columns || bulkPreviewData?.columns || (sampleRows.length > 0 ? Object.keys(sampleRows[0]) : []);
                        const totalRows = previewData?.after?.total_rows ?? overview.original_metrics.total_rows;
                        const cellDiffs = previewData?.cell_diffs || bulkPreviewData?.cell_diffs || [];

                        return (
                          <div className="space-y-3 pt-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-950">
                              <div>
                                <span className="font-bold">Preview Sample: </span>
                                Showing first {sampleRows.length} rows of {totalRows} rows.
                                <span className="text-slate-600 block sm:inline sm:ml-1">
                                  Note: This table displays projected changes, not the complete dataset.
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[11px] text-slate-600 font-medium">Rows to show:</span>
                                {[5, 10].map((lim) => (
                                  <button
                                    key={lim}
                                    type="button"
                                    onClick={() => setPreviewRowsLimit(lim)}
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors cursor-pointer ${
                                      previewRowsLimit === lim
                                        ? 'bg-blue-600 text-white shadow-2xs'
                                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                                    }`}
                                  >
                                    {lim}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {sampleRows.length > 0 ? (
                              <div className="overflow-x-auto max-h-72 border border-[#E2E8F0] rounded-xl shadow-2xs">
                                <table className="min-w-full text-xs text-left border-collapse">
                                  <thead className="bg-[#F8FAFC] text-[#475569] font-bold border-b border-[#E2E8F0] sticky top-0 z-10">
                                    <tr>
                                      <th className="px-3 py-2 text-[10px] text-slate-400 font-mono uppercase w-10">#</th>
                                      {cols.map((col) => (
                                        <th key={col} className="px-3 py-2 whitespace-nowrap text-[11px]">
                                          {col}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#F1F5F9] bg-white">
                                    {sampleRows.map((row, rIdx) => (
                                      <tr key={rIdx} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="px-3 py-1.5 font-mono text-[10px] text-slate-400 select-none">
                                          {rIdx + 1}
                                        </td>
                                        {cols.map((col) => {
                                          const val = row[col];
                                          const isDiff = cellDiffs.some((d) => d.row_index === rIdx && d.column === col);
                                          return (
                                            <td
                                              key={col}
                                              className={`px-3 py-1.5 whitespace-nowrap text-[#334155] ${
                                                isDiff ? 'bg-amber-50 font-semibold text-amber-900 border-l-2 border-amber-400' : ''
                                              }`}
                                            >
                                              {val === null || val === undefined || val === '' ? (
                                                <span className="text-slate-300 italic">null</span>
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
                            ) : (
                              <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                                Projected sample rows unavailable. Statistical metrics computed above reflect the full dataset.
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              )}

              {/* STEP 5: SAVE CONFIRMATION CARD (IF STEP 5 SELECTED DIRECTLY) */}
              {workflowStep === 5 && !overview.has_cleaned && !applyResult && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F1F5F9]">
                    <div>
                      <h4 className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">
                        Step 5 — Save Dataset Version
                      </h4>
                      <p className="text-[11px] text-[#64748B]">
                        Review confirmation and commit your verified cleaning operations.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setWorkflowStep(4)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium cursor-pointer flex items-center gap-1"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back to Preview</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200 text-xs text-blue-950 space-y-2">
                    <div className="font-semibold text-sm text-[#0F172A]">Confirm Operations to Apply</div>
                    <p className="text-slate-600">
                      Target Dataset: <strong>{overview?.filename}</strong> ({activeOpsCount} operation(s) configured)
                    </p>
                    <p className="text-slate-600">
                      A new immutable version will be created. Your original uploaded dataset remains strictly unchanged.
                    </p>
                  </div>

                  <div className="flex justify-end gap-2.5 pt-2">
                    <button
                      onClick={() => setWorkflowStep(4)}
                      className="px-4 py-2 rounded-lg border border-[#CBD5E1] text-xs font-medium text-[#475569] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBulkApply}
                      disabled={loadingAction || activeOpsCount === 0}
                      className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs disabled:opacity-40"
                    >
                      {loadingAction ? 'Saving Version...' : 'Confirm & Save Dataset Version'}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 6: DOWNLOAD & FINAL ACTIONS */}
              {(workflowStep >= 6 || overview.has_cleaned) && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-2xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <h3 className="text-sm font-bold text-[#0F172A]">Cleaning completed</h3>
                      </div>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        {overview.cleaned_filename || 'Customer_Data_cleaned.csv'} • {overview.original_metrics.total_rows} → {overview.cleaned_metrics?.total_rows || overview.original_metrics.total_rows} rows • Missing: {overview.original_metrics.missing_cells} → {overview.cleaned_metrics?.missing_cells || 0}
                      </p>
                    </div>

                    {/* 3 Primary Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setShowCleanedPreview(!showCleanedPreview)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-colors cursor-pointer shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Cleaned View</span>
                      </button>

                      <button
                        onClick={handleDownloadCleaned}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors cursor-pointer shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Cleaned CSV</span>
                      </button>

                      <button
                        onClick={handleDownloadExcel}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] text-white transition-colors cursor-pointer shadow-xs"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Download Cleaned Excel</span>
                      </button>

                      <button
                        onClick={() => handleDownloadReport('json')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-[#0F172A] border border-[#CBD5E1] transition-colors cursor-pointer shadow-2xs"
                      >
                        <FileText className="w-3.5 h-3.5 text-[#2563EB]" />
                        <span>Download Cleaning Report</span>
                      </button>
                    </div>
                  </div>

                  {/* Real CSV Before vs After Cleaning Comparison Chart */}
                  {overview.has_cleaned && overview.cleaned_metrics && (
                    <div className="pt-3 border-t border-[#F1F5F9]">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* 1. Row Count Comparison */}
                        <AnalyticalChart
                          chartData={{
                            recommended: true,
                            chart_type: 'bar',
                            title: 'Total Records (Before vs After)',
                            x_axis_label: 'Dataset Version',
                            data_points: [
                              {
                                label: 'Original',
                                value: overview.original_metrics.total_rows ?? 0,
                                color: '#4778E8',
                              },
                              {
                                label: 'Cleaned',
                                value: overview.cleaned_metrics.total_rows ?? 0,
                                color: '#38A995',
                              },
                            ],
                          }}
                          emptyMessage="Insufficient data to generate this chart."
                        />

                        {/* 2. Missing Values Resolved Comparison */}
                        <AnalyticalChart
                          chartData={{
                            recommended: true,
                            chart_type: 'bar',
                            title: 'Missing Cells (Before vs After)',
                            x_axis_label: 'Dataset Version',
                            data_points: [
                              {
                                label: 'Original',
                                value: overview.original_metrics.missing_cells ?? 0,
                                color: '#E97A62',
                              },
                              {
                                label: 'Cleaned',
                                value: overview.cleaned_metrics.missing_cells ?? 0,
                                color: '#38A995',
                              },
                            ],
                          }}
                          emptyMessage="Insufficient data to generate this chart."
                        />

                        {/* 3. Duplicate Rows Removed Comparison */}
                        <AnalyticalChart
                          chartData={{
                            recommended: true,
                            chart_type: 'bar',
                            title: 'Duplicates (Before vs After)',
                            x_axis_label: 'Dataset Version',
                            data_points: [
                              {
                                label: 'Original',
                                value: overview.original_metrics.duplicate_rows ?? 0,
                                color: '#E97A62',
                              },
                              {
                                label: 'Cleaned',
                                value: overview.cleaned_metrics.duplicate_rows ?? 0,
                                color: '#38A995',
                              },
                            ],
                          }}
                          emptyMessage="Insufficient data to generate this chart."
                        />
                      </div>
                    </div>
                  )}

                  {/* Cleaned Dataset Preview */}
                  {showCleanedPreview && overview.cleaned_sample_preview && (
                    <div id="cleaned-dataset-preview" className="pt-3 border-t border-emerald-100 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <h4 className="text-xs font-bold text-emerald-950">Cleaned Data Preview</h4>
                        <div className="text-[11px] text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                          <span className="font-semibold">Preview Sample: </span>
                          Showing first {Math.min(10, overview.cleaned_sample_preview.length)} of {overview.cleaned_metrics?.total_rows || overview.original_metrics.total_rows} rows. Note: This table is a preview, not the complete dataset.
                        </div>
                      </div>
                      <div className="border border-emerald-200 rounded-xl overflow-x-auto bg-white max-h-72">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[10px] text-[#475569] font-bold uppercase sticky top-0">
                            <tr>
                              {(overview.cleaned_columns || Object.keys(overview.cleaned_sample_preview[0] || {})).map((col) => (
                                <th key={col} className="py-2 px-3 whitespace-nowrap">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E2E8F0]">
                            {overview.cleaned_sample_preview.map((row, idx) => (
                              <tr key={idx} className="hover:bg-emerald-50/20">
                                {(overview.cleaned_columns || Object.keys(overview.cleaned_sample_preview[0] || {})).map((col) => (
                                  <td key={col} className="py-2 px-3 font-mono text-[11px] text-[#0F172A] whitespace-nowrap">
                                    {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-[#94A3B8]">null</span>}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Version Flow & Timeline Toggle */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[#64748B]">
                      Version flow: <strong>Original → Cleaned v1 → Cleaned v2</strong>
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleOpenOriginalPreview}
                        className="text-[#2563EB] hover:underline font-medium cursor-pointer"
                      >
                        Previous CSV
                      </button>
                      <span>•</span>
                      <button
                        onClick={() => setShowVersionHistory(!showVersionHistory)}
                        className="text-[#2563EB] hover:underline font-medium cursor-pointer"
                      >
                        {showVersionHistory ? 'Hide Version History' : 'Dataset Version Timeline'}
                      </button>
                    </div>
                  </div>

                  {showVersionHistory && (
                    <div className="pt-3 border-t border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-[#0F172A]">Dataset Version Timeline</h4>
                        {versionTimeline?.length >= 2 && (
                          <button
                            onClick={() => handleOpenCompareModal()}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 text-xs font-medium cursor-pointer"
                          >
                            <GitMerge className="w-3.5 h-3.5" />
                            <span>Compare Versions</span>
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {(versionTimeline || []).map((v) => (
                          <div key={v.version_tag} className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${v.is_current ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                                {v.version_tag}
                              </span>
                              <span className="text-slate-600">{new Date(v.timestamp).toLocaleString()}</span>
                              <span className="text-slate-400">•</span>
                              <span className="font-mono">{v.rows} rows, {v.columns} cols</span>
                              {v.quality_score !== null && (
                                <span className="font-mono font-bold text-blue-700">({v.quality_score}/100)</span>
                              )}
                            </div>
                            <div>
                              {!v.is_current && (
                                <button
                                  onClick={() => handleRestoreVersion(v.version_tag)}
                                  className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer"
                                >
                                  Restore Previous Version
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* MODAL 1: Why This Score / Validation & Quality Score */}
      {showWhyScoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-[#CBD5E1] shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">Cleaning Validation & Quality Score</h3>
                  <p className="text-[11px] text-[#64748B]">Deterministic 0–100 Data Hygiene Score Breakdown</p>
                </div>
              </div>
              <button onClick={() => setShowWhyScoreModal(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto space-y-4">
              <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-blue-900">Current Score</div>
                  <div className="text-xl font-bold font-mono text-blue-950">{cleaningScore}/100 ({scoreStatus})</div>
                </div>
                <div className="text-xs text-blue-800 max-w-sm">
                  Calculated deterministically across 6 core weights comparing remaining issues against baseline state.
                </div>
              </div>

              {validationReport?.checks && (
                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAFC] border-b border-slate-200 text-[10px] text-slate-600 uppercase font-bold">
                      <tr>
                        <th className="p-2.5">Metric</th>
                        <th className="p-2.5 text-right">Before</th>
                        <th className="p-2.5 text-right">After</th>
                        <th className="p-2.5 text-right">Remaining</th>
                        <th className="p-2.5 text-right">Weight</th>
                        <th className="p-2.5 text-right">Score</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {validationReport.checks.map((chk, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-semibold text-slate-800">{chk.check_name}</td>
                          <td className="p-2.5 text-right font-mono">{chk.before_value}</td>
                          <td className="p-2.5 text-right font-mono">{chk.after_value}</td>
                          <td className="p-2.5 text-right font-mono font-bold">{chk.remaining_issues ?? chk.after_value}</td>
                          <td className="p-2.5 text-right font-mono">{chk.weight}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-blue-600">{chk.component_score}</td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${chk.status === 'Resolved' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                              {chk.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button onClick={() => setShowWhyScoreModal(false)} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Confirm Cleaning Operations */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-[#CBD5E1] shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">Confirm Cleaning Operations</h3>
                <p className="text-[11px] text-[#64748B]">
                  Target: {overview?.filename} ({activeOpsCount} operation(s) configured)
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200 text-xs text-blue-950 font-medium">
              {(() => {
                const cells = previewData?.total_cells_changed || bulkPreviewData?.total_cells_affected || Math.max(activeOpsCount * 12, 1);
                const rows = previewData?.rows_removed || bulkPreviewData?.total_rows_removed || (removeDuplicates ? (overview?.duplicate_rows_count || 0) : 0);
                return `You are about to modify ${cells.toLocaleString()} cells and remove ${rows.toLocaleString()} rows.`;
              })()}
            </div>

            <p className="text-xs text-[#475569]">
              A new atomic version will be generated. Your original uploaded dataset remains completely safe, immutable, and untouched on storage disk.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-lg border border-[#CBD5E1] text-xs font-medium text-[#475569] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={pendingOperationsList.length > 0 ? handleBulkApply : handleApply}
                disabled={loadingAction}
                className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                {loadingAction ? 'Applying...' : 'Apply All Cleaning Operations'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Original Dataset View (Previous CSV) */}
      {showOriginalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-[#CBD5E1] shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">Original Dataset View (Previous CSV)</h3>
                  <p className="text-[11px] text-[#64748B]">
                    Untouched source dataset: {originalData?.filename || overview?.filename} ({originalData?.total_rows || overview?.original_metrics?.total_rows} rows × {originalData?.total_columns || overview?.original_metrics?.total_columns} columns)
                  </p>
                </div>
              </div>
              <button onClick={() => setShowOriginalModal(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto border border-[#E2E8F0] rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[10px] text-[#475569] font-bold uppercase sticky top-0">
                  <tr>
                    {(originalData?.columns || overview?.columns?.map((c) => c.column_name) || []).map((col) => (
                      <th key={col} className="py-2.5 px-3 whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {(originalData?.sample_rows || []).map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#F8FAFC]">
                      {(originalData?.columns || []).map((col) => (
                        <td key={col} className="py-2 px-3 font-mono text-[11px] text-[#0F172A] whitespace-nowrap">
                          {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-[#94A3B8]">null</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button onClick={() => setShowOriginalModal(false)} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer">
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Version Comparison */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-[#CBD5E1] shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <GitMerge className="w-5 h-5 text-blue-600" />
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">Dataset Version Comparison</h3>
                  <p className="text-[11px] text-[#64748B]">Compare metrics and deltas between dataset versions.</p>
                </div>
              </div>
              <button onClick={() => setShowCompareModal(false)} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Version 1 (Baseline)</label>
                <select
                  value={compareV1}
                  onChange={(e) => {
                    setCompareV1(e.target.value);
                    handleCompareVersions(e.target.value, compareV2);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                >
                  {(versionTimeline || []).map((v) => (
                    <option key={v.version_tag} value={v.version_tag}>{v.version_tag} ({new Date(v.timestamp).toLocaleDateString()})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Version 2 (Target)</label>
                <select
                  value={compareV2}
                  onChange={(e) => {
                    setCompareV2(e.target.value);
                    handleCompareVersions(compareV1, e.target.value);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                >
                  {(versionTimeline || []).map((v) => (
                    <option key={v.version_tag} value={v.version_tag}>{v.version_tag} ({new Date(v.timestamp).toLocaleDateString()})</option>
                  ))}
                </select>
              </div>
            </div>

            {compareResult && (
              <div className="flex-1 overflow-auto border border-[#E2E8F0] rounded-xl p-3">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[10px] text-[#475569] font-bold uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Metric</th>
                      <th className="py-2.5 px-3 text-right">{compareResult.v1_tag}</th>
                      <th className="py-2.5 px-3 text-right">{compareResult.v2_tag}</th>
                      <th className="py-2.5 px-3 text-right">Delta / Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {[
                      { label: 'Total Rows', v1: compareResult.v1_metrics?.rows, v2: compareResult.v2_metrics?.rows, delta: compareResult.deltas?.rows_delta },
                      { label: 'Total Columns', v1: compareResult.v1_metrics?.columns, v2: compareResult.v2_metrics?.columns, delta: compareResult.deltas?.columns_delta },
                      { label: 'Missing Cells', v1: compareResult.v1_metrics?.missing_cells, v2: compareResult.v2_metrics?.missing_cells, delta: compareResult.deltas?.missing_delta },
                      { label: 'Duplicate Rows', v1: compareResult.v1_metrics?.duplicate_rows, v2: compareResult.v2_metrics?.duplicate_rows, delta: compareResult.deltas?.duplicates_delta },
                      { label: 'Blank Cells', v1: compareResult.v1_metrics?.blank_cells, v2: compareResult.v2_metrics?.blank_cells, delta: compareResult.deltas?.blanks_delta },
                      { label: 'Outliers Detected', v1: compareResult.v1_metrics?.outliers, v2: compareResult.v2_metrics?.outliers, delta: compareResult.deltas?.outliers_delta },
                      { label: 'Cleaning Quality Score', v1: compareResult.v1_metrics?.score, v2: compareResult.v2_metrics?.score, delta: compareResult.deltas?.score_delta, isScore: true },
                    ].map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#F8FAFC]">
                        <td className="py-2.5 px-3 font-semibold text-[#0F172A]">{row.label}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">{row.v1 ?? '—'}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#0F172A]">{row.v2 ?? '—'}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">
                          {row.delta !== undefined ? (
                            <span className={row.isScore ? (row.delta > 0 ? 'text-emerald-600' : 'text-slate-600') : (row.delta < 0 ? 'text-emerald-600' : 'text-slate-600')}>
                              {row.delta > 0 ? `+${row.delta}` : row.delta}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button onClick={() => setShowCompareModal(false)} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer">
                Close Comparison
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CleaningPage;
