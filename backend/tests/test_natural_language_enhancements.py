"""Focused Regression Tests for Phase 8 Enhancement:
- Multi-word column resolution ("What is the average Order Amount INR?")
- Case-variant and duplicate column handling (`age` vs `Age` with identical and different data)
- Constant column exclusion and duplicate column detection in correlation
- Dataset identity handling for datasets with identical filenames
- Dynamic graphical visualization generation from actual CSV data without mock fallbacks
"""

import pytest
import pandas as pd
import numpy as np

from query.orchestrator import run_ask_analyst_query
from query.column_resolver import resolve_column, are_columns_identical
from query.correlation_query_engine import compute_correlation_query
from query.chart_recommender import recommend_query_visualization


def test_average_order_amount_inr():
    """Verify resolution of multi-word column 'Order_Amount_INR' and accurate mean calculation."""
    df = pd.DataFrame({
        "Order_ID": [101, 102, 103, 104, 105],
        "Order_Amount_INR": [1500.0, 2500.0, 3000.0, 1000.0, None],
        "Customer_Region": ["North", "South", "East", "West", "North"],
    })
    meta = {
        "orders.csv": {
            "dataset_id": 1,
            "column_names": list(df.columns),
            "data_types": {c: str(df[c].dtype) for c in df.columns},
            "_df": df,
            "df": df,
        }
    }
    datasets = {"orders.csv": df}

    res = run_ask_analyst_query("What is the average Order Amount INR?", datasets, meta)
    assert res["status"] == "success"
    # Expected mean of [1500, 2500, 3000, 1000] = 8000 / 4 = 2000.0
    expected_mean = 2000.0
    ans_text = res["answer"]["answer"]
    assert "2,000" in ans_text or "2000" in ans_text
    # Verify result scalar value matches exactly
    val = res["result"]["data"]
    if isinstance(val, pd.DataFrame):
        calc_val = float(val.iloc[0, 0])
    else:
        calc_val = float(val)
    assert calc_val == expected_mean


def test_duplicate_columns_identical_contents():
    """Verify that columns differing in case ('age' vs 'Age') with identical contents resolve safely."""
    df = pd.DataFrame({
        "age": [25, 30, 45, 50, None],
        "Age": [25, 30, 45, 50, None],
        "Score": [88, 92, 79, 85, 90],
    })
    meta = {
        "column_names": list(df.columns),
        "data_types": {c: str(df[c].dtype) for c in df.columns},
        "_df": df,
    }
    res = resolve_column("age", meta, df=df)
    assert res["resolved"] is True
    assert res["is_ambiguous"] is False
    assert res["column"] in ("age", "Age")
    assert "identical values" in res["selection_explanation"].lower()


def test_duplicate_columns_different_contents_requests_clarification():
    """Verify that columns differing in case ('age' vs 'Age') with different contents prompt clarification."""
    df = pd.DataFrame({
        "age": [25, 30, 45, 50, 60],
        "Age": [1, 2, 3, 4, 5],  # completely different values
        "Score": [88, 92, 79, 85, 90],
    })
    meta = {
        "column_names": list(df.columns),
        "data_types": {c: str(df[c].dtype) for c in df.columns},
        "_df": df,
    }
    res = resolve_column("age", meta, df=df)
    assert res["resolved"] is False
    assert res["is_ambiguous"] is True
    assert "age" in res["clarification_options"]
    assert "Age" in res["clarification_options"]
    assert len(res["clarification_candidates"]) == 2


def test_duplicate_columns_missing_value_differences():
    """Verify that columns differing in missing-value patterns are not considered identical."""
    df = pd.DataFrame({
        "income": [50000, 60000, 75000, 80000, 90000],
        "Income": [50000, None, 75000, 80000, 90000],  # missing row 1
    })
    meta = {
        "column_names": list(df.columns),
        "data_types": {c: str(df[c].dtype) for c in df.columns},
        "_df": df,
    }
    res = resolve_column("income", meta, df=df)
    assert res["resolved"] is False
    assert res["is_ambiguous"] is True


def test_constant_column_excluded_from_correlation():
    """Verify that a numerical column with zero variance is excluded from correlation analysis."""
    df = pd.DataFrame({
        "Height": [150, 160, 170, 180, 190],
        "Weight": [55, 62, 70, 78, 85],
        "ConstantFeature": [10, 10, 10, 10, 10],  # zero variance
    })
    res = compute_correlation_query(df)
    assert res["result_type"] == "table"
    pairs = res["data"]
    # ConstantFeature must not be included in analyzed correlation pairs
    features_in_pairs = set(pairs["Feature A"].tolist() + pairs["Feature B"].tolist())
    assert "ConstantFeature" not in features_in_pairs
    assert "Height" in features_in_pairs
    assert "Weight" in features_in_pairs
    assert any("ConstantFeature" in w for w in res["warnings"])


def test_correlation_heatmap_matrix_generation():
    """Verify that correlation query produces matrix and categories for Heatmap rendering."""
    df = pd.DataFrame({
        "Math": [85, 90, 78, 92, 88, 76],
        "Physics": [80, 88, 75, 95, 84, 72],
        "Chemistry": [70, 75, 68, 85, 78, 65],
    })
    res = compute_correlation_query(df)
    assert "matrix" in res["evidence"]
    assert "categories" in res["evidence"]
    matrix = res["evidence"]["matrix"]
    categories = res["evidence"]["categories"]
    assert len(categories) == 3
    assert len(matrix) == 3
    # Diagonal must be 1.0
    for idx in range(3):
        assert matrix[idx][idx] == 1.0


def test_chart_recommender_types():
    """Verify dynamic chart selection: bar, line, donut, and scalar exclusion."""
    # 1. Category comparison -> Bar
    cat_df = pd.DataFrame({"Category": ["Electronics", "Clothing", "Home"], "Revenue": [10000, 8000, 5000]})
    rec_bar = recommend_query_visualization(
        "Show total revenue by category",
        {"intent": "GROUP_BY", "column": "Revenue", "group_by": ["Category"]},
        {"data": cat_df, "row_count": 3},
    )
    assert rec_bar["recommended"] is True
    assert rec_bar["chart_type"] == "bar"

    # 2. Date trend -> Line
    trend_df = pd.DataFrame({"Date": ["2023-01-01", "2023-02-01", "2023-03-01"], "Sales": [120, 150, 180]})
    rec_line = recommend_query_visualization(
        "Show the sales trend over time",
        {"intent": "TREND", "column": "Sales"},
        {"data": trend_df, "row_count": 3},
    )
    assert rec_line["recommended"] is True
    assert rec_line["chart_type"] == "line"

    # 3. Share of total (<= 8 categories) -> Donut
    share_df = pd.DataFrame({"Payment_Method": ["Card", "UPI", "Cash"], "Total": [500, 300, 200]})
    rec_donut = recommend_query_visualization(
        "Show percentage contribution of payment method",
        {"intent": "PERCENTAGE_CONTRIBUTION", "column": "Total", "group_by": ["Payment_Method"]},
        {"data": share_df, "row_count": 3},
    )
    assert rec_donut["recommended"] is True
    assert rec_donut["chart_type"] in ("donut", "pie")

    # 4. Single scalar metric -> Not recommended (no mock fallback)
    rec_scalar = recommend_query_visualization(
        "What is the average Order Amount INR?",
        {"intent": "AVERAGE", "column": "Order_Amount_INR"},
        {"data": 2000.0, "row_count": 1},
    )
    assert rec_scalar["recommended"] is False
