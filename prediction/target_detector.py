"""Target and Date Detection Module.

Identifies suitable prediction targets (numeric regression measures and categorical
classification labels) and detects temporal date columns for time-series forecasting.
"""

import re
from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np

from models.prediction import TargetRecommendation, DateColumnInfo, ProblemType
from analysis.anomaly_utils import AnomalyUtils


# Semantic keywords that strongly correlate with business target variables
TARGET_KEYWORDS = [
    "price", "sales", "revenue", "demand", "profit", "quantity", "cost",
    "arrival", "volume", "amount", "target", "label", "churn", "converted",
    "default", "rating", "spend", "margin", "income", "yield", "rate",
    "cgpa", "gpa", "score", "grade", "count",
    "salary", "result", "outcome", "status", "purchase"
]

CONTINUOUS_KEYWORDS = [
    "age", "year", "rating", "cgpa", "count", "score", "grade", "gpa",
    "hours", "price", "amount", "cost", "revenue", "sales", "spend",
    "margin", "income", "yield", "rate", "volume", "quantity", "profit",
    "value", "num", "previous_score", "study_hours", "attendance", "percent", "pct",
    "salary"
]

DATE_KEYWORDS = ["date", "time", "timestamp", "datetime", "day", "month", "year", "period"]


class TargetDetector:
    """Intelligent scanner for candidate prediction targets and temporal coordinates."""

    @classmethod
    def detect_targets(cls, df: pd.DataFrame) -> List[TargetRecommendation]:
        """Rank and recommend candidate target columns from the dataset."""
        if df is None or df.empty:
            return []

        recommendations: List[TargetRecommendation] = []
        total_rows = len(df)

        for col in df.columns:
            series = df[col]
            col_str = str(col).strip()
            col_lower = col_str.lower()

            # Skip personal identifiers, names, and emails from target recommendation unless explicitly named 'target' or 'label'
            is_explicit_target_label = col_lower in ["target", "label", "dependent_variable", "y"]
            is_personal_info = any(
                col_lower == p or col_lower.endswith(f"_{p}") or col_lower.startswith(f"{p}_")
                for p in ["customer_name", "user_name", "client_name", "username", "name", "full_name", "first_name", "last_name", "email", "e_mail", "mail"]
            )
            if is_personal_info and not is_explicit_target_label:
                continue

            # Skip obvious technical index and identifier columns
            is_id, id_reason = AnomalyUtils.is_id_or_index_column(series, col_str)
            if is_id and not is_explicit_target_label:
                has_semantic_meaning = any(kw in col_lower for kw in TARGET_KEYWORDS + CONTINUOUS_KEYWORDS)
                is_pure_sequential = "sequential integer" in id_reason.lower()
                if not (has_semantic_meaning and is_pure_sequential):
                    continue

            unique_cnt = series.nunique(dropna=True)
            if unique_cnt <= 1:
                continue  # No variation

            null_count = series.isna().sum()
            missing_pct = round((null_count / max(1, total_rows)) * 100, 2)
            if missing_pct > 60.0:
                continue  # Excessively sparse

            reasons: List[str] = []
            score = 0.50

            # Boost if name matches business target keyword
            if is_explicit_target_label:
                score += 0.40
                reasons.append(f"Column name explicitly specifies target variable '{col_lower}'")
            else:
                for kw in TARGET_KEYWORDS:
                    if kw in col_lower:
                        score += 0.30
                        reasons.append(f"Column name contains target indicator '{kw}'")
                        break

            # Deprioritize historical/lag/previous features that are input predictors
            if any(p in col_lower for p in ["previous", "prior", "last_", "past_", "initial_", "hist_", "_lag"]):
                score -= 0.20
                reasons.append("Historical/previous feature indicator reduces target likelihood")

            # Low missingness boost
            if missing_pct == 0.0:
                score += 0.10
                reasons.append("Zero missing values")
            elif missing_pct < 10.0:
                score += 0.05
                reasons.append(f"Low missingness ({missing_pct:.1f}%)")

            # Evaluate datatype suitability
            if pd.api.types.is_bool_dtype(series):
                prob_type = ProblemType.BINARY_CLASSIFICATION
                reasons.append("Boolean classification target (2 distinct classes)")
                score += 0.10
                recommendations.append(
                    TargetRecommendation(
                        column=str(col),
                        problem_type=prob_type,
                        score=min(1.0, round(score, 2)),
                        reasons=reasons,
                        missing_pct=missing_pct,
                        unique_count=unique_cnt,
                    )
                )

            elif pd.api.types.is_numeric_dtype(series):
                non_null = pd.to_numeric(series.dropna(), errors="coerce")
                is_integer_like = (
                    len(non_null) > 0
                    and non_null.notna().all()
                    and ((non_null % 1 == 0) | np.isclose(non_null % 1, 0, atol=1e-7) | np.isclose(non_null % 1, 1, atol=1e-7)).all()
                )

                is_continuous_named = any(kw in col_lower for kw in CONTINUOUS_KEYWORDS)
                is_discrete_classes = (
                    3 <= unique_cnt <= 10
                    and is_integer_like
                    and not is_continuous_named
                    and float(non_null.max()) <= 20
                    and float(non_null.min()) >= -10
                    and float(non_null.max() - non_null.min()) <= 15
                    and unique_cnt < len(non_null)
                )

                if unique_cnt == 2:
                    prob_type = ProblemType.BINARY_CLASSIFICATION
                    reasons.append("Binary numeric target (2 distinct values)")
                    score += 0.10
                elif is_discrete_classes:
                    prob_type = ProblemType.MULTICLASS_CLASSIFICATION
                    reasons.append(f"Discrete categorical classes ({unique_cnt} unique values)")
                    score += 0.05
                else:
                    prob_type = ProblemType.REGRESSION
                    reasons.append("Continuous numeric measure with adequate variance")
                    score += 0.15

                recommendations.append(
                    TargetRecommendation(
                        column=str(col),
                        problem_type=prob_type,
                        score=min(1.0, round(score, 2)),
                        reasons=reasons,
                        missing_pct=missing_pct,
                        unique_count=unique_cnt,
                    )
                )

            elif (
                isinstance(series.dtype, pd.CategoricalDtype)
                or pd.api.types.is_object_dtype(series)
                or pd.api.types.is_string_dtype(series)
            ):
                # Safely check for numeric-string columns (e.g. 'age' containing numbers mixed with 'unknown')
                non_null_s = series.dropna().astype(str).str.strip()
                cleaned_num_s = non_null_s.str.replace(r"^[\$,₹,€,£]", "", regex=True).str.replace(r"%$", "", regex=True).str.strip()
                num_parsed = pd.to_numeric(cleaned_num_s, errors="coerce") if len(cleaned_num_s) > 0 else pd.Series(dtype=float)
                valid_num_count = num_parsed.notna().sum()
                num_ratio = (valid_num_count / len(non_null_s)) if len(non_null_s) > 0 else 0.0
                is_numeric_string = len(non_null_s) > 0 and num_ratio >= 0.50 and valid_num_count >= 3

                if is_numeric_string:
                    valid_nums = num_parsed.dropna()
                    num_unique = valid_nums.nunique()
                    is_int_parsed = (
                        len(valid_nums) > 0
                        and ((valid_nums % 1 == 0) | np.isclose(valid_nums % 1, 0, atol=1e-7) | np.isclose(valid_nums % 1, 1, atol=1e-7)).all()
                    )
                    is_continuous_named = any(kw in col_lower for kw in CONTINUOUS_KEYWORDS)

                    if num_unique == 2:
                        prob_type = ProblemType.BINARY_CLASSIFICATION
                        reasons.append("Binary numeric target formatted as strings (2 distinct values)")
                    elif 3 <= num_unique <= 10 and is_int_parsed and not is_continuous_named:
                        prob_type = ProblemType.MULTICLASS_CLASSIFICATION
                        reasons.append(f"Discrete categorical classes formatted as strings ({num_unique} unique values)")
                    else:
                        prob_type = ProblemType.REGRESSION
                        reasons.append("Continuous numeric measure formatted as strings with potential sentinels")
                        score += 0.05

                    recommendations.append(
                        TargetRecommendation(
                            column=str(col),
                            problem_type=prob_type,
                            score=min(1.0, round(score, 2)),
                            reasons=reasons,
                            missing_pct=missing_pct,
                            unique_count=unique_cnt,
                        )
                    )
                elif 2 <= unique_cnt <= 20:
                    # Categorical classification candidate: evaluate class sample distribution
                    val_counts = non_null_s.value_counts()
                    min_class_count = val_counts.min() if not val_counts.empty else 0
                    rare_class = val_counts.idxmin() if not val_counts.empty else "N/A"

                    prob_type = (
                        ProblemType.BINARY_CLASSIFICATION
                        if unique_cnt == 2
                        else ProblemType.MULTICLASS_CLASSIFICATION
                    )

                    if min_class_count < 2:
                        score -= 0.35
                        reasons.append(
                            f"Contains singleton class '{rare_class}' with only 1 sample (minimum 2 samples required for cross-validation)"
                        )
                    else:
                        reasons.append(f"Categorical classification target ({unique_cnt} balanced classes)")
                        score += 0.05

                    recommendations.append(
                        TargetRecommendation(
                            column=str(col),
                            problem_type=prob_type,
                            score=max(0.10, min(1.0, round(score, 2))),
                            reasons=reasons,
                            missing_pct=missing_pct,
                            unique_count=unique_cnt,
                        )
                    )

        # Sort recommendations by score descending, with column position as natural tie-breaker
        recommendations.sort(
            key=lambda r: (r.score, -(df.columns.get_loc(r.column) if r.column in df.columns else 0)),
            reverse=True,
        )
        return recommendations

    @classmethod
    def detect_date_columns(cls, df: pd.DataFrame) -> List[DateColumnInfo]:
        """Detect parseable datetime columns and infer their sampling frequency."""
        if df is None or df.empty:
            return []

        date_infos: List[DateColumnInfo] = []
        for col in df.columns:
            series = df[col]
            col_lower = str(col).lower()

            is_datetime = pd.api.types.is_datetime64_any_dtype(series)
            is_candidate_str = False

            if not is_datetime and (pd.api.types.is_object_dtype(series) or pd.api.types.is_string_dtype(series)):
                # Check keyword or sample pattern
                if any(kw in col_lower for kw in DATE_KEYWORDS):
                    is_candidate_str = True
                else:
                    sample = series.dropna().astype(str).head(10)
                    date_pattern = re.compile(r"^\d{4}[-/]\d{1,2}[-/]\d{1,2}|^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}")
                    if len(sample) > 0 and sample.apply(lambda v: bool(date_pattern.search(v.strip()))).mean() > 0.6:
                        is_candidate_str = True

            if not is_datetime and not is_candidate_str:
                continue

            # Attempt safe parsing
            try:
                parsed = pd.to_datetime(series, errors="coerce")
                valid_cnt = parsed.notna().sum()
                if valid_cnt < 5 or (valid_cnt / max(1, len(df))) < 0.5:
                    continue  # Insufficient valid dates

                valid_dates = parsed.dropna().sort_values().drop_duplicates()
                min_date_str = str(valid_dates.iloc[0].date()) if len(valid_dates) > 0 else ""
                max_date_str = str(valid_dates.iloc[-1].date()) if len(valid_dates) > 0 else ""

                # Infer frequency from date differences
                frequency = "irregular"
                is_regular = False
                if len(valid_dates) >= 3:
                    diffs = valid_dates.diff().dropna().dt.total_seconds() / 86400.0  # in days
                    median_diff = float(diffs.median())
                    std_diff = float(diffs.std()) if len(diffs) > 1 else 0.0

                    if 0.8 <= median_diff <= 1.2:
                        frequency = "daily"
                        is_regular = std_diff < 0.5
                    elif 6.0 <= median_diff <= 8.0:
                        frequency = "weekly"
                        is_regular = std_diff < 1.5
                    elif 27.0 <= median_diff <= 32.0:
                        frequency = "monthly"
                        is_regular = std_diff < 3.0

                sample_vals = [str(x) for x in series.dropna().head(3).tolist()]
                date_infos.append(
                    DateColumnInfo(
                        column=str(col),
                        frequency=frequency,
                        min_date=min_date_str,
                        max_date=max_date_str,
                        valid_count=int(valid_cnt),
                        is_regular=is_regular,
                        sample_values=sample_vals,
                    )
                )
            except Exception:
                continue

        return date_infos
