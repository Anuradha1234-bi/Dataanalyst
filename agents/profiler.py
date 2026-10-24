"""Profiler Agent - Autonomous Data Profiling and Statistical Hygiene Engine.

Computes comprehensive dataset structure, column-level distributions,
semantic type classifications, and dataset health scoring.
"""

from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Tuple
import warnings
import pandas as pd
import numpy as np


@dataclass
class ColumnProfile:
    """Detailed profile container for an individual dataset feature."""

    name: str
    dtype: str
    semantic_type: str  # NUMERIC, CATEGORICAL, DATETIME, BOOLEAN, TEXT, UNKNOWN
    missing_count: int
    missing_percentage: float
    unique_count: int
    unique_percentage: float
    non_null_count: int = 0
    numeric_stats: Optional[Dict[str, float]] = None
    categorical_stats: Optional[Dict[str, Any]] = None
    datetime_stats: Optional[Dict[str, Any]] = None


@dataclass
class QualityReport:
    """Data quality and structural hygiene diagnostic container."""

    health_score: int
    health_status: str
    health_explanation: str
    missing_columns: List[Dict[str, Any]]
    high_cardinality_columns: List[Dict[str, Any]]
    constant_columns: List[str]
    duplicate_rows: int
    duplicate_percentage: float


@dataclass
class ProfileResult:
    """Comprehensive dataset profile container."""

    total_rows: int
    total_columns: int
    total_cells: int
    total_missing: int
    missing_percentage: float
    duplicate_rows: int
    duplicate_percentage: float
    type_counts: Dict[str, int]
    columns: Dict[str, ColumnProfile]
    quality: QualityReport


