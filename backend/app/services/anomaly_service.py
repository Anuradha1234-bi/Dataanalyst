"""Anomaly Service - Backend business logic for univariate & multivariate outlier detection."""

import json
import math
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.dataset import Dataset
from app.models.user import User
from app.models.analysis_history import AnalysisHistory
from app.schemas.anomaly import (
    AnomalyDetectRequest,
    AnomalyDetectResponse,
    AnomalySummaryResponse,
    FlaggedRecordItem,
    IQRDetectionResponse,
    IQROutlierColumnResponse,
    IsolationForestDetectionResponse,
    NumericColumnsResponse,
)
from tools.anomaly_tool import AnomalyTool
from utils.file_loader import FileLoader


def _sanitize_val(val: Any) -> Any:
    """Sanitize float values (NaN, Infinity) for valid JSON serialization."""
    if val is None:
        return None
    if isinstance(val, (float, np.floating)):
        if math.isnan(val) or np.isnan(val):
            return None
        if math.isinf(val) or np.isinf(val):
            return "Infinity" if val > 0 else "-Infinity"
        return round(float(val), 4)
    if isinstance(val, (int, np.integer)):
        return int(val)
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.isoformat()
    return str(val) if not isinstance(val, (bool, str, list, dict)) else val


class AnomalyService:
    """Enterprise Anomaly and Outlier Detection Service."""

    @classmethod
    def _get_user_dataset_df(
        cls,
        db: Session,
        current_user: User,
        dataset_id: int,
        version: str = "original",
    ) -> Tuple[Dataset, pd.DataFrame, str, List[str]]:
        """Verify user dataset ownership, determine version path, and load temporary DataFrame."""
        warnings: List[str] = []
        dataset = (
            db.query(Dataset)
            .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
            .first()
        )
        if not dataset:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset #{dataset_id} not found or access denied.",
            )

        use_version = (version or "original").lower().strip()
        actual_version = "original"
        active_path: Path

        if use_version == "cleaned":
            if dataset.has_cleaned and dataset.cleaned_file_path:
                cleaned_p = Path(dataset.cleaned_file_path)
                if cleaned_p.exists() and cleaned_p.is_file():
                    active_path = cleaned_p
                    actual_version = "cleaned"
                else:
                    active_path = Path(dataset.file_path)
                    warnings.append("Cleaned dataset file was missing on disk; fell back to original version.")
            else:
                active_path = Path(dataset.file_path)
                warnings.append("No cleaned version exists for this dataset; analyzed original dataset version.")
        else:
            active_path = Path(dataset.file_path)

        if not active_path.exists() or not active_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset file '{dataset.filename}' is missing from physical storage.",
            )

        load_res = FileLoader.load_file(
            file_obj=str(active_path),
            filename=dataset.filename,
            file_size_bytes=dataset.file_size_bytes or 0,
        )
        if not load_res.success or load_res.df is None or load_res.df.empty:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=load_res.error_message or f"Dataset '{dataset.filename}' is empty or unreadable.",
            )

        # Work on a strict copy to protect source dataset integrity
        df_copy = load_res.df.copy(deep=True)
        return dataset, df_copy, actual_version, warnings

    @classmethod
    def get_numeric_columns(
        cls,
        db: Session,
        current_user: User,
        dataset_id: int,
        version: str = "original",
    ) -> NumericColumnsResponse:
        """Retrieve available numeric features, duplicate column groups, and exclusion notes."""
        dataset, df, actual_version, _ = cls._get_user_dataset_df(db, current_user, dataset_id, version)
        suitable, excluded_ids, excluded_other = AnomalyTool.identify_suitable_features(df)
        canonical_to_dups, _ = AnomalyTool.detect_duplicate_numerical_columns(df, columns=suitable)

        ds_name = dataset.original_filename or dataset.filename or f"dataset_{dataset.id}"
        return NumericColumnsResponse(
            dataset_id=dataset.id,
            dataset_name=ds_name,
            dataset_version=actual_version,
            total_rows=len(df),
            suitable_numeric_columns=suitable,
            excluded_columns=excluded_ids + excluded_other,
            duplicate_columns=canonical_to_dups,
        )

    @classmethod
    def detect_anomalies(
        cls,
        db: Session,
        current_user: User,
        request: AnomalyDetectRequest,
    ) -> AnomalyDetectResponse:
        """Execute univariate IQR and/or multivariate Isolation Forest anomaly detection."""
        dataset, df, actual_version, warnings = cls._get_user_dataset_df(
            db, current_user, request.dataset_id, request.version or "original"
        )
        ds_name = dataset.original_filename or dataset.filename or f"dataset_{dataset.id}"

        # Determine suitable features
        suitable_cols, excluded_ids, excluded_other = AnomalyTool.identify_suitable_features(df)
        if not suitable_cols and not request.columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Dataset '{ds_name}' does not contain any suitable numeric columns for anomaly detection.",
            )

        # Target columns for analysis
        if request.columns:
            # Validate requested columns exist in dataset
            invalid_cols = [c for c in request.columns if c not in df.columns]
            if invalid_cols:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Requested columns not found in dataset: {', '.join(invalid_cols)}",
                )
            target_numeric_cols = [c for c in request.columns if pd.api.types.is_numeric_dtype(df[c])]
            if not target_numeric_cols:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="None of the specified columns are numeric.",
                )
            # Filter out identifier columns from requested columns
            id_exclusions = []
            filtered_numeric_cols = []
            for c in target_numeric_cols:
                is_id, reason = AnomalyTool.is_id_or_index_column(df[c], c)
                if is_id:
                    id_exclusions.append(f"{c} ({reason})")
                else:
                    filtered_numeric_cols.append(c)

            if id_exclusions:
                warnings.append(
                    f"Excluded {len(id_exclusions)} identifier column(s) from anomaly detection feature inputs: {', '.join(id_exclusions)}."
                )
            if not filtered_numeric_cols:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"All specified columns were identified as identifiers or non-numeric: {', '.join(id_exclusions)}.",
                )
            target_numeric_cols = filtered_numeric_cols
        else:
            target_numeric_cols = suitable_cols

        method = request.method.lower().strip()
        if method not in ("iqr", "isolation_forest", "both"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid detection method '{request.method}'. Allowed: 'iqr', 'isolation_forest', 'both'.",
            )

        # Validate contamination
        contamination = request.contamination
        if contamination < 0.001 or contamination > 0.5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Contamination rate must be between 0.001 and 0.5. Received {contamination}.",
            )

        # Detect exact duplicate numerical columns among analyzed features
        canonical_to_dups, dup_to_canonical = AnomalyTool.detect_duplicate_numerical_columns(
            df, columns=target_numeric_cols
        )
        if dup_to_canonical:
            dup_details = [f"'{dup}' (duplicate of '{can}')" for dup, can in dup_to_canonical.items()]
            warnings.append(
                f"Detected {len(dup_to_canonical)} exact duplicate numerical column(s): {', '.join(dup_details)}."
            )

        # 1. IQR Univariate Detection
        iqr_response: Optional[IQRDetectionResponse] = None
        iqr_flagged_map: Dict[Any, List[str]] = {}  # index -> list of violating columns

        if method in ("iqr", "both"):
            iqr_result = AnomalyTool.detect_iqr_outliers(
                df=df,
                columns=target_numeric_cols,
                multiplier=request.multiplier,
                dataset_name=ds_name,
            )

            col_res_dict: Dict[str, IQROutlierColumnResponse] = {}
            for col, r in iqr_result.column_results.items():
                col_res_dict[col] = IQROutlierColumnResponse(
                    column=r.column,
                    q1=r.q1,
                    q3=r.q3,
                    iqr=r.iqr,
                    multiplier=r.multiplier,
                    lower_bound=r.lower_bound,
                    upper_bound=r.upper_bound,
                    lower_outliers_count=r.lower_outliers_count,
                    upper_outliers_count=r.upper_outliers_count,
                    total_outliers=r.total_outliers,
                    outlier_pct=r.outlier_pct,
                    outlier_indices=r.outlier_indices,
                    min_val=r.min_val,
                    max_val=r.max_val,
                    valid_count=getattr(r, "valid_count", 0),
                    missing_count=getattr(r, "missing_count", 0),
                    total_rows=getattr(r, "total_rows", 0),
                    evaluation_note=getattr(r, "evaluation_note", None),
                )
                if getattr(r, "missing_count", 0) > 0:
                    warnings.append(
                        f"Feature '{col}' has {r.missing_count} missing value(s) excluded from its IQR denominator "
                        f"({r.valid_count}/{r.total_rows} rows evaluated; outlier rate is {r.outlier_pct}% based on valid observations)."
                    )
                for idx in r.outlier_indices:
                    if idx not in iqr_flagged_map:
                        iqr_flagged_map[idx] = []
                    iqr_flagged_map[idx].append(col)

            iqr_response = IQRDetectionResponse(
                columns_analyzed=iqr_result.columns_analyzed,
                column_results=col_res_dict,
                total_outlier_rows=iqr_result.total_outlier_rows,
                outlier_rate=iqr_result.outlier_rate,
                all_outlier_indices=iqr_result.all_outlier_indices,
                multiplier=iqr_result.multiplier,
                duplicate_columns=iqr_result.duplicate_columns,
            )

        # 2. Isolation Forest Multivariate Detection
        if_response: Optional[IsolationForestDetectionResponse] = None
        if_flagged_map: Dict[Any, Tuple[float, str]] = {}  # index -> (score, label)

        if method in ("isolation_forest", "both"):
            # Determine candidate features respecting duplicate exclusion option
            exclude_dups = getattr(request, "exclude_duplicates", True)
            if exclude_dups and dup_to_canonical:
                features_candidate = [c for c in target_numeric_cols if c not in dup_to_canonical]
            else:
                features_candidate = target_numeric_cols

            if len(features_candidate) < 2:
                if method == "isolation_forest":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Isolation Forest requires at least 2 non-duplicate numerical features for multivariate analysis. "
                            f"Only {len(features_candidate)} eligible feature(s) available ({', '.join(features_candidate)})."
                        ),
                    )
                else:
                    warnings.append(
                        f"Skipped Isolation Forest: requires at least 2 non-duplicate numerical features (found {len(features_candidate)})."
                    )
            elif len(df) < 5:
                if method == "isolation_forest":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Isolation Forest requires at least 5 records to fit isolation trees. Dataset has {len(df)}.",
                    )
                else:
                    warnings.append("Skipped Isolation Forest: dataset contains fewer than 5 records.")
            else:
                try:
                    if_res = AnomalyTool.detect_isolation_forest(
                        df=df,
                        columns=target_numeric_cols,
                        contamination=contamination,
                        random_state=request.random_state,
                        dataset_name=ds_name,
                        exclude_duplicates=exclude_dups,
                    )

                    for pos in getattr(if_res, "anomaly_positions", [df.index.get_loc(idx) for idx in if_res.anomaly_indices]):
                        idx = df.index[pos]
                        score = if_res.anomaly_scores[pos]
                        label = if_res.anomaly_labels[pos]
                        if_flagged_map[idx] = (score, label)

                    if_response = IsolationForestDetectionResponse(
                        features_used=if_res.features_used,
                        contamination=if_res.contamination,
                        anomaly_count=if_res.anomaly_count,
                        anomaly_pct=if_res.anomaly_pct,
                        anomaly_indices=if_res.anomaly_indices,
                        preprocessing_notes=if_res.preprocessing_notes,
                        excluded_columns=if_res.excluded_columns,
                    )
                except Exception as e:
                    if method == "isolation_forest":
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Isolation Forest execution error: {str(e)}",
                        )
                    warnings.append(f"Isolation Forest could not run: {str(e)}")

        # 3. Combine Flagged Records (Deduplicated Union across enabled methods)
        iqr_unique_records = len(iqr_flagged_map.keys())
        if_unique_records = len(if_flagged_map.keys())
        both_methods_records = len(set(iqr_flagged_map.keys()).intersection(set(if_flagged_map.keys())))
        all_flagged_indices = set(iqr_flagged_map.keys()).union(set(if_flagged_map.keys()))
        flagged_records: List[FlaggedRecordItem] = []

        # Sort indices matching DataFrame order
        sorted_indices = [idx for idx in df.index if idx in all_flagged_indices]

        for idx in sorted_indices:
            row = df.loc[idx]
            pos = df.index.get_loc(idx)
            row_num = (pos.item(0) if hasattr(pos, "item") else int(pos)) + 1 if not isinstance(pos, int) else pos + 1

            methods_for_row: List[str] = []
            flagged_cols: List[str] = []
            reasons: List[str] = []

            if idx in iqr_flagged_map:
                methods_for_row.append("IQR")
                flagged_cols = iqr_flagged_map[idx]
                for col in flagged_cols:
                    val = row[col]
                    col_iqr = iqr_response.column_results.get(col) if iqr_response else None
                    if col_iqr:
                        if val < col_iqr.lower_bound:
                            reasons.append(
                                f"'{col}' ({_sanitize_val(val)}) is below IQR lower bound ({col_iqr.lower_bound})"
                            )
                        elif val > col_iqr.upper_bound:
                            reasons.append(
                                f"'{col}' ({_sanitize_val(val)}) is above IQR upper bound ({col_iqr.upper_bound})"
                            )

            if_score = None
            if_label = None
            if idx in if_flagged_map:
                methods_for_row.append("Isolation Forest")
                if_score, if_label = if_flagged_map[idx]
                reasons.append(
                    f"Multivariate anomaly score: {if_score:.3f} (unusual joint feature combination)"
                )

            # Extract numeric feature values and top non-numeric contextual attributes
            val_dict: Dict[str, Any] = {}
            for col in target_numeric_cols:
                if col in row:
                    val_dict[col] = _sanitize_val(row[col])

            full_row_dict: Dict[str, Any] = {}
            for col in df.columns:
                full_row_dict[col] = _sanitize_val(row[col])

            flagged_records.append(
                FlaggedRecordItem(
                    row_index=int(idx) if isinstance(idx, (int, np.integer)) else str(idx),
                    row_number=row_num,
                    methods=methods_for_row,
                    flagged_columns=flagged_cols,
                    values=val_dict,
                    full_row=full_row_dict,
                    isolation_forest_score=if_score,
                    isolation_forest_label=if_label,
                    reasons=reasons,
                )
            )

        # 4. Synthesize Summary
        total_rows = len(df)
        unique_flagged = len(sorted_indices)
        flagged_pct = round((unique_flagged / max(1, total_rows)) * 100, 2)

        methods_used_list = []
        if iqr_response:
            methods_used_list.append("IQR (Univariate)")
        if if_response:
            methods_used_list.append("Isolation Forest (Multivariate)")
        if not methods_used_list:
            methods_used_list.append(method.title())

        iqr_only = max(0, iqr_unique_records - both_methods_records)
        if_only = max(0, if_unique_records - both_methods_records)

        summary = AnomalySummaryResponse(
            total_records_analyzed=total_rows,
            unique_flagged_records=unique_flagged,
            flagged_percentage=flagged_pct,
            numeric_columns_analyzed=len(target_numeric_cols),
            methods_used=methods_used_list,
            dataset_id=dataset.id,
            dataset_name=ds_name,
            dataset_version=actual_version,
            iqr_unique_records=iqr_unique_records,
            isolation_forest_unique_records=if_unique_records,
            both_methods_records=both_methods_records,
            iqr_only_records=iqr_only,
            isolation_forest_only_records=if_only,
            duplicate_columns=canonical_to_dups,
        )

        # 5. Persist run to AnalysisHistory audit trail (preserving data integrity)
        try:
            hist_entry = AnalysisHistory(
                user_id=current_user.id,
                dataset_id=dataset.id,
                dataset_name=ds_name,
                query=f"Anomaly Detection ({', '.join(methods_used_list)}) on {actual_version} dataset",
                analysis_type="anomaly_detection",
                status="completed",
                result_json=json.dumps({
                    "method": method,
                    "version": actual_version,
                    "total_records": total_rows,
                    "flagged_records": unique_flagged,
                    "flagged_percentage": flagged_pct,
                    "columns_analyzed": target_numeric_cols,
                    "iqr_outliers": iqr_unique_records,
                    "isolation_forest_anomalies": if_unique_records,
                    "both_methods": both_methods_records,
                }),
            )
            db.add(hist_entry)
            db.commit()
        except Exception:
            db.rollback()

        return AnomalyDetectResponse(
            status="success",
            summary=summary,
            iqr_results=iqr_response,
            isolation_forest_results=if_response,
            flagged_records=flagged_records,
            all_numeric_columns=target_numeric_cols,
            duplicate_columns=canonical_to_dups,
            warnings=warnings,
            created_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )
