"""Pydantic schemas for Datasets."""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class DatasetResponse(BaseModel):
    """Schema for returning dataset metadata."""

    id: int
    user_id: int
    original_filename: str
    filename: str  # Alias for backward compatibility
    stored_filename: Optional[str] = None
    file_type: str
    file_size: int
    file_size_bytes: int  # Alias for backward compatibility
    storage_path: Optional[str] = None
    row_count: int
    column_count: int
    rows: int  # Alias for backward compatibility
    columns: int  # Alias for backward compatibility
    column_names: Optional[List[str]] = Field(default_factory=list)
    has_cleaned: bool = False
    preview_rows: Optional[List[Dict[str, Any]]] = None
    total_missing_cells: Optional[int] = None
    missing_columns: Optional[List[Dict[str, Any]]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DatasetPreviewResponse(BaseModel):
    """Schema for dataset preview records and missing values."""

    id: int
    filename: str
    file_type: str
    rows: int
    columns: int
    column_names: List[str] = Field(default_factory=list)
    preview_rows: List[Dict[str, Any]] = Field(default_factory=list)
    total_missing_cells: int = 0
    missing_columns: List[Dict[str, Any]] = Field(default_factory=list)


class DatasetFailedUpload(BaseModel):
    """Details for a single failed file in a multi-file upload."""

    filename: str
    error: str


class DatasetUploadResponse(BaseModel):
    """Schema for multi-file upload response."""

    message: str
    uploaded: List[DatasetResponse]
    failed: List[DatasetFailedUpload]
    total_uploaded: int
    total_failed: int


class DatasetDeleteResponse(BaseModel):
    """Schema for dataset deletion confirmation."""

    message: str
    id: int
