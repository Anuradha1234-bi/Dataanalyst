import io
import json
import re
import shutil
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple, Optional

import numpy as np
import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models.dataset import Dataset
from app.models.user import User
from app.models.analysis_history import AnalysisHistory
from app.schemas.cleaning import (
    CleaningOperationsRequest,
    CleaningMetricStats,
    ColumnCleaningRecommendation,
    DetailedCleaningOperation,
    CleaningOverviewResponse,
    CleaningPreviewResponse,
    CleaningApplyResponse,
    CleaningHistoryItem,
    CellDiffItem,
    ValueFrequencyItem,
    ColumnValueSummaryResponse,
    CategoryVariant,
    CategoryCluster,
    CategoryInconsistenciesResponse,
    DateInspectionResponse,
    OutlierCleaningConfig,
    CleaningValidationItem,
    CleaningValidationReport,
    CleaningDashboardSummaryResponse,
    BulkOperationImpactItem,
    BulkPreviewResponse,
    DatasetVersionItem,
    CleaningReportResponse,
    SmartCleaningSuggestion,
    SmartSuggestionsResponse,
    ConsistencyCheckItem,
    ConsistencyChecksResponse,
    CustomConsistencyRuleRequest,
    CustomConsistencyRuleResponse,
    VersionComparisonResponse,
)
from utils.file_loader import FileLoader


