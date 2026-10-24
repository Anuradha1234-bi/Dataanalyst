"""Aggregation Engine for Phase 6 Natural Language Query Engine.

Computes safe, deterministic single-column and grouped aggregations:
count, sum, mean, median, min, max, std, nunique, with sorting, limits, and offsets.
"""

from typing import Dict, Any, List, Optional, Union
import pandas as pd
import numpy as np


def compute_aggregation(
    df: pd.DataFrame,
    column: Optional[str] = None,
    aggregation: str = "mean",
    group_by: Optional[List[str]] = None,
    sort: Optional[str] = None,  # "descending", "ascending", or None
    limit: Optional[int] = None,
    offset: Optional[int] = None,
) -> Dict[str, Any]:
    """Compute mathematical aggregation over a DataFrame safely.
    
    Returns structured execution result:
    {
        "result_type": "table" | "scalar",
        "data": DataFrame | scalar,
        "columns": List[str],
        "row_count": int,
        "evidence": Dict[str, Any],
        "warnings": List[str]
    }
    """
    warnings: List[str] = []

    if df is None or df.empty:
        return {
            "result_type": "empty",
            "data": pd.DataFrame(),
            "columns": [],
            "row_count": 0,
            "evidence": {"message": "DataFrame is empty."},
            "warnings": ["The dataset contains no rows."],
        }

    agg_clean = (aggregation or "mean").lower()
    if agg_clean in ("avg", "average"):
        agg_clean = "mean"

    # CASE A: Group-by aggregation (e.g. Market by average price)
    if group_by and len(group_by) > 0:
        valid_groups = [g for g in group_by if g in df.columns]
        if not valid_groups:
            warnings.append(f"Group columns {group_by} not found in dataset. Falling back to whole-dataset aggregation.")
            return compute_aggregation(df, column, aggregation, group_by=None, sort=sort, limit=limit, offset=offset)

        if not column or column not in df.columns:
            # If no measure column specified, count records per group
            res_series = df.groupby(valid_groups, observed=False).size().reset_index(name="record_count")
            measure_label = "record_count"
        else:
            measure_label = f"{agg_clean}_{column}"
            # Ensure column is numeric for numeric aggregations
            if agg_clean in ("mean", "median", "sum", "std") and not pd.api.types.is_numeric_dtype(df[column]):
                # Attempt conversion
                converted = pd.to_numeric(df[column], errors="coerce")
                if converted.dropna().empty:
                    warnings.append(f"Column '{column}' cannot be converted to numeric for '{agg_clean}'. Counting occurrences instead.")
                    res_series = df.groupby(valid_groups, observed=False)[column].count().reset_index(name=f"count_{column}")
                    measure_label = f"count_{column}"
                else:
                    df_calc = df.copy()
                    df_calc[column] = converted
                    res_series = df_calc.groupby(valid_groups, observed=False)[column].agg(agg_clean).reset_index(name=measure_label)
            else:
                res_series = df.groupby(valid_groups, observed=False)[column].agg(agg_clean).reset_index(name=measure_label)

        # Apply sorting
        if sort in ("descending", "desc"):
            res_series = res_series.sort_values(by=measure_label, ascending=False)
        elif sort in ("ascending", "asc"):
            res_series = res_series.sort_values(by=measure_label, ascending=True)

        total_rows = len(res_series)

        # Apply offset if requested (e.g. "second highest" -> offset=1, limit=1)
        if offset is not None and offset > 0:
            res_series = res_series.iloc[offset:]

        # Apply limit
        if limit is not None and limit > 0:
            res_series = res_series.head(limit)

        evidence = {
            "aggregation": agg_clean,
            "measure_column": column or "records",
            "group_columns": valid_groups,
            "total_groups": total_rows,
            "returned_rows": len(res_series),
            "top_record": res_series.iloc[0].to_dict() if not res_series.empty else {},
        }

        return {
            "result_type": "table",
            "data": res_series.reset_index(drop=True),
            "columns": list(res_series.columns),
            "row_count": len(res_series),
            "evidence": evidence,
            "warnings": warnings,
        }

    # CASE B: Whole-dataset single aggregation (e.g. "What is the average modal price?")
    if not column or column not in df.columns:
        if agg_clean == "count":
            val = int(len(df))
            return {
                "result_type": "scalar",
                "data": val,
                "columns": ["record_count"],
                "row_count": 1,
                "evidence": {"value": val, "aggregation": "count", "column": "all_rows"},
                "warnings": warnings,
            }
        num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
        if num_cols and agg_clean in ("mean", "median", "sum", "std", "min", "max"):
            stats_rows = []
            for c in num_cols:
                s = pd.to_numeric(df[c], errors="coerce").dropna()
                if not s.empty:
                    if agg_clean in ("mean", "avg"):
                        val = float(s.mean())
                    elif agg_clean == "median":
                        val = float(s.median())
                    elif agg_clean in ("std", "stdev"):
                        val = float(s.std()) if len(s) > 1 else 0.0
                    elif agg_clean == "min":
                        val = float(s.min())
                    elif agg_clean == "max":
                        val = float(s.max())
                    elif agg_clean == "sum":
                        val = float(s.sum())
                    else:
                        val = 0.0
                    stats_rows.append({"Feature": c, f"{agg_clean.title()}": round(val, 2)})
            res_df = pd.DataFrame(stats_rows)
            return {
                "result_type": "table",
                "data": res_df,
                "columns": list(res_df.columns),
                "row_count": len(res_df),
                "evidence": {
                    "aggregation": agg_clean,
                    "features": num_cols,
                    "computed_values": stats_rows,
                },
                "warnings": warnings,
            }

        return {
            "result_type": "empty",
            "data": None,
            "columns": [],
            "row_count": 0,
            "evidence": {
                "message": f"No valid numerical column specified for aggregation '{agg_clean}'. Available numerical columns: {num_cols}",
                "available_columns": list(df.columns),
                "numeric_columns": num_cols,
            },
            "warnings": [f"Cannot compute '{agg_clean}' without a valid numerical column. Available columns: {list(df.columns)}"],
        }

    series = df[column]
    if agg_clean in ("mean", "median", "sum", "std"):
        if not pd.api.types.is_numeric_dtype(series):
            converted = pd.to_numeric(series, errors="coerce")
            if converted.dropna().empty and not series.dropna().empty:
                return {
                    "result_type": "error",
                    "data": None,
                    "columns": [column],
                    "row_count": 0,
                    "evidence": {
                        "error": f"Cannot compute numeric {agg_clean} on categorical/text column '{column}'. Mean and mathematical averages require a numeric column.",
                        "column": column,
                        "data_type": str(df[column].dtype),
                    },
                    "warnings": [f"Categorical column '{column}' cannot be used for numeric aggregation '{agg_clean}'."],
                }
            series = converted
    elif agg_clean in ("min", "max") and not pd.api.types.is_numeric_dtype(series):
        converted = pd.to_numeric(series, errors="coerce")
        if not converted.dropna().empty and converted.count() >= series.count() * 0.8:
            series = converted

    series_valid = series.dropna()
    if series_valid.empty:
        return {
            "result_type": "scalar",
            "data": None,
            "columns": [column],
            "row_count": 0,
            "evidence": {"message": f"Column '{column}' contains no valid values."},
            "warnings": [f"No valid values found in '{column}'."],
        }

    if agg_clean == "mean":
        val = float(series_valid.mean())
    record_ext = None
    rec_index = None

    if agg_clean == "min":
        val = float(series_valid.min()) if pd.api.types.is_numeric_dtype(series_valid) else series_valid.min()
        try:
            rec_index = series_valid.idxmin()
            record_ext = {str(k): (round(float(v), 4) if isinstance(v, (float, np.floating)) else (int(v) if isinstance(v, (int, np.integer)) else str(v))) for k, v in df.loc[rec_index].to_dict().items()}
        except Exception:
            pass
    elif agg_clean == "max":
        val = float(series_valid.max()) if pd.api.types.is_numeric_dtype(series_valid) else series_valid.max()
        try:
            rec_index = series_valid.idxmax()
            record_ext = {str(k): (round(float(v), 4) if isinstance(v, (float, np.floating)) else (int(v) if isinstance(v, (int, np.integer)) else str(v))) for k, v in df.loc[rec_index].to_dict().items()}
        except Exception:
            pass
    elif agg_clean == "median":
        val = float(series_valid.median())
    elif agg_clean == "sum":
        val = float(series_valid.sum())
    elif agg_clean == "std":
        val = float(series_valid.std(ddof=1))
    elif agg_clean == "nunique":
        val = int(series_valid.nunique())
    elif agg_clean == "count":
        val = int(len(series_valid))
    else:
        val = float(series_valid.mean())
        warnings.append(f"Unknown aggregation '{agg_clean}'; defaulted to mean.")

    # Round floats nicely
    if isinstance(val, float):
        val = round(val, 4)

    evidence = {
        "column": column,
        "aggregation": agg_clean,
        "value": val,
        "count_valid": int(len(series_valid)),
        "count_null": int(df[column].isna().sum()),
    }
    if agg_clean == "std":
        evidence["ddof"] = 1
        evidence["degrees_of_freedom"] = int(len(series_valid) - 1)
        evidence["standard_deviation_type"] = "sample (unbiased, ddof=1)"
    if record_ext is not None:
        evidence["record"] = record_ext
        try:
            evidence["record_index"] = int(rec_index) + 1 if isinstance(rec_index, (int, np.integer)) else str(rec_index)
        except Exception:
            evidence["record_index"] = str(rec_index)

    # Build DataFrame: if extreme record exists, render full record; otherwise single-row value
    if record_ext is not None:
        res_df = pd.DataFrame([record_ext])
        columns_out = list(res_df.columns)
    else:
        res_df = pd.DataFrame([{f"{agg_clean}_{column}": val}])
        columns_out = [f"{agg_clean}_{column}"]

    return {
        "result_type": "table" if record_ext is not None else "scalar",
        "data": res_df if record_ext is not None else val,
        "table_view": res_df,
        "columns": columns_out,
        "row_count": 1,
        "evidence": evidence,
        "warnings": warnings,
    }
