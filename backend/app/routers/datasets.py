"""Datasets Router - Upload, retrieve, inspect, download, and delete tabular datasets."""

import os
import re
import json
import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.services.settings_service import SettingsService

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.dataset import Dataset
from app.schemas.dataset import (
    DatasetResponse,
    DatasetUploadResponse,
    DatasetFailedUpload,
    DatasetPreviewResponse,
)
from app.auth.dependencies import get_current_user
from utils.file_loader import FileLoader
from app.schemas.profiling import DatasetProfileResponse
from app.schemas.quality import DataQualityResponse
from app.services.quality_service import DataQualityService
from app.services.profiling_service import ProfilingService
from app.schemas.cleaning import (
    CleaningOperationsRequest,
    CleaningOverviewResponse,
    CleaningPreviewResponse,
    CleaningApplyResponse,
    ColumnValueSummaryResponse,
    CategoryInconsistenciesResponse,
    DateInspectionResponse,
)
from app.services.cleaning_service import DataCleaningService

router = APIRouter(prefix="/datasets", tags=["Datasets"])


@router.post("/upload", response_model=DatasetUploadResponse, status_code=status.HTTP_200_OK)
async def upload_datasets(
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Securely upload multiple tabular datasets (.csv, .xlsx, .xls) with user isolation."""
    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files selected. Please provide at least one CSV, XLSX, or XLS file.",
        )

    # 1. Establish user-isolated storage directory
    user_upload_dir = settings.UPLOAD_DIR / f"user_{current_user.id}"
    user_upload_dir.mkdir(parents=True, exist_ok=True)

    max_bytes = SettingsService.get_active_max_upload_size_mb(db) * 1024 * 1024
    storage_quota_bytes = SettingsService.get_active_max_user_storage_mb(db) * 1024 * 1024
    total_user_bytes = (
        db.query(func.coalesce(func.sum(Dataset.file_size_bytes), 0))
        .filter(Dataset.user_id == current_user.id)
        .scalar()
    ) or 0
    uploaded: List[Dataset] = []
    failed: List[dict] = []

    for upload_file in files:
        # 2. Sanitize original filename and prevent path traversal
        raw_name = upload_file.filename or "unknown"
        original_filename = Path(raw_name).name.strip()
        if not original_filename:
            failed.append({
                "filename": raw_name,
                "error": "Invalid or empty filename.",
            })
            continue

        # 3. Validate file extension
        suffix = Path(original_filename).suffix.lower()
        if suffix not in settings.ALLOWED_EXTENSIONS:
            failed.append({
                "filename": original_filename,
                "error": f"Unsupported file format '{suffix}'. Supported formats: CSV, XLSX, XLS.",
            })
            continue

        # 4. Generate unique safe storage name
        sanitized_stem = re.sub(r"[^a-zA-Z0-9_\.-]", "_", Path(original_filename).stem)[:60]
        stored_filename = f"{uuid.uuid4().hex}_{sanitized_stem}{suffix}"
        storage_path = user_upload_dir / stored_filename

        # 5. Stream and write file to disk while enforcing size limit
        bytes_written = 0
        is_oversized = False
        is_quota_exceeded = False

        try:
            with open(storage_path, "wb") as f_out:
                while True:
                    chunk = await upload_file.read(1024 * 1024)  # 1 MB chunks
                    if not chunk:
                        break
                    bytes_written += len(chunk)
                    if bytes_written > max_bytes:
                        is_oversized = True
                        break
                    if total_user_bytes + bytes_written > storage_quota_bytes:
                        is_quota_exceeded = True
                        break
                    f_out.write(chunk)
        except Exception as e:
            if storage_path.exists():
                storage_path.unlink(missing_ok=True)
            failed.append({
                "filename": original_filename,
                "error": f"Failed to save file: {str(e)}",
            })
            continue

        if is_oversized:
            if storage_path.exists():
                storage_path.unlink(missing_ok=True)
            failed.append({
                "filename": original_filename,
                "error": f"File is too large. Maximum allowed size is {round(max_bytes / (1024 * 1024))} MB.",
            })
            continue

        if is_quota_exceeded:
            if storage_path.exists():
                storage_path.unlink(missing_ok=True)
            failed.append({
                "filename": original_filename,
                "error": f"Workspace storage quota exceeded. Your account limit is {round(storage_quota_bytes / (1024 * 1024))} MB.",
            })
            continue

        if bytes_written <= 0:
            if storage_path.exists():
                storage_path.unlink(missing_ok=True)
            failed.append({
                "filename": original_filename,
                "error": "The uploaded file is empty (0 bytes). Please provide a file with data.",
            })
            continue

        # 6. Read and validate dataset using FileLoader
        load_result = FileLoader.load_file(storage_path, original_filename, bytes_written)
        if not load_result.success:
            if storage_path.exists():
                storage_path.unlink(missing_ok=True)
            failed.append({
                "filename": original_filename,
                "error": load_result.error_message or "Unable to read dataset content.",
            })
            continue

        # 7. Extract structural metadata
        row_count = load_result.rows
        column_count = load_result.columns
        column_names = [str(c) for c in load_result.df.columns.tolist()] if load_result.df is not None else []
        file_type = load_result.file_type

        # 8. Create and persist Dataset database record
        try:
            dataset = Dataset(
                user_id=current_user.id,
                filename=original_filename,
                stored_filename=stored_filename,
                file_type=file_type,
                file_path=str(storage_path),
                rows=row_count,
                columns=column_count,
                file_size_bytes=bytes_written,
                column_names_json=json.dumps(column_names),
                has_cleaned=False,
            )
            db.add(dataset)
            db.commit()
            db.refresh(dataset)

            # Compute preview and missing values metadata from load_result.df
            preview_rows = []
            total_missing = 0
            missing_columns = []
            if load_result.df is not None:
                preview_rows = DataCleaningService._sanitize_for_json(load_result.df.head(5).to_dict(orient="records"))
                missing_series = load_result.df.isna().sum()
                total_missing = int(missing_series.sum())
                missing_columns = [
                    {
                        "column": str(c),
                        "missing_count": int(cnt),
                        "missing_percentage": round((float(cnt) / max(len(load_result.df), 1)) * 100, 2),
                    }
                    for c, cnt in missing_series.items()
                    if cnt > 0
                ]

            dataset.preview_rows = preview_rows
            dataset.total_missing_cells = total_missing
            dataset.missing_columns = missing_columns

            uploaded.append(dataset)
            total_user_bytes += bytes_written
        except Exception as e:
            db.rollback()
            if storage_path.exists():
                storage_path.unlink(missing_ok=True)
            failed.append({
                "filename": original_filename,
                "error": f"Database error creating dataset record: {str(e)}",
            })

    total_up = len(uploaded)
    total_fail = len(failed)

    if total_up > 0 and total_fail == 0:
        msg = f"{total_up} dataset{'s' if total_up > 1 else ''} uploaded successfully."
    elif total_up > 0 and total_fail > 0:
        msg = f"{total_up} dataset{'s' if total_up > 1 else ''} uploaded, {total_fail} failed."
    else:
        msg = f"Failed to upload {total_fail} dataset{'s' if total_fail > 1 else ''}."

    return {
        "message": msg,
        "uploaded": uploaded,
        "failed": failed,
        "total_uploaded": total_up,
        "total_failed": total_fail,
    }


@router.get("", response_model=List[DatasetResponse])
@router.get("/", response_model=List[DatasetResponse])
def get_user_datasets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve all datasets belonging to the authenticated user."""
    return (
        db.query(Dataset)
        .filter(Dataset.user_id == current_user.id)
        .order_by(Dataset.created_at.desc())
        .all()
    )


@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset_by_id(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve metadata for a specific dataset belonging to the current user."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )
    return dataset


@router.get("/{dataset_id}/preview", response_model=DatasetPreviewResponse)
def get_dataset_preview(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve sample 5-row preview and missing values metadata for an uploaded dataset."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )
    file_path = Path(dataset.file_path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset file not found on disk.",
        )
    load_result = FileLoader.load_file(file_path, dataset.filename, dataset.file_size_bytes or 0)
    if not load_result.success or load_result.df is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=load_result.error_message or "Unable to read dataset content.",
        )
    df = load_result.df
    preview_rows = DataCleaningService._sanitize_for_json(df.head(5).to_dict(orient="records"))
    missing_series = df.isna().sum()
    total_missing = int(missing_series.sum())
    missing_cols = [
        {
            "column": str(c),
            "missing_count": int(cnt),
            "missing_percentage": round((float(cnt) / max(len(df), 1)) * 100, 2),
        }
        for c, cnt in missing_series.items()
        if cnt > 0
    ]
    cols = json.loads(dataset.column_names_json) if dataset.column_names_json else [str(c) for c in df.columns]
    return DatasetPreviewResponse(
        id=dataset.id,
        filename=dataset.filename,
        file_type=(dataset.file_type or "CSV").upper(),
        rows=dataset.rows,
        columns=dataset.columns,
        column_names=cols,
        preview_rows=preview_rows,
        total_missing_cells=total_missing,
        missing_columns=missing_cols,
    )


@router.get("/{dataset_id}/download")
def download_dataset(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Securely download the original dataset file."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )

    file_path = Path(dataset.file_path)
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset file not found on disk.",
        )

    suffix = file_path.suffix.lower()
    media_type = "application/octet-stream"
    if suffix == ".csv":
        media_type = "text/csv"
    elif suffix == ".xlsx":
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif suffix == ".xls":
        media_type = "application/vnd.ms-excel"

    return FileResponse(
        path=str(file_path),
        filename=dataset.filename,
        media_type=media_type,
    )


@router.delete("/{dataset_id}")
def delete_dataset(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a dataset and its physical file on disk."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )

    # Delete physical file on disk
    try:
        file_path = Path(dataset.file_path)
        if file_path.exists() and file_path.is_file():
            file_path.unlink()
        if dataset.cleaned_file_path:
            cleaned_path = Path(dataset.cleaned_file_path)
            if cleaned_path.exists() and cleaned_path.is_file():
                cleaned_path.unlink()
    except Exception:
        # Gracefully continue with database record removal even if physical file was missing
        pass

    filename = dataset.filename
    db.delete(dataset)
    db.commit()

    return {"message": f"Dataset '{filename}' successfully deleted."}

@router.get("/{dataset_id}/profile", response_model=DatasetProfileResponse)
def get_dataset_profile(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve comprehensive statistical and data hygiene profile for a dataset."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )
    return ProfilingService.get_dataset_profile(dataset)


from app.schemas.analysis import (
    MultiDatasetAnalysisRequest,
    MultiDatasetAnalysisResponse,
)
from app.services.multi_dataset_service import MultiDatasetAnalysisService


@router.post("/multi-profile", response_model=MultiDatasetAnalysisResponse)
def profile_multiple_datasets(
    request: MultiDatasetAnalysisRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Profile and compare multiple datasets simultaneously with partial failure resilience."""
    return MultiDatasetAnalysisService.analyze_datasets(
        dataset_ids=request.dataset_ids,
        mode=request.mode or "all",
        settings=request.settings,
        current_user=current_user,
        db=db,
    )




@router.get("/{dataset_id}/quality", response_model=DataQualityResponse)
def get_dataset_quality(
    dataset_id: int,
    version: str = Query("original", description="Dataset version: 'original' or 'cleaned'"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve comprehensive data quality analysis for an uploaded dataset."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )
    return DataQualityService.analyze_dataset_quality(dataset, version=version)



@router.get("/{dataset_id}/cleaning", response_model=CleaningOverviewResponse)
def get_dataset_cleaning_overview(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve cleaning overview and diagnostics for a dataset."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )
    return DataCleaningService.get_cleaning_overview(dataset, db)


@router.get("/{dataset_id}/column-summary", response_model=ColumnValueSummaryResponse)
def get_dataset_column_summary(
    dataset_id: int,
    column: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve unique values, frequencies, and percentages for a specific column."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found.")
    return DataCleaningService.get_column_value_summary(dataset, column)


@router.get("/{dataset_id}/category-inconsistencies", response_model=CategoryInconsistenciesResponse)
def get_dataset_category_inconsistencies(
    dataset_id: int,
    column: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Identify similar/equivalent categorical values for user-defined mapping."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found.")
    return DataCleaningService.detect_category_clusters(dataset, column)


@router.get("/{dataset_id}/date-inspection", response_model=DateInspectionResponse)
def inspect_dataset_date_column(
    dataset_id: int,
    column: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Inspect date column parsing, format detection, and invalid values."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found.")
    return DataCleaningService.inspect_date_column(dataset, column)


@router.post("/{dataset_id}/cleaning/preview", response_model=CleaningPreviewResponse)
def preview_dataset_cleaning(
    dataset_id: int,
    operations: CleaningOperationsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Preview cleaning transformations for a dataset."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )
    return DataCleaningService.preview_cleaning(dataset, operations)


@router.post("/{dataset_id}/cleaning/apply", response_model=CleaningApplyResponse)
def apply_dataset_cleaning(
    dataset_id: int,
    operations: CleaningOperationsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply cleaning operations to a dataset."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )
    return DataCleaningService.apply_cleaning(dataset, operations, current_user, db)


@router.get("/{dataset_id}/cleaning/download")
def download_dataset_cleaned_file(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Download cleaned dataset artifact."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )
    if not dataset.has_cleaned or not dataset.cleaned_file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No cleaned version available for this dataset.",
        )
    file_p = Path(dataset.cleaned_file_path)
    if not file_p.exists() or not file_p.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cleaned dataset file not found on storage disk.",
        )
    download_name = f"cleaned_{Path(dataset.filename).stem}.csv"
    return FileResponse(
        path=str(file_p),
        filename=download_name,
        media_type="text/csv",
    )


@router.post("/{dataset_id}/cleaning/reset")
def reset_dataset_cleaning(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reset cleaned dataset state back to original."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )
    DataCleaningService.reset_cleaning(dataset, db)
    return {"success": True, "message": "Cleaned dataset reset successfully."}

# =========================================================================
# MULTI-DATASET RELATIONSHIPS & SAFE JOINS
# =========================================================================

from app.schemas.relationship import (
    RelationshipDetectRequest,
    RelationshipDetectResponse,
    JoinPreviewRequest,
    JoinPreviewResponse,
    JoinApplyRequest,
    JoinApplyResponse,
)
from app.services.relationship_service import RelationshipService


@router.post("/relationships/detect", response_model=RelationshipDetectResponse)
def detect_dataset_relationships(
    request: RelationshipDetectRequest = RelationshipDetectRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Discover relationships between selected or all uploaded datasets for current user."""
    query = db.query(Dataset).filter(Dataset.user_id == current_user.id)
    if request.dataset_ids:
        query = query.filter(Dataset.id.in_(request.dataset_ids))
    return RelationshipService.detect_relationships(query.all())


@router.get("/relationships", response_model=RelationshipDetectResponse)
def get_all_dataset_relationships(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Discover relationships among all uploaded datasets for current user."""
    datasets = db.query(Dataset).filter(Dataset.user_id == current_user.id).all()
    return RelationshipService.detect_relationships(datasets)


@router.post("/relationships/preview", response_model=JoinPreviewResponse)
@router.post("/join/preview", response_model=JoinPreviewResponse)
def preview_dataset_join(
    request: JoinPreviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Dry-run preview join calculation and sample rows."""
    left_ds = db.query(Dataset).filter(Dataset.id == request.left_dataset_id, Dataset.user_id == current_user.id).first()
    right_ds = db.query(Dataset).filter(Dataset.id == request.right_dataset_id, Dataset.user_id == current_user.id).first()
    if not left_ds or not right_ds:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or both datasets not found.")
    return RelationshipService.preview_join(
        left_dataset=left_ds,
        left_column=request.left_column,
        right_dataset=right_ds,
        right_column=request.right_column,
        join_type=request.join_type,
        limit=request.limit,
    )


@router.post("/join/apply", response_model=JoinApplyResponse)
def apply_dataset_join(
    request: JoinApplyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Execute join upon user confirmation and create a derived dataset."""
    left_ds = db.query(Dataset).filter(Dataset.id == request.left_dataset_id, Dataset.user_id == current_user.id).first()
    right_ds = db.query(Dataset).filter(Dataset.id == request.right_dataset_id, Dataset.user_id == current_user.id).first()
    if not left_ds or not right_ds:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or both datasets not found.")
    return RelationshipService.apply_join(
        left_dataset=left_ds,
        left_column=request.left_column,
        right_dataset=right_ds,
        right_column=request.right_column,
        join_type=request.join_type,
        custom_dataset_name=request.custom_dataset_name,
        user_confirmed=request.user_confirmed,
        current_user=current_user,
        db=db,
    )
