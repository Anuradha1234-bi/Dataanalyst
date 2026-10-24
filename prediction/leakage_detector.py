"""Data Leakage Detection Module.

Identifies features that leak target information, future outcomes, duplicate
definitions, or joined surrogate artifacts into training data, protecting
model generalization and empirical validity.
"""

from typing import Dict, Any, List, Optional
import re
import pandas as pd
import numpy as np

from models.prediction import LeakageReport, ProblemType


POST_OUTCOME_INDICATORS = [
    "return_date", "cancelled_date", "exit_date", "churn_date", "reason",
    "refund", "resolution", "payout", "post_", "outcome_", "future_",
    "delivery_status", "return_qty", "returned_quantity", "refund_amount"
]


def extract_base_column_name(col: str) -> str:
    """Strip join, merge, copy, and cleaning suffixes to retrieve canonical base feature name."""
    col_str = str(col).strip()
    # Match patterns like "_clean_...", " (2)", ".1", "_copy", "_dup", "_x", "_y"
    cleaned = re.sub(
        r"(_clean_.*|\s*\(\d+\)|\.\d+$|_(copy|dup|duplicate|x|y|left|right))$",
        "",
        col_str,
        flags=re.IGNORECASE,
    )
    return cleaned.strip()


class LeakageDetector:
    """Audits feature candidates to intercept ground-truth leakage and target-derived artifacts."""

    @classmethod
    def detect_leakage(
        cls,
        df: pd.DataFrame,
        target_col: str,
        feature_cols: List[str],
        problem_type: ProblemType,
    ) -> LeakageReport:
        """Scan candidate features against target for circular, duplicate, or post-outcome leakage."""
        flagged: Dict[str, str] = {}
        recommendations: List[str] = []

        if df is None or df.empty or not feature_cols:
            return LeakageReport(has_leakage=False, flagged_features={}, recommendations=[])

        target_exists = target_col and target_col in df.columns
        target_series = df[target_col] if target_exists else None
        target_name_lower = target_col.lower() if target_col else ""
        target_base_lower = extract_base_column_name(target_col).lower() if target_col else ""
        is_target_num = pd.api.types.is_numeric_dtype(target_series) if target_exists else False

        # Build map of base names for columns present in dataframe
        df_cols_set = set(df.columns)

        for col in feature_cols:
            if target_exists and col == target_col:
                flagged[col] = f"Exact target column '{target_col}' cannot be used as a predictor."
                continue

            col_lower = str(col).lower()
            col_base = extract_base_column_name(col)
            col_base_lower = col_base.lower()
            feat_series = df[col]

            # 1. Target Name / Suffix Match (Duplicate Target Column)
            if target_exists:
                if col_base_lower == target_base_lower and col != target_col:
                    flagged[col] = f"Duplicate of target column '{target_col}' (name matches target after stripping join/cleaning suffixes)."
                    continue

                # 2. Exact Duplicate Values of Target
                if feat_series.equals(target_series):
                    flagged[col] = f"Exact duplicate of target '{target_col}' (100% identical values)."
                    continue

                # 3. Numeric Target Leakage Checks
                if is_target_num and pd.api.types.is_numeric_dtype(feat_series):
                    valid_mask = target_series.notna() & feat_series.notna()
                    if valid_mask.sum() > 5:
                        t_vals = target_series[valid_mask].astype(float).values
                        f_vals = feat_series[valid_mask].astype(float).values

                        std_t = float(np.std(t_vals))
                        std_f = float(np.std(f_vals))

                        # Perfect / extreme correlation
                        if std_t > 1e-9 and std_f > 1e-9:
                            corr = abs(float(np.corrcoef(t_vals, f_vals)[0, 1]))
                            if corr >= 0.999:
                                flagged[col] = f"Extreme correlation ({corr:.4f}) with target. Highly likely a direct derivation or duplicate."
                                continue

                        # Constant ratio check: col = k * target (strict linear leakage)
                        non_zero_t = np.abs(t_vals) > 1e-9
                        if non_zero_t.sum() > 5:
                            ratios = f_vals[non_zero_t] / t_vals[non_zero_t]
                            if float(np.std(ratios)) < 1e-6 and abs(float(np.mean(ratios))) > 1e-9:
                                flagged[col] = f"Direct linear derivation of target '{target_col}' (constant proportionality ratio {np.mean(ratios):.4f})."
                                continue

                        # Constant difference check: col = target + c
                        diffs = f_vals - t_vals
                        if float(np.std(diffs)) < 1e-6:
                            flagged[col] = f"Direct linear derivation of target '{target_col}' (constant offset {np.mean(diffs):.4f})."
                            continue

                # 4. Target Name Variation / Derived Feature Name
                if (target_name_lower in col_lower and col_lower != target_name_lower) or (col_lower in target_name_lower):
                    if any(suffix in col_lower for suffix in ["_copy", "_dup", "_orig", "_raw", "_scaled", "_log", "_next", "_target", "target_"]):
                        flagged[col] = f"Column name suggests direct derivation from target '{target_col}'."
                        continue

                # 5. Surrogate Entity Memorization (Category partitions target with zero variance)
                if (pd.api.types.is_object_dtype(feat_series) or pd.api.types.is_string_dtype(feat_series) or isinstance(feat_series.dtype, pd.CategoricalDtype)):
                    n_unique = int(feat_series.nunique(dropna=True))
                    if n_unique > 5 and (n_unique / max(1, len(df))) >= 0.05:
                        grouped_target_var = df.groupby(col)[target_col].nunique(dropna=True)
                        if (grouped_target_var <= 1).all():
                            flagged[col] = (
                                f"Surrogate entity lookup: '{col}' has {n_unique} distinct categories each uniquely determining target '{target_col}'. "
                                f"Acts as an entity memorization key rather than a generalizable predictor."
                            )
                            continue

            # 6. Duplicate Cleaned / Joined Feature Columns
            if col_base != col and col_base in df_cols_set and col_base in feature_cols:
                flagged[col] = f"Duplicate of existing base column '{col_base}' from a table join or cleaning artifact."
                continue

            # 7. Post-Outcome / Future Event Flags
            for ind in POST_OUTCOME_INDICATORS:
                if ind in col_lower and (not target_exists or ind not in target_name_lower):
                    flagged[col] = f"Column name contains post-outcome indicator '{ind}'. Represents information unavailable at prediction time."
                    break

        has_leakage = len(flagged) > 0
        if has_leakage:
            recommendations.append(f"Excluded {len(flagged)} potentially leaking or duplicate feature(s) from candidate predictors.")
            recommendations.append("Inspect flagged columns to verify whether they represent retrospective business logs or join artifacts.")

        return LeakageReport(
            has_leakage=has_leakage,
            flagged_features=flagged,
            recommendations=recommendations,
        )
