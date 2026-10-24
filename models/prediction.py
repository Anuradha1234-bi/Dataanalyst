"""Prediction and Forecasting Data Models.

Defines standardized containers for Problem Detection, Target Recommendations,
Model Candidates, Validation Metrics, Forecast Outputs, Uncertainty Ranges,
Feature Importance, and Comprehensive Prediction Results.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Dict, Any, List, Optional, Union


class PredictionMode(str, Enum):
    """Supported prediction operating modes."""

    AUTO = "auto"
    FORECASTING = "forecasting"
    REGRESSION = "regression"
    CLASSIFICATION = "classification"


class ProblemType(str, Enum):
    """Specific machine learning problem category."""

    TIME_SERIES_FORECAST = "time_series_forecast"
    REGRESSION = "regression"
    BINARY_CLASSIFICATION = "binary_classification"
    MULTICLASS_CLASSIFICATION = "multiclass_classification"


@dataclass
class TargetRecommendation:
    """Evaluation container for candidate target column."""

    column: str
    problem_type: ProblemType
    score: float  # 0.0 to 1.0 recommendation confidence
    reasons: List[str]
    missing_pct: float
    unique_count: int


@dataclass
class DateColumnInfo:
    """Assessment of candidate datetime column for time-series forecasting."""

    column: str
    frequency: str  # "daily", "weekly", "monthly", "irregular"
    min_date: str
    max_date: str
    valid_count: int
    is_regular: bool
    sample_values: List[str] = field(default_factory=list)


@dataclass
class SuitabilityReport:
    """Diagnostic assessment of dataset readiness for prediction."""

    is_suitable: bool
    problem_type: ProblemType
    target_column: str
    date_column: Optional[str]
    total_rows: int
    usable_rows: int
    features_count: int
    reasons: List[str]
    warnings: List[str] = field(default_factory=list)


@dataclass
class LeakageReport:
    """Audit of detected data leakage risks."""

    has_leakage: bool
    flagged_features: Dict[str, str] = field(default_factory=dict)  # feature -> reason
    recommendations: List[str] = field(default_factory=list)


@dataclass
class ModelEvaluationMetrics:
    """Standardized performance metrics container across problem types."""

    # Regression / Forecasting metrics
    mae: Optional[float] = None
    mse: Optional[float] = None
    rmse: Optional[float] = None
    r2: Optional[float] = None
    mape: Optional[float] = None
    smape: Optional[float] = None

    # Classification metrics
    accuracy: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1: Optional[float] = None
    roc_auc: Optional[float] = None
    confusion_matrix: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert non-None metrics to clean dictionary."""
        res = {}
        for k, v in self.__dict__.items():
            if v is not None:
                if isinstance(v, (int, float)):
                    res[k] = round(float(v), 4)
                else:
                    res[k] = v
        return res


@dataclass
class ModelCandidateResult:
    """Validation outcome for a specific trained model candidate."""

    model_id: str
    model_name: str
    problem_type: ProblemType
    metrics: ModelEvaluationMetrics
    training_time_seconds: float
    status: str = "success"  # "success" | "failed" | "skipped"
    warning: Optional[str] = None
    error: Optional[str] = None
    feature_importance: Dict[str, float] = field(default_factory=dict)


@dataclass
class PredictionPoint:
    """Individual predicted point with timestamp/index and uncertainty bounds."""

    index_or_date: str
    predicted_value: Union[float, str]
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None
    actual_value: Optional[float] = None
    confidence_level: float = 0.95
    absolute_error: Optional[float] = None
    percentage_error: Optional[float] = None


@dataclass
class FeatureImportanceItem:
    """Ranked feature influence assessment."""

    feature: str
    importance_score: float
    percentage: float


