import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileText,
  Download,
  Printer,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Database,
  BarChart3,
  Lightbulb,
  Table as TableIcon,
  Sparkles,
  Info,
  Calendar,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { datasetService } from '../services/datasetService';
import { analyticsService } from '../services/analyticsService';
import { extractErrorMessage } from '../services/api';
import { AnalyticalChart } from '../components/AnalyticalChart';

export const ReportsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Dataset selection state
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState('original');
  const [loadingDatasets, setLoadingDatasets] = useState(true);

  // Report configuration options
  const [customTitle, setCustomTitle] = useState('');
  const [includeKpis, setIncludeKpis] = useState(true);
  const [includeStats, setIncludeStats] = useState(true);
  const [includeInsights, setIncludeInsights] = useState(true);

  // Generated Report state
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState('');

  // 1. Fetch user's real datasets
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
        } else if (validList.length > 0) {
          setSelectedDatasetId(validList[0].id);
        }
      } catch (err) {
        setReportError(extractErrorMessage(err));
      } finally {
        setLoadingDatasets(false);
      }
    };
    fetchDatasets();
  }, [searchParams]);

  // Persist dataset selection to localStorage
  useEffect(() => {
    if (selectedDatasetId) {
      localStorage.setItem('selected_dataset_id', String(selectedDatasetId));
    }
  }, [selectedDatasetId]);

  // Selected dataset object
  const selectedDataset = useMemo(() => {
    return datasets.find((d) => d.id === selectedDatasetId) || null;
  }, [datasets, selectedDatasetId]);

  const hasCleanedVersion = Boolean(
    selectedDataset?.cleaned_filename || selectedDataset?.has_cleaned_version
  );

  // 2. Generate report action
  const handleGenerateReport = async () => {
    if (!selectedDatasetId) return;
    setLoadingReport(true);
    setReportError('');
    try {
      const data = await analyticsService.generateReport({
        dataset_id: selectedDatasetId,
        version: selectedVersion,
        title: customTitle.trim() || undefined,
        include_kpis: includeKpis,
        include_stats: includeStats,
        include_insights: includeInsights,
      });
      setReport(data);
    } catch (err) {
      setReportError(extractErrorMessage(err));
      setReport(null);
    } finally {
      setLoadingReport(false);
    }
  };

  // Download Report as Markdown (.md)
  const handleDownloadMarkdown = () => {
    if (!report) return;

    let md = `# ${report.title || 'Executive Analytics Report'}\n\n`;
    md += `* **Dataset:** ${report.dataset_name} (#${report.dataset_id})\n`;
    md += `* **Version:** ${report.version}\n`;
    md += `* **Generated At:** ${new Date(report.generated_at).toLocaleString()}\n\n`;
    md += `---\n\n`;

    // Overview & KPIs
    if (report.overview) {
      md += `## 1. Executive Dataset Summary\n\n`;
      md += `* **Total Rows:** ${report.overview.total_rows?.toLocaleString() || 0}\n`;
      md += `* **Total Columns:** ${report.overview.total_columns || 0}\n`;
      md += `* **Missing Values Ratio:** ${(report.overview.missing_ratio * 100 || 0).toFixed(2)}%\n`;
      md += `* **Duplicate Rows:** ${report.overview.duplicate_rows?.toLocaleString() || 0}\n\n`;
    }

    // Statistical Profiles
    if (report.statistics && report.statistics.column_stats) {
      md += `## 2. Statistical Profiles & Distributions\n\n`;
      md += `| Column | Mean | Std | Min | Median | Max | Outliers (IQR) |\n`;
      md += `|---|---|---|---|---|---|---|\n`;
      Object.entries(report.statistics.column_stats).forEach(([col, s]) => {
        md += `| ${col} | ${s.mean?.toFixed(2) ?? '—'} | ${s.std?.toFixed(2) ?? '—'} | ${s.min ?? '—'} | ${s.median ?? '—'} | ${s.max ?? '—'} | ${s.iqr_outliers_count ?? 0} |\n`;
      });
      md += `\n`;
    }

    // Key Insights
    if (report.insights && report.insights.insights && report.insights.insights.length > 0) {
      md += `## 3. Automated Key Insights & Observations\n\n`;
      report.insights.insights.forEach((ins, idx) => {
        md += `### ${idx + 1}. ${ins.title}\n`;
        md += `* **Category:** ${ins.type} | **Severity:** ${ins.severity} | **Confidence:** ${ins.confidence}\n`;
        if (ins.metric) md += `* **Key Metric:** ${ins.metric}\n`;
        md += `\n${ins.statement}\n\n`;
        if (ins.limitations) md += `*Caveat / Limitations:* ${ins.limitations}\n\n`;
      });
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_dataset_${report.dataset_id}_${report.version}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#EFF6FF] text-[#2563EB]">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#0F172A]">Analytical Reports</h1>
            <p className="text-xs text-[#64748B] mt-0.5">
              Compile and export comprehensive executive intelligence briefs from actual dataset measurements.
            </p>
          </div>
        </div>

        {/* Global Controls & Actions */}
        {report && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#0F172A] text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-[#64748B]" />
              <span>Print / PDF</span>
            </button>
            <button
              onClick={handleDownloadMarkdown}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Markdown</span>
            </button>
          </div>
        )}
      </div>

      {/* Generator Configuration Card */}
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-4">
          <h2 className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#2563EB]" />
            <span>Report Configuration</span>
          </h2>
          <span className="text-xs text-[#64748B]">Select dataset and sections to synthesize</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Dataset Selector */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Target Dataset
            </label>
            <div className="relative">
              <select
                value={selectedDatasetId || ''}
                onChange={(e) => {
                  const id = parseInt(e.target.value, 10);
                  setSelectedDatasetId(id);
                  setSearchParams({ dataset_id: id }, { replace: true });
                }}
                disabled={loadingDatasets || datasets.length === 0}
                className="w-full appearance-none bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3.5 py-2 pr-9 text-xs font-medium text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 cursor-pointer disabled:opacity-50"
              >
                {datasets.length === 0 ? (
                  <option value="">No datasets available</option>
                ) : (
                  datasets.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.original_filename || d.filename} (#{d.id})
                    </option>
                  ))
                )}
              </select>
              <ChevronDown className="w-4 h-4 text-[#64748B] absolute right-3 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Version Selector */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Data Pipeline Version
            </label>
            <div className="flex items-center bg-[#F1F5F9] rounded-xl p-1 border border-[#E2E8F0] text-xs font-semibold h-[38px]">
              <button
                type="button"
                onClick={() => setSelectedVersion('original')}
                className={`flex-1 py-1 rounded-lg transition-colors cursor-pointer ${
                  selectedVersion === 'original'
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Original
              </button>
              <button
                type="button"
                onClick={() => setSelectedVersion('cleaned')}
                disabled={!hasCleanedVersion}
                className={`flex-1 py-1 rounded-lg transition-colors cursor-pointer ${
                  selectedVersion === 'cleaned'
                    ? 'bg-[#2563EB] text-white shadow-xs'
                    : hasCleanedVersion
                    ? 'text-[#64748B] hover:text-[#0F172A]'
                    : 'text-[#CBD5E1] cursor-not-allowed'
                }`}
              >
                Cleaned {hasCleanedVersion ? '' : '(N/A)'}
              </button>
            </div>
          </div>

          {/* Custom Report Title */}
          <div>
            <label className="block text-xs font-semibold text-[#0F172A] mb-1.5">
              Custom Report Title (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Q3 Sales & Operational Performance"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              className="w-full bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl px-3.5 py-2 text-xs text-[#0F172A] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>
        </div>

        {/* Section Inclusion Checkboxes & Generate Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-[#F1F5F9]">
          <div className="flex flex-wrap items-center gap-5 text-xs">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-[#334155]">
              <input
                type="checkbox"
                checked={includeKpis}
                onChange={(e) => setIncludeKpis(e.target.checked)}
                className="rounded text-[#2563EB] focus:ring-[#2563EB]/20 cursor-pointer"
              />
              <span>Executive KPIs & Health</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer font-medium text-[#334155]">
              <input
                type="checkbox"
                checked={includeStats}
                onChange={(e) => setIncludeStats(e.target.checked)}
                className="rounded text-[#2563EB] focus:ring-[#2563EB]/20 cursor-pointer"
              />
              <span>Statistical Distributions</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer font-medium text-[#334155]">
              <input
                type="checkbox"
                checked={includeInsights}
                onChange={(e) => setIncludeInsights(e.target.checked)}
                className="rounded text-[#2563EB] focus:ring-[#2563EB]/20 cursor-pointer"
              />
              <span>Automated Key Drivers</span>
            </label>
          </div>

          <button
            onClick={handleGenerateReport}
            disabled={loadingReport || !selectedDatasetId}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {loadingReport ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Synthesizing Report...</span>
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                <span>Generate Executive Report</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {reportError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{reportError}</span>
          </div>
          <button
            onClick={handleGenerateReport}
            className="px-3 py-1 bg-white border border-red-300 rounded-lg text-red-700 hover:bg-red-50 font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State: Prompt user to generate */}
      {!loadingReport && !report && !reportError && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-14 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center mx-auto mb-4">
            <FileText className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#0F172A]">No Report Generated Yet</h3>
          <p className="text-xs text-[#64748B] max-w-md mx-auto mt-2 leading-relaxed">
            Select your dataset and click <strong className="text-[#0F172A]">"Generate Executive Report"</strong> above to aggregate KPIs, statistical distributions, and automated insights.
          </p>
        </div>
      )}

      {/* Generated Report Content Preview */}
      {report && (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 shadow-xs space-y-8 animate-in fade-in duration-200">
          {/* Report Cover / Header */}
          <div className="border-b border-[#E2E8F0] pb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#64748B] mb-2">
              <span className="flex items-center gap-1.5 font-medium">
                <Database className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>{report.dataset_name} (#{report.dataset_id})</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#94A3B8]" />
                <span>Generated {new Date(report.generated_at).toLocaleString()}</span>
              </span>
            </div>

            <h2 className="text-2xl font-black text-[#0F172A] tracking-tight">
              {report.title}
            </h2>

            <div className="mt-2 flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
                Pipeline: {report.version.toUpperCase()}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Status: Complete & Verified
              </span>
            </div>
          </div>

          {/* Section 1: KPIs & Profile Overview */}
          {report.overview && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#2563EB]" />
                <span>1. Dataset Architecture & Health Overview</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[11px] text-[#64748B] font-medium">Total Rows</span>
                  <div className="text-xl font-bold text-[#0F172A] mt-1">
                    {(report.overview.total_rows ?? 0).toLocaleString()}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[11px] text-[#64748B] font-medium">Total Columns</span>
                  <div className="text-xl font-bold text-[#0F172A] mt-1">
                    {report.overview.total_columns ?? 0}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[11px] text-[#64748B] font-medium">Missing Value Ratio</span>
                  <div className="text-xl font-bold text-[#0F172A] mt-1">
                    {((report.overview.missing_ratio ?? 0) * 100).toFixed(2)}%
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[11px] text-[#64748B] font-medium">Duplicate Records</span>
                  <div className="text-xl font-bold text-[#0F172A] mt-1">
                    {(report.overview.duplicate_rows ?? 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 2: Statistical Profiles */}
          {report.statistics && report.statistics.column_stats && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-[#2563EB]" />
                <span>2. Numerical Attribute Statistics & Outlier Bounds</span>
              </h3>

              {/* Real Feature Means Comparison Chart */}
              {(() => {
                const stats = report.statistics.column_stats || {};
                const points = Object.entries(stats)
                  .filter(([_, s]) => typeof s.mean === 'number' && !isNaN(s.mean))
                  .slice(0, 8)
                  .map(([col, s]) => ({
                    label: col,
                    value: parseFloat(s.mean.toFixed(2)),
                  }));

                if (points.length === 0) {
                  return null;
                }

                return (
                  <AnalyticalChart
                    chartData={{
                      recommended: true,
                      chart_type: 'bar',
                      title: 'Executive Feature Comparison (Calculated Mean Values)',
                      x_axis_label: 'Numerical Attribute',
                      data_points: points,
                    }}
                    emptyMessage="Insufficient data to generate this chart."
                  />
                );
              })()}

              <div className="overflow-x-auto border border-[#E2E8F0] rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] uppercase font-semibold text-[11px]">
                    <tr>
                      <th className="px-4 py-3">Column</th>
                      <th className="px-4 py-3">Mean</th>
                      <th className="px-4 py-3">Std Dev</th>
                      <th className="px-4 py-3">Min</th>
                      <th className="px-4 py-3">Median</th>
                      <th className="px-4 py-3">Max</th>
                      <th className="px-4 py-3">IQR Outliers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0]">
                    {Object.entries(report.statistics.column_stats).map(([col, s]) => (
                      <tr key={col} className="hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3 font-semibold text-[#0F172A]">{col}</td>
                        <td className="px-4 py-3 text-[#334155]">{s.mean?.toFixed(2) ?? '—'}</td>
                        <td className="px-4 py-3 text-[#334155]">{s.std?.toFixed(2) ?? '—'}</td>
                        <td className="px-4 py-3 text-[#334155]">{s.min ?? '—'}</td>
                        <td className="px-4 py-3 text-[#334155]">{s.median ?? '—'}</td>
                        <td className="px-4 py-3 text-[#334155]">{s.max ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded font-mono text-[11px] ${
                              (s.iqr_outliers_count ?? 0) > 0
                                ? 'bg-amber-50 text-amber-700 font-semibold'
                                : 'text-[#64748B]'
                            }`}
                          >
                            {s.iqr_outliers_count ?? 0}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 3: Automated Insights Takeaways */}
          {report.insights && report.insights.insights && report.insights.insights.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-[#2563EB]" />
                <span>3. Key Driver Observations & Narrative Takeaways</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {report.insights.insights.map((ins) => (
                  <div
                    key={ins.id}
                    className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-[#2563EB] uppercase tracking-wider">
                        {ins.type}
                      </span>
                      <span className="text-[#64748B]">{ins.confidence} Confidence</span>
                    </div>

                    <h4 className="text-xs font-bold text-[#0F172A]">{ins.title}</h4>

                    {ins.metric && (
                      <span className="inline-block px-2 py-0.5 rounded bg-[#EFF6FF] text-[#1D4ED8] text-[11px] font-semibold">
                        {ins.metric}
                      </span>
                    )}

                    <p className="text-xs text-[#334155] leading-relaxed">{ins.statement}</p>

                    {ins.limitations && (
                      <div className="text-[11px] text-[#64748B] flex items-center gap-1.5 pt-1">
                        <Info className="w-3 h-3 text-[#94A3B8] shrink-0" />
                        <span>{ins.limitations}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
