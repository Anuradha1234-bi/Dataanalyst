"""Pydantic schemas for Phase 1 & Phase 2: Data Cleaning (Basic & Advanced)."""

from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field, field_validator


# =============================================================================
# Phase 1 Configuration Models
# =============================================================================

class MissingImputationConfig(BaseModel):
    """Configuration for missing value handling on a specific column."""
    column: str
    strategy: str  # "mean", "median", "mode", "constant", "drop_rows", "ffill", "bfill"
    fill_value: Optional[Union[str, int, float, bool]] = None


class TypeConversionConfig(BaseModel):
    """Configuration for column data type conversion."""
    column: str
    target_type: str  # "numeric", "integer", "float", "datetime", "text", "string"


# =============================================================================
# Phase 2: Advanced Cleaning Configuration Models
# =============================================================================

class TextStandardizationConfig(BaseModel):
    """Text-cleaning operations for selected text columns."""
    column: str
    trim_whitespace: bool = True
    collapse_spaces: bool = True
    case_conversion: Optional[str] = None  # "lowercase", "uppercase", "titlecase", None
    remove_special_chars: bool = False


class CategoryNormalizationConfig(BaseModel):
    """Category normalization mapping for detected equivalent categories."""
    column: str
    mapping: Dict[str, str] = Field(default_factory=dict)  # { "M": "Male", "male": "Male" }


class NumericCleaningConfig(BaseModel):
    """Numeric value cleaning for currency, commas, and percentage handling."""
    column: str
    strip_currency: bool = True
    remove_commas: bool = True
    percentage_handling: Optional[str] = "keep_number"  # "keep_number" (45) or "as_fraction" (0.45)
    handle_invalid: str = "coerce_na"  # "coerce_na", "keep"


class DateCleaningConfig(BaseModel):
    """Date column detection and standardized datetime conversion."""
    column: str
    output_format: Optional[str] = "%Y-%m-%d"  # "%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y", etc.
    handle_invalid: str = "coerce_na"  # "coerce_na", "keep"


class ValueValidationConfig(BaseModel):
    """Range validation rules for numerical/general columns."""
    column: str
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    action: str = "set_missing"  # "keep", "replace", "set_missing", "remove_rows"
    replacement_value: Optional[Union[str, int, float]] = None


class CustomReplacementConfig(BaseModel):
    """Custom replacement of specific values (e.g. Unknown -> NaN, N/A -> NaN)."""
    column: str
    find_value: str
    replace_value: Optional[str] = None  # None or "NaN" means null
    exact_match: bool = True


class FindReplaceConfig(BaseModel):
    """Controlled Find & Replace with case sensitivity and exact matching options."""
    column: str
    find_value: str
    replace_value: str
    exact_match: bool = False
    case_sensitive: bool = True


class CleaningRuleConfig(BaseModel):
    """Simple rule builder definition: Column -> Condition -> Action."""
    column: str
    condition: str  # "less_than", "greater_than", "equals", "contains", "is_empty", "is_negative"
    condition_value: Optional[str] = None
    action: str  # "set_missing", "remove_rows", "replace", "strip_char"
    action_value: Optional[str] = None


class OutlierCleaningConfig(BaseModel):
    """Configuration for Phase 3/4 outlier detection and treatment."""
    column: str
    method: str = "iqr"  # "iqr" or "zscore"
    multiplier: float = 1.5  # 1.5 for IQR, 3.0 for z-score
    action: str = "cap"  # "keep", "remove", "cap", "median", "mean"


# =============================================================================
# Combined Cleaning Operations Request (Phase 1, 2, 3, 4)
# =============================================================================

class CleaningOperationsRequest(BaseModel):
    """Complete set of user-selected cleaning operations to preview or apply."""
    # Phase 1
    remove_duplicates: bool = False
    remove_empty_rows: bool = False
    remove_empty_columns: bool = False
    convert_blanks_to_na: bool = False
    standardize_column_names: bool = False
    missing_imputations: List[MissingImputationConfig] = Field(default_factory=list)
    type_conversions: List[TypeConversionConfig] = Field(default_factory=list)
    drop_columns: List[str] = Field(default_factory=list)

    # Phase 2: Advanced Cleaning
    text_standardizations: List[TextStandardizationConfig] = Field(default_factory=list)
    category_normalizations: List[CategoryNormalizationConfig] = Field(default_factory=list)
    numeric_cleanings: List[NumericCleaningConfig] = Field(default_factory=list)
    date_cleanings: List[DateCleaningConfig] = Field(default_factory=list)
    value_validations: List[ValueValidationConfig] = Field(default_factory=list)
    custom_replacements: List[CustomReplacementConfig] = Field(default_factory=list)
    find_replaces: List[FindReplaceConfig] = Field(default_factory=list)
    cleaning_rules: List[CleaningRuleConfig] = Field(default_factory=list)

    # Phase 3 & 4: Outlier Cleaning
    outlier_cleanings: List[OutlierCleaningConfig] = Field(default_factory=list)



