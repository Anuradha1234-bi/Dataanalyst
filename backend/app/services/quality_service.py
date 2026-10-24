"""Data Quality Service - Performs in-depth hygiene diagnostics on uploaded datasets."""

import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from fastapi import HTTPException, status
import pandas as pd
import numpy as np

from app.models.dataset import Dataset
from app.schemas.quality import (
    DataQualitySummary,
    ColumnQuality,
    ColumnMissingInfo,
    MissingValuesReport,
    DuplicateRecordsReport,
    DataTypesReport,
    EmptyRecordsReport,
    ConstantColumnItem,
    ConstantColumnsReport,
    NullLikeValueItem,
    ConsistencyReport,
    DataQualityResponse,
)
from utils.file_loader import FileLoader

NULL_LIKE_TOKENS = {
    "nan", "null", "none", "n/a", "na", "?", "-", "--",
    "missing", "nil", "undefined", "n.a.", "#n/a", "empty"
}


class DataQualityService:
    """Calculates granular quality metrics, hygiene warnings, and structural scores."""

    @classmethod
    def calculate_quality_score(cls, df: pd.DataFrame) -> Tuple[float, str, str, Dict[str, Any]]:
        """Authoritative Data Quality Score calculation method.

        Evaluates structural hygiene on a 0-100 scale using deterministic penalties:
          - Missing cells: up to 35.0 pts (missing_pct * 1.5)
          - Duplicate rows: up to 20.0 pts (duplicate_pct * 1.0)
          - Completely empty rows: 2.0 pts per row
          - Completely empty columns: 10.0 pts per column
          - Constant columns: 8.0 pts per column
          - Near-constant columns: 4.0 pts per column
          - Mixed type columns: 5.0 pts per column
          - Null-like tokens (e.g. 'nan', 'null', 'n/a'): up to 8.0 pts (1.5 pts per unique token)

        Returns:
            Tuple of (quality_score, overall_status, status_message, issue_details)
        """
        if df is None or df.empty or len(df) == 0:
            return 0.0, "Poor", "Dataset is empty.", {"total_rows": 0, "total_columns": 0}

        total_rows = int(len(df))
        total_cols = int(len(df.columns))
        total_cells = total_rows * total_cols

        total_missing = int(df.isnull().sum().sum())
        missing_pct = round((total_missing / total_cells * 100), 2) if total_cells > 0 else 0.0

        duplicate_rows = int(df.duplicated().sum())
        duplicate_pct = round((duplicate_rows / total_rows * 100), 2) if total_rows > 0 else 0.0

        empty_rows_count = int(df.isnull().all(axis=1).sum())
        empty_cols_count = sum(1 for col in df.columns if df[col].isnull().all())

        constant_cols_count = 0
        near_constant_cols_count = 0
        mixed_type_cols_count = 0
        null_like_tokens_detected = set()
        formatting_issues_count = 0

        for col in df.columns:
            series = df[col]
            non_null = series.dropna()
            non_null_count = len(non_null)
            if non_null_count == 0:
                continue

            unique_c = int(non_null.nunique())
            if unique_c == 1:
                constant_cols_count += 1
            elif unique_c == 2 and total_rows >= 10:
                val_counts = non_null.value_counts()
                if len(val_counts) > 0 and (val_counts.iloc[0] / non_null_count) >= 0.95:
                    near_constant_cols_count += 1

            if series.dtype == object:
                s_str = non_null.astype(str).str.strip().str.lower()
                for token in NULL_LIKE_TOKENS:
                    if (s_str == token).any():
                        null_like_tokens_detected.add(token)

                has_curr = bool(s_str.str.contains(r'[$₹€£¥%]|,\d{3}', regex=True).any())
                if has_curr:
                    formatting_issues_count += 1
                cleaned_num = s_str.str.replace(r'[$₹€£¥%,\s]', '', regex=True)
                parsed = pd.to_numeric(cleaned_num, errors='coerce')
                valid_num_count = int(parsed.notnull().sum())
                if valid_num_count > 0 and valid_num_count < non_null_count and (valid_num_count / non_null_count) >= 0.2:
                    mixed_type_cols_count += 1

        penalty = 0.0
        penalty += min(35.0, missing_pct * 1.5)
        penalty += min(20.0, duplicate_pct * 1.0)
        penalty += empty_rows_count * 2.0
        penalty += empty_cols_count * 10.0
        penalty += constant_cols_count * 8.0
        penalty += near_constant_cols_count * 4.0
        penalty += mixed_type_cols_count * 5.0
        if len(null_like_tokens_detected) > 0:
            penalty += min(8.0, len(null_like_tokens_detected) * 1.5)

        quality_score = max(0.0, min(100.0, round(100.0 - penalty, 1)))

        quality_issues_count = (
            (1 if duplicate_rows > 0 else 0)
            + int((df.isnull().sum() > 0).sum())
            + empty_rows_count
            + empty_cols_count
            + constant_cols_count
            + near_constant_cols_count
            + mixed_type_cols_count
            + (1 if len(null_like_tokens_detected) > 0 else 0)
            + (1 if formatting_issues_count > 0 else 0)
        )

        if quality_score < 60.0 or missing_pct >= 25.0 or empty_cols_count > 0 or empty_rows_count > 0:
            overall_status = "Poor"
            status_msg = f"Dataset exhibits significant quality degradation (Score: {quality_score}/100) with {quality_issues_count} total detected issues."
        elif quality_issues_count > 0 or quality_score < 85.0:
            overall_status = "Needs Attention"
            status_msg = f"Dataset is mostly usable (Score: {quality_score}/100), but contains {quality_issues_count} hygiene issues."
        else:
            overall_status = "Good"
            status_msg = f"Dataset is clean and well-structured (Score: {quality_score}/100) with 0 detected hygiene issues."

        details = {
            "total_rows": total_rows,
            "total_columns": total_cols,
            "total_cells": total_cells,
            "missing_cells": total_missing,
            "missing_percentage": missing_pct,
            "duplicate_rows": duplicate_rows,
            "duplicate_percentage": duplicate_pct,
            "empty_rows": empty_rows_count,
            "empty_columns": empty_cols_count,
            "constant_columns": constant_cols_count,
            "near_constant_columns": near_constant_cols_count,
            "mixed_type_columns": mixed_type_cols_count,
            "null_like_tokens": list(null_like_tokens_detected),
            "quality_issues_count": quality_issues_count,
            "penalty": round(penalty, 2),
        }
        return quality_score, overall_status, status_msg, details

    @classmethod
    def analyze_dataset_quality(
        cls,
        dataset: Dataset,
        active: bool = True,
        version: Optional[str] = "original",
    ) -> DataQualityResponse:
        v_lower = (version or "original").lower().strip()
        if v_lower == "cleaned":
            if dataset.has_cleaned and dataset.cleaned_file_path:
                p = Path(dataset.cleaned_file_path)
                file_path = p if (p.exists() and p.is_file()) else Path(dataset.file_path)
            else:
                file_path = Path(dataset.file_path)
        else:
            file_path = Path(dataset.file_path)

        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset file '{dataset.filename}' not found on storage disk.",
            )

        load_result = FileLoader.load_file(
            file_obj=str(file_path),
            filename=dataset.filename,
            file_size_bytes=dataset.file_size_bytes,
        )

        if not load_result.success or load_result.df is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=load_result.error_message or f"Unable to parse dataset file '{dataset.filename}'.",
            )

        df = load_result.df

        if df.empty or len(df) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dataset is completely empty (0 rows). Cannot perform quality analysis.",
            )

        total_rows = int(len(df))
        total_cols = int(len(df.columns))
        total_cells = total_rows * total_cols

        # 1. Missing Values Diagnostics
        missing_series = df.isnull().sum()
        total_missing_cells = int(missing_series.sum())
        missing_pct = round((total_missing_cells / total_cells * 100), 2) if total_cells > 0 else 0.0

        columns_with_missing: List[ColumnMissingInfo] = []
        for col, count in missing_series.items():
            if count > 0:
                columns_with_missing.append(
                    ColumnMissingInfo(
                        column_name=str(col),
                        missing_count=int(count),
                        missing_percentage=round((count / total_rows * 100), 2),
                    )
                )

        missing_report = MissingValuesReport(
            total_missing_cells=total_missing_cells,
            missing_percentage=missing_pct,
            affected_columns_count=len(columns_with_missing),
            columns_with_missing=columns_with_missing,
        )

        # 2. Duplicate Records Diagnostics
        duplicate_rows_count = int(df.duplicated().sum())
        duplicate_pct = round((duplicate_rows_count / total_rows * 100), 2) if total_rows > 0 else 0.0
        duplicate_report = DuplicateRecordsReport(
            duplicate_rows=duplicate_rows_count,
            duplicate_percentage=duplicate_pct,
            has_duplicates=(duplicate_rows_count > 0),
        )

        # 3. Empty Rows & Columns Diagnostics
        empty_rows_count = int(df.isnull().all(axis=1).sum())
        empty_cols_list = [str(col) for col in df.columns if df[col].isnull().all()]
        empty_report = EmptyRecordsReport(
            empty_rows_count=empty_rows_count,
            empty_columns_count=len(empty_cols_list),
            empty_column_names=empty_cols_list,
        )

        # 4. Column Classifications & Consistency Diagnostics
        numeric_cols: List[str] = []
        categorical_cols: List[str] = []
        datetime_cols: List[str] = []
        boolean_cols: List[str] = []
        inconsistent_cols: List[Dict[str, Any]] = []

        constant_cols: List[ConstantColumnItem] = []
        near_constant_cols: List[ConstantColumnItem] = []

        mixed_type_cols: List[Dict[str, Any]] = []
        null_like_items: List[NullLikeValueItem] = []
        formatting_issues_count = 0

        column_qualities: List[ColumnQuality] = []

        for col in df.columns:
            col_str = str(col)
            series = df[col]
            missing_c = int(series.isnull().sum())
            missing_p = round((missing_c / total_rows * 100), 2)
            non_null_series = series.dropna()
            non_null_count = int(len(non_null_series))
            unique_c = int(non_null_series.nunique())
            unique_p = round((unique_c / total_rows * 100), 2) if total_rows > 0 else 0.0

            # Determine Data Type
            raw_dtype = str(series.dtype)
            inferred_type = "Text"
            is_bool = False
            is_numeric = False
            is_datetime = False

            if pd.api.types.is_bool_dtype(series):
                is_bool = True
                inferred_type = "Boolean"
                boolean_cols.append(col_str)
            elif pd.api.types.is_numeric_dtype(series):
                is_numeric = True
                # Check if boolean disguised as 0/1 with boolean intent
                if set(non_null_series.unique()).issubset({0, 1}) and col_str.lower().startswith(('is_', 'has_', 'can_', 'should_')):
                    is_bool = True
                    inferred_type = "Boolean"
                    boolean_cols.append(col_str)
                elif pd.api.types.is_integer_dtype(series):
                    inferred_type = "Integer"
                    numeric_cols.append(col_str)
                else:
                    inferred_type = "Float"
                    numeric_cols.append(col_str)
            elif pd.api.types.is_datetime64_any_dtype(series):
                is_datetime = True
                inferred_type = "Datetime"
                datetime_cols.append(col_str)
            else:
                # Text / Object inspection
                # Check if parses as datetime
                if non_null_count > 0:
                    sample = non_null_series.head(20).astype(str)
                    dt_matches = 0
                    for val in sample:
                        try:
                            pd.to_datetime(val)
                            dt_matches += 1
                        except (ValueError, TypeError, OverflowError):
                            pass
                    if dt_matches >= len(sample) * 0.85:
                        is_datetime = True
                        inferred_type = "Datetime"
                        datetime_cols.append(col_str)
                    elif non_null_series.nunique() <= min(15, total_rows * 0.5):
                        inferred_type = "Categorical"
                        categorical_cols.append(col_str)
                    else:
                        inferred_type = "Text"
                        categorical_cols.append(col_str)
                else:
                    inferred_type = "Text"
                    categorical_cols.append(col_str)

            # Check for constant / near-constant
            is_constant = False
            is_near_constant = False
            constant_issue_label = "None"
            constant_val_repr = None

            if non_null_count == 0:
                is_constant = True
                constant_issue_label = "100% Empty Column"
            elif unique_c == 1:
                is_constant = True
                constant_val_repr = str(non_null_series.iloc[0])
                constant_issue_label = "100% Constant"
                constant_cols.append(
                    ConstantColumnItem(
                        column_name=col_str,
                        constant_value=constant_val_repr,
                        percentage=100.0,
                    )
                )
            elif total_rows >= 10 and non_null_count > 0:
                top_val_count = int(non_null_series.value_counts().iloc[0])
                top_pct = round((top_val_count / non_null_count * 100), 2)
                if top_pct >= 95.0:
                    is_near_constant = True
                    constant_val_repr = str(non_null_series.value_counts().index[0])
                    constant_issue_label = f"Near-Constant ({top_pct}% same)"
                    near_constant_cols.append(
                        ConstantColumnItem(
                            column_name=col_str,
                            constant_value=constant_val_repr,
                            percentage=top_pct,
                        )
                    )

            # High Uniqueness check
            if not is_constant and not is_near_constant and total_rows >= 5:
                if unique_p >= 99.0 and inferred_type in ["Integer", "Text", "Categorical"]:
                    if constant_issue_label == "None":
                        constant_issue_label = "100% Unique / Primary Key Candidate"

            # Consistency: null-like string tokens
            col_null_like_count = 0
            if non_null_count > 0 and inferred_type in ["Categorical", "Text"]:
                str_series = non_null_series.astype(str)
                for val in str_series:
                    clean_v = val.strip().lower()
                    if clean_v in NULL_LIKE_TOKENS:
                        col_null_like_count += 1
                        null_like_items.append(
                            NullLikeValueItem(
                                column_name=col_str,
                                token=val,
                                count=1,
                            )
                        )
                # Formatting: leading/trailing whitespace
                whitespace_diff = (str_series != str_series.str.strip()).sum()
                if whitespace_diff > 0:
                    formatting_issues_count += int(whitespace_diff)

            # Inconsistent / mixed types check
            has_mixed_types = False
            if inferred_type in ["Text", "Categorical"] and non_null_count > 0:
                # Test numeric conversion
                numeric_parsed = pd.to_numeric(non_null_series, errors="coerce")
                numeric_count = int(numeric_parsed.notnull().sum())
                if 0 < numeric_count < non_null_count:
                    has_mixed_types = True
                    inconsistent_cols.append({
                        "column": col_str,
                        "issue": "Mixed numeric and text strings detected",
                        "numeric_count": numeric_count,
                        "text_count": non_null_count - numeric_count,
                    })
                    mixed_type_cols.append({
                        "column": col_str,
                        "issue": f"{numeric_count} numeric values mixed with {non_null_count - numeric_count} text strings",
                    })

            # Determine Column Issues and Quality Status
            col_issues: List[str] = []
            if missing_c == total_rows:
                col_issues.append("Completely empty column")
            elif missing_p >= 30.0:
                col_issues.append(f"High missing rate: {missing_p}%")
            elif missing_c > 0:
                col_issues.append(f"{missing_c} missing cells ({missing_p}%)")

            if is_constant:
                col_issues.append(f"Constant value: '{constant_val_repr}' across all rows")
            elif is_near_constant:
                col_issues.append(f"Near-constant column: dominant value '{constant_val_repr}' in {constant_issue_label}")

            if has_mixed_types:
                col_issues.append("Contains mixed numeric and text datatypes")

            if col_null_like_count > 0:
                col_issues.append(f"{col_null_like_count} null-like string tokens (e.g. 'null', 'nan', '?')")

            # Column Status
            col_status = "Good"
            if missing_c == total_rows or missing_p >= 40.0:
                col_status = "Critical"
            elif len(col_issues) > 0:
                col_status = "Warning"

            column_qualities.append(
                ColumnQuality(
                    column_name=col_str,
                    data_type=raw_dtype,
                    inferred_type=inferred_type,
                    total_count=total_rows,
                    missing_count=missing_c,
                    missing_percentage=missing_p,
                    unique_count=unique_c,
                    unique_percentage=unique_p,
                    is_constant=is_constant,
                    is_near_constant=is_near_constant,
                    is_empty=(missing_c == total_rows),
                    has_mixed_types=has_mixed_types,
                    invalid_null_like_count=col_null_like_count,
                    issues=col_issues,
                    duplicate_constant_issue=constant_issue_label,
                    quality_status=col_status,
                )
            )

        # 5. Overall Quality Status & Score Calculation
        types_report = DataTypesReport(
            numeric_columns=numeric_cols,
            categorical_columns=categorical_cols,
            datetime_columns=datetime_cols,
            boolean_columns=boolean_cols,
            inconsistent_columns=inconsistent_cols,
        )

        constant_report = ConstantColumnsReport(
            constant_columns=constant_cols,
            near_constant_columns=near_constant_cols,
        )

        consistency_report = ConsistencyReport(
            mixed_type_columns=mixed_type_cols,
            null_like_values_detected=null_like_items,
            formatting_issues_count=formatting_issues_count,
        )

        # Count total issues
        problematic_cols_count = sum(1 for c in column_qualities if c.quality_status != "Good")
        quality_issues_count = (
            (1 if duplicate_rows_count > 0 else 0)
            + len(columns_with_missing)
            + empty_rows_count
            + len(empty_cols_list)
            + len(constant_cols)
            + len(near_constant_cols)
            + len(mixed_type_cols)
            + (1 if len(null_like_items) > 0 else 0)
            + (1 if formatting_issues_count > 0 else 0)
        )

        # Calculate Quality Score (0 - 100)
        penalty = 0.0
        penalty += min(35.0, missing_pct * 1.5)
        penalty += min(20.0, duplicate_pct * 1.0)
        penalty += empty_rows_count * 2.0
        penalty += len(empty_cols_list) * 10.0
        penalty += len(constant_cols) * 8.0
        penalty += len(near_constant_cols) * 4.0
        penalty += len(mixed_type_cols) * 5.0
        if len(null_like_items) > 0:
            penalty += min(8.0, len(null_like_items) * 1.5)

        quality_score = max(0.0, min(100.0, round(100.0 - penalty, 1)))

        # Status: Good, Needs Attention, Poor
        if quality_score < 60.0 or missing_pct >= 25.0 or len(empty_cols_list) > 0 or empty_rows_count > 0:
            overall_status = "Poor"
            status_msg = f"Dataset exhibits significant quality degradation (Score: {quality_score}/100) with {quality_issues_count} total detected issues."
        elif quality_issues_count > 0 or quality_score < 85.0:
            overall_status = "Needs Attention"
            status_msg = f"Dataset is mostly usable (Score: {quality_score}/100), but contains {quality_issues_count} hygiene issues across {problematic_cols_count} column(s)."
        else:
            overall_status = "Good"
            status_msg = f"Dataset is clean and well-structured (Score: {quality_score}/100) with 0 detected hygiene issues."

        summary = DataQualitySummary(
            overall_status=overall_status,
            quality_score=quality_score,
            total_rows=total_rows,
            total_columns=total_cols,
            total_cells=total_cells,
            missing_cells=total_missing_cells,
            missing_percentage=missing_pct,
            duplicate_rows=duplicate_rows_count,
            duplicate_percentage=duplicate_pct,
            has_duplicates=(duplicate_rows_count > 0),
            empty_rows=empty_rows_count,
            empty_columns=len(empty_cols_list),
            constant_columns_count=len(constant_cols),
            near_constant_columns_count=len(near_constant_cols),
            problematic_columns_count=problematic_cols_count,
            quality_issues_count=quality_issues_count,
            status_message=status_msg,
        )

        return DataQualityResponse(
            dataset_id=dataset.id,
            filename=dataset.filename,
            summary=summary,
            columns=column_qualities,
            missing_report=missing_report,
            duplicate_report=duplicate_report,
            types_report=types_report,
            empty_report=empty_report,
            constant_report=constant_report,
            consistency_report=consistency_report,
            analyzed_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        )
