import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Send,
  Sparkles,
  Database,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Table as TableIcon,
  BarChart3,
  HelpCircle,
  Clock,
  Trash2,
  X,
  ArrowRight,
  RotateCcw,
  Bot,
  User,
  Info,
  CornerDownLeft,
} from 'lucide-react';
import { datasetService } from '../services/datasetService';
import { analysisService } from '../services/analysisService';
import { extractErrorMessage } from '../services/api';
import { AnalyticalChart } from '../components/AnalyticalChart';

const renderFormattedText = (text) => {
  if (!text) return '';
  const lines = String(text).split('\n');
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    const content = parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={idx} className="font-bold text-[#0F172A] dark:text-slate-100">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={idx}
            className="px-1.5 py-0.5 bg-blue-100/80 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[#1D4ED8] dark:text-blue-300 rounded font-mono text-[11px]"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });

    return (
      <React.Fragment key={lineIdx}>
        {content}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
};

// 5 Organized Common Question Categories with 20 Clickable Inquiries
const COMMON_QUESTION_CATEGORIES = [
  {
    id: 'overview',
    title: 'Dataset Overview',
    icon: Database,
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    activeTabBg: 'bg-blue-600 text-white',
    questions: [
      'Total Records & Features',
      'Dataset Summary',
      'Column Names & Data Types',
      'Preview Dataset',
    ],
  },
  {
    id: 'quality',
    title: 'Data Quality',
    icon: CheckCircle2,
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    activeTabBg: 'bg-emerald-600 text-white',
    questions: [
      'Missing Values',
      'Duplicate Records',
      'Outlier Summary',
      'Data Quality Report',
    ],
  },
  {
    id: 'statistics',
    title: 'Statistical Analysis',
    icon: TableIcon,
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
    activeTabBg: 'bg-indigo-600 text-white',
    questions: [
      'Average / Mean',
      'Median',
      'Minimum & Maximum',
      'Standard Deviation',
      'Correlation Analysis',
    ],
  },
  {
    id: 'business',
    title: 'Business Insights',
    icon: Sparkles,
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    activeTabBg: 'bg-amber-600 text-white',
    questions: [
      'Top 5 Products / Categories',
      'Highest Revenue',
      'Category-wise Summary',
      'Trends Over Time',
    ],
  },
  {
    id: 'visualization',
    title: 'Visualization',
    icon: BarChart3,
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
    activeTabBg: 'bg-purple-600 text-white',
    questions: [
      'Show Distribution',
      'Compare Categories',
      'Relationship Between Columns',
      'Generate Suitable Chart',
    ],
  },
];