class DataCleaningService:
    """Performs non-destructive dataset sanitization, previewing, and versioned persistence."""

    @classmethod
    def _standardize_names(cls, columns: List[str]) -> Tuple[List[str], Dict[str, str]]:
        """Standardize column names: lowercase, trim, replace spaces/dashes with _, remove non-alphanumeric, ensure uniqueness."""
        mapping: Dict[str, str] = {}
        used = set()
        new_cols: List[str] = []
        for col in columns:
            c_str = str(col).strip()
            # Replace spaces, hyphens, and dots with underscore
            clean = re.sub(r'[\s\-.]+', '_', c_str)
            # Remove characters not alphanumeric or underscore
            clean = re.sub(r'[^a-zA-Z0-9_]', '', clean)
            # Collapse multiple underscores
            clean = re.sub(r'_+', '_', clean).strip('_').lower()
            if not clean:
                clean = "col"
            if clean[0].isdigit():
                clean = f"col_{clean}"
            final_name = clean
            counter = 1
            while final_name in used:
                final_name = f"{clean}_{counter}"
                counter += 1
            used.add(final_name)
            mapping[c_str] = final_name
            new_cols.append(final_name)
        return new_cols, mapping

    @classmethod
    def calculate_metrics(cls, df: pd.DataFrame) -> CleaningMetricStats:
        """Calculate comprehensive structural and hygiene metrics on any DataFrame."""
        total_rows = int(len(df))
        total_cols = int(len(df.columns))
        total_cells = total_rows * total_cols

        missing_series = df.isnull().sum()
        total_missing = int(missing_series.sum())
        missing_pct = round((total_missing / total_cells * 100), 2) if total_cells > 0 else 0.0

        duplicate_rows = int(df.duplicated().sum())
        duplicate_pct = round((duplicate_rows / total_rows * 100), 2) if total_rows > 0 else 0.0
        cols_with_missing = int((missing_series > 0).sum())

        return CleaningMetricStats(
            total_rows=total_rows,
            total_columns=total_cols,
            missing_cells=total_missing,
            missing_percentage=missing_pct,
            duplicate_rows=duplicate_rows,
            duplicate_percentage=duplicate_pct,
            column_count_with_missing=cols_with_missing,
        )

    @classmethod
    def _sanitize_for_json(cls, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Clean record values replacing NaN, inf, NaT with None / strings for valid JSON."""
        sanitized = []
        for row in records:
            clean_row = {}
            for k, v in row.items():
                if pd.isna(v) or v is None:
                    clean_row[str(k)] = None
                elif isinstance(v, (np.floating, float)) and (np.isnan(v) or np.isinf(v)):
                    clean_row[str(k)] = None
                elif isinstance(v, (pd.Timestamp, datetime)):
                    clean_row[str(k)] = v.isoformat()
                elif isinstance(v, (np.integer, int)):
                    clean_row[str(k)] = int(v)
                elif isinstance(v, (np.floating, float)):
                    clean_row[str(k)] = round(float(v), 4)
                else:
                    clean_row[str(k)] = str(v)
            sanitized.append(clean_row)
        return sanitized

    # Phase 6: Bounded in-memory caches for high-performance dataset analysis and DataFrames
    _df_cache: Dict[str, pd.DataFrame] = {}
    _analysis_cache: Dict[str, Any] = {}
    _CACHE_MAX_ENTRIES = 50

    @classmethod
    def _get_cache_key(cls, dataset: Dataset, active: bool = True) -> str:
        """Generate deterministic cache key using dataset ID, active file path, modification time, and size."""
        file_p = Path(
            dataset.cleaned_file_path
            if (active and dataset.has_cleaned and dataset.cleaned_file_path)
            else dataset.file_path
        )
        if not file_p.exists():
            return f"{dataset.id}_{active}_notfound"
        try:
            stat = file_p.stat()
            return f"{dataset.id}_{'cleaned' if (active and dataset.has_cleaned) else 'orig'}_{stat.st_mtime_ns}_{stat.st_size}"
        except Exception:
            return f"{dataset.id}_{active}"

    @classmethod
    def clear_cache_for_dataset(cls, dataset_id: int) -> None:
        """Invalidate all cached DataFrames and analysis results for a specific dataset."""
        prefix = f"{dataset_id}_"
        keys_to_remove = [k for k in cls._df_cache if k.startswith(prefix)]
        for k in keys_to_remove:
            cls._df_cache.pop(k, None)
        analysis_keys = [k for k in cls._analysis_cache if k.startswith(prefix)]
        for k in analysis_keys:
            cls._analysis_cache.pop(k, None)

    @classmethod
    def _get_dataframe(cls, dataset: Dataset, active: bool = True) -> pd.DataFrame:
        """Safely load or retrieve cached DataFrame for dataset without repeated disk I/O."""
        target_path = Path(
            dataset.cleaned_file_path
            if (active and dataset.has_cleaned and dataset.cleaned_file_path)
            else dataset.file_path
        )
        if not target_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset file '{target_path.name}' not found on storage disk.",
            )

        cache_key = cls._get_cache_key(dataset, active=active)
        if cache_key in cls._df_cache:
            return cls._df_cache[cache_key].copy(deep=False)

        load_res = FileLoader.load_file(target_path, dataset.filename, dataset.file_size_bytes or 0)
        if not load_res.success or load_res.df is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=load_res.error_message or "Unable to read dataset content.",
            )

        df = load_res.df
        if len(cls._df_cache) >= cls._CACHE_MAX_ENTRIES:
            cls._df_cache.pop(next(iter(cls._df_cache)))

        cls._df_cache[cache_key] = df
        return df.copy(deep=False)

    @classmethod
    def get_cleaning_overview(cls, dataset: Dataset, db: Session) -> CleaningOverviewResponse:
        """Analyze original dataset and any existing cleaned version to produce cleaning options."""
        cache_key = f"{cls._get_cache_key(dataset, active=True)}_overview"
        if cache_key in cls._analysis_cache:
            return cls._analysis_cache[cache_key]

        df = cls._get_dataframe(dataset, active=False)
        orig_metrics = cls.calculate_metrics(df)

        # Check for cleaned version
        cleaned_metrics = None
        cleaned_filename = None
        cleaned_df = None
        cleaned_sample_preview = None
        cleaned_columns = None

        if dataset.has_cleaned and dataset.cleaned_file_path:
            cleaned_path = Path(dataset.cleaned_file_path)
            if cleaned_path.exists() and cleaned_path.is_file():
                cleaned_df = cls._get_dataframe(dataset, active=True)
                cleaned_metrics = cls.calculate_metrics(cleaned_df)
                cleaned_filename = cleaned_path.name
                cleaned_sample_preview = cls._sanitize_for_json(cleaned_df.head(10).to_dict(orient="records"))
                cleaned_columns = [str(c) for c in cleaned_df.columns]

        # Column Diagnostics
        columns_recommendations: List[ColumnCleaningRecommendation] = []
        total_rows = len(df)
        total_blanks = 0
        cols_with_blanks = 0

        for col in df.columns:
            col_str = str(col)
            series = df[col]
            missing_c = int(series.isnull().sum())
            missing_p = round((missing_c / total_rows * 100), 2) if total_rows > 0 else 0.0
            non_null = series.dropna()
            non_null_count = len(non_null)
            unique_c = int(non_null.nunique())
            unique_p = round((unique_c / total_rows * 100), 2) if total_rows > 0 else 0.0

            raw_dtype = str(series.dtype)
            is_numeric = pd.api.types.is_numeric_dtype(series)
            is_bool = pd.api.types.is_bool_dtype(series)
            is_datetime = pd.api.types.is_datetime64_any_dtype(series)

            if is_bool:
                inferred_type = "Boolean"
            elif is_numeric:
                inferred_type = "Integer" if pd.api.types.is_integer_dtype(series) else "Float"
            elif is_datetime:
                inferred_type = "Datetime"
            else:
                if non_null_count > 0 and non_null.nunique() <= min(15, total_rows * 0.5):
                    inferred_type = "Categorical"
                else:
                    inferred_type = "Text"

            is_constant = (unique_c == 1) if non_null_count > 0 else False
            is_empty = (missing_c == total_rows)

            # Detect blank/whitespace values in text/object columns
            blank_c = 0
            if pd.api.types.is_string_dtype(series) or pd.api.types.is_object_dtype(series):
                blank_mask = non_null.astype(str).str.strip() == ""
                blank_c = int(blank_mask.sum())
            blank_p = round((blank_c / total_rows * 100), 2) if total_rows > 0 else 0.0
            if blank_c > 0:
                total_blanks += blank_c
                cols_with_blanks += 1

            # Check mixed types
            has_mixed_types = False
            if inferred_type in ["Text", "Categorical"] and non_null_count > 0:
                numeric_parsed = pd.to_numeric(non_null, errors="coerce")
                num_count = int(numeric_parsed.notnull().sum())
                if 0 < num_count < non_null_count:
                    has_mixed_types = True

            # Possible inferred type & safe conversions
            possible_inferred = None
            safe_types: List[str] = []
            if inferred_type in ["Text", "Categorical"]:
                if non_null_count > 0:
                    num_parsed = pd.to_numeric(non_null, errors="coerce")
                    valid_num = int(num_parsed.notnull().sum())
                    if valid_num == non_null_count:
                        if (num_parsed % 1 == 0).all():
                            possible_inferred = "Integer"
                            safe_types = ["Integer", "Float"]
                        else:
                            possible_inferred = "Float"
                            safe_types = ["Float"]
                    elif valid_num >= 0.8 * non_null_count:
                        possible_inferred = "Possible Numeric (Mixed)"
                        safe_types = ["Float", "Integer"]
                    else:
                        sample_s = str(non_null.iloc[0])
                        if len(sample_s) >= 4 and any(sep in sample_s for sep in ["-", "/", ":", ","]):
                            try:
                                dt_parsed = pd.to_datetime(non_null.head(50), errors="coerce", format="mixed")
                            except (TypeError, ValueError):
                                dt_parsed = pd.to_datetime(non_null.head(50), errors="coerce")
                            if dt_parsed.notnull().sum() >= min(10, non_null_count * 0.8):
                                possible_inferred = "Datetime"
                                safe_types = ["Datetime"]
                if not safe_types:
                    safe_types = ["Integer", "Float", "Datetime"]
            elif inferred_type == "Integer":
                safe_types = ["Float", "String"]
            elif inferred_type == "Float":
                safe_types = ["Integer", "String"]
            elif inferred_type == "Datetime":
                safe_types = ["String"]

            # Recommended strategies
            recommended: List[str] = []
            if missing_c > 0:
                if is_numeric:
                    recommended.extend(["median", "mean", "constant", "drop_rows", "ffill", "bfill"])
                elif inferred_type in ["Categorical", "Text"]:
                    recommended.extend(["mode", "constant", "drop_rows", "ffill", "bfill"])
                elif inferred_type == "Datetime":
                    recommended.extend(["drop_rows", "ffill", "bfill", "constant"])
                else:
                    recommended.extend(["mode", "constant", "drop_rows"])

            issues: List[str] = []
            if is_empty:
                issues.append("100% Empty Column")
            elif missing_c > 0:
                issues.append(f"{missing_c} missing ({missing_p}%)")
            if blank_c > 0:
                issues.append(f"{blank_c} blank/whitespace string(s)")
            if is_constant:
                issues.append("100% Constant Value")
            if has_mixed_types:
                issues.append("Mixed numeric & text values")

            columns_recommendations.append(
                ColumnCleaningRecommendation(
                    column_name=col_str,
                    data_type=raw_dtype,
                    inferred_type=inferred_type,
                    possible_inferred_type=possible_inferred,
                    missing_count=missing_c,
                    missing_percentage=missing_p,
                    blank_count=blank_c,
                    blank_percentage=blank_p,
                    unique_count=unique_c,
                    unique_percentage=unique_p,
                    is_constant=is_constant,
                    is_empty=is_empty,
                    has_mixed_types=has_mixed_types,
                    recommended_strategies=recommended,
                    safe_type_conversions=safe_types,
                    issues=issues,
                )
            )

        # Duplicate records sample
        dup_mask = df.duplicated(keep=False)
        dup_rows_count = int(df.duplicated().sum())
        dup_percentage = round((dup_rows_count / total_rows * 100), 2) if total_rows > 0 else 0.0
        dup_sample_df = df[dup_mask].head(10)
        dup_sample = cls._sanitize_for_json(dup_sample_df.to_dict(orient="records"))

        empty_rows_count = int(df.isnull().all(axis=1).sum())
        empty_cols = [str(c) for c in df.columns if df[c].isnull().all()]

        # Standardized column names preview
        _, std_map = cls._standardize_names([str(c) for c in df.columns])
        has_std_diff = any(old != new for old, new in std_map.items())
        std_preview = std_map if has_std_diff else None

        file_type = getattr(dataset, "file_type", "CSV") or "CSV"
        upload_date = dataset.created_at.isoformat() if dataset.created_at else None
        file_size_bytes = dataset.file_size_bytes or 0

        overview_res = CleaningOverviewResponse(
            dataset_id=dataset.id,
            filename=dataset.filename,
            file_type=file_type,
            upload_date=upload_date,
            file_size_bytes=file_size_bytes,
            has_cleaned=dataset.has_cleaned,
            cleaned_filename=cleaned_filename,
            original_metrics=orig_metrics,
            cleaned_metrics=cleaned_metrics,
            columns=columns_recommendations,
            duplicate_rows_count=dup_rows_count,
            duplicate_percentage=dup_percentage,
            duplicate_sample=dup_sample,
            empty_rows_count=empty_rows_count,
            empty_columns=empty_cols,
            total_blank_cells=total_blanks,
            columns_with_blanks=cols_with_blanks,
            column_names_standardized_preview=std_preview,
            cleaned_sample_preview=cleaned_sample_preview,
            cleaned_columns=cleaned_columns,
        )
        if len(cls._analysis_cache) >= cls._CACHE_MAX_ENTRIES:
            cls._analysis_cache.pop(next(iter(cls._analysis_cache)))
        cls._analysis_cache[cache_key] = overview_res
        return overview_res

    @classmethod
    def execute_cleaning_pipeline(
        cls,
        df: pd.DataFrame,
        operations: CleaningOperationsRequest,
    ) -> Tuple[pd.DataFrame, List[str], List[Dict[str, str]], List[DetailedCleaningOperation], int, int, Optional[Dict[str, str]]]:
        """Apply requested cleaning operations to a copy of DataFrame without mutating disk."""
        cleaned = df.copy()
        operations_performed: List[str] = []
        detailed_operations: List[DetailedCleaningOperation] = []
        type_changes: List[Dict[str, str]] = []
        blank_cells_converted = 0
        column_names_changed = 0
        column_name_mapping: Optional[Dict[str, str]] = None

        # ---------------------------------------------------------------------
        # PHASE 1 OPERATIONS
        # ---------------------------------------------------------------------

        # 0. Convert Blank / Whitespace values to NaN (Feature 5)
        if operations.convert_blanks_to_na:
            for col in list(cleaned.columns):
                if pd.api.types.is_string_dtype(cleaned[col]) or pd.api.types.is_object_dtype(cleaned[col]):
                    mask = cleaned[col].astype(str).str.strip() == ""
                    cnt = int((mask & cleaned[col].notnull()).sum())
                    if cnt > 0:
                        cleaned.loc[mask, col] = np.nan
                        blank_cells_converted += cnt
                        operations_performed.append(f"'{col}': Converted {cnt} blank/whitespace string(s) to missing values (NaN)")
                        detailed_operations.append(DetailedCleaningOperation(
                            operation="Blank / Whitespace",
                            column=str(col),
                            method="Convert to Missing (NaN)",
                            rows_affected=cnt,
                        ))

        # 1. Standardize column names (Feature 7)
        if operations.standardize_column_names:
            new_cols, mapping = cls._standardize_names(list(cleaned.columns))
            changed = [f"'{old}' -> '{new}'" for old, new in mapping.items() if old != new]
            if changed:
                column_name_mapping = mapping
                column_names_changed = len(changed)
                cleaned.columns = new_cols
                operations_performed.append(f"Standardized {len(changed)} column name(s): {', '.join(changed)}")
                for old, new in mapping.items():
                    if old != new:
                        detailed_operations.append(DetailedCleaningOperation(
                            operation="Column Name Standardization",
                            column=old,
                            method=f"Renamed to '{new}'",
                            rows_affected=0,
                        ))

        # 2. Remove completely empty rows
        if operations.remove_empty_rows:
            before_r = len(cleaned)
            cleaned = cleaned.dropna(how="all")
            removed = before_r - len(cleaned)
            if removed > 0:
                operations_performed.append(f"Removed {removed} completely empty row(s)")
                detailed_operations.append(DetailedCleaningOperation(
                    operation="Empty Entity Removal",
                    column="All",
                    method="Drop Empty Rows",
                    rows_affected=removed,
                ))

        # 3. Remove completely empty columns
        if operations.remove_empty_columns:
            empty_cols = [c for c in cleaned.columns if cleaned[c].isnull().all()]
            if empty_cols:
                cleaned = cleaned.drop(columns=empty_cols)
                operations_performed.append(f"Removed {len(empty_cols)} empty column(s): {', '.join(empty_cols)}")
                for ec in empty_cols:
                    detailed_operations.append(DetailedCleaningOperation(
                        operation="Empty Entity Removal",
                        column=str(ec),
                        method="Drop Empty Column",
                        rows_affected=len(cleaned),
                    ))

        # 4. Explicitly drop specified columns
        if operations.drop_columns:
            valid_drops = [c for c in operations.drop_columns if c in cleaned.columns]
            if valid_drops:
                cleaned = cleaned.drop(columns=valid_drops)
                operations_performed.append(f"Dropped column(s): {', '.join(valid_drops)}")
                for dc in valid_drops:
                    detailed_operations.append(DetailedCleaningOperation(
                        operation="Column Drop",
                        column=str(dc),
                        method="Drop Column",
                        rows_affected=len(cleaned),
                    ))

        # 5. Remove duplicate rows (Feature 4)
        if operations.remove_duplicates:
            before_r = len(cleaned)
            cleaned = cleaned.drop_duplicates()
            removed = before_r - len(cleaned)
            if removed > 0:
                operations_performed.append(f"Removed {removed} duplicate row(s)")
                detailed_operations.append(DetailedCleaningOperation(
                    operation="Duplicate Removal",
                    column="All",
                    method="Remove Duplicates",
                    rows_affected=removed,
                ))

        # 6. Missing value imputations (Feature 3)
        for imp in operations.missing_imputations:
            col = imp.column
            if col not in cleaned.columns and column_name_mapping and col in column_name_mapping:
                col = column_name_mapping[col]

            if col not in cleaned.columns:
                continue

            missing_before = int(cleaned[col].isnull().sum())
            if missing_before == 0:
                continue

            strat = imp.strategy.strip().lower()
            is_numeric = pd.api.types.is_numeric_dtype(cleaned[col])

            if strat == "mean":
                if is_numeric:
                    non_null = cleaned[col].dropna()
                    if not non_null.empty:
                        mean_val = round(float(non_null.mean()), 4)
                        cleaned[col] = cleaned[col].fillna(mean_val)
                        operations_performed.append(f"'{col}': Imputed {missing_before} missing cell(s) with Mean ({mean_val})")
                        detailed_operations.append(DetailedCleaningOperation(
                            operation="Missing Value",
                            column=col,
                            method=f"Mean ({mean_val})",
                            rows_affected=missing_before,
                        ))
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Mean imputation cannot be performed on non-numeric column '{col}'.",
                    )

            elif strat == "median":
                if is_numeric:
                    non_null = cleaned[col].dropna()
                    if not non_null.empty:
                        med_val = round(float(non_null.median()), 4)
                        cleaned[col] = cleaned[col].fillna(med_val)
                        operations_performed.append(f"'{col}': Imputed {missing_before} missing cell(s) with Median ({med_val})")
                        detailed_operations.append(DetailedCleaningOperation(
                            operation="Missing Value",
                            column=col,
                            method=f"Median ({med_val})",
                            rows_affected=missing_before,
                        ))
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Median imputation cannot be performed on non-numeric column '{col}'.",
                    )

            elif strat == "mode":
                modes = cleaned[col].dropna().mode()
                if not modes.empty:
                    mode_val = modes.iloc[0]
                    cleaned[col] = cleaned[col].fillna(mode_val)
                    operations_performed.append(f"'{col}': Imputed {missing_before} missing cell(s) with Mode ('{mode_val}')")
                    detailed_operations.append(DetailedCleaningOperation(
                        operation="Missing Value",
                        column=col,
                        method=f"Mode ('{mode_val}')",
                        rows_affected=missing_before,
                    ))

            elif strat == "constant":
                val = imp.fill_value
                if val is None or str(val).strip() == "":
                    val = 0 if is_numeric else "Unknown"
                if is_numeric:
                    try:
                        val = float(val) if "." in str(val) else int(val)
                    except (ValueError, TypeError):
                        pass
                cleaned[col] = cleaned[col].fillna(val)
                operations_performed.append(f"'{col}': Imputed {missing_before} missing cell(s) with Constant ('{val}')")
                detailed_operations.append(DetailedCleaningOperation(
                    operation="Missing Value",
                    column=col,
                    method=f"Constant ('{val}')",
                    rows_affected=missing_before,
                ))

            elif strat == "drop_rows":
                before_r = len(cleaned)
                cleaned = cleaned.dropna(subset=[col])
                dropped = before_r - len(cleaned)
                operations_performed.append(f"'{col}': Dropped {dropped} row(s) containing missing values")
                detailed_operations.append(DetailedCleaningOperation(
                    operation="Missing Value",
                    column=col,
                    method="Drop Rows with Missing",
                    rows_affected=dropped,
                ))

            elif strat == "ffill":
                cleaned[col] = cleaned[col].ffill()
                rem = int(cleaned[col].isnull().sum())
                filled = missing_before - rem
                operations_performed.append(f"'{col}': Forward-filled missing values ({filled} filled)")
                detailed_operations.append(DetailedCleaningOperation(
                    operation="Missing Value",
                    column=col,
                    method="Forward Fill (ffill)",
                    rows_affected=filled,
                ))

            elif strat == "bfill":
                cleaned[col] = cleaned[col].bfill()
                rem = int(cleaned[col].isnull().sum())
                filled = missing_before - rem
                operations_performed.append(f"'{col}': Backward-filled missing values ({filled} filled)")
                detailed_operations.append(DetailedCleaningOperation(
                    operation="Missing Value",
                    column=col,
                    method="Backward Fill (bfill)",
                    rows_affected=filled,
                ))

            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unknown imputation strategy '{strat}' for column '{col}'.",
                )

        # 7. Data type conversions (Feature 6)
        for tc in operations.type_conversions:
            col = tc.column
            if col not in cleaned.columns and column_name_mapping and col in column_name_mapping:
                col = column_name_mapping[col]

            if col not in cleaned.columns:
                continue

            target = tc.target_type.strip().lower()
            old_dtype = str(cleaned[col].dtype)

            try:
                if target in ["numeric", "float"]:
                    cleaned[col] = pd.to_numeric(cleaned[col], errors="coerce")
                    new_dtype = str(cleaned[col].dtype)
                    type_changes.append({"column": col, "from": old_dtype, "to": new_dtype})
                    operations_performed.append(f"'{col}': Converted type from {old_dtype} to {new_dtype}")
                    detailed_operations.append(DetailedCleaningOperation(
                        operation="Data Type Conversion",
                        column=col,
                        method=f"Convert to Float ({old_dtype} -> {new_dtype})",
                        rows_affected=len(cleaned),
                    ))

                elif target == "integer":
                    num_s = pd.to_numeric(cleaned[col], errors="coerce")
                    cleaned[col] = num_s.round().astype("Int64")
                    type_changes.append({"column": col, "from": old_dtype, "to": "Int64"})
                    operations_performed.append(f"'{col}': Converted type to Integer (Int64)")
                    detailed_operations.append(DetailedCleaningOperation(
                        operation="Data Type Conversion",
                        column=col,
                        method=f"Convert to Integer ({old_dtype} -> Int64)",
                        rows_affected=len(cleaned),
                    ))

                elif target in ["datetime", "date"]:
                    cleaned[col] = pd.to_datetime(cleaned[col], errors="coerce")
                    type_changes.append({"column": col, "from": old_dtype, "to": "datetime64[ns]"})
                    operations_performed.append(f"'{col}': Converted type to Datetime")
                    detailed_operations.append(DetailedCleaningOperation(
                        operation="Data Type Conversion",
                        column=col,
                        method=f"Convert to Datetime ({old_dtype} -> datetime64)",
                        rows_affected=len(cleaned),
                    ))

                elif target in ["text", "string"]:
                    cleaned[col] = cleaned[col].astype(str)
                    type_changes.append({"column": col, "from": old_dtype, "to": "string"})
                    operations_performed.append(f"'{col}': Converted type to String/Text")
                    detailed_operations.append(DetailedCleaningOperation(
                        operation="Data Type Conversion",
                        column=col,
                        method=f"Convert to String ({old_dtype} -> string)",
                        rows_affected=len(cleaned),
                    ))

                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Unsupported target type conversion '{target}' for column '{col}'.",
                    )
            except Exception as e:
                if isinstance(e, HTTPException):
                    raise e
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Data type conversion failed for column '{col}': {str(e)}",
                )

        # ---------------------------------------------------------------------
        # PHASE 2: ADVANCED CLEANING OPERATIONS
        # ---------------------------------------------------------------------

        # 8. Custom Value Replacement (Phase 2 - Feature 6)
        for cr in operations.custom_replacements:
            col = cr.column
            if col not in cleaned.columns and column_name_mapping and col in column_name_mapping:
                col = column_name_mapping[col]
            if col not in cleaned.columns:
                continue

            find_val = cr.find_value
            rep_val = cr.replace_value
            is_na_rep = rep_val is None or str(rep_val).strip() in ["NaN", "nan", "null", "None", "<NA>"]

            if cr.exact_match:
                mask = (cleaned[col].astype(str).str.strip() == str(find_val).strip()) & cleaned[col].notnull()
            else:
                mask = cleaned[col].astype(str).str.contains(re.escape(str(find_val)), regex=True, na=False)

            affected = int(mask.sum())
            if affected > 0:
                if is_na_rep:
                    cleaned.loc[mask, col] = np.nan
                    rep_desc = "Missing (NaN)"
                else:
                    cleaned.loc[mask, col] = rep_val
                    rep_desc = f"'{rep_val}'"

                operations_performed.append(f"'{col}': Replaced '{find_val}' with {rep_desc} in {affected} cell(s)")
                detailed_operations.append(DetailedCleaningOperation(
                    operation="Custom Replacement",
                    column=col,
                    method=f"Replace '{find_val}' -> {rep_desc}",
                    rows_affected=affected,
                ))

        # 9. Find & Replace (Phase 2 - Feature 7)
        for fr in operations.find_replaces:
            col = fr.column
            if col not in cleaned.columns and column_name_mapping and col in column_name_mapping:
                col = column_name_mapping[col]
            if col not in cleaned.columns:
                continue

            find_val = fr.find_value
            rep_val = fr.replace_value
            affected = 0

            if fr.exact_match:
                if fr.case_sensitive:
                    mask = (cleaned[col].astype(str) == find_val) & cleaned[col].notnull()
                else:
                    mask = (cleaned[col].astype(str).str.lower() == find_val.lower()) & cleaned[col].notnull()
                affected = int(mask.sum())
                if affected > 0:
                    cleaned.loc[mask, col] = rep_val
            else:
                series_str = cleaned[col].astype(str)
                flags = 0 if fr.case_sensitive else re.IGNORECASE
                pattern = re.escape(find_val)
                mask = series_str.str.contains(pattern, flags=flags, regex=True, na=False) & cleaned[col].notnull()
                affected = int(mask.sum())
                if affected > 0:
                    cleaned[col] = cleaned[col].apply(
                        lambda v: re.sub(pattern, rep_val, str(v), flags=flags) if pd.notnull(v) else v
                    )

            if affected > 0:
                operations_performed.append(f"'{col}': Find & Replace '{find_val}' -> '{rep_val}' ({affected} cell(s) affected)")
                detailed_operations.append(DetailedCleaningOperation(
                    operation="Find & Replace",
                    column=col,
                    method=f"'{find_val}' -> '{rep_val}'",
                    rows_affected=affected,
                ))

        # 10. Text Standardization (Phase 2 - Feature 1)
        for ts in operations.text_standardizations:
            col = ts.column
            if col not in cleaned.columns and column_name_mapping and col in column_name_mapping:
                col = column_name_mapping[col]
            if col not in cleaned.columns:
                continue

            affected_cells = 0
            series = cleaned[col]
            new_series = series.copy()

            for idx, val in series.items():
                if pd.isna(val):
                    continue
                v_str = str(val)
                curr = v_str

                if ts.trim_whitespace:
                    curr = curr.strip()
                if ts.collapse_spaces:
                    curr = re.sub(r'[ \t\r\f\v]+', ' ', curr)
                    curr = re.sub(r' +', ' ', curr)
                if ts.remove_special_chars:
                    curr = re.sub(r'[^a-zA-Z0-9\s]', '', curr)
                if ts.case_conversion:
                    conv = ts.case_conversion.strip().lower()
                    if conv == "lowercase":
                        curr = curr.lower()
                    elif conv == "uppercase":
                        curr = curr.upper()
                    elif conv == "titlecase":
                        curr = curr.title()

                if curr != v_str:
                    new_series.at[idx] = curr
                    affected_cells += 1

            if affected_cells > 0:
                cleaned[col] = new_series
                conv_desc = ts.case_conversion or "none"
                operations_performed.append(
                    f"'{col}': Standardized text in {affected_cells} cell(s) (trim={ts.trim_whitespace}, case={conv_desc})"
                )
                detailed_operations.append(DetailedCleaningOperation(
                    operation="Text Standardization",
                    column=col,
                    method=f"Standardize (trim={ts.trim_whitespace}, case={conv_desc})",
                    rows_affected=affected_cells,
                ))

        # 11. Category Normalization (Phase 2 - Feature 2)
        for cn in operations.category_normalizations:
            col = cn.column
            if col not in cleaned.columns and column_name_mapping and col in column_name_mapping:
                col = column_name_mapping[col]
            if col not in cleaned.columns or not cn.mapping:
                continue

            affected_cells = 0
            series = cleaned[col]
            new_series = series.copy()
            mapping = {str(k).strip(): str(v).strip() for k, v in cn.mapping.items()}

            for idx, val in series.items():
                if pd.isna(val):
                    continue
                s_val = str(val).strip()
                if s_val in mapping:
                    target = mapping[s_val]
                    if target != str(val):
                        new_series.at[idx] = target
                        affected_cells += 1

            if affected_cells > 0:
                cleaned[col] = new_series
                mapping_items = [f"'{k}' -> '{v}'" for k, v in list(mapping.items())[:3]]
                mapping_desc = ", ".join(mapping_items)
                if len(mapping) > 3:
                    mapping_desc += f"... (+{len(mapping) - 3} more)"
                operations_performed.append(f"'{col}': Normalized categories in {affected_cells} cell(s) ({mapping_desc})")
                detailed_operations.append(DetailedCleaningOperation(
                    operation="Category Normalization",
                    column=col,
                    method=f"Map ({mapping_desc})",
                    rows_affected=affected_cells,
                ))

        # 12. Numeric Value Cleaning (Phase 2 - Feature 3)
        for nc in operations.numeric_cleanings:
            col = nc.column
            if col not in cleaned.columns and column_name_mapping and col in column_name_mapping:
                col = column_name_mapping[col]
            if col not in cleaned.columns:
                continue

            affected_cells = 0
            series = cleaned[col]
            new_series = pd.Series(index=series.index, dtype=object)

            for idx, val in series.items():
                if pd.isna(val):
                    new_series.at[idx] = np.nan
                    continue

                s_val = str(val).strip()
                is_pct = s_val.endswith("%")
                cleaned_str = s_val
                if is_pct:
                    cleaned_str = cleaned_str[:-1].strip()
                if nc.strip_currency:
                    cleaned_str = re.sub(r'[\$,₹,€,£,¥]', '', cleaned_str)
                if nc.remove_commas:
                    cleaned_str = cleaned_str.replace(',', '')
                cleaned_str = cleaned_str.strip()

                try:
                    num = float(cleaned_str)
                    if is_pct and nc.percentage_handling == "as_fraction":
                        num = round(num / 100.0, 4)
                    elif not is_pct and num.is_integer() and "." not in cleaned_str:
                        num = int(num)
                    new_series.at[idx] = num
                    if str(val) != str(num):
                        affected_cells += 1
                except Exception:
                    if nc.handle_invalid == "coerce_na":
                        new_series.at[idx] = np.nan
                        affected_cells += 1
                    else:
                        new_series.at[idx] = val

            cleaned[col] = pd.to_numeric(new_series, errors="coerce" if nc.handle_invalid == "coerce_na" else "ignore")
            pct_label = "0.45 fraction" if nc.percentage_handling == "as_fraction" else "45 integer"
            operations_performed.append(f"'{col}': Cleaned numeric formatting in {affected_cells} cell(s) (pct={pct_label})")
            detailed_operations.append(DetailedCleaningOperation(
                operation="Numeric Cleaning",
                column=col,
                method=f"Clean numbers (strip symbols/commas, pct={pct_label})",
                rows_affected=affected_cells,
            ))

        # 13. Date Cleaning (Phase 2 - Feature 4)
        for dc in operations.date_cleanings:
            col = dc.column
            if col not in cleaned.columns and column_name_mapping and col in column_name_mapping:
                col = column_name_mapping[col]
            if col not in cleaned.columns:
                continue

            col_series = cleaned[col]
            if pd.api.types.is_numeric_dtype(col_series):
                num_s = pd.to_numeric(col_series, errors="coerce")
                if (num_s.dropna() < 1e8).all():
                    # Small numbers are IDs, amounts, or counts - parse as string so they fail rather than becoming 1970-01-01
                    parsed_dates = pd.to_datetime(col_series.astype(str), errors="coerce")
                else:
                    parsed_dates = pd.to_datetime(col_series, errors="coerce")
            else:
                try:
                    parsed_dates = pd.to_datetime(col_series.astype(str), errors="coerce", format="mixed")
                except (TypeError, ValueError):
                    parsed_dates = pd.to_datetime(col_series.astype(str), errors="coerce")
            valid_count = int(parsed_dates.notnull().sum())
            fmt = dc.output_format or "%Y-%m-%d"

            if fmt:
                formatted = parsed_dates.dt.strftime(fmt)
                if dc.handle_invalid == "coerce_na":
                    cleaned[col] = formatted
                else:
                    cleaned[col] = cleaned[col].where(parsed_dates.isnull(), formatted)
            else:
                cleaned[col] = parsed_dates

            operations_performed.append(f"'{col}': Standardized {valid_count} date value(s) to format '{fmt}'")
            detailed_operations.append(DetailedCleaningOperation(
                operation="Date Cleaning",
                column=col,
                method=f"Parse & Format ({fmt})",
                rows_affected=valid_count,
            ))

        # 14. Value Validation / Range Check (Phase 2 - Feature 5)
        for vv in operations.value_validations:
            col = vv.column
            if col not in cleaned.columns and column_name_mapping and col in column_name_mapping:
                col = column_name_mapping[col]
            if col not in cleaned.columns:
                continue

            num_s = pd.to_numeric(cleaned[col], errors="coerce")
            cond = pd.Series(False, index=cleaned.index)
            if vv.min_value is not None:
                cond = cond | (num_s < vv.min_value)
            if vv.max_value is not None:
                cond = cond | (num_s > vv.max_value)

            violating_count = int(cond.sum())
            if violating_count == 0:
                continue

            if vv.action == "set_missing":
                cleaned.loc[cond, col] = np.nan
                action_desc = "Set as Missing (NaN)"
            elif vv.action == "replace":
                rep_val = vv.replacement_value if vv.replacement_value is not None else 0
                cleaned.loc[cond, col] = rep_val
                action_desc = f"Replace with '{rep_val}'"
            elif vv.action == "remove_rows":
                before_len = len(cleaned)
                cleaned = cleaned.loc[~cond]
                violating_count = before_len - len(cleaned)
                action_desc = "Drop Violating Rows"
            else:
                action_desc = "Keep Unchanged"

            operations_performed.append(
                f"'{col}': Range validation [min={vv.min_value}, max={vv.max_value}] - {action_desc} on {violating_count} value(s)"
            )
            detailed_operations.append(DetailedCleaningOperation(
                operation="Invalid Value Detection",
                column=col,
                method=f"Range [{vv.min_value} to {vv.max_value}] -> {action_desc}",
                rows_affected=violating_count,
            ))

        # 15. Simple Rule Builder (Phase 2 - Feature 9)
        for rule in operations.cleaning_rules:
            col = rule.column
            if col not in cleaned.columns and column_name_mapping and col in column_name_mapping:
                col = column_name_mapping[col]
            if col not in cleaned.columns:
                continue

            cond = rule.condition.strip().lower()
            c_val = rule.condition_value
            action = rule.action.strip().lower()
            a_val = rule.action_value
            affected = 0

            if cond == "less_than":
                num_s = pd.to_numeric(cleaned[col], errors="coerce")
                mask = num_s < float(c_val)
            elif cond == "greater_than":
                num_s = pd.to_numeric(cleaned[col], errors="coerce")
                mask = num_s > float(c_val)
            elif cond == "is_negative":
                num_s = pd.to_numeric(cleaned[col], errors="coerce")
                mask = num_s < 0
            elif cond == "equals":
                mask = cleaned[col].astype(str).str.strip() == str(c_val).strip()
            elif cond == "contains":
                mask = cleaned[col].astype(str).str.contains(re.escape(str(c_val)), regex=True, na=False)
            elif cond == "is_empty":
                mask = cleaned[col].isnull() | (cleaned[col].astype(str).str.strip() == "")
            else:
                continue

            affected = int(mask.sum())
            if affected > 0:
                if action == "set_missing":
                    cleaned.loc[mask, col] = np.nan
                elif action == "remove_rows":
                    before_len = len(cleaned)
                    cleaned = cleaned.loc[~mask]
                    affected = before_len - len(cleaned)
                elif action == "replace":
                    rep = np.nan if a_val in [None, "NaN", "null"] else a_val
                    cleaned.loc[mask, col] = rep
                elif action == "strip_char":
                    char_to_strip = a_val or ""
                    cleaned[col] = cleaned[col].apply(
                        lambda v: str(v).replace(char_to_strip, "") if pd.notnull(v) else v
                    )

                operations_performed.append(f"'{col}': Rule applied [{cond} '{c_val or ''}' -> {action} '{a_val or ''}'] on {affected} row(s)")
                detailed_operations.append(DetailedCleaningOperation(
                    operation="Cleaning Rule",
                    column=col,
                    method=f"{cond} -> {action}",
                    rows_affected=affected,
                ))

        # 16. Outlier Detection & Treatment (Phase 3 & Phase 4)
        for oc in operations.outlier_cleanings:
            col = oc.column
            if col not in cleaned.columns and column_name_mapping and col in column_name_mapping:
                col = column_name_mapping[col]
            if col not in cleaned.columns:
                continue

            num_s = pd.to_numeric(cleaned[col], errors="coerce")
            valid_vals = num_s.dropna()
            if len(valid_vals) < 4:
                continue

            method = (oc.method or "iqr").strip().lower()
            if method == "zscore":
                mean_val = float(valid_vals.mean())
                std_val = float(valid_vals.std(ddof=0))
                if std_val == 0 or np.isnan(std_val):
                    continue
                mult = float(oc.multiplier) if oc.multiplier > 0 else 3.0
                lower_b = mean_val - mult * std_val
                upper_b = mean_val + mult * std_val
            else:  # IQR
                q1 = float(valid_vals.quantile(0.25))
                q3 = float(valid_vals.quantile(0.75))
                iqr = q3 - q1
                mult = float(oc.multiplier) if oc.multiplier > 0 else 1.5
                lower_b = q1 - mult * iqr
                upper_b = q3 + mult * iqr

            outlier_mask = (num_s < lower_b) | (num_s > upper_b)
            outlier_count = int(outlier_mask.sum())
            if outlier_count == 0:
                continue

            act = (oc.action or "cap").strip().lower()
            if act == "remove":
                cleaned = cleaned[~outlier_mask].reset_index(drop=True)
                desc = f"Removed {outlier_count} outlier row(s) [bounds: {round(lower_b,2)} to {round(upper_b,2)}]"
            elif act == "cap":
                cleaned[col] = num_s.clip(lower=lower_b, upper=upper_b)
                desc = f"Capped {outlier_count} outlier value(s) to [{round(lower_b,2)}, {round(upper_b,2)}]"
            elif act == "median":
                med = float(valid_vals.median())
                cleaned[col] = num_s.where(~outlier_mask, med)
                desc = f"Replaced {outlier_count} outlier value(s) with Median ({round(med,2)})"
            elif act == "mean":
                mean_v = float(valid_vals.mean())
                cleaned[col] = num_s.where(~outlier_mask, mean_v)
                desc = f"Replaced {outlier_count} outlier value(s) with Mean ({round(mean_v,2)})"
            else:
                desc = f"Flagged {outlier_count} outlier value(s)"

            operations_performed.append(f"'{col}': {desc}")
            detailed_operations.append(DetailedCleaningOperation(
                operation="Outlier Treatment",
                column=col,
                method=f"{method.upper()} ({act.title()})",
                rows_affected=outlier_count,
            ))

        return cleaned, operations_performed, type_changes, detailed_operations, blank_cells_converted, column_names_changed, column_name_mapping

    @classmethod
    def _compute_cell_diffs(cls, before_df: pd.DataFrame, cleaned_df: pd.DataFrame) -> Tuple[List[CellDiffItem], int]:
        """Identify cell-level before vs after differences between two DataFrames."""
        cell_diffs: List[CellDiffItem] = []
        total_cells_changed = 0

        common_cols = [c for c in before_df.columns if c in cleaned_df.columns]
        common_indices = before_df.index.intersection(cleaned_df.index)

        for c in common_cols:
            s_before = before_df.loc[common_indices, c]
            s_after = cleaned_df.loc[common_indices, c]

            both_nan = s_before.isna() & s_after.isna()
            diff_mask = (s_before.astype(str) != s_after.astype(str)) & ~both_nan

            diff_indices = diff_mask[diff_mask].index
            diff_count = len(diff_indices)
            total_cells_changed += diff_count

            for idx in diff_indices:
                if len(cell_diffs) >= 40:
                    break
                try:
                    if isinstance(idx, (int, np.integer)):
                        row_num = int(idx)
                    elif str(idx).isdigit():
                        row_num = int(idx)
                    else:
                        loc = before_df.index.get_loc(idx)
                        row_num = int(loc) if isinstance(loc, (int, np.integer)) else int(loc[0])
                except Exception:
                    row_num = 0

                b_val = s_before.at[idx]
                a_val = s_after.at[idx]
                cell_diffs.append(CellDiffItem(
                    row_index=row_num,
                    column=str(c),
                    before_value=None if pd.isna(b_val) else str(b_val),
                    after_value=None if pd.isna(a_val) else str(a_val),
                ))

        return cell_diffs, total_cells_changed

    @classmethod
    def preview_cleaning(
        cls,
        dataset: Dataset,
        operations: CleaningOperationsRequest,
    ) -> CleaningPreviewResponse:
        """Compute dry-run transformation metrics without touching disk files."""
        ops_json = operations.model_dump_json() if hasattr(operations, "model_dump_json") else json.dumps(operations.model_dump(), sort_keys=True)
        ops_hash = hashlib.sha256(ops_json.encode()).hexdigest()[:16]
        cache_key = f"{cls._get_cache_key(dataset, active=True)}_preview_{ops_hash}"
        if cache_key in cls._analysis_cache:
            return cls._analysis_cache[cache_key]

        before_df = cls._get_dataframe(dataset, active=True)
        before_metrics = cls.calculate_metrics(before_df)

        cleaned_df, ops, type_changes, detailed_ops, blank_conv, col_changed, col_mapping = cls.execute_cleaning_pipeline(before_df, operations)
        after_metrics = cls.calculate_metrics(cleaned_df)

        rows_removed = before_metrics.total_rows - after_metrics.total_rows
        cols_removed = before_metrics.total_columns - after_metrics.total_columns
        missing_delta = before_metrics.missing_cells - after_metrics.missing_cells
        dup_delta = before_metrics.duplicate_rows - after_metrics.duplicate_rows

        cell_diffs, total_cells_changed = cls._compute_cell_diffs(before_df, cleaned_df)

        sample_preview = cls._sanitize_for_json(cleaned_df.head(10).to_dict(orient="records"))
        sample_cols = [str(c) for c in cleaned_df.columns]

        preview_res = CleaningPreviewResponse(
            dataset_id=dataset.id,
            filename=dataset.filename,
            before=before_metrics,
            after=after_metrics,
            rows_removed=rows_removed,
            columns_removed=cols_removed,
            missing_cells_delta=missing_delta,
            duplicate_rows_delta=dup_delta,
            blank_cells_converted=blank_conv,
            column_names_changed=col_changed,
            column_name_mapping=col_mapping,
            operations_summary=ops if ops else ["No cleaning operations requested."],
            detailed_operations=detailed_ops,
            type_changes=type_changes,
            sample_preview=sample_preview,
            sample_columns=sample_cols,
            cell_diffs=cell_diffs,
            total_cells_changed=total_cells_changed,
        )
        if len(cls._analysis_cache) >= cls._CACHE_MAX_ENTRIES:
            cls._analysis_cache.pop(next(iter(cls._analysis_cache)))
        cls._analysis_cache[cache_key] = preview_res
        return preview_res

    @classmethod
    def apply_cleaning(
        cls,
        dataset: Dataset,
        operations: CleaningOperationsRequest,
        current_user: User,
        db: Session,
    ) -> CleaningApplyResponse:
        """Execute cleaning pipeline, save versioned cleaned file, update DB, and log audit history."""
        orig_path = Path(dataset.file_path)
        if not orig_path.exists() or not orig_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Original dataset file '{dataset.filename}' not found on storage disk.",
            )

        orig_df = cls._get_dataframe(dataset, active=False)
        before_df = cls._get_dataframe(dataset, active=True)
        before_metrics = cls.calculate_metrics(before_df)

        cleaned_df, ops, _, detailed_ops, _, _, _ = cls.execute_cleaning_pipeline(before_df, operations)
        after_metrics = cls.calculate_metrics(cleaned_df)

        if not ops:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No cleaning operations were selected to apply.",
            )

        _, total_cells_changed = cls._compute_cell_diffs(before_df, cleaned_df)

        # Establish isolated user output directory for cleaned artifact
        user_dir = settings.UPLOAD_DIR / f"user_{current_user.id}"
        user_dir.mkdir(parents=True, exist_ok=True)

        base_stem = Path(dataset.stored_filename or dataset.filename).stem
        existing_history_count = (
            db.query(AnalysisHistory)
            .filter(
                AnalysisHistory.dataset_id == dataset.id,
                AnalysisHistory.analysis_type == "cleaning",
            )
            .count()
        )
        version_num = existing_history_count + 1
        version_tag = f"Cleaned v{version_num}"
        versioned_filename = f"cleaned_{base_stem}_v{version_num}.csv"
        versioned_path = user_dir / versioned_filename
        cleaned_filename = f"cleaned_{base_stem}.csv"
        cleaned_path = user_dir / cleaned_filename

        # Save both version-stamped snapshot and latest active CSV
        cleaned_df.to_csv(versioned_path, index=False, encoding="utf-8")
        cleaned_df.to_csv(cleaned_path, index=False, encoding="utf-8")

        # Update dataset model pointing to cleaned version (Original strictly untouched!)
        dataset.cleaned_file_path = str(cleaned_path)
        dataset.has_cleaned = True

        rows_removed = before_metrics.total_rows - after_metrics.total_rows
        cols_removed = before_metrics.total_columns - after_metrics.total_columns

        now_str = datetime.now(timezone.utc).isoformat()
        detailed_ops_dicts = []
        for dop in detailed_ops:
            dop_dict = dop.model_dump() if hasattr(dop, "model_dump") else dop.dict()
            dop_dict["date"] = now_str
            detailed_ops_dicts.append(dop_dict)

        # Automatic post-cleaning validation & quality score measured against baseline original
        score, deductions, c_status, s_status, comp_scores = cls.calculate_cleaning_score(cleaned_df, dataset, before_df=orig_df)
        val_report = cls._run_validation_comparison(dataset, orig_df, cleaned_df)

        # Record in AnalysisHistory audit log
        history_entry = AnalysisHistory(
            user_id=current_user.id,
            dataset_id=dataset.id,
            dataset_name=dataset.filename,
            query="Data Cleaning Execution",
            analysis_type="cleaning",
            result_json=json.dumps({
                "version": version_tag,
                "version_number": version_num,
                "version_file": str(versioned_path),
                "quality_score": score,
                "score_status": s_status,
                "component_scores": comp_scores,
                "score_deductions": deductions,
                "cleaning_status": c_status,
                "validation_report": val_report.model_dump(),
                "operations_performed": ops,
                "detailed_operations": detailed_ops_dicts,
                "before_rows": before_metrics.total_rows,
                "after_rows": after_metrics.total_rows,
                "before_missing": before_metrics.missing_cells,
                "after_missing": after_metrics.missing_cells,
                "before_duplicates": before_metrics.duplicate_rows,
                "after_duplicates": after_metrics.duplicate_rows,
                "cleaned_file": cleaned_filename,
                "cells_affected": total_cells_changed,
            }),
            status="completed",
        )
        try:
            db.add(history_entry)
            db.commit()
            db.refresh(dataset)
            db.refresh(history_entry)
            cls.clear_cache_for_dataset(dataset.id)
        except Exception as e:
            db.rollback()
            if versioned_path.exists():
                try:
                    versioned_path.unlink()
                except Exception:
                    pass
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to persist dataset cleaning version: {str(e)}",
            )

        return CleaningApplyResponse(
            success=True,
            message=f"Dataset '{dataset.filename}' cleaned successfully. {len(ops)} operation(s) applied ({version_tag}).",
            dataset_id=dataset.id,
            original_filename=dataset.filename,
            cleaned_filename=cleaned_filename,
            before=before_metrics,
            after=after_metrics,
            rows_removed=rows_removed,
            columns_removed=cols_removed,
            operations_performed=ops,
            detailed_operations=detailed_ops,
            applied_at=now_str,
            history_id=history_entry.id,
            rows_affected=rows_removed + min(total_cells_changed, len(cleaned_df)),
            cells_affected=total_cells_changed,
            columns_affected=cols_removed,
            values_changed=total_cells_changed,
            invalid_values_remaining=0,
            missing_values_remaining=after_metrics.missing_cells,
            duplicate_rows_remaining=after_metrics.duplicate_rows,
            version=version_tag,
            quality_score=score,
            validation_report=val_report.model_dump(),
        )

    @classmethod
    def get_cleaning_history(cls, dataset: Dataset, db: Session) -> List[CleaningHistoryItem]:
        """Fetch audit log history of cleaning runs performed for this dataset."""
        records = (
            db.query(AnalysisHistory)
            .filter(
                AnalysisHistory.dataset_id == dataset.id,
                AnalysisHistory.analysis_type == "cleaning",
            )
            .order_by(AnalysisHistory.created_at.desc())
            .all()
        )

        history_items: List[CleaningHistoryItem] = []
        for r in records:
            try:
                data = json.loads(r.result_json) if r.result_json else {}
                raw_detailed = data.get("detailed_operations", [])
                parsed_detailed = []
                for dop in raw_detailed:
                    try:
                        parsed_detailed.append(DetailedCleaningOperation(**dop))
                    except Exception:
                        pass

                history_items.append(
                    CleaningHistoryItem(
                        id=r.id,
                        dataset_id=dataset.id,
                        dataset_name=dataset.filename,
                        operations_performed=data.get("operations_performed", []),
                        detailed_operations=parsed_detailed,
                        before_rows=data.get("before_rows", 0),
                        after_rows=data.get("after_rows", 0),
                        before_missing=data.get("before_missing", 0),
                        after_missing=data.get("after_missing", 0),
                        applied_at=r.created_at,
                    )
                )
            except Exception:
                continue

        return history_items

    @classmethod
    def reset_cleaning(cls, dataset: Dataset, db: Session):
        """Reset cleaned dataset state back to original without affecting original file."""
        if dataset.cleaned_file_path:
            p = Path(dataset.cleaned_file_path)
            if p.exists() and p.is_file():
                try:
                    p.unlink(missing_ok=True)
                except Exception:
                    pass
        dataset.cleaned_file_path = None
        dataset.has_cleaned = False
        db.commit()
        cls.clear_cache_for_dataset(dataset.id)

    # -------------------------------------------------------------------------
    # PHASE 2: INSPECTION ENDPOINTS
    # -------------------------------------------------------------------------

    @classmethod
    def get_column_value_summary(cls, dataset: Dataset, column: str) -> ColumnValueSummaryResponse:
        """Inspect unique values, frequencies, and percentages for a specific column."""
        df = cls._get_dataframe(dataset, active=True)
        if column not in df.columns:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Column '{column}' not found in dataset.")

        total_rows = len(df)
        missing_count = int(df[column].isnull().sum())
        unique_count = int(df[column].dropna().nunique())

        vc = df[column].value_counts(dropna=False)
        items: List[ValueFrequencyItem] = []
        for val, count in vc.items():
            val_str = None if pd.isna(val) else str(val)
            pct = round((count / total_rows * 100), 2) if total_rows > 0 else 0.0
            items.append(ValueFrequencyItem(value=val_str, count=int(count), percentage=pct))
            if len(items) >= 100:
                break

        return ColumnValueSummaryResponse(
            column=column,
            total_rows=total_rows,
            unique_count=unique_count,
            missing_count=missing_count,
            values=items,
        )

    @classmethod
    def detect_category_clusters(cls, dataset: Dataset, column: str) -> CategoryInconsistenciesResponse:
        """Identify potentially equivalent categories and inconsistent clusters (e.g. Male vs male vs M)."""
        df = cls._get_dataframe(dataset, active=True)
        if column not in df.columns:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Column '{column}' not found in dataset.")

        non_null = df[column].dropna().astype(str)
        counts = non_null.value_counts()

        # Group by normalized lowercase representation
        norm_groups: Dict[str, List[Tuple[str, int]]] = {}
        for raw_val, count in counts.items():
            k = re.sub(r'\s+', ' ', raw_val.strip().lower())
            norm_groups.setdefault(k, []).append((raw_val, int(count)))

        # Also link single-letter abbreviations to longer words (e.g. 'm' -> 'male', 'f' -> 'female')
        single_letters = {k: v for k, v in norm_groups.items() if len(k) == 1}
        longer_words = {k: v for k, v in norm_groups.items() if len(k) > 1}

        merged_groups = dict(norm_groups)
        for sl_key, sl_variants in single_letters.items():
            matching_longer = [lw_key for lw_key in longer_words.keys() if lw_key.startswith(sl_key)]
            if len(matching_longer) == 1:
                target_key = matching_longer[0]
                merged_groups[target_key] = merged_groups[target_key] + sl_variants
                if sl_key in merged_groups:
                    del merged_groups[sl_key]

        clusters: List[CategoryCluster] = []
        for grp_key, variants_list in merged_groups.items():
            if len(variants_list) > 1:
                variants_list.sort(key=lambda x: x[1], reverse=True)
                suggested = variants_list[0][0]
                clusters.append(CategoryCluster(
                    group_key=grp_key,
                    variants=[CategoryVariant(value=v, count=c) for v, c in variants_list],
                    suggested_target=suggested,
                ))

        return CategoryInconsistenciesResponse(column=column, clusters=clusters)

    @classmethod
    def inspect_date_column(cls, dataset: Dataset, column: str) -> DateInspectionResponse:
        """Inspect date parsing, valid vs invalid counts, and detected format."""
        df = cls._get_dataframe(dataset, active=True)
        if column not in df.columns:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Column '{column}' not found in dataset.")

        raw_dtype = str(df[column].dtype)
        non_null = df[column].dropna().astype(str)
        total_rows = len(df)

        try:
            parsed = pd.to_datetime(non_null, errors="coerce", format="mixed")
        except (TypeError, ValueError):
            parsed = pd.to_datetime(non_null, errors="coerce")
        valid_count = int(parsed.notnull().sum())
        invalid_count = len(non_null) - valid_count

        detected_fmt = "YYYY-MM-DD"
        if not non_null.empty:
            sample = non_null.iloc[0]
            if "/" in sample:
                detected_fmt = "DD/MM/YYYY or MM/DD/YYYY"
            elif "-" in sample:
                detected_fmt = "YYYY-MM-DD"
            elif "," in sample:
                detected_fmt = "Month DD, YYYY"

        sample_parsed = []
        for idx in parsed[parsed.notnull()].index[:5]:
            sample_parsed.append({
                "original": str(df[column].at[idx]),
                "parsed": parsed.at[idx].strftime("%Y-%m-%d"),
            })

        return DateInspectionResponse(
            column=column,
            current_datatype=raw_dtype,
            detected_format=detected_fmt,
            parsed_count=valid_count,
            invalid_count=invalid_count,
            total_rows=total_rows,
            sample_parsed=sample_parsed,
        )

    # =========================================================================
    # Phase 4: Professional Cleaning Workflow, Validation, Score, & Report
    # =========================================================================

    @classmethod
    def _detect_outliers_count(cls, df: pd.DataFrame) -> Tuple[int, Dict[str, int]]:
        """Identify statistical outliers across all numeric columns using IQR."""
        total_outliers = 0
        col_outliers: Dict[str, int] = {}
        for col in df.columns:
            if pd.api.types.is_numeric_dtype(df[col]):
                num_s = pd.to_numeric(df[col], errors="coerce").dropna()
                if len(num_s) >= 4:
                    q1 = float(num_s.quantile(0.25))
                    q3 = float(num_s.quantile(0.75))
                    iqr = q3 - q1
                    if iqr > 0:
                        lower_bound = q1 - 1.5 * iqr
                        upper_bound = q3 + 1.5 * iqr
                        outlier_mask = (num_s < lower_bound) | (num_s > upper_bound)
                        cnt = int(outlier_mask.sum())
                        if cnt > 0:
                            col_outliers[col] = cnt
                            total_outliers += cnt
        return total_outliers, col_outliers

    @classmethod
    def _is_candidate_date_column(cls, col_name: str, series: pd.Series) -> bool:
        """Narrowly determine if a column is intended to represent dates, avoiding false positives on numeric IDs/amounts."""
        if pd.api.types.is_datetime64_any_dtype(series):
            return True
        if pd.api.types.is_numeric_dtype(series) or pd.api.types.is_bool_dtype(series):
            return False

        col_l = str(col_name).lower().strip()
        # Explicit non-date patterns (IDs, amounts, counts, prices, etc.)
        non_date_terms = ["_id", "id", "amount", "price", "quantity", "qty", "count", "cost", "total", "rate", "salary"]
        if any(term == col_l or col_l.endswith(f"_{term}") or col_l.endswith(f" {term}") or col_l.startswith(f"{term}_") for term in non_date_terms):
            if "date" not in col_l and "time" not in col_l:
                return False

        date_indicators = ["date", "time", "timestamp", "datetime", "dob", "birth", "joining", "hired", "expiry"]
        has_date_term = any(ind in col_l for ind in date_indicators)
        if not has_date_term:
            return False

        # Verify a non-empty sample is at least partially date parseable
        non_null_d = series.dropna().astype(str).str.strip()
        non_null_d = non_null_d[non_null_d != ""].head(30)
        if len(non_null_d) == 0:
            return False
        try:
            parsed = pd.to_datetime(non_null_d, errors="coerce")
            return bool((parsed.notnull().sum() / len(non_null_d)) >= 0.25)
        except Exception:
            return False

    @classmethod
    def _compute_hygiene_metrics(cls, df: pd.DataFrame, dataset: Optional[Dataset] = None) -> Dict[str, Any]:
        """Compute exact issue counts for the 6 scoring metrics and secondary checks."""
        # 1. Missing Values: null/NaN cells
        missing_count = int(df.isnull().sum().sum())
        missing_cols = [str(c) for c in df.columns if df[c].isnull().sum() > 0]

        # 2. Duplicate Rows: complete duplicate row count
        duplicate_count = int(df.duplicated().sum())

        # 3. Blank / Whitespace Values: empty strings or whitespace-only strings (exclude actual NaN)
        blank_count = 0
        blank_cols = []
        for col in df.columns:
            if df[col].dtype == object:
                mask = df[col].notnull() & df[col].astype(str).str.strip().eq("")
                cnt = int(mask.sum())
                if cnt > 0:
                    blank_count += cnt
                    blank_cols.append(str(col))

        # 4. Invalid Values: violations of validation rules or numeric conversion failures
        invalid_count = 0
        invalid_cols = []
        for col in df.columns:
            if df[col].dtype == object:
                non_null = df[col].dropna()
                if len(non_null) > 0:
                    s_str = non_null.astype(str)
                    has_curr_or_comma = int(s_str.str.contains(r'[$₹€£¥%]|,\d{3}', regex=True).sum())
                    parsed = pd.to_numeric(s_str.str.replace(r'[$₹€£¥%,\s]', '', regex=True), errors='coerce')
                    failed_unparseable = int(parsed.isnull().sum())
                    # If column looks numeric or formatted numeric
                    if (failed_unparseable > 0 and int(parsed.notnull().sum()) >= 0.5 * len(non_null)) or has_curr_or_comma > 0:
                        count_inv = int(failed_unparseable + has_curr_or_comma)
                        invalid_count += count_inv
                        invalid_cols.append(str(col))

        # 5. Invalid Dates: values in date columns that cannot be parsed as dates
        invalid_dates_count = 0
        invalid_date_cols = []
        for col in df.columns:
            if cls._is_candidate_date_column(str(col), df[col]):
                non_null_d = df[col].dropna().astype(str).str.strip()
                non_null_d = non_null_d[non_null_d != ""]
                if len(non_null_d) > 0:
                    try:
                        p = pd.to_datetime(non_null_d, errors="coerce", format="mixed")
                    except Exception:
                        p = pd.to_datetime(non_null_d, errors="coerce")
                    fails = int(p.isnull().sum())
                    if fails > 0:
                        invalid_dates_count += fails
                        invalid_date_cols.append(str(col))

        # 6. Outliers: statistical outliers across numeric columns
        outliers_count, outlier_cols_dict = cls._detect_outliers_count(df)

        return {
            "missing_values": int(missing_count),
            "missing_cols": [str(c) for c in missing_cols],
            "duplicate_rows": int(duplicate_count),
            "blank_values": int(blank_count),
            "blank_cols": [str(c) for c in blank_cols],
            "invalid_values": int(invalid_count),
            "invalid_cols": [str(c) for c in invalid_cols],
            "invalid_dates": int(invalid_dates_count),
            "invalid_date_cols": [str(c) for c in invalid_date_cols],
            "outliers": int(outliers_count),
            "outlier_cols": {str(k): int(v) for k, v in outlier_cols_dict.items()},
        }

    @classmethod
    def calculate_cleaning_score(
        cls,
        df: pd.DataFrame,
        dataset: Dataset,
        before_df: Optional[pd.DataFrame] = None
    ) -> Tuple[int, List[str], str, str, Dict[str, float]]:
        """
        Compute deterministic 0-100 Cleaning Score comparing remaining issues against baseline.
        Weights:
          Missing Values: 25
          Duplicate Rows: 20
          Blank Values: 10
          Invalid Values: 15
          Invalid Dates: 10
          Outliers: 20
        Formula:
          Component Score = Weight * (1 - Remaining Issues / Initial Issues)
          If Initial Issues = 0 -> full weight
          If Remaining Issues >= Initial Issues -> 0
        Status:
          90-100: CLEAN
          75-89: GOOD
          50-74: NEEDS REVIEW
          0-49: CRITICAL
        """
        if before_df is None:
            if dataset.has_cleaned and dataset.file_path:
                try:
                    before_df = cls._get_dataframe(dataset, active=False)
                except Exception:
                    before_df = df
            else:
                before_df = df

        initial_issues = cls._compute_hygiene_metrics(before_df, dataset)
        remaining_issues = cls._compute_hygiene_metrics(df, dataset)

        weights = {
            "missing_values": 25,
            "duplicate_rows": 20,
            "blank_values": 10,
            "invalid_values": 15,
            "invalid_dates": 10,
            "outliers": 20,
        }

        component_scores: Dict[str, float] = {}
        unresolved: List[str] = []

        for metric, weight in weights.items():
            init = int(initial_issues[metric])
            rem = int(remaining_issues[metric])

            if init == 0:
                if rem == 0:
                    comp_score = float(weight)
                else:
                    comp_score = 0.0
            elif rem >= init:
                comp_score = 0.0
            else:
                comp_score = float(weight) * (1.0 - (float(rem) / float(init)))

            comp_score = max(0.0, min(float(weight), comp_score))
            component_scores[metric] = round(float(comp_score), 2)

            if rem > 0:
                name_human = metric.replace("_", " ").title()
                unresolved.append(f"{rem} unresolved {name_human.lower()} issue(s) remaining.")

        final_score = int(round(sum(component_scores.values())))
        final_score = max(0, min(100, final_score))

        # Status categorization (Part B)
        if final_score >= 90:
            score_status = "CLEAN"
        elif final_score >= 75:
            score_status = "GOOD"
        elif final_score >= 50:
            score_status = "NEEDS REVIEW"
        else:
            score_status = "CRITICAL"

        # Cleaning status label
        if not dataset.has_cleaned:
            cleaning_status = "Not Cleaned"
        else:
            if score_status == "CLEAN":
                cleaning_status = "Cleaned"
            elif score_status == "GOOD":
                cleaning_status = "Partially Cleaned"
            else:
                cleaning_status = "Needs Review"

        return final_score, unresolved, cleaning_status, score_status, component_scores

    @classmethod
    def _run_validation_comparison(
        cls,
        dataset: Dataset,
        before_df: pd.DataFrame,
        after_df: pd.DataFrame,
    ) -> CleaningValidationReport:
        """Run 8 comprehensive hygiene checks comparing Before vs After cleaning states."""
        score, deductions, c_status, score_status, comp_scores = cls.calculate_cleaning_score(
            after_df, dataset, before_df=before_df
        )

        initial_issues = cls._compute_hygiene_metrics(before_df, dataset)
        remaining_issues = cls._compute_hygiene_metrics(after_df, dataset)

        checks: List[CleaningValidationItem] = []

        # 1. Missing Values (Weight: 25)
        b_miss = int(initial_issues["missing_values"])
        a_miss = int(remaining_issues["missing_values"])
        miss_status = "Resolved" if a_miss == 0 else ("Improved" if a_miss < b_miss else ("Good" if b_miss == 0 else "Requires Review"))
        checks.append(CleaningValidationItem(
            check_name="Missing Values",
            before_value=b_miss,
            after_value=a_miss,
            status=miss_status,
            details=f"{b_miss} -> {a_miss} missing cell(s)",
            weight=25,
            remaining_issues=a_miss,
            component_score=float(comp_scores.get("missing_values", 0.0)),
        ))

        # 2. Duplicate Rows (Weight: 20)
        b_dups = int(initial_issues["duplicate_rows"])
        a_dups = int(remaining_issues["duplicate_rows"])
        dup_status = "Resolved" if a_dups == 0 else ("Improved" if a_dups < b_dups else ("Good" if b_dups == 0 else "Requires Review"))
        checks.append(CleaningValidationItem(
            check_name="Duplicate Rows",
            before_value=b_dups,
            after_value=a_dups,
            status=dup_status,
            details=f"{b_dups} -> {a_dups} duplicate row(s)",
            weight=20,
            remaining_issues=a_dups,
            component_score=float(comp_scores.get("duplicate_rows", 0.0)),
        ))

        # 3. Blank Values (Weight: 10)
        b_blanks = int(initial_issues["blank_values"])
        a_blanks = int(remaining_issues["blank_values"])
        blank_status = "Resolved" if a_blanks == 0 else ("Improved" if a_blanks < b_blanks else ("Good" if b_blanks == 0 else "Requires Review"))
        checks.append(CleaningValidationItem(
            check_name="Blank Values",
            before_value=b_blanks,
            after_value=a_blanks,
            status=blank_status,
            details=f"{b_blanks} -> {a_blanks} blank/empty string(s)",
            weight=10,
            remaining_issues=a_blanks,
            component_score=float(comp_scores.get("blank_values", 0.0)),
        ))

        # 4. Invalid Datatype Conversions
        b_mixed = int(sum(1 for col in before_df.columns if before_df[col].dtype == object and len(before_df[col].dropna()) > 0 and pd.to_numeric(before_df[col].dropna().astype(str).str.replace(r'[$₹€£,\s]', '', regex=True), errors='coerce').notnull().sum() >= 0.8 * len(before_df[col].dropna())))
        a_mixed = int(sum(1 for col in after_df.columns if after_df[col].dtype == object and len(after_df[col].dropna()) > 0 and pd.to_numeric(after_df[col].dropna().astype(str).str.replace(r'[$₹€£,\s]', '', regex=True), errors='coerce').notnull().sum() >= 0.8 * len(after_df[col].dropna())))
        dtype_status = "Resolved" if a_mixed == 0 else ("Improved" if a_mixed < b_mixed else "Good")
        checks.append(CleaningValidationItem(
            check_name="Invalid Datatype Conversions",
            before_value=b_mixed,
            after_value=a_mixed,
            status=dtype_status,
            details=f"{b_mixed} -> {a_mixed} potential mixed/numeric column(s)",
            weight=0,
            remaining_issues=a_mixed,
            component_score=0.0,
        ))

        # 5. Invalid Values (Weight: 15)
        b_invalid = int(initial_issues["invalid_values"])
        a_invalid = int(remaining_issues["invalid_values"])
        inv_status = "Resolved" if a_invalid == 0 else ("Improved" if a_invalid < b_invalid else ("Good" if b_invalid == 0 else "Requires Review"))
        checks.append(CleaningValidationItem(
            check_name="Invalid Values",
            before_value=b_invalid,
            after_value=a_invalid,
            status=inv_status,
            details=f"{b_invalid} -> {a_invalid} invalid or non-numeric formatted value(s)",
            weight=15,
            remaining_issues=a_invalid,
            component_score=float(comp_scores.get("invalid_values", 0.0)),
        ))

        # 6. Invalid Dates (Weight: 10)
        b_date_err = int(initial_issues["invalid_dates"])
        a_date_err = int(remaining_issues["invalid_dates"])
        date_status = "Resolved" if a_date_err == 0 else ("Improved" if a_date_err < b_date_err else ("Good" if b_date_err == 0 else "Requires Review"))
        checks.append(CleaningValidationItem(
            check_name="Invalid Dates",
            before_value=b_date_err,
            after_value=a_date_err,
            status=date_status,
            details=f"{b_date_err} -> {a_date_err} unparseable date cell(s)",
            weight=10,
            remaining_issues=a_date_err,
            component_score=float(comp_scores.get("invalid_dates", 0.0)),
        ))

        # 7. Remaining Outliers (Weight: 20)
        b_out = int(initial_issues["outliers"])
        a_out = int(remaining_issues["outliers"])
        out_status = "Resolved" if a_out == 0 else ("Improved" if a_out < b_out else ("Good" if b_out == 0 else "Requires Review"))
        checks.append(CleaningValidationItem(
            check_name="Remaining Outliers",
            before_value=b_out,
            after_value=a_out,
            status=out_status,
            details=f"{b_out} -> {a_out} statistical outlier(s)",
            weight=20,
            remaining_issues=a_out,
            component_score=float(comp_scores.get("outliers", 0.0)),
        ))

        # 8. Column Name Issues
        b_col_issues = int(sum(1 for c in before_df.columns if " " in str(c) or any(ch in str(c) for ch in "@#$%^&*()+=!")))
        a_col_issues = int(sum(1 for c in after_df.columns if " " in str(c) or any(ch in str(c) for ch in "@#$%^&*()+=!")))
        col_status = "Resolved" if a_col_issues == 0 else ("Good" if b_col_issues == 0 else "Requires Review")
        checks.append(CleaningValidationItem(
            check_name="Column Name Issues",
            before_value=b_col_issues,
            after_value=a_col_issues,
            status=col_status,
            details=f"{b_col_issues} -> {a_col_issues} non-standard column name(s)",
            weight=0,
            remaining_issues=a_col_issues,
            component_score=0.0,
        ))

        total_b = int(sum(int(c.before_value) for c in checks if isinstance(c.before_value, (int, np.integer))))
        total_a = int(sum(int(c.after_value) for c in checks if isinstance(c.after_value, (int, np.integer))))

        return CleaningValidationReport(
            dataset_id=int(dataset.id),
            dataset_name=str(dataset.filename),
            checks=checks,
            total_issues_before=int(total_b),
            total_issues_after=int(total_a),
            overall_status=str(c_status),
            cleaning_score=int(score),
            score_status=str(score_status),
            unresolved_issues=[str(u) for u in deductions],
        )

    @classmethod
    def get_dashboard_summary(cls, dataset: Dataset, db: Session) -> CleaningDashboardSummaryResponse:
        """Provide compact summary with cleaning score, issue counts, and status."""
        cache_key = f"{cls._get_cache_key(dataset, active=True)}_dashboard_summary"
        if cache_key in cls._analysis_cache:
            return cls._analysis_cache[cache_key]

        df = cls._get_dataframe(dataset, active=True)
        total_rows = len(df)
        total_cols = len(df.columns)
        total_cells = max(1, total_rows * total_cols)

        missing_cells = int(df.isnull().sum().sum())
        missing_pct = round((missing_cells / total_cells) * 100, 2)

        duplicate_rows = int(df.duplicated().sum())
        dup_pct = round((duplicate_rows / max(1, total_rows)) * 100, 2)

        blank_cells = sum(int(df[c].astype(str).str.strip().eq("").sum()) for c in df.columns if df[c].dtype == object)

        num_cols = sum(1 for c in df.columns if pd.api.types.is_numeric_dtype(df[c]))
        date_cols = sum(1 for c in df.columns if any(t in c.lower() for t in ["date", "time", "year"]))
        cat_cols = max(0, total_cols - num_cols - date_cols)

        outliers_detected, _ = cls._detect_outliers_count(df)

        last_history = (
            db.query(AnalysisHistory)
            .filter(
                AnalysisHistory.dataset_id == dataset.id,
                AnalysisHistory.analysis_type == "cleaning",
            )
            .order_by(AnalysisHistory.created_at.desc())
            .first()
        )

        history_count = (
            db.query(AnalysisHistory)
            .filter(
                AnalysisHistory.dataset_id == dataset.id,
                AnalysisHistory.analysis_type == "cleaning",
            )
            .count()
        )

        if dataset.has_cleaned:
            curr_version = f"Cleaned v{history_count}" if history_count > 0 else "Cleaned v1"
        else:
            curr_version = "Original"

        last_op = None
        last_updated = dataset.updated_at.isoformat() if dataset.updated_at else None
        if last_history:
            last_updated = last_history.created_at.isoformat()
            try:
                hist_data = json.loads(last_history.result_json) if last_history.result_json else {}
                ops = hist_data.get("operations_performed", [])
                if ops:
                    last_op = ops[-1]
            except Exception:
                pass

        score, deductions, c_status, score_status, comp_scores = cls.calculate_cleaning_score(df, dataset)

        # Compute authoritative absolute data quality score for consistency
        try:
            from app.services.quality_service import DataQualityService
            auth_quality_score, _, _, _ = DataQualityService.calculate_quality_score(df)
            auth_quality_int = int(round(auth_quality_score))
        except Exception:
            auth_quality_int = score

        summary_res = CleaningDashboardSummaryResponse(
            dataset_id=dataset.id,
            dataset_name=dataset.filename,
            current_version=curr_version,
            rows=total_rows,
            columns=total_cols,
            missing_values=missing_cells,
            missing_percentage=missing_pct,
            duplicate_rows=duplicate_rows,
            duplicate_percentage=dup_pct,
            blank_values=blank_cells,
            numeric_columns_count=num_cols,
            categorical_columns_count=cat_cols,
            date_columns_count=date_cols,
            outliers_detected=outliers_detected,
            last_cleaning_operation=last_op,
            last_updated=last_updated,
            cleaning_status=c_status,
            cleaning_score=score,
            quality_score=auth_quality_int,
            score_deductions=deductions,
            score_status=score_status,
            component_scores=comp_scores,
            unresolved_issues=deductions,
        )
        if len(cls._analysis_cache) >= cls._CACHE_MAX_ENTRIES:
            cls._analysis_cache.pop(next(iter(cls._analysis_cache)))
        cls._analysis_cache[cache_key] = summary_res
        return summary_res

    @classmethod
    def get_validation_report(cls, dataset: Dataset, db: Session) -> CleaningValidationReport:
        """Run and return the 8-check Before vs After validation report."""
        cache_key = f"{cls._get_cache_key(dataset, active=True)}_validation"
        if cache_key in cls._analysis_cache:
            return cls._analysis_cache[cache_key]

        orig_df = cls._get_dataframe(dataset, active=False)
        active_df = cls._get_dataframe(dataset, active=True)

        val_report = cls._run_validation_comparison(dataset, orig_df, active_df)
        if len(cls._analysis_cache) >= cls._CACHE_MAX_ENTRIES:
            cls._analysis_cache.pop(next(iter(cls._analysis_cache)))
        cls._analysis_cache[cache_key] = val_report
        return val_report

    @classmethod
    def get_smart_suggestions(cls, dataset: Dataset) -> SmartSuggestionsResponse:
        """Generate intelligent, data-driven cleaning suggestions grouped by priority."""
        cache_key = f"{cls._get_cache_key(dataset, active=True)}_suggestions"
        if cache_key in cls._analysis_cache:
            return cls._analysis_cache[cache_key]

        df = cls._get_dataframe(dataset, active=True)
        total_rows = len(df)
        suggestions: List[SmartCleaningSuggestion] = []

        # 1. Duplicate records
        dup_count = int(df.duplicated().sum())
        if dup_count > 0:
            dup_pct = round((dup_count / max(1, total_rows)) * 100, 1)
            suggestions.append(SmartCleaningSuggestion(
                id=f"sug_dup_{dup_count}",
                priority="high" if dup_pct > 10.0 or dup_count > 20 else "medium",
                category="duplicates",
                issue="Duplicate Records Detected",
                evidence=f"{dup_count} duplicate row(s) detected ({dup_pct}% of total records).",
                recommended_action="Review and remove duplicate records if they represent repeated entries.",
                affected_columns=[],
                affected_count=dup_count,
                action_type="remove_duplicates",
                action_payload={"remove_duplicates": True},
            ))

        # 2. Missing values with distribution skewness analysis
        for col in df.columns:
            miss_count = int(df[col].isnull().sum())
            if miss_count > 0:
                miss_pct = round((miss_count / max(1, total_rows)) * 100, 1)
                if pd.api.types.is_numeric_dtype(df[col]):
                    num_series = pd.to_numeric(df[col], errors="coerce").dropna()
                    skew = float(num_series.skew()) if len(num_series) >= 3 else 0.0
                    if abs(skew) > 1.0:
                        suggestions.append(SmartCleaningSuggestion(
                            id=f"sug_miss_skew_{col}",
                            priority="high" if miss_pct > 15.0 else "medium",
                            category="missing",
                            issue=f"Missing values in skewed numeric column '{col}'",
                            evidence=f"'{col}' has {miss_count} missing values ({miss_pct}%). Distribution skewness is {skew:.2f}.",
                            recommended_action=f"{col} has missing values and a skewed distribution. Median imputation may be safer than mean.",
                            affected_columns=[str(col)],
                            affected_count=miss_count,
                            action_type="missing_imputation",
                            action_payload={"column": str(col), "strategy": "median"},
                        ))
                    else:
                        suggestions.append(SmartCleaningSuggestion(
                            id=f"sug_miss_sym_{col}",
                            priority="medium",
                            category="missing",
                            issue=f"Missing values in numeric column '{col}'",
                            evidence=f"'{col}' has {miss_count} missing values ({miss_pct}%). Distribution is relatively symmetric (skewness = {skew:.2f}).",
                            recommended_action=f"Mean or median imputation is appropriate for {col}.",
                            affected_columns=[str(col)],
                            affected_count=miss_count,
                            action_type="missing_imputation",
                            action_payload={"column": str(col), "strategy": "mean"},
                        ))
                else:
                    mode_vals = df[col].dropna().mode()
                    mode_str = str(mode_vals.iloc[0]) if not mode_vals.empty else "Missing"
                    suggestions.append(SmartCleaningSuggestion(
                        id=f"sug_miss_cat_{col}",
                        priority="medium",
                        category="missing",
                        issue=f"Missing values in categorical column '{col}'",
                        evidence=f"'{col}' has {miss_count} missing cells ({miss_pct}%). Most frequent value is '{mode_str}'.",
                        recommended_action=f"Mode imputation ('{mode_str}') or constant replacement ('Unknown') recommended.",
                        affected_columns=[str(col)],
                        affected_count=miss_count,
                        action_type="missing_imputation",
                        action_payload={"column": str(col), "strategy": "mode"},
                    ))

        # 3. Numeric Formatting Inconsistencies (Currency, Commas)
        for col in df.columns:
            if df[col].dtype == object:
                s_str = df[col].dropna().astype(str).str.strip()
                if len(s_str) > 0:
                    has_curr = s_str.str.contains(r'[$₹€£¥%]|,\d{3}', regex=True)
                    cnt = int(has_curr.sum())
                    if cnt >= max(1, int(0.2 * len(s_str))):
                        sample_vals = [repr(v) for v in s_str[has_curr].head(3).tolist()]
                        suggestions.append(SmartCleaningSuggestion(
                            id=f"sug_num_fmt_{col}",
                            priority="high",
                            category="numeric",
                            issue=f"Numeric formatting inconsistencies in '{col}'",
                            evidence=f"{cnt} values contain currency symbols or comma separators (e.g. {', '.join(sample_vals)}).",
                            recommended_action="Remove currency/comma formatting and convert to numeric.",
                            affected_columns=[str(col)],
                            affected_count=cnt,
                            action_type="numeric_cleaning",
                            action_payload={"column": str(col), "action": "clean_all"},
                        ))

        # 4. Category Inconsistencies (Case, Whitespace, Variants)
        for col in df.columns:
            if df[col].dtype == object and len(df[col].dropna()) > 0:
                s_clean = df[col].dropna().astype(str)
                clustered = {}
                for raw_val in s_clean.unique():
                    norm = raw_val.strip().lower()
                    if norm not in clustered:
                        clustered[norm] = []
                    clustered[norm].append(raw_val)
                inconsistent_clusters = {k: v for k, v in clustered.items() if len(v) > 1}
                if inconsistent_clusters:
                    sample_cluster = next(iter(inconsistent_clusters.values()))
                    total_variant_cells = sum(s_clean.isin(variants).sum() for variants in inconsistent_clusters.values())
                    suggestions.append(SmartCleaningSuggestion(
                        id=f"sug_cat_incons_{col}",
                        priority="medium",
                        category="category",
                        issue=f"Possible category inconsistency in '{col}'",
                        evidence=f"Detected multiple variants of same category, such as {', '.join(repr(v) for v in sample_cluster)}.",
                        recommended_action="Trim whitespace, standardize case, and normalize categories.",
                        affected_columns=[str(col)],
                        affected_count=int(total_variant_cells),
                        action_type="category_normalization",
                        action_payload={"column": str(col)},
                    ))

        # 5. Statistical Outliers
        for col in df.columns:
            if pd.api.types.is_numeric_dtype(df[col]):
                num_s = pd.to_numeric(df[col], errors="coerce").dropna()
                if len(num_s) >= 4:
                    q1 = float(num_s.quantile(0.25))
                    q3 = float(num_s.quantile(0.75))
                    iqr = q3 - q1
                    if iqr > 0:
                        lb = q1 - 1.5 * iqr
                        ub = q3 + 1.5 * iqr
                        outliers = num_s[(num_s < lb) | (num_s > ub)]
                        if len(outliers) > 0:
                            sample_outliers = [str(round(v, 2)) for v in outliers.head(3).tolist()]
                            suggestions.append(SmartCleaningSuggestion(
                                id=f"sug_outlier_{col}",
                                priority="medium",
                                category="outliers",
                                issue=f"{len(outliers)} statistical outlier(s) detected in '{col}'",
                                evidence=f"{len(outliers)} values fall outside [{lb:.1f}, {ub:.1f}]. Extreme values: {', '.join(sample_outliers)}. Note: Outliers are not automatically errors.",
                                recommended_action=f"Review these values before removing them. They may represent legitimate observations. Options: View Outliers, Keep, Remove, Cap, or Median Replace.",
                                affected_columns=[str(col)],
                                affected_count=len(outliers),
                                action_type="outliers",
                                action_payload={"column": str(col), "method": "iqr", "threshold": 1.5},
                            ))

        # 6. Date format suggestions
        for col in df.columns:
            col_l = str(col).lower()
            if any(t in col_l for t in ["date", "time", "join", "exit", "birth"]):
                non_null_d = df[col].dropna().astype(str).str.strip()
                non_null_d = non_null_d[non_null_d != ""]
                if len(non_null_d) > 0:
                    try:
                        p = pd.to_datetime(non_null_d, errors="coerce", format="mixed")
                    except Exception:
                        p = pd.to_datetime(non_null_d, errors="coerce")
                    fails = int(p.isnull().sum())
                    has_dash = non_null_d.str.contains("-").sum()
                    has_slash = non_null_d.str.contains("/").sum()
                    if fails > 0 or (has_dash > 0 and has_slash > 0):
                        suggestions.append(SmartCleaningSuggestion(
                            id=f"sug_date_{col}",
                            priority="high" if fails > 0 else "medium",
                            category="date",
                            issue=f"Date format inconsistencies in '{col}'",
                            evidence=f"Mixed date patterns or {fails} unparseable date cell(s) detected.",
                            recommended_action="Standardize the date format to ISO YYYY-MM-DD before analysis.",
                            affected_columns=[str(col)],
                            affected_count=fails if fails > 0 else len(non_null_d),
                            action_type="date_cleaning",
                            action_payload={"column": str(col), "target_format": "YYYY-MM-DD"},
                        ))

        # 7. Datatype Suggestions
        for col in df.columns:
            if df[col].dtype == object:
                non_n = df[col].dropna()
                if len(non_n) > 0:
                    parsed_num = pd.to_numeric(non_n.astype(str).str.replace(r'[$₹€£,\s]', '', regex=True), errors="coerce")
                    num_valid = int(parsed_num.notnull().sum())
                    if num_valid >= 0.8 * len(non_n) and num_valid > 0:
                        invalid_cnt = len(non_n) - num_valid
                        suggestions.append(SmartCleaningSuggestion(
                            id=f"sug_dtype_{col}",
                            priority="high" if invalid_cnt > 0 else "low",
                            category="datatype",
                            issue=f"'{col}' appears to be numeric but stored as text",
                            evidence=f"Current datatype: object. Suggested: numeric. {num_valid}/{len(non_n)} values are parseable as numbers ({invalid_cnt} invalid).",
                            recommended_action=f"Convert '{col}' to integer/float after addressing any formatting or non-numeric values.",
                            affected_columns=[str(col)],
                            affected_count=num_valid,
                            action_type="type_conversion",
                            action_payload={"column": str(col), "target_type": "float"},
                        ))

        # 8. Blank / Whitespace values
        blank_total = 0
        blank_cols = []
        for col in df.columns:
            if df[col].dtype == object:
                cnt = int((df[col].notnull() & df[col].astype(str).str.strip().eq("")).sum())
                if cnt > 0:
                    blank_total += cnt
                    blank_cols.append(str(col))
        if blank_total > 0:
            suggestions.append(SmartCleaningSuggestion(
                id="sug_blanks",
                priority="low",
                category="whitespace",
                issue="Blank Whitespace Values Detected",
                evidence=f"{blank_total} blank/whitespace-only cell(s) across columns: {', '.join(blank_cols)}.",
                recommended_action="Convert blank whitespace cells to standard missing values (NaN).",
                affected_columns=blank_cols,
                affected_count=blank_total,
                action_type="convert_blanks_to_na",
                action_payload={"convert_blanks_to_na": True},
            ))

        # 9. Column Naming Conventions
        bad_names = [str(c) for c in df.columns if " " in str(c) or any(ch in str(c) for ch in "@#$%^&*()+=!")]
        if bad_names:
            suggestions.append(SmartCleaningSuggestion(
                id="sug_colnames",
                priority="low",
                category="column_name",
                issue="Non-standard Column Names Detected",
                evidence=f"Columns containing spaces or special characters: {', '.join(bad_names[:4])}.",
                recommended_action="Standardize column names to snake_case format for programmatic reliability.",
                affected_columns=bad_names,
                affected_count=len(bad_names),
                action_type="standardize_column_names",
                action_payload={"standardize_column_names": True},
            ))

        # Compute deterministic Impact Score, Priority Score, and Affected Percentage
        severity_weights = {
            "critical": 100.0,
            "high": 75.0,
            "medium": 50.0,
            "low": 25.0,
        }

        for s in suggestions:
            # Impact Score = 100 * Affected Records / Total Records (clamped 0-100)
            if total_rows > 0:
                imp = round(min(100.0, max(0.0, 100.0 * float(s.affected_count) / float(total_rows))), 2)
                pct = round(min(100.0, max(0.0, 100.0 * float(s.affected_count) / float(total_rows))), 1)
            else:
                imp = 0.0
                pct = 0.0

            p_lower = str(s.priority).lower()
            sev_weight = severity_weights.get(p_lower, 50.0)
            # Priority Score = (Severity Weight * 0.60) + (Impact Score * 0.40)
            p_score = round((sev_weight * 0.60) + (imp * 0.40), 2)

            s.impact_score = imp
            s.affected_percentage = pct
            s.priority_score = p_score
            s.severity = p_lower.capitalize()

        # Sort suggestions by:
        # 1. Priority Score, descending
        # 2. Severity, descending
        # 3. Number of affected records, descending
        # 4. Stable issue-type name, alphabetically, as final tie-breaker
        suggestions.sort(
            key=lambda s: (
                -float(s.priority_score or 0.0),
                -severity_weights.get(str(s.priority).lower(), 0.0),
                -int(s.affected_count or 0),
                str(s.issue or "").lower(),
            )
        )

        high_cnt = sum(1 for s in suggestions if s.priority == "high")
        med_cnt = sum(1 for s in suggestions if s.priority == "medium")
        low_cnt = sum(1 for s in suggestions if s.priority == "low")

        sug_res = SmartSuggestionsResponse(
            dataset_id=dataset.id,
            dataset_name=dataset.filename,
            total_suggestions=len(suggestions),
            high_priority_count=high_cnt,
            medium_priority_count=med_cnt,
            low_priority_count=low_cnt,
            suggestions=suggestions,
        )
        if len(cls._analysis_cache) >= cls._CACHE_MAX_ENTRIES:
            cls._analysis_cache.pop(next(iter(cls._analysis_cache)))
        cls._analysis_cache[cache_key] = sug_res
        return sug_res

    @classmethod
    def get_consistency_checks(cls, dataset: Dataset) -> ConsistencyChecksResponse:
        """Run cross-column consistency and semantic relationship validation."""
        cache_key = f"{cls._get_cache_key(dataset, active=True)}_consistency"
        if cache_key in cls._analysis_cache:
            return cls._analysis_cache[cache_key]

        df = cls._get_dataframe(dataset, active=True)
        total_rows = len(df)
        checks: List[ConsistencyCheckItem] = []

        # 1. Date Consistency (e.g. Start Date > End Date)
        date_cols = [str(c) for c in df.columns if any(t in str(c).lower() for t in ["date", "time", "join", "exit", "start", "end", "created", "updated", "ship", "order"])]
        pairs_to_check = []
        for c1 in date_cols:
            for c2 in date_cols:
                if c1 != c2:
                    l1, l2 = c1.lower(), c2.lower()
                    if ("start" in l1 and "end" in l2) or ("join" in l1 and "exit" in l2) or ("created" in l1 and "updated" in l2) or ("order" in l1 and "ship" in l2):
                        pairs_to_check.append((c1, c2))

        for c_start, c_end in pairs_to_check:
            s_d = pd.to_datetime(df[c_start], errors="coerce")
            e_d = pd.to_datetime(df[c_end], errors="coerce")
            viol_mask = (s_d.notnull() & e_d.notnull() & (s_d > e_d))
            viol_count = int(viol_mask.sum())
            if viol_count > 0:
                sample_rows = df[viol_mask].head(3)[[c_start, c_end]].to_dict(orient="records")
                checks.append(ConsistencyCheckItem(
                    id=f"chk_date_{c_start}_{c_end}",
                    check_name=f"{c_start} > {c_end}",
                    rule_description=f"Start date '{c_start}' must not be later than end date '{c_end}'.",
                    severity="High",
                    violations_count=viol_count,
                    violations_percentage=round((viol_count / max(1, total_rows)) * 100, 2),
                    action_label="Review",
                    action_type="date_cleaning",
                    affected_columns=[c_start, c_end],
                    sample_violations=cls._sanitize_for_json(sample_rows),
                ))

        # 2. Required Field Consistency (Identifier / Key Columns)
        id_cols = [str(c) for c in df.columns if str(c).lower() in ["id", "employee_id", "emp_id", "customer_id", "order_id", "user_id"] or str(c).lower().endswith("_id")]
        for id_col in id_cols:
            dup_ids = int(df[id_col].dropna().duplicated().sum())
            if dup_ids > 0:
                dup_mask = df[id_col].duplicated(keep=False)
                sample_rows = df[dup_mask].head(3).to_dict(orient="records")
                checks.append(ConsistencyCheckItem(
                    id=f"chk_dup_id_{id_col}",
                    check_name=f"Duplicate ID in '{id_col}'",
                    rule_description=f"Identifier column '{id_col}' should be unique across records.",
                    severity="High",
                    violations_count=dup_ids,
                    violations_percentage=round((dup_ids / max(1, total_rows)) * 100, 2),
                    action_label="Review",
                    action_type="remove_duplicates",
                    affected_columns=[id_col],
                    sample_violations=cls._sanitize_for_json(sample_rows),
                ))

            miss_or_blank = df[id_col].isnull() | df[id_col].astype(str).str.strip().eq("")
            miss_count = int(miss_or_blank.sum())
            if miss_count > 0:
                sample_rows = df[miss_or_blank].head(3).to_dict(orient="records")
                checks.append(ConsistencyCheckItem(
                    id=f"chk_miss_id_{id_col}",
                    check_name=f"Missing Identifier in '{id_col}'",
                    rule_description=f"Identifier column '{id_col}' should not have missing or blank values.",
                    severity="High",
                    violations_count=miss_count,
                    violations_percentage=round((miss_count / max(1, total_rows)) * 100, 2),
                    action_label="Review",
                    action_type="missing_imputation",
                    affected_columns=[id_col],
                    sample_violations=cls._sanitize_for_json(sample_rows),
                ))

        # 3. Category Inconsistency Check
        for col in df.columns:
            if df[col].dtype == object and len(df[col].dropna()) > 0:
                s_non = df[col].dropna().astype(str)
                clustered = {}
                for v in s_non.unique():
                    norm = v.strip().lower()
                    if norm not in clustered:
                        clustered[norm] = []
                    clustered[norm].append(v)
                incons = {k: v for k, v in clustered.items() if len(v) > 1}
                if incons:
                    sample_cluster = next(iter(incons.values()))
                    viol_count = int(sum(s_non.isin(v).sum() for v in incons.values()))
                    checks.append(ConsistencyCheckItem(
                        id=f"chk_cat_{col}",
                        check_name=f"Category Inconsistency in '{col}'",
                        rule_description=f"Equivalent variants found for category: {', '.join(repr(v) for v in sample_cluster)}.",
                        severity="Medium",
                        violations_count=viol_count,
                        violations_percentage=round((viol_count / max(1, total_rows)) * 100, 2),
                        action_label="Normalize",
                        action_type="category_normalization",
                        affected_columns=[str(col)],
                        sample_violations=[{"column": str(col), "variants": sample_cluster}],
                    ))

        # 4. Numeric Relationship Contradictions
        qty_col = next((str(c) for c in df.columns if any(t in str(c).lower() for t in ["qty", "quantity", "count", "units"])), None)
        tot_col = next((str(c) for c in df.columns if any(t in str(c).lower() for t in ["total", "amount", "revenue", "price"])), None)
        if qty_col and tot_col and qty_col != tot_col:
            q_num = pd.to_numeric(df[qty_col], errors="coerce")
            t_num = pd.to_numeric(df[tot_col], errors="coerce")
            contradict_mask = (q_num <= 0) & (t_num > 0)
            cnt = int(contradict_mask.sum())
            if cnt > 0:
                sample_rows = df[contradict_mask].head(3)[[qty_col, tot_col]].to_dict(orient="records")
                checks.append(ConsistencyCheckItem(
                    id=f"chk_num_{qty_col}_{tot_col}",
                    check_name=f"{qty_col} = 0 but {tot_col} > 0",
                    rule_description=f"Quantity cannot be zero or negative when Total Amount is positive.",
                    severity="High",
                    violations_count=cnt,
                    violations_percentage=round((cnt / max(1, total_rows)) * 100, 2),
                    action_label="Review",
                    action_type="custom_replace",
                    affected_columns=[qty_col, tot_col],
                    sample_violations=cls._sanitize_for_json(sample_rows),
                ))

        total_viols = sum(c.violations_count for c in checks)
        chk_res = ConsistencyChecksResponse(
            dataset_id=dataset.id,
            dataset_name=dataset.filename,
            total_checks=len(checks),
            total_violations=total_viols,
            checks=checks,
        )
        if len(cls._analysis_cache) >= cls._CACHE_MAX_ENTRIES:
            cls._analysis_cache.pop(next(iter(cls._analysis_cache)))
        cls._analysis_cache[cache_key] = chk_res
        return chk_res

    @classmethod
    def evaluate_custom_rule(cls, dataset: Dataset, rule: CustomConsistencyRuleRequest) -> CustomConsistencyRuleResponse:
        """Evaluate a custom user-configured cross-column rule."""
        df = cls._get_dataframe(dataset, active=True)
        total_rows = len(df)
        c_a = rule.column_a
        c_b = rule.column_b
        op = rule.operator

        if c_a not in df.columns:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Column '{c_a}' does not exist.")

        if op == "missing_when_present":
            if not c_b or c_b not in df.columns:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Column '{c_b}' does not exist.")
            mask = df[c_a].isnull() & df[c_b].notnull()
            desc = f"'{c_a}' is missing when '{c_b}' is present"

        elif op == "present_when_missing":
            if not c_b or c_b not in df.columns:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Column '{c_b}' does not exist.")
            mask = df[c_a].notnull() & df[c_b].isnull()
            desc = f"'{c_a}' is present when '{c_b}' is missing"

        elif op in [">", "<", ">=", "<=", "==", "!="]:
            s_a = pd.to_numeric(df[c_a], errors="coerce")
            if c_b and c_b in df.columns:
                s_b = pd.to_numeric(df[c_b], errors="coerce")
                desc = f"'{c_a}' {op} '{c_b}'"
            elif rule.constant_value is not None:
                try:
                    const_val = float(rule.constant_value)
                    s_b = const_val
                    desc = f"'{c_a}' {op} {const_val}"
                except ValueError:
                    s_a = df[c_a].astype(str)
                    s_b = str(rule.constant_value)
                    desc = f"'{c_a}' {op} '{rule.constant_value}'"
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Either column_b or constant_value must be provided.")

            if op == ">":
                mask = s_a > s_b
            elif op == "<":
                mask = s_a < s_b
            elif op == ">=":
                mask = s_a >= s_b
            elif op == "<=":
                mask = s_a <= s_b
            elif op == "==":
                mask = s_a == s_b
            elif op == "!=":
                mask = s_a != s_b
            else:
                mask = pd.Series(False, index=df.index)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported operator '{op}'.")

        viol_count = int(mask.sum())
        sample_rows = df[mask].head(5).to_dict(orient="records")

        return CustomConsistencyRuleResponse(
            rule_name=rule.rule_name or desc,
            rule_description=desc,
            violations_count=viol_count,
            violations_percentage=round((viol_count / max(1, total_rows)) * 100, 2) if total_rows > 0 else 0.0,
            total_rows=total_rows,
            sample_violations=cls._sanitize_for_json(sample_rows),
        )

    @classmethod
    def bulk_preview(
        cls,
        dataset: Dataset,
        operations: CleaningOperationsRequest,
    ) -> BulkPreviewResponse:
        """Dry-run preview of chained bulk cleaning operations with impact summary."""
        ops_json = operations.model_dump_json() if hasattr(operations, "model_dump_json") else json.dumps(operations.model_dump(), sort_keys=True)
        ops_hash = hashlib.sha256(ops_json.encode()).hexdigest()[:16]
        cache_key = f"{cls._get_cache_key(dataset, active=True)}_bulk_preview_{ops_hash}"
        if cache_key in cls._analysis_cache:
            return cls._analysis_cache[cache_key]

        before_df = cls._get_dataframe(dataset, active=True)
        cleaned_df, ops, _, detailed_ops, blank_cells, col_names_changed, _ = cls.execute_cleaning_pipeline(before_df, operations)

        diffs, total_cells = cls._compute_cell_diffs(before_df, cleaned_df)
        rows_removed = max(0, len(before_df) - len(cleaned_df))

        impact_summary: List[BulkOperationImpactItem] = []
        for dop in detailed_ops:
            impact_summary.append(BulkOperationImpactItem(
                column=dop.column,
                operation=dop.operation,
                affected=dop.rows_affected,
                result=f"{dop.rows_affected} value(s) affected ({dop.method})"
            ))

        exec_order = [
            "1. Normalize blank/whitespace values",
            "2. Standardize text",
            "3. Category normalization",
            "4. Custom value replacement",
            "5. Find & Replace",
            "6. Numeric cleaning",
            "7. Date cleaning",
            "8. Missing value handling",
            "9. Cleaning rule builder",
            "10. Range validation",
            "11. Remove duplicate rows",
            "12. Convert datatypes",
            "13. Outlier treatment",
        ]

        bulk_res = BulkPreviewResponse(
            dataset_id=dataset.id,
            operations_count=len(ops),
            execution_order=exec_order,
            impact_summary=impact_summary,
            total_rows_affected=rows_removed,
            total_cells_affected=total_cells,
            sample_preview=cls._sanitize_for_json(cleaned_df.head(10).to_dict(orient="records")),
            cell_diffs=diffs[:30],
        )
        if len(cls._analysis_cache) >= cls._CACHE_MAX_ENTRIES:
            cls._analysis_cache.pop(next(iter(cls._analysis_cache)))
        cls._analysis_cache[cache_key] = bulk_res
        return bulk_res

    @classmethod
    def get_version_timeline(cls, dataset: Dataset, db: Session) -> List[DatasetVersionItem]:
        """Retrieve all versions in the timeline from Original to latest Cleaned."""
        timeline: List[DatasetVersionItem] = []

        # Original version metrics & score
        orig_score = 0
        orig_status = "CRITICAL"
        try:
            orig_df = cls._get_dataframe(dataset, active=False)
            orig_score, _, _, orig_status, _ = cls.calculate_cleaning_score(orig_df, dataset, before_df=orig_df)
        except Exception:
            pass

        timeline.append(DatasetVersionItem(
            version="Original",
            version_number=0,
            timestamp=dataset.created_at.isoformat() if dataset.created_at else datetime.now(timezone.utc).isoformat(),
            rows=dataset.rows,
            columns=dataset.columns,
            operations=["Initial Upload"],
            status="active" if not dataset.has_cleaned else "archived",
            is_current=not dataset.has_cleaned,
            quality_score=orig_score,
            score_status=orig_status,
        ))

        records = (
            db.query(AnalysisHistory)
            .filter(
                AnalysisHistory.dataset_id == dataset.id,
                AnalysisHistory.analysis_type == "cleaning",
            )
            .order_by(AnalysisHistory.created_at.asc())
            .all()
        )

        total_cleaned = len(records)
        for idx, r in enumerate(records):
            v_num = idx + 1
            is_latest = (idx == total_cleaned - 1)
            v_tag = f"Cleaned v{v_num}"
            try:
                hist_data = json.loads(r.result_json) if r.result_json else {}
                ops = hist_data.get("operations_performed", [])
                rows_after = hist_data.get("after_rows", dataset.rows)
                cols_after = hist_data.get("after_columns", dataset.columns)
                score = hist_data.get("quality_score")
                s_status = hist_data.get("score_status") or hist_data.get("cleaning_status")
                val_rep = hist_data.get("validation_report")
            except Exception:
                ops = []
                rows_after = dataset.rows
                cols_after = dataset.columns
                score = None
                s_status = None
                val_rep = None

            is_curr = dataset.has_cleaned and is_latest
            timeline.append(DatasetVersionItem(
                version=v_tag,
                version_number=v_num,
                timestamp=r.created_at.isoformat(),
                rows=rows_after,
                columns=cols_after,
                operations=ops,
                status="active" if is_curr else "archived",
                is_current=is_curr,
                quality_score=score,
                score_status=s_status,
                validation_summary=val_rep,
            ))

        return timeline

    @classmethod
    def compare_versions(cls, dataset: Dataset, v1_tag: str, v2_tag: str, db: Session) -> VersionComparisonResponse:
        """Compare structural and hygiene metrics between two dataset versions."""
        timeline = cls.get_version_timeline(dataset, db)
        v1_item = next((v for v in timeline if v.version == v1_tag), None)
        v2_item = next((v for v in timeline if v.version == v2_tag), None)

        if not v1_item or not v2_item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Version '{v1_tag}' or '{v2_tag}' not found.")

        def _get_df_for_version(tag: str) -> pd.DataFrame:
            if tag == "Original":
                return cls._get_dataframe(dataset, active=False)
            else:
                history_entries = (
                    db.query(AnalysisHistory)
                    .filter(AnalysisHistory.dataset_id == dataset.id, AnalysisHistory.analysis_type == "cleaning")
                    .order_by(AnalysisHistory.created_at.asc())
                    .all()
                )
                for h in history_entries:
                    try:
                        h_data = json.loads(h.result_json) if h.result_json else {}
                        if h_data.get("version") == tag:
                            v_path = Path(h_data.get("version_file"))
                            if v_path.exists():
                                return pd.read_csv(v_path)
                    except Exception:
                        pass
                if dataset.has_cleaned and dataset.cleaned_file_path and Path(dataset.cleaned_file_path).exists():
                    return cls._get_dataframe(dataset, active=True)
                return cls._get_dataframe(dataset, active=False)

        df1 = _get_df_for_version(v1_tag)
        df2 = _get_df_for_version(v2_tag)

        m1 = cls._compute_hygiene_metrics(df1, dataset)
        m2 = cls._compute_hygiene_metrics(df2, dataset)
        
        score1, _, _, status1, _ = cls.calculate_cleaning_score(
        df1, dataset, before_df=df1)
        score2, _, _, status2, _ = cls.calculate_cleaning_score(
        df2, dataset, before_df=df1)


        v1_metrics = {
            "rows": len(df1),
            "columns": len(df1.columns),
            "missing_cells": m1["missing_values"],
            "duplicate_rows": m1["duplicate_rows"],
            "blank_cells": m1["blank_values"],
            "outliers": m1["outliers"],
            "quality_score": score1,
            "status": status1,
        }

        v2_metrics = {
            "rows": len(df2),
            "columns": len(df2.columns),
            "missing_cells": m2["missing_values"],
            "duplicate_rows": m2["duplicate_rows"],
            "blank_cells": m2["blank_values"],
            "outliers": m2["outliers"],
            "quality_score": score2,
            "status": status2,
        }

        deltas = {
            "rows_delta": v2_metrics["rows"] - v1_metrics["rows"],
            "columns_delta": v2_metrics["columns"] - v1_metrics["columns"],
            "missing_delta": v2_metrics["missing_cells"] - v1_metrics["missing_cells"],
            "duplicates_delta": v2_metrics["duplicate_rows"] - v1_metrics["duplicate_rows"],
            "blanks_delta": v2_metrics["blank_cells"] - v1_metrics["blank_cells"],
            "outliers_delta": v2_metrics["outliers"] - v1_metrics["outliers"],
            "score_delta": v2_metrics["quality_score"] - v1_metrics["quality_score"],
        }

        return VersionComparisonResponse(
            dataset_id=dataset.id,
            v1_tag=v1_tag,
            v2_tag=v2_tag,
            v1_metrics=v1_metrics,
            v2_metrics=v2_metrics,
            deltas=deltas,
            operations_applied=v2_item.operations,
        )

    @classmethod
    def restore_version(cls, dataset: Dataset, version_tag: str, current_user: User, db: Session) -> Dict[str, Any]:
        """Restore dataset to any historical version or back to Original."""
        tag = version_tag.strip().lower()

        if tag in ("original", "v0", "0"):
            dataset.has_cleaned = False
            dataset.cleaned_file_path = None
            db.commit()
            db.refresh(dataset)
            cls.clear_cache_for_dataset(dataset.id)
            return {
                "success": True,
                "message": f"Dataset '{dataset.filename}' successfully restored to Original version.",
                "current_version": "Original",
            }

        match = re.search(r'\d+', tag)
        if not match:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid version identifier '{version_tag}'.")

        v_num = int(match.group())
        user_dir = settings.UPLOAD_DIR / f"user_{current_user.id}"
        base_stem = Path(dataset.stored_filename or dataset.filename).stem

        versioned_file = user_dir / f"cleaned_{base_stem}_v{v_num}.csv"
        standard_cleaned = user_dir / f"cleaned_{base_stem}.csv"

        if not versioned_file.exists():
            if standard_cleaned.exists() and v_num == 1:
                versioned_file = standard_cleaned
            else:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Version '{version_tag}' file not found.")

        shutil.copyfile(versioned_file, standard_cleaned)
        dataset.cleaned_file_path = str(standard_cleaned)
        dataset.has_cleaned = True
        db.commit()
        db.refresh(dataset)
        cls.clear_cache_for_dataset(dataset.id)

        return {
            "success": True,
            "message": f"Dataset '{dataset.filename}' successfully restored to Cleaned v{v_num}.",
            "current_version": f"Cleaned v{v_num}",
        }

    @classmethod
    def generate_cleaning_report(cls, dataset: Dataset, db: Session) -> CleaningReportResponse:
        """Produce full structured report containing metadata, history, validation, and score."""
        orig_df = cls._get_dataframe(dataset, active=False)
        active_df = cls._get_dataframe(dataset, active=True)
        active_p = Path(dataset.cleaned_file_path if (dataset.has_cleaned and dataset.cleaned_file_path) else dataset.file_path)

        before_metrics = cls.calculate_metrics(orig_df)
        after_metrics = cls.calculate_metrics(active_df)

        val_report = cls._run_validation_comparison(dataset, orig_df, active_df)
        score, deductions, _, score_status, comp_scores = cls.calculate_cleaning_score(active_df, dataset, before_df=orig_df)

        records = (
            db.query(AnalysisHistory)
            .filter(
                AnalysisHistory.dataset_id == dataset.id,
                AnalysisHistory.analysis_type == "cleaning",
            )
            .order_by(AnalysisHistory.created_at.asc())
            .all()
        )

        all_ops: List[Dict[str, Any]] = []
        for r in records:
            try:
                hist_data = json.loads(r.result_json) if r.result_json else {}
                for dop in hist_data.get("detailed_operations", []):
                    all_ops.append(dop)
            except Exception:
                pass

        history_count = len(records)
        curr_ver = f"Cleaned v{history_count}" if dataset.has_cleaned else "Original"

        now_str = datetime.now(timezone.utc).isoformat()
        dataset_info = {
            "name": dataset.filename,
            "version": curr_ver,
            "file_type": dataset.file_type or "CSV",
            "rows": len(active_df),
            "columns": len(active_df.columns),
            "timestamp": now_str,
            "file_size_bytes": active_p.stat().st_size if active_p.exists() else 0,
        }

        return CleaningReportResponse(
            dataset_info=dataset_info,
            version=curr_ver,
            cleaning_operations=all_ops,
            validation_results=val_report,
            before_metrics=before_metrics,
            after_metrics=after_metrics,
            quality_score=score,
            score_deductions=deductions,
            generated_at=now_str,
            score_status=score_status,
            unresolved_issues=deductions,
        )

    @classmethod
    def export_cleaning_report(cls, dataset: Dataset, format_type: str, db: Session) -> Tuple[str, str, str]:
        """Export cleaning report into markdown, csv, or json format."""
        report = cls.generate_cleaning_report(dataset, db)
        base_stem = Path(dataset.filename).stem
        fmt = (format_type or "markdown").strip().lower()

        if fmt == "csv":
            lines = ["Category,Key,Before,After,Status,Details"]
            for chk in report.validation_results.checks:
                lines.append(f'Validation,"{chk.check_name}",{chk.before_value},{chk.after_value},{chk.status},"{chk.details or ""}"')
            for dop in report.cleaning_operations:
                lines.append(f'Operation,"{dop.get("operation")}",,{dop.get("rows_affected")},Executed,"{dop.get("column")}: {dop.get("method")}"')
            lines.append(f'Score,"Overall Cleaning Score",,{report.quality_score},{report.score_status},"Out of 100"')
            content = "\n".join(lines)
            return content, f"cleaning_report_{base_stem}.csv", "text/csv"

        elif fmt == "json":
            content = json.dumps(report.model_dump(), indent=2)
            return content, f"cleaning_report_{base_stem}.json", "application/json"

        elif fmt in ("markdown", "md"):
            md_lines = [
                f"# Data Cleaning Report — {dataset.filename}",
                f"**Generated:** {report.generated_at} | **Version:** {report.version} | **Cleaning Quality Score:** {report.quality_score}/100 ({report.score_status})\n",
                "## 1. Dataset Overview",
                f"- **Filename:** {report.dataset_info['name']}",
                f"- **Current Version:** {report.dataset_info['version']}",
                f"- **File Type:** {report.dataset_info.get('file_type', 'CSV')}",
                f"- **Rows:** {report.dataset_info['rows']} | **Columns:** {report.dataset_info['columns']}",
                f"- **Missing Cells Remaining:** {report.after_metrics.missing_cells} ({report.after_metrics.missing_percentage}%)",
                f"- **Duplicate Rows Remaining:** {report.after_metrics.duplicate_rows} ({report.after_metrics.duplicate_percentage}%)\n",
                "## 2. Before vs. After Cleaning Validation",
                "| Check Name | Weight | Before | After | Remaining | Status | Details |",
                "| :--- | ---: | ---: | ---: | ---: | :--- | :--- |",
            ]
            for chk in report.validation_results.checks:
                md_lines.append(f"| {chk.check_name} | {chk.weight or '-'} | {chk.before_value} | {chk.after_value} | {chk.remaining_issues or 0} | {chk.status} | {chk.details or ''} |")

            md_lines.extend([
                f"\n**Cleaning Score:** {report.quality_score} / 100  |  **Status:** {report.score_status}\n",
                "## 3. Cleaning Operations Log",
                "| Operation | Column | Method | Affected Rows/Cells | Timestamp |",
                "| :--- | :--- | :--- | ---: | :--- |",
            ])
            for dop in report.cleaning_operations:
                md_lines.append(f"| {dop.get('operation')} | {dop.get('column')} | {dop.get('method')} | {dop.get('rows_affected')} | {dop.get('date', '-')} |")

            if report.score_deductions:
                md_lines.extend([
                    "\n## 4. Unresolved Issues & Observations",
                ])
                for ded in report.score_deductions:
                    md_lines.append(f"- {ded}")

            content = "\n".join(md_lines)
            return content, f"cleaning_report_{base_stem}.md", "text/markdown"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported report format '{format_type}'. Supported formats: markdown, csv, json.",
            )

    @classmethod
    def export_cleaned_dataset(cls, dataset: Dataset, format_type: str) -> Tuple[Any, str, str]:
        """Stream cleaned dataset in CSV or Excel format."""
        active_p = Path(dataset.cleaned_file_path if (dataset.has_cleaned and dataset.cleaned_file_path) else dataset.file_path)
        if not active_p.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cleaned dataset file not found.")

        base_stem = Path(dataset.filename).stem
        fmt = (format_type or "csv").strip().lower()

        if fmt in ("excel", "xlsx"):
            df = cls._get_dataframe(dataset, active=True)
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine="openpyxl") as writer:
                df.to_excel(writer, index=False, sheet_name="Cleaned Data")
            output.seek(0)
            return output.getvalue(), f"cleaned_{base_stem}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        elif fmt in ("csv", "txt"):
            return active_p, f"cleaned_{base_stem}.csv", "text/csv"
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported export format '{format_type}'. Supported formats: csv, excel.",
            )

    @classmethod
    def get_original_preview(cls, dataset: Dataset) -> Dict[str, Any]:
        """Retrieve sample preview of original uncleaned dataset."""
        df = cls._get_dataframe(dataset, active=False)
        return {
            "filename": dataset.filename,
            "total_rows": len(df),
            "total_columns": len(df.columns),
            "columns": [str(c) for c in df.columns],
            "sample_preview": cls._sanitize_for_json(df.head(10).to_dict(orient="records")),
            "sample_rows": cls._sanitize_for_json(df.head(10).to_dict(orient="records")),
        }


CleaningService = DataCleaningService
cleaning_service = DataCleaningService

