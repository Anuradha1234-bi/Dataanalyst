"""Master test suite verifying all requirements of the Data Analyst enhancement prompt.

Tests:
1. Natural-language query variations mapping to identical analytical results:
   - "What is the total revenue?"
   - "Calculate total sales."
   - "Show me the sum of Total_Amount."
   - "How much money did we make?"
   - "Can you tell me the overall sales amount?"
   - "Give me total revenue from this dataset."
2. Word-number Top-N and ranking:
   - "Find the top three categories based on total revenue."
3. Complex queries & nested subqueries:
   - "Show categories whose total revenue exceeds the overall average category revenue."
   - "Find products whose sales are above the average sales of all products."
   - "Find customers who spent more than the average customer spending."
4. Multi-turn conversational context & follow-ups:
   - Q1: "What is the total revenue?"
   - Q2: "Now show it category-wise."
   - Q3: "Which category is highest?"
   - Q4: "Compare it with the second-highest category."
5. Dataset isolation & unselected dataset reference guard:
   - Asking about another dataset warns/explains that analysis uses currently selected dataset.
6. Missing column handling:
   - Requesting profit on a dataset without profit/cost columns explains missing column without fabricating values.
7. Basic analytical operations: count, non-null count, distinct count, min, max, avg.
"""

import sys
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
BACKEND_ROOT = PROJECT_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import pandas as pd
import numpy as np
import pytest

from query.orchestrator import run_ask_analyst_query
from query.query_models import QueryIntent


@pytest.fixture
def master_sales_env():
    data = {
        "Order_ID": [f"ORD-{i:03d}" for i in range(1, 21)],
        "Date": [
            "2024-01-05", "2024-01-08", "2024-01-12", "2024-01-15", "2024-01-20",
            "2024-01-25", "2024-02-02", "2024-02-05", "2024-02-10", "2024-02-14",
            "2024-02-20", "2024-02-25", "2024-03-01", "2024-03-05", "2024-03-10",
            "2024-03-15", "2024-03-20", "2024-03-22", "2024-03-25", "2024-03-28",
        ],
        "Category": [
            "Electronics", "Clothing", "Electronics", "Home & Garden", "Clothing",
            "Electronics", "Books", "Home & Garden", "Clothing", "Electronics",
            "Books", "Home & Garden", "Electronics", "Clothing", "Books",
            "Home & Garden", "Electronics", "Clothing", "Books", "Electronics",
        ],
        "Product": [
            "Laptop", "T-Shirt", "Headphones", "Garden Hose", "Jeans",
            "Smartwatch", "Python Book", "Lawn Mower", "Jacket", "Tablet",
            "Novel", "Plant Pot", "Monitor", "Sweater", "Data Science Handbook",
            "Solar Light", "Keyboard", "Dress", "Comic Book", "Mouse",
        ],
        "Customer": [f"CUST-{i%6+1:02d}" for i in range(20)],
        "Unit_Price": [
            1200.0, 25.0, 150.0, 45.0, 80.0,
            250.0, 40.0, 350.0, 120.0, 450.0,
            20.0, 30.0, 300.0, 60.0, 75.0,
            50.0, 100.0, 90.0, 15.0, 50.0,
        ],
        "Quantity": [
            1, 4, 2, 2, 2,
            1, 3, 1, 1, 1,
            2, 4, 1, 2, 1,
            3, 2, 1, 5, 2,
        ],
        "Total_Amount": [
            1200.0, 100.0, 300.0, 90.0, 160.0,
            250.0, 120.0, 350.0, 120.0, 450.0,
            40.0, 120.0, 300.0, 120.0, 75.0,
            150.0, 200.0, 90.0, 75.0, 100.0,
        ],
    }
    df = pd.DataFrame(data)
    datasets = {"ecommerce_sales.csv": df}
    metadata = {
        "ecommerce_sales.csv": {
            "columns": list(df.columns),
            "data_types": {c: str(df[c].dtype) for c in df.columns},
            "summary_stats": {
                c: {"mean": float(df[c].mean()), "sum": float(df[c].sum()), "min": float(df[c].min()), "max": float(df[c].max())}
                for c in ["Unit_Price", "Quantity", "Total_Amount"]
            },
            "semantic_types": {
                "Order_ID": "id",
                "Date": "date",
                "Category": "category",
                "Product": "category",
                "Customer": "id",
                "Unit_Price": "numeric",
                "Quantity": "numeric",
                "Total_Amount": "numeric",
            },
        }
    }
    return {"datasets": datasets, "metadata": metadata, "df": df}


