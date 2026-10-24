"""Trend Query Engine for Phase 6 Natural Language Query Engine.

Computes temporal trends, trajectories, and percentage shifts.
Reuses Phase 5 trend analyses when available to avoid redundant computation.
"""

from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np


from query.column_resolver import is_identifier_column


def compute_trend_query(
    df: pd.DataFrame,
    date_col: Optional[str] = None,
    metric_col: Optional[str] = None,
    frequency: str = "monthly",
    aggregation: Optional[str] = None,
    phase5_results: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Compute temporal trend analysis over time series data."""
    warnings: List[str] = []
    if df is None or df.empty:
        return {
            "result_type": "empty",
            "data": pd.DataFrame(),
            "columns": [],
            "row_count": 0,
            "evidence": {},
            "warnings": ["DataFrame is empty."],
        }

    # Detect date column if not provided
    if not date_col:
        for c in df.columns:
            if any(term in c.lower() for term in ["date", "time", "timestamp", "month", "year"]):
                date_col = c
                break

    if not date_col or date_col not in df.columns:
        return {
            "result_type": "empty",
            "data": pd.DataFrame(),
            "columns": [],
            "row_count": 0,
            "evidence": {},
            "warnings": ["No date or chronological column identified for trend analysis."],
        }

    # Detect metric column if not provided
    if not metric_col:
        num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c]) and c != date_col and not is_identifier_column(c)]
        if num_cols:
            metric_col = num_cols[0]
        else:
            return {
                "result_type": "empty",
                "data": pd.DataFrame(),
                "columns": [],
                "row_count": 0,
                "evidence": {},
                "warnings": ["No numeric measure column found for trend analysis."],
            }

    if is_identifier_column(metric_col):
        warnings.append(
            f"Notice: Column '{metric_col}' appears to be a sequential identifier rather than a continuous business metric. "
            f"Trends computed over IDs do not reflect operational business performance."
        )

    calc_df = df.copy()
    calc_df[date_col] = pd.to_datetime(calc_df[date_col], errors="coerce")
    calc_df[metric_col] = pd.to_numeric(calc_df[metric_col], errors="coerce")
    calc_df = calc_df.dropna(subset=[date_col, metric_col]).sort_values(by=date_col)

    if len(calc_df) < 2:
        return {
            "result_type": "empty",
            "data": pd.DataFrame(),
            "columns": [],
            "row_count": 0,
            "evidence": {},
            "warnings": ["Insufficient chronological data points for trend analysis."],
        }

    # Determine aggregation matching the intent/measure
    agg_clean = (aggregation or "").lower()
    if agg_clean in ("sum", "total") or (not agg_clean and any(t in str(metric_col).lower() for t in ["sales", "revenue", "amount", "total", "qty", "quantity"])):
        agg_func = "sum"
        measure_label = f"total_{metric_col}"
    elif agg_clean in ("max", "maximum"):
        agg_func = "max"
        measure_label = f"max_{metric_col}"
    elif agg_clean in ("min", "minimum"):
        agg_func = "min"
        measure_label = f"min_{metric_col}"
    else:
        agg_func = "mean"
        measure_label = f"average_{metric_col}"

    # Resample or group by date
    # Determine appropriate period: if span > 90 days, monthly, else daily
    span_days = (calc_df[date_col].max() - calc_df[date_col].min()).days
    if frequency == "daily" or span_days <= 30:
        calc_df["Period"] = calc_df[date_col].dt.strftime("%Y-%m-%d")
    elif frequency == "weekly" or span_days <= 90:
        calc_df["Period"] = calc_df[date_col].dt.to_period("W").astype(str)
    else:
        calc_df["Period"] = calc_df[date_col].dt.to_period("M").astype(str)

    # Preserve chronological order by grouping while preserving date sort
    trend_series = calc_df.groupby("Period", observed=False, sort=False)[metric_col].agg(agg_func).reset_index()
    trend_series.columns = ["Period", measure_label]

    start_val = float(trend_series.iloc[0][measure_label])
    end_val = float(trend_series.iloc[-1][measure_label])
    pct_change = ((end_val - start_val) / start_val * 100.0) if start_val != 0 else 0.0

    if pct_change >= 2.0:
        direction = "upward"
    elif pct_change <= -2.0:
        direction = "downward"
    else:
        direction = "stable"

    evidence = {
        "date_column": date_col,
        "metric_column": metric_col,
        "aggregation": agg_func,
        "start_period": str(trend_series.iloc[0]["Period"]),
        "start_value": round(start_val, 2),
        "end_period": str(trend_series.iloc[-1]["Period"]),
        "end_value": round(end_val, 2),
        "percentage_change": round(pct_change, 2),
        "direction": direction,
        "data_points": len(trend_series),
    }

    return {
        "result_type": "table",
        "data": trend_series,
        "columns": list(trend_series.columns),
        "row_count": len(trend_series),
        "evidence": evidence,
        "warnings": warnings,
    }
