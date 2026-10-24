"""Query Models and Intent Definitions for Phase 6 Natural Language Query Engine.

Provides strictly structured schemas, intent enumerations, and validation models.
No arbitrary Python expressions or raw SQL allowed.
"""

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Dict, Any, List, Optional, Union


class QueryIntent(str, Enum):
    """Controlled set of supported query intents."""

    # Aggregations & Metrics
    COUNT = "COUNT"
    SUM = "SUM"
    AVERAGE = "AVERAGE"
    MEDIAN = "MEDIAN"
    MINIMUM = "MINIMUM"
    MAXIMUM = "MAXIMUM"

    # Rankings
    TOP_N = "TOP_N"
    BOTTOM_N = "BOTTOM_N"

    # Relational & Tabular operations
    GROUP_BY = "GROUP_BY"
    FILTER = "FILTER"
    SORT = "SORT"

    # Data Hygiene & Profiling
    MISSING_VALUES = "MISSING_VALUES"
    DUPLICATES = "DUPLICATES"
    DATA_TYPES = "DATA_TYPES"
    UNIQUE_VALUES = "UNIQUE_VALUES"

    # Temporal & Trend
    DATE_RANGE = "DATE_RANGE"
    DATE_COMPARISON = "DATE_COMPARISON"
    TREND = "TREND"
    PERCENTAGE_CHANGE = "PERCENTAGE_CHANGE"

    # Statistical & Correlations
    CORRELATION = "CORRELATION"
    REGRESSION = "REGRESSION"
    TWO_GROUP_TEST = "TWO_GROUP_TEST"
    CHI_SQUARE = "CHI_SQUARE"

    # Anomalies (reusing Phase 4)
    ANOMALY_SUMMARY = "ANOMALY_SUMMARY"
    ANOMALY_RECORDS = "ANOMALY_RECORDS"

    # Comparisons & Multi-dataset
    COMPARE_DATASETS = "COMPARE_DATASETS"
    COMPARE_GROUPS = "COMPARE_GROUPS"
    CROSS_DATASET_ANALYSIS = "CROSS_DATASET_ANALYSIS"

    # Comprehensive / Summary
    DESCRIPTIVE_STATISTICS = "DESCRIPTIVE_STATISTICS"
    INSIGHT_SUMMARY = "INSIGHT_SUMMARY"
    SHOW_DATA = "SHOW_DATA"
    DATA_QUALITY_REPORT = "DATA_QUALITY_REPORT"

    # Predictive & Forecasting (reusing Phase 5)
    FORECAST = "FORECAST"
    PREDICTION = "PREDICTION"

    # Business Analytics, Distribution & Multi-Part Dashboard
    PERCENTAGE_CONTRIBUTION = "PERCENTAGE_CONTRIBUTION"
    FREQUENCY = "FREQUENCY"
    DASHBOARD = "DASHBOARD"
    AVERAGE_ORDER_VALUE = "AVERAGE_ORDER_VALUE"
    PROFITABILITY = "PROFITABILITY"
    STANDARD_DEVIATION = "STANDARD_DEVIATION"
    COMPLEX_SUBQUERY = "COMPLEX_SUBQUERY"

    # Out of Scope & Unsupported Query Scoping
    OUT_OF_SCOPE = "OUT_OF_SCOPE"
    UNSUPPORTED_OPERATION = "UNSUPPORTED_OPERATION"

    # Fallback
    UNKNOWN = "UNKNOWN"

    @classmethod
    def list_all(cls) -> List[str]:
        return [intent.value for intent in cls]


@dataclass
class QueryFilter:
    """Safe structured filter representation."""
    column: str
    operator: str  # '>', '>=', '<', '<=', '==', '!=', 'in', 'not in', 'between', 'contains'
    value: Any

    def to_dict(self) -> Dict[str, Any]:
        return {
            "column": self.column,
            "operator": self.operator,
            "value": self.value,
        }


@dataclass
class QueryOutputConfig:
    """Configures requested outputs."""
    table: bool = True
    chart: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {"table": self.table, "chart": self.chart}