@dataclass
class PredictionResult:
    """Master structured result from prediction and forecasting orchestrator."""

    status: str  # "success" | "unsuitable" | "error"
    mode: str  # "forecasting" | "regression" | "classification"
    problem_type: str
    dataset_name: str
    target_column: str
    date_column: Optional[str]
    selected_model_name: str
    selection_metric: str
    model_results: List[ModelCandidateResult]
    best_metrics: ModelEvaluationMetrics
    predictions: List[PredictionPoint]
    validation_predictions: List[PredictionPoint] = field(default_factory=list)
    feature_importance: List[FeatureImportanceItem] = field(default_factory=list)
    features_used: List[str] = field(default_factory=list)
    features_excluded: Dict[str, str] = field(default_factory=dict)  # feature -> reason
    uncertainty_method: str = "None"
    explanation: str = ""
    limitations: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    train_rows: int = 0
    validation_rows: int = 0
    forecast_horizon: Optional[int] = None
    anomalies_excluded_count: int = 0
    timestamp: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))

    def to_summary_dict(self) -> Dict[str, Any]:
        """Produce lightweight summary for insight generation and Ask Analyst."""
        return {
            "status": self.status,
            "mode": self.mode,
            "dataset": self.dataset_name,
            "target": self.target_column,
            "date_column": self.date_column,
            "selected_model": self.selected_model_name,
            "horizon": self.forecast_horizon,
            "metrics": self.best_metrics.to_dict(),
            "prediction_count": len(self.predictions),
            "top_features": [f.feature for f in self.feature_importance[:5]],
            "warnings_count": len(self.warnings),
            "timestamp": self.timestamp,
        }

    def to_canonical_dict(self) -> Dict[str, Any]:
        """Convert result to the canonical Prediction Result Schema v1.0.

        Strict contract conforming to Phase 2 specifications.
        """
        # 1. Normalize status: "success" | "partial" | "failed"
        if self.status == "success":
            norm_status = "success"
        elif self.status == "partial":
            norm_status = "partial"
        else:
            norm_status = "failed"

        # 2. Normalize problem_type: "regression" | "classification" | "time_series"
        p_type_str = str(self.problem_type).lower()
        mode_str = str(self.mode).lower()
        if "time_series" in p_type_str or mode_str == "forecasting" or "forecast" in p_type_str:
            norm_problem_type = "time_series"
        elif "class" in p_type_str or mode_str == "classification":
            norm_problem_type = "classification"
        else:
            norm_problem_type = "regression"

        # 3. Model information
        model_name = self.selected_model_name or "Unknown"
        model_type = model_name.replace(" ", "")

        # 4. Metrics & direction (only actual computed metrics)
        raw_metrics = self.best_metrics.to_dict() if hasattr(self.best_metrics, "to_dict") else {}
        clean_metrics: Dict[str, Union[float, int, None]] = {k: v for k, v in raw_metrics.items() if v is not None}

        metric_direction: Dict[str, str] = {}
        for k in clean_metrics.keys():
            k_lower = k.lower()
            if k_lower in ("mae", "mse", "rmse", "mape", "smape", "log_loss"):
                metric_direction[k] = "minimize"
            elif k_lower in ("r2", "accuracy", "precision", "recall", "f1", "roc_auc"):
                metric_direction[k] = "maximize"
            else:
                metric_direction[k] = "minimize" if ("error" in k_lower or "loss" in k_lower) else "maximize"

        # 5. Validation strategy and partition sizes
        val_strategy = "chronological_split" if norm_problem_type == "time_series" else "train_test_split"
        train_sz = self.train_rows if self.train_rows > 0 else None
        val_sz = self.validation_rows if self.validation_rows > 0 else None

        # 6. Prediction section
        if norm_problem_type in ("regression", "classification") and self.predictions:
            vals = [p.predicted_value for p in self.predictions]
            actual_vals = [p.actual_value for p in self.predictions if p.actual_value is not None]
            first_val = vals[0] if len(vals) > 0 else None
            first_actual = actual_vals[0] if len(actual_vals) > 0 else None
            pred_section = {
                "value": first_val,
                "values": vals,
                "actual_value": first_actual,
                "prediction_count": len(vals),
            }
        else:
            pred_section = {
                "value": None,
                "values": None,
                "actual_value": None,
                "prediction_count": None,
            }

        # 7. Forecast section
        if norm_problem_type == "time_series":
            f_vals = [
                {
                    "period": p.index_or_date,
                    "predicted_value": p.predicted_value,
                    "lower_bound": p.lower_bound,
                    "upper_bound": p.upper_bound,
                }
                for p in self.predictions
            ] if self.predictions else []
            forecast_section = {
                "enabled": True,
                "horizon": self.forecast_horizon if self.forecast_horizon is not None else len(f_vals),
                "time_frequency": getattr(self, "frequency", None),
                "values": f_vals,
            }
        else:
            forecast_section = {
                "enabled": False,
                "horizon": None,
                "time_frequency": None,
                "values": None,
            }

        # 8. Features section
        if self.feature_importance:
            feat_importance = {f.feature: round(float(f.importance_score), 4) for f in self.feature_importance}
            top_feats = [f.feature for f in self.feature_importance[:5]]
        else:
            feat_importance = None
            top_feats = None

        features_section = {
            "importance": feat_importance,
            "top_features": top_feats,
        }

        # 9. Time column: Must be None when task is not time-series
        time_col = self.date_column if norm_problem_type == "time_series" else None

        # 10. Notes and errors
        notes = []
        if self.warnings:
            notes.extend(self.warnings)
        if self.limitations:
            notes.extend(self.limitations)

        errors_list = list(self.errors) if self.errors else []
        if norm_status == "failed" and self.explanation and self.explanation not in errors_list:
            errors_list.append(self.explanation)

        total_rows = (self.train_rows + self.validation_rows) if (self.train_rows or self.validation_rows) else None

        return {
            "schema_version": "1.0",
            "status": norm_status,
            "dataset": {
                "name": self.dataset_name or None,
                "id": None,
                "row_count": total_rows,
                "feature_count": len(self.features_used) if self.features_used else None,
            },
            "task": {
                "problem_type": norm_problem_type,
                "target_column": self.target_column,
                "feature_columns": list(self.features_used),
                "time_column": time_col,
            },
            "model": {
                "name": model_name,
                "model_type": model_type,
                "is_best_model": True if norm_status == "success" else False,
            },
            "validation": {
                "strategy": val_strategy,
                "metrics": clean_metrics,
                "metric_direction": metric_direction,
                "train_size": train_sz,
                "validation_size": val_sz,
                "test_size": val_sz,
            },
            "prediction": pred_section,
            "forecast": forecast_section,
            "features": features_section,
            "metadata": {
                "trained_at": self.timestamp,
                "dataset_source": getattr(self, "dataset_source", None),
                "notes": notes,
            },
            "errors": errors_list,
        }

    def __getitem__(self, key: str) -> Any:
        """Allow dict-like subscription matching the canonical schema."""
        return self.to_canonical_dict()[key]

    def get(self, key: str, default: Any = None) -> Any:
        """Allow dict-like get matching the canonical schema."""
        return self.to_canonical_dict().get(key, default)

    def __contains__(self, key: str) -> bool:
        """Allow dict-like containment matching the canonical schema."""
        return key in self.to_canonical_dict()

    def keys(self):
        """Allow dict-like keys matching the canonical schema."""
        return self.to_canonical_dict().keys()

    def values(self):
        """Allow dict-like values matching the canonical schema."""
        return self.to_canonical_dict().values()

    def items(self):
        """Allow dict-like items matching the canonical schema."""
        return self.to_canonical_dict().items()


