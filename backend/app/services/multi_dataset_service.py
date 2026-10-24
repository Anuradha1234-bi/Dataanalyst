"""Multi-Dataset Analysis Service.

Coordinates individual dataset profiling, multi-dataset combined overviews,
cross-dataset schema comparison, and relationship discovery across 2+ datasets.
Ensures tenant isolation, partial failure tolerance, and zero mutation of source files.
"""

import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Set
from fastapi import HTTPException, status
import pandas as pd
from sqlalchemy.orm import Session

from app.models.dataset import Dataset
from app.models.user import User
from app.schemas.analysis import (
    MultiDatasetAnalysisResponse,
    DatasetAnalysisError,
    DatasetSummaryItem,
    CombinedOverview,
    DatasetComparisonResponse,
    ColumnComparisonItem,
    ColumnPresenceDetail,
)
from app.schemas.profiling import DatasetProfileResponse
from app.schemas.relationship import RelationshipItem
from app.services.profiling_service import ProfilingService
from services.relationship_detector import RelationshipDetector
from utils.file_loader import FileLoader


def _normalize_name(name: str) -> str:
    """Normalize column name for fuzzy semantic alignment."""
    cleaned = re.sub(r"[^a-zA-Z0-9]", "", str(name).lower())
    return cleaned


def _are_types_compatible(dtype_a: str, dtype_b: str) -> bool:
    """Check if two data types can be compared or joined without truncation."""
    a = dtype_a.lower()
    b = dtype_b.lower()

    if a == b:
        return True

    # Numeric compatibility
    num_keywords = ("int", "float", "double", "num", "real", "decimal")
    a_is_num = any(k in a for k in num_keywords)
    b_is_num = any(k in b for k in num_keywords)
    if a_is_num and b_is_num:
        return True

    # String / Text compatibility
    str_keywords = ("str", "object", "text", "char", "varchar")
    a_is_str = any(k in a for k in str_keywords)
    b_is_str = any(k in b for k in str_keywords)
    if a_is_str and b_is_str:
        return True

    # Datetime compatibility
    date_keywords = ("date", "time")
    a_is_date = any(k in a for k in date_keywords)
    b_is_date = any(k in b for k in date_keywords)
    if a_is_date and b_is_date:
        return True

    return False


