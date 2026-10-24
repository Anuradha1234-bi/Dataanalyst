"""Automated Regression Tests for Phase 6 Natural Language Query Engine.

Covers:
1. Row count and column count
2. Average of a numeric column
3. Most frequently used payment method (frequency / mode)
4. Revenue percentage by category (percentage contribution)
5. Highest-sales day using sum by date (top 1 ranking)
6. Top 5 orders by total amount (ranking orders)
7. Average order value (AOV)
8. Missing values analysis
9. Date trend over time (chronological ordering)
10. Multi-metric dashboard query (decomposed into 5 metrics)
11. Unavailable column query handling
12. Categorical column incorrectly requested for numeric mean (safeguard check)
13. Profitability analysis with explicitly stated assumptions
"""

import sys
from pathlib import Path
import pytest
import pandas as pd
import numpy as np

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
BACKEND_ROOT = PROJECT_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from query.orchestrator import run_ask_analyst_query
from query.query_models import QueryIntent


@pytest.fixture
def sales_environment():
    """Load real sales test dataset or create exact matching DataFrame fixture."""
    csv_candidates = list((PROJECT_ROOT / "uploads" / "user_1").glob("*test_sales_dataset_with_missing_values.csv"))
    if csv_candidates and csv_candidates[0].exists():
        df = pd.read_csv(csv_candidates[0])
    else:
        # Controlled reproducible test DataFrame
        df = pd.DataFrame({
            "Order_ID": [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010],
            "Date": ["2026-02-01", "2026-02-01", "2026-02-02", "2026-02-02", "2026-02-03",
                     "2026-02-03", "2026-02-04", "2026-02-04", "2026-02-05", "2026-02-05"],
            "Region": ["North", "South", "North", "West", "South", "East", "North", "West", "South", "East"],
            "Category": ["Electronics", "Home", "Fashion", "Electronics", "Home", "Fashion", "Electronics", "Home", "Fashion", "Electronics"],
            "Product": ["Laptop", "Chair", "Shirt", "Mouse", "Desk", "Jeans", "Monitor", "Lamp", "Shoes", "Tablet"],
            "Quantity": [1.0, 2.0, 3.0, 4.0, 1.0, 2.0, 1.0, 3.0, 1.0, 2.0],
            "Unit_Price": [1000.0, 150.0, 50.0, 25.0, 300.0, 80.0, 400.0, 60.0, 120.0, 500.0],
            "Discount": [0.0, 0.1, 0.0, 0.05, 0.1, 0.0, 0.05, 0.0, 0.1, 0.0],
            "Customer_Type": ["New", "Returning", "New", "Returning", "New", "Returning", "New", "Returning", "New", "Returning"],
            "Payment_Method": ["UPI", "Card", "UPI", "Cash", "UPI", "Card", "UPI", "Cash", "Card", "UPI"],
            "Total_Amount": [1000.0, 270.0, 150.0, 95.0, 270.0, 160.0, 380.0, 180.0, 108.0, 1000.0],
        })

    ds_name = "test_sales_dataset.csv"
    meta = {
        "columns": list(df.columns),
        "data_types": {c: str(df[c].dtype) for c in df.columns},
        "row_count": len(df),
        "filename": ds_name,
    }
    return {
        "datasets": {ds_name: df},
        "metadata": {ds_name: meta},
        "df": df,
        "ds_name": ds_name,
    }


def test_row_count_and_column_count(sales_environment):
    """Test 1: Row count and column count querying."""
    env = sales_environment
    res_rows = run_ask_analyst_query(
        "How many rows are in our file?",
        env["datasets"],
        env["metadata"],
    )
    assert res_rows["status"] == "success"
    assert res_rows["intent"]["intent"] == QueryIntent.COUNT.value
    expected_rows = len(env["df"])
    assert f"**{expected_rows}**" in res_rows["answer"]["answer"]

    res_cols = run_ask_analyst_query(
        "How many columns are in this dataset?",
        env["datasets"],
        env["metadata"],
    )
    assert res_cols["status"] == "success"
    assert res_cols["intent"]["intent"] == QueryIntent.DATA_TYPES.value
    assert f"**{len(env['df'].columns)} columns**" in res_cols["answer"]["answer"]


