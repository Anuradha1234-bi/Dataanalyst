"""Cleaner Agent - Autonomous Data Cleaning and Preparation Engine.

Provides decoupled, non-destructive data sanitization, missing value imputation,
duplicate elimination, whitespace trimming, and type conversion.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
import warnings
import pandas as pd
import numpy as np


@dataclass
class ColumnCleaningRecommendation:
    """Cleaning recommendation for an individual column."""

    name: str
    semantic_type: str
    missing_count: int
    missing_percentage: float
    recommended_imputation: str  # "median", "mean", "zero", "mode", "unknown", "none"
    available_imputations: List[str]
    is_empty: bool = False
    is_constant: bool = False
    constant_value: Optional[str] = None
    has_whitespace_issues: bool = False
    can_convert_numeric: bool = False
    numeric_valid_count: int = 0
    numeric_invalid_count: int = 0
    numeric_invalid_examples: List[str] = field(default_factory=list)
    can_convert_datetime: bool = False
    datetime_confidence: float = 0.0
    datetime_valid_count: int = 0
    datetime_invalid_count: int = 0
    datetime_invalid_examples: List[str] = field(default_factory=list)


@dataclass
class CleaningRecommendations:
    """Comprehensive recommendations identified across the dataset."""

    total_rows: int
    total_columns: int
    total_missing_cells: int
    duplicate_rows_count: int
    duplicate_percentage: float
    empty_columns: List[str]
    constant_columns: Dict[str, str]  # col -> value
    columns_with_missing: List[ColumnCleaningRecommendation]
    columns_with_whitespace: List[str]
    numeric_conversion_candidates: List[str]
    datetime_conversion_candidates: List[str]
    all_column_recommendations: Dict[str, ColumnCleaningRecommendation]


@dataclass
class CleaningConfig:
    """User-specified cleaning configuration options."""

    imputation_strategies: Dict[str, str] = field(default_factory=dict)
    # col -> "mean" | "median" | "mode" | "ffill" | "bfill" | "constant" | "drop_rows" | "keep"
    constant_values: Dict[str, Any] = field(default_factory=dict)
    # col -> user specified constant value
    remove_duplicates: bool = False
    drop_empty_columns: List[str] = field(default_factory=list)
    drop_constant_columns: List[str] = field(default_factory=list)
    trim_whitespace: bool = True
    lowercase_text: bool = False
    convert_numeric_columns: List[str] = field(default_factory=list)
    convert_date_columns: List[str] = field(default_factory=list)


@dataclass
class CleaningSummary:
    """Audit report generated after cleaning execution."""

    before_rows: int
    after_rows: int
    before_columns: int
    after_columns: int
    before_missing: int
    after_missing: int
    before_duplicates: int
    after_duplicates: int
    changes_applied: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    timestamp: str = field(default_factory=lambda: datetime.now().strftime("%H:%M:%S"))
    log_entries: List[Dict[str, str]] = field(default_factory=list)


class CleanerAgent:
    """Autonomous data cleaning and preparation engine."""

    @classmethod
    def analyze_cleaning_options(cls, df: pd.DataFrame) -> CleaningRecommendations:
        """Inspect dataframe and generate actionable cleaning recommendations without modifying data."""
        if df is None or df.empty:
            raise ValueError("Cannot analyze cleaning options on an empty or None DataFrame.")

        total_rows = int(df.shape[0])
        total_columns = int(df.shape[1])
        total_missing = int(df.isna().sum().sum())
        duplicate_rows = int(df.duplicated().sum())
        duplicate_pct = round((duplicate_rows / total_rows * 100.0) if total_rows > 0 else 0.0, 2)

        empty_columns: List[str] = []
        constant_columns: Dict[str, str] = {}
        columns_with_missing: List[ColumnCleaningRecommendation] = []
        columns_with_whitespace: List[str] = []
        numeric_candidates: List[str] = []
        datetime_candidates: List[str] = []
        all_recs: Dict[str, ColumnCleaningRecommendation] = {}

        for col in df.columns:
            series = df[col]
            missing_cnt = int(series.isna().sum())
            missing_pct = round((missing_cnt / total_rows * 100.0) if total_rows > 0 else 0.0, 2)
            non_null = series.dropna()

            # 1. Empty column check
            is_empty = (missing_cnt == total_rows)
            if is_empty:
                empty_columns.append(str(col))

            # 2. Constant column check
            is_constant = False
            constant_val = None
            if not is_empty and total_rows > 1:
                unique_vals = non_null.unique()
                if len(unique_vals) == 1:
                    is_constant = True
                    constant_val = str(unique_vals[0])
                    constant_columns[str(col)] = constant_val

            # 3. Detect semantic category
            is_num = pd.api.types.is_numeric_dtype(series)
            is_dt = pd.api.types.is_datetime64_any_dtype(series)
            is_bool = pd.api.types.is_bool_dtype(series)

            can_convert_num = False
            num_valid_cnt = 0
            num_invalid_cnt = 0
            num_invalid_examples: List[str] = []

            can_convert_dt = False
            dt_confidence = 0.0
            dt_valid_cnt = 0
            dt_invalid_cnt = 0
            dt_invalid_examples: List[str] = []

            # 4. Text and formatting checks on string/object series
            has_ws = False
            if not is_num and not is_dt and not non_null.empty:
                str_all = non_null.astype(str)
                str_sample = str_all.head(100)
                # Check whitespace
                trimmed = str_sample.str.strip()
                has_ws = bool((trimmed != str_sample).any())
                if has_ws:
                    columns_with_whitespace.append(str(col))

                # Check safe numeric conversion for non-numeric column
                cleaned_str_all = (
                    str_all.str.replace(",", "", regex=False)
                    .str.replace("$", "", regex=False)
                    .str.replace("%", "", regex=False)
                    .str.strip()
                )
                converted_nums = pd.to_numeric(cleaned_str_all, errors="coerce")
                valid_num_mask = converted_nums.notna()
                valid_num = int(valid_num_mask.sum())
                total_vals = int(len(str_all))
                invalid_num = total_vals - valid_num

                if total_vals > 0 and (valid_num / total_vals) >= 0.80:
                    can_convert_num = True
                    numeric_candidates.append(str(col))
                    num_valid_cnt = valid_num
                    num_invalid_cnt = invalid_num
                    # Collect up to 3 distinct invalid examples
                    invalids = str_all[~valid_num_mask].dropna().unique()
                    num_invalid_examples = [str(x) for x in invalids[:3]]

                # Check safe date conversion
                has_date_delims = str_all.str.contains(r"[\/\-\.]", regex=True).mean() > 0.5
                if has_date_delims and not can_convert_num:
                    try:
                        with warnings.catch_warnings():
                            warnings.filterwarnings("ignore", category=UserWarning)
                            parsed_dates = pd.to_datetime(str_all, errors="coerce")
                            if parsed_dates.notna().mean() < 0.70:
                                parsed_dates = pd.to_datetime(str_all, dayfirst=True, errors="coerce")
                        valid_dt_mask = parsed_dates.notna()
                        valid_dt = int(valid_dt_mask.sum())
                        total_dt = int(len(str_all))
                        invalid_dt = total_dt - valid_dt
                        if total_dt > 0 and (valid_dt / total_dt) >= 0.70:
                            can_convert_dt = True
                            dt_confidence = round((valid_dt / total_dt) * 100.0, 1)
                            datetime_candidates.append(str(col))
                            dt_valid_cnt = valid_dt
                            dt_invalid_cnt = invalid_dt
                            invalids_dt = str_all[~valid_dt_mask].dropna().unique()
                            dt_invalid_examples = [str(x) for x in invalids_dt[:3]]
                    except Exception:
                        pass

            # Determine available and recommended imputation strategies (8 Exact Cleaning Methods)
            if is_num or can_convert_num:
                semantic_type = "NUMERIC"
                recommended_imp = "median" if missing_cnt > 0 else "keep"
                available_imps = ["mean", "median", "mode", "ffill", "bfill", "constant", "drop_rows", "keep"]
            elif is_dt or can_convert_dt:
                semantic_type = "DATETIME"
                recommended_imp = "keep"
                available_imps = ["ffill", "bfill", "constant", "drop_rows", "keep"]
            elif is_bool:
                semantic_type = "BOOLEAN"
                recommended_imp = "mode" if missing_cnt > 0 else "keep"
                available_imps = ["mode", "ffill", "bfill", "constant", "drop_rows", "keep"]
            else:
                semantic_type = "CATEGORICAL"
                recommended_imp = "mode" if missing_cnt > 0 else "keep"
                available_imps = ["mode", "ffill", "bfill", "constant", "drop_rows", "keep"]

            rec = ColumnCleaningRecommendation(
                name=str(col),
                semantic_type=semantic_type,
                missing_count=missing_cnt,
                missing_percentage=missing_pct,
                recommended_imputation=recommended_imp,
                available_imputations=available_imps,
                is_empty=is_empty,
                is_constant=is_constant,
                constant_value=constant_val,
                has_whitespace_issues=has_ws,
                can_convert_numeric=can_convert_num,
                numeric_valid_count=num_valid_cnt,
                numeric_invalid_count=num_invalid_cnt,
                numeric_invalid_examples=num_invalid_examples,
                can_convert_datetime=can_convert_dt,
                datetime_confidence=dt_confidence,
                datetime_valid_count=dt_valid_cnt,
                datetime_invalid_count=dt_invalid_cnt,
                datetime_invalid_examples=dt_invalid_examples,
            )

            all_recs[str(col)] = rec
            if missing_cnt > 0:
                columns_with_missing.append(rec)

        return CleaningRecommendations(
            total_rows=total_rows,
            total_columns=total_columns,
            total_missing_cells=total_missing,
            duplicate_rows_count=duplicate_rows,
            duplicate_percentage=duplicate_pct,
            empty_columns=empty_columns,
            constant_columns=constant_columns,
            columns_with_missing=columns_with_missing,
            columns_with_whitespace=columns_with_whitespace,
            numeric_conversion_candidates=numeric_candidates,
            datetime_conversion_candidates=datetime_candidates,
            all_column_recommendations=all_recs,
        )

    @classmethod
    def preview_cleaning_impact(cls, df: pd.DataFrame, config: CleaningConfig) -> Dict[str, Any]:
        """Fast estimation of expected rows, columns, missing values, and duplicates."""
        if df is None or df.empty:
            return {"expected_rows": 0, "expected_cols": 0, "expected_missing": 0, "expected_duplicates": 0}

        curr_rows = int(df.shape[0])
        curr_cols = int(df.shape[1])
        curr_missing = int(df.isna().sum().sum())
        curr_dups = int(df.duplicated().sum())

        expected_rows = curr_rows
        expected_cols = curr_cols
        expected_missing = curr_missing
        expected_dups = curr_dups

        # 1. Deduplication impact
        if config.remove_duplicates and curr_dups > 0:
            expected_rows -= curr_dups
            expected_dups = 0

        # 2. Dropping empty columns
        dropped_cols_set = set(config.drop_empty_columns) | set(config.drop_constant_columns)
        actual_drops = [c for c in dropped_cols_set if c in df.columns]
        expected_cols = max(0, expected_cols - len(actual_drops))

        # Adjust missing count for dropped columns
        for c in actual_drops:
            expected_missing -= int(df[c].isna().sum())

        # 3. Imputation impact (all 8 cleaning strategies supported)
        for col, raw_strategy in config.imputation_strategies.items():
            if col in df.columns and col not in actual_drops:
                strat = str(raw_strategy).strip().lower().replace(" ", "_")
                if strat not in ("none", "keep", "keep_missing_values"):
                    col_missing = int(df[col].isna().sum())
                    expected_missing = max(0, expected_missing - col_missing)
                    if strat in ("drop_rows", "drop"):
                        expected_rows = max(0, expected_rows - col_missing)

        return {
            "current_rows": curr_rows,
            "expected_rows": expected_rows,
            "current_cols": curr_cols,
            "expected_cols": expected_cols,
            "current_missing": curr_missing,
            "expected_missing": max(0, expected_missing),
            "current_duplicates": curr_dups,
            "expected_duplicates": expected_dups,
        }

    @classmethod
    def clean_dataset(cls, df: pd.DataFrame, config: CleaningConfig) -> Tuple[pd.DataFrame, CleaningSummary]:
        """Apply user-configured cleaning operations non-destructively to a fresh DataFrame copy."""
        if df is None or df.empty:
            raise ValueError("Cannot clean an empty or None DataFrame.")

        # Always work on an independent deep copy to protect original dataset
        cleaned = df.copy(deep=True)

        before_rows = int(cleaned.shape[0])
        before_cols = int(cleaned.shape[1])
        before_missing = int(cleaned.isna().sum().sum())
        before_dups = int(cleaned.duplicated().sum())

        changes_applied: List[str] = []
        warnings_list: List[str] = []
        log_entries: List[Dict[str, str]] = []
        now_str = datetime.now().strftime("%H:%M:%S")

        def record_change(msg: str):
            changes_applied.append(msg)
            log_entries.append({"timestamp": now_str, "message": msg})

        # Step 1: Duplicate Row Handling
        if config.remove_duplicates and before_dups > 0:
            cleaned = cleaned.drop_duplicates(keep="first").reset_index(drop=True)
            record_change(f"Removed {before_dups:,} exact duplicate row(s)")

        # Step 2: Empty Column Removal
        if config.drop_empty_columns:
            valid_empty_drops = [c for c in config.drop_empty_columns if c in cleaned.columns and cleaned[c].isna().all()]
            if valid_empty_drops:
                cleaned = cleaned.drop(columns=valid_empty_drops)
                record_change(f"Removed {len(valid_empty_drops)} all-null column(s): {', '.join(valid_empty_drops)}")

        # Step 3: Constant Column Removal
        if config.drop_constant_columns:
            valid_const_drops = [
                c for c in config.drop_constant_columns
                if c in cleaned.columns and cleaned[c].dropna().nunique() <= 1
            ]
            if valid_const_drops:
                cleaned = cleaned.drop(columns=valid_const_drops)
                record_change(f"Removed {len(valid_const_drops)} constant column(s): {', '.join(valid_const_drops)}")

        # Step 4: Text Standardization (Whitespace & Lowercase)
        if config.trim_whitespace or config.lowercase_text:
            text_cols_modified = 0
            for col in cleaned.columns:
                if pd.api.types.is_object_dtype(cleaned[col]) or pd.api.types.is_string_dtype(cleaned[col]):
                    series = cleaned[col]
                    mask_notna = series.notna()
                    if mask_notna.any():
                        col_changed = False
                        if config.trim_whitespace:
                            # Strip leading/trailing and normalize repeated whitespace
                            new_series = series.astype(str).str.strip().str.replace(r"\s+", " ", regex=True)
                            cleaned.loc[mask_notna, col] = new_series[mask_notna]
                            col_changed = True
                        if config.lowercase_text:
                            cleaned.loc[mask_notna, col] = cleaned.loc[mask_notna, col].astype(str).str.lower()
                            col_changed = True
                        if col_changed:
                            text_cols_modified += 1

            if config.trim_whitespace and text_cols_modified > 0:
                record_change(f"Trimmed leading/trailing whitespace across {text_cols_modified} text column(s)")
            if config.lowercase_text and text_cols_modified > 0:
                record_change(f"Converted text to lowercase across {text_cols_modified} text column(s)")

        # Step 5: Safe Numeric Conversion
        if config.convert_numeric_columns:
            for col in config.convert_numeric_columns:
                if col in cleaned.columns:
                    try:
                        # Clean currency symbols, commas, and percentage signs
                        cleaned_str = (
                            cleaned[col].astype(str)
                            .str.replace(",", "", regex=False)
                            .str.replace("$", "", regex=False)
                            .str.replace("%", "", regex=False)
                            .str.strip()
                        )
                        converted = pd.to_numeric(cleaned_str, errors="coerce")
                        valid_cnt = int(converted.notna().sum())
                        orig_non_null = int(cleaned[col].notna().sum())
                        cleaned[col] = converted
                        record_change(f"Converted '{col}' to numeric ({valid_cnt}/{orig_non_null} valid values)")
                        if valid_cnt < orig_non_null:
                            warnings_list.append(f"Column '{col}': {orig_non_null - valid_cnt} non-numeric values converted to NaN")
                    except Exception as e:
                        warnings_list.append(f"Could not convert '{col}' to numeric: {str(e)}")

        # Step 6: Safe Date Conversion
        if config.convert_date_columns:
            for col in config.convert_date_columns:
                if col in cleaned.columns:
                    try:
                        with warnings.catch_warnings():
                            warnings.filterwarnings("ignore", category=UserWarning)
                            converted = pd.to_datetime(cleaned[col], dayfirst=True, errors="coerce")
                        valid_cnt = int(converted.notna().sum())
                        orig_non_null = int(cleaned[col].notna().sum())
                        cleaned[col] = converted
                        record_change(f"Converted '{col}' to datetime ({valid_cnt}/{orig_non_null} valid dates)")
                        if valid_cnt < orig_non_null:
                            warnings_list.append(f"Column '{col}': {orig_non_null - valid_cnt} invalid date values set to NaT")
                    except Exception as e:
                        warnings_list.append(f"Could not convert '{col}' to datetime: {str(e)}")

        # Step 7: Missing Value Imputation (8 Exact Cleaning Methods)
        if config.imputation_strategies:
            for col, raw_strategy in config.imputation_strategies.items():
                if col not in cleaned.columns:
                    continue

                strategy = str(raw_strategy).strip().lower().replace(" ", "_")
                if strategy in ("none", "keep", "keep_missing_values", "leave_unchanged"):
                    # 8. Keep Missing Values: column left untouched
                    continue

                missing_count = int(cleaned[col].isna().sum())
                if missing_count == 0:
                    continue

                series = cleaned[col]

                if strategy == "mean":
                    # 1. Mean
                    num_series = pd.to_numeric(series, errors="coerce")
                    if num_series.notna().any():
                        mean_val = float(num_series.mean())
                        fill_val = round(mean_val, 4) if pd.api.types.is_float_dtype(series) else round(mean_val, 2)
                        cleaned[col] = cleaned[col].fillna(fill_val)
                        record_change(f"Filled {missing_count} missing value(s) in '{col}' using mean ({fill_val})")
                    else:
                        warnings_list.append(f"Cannot compute mean for non-numeric column '{col}'. Missing values preserved.")

                elif strategy == "median":
                    # 2. Median
                    num_series = pd.to_numeric(series, errors="coerce")
                    if num_series.notna().any():
                        median_val = float(num_series.median())
                        fill_val = round(median_val, 4) if pd.api.types.is_float_dtype(series) else round(median_val, 2)
                        cleaned[col] = cleaned[col].fillna(fill_val)
                        record_change(f"Filled {missing_count} missing value(s) in '{col}' using median ({fill_val})")
                    else:
                        warnings_list.append(f"Cannot compute median for non-numeric column '{col}'. Missing values preserved.")

                elif strategy == "mode":
                    # 3. Mode
                    mode_vals = series.dropna().mode()
                    if not mode_vals.empty:
                        fill_val = mode_vals.iloc[0]
                        cleaned[col] = cleaned[col].fillna(fill_val)
                        record_change(f"Filled {missing_count} missing value(s) in '{col}' using mode ('{fill_val}')")
                    else:
                        warnings_list.append(f"Cannot determine mode for column '{col}'. Missing values preserved.")

                elif strategy in ("ffill", "forward_fill"):
                    # 4. Forward Fill
                    cleaned[col] = cleaned[col].ffill()
                    rem_missing = int(cleaned[col].isna().sum())
                    filled_cnt = missing_count - rem_missing
                    record_change(f"Forward filled {filled_cnt} missing value(s) in '{col}'")
                    if rem_missing > 0:
                        warnings_list.append(f"Column '{col}': {rem_missing} leading missing value(s) could not be forward filled.")

                elif strategy in ("bfill", "backward_fill"):
                    # 5. Backward Fill
                    cleaned[col] = cleaned[col].bfill()
                    rem_missing = int(cleaned[col].isna().sum())
                    filled_cnt = missing_count - rem_missing
                    record_change(f"Backward filled {filled_cnt} missing value(s) in '{col}'")
                    if rem_missing > 0:
                        warnings_list.append(f"Column '{col}': {rem_missing} trailing missing value(s) could not be backward filled.")

                elif strategy in ("constant", "constant_value", "zero", "unknown"):
                    # 6. Constant Value
                    if strategy == "zero":
                        fill_val = 0
                    elif strategy == "unknown":
                        fill_val = "Unknown"
                    else:
                        raw_const = config.constant_values.get(col) if config.constant_values else None
                        if raw_const is None or raw_const == "":
                            fill_val = 0 if pd.api.types.is_numeric_dtype(series) else "Unknown"
                        else:
                            fill_val = raw_const
                            if pd.api.types.is_numeric_dtype(series):
                                try:
                                    if isinstance(fill_val, str) and "." in fill_val:
                                        fill_val = float(fill_val)
                                    else:
                                        fill_val = int(fill_val)
                                except (ValueError, TypeError):
                                    try:
                                        fill_val = float(fill_val)
                                    except (ValueError, TypeError):
                                        pass
                    cleaned[col] = cleaned[col].fillna(fill_val)
                    record_change(f"Filled {missing_count} missing value(s) in '{col}' with constant value ('{fill_val}')")

                elif strategy in ("drop_rows", "drop"):
                    # 7. Drop Rows
                    before_drop_len = len(cleaned)
                    cleaned = cleaned.dropna(subset=[col]).reset_index(drop=True)
                    dropped_rows = before_drop_len - len(cleaned)
                    record_change(f"Dropped {dropped_rows} row(s) containing missing values in '{col}'")

                else:
                    warnings_list.append(f"Unrecognized cleaning strategy '{strategy}' for column '{col}'. Missing values preserved.")
        if not changes_applied:
            record_change("Cleaned dataset initialized as identical copy of original dataset (no cleaning operations selected)")

        after_rows = int(cleaned.shape[0])
        after_cols = int(cleaned.shape[1])
        after_missing = int(cleaned.isna().sum().sum())
        after_dups = int(cleaned.duplicated().sum())

        summary = CleaningSummary(
            before_rows=before_rows,
            after_rows=after_rows,
            before_columns=before_cols,
            after_columns=after_cols,
            before_missing=before_missing,
            after_missing=after_missing,
            before_duplicates=before_dups,
            after_duplicates=after_dups,
            changes_applied=changes_applied,
            warnings=warnings_list,
            timestamp=now_str,
            log_entries=log_entries,
        )

        return cleaned, summary


# Convenience functional interface
def analyze_cleaning_options(df: pd.DataFrame) -> CleaningRecommendations:
    """Convenience functional interface for cleaning recommendations."""
    return CleanerAgent.analyze_cleaning_options(df)


def clean_dataset(df: pd.DataFrame, config: CleaningConfig) -> Tuple[pd.DataFrame, CleaningSummary]:
    """Convenience functional interface for non-destructive dataset cleaning."""
    return CleanerAgent.clean_dataset(df, config)


def preview_cleaning_impact(df: pd.DataFrame, config: CleaningConfig) -> Dict[str, Any]:
    """Convenience functional interface for cleaning impact preview."""
    return CleanerAgent.preview_cleaning_impact(df, config)
