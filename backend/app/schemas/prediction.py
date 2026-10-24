"""Pydantic schemas for Advanced Predictive Modeling and Forecasting."""

from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class TargetCandidateResponse(BaseModel):
    """Evaluated potential target column."""

    column: str
    problem_type: str  # "regression", "binary_classification", "multiclass_classification"
    score: float
    reasons: List[str]
    missing_pct: float
    unique_count: int


class DateCandidateResponse(BaseModel):
    """Identified datetime column for time-series forecasting."""

    column: str
    frequency: str
    min_date: Optional[str] = None
    max_date: Optional[str] = None
    valid_count: int
    is_regular: bool
    sample_values: List[str] = Field(default_factory=list)


class ColumnSummaryItem(BaseModel):
    """Column profile item for prediction selection."""

    name: str
    data_type: str
    role: str  # numeric, categorical, datetime, identifier, constant
    unique_count: int
    missing_count: int
    missing_pct: float
    sample_values: List[Any] = Field(default_factory=list)
    leakage_risk: Optional[str] = None


class DatasetSuitabilityResponse(BaseModel):
    """Dataset readiness and diagnostic audit."""

    is_suitable: bool
    problem_type: str
    target_column: Optional[str] = None
    date_column: Optional[str] = None
    total_rows: int
    usable_rows: int
    features_count: int
    reasons: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    has_leakage: bool = False
    flagged_leakage_features: Dict[str, str] = Field(default_factory=dict)


class AnalyzeDatasetRequest(BaseModel):
    """Request payload to inspect dataset for target and task suitability."""

    dataset_id: int
    target_column: Optional[str] = None
    date_column: Optional[str] = None
    mode: str = "auto"  # auto, regression, classification, forecasting


class AnalyzeDatasetResponse(BaseModel):
    """Complete diagnostic pre-flight response."""

    dataset_id: int
    dataset_name: str
    total_rows: int
    total_columns: int
    target_candidates: List[TargetCandidateResponse] = Field(default_factory=list)
    date_candidates: List[DateCandidateResponse] = Field(default_factory=list)
    recommended_target: Optional[str] = None
    recommended_date_column: Optional[str] = None
    recommended_problem_type: Optional[str] = None
    columns_summary: List[ColumnSummaryItem] = Field(default_factory=list)
    suitability: DatasetSuitabilityResponse


class PredictionTrainRequest(BaseModel):
    """Request payload to train candidate models on a selected dataset."""

    dataset_id: int
    target_column: Optional[str] = None
    date_column: Optional[str] = None
    mode: str = "auto"  # auto, regression, classification, forecasting
    candidate_model: Optional[str] = None  # None for auto, or model_id for manual
    selected_features: Optional[List[str]] = None
    excluded_features: Optional[List[str]] = None
    forecast_horizon: int = Field(default=7, ge=1, le=365)
    test_size: float = Field(default=0.20, ge=0.05, le=0.50)
    exclude_anomalies: bool = False


class ModelCandidateMetricItem(BaseModel):
    """Validation performance for an evaluated model algorithm."""

    model_id: str
    model_name: str
    problem_type: str
    metrics: Dict[str, Any]
    training_time_seconds: float
    status: str
    warning: Optional[str] = None
    error: Optional[str] = None
    is_best: bool = False


class PredictionPointItem(BaseModel):
    """Single prediction item or validation observation."""

    index_or_date: str
    predicted_value: Union[float, str]
    actual_value: Optional[Union[float, str]] = None
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None
    confidence_level: Optional[float] = 0.95
    absolute_error: Optional[float] = None
    percentage_error: Optional[float] = None


class FeatureImportanceResponseItem(BaseModel):
    """Feature importance ranking entry."""

    feature: str
    importance_score: float
    percentage: float


class PredictionRunDetailResponse(BaseModel):
    """Comprehensive prediction run result."""

    run_id: int
    dataset_id: Optional[int]
    dataset_name: str
    task_type: str
    mode: str
    target_column: str
    date_column: Optional[str] = None
    selected_model: str
    selection_metric: Optional[str] = None
    train_rows: int
    validation_rows: int
    forecast_horizon: Optional[int] = None
    metrics: Dict[str, Any]
    model_comparison: List[ModelCandidateMetricItem] = Field(default_factory=list)
    predictions: List[PredictionPointItem] = Field(default_factory=list)
    validation_predictions: List[PredictionPointItem] = Field(default_factory=list)
    feature_importance: List[FeatureImportanceResponseItem] = Field(default_factory=list)
    features_used: List[str] = Field(default_factory=list)
    features_excluded: Dict[str, str] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)
    explanation: Optional[str] = None
    uncertainty_method: Optional[str] = None
    artifact_saved: bool = False
    created_at: datetime


class PredictionRunSummaryResponse(BaseModel):
    """Lightweight summary item for prediction history listing."""

    id: int
    dataset_id: Optional[int]
    dataset_name: str
    task_type: str
    mode: str
    target_column: str
    date_column: Optional[str] = None
    selected_model: str
    selection_metric: Optional[str] = None
    metrics: Dict[str, Any]
    created_at: datetime


class PredictNewDataResponse(BaseModel):
    """Results from scoring uploaded new data against a trained model."""

    run_id: int
    total_rows: int
    predicted_rows: List[Dict[str, Any]]
    target_column: str
    predicted_column_name: str
    features_used: List[str]
    warnings: List[str] = Field(default_factory=list)
