"""Pydantic schemas for the Advanced Analytics Module."""

from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class KPICard(BaseModel):
    """Dynamic KPI metric card calculated from actual dataset schema."""

    id: str
    label: str
    value: Any
    formatted_value: str
    subtext: str
    column: Optional[str] = None
    calculation_method: str
    trend_change_pct: Optional[float] = None
    trend_direction: Optional[str] = None  # 'increasing', 'decreasing', 'stable', None
    category: str = "general"  # 'volume', 'monetary', 'quality', 'temporal', 'distribution'


class ColumnProfileSummary(BaseModel):
    """Profile metadata for an individual dataset column."""

    name: str
    data_type: str
    role: str  # 'numeric', 'categorical', 'date', 'id', 'text'
    non_null_count: int
    null_count: int
    null_percentage: float
    unique_count: int
    sample_values: List[Any] = Field(default_factory=list)


class AnalyticsOverviewResponse(BaseModel):
    """Complete structural overview and dynamic KPIs for the selected dataset."""

    dataset_id: int
    dataset_name: str
    version: str
    rows: int
    columns: int
    file_size_bytes: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    analysis_timestamp: datetime = Field(default_factory=datetime.now)
    duplicate_row_count: int = 0
    duplicate_column_warnings: List[str] = Field(default_factory=list)
    column_summary: List[ColumnProfileSummary]
    kpi_cards: List[KPICard]
    available_numeric_columns: List[str]
    available_categorical_columns: List[str]
    available_date_columns: List[str]
    warnings: List[str] = Field(default_factory=list)


class FilterCondition(BaseModel):
    """Structured filter condition for analytical queries."""

    column: str
    operator: str  # '==', '!=', '>', '<', '>=', '<=', 'in', 'between', 'contains'
    value: Any


class AnalyticsChartRequest(BaseModel):
    """Specification for generating interactive analytical chart and matching table."""

    dataset_id: int
    version: str = "original"
    chart_type: str = "bar"  # 'bar', 'line', 'histogram', 'scatter', 'heatmap', 'donut', 'pie', 'boxplot', 'table'
    x_column: Optional[str] = None
    y_column: Optional[str] = None
    aggregation: Optional[str] = "sum"  # 'sum', 'mean', 'median', 'min', 'max', 'count'
    limit: Optional[int] = 10
    sort_direction: Optional[str] = "desc"  # 'desc', 'asc'
    bins: Optional[int] = 10
    filters: Optional[List[FilterCondition]] = None


class BoxPlotData(BaseModel):
    """Boxplot statistical distribution representation."""

    category: str
    min_val: float
    q1: float
    median: float
    q3: float
    max_val: float
    outliers: List[float] = Field(default_factory=list)


class AnalyticsChartResponse(BaseModel):
    """Response containing validated chart points, matching data table, and metadata."""

    chart_type: str
    title: str
    x_axis_label: str
    y_axis_label: str
    dataset_id: Optional[int] = None
    dataset_name: Optional[str] = None
    version: Optional[str] = None
    records_used: Optional[int] = None
    records_excluded: Optional[int] = None
    recommendations: List[str] = Field(default_factory=list)
    data_points: List[Dict[str, Any]] = Field(default_factory=list)
    table_data: Dict[str, Any] = Field(default_factory=dict)
    matrix: Optional[List[List[float]]] = None
    categories: Optional[List[str]] = None
    boxplot_data: Optional[List[BoxPlotData]] = None
    trendline: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None
    summary_stats: Optional[Dict[str, Any]] = None
    applied_filters: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class AnalyticsTrendRequest(BaseModel):
    """Specification for time-series trend and period comparison analysis."""

    dataset_id: int
    version: str = "original"
    date_column: str
    metric_column: str
    interval: str = "daily"  # 'daily', 'weekly', 'monthly', 'quarterly'
    aggregation: str = "sum"  # 'sum', 'mean', 'count'


class PeriodComparison(BaseModel):
    """Previous-period comparison metrics."""

    current_period_label: str
    current_period_val: float
    prev_period_label: str
    prev_period_val: float
    change_pct: Optional[float] = None
    change_direction: str  # 'increasing', 'decreasing', 'stable', 'baseline_zero'


