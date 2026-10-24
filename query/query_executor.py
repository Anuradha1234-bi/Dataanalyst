"""Query Executor Module for Phase 6 Natural Language Query Engine.

Executes validated query plans deterministically across datasets.
Dispatches to safe specialized query engines.
Guarantees clean data versioning and data source clarity.
No eval(), exec(), or arbitrary code allowed.
"""

from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np

from query.query_models import QueryIntent, QueryExecutionResult
from query.config import normalize_query_config
from query.filter_engine import apply_filters
from query.aggregation_engine import compute_aggregation
from query.comparison_engine import compare_groups, compare_dates
from query.trend_query_engine import compute_trend_query
from query.correlation_query_engine import compute_correlation_query
from query.anomaly_query_engine import compute_anomaly_query
from query.cross_dataset_query_engine import execute_cross_dataset_query
from query.duckdb_engine import DuckDBEngine
from query.advanced_stats import AdvancedStatsEngine
from query.insight_engine import InsightEngine
from query.column_resolver import is_identifier_column


def execute_query(
    query_plan: Dict[str, Any],
    datasets: Dict[str, pd.DataFrame],
    cleaned_datasets: Optional[Dict[str, pd.DataFrame]] = None,
    phase5_results: Optional[Dict[str, Any]] = None,
    phase4_results: Optional[Dict[str, Any]] = None,
    relationships: Optional[List[Any]] = None,
    join_audit: Optional[List[Any]] = None,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Execute a validated query plan safely.

    Contract:
    Returns:
    {
        "status": "success",
        "result_type": "table",
        "data": ...,
        "columns": [],
        "row_count": 10,
        "evidence": {},
        "warnings": [],
        "errors": []
    }
    """
    cfg = normalize_query_config(config)
    warnings: List[str] = []
    errors: List[str] = []

    intent = query_plan.get("intent", QueryIntent.UNKNOWN.value)
    target_ds_name = query_plan.get("dataset")

    # Select dataset and determine version (Cleaned vs Original)
    use_cleaned = cfg.get("use_cleaned_data_by_default", True)
    is_cleaned_used = False

    df = None
    if cleaned_datasets and use_cleaned and target_ds_name in cleaned_datasets:
        df = cleaned_datasets[target_ds_name]
        is_cleaned_used = True
    elif target_ds_name in datasets:
        df = datasets[target_ds_name]
    elif len(datasets) == 1:
        target_ds_name = list(datasets.keys())[0]
        df = datasets[target_ds_name]
    else:
        return {
            "status": "error",
            "result_type": "empty",
            "data": None,
            "columns": [],
            "row_count": 0,
            "evidence": {},
            "warnings": [],
            "errors": [f"Target dataset '{target_ds_name}' not available."],
        }

    dataset_source_label = f"Analysis based on {'cleaned' if is_cleaned_used else 'original'} {target_ds_name}."

    # 1. Apply Filters First (if present)
    filters = query_plan.get("filters", [])
    if filters and df is not None and not df.empty:
        df, filter_warnings = apply_filters(df, filters)
        warnings.extend(filter_warnings)

    column = query_plan.get("column")
    group_by = query_plan.get("group_by", [])
    aggregation = query_plan.get("aggregation")
    limit = query_plan.get("limit")
    offset = query_plan.get("offset")
    sort = query_plan.get("sort")

    # 2. Dispatch to specific Intent Handlers
    res_payload: Dict[str, Any] = {}

    try:
        # -------------------------------------------------------------
        # COUNT INTENT
        # -------------------------------------------------------------
        if intent == QueryIntent.COUNT.value:
            if not column or column not in df.columns:
                row_count = int(len(df))
                col_count = int(len(df.columns))
                res_df = pd.DataFrame([{"Total Records": row_count, "Total Features": col_count}])
                evidence = {
                    "count": row_count,
                    "value": row_count,
                    "feature_count": col_count,
                    "dataset": target_ds_name,
                    "dataset_source": dataset_source_label,
                    "filters_applied": filters,
                }
                res_payload = {
                    "result_type": "table",
                    "data": res_df,
                    "columns": ["Total Records", "Total Features"],
                    "row_count": 1,
                    "evidence": evidence,
                    "warnings": warnings,
                }
            else:
                valid_cnt = int(df[column].count())
                res_df = pd.DataFrame([{f"Count of {column}": valid_cnt}])
                res_payload = {
                    "result_type": "table",
                    "data": res_df,
                    "columns": [f"Count of {column}"],
                    "row_count": 1,
                    "evidence": {"column": column, "count": valid_cnt, "value": valid_cnt, "dataset_source": dataset_source_label},
                    "warnings": warnings,
                }

        # -------------------------------------------------------------
        # AGGREGATIONS (SUM, AVERAGE, MEDIAN, MINIMUM, MAXIMUM)
        # -------------------------------------------------------------
        elif intent in (
            QueryIntent.AVERAGE.value,
            QueryIntent.SUM.value,
            QueryIntent.MEDIAN.value,
            QueryIntent.MINIMUM.value,
            QueryIntent.MAXIMUM.value,
            QueryIntent.STANDARD_DEVIATION.value,
        ):
            agg_name = {
                QueryIntent.AVERAGE.value: "mean",
                QueryIntent.SUM.value: "sum",
                QueryIntent.MEDIAN.value: "median",
                QueryIntent.MINIMUM.value: "min",
                QueryIntent.MAXIMUM.value: "max",
                QueryIntent.STANDARD_DEVIATION.value: "std",
            }.get(intent, aggregation or "mean")

            agg_res = compute_aggregation(
                df,
                column=column,
                aggregation=agg_name,
                group_by=group_by,
                sort=sort,
                limit=limit,
                offset=offset,
            )
            agg_res["evidence"]["dataset_source"] = dataset_source_label
            res_payload = agg_res

        # -------------------------------------------------------------
        # RANKINGS (TOP_N, BOTTOM_N) & GROUP_BY
        # -------------------------------------------------------------
        elif intent in (QueryIntent.TOP_N.value, QueryIntent.BOTTOM_N.value, QueryIntent.GROUP_BY.value):
            if group_by:
                agg_name = aggregation or "mean"
                agg_res = compute_aggregation(
                    df,
                    column=column,
                    aggregation=agg_name,
                    group_by=group_by,
                    sort=sort or ("descending" if intent == QueryIntent.TOP_N.value else "ascending"),
                    limit=limit or 10,
                    offset=offset,
                )
                agg_res["evidence"]["dataset_source"] = dataset_source_label
                res_payload = agg_res
            elif column and column in df.columns:
                # Rank rows directly by measure column
                is_asc = (intent == QueryIntent.BOTTOM_N.value) or (sort == "ascending")
                sorted_df = df.sort_values(by=column, ascending=is_asc)
                if offset and offset > 0:
                    sorted_df = sorted_df.iloc[offset:]
                ranked = sorted_df.head(limit or 10)
                evidence = {
                    "dataset_source": dataset_source_label,
                    "column": column,
                    "limit": limit or 10,
                    "offset": offset,
                    "top_value": float(ranked.iloc[0][column]) if not ranked.empty and pd.api.types.is_numeric_dtype(ranked[column]) else None,
                }
                res_payload = {
                    "result_type": "table",
                    "data": ranked.reset_index(drop=True),
                    "columns": list(ranked.columns),
                    "row_count": len(ranked),
                    "evidence": evidence,
                    "warnings": warnings,
                }
            else:
                # No column specified, return head
                res_payload = {
                    "result_type": "table",
                    "data": df.head(limit or 10).reset_index(drop=True),
                    "columns": list(df.columns),
                    "row_count": min(len(df), limit or 10),
                    "evidence": {"dataset_source": dataset_source_label},
                    "warnings": warnings,
                }

        # -------------------------------------------------------------
        # FILTER / SHOW DATA
        # -------------------------------------------------------------
        elif intent in (QueryIntent.FILTER.value, QueryIntent.SHOW_DATA.value, QueryIntent.SORT.value):
            res_df = df
            if sort and column and column in res_df.columns:
                res_df = res_df.sort_values(by=column, ascending=(sort == "ascending"))
            if limit:
                res_df = res_df.head(limit)
            else:
                res_df = res_df.head(25)

            res_payload = {
                "result_type": "table",
                "data": res_df.reset_index(drop=True),
                "columns": list(res_df.columns),
                "row_count": len(res_df),
                "evidence": {
                    "dataset_source": dataset_source_label,
                    "filters_applied": filters,
                    "total_filtered_rows": len(df),
                },
                "warnings": warnings,
            }

        # -------------------------------------------------------------
        # MISSING VALUES
        # -------------------------------------------------------------
        elif intent == QueryIntent.MISSING_VALUES.value:
            null_counts = df.isnull().sum()
            null_pcts = (null_counts / len(df) * 100.0) if len(df) > 0 else 0.0
            missing_df = pd.DataFrame({
                "Column": df.columns,
                "Missing Values": null_counts.values,
                "Missing (%)": [round(p, 2) for p in null_pcts.values],
            }).sort_values(by="Missing Values", ascending=False).reset_index(drop=True)

            tot_missing = int(null_counts.sum())
            cols_with_missing = list(missing_df[missing_df["Missing Values"] > 0]["Column"])

            res_payload = {
                "result_type": "table",
                "data": missing_df,
                "columns": list(missing_df.columns),
                "row_count": len(missing_df),
                "evidence": {
                    "total_missing_values": tot_missing,
                    "overall_missing_pct": round((tot_missing / max(df.size, 1)) * 100.0, 2),
                    "columns_with_missing": cols_with_missing,
                    "dataset_source": dataset_source_label,
                },
                "warnings": warnings,
            }

        # -------------------------------------------------------------
        # DUPLICATES
        # -------------------------------------------------------------
        elif intent == QueryIntent.DUPLICATES.value:
            dup_mask = df.duplicated()
            dup_count = int(dup_mask.sum())
            dup_pct = round((dup_count / max(len(df), 1)) * 100.0, 2)

            dup_summary_df = pd.DataFrame([{
                "Total Rows": len(df),
                "Duplicate Rows": dup_count,
                "Duplicate Rate (%)": dup_pct,
            }])

            res_payload = {
                "result_type": "table",
                "data": dup_summary_df,
                "columns": list(dup_summary_df.columns),
                "row_count": 1,
                "evidence": {
                    "duplicate_count": dup_count,
                    "duplicate_rate_pct": dup_pct,
                    "dataset_source": dataset_source_label,
                },
                "warnings": warnings,
            }

        # -------------------------------------------------------------
        # DATA TYPES
        # -------------------------------------------------------------
        elif intent == QueryIntent.DATA_TYPES.value:
            dtypes_df = pd.DataFrame({
                "Column": df.columns,
                "Data Type": [str(d) for d in df.dtypes],
                "Category": [
                    "Numeric" if pd.api.types.is_numeric_dtype(df[c])
                    else ("Datetime" if pd.api.types.is_datetime64_any_dtype(df[c]) else "Categorical/Text")
                    for c in df.columns
                ],
            })
            num_cols = list(dtypes_df[dtypes_df["Category"] == "Numeric"]["Column"])
            res_payload = {
                "result_type": "table",
                "data": dtypes_df,
                "columns": list(dtypes_df.columns),
                "row_count": len(dtypes_df),
                "evidence": {
                    "total_columns": len(df.columns),
                    "numeric_columns": num_cols,
                    "dataset_source": dataset_source_label,
                },
                "warnings": warnings,
            }

        # -------------------------------------------------------------
        # UNIQUE VALUES
        # -------------------------------------------------------------
        elif intent == QueryIntent.UNIQUE_VALUES.value:
            if column and column in df.columns:
                n_uniq = int(df[column].nunique())
                sample_vals = list(df[column].dropna().unique()[:10])
                res_df = pd.DataFrame([{
                    "Column": column,
                    "Distinct Values": n_uniq,
                    "Sample Values": ", ".join(str(v) for v in sample_vals),
                }])
                res_payload = {
                    "result_type": "table",
                    "data": res_df,
                    "columns": list(res_df.columns),
                    "row_count": 1,
                    "evidence": {"column": column, "unique_count": n_uniq, "value": n_uniq, "sample_values": sample_vals, "dataset_source": dataset_source_label},
                    "warnings": warnings,
                }
            else:
                uniq_df = pd.DataFrame({
                    "Column": df.columns,
                    "Distinct Values": [int(df[c].nunique()) for c in df.columns],
                }).sort_values(by="Distinct Values", ascending=False).reset_index(drop=True)
                res_payload = {
                    "result_type": "table",
                    "data": uniq_df,
                    "columns": list(uniq_df.columns),
                    "row_count": len(uniq_df),
                    "evidence": {"dataset_source": dataset_source_label},
                    "warnings": warnings,
                }

        # -------------------------------------------------------------
        # TREND & PERCENTAGE CHANGE
        # -------------------------------------------------------------
        elif intent in (QueryIntent.TREND.value, QueryIntent.PERCENTAGE_CHANGE.value):
            res_payload = compute_trend_query(
                df,
                date_col=query_plan.get("date_column"),
                metric_col=column,
                frequency="monthly",
                aggregation=aggregation,
                phase5_results=phase5_results,
            )
            res_payload["evidence"]["dataset_source"] = dataset_source_label

        # -------------------------------------------------------------
        # DATE COMPARISON & DATE RANGE
        # -------------------------------------------------------------
        elif intent in (QueryIntent.DATE_COMPARISON.value, QueryIntent.DATE_RANGE.value):
            dr = query_plan.get("date_range")
            dt_a = dr.get("start") if dr else None
            dt_b = dr.get("end") if dr else None
            res_payload = compare_dates(
                df,
                date_col=query_plan.get("date_column") or "Date",
                metric_col=column or "Price",
                date_a=dt_a,
                date_b=dt_b,
                aggregation=aggregation or "mean",
            )
            res_payload["evidence"]["dataset_source"] = dataset_source_label

        # -------------------------------------------------------------
        # CORRELATION
        # -------------------------------------------------------------
        elif intent == QueryIntent.CORRELATION.value:
            res_payload = compute_correlation_query(
                df,
                col_a=column,
                col_b=query_plan.get("secondary_column"),
                phase5_results=phase5_results,
            )
            res_payload["evidence"]["dataset_source"] = dataset_source_label

        # -------------------------------------------------------------
        # ANOMALIES
        # -------------------------------------------------------------
        elif intent in (QueryIntent.ANOMALY_SUMMARY.value, QueryIntent.ANOMALY_RECORDS.value):
            show_recs = (intent == QueryIntent.ANOMALY_RECORDS.value)
            res_payload = compute_anomaly_query(
                df,
                phase4_results=phase4_results,
                dataset_name=target_ds_name,
                target_column=column,
                show_records=show_recs,
            )
            res_payload["evidence"]["dataset_source"] = dataset_source_label

        # -------------------------------------------------------------
        # CROSS DATASET & DATASET COMPARISONS
        # -------------------------------------------------------------
        elif intent in (QueryIntent.CROSS_DATASET_ANALYSIS.value, QueryIntent.COMPARE_DATASETS.value):
            sec_ds = query_plan.get("secondary_dataset")
            if not sec_ds or sec_ds not in datasets:
                other_ds = [d for d in datasets.keys() if d != target_ds_name]
                sec_ds = other_ds[0] if other_ds else None

            if not sec_ds or sec_ds not in datasets:
                return {
                    "status": "error",
                    "result_type": "empty",
                    "data": None,
                    "columns": [],
                    "row_count": 0,
                    "evidence": {},
                    "warnings": warnings,
                    "errors": ["Cross-dataset analysis requires two uploaded datasets."],
                }

            sec_df = (cleaned_datasets[sec_ds] if cleaned_datasets and use_cleaned and sec_ds in cleaned_datasets else datasets[sec_ds])

            res_payload = execute_cross_dataset_query(
                left_name=target_ds_name,
                right_name=sec_ds,
                left_df=df,
                right_df=sec_df,
                relationships=relationships,
                query_plan=query_plan,
                join_audit=join_audit,
                config=config,
            )

        # -------------------------------------------------------------
        # COMPARE GROUPS
        # -------------------------------------------------------------
        elif intent == QueryIntent.COMPARE_GROUPS.value:
            cat_cols = [c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c]) and not is_identifier_column(c)]
            num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c]) and not is_identifier_column(c)]
            grp_col = group_by[0] if (group_by and group_by[0] in df.columns) else (cat_cols[0] if cat_cols else (df.columns[0] if len(df.columns) > 0 else "group"))
            metric = column if (column and column in df.columns) else (num_cols[0] if num_cols else (df.columns[1] if len(df.columns) > 1 else grp_col))
            res_payload = compare_groups(df, group_col=grp_col, metric_col=metric, aggregation=aggregation or "sum")
            res_payload["evidence"]["dataset_source"] = dataset_source_label

        # -------------------------------------------------------------
        # DESCRIPTIVE STATISTICS & INSIGHT SUMMARY
        # -------------------------------------------------------------
        # -------------------------------------------------------------
        # DESCRIPTIVE STATISTICS
        # -------------------------------------------------------------
        elif intent == QueryIntent.DESCRIPTIVE_STATISTICS.value:
            if column and column in df.columns and pd.api.types.is_numeric_dtype(df[column]):
                s = pd.to_numeric(df[column], errors="coerce").dropna()
                stats_rows = [
                    {"Statistic": "Count (valid)", "Value": f"{int(len(s)):,}"},
                    {"Statistic": "Mean", "Value": f"{float(s.mean()):,.2f}"},
                    {"Statistic": "Standard Deviation", "Value": f"{float(s.std()):,.2f}" if len(s) > 1 else "0.00"},
                    {"Statistic": "Minimum", "Value": f"{float(s.min()):,.2f}"},
                    {"Statistic": "25% (Q1)", "Value": f"{float(s.quantile(0.25)):,.2f}"},
                    {"Statistic": "Median (50%)", "Value": f"{float(s.median()):,.2f}"},
                    {"Statistic": "75% (Q3)", "Value": f"{float(s.quantile(0.75)):,.2f}"},
                    {"Statistic": "Maximum", "Value": f"{float(s.max()):,.2f}"},
                ]
                desc_df = pd.DataFrame(stats_rows)
                res_payload = {
                    "result_type": "table",
                    "data": desc_df,
                    "columns": list(desc_df.columns),
                    "row_count": len(desc_df),
                    "evidence": {
                        "column": column,
                        "count": int(len(s)),
                        "mean": round(float(s.mean()), 4),
                        "median": round(float(s.median()), 4),
                        "std": round(float(s.std()), 4) if len(s) > 1 else 0.0,
                        "min": round(float(s.min()), 4),
                        "max": round(float(s.max()), 4),
                        "dataset_source": dataset_source_label,
                    },
                    "warnings": warnings,
                }
            else:
                num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
                if num_cols:
                    desc_df = df[num_cols].describe().T.reset_index()
                    desc_df.rename(columns={"index": "Feature"}, inplace=True)
                    for col_name in desc_df.columns:
                        if desc_df[col_name].dtype in ("float64", "float32"):
                            desc_df[col_name] = desc_df[col_name].round(2)
                else:
                    desc_df = pd.DataFrame([{
                        "Metric": "Total Records", "Value": len(df),
                    }, {
                        "Metric": "Total Columns", "Value": len(df.columns),
                    }])

                res_payload = {
                    "result_type": "table",
                    "data": desc_df,
                    "columns": list(desc_df.columns),
                    "row_count": len(desc_df),
                    "evidence": {
                        "dataset_source": dataset_source_label,
                        "features_described": num_cols,
                    },
                    "warnings": warnings,
                }

        # -------------------------------------------------------------
        # INSIGHT SUMMARY & DATASET OVERVIEW
        # -------------------------------------------------------------
        elif intent == QueryIntent.INSIGHT_SUMMARY.value:
            discovered_insights = InsightEngine.discover_insights(
                df,
                target_column=column,
                date_column=query_plan.get("date_column"),
            )

            tot_rows = len(df)
            tot_cols = len(df.columns)
            tot_missing = int(df.isnull().sum().sum())
            missing_rate = round((tot_missing / max(df.size, 1)) * 100.0, 2)

            rows_summary = [
                {"Aspect": "Dataset Dimensions", "Key Observation": f"{tot_rows:,} rows × {tot_cols} columns ({tot_rows * tot_cols:,} total cells)", "Significance": "Dataset Scale"},
                {"Aspect": "Data Hygiene", "Key Observation": f"{tot_missing:,} missing values ({missing_rate}% overall missingness)", "Significance": "Completeness"},
            ]
            for ins in discovered_insights[:6]:
                rows_summary.append({
                    "Aspect": ins.get("type", "Pattern"),
                    "Key Observation": ins.get("statement", ""),
                    "Significance": ins.get("metric", "Notable"),
                })

            summary_df = pd.DataFrame(rows_summary)
            res_payload = {
                "result_type": "table",
                "data": summary_df,
                "columns": list(summary_df.columns),
                "row_count": len(summary_df),
                "evidence": {
                    "dataset_source": dataset_source_label,
                    "total_rows": tot_rows,
                    "total_columns": tot_cols,
                    "total_missing": tot_missing,
                    "automated_insights": discovered_insights,
                },
                "warnings": warnings,
            }

        # -------------------------------------------------------------
        # DATA QUALITY REPORT
        # -------------------------------------------------------------
        elif intent == QueryIntent.DATA_QUALITY_REPORT.value:
            tot_rows = len(df)
            tot_cols = len(df.columns)
            tot_cells = tot_rows * tot_cols
            tot_missing = int(df.isnull().sum().sum())
            completeness_pct = round(((tot_cells - tot_missing) / max(tot_cells, 1)) * 100.0, 2)
            cols_with_missing = int((df.isnull().sum() > 0).sum())
            dup_rows = int(df.duplicated().sum())
            dup_pct = round((dup_rows / max(tot_rows, 1)) * 100.0, 2)

            num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
            cat_cols = [c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c])]

            # Calculate unique outlier rows across numeric columns using IQR
            outlier_mask = pd.Series(False, index=df.index)
            for c in num_cols:
                s = pd.to_numeric(df[c], errors="coerce").dropna()
                if len(s) >= 4:
                    q1 = float(s.quantile(0.25))
                    q3 = float(s.quantile(0.75))
                    iqr = q3 - q1
                    if iqr > 0:
                        lower = q1 - 1.5 * iqr
                        upper = q3 + 1.5 * iqr
                        outlier_mask = outlier_mask | ((df[c] < lower) | (df[c] > upper))
            outlier_rows_cnt = int(outlier_mask.sum())
            outlier_pct = round((outlier_rows_cnt / max(tot_rows, 1)) * 100.0, 2)

            if completeness_pct >= 95.0 and dup_rows == 0 and outlier_pct <= 5.0:
                health_rating = "Excellent"
            elif completeness_pct >= 85.0 and dup_pct <= 5.0:
                health_rating = "Good"
            else:
                health_rating = "Needs Attention"

            report_rows = [
                {"Quality Metric": "Dataset Dimensions", "Evaluated Value": f"{tot_rows:,} rows × {tot_cols} columns", "Health Status": "Normal"},
                {"Quality Metric": "Data Completeness", "Evaluated Value": f"{completeness_pct}% ({tot_cells - tot_missing:,} / {tot_cells:,} cells filled)", "Health Status": "Normal" if completeness_pct >= 95 else "Warning"},
                {"Quality Metric": "Missing Values", "Evaluated Value": f"{tot_missing:,} missing cells across {cols_with_missing} columns", "Health Status": "Clean" if tot_missing == 0 else "Warning"},
                {"Quality Metric": "Duplicate Records", "Evaluated Value": f"{dup_rows:,} rows ({dup_pct}%)", "Health Status": "Clean" if dup_rows == 0 else "Warning"},
                {"Quality Metric": "Flagged Outliers (IQR)", "Evaluated Value": f"{outlier_rows_cnt:,} rows ({outlier_pct}%)", "Health Status": "Normal" if outlier_pct <= 5 else "Investigate"},
                {"Quality Metric": "Column Schema Types", "Evaluated Value": f"{len(num_cols)} Numeric, {len(cat_cols)} Categorical/Text", "Health Status": "Valid"},
                {"Quality Metric": "Overall Data Quality Score", "Evaluated Value": f"{health_rating} ({completeness_pct}% health)", "Health Status": health_rating},
            ]
            report_df = pd.DataFrame(report_rows)
            res_payload = {
                "result_type": "table",
                "data": report_df,
                "columns": list(report_df.columns),
                "row_count": len(report_df),
                "evidence": {
                    "dataset_source": dataset_source_label,
                    "total_rows": tot_rows,
                    "total_columns": tot_cols,
                    "completeness_pct": completeness_pct,
                    "missing_cells": tot_missing,
                    "missing_columns_count": cols_with_missing,
                    "duplicate_rows": dup_rows,
                    "duplicate_percentage": dup_pct,
                    "outlier_rows": outlier_rows_cnt,
                    "outlier_percentage": outlier_pct,
                    "health_rating": health_rating,
                },
                "warnings": warnings,
            }
        # -------------------------------------------------------------
        elif intent in (QueryIntent.FORECAST.value, QueryIntent.PREDICTION.value, "forecast", "prediction") or str(intent).upper() in ("FORECAST", "PREDICTION"):
            p5_res = None
            if phase5_results:
                if isinstance(phase5_results, dict):
                    if "schema_version" in phase5_results or "task" in phase5_results:
                        p5_res = phase5_results
                    elif target_ds_name in phase5_results:
                        p5_res = phase5_results[target_ds_name]
                    elif len(phase5_results) > 0:
                        for k, v in phase5_results.items():
                            tgt_c = getattr(v, "target_column", None) or (v.get("task", {}).get("target_column") if isinstance(v, dict) else None)
                            if tgt_c and column and str(tgt_c).lower() == str(column).lower():
                                p5_res = v
                                break
                        if not p5_res:
                            p5_res = list(phase5_results.values())[0]
                elif hasattr(phase5_results, "predictions") or hasattr(phase5_results, "to_canonical_dict"):
                    p5_res = phase5_results

            # Normalize to canonical dictionary or extract properties
            canon = None
            if hasattr(p5_res, "to_canonical_dict"):
                canon = p5_res.to_canonical_dict()
            elif isinstance(p5_res, dict) and ("schema_version" in p5_res or "task" in p5_res):
                canon = p5_res

            rows = []
            if canon:
                task_i = canon.get("task", {})
                model_i = canon.get("model", {})
                val_i = canon.get("validation", {})
                pred_i = canon.get("prediction", {})
                fc_i = canon.get("forecast", {})
                feat_i = canon.get("features", {})
                meta_i = canon.get("metadata", {})
                dataset_i = canon.get("dataset", {})

                # Extract rows from forecast or prediction values
                if fc_i.get("enabled") and fc_i.get("values"):
                    for idx, pt in enumerate(fc_i["values"]):
                        if isinstance(pt, dict):
                            p_label = pt.get("period", str(idx + 1))
                            pred_v = pt.get("predicted_value", 0.0)
                            row = {
                                "Period": p_label,
                                "Predicted Value": round(float(pred_v), 4) if isinstance(pred_v, (int, float)) else str(pred_v),
                            }
                            if pt.get("lower_bound") is not None:
                                row["Lower Bound (95%)"] = round(float(pt["lower_bound"]), 4)
                            if pt.get("upper_bound") is not None:
                                row["Upper Bound (95%)"] = round(float(pt["upper_bound"]), 4)
                            rows.append(row)
                        else:
                            rows.append({"Period": str(idx + 1), "Predicted Value": pt})
                elif pred_i.get("values"):
                    for idx, val in enumerate(pred_i["values"]):
                        rows.append({
                            "Period": str(idx + 1),
                            "Predicted Value": round(float(val), 4) if isinstance(val, (int, float)) else str(val),
                        })
                elif pred_i.get("value") is not None:
                    single_v = pred_i["value"]
                    rows.append({
                        "Period": "1",
                        "Predicted Value": round(float(single_v), 4) if isinstance(single_v, (int, float)) else str(single_v),
                    })

                if rows and canon.get("status") in ("success", "partial"):
                    pred_df = pd.DataFrame(rows)
                    metrics_map = val_i.get("metrics", {})
                    first_m_name = next(iter(metrics_map.keys())) if metrics_map else "MAE"
                    first_m_val = metrics_map.get(first_m_name, 0.0) if metrics_map else 0.0
                    res_payload = {
                        "result_type": "table",
                        "data": pred_df,
                        "columns": list(pred_df.columns),
                        "row_count": len(pred_df),
                        "evidence": {
                            "dataset": dataset_i.get("name") or target_ds_name,
                            "dataset_source": dataset_source_label,
                            "selected_model": model_i.get("name", "Trained Model"),
                            "target_column": task_i.get("target_column") or column or "",
                            "problem_type": task_i.get("problem_type", ""),
                            "mode": task_i.get("problem_type", ""),
                            "metric_name": str(first_m_name).upper(),
                            "metric_value": float(first_m_val) if isinstance(first_m_val, (int, float)) else 0.0,
                            "metrics": metrics_map,
                            "horizon": len(rows),
                            "forecast_horizon": fc_i.get("horizon", len(rows)),
                            "first_predicted": rows[0]["Predicted Value"] if rows else 0.0,
                            "last_predicted": rows[-1]["Predicted Value"] if rows else 0.0,
                            "explanation": " ".join(meta_i.get("notes", [])) if meta_i.get("notes") else "",
                            "features_used": task_i.get("feature_columns", []),
                            "feature_importance": feat_i.get("importance"),
                            "top_features": feat_i.get("top_features") or [],
                            "limitations": meta_i.get("notes", []),
                        },
                        "warnings": warnings,
                    }
                else:
                    msg = f"No prediction results are available yet for dataset '{target_ds_name}'. Run a prediction or forecasting analysis first."
                    warnings.append(msg)
                    res_payload = {
                        "result_type": "empty",
                        "data": None,
                        "columns": [],
                        "row_count": 0,
                        "evidence": {
                            "dataset_source": dataset_source_label,
                            "notice": "No prediction results are available yet. Run a prediction or forecasting analysis first.",
                            "suggestion": "Run a prediction or forecasting analysis first.",
                        },
                        "warnings": warnings,
                    }
            elif p5_res and (hasattr(p5_res, "predictions") or hasattr(p5_res, "predicted_points")):
                pts = getattr(p5_res, "predictions", None) or getattr(p5_res, "predicted_points", None)
                if pts:
                    for pt in pts:
                        p_label = getattr(pt, "index_or_date", None) or getattr(pt, "period_label", None) or str(getattr(pt, "step", ""))
                        pred_v = getattr(pt, "predicted_value", 0.0)
                        row = {
                            "Period": p_label,
                            "Predicted Value": round(float(pred_v), 4) if isinstance(pred_v, (int, float)) else str(pred_v),
                        }
                        if getattr(pt, "lower_bound", None) is not None:
                            row["Lower Bound (95%)"] = round(float(pt.lower_bound), 4)
                        if getattr(pt, "upper_bound", None) is not None:
                            row["Upper Bound (95%)"] = round(float(pt.upper_bound), 4)
                        rows.append(row)
                    pred_df = pd.DataFrame(rows)
                    best_m = getattr(p5_res, "best_metrics", None)
                    m_val = best_m.mae if best_m and getattr(best_m, "mae", None) is not None else getattr(p5_res, "metric_value", 0.0)
                    m_name = getattr(p5_res, "selection_metric", None) or getattr(p5_res, "metric_name", "MAE")
                    expl = getattr(p5_res, "explanation", None) or getattr(p5_res, "explanation_narrative", "")
                    res_payload = {
                        "result_type": "table",
                        "data": pred_df,
                        "columns": list(pred_df.columns),
                        "row_count": len(pred_df),
                        "evidence": {
                            "dataset": target_ds_name,
                            "dataset_source": dataset_source_label,
                            "selected_model": getattr(p5_res, "selected_model_name", "Trained Model"),
                            "target_column": getattr(p5_res, "target_column", column or ""),
                            "problem_type": getattr(p5_res, "problem_type", ""),
                            "mode": getattr(p5_res, "mode", ""),
                            "metric_name": m_name,
                            "metric_value": float(m_val) if m_val is not None else 0.0,
                            "metrics": best_m.to_dict() if best_m and hasattr(best_m, "to_dict") else getattr(p5_res, "metrics", {}),
                            "horizon": len(pts),
                            "forecast_horizon": getattr(p5_res, "forecast_horizon", len(pts)),
                            "first_predicted": float(getattr(pts[0], "predicted_value", 0.0)) if isinstance(getattr(pts[0], "predicted_value", None), (int, float)) else 0.0,
                            "last_predicted": float(getattr(pts[-1], "predicted_value", 0.0)) if isinstance(getattr(pts[-1], "predicted_value", None), (int, float)) else 0.0,
                            "explanation": expl,
                            "confidence_statement": getattr(p5_res, "confidence_statement", ""),
                            "features_used": getattr(p5_res, "features_used", []),
                            "feature_importance": [fi.__dict__ if hasattr(fi, "__dict__") else fi for fi in getattr(p5_res, "feature_importance", [])],
                            "limitations": getattr(p5_res, "limitations", []),
                        },
                        "warnings": warnings,
                    }
                else:
                    msg = f"No prediction results are available yet for dataset '{target_ds_name}'. Run a prediction or forecasting analysis first."
                    warnings.append(msg)
                    res_payload = {
                        "result_type": "empty",
                        "data": None,
                        "columns": [],
                        "row_count": 0,
                        "evidence": {
                            "dataset_source": dataset_source_label,
                            "notice": "No prediction results are available yet. Run a prediction or forecasting analysis first.",
                            "suggestion": "Run a prediction or forecasting analysis first.",
                        },
                        "warnings": warnings,
                    }
            else:
                msg = f"No prediction results are available yet for dataset '{target_ds_name}'. Run a prediction or forecasting analysis first."
                warnings.append(msg)
                res_payload = {
                    "result_type": "empty",
                    "data": None,
                    "columns": [],
                    "row_count": 0,
                    "evidence": {
                        "dataset_source": dataset_source_label,
                        "notice": "No prediction results are available yet. Run a prediction or forecasting analysis first.",
                        "suggestion": "Run a prediction or forecasting analysis first.",
                    },
                    "warnings": warnings,
                }

        # -------------------------------------------------------------
        # LINEAR REGRESSION
        # -------------------------------------------------------------
        elif intent == QueryIntent.REGRESSION.value:
            num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
            y_col = column if (column in df.columns and pd.api.types.is_numeric_dtype(df[column])) else (num_cols[0] if num_cols else None)
            sec_col = query_plan.get("secondary_column")
            x_candidates = [c for c in df.columns if c != y_col and (pd.api.types.is_numeric_dtype(df[c]) or pd.api.types.is_datetime64_any_dtype(df[c]))]
            x_col = sec_col if (sec_col in df.columns) else (x_candidates[0] if x_candidates else None)

            if not x_col or not y_col:
                errors.append("Linear regression requires two numerical columns (predictor X and target Y).")
                res_payload = {"result_type": "empty", "data": None, "columns": [], "row_count": 0, "evidence": {}}
            else:
                reg_res = AdvancedStatsEngine.compute_linear_regression(df, x_col, y_col)
                if not reg_res.get("success"):
                    errors.append(reg_res.get("error", "Regression failed."))
                    res_payload = {"result_type": "empty", "data": None, "columns": [], "row_count": 0, "evidence": {}}
                else:
                    reg_table = pd.DataFrame([
                        {"Metric": "Predictor (X)", "Value": str(x_col)},
                        {"Metric": "Target (Y)", "Value": str(y_col)},
                        {"Metric": "Slope (m)", "Value": reg_res["slope"]},
                        {"Metric": "Intercept (c)", "Value": reg_res["intercept"]},
                        {"Metric": "R-squared (R²)", "Value": reg_res["r_squared"]},
                        {"Metric": "P-value", "Value": reg_res["p_value"]},
                        {"Metric": "Standard Error", "Value": reg_res["standard_error"]},
                        {"Metric": "Equation", "Value": reg_res["equation"]},
                    ])
                    res_payload = {
                        "result_type": "table",
                        "data": reg_table,
                        "columns": ["Metric", "Value"],
                        "row_count": len(reg_table),
                        "evidence": {
                            "dataset_source": dataset_source_label,
                            "regression_details": reg_res,
                            "computed_values": {"r_squared": reg_res["r_squared"], "slope": reg_res["slope"]},
                        },
                        "warnings": warnings,
                    }

        # -------------------------------------------------------------
        # TWO-GROUP HYPOTHESIS TEST
        # -------------------------------------------------------------
        elif intent == QueryIntent.TWO_GROUP_TEST.value:
            cat_cols = [c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c])]
            num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
            g_col = (group_by[0] if group_by else None) or (cat_cols[0] if cat_cols else None)
            m_col = column if (column in num_cols) else (num_cols[0] if num_cols else None)

            if not g_col or not m_col:
                errors.append("Two-group hypothesis test requires a grouping category and a numerical metric.")
                res_payload = {"result_type": "empty", "data": None, "columns": [], "row_count": 0, "evidence": {}}
            else:
                test_res = AdvancedStatsEngine.compare_two_groups(df, g_col, m_col)
                if not test_res.get("success"):
                    errors.append(test_res.get("error", "Hypothesis test failed."))
                    res_payload = {"result_type": "empty", "data": None, "columns": [], "row_count": 0, "evidence": {}}
                else:
                    test_table = pd.DataFrame([
                        {"Parameter": "Group A", "Value": f"{test_res['group_a']['name']} (N={test_res['group_a']['sample_size']})"},
                        {"Parameter": "Group A Mean", "Value": test_res["group_a"]["mean"]},
                        {"Parameter": "Group B", "Value": f"{test_res['group_b']['name']} (N={test_res['group_b']['sample_size']})"},
                        {"Parameter": "Group B Mean", "Value": test_res["group_b"]["mean"]},
                        {"Parameter": "Mean Difference", "Value": test_res["mean_difference"]},
                        {"Parameter": "T-Statistic", "Value": test_res["t_statistic"]},
                        {"Parameter": "P-Value", "Value": test_res["p_value"]},
                        {"Parameter": "Effect Size (Cohen's d)", "Value": test_res["cohens_d"]},
                        {"Parameter": "Statistically Significant", "Value": "Yes (p < 0.05)" if test_res["is_significant"] else "No (p >= 0.05)"},
                    ])
                    res_payload = {
                        "result_type": "table",
                        "data": test_table,
                        "columns": ["Parameter", "Value"],
                        "row_count": len(test_table),
                        "evidence": {
                            "dataset_source": dataset_source_label,
                            "test_details": test_res,
                            "computed_values": {"p_value": test_res["p_value"], "t_statistic": test_res["t_statistic"]},
                        },
                        "warnings": warnings,
                    }

        # -------------------------------------------------------------
        # CHI-SQUARE TEST OF INDEPENDENCE
        # -------------------------------------------------------------
        elif intent == QueryIntent.CHI_SQUARE.value:
            cat_cols = [c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c])]
            if len(cat_cols) < 2:
                errors.append("Chi-square test of independence requires at least two categorical columns.")
                res_payload = {"result_type": "empty", "data": None, "columns": [], "row_count": 0, "evidence": {}}
            else:
                c_x = cat_cols[0]
                c_y = cat_cols[1]
                chi_res = AdvancedStatsEngine.chi_square_test(df, c_x, c_y)
                if not chi_res.get("success"):
                    errors.append(chi_res.get("error", "Chi-square test failed."))
                    res_payload = {"result_type": "empty", "data": None, "columns": [], "row_count": 0, "evidence": {}}
                else:
                    chi_table = pd.DataFrame([
                        {"Metric": "Feature X", "Value": str(c_x)},
                        {"Metric": "Feature Y", "Value": str(c_y)},
                        {"Metric": "Chi-Square Statistic (χ²)", "Value": chi_res["chi2_statistic"]},
                        {"Metric": "Degrees of Freedom", "Value": chi_res["degrees_of_freedom"]},
                        {"Metric": "P-Value", "Value": chi_res["p_value"]},
                        {"Metric": "Cramér's V (Association)", "Value": chi_res["cramers_v"]},
                        {"Metric": "Statistically Significant", "Value": "Yes (p < 0.05)" if chi_res["is_significant"] else "No (p >= 0.05)"},
                    ])
                    res_payload = {
                        "result_type": "table",
                        "data": chi_table,
                        "columns": ["Metric", "Value"],
                        "row_count": len(chi_table),
                        "evidence": {
                            "dataset_source": dataset_source_label,
                            "chi_details": chi_res,
                            "computed_values": {"chi2": chi_res["chi2_statistic"], "p_value": chi_res["p_value"]},
                        },
                        "warnings": warnings,
                    }

        # -------------------------------------------------------------
        # PERCENTAGE CONTRIBUTION / SHARE OF TOTAL
        # -------------------------------------------------------------
        elif intent == QueryIntent.PERCENTAGE_CONTRIBUTION.value:
            grp_col = group_by[0] if group_by and group_by[0] in df.columns else None
            if not grp_col:
                for c in ["Category", "category", "Department", "department", "Region", "region", "Product", "product", "Customer_Type", "customer_type"]:
                    if c in df.columns:
                        grp_col = c
                        break

            meas_col = column if column and column in df.columns else None
            if not meas_col:
                for c in ["Total_Amount", "billing_amount_inr", "sales", "revenue", "amount", "Quantity", "quantity", "Unit_Price", "unit_price"]:
                    if c in df.columns:
                        meas_col = c
                        break

            if not grp_col or not meas_col:
                errors.append(f"Cannot calculate percentage contribution: missing grouping or measure column in dataset '{target_ds_name}'.")
                res_payload = {"result_type": "empty", "data": None, "columns": [], "row_count": 0, "evidence": {}}
            else:
                df_calc = df.dropna(subset=[grp_col, meas_col]).copy()
                df_calc[meas_col] = pd.to_numeric(df_calc[meas_col], errors="coerce")
                df_calc = df_calc.dropna(subset=[meas_col])
                total_val = float(df_calc[meas_col].sum())

                if total_val == 0 or np.isnan(total_val):
                    res_df = pd.DataFrame([{grp_col: "Total", f"total_{meas_col}": 0.0, "percentage_share": 0.0}])
                else:
                    grp_sum = df_calc.groupby(grp_col, observed=False)[meas_col].sum().reset_index()
                    grp_sum.columns = [grp_col, f"total_{meas_col}"]
                    grp_sum["percentage_share"] = ((grp_sum[f"total_{meas_col}"] / total_val) * 100.0).round(2)
                    grp_sum = grp_sum.sort_values(by="percentage_share", ascending=False).reset_index(drop=True)
                    res_df = grp_sum

                top_grp = str(res_df.iloc[0][grp_col]) if not res_df.empty else ""
                top_pct = float(res_df.iloc[0]["percentage_share"]) if not res_df.empty else 0.0
                top_amt = float(res_df.iloc[0][f"total_{meas_col}"]) if not res_df.empty else 0.0

                evidence = {
                    "group_column": grp_col,
                    "measure_column": meas_col,
                    "total_amount": round(total_val, 2),
                    "top_group": top_grp,
                    "top_percentage": top_pct,
                    "top_amount": round(top_amt, 2),
                    "dataset_source": dataset_source_label,
                }
                res_payload = {
                    "result_type": "table",
                    "data": res_df,
                    "columns": list(res_df.columns),
                    "row_count": len(res_df),
                    "evidence": evidence,
                    "warnings": warnings,
                }

        # -------------------------------------------------------------
        # FREQUENCY / MODE / MOST COMMON CATEGORY
        # -------------------------------------------------------------
        elif intent == QueryIntent.FREQUENCY.value:
            target_col = column or (group_by[0] if group_by else None)
            if not target_col or target_col not in df.columns:
                cat_cols = [c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c]) and not is_identifier_column(c)]
                if cat_cols:
                    target_col = cat_cols[0]
                else:
                    errors.append("No categorical column found to calculate frequency.")
                    res_payload = {"result_type": "empty", "data": None, "columns": [], "row_count": 0, "evidence": {}}

            if target_col and target_col in df.columns:
                val_counts = df[target_col].value_counts(dropna=False).reset_index()
                val_counts.columns = [target_col, "frequency_count"]
                total_records = len(df)
                val_counts["percentage_share"] = ((val_counts["frequency_count"] / max(total_records, 1)) * 100.0).round(2)

                top_cat = str(val_counts.iloc[0][target_col])
                top_cnt = int(val_counts.iloc[0]["frequency_count"])
                top_share = float(val_counts.iloc[0]["percentage_share"])

                evidence = {
                    "column": target_col,
                    "most_frequent_value": top_cat,
                    "frequency_count": top_cnt,
                    "percentage_share": top_share,
                    "total_records": total_records,
                    "distinct_categories": int(df[target_col].nunique()),
                    "dataset_source": dataset_source_label,
                }
                res_payload = {
                    "result_type": "table",
                    "data": val_counts,
                    "columns": list(val_counts.columns),
                    "row_count": len(val_counts),
                    "evidence": evidence,
                    "warnings": warnings,
                }

        # -------------------------------------------------------------
        # AVERAGE ORDER VALUE (AOV)
        # -------------------------------------------------------------
        elif intent == QueryIntent.AVERAGE_ORDER_VALUE.value:
            rev_col = column if column and column in df.columns else None
            if not rev_col:
                for c in ["Total_Amount", "billing_amount_inr", "sales", "revenue", "amount"]:
                    if c in df.columns:
                        rev_col = c
                        break

            order_col = query_plan.get("secondary_column")
            if not order_col or order_col not in df.columns:
                for c in ["Order_ID", "order_id", "transaction_id", "patient_id", "id"]:
                    if c in df.columns:
                        order_col = c
                        break

            if not rev_col:
                errors.append(f"Cannot calculate Average Order Value: no revenue or sales amount column found in dataset '{target_ds_name}'.")
                res_payload = {"result_type": "empty", "data": None, "columns": [], "row_count": 0, "evidence": {}}
            else:
                clean_rev = pd.to_numeric(df[rev_col], errors="coerce").dropna()
                total_rev = float(clean_rev.sum())

                if order_col:
                    distinct_orders = int(df.dropna(subset=[rev_col])[order_col].nunique())
                    has_order_id = True
                else:
                    distinct_orders = int(len(clean_rev))
                    has_order_id = False

                aov = round(total_rev / max(distinct_orders, 1), 2)

                res_df = pd.DataFrame([{
                    "Average Order Value": aov,
                    "Total Revenue": round(total_rev, 2),
                    "Orders Evaluated": distinct_orders,
                    "Basis": f"Distinct {order_col}" if has_order_id else "Total Transaction Rows",
                }])

                evidence = {
                    "aov": aov,
                    "total_revenue": round(total_rev, 2),
                    "distinct_orders": distinct_orders,
                    "revenue_column": rev_col,
                    "order_column": order_col,
                    "has_order_id": has_order_id,
                    "dataset_source": dataset_source_label,
                }
                res_payload = {
                    "result_type": "table",
                    "data": res_df,
                    "columns": list(res_df.columns),
                    "row_count": 1,
                    "evidence": evidence,
                    "warnings": warnings,
                }

        # -------------------------------------------------------------
        # PROFITABILITY ANALYSIS
        # -------------------------------------------------------------
        elif intent == QueryIntent.PROFITABILITY.value:
            prod_col = group_by[0] if group_by and group_by[0] in df.columns else None
            if not prod_col:
                for c in ["Product", "product", "commodity", "item", "department", "Category", "category"]:
                    if c in df.columns:
                        prod_col = c
                        break

            profit_col = None
            for c in ["Profit", "profit", "net_profit", "margin"]:
                if c in df.columns:
                    profit_col = c
                    break

            cost_col = None
            for c in ["Cost", "cost", "cogs", "expense"]:
                if c in df.columns:
                    cost_col = c
                    break

            rev_col = None
            for c in ["Total_Amount", "billing_amount_inr", "sales", "revenue", "amount"]:
                if c in df.columns:
                    rev_col = c
                    break

            if not prod_col:
                errors.append(f"Cannot determine profitability: product or category column not found in dataset '{target_ds_name}'.")
                res_payload = {"result_type": "empty", "data": None, "columns": [], "row_count": 0, "evidence": {}}
            elif profit_col:
                df_calc = df.dropna(subset=[prod_col, profit_col]).copy()
                df_calc[profit_col] = pd.to_numeric(df_calc[profit_col], errors="coerce")
                grp = df_calc.groupby(prod_col, observed=False)[profit_col].sum().reset_index()
                grp.columns = [prod_col, "total_profit"]
                grp = grp.sort_values(by="total_profit", ascending=False).reset_index(drop=True)
                top_p = str(grp.iloc[0][prod_col])
                top_v = float(grp.iloc[0]["total_profit"])
                evidence = {
                    "product_column": prod_col,
                    "has_true_profit": True,
                    "metric_used": "total_profit",
                    "top_product": top_p,
                    "top_value": round(top_v, 2),
                    "dataset_source": dataset_source_label,
                    "assumption": "Calculated directly from explicit profit metrics.",
                }
                res_payload = {"result_type": "table", "data": grp, "columns": list(grp.columns), "row_count": len(grp), "evidence": evidence, "warnings": warnings}
            elif rev_col and cost_col:
                df_calc = df.dropna(subset=[prod_col, rev_col, cost_col]).copy()
                df_calc["computed_profit"] = pd.to_numeric(df_calc[rev_col], errors="coerce") - pd.to_numeric(df_calc[cost_col], errors="coerce")
                grp = df_calc.groupby(prod_col, observed=False)["computed_profit"].sum().reset_index()
                grp = grp.sort_values(by="computed_profit", ascending=False).reset_index(drop=True)
                top_p = str(grp.iloc[0][prod_col])
                top_v = float(grp.iloc[0]["computed_profit"])
                evidence = {
                    "product_column": prod_col,
                    "has_true_profit": True,
                    "metric_used": "computed_profit",
                    "top_product": top_p,
                    "top_value": round(top_v, 2),
                    "dataset_source": dataset_source_label,
                    "assumption": "Calculated as Revenue minus Cost.",
                }
                res_payload = {"result_type": "table", "data": grp, "columns": list(grp.columns), "row_count": len(grp), "evidence": evidence, "warnings": warnings}
            elif rev_col:
                df_calc = df.dropna(subset=[prod_col, rev_col]).copy()
                df_calc[rev_col] = pd.to_numeric(df_calc[rev_col], errors="coerce")
                grp = df_calc.groupby(prod_col, observed=False)[rev_col].sum().reset_index()
                grp.columns = [prod_col, "gross_sales_revenue"]
                grp = grp.sort_values(by="gross_sales_revenue", ascending=False).reset_index(drop=True)
                top_p = str(grp.iloc[0][prod_col])
                top_v = float(grp.iloc[0]["gross_sales_revenue"])
                evidence = {
                    "product_column": prod_col,
                    "has_true_profit": False,
                    "metric_used": "gross_sales_revenue",
                    "top_product": top_p,
                    "top_value": round(top_v, 2),
                    "dataset_source": dataset_source_label,
                    "assumption": "True profitability cannot be established because product cost, margin, or COGS data is not available in the dataset. Gross sales revenue is reported as an alternative under the stated assumption of uniform profit margins across products.",
                }
                res_payload = {"result_type": "table", "data": grp, "columns": list(grp.columns), "row_count": len(grp), "evidence": evidence, "warnings": warnings}
            else:
                errors.append(f"Cannot analyze profitability: neither profit, cost, nor revenue column exists in dataset '{target_ds_name}'.")
                res_payload = {"result_type": "empty", "data": None, "columns": [], "row_count": 0, "evidence": {}}

        # -------------------------------------------------------------
        # MULTI-PART EXECUTIVE DASHBOARD
        # -------------------------------------------------------------
        elif intent == QueryIntent.DASHBOARD.value:
            rev_col = None
            for c in ["Total_Amount", "billing_amount_inr", "sales", "revenue", "amount"]:
                if c in df.columns:
                    rev_col = c
                    break

            order_col = None
            for c in ["Order_ID", "order_id", "transaction_id", "patient_id", "id"]:
                if c in df.columns:
                    order_col = c
                    break

            region_col = None
            for c in ["Region", "region", "market", "location", "zone", "state"]:
                if c in df.columns:
                    region_col = c
                    break

            cat_col = None
            for c in ["Category", "category", "department", "Product", "product"]:
                if c in df.columns:
                    cat_col = c
                    break

            summary_metrics = {}
            unsupported_metrics = []

            # 1. Total revenue
            if rev_col:
                tot_rev = float(pd.to_numeric(df[rev_col], errors="coerce").dropna().sum())
                summary_metrics["Total Revenue"] = round(tot_rev, 2)
            else:
                tot_rev = None
                unsupported_metrics.append("Total Revenue (no revenue/sales column found)")

            # 2. Total orders
            if order_col:
                tot_orders = int(df[order_col].nunique())
                summary_metrics["Total Orders"] = tot_orders
            else:
                tot_orders = len(df)
                summary_metrics["Total Orders (Transactions)"] = tot_orders

            # 3. Average order value
            if tot_rev is not None and tot_orders > 0:
                aov = round(tot_rev / tot_orders, 2)
                summary_metrics["Average Order Value"] = aov
            else:
                aov = None
                unsupported_metrics.append("Average Order Value (revenue or order data unavailable)")

            # 4. Revenue by region
            region_breakdown = {}
            if rev_col and region_col:
                df_reg = df.dropna(subset=[region_col, rev_col]).copy()
                df_reg[rev_col] = pd.to_numeric(df_reg[rev_col], errors="coerce")
                reg_grp = df_reg.groupby(region_col, observed=False)[rev_col].sum().sort_values(ascending=False)
                region_breakdown = {str(k): round(float(v), 2) for k, v in reg_grp.items()}
            else:
                unsupported_metrics.append("Revenue by Region (region column not present in schema)")

            # 5. Sales by category
            cat_breakdown = {}
            if rev_col and cat_col:
                df_cat = df.dropna(subset=[cat_col, rev_col]).copy()
                df_cat[rev_col] = pd.to_numeric(df_cat[rev_col], errors="coerce")
                cat_grp = df_cat.groupby(cat_col, observed=False)[rev_col].sum().sort_values(ascending=False)
                cat_breakdown = {str(k): round(float(v), 2) for k, v in cat_grp.items()}
            else:
                unsupported_metrics.append("Sales by Category (category column not present in schema)")

            summary_rows = []
            for k, v in summary_metrics.items():
                summary_rows.append({"Analytical Metric": k, "Value / Observation": f"{v:,.2f}" if isinstance(v, (int, float)) else str(v)})
            if region_breakdown:
                top_r = list(region_breakdown.items())[0]
                summary_rows.append({"Analytical Metric": f"Leading Region ({region_col})", "Value / Observation": f"{top_r[0]} (${top_r[1]:,.2f})"})
            if cat_breakdown:
                top_c = list(cat_breakdown.items())[0]
                summary_rows.append({"Analytical Metric": f"Leading Category ({cat_col})", "Value / Observation": f"{top_c[0]} (${top_c[1]:,.2f})"})
            for unsupp in unsupported_metrics:
                summary_rows.append({"Analytical Metric": unsupp.split("(")[0].strip(), "Value / Observation": "Unavailable (Schema limitation)"})

            res_df = pd.DataFrame(summary_rows)

            evidence = {
                "summary_metrics": summary_metrics,
                "region_breakdown": region_breakdown,
                "category_breakdown": cat_breakdown,
                "unsupported_metrics": unsupported_metrics,
                "revenue_column": rev_col,
                "order_column": order_col,
                "region_column": region_col,
                "category_column": cat_col,
                "dataset_source": dataset_source_label,
            }
            res_payload = {
                "result_type": "table",
                "data": res_df,
                "columns": list(res_df.columns),
                "row_count": len(res_df),
                "evidence": evidence,
                "warnings": warnings + ([f"Unsupported metric: {m}" for m in unsupported_metrics] if unsupported_metrics else []),
            }

        # -------------------------------------------------------------
        # COMPLEX SUBQUERY & MULTI-STAGE ANALYSIS (Section 6)
        # -------------------------------------------------------------
        elif intent == QueryIntent.COMPLEX_SUBQUERY.value:
            entity_col = (group_by[0] if group_by else None) or query_plan.get("metadata", {}).get("entity_column")
            metric_col = column or query_plan.get("metadata", {}).get("metric_column")
            sub_type = query_plan.get("metadata", {}).get("subquery_type", "entity_average_comparison")
            op = query_plan.get("metadata", {}).get("operator", ">")
            agg_fn = aggregation or "sum"

            if not entity_col or entity_col not in df.columns or not metric_col or metric_col not in df.columns:
                errors.append(f"Entity column '{entity_col}' or metric column '{metric_col}' not available in dataset.")
                res_payload = {
                    "result_type": "empty",
                    "data": pd.DataFrame(),
                    "columns": [],
                    "row_count": 0,
                    "evidence": {},
                    "warnings": warnings,
                    "errors": errors,
                }
            else:
                work_df = df.copy()
                work_df[metric_col] = pd.to_numeric(work_df[metric_col], errors="coerce")

                if sub_type == "compare_against_overall":
                    # Stage 1: Group by entity and compute total
                    grouped_df = work_df.groupby(entity_col, observed=False)[metric_col].agg(agg_fn).reset_index()
                    val_col_name = f"{agg_fn.title()} {metric_col}"
                    grouped_df.columns = [entity_col, val_col_name]
                    overall_total = float(work_df[metric_col].sum())
                    grouped_df["Overall Total"] = round(overall_total, 2)
                    grouped_df["% of Overall Total"] = (
                        (grouped_df[val_col_name] / overall_total * 100).round(2) if overall_total != 0 else 0.0
                    )
                    sorted_df = grouped_df.sort_values(by=val_col_name, ascending=False).reset_index(drop=True)
                    res_payload = {
                        "result_type": "table",
                        "data": sorted_df,
                        "columns": list(sorted_df.columns),
                        "row_count": len(sorted_df),
                        "evidence": {
                            "subquery_type": sub_type,
                            "entity_column": entity_col,
                            "metric_column": metric_col,
                            "overall_total": round(overall_total, 2),
                            "total_entities": len(sorted_df),
                            "dataset_source": dataset_source_label,
                        },
                        "warnings": warnings,
                    }
                else:
                    # Entity-level aggregate compared against average of entity aggregates
                    # (e.g. "Show categories whose total revenue exceeds the overall average category revenue")
                    grouped_df = work_df.groupby(entity_col, observed=False)[metric_col].agg(agg_fn).reset_index()
                    val_col_name = f"{agg_fn.title()} {metric_col}"
                    grouped_df.columns = [entity_col, val_col_name]

                    # Stage 2: Calculate threshold = average of entity-level totals
                    threshold = float(grouped_df[val_col_name].mean())

                    # Stage 3: Filter records matching comparison operator
                    if op == "<":
                        matching_df = grouped_df[grouped_df[val_col_name] < threshold].copy()
                        comp_desc = "below"
                    else:
                        matching_df = grouped_df[grouped_df[val_col_name] > threshold].copy()
                        comp_desc = "above"

                    thresh_col_name = f"Avg Category {metric_col}" if "category" in entity_col.lower() else f"Average {val_col_name}"
                    matching_df[thresh_col_name] = round(threshold, 2)
                    matching_df["Difference From Avg"] = (matching_df[val_col_name] - threshold).round(2)
                    matching_df["% Above Avg" if op != "<" else "% Below Avg"] = (
                        ((matching_df[val_col_name] - threshold) / threshold * 100).abs().round(2) if threshold != 0 else 0.0
                    )
                    sorted_df = matching_df.sort_values(by=val_col_name, ascending=(op == "<")).reset_index(drop=True)

                    res_payload = {
                        "result_type": "table",
                        "data": sorted_df,
                        "columns": list(sorted_df.columns),
                        "row_count": len(sorted_df),
                        "evidence": {
                            "subquery_type": sub_type,
                            "entity_column": entity_col,
                            "metric_column": metric_col,
                            "operator": op,
                            "comparison_desc": comp_desc,
                            "average_threshold": round(threshold, 2),
                            "overall_average": round(threshold, 2),
                            "total_entities_evaluated": len(grouped_df),
                            "matching_entities_count": len(sorted_df),
                            "top_entities": list(sorted_df[entity_col].head(5)),
                            "dataset_source": dataset_source_label,
                        },
                        "warnings": warnings,
                    }

        # -------------------------------------------------------------
        # OUT OF SCOPE / UNRELATED INQUIRY
        # -------------------------------------------------------------
        elif intent == QueryIntent.OUT_OF_SCOPE.value:
            res_payload = {
                "result_type": "summary",
                "data": "out_of_scope",
                "columns": [],
                "row_count": 1,
                "evidence": {
                    "out_of_scope": True,
                    "dataset": target_ds_name,
                    "dataset_source": dataset_source_label,
                },
                "warnings": warnings,
            }

        # -------------------------------------------------------------
        # UNSUPPORTED ANALYTICAL OPERATION
        # -------------------------------------------------------------
        elif intent == QueryIntent.UNSUPPORTED_OPERATION.value:
            uop = query_plan.get("metadata", {}).get("unsupported_operation", "requested analytical operation")
            res_payload = {
                "result_type": "summary",
                "data": "unsupported_operation",
                "columns": [column] if column else [],
                "row_count": 1,
                "evidence": {
                    "unsupported_operation": uop,
                    "requested_column": column,
                    "dataset": target_ds_name,
                    "dataset_source": dataset_source_label,
                },
                "warnings": warnings,
            }

        # -------------------------------------------------------------
        # UNKNOWN / FALLBACK
        # -------------------------------------------------------------
        else:
            errors.append(f"Query intent '{intent}' could not be executed deterministically.")
            res_payload = {
                "result_type": "empty",
                "data": None,
                "columns": [],
                "row_count": 0,
                "evidence": {},
                "warnings": warnings,
            }

    except Exception as e:
        errors.append(f"Execution error: {str(e)}")
        res_payload = {
            "result_type": "error",
            "data": None,
            "columns": [],
            "row_count": 0,
            "evidence": {},
            "warnings": warnings,
        }

    # Ensure table view is converted if scalar
    data_out = res_payload.get("data")
    if res_payload.get("result_type") == "scalar" and "table_view" in res_payload:
        data_out = res_payload["table_view"]

    evidence_out = res_payload.get("evidence", {})
    if df is not None and not df.empty and "automated_insights" not in evidence_out:
        evidence_out["automated_insights"] = InsightEngine.discover_insights(
            df,
            target_column=column,
            group_column=(group_by[0] if group_by else None),
        )

    return {
        "status": "error" if errors else "success",
        "result_type": res_payload.get("result_type", "table"),
        "data": data_out,
        "columns": res_payload.get("columns", []),
        "row_count": res_payload.get("row_count", 0),
        "evidence": evidence_out,
        "warnings": warnings + res_payload.get("warnings", []),
        "errors": errors,
    }