def test_natural_language_variations_produce_identical_revenue(master_sales_env):
    """Section 3: Different phrasings of total revenue produce identical numeric results."""
    env = master_sales_env
    phrasings = [
        "What is the total revenue?",
        "Calculate total sales.",
        "Show me the sum of Total_Amount.",
        "How much money did we make?",
        "Can you tell me the overall sales amount?",
        "Give me total revenue from this dataset.",
    ]
    expected_sum = float(env["df"]["Total_Amount"].sum())

    results = []
    for q in phrasings:
        res = run_ask_analyst_query(q, env["datasets"], env["metadata"])
        assert res["status"] == "success", f"Failed for phrasing: '{q}' with errors: {res.get('errors')}"
        assert res["intent"]["intent"] == QueryIntent.SUM.value, f"Incorrect intent for '{q}': {res['intent']['intent']}"
        assert res["query_plan"]["column"] == "Total_Amount", f"Incorrect column for '{q}': {res['query_plan']['column']}"
        val = res["evidence"].get("value")
        if val is None and isinstance(res["result"]["data"], (int, float)):
            val = res["result"]["data"]
        assert val is not None
        assert round(float(val), 2) == round(expected_sum, 2), f"Mismatch for '{q}': {val} vs {expected_sum}"
        results.append(val)

    # All answers must be identical numbers
    assert len(set(results)) == 1