# =============================================================================
# Metric & Diagnostic Schemas
# =============================================================================

class CleaningMetricStats(BaseModel):
    """Dataset structural metrics for comparison."""
    total_rows: int
    total_columns: int
    missing_cells: int
    missing_percentage: float
    duplicate_rows: int
    duplicate_percentage: float
    column_count_with_missing: int


class ColumnCleaningRecommendation(BaseModel):
    """Diagnostic detail and recommended cleaning actions for a column."""
    column_name: str
    data_type: str
    inferred_type: str
    possible_inferred_type: Optional[str] = None
    missing_count: int
    missing_percentage: float
    blank_count: int = 0
    blank_percentage: float = 0.0
    unique_count: int
    unique_percentage: float
    is_constant: bool
    is_empty: bool
    has_mixed_types: bool
    recommended_strategies: List[str]
    safe_type_conversions: List[str] = Field(default_factory=list)
    issues: List[str]


class DetailedCleaningOperation(BaseModel):
    """Individual recorded cleaning step for history and preview tables."""
    operation: str
    column: str
    method: str
    rows_affected: int
    date: Optional[str] = None


class CellDiffItem(BaseModel):
    """Cell-level Before/After diff item for preview inspection."""
    row_index: int
    column: str
    before_value: Optional[Any] = None
    after_value: Optional[Any] = None

    @field_validator('before_value', 'after_value', mode='before')
    @classmethod
    def convert_numpy(cls, v):
        if hasattr(v, 'item'):
            return v.item()
        return v


# =============================================================================
# Inspection Endpoints Response Schemas (Phase 2)
# =============================================================================

class ValueFrequencyItem(BaseModel):
    """Frequency and percentage count for a unique categorical value."""
    value: Optional[str] = None
    count: int
    percentage: float


class ColumnValueSummaryResponse(BaseModel):
    """Column value summary displaying unique values, frequencies, and percentages."""
    column: str
    total_rows: int
    unique_count: int
    missing_count: int
    values: List[ValueFrequencyItem]


class CategoryVariant(BaseModel):
    """Raw variant value and count in an inconsistency cluster."""
    value: str
    count: int


class CategoryCluster(BaseModel):
    """Cluster of inconsistent/equivalent categorical variations."""
    group_key: str
    variants: List[CategoryVariant]
    suggested_target: str


class CategoryInconsistenciesResponse(BaseModel):
    """Detected potential inconsistent category clusters for a column."""
    column: str
    clusters: List[CategoryCluster]


class DateInspectionResponse(BaseModel):
    """Diagnostic date parsing and format detection for a column."""
    column: str
    current_datatype: str
    detected_format: Optional[str] = None
    parsed_count: int
    invalid_count: int
    total_rows: int
    sample_parsed: List[Dict[str, Any]] = Field(default_factory=list)


# =============================================================================
# Overview, Preview, Apply, & History Response Schemas
# =============================================================================

class CleaningOverviewResponse(BaseModel):
    """Overview metadata, quality diagnostics, and available cleaning options."""
    dataset_id: int
    filename: str
    file_type: str = "CSV"
    upload_date: Optional[str] = None
    file_size_bytes: int = 0
    has_cleaned: bool
    cleaned_filename: Optional[str] = None
    original_metrics: CleaningMetricStats
    cleaned_metrics: Optional[CleaningMetricStats] = None
    columns: List[ColumnCleaningRecommendation]
    duplicate_rows_count: int
    duplicate_percentage: float
    duplicate_sample: List[Dict[str, Any]] = Field(default_factory=list)
    empty_rows_count: int
    empty_columns: List[str] = Field(default_factory=list)
    total_blank_cells: int = 0
    columns_with_blanks: int = 0
    column_names_standardized_preview: Optional[Dict[str, str]] = None
    cleaned_sample_preview: Optional[List[Dict[str, Any]]] = None
    cleaned_columns: Optional[List[str]] = None


