"""Problem Type Detection and Dataset Suitability Assessment.

Determines the operational machine learning mode (forecasting vs regression vs
classification) and performs rigorous pre-flight validation of sample size, target
variance, date consistency, and class distribution before permitting model training.
"""

from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np

from models.prediction import ProblemType, PredictionMode, SuitabilityReport
from prediction.target_detector import TargetDetector


class ProblemDetector:
    """Evaluates task intent, validates dataset conditions, and prevents training on unviable data."""

    @classmethod
    def detect_problem_type(
        cls,
        df: pd.DataFrame,
        target_col: str,
        date_col: Optional[str] = None,
        requested_mode: str = "auto",
    ) -> ProblemType:
        """Infer the appropriate ML problem type for the selected target and date."""
        if target_col not in df.columns:
            return ProblemType.REGRESSION

        series = df[target_col]
        non_null = series.dropna()
        parsed_num = pd.to_numeric(non_null.astype(str).str.strip().str.replace(r"^[\$,₹,€,£]", "", regex=True).str.replace(r"%$", "", regex=True), errors="coerce") if len(non_null) > 0 else pd.Series(dtype=float)
        is_numeric = pd.api.types.is_numeric_dtype(series) or (len(non_null) > 0 and (parsed_num.notna().sum() / len(non_null)) >= 0.60)
        unique_cnt = series.nunique(dropna=True)

        # Explicit user mode overrides
        if requested_mode == PredictionMode.FORECASTING.value or requested_mode == "forecasting":
            return ProblemType.TIME_SERIES_FORECAST
        if requested_mode == PredictionMode.REGRESSION.value or requested_mode == "regression":
            return ProblemType.REGRESSION
        if requested_mode == PredictionMode.CLASSIFICATION.value or requested_mode == "classification":
            return (
                ProblemType.BINARY_CLASSIFICATION
                if unique_cnt == 2
                else ProblemType.MULTICLASS_CLASSIFICATION
            )

        # Autonomous mode detection
        if is_numeric:
            if unique_cnt == 2:
                return ProblemType.BINARY_CLASSIFICATION
            return ProblemType.REGRESSION

        # Categorical / string target
        if unique_cnt == 2:
            return ProblemType.BINARY_CLASSIFICATION
        return ProblemType.MULTICLASS_CLASSIFICATION

    @classmethod
    def check_dataset_suitability(
        cls,
        df: pd.DataFrame,
        target_col: str,
        problem_type: ProblemType,
        date_col: Optional[str] = None,
    ) -> SuitabilityReport:
        """Execute exhaustive pre-flight checks on data viability.

        Enforces the Critical Rule: Never force training on unviable datasets.
        """
        reasons: List[str] = []
        warnings: List[str] = []
        is_suitable = True

        if df is None or df.empty:
            return SuitabilityReport(
                is_suitable=False,
                problem_type=problem_type,
                target_column=target_col,
                date_column=date_col,
                total_rows=0,
                usable_rows=0,
                features_count=0,
                reasons=["Dataset is empty."],
                warnings=[],
            )

        total_rows = len(df)

        # 1. Target presence and validity
        if target_col not in df.columns:
            return SuitabilityReport(
                is_suitable=False,
                problem_type=problem_type,
                target_column=target_col,
                date_column=date_col,
                total_rows=total_rows,
                usable_rows=0,
                features_count=len(df.columns) - 1,
                reasons=[f"Selected target column '{target_col}' does not exist in dataset."],
                warnings=[],
            )

        target_series = df[target_col].dropna()
        usable_rows = len(target_series)

        if usable_rows == 0:
            return SuitabilityReport(
                is_suitable=False,
                problem_type=problem_type,
                target_column=target_col,
                date_column=date_col,
                total_rows=total_rows,
                usable_rows=0,
                features_count=len(df.columns) - 1,
                reasons=[f"Selected target '{target_col}' contains zero valid observations (100% missing)."],
                warnings=[],
            )

        # 2. Problem type specific checks
        if problem_type == ProblemType.TIME_SERIES_FORECAST:
            # Strictly verify numeric target for time-series forecasting
            num_target = pd.to_numeric(df[target_col], errors="coerce").dropna()
            if len(num_target) < 5 or (len(num_target) / max(1, usable_rows)) < 0.5:
                is_suitable = False
                reasons.append(
                    f"Time-series forecasting requires a valid numeric target column. "
                    f"Target '{target_col}' is non-numeric or has insufficient numeric observations. "
                    f"Please select a numeric measure (e.g. 'annual_income_inr' or sales)."
                )

            if usable_rows < 7:
                is_suitable = False
                reasons.append(f"Insufficient historical observations for forecasting ({usable_rows} rows found, minimum 7 required).")
            elif usable_rows < 15:
                warnings.append(f"Small historical sequence ({usable_rows} records). Extended multi-lag features will be curtailed.")

            # Validate date column
            if not date_col or date_col not in df.columns:
                is_suitable = False
                reasons.append("Time-series forecasting requires a valid date/datetime column.")
            else:
                date_series = pd.to_datetime(df[date_col], errors="coerce").dropna()
                if len(date_series) < 5:
                    is_suitable = False
                    reasons.append(f"Date column '{date_col}' contains fewer than 5 parseable timestamps.")
                else:
                    if df[date_col].dropna().duplicated().any():
                        warnings.append(
                            f"Date column '{date_col}' contains duplicate timestamps. "
                            "Duplicate observations will be aggregated chronologically for temporal consistency."
                        )
                    date_infos = TargetDetector.detect_date_columns(df[[date_col]])
                    if date_infos and not date_infos[0].is_regular:
                        warnings.append("Dates are irregular, so standard periodic time-series forecasting may be less reliable.")

        elif problem_type == ProblemType.REGRESSION:
            # Strictly verify numeric target for regression
            num_target = pd.to_numeric(df[target_col], errors="coerce").dropna()
            if len(num_target) < 4:
                is_suitable = False
                reasons.append(
                    f"Regression requires a numeric target with at least 4 valid values. "
                    f"Target '{target_col}' contains only {len(num_target)} valid numeric numbers."
                )
            elif num_target.nunique() <= 1:
                is_suitable = False
                reasons.append(f"Target '{target_col}' has zero variance (only 1 unique numeric value: '{num_target.iloc[0]}'). Cannot train regression on a constant.")
            elif usable_rows < 30:
                warnings.append(f"Small dataset ({usable_rows} rows). Model evaluation metrics will have wider variance.")

        elif problem_type in [ProblemType.BINARY_CLASSIFICATION, ProblemType.MULTICLASS_CLASSIFICATION]:
            clean_target = df[target_col].dropna().astype(str).str.strip()
            clean_target = clean_target[clean_target != ""]
            class_counts = clean_target.value_counts()
            unique_classes = len(class_counts)

            if unique_classes <= 1:
                is_suitable = False
                reasons.append(f"Target '{target_col}' has only 1 distinct class. Classification requires at least 2 distinct classes.")
            elif unique_classes > 25:
                is_suitable = False
                reasons.append(f"Target '{target_col}' has {unique_classes} unique classes. High-cardinality discrete classification is not suitable.")
            else:
                min_class_count = class_counts.min() if not class_counts.empty else 0
                if min_class_count < 2:
                    is_suitable = False
                    rare_class = class_counts.idxmin() if not class_counts.empty else "N/A"
                    reasons.append(
                        f"Class '{rare_class}' has only {min_class_count} sample. "
                        f"At least 2 samples per class are required for cross-validation and train/validation splitting. "
                        f"Actionable option: Select a continuous numeric target (e.g. Regression on 'annual_income_inr') or provide more samples for rare classes."
                    )
                else:
                    minority_pct = (min_class_count / len(clean_target)) * 100
                    if minority_pct < 10.0:
                        warnings.append(f"Class imbalance detected: minority class '{class_counts.idxmin()}' represents {minority_pct:.1f}% of data. Balanced weighting will be applied.")

        # 4. Feature availability
        candidate_features = [c for c in df.columns if c != target_col and c != date_col]
        if not candidate_features and problem_type != ProblemType.TIME_SERIES_FORECAST:
            is_suitable = False
            reasons.append("No predictor features available besides target column.")

        if is_suitable:
            reasons.append("Dataset meets all required criteria for predictive modeling.")

        return SuitabilityReport(
            is_suitable=is_suitable,
            problem_type=problem_type,
            target_column=target_col,
            date_column=date_col,
            total_rows=total_rows,
            usable_rows=usable_rows,
            features_count=len(candidate_features),
            reasons=reasons,
            warnings=warnings,
        )
