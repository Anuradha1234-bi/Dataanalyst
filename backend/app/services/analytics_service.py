"""Analytics Service - Comprehensive Exploratory Analytics Engine.

Provides deep statistical profiling, dynamic multidimensional aggregations,
time-series trend analysis with period comparisons, correlation analysis,
outlier detection via IQR, and automated evidence-grounded insights.
Strictly isolated per user and verified against actual uploaded dataset files.
"""

import io
import csv
import json
import math
import time
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime

import pandas as pd
import numpy as np
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse

from app.models.dataset import Dataset
from app.models.user import User
from app.schemas.analytics import (
    KPICard,
    ColumnProfileSummary,
    AnalyticsOverviewResponse,
    FilterCondition,
    AnalyticsChartRequest,
    BoxPlotData,
    AnalyticsChartResponse,
    AnalyticsTrendRequest,
    PeriodComparison,
    AnalyticsTrendResponse,
    AnalyticsGroupCompareRequest,
    AnalyticsGroupCompareResponse,
    AnalyticsStatsRequest,
    DescriptiveStatRow,
    OutlierDetail,
    AnalyticsStatsResponse,
    AnalyticsInsightItem,
    AnalyticsInsightsResponse,
    AnalyticsExportCSVRequest,
    AnalyticsReportExportRequest,
)
from utils.file_loader import FileLoader


def _sanitize_float(val: Any) -> Any:
    """Sanitize float values (NaN, Infinity) for strictly valid JSON serialization."""
    if val is None:
        return None
    if isinstance(val, (float, np.floating)):
        if math.isnan(val) or np.isnan(val):
            return None
        if math.isinf(val) or np.isinf(val):
            return "Infinity" if val > 0 else "-Infinity"
        return round(float(val), 4)
    if isinstance(val, (np.integer, int)):
        return int(val)
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.isoformat()
    return str(val) if not isinstance(val, (bool, str, list, dict)) else val


def _format_compact_number(val: Optional[float]) -> str:
    """Format numeric values with compact human-readable suffixes (k, M, B)."""
    if val is None or not isinstance(val, (int, float)) or math.isnan(val):
        return "N/A"
    abs_v = abs(val)
    if abs_v >= 1_000_000_000:
        return f"{val / 1_000_000_000:.2f}B"
    if abs_v >= 1_000_000:
        return f"{val / 1_000_000:.2f}M"
    if abs_v >= 1_000:
        return f"{val / 1_000:.1f}k"
    if isinstance(val, int) or val.is_integer():
        return f"{int(val):,}"
    return f"{val:.2f}"