class MultiDatasetAnalysisService:
    """Orchestrates comprehensive multi-file analysis, comparisons, and relationships."""

    @classmethod
    def analyze_datasets(
        cls,
        dataset_ids: List[int],
        mode: str = "all",
        settings: Optional[Dict[str, Any]] = None,
        current_user: Optional[User] = None,
        db: Optional[Session] = None,
    ) -> MultiDatasetAnalysisResponse:
        """Run robust multi-dataset analysis with partial failure tolerance."""
        if not dataset_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one dataset ID must be provided.",
            )

        if not current_user or not db:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authenticated session and database connection required.",
            )

        unique_ids = list(dict.fromkeys(dataset_ids))
        total_selected = len(unique_ids)

        # 1. Fetch datasets strictly owned by the current user
        db_datasets = (
            db.query(Dataset)
            .filter(Dataset.id.in_(unique_ids), Dataset.user_id == current_user.id)
            .all()
        )
        found_map = {d.id: d for d in db_datasets}

        errors: List[DatasetAnalysisError] = []
        individual_profiles: Dict[int, DatasetProfileResponse] = {}
        loaded_dfs: Dict[str, pd.DataFrame] = {}
        summary_items: List[DatasetSummaryItem] = []

        # 2. Check for missing or unauthorized IDs
        for req_id in unique_ids:
            if req_id not in found_map:
                errors.append(
                    DatasetAnalysisError(
                        dataset_id=req_id,
                        dataset_name=None,
                        error="Dataset not found or access denied.",
                    )
                )

        # 3. Profile each found dataset individually with isolated try/except
        for ds in db_datasets:
            ds_name = ds.original_filename or ds.filename or f"dataset_{ds.id}"
            try:
                # Check physical file with safe active/cleaned resolution and path fallback
                resolved_fpath = None
                candidates = []
                if ds.has_cleaned and ds.cleaned_file_path:
                    candidates.append(Path(ds.cleaned_file_path))
                if ds.file_path:
                    candidates.append(Path(ds.file_path))

                for cand in candidates:
                    if cand.exists() and cand.is_file():
                        resolved_fpath = cand
                        break
                    if not cand.is_absolute():
                        cand_b = Path("backend") / cand
                        if cand_b.exists() and cand_b.is_file():
                            resolved_fpath = cand_b
                            break

                if not resolved_fpath:
                    errors.append(
                        DatasetAnalysisError(
                            dataset_id=ds.id,
                            dataset_name=ds_name,
                            error=f"File '{ds_name}' is missing from storage. Please re-upload this dataset or remove it from your selection to proceed.",
                        )
                    )
                    continue

                fpath = resolved_fpath

                # Load DataFrame
                load_res = FileLoader.load_file(
                    file_obj=str(fpath),
                    filename=ds.filename,
                    file_size_bytes=ds.file_size_bytes,
                )
                if not load_res.success or load_res.df is None or load_res.df.empty:
                    err_msg = load_res.error_message or "Dataset is empty or could not be parsed."
                    errors.append(
                        DatasetAnalysisError(
                            dataset_id=ds.id,
                            dataset_name=ds_name,
                            error=err_msg,
                        )
                    )
                    continue

                # Compute Profile (respecting active cleaned version)
                profile = ProfilingService.get_dataset_profile(ds, active=True)
                individual_profiles[ds.id] = profile
                loaded_dfs[ds_name] = load_res.df

                # Count semantic column distributions
                num_count = sum(1 for c in profile.columns if c.semantic_type == "NUMERIC")
                cat_count = sum(1 for c in profile.columns if c.semantic_type in ("CATEGORICAL", "TEXT"))
                dt_count = sum(1 for c in profile.columns if c.semantic_type == "DATETIME")

                summary_items.append(
                    DatasetSummaryItem(
                        dataset_id=ds.id,
                        name=ds_name,
                        file_type=(ds.file_type or "CSV").upper(),
                        rows=profile.dataset_info.rows,
                        columns=profile.dataset_info.columns,
                        total_cells=profile.dataset_info.total_cells,
                        missing_cells=profile.quality_summary.total_missing_cells,
                        missing_percentage=profile.quality_summary.missing_percentage,
                        duplicate_rows=profile.quality_summary.duplicate_rows,
                        duplicate_percentage=profile.quality_summary.duplicate_percentage,
                        file_size_bytes=profile.dataset_info.file_size_bytes,
                        health_score=profile.quality_summary.health_score,
                        health_status=profile.quality_summary.health_status,
                        numeric_columns_count=num_count,
                        categorical_columns_count=cat_count,
                        datetime_columns_count=dt_count,
                    )
                )
            except Exception as e:
                errors.append(
                    DatasetAnalysisError(
                        dataset_id=ds.id,
                        dataset_name=ds_name,
                        error=f"Profiling error: {str(e)}",
                    )
                )

        total_successful = len(individual_profiles)
        total_failed = len(errors)

        # 4. Handle complete failure case
        if total_successful == 0:
            return MultiDatasetAnalysisResponse(
                status="failed",
                message="All selected datasets failed analysis.",
                mode=mode,
                total_selected=total_selected,
                total_successful=0,
                total_failed=total_failed,
                errors=errors,
                individual_profiles={},
                combined_overview=None,
                comparison=None,
                relationships=[],
                cross_dataset_insights=[],
            )

        # 5. Build Combined Overview
        tot_rows = sum(s.rows for s in summary_items)
        tot_cols = sum(s.columns for s in summary_items)
        tot_cells = sum(s.total_cells for s in summary_items)
        tot_missing = sum(s.missing_cells for s in summary_items)
        overall_missing_pct = round((tot_missing / tot_cells * 100.0), 2) if tot_cells > 0 else 0.0
        tot_duplicates = sum(s.duplicate_rows for s in summary_items)
        overall_duplicate_pct = round((tot_duplicates / tot_rows * 100.0), 2) if tot_rows > 0 else 0.0

        combined_overview = CombinedOverview(
            total_datasets=total_successful,
            total_rows=tot_rows,
            total_columns=tot_cols,
            total_cells=tot_cells,
            total_missing_cells=tot_missing,
            overall_missing_percentage=overall_missing_pct,
            total_duplicate_rows=tot_duplicates,
            overall_duplicate_percentage=overall_duplicate_pct,
            dataset_summaries=summary_items,
        )

        # 6. Build Multi-Dataset Comparison
        comparison: Optional[DatasetComparisonResponse] = None
        relationships_list: List[RelationshipItem] = []
        insights: List[str] = []

        if total_successful >= 2:
            successful_datasets = [ds for ds in db_datasets if ds.id in individual_profiles]
            comparison = cls._compare_datasets_internal(successful_datasets, individual_profiles)
            # Run Relationship Detection on successful datasets
            try:
                from app.services.relationship_service import RelationshipService
                rel_resp = RelationshipService.detect_relationships(successful_datasets)
                relationships_list = rel_resp.relationships
            except Exception as e:
                insights.append(f"Relationship detection encountered an issue: {str(e)}")

            # Synthesize Cross-Dataset Insights
            insights.extend(
                cls._synthesize_insights(
                    combined_overview,
                    comparison,
                    relationships_list,
                )
            )
        else:
            comparison = DatasetComparisonResponse(
                shared_columns=[],
                shared_across_all_columns=[],
                unique_columns={},
                column_matrix=[],
                type_mismatches=[],
                is_comparable=False,
                comparability_notes="Comparison requires at least 2 successfully analyzed datasets.",
            )
            insights.append("Analyzed 1 dataset individually. Select 2 or more datasets to discover relationships and schema overlaps.")

        # Determine overall operation status
        overall_status = "success" if total_failed == 0 else "partial"
        status_msg = (
            f"Successfully analyzed {total_successful} dataset{'s' if total_successful > 1 else ''}."
            if total_failed == 0
            else f"Analyzed {total_successful} dataset{'s' if total_successful > 1 else ''}, with {total_failed} failure(s)."
        )

        return MultiDatasetAnalysisResponse(
            status=overall_status,
            message=status_msg,
            mode=mode,
            total_selected=total_selected,
            total_successful=total_successful,
            total_failed=total_failed,
            errors=errors,
            individual_profiles=individual_profiles,
            combined_overview=combined_overview,
            comparison=comparison,
            relationships=relationships_list,
            cross_dataset_insights=insights,
        )

    @classmethod
    def _compare_datasets_internal(
        cls,
        datasets: List[Dataset],
        profiles: Dict[int, DatasetProfileResponse],
    ) -> DatasetComparisonResponse:
        """Construct schema comparison matrix, shared columns, and type checks."""
        dataset_name_map = {
            ds.id: ds.original_filename or ds.filename or f"dataset_{ds.id}"
            for ds in datasets
            if ds.id in profiles
        }

        # Track columns per dataset
        dataset_cols: Dict[int, Dict[str, Any]] = {}
        all_raw_cols: Set[str] = set()

        for ds_id, prof in profiles.items():
            dataset_cols[ds_id] = {}
            for col in prof.columns:
                dataset_cols[ds_id][col.name] = col
                all_raw_cols.add(col.name)

        # Build column matrix
        column_matrix: List[ColumnComparisonItem] = []
        shared_cols: List[str] = []
        shared_all_cols: List[str] = []
        type_mismatches: List[Dict[str, Any]] = []
        unique_columns_map: Dict[str, List[str]] = {name: [] for name in dataset_name_map.values()}

        for col_name in sorted(all_raw_cols, key=lambda s: s.lower()):
            present_ids: List[int] = []
            present_names: List[str] = []
            details_map: Dict[str, ColumnPresenceDetail] = {}
            seen_types: List[str] = []

            for ds_id, cols_dict in dataset_cols.items():
                ds_name = dataset_name_map[ds_id]
                if col_name in cols_dict:
                    col_info = cols_dict[col_name]
                    present_ids.append(ds_id)
                    present_names.append(ds_name)
                    details_map[ds_name] = ColumnPresenceDetail(
                        dataset_id=ds_id,
                        dataset_name=ds_name,
                        data_type=col_info.data_type,
                        semantic_type=col_info.semantic_type,
                        missing_count=col_info.missing_count,
                        missing_percentage=col_info.missing_percentage,
                        unique_count=col_info.unique_count,
                        unique_percentage=col_info.unique_percentage,
                    )
                    seen_types.append(col_info.data_type)

            is_shared = len(present_ids) >= 2
            is_all = len(present_ids) == len(dataset_cols)

            if is_shared:
                shared_cols.append(col_name)
            if is_all:
                shared_all_cols.append(col_name)
            if len(present_ids) == 1:
                unique_columns_map[present_names[0]].append(col_name)

            # Check type compatibility across present datasets
            type_compat = True
            type_warn = None
            if len(seen_types) >= 2:
                base_type = seen_types[0]
                for ot in seen_types[1:]:
                    if not _are_types_compatible(base_type, ot):
                        type_compat = False
                        type_warn = f"Data type mismatch: '{base_type}' vs '{ot}' across datasets."
                        type_mismatches.append({
                            "column": col_name,
                            "types": seen_types,
                            "datasets": present_names,
                            "warning": type_warn,
                        })
                        break

            column_matrix.append(
                ColumnComparisonItem(
                    column_name=col_name,
                    normalized_name=_normalize_name(col_name),
                    present_in_dataset_ids=present_ids,
                    present_in_dataset_names=present_names,
                    is_shared=is_shared,
                    is_shared_across_all=is_all,
                    dataset_details=details_map,
                    type_compatible=type_compat,
                    type_mismatch_warning=type_warn,
                )
            )

        # Assess overall comparability
        is_comparable = len(shared_cols) > 0
        if is_comparable:
            notes = (
                f"Selected datasets share {len(shared_cols)} common column(s) "
                f"({len(shared_all_cols)} across all {len(dataset_cols)} datasets). "
                f"Valid structural alignment detected for cross-dataset analysis and joins."
            )
        else:
            notes = (
                "These datasets share no common column names. Cross-dataset comparisons "
                "or joins cannot be conducted directly unless relationships are established "
                "via aliased candidate keys."
            )

        return DatasetComparisonResponse(
            shared_columns=shared_cols,
            shared_across_all_columns=shared_all_cols,
            unique_columns=unique_columns_map,
            column_matrix=column_matrix,
            type_mismatches=type_mismatches,
            is_comparable=is_comparable,
            comparability_notes=notes,
        )

    @classmethod
    def _synthesize_insights(
        cls,
        overview: CombinedOverview,
        comparison: DatasetComparisonResponse,
        relationships: List[RelationshipItem],
    ) -> List[str]:
        """Generate verified, data-backed insights from analysis outputs."""
        insights: List[str] = []

        # 1. Scale insight
        insights.append(
            f"Combined repository contains {overview.total_rows:,} records across "
            f"{overview.total_datasets} datasets ({overview.total_columns} total features)."
        )

        # 2. Quality & Missing values insight
        if overview.overall_missing_percentage > 5.0:
            insights.append(
                f"Attention: Overall missing data across selected datasets is {overview.overall_missing_percentage}%. "
                f"Review column health prior to join operations."
            )
        else:
            insights.append(
                f"Data completeness is high: Only {overview.overall_missing_percentage}% missing values "
                f"across all selected datasets."
            )

        # 3. Schema comparability insight
        if comparison.is_comparable:
            insights.append(
                f"Found {len(comparison.shared_columns)} shared attribute(s) "
                f"({', '.join(comparison.shared_columns[:4])}{'...' if len(comparison.shared_columns) > 4 else ''}) "
                f"enabling cross-dataset comparison."
            )
            if comparison.type_mismatches:
                insights.append(
                    f"Warning: {len(comparison.type_mismatches)} shared column(s) have conflicting data types. "
                    f"Casting may be required before performing relational joins."
                )
        else:
            insights.append(
                "Datasets have distinct schemas with zero identical column names. "
                "Automatic comparison is limited; inspect candidate relationships for matching keys."
            )

        # 4. Relational insight
        confirmed_rels = [
            r for r in relationships
            if not getattr(r, "is_candidate", False) and (
                r.confidence in ("HIGH", "MEDIUM") or getattr(r, "confidence_score", 0.0) >= 60.0
            )
        ]
        safe_joins = [r for r in relationships if getattr(r, "safe_for_join", True)]

        if confirmed_rels:
            best_rel = confirmed_rels[0]
            conf_str = f"{best_rel.confidence_score:.0f}%" if getattr(best_rel, "confidence_score", None) is not None else str(best_rel.confidence)
            insights.append(
                f"Confirmed relationship: '{best_rel.source_dataset_name if hasattr(best_rel, 'source_dataset_name') else ''}.{best_rel.source_column}' matches "
                f"'{best_rel.target_dataset_name if hasattr(best_rel, 'target_dataset_name') else ''}.{best_rel.target_column}' ({best_rel.cardinality_symbol} cardinality, "
                f"{conf_str} confidence). {best_rel.cardinality_explanation}"
            )
        elif relationships:
            insights.append(
                f"Detected {len(relationships)} candidate key relationship(s) with partial overlap. "
                f"Review candidate matches in the Relationships tab before joining."
            )
        else:
            insights.append(
                "No strong relational keys detected between the selected datasets. "
                "Row multiplication or unrelated records would result from arbitrary combination."
            )

        return insights