class ProfilerAgent:
    """Autonomous profiling engine for tabular datasets."""

    def __init__(self):
        self.version = "1.0.0-phase2"

    @classmethod
    def profile_dataset(cls, df: pd.DataFrame) -> ProfileResult:
        """Analyze and profile an in-memory DataFrame comprehensively."""
        if df is None or df.empty:
            raise ValueError("Cannot profile an empty or None DataFrame.")

        total_rows = int(df.shape[0])
        total_columns = int(df.shape[1])
        total_cells = total_rows * total_columns

        # 1. Missing & Duplicate metrics
        missing_by_col = df.isna().sum()
        total_missing = int(missing_by_col.sum())
        missing_percentage = round((total_missing / total_cells * 100.0) if total_cells > 0 else 0.0, 2)

        duplicate_rows = int(df.duplicated().sum())
        duplicate_percentage = round((duplicate_rows / total_rows * 100.0) if total_rows > 0 else 0.0, 2)

        # 2. Per-column profiling
        type_counts = {
            "NUMERIC": 0,
            "CATEGORICAL": 0,
            "DATETIME": 0,
            "BOOLEAN": 0,
            "TEXT": 0,
            "UNKNOWN": 0,
        }

        columns_profile: Dict[str, ColumnProfile] = {}
        missing_cols_list: List[Dict[str, Any]] = []
        high_cardinality_list: List[Dict[str, Any]] = []
        constant_cols_list: List[str] = []

        for col in df.columns:
            series = df[col]
            missing_cnt = int(series.isna().sum())
            missing_pct = round((missing_cnt / total_rows * 100.0) if total_rows > 0 else 0.0, 2)
            unique_cnt = int(series.nunique(dropna=True))
            unique_pct = round((unique_cnt / total_rows * 100.0) if total_rows > 0 else 0.0, 2)

            # Detect semantic type
            semantic_type, parsed_series = cls._detect_semantic_type(series)
            type_counts[semantic_type] = type_counts.get(semantic_type, 0) + 1

            numeric_stats = None
            categorical_stats = None
            datetime_stats = None

            # Compute type-specific distributions
            if semantic_type == "NUMERIC":
                numeric_stats = cls._compute_numeric_stats(parsed_series if parsed_series is not None else series)
            elif semantic_type == "DATETIME":
                datetime_stats = cls._compute_datetime_stats(parsed_series if parsed_series is not None else series)
            else:
                categorical_stats = cls._compute_categorical_stats(series)

            # Hygiene checks
            if missing_cnt > 0:
                missing_cols_list.append({
                    "column": str(col),
                    "missing_count": missing_cnt,
                    "missing_percentage": missing_pct,
                    "type": semantic_type,
                })

            if unique_cnt == 1 and total_rows > 1:
                constant_cols_list.append(str(col))

            if semantic_type in ("CATEGORICAL", "TEXT") and unique_cnt > 50 and unique_pct > 60:
                high_cardinality_list.append({
                    "column": str(col),
                    "unique_count": unique_cnt,
                    "unique_percentage": unique_pct,
                })

            non_null_cnt = total_rows - missing_cnt
            columns_profile[str(col)] = ColumnProfile(
                name=str(col),
                dtype=str(series.dtype),
                semantic_type=semantic_type,
                non_null_count=non_null_cnt,
                missing_count=missing_cnt,
                missing_percentage=missing_pct,
                unique_count=unique_cnt,
                unique_percentage=unique_pct,
                numeric_stats=numeric_stats,
                categorical_stats=categorical_stats,
                datetime_stats=datetime_stats,
            )

        # 3. Calculate Dataset Health Score
        quality_report = cls._calculate_health_score(
            total_rows=total_rows,
            total_cells=total_cells,
            total_missing=total_missing,
            duplicate_rows=duplicate_rows,
            missing_cols_list=missing_cols_list,
            high_cardinality_list=high_cardinality_list,
            constant_cols_list=constant_cols_list,
            df=df,
        )

        return ProfileResult(
            total_rows=total_rows,
            total_columns=total_columns,
            total_cells=total_cells,
            total_missing=total_missing,
            missing_percentage=missing_percentage,
            duplicate_rows=duplicate_rows,
            duplicate_percentage=duplicate_percentage,
            type_counts=type_counts,
            columns=columns_profile,
            quality=quality_report,
        )

    @classmethod
    def _detect_semantic_type(cls, series: pd.Series) -> Tuple[str, Optional[pd.Series]]:
        """Detect semantic data type with robust fallback heuristics."""
        # 1. Check Boolean
        if pd.api.types.is_bool_dtype(series):
            return "BOOLEAN", None

        non_null = series.dropna()
        if non_null.empty:
            return "UNKNOWN", None

        # Check if values are boolean-like
        unique_vals = set(non_null.unique())
        if len(unique_vals) <= 2:
            str_vals = {str(v).strip().lower() for v in unique_vals}
            if str_vals.issubset({"true", "false", "1", "0", "yes", "no", "t", "f"}):
                return "BOOLEAN", None

        # 2. Check Native Datetime
        if pd.api.types.is_datetime64_any_dtype(series):
            return "DATETIME", series

        # 3. Check Native Numeric
        if pd.api.types.is_numeric_dtype(series):
            return "NUMERIC", series

        # 4. Check String Date representation (e.g. DD-MM-YYYY, YYYY-MM-DD, ISO formats)
        sample = non_null.astype(str).str.strip().head(50)
        has_date_delimiters = sample.str.contains(r"[\/\-\.]", regex=True).mean() > 0.7
        is_date_named = any(k in str(series.name).lower() for k in ("date", "time", "timestamp")) if series.name else False
        if has_date_delimiters or is_date_named:
            try:
                with warnings.catch_warnings():
                    warnings.filterwarnings("ignore", category=UserWarning)
                    # Attempt standard conversion first (handles ISO YYYY-MM-DD, standard dates)
                    converted_dates = pd.to_datetime(sample, errors="coerce")
                    if converted_dates.notna().mean() < 0.75:
                        # Fallback to dayfirst=True for ambiguous DMY representations
                        converted_dates = pd.to_datetime(sample, dayfirst=True, errors="coerce")
                    valid_ratio = converted_dates.notna().mean()
                    if valid_ratio >= 0.75:
                        full_converted = pd.to_datetime(series, errors="coerce")
                        if full_converted.notna().mean() < 0.75:
                            full_converted = pd.to_datetime(series, dayfirst=True, errors="coerce")
                        return "DATETIME", full_converted
            except Exception:
                pass

        # 5. Check String Numeric representation (e.g. "4,000.00", "15.5")
        cleaned_sample = sample.str.replace(",", "", regex=False).str.replace("$", "", regex=False).str.replace("%", "", regex=False)
        converted_nums = pd.to_numeric(cleaned_sample, errors="coerce")
        if converted_nums.notna().mean() >= 0.75:
            # Full conversion
            cleaned_full = series.astype(str).str.replace(",", "", regex=False).str.replace("$", "", regex=False).str.replace("%", "", regex=False)
            full_nums = pd.to_numeric(cleaned_full, errors="coerce")
            return "NUMERIC", full_nums

        # 6. Categorical vs Text distinction
        unique_cnt = series.nunique(dropna=True)
        unique_ratio = unique_cnt / len(non_null) if len(non_null) > 0 else 0
        avg_len = sample.str.len().mean() if not sample.empty else 0

        if avg_len > 40 and unique_ratio > 0.6:
            return "TEXT", None

        return "CATEGORICAL", None

    @classmethod
    def _compute_numeric_stats(cls, series: pd.Series) -> Dict[str, Any]:
        """Compute statistical summary for numeric series."""
        clean = pd.to_numeric(series, errors="coerce").dropna()
        if clean.empty:
            return {
                "count": 0,
                "mean": 0.0,
                "median": 0.0,
                "min": 0.0,
                "max": 0.0,
                "std": 0.0,
                "q1": 0.0,
                "q3": 0.0,
                "iqr": 0.0,
                "histogram": [],
            }

        q1 = round(float(clean.quantile(0.25)), 2)
        q3 = round(float(clean.quantile(0.75)), 2)
        iqr = round(float(q3 - q1), 2)

        # Compute 4 to 8 histogram bins for graphical distribution
        hist_bins = []
        if len(clean) > 0:
            num_bins = min(8, max(3, int(clean.nunique())))
            counts, bin_edges = np.histogram(clean, bins=num_bins)
            for i in range(len(counts)):
                hist_bins.append({
                    "bin_start": round(float(bin_edges[i]), 2),
                    "bin_end": round(float(bin_edges[i+1]), 2),
                    "count": int(counts[i]),
                })

        return {
            "count": int(clean.count()),
            "mean": round(float(clean.mean()), 2),
            "median": round(float(clean.median()), 2),
            "min": round(float(clean.min()), 2),
            "max": round(float(clean.max()), 2),
            "std": round(float(clean.std()), 2) if len(clean) > 1 else 0.0,
            "q1": q1,
            "q3": q3,
            "iqr": iqr,
            "histogram": hist_bins,
        }

    @classmethod
    def _compute_categorical_stats(cls, series: pd.Series) -> Dict[str, Any]:
        """Compute categorical breakdown and top value counts."""
        clean = series.dropna()
        if clean.empty:
            return {
                "unique_values": 0,
                "most_frequent": "N/A",
                "frequency": 0,
                "top_5": [],
            }

        val_counts = clean.value_counts()
        top_val = str(val_counts.index[0]) if not val_counts.empty else "N/A"
        top_freq = int(val_counts.iloc[0]) if not val_counts.empty else 0

        top_5_items = [
            (str(idx), int(cnt)) for idx, cnt in val_counts.head(5).items()
        ]
        top_values = [
            {
                "value": str(idx),
                "count": int(cnt),
                "percentage": round(float(cnt / len(clean) * 100.0), 2) if len(clean) > 0 else 0.0,
            }
            for idx, cnt in val_counts.head(5).items()
        ]

        return {
            "unique_values": int(clean.nunique()),
            "unique_count": int(clean.nunique()),
            "most_frequent": top_val,
            "frequency": top_freq,
            "top_5": top_5_items,
            "top_values": top_values,
        }

    @classmethod
    def _compute_datetime_stats(cls, series: pd.Series) -> Dict[str, Any]:
        """Compute date range and unique timestamps."""
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=UserWarning)
            clean = pd.to_datetime(series, dayfirst=True, errors="coerce").dropna()
        if clean.empty:
            return {
                "min_date": "N/A",
                "max_date": "N/A",
                "unique_dates": 0,
                "date_range": "N/A",
            }

        min_d = clean.min().strftime("%d-%m-%Y")
        max_d = clean.max().strftime("%d-%m-%Y")
        unique_cnt = int(clean.dt.date.nunique())

        return {
            "min_date": min_d,
            "max_date": max_d,
            "unique_dates": unique_cnt,
            "date_range": f"{min_d} → {max_d}",
        }

    @classmethod
    def _calculate_health_score(
        cls,
        total_rows: int,
        total_cells: int,
        total_missing: int,
        duplicate_rows: int,
        missing_cols_list: List[Dict[str, Any]],
        high_cardinality_list: List[Dict[str, Any]],
        constant_cols_list: List[str],
        df: Optional[pd.DataFrame] = None,
    ) -> QualityReport:
        """Calculate authoritative Dataset Health / Quality Score (0-100) consistent across all pages."""
        if df is not None:
            try:
                from app.services.quality_service import DataQualityService
            except ImportError:
                try:
                    from backend.app.services.quality_service import DataQualityService
                except ImportError:
                    DataQualityService = None

            if DataQualityService is not None:
                q_score, q_status, q_msg, _ = DataQualityService.calculate_quality_score(df)
                dup_pct = round((duplicate_rows / total_rows * 100.0) if total_rows > 0 else 0.0, 2)
                return QualityReport(
                    health_score=int(round(q_score)),
                    health_status=q_status,
                    health_explanation=q_msg,
                    missing_columns=missing_cols_list,
                    high_cardinality_columns=high_cardinality_list,
                    constant_columns=constant_cols_list,
                    duplicate_rows=duplicate_rows,
                    duplicate_percentage=dup_pct,
                )

        # Fallback using identical authoritative scoring formula
        missing_pct = (total_missing / total_cells * 100.0) if total_cells > 0 else 0.0
        dup_pct = (duplicate_rows / total_rows * 100.0) if total_rows > 0 else 0.0

        penalty = 0.0
        penalty += min(35.0, missing_pct * 1.5)
        penalty += min(20.0, dup_pct * 1.0)
        penalty += len(constant_cols_list) * 8.0

        final_score = int(round(max(0.0, min(100.0, 100.0 - penalty))))

        if final_score < 60 or missing_pct >= 25.0:
            status = "Poor"
            explanation = f"Dataset exhibits significant quality degradation (Score: {final_score}/100)."
        elif final_score < 85 or len(constant_cols_list) > 0:
            status = "Needs Attention"
            explanation = f"Dataset is mostly usable (Score: {final_score}/100), but contains hygiene issues."
        else:
            status = "Good"
            explanation = f"Dataset is clean and well-structured (Score: {final_score}/100) with 0 detected hygiene issues."

        return QualityReport(
            health_score=final_score,
            health_status=status,
            health_explanation=explanation,
            missing_columns=missing_cols_list,
            high_cardinality_columns=high_cardinality_list,
            constant_columns=constant_cols_list,
            duplicate_rows=duplicate_rows,
            duplicate_percentage=round(dup_pct, 2),
        )


# Global profile helper function
def profile_dataset(df: pd.DataFrame) -> ProfileResult:
    """Convenience functional interface for dataset profiling."""
    return ProfilerAgent.profile_dataset(df)
