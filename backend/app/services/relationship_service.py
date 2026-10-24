"""Service layer for multi-dataset relationship discovery, validation, and safe joins."""

import os
import re
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User
from app.models.dataset import Dataset
from app.models.analysis_history import AnalysisHistory
from app.schemas.relationship import (
    RelationshipDetectResponse,
    RelationshipItem,
    DuplicateDatasetItem,
    DuplicateDetectResponse,
    JoinPreviewResponse,
    JoinApplyResponse,
)
from services.relationship_detector import RelationshipDetector
from services.duplicate_detector import DuplicateDatasetDetector
from models.relationship import Relationship
from utils.file_loader import FileLoader

logger = logging.getLogger(__name__)


class RelationshipService:
    """Enterprise service for cross-dataset key discovery, validation, and safe joining."""

    @classmethod
    def _get_active_filepath(cls, dataset: Dataset) -> Path:
        """Return cleaned file if present and valid; otherwise original file."""
        if dataset.has_cleaned and dataset.cleaned_file_path:
            p = Path(dataset.cleaned_file_path)
            if p.exists() and p.is_file():
                return p
        return Path(dataset.file_path)

    @classmethod
    def detect_relationships(
        cls,
        datasets: List[Dataset],
    ) -> RelationshipDetectResponse:
        """Scan all candidate pairs of uploaded datasets and identify relationships."""
        if len(datasets) < 2:
            return RelationshipDetectResponse(
                total_detected=0,
                analyzed_datasets_count=len(datasets),
                relationships=[],
            )

        # 1. Load DataFrames into dictionary keyed by 'id::filename'
        dfs: Dict[str, pd.DataFrame] = {}
        dataset_map: Dict[str, Dataset] = {}

        for ds in datasets:
            active_path = cls._get_active_filepath(ds)
            if not active_path.exists():
                continue
            load_res = FileLoader.load_file(active_path, ds.filename, ds.file_size_bytes or 0)
            if load_res.success and load_res.df is not None:
                key = f"{ds.id}::{ds.filename}"
                dfs[key] = load_res.df
                dataset_map[key] = ds

        if len(dfs) < 2:
            return RelationshipDetectResponse(
                total_detected=0,
                analyzed_datasets_count=len(dfs),
                relationships=[],
            )

        # 2. Run engine relationship detector
        raw_relationships: List[Relationship] = RelationshipDetector.detect_all_relationships(dfs)

        # 3. Enrich and normalize items into API schema
        items: List[RelationshipItem] = []

        for rel in raw_relationships:
            src_key = rel.source_dataset
            tgt_key = rel.target_dataset

            src_ds = dataset_map.get(src_key)
            tgt_ds = dataset_map.get(tgt_key)

            if not src_ds or not tgt_ds:
                continue

            src_df = dfs.get(src_key)
            tgt_df = dfs.get(tgt_key)

            if src_df is None or tgt_df is None:
                continue

            if rel.source_column not in src_df.columns or rel.target_column not in tgt_df.columns:
                continue

            src_col = src_df[rel.source_column]
            tgt_col = tgt_df[rel.target_column]

            cardinality = rel.cardinality or rel.relationship_type or "Unknown"
            cardinality_symbol = rel.cardinality_symbol or "N:M"
            direction = rel.direction or f"{src_ds.filename}.{rel.source_column} -> {tgt_ds.filename}.{rel.target_column}"
            matching_values_count = rel.matching_values_count or 0
            unmatched_source = rel.unmatched_source_count or 0
            unmatched_target = rel.unmatched_target_count or 0

            src_null_count = rel.source_null_count or 0
            tgt_null_count = rel.target_null_count or 0
            src_null_pct = rel.source_null_pct or 0.0
            tgt_null_pct = rel.target_null_pct or 0.0

            src_unique_count = len(src_col.dropna().unique())
            tgt_unique_count = len(tgt_col.dropna().unique())

            src_pk_hint = rel.source_pk_fk_hint or ""
            tgt_pk_hint = rel.target_pk_fk_hint or ""

            # PK / FK classification derived directly from verified matching uniqueness
            src_is_pk = bool(cardinality in ("One-to-One", "One-to-Many"))
            tgt_is_pk = bool(cardinality in ("One-to-One", "Many-to-One"))
            src_is_fk = bool(cardinality == "Many-to-One")
            tgt_is_fk = bool(cardinality == "One-to-Many")

            suggested_type = cardinality

            # Confidence Score Calculation (0.0 to 100.0)
            # Factors: Name similarity (35%), Value overlap (40%), Type compatibility (15%), PK/FK structure (10%)
            name_score = 35.0 if rel.source_column.lower() == rel.target_column.lower() else (
                25.0 if rel.source_column.replace("_", "").lower() == rel.target_column.replace("_", "").lower() else 15.0
            )
            overlap_score = min(40.0, (rel.value_overlap_pct / 100.0) * 40.0)
            type_score = 15.0 if rel.data_type_compatible else 0.0
            key_score = 10.0 if (src_is_pk or tgt_is_pk) else 0.0

            calc_score = round(name_score + overlap_score + type_score + key_score, 1)
            calc_score = min(99.0, max(5.0, calc_score))

            if calc_score >= 75.0 and rel.confidence != "LOW":
                confidence_label = "Strong Relationship"
                conf_level = "HIGH"
            elif calc_score >= 40.0:
                confidence_label = "Possible Relationship"
                conf_level = "MEDIUM"
            else:
                confidence_label = "Weak / Uncertain"
                conf_level = "LOW"

            # Add PK / FK hints to reasons
            reasons = list(rel.confidence_reasons)
            if src_is_pk:
                reasons.append(f"{src_ds.filename}.{rel.source_column} is a verified unique Primary Key candidate")
            if tgt_is_pk:
                reasons.append(f"{tgt_ds.filename}.{rel.target_column} is a verified unique Primary Key candidate")
            if src_is_fk:
                reasons.append(f"{src_ds.filename}.{rel.source_column} is a Foreign Key referencing {tgt_ds.filename}")
            if tgt_is_fk:
                reasons.append(f"{tgt_ds.filename}.{rel.target_column} is a Foreign Key referencing {src_ds.filename}")

            rel_id = f"{src_ds.id}:{rel.source_column}:{tgt_ds.id}:{rel.target_column}"

            items.append(
                RelationshipItem(
                    id=rel_id,
                    source_dataset_id=src_ds.id,
                    source_dataset_name=src_ds.filename,
                    source_column=rel.source_column,
                    source_dtype=rel.source_dtype,
                    source_unique_count=src_unique_count,
                    source_null_count=src_null_count,
                    source_null_pct=src_null_pct,
                    source_is_pk_candidate=src_is_pk,
                    source_is_fk_candidate=src_is_fk,
                    target_dataset_id=tgt_ds.id,
                    target_dataset_name=tgt_ds.filename,
                    target_column=rel.target_column,
                    target_dtype=rel.target_dtype,
                    target_unique_count=tgt_unique_count,
                    target_null_count=tgt_null_count,
                    target_null_pct=tgt_null_pct,
                    target_is_pk_candidate=tgt_is_pk,
                    target_is_fk_candidate=tgt_is_fk,
                    data_type_compatible=rel.data_type_compatible,
                    matching_values_count=matching_values_count,
                    value_overlap_pct=round(rel.value_overlap_pct, 2),
                    relationship_type=suggested_type,
                    confidence=conf_level,
                    confidence_score=calc_score,
                    confidence_label=confidence_label,
                    confidence_reasons=reasons,
                    warning_messages=list(rel.warning_messages),
                    is_ambiguous=rel.is_ambiguous,
                    ambiguity_group=rel.ambiguity_group,
                    is_recommended=rel.is_recommended,
                    user_status="PENDING",
                    join_risk=rel.join_risk or "Standard",
                    cardinality=cardinality,
                    cardinality_symbol=cardinality_symbol,
                    direction=direction,
                    unmatched_values_source=unmatched_source,
                    unmatched_values_target=unmatched_target,
                    source_pk_fk_hint=src_pk_hint,
                    target_pk_fk_hint=tgt_pk_hint,
                    cardinality_explanation=rel.cardinality_explanation or metrics.get("cardinality_explanation", ""),
                    safe_for_join=rel.safe_for_join if hasattr(rel, "safe_for_join") else metrics.get("safe_for_join", True),
                    is_candidate=rel.is_candidate if hasattr(rel, "is_candidate") else (conf_level == "LOW"),
                )
            )

        # Sort highest score first
        items.sort(key=lambda x: x.confidence_score, reverse=True)

        # Build scan summary and informative message
        total_cols = sum(len(df.columns) for df in dfs.values())
        ds_names = [ds.filename for ds in dataset_map.values()]

        if len(items) > 0:
            strong_count = sum(1 for i in items if i.confidence == "HIGH")
            scan_summary = {
                "datasets_analyzed": len(dfs),
                "dataset_names": ds_names,
                "columns_profiled": total_cols,
                "candidate_relationships": len(items),
                "strong_relationships": strong_count,
                "cardinality_distribution": {
                    "1:1": sum(1 for i in items if i.cardinality_symbol == "1:1"),
                    "1:N": sum(1 for i in items if i.cardinality_symbol == "1:N"),
                    "N:1": sum(1 for i in items if i.cardinality_symbol == "N:1"),
                    "M:N": sum(1 for i in items if i.cardinality_symbol in ("M:N", "N:M")),
                },
            }
            msg = f"Discovered {len(items)} potential relationship(s) across {len(dfs)} selected datasets."
        else:
            scan_summary = {
                "datasets_analyzed": len(dfs),
                "dataset_names": ds_names,
                "columns_profiled": total_cols,
                "candidate_relationships": 0,
                "strong_relationships": 0,
                "reason": "No common identifier columns with matching values found.",
            }
            msg = (
                f"Evaluated {total_cols} columns across {len(dfs)} selected datasets ({', '.join(ds_names)}). "
                "No strong or candidate column relationships were detected. "
                "The columns either had incompatible data types, no overlapping values, or were constant. "
                "To join datasets, ensure they share a common identifier column (e.g. ID, code, name, category) with matching values."
            )

        # 4. Content-based Smart Duplicate Dataset Detection
        duplicate_results = DuplicateDatasetDetector.detect_all_duplicates(dfs, dataset_map)
        duplicate_items = [DuplicateDatasetItem(**d.to_dict()) for d in duplicate_results]

        return RelationshipDetectResponse(
            total_detected=len(items),
            analyzed_datasets_count=len(dfs),
            relationships=items,
            duplicate_datasets=duplicate_items,
            scan_summary=scan_summary,
            message=msg,
        )

    @classmethod
    def detect_duplicates(cls, datasets: List[Dataset]) -> DuplicateDetectResponse:
        """Dedicated detection of duplicate or overlapping datasets by analyzing actual cell values."""
        if len(datasets) < 2:
            return DuplicateDetectResponse(
                total_pairs_evaluated=0,
                duplicates_detected_count=0,
                duplicate_datasets=[],
                summary={"message": "At least 2 datasets required to evaluate duplicates."},
            )

        dfs: Dict[str, pd.DataFrame] = {}
        dataset_map: Dict[str, Dataset] = {}

        for ds in datasets:
            active_path = cls._get_active_filepath(ds)
            if not active_path.exists():
                continue
            load_res = FileLoader.load_file(active_path, ds.filename, ds.file_size_bytes or 0)
            if load_res.success and load_res.df is not None:
                key = f"{ds.id}::{ds.filename}"
                dfs[key] = load_res.df
                dataset_map[key] = ds

        if len(dfs) < 2:
            return DuplicateDetectResponse(
                total_pairs_evaluated=0,
                duplicates_detected_count=0,
                duplicate_datasets=[],
                summary={"message": "Could not read sufficient valid datasets to compare."},
            )

        duplicate_results = DuplicateDatasetDetector.detect_all_duplicates(dfs, dataset_map)
        items = [DuplicateDatasetItem(**d.to_dict()) for d in duplicate_results]

        total_pairs = (len(dfs) * (len(dfs) - 1)) // 2
        exact_count = sum(1 for i in items if i.status_level == "EXACT_DUPLICATE")
        potential_count = sum(1 for i in items if i.status_level == "POTENTIAL_DUPLICATE")
        partial_count = sum(1 for i in items if i.status_level == "PARTIAL_OVERLAP")

        summary = {
            "datasets_evaluated": len(dfs),
            "total_pairs_evaluated": total_pairs,
            "exact_duplicates": exact_count,
            "potential_duplicates": potential_count,
            "partial_overlaps": partial_count,
        }

        return DuplicateDetectResponse(
            total_pairs_evaluated=total_pairs,
            duplicates_detected_count=len(items),
            duplicate_datasets=items,
            summary=summary,
        )

    @classmethod
    def preview_join(
        cls,
        left_dataset: Dataset,
        left_column: str,
        right_dataset: Dataset,
        right_column: str,
        join_type: str = "inner",
        limit: int = 10,
    ) -> JoinPreviewResponse:
        """Dry-run simulated join with matching statistics and sample output rows."""
        left_path = cls._get_active_filepath(left_dataset)
        right_path = cls._get_active_filepath(right_dataset)

        load_left = FileLoader.load_file(left_path, left_dataset.filename, left_dataset.file_size_bytes or 0)
        if not load_left.success or load_left.df is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not load left dataset.")

        load_right = FileLoader.load_file(right_path, right_dataset.filename, right_dataset.file_size_bytes or 0)
        if not load_right.success or load_right.df is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not load right dataset.")

        left_df = load_left.df
        right_df = load_right.df

        if left_column not in left_df.columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Column '{left_column}' does not exist in dataset '{left_dataset.filename}'.",
            )
        if right_column not in right_df.columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Column '{right_column}' does not exist in dataset '{right_dataset.filename}'.",
            )

        join_how = join_type.lower()
        if join_how not in ("inner", "left", "right", "outer"):
            join_how = "inner"

        left_rows = len(left_df)
        right_rows = len(right_df)

        # Overlap analysis
        left_valid = left_df[left_column].dropna().astype(str)
        right_valid = right_df[right_column].dropna().astype(str)

        left_set = set(left_valid)
        right_set = set(right_valid)
        matched_keys = left_set.intersection(right_set)

        matching_rows_left = int(left_df[left_column].astype(str).isin(matched_keys).sum())
        unmatched_left = int(left_rows - matching_rows_left)
        unmatched_right = int(right_rows - right_df[right_column].astype(str).isin(matched_keys).sum())

        dup_left = left_df[left_column].dropna().duplicated().any()
        dup_right = right_df[right_column].dropna().duplicated().any()
        is_many_to_many = bool(dup_left and dup_right)

        # Perform candidate simulation
        temp_left = left_df.copy()
        temp_right = right_df.copy()

        # Type normalization for merge
        l_col = temp_left[left_column]
        r_col = temp_right[right_column]
        if pd.api.types.is_numeric_dtype(l_col) and (pd.api.types.is_string_dtype(r_col) or pd.api.types.is_object_dtype(r_col)):
            temp_right[right_column] = pd.to_numeric(temp_right[right_column], errors="coerce")
        elif pd.api.types.is_numeric_dtype(r_col) and (pd.api.types.is_string_dtype(l_col) or pd.api.types.is_object_dtype(l_col)):
            temp_left[left_column] = pd.to_numeric(temp_left[left_column], errors="coerce")

        right_stem = Path(right_dataset.filename).stem
        try:
            merged = pd.merge(
                temp_left,
                temp_right,
                left_on=left_column,
                right_on=right_column,
                how=join_how,
                suffixes=("", f"_{right_stem}"),
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to simulate {join_how.upper()} join: {str(e)}",
            )

        resulting_rows = len(merged)
        row_explosion_risk = bool(resulting_rows > int(left_rows * 1.05) and resulting_rows > left_rows + 5)

        warnings = []
        if is_many_to_many:
            warnings.append(
                "Many-to-Many warning: Duplicate key values exist in both datasets. Resulting rows may multiply."
            )
        if row_explosion_risk:
            warnings.append(
                f"Row count will expand from {left_rows} to {resulting_rows} (+{resulting_rows - left_rows} rows)."
            )
        if join_how == "inner" and unmatched_left > 0:
            warnings.append(
                f"{unmatched_left} un-matched rows from {left_dataset.filename} will be dropped in Inner Join."
            )

        # Clean sample rows for JSON serialization
        sample_df = merged.head(limit).copy()
        # Replace NaN/inf with None
        sample_df = sample_df.replace([np.nan, np.inf, -np.inf], None)
        # Convert Timestamp columns to str
        for col in sample_df.columns:
            if pd.api.types.is_datetime64_any_dtype(sample_df[col]):
                sample_df[col] = sample_df[col].astype(str)

        sample_rows = sample_df.to_dict(orient="records")

        return JoinPreviewResponse(
            left_dataset_name=left_dataset.filename,
            right_dataset_name=right_dataset.filename,
            left_column=left_column,
            right_column=right_column,
            join_type=join_how.upper(),
            left_total_rows=left_rows,
            right_total_rows=right_rows,
            estimated_resulting_rows=resulting_rows,
            matching_rows_count=matching_rows_left,
            unmatched_left_rows=unmatched_left,
            unmatched_right_rows=unmatched_right,
            resulting_columns=list(merged.columns),
            sample_rows=sample_rows,
            warnings=warnings,
            is_many_to_many=is_many_to_many,
            row_explosion_risk=row_explosion_risk,
        )

    @classmethod
    def apply_join(
        cls,
        left_dataset: Dataset,
        left_column: str,
        right_dataset: Dataset,
        right_column: str,
        join_type: str = "inner",
        custom_dataset_name: Optional[str] = None,
        user_confirmed: bool = True,
        current_user: User = None,
        db: Session = None,
    ) -> JoinApplyResponse:
        """Execute user-confirmed join, write derived dataset, and register in database."""
        if not user_confirmed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Explicit user confirmation is required to create a joined dataset.",
            )

        left_path = cls._get_active_filepath(left_dataset)
        right_path = cls._get_active_filepath(right_dataset)

        load_left = FileLoader.load_file(left_path, left_dataset.filename, left_dataset.file_size_bytes or 0)
        if not load_left.success or load_left.df is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not load left dataset.")

        load_right = FileLoader.load_file(right_path, right_dataset.filename, right_dataset.file_size_bytes or 0)
        if not load_right.success or load_right.df is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not load right dataset.")

        left_df = load_left.df
        right_df = load_right.df

        join_how = join_type.lower()
        if join_how not in ("inner", "left", "right", "outer"):
            join_how = "inner"

        # Execute safe join using RelationshipDetector
        success, merged_df, audit, err_msg = RelationshipDetector.execute_safe_join(
            left_df=left_df,
            left_name=left_dataset.filename,
            left_key=left_column,
            right_df=right_df,
            right_name=right_dataset.filename,
            right_key=right_column,
            how=join_how,
            confidence="HIGH",
            user_confirmed=True,
        )

        if not success or merged_df is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err_msg or "Failed to execute safe join merge.",
            )

        # Create destination storage file
        user_dir = settings.UPLOAD_DIR / f"user_{current_user.id}"
        user_dir.mkdir(parents=True, exist_ok=True)

        left_stem = re.sub(r"[^a-zA-Z0-9_\-]", "_", Path(left_dataset.filename).stem)
        right_stem = re.sub(r"[^a-zA-Z0-9_\-]", "_", Path(right_dataset.filename).stem)

        if custom_dataset_name and custom_dataset_name.strip():
            raw_stem = Path(custom_dataset_name.strip()).stem
            clean_stem = re.sub(r"[^a-zA-Z0-9_-]", "_", raw_stem)
            target_name = f"{clean_stem}.csv"
        else:
            target_name = f"joined_{left_stem}_{right_stem}_{join_how}.csv"

        # Ensure no collision in filenames
        target_path = user_dir / target_name
        counter = 1
        while target_path.exists():
            stem_base = target_name[:-4]
            target_path = user_dir / f"{stem_base}_{counter}.csv"
            counter += 1

        final_filename = target_path.name

        # Save joined CSV
        merged_df.to_csv(target_path, index=False)
        file_size = target_path.stat().st_size

        # Register new derived Dataset in database
        derived_ds = Dataset(
            user_id=current_user.id,
            filename=final_filename,
            stored_filename=final_filename,
            file_type="csv",
            file_path=str(target_path),
            cleaned_file_path=None,
            rows=len(merged_df),
            columns=len(merged_df.columns),
            file_size_bytes=file_size,
            has_cleaned=False,
            column_names_json=json.dumps(list(merged_df.columns)),
        )
        db.add(derived_ds)
        db.commit()
        db.refresh(derived_ds)

        # Log audit entry in analysis history
        history_entry = AnalysisHistory(
            user_id=current_user.id,
            dataset_id=derived_ds.id,
            dataset_name=derived_ds.filename,
            query=f"JOIN: {left_dataset.filename}.{left_column} <-> {right_dataset.filename}.{right_column} [{join_how.upper()}]",
            analysis_type="dataset_join",
            result_json=json.dumps({
                "source_left_id": left_dataset.id,
                "source_left_filename": left_dataset.filename,
                "source_left_column": left_column,
                "source_right_id": right_dataset.id,
                "source_right_filename": right_dataset.filename,
                "source_right_column": right_column,
                "join_type": join_how,
                "resulting_rows": len(merged_df),
                "resulting_columns": len(merged_df.columns),
                "derived_dataset_id": derived_ds.id,
                "file_path": str(target_path),
            }),
            status="SUCCESS",
        )
        db.add(history_entry)
        db.commit()

        logger.info(
            f"Derived dataset '{final_filename}' created for user {current_user.id} "
            f"via {join_how.upper()} join ({len(merged_df)} rows, {len(merged_df.columns)} cols)."
        )

        return JoinApplyResponse(
            success=True,
            message=f"Successfully joined {left_dataset.filename} and {right_dataset.filename} into new dataset '{final_filename}'.",
            derived_dataset_id=derived_ds.id,
            derived_dataset_name=final_filename,
            rows=len(merged_df),
            columns=len(merged_df.columns),
            source_dataset_a=left_dataset.filename,
            source_dataset_b=right_dataset.filename,
            join_key=f"{left_column} <-> {right_column}",
            join_type=join_how.upper(),
            file_path=str(target_path),
        )