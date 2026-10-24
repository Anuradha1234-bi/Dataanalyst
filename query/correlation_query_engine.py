"""Correlation Query Engine for Phase 6 Natural Language Query Engine.

Computes pairwise correlations and identifies strong linear associations.
Reuses Phase 5 correlation results if available.
Always clarifies that correlation does NOT imply causation.
Metadata-aware: excludes technical extraction metadata from automatic pairs,
while honoring explicit user requests.
"""

from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np

from query.column_resolver import is_metadata_column, filter_metadata_columns, are_columns_identical


def compute_correlation_query(
    df: pd.DataFrame,
    col_a: Optional[str] = None,
    col_b: Optional[str] = None,
    threshold: float = 0.5,
    phase5_results: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Calculate and filter correlation relationships across numeric columns with safety checks.

    Safeguards:
    - Excludes constant columns (zero variance) with explicit disclosure.
    - Clearly distinguishes duplicate/equivalent columns from independent statistical correlation.
    - Includes causation warning on every result.
    - Generates full correlation matrix for Heatmap visualization.
    """
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

    # CASE 1: Both col_a and col_b explicitly requested by user
    if col_a and col_b:
        missing_explicit = [c for c in (col_a, col_b) if c not in df.columns]
        if missing_explicit:
            return {
                "result_type": "empty",
                "data": pd.DataFrame(),
                "columns": [],
                "row_count": 0,
                "evidence": {"message": f"Requested column(s) {missing_explicit} not found in dataset."},
                "warnings": [f"Columns {missing_explicit} do not exist in dataset."],
            }

        s_a = pd.to_numeric(df[col_a], errors="coerce")
        s_b = pd.to_numeric(df[col_b], errors="coerce")
        valid_mask = s_a.notna() & s_b.notna()
        if valid_mask.sum() < 3:
            return {
                "result_type": "empty",
                "data": pd.DataFrame(),
                "columns": [],
                "row_count": 0,
                "evidence": {"message": f"Insufficient non-null observations between '{col_a}' and '{col_b}' (minimum 3 required)."},
                "warnings": [f"Not enough valid numerical pairs between '{col_a}' and '{col_b}'."],
            }

        # Check for constant column in either feature
        if s_a[valid_mask].nunique() <= 1 or np.isclose(float(s_a[valid_mask].std()), 0.0):
            return {
                "result_type": "empty",
                "data": pd.DataFrame(),
                "columns": [],
                "row_count": 0,
                "evidence": {
                    "message": f"Column '{col_a}' is constant (zero variance) across evaluated rows. Correlation is mathematically undefined.",
                    "column": col_a,
                },
                "warnings": [f"Column '{col_a}' has zero variance / constant value. Excluded from correlation analysis."],
            }
        if s_b[valid_mask].nunique() <= 1 or np.isclose(float(s_b[valid_mask].std()), 0.0):
            return {
                "result_type": "empty",
                "data": pd.DataFrame(),
                "columns": [],
                "row_count": 0,
                "evidence": {
                    "message": f"Column '{col_b}' is constant (zero variance) across evaluated rows. Correlation is mathematically undefined.",
                    "column": col_b,
                },
                "warnings": [f"Column '{col_b}' has zero variance / constant value. Excluded from correlation analysis."],
            }

        # Check for identical duplicate column content
        is_dup = are_columns_identical(df[col_a], df[col_b])
        r_val = 1.0 if is_dup else float(s_a[valid_mask].corr(s_b[valid_mask], method="pearson"))
        if np.isnan(r_val):
            r_val = 0.0

        abs_r = abs(r_val)
        strength = "Strong (Duplicate Columns)" if is_dup else ("Strong" if abs_r >= 0.70 else ("Moderate" if abs_r >= 0.40 else "Weak"))
        direction = "Positive" if r_val > 0 else "Negative"

        pair_row = {
            "Feature A": col_a,
            "Feature B": col_b,
            "Correlation (r)": round(r_val, 4),
            "Strength": strength,
            "Direction": direction,
        }
        if is_dup:
            pair_row["Note"] = "Identical column values (r=1.00 reflects column equivalence, not empirical correlation)."

        res_df = pd.DataFrame([pair_row])
        evidence = {
            "pairs_analyzed": 1,
            "strongest_pair": pair_row,
            "causation_warning": "Correlation does NOT imply causation. Associations reflect statistical covariance, not cause-and-effect.",
            "categories": [col_a, col_b],
            "matrix": [[1.0, round(r_val, 4)], [round(r_val, 4), 1.0]],
        }
        return {
            "result_type": "table",
            "data": res_df,
            "columns": list(res_df.columns),
            "row_count": 1,
            "evidence": evidence,
            "warnings": warnings,
        }

    # Numeric columns in dataset
    num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]

    # Exclude technical/extraction metadata from automatic pairwise correlations
    domain_num_cols = filter_metadata_columns(num_cols)
    meta_cols = [c for c in num_cols if is_metadata_column(c)]

    # Filter out constant columns with zero variance
    valid_domain_num_cols: List[str] = []
    constant_cols: List[str] = []

    for c in domain_num_cols:
        series_clean = pd.to_numeric(df[c], errors="coerce").dropna()
        if len(series_clean) < 2 or series_clean.nunique() <= 1 or np.isclose(float(series_clean.std()), 0.0):
            constant_cols.append(c)
        else:
            valid_domain_num_cols.append(c)

    if constant_cols:
        warnings.append(f"Excluded constant column(s) with zero variance: {', '.join(constant_cols)}.")

    if len(valid_domain_num_cols) < 2:
        if meta_cols:
            return {
                "result_type": "empty",
                "data": pd.DataFrame(),
                "columns": [],
                "row_count": 0,
                "evidence": {
                    "message": f"Dataset contains extraction metadata columns ({', '.join(meta_cols)}) but lacks domain numerical variables required for correlation analysis.",
                    "available_columns": list(df.columns),
                    "metadata_columns": meta_cols,
                },
                "warnings": warnings + [f"Dataset lacks sufficient varying domain numerical columns for correlation analysis."],
            }
        else:
            return {
                "result_type": "empty",
                "data": pd.DataFrame(),
                "columns": [],
                "row_count": 0,
                "evidence": {
                    "message": "At least two varying numeric columns are required for correlation analysis.",
                    "constant_columns_excluded": constant_cols,
                },
                "warnings": warnings + ["Insufficient varying numeric columns for correlation analysis."],
            }

    # Direct calculation on valid non-constant domain numeric columns
    corr_matrix = df[valid_domain_num_cols].corr(method="pearson")

    # Pairwise list
    pairs: List[Dict[str, Any]] = []

    for i, c1 in enumerate(valid_domain_num_cols):
        for j, c2 in enumerate(valid_domain_num_cols):
            if i < j:
                if col_a and col_a not in (c1, c2):
                    continue
                is_dup = are_columns_identical(df[c1], df[c2])
                val = 1.0 if is_dup else corr_matrix.loc[c1, c2]

                if not pd.isna(val):
                    r_val = float(val)
                    abs_r = abs(r_val)
                    if is_dup:
                        strength = "Strong (Duplicate Columns)"
                    elif abs_r >= 0.70:
                        strength = "Strong"
                    elif abs_r >= 0.40:
                        strength = "Moderate"
                    else:
                        strength = "Weak"

                    direction = "Positive" if r_val > 0 else "Negative"

                    p_dict = {
                        "Feature A": c1,
                        "Feature B": c2,
                        "Correlation (r)": round(r_val, 4),
                        "Strength": strength,
                        "Direction": direction,
                    }
                    if is_dup:
                        p_dict["Note"] = "Identical column values (r=1.00 reflects column equivalence, not empirical correlation)."

                    pairs.append(p_dict)

    pairs.sort(key=lambda x: abs(x["Correlation (r)"]), reverse=True)
    res_df = pd.DataFrame(pairs)

    # Format 2D correlation matrix for heatmap
    matrix_clean: List[List[Optional[float]]] = []
    for r_idx, r_name in enumerate(valid_domain_num_cols):
        row_vals: List[Optional[float]] = []
        for c_idx, c_name in enumerate(valid_domain_num_cols):
            if r_idx == c_idx:
                row_vals.append(1.0)
            elif are_columns_identical(df[r_name], df[c_name]):
                row_vals.append(1.0)
            else:
                raw_v = corr_matrix.loc[r_name, c_name]
                row_vals.append(round(float(raw_v), 4) if not pd.isna(raw_v) else None)
        matrix_clean.append(row_vals)

    evidence = {
        "pairs_analyzed": len(pairs),
        "strongest_pair": pairs[0] if pairs else {},
        "causation_warning": "Correlation does NOT imply causation. Associations reflect statistical covariance, not cause-and-effect.",
        "categories": list(valid_domain_num_cols),
        "matrix": matrix_clean,
        "constant_columns_excluded": constant_cols,
    }

    return {
        "result_type": "table",
        "data": res_df,
        "columns": list(res_df.columns),
        "row_count": len(res_df),
        "evidence": evidence,
        "warnings": warnings,
    }