class AnalyticsService:
    """Enterprise service executing exploratory and statistical analytics on real datasets."""

    # In-memory DataFrame cache: key = file_path, value = (mtime, size, df)
    _df_cache: Dict[str, Tuple[float, int, pd.DataFrame]] = {}

    @classmethod
    def _get_cached_or_load_df(cls, file_path: Path, filename: str) -> Tuple[Optional[pd.DataFrame], Optional[str]]:
        """Retrieve cached DataFrame or safely load with mtime & size invalidation."""
        file_path_str = str(file_path.resolve())
        stat = file_path.stat()
        mtime = stat.st_mtime
        size = stat.st_size

        cached = cls._df_cache.get(file_path_str)
        if cached:
            c_mtime, c_size, c_df = cached
            if c_mtime == mtime and c_size == size:
                return c_df.copy(), None

        load_res = FileLoader.load_file(
            file_obj=file_path_str,
            filename=filename,
            file_size_bytes=size,
        )
        if not load_res.success or load_res.df is None or load_res.df.empty:
            return None, load_res.error_message or f"Dataset file '{filename}' is empty or unreadable."

        if len(cls._df_cache) >= 16:
            cls._df_cache.pop(next(iter(cls._df_cache)))

        cls._df_cache[file_path_str] = (mtime, size, load_res.df.copy())
        return load_res.df, None

    @classmethod
    def get_dataset_and_df(
        cls,
        dataset_id: int,
        version: str,
        current_user: User,
        db: Session,
    ) -> Tuple[Dataset, pd.DataFrame, str, List[str]]:
        """Enforce user isolation, resolve dataset version (original vs cleaned), and load DataFrame."""
        warnings: List[str] = []

        dataset = (
            db.query(Dataset)
            .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
            .first()
        )
        if not dataset:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset #{dataset_id} not found or access denied.",
            )

        use_version = (version or "original").lower().strip()
        actual_version = "original"
        active_filepath: Path

        if use_version == "cleaned":
            if dataset.has_cleaned and dataset.cleaned_file_path:
                cleaned_p = Path(dataset.cleaned_file_path)
                if cleaned_p.exists() and cleaned_p.is_file():
                    active_filepath = cleaned_p
                    actual_version = "cleaned"
                else:
                    active_filepath = Path(dataset.file_path)
                    warnings.append("Cleaned file was missing from storage disk; using original dataset version.")
            else:
                active_filepath = Path(dataset.file_path)
                warnings.append("No cleaned version exists for this dataset; using original dataset version.")
        else:
            active_filepath = Path(dataset.file_path)

        if not active_filepath.exists() or not active_filepath.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset file '{dataset.filename}' is missing from physical storage.",
            )

        df, err = cls._get_cached_or_load_df(active_filepath, dataset.filename)
        if df is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err or f"Dataset '{dataset.filename}' is empty or unreadable.",
            )

        return dataset, df, actual_version, warnings

    @classmethod
    def _classify_column_role(cls, series: pd.Series, col_name: str) -> str:
        """Classify column analytical role: numeric, date, categorical, id, text."""
        name_lower = col_name.lower()
        non_null_count = int(series.count())
        unique_count = int(series.nunique())

        # Date heuristic
        if pd.api.types.is_datetime64_any_dtype(series):
            return "date"
        if any(term in name_lower for term in ["date", "time", "year", "month", "day", "timestamp", "arrival"]):
            try:
                sample = series.dropna().head(20)
                if len(sample) > 0:
                    parsed = pd.to_datetime(sample, errors="coerce")
                    if parsed.notna().mean() >= 0.7:
                        return "date"
            except Exception:
                pass

        # ID heuristic
        if non_null_count > 0 and (unique_count == non_null_count or unique_count / max(non_null_count, 1) > 0.95):
            if any(term in name_lower for term in ["id", "code", "key", "uuid", "pk", "fk", "num", "serial"]):
                return "id"

        # Numeric heuristic
        if pd.api.types.is_numeric_dtype(series):
            # If numeric has very low cardinality and acts as a code/category
            if unique_count <= 8 and non_null_count > 20 and not any(term in name_lower for term in ["rate", "pct", "price", "amount", "cost", "total", "qty", "count"]):
                return "categorical"
            return "numeric"

        # Email / URL / Phone heuristic -> text
        if any(term in name_lower for term in ["email", "mail", "phone", "mobile", "url", "link", "website"]):
            return "text"

        # High cardinality Name heuristic -> text
        if any(term in name_lower for term in ["name", "fname", "lname", "first_name", "last_name", "full_name"]) and (unique_count > 15 or (non_null_count > 10 and unique_count / non_null_count > 0.5)):
            return "text"

        # High-cardinality heuristic (too many distinct values for a useful category)
        if non_null_count >= 15 and (unique_count / non_null_count) > 0.6:
            return "text"

        # Categorical vs Text heuristic
        if unique_count <= 60 or (non_null_count > 0 and unique_count / non_null_count <= 0.3):
            return "categorical"

        return "text"

    @classmethod
    def get_analytics_overview(
        cls,
        dataset_id: int,
        version: str,
        current_user: User,
        db: Session,
    ) -> AnalyticsOverviewResponse:
        """Calculate dynamic overview, KPIs, and column profiles from actual dataset schema."""
        dataset, df, actual_version, warnings = cls.get_dataset_and_df(dataset_id, version, current_user, db)

        total_rows = len(df)
        total_cols = len(df.columns)
        total_cells = total_rows * total_cols
        total_null_cells = int(df.isna().sum().sum())
        completeness_pct = round(((total_cells - total_null_cells) / max(total_cells, 1)) * 100, 2)

        column_summaries: List[ColumnProfileSummary] = []
        numeric_cols: List[str] = []
        categorical_cols: List[str] = []
        date_cols: List[str] = []

        for col in df.columns:
            s = df[col]
            role = cls._classify_column_role(s, col)
            non_null = int(s.count())
            null_count = int(s.isna().sum())
            null_pct = round((null_count / max(total_rows, 1)) * 100, 2)
            unique_c = int(s.nunique())

            # Sample values (up to 5 unique non-nulls)
            sample_unique = s.dropna().unique()[:5]
            sample_vals = [_sanitize_float(x) for x in sample_unique]

            column_summaries.append(
                ColumnProfileSummary(
                    name=str(col),
                    data_type=str(s.dtype),
                    role=role,
                    non_null_count=non_null,
                    null_count=null_count,
                    null_percentage=null_pct,
                    unique_count=unique_c,
                    sample_values=sample_vals,
                )
            )

            if role == "numeric":
                numeric_cols.append(str(col))
            elif role == "categorical":
                categorical_cols.append(str(col))
            elif role == "date":
                date_cols.append(str(col))

        # Dynamic KPI Cards calculated from the real dataset
        kpi_cards: List[KPICard] = []

        # KPI 1: Total Records
        kpi_cards.append(
            KPICard(
                id="kpi_rows",
                label="Total Records",
                value=total_rows,
                formatted_value=f"{total_rows:,} rows",
                subtext="Total active observations in dataset",
                calculation_method="Exact row count",
                category="volume",
            )
        )

        # KPI 2: Attributes Count
        kpi_cards.append(
            KPICard(
                id="kpi_columns",
                label="Feature Dimensions",
                value=total_cols,
                formatted_value=f"{total_cols} attributes",
                subtext=f"Numeric: {len(numeric_cols)} | Categorical: {len(categorical_cols)} | Dates: {len(date_cols)}",
                calculation_method="Schema dimension count",
                category="volume",
            )
        )

        # KPI 3: Data Completeness
        kpi_cards.append(
            KPICard(
                id="kpi_completeness",
                label="Data Completeness",
                value=completeness_pct,
                formatted_value=f"{completeness_pct}%",
                subtext=f"{total_null_cells:,} missing cells ({100 - completeness_pct:.2f}% missing rate)",
                calculation_method="Non-null cell percentage across all features",
                trend_direction="increasing" if completeness_pct >= 95 else "decreasing",
                category="quality",
            )
        )

        # KPI 4: Memory Footprint
        mem_bytes = int(df.memory_usage(deep=True).sum())
        mem_kb = mem_bytes / 1024
        mem_formatted = f"{mem_kb:.1f} KB" if mem_kb < 1024 else f"{mem_kb / 1024:.2f} MB"
        kpi_cards.append(
            KPICard(
                id="kpi_memory",
                label="Memory Footprint",
                value=mem_bytes,
                formatted_value=mem_formatted,
                subtext=f"Active version: {actual_version.capitalize()}",
                calculation_method="In-memory dataframe memory footprint",
                category="general",
            )
        )

        # KPI 5: Primary Metric Aggregate (if numeric columns exist)
        if numeric_cols:
            primary_col = numeric_cols[0]
            for col in numeric_cols:
                low = col.lower()
                if any(k in low for k in ["total", "amount", "price", "revenue", "sales", "cost", "value"]):
                    primary_col = col
                    break
            
            p_series = pd.to_numeric(df[primary_col], errors="coerce").dropna()
            if len(p_series) > 0:
                p_sum = float(p_series.sum())
                p_mean = float(p_series.mean())
                is_monetary = any(m in primary_col.lower() for m in ["price", "amount", "revenue", "sales", "cost", "fee"])
                prefix = "$" if is_monetary else ""
                kpi_cards.append(
                    KPICard(
                        id="kpi_primary_metric",
                        label=f"Total {primary_col.replace('_', ' ').title()}",
                        value=p_sum,
                        formatted_value=f"{prefix}{_format_compact_number(p_sum)}",
                        subtext=f"Average: {prefix}{_format_compact_number(p_mean)} (n={len(p_series):,})",
                        column=primary_col,
                        calculation_method=f"Sum and arithmetic mean of column '{primary_col}'",
                        category="monetary" if is_monetary else "distribution",
                    )
                )

        # KPI 6: Outlier Detection Concentration across numerics
        total_outliers = 0
        analyzed_num_cells = 0
        for col in numeric_cols[:5]:
            s_num = pd.to_numeric(df[col], errors="coerce").dropna()
            if len(s_num) >= 4:
                q25, q75 = s_num.quantile(0.25), s_num.quantile(0.75)
                iqr = q75 - q25
                if iqr > 0:
                    outlier_mask = (s_num < (q25 - 1.5 * iqr)) | (s_num > (q75 + 1.5 * iqr))
                    total_outliers += int(outlier_mask.sum())
                analyzed_num_cells += len(s_num)

        outlier_pct = round((total_outliers / max(analyzed_num_cells, 1)) * 100, 2)
        kpi_cards.append(
            KPICard(
                id="kpi_outliers",
                label="IQR Outlier Volume",
                value=total_outliers,
                formatted_value=f"{total_outliers} outliers",
                subtext=f"{outlier_pct}% of analyzed numeric records beyond 1.5x IQR",
                calculation_method="Tukey 1.5x Interquartile Range boundary evaluation",
                trend_direction="stable" if outlier_pct < 5 else "increasing",
                category="distribution",
            )
        )

        # Duplicate Column Name Detection (case/whitespace/underscore variants)
        norm_map: Dict[str, List[str]] = {}
        for col in df.columns:
            norm_key = str(col).strip().lower().replace(" ", "_").replace("-", "_")
            norm_map.setdefault(norm_key, []).append(str(col))

        duplicate_col_warnings: List[str] = []
        for norm_key, col_list in norm_map.items():
            if len(col_list) > 1:
                warn_msg = f"Potential duplicate column names detected: {', '.join(repr(c) for c in col_list)}. Column definitions are preserved without alteration."
                duplicate_col_warnings.append(warn_msg)
                warnings.append(warn_msg)

        # Duplicate Rows Detection
        duplicate_rows = int(df.duplicated().sum())
        if duplicate_rows > 0:
            dup_pct = round((duplicate_rows / max(total_rows, 1)) * 100, 2)
            warnings.append(f"Dataset contains {duplicate_rows:,} duplicate rows ({dup_pct}% of total records).")

        return AnalyticsOverviewResponse(
            dataset_id=dataset.id,
            dataset_name=dataset.original_filename or dataset.filename,
            version=actual_version,
            rows=total_rows,
            columns=total_cols,
            file_size_bytes=dataset.file_size_bytes or 0,
            created_at=dataset.created_at,
            updated_at=dataset.updated_at,
            analysis_timestamp=datetime.now(),
            duplicate_row_count=duplicate_rows,
            duplicate_column_warnings=duplicate_col_warnings,
            column_summary=column_summaries,
            kpi_cards=kpi_cards,
            available_numeric_columns=numeric_cols,
            available_categorical_columns=categorical_cols,
            available_date_columns=date_cols,
            warnings=warnings,
        )

    @classmethod
    def _apply_filters(cls, df: pd.DataFrame, filters: Optional[List[FilterCondition]]) -> Tuple[pd.DataFrame, List[Dict[str, Any]], List[str]]:
        """Safely apply structured filter conditions against DataFrame."""
        applied: List[Dict[str, Any]] = []
        warnings: List[str] = []

        if not filters:
            return df, applied, warnings

        filtered_df = df.copy()

        for f in filters:
            col = f.column
            if col not in filtered_df.columns:
                warnings.append(f"Filter column '{col}' not found in dataset. Skipping.")
                continue

            op = f.operator.lower().strip()
            val = f.value

            try:
                series = filtered_df[col]
                is_num = pd.api.types.is_numeric_dtype(series)

                if op in ["==", "eq"]:
                    if is_num:
                        filtered_df = filtered_df[pd.to_numeric(series, errors="coerce") == float(val)]
                    else:
                        filtered_df = filtered_df[series.astype(str).str.lower() == str(val).lower()]
                elif op in ["!=", "neq"]:
                    if is_num:
                        filtered_df = filtered_df[pd.to_numeric(series, errors="coerce") != float(val)]
                    else:
                        filtered_df = filtered_df[series.astype(str).str.lower() != str(val).lower()]
                elif op in [">", "gt"]:
                    filtered_df = filtered_df[pd.to_numeric(series, errors="coerce") > float(val)]
                elif op in [">=", "gte"]:
                    filtered_df = filtered_df[pd.to_numeric(series, errors="coerce") >= float(val)]
                elif op in ["<", "lt"]:
                    filtered_df = filtered_df[pd.to_numeric(series, errors="coerce") < float(val)]
                elif op in ["<=", "lte"]:
                    filtered_df = filtered_df[pd.to_numeric(series, errors="coerce") <= float(val)]
                elif op in ["contains", "like"]:
                    filtered_df = filtered_df[series.astype(str).str.contains(str(val), case=False, na=False)]
                elif op == "in":
                    items = val if isinstance(val, list) else [str(x).strip() for x in str(val).split(",")]
                    if is_num:
                        num_items = [float(x) for x in items if str(x).replace(".", "", 1).isdigit()]
                        filtered_df = filtered_df[pd.to_numeric(series, errors="coerce").isin(num_items)]
                    else:
                        str_items = [str(x).lower() for x in items]
                        filtered_df = filtered_df[series.astype(str).str.lower().isin(str_items)]
                elif op == "between":
                    parts = val if isinstance(val, list) else [str(x).strip() for x in str(val).split(",")]
                    if len(parts) >= 2:
                        low_v, high_v = float(parts[0]), float(parts[1])
                        num_s = pd.to_numeric(series, errors="coerce")
                        filtered_df = filtered_df[(num_s >= low_v) & (num_s <= high_v)]

                applied.append({"column": col, "operator": op, "value": val})
            except Exception as e:
                warnings.append(f"Failed to apply filter on '{col}': {str(e)}")

        return filtered_df, applied, warnings

    @classmethod
    def generate_chart(
        cls,
        request: AnalyticsChartRequest,
        current_user: User,
        db: Session,
    ) -> AnalyticsChartResponse:
        """Generate interactive chart visualization and matching data table from actual dataset."""
        dataset, df, actual_version, warnings = cls.get_dataset_and_df(
            request.dataset_id, request.version, current_user, db
        )

        filtered_df, applied_filters, filter_warnings = cls._apply_filters(df, request.filters)
        warnings.extend(filter_warnings)

        if filtered_df.empty:
            return AnalyticsChartResponse(
                chart_type=request.chart_type,
                title="No Data Available After Filtering",
                x_axis_label=request.x_column or "Dimension",
                y_axis_label=request.y_column or "Metric",
                dataset_id=dataset.id,
                dataset_name=dataset.original_filename or dataset.filename,
                version=actual_version,
                records_used=0,
                records_excluded=len(df),
                data_points=[],
                table_data={"columns": [], "rows": []},
                applied_filters=applied_filters,
                warnings=warnings + ["Applied filter conditions returned 0 matching records."],
            )

        chart_type = (request.chart_type or "bar").lower().strip()
        agg = (request.aggregation or "sum").lower().strip()
        limit = max(1, min(request.limit or 10, 100))
        sort_dir = (request.sort_direction or "desc").lower().strip()
        is_desc = sort_dir == "desc"

        # Determine default columns if omitted
        all_numeric = [c for c in filtered_df.columns if pd.api.types.is_numeric_dtype(filtered_df[c])]
        all_categorical = [c for c in filtered_df.columns if not pd.api.types.is_numeric_dtype(filtered_df[c])]

        if request.x_column and request.x_column in filtered_df.columns:
            x_col = request.x_column
        else:
            x_col = all_categorical[0] if all_categorical else filtered_df.columns[0]
            if request.x_column and request.x_column not in filtered_df.columns:
                warnings.append(f"Specified x_column '{request.x_column}' not found in dataset; defaulted to '{x_col}'.")

        if request.y_column and request.y_column in filtered_df.columns:
            y_col = request.y_column
        elif request.y_column and request.y_column not in filtered_df.columns:
            y_col = all_numeric[0] if all_numeric else None
            warnings.append(f"Specified y_column '{request.y_column}' not found in dataset; defaulted to '{y_col or 'count'}'.")
        else:
            y_col = all_numeric[0] if all_numeric else None

        # Intelligent Chart Recommendations & Validation based on actual dataset schema
        recommendations: List[str] = []

        if y_col and any(term in str(y_col).lower() for term in ["id", "code", "key", "pk", "uuid", "fk", "serial"]) and agg == "sum":
            warnings.append(f"Summing identifier column '{y_col}' is statistically misleading. Consider using 'count' or selecting a numeric business metric.")

        if all_categorical and all_numeric:
            cat_sample = filtered_df[x_col] if x_col in filtered_df.columns else filtered_df[all_categorical[0]]
            n_unique = cat_sample.nunique()
            if 2 <= n_unique <= 7 and chart_type not in ["donut", "pie"]:
                recommendations.append(f"Dimension '{cat_sample.name}' has {n_unique} distinct categories; a Donut or Pie Chart is highly effective.")

        if y_col and y_col in filtered_df.columns:
            s_num_check = pd.to_numeric(filtered_df[y_col], errors="coerce").dropna()
            if len(s_num_check) > 5:
                skew_val = float(s_num_check.skew())
                if abs(skew_val) > 1.5 and agg in ["mean", "sum"]:
                    recommendations.append(f"Metric '{y_col}' is heavily skewed ({skew_val:.2f}); Median aggregation provides a more representative central value.")

        date_candidates = [c for c in filtered_df.columns if cls._classify_column_role(filtered_df[c], c) == "date"]
        if date_candidates and chart_type != "line":
            recommendations.append(f"Temporal column '{date_candidates[0]}' identified; a chronological Line Chart is recommended for trend analysis.")

        data_points: List[Dict[str, Any]] = []
        table_columns: List[str] = []
        table_rows: List[Dict[str, Any]] = []
        trendline: Optional[List[Dict[str, Any]]] = None
        boxplot_data: Optional[List[BoxPlotData]] = None
        matrix: Optional[List[List[float]]] = None
        categories: Optional[List[str]] = None
        title = f"{chart_type.capitalize()} Analysis of {x_col}"
        x_label = str(x_col)
        y_label = f"{agg.capitalize()} of {y_col}" if y_col else "Count"

        # ----------------- HISTOGRAM -----------------
        if chart_type == "histogram":
            target_col = request.x_column if (request.x_column and request.x_column in filtered_df.columns) else (request.y_column if (request.y_column and request.y_column in filtered_df.columns) else (y_col or x_col))
            s_num = pd.to_numeric(filtered_df[target_col], errors="coerce").dropna()
            num_bins = max(3, min(request.bins or 10, 30))
            if len(s_num) > 0:
                counts, bin_edges = np.histogram(s_num, bins=num_bins)
                table_columns = ["Bin Range", "Frequency Count", "Percentage"]
                for i in range(len(counts)):
                    b_label = f"{bin_edges[i]:.2f} - {bin_edges[i+1]:.2f}"
                    cnt = int(counts[i])
                    pct = round((cnt / len(s_num)) * 100, 2)
                    data_points.append({"label": b_label, "value": cnt})
                    table_rows.append({"Bin Range": b_label, "Frequency Count": cnt, "Percentage": f"{pct}%"})
            title = f"Histogram Distribution: {target_col}"
            x_label = str(target_col)
            y_label = "Frequency Count"

        # ----------------- SCATTER PLOT -----------------
        elif chart_type == "scatter":
            if not y_col:
                if len(all_numeric) >= 2:
                    x_col = all_numeric[0]
                    y_col = all_numeric[1]
                else:
                    y_col = x_col

            s_x = pd.to_numeric(filtered_df[x_col], errors="coerce")
            s_y = pd.to_numeric(filtered_df[y_col], errors="coerce")
            valid_mask = s_x.notna() & s_y.notna()
            clean_x = s_x[valid_mask].values
            clean_y = s_y[valid_mask].values

            # Sample/Limit to 100 for responsive rendering
            indices = np.arange(len(clean_x))
            if len(clean_x) > 100:
                indices = np.linspace(0, len(clean_x) - 1, 100, dtype=int)

            table_columns = [str(x_col), str(y_col)]
            for idx in indices:
                xv = float(clean_x[idx])
                yv = float(clean_y[idx])
                data_points.append({"label": f"({xv:.1f}, {yv:.1f})", "value": round(yv, 2), "x": round(xv, 2)})
                table_rows.append({str(x_col): round(xv, 2), str(y_col): round(yv, 2)})

            # Calculate regression trendline
            if len(clean_x) >= 2 and np.std(clean_x) > 0:
                slope, intercept = np.polyfit(clean_x, clean_y, 1)
                min_x = float(np.min(clean_x))
                max_x = float(np.max(clean_x))
                trendline = [
                    {"x": float(round(float(min_x), 2)), "y": float(round(float(slope * min_x + intercept), 2))},
                    {"x": float(round(float(max_x), 2)), "y": float(round(float(slope * max_x + intercept), 2))},
                ]

            title = f"Scatter Correlation: {x_col} vs {y_col}"
            x_label = str(x_col)
            y_label = str(y_col)

        # ----------------- HEATMAP (Correlation Matrix) -----------------
        elif chart_type == "heatmap":
            num_df = filtered_df[all_numeric].apply(pd.to_numeric, errors="coerce").dropna(how="all")
            corr = num_df.corr(method="pearson")
            categories = list(corr.columns)
            matrix = []
            for r_col in categories:
                row_vals = []
                for c_col in categories:
                    val = corr.loc[r_col, c_col]
                    row_vals.append(None if (math.isnan(val) or np.isnan(val)) else round(float(val), 2))
                matrix.append(row_vals)

            table_columns = ["Attribute"] + categories
            for r_idx, r_col in enumerate(categories):
                r_dict = {"Attribute": r_col}
                for c_idx, c_col in enumerate(categories):
                    r_dict[c_col] = matrix[r_idx][c_idx] if matrix[r_idx][c_idx] is not None else "—"
                table_rows.append(r_dict)

            title = "Correlation Heatmap Matrix"
            x_label = "Feature Attribute"
            y_label = "Feature Attribute"

        # ----------------- BOXPLOT -----------------
        elif chart_type == "boxplot":
            metric_target = y_col or (all_numeric[0] if all_numeric else None)
            boxplot_data = []
            table_columns = ["Category", "Min", "Q1 (25%)", "Median", "Q3 (75%)", "Max", "Outliers Count"]

            if metric_target and metric_target in filtered_df.columns:
                if x_col and x_col != metric_target and x_col in filtered_df.columns:
                    top_groups = filtered_df[x_col].value_counts().head(8).index
                    for grp in top_groups:
                        subset = pd.to_numeric(filtered_df[filtered_df[x_col] == grp][metric_target], errors="coerce").dropna()
                        if len(subset) >= 4:
                            q1, med, q3 = float(subset.quantile(0.25)), float(subset.median()), float(subset.quantile(0.75))
                            iqr = q3 - q1
                            low_b = q1 - 1.5 * iqr
                            up_b = q3 + 1.5 * iqr
                            min_val = float(subset[subset >= low_b].min() if len(subset[subset >= low_b]) > 0 else subset.min())
                            max_val = float(subset[subset <= up_b].max() if len(subset[subset <= up_b]) > 0 else subset.max())
                            outliers = [round(float(o), 2) for o in subset[(subset < low_b) | (subset > up_b)]]
                            b_item = BoxPlotData(
                                category=str(grp),
                                min_val=round(min_val, 2),
                                q1=round(q1, 2),
                                median=round(med, 2),
                                q3=round(q3, 2),
                                max_val=round(max_val, 2),
                                outliers=outliers[:10],
                            )
                            boxplot_data.append(b_item)
                            table_rows.append({
                                "Category": str(grp),
                                "Min": round(min_val, 2),
                                "Q1 (25%)": round(q1, 2),
                                "Median": round(med, 2),
                                "Q3 (75%)": round(q3, 2),
                                "Max": round(max_val, 2),
                                "Outliers Count": len(outliers),
                            })
                else:
                    subset = pd.to_numeric(filtered_df[metric_target], errors="coerce").dropna()
                    if len(subset) >= 4:
                        q1, med, q3 = float(subset.quantile(0.25)), float(subset.median()), float(subset.quantile(0.75))
                        iqr = q3 - q1
                        low_b = q1 - 1.5 * iqr
                        up_b = q3 + 1.5 * iqr
                        min_val = float(subset[subset >= low_b].min() if len(subset[subset >= low_b]) > 0 else subset.min())
                        max_val = float(subset[subset <= up_b].max() if len(subset[subset <= up_b]) > 0 else subset.max())
                        outliers = [round(float(o), 2) for o in subset[(subset < low_b) | (subset > up_b)]]
                        b_item = BoxPlotData(
                            category=str(metric_target),
                            min_val=round(min_val, 2),
                            q1=round(q1, 2),
                            median=round(med, 2),
                            q3=round(q3, 2),
                            max_val=round(max_val, 2),
                            outliers=outliers[:10],
                        )
                        boxplot_data.append(b_item)
                        table_rows.append({
                            "Category": str(metric_target),
                            "Min": round(min_val, 2),
                            "Q1 (25%)": round(q1, 2),
                            "Median": round(med, 2),
                            "Q3 (75%)": round(q3, 2),
                            "Max": round(max_val, 2),
                            "Outliers Count": len(outliers),
                        })

            title = f"Boxplot Quartile Distribution: {metric_target}"
            x_label = str(x_col) if x_col else "Overall"
            y_label = str(metric_target)

        # ----------------- BAR / LINE / DONUT / TABLE -----------------
        else:
            metric_label = f"{agg.capitalize()} of {y_col}" if y_col else "Record Count"
            table_columns = [str(x_col), metric_label]

            if y_col and y_col in filtered_df.columns:
                grouped = filtered_df.groupby(x_col)[y_col]
                if agg == "mean":
                    res_series = grouped.mean()
                elif agg == "median":
                    res_series = grouped.median()
                elif agg == "min":
                    res_series = grouped.min()
                elif agg == "max":
                    res_series = grouped.max()
                elif agg == "count":
                    res_series = grouped.count()
                else:
                    res_series = grouped.sum()
            else:
                res_series = filtered_df[x_col].value_counts()

            # Clean and sort
            res_series = res_series.dropna()

            # For time-series / date charts, sort chronologically ascending
            is_date_trend = (chart_type == "line") or (cls._classify_column_role(filtered_df[x_col], x_col) == "date")
            is_chronological = False

            if is_date_trend:
                try:
                    parsed_dates = pd.to_datetime(res_series.index, errors="coerce")
                    valid_mask = parsed_dates.notna()
                    if valid_mask.sum() >= 2:
                        res_series = res_series[valid_mask]
                        parsed_dates = parsed_dates[valid_mask]
                        res_series = res_series.iloc[parsed_dates.argsort()]
                        is_chronological = True
                except Exception:
                    pass

            if not is_chronological:
                if is_desc:
                    res_series = res_series.sort_values(ascending=False)
                else:
                    res_series = res_series.sort_values(ascending=True)
                top_records = res_series.head(limit)
            else:
                # Chronological trend preserves time ordering and shows up to 25 timeline points
                trend_limit = max(limit, 25)
                top_records = res_series.tail(trend_limit) if len(res_series) > trend_limit else res_series

            # If Donut or Pie and items > 6, collapse excess to "Other"
            if chart_type in ["donut", "pie"] and len(res_series) > 6:
                main_slice = res_series.head(5)
                other_val = res_series.iloc[5:].sum()
                for k, v in main_slice.items():
                    data_points.append({"label": str(k), "value": round(float(v), 2)})
                    table_rows.append({str(x_col): str(k), metric_label: round(float(v), 2)})
                data_points.append({"label": "Other", "value": round(float(other_val), 2)})
                table_rows.append({str(x_col): "Other", metric_label: round(float(other_val), 2)})
            else:
                for k, v in top_records.items():
                    val_float = round(float(v), 2)
                    data_points.append({"label": str(k), "value": val_float})
                    table_rows.append({str(x_col): str(k), metric_label: val_float})

            title = f"{agg.capitalize()} of {y_col or 'Count'} by {x_col}"
            x_label = str(x_col)
            y_label = metric_label

        # Summary statistics of the visualization points
        summary_stats = None
        if data_points:
            numeric_vals = [p["value"] for p in data_points if isinstance(p.get("value"), (int, float)) and not math.isnan(p["value"])]
            if numeric_vals:
                summary_stats = {
                    "count": len(numeric_vals),
                    "sum": round(float(np.sum(numeric_vals)), 2),
                    "mean": round(float(np.mean(numeric_vals)), 2),
                    "min": round(float(np.min(numeric_vals)), 2),
                    "max": round(float(np.max(numeric_vals)), 2),
                }

        records_used = len(filtered_df)
        records_excluded = max(0, len(df) - records_used)

        return AnalyticsChartResponse(
            chart_type=chart_type,
            title=title,
            x_axis_label=x_label,
            y_axis_label=y_label,
            dataset_id=dataset.id,
            dataset_name=dataset.original_filename or dataset.filename,
            version=actual_version,
            records_used=records_used,
            records_excluded=records_excluded,
            recommendations=recommendations,
            data_points=data_points,
            table_data={"columns": table_columns, "rows": table_rows},
            matrix=matrix,
            categories=categories,
            boxplot_data=boxplot_data,
            trendline=trendline,
            summary_stats=summary_stats,
            applied_filters=applied_filters,
            warnings=warnings,
        )

    @classmethod
    def analyze_trend(
        cls,
        request: AnalyticsTrendRequest,
        current_user: User,
        db: Session,
    ) -> AnalyticsTrendResponse:
        """Execute chronological time-series aggregation, period-over-period comparison, and caveat."""
        dataset, df, actual_version, warnings = cls.get_dataset_and_df(
            request.dataset_id, request.version, current_user, db
        )

        date_col = request.date_column
        metric_col = request.metric_column
        interval = (request.interval or "daily").lower().strip()
        agg = (request.aggregation or "sum").lower().strip()

        if date_col not in df.columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Date column '{date_col}' does not exist in dataset.",
            )
        if metric_col not in df.columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Metric column '{metric_col}' does not exist in dataset.",
            )

        work_df = df[[date_col, metric_col]].copy()
        work_df[date_col] = pd.to_datetime(work_df[date_col], errors="coerce")
        work_df[metric_col] = pd.to_numeric(work_df[metric_col], errors="coerce")
        work_df = work_df.dropna(subset=[date_col, metric_col]).sort_values(by=date_col)

        if work_df.empty:
            return AnalyticsTrendResponse(
                date_column=date_col,
                metric_column=metric_col,
                interval=interval,
                data_points=[],
                trend_direction="relatively stable",
                causal_caveat="No valid parsed datetime records available in selected column.",
                warnings=warnings + ["Unable to parse datetime values from column."],
            )

        # Calculate date range and observations
        start_date_str = work_df[date_col].min().strftime("%Y-%m-%d") if not work_df.empty else None
        end_date_str = work_df[date_col].max().strftime("%Y-%m-%d") if not work_df.empty else None
        observations_count = len(work_df)

        # Bucket by interval
        if interval == "quarterly":
            work_df["bucket"] = work_df[date_col].dt.to_period("Q").dt.to_timestamp()
            date_fmt = "quarterly"
        elif interval == "monthly":
            work_df["bucket"] = work_df[date_col].dt.to_period("M").dt.to_timestamp()
            date_fmt = "%Y-%m"
        elif interval == "weekly":
            work_df["bucket"] = work_df[date_col].dt.to_period("W").dt.to_timestamp()
            date_fmt = "%Y-W%U"
        else:
            work_df["bucket"] = work_df[date_col].dt.to_period("D").dt.to_timestamp()
            date_fmt = "%Y-%m-%d"

        def _fmt_ts(ts: pd.Timestamp) -> str:
            if date_fmt == "quarterly":
                q = (ts.month - 1) // 3 + 1
                return f"{ts.year}-Q{q}"
            return ts.strftime(date_fmt)

        grouped = work_df.groupby("bucket")[metric_col]
        if agg == "mean":
            ts_series = grouped.mean()
        elif agg == "count":
            ts_series = grouped.count()
        else:
            ts_series = grouped.sum()

        ts_series = ts_series.sort_index()

        data_points: List[Dict[str, Any]] = []
        for ts, val in ts_series.items():
            dt_label = _fmt_ts(ts)
            data_points.append({"label": dt_label, "date": ts.isoformat(), "value": round(float(val), 2)})

        # Period-over-period comparison
        period_comp: Optional[PeriodComparison] = None
        if len(ts_series) >= 2:
            prev_t, prev_v = ts_series.index[-2], float(ts_series.iloc[-2])
            curr_t, curr_v = ts_series.index[-1], float(ts_series.iloc[-1])
            chg_pct = None
            if abs(prev_v) > 0.0001:
                chg_pct = round(((curr_v - prev_v) / abs(prev_v)) * 100, 2)

            chg_dir = "stable"
            if chg_pct is not None:
                if chg_pct > 1.0:
                    chg_dir = "increasing"
                elif chg_pct < -1.0:
                    chg_dir = "decreasing"
            elif prev_v == 0 and curr_v > 0:
                chg_dir = "baseline_zero"

            period_comp = PeriodComparison(
                current_period_label=_fmt_ts(curr_t),
                current_period_val=round(curr_v, 2),
                prev_period_label=_fmt_ts(prev_t),
                prev_period_val=round(prev_v, 2),
                change_pct=chg_pct,
                change_direction=chg_dir,
            )

        # Overall trend direction
        trend_direction = "relatively stable"
        if len(ts_series) >= 3:
            vals = ts_series.values
            half = len(vals) // 2
            first_half_avg = np.mean(vals[:half])
            second_half_avg = np.mean(vals[half:])
            diff_pct = ((second_half_avg - first_half_avg) / max(abs(first_half_avg), 1)) * 100
            if diff_pct > 5.0:
                trend_direction = "increasing"
            elif diff_pct < -5.0:
                trend_direction = "decreasing"

        causal_caveat = (
            "Statistical Note: Observed time-series trajectory reflects historical correlation "
            "and does not constitute direct causality. Confounding business variables, seasonality, "
            "and external dynamics should be evaluated prior to operational intervention."
        )

        return AnalyticsTrendResponse(
            date_column=date_col,
            metric_column=metric_col,
            interval=interval,
            start_date=start_date_str,
            end_date=end_date_str,
            observations_count=observations_count,
            data_points=data_points,
            previous_period_comparison=period_comp,
            trend_direction=trend_direction,
            causal_caveat=causal_caveat,
            warnings=warnings,
        )

    @classmethod
    def group_compare(
        cls,
        request: AnalyticsGroupCompareRequest,
        current_user: User,
        db: Session,
    ) -> AnalyticsGroupCompareResponse:
        """Multidimensional grouping, conditional filtering, and group-by comparison table."""
        dataset, df, actual_version, warnings = cls.get_dataset_and_df(
            request.dataset_id, request.version, current_user, db
        )

        filtered_df, applied_filters, filter_warnings = cls._apply_filters(df, request.filters)
        warnings.extend(filter_warnings)

        grp_cols = [c for c in request.group_by_columns if c in filtered_df.columns]
        if not grp_cols:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one valid group_by column must exist in dataset.",
            )

        metric_col = request.metric_column
        if metric_col not in filtered_df.columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Metric column '{metric_col}' does not exist in dataset.",
            )

        agg = (request.aggregation or "sum").lower().strip()
        limit = max(1, min(request.limit or 15, 100))
        is_desc = (request.sort_direction or "desc").lower().strip() == "desc"

        grouped = filtered_df.groupby(grp_cols)[metric_col]
        if agg == "mean":
            res = grouped.mean()
        elif agg == "median":
            res = grouped.median()
        elif agg == "min":
            res = grouped.min()
        elif agg == "max":
            res = grouped.max()
        elif agg == "count":
            res = grouped.count()
        else:
            res = grouped.sum()

        res = res.dropna().sort_values(ascending=not is_desc)
        total_groups = len(res)
        res_head = res.head(limit)

        metric_label = f"{agg.capitalize()} of {metric_col}"
        output_cols = grp_cols + [metric_label]
        rows: List[Dict[str, Any]] = []

        for idx, val in res_head.items():
            row_dict: Dict[str, Any] = {}
            if isinstance(idx, tuple):
                for col_name, col_val in zip(grp_cols, idx):
                    row_dict[col_name] = str(col_val)
            else:
                row_dict[grp_cols[0]] = str(idx)
            row_dict[metric_label] = round(float(val), 2)
            rows.append(row_dict)

        return AnalyticsGroupCompareResponse(
            columns=output_cols,
            rows=rows,
            total_groups=total_groups,
            metric_label=metric_label,
            active_filters=applied_filters,
            warnings=warnings,
        )

    @classmethod
    def deep_stats(
        cls,
        request: AnalyticsStatsRequest,
        current_user: User,
        db: Session,
    ) -> AnalyticsStatsResponse:
        """Calculate comprehensive descriptive stats, Pearson correlation matrix, and IQR outliers."""
        dataset, df, actual_version, warnings = cls.get_dataset_and_df(
            request.dataset_id, request.version, current_user, db
        )

        all_numeric = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
        selected_cols = [c for c in (request.numeric_columns or all_numeric) if c in df.columns and pd.api.types.is_numeric_dtype(df[c])]

        descriptive_rows: List[DescriptiveStatRow] = []
        outlier_details: List[OutlierDetail] = []
        limitations: List[str] = [
            "Pearson correlation measures strictly linear relationships; non-linear dependencies may exist undetected.",
            "IQR outlier detection assumes continuous univariate distributions and is sensitive to small sample sizes.",
        ]

        for col in selected_cols:
            s_raw = df[col]
            total_c = len(s_raw)
            s_num = pd.to_numeric(s_raw, errors="coerce").dropna()
            non_null = len(s_num)
            missing = total_c - non_null
            missing_pct = round((missing / max(total_c, 1)) * 100, 2)

            if non_null == 0:
                continue

            q25 = float(s_num.quantile(0.25))
            med = float(s_num.median())
            q75 = float(s_num.quantile(0.75))
            iqr = q75 - q25
            low_b = q25 - 1.5 * iqr
            up_b = q75 + 1.5 * iqr

            outliers_s = s_num[(s_num < low_b) | (s_num > up_b)]
            outlier_cnt = int(len(outliers_s))
            outlier_pct = round((outlier_cnt / max(non_null, 1)) * 100, 2)

            skewness = float(s_num.skew()) if non_null >= 3 else None
            kurtosis = float(s_num.kurt()) if non_null >= 4 else None

            descriptive_rows.append(
                DescriptiveStatRow(
                    column=col,
                    count=non_null,
                    missing_count=missing,
                    missing_pct=missing_pct,
                    mean=round(float(s_num.mean()), 2),
                    median=round(med, 2),
                    std=round(float(s_num.std()), 2) if non_null >= 2 else None,
                    min=round(float(s_num.min()), 2),
                    q25=round(q25, 2),
                    q50=round(med, 2),
                    q75=round(q75, 2),
                    max=round(float(s_num.max()), 2),
                    skewness=round(skewness, 2) if skewness is not None else None,
                    kurtosis=round(kurtosis, 2) if kurtosis is not None else None,
                    outlier_count=outlier_cnt,
                    outlier_pct=outlier_pct,
                )
            )

            if outlier_cnt > 0:
                sample_out = [round(float(x), 2) for x in outliers_s.head(8)]
                outlier_details.append(
                    OutlierDetail(
                        column=col,
                        method="IQR (1.5 * IQR rule)",
                        lower_bound=round(low_b, 2),
                        upper_bound=round(up_b, 2),
                        outlier_count=outlier_cnt,
                        outlier_pct=outlier_pct,
                        sample_outliers=sample_out,
                    )
                )

        # Correlation Matrix (Filtered for valid non-constant features)
        corr_dict: Dict[str, Any] = {"columns": [], "matrix": []}
        if len(selected_cols) >= 2:
            valid_corr_cols = []
            for c in selected_cols:
                s_c = pd.to_numeric(df[c], errors="coerce").dropna()
                if len(s_c) > 1 and s_c.nunique() > 1 and float(s_c.std()) > 0:
                    valid_corr_cols.append(c)
                else:
                    limitations.append(f"Column '{c}' has constant or invariant values (zero variance) and was excluded from Pearson correlation.")

            if len(valid_corr_cols) >= 2:
                num_df = df[valid_corr_cols].apply(pd.to_numeric, errors="coerce")
                corr_mat = num_df.corr(method="pearson")
                corr_dict["columns"] = list(corr_mat.columns)
                corr_dict["matrix"] = [
                    [None if (math.isnan(v) or np.isnan(v)) else round(float(v), 2) for v in row]
                    for row in corr_mat.values
                ]

        return AnalyticsStatsResponse(
            descriptive_table=descriptive_rows,
            correlation_matrix=corr_dict,
            outliers=outlier_details,
            limitations=limitations,
        )

    @classmethod
    def generate_insights(
        cls,
        dataset_id: int,
        version: str,
        current_user: User,
        db: Session,
    ) -> AnalyticsInsightsResponse:
        """Automated evidence-grounded insights strictly verified against dataset metrics."""
        dataset, df, actual_version, warnings = cls.get_dataset_and_df(dataset_id, version, current_user, db)

        insights: List[AnalyticsInsightItem] = []
        total_rows = len(df)
        total_cols = len(df.columns)

        # Helper for identifier columns
        def is_identifier(col_name: str, s: pd.Series) -> bool:
            norm_name = str(col_name).strip().lower().replace(" ", "_").replace("-", "_")
            if norm_name in ("id", "identifier", "row_id", "row_number", "index", "uuid", "guid", "key", "pk", "fk") or norm_name.endswith("_id") or norm_name.startswith("id_"):
                return True
            if (not pd.api.types.is_float_dtype(s)) and total_rows > 10 and s.nunique() == total_rows:
                if any(k in norm_name for k in ("code", "num", "serial", "ref", "hash", "token")) or s.dtype == object:
                    return True
            return False

        # Helper for checking if two columns have identical values
        def are_exact_duplicates(s1: pd.Series, s2: pd.Series) -> bool:
            if len(s1) != len(s2):
                return False
            # Check null match
            s1_null = s1.isna()
            s2_null = s2.isna()
            if (s1_null ^ s2_null).any():
                return False
            valid_mask = ~s1_null
            if not valid_mask.any():
                return True  # both entirely null
            if pd.api.types.is_numeric_dtype(s1) and pd.api.types.is_numeric_dtype(s2):
                v1 = pd.to_numeric(s1[valid_mask], errors="coerce")
                v2 = pd.to_numeric(s2[valid_mask], errors="coerce")
                if v1.isna().any() or v2.isna().any():
                    return bool((v1.isna() == v2.isna()).all())
                return bool(np.isclose(v1, v2, rtol=1e-5, atol=1e-8).all())
            else:
                str1 = s1[valid_mask].astype(str).str.strip()
                str2 = s2[valid_mask].astype(str).str.strip()
                return bool((str1 == str2).all())

        # If dataset is empty
        if total_rows == 0 or total_cols == 0:
            insights.append(
                AnalyticsInsightItem(
                    id="empty_dataset",
                    type="data_quality",
                    title="Empty Dataset Detected",
                    statement="The selected dataset contains zero records or zero columns. Statistical analysis cannot be performed.",
                    metric="0 Rows",
                    columns_involved=[],
                    confidence="High",
                    severity="Critical",
                    observations_used=0,
                    calculation_method="Dataset dimension check: len(df) == 0",
                    limitations="No records available for profiling.",
                    next_step="Upload a populated dataset file with valid records.",
                )
            )
            empty_charts = {
                "severity_distribution": {
                    "chart_type": "donut",
                    "title": "Insight Severity Distribution",
                    "data_points": [
                        {"label": "Critical", "value": 1, "color": "#EF4444", "x": "Critical", "y": 1},
                        {"label": "Warning", "value": 0, "color": "#F59E0B", "x": "Warning", "y": 0},
                        {"label": "Informational", "value": 0, "color": "#4778E8", "x": "Informational", "y": 0},
                    ],
                },
                "type_distribution": {
                    "chart_type": "bar",
                    "title": "Insights by Classification Type",
                    "x_axis_label": "Classification Type",
                    "y_axis_label": "Count",
                    "data_points": [
                        {"label": "General Data Quality", "value": 1, "color": "#9BA6B8", "x": "General Data Quality", "y": 1}
                    ],
                },
                "missing_values": {"chart_type": "bar", "title": "Missing Values Analysis", "data_points": []},
                "outlier_analysis": {"chart_type": "boxplot", "title": "Outlier & Quartile Distributions", "boxplot_data": []},
                "correlation_heatmap": {"chart_type": "heatmap", "title": "Numeric Correlation Matrix", "categories": [], "matrix": []},
                "numeric_distribution": {"chart_type": "histogram", "title": "Numeric Distribution", "data_points": []},
                "category_distribution": {"chart_type": "bar", "title": "Category Distribution", "data_points": []},
            }
            return AnalyticsInsightsResponse(
                dataset_id=dataset.id,
                dataset_name=dataset.original_filename or dataset.filename,
                version=actual_version,
                total_rows=0,
                total_columns=total_cols,
                insights=insights,
                charts_data=empty_charts,
            )

        all_numeric = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
        all_categorical = [c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c])]

        # 0. Duplicate Rows Check
        dup_row_cnt = int(df.duplicated().sum())
        if dup_row_cnt > 0:
            dup_row_pct = (dup_row_cnt / total_rows) * 100
            insights.append(
                AnalyticsInsightItem(
                    id="dup_rows_check",
                    type="data_quality",
                    title=f"Duplicate Records Present: {dup_row_cnt:,} rows",
                    statement=f"Dataset contains {dup_row_cnt:,} exact duplicate rows ({dup_row_pct:.1f}% of total). Duplicate rows can bias statistical metrics and predictive model training.",
                    metric=f"{dup_row_pct:.1f}% Duplicates",
                    columns_involved=[],
                    confidence="High",
                    severity="Warning" if dup_row_pct >= 5.0 else "Informational",
                    observations_used=total_rows,
                    calculation_method=f"Row-wise deduplication count ({dup_row_cnt:,}) / total rows ({total_rows:,})",
                    limitations="Row equality evaluated across all active columns.",
                    next_step="Review data collection pipeline to assess whether duplicate rows represent legitimate identical events or logging redundancy.",
                )
            )

        # 1. Duplicate / Redundant Columns Check
        norm_map: Dict[str, List[str]] = {}
        for c in df.columns:
            norm_k = str(c).strip().lower().replace(" ", "_").replace("-", "_")
            norm_map.setdefault(norm_k, []).append(str(c))

        seen_dup_pairs = set()
        for norm_k, col_group in norm_map.items():
            if len(col_group) > 1:
                for i in range(len(col_group)):
                    for j in range(i + 1, len(col_group)):
                        c1, c2 = col_group[i], col_group[j]
                        pair_key = tuple(sorted([c1, c2]))
                        if pair_key in seen_dup_pairs:
                            continue
                        seen_dup_pairs.add(pair_key)

                        if are_exact_duplicates(df[c1], df[c2]):
                            insights.append(
                                AnalyticsInsightItem(
                                    id=f"dup_col_exact_{norm_k}_{i}_{j}",
                                    type="duplicate_columns",
                                    title=f"Exact Duplicate Columns: {c1} & {c2}",
                                    statement=f"Columns '{c1}' and '{c2}' share identical normalized naming and contain identical values across all {total_rows:,} records. One column is completely redundant and can be removed without losing information.",
                                    metric="100% Value Match",
                                    columns_involved=[c1, c2],
                                    confidence="High",
                                    severity="Warning",
                                    observations_used=total_rows,
                                    calculation_method="Full column-wise value comparison across all records",
                                    limitations="Values matched identically across all valid and missing positions.",
                                    next_step="Safely drop one column to eliminate redundancy and simplify downstream processing.",
                                )
                            )
                        else:
                            insights.append(
                                AnalyticsInsightItem(
                                    id=f"dup_col_{norm_k}_{i}_{j}",
                                    type="duplicate_columns",
                                    title=f"Potential Redundant Attributes: {c1} & {c2}",
                                    statement=f"Columns '{c1}' and '{c2}' share normalized naming ('{norm_k}') but exhibit differing values. Verify if one is an updated version or a distinct metric.",
                                    metric=f"{len(col_group)} matching features",
                                    columns_involved=[c1, c2],
                                    confidence="Moderate",
                                    severity="Informational",
                                    observations_used=total_rows,
                                    calculation_method="Safe normalization comparison (case-insensitive & whitespace-stripped)",
                                    limitations="Columns preserved unaltered; values differ between attributes.",
                                    next_step="Inspect column definitions to clarify naming and determine whether both are required.",
                                )
                            )

        # Pairwise exact value duplicates across different names (if <= 50 columns)
        if len(df.columns) <= 50:
            for i in range(len(df.columns)):
                for j in range(i + 1, len(df.columns)):
                    c1, c2 = str(df.columns[i]), str(df.columns[j])
                    pair_key = tuple(sorted([c1, c2]))
                    if pair_key in seen_dup_pairs:
                        continue
                    if are_exact_duplicates(df[c1], df[c2]):
                        seen_dup_pairs.add(pair_key)
                        insights.append(
                            AnalyticsInsightItem(
                                id=f"dup_col_exact_val_{c1}_{c2}",
                                type="duplicate_columns",
                                title=f"Exact Duplicate Content: {c1} & {c2}",
                                statement=f"Columns '{c1}' and '{c2}' have different names but contain identical values across all {total_rows:,} rows. One column is entirely redundant.",
                                metric="100% Value Match",
                                columns_involved=[c1, c2],
                                confidence="High",
                                severity="Warning",
                                observations_used=total_rows,
                                calculation_method="Pairwise column value comparison across all rows",
                                limitations="Identical values found across all records.",
                                next_step="Confirm if one column can be pruned to prevent collinearity.",
                            )
                        )

        # 2. Missing Value Concentration Insight
        missing_stats = []
        for col in df.columns:
            null_cnt = int(df[col].isna().sum())
            null_rate = (null_cnt / total_rows) * 100 if total_rows > 0 else 0.0
            if null_cnt > 0:
                missing_stats.append((str(col), null_cnt, null_rate))
            if null_rate >= 10.0:
                insights.append(
                    AnalyticsInsightItem(
                        id=f"missing_{col}",
                        type="missing_values",
                        title=f"Elevated Missing Rate: {col}",
                        statement=f"Column '{col}' exhibits {null_cnt:,} missing entries ({null_rate:.1f}% of dataset). Imputation, indicator tagging, or selective exclusion should be evaluated based on business context.",
                        metric=f"{null_rate:.1f}% Missing",
                        columns_involved=[str(col)],
                        confidence="High",
                        severity="Critical" if null_rate >= 50.0 else "Warning",
                        observations_used=total_rows,
                        calculation_method=f"Null cell frequency ({null_cnt:,}) / total rows ({total_rows:,})",
                        limitations="Missingness mechanism (MCAR vs MAR vs MNAR) unverified without longitudinal testing. Do not delete or impute without considering feature context.",
                        next_step="Evaluate if column is critical; apply mean/median imputation, sentinel categorical tagging, or investigate collection failures.",
                    )
                )

        # 3. Categorical Concentration (Pareto Dominance)
        for col in all_categorical:
            if is_identifier(col, df[col]):
                continue
            val_counts = df[col].dropna().value_counts()
            if len(val_counts) >= 2:
                top_name = str(val_counts.index[0])
                top_cnt = int(val_counts.iloc[0])
                non_null_c = int(df[col].count())
                top_pct = (top_cnt / max(total_rows, 1)) * 100
                if top_pct >= 45.0:
                    insights.append(
                        AnalyticsInsightItem(
                            id=f"conc_{col}",
                            type="concentration",
                            title=f"High Category Dominance: {col}",
                            statement=f"Category '{top_name}' constitutes {top_pct:.1f}% ({top_cnt:,} occurrences of {non_null_c:,} non-null records) in '{col}'.",
                            metric=f"{top_pct:.1f}% Dominance",
                            columns_involved=[str(col)],
                            confidence="High",
                            severity="Warning" if top_pct >= 80.0 else "Informational",
                            observations_used=non_null_c,
                            calculation_method=f"Top category mode frequency ({top_cnt:,}) / valid non-null rows ({non_null_c:,})",
                            limitations="Class imbalance may bias aggregations or model training if unstratified.",
                            next_step="Apply stratified sampling or group-level normalization when training models.",
                        )
                    )

        # 4. Strong Pairwise Correlation
        valid_numeric_for_corr = []
        for c in all_numeric:
            if not is_identifier(c, df[c]):
                s_c = pd.to_numeric(df[c], errors="coerce").dropna()
                if len(s_c) >= 2 and float(s_c.std()) > 0:
                    valid_numeric_for_corr.append(c)

        if len(valid_numeric_for_corr) >= 2:
            num_df = df[valid_numeric_for_corr].apply(pd.to_numeric, errors="coerce")
            corr = num_df.corr()
            seen_pairs = set()
            for c1 in valid_numeric_for_corr:
                for c2 in valid_numeric_for_corr:
                    if c1 != c2 and (c2, c1) not in seen_pairs:
                        seen_pairs.add((c1, c2))
                        r = corr.loc[c1, c2]
                        if not math.isnan(r) and abs(r) >= 0.65:
                            paired_valid = int(num_df[[c1, c2]].dropna().shape[0])
                            polarity = "positive" if r > 0 else "inverse"
                            insights.append(
                                AnalyticsInsightItem(
                                    id=f"corr_{c1}_{c2}",
                                    type="correlation",
                                    title=f"Strong {polarity.capitalize()} Association: {c1} & {c2}",
                                    statement=f"Attributes '{c1}' and '{c2}' demonstrate a strong {polarity} linear association (Pearson r = {r:.2f}). Note: high correlation indicates co-movement, not identity or causal dependency.",
                                    metric=f"r = {r:.2f}",
                                    columns_involved=[c1, c2],
                                    confidence="High",
                                    severity="Warning" if abs(r) >= 0.90 else "Informational",
                                    observations_used=paired_valid,
                                    calculation_method=f"Bivariate Pearson correlation r on paired non-missing observations (n={paired_valid:,})",
                                    limitations="Association denotes strictly linear co-movement and does NOT establish causal relationship.",
                                    next_step="Inspect for collinearity or confounding variables prior to regression modeling.",
                                )
                            )

        # 5. Outlier Detection (Tukey 1.5x IQR)
        outlier_feature_stats = []
        for col in all_numeric:
            if is_identifier(col, df[col]):
                continue
            s_num = pd.to_numeric(df[col], errors="coerce").dropna()
            if len(s_num) >= 10:
                q25 = float(s_num.quantile(0.25))
                q75 = float(s_num.quantile(0.75))
                iqr = q75 - q25
                med = float(s_num.median())
                min_v = float(s_num.min())
                max_v = float(s_num.max())
                lower_b = q25 - 1.5 * iqr
                upper_b = q75 + 1.5 * iqr

                if iqr > 0:
                    outliers = s_num[(s_num < lower_b) | (s_num > upper_b)]
                    o_cnt = len(outliers)
                    o_pct = (o_cnt / len(s_num)) * 100
                    outlier_feature_stats.append({
                        "col": str(col),
                        "min_val": min_v,
                        "q1": q25,
                        "median": med,
                        "q3": q75,
                        "max_val": max_v,
                        "lower_bound": lower_b,
                        "upper_bound": upper_b,
                        "outlier_count": o_cnt,
                        "outlier_pct": o_pct,
                        "sample_outliers": [float(v) for v in outliers.head(25)],
                    })
                    if o_cnt >= 1 and (o_pct >= 2.0 or o_cnt >= 2):
                        insights.append(
                            AnalyticsInsightItem(
                                id=f"outlier_{col}",
                                type="outlier",
                                title=f"Significant Outlier Concentration: {col}",
                                statement=f"Found {o_cnt:,} statistical outliers ({o_pct:.1f}%) in '{col}' exceeding 1.5x IQR boundaries (limits: [{lower_b:.2f}, {upper_b:.2f}]).",
                                metric=f"{o_pct:.1f}% Outliers",
                                columns_involved=[str(col)],
                                confidence="High",
                                severity="Warning" if o_pct >= 8.0 else "Informational",
                                observations_used=len(s_num),
                                calculation_method=f"Tukey 1.5x IQR boundary detection on valid numeric observations (n={len(s_num):,})",
                                limitations="Outliers may represent genuine high-value signals rather than measurement noise.",
                                next_step="Examine sample outlier records with business stakeholders to verify if legitimate.",
                            )
                        )

        # 6. Distribution Skewness
        for col in all_numeric:
            if is_identifier(col, df[col]):
                continue
            s_num = pd.to_numeric(df[col], errors="coerce").dropna()
            if len(s_num) >= 15:
                skew_val = float(s_num.skew())
                if not math.isnan(skew_val) and abs(skew_val) >= 1.5:
                    insights.append(
                        AnalyticsInsightItem(
                            id=f"dist_skew_{col}",
                            type="distribution",
                            title=f"Significant Distribution Skewness: {col}",
                            statement=f"Column '{col}' exhibits pronounced {'positive (right-tailed)' if skew_val > 0 else 'negative (left-tailed)'} skewness (skew = {skew_val:.2f}). Parametric models assuming normal distribution may require transformations.",
                            metric=f"Skew = {skew_val:.2f}",
                            columns_involved=[str(col)],
                            confidence="High",
                            severity="Informational",
                            observations_used=len(s_num),
                            calculation_method=f"Sample skewness moment calculation on valid observations (n={len(s_num):,})",
                            limitations="Skewness reflects asymmetry of the distribution relative to normal curve.",
                            next_step="Consider log-transformation, Box-Cox, or non-parametric algorithms when modeling.",
                        )
                    )

        # 7. Trend Insight (if date column present)
        date_cols = [c for c in df.columns if cls._classify_column_role(df[c], str(c)) == "date"]
        if date_cols and valid_numeric_for_corr:
            d_col = date_cols[0]
            m_col = valid_numeric_for_corr[0]
            try:
                temp_df = df[[d_col, m_col]].dropna().copy()
                temp_df["dt"] = pd.to_datetime(temp_df[d_col], errors="coerce")
                temp_df = temp_df.dropna(subset=["dt"]).sort_values("dt")
                if len(temp_df) >= 10:
                    midpoint = len(temp_df) // 2
                    first_mean = float(temp_df.iloc[:midpoint][m_col].mean())
                    second_mean = float(temp_df.iloc[midpoint:][m_col].mean())
                    if first_mean != 0:
                        change_pct = ((second_mean - first_mean) / abs(first_mean)) * 100
                        if abs(change_pct) >= 20.0:
                            direction = "increase" if change_pct > 0 else "decrease"
                            insights.append(
                                AnalyticsInsightItem(
                                    id=f"trend_{m_col}_{d_col}",
                                    type="trend",
                                    title=f"Temporal Shift: {m_col}",
                                    statement=f"Average '{m_col}' exhibited a {abs(change_pct):.1f}% {direction} from earlier to later periods recorded in '{d_col}' (first half mean: {first_mean:.2f}, second half mean: {second_mean:.2f}).",
                                    metric=f"{change_pct:+.1f}% Shift",
                                    columns_involved=[m_col, d_col],
                                    confidence="Moderate",
                                    severity="Informational",
                                    observations_used=len(temp_df),
                                    calculation_method=f"Chronological split-period mean comparison on sorted '{d_col}' observations (n={len(temp_df):,})",
                                    limitations="Trend analysis represents split period historical shift; does not forecast future trajectory.",
                                    next_step="Conduct formal time-series decomposition (trend, seasonality, noise) for deeper modeling.",
                                )
                            )
            except Exception:
                pass

        # Fallback informative insight if dataset is pristine
        if not insights:
            insights.append(
                AnalyticsInsightItem(
                    id="clean_data_notice",
                    type="data_quality",
                    title="High Data Stability",
                    statement=f"Dataset contains {total_rows:,} verified rows with uniform distribution and zero high-severity anomalies detected.",
                    metric="100% Balanced",
                    columns_involved=[],
                    confidence="High",
                    severity="Informational",
                    observations_used=total_rows,
                    calculation_method="Multi-attribute rule-based heuristic scan across all features",
                    limitations="Standard statistical rule thresholds applied.",
                    next_step="Dataset is structurally sound and verified for exploratory or predictive modeling.",
                )
            )

        # Deduplicate insights strictly
        seen_insight_keys = set()
        deduped_insights = []
        for ins in insights:
            sev = ins.severity.capitalize()
            if sev not in ("Critical", "Warning", "Informational"):
                sev = "Informational"
            ins.severity = sev

            key = (ins.type, tuple(sorted(ins.columns_involved)), ins.title)
            if key not in seen_insight_keys:
                seen_insight_keys.add(key)
                deduped_insights.append(ins)

        # Severity counts
        crit_count = sum(1 for i in deduped_insights if i.severity == "Critical")
        warn_count = sum(1 for i in deduped_insights if i.severity == "Warning")
        info_count = sum(1 for i in deduped_insights if i.severity == "Informational")

        # Type counts
        type_labels = {
            "missing_values": "Missing Values",
            "duplicate_columns": "Duplicate / Redundant Columns",
            "correlation": "Correlation",
            "trend": "Trend",
            "outlier": "Anomaly / Outlier",
            "distribution": "Distribution",
            "concentration": "Category Concentration",
            "data_quality": "General Data Quality",
        }
        type_colors = {
            "missing_values": "#EF4444",
            "duplicate_columns": "#E9BD62",
            "correlation": "#38A995",
            "trend": "#4778E8",
            "outlier": "#F2A18D",
            "distribution": "#06B6D4",
            "concentration": "#8B7CE8",
            "data_quality": "#9BA6B8",
        }
        type_counts: Dict[str, int] = {}
        for ins in deduped_insights:
            type_counts[ins.type] = type_counts.get(ins.type, 0) + 1

        type_chart_points = []
        for t_key, count in type_counts.items():
            lbl = type_labels.get(t_key, t_key.replace("_", " ").title())
            type_chart_points.append({
                "label": lbl,
                "value": count,
                "color": type_colors.get(t_key, "#4778E8"),
                "x": lbl,
                "y": count,
            })
        type_chart_points.sort(key=lambda x: x["value"], reverse=True)

        # Missing values chart
        missing_stats.sort(key=lambda x: x[2], reverse=True)
        missing_chart_points = []
        for col_name, n_cnt, n_pct in missing_stats[:15]:
            missing_chart_points.append({
                "label": col_name,
                "value": round(n_pct, 2),
                "count": n_cnt,
                "total": total_rows,
                "color": "#EF4444" if n_pct >= 50.0 else "#F59E0B" if n_pct >= 10.0 else "#38A995",
                "x": col_name,
                "y": round(n_pct, 2),
            })

        # Outlier Boxplot data
        boxplot_items = []
        for stat in outlier_feature_stats[:8]:
            boxplot_items.append({
                "category": stat["col"],
                "min_val": round(stat["min_val"], 2),
                "q1": round(stat["q1"], 2),
                "median": round(stat["median"], 2),
                "q3": round(stat["q3"], 2),
                "max_val": round(stat["max_val"], 2),
                "lower_bound": round(stat["lower_bound"], 2),
                "upper_bound": round(stat["upper_bound"], 2),
                "outliers": [round(float(o), 2) for o in stat["sample_outliers"]],
                "outlier_count": stat["outlier_count"],
                "outlier_pct": round(stat["outlier_pct"], 2),
            })

        # Correlation Heatmap data
        corr_matrix_data: Dict[str, Any] = {
            "chart_type": "heatmap",
            "title": "Numeric Correlation Matrix (Pearson r)",
            "categories": [],
            "matrix": [],
            "causal_caveat": "High correlation indicates linear co-movement only; it does NOT establish causal relationship.",
        }
        if len(valid_numeric_for_corr) >= 2:
            top_corr_cols = valid_numeric_for_corr[:10]
            corr_sub = df[top_corr_cols].apply(pd.to_numeric, errors="coerce").corr().fillna(0)
            corr_matrix_data["categories"] = top_corr_cols
            corr_matrix_data["matrix"] = [
                [round(float(corr_sub.loc[r_c, c_c]), 2) for c_c in top_corr_cols]
                for r_c in top_corr_cols
            ]

        # Numeric Distribution Histogram (precompute top numeric columns for switching)
        num_dist_cols_data: Dict[str, List[Dict[str, Any]]] = {}
        for num_col in valid_numeric_for_corr[:5]:
            s_clean = pd.to_numeric(df[num_col], errors="coerce").dropna()
            if len(s_clean) > 0:
                counts, bin_edges = np.histogram(s_clean, bins=min(10, max(4, len(s_clean) // 5)))
                bins_list = []
                for b_i in range(len(counts)):
                    b_lbl = f"{bin_edges[b_i]:.1f} - {bin_edges[b_i+1]:.1f}"
                    bins_list.append({
                        "label": b_lbl,
                        "value": int(counts[b_i]),
                        "color": "#38A995",
                        "x": b_lbl,
                        "y": int(counts[b_i]),
                    })
                num_dist_cols_data[num_col] = bins_list

        primary_num_col = valid_numeric_for_corr[0] if valid_numeric_for_corr else None
        num_dist_data: Dict[str, Any] = {
            "chart_type": "histogram",
            "title": f"Numeric Distribution: {primary_num_col}" if primary_num_col else "Numeric Distribution",
            "x_axis_label": primary_num_col or "Value Range",
            "y_axis_label": "Frequency (Count)",
            "available_columns": valid_numeric_for_corr[:5],
            "column": primary_num_col,
            "data_points": num_dist_cols_data.get(primary_num_col, []) if primary_num_col else [],
            "columns_data": num_dist_cols_data,
        }

        # Category Distribution (precompute top categorical columns for switching)
        non_id_cats = [c for c in all_categorical if not is_identifier(c, df[c])]
        cat_dist_cols_data: Dict[str, List[Dict[str, Any]]] = {}
        for cat_col in non_id_cats[:5]:
            vc = df[cat_col].dropna().value_counts()
            top_vc = vc.head(7)
            other_cnt = int(vc.iloc[7:].sum()) if len(vc) > 7 else 0
            points = []
            for cat_name, cnt in top_vc.items():
                cat_pct = (cnt / total_rows) * 100 if total_rows > 0 else 0
                points.append({
                    "label": str(cat_name),
                    "value": int(cnt),
                    "pct": round(cat_pct, 1),
                    "color": "#8B7CE8",
                    "x": str(cat_name),
                    "y": int(cnt),
                })
            if other_cnt > 0:
                points.append({
                    "label": "Other (Combined)",
                    "value": other_cnt,
                    "pct": round((other_cnt / total_rows) * 100, 1),
                    "color": "#9BA6B8",
                    "x": "Other (Combined)",
                    "y": other_cnt,
                })
            cat_dist_cols_data[cat_col] = points

        primary_cat_col = non_id_cats[0] if non_id_cats else None
        cat_dist_data: Dict[str, Any] = {
            "chart_type": "bar",
            "title": f"Category Distribution: {primary_cat_col}" if primary_cat_col else "Category Distribution",
            "x_axis_label": primary_cat_col or "Category",
            "y_axis_label": "Record Count",
            "available_columns": non_id_cats[:5],
            "column": primary_cat_col,
            "data_points": cat_dist_cols_data.get(primary_cat_col, []) if primary_cat_col else [],
            "columns_data": cat_dist_cols_data,
        }

        charts_data = {
            "severity_distribution": {
                "chart_type": "donut",
                "title": "Insight Severity Distribution",
                "data_points": [
                    {"label": "Critical", "value": crit_count, "color": "#EF4444", "x": "Critical", "y": crit_count},
                    {"label": "Warning", "value": warn_count, "color": "#F59E0B", "x": "Warning", "y": warn_count},
                    {"label": "Informational", "value": info_count, "color": "#4778E8", "x": "Informational", "y": info_count},
                ],
            },
            "type_distribution": {
                "chart_type": "bar",
                "title": "Insights by Classification Type",
                "x_axis_label": "Classification Type",
                "y_axis_label": "Insight Count",
                "data_points": type_chart_points,
            },
            "missing_values": {
                "chart_type": "bar",
                "title": f"Missing Values by Column (Total Rows: {total_rows:,})",
                "x_axis_label": "Column",
                "y_axis_label": "Missing %",
                "total_rows": total_rows,
                "columns_with_missing": len(missing_stats),
                "data_points": missing_chart_points,
            },
            "outlier_analysis": {
                "chart_type": "boxplot",
                "title": "Outlier & Quartile Distributions (Tukey 1.5x IQR)",
                "x_axis_label": "Feature",
                "y_axis_label": "Measurement Scale",
                "boxplot_data": boxplot_items,
            },
            "correlation_heatmap": corr_matrix_data,
            "numeric_distribution": num_dist_data,
            "category_distribution": cat_dist_data,
        }

        return AnalyticsInsightsResponse(
            dataset_id=dataset.id,
            dataset_name=dataset.original_filename or dataset.filename,
            version=actual_version,
            total_rows=total_rows,
            total_columns=total_cols,
            insights=deduped_insights,
            charts_data=charts_data,
        )

    @classmethod
    def export_csv_stream(cls, request: AnalyticsExportCSVRequest) -> StreamingResponse:
        """Export table data points as formatted CSV with UTF-8 BOM."""
        output = io.StringIO()
        output.write("\ufeff")  # UTF-8 BOM for Excel
        writer = csv.writer(output)

        writer.writerow(request.columns)
        for row in request.rows:
            writer.writerow([row.get(col, "") for col in request.columns])

        output.seek(0)
        filename = request.filename or "analytics_export.csv"
        if not filename.endswith(".csv"):
            filename += ".csv"

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    @classmethod
    def export_report_summary(
        cls,
        request: AnalyticsReportExportRequest,
        current_user: User,
        db: Session,
    ) -> Dict[str, Any]:
        """Generate structured comprehensive analytical executive summary report."""
        dataset, df, actual_version, warnings = cls.get_dataset_and_df(
            request.dataset_id, request.version, current_user, db
        )

        overview = cls.get_analytics_overview(request.dataset_id, request.version, current_user, db) if request.include_kpis else None
        stats = cls.deep_stats(AnalyticsStatsRequest(dataset_id=request.dataset_id, version=request.version), current_user, db) if request.include_stats else None
        insights = cls.generate_insights(request.dataset_id, request.version, current_user, db) if request.include_insights else None

        return {
            "title": request.title or f"Executive Analytics Report: {dataset.original_filename or dataset.filename}",
            "generated_at": datetime.now().isoformat(),
            "dataset_id": dataset.id,
            "dataset_name": dataset.original_filename or dataset.filename,
            "version": actual_version,
            "overview": overview.model_dump() if overview else None,
            "statistics": stats.model_dump() if stats else None,
            "insights": insights.model_dump() if insights else None,
        }
