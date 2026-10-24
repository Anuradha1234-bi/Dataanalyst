"""Chart Recommender and Generation Module for Phase 6 Natural Language Query Engine.

Recommends and generates high-aesthetic Plotly charts compatible with query results.
Does not generate charts for non-visual results like single scalars or counts.
Reuses ChartGeneratorService where appropriate.
"""

from typing import Dict, Any, Optional
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from query.query_models import QueryIntent


# Theme palette
PRIMARY_BLUE = "#2563EB"
LIGHT_BG = "#FFFFFF"
TEXT_COLOR = "#0F172A"
GRID_COLOR = "#F1F5F9"


def recommend_query_visualization(
    question: str,
    query_plan: Dict[str, Any],
    query_result: Dict[str, Any],
) -> Dict[str, Any]:
    """Recommend and synthesize an interactive visualization when appropriate.

    Contract:
    Returns:
    {
        "recommended": True,
        "chart_type": "bar",
        "x": "market",
        "y": "average_price",
        "figure": Figure,
        "reason": "..."
    }
    """
    intent = query_plan.get("intent", QueryIntent.UNKNOWN.value)
    data = query_result.get("data")
    row_count = query_result.get("row_count", 0)

    # 1. Non-visual conditions
    if (
        data is None
        or not isinstance(data, pd.DataFrame)
        or data.empty
        or (len(data) < 2 and intent not in (QueryIntent.TOP_N.value, QueryIntent.BOTTOM_N.value, QueryIntent.GROUP_BY.value))
        or intent in (QueryIntent.COUNT.value, QueryIntent.DUPLICATES.value, QueryIntent.DATA_TYPES.value, QueryIntent.DATA_QUALITY_REPORT.value, QueryIntent.SHOW_DATA.value)
    ):
        return {
            "recommended": False,
            "chart_type": None,
            "x": None,
            "y": None,
            "figure": None,
            "reason": "Single scalar metric, table summary, or insufficient rows for visual charting.",
        }

    cols = list(data.columns)

    # 1b. User Explicitly Preferred Chart Type Override
    preferred_type = query_plan.get("preferred_chart_type")
    if preferred_type in ("bar", "line", "scatter") and len(cols) >= 1:
        cat_cols = [c for c in cols if not pd.api.types.is_numeric_dtype(data[c])]
        num_cols = [c for c in cols if pd.api.types.is_numeric_dtype(data[c])]
        x_c = cat_cols[0] if cat_cols else cols[0]
        y_c = num_cols[0] if num_cols else (cols[1] if len(cols) > 1 else cols[0])

        if preferred_type == "bar":
            fig = px.bar(data, x=x_c, y=y_c, title=f"{y_c} by {x_c}", template="plotly_white", color_discrete_sequence=[PRIMARY_BLUE])
        elif preferred_type == "line":
            fig = px.line(data, x=x_c, y=y_c, markers=True, title=f"{y_c} by {x_c}", template="plotly_white")
            fig.update_traces(line_color=PRIMARY_BLUE, line_width=3)
        else:
            fig = px.scatter(data, x=x_c, y=y_c, title=f"{y_c} vs {x_c}", template="plotly_white")
        fig.update_layout(margin=dict(l=20, r=20, t=40, b=20), plot_bgcolor=LIGHT_BG, paper_bgcolor=LIGHT_BG)
        return {
            "recommended": True,
            "chart_type": preferred_type,
            "x": x_c,
            "y": y_c,
            "figure": fig,
            "reason": f"User explicitly requested a {preferred_type} chart.",
        }

    # 2. TREND / DATE QUERIES -> Line Chart
    if intent in (QueryIntent.TREND.value, QueryIntent.PERCENTAGE_CHANGE.value, QueryIntent.DATE_COMPARISON.value):
        x_col = cols[0]
        y_col = cols[1] if len(cols) > 1 else cols[0]

        fig = px.line(
            data,
            x=x_col,
            y=y_col,
            markers=True,
            title=f"Trend: {y_col} over {x_col}",
            template="plotly_white",
        )
        fig.update_traces(line_color=PRIMARY_BLUE, line_width=3, marker=dict(size=8, color="#1D4ED8"))
        fig.update_layout(
            margin=dict(l=20, r=20, t=40, b=20),
            plot_bgcolor=LIGHT_BG,
            paper_bgcolor=LIGHT_BG,
            font=dict(color=TEXT_COLOR),
            xaxis=dict(gridcolor=GRID_COLOR),
            yaxis=dict(gridcolor=GRID_COLOR),
        )
        return {
            "recommended": True,
            "chart_type": "line",
            "x": x_col,
            "y": y_col,
            "figure": fig,
            "reason": "Temporal trend best represented by chronological line trajectory.",
        }

    # 3. DONUT / PIE CHARTS (Proportions, Percentage Shares, Categories <= 8)
    is_donut_pie = (
        intent == QueryIntent.PERCENTAGE_CONTRIBUTION.value
        or any(w in question.lower() for w in ["donut", "pie", "proportion", "share of", "breakdown in percentage"])
        or (intent == QueryIntent.FREQUENCY.value and len(data) <= 8)
    )
    if is_donut_pie and len(data) <= 8:
        cat_cols = [c for c in cols if not pd.api.types.is_numeric_dtype(data[c])]
        num_cols = [c for c in cols if pd.api.types.is_numeric_dtype(data[c])]
        x_col = cat_cols[0] if cat_cols else cols[0]
        y_col = num_cols[0] if num_cols else (cols[1] if len(cols) > 1 else cols[0])
        chart_kind = "pie" if "pie" in question.lower() else "donut"
        return {
            "recommended": True,
            "chart_type": chart_kind,
            "x": x_col,
            "y": y_col,
            "figure": None,
            "reason": f"Category proportions and percentage shares best represented by an interactive {chart_kind} chart.",
        }

    # 4. TOP_N / BOTTOM_N / GROUP_BY / RANKINGS / COMPARISONS -> Bar Chart
    if intent in (
        QueryIntent.TOP_N.value,
        QueryIntent.BOTTOM_N.value,
        QueryIntent.GROUP_BY.value,
        QueryIntent.COMPARE_GROUPS.value,
        QueryIntent.PERCENTAGE_CONTRIBUTION.value,
        QueryIntent.FREQUENCY.value,
        QueryIntent.PROFITABILITY.value,
        QueryIntent.COMPLEX_SUBQUERY.value,
    ):
        # Identify categorical x and numeric y
        cat_cols = [c for c in cols if not pd.api.types.is_numeric_dtype(data[c])]
        num_cols = [c for c in cols if pd.api.types.is_numeric_dtype(data[c])]

        x_col = cat_cols[0] if cat_cols else cols[0]
        y_col = num_cols[0] if num_cols else (cols[1] if len(cols) > 1 else cols[0])

        fig = px.bar(
            data,
            x=x_col,
            y=y_col,
            title=f"{y_col} by {x_col}",
            template="plotly_white",
            color_discrete_sequence=[PRIMARY_BLUE],
        )
        fig.update_layout(
            margin=dict(l=20, r=20, t=40, b=20),
            plot_bgcolor=LIGHT_BG,
            paper_bgcolor=LIGHT_BG,
            font=dict(color=TEXT_COLOR),
            xaxis=dict(gridcolor=GRID_COLOR),
            yaxis=dict(gridcolor=GRID_COLOR),
        )
        return {
            "recommended": True,
            "chart_type": "bar",
            "x": x_col,
            "y": y_col,
            "figure": fig,
            "reason": "Categorical ranking and group comparison best visualized with a vertical bar chart.",
        }

    # 5. CORRELATION -> Heatmap or Horizontal Bar
    if intent == QueryIntent.CORRELATION.value:
        ev = query_result.get("evidence", {})
        if ev.get("matrix") and ev.get("categories"):
            return {
                "recommended": True,
                "chart_type": "heatmap",
                "x": "Feature",
                "y": "Feature",
                "matrix": ev.get("matrix"),
                "categories": ev.get("categories"),
                "figure": None,
                "reason": "Inter-feature linear associations and covariance matrix best visualized with a correlation heatmap.",
            }
        elif "Feature A" in cols and "Correlation (r)" in cols:
            plot_df = data.copy()
            plot_df["Pair"] = plot_df["Feature A"] + " ↔ " + plot_df["Feature B"]
            fig = px.bar(
                plot_df.head(10),
                x="Correlation (r)",
                y="Pair",
                orientation="h",
                title="Strongest Feature Correlations (Pearson r)",
                template="plotly_white",
                color="Correlation (r)",
                color_continuous_scale="RdBu",
                range_color=[-1, 1],
            )
            fig.update_layout(
                margin=dict(l=20, r=20, t=40, b=20),
                plot_bgcolor=LIGHT_BG,
                paper_bgcolor=LIGHT_BG,
                font=dict(color=TEXT_COLOR),
            )
            return {
                "recommended": True,
                "chart_type": "horizontal_bar",
                "x": "Correlation (r)",
                "y": "Pair",
                "figure": fig,
                "reason": "Feature association strengths visualized using directional correlation bars.",
            }

    # 6. HISTOGRAM / NUMERICAL DISTRIBUTION
    if (
        any(w in question.lower() for w in ["histogram", "distribution of", "show distribution"])
        or intent == QueryIntent.DESCRIPTIVE_STATISTICS.value
    ) and query_plan.get("column"):
        col_m = query_plan.get("column")
        return {
            "recommended": True,
            "chart_type": "histogram",
            "x": col_m,
            "y": "Count",
            "figure": None,
            "reason": f"Frequency distribution and bin spread of numerical variable '{col_m}' visualized with a histogram.",
        }


    # 5. MISSING VALUES -> Bar Chart of Missing Values per Column
    if intent == QueryIntent.MISSING_VALUES.value and "Missing Values" in cols:
        missing_only = data[data["Missing Values"] > 0]
        if not missing_only.empty:
            fig = px.bar(
                missing_only,
                x="Column",
                y="Missing Values",
                title="Missing Values by Feature",
                template="plotly_white",
                color_discrete_sequence=["#DC2626"],
            )
            fig.update_layout(
                margin=dict(l=20, r=20, t=40, b=20),
                plot_bgcolor=LIGHT_BG,
                paper_bgcolor=LIGHT_BG,
                font=dict(color=TEXT_COLOR),
            )
            return {
                "recommended": True,
                "chart_type": "bar",
                "x": "Column",
                "y": "Missing Values",
                "figure": fig,
                "reason": "Missing value counts across affected columns.",
            }

    # 6. ANOMALY SUMMARY -> Bar Chart of Outliers by Feature
    if intent == QueryIntent.ANOMALY_SUMMARY.value and "Outlier Count" in cols:
        outliers_only = data[data["Outlier Count"] > 0]
        if not outliers_only.empty:
            fig = px.bar(
                outliers_only,
                x="Feature",
                y="Outlier Count",
                title="Outliers by Feature",
                template="plotly_white",
                color_discrete_sequence=["#D97706"],
            )
            fig.update_layout(
                margin=dict(l=20, r=20, t=40, b=20),
                plot_bgcolor=LIGHT_BG,
                paper_bgcolor=LIGHT_BG,
                font=dict(color=TEXT_COLOR),
            )
            return {
                "recommended": True,
                "chart_type": "bar",
                "x": "Feature",
                "y": "Outlier Count",
                "figure": fig,
                "reason": "Distribution of flagged statistical outliers across features.",
            }

    # 7. REGRESSION -> Scatter Plot with Linear Trend
    if intent in (QueryIntent.REGRESSION.value, "REGRESSION"):
        return {
            "recommended": True,
            "chart_type": "scatter",
            "x": query_plan.get("secondary_column") or (cols[0] if len(cols) > 0 else "x"),
            "y": query_plan.get("column") or (cols[1] if len(cols) > 1 else "y"),
            "figure": None,
            "reason": "Linear regression relationship and residual distribution best visualized with a scatter plot.",
        }

    # 8. TWO GROUP TEST -> Bar Comparison
    if intent in (QueryIntent.TWO_GROUP_TEST.value, "TWO_GROUP_TEST"):
        return {
            "recommended": True,
            "chart_type": "bar",
            "x": "Parameter",
            "y": "Value",
            "figure": None,
            "reason": "Two-group metric difference best compared via group mean bars.",
        }

    # Fallback: if 2 columns exist and 1 is numeric
    num_cols = [c for c in cols if pd.api.types.is_numeric_dtype(data[c])]
    if len(cols) >= 2 and len(num_cols) >= 1:
        x_c = cols[0]
        y_c = num_cols[0]
        fig = px.bar(data.head(15), x=x_c, y=y_c, template="plotly_white", color_discrete_sequence=[PRIMARY_BLUE])
        fig.update_layout(
            margin=dict(l=20, r=20, t=40, b=20),
            plot_bgcolor=LIGHT_BG,
            paper_bgcolor=LIGHT_BG,
            font=dict(color=TEXT_COLOR),
        )
        return {
            "recommended": True,
            "chart_type": "bar",
            "x": x_c,
            "y": y_c,
            "figure": fig,
            "reason": "Default tabular distribution bar visualization.",
        }

    return {
        "recommended": False,
        "chart_type": None,
        "x": None,
        "y": None,
        "figure": None,
        "reason": "Result schema not suitable for automated chart rendering.",
    }