// Sub-component for each Assistant response card in the chat
const AssistantMessageCard = ({ msg, onSelectClarification, onSelectFollowUp, isSubmitting }) => {
  const [viewMode, setViewMode] = useState('both');
  const data = msg.data;

  if (!data) return null;

  const isClarification = data.status === 'needs_clarification';
  const isError = data.status === 'error';

  return (
    <div className="flex items-start gap-3 w-full">
      {/* Assistant Avatar */}
      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#2563EB] to-[#60A5FA] text-white flex items-center justify-center shrink-0 shadow-xs mt-1">
        <Bot className="w-4 h-4" />
      </div>

      {/* Response Card Container */}
      <div className="flex-1 min-w-0 max-w-4xl bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-slate-800 rounded-2xl rounded-tl-sm p-5 md:p-6 shadow-xs space-y-4 text-xs transition-colors">
        {/* Header Metadata Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F5F9] dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#0F172A] dark:text-slate-100 text-xs">
              AI Analyst
            </span>
            {data.dataset_version && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 uppercase">
                {data.dataset_version} data
              </span>
            )}
            {data.execution_engine && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                ⚡ {data.execution_engine}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                isError
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : isClarification
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : data.confidence === 'High'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                  : data.confidence === 'Medium'
                  ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
              }`}
            >
              {isError
                ? 'Query Error'
                : isClarification
                ? 'Needs Clarification'
                : `${data.confidence || 'Grounded'} Confidence`}
            </span>
            {data.execution_time_ms && (
              <span className="text-[10px] text-[#64748B] dark:text-slate-400">
                {data.execution_time_ms}ms
              </span>
            )}
          </div>
        </div>

        {/* Interpreted Query Notice (if distinct) */}
        {data.interpreted_question && data.interpreted_question !== data.question && (
          <div className="text-[11px] text-[#64748B] dark:text-slate-400 font-medium flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Interpreted Intent:</span>
            <span className="text-[#2563EB] dark:text-blue-400 font-medium">
              {data.interpreted_question}
            </span>
          </div>
        )}

        {/* CLARIFICATION BOX (when query is ambiguous) */}
        {isClarification && (
          <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  Please clarify your inquiry
                </h4>
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  {data.clarification_question || data.answer}
                </p>
              </div>
            </div>

            {/* Candidates */}
            {((data.clarification_candidates && data.clarification_candidates.length > 0) ||
              (data.clarification_options && data.clarification_options.length > 0)) && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-200">
                  Select a candidate column to proceed:
                </span>
                <div className="flex flex-wrap gap-2">
                  {(data.clarification_candidates && data.clarification_candidates.length > 0
                    ? data.clarification_candidates
                    : data.clarification_options.map((opt) => ({ column: opt }))
                  ).map((cand, idx) => {
                    const colName = typeof cand === 'string' ? cand : cand.column;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onSelectClarification(`${data.question} using ${colName}`)}
                        disabled={isSubmitting}
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-100 font-mono text-xs font-semibold shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <span>{colName}</span>
                        <ArrowRight className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PROMINENT ANSWER PRESENTATION */}
        {!isClarification && (
          <div
            className={`rounded-xl p-4 text-xs leading-relaxed font-medium transition-colors ${
              isError
                ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-900 dark:text-red-200'
                : 'bg-[#EFF6FF] dark:bg-blue-950/40 border border-[#BFDBFE] dark:border-blue-900/50 text-[#1E3A8A] dark:text-blue-100'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {isError ? (
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              ) : (
                <Sparkles className="w-4 h-4 text-[#2563EB] dark:text-blue-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <div>{renderFormattedText(data.answer)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Lineage or Selection Explanation (if any) */}
        {(data.selection_explanation || data.evidence?.selection_explanation) && (
          <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 rounded-xl px-3.5 py-2 text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
            <span className="font-semibold text-indigo-700 dark:text-indigo-300">Column Lineage:</span>
            <span>{data.selection_explanation || data.evidence?.selection_explanation}</span>
          </div>
        )}

        {/* Grounded Analytical Evidence Summary */}
        {!isClarification && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl p-2.5 text-xs">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block">
                Operation
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block mt-0.5">
                {data.operation_performed || 'Analysis'}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl p-2.5 text-xs">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block">
                Dataset
              </span>
              <span
                className="font-semibold text-slate-800 dark:text-slate-200 truncate block mt-0.5"
                title={data.dataset_name}
              >
                {data.dataset_name}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl p-2.5 text-xs">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block">
                Columns Used
              </span>
              <span
                className="font-semibold text-slate-800 dark:text-slate-200 truncate block mt-0.5"
                title={data.columns_used?.join(', ') || 'None'}
              >
                {data.columns_used?.length > 0 ? data.columns_used.join(', ') : 'None (Dataset-wide)'}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl p-2.5 text-xs">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block">
                Filters Applied
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block mt-0.5">
                {data.filters_applied?.length > 0
                  ? data.filters_applied.map((f) => `${f.column} ${f.operator} ${f.value}`).join('; ')
                  : 'None'}
              </span>
            </div>
          </div>
        )}

        {/* Key Findings Bullet List */}
        {data.key_points?.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <h4 className="text-[10px] font-bold text-[#64748B] dark:text-slate-400 uppercase tracking-wider">
              Key Findings
            </h4>
            <ul className="space-y-1 text-xs text-[#0F172A] dark:text-slate-200">
              {data.key_points.map((pt, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>{renderFormattedText(pt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* View Switcher Bar (when both chart and table are available) */}
        {data.visualization?.recommended && data.result?.rows?.length > 0 && (
          <div className="flex items-center justify-between border-t border-[#F1F5F9] dark:border-slate-800 pt-3">
            <span className="text-[11px] font-semibold text-[#64748B] dark:text-slate-400">
              Interactive Display:
            </span>
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setViewMode('both')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                  viewMode === 'both'
                    ? 'bg-white dark:bg-slate-900 text-[#2563EB] dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Both
              </button>
              <button
                type="button"
                onClick={() => setViewMode('chart')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                  viewMode === 'chart'
                    ? 'bg-white dark:bg-slate-900 text-[#2563EB] dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3 h-3" />
                <span>Chart</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-[#2563EB] dark:text-blue-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <TableIcon className="w-3 h-3" />
                <span>Table</span>
              </button>
            </div>
          </div>
        )}

        {/* Embedded Result Table */}
        {(viewMode === 'both' || viewMode === 'table' || !data.visualization?.recommended) &&
          data.result &&
          data.result.rows &&
          data.result.rows.length > 0 && (
            <div className="border border-[#E2E8F0] dark:border-slate-800 rounded-xl overflow-hidden space-y-2 p-3 bg-slate-50/60 dark:bg-slate-800/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <TableIcon className="w-3.5 h-3.5 text-[#2563EB] dark:text-blue-400" />
                  <span className="text-[11px] font-bold text-[#0F172A] dark:text-slate-200">
                    Result Data
                  </span>
                </div>
                <span className="text-[10px] text-[#64748B] dark:text-slate-400 font-medium">
                  Showing {Math.min(data.result.rows.length, 100)} of {data.result.total_rows?.toLocaleString() || data.result.rows.length} records
                </span>
              </div>

              <div className="overflow-x-auto max-h-64 border border-slate-200 dark:border-slate-700/80 rounded-lg bg-white dark:bg-slate-900">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold uppercase text-[10px] tracking-wider sticky top-0">
                    <tr>
                      {data.result.columns?.map((col, idx) => (
                        <th key={idx} className="px-3 py-2 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                    {data.result.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                        {data.result.columns?.map((col, cIdx) => (
                          <td key={cIdx} className="px-3 py-2 whitespace-nowrap font-medium text-[11px]">
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
          )}

        {/* Dynamic Graphical Visualization Section (Actual CSV-derived) */}
        {!isClarification && !isError && (
          <div className="space-y-2 pt-2 border-t border-[#F1F5F9] dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#0F172A] dark:text-slate-200 uppercase tracking-wider">
                <BarChart3 className="w-3.5 h-3.5 text-[#2563EB] dark:text-blue-400" />
                <span>Graphical Visualization</span>
                {data.visualization?.recommended && data.visualization.chart_type && (
                  <span className="ml-1 px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 text-[9px] font-semibold">
                    {data.visualization.chart_type.toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            {(viewMode === 'both' || viewMode === 'chart') && data.visualization?.recommended ? (
              <div className="pt-1">
                <AnalyticalChart
                  chartData={data.visualization}
                  showExport={true}
                  downloadFilename={`chart_${data.dataset_name || 'dataset'}_${data.dataset_id}`}
                />
              </div>
            ) : (
              <div className="bg-slate-50/70 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-700/60 rounded-xl p-3 text-center text-[11px] text-[#64748B] dark:text-slate-400">
                {data.visualization?.reason || 'Graphical visualization is not applicable for this single scalar metric or summary query. The exact computed value is displayed above.'}
              </div>
            )}
          </div>
        )}

        {/* Automated Data-Driven Insights */}
        {data.automated_insights?.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-[#F1F5F9] dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#0F172A] dark:text-slate-200 uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-[#2563EB] dark:text-blue-400" />
              <span>Automated Data-Driven Insights</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {data.automated_insights.map((ins, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{ins.type}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded font-bold uppercase ${
                        ins.severity === 'High'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200'
                      }`}
                    >
                      {ins.metric}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-800 dark:text-slate-200 leading-snug">
                    {ins.statement}
                  </p>
                  {ins.limitations && (
                    <p className="text-[10px] text-slate-500 italic">Notice: {ins.limitations}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Statistical Diagnostics & Formula Breakdown (collapsible to keep answers primary) */}
        {data.statistical_metrics && (
          <details className="pt-2 border-t border-[#F1F5F9] dark:border-slate-800 text-xs group">
            <summary className="font-semibold text-[#0F172A] dark:text-slate-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-between py-1">
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-slate-400" />
                <span>Statistical Diagnostics & Formula Breakdown</span>
              </span>
              <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform text-slate-400" />
            </summary>
            <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs space-y-2">
              {data.statistical_metrics.regression && (
                <div className="space-y-1">
                  <div className="font-semibold text-slate-900 dark:text-slate-200">
                    Linear Regression Equation:
                  </div>
                  <code className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-mono text-[11px] block text-blue-600 dark:text-blue-300">
                    {data.statistical_metrics.regression.equation}
                  </code>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    R² = {data.statistical_metrics.regression.r_squared} | P-value ={' '}
                    {data.statistical_metrics.regression.p_value} | Std Error ={' '}
                    {data.statistical_metrics.regression.standard_error}
                  </div>
                </div>
              )}
              {data.statistical_metrics.hypothesis_test && (
                <div className="space-y-1">
                  <div className="font-semibold text-slate-900 dark:text-slate-200">
                    Hypothesis Test Comparison:
                  </div>
                  <div className="text-[11px] text-slate-700 dark:text-slate-300">
                    {data.statistical_metrics.hypothesis_test.interpretation}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    T = {data.statistical_metrics.hypothesis_test.t_statistic} | P ={' '}
                    {data.statistical_metrics.hypothesis_test.p_value} | Cohen's d ={' '}
                    {data.statistical_metrics.hypothesis_test.cohens_d}
                  </div>
                </div>
              )}
              {data.statistical_metrics.chi_square && (
                <div className="space-y-1">
                  <div className="font-semibold text-slate-900 dark:text-slate-200">
                    Chi-Square Test of Independence:
                  </div>
                  <div className="text-[11px] text-slate-700 dark:text-slate-300">
                    {data.statistical_metrics.chi_square.interpretation}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    χ² = {data.statistical_metrics.chi_square.chi2_statistic} | dof ={' '}
                    {data.statistical_metrics.chi_square.degrees_of_freedom} | Cramér's V ={' '}
                    {data.statistical_metrics.chi_square.cramers_v}
                  </div>
                </div>
              )}
            </div>
          </details>
        )}

        {/* Contextual Follow-Up Suggestions Chips */}
        {data.follow_up_suggestions?.length > 0 && (
          <div className="pt-2 border-t border-[#F1F5F9] dark:border-slate-800 space-y-1.5">
            <div className="text-[10px] font-bold text-[#64748B] dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[#2563EB] dark:text-blue-400" />
              <span>Suggested Follow-Up Inquiries</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.follow_up_suggestions.map((fu, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectFollowUp(fu)}
                  disabled={isSubmitting}
                  className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/70 dark:hover:bg-blue-950/60 text-[#2563EB] dark:text-blue-300 text-xs font-medium rounded-lg shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>{fu}</span>
                  <ArrowRight className="w-3 h-3 text-[#2563EB] dark:text-blue-400" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const AnalysisPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);

  // Dataset states
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState('original');
  const [loadingDatasets, setLoadingDatasets] = useState(true);

  // Question & Query states
  const [question, setQuestion] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Conversation chat stream
  const [messages, setMessages] = useState([]);

  // Contextual suggested questions for current dataset
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Predefined Common Question Categories state
  const [activeCommonCategory, setActiveCommonCategory] = useState('overview');
  const [showCommonQuestionsBar, setShowCommonQuestionsBar] = useState(true);

  // Query History states
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSubmitting]);

  // 1. Initial Load: Load Datasets
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

        let initialId = null;
        if (queryId && list.some((d) => String(d.id) === String(queryId))) {
          initialId = Number(queryId);
        } else if (savedId && list.some((d) => String(d.id) === String(savedId))) {
          initialId = Number(savedId);
        } else if (list.length > 0) {
          initialId = list[0].id;
        }

        if (initialId) {
          setSelectedDatasetId(initialId);
        }
      } catch (err) {
        setError(extractErrorMessage(err));
      } finally {
        setLoadingDatasets(false);
      }
    };

    fetchDatasets();
  }, []);

  // 2. When active dataset changes, update URL, fetch suggestions & history, reset conversation
  useEffect(() => {
    if (!selectedDatasetId) {
      setSuggestedQuestions([]);
      setMessages([]);
      return;
    }

    setSearchParams({ dataset_id: selectedDatasetId }, { replace: true });
    localStorage.setItem('selected_dataset_id', String(selectedDatasetId));
    setError('');
    setMessages([]);
    setQuestion('');

    // Fetch suggested questions
    const loadSuggestions = async () => {
      setLoadingSuggestions(true);
      try {
        const res = await analysisService.getSuggestedQuestions(selectedDatasetId);
        setSuggestedQuestions(res?.questions || []);
      } catch {
        setSuggestedQuestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    // Fetch history
    const loadHistory = async () => {
      setLoadingHistory(true);
      try {
        const res = await analysisService.getHistory(selectedDatasetId, 30);
        setHistory(res?.history || []);
      } catch {
        setHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    };

    loadSuggestions();
    loadHistory();
  }, [selectedDatasetId]);

  // Reset conversation and clear stale results when dataset version toggles
  useEffect(() => {
    setMessages([]);
    setError('');
  }, [selectedVersion]);

  const currentDataset = useMemo(() => {
    return datasets.find((d) => d.id === selectedDatasetId) || null;
  }, [datasets, selectedDatasetId]);

  // 3. Submit question to backend
  const handleAskQuestion = async (queryText) => {
    if (isSubmitting) return;
    const q = (queryText || question).trim();
    if (!q) return;

    if (!selectedDatasetId) {
      setError('Please select an active dataset before submitting a question.');
      return;
    }

    const userMessageId = `user-${Date.now()}`;
    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Append user message to chat stream
    const updatedMessages = [
      ...messages,
      {
        id: userMessageId,
        role: 'user',
        content: q,
        timestamp: timestampStr,
      },
    ];
    setMessages(updatedMessages);
    setQuestion('');
    setIsSubmitting(true);
    setError('');

    try {
      // Find previous query context if present
      const lastAssistantMsg = [...updatedMessages].reverse().find((m) => m.role === 'assistant' && m.data);
      const prevContext = lastAssistantMsg?.data?.question
        ? { previous_query: lastAssistantMsg.data.question }
        : null;

      const resp = await analysisService.askQuestion(
        selectedDatasetId,
        q,
        selectedVersion,
        prevContext
      );

      // Append assistant message
      setMessages([
        ...updatedMessages,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          data: resp,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);

      // Refresh history
      const histRes = await analysisService.getHistory(selectedDatasetId, 30);
      setHistory(histRes?.history || []);
    } catch (err) {
      const errMsg = extractErrorMessage(err);
      setError(errMsg);
      // Append assistant error response
      setMessages([
        ...updatedMessages,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          data: {
            question: q,
            status: 'error',
            answer: `Unable to process query: ${errMsg}`,
            confidence: 'Low',
            dataset_name: currentDataset?.original_filename || 'dataset',
            dataset_version: selectedVersion,
          },
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      await analysisService.clearHistory(selectedDatasetId);
      setHistory([]);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleDeleteHistoryItem = async (histId, e) => {
    e.stopPropagation();
    try {
      await analysisService.deleteHistoryItem(histId);
      setHistory((prev) => prev.filter((item) => item.id !== histId));
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleNewThread = async () => {
    if (selectedDatasetId) {
      try {
        await analysisService.clearContext(selectedDatasetId);
      } catch (e) {}
    }
    setMessages([]);
    setQuestion('');
    setError('');
  };

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#0F172A] dark:text-slate-100 flex items-center gap-2.5">
            <span>Data Analyst Assistant</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#2563EB]/10 text-[#2563EB] dark:bg-blue-900/40 dark:text-blue-300 border border-[#2563EB]/20">
              Natural Language Querying
            </span>
          </h1>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
            Ask questions about your selected dataset in natural language. Powered by deterministic aggregation, grouping, trend analysis, and evidence-grounded charting.
          </p>
        </div>

        {/* Action Buttons: New Thread & History */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNewThread}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-[#CBD5E1] dark:border-slate-700 bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-slate-200 hover:bg-[#F8FAFC] dark:hover:bg-slate-800 transition-all cursor-pointer shadow-2xs"
            title="Start fresh conversation thread"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>New Thread</span>
          </button>

          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
              showHistory
                ? 'bg-[#2563EB] text-white border-[#2563EB] shadow-xs'
                : 'bg-white dark:bg-[#1E293B] text-[#0F172A] dark:text-slate-200 border-[#CBD5E1] dark:border-slate-700 hover:bg-[#F8FAFC] dark:hover:bg-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>History</span>
            {history.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  showHistory ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {history.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Dataset & Version Selector Toolbar */}
      {!loadingDatasets && datasets.length > 0 && (
        <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-[#64748B] dark:text-slate-400">
              <Database className="w-4 h-4 text-[#2563EB]" />
              <span className="font-semibold text-[#0F172A] dark:text-slate-200">Selected Dataset:</span>
            </div>

            {/* Dataset Dropdown */}
            <div className="relative">
              <select
                value={selectedDatasetId || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedDatasetId(val ? Number(val) : null);
                }}
                className="appearance-none bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 hover:border-[#2563EB] rounded-xl px-3 py-1.5 pr-8 text-xs font-semibold text-[#0F172A] dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 cursor-pointer transition-all"
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.original_filename || d.filename} [ID #{d.id}] — {(d.row_count ?? d.rows ?? 0).toLocaleString()} rows, {d.column_count ?? d.columns ?? 0} cols{d.has_cleaned ? ' • Cleaned Available' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#64748B] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Version Toggle (Original vs Cleaned) */}
            <div className="flex items-center gap-1 bg-[#F1F5F9] dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setSelectedVersion('original')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  selectedVersion === 'original'
                    ? 'bg-white dark:bg-slate-800 text-[#2563EB] dark:text-blue-400 shadow-2xs'
                    : 'text-[#64748B] dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-slate-200'
                }`}
              >
                Original
              </button>
              <button
                type="button"
                onClick={() => {
                  if (currentDataset?.has_cleaned) {
                    setSelectedVersion('cleaned');
                  }
                }}
                disabled={!currentDataset?.has_cleaned}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                  selectedVersion === 'cleaned'
                    ? 'bg-white dark:bg-slate-800 text-[#2563EB] dark:text-blue-400 shadow-2xs'
                    : currentDataset?.has_cleaned
                    ? 'text-[#64748B] dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-slate-200 cursor-pointer'
                    : 'text-[#94A3B8] opacity-60 cursor-not-allowed'
                }`}
                title={currentDataset?.has_cleaned ? 'Analyze cleaned version' : 'No cleaned version available'}
              >
                <span>Cleaned</span>
                {currentDataset?.has_cleaned && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                )}
              </button>
            </div>
          </div>

          {/* Dataset Dimension Badges */}
          {currentDataset && (
            <div className="flex items-center gap-2.5 text-xs text-[#64748B] dark:text-slate-400">
              <span className="font-semibold text-[#0F172A] dark:text-slate-200">
                {(currentDataset.row_count ?? currentDataset.rows ?? 0).toLocaleString()} rows
              </span>
              <span>•</span>
              <span className="font-semibold text-[#0F172A] dark:text-slate-200">
                {currentDataset.column_count ?? currentDataset.columns ?? 0} columns
              </span>
              <span>•</span>
              <span>{formatFileSize(currentDataset.file_size ?? currentDataset.file_size_bytes ?? 0)}</span>
            </div>
          )}
        </div>
      )}

      {/* CHAT MESSAGES STREAM CONTAINER */}
      <div className="bg-[#F8FAFC]/90 dark:bg-slate-900/40 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl p-4 md:p-6 shadow-xs min-h-[460px] flex flex-col justify-between space-y-6">
        {/* Messages List */}
        <div className="space-y-6 flex-1">
          {/* Welcome Screen when no messages exist */}
          {messages.length === 0 && (
            <div className="py-8 px-2 max-w-4xl mx-auto space-y-6">
              <div className="text-center space-y-3 max-w-2xl mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#2563EB] to-[#60A5FA] text-white flex items-center justify-center mx-auto shadow-md">
                  <Sparkles className="w-7 h-7" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-base md:text-lg font-bold text-[#0F172A] dark:text-slate-100">
                    Ask questions about your data in natural language
                  </h3>
                  <p className="text-xs text-[#64748B] dark:text-slate-400 leading-relaxed">
                    Query dimensions, missing values, averages, extreme records, departmental breakdowns, distributions, or temporal trends with deterministic accuracy.
                  </p>
                </div>
              </div>

              {/* Organized Common Question Categories */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-200 dark:border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#0F172A] dark:text-slate-200">
                      Common Analytical Inquiries
                    </span>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      • Click any label to run an instant analysis
                    </span>
                  </div>
                  {currentDataset && (
                    <span className="text-[11px] text-[#2563EB] dark:text-blue-400 font-medium">
                      Active: {currentDataset.original_filename} ({selectedVersion === 'cleaned' ? 'Cleaned' : 'Original'})
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {COMMON_QUESTION_CATEGORIES.map((category) => {
                    const CategoryIcon = category.icon;
                    return (
                      <div
                        key={category.id}
                        className="bg-white dark:bg-[#1E293B] border border-slate-200/90 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs space-y-2.5 hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-100 dark:border-slate-800/80">
                            <div className="flex items-center gap-2">
                              <div className={`p-1.5 rounded-lg ${category.badgeColor}`}>
                                <CategoryIcon className="w-3.5 h-3.5" />
                              </div>
                              <span className="text-xs font-bold text-[#0F172A] dark:text-slate-100">
                                {category.title}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                              {category.questions.length} queries
                            </span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {category.questions.map((qText, qIdx) => (
                              <button
                                key={qIdx}
                                type="button"
                                onClick={() => {
                                  if (!isSubmitting) handleAskQuestion(qText);
                                }}
                                disabled={isSubmitting || !selectedDatasetId}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-slate-200 dark:border-slate-700/80 hover:border-blue-300 dark:hover:border-blue-700 text-[#0F172A] dark:text-slate-200 hover:text-[#2563EB] dark:hover:text-blue-300 text-[11px] font-medium transition-all text-left cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed group"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60 group-hover:bg-[#2563EB] shrink-0" />
                                <span className="leading-snug">{qText}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Contextual Suggested Questions Grid in Welcome State */}
              {suggestedQuestions.length > 0 && (
                <div className="pt-2 space-y-2 text-left">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] dark:text-slate-400 block">
                    Contextual queries for {currentDataset?.original_filename || 'this dataset'}:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {suggestedQuestions.map((sq, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (!isSubmitting) handleAskQuestion(sq.question);
                        }}
                        disabled={isSubmitting || !selectedDatasetId}
                        className="p-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-blue-50/70 dark:hover:bg-slate-700/60 border border-slate-200 dark:border-slate-700 text-[#0F172A] dark:text-slate-200 text-xs font-medium transition-all text-left cursor-pointer flex items-center justify-between gap-2 shadow-2xs group disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span className="leading-snug">{sq.question}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#2563EB] shrink-0 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Render Active Conversation Messages */}
          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end items-start gap-2.5">
                  <div className="max-w-xl space-y-1">
                    <div className="bg-[#2563EB] text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-xs font-medium shadow-xs leading-relaxed">
                      {msg.content}
                    </div>
                    {msg.timestamp && (
                      <div className="text-[10px] text-[#94A3B8] text-right px-1">
                        {msg.timestamp}
                      </div>
                    )}
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950 text-[#2563EB] dark:text-blue-300 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                </div>
              );
            }

            // Assistant Response Card
            return (
              <AssistantMessageCard
                key={msg.id}
                msg={msg}
                onSelectClarification={(clarifiedQuery) => handleAskQuestion(clarifiedQuery)}
                onSelectFollowUp={(fuQuery) => handleAskQuestion(fuQuery)}
                isSubmitting={isSubmitting}
              />
            );
          })}

          {/* Assistant Analyzing Spinner Bubble */}
          {isSubmitting && (
            <div className="flex items-start gap-3 w-full animate-in fade-in">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#2563EB] to-[#60A5FA] text-white flex items-center justify-center shrink-0 shadow-xs mt-1">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-xs flex items-center gap-3 text-xs text-[#2563EB] dark:text-blue-400 font-medium">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Analyzing dataset with deterministic statistical engine...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Floating / Pinned Chat Input Area */}
        <div className="pt-3 border-t border-[#E2E8F0] dark:border-slate-800 space-y-2.5">
          {/* Predefined Common Questions Category Bar during conversation */}
          {messages.length > 0 && (
            <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-800 rounded-xl p-2 shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#2563EB]" />
                    <span>Common Queries:</span>
                  </span>
                  {COMMON_QUESTION_CATEGORIES.map((cat) => {
                    const CatIcon = cat.icon;
                    const isActive = activeCommonCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setActiveCommonCategory(cat.id);
                          if (!showCommonQuestionsBar) setShowCommonQuestionsBar(true);
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                          isActive && showCommonQuestionsBar
                            ? cat.activeTabBg + ' shadow-2xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <CatIcon className="w-3 h-3" />
                        <span>{cat.title}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setShowCommonQuestionsBar(!showCommonQuestionsBar)}
                  className="text-[10px] font-semibold text-slate-500 hover:text-[#2563EB] dark:text-slate-400 flex items-center gap-0.5 shrink-0 px-1.5 py-0.5 rounded cursor-pointer"
                  title={showCommonQuestionsBar ? 'Hide queries' : 'Show queries'}
                >
                  <span>{showCommonQuestionsBar ? 'Collapse' : 'Expand'}</span>
                  {showCommonQuestionsBar ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* Active category questions chips */}
              {showCommonQuestionsBar && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none pt-0.5">
                  {COMMON_QUESTION_CATEGORIES.find((c) => c.id === activeCommonCategory)?.questions.map((qText, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (!isSubmitting) handleAskQuestion(qText);
                      }}
                      disabled={isSubmitting || !selectedDatasetId}
                      className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-[#2563EB] dark:hover:text-blue-300 text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                      <span>{qText}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick Clickable Suggestions Row above input (when conversation is active) */}
          {messages.length > 0 && suggestedQuestions.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
                <span>Contextual:</span>
              </span>
              {suggestedQuestions.slice(0, 4).map((sq, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (!isSubmitting) handleAskQuestion(sq.question);
                  }}
                  disabled={isSubmitting || !selectedDatasetId}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:text-[#2563EB] hover:border-blue-300 text-[11px] whitespace-nowrap transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sq.question}
                </button>
              ))}
            </div>
          )}

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskQuestion();
            }}
            className="flex items-center gap-2 bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-slate-700 focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/20 rounded-2xl p-1.5 shadow-xs transition-all"
          >
            <div className="pl-3 text-[#2563EB] dark:text-blue-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (question.trim() && !isSubmitting && selectedDatasetId) {
                    handleAskQuestion();
                  }
                }
              }}
              disabled={isSubmitting || !selectedDatasetId}
              placeholder={
                selectedDatasetId
                  ? 'Ask a question about your dataset (e.g. how many row in our file, average billing amount, top 5 departments)...'
                  : 'Please select an active dataset above to start querying...'
              }
              className="flex-1 px-2 py-2 text-xs bg-transparent text-[#0F172A] dark:text-slate-100 placeholder:text-[#94A3B8] focus:outline-none disabled:opacity-50"
            />
            {question && (
              <button
                type="button"
                onClick={() => setQuestion('')}
                className="p-1 text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={!question.trim() || isSubmitting || !selectedDatasetId}
              className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              title="Send message (Enter)"
            >
              {isSubmitting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <span>Send</span>
                  <Send className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            onClick={() => setError('')}
            className="text-xs font-semibold text-red-700 dark:text-red-400 hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* QUERY HISTORY DRAWER / SIDEBAR */}
      {showHistory && (
        <div className="fixed inset-y-0 right-0 w-80 md:w-96 bg-white dark:bg-[#1E293B] border-l border-[#E2E8F0] dark:border-slate-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
          <div className="p-4 border-b border-[#E2E8F0] dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#2563EB]" />
              <h3 className="text-xs font-bold text-[#0F172A] dark:text-slate-100">
                Analytical Query History
              </h3>
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="p-1 text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-slate-100 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {history.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#64748B] dark:text-slate-400 space-y-2">
                <Clock className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <p>No queries asked for this dataset yet.</p>
              </div>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    handleAskQuestion(item.query);
                    setShowHistory(false);
                  }}
                  className="p-3 rounded-xl border border-[#E2E8F0] dark:border-slate-800 hover:border-[#2563EB] dark:hover:border-blue-500 hover:bg-[#F8FAFC] dark:hover:bg-slate-850 transition-all cursor-pointer space-y-1.5 group text-xs bg-white dark:bg-slate-900 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-[#0F172A] dark:text-slate-200 group-hover:text-[#2563EB] dark:group-hover:text-blue-400 leading-snug">
                      "{item.query}"
                    </span>
                    <button
                      onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                      className="text-slate-300 dark:text-slate-600 hover:text-red-500 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title="Delete history item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {item.answer_preview && (
                    <p className="text-[11px] text-[#64748B] dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {item.answer_preview}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-[#94A3B8] pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span className="uppercase font-semibold">{item.analysis_type}</span>
                    <span>
                      {new Date(item.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {history.length > 0 && (
            <div className="p-3 border-t border-[#E2E8F0] dark:border-slate-800">
              <button
                type="button"
                onClick={handleClearHistory}
                className="w-full py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer"
              >
                Clear History
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AnalysisPage;