class CleaningPreviewResponse(BaseModel):
    """Preview of before-vs-after metrics and transformed rows without mutating disk."""
    dataset_id: int
    filename: str
    before: CleaningMetricStats
    after: CleaningMetricStats
    rows_removed: int
    columns_removed: int
    missing_cells_delta: int
    duplicate_rows_delta: int
    blank_cells_converted: int = 0
    column_names_changed: int = 0
    column_name_mapping: Optional[Dict[str, str]] = None
    operations_summary: List[str]
    detailed_operations: List[DetailedCleaningOperation] = Field(default_factory=list)
    type_changes: List[Dict[str, str]]
    sample_preview: List[Dict[str, Any]] = Field(default_factory=list)
    sample_columns: List[str] = Field(default_factory=list)
    # Phase 2 preview additions
    cell_diffs: List[CellDiffItem] = Field(default_factory=list)
    total_cells_changed: int = 0


class CleaningApplyResponse(BaseModel):
    """Result of executing cleaning operations and versioning cleaned dataset."""
    success: bool
    message: str
    dataset_id: int
    original_filename: str
    cleaned_filename: str
    before: CleaningMetricStats
    after: CleaningMetricStats
    rows_removed: int
    columns_removed: int
    operations_performed: List[str]
    detailed_operations: List[DetailedCleaningOperation] = Field(default_factory=list)
    applied_at: str
    history_id: Optional[int] = None
    # Phase 2 summary additions
    rows_affected: int = 0
    cells_affected: int = 0
    columns_affected: int = 0
    values_changed: int = 0
    invalid_values_remaining: int = 0
    missing_values_remaining: int = 0
    duplicate_rows_remaining: int = 0
    # Phase 4 additions
    version: Optional[str] = None
    quality_score: Optional[int] = None
    validation_report: Optional[Dict[str, Any]] = None


class CleaningHistoryItem(BaseModel):
    """Audit log item representing an applied cleaning event."""
    id: int
    dataset_id: int
    dataset_name: str
    operations_performed: List[str]
    detailed_operations: List[DetailedCleaningOperation] = Field(default_factory=list)
    before_rows: int
    after_rows: int
    before_missing: int
    after_missing: int
    applied_at: datetime
    version: Optional[str] = None


# =============================================================================
# Phase 4 & Phase 5: Validation, Deterministic Score, Reports, Smart Suggestions & Consistency
# =============================================================================

class CleaningValidationItem(BaseModel):
    """Single data hygiene validation comparison item."""
    check_name: str
    before_value: Any
    after_value: Any
    status: str  # "Resolved", "Improved", "Good", "Requires Review"
    details: Optional[str] = None
    weight: Optional[int] = 0
    remaining_issues: Optional[int] = 0
    component_score: Optional[float] = 0.0

    @field_validator('before_value', 'after_value', mode='before')
    @classmethod
    def convert_numpy(cls, v):
        if hasattr(v, 'item'):
            return v.item()
        return v


class CleaningValidationReport(BaseModel):
    """Side-by-side Before vs After cleaning validation audit."""
    dataset_id: int
    dataset_name: str
    checks: List[CleaningValidationItem]
    total_issues_before: int
    total_issues_after: int
    overall_status: str  # "Cleaned", "Partially Cleaned", "Needs Review", "Not Cleaned"
    cleaning_score: Optional[int] = 0
    score_status: Optional[str] = "GOOD"  # "CLEAN", "GOOD", "NEEDS REVIEW", "CRITICAL"
    unresolved_issues: List[str] = Field(default_factory=list)


class CleaningDashboardSummaryResponse(BaseModel):
    """Compact header overview for the selected dataset."""
    dataset_id: int
    dataset_name: str
    current_version: str
    rows: int
    columns: int
    missing_values: int
    missing_percentage: float
    duplicate_rows: int
    duplicate_percentage: float
    blank_values: int
    numeric_columns_count: int
    categorical_columns_count: int
    date_columns_count: int
    outliers_detected: int
    last_cleaning_operation: Optional[str] = None
    last_updated: Optional[str] = None
    cleaning_status: str  # "Not Cleaned" | "Partially Cleaned" | "Cleaned" | "Needs Review"
    cleaning_score: int  # 0 - 100
    quality_score: Optional[int] = None  # Authoritative absolute dataset quality score (0 - 100)
    score_deductions: List[str] = Field(default_factory=list)
    score_status: Optional[str] = "GOOD"  # "CLEAN", "GOOD", "NEEDS REVIEW", "CRITICAL"
    component_scores: Dict[str, float] = Field(default_factory=dict)
    unresolved_issues: List[str] = Field(default_factory=list)