def test_average_numeric_column(sales_environment):
    """Test 2: Numeric average calculation on Total_Amount."""
    env = sales_environment
    res = run_ask_analyst_query(
        "What is the average Total_Amount?",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["intent"]["intent"] == QueryIntent.AVERAGE.value
    expected_avg = float(env["df"]["Total_Amount"].dropna().mean())
    computed_val = res["evidence"]["computed_values"]["metric_value"]
    assert abs(computed_val - expected_avg) < 0.01


def test_most_frequently_used_payment_method(sales_environment):
    """Test 3: Frequency / Mode of categorical payment method."""
    env = sales_environment
    res = run_ask_analyst_query(
        "Find the most frequently used payment method.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["intent"]["intent"] == QueryIntent.FREQUENCY.value
    assert res["query_plan"]["column"] == "Payment_Method"

    val_counts = env["df"]["Payment_Method"].value_counts()
    expected_mode = val_counts.index[0]
    expected_count = int(val_counts.iloc[0])

    assert res["evidence"]["most_frequent_value"] == expected_mode
    assert res["evidence"]["frequency_count"] == expected_count
    assert expected_mode in res["answer"]["answer"]


def test_percentage_revenue_by_category(sales_environment):
    """Test 4: Percentage contribution / share of total revenue by category."""
    env = sales_environment
    res = run_ask_analyst_query(
        "Calculate the percentage of revenue contributed by each category.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["intent"]["intent"] == QueryIntent.PERCENTAGE_CONTRIBUTION.value
    assert "Category" in res["query_plan"]["group_by"]

    # Verify mathematical values
    clean = env["df"].dropna(subset=["Category", "Total_Amount"])
    tot_rev = clean["Total_Amount"].sum()
    grp = clean.groupby("Category")["Total_Amount"].sum()
    top_cat = grp.idxmax()
    expected_top_pct = round((grp.max() / tot_rev) * 100.0, 2)

    assert res["evidence"]["top_group"] == top_cat
    assert abs(res["evidence"]["top_percentage"] - expected_top_pct) < 0.1
    assert "Percentage contribution" in res["answer"]["answer"]


def test_highest_sales_day_using_sum_by_date(sales_environment):
    """Test 5: Group sales by date and identify the highest-sales day (limit=1)."""
    env = sales_environment
    res = run_ask_analyst_query(
        "Group sales by date and identify the highest-sales day.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["query_plan"]["limit"] == 1
    assert "Date" in res["query_plan"]["group_by"]
    assert res["query_plan"]["aggregation"] == "sum"

    # Compute expected peak date
    date_sums = env["df"].dropna(subset=["Date", "Total_Amount"]).groupby("Date")["Total_Amount"].sum()
    peak_date = str(date_sums.idxmax())
    peak_amount = float(date_sums.max())

    assert str(res["result"]["data"].iloc[0]["Date"]) == peak_date
    assert abs(float(res["result"]["data"].iloc[0]["sum_Total_Amount"]) - peak_amount) < 0.01
    assert "highest-sales day" in res["answer"]["answer"]


def test_top_five_orders_by_total_amount(sales_environment):
    """Test 6: Top 5 orders ranked by total amount."""
    env = sales_environment
    res = run_ask_analyst_query(
        "Find the top 5 orders by total amount.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["query_plan"]["limit"] == 5
    assert "Order_ID" in res["query_plan"]["group_by"]
    assert res["query_plan"]["sort"] == "descending"

    top_orders_df = env["df"].dropna(subset=["Order_ID", "Total_Amount"]).groupby("Order_ID")["Total_Amount"].sum().sort_values(ascending=False).head(5)
    expected_top_order = top_orders_df.index[0]

    assert float(res["result"]["data"].iloc[0]["Order_ID"]) == float(expected_top_order)
    assert len(res["result"]["data"]) == min(5, len(env["df"]))
    assert "orders ranked by" in res["answer"]["answer"]


def test_compare_new_and_returning_customers(sales_environment):
    """Test 7: Compare total revenue from new and returning customers."""
    env = sales_environment
    res = run_ask_analyst_query(
        "Compare the total revenue from new and returning customers.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["intent"]["intent"] == QueryIntent.COMPARE_GROUPS.value
    assert "Customer_Type" in res["query_plan"]["group_by"]

    grp_sums = env["df"].dropna(subset=["Customer_Type", "Total_Amount"]).groupby("Customer_Type")["Total_Amount"].sum()
    ret_sum = float(grp_sums.get("Returning", 0.0))
    new_sum = float(grp_sums.get("New", 0.0))

    assert abs(res["evidence"]["top_value"] - max(ret_sum, new_sum)) < 0.1
    assert abs(res["evidence"]["second_value"] - min(ret_sum, new_sum)) < 0.1
    assert "Comparison of `sum` `Total_Amount`" in res["answer"]["answer"]


def test_average_order_value(sales_environment):
    """Test 8: Average order value calculation (AOV = Total Revenue / Valid Orders)."""
    env = sales_environment
    res = run_ask_analyst_query(
        "Calculate average order value.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["intent"]["intent"] == QueryIntent.AVERAGE_ORDER_VALUE.value

    clean = env["df"].dropna(subset=["Total_Amount"])
    tot_rev = clean["Total_Amount"].sum()
    dist_orders = clean["Order_ID"].nunique()
    expected_aov = round(tot_rev / dist_orders, 2)

    assert abs(res["evidence"]["aov"] - expected_aov) < 0.05
    assert abs(res["evidence"]["total_revenue"] - tot_rev) < 0.05
    assert res["evidence"]["distinct_orders"] == dist_orders


def test_missing_values_query(sales_environment):
    """Test 9: Missing values detection across dataset columns."""
    env = sales_environment
    res = run_ask_analyst_query(
        "Which columns have missing values?",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["intent"]["intent"] == QueryIntent.MISSING_VALUES.value
    expected_missing = int(env["df"].isna().sum().sum())
    assert res["evidence"]["raw_evidence"]["total_missing_values"] == expected_missing


def test_date_trend(sales_environment):
    """Test 10: Chronological trend analysis of Total_Amount over Date."""
    env = sales_environment
    res = run_ask_analyst_query(
        "Show the trend of Total_Amount over Date",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["intent"]["intent"] == QueryIntent.TREND.value
    assert res["evidence"]["date_column"] == "Date"
    assert res["evidence"]["metric_column"] == "Total_Amount"
    assert "trend" in res["answer"]["answer"]


def test_multi_metric_dashboard(sales_environment):
    """Test 11: Multi-metric executive dashboard query decomposed into 5 KPIs."""
    env = sales_environment
    res = run_ask_analyst_query(
        "Create a dashboard showing total revenue, total orders, average order value, revenue by region, and sales by category.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["intent"]["intent"] == QueryIntent.DASHBOARD.value

    # Verify all 5 metrics are computed and present
    summary_metrics = res["evidence"]["summary_metrics"]
    assert "Total Revenue" in summary_metrics
    assert "Total Orders" in summary_metrics or "Total Orders (Transactions)" in summary_metrics
    assert "Average Order Value" in summary_metrics
    assert len(res["evidence"]["region_breakdown"]) > 0
    assert len(res["evidence"]["category_breakdown"]) > 0
    assert "Executive Analytical Dashboard" in res["answer"]["answer"]


def test_categorical_column_numeric_mean_error(sales_environment):
    """Test 12: Categorical column requested for numeric mean must be rejected with informative error."""
    env = sales_environment
    res = run_ask_analyst_query(
        "What is the average customer type",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "error"
    assert res["answer"]["confidence"] == "Low"
    assert len(res["errors"]) > 0
    err_text = res["errors"][0].lower()
    assert "requires a numeric column" in err_text or "cannot be computed on text" in err_text or "categorical" in err_text


def test_unavailable_column_error(sales_environment):
    """Test 13: Query referencing nonexistent column returns explicit schema error."""
    env = sales_environment
    res = run_ask_analyst_query(
        "What is the average profit margin of our orders?",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "error"
    assert res["answer"]["confidence"] == "Low"
    assert len(res["errors"]) > 0
    err_text = "; ".join(res["errors"]).lower()
    assert "not exist" in err_text or "no valid numeric column" in err_text


def test_profitability_with_assumptions(sales_environment):
    """Test 14: Profitability analysis without cost column returns revenue proxy with explicit stated assumptions."""
    env = sales_environment
    res = run_ask_analyst_query(
        "Find the most profitable product based on the available sales data. State any assumptions.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["intent"]["intent"] == QueryIntent.PROFITABILITY.value
    assert res["evidence"]["has_true_profit"] is False
    assert "assumption" in res["evidence"]
    assert "Notice on Profitability" in res["answer"]["answer"]
    assert "uniform profit margins" in res["answer"]["answer"] or "proxy" in res["answer"]["answer"].lower()


def test_standard_deviation_calculation():
    """Test 15: Standard deviation of Unit_Price with controlled numeric DataFrame, ddof=1, and missing values."""
    # Controlled DataFrame with missing values
    df = pd.DataFrame({
        "Unit_Price": [100.0, 200.0, np.nan, 400.0, 500.0],
        "Category": ["A", "B", "C", "D", "E"],
    })
    meta = {
        "test_std.csv": {
            "columns": ["Unit_Price", "Category"],
            "data_types": {"Unit_Price": "float64", "Category": "object"},
        }
    }
    res = run_ask_analyst_query(
        "Calculate the standard deviation of Unit_Price.",
        {"test_std.csv": df},
        meta,
    )
    assert res["status"] == "success"
    assert res["intent"]["intent"] == QueryIntent.STANDARD_DEVIATION.value
    assert res["query_plan"]["aggregation"] == "std"
    assert res["query_plan"]["column"] == "Unit_Price"

    # Independently verified expected sample standard deviation (ddof=1)
    valid_series = pd.Series([100.0, 200.0, 400.0, 500.0])
    expected_std = float(valid_series.std(ddof=1))
    computed_val = res["result"]["evidence"]["value"]
    assert round(computed_val, 4) == round(expected_std, 4)
    assert res["result"]["evidence"]["ddof"] == 1
    assert res["result"]["evidence"]["count_valid"] == 4
    assert res["result"]["evidence"]["count_null"] == 1

    # Text answer states sample standard deviation convention and missing value handling
    ans = res["answer"]["answer"]
    assert "sample standard deviation" in ans.lower()
    assert "ddof=1" in ans
    assert "missing value" in ans


def test_out_of_scope_capital_of_japan(sales_environment):
    """Test 16: Out-of-scope question 'What is the capital of Japan?' returns explicit friendly message."""
    env = sales_environment
    res = run_ask_analyst_query(
        "What is the capital of Japan?",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["intent"]["intent"] == QueryIntent.OUT_OF_SCOPE.value
    expected_msg = "This assistant is designed to analyze your selected dataset. Please ask a question related to the available data and columns."
    assert res["answer"]["answer"] == expected_msg


def test_out_of_scope_photosynthesis(sales_environment):
    """Test 17: Out-of-scope question 'Explain photosynthesis in simple words.' returns explicit friendly message."""
    env = sales_environment
    res = run_ask_analyst_query(
        "Explain photosynthesis in simple words.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["intent"]["intent"] == QueryIntent.OUT_OF_SCOPE.value
    expected_msg = "This assistant is designed to analyze your selected dataset. Please ask a question related to the available data and columns."
    assert res["answer"]["answer"] == expected_msg


def test_missing_column_xyz123(sales_environment):
    """Test 18: Query with nonexistent column XYZ123 explains it is unavailable, lists available columns, and never substitutes."""
    env = sales_environment
    res = run_ask_analyst_query(
        "Find the average of XYZ123.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "error"
    assert len(res["errors"]) > 0
    err_str = "; ".join(res["errors"])
    # Confirms missing column is identified by name
    assert "xyz123" in err_str.lower()
    # Confirms available columns are listed
    assert "Unit_Price" in err_str or "Total_Amount" in err_str or "Available columns" in err_str
    # Confirms another column was NOT silently substituted as the calculation target
    assert res["result"].get("data") is None or (isinstance(res["result"].get("data"), pd.DataFrame) and res["result"]["data"].empty)


def test_unsupported_operation_kurtosis(sales_environment):
    """Test 19: Dataset-related query with unsupported analytical operation returns clear unsupported message."""
    env = sales_environment
    res = run_ask_analyst_query(
        "Calculate the kurtosis of Unit_Price.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["intent"]["intent"] == QueryIntent.UNSUPPORTED_OPERATION.value
    ans = res["answer"]["answer"]
    assert "kurtosis" in ans.lower()
    assert "not currently supported" in ans.lower()
    assert "Unit_Price" in ans
    # Confirms supported operations are listed
    assert "standard deviation" in ans.lower() or "count" in ans.lower() or "average" in ans.lower()


def test_ambiguous_column_query_clarification():
    """Test 20: Ambiguous column question prompts for concise clarification without guessing."""
    df_ambig = pd.DataFrame({
        "Unit_Price": [10.0, 20.0, 30.0],
        "Modal_Price": [15.0, 25.0, 35.0],
        "Category": ["A", "B", "C"],
    })
    meta_ambig = {
        "sales.csv": {
            "columns": ["Unit_Price", "Modal_Price", "Category"],
            "data_types": {"Unit_Price": "float64", "Modal_Price": "float64", "Category": "object"},
        }
    }
    res = run_ask_analyst_query(
        "What is the average price?",
        {"sales.csv": df_ambig},
        meta_ambig,
    )
    assert res["status"] == "needs_clarification"
    assert res["validation"]["requires_clarification"] is True
    assert "Which column should I use" in res["validation"]["clarification_question"]
    opts = res["validation"]["clarification_options"]
    assert "Unit_Price" in opts and "Modal_Price" in opts


def test_numeric_operation_on_non_numeric_column(sales_environment):
    """Test 21: Numeric aggregation requested on a non-numeric column returns a clear datatype error."""
    env = sales_environment
    res = run_ask_analyst_query(
        "Calculate the standard deviation of Product.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "error"
    assert len(res["errors"]) > 0
    err_text = res["errors"][0].lower()
    assert "requires a numeric column" in err_text or "cannot be computed on text" in err_text


def test_empty_dataset_and_missing_values_safeguards():
    """Test 22: Safe handling of empty DataFrame, empty query, and all-NaN column without crashing."""
    # Empty query
    res_empty_q = run_ask_analyst_query("", {"test.csv": pd.DataFrame({"A": [1]})}, {"test.csv": {"columns": ["A"]}})
    assert res_empty_q["status"] == "error"
    assert "Question cannot be empty" in res_empty_q["errors"][0]

    # No datasets
    res_no_ds = run_ask_analyst_query("How many rows?", {}, {})
    assert res_no_ds["status"] == "error"
    assert "No datasets available" in res_no_ds["errors"][0]

    # Empty DataFrame (0 rows)
    empty_df = pd.DataFrame({"Unit_Price": pd.Series(dtype="float64")})
    res_empty_df = run_ask_analyst_query(
        "Calculate the standard deviation of Unit_Price.",
        {"empty.csv": empty_df},
        {"empty.csv": {"columns": ["Unit_Price"], "data_types": {"Unit_Price": "float64"}}},
    )
    assert res_empty_df["status"] in ("success", "empty")
    assert "No matching records were found" in res_empty_df["answer"]["answer"] or res_empty_df["result"]["row_count"] == 0

    # All-NaN column
    nan_df = pd.DataFrame({"Unit_Price": [np.nan, np.nan, np.nan]})
    res_nan_df = run_ask_analyst_query(
        "Calculate the standard deviation of Unit_Price.",
        {"all_nan.csv": nan_df},
        {"all_nan.csv": {"columns": ["Unit_Price"], "data_types": {"Unit_Price": "float64"}}},
    )
    assert "No valid numerical values" in res_nan_df["answer"]["answer"] or "No valid values found" in res_nan_df["result"].get("warnings", [""])[0]