def create_empty_canonical_prediction_result(
    dataset_name: Optional[str] = None,
    notes: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Return a canonical v1.0 schema dictionary representing no/empty prediction results."""
    return {
        "schema_version": "1.0",
        "status": "failed",
        "dataset": {
            "name": dataset_name,
            "id": None,
            "row_count": None,
            "feature_count": None,
        },
        "task": {
            "problem_type": "regression",
            "target_column": "",
            "feature_columns": [],
            "time_column": None,
        },
        "model": {
            "name": "None",
            "model_type": "None",
            "is_best_model": False,
        },
        "validation": {
            "strategy": "train_test_split",
            "metrics": {},
            "metric_direction": {},
            "train_size": None,
            "validation_size": None,
            "test_size": None,
        },
        "prediction": {
            "value": None,
            "values": None,
            "actual_value": None,
            "prediction_count": None,
        },
        "forecast": {
            "enabled": False,
            "horizon": None,
            "time_frequency": None,
            "values": None,
        },
        "features": {
            "importance": None,
            "top_features": None,
        },
        "metadata": {
            "trained_at": None,
            "dataset_source": None,
            "notes": notes or ["No prediction results are available yet. Run a prediction or forecasting analysis first."],
        },
        "errors": ["No prediction results are available yet."],
    }
