"""Anomaly and Outlier Detection Data Models.

Defines standardized data containers for IQR detection, Isolation Forest,
Deep Statistical Anomaly Analysis, Multivariate Outlier Analysis, and Treatment Audits.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Any, List, Optional, Union


@dataclass
class IQROutlierColumnResult:
    """Outlier detection results for a single numeric column via IQR."""

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
    outlier_indices: List[Any] = field(default_factory=list)
    min_val: float = 0.0
    max_val: float = 0.0
    valid_count: int = 0
    missing_count: int = 0
    total_rows: int = 0
    evaluation_note: Optional[str] = None


@dataclass
class IQRAnalysisResult:
    """Comprehensive IQR outlier analysis results across evaluated columns."""

    dataset_name: str
    total_rows: int
    columns_analyzed: List[str]
    column_results: Dict[str, IQROutlierColumnResult]
    total_outlier_rows: int
    outlier_rate: float
    all_outlier_indices: List[Any]
    multiplier: float
    duplicate_columns: Dict[str, List[str]] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))


@dataclass
class IsolationForestResult:
    """Isolation Forest anomaly detection output container."""

    dataset_name: str
    rows_analyzed: int
    features_used: List[str]
    contamination: float
    anomaly_count: int
    anomaly_pct: float
    anomaly_scores: List[float]  # per row normalized/calibrated anomaly score
    raw_decision_scores: List[float]  # raw decision function values
    anomaly_labels: List[str]  # "Normal" or "Anomaly"
    anomaly_indices: List[Any]  # row indices of detected anomalies
    anomaly_positions: List[int] = field(default_factory=list)  # 0-based integer positions in evaluated matrix
    preprocessing_notes: List[str] = field(default_factory=list)
    excluded_columns: List[str] = field(default_factory=list)
    timestamp: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))


@dataclass
class DeepStatisticalMetric:
    """Deep statistical properties and unusualness assessment for a numeric column."""

    column: str
    count: int
    mean: float
    median: float
    std: float
    variance: float
    min_val: float
    max_val: float
    q1: float
    q3: float
    iqr: float
    skewness: float
    kurtosis: float
    z_outliers_count: int  # |z| > 3.0
    z_min: float
    z_max: float
    assessment: str  # "Normal" or "Statistically Unusual"
    signals: List[str] = field(default_factory=list)


@dataclass
class DeepStatisticalResult:
    """Deep statistical analysis result across all suitable numeric features."""

    dataset_name: str
    total_rows: int
    columns_analyzed: List[str]
    column_metrics: Dict[str, DeepStatisticalMetric]
    unusual_columns_count: int
    timestamp: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))


@dataclass
class MultivariateAnomalyRecord:
    """Detailed observation record for a multivariate anomaly."""

    row_index: Any
    anomaly_score: float
    status: str  # "Anomaly"
    feature_values: Dict[str, Any]
    signals: List[str] = field(default_factory=list)


@dataclass
class MultivariateAnalysisResult:
    """Multivariate anomaly detection results evaluating joint feature relationships."""

    dataset_name: str
    rows_analyzed: int
    features_used: List[str]
    contamination: float
    anomaly_count: int
    anomaly_pct: float
    anomalies: List[MultivariateAnomalyRecord]
    all_anomaly_indices: List[Any]
    preprocessing_notes: List[str] = field(default_factory=list)
    timestamp: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))


@dataclass
class AnomalyTreatmentSummary:
    """Audit record for controlled outlier treatment execution."""

    dataset_name: str
    treatment_type: str  # "keep" | "flag_only" | "remove_rows" | "cap_values" | "replace_median" | "winsorize" | "remove_selected" | "investigate"
    affected_rows: int
    rows_before: int
    rows_after: int
    columns_treated: List[str]
    details: str
    timestamp: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))


# =============================================================================
# NEW PHASE 4 STANDARD EXTENSIONS (Z-SCORE, ROBUST Z-SCORE, COMBINED, SEVERITY)
# =============================================================================

@dataclass
class ZScoreColumnResult:
    """Outlier detection results for a single numeric column via standard Z-score."""

    column: str
    mean: float
    std: float
    threshold: float
    outlier_count: int
    outlier_pct: float
    outlier_indices: List[Any] = field(default_factory=list)
    min_z: float = 0.0
    max_z: float = 0.0
    zero_std: bool = False
    warning: Optional[str] = None


@dataclass
class ZScoreAnalysisResult:
    """Comprehensive Z-score anomaly detection output container."""

    dataset_name: str
    total_rows: int
    columns_analyzed: List[str]
    column_results: Dict[str, ZScoreColumnResult]
    total_outlier_rows: int
    outlier_rate: float
    all_outlier_indices: List[Any]
    threshold: float
    timestamp: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    warnings: List[str] = field(default_factory=list)


@dataclass
class RobustZScoreColumnResult:
    """Outlier detection results for a single numeric column via Robust Z-score (MAD)."""

    column: str
    median: float
    mad: float
    threshold: float
    outlier_count: int
    outlier_pct: float
    outlier_indices: List[Any] = field(default_factory=list)
    min_robust_z: float = 0.0
    max_robust_z: float = 0.0
    zero_mad: bool = False
    warning: Optional[str] = None


@dataclass
class RobustZScoreAnalysisResult:
    """Comprehensive Robust Z-score (MAD) anomaly detection output container."""

    dataset_name: str
    total_rows: int
    columns_analyzed: List[str]
    column_results: Dict[str, RobustZScoreColumnResult]
    total_outlier_rows: int
    outlier_rate: float
    all_outlier_indices: List[Any]
    threshold: float
    timestamp: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    warnings: List[str] = field(default_factory=list)


@dataclass
class SingleAnomalyRecord:
    """Granular observation record for an individual detected anomaly."""

    row_index: Any
    affected_columns: List[str]
    original_values: Dict[str, Any]
    methods: List[str]  # e.g. ["IQR", "Z-Score"]
    methods_agreeing: int  # count of methods agreeing
    total_methods_evaluated: int
    agreement_ratio_str: str  # e.g. "2/3"
    score: float  # 0.0 to 1.0 calibrated anomaly score
    severity: str  # "LOW", "MEDIUM", "HIGH"
    signals: List[str] = field(default_factory=list)
    expected_ranges: Dict[str, str] = field(default_factory=dict)
    deviations: Dict[str, str] = field(default_factory=dict)


@dataclass
class CombinedAnomalyResult:
    """Standardized composite result aggregating multiple anomaly detection methods."""

    dataset_name: str
    total_rows: int
    features_used: List[str]
    methods_used: List[str]
    anomaly_count: int
    normal_count: int
    anomaly_percentage: float
    all_anomaly_indices: List[Any]
    records: List[SingleAnomalyRecord]
    affected_columns: List[str]
    method_results: Dict[str, Any] = field(default_factory=dict)
    severity_breakdown: Dict[str, int] = field(default_factory=dict)
    method_agreement_counts: Dict[str, int] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    timestamp: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))


@dataclass
class AnomalySummary:
    """Concise executive summary of anomaly detection for UI and reporting."""

    dataset_name: str
    total_rows: int
    normal_count: int
    anomaly_count: int
    anomaly_percentage: float
    affected_columns: List[str]
    methods_used: List[str]
    severity_breakdown: Dict[str, int]
    top_anomalies: List[Dict[str, Any]] = field(default_factory=list)
    timestamp: str = field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))


@dataclass
class AnomalyExplanation:
    """Deterministic explanation for a specific flagged observation."""

    row_index: Any
    dataset_name: str
    affected_columns: List[str]
    original_values: Dict[str, Any]
    expected_ranges: Dict[str, str]
    actual_values: Dict[str, Any]
    deviations: Dict[str, str]
    methods: List[str]
    score: float
    severity: str
    agreement_str: str
    explanation_text: str
    evidence_items: List[str]
    disclaimer: str = "This observation is statistically unusual. The dataset does not establish whether it is an error or valid extreme business variance."