@dataclass
class StructuredQueryPlan:
    """Deterministic, structured query representation.
    
    Contains NO arbitrary Python expressions or raw SQL.
    """
    intent: str
    dataset: Optional[str] = None
    column: Optional[str] = None  # Primary metric or target column
    secondary_dataset: Optional[str] = None
    secondary_column: Optional[str] = None
    filters: List[Dict[str, Any]] = field(default_factory=list)
    group_by: List[str] = field(default_factory=list)
    aggregation: Optional[str] = None  # "count", "sum", "mean", "median", "min", "max", "std", "nunique"
    sort: Optional[str] = None  # "ascending" or "descending"
    sort_column: Optional[str] = None
    limit: Optional[int] = None
    offset: Optional[int] = None  # e.g., offset=1 for "second highest"
    date_range: Optional[Dict[str, Any]] = None  # {"start": ..., "end": ...}
    date_column: Optional[str] = None
    comparison: Optional[Dict[str, Any]] = None  # {"target": ..., "baseline": ..., "type": ...}
    output: Dict[str, bool] = field(default_factory=lambda: {"table": True, "chart": False})
    confidence: float = 1.0
    needs_clarification: bool = False
    clarification_question: Optional[str] = None
    clarification_options: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "intent": self.intent,
            "dataset": self.dataset,
            "column": self.column,
            "secondary_dataset": self.secondary_dataset,
            "secondary_column": self.secondary_column,
            "filters": list(self.filters),
            "group_by": list(self.group_by),
            "aggregation": self.aggregation,
            "sort": self.sort,
            "sort_column": self.sort_column,
            "limit": self.limit,
            "offset": self.offset,
            "date_range": dict(self.date_range) if self.date_range else None,
            "date_column": self.date_column,
            "comparison": dict(self.comparison) if self.comparison else None,
            "output": dict(self.output),
            "confidence": self.confidence,
            "needs_clarification": self.needs_clarification,
            "clarification_question": self.clarification_question,
            "clarification_options": list(self.clarification_options),
            "metadata": dict(self.metadata),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "StructuredQueryPlan":
        output = data.get("output", {"table": True, "chart": False})
        return cls(
            intent=data.get("intent", QueryIntent.UNKNOWN.value),
            dataset=data.get("dataset"),
            column=data.get("column"),
            secondary_dataset=data.get("secondary_dataset"),
            secondary_column=data.get("secondary_column"),
            filters=data.get("filters", []),
            group_by=data.get("group_by", []),
            aggregation=data.get("aggregation"),
            sort=data.get("sort"),
            sort_column=data.get("sort_column"),
            limit=data.get("limit"),
            offset=data.get("offset"),
            date_range=data.get("date_range"),
            date_column=data.get("date_column"),
            comparison=data.get("comparison"),
            output=output if isinstance(output, dict) else {"table": True, "chart": False},
            confidence=float(data.get("confidence", 1.0)),
            needs_clarification=bool(data.get("needs_clarification", False)),
            clarification_question=data.get("clarification_question"),
            clarification_options=data.get("clarification_options", []),
            metadata=data.get("metadata", {}),
        )


@dataclass
class IntentDetectionResult:
    """Result of intent detection."""
    intent: str
    confidence: float
    reason: str
    candidate_intents: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "intent": self.intent,
            "confidence": round(self.confidence, 2),
            "reason": self.reason,
            "candidate_intents": self.candidate_intents,
        }


@dataclass
class ColumnResolutionResult:
    """Result of column resolution with ambiguity detection."""
    resolved: bool
    column: Optional[str]
    confidence: float
    candidates: List[Dict[str, Any]] = field(default_factory=list)
    is_ambiguous: bool = False
    clarification_options: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "resolved": self.resolved,
            "column": self.column,
            "confidence": round(self.confidence, 2),
            "candidates": self.candidates,
            "is_ambiguous": self.is_ambiguous,
            "clarification_options": self.clarification_options,
        }


@dataclass
class QueryValidationResult:
    """Result of validating a query plan."""
    valid: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    requires_clarification: bool = False
    clarification_question: Optional[str] = None
    clarification_options: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "valid": self.valid,
            "errors": self.errors,
            "warnings": self.warnings,
            "requires_clarification": self.requires_clarification,
            "clarification_question": self.clarification_question,
            "clarification_options": self.clarification_options,
        }


@dataclass
class QueryExecutionResult:
    """Result of safe deterministic query execution."""
    status: str  # "success", "error", "needs_clarification", "empty"
    result_type: str  # "table", "scalar", "series", "summary", "empty"
    data: Any = None
    columns: List[str] = field(default_factory=list)
    row_count: int = 0
    evidence: Dict[str, Any] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "result_type": self.result_type,
            "data": self.data,
            "columns": self.columns,
            "row_count": self.row_count,
            "evidence": self.evidence,
            "warnings": self.warnings,
            "errors": self.errors,
        }