class BulkOperationImpactItem(BaseModel):
    """Summary row of an individual operation's impact."""
    column: str
    operation: str
    affected: int
    result: str


class BulkPreviewResponse(BaseModel):
    """Preview summary of chained bulk cleaning operations."""
    dataset_id: int
    operations_count: int
    execution_order: List[str]
    impact_summary: List[BulkOperationImpactItem]
    total_rows_affected: int
    total_cells_affected: int
    sample_preview: List[Dict[str, Any]] = Field(default_factory=list)
    cell_diffs: List[CellDiffItem] = Field(default_factory=list)


class DatasetVersionItem(BaseModel):
    """Timeline entry representing a dataset version."""
    version: str
    version_number: int
    timestamp: str
    rows: int
    columns: int
    operations: List[str]
    status: str
    is_current: bool
    quality_score: Optional[int] = None
    score_status: Optional[str] = None
    validation_summary: Optional[Dict[str, Any]] = None


class CleaningReportResponse(BaseModel):
    """Complete cleaning audit report for downloading or viewing."""
    dataset_info: Dict[str, Any]
    version: str
    cleaning_operations: List[Dict[str, Any]]
    validation_results: CleaningValidationReport
    before_metrics: CleaningMetricStats
    after_metrics: CleaningMetricStats
    quality_score: int
    score_deductions: List[str]
    generated_at: str
    score_status: Optional[str] = "GOOD"
    unresolved_issues: List[str] = Field(default_factory=list)


# Phase 5: Smart Suggestions & Data Consistency Schemas

class SmartCleaningSuggestion(BaseModel):
    """Individual data-driven cleaning suggestion."""
    id: str
    priority: str  # "high" | "medium" | "low"
    category: str  # "numeric" | "missing" | "duplicates" | "outliers" | "date" | "datatype" | "category" | "whitespace" | "column_name"
    issue: str
    evidence: str
    recommended_action: str
    affected_columns: List[str]
    affected_count: int
    action_type: str
    action_payload: Optional[Dict[str, Any]] = None
    impact_score: Optional[float] = 0.0
    priority_score: Optional[float] = 0.0
    affected_percentage: Optional[float] = 0.0
    severity: Optional[str] = None


class SmartSuggestionsResponse(BaseModel):
    """Collection of intelligent data-driven cleaning recommendations."""
    dataset_id: int
    dataset_name: str
    total_suggestions: int
    high_priority_count: int
    medium_priority_count: int
    low_priority_count: int
    suggestions: List[SmartCleaningSuggestion]


class ConsistencyCheckItem(BaseModel):
    """Cross-column relationship or consistency rule evaluation."""
    id: str
    check_name: str
    rule_description: str
    severity: str  # "High" | "Medium" | "Low"
    violations_count: int
    violations_percentage: float
    action_label: str  # "Review" | "Normalize" | "Fix"
    action_type: str
    affected_columns: List[str]
    sample_violations: List[Dict[str, Any]] = Field(default_factory=list)


class ConsistencyChecksResponse(BaseModel):
    """Results of relationship and semantic consistency checks between columns."""
    dataset_id: int
    dataset_name: str
    total_checks: int
    total_violations: int
    checks: List[ConsistencyCheckItem]


class CustomConsistencyRuleRequest(BaseModel):
    """User-defined cross-column rule configuration."""
    column_a: str
    operator: str  # ">", "<", "==", "!=", ">=", "<=", "missing_when_present", "present_when_missing"
    column_b: Optional[str] = None
    constant_value: Optional[str] = None
    rule_name: Optional[str] = None


class CustomConsistencyRuleResponse(BaseModel):
    """Result of running a user-defined cross-column rule."""
    rule_name: str
    rule_description: str
    violations_count: int
    violations_percentage: float
    total_rows: int
    sample_violations: List[Dict[str, Any]] = Field(default_factory=list)


class VersionComparisonResponse(BaseModel):
    """Comparison of metrics between two dataset versions."""
    dataset_id: int
    v1_tag: str
    v2_tag: str
    v1_metrics: Dict[str, Any]
    v2_metrics: Dict[str, Any]
    deltas: Dict[str, Any]
    operations_applied: List[str] = Field(default_factory=list)


