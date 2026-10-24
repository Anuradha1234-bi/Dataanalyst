"""Profiling Service - Orchestrates dataset loading, statistical distribution profiling, and quality diagnostics."""

import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
import pandas as pd

from app.models.dataset import Dataset
from app.schemas.profiling import (
    DatasetOverview,
    NumericStats,
    CategoricalValueCount,
    CategoricalStats,
    DatetimeStats,
    ColumnProfileItem,
    MissingColumnInfo,
    QualitySummary,
    DatasetProfileResponse,
)
from utils.file_loader import FileLoader
from agents.profiler import ProfilerAgent, ProfileResult


class ProfilingService:
    """Service encapsulating data profiling calculations and quality score computation."""

    @classmethod
    def get_dataset_profile(cls, dataset: Dataset, active: bool = True) -> DatasetProfileResponse:
        """Compute full statistical and hygiene profile for a dataset database record."""
        # 1. Verify physical file exists on disk (resolving active cleaned file if available)
        if active and dataset.has_cleaned and dataset.cleaned_file_path:
            p = Path(dataset.cleaned_file_path)
            file_path = p if (p.exists() and p.is_file()) else Path(dataset.file_path)
        else:
            file_path = Path(dataset.file_path)

        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset file '{dataset.filename}' not found on storage disk.",
            )

        # 2. Ingest and parse file with FileLoader
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

        # 3. Validate non-empty dataset
        if df.empty or len(df) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The selected dataset '{dataset.filename}' is empty (0 rows).",
            )

        # 4. Execute deep profiling engine
        profile_result: ProfileResult = ProfilerAgent.profile_dataset(df)

        # 5. Build Dataset Overview
        dataset_info = DatasetOverview(
            id=dataset.id,
            name=dataset.original_filename or dataset.filename,
            file_type=(dataset.file_type or "CSV").upper(),
            rows=profile_result.total_rows,
            columns=profile_result.total_columns,
            total_cells=profile_result.total_cells,
            file_size_bytes=dataset.file_size or dataset.file_size_bytes or 0,
            created_at=dataset.created_at,
        )

        # 6. Build Columns List
        columns_list: List[ColumnProfileItem] = []
        for col_name, cp in profile_result.columns.items():
            num_stats = None
            if cp.numeric_stats:
                num_stats = NumericStats(
                    count=int(cp.numeric_stats.get("count", 0)),
                    mean=float(cp.numeric_stats.get("mean", 0.0)),
                    median=float(cp.numeric_stats.get("median", 0.0)),
                    std=float(cp.numeric_stats.get("std", 0.0)),
                    min=float(cp.numeric_stats.get("min", 0.0)),
                    max=float(cp.numeric_stats.get("max", 0.0)),
                    q1=float(cp.numeric_stats.get("q1", 0.0)),
                    q3=float(cp.numeric_stats.get("q3", 0.0)),
                    iqr=float(cp.numeric_stats.get("iqr", 0.0)),
                    histogram=cp.numeric_stats.get("histogram"),
                )

            cat_stats = None
            if cp.categorical_stats:
                top_vals = [
                    CategoricalValueCount(
                        value=str(tv.get("value", "")),
                        count=int(tv.get("count", 0)),
                        percentage=float(tv.get("percentage", 0.0)),
                    )
                    for tv in cp.categorical_stats.get("top_values", [])
                ]
                cat_stats = CategoricalStats(
                    unique_count=int(cp.categorical_stats.get("unique_count", cp.unique_count)),
                    most_frequent=str(cp.categorical_stats.get("most_frequent", "N/A")),
                    frequency=int(cp.categorical_stats.get("frequency", 0)),
                    top_values=top_vals,
                    top_5=cp.categorical_stats.get("top_5"),
                )

            dt_stats = None
            if cp.datetime_stats:
                dt_stats = DatetimeStats(
                    min_date=cp.datetime_stats.get("min_date"),
                    max_date=cp.datetime_stats.get("max_date"),
                    unique_dates=int(cp.datetime_stats.get("unique_dates", 0)),
                    date_range=cp.datetime_stats.get("date_range"),
                )

            columns_list.append(
                ColumnProfileItem(
                    name=cp.name,
                    data_type=cp.dtype,
                    semantic_type=cp.semantic_type,
                    non_null_count=cp.non_null_count,
                    missing_count=cp.missing_count,
                    missing_percentage=cp.missing_percentage,
                    unique_count=cp.unique_count,
                    unique_percentage=cp.unique_percentage,
                    numeric_stats=num_stats,
                    categorical_stats=cat_stats,
                    datetime_stats=dt_stats,
                )
            )

        # 7. Build Quality Summary
        raw_missing = [
            MissingColumnInfo(
                column=str(mc.get("column", "")),
                missing_count=int(mc.get("missing_count", 0)),
                missing_percentage=float(mc.get("missing_percentage", 0.0)),
                type=str(mc.get("type", "UNKNOWN")),
            )
            for mc in profile_result.quality.missing_columns
        ]

        highest_missing = sorted(
            raw_missing, key=lambda item: item.missing_percentage, reverse=True
        )[:5]

        quality_summary = QualitySummary(
            health_score=profile_result.quality.health_score,
            health_status=profile_result.quality.health_status,
            health_explanation=profile_result.quality.health_explanation,
            total_missing_cells=profile_result.total_missing,
            missing_percentage=profile_result.missing_percentage,
            columns_with_missing_count=len(raw_missing),
            missing_columns=raw_missing,
            highest_missing_columns=highest_missing,
            duplicate_rows=profile_result.duplicate_rows,
            duplicate_percentage=profile_result.duplicate_percentage,
            type_counts=profile_result.type_counts,
            constant_columns=profile_result.quality.constant_columns,
            high_cardinality_columns=profile_result.quality.high_cardinality_columns,
        )

        return DatasetProfileResponse(
            dataset_info=dataset_info,
            columns=columns_list,
            quality_summary=quality_summary,
        )
