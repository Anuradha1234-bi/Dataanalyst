"""Pydantic Schemas for Anomaly and Outlier Detection Module."""

from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field


class AnomalyDetectRequest(BaseModel):
    """Request payload to execute anomaly & outlier detection on a dataset."""
    dataset_id: int = Field(..., description="ID of the dataset to analyze.")
    version: Optional[str] = Field(
        default="original",
        description="Dataset version: 'original' or 'cleaned'."
    )
    method: str = Field(
        default="both",
        description="Detection method: 'iqr', 'isolation_forest', or 'both'."
    )
    columns: Optional[List[str]] = Field(
        default=None,
        description="Optional subset of numeric columns to analyze. If omitted, all suitable numeric columns are used."
    )
    multiplier: float = Field(
        default=1.5,
        ge=0.5,
        le=5.0,
        description="IQR multiplier (1.5 for standard outliers, 3.0 for extreme outliers)."
    )
    contamination: float = Field(
        default=0.05,
        ge=0.001,
        le=0.5,
        description="Expected proportion of outliers in the data for Isolation Forest (0.001 to 0.5)."
    )
    random_state: int = Field(
        default=42,
        description="Random seed for Isolation Forest reproducibility."
    )
    exclude_duplicates: bool = Field(
        default=True,
        description="Exclude exact duplicate numerical columns from multivariate model input."
    )


class IQROutlierColumnResponse(BaseModel):
    """Outlier metrics for an individual numeric column via IQR."""
    column: str
    q1: float
    q3: float
    iqr: float
    multiplier: float
    lower_bound: float
    upper_bound: float
    lower_outliers_count: int
    upper_outliers_count: int
    total_outliers: int
    outlier_pct: float
    outlier_indices: List[Any] = Field(default_factory=list)
    min_val: float
    valid_count: int = 0
    missing_count: int = 0
    total_rows: int = 0
    evaluation_note: Optional[str] = None


class IQRDetectionResponse(BaseModel):
    """Comprehensive IQR outlier analysis results."""
    columns_analyzed: List[str] = Field(default_factory=list)
    column_results: Dict[str, IQROutlierColumnResponse] = Field(default_factory=dict)
    total_outlier_rows: int = 0
    outlier_rate: float = 0.0
    all_outlier_indices: List[Any] = Field(default_factory=list)
    multiplier: float = 1.5
    duplicate_columns: Dict[str, List[str]] = Field(default_factory=dict)


class IsolationForestDetectionResponse(BaseModel):
    """Isolation Forest multivariate anomaly detection results."""
    features_used: List[str] = Field(default_factory=list)
    contamination: float = 0.05
    anomaly_count: int = 0
    anomaly_pct: float = 0.0
    anomaly_indices: List[Any] = Field(default_factory=list)
    preprocessing_notes: List[str] = Field(default_factory=list)
    excluded_columns: List[str] = Field(default_factory=list)
    explanation: str = Field(
        default="Isolation Forest detects unusual multivariate combinations of features. Flagged observations reflect statistical rarity and require domain review rather than automatic deletion."
    )


class FlaggedRecordItem(BaseModel):
    """Granular observation record flagged by one or more anomaly detection methods."""
    row_index: Any
    row_number: int  # 1-based display row number
    methods: List[str] = Field(default_factory=list)  # e.g. ["IQR", "Isolation Forest"]
    flagged_columns: List[str] = Field(default_factory=list)
    values: Dict[str, Any] = Field(default_factory=dict)
    full_row: Dict[str, Any] = Field(default_factory=dict)
    isolation_forest_score: Optional[float] = None
    isolation_forest_label: Optional[str] = None
    reasons: List[str] = Field(default_factory=list)


class AnomalySummaryResponse(BaseModel):
    """Executive KPI summary for anomaly detection run."""
    total_records_analyzed: int
    unique_flagged_records: int
    flagged_percentage: float
    numeric_columns_analyzed: int
    methods_used: List[str]
    dataset_id: int
    dataset_name: str
    dataset_version: str
    iqr_unique_records: Optional[int] = 0
    isolation_forest_unique_records: Optional[int] = 0
    both_methods_records: Optional[int] = 0
    iqr_only_records: Optional[int] = 0
    isolation_forest_only_records: Optional[int] = 0
    duplicate_columns: Dict[str, List[str]] = Field(default_factory=dict)


class AnomalyDetectResponse(BaseModel):
    """Comprehensive anomaly detection response payload."""
    status: str = "success"
    summary: AnomalySummaryResponse
    iqr_results: Optional[IQRDetectionResponse] = None
    isolation_forest_results: Optional[IsolationForestDetectionResponse] = None
    flagged_records: List[FlaggedRecordItem] = Field(default_factory=list)
    all_numeric_columns: List[str] = Field(default_factory=list)
    duplicate_columns: Dict[str, List[str]] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    created_at: str


class NumericColumnsResponse(BaseModel):
    """Available numeric columns and metadata for a dataset."""
    dataset_id: int
    dataset_name: str
    dataset_version: str
    total_rows: int
    suitable_numeric_columns: List[str] = Field(default_factory=list)
    excluded_columns: List[str] = Field(default_factory=list)
    duplicate_columns: Dict[str, List[str]] = Field(default_factory=dict)