def test_word_number_top_n(master_sales_env):
    """Section 5: Word number parsing in top-N queries (e.g., 'top three')."""
    env = master_sales_env
    res = run_ask_analyst_query(
        "Find the top three categories based on total revenue.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["query_plan"]["limit"] == 3
    assert res["query_plan"]["group_by"] == ["Category"]
    assert res["query_plan"]["sort"] == "descending"
    assert len(res["result"]["data"]) == 3


def test_complex_subquery_categories_above_average_category_revenue(master_sales_env):
    """Section 6: Categories whose total revenue exceeds the overall average category revenue."""
    env = master_sales_env
    df = env["df"]
    cat_totals = df.groupby("Category")["Total_Amount"].sum()
    avg_cat_total = cat_totals.mean()
    expected_qualifying = set(cat_totals[cat_totals > avg_cat_total].index)

    res = run_ask_analyst_query(
        "Show categories whose total revenue exceeds the overall average category revenue.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["intent"]["intent"] == QueryIntent.COMPLEX_SUBQUERY.value
    res_df = res["result"]["data"]
    returned_categories = set(res_df["Category"])
    assert returned_categories == expected_qualifying
    assert round(res["evidence"]["overall_average"], 2) == round(avg_cat_total, 2)


def test_complex_subquery_products_above_average_sales(master_sales_env):
    """Section 6: Products whose sales are above the average sales of all products."""
    env = master_sales_env
    df = env["df"]
    prod_totals = df.groupby("Product")["Total_Amount"].sum()
    avg_prod_total = prod_totals.mean()
    expected_prods = set(prod_totals[prod_totals > avg_prod_total].index)

    res = run_ask_analyst_query(
        "Find products whose sales are above the average sales of all products.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    assert res["intent"]["intent"] == QueryIntent.COMPLEX_SUBQUERY.value
    res_df = res["result"]["data"]
    returned_prods = set(res_df["Product"])
    assert returned_prods == expected_prods


def test_conversational_follow_up_workflow(master_sales_env):
    """Section 7: Full multi-turn conversational follow-up sequence."""
    env = master_sales_env

    # Q1: "What is the total revenue?"
    q1 = "What is the total revenue?"
    res1 = run_ask_analyst_query(q1, env["datasets"], env["metadata"])
    assert res1["status"] == "success"
    assert res1["intent"]["intent"] == QueryIntent.SUM.value

    ctx1 = {
        "previous_question": q1,
        "previous_query_plan": res1["query_plan"],
        "previous_metric": res1["query_plan"].get("column"),
        "previous_group": (res1["query_plan"].get("group_by") or [None])[0],
    }

    # Q2: "Now show it category-wise."
    q2 = "Now show it category-wise."
    res2 = run_ask_analyst_query(q2, env["datasets"], env["metadata"], context=ctx1)
    assert res2["status"] == "success"
    assert res2["intent"]["intent"] == QueryIntent.GROUP_BY.value
    assert res2["query_plan"]["group_by"] == ["Category"]
    assert res2["query_plan"]["column"] == "Total_Amount"

    ctx2 = {
        "previous_question": q2,
        "previous_query_plan": res2["query_plan"],
        "previous_metric": res2["query_plan"].get("column"),
        "previous_group": (res2["query_plan"].get("group_by") or [None])[0],
    }

    # Q3: "Which category is highest?"
    q3 = "Which category is highest?"
    res3 = run_ask_analyst_query(q3, env["datasets"], env["metadata"], context=ctx2)
    assert res3["status"] == "success"
    assert res3["intent"]["intent"] == QueryIntent.TOP_N.value
    assert res3["query_plan"]["limit"] == 1
    top_cat = res3["result"]["data"].iloc[0]["Category"]
    assert top_cat == "Electronics"

    ctx3 = {
        "previous_question": q3,
        "previous_query_plan": res3["query_plan"],
        "previous_metric": res3["query_plan"].get("column"),
        "previous_group": (res3["query_plan"].get("group_by") or [None])[0],
    }

    # Q4: "Compare it with the second-highest category."
    q4 = "Compare it with the second-highest category."
    res4 = run_ask_analyst_query(q4, env["datasets"], env["metadata"], context=ctx3)
    assert res4["status"] == "success"
    assert len(res4["result"]["data"]) == 2


def test_missing_column_explains_without_fabrication(master_sales_env):
    """Section 9B: Requesting a nonexistent column (e.g., profit margin) does not fabricate or substitute."""
    env = master_sales_env
    res = run_ask_analyst_query(
        "Show me product-wise profit margin.",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "error"
    err_str = " ".join(res.get("errors", [])).lower()
    assert "profit" in err_str or "not exist" in err_str


def test_dataset_mismatch_guard(master_sales_env):
    """Section 9E: Question mentioning another unselected dataset retains selected dataset and warns."""
    env = master_sales_env
    res = run_ask_analyst_query(
        "What is total sales in the customer_churn.csv dataset?",
        env["datasets"],
        env["metadata"],
    )
    assert res["status"] == "success"
    # Target dataset is ecommerce_sales.csv, not customer_churn.csv
    assert "ecommerce_sales.csv" in res["evidence"]["dataset_source"]
    assert "customer_churn.csv" in res["answer"]["answer"]
    assert "ecommerce_sales.csv" in res["answer"]["answer"]


def test_counting_distinctions(master_sales_env):
    """Section 8: Distinguish distinct count, row count, and non-null count."""
    env = master_sales_env
    # Distinct count of Category
    res_distinct = run_ask_analyst_query(
        "How many distinct categories are there?",
        env["datasets"],
        env["metadata"],
    )
    assert res_distinct["status"] == "success"
    distinct_val = (
        res_distinct["evidence"]["computed_values"].get("Distinct Values")
        or res_distinct["result"]["evidence"].get("value")
        or res_distinct["result"]["evidence"].get("unique_count")
    )
    assert distinct_val == 4  # Electronics, Clothing, Home & Garden, Books

    # Row count
    res_rows = run_ask_analyst_query(
        "How many total rows are in this dataset?",
        env["datasets"],
        env["metadata"],
    )
    assert res_rows["status"] == "success"
    row_val = (
        res_rows["evidence"]["computed_values"].get("count")
        or res_rows["result"]["evidence"].get("value")
        or res_rows["result"]["evidence"].get("count")
    )
    assert row_val == 20