class AnalyticsTrendResponse(BaseModel):
    """Time-series trend calculation with previous-period comparison and caveat."""

    date_column: str
    metric_column: str
    interval: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    observations_count: Optional[int] = None
    data_points: List[Dict[str, Any]]
    previous_period_comparison: Optional[PeriodComparison] = None
    trend_direction: str  # 'increasing', 'decreasing', 'relatively stable'
    causal_caveat: str
    warnings: List[str] = Field(default_factory=list)


class AnalyticsGroupCompareRequest(BaseModel):
    """Multi-dimensional grouping, filtering, and comparative analysis."""

    dataset_id: int
    version: str = "original"
    group_by_columns: List[str]
    metric_column: str
    aggregation: str = "sum"  # 'sum', 'mean', 'median', 'count', 'min', 'max'
    filters: Optional[List[FilterCondition]] = None
    sort_direction: str = "desc"
    limit: Optional[int] = 15


class AnalyticsGroupCompareResponse(BaseModel):
    """Grouped comparison result table with active filter summary."""

    columns: List[str]
    rows: List[Dict[str, Any]]
    total_groups: int
    metric_label: str
    active_filters: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class AnalyticsStatsRequest(BaseModel):
    """Request for deep statistical analysis across numeric features."""

    dataset_id: int
    version: str = "original"
    numeric_columns: Optional[List[str]] = None


class DescriptiveStatRow(BaseModel):
    """Descriptive statistics row for a numeric column."""

    column: str
    count: int
    missing_count: int
    missing_pct: float
    mean: Optional[float] = None
    median: Optional[float] = None
    std: Optional[float] = None
    min: Optional[float] = None
    q25: Optional[float] = None
    q50: Optional[float] = None
    q75: Optional[float] = None
    max: Optional[float] = None
    skewness: Optional[float] = None
    kurtosis: Optional[float] = None
    outlier_count: int = 0
    outlier_pct: float = 0.0


class OutlierDetail(BaseModel):
    """Outlier analysis for a specific column using IQR method."""

    column: str
    method: str = "IQR (1.5 * IQR rule)"
    lower_bound: float
    upper_bound: float
    outlier_count: int
    outlier_pct: float
    sample_outliers: List[float] = Field(default_factory=list)


class AnalyticsStatsResponse(BaseModel):
    """Statistical descriptive breakdown, correlation matrix, and outlier analysis."""

    descriptive_table: List[DescriptiveStatRow]
    correlation_matrix: Dict[str, Any]
    outliers: List[OutlierDetail]
    limitations: List[str] = Field(default_factory=list)


class AnalyticsInsightItem(BaseModel):
    """Verified, evidence-grounded analytical observation."""

    id: str
    type: str  # 'missing_values', 'duplicate_columns', 'correlation', 'trend', 'outlier', 'distribution', 'concentration', 'data_quality'
    title: str
    statement: str
    metric: str
    columns_involved: List[str]
    confidence: str = "High"  # 'High', 'Moderate'
    severity: str = "Informational"  # 'Informational', 'Warning', 'Critical'
    observations_used: Optional[int] = None
    calculation_method: Optional[str] = None
    limitations: Optional[str] = None
    next_step: Optional[str] = None


class AnalyticsInsightsResponse(BaseModel):
    """Collection of automated evidence-grounded insights for the dataset."""

    dataset_id: int
    dataset_name: str
    version: Optional[str] = "original"
    total_rows: int = 0
    total_columns: int = 0
    insights: List[AnalyticsInsightItem]
    charts_data: Optional[Dict[str, Any]] = None


class AnalyticsExportCSVRequest(BaseModel):
    """Request payload to export tabular analytics data as CSV."""

    filename: Optional[str] = "analytics_data.csv"
    columns: List[str]
    rows: List[Dict[str, Any]]


class AnalyticsReportExportRequest(BaseModel):
    """Request to generate a concise structured analytics summary report."""

    dataset_id: int
    version: str = "original"
    title: Optional[str] = None
    include_kpis: bool = True
    include_stats: bool = True
    include_insights: bool = True
