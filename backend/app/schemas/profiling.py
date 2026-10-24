"""Pydantic schemas for Data Profiling and Data Quality."""

from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from pydantic import BaseModel, Field


class DatasetOverview(BaseModel):
    """Structural overview of the dataset."""

    id: int
    name: str
    file_type: str
    rows: int
    columns: int
    total_cells: int
    file_size_bytes: int
    created_at: Optional[datetime] = None


class NumericStats(BaseModel):
    """Statistical moments and distribution metrics for numeric features."""

    count: int
    mean: float
    median: float
    std: float
    min: float
    max: float
    q1: float
    q3: float
    iqr: float
    histogram: Optional[List[Dict[str, Any]]] = None


class CategoricalValueCount(BaseModel):
    """Value frequency item."""

    value: str
    count: int
    percentage: float


class CategoricalStats(BaseModel):
    """Distribution metrics for categorical/text features."""

    unique_count: int
    most_frequent: Optional[str] = None
    frequency: int
    top_values: List[CategoricalValueCount] = Field(default_factory=list)
    top_5: Optional[List[Tuple[str, int]]] = None


class DatetimeStats(BaseModel):
    """Distribution metrics for datetime features."""

    min_date: Optional[str] = None
    max_date: Optional[str] = None
    unique_dates: int = 0
    date_range: Optional[str] = None


class ColumnProfileItem(BaseModel):
    """Detailed profile container for an individual column."""

    name: str
    data_type: str
    semantic_type: str  # NUMERIC, CATEGORICAL, DATETIME, BOOLEAN, TEXT, UNKNOWN
    non_null_count: int
    missing_count: int
    missing_percentage: float
    unique_count: int
    unique_percentage: float
    numeric_stats: Optional[NumericStats] = None
    categorical_stats: Optional[CategoricalStats] = None
    datetime_stats: Optional[DatetimeStats] = None


class MissingColumnInfo(BaseModel):
    """Summary item for a column containing missing values."""

    column: str
    missing_count: int
    missing_percentage: float
    type: str


class QualitySummary(BaseModel):
    """Data quality and structural hygiene diagnostic summary."""

    health_score: int
    health_status: str  # Excellent, Good, Moderate, Needs Attention, Poor
    health_explanation: str
    total_missing_cells: int
    missing_percentage: float
    columns_with_missing_count: int
    missing_columns: List[MissingColumnInfo] = Field(default_factory=list)
    highest_missing_columns: List[MissingColumnInfo] = Field(default_factory=list)
    duplicate_rows: int
    duplicate_percentage: float
    type_counts: Dict[str, int]
    constant_columns: List[str] = Field(default_factory=list)
    high_cardinality_columns: List[Dict[str, Any]] = Field(default_factory=list)


class DatasetProfileResponse(BaseModel):
    """Comprehensive dataset profiling response model."""

    dataset_info: DatasetOverview
    columns: List[ColumnProfileItem]
    quality_summary: QualitySummary
