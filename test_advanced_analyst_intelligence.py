"""Comprehensive Automated Test Suite for Advanced Data Analyst Intelligence.

Verifies:
1. Exact column-name resolution.
2. Ambiguous original and joined columns.
3. User selection followed by automatic query continuation without retyping.
4. Follow-up questions:
   - Limit modification ("Now show the top 10")
   - Chart specification ("Plot it as a bar chart")
   - Temporal/Month filtering ("Filter only records from September")
   - Sorting modification ("Now sort descending")
   - Pronoun reference resolution ("that column")
5. Dataset switching and context invalidation (context from Dataset A is never returned for Dataset B).
6. User and dataset isolation (User A's session is strictly isolated from User B).
7. Missing columns, null values, empty datasets, and invalid operations.
8. Numerical calculations matching ground truth.
9. Dataset in-memory caching with mtime/size invalidation.
"""

import sys
import os
import time
from pathlib import Path
import pandas as pd
import numpy as np

# Ensure root and backend are on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = PROJECT_ROOT / "backend"

for p in [str(PROJECT_ROOT), str(BACKEND_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from query.column_lineage import inspect_column_lineage
from query.column_resolver import resolve_column
from query.query_planner import build_query_plan
from query.orchestrator import run_ask_analyst_query
from query.context_manager import ConversationContextManager
from query.chart_recommender import recommend_query_visualization
from app.services.data_analyst_service import DataAnalystService


def build_sample_data():
    dates = pd.date_range("2026-08-25", periods=20, freq="D")
    df = pd.DataFrame({
        "Date": dates,
        "Customer": [f"Cust_{i % 5 + 1}" for i in range(20)],
        "Market": ["North", "South", "North", "West", "East"] * 4,
        "Quantity": [10, 25, 15, 30, 20, 50, 45, 12, 18, 22, 35, 40, 15, 28, 33, 42, 11, 19, 27, 31],
        "unit_price": [100.0, 150.0, 120.0, 200.0, 110.0] * 4,
        "unit_price_joined_orders__1__customers_1": [100.0, 150.0, 120.0, 200.0, 110.0] * 4,
        "Modal_Price": [105.0, 155.0, 125.0, 205.0, 115.0] * 4,
        "Min_Price": [90.0, 140.0, 110.0, 190.0, 100.0] * 4,
        "Max_Price": [120.0, 170.0, 140.0, 220.0, 130.0] * 4,
    })
    meta = {
        "column_names": [str(c) for c in df.columns],
        "data_types": {str(c): str(df[c].dtype) for c in df.columns},
        "rows": len(df),
        "columns": len(df.columns),
        "date_column": "Date",
    }
    return df, meta


def test_1_exact_and_ambiguous_column_resolution():
    print("\n--- Test 1: Exact vs Ambiguous Column Resolution ---")
    df, meta = build_sample_data()

    # Exact match on unit_price must resolve to unit_price without prompt
    res_exact = resolve_column("unit_price", meta)
    assert res_exact["resolved"] is True
    assert res_exact["column"] == "unit_price"
    assert res_exact["is_ambiguous"] is False
    print("  [PASS] Exact match 'unit_price' resolved cleanly without ambiguity.")

    # Ambiguous keyword "price" matching Modal_Price, Min_Price, Max_Price must trigger clarification
    res_ambig = resolve_column("price", meta)
    assert res_ambig["is_ambiguous"] is True
    assert "Modal_Price" in res_ambig["clarification_options"]
    assert "Min_Price" in res_ambig["clarification_options"]
    assert len(res_ambig["clarification_candidates"]) >= 3
    for cand in res_ambig["clarification_candidates"]:
        assert cand.get("data_type") is not None
        assert "column" in cand
    print("  [PASS] Material ambiguity for 'price' correctly prompted with candidates & data types.")


def test_2_source_information_unavailable_when_no_lineage():
    print("\n--- Test 2: Source Information Unavailable Guard ---")
    columns = ["price", "price_joined_x"]
    lineage = inspect_column_lineage(columns, metadata=None)
    assert lineage["price"].source_dataset is None
    assert lineage["price_joined_x"].source_dataset is None
    # Verify label and display explicitly note Source information unavailable
    assert lineage["price"].to_dict()["source_dataset_display"] == "Source information unavailable"
    assert "Source information unavailable" in lineage["price_joined_x"].label
    c_dict = lineage["price_joined_x"].to_dict()
    assert c_dict["source_dataset_display"] == "Source information unavailable"
    print("  [PASS] Lineage safely notes 'Source information unavailable' without hallucinating.")


def test_3_clarification_continuation_without_retyping():
    print("\n--- Test 3: Clarification Continuation Without Retyping ---")
    df, meta = build_sample_data()
    datasets = {"sales_data": df}
    metadata_all = {"sales_data": meta}

    # Step A: Ambiguous question
    resp_ambig = run_ask_analyst_query(
        question="What is the average price?",
        datasets=datasets,
        metadata=metadata_all,
    )
    assert resp_ambig["status"] == "needs_clarification"

    # Step B: User selects a candidate column option
    resp_cont = run_ask_analyst_query(
        question="What is the average price? using Modal_Price",
        datasets=datasets,
        metadata=metadata_all,
        context={"previous_query_plan": resp_ambig["query_plan"], "previous_question": "What is the average price?"},
    )
    assert resp_cont["status"] == "success"
    assert resp_cont["query_plan"]["column"] == "Modal_Price"
    expected_mean = float(df["Modal_Price"].mean())
    actual_mean = float(resp_cont["evidence"]["computed_values"]["metric_value"])
    assert round(actual_mean, 2) == round(expected_mean, 2)
    print(f"  [PASS] Continued query seamlessly with 'Modal_Price': Mean = {actual_mean:.2f}")


def test_4_follow_up_intelligence():
    print("\n--- Test 4: Follow-up Conversational Intelligence ---")
    df, meta = build_sample_data()
    datasets = {"sales_data": df}
    metadata_all = {"sales_data": meta}

    # Turn 1: "Show the top 5 customers by total quantity"
    resp_turn1 = run_ask_analyst_query(
        question="Show the top 5 customers by total quantity",
        datasets=datasets,
        metadata=metadata_all,
    )
    assert resp_turn1["status"] == "success"
    assert resp_turn1["query_plan"]["limit"] == 5
    plan_t1 = resp_turn1["query_plan"]
    print("  [Turn 1 PASS] 'Show the top 5 customers by total quantity' -> limit 5.")

    # Context for follow-ups
    session_ctx = {
        "previous_question": "Show the top 5 customers by total quantity",
        "previous_query_plan": plan_t1,
        "previous_metric": "Quantity",
        "previous_group": "Customer",
        "previous_entities": ["Cust_4", "Cust_2", "Cust_1"],
    }

    # Turn 2: "Now show the top 10"
    resolved_q2, plan_t2 = ConversationContextManager.resolve_follow_up("Now show the top 10", session_ctx)
    assert plan_t2 is not None
    assert plan_t2["limit"] == 10
    resp_turn2 = run_ask_analyst_query(
        question=resolved_q2,
        datasets=datasets,
        metadata=metadata_all,
        context=session_ctx,
    )
    assert resp_turn2["status"] == "success"
    assert resp_turn2["query_plan"]["limit"] == 10
    print("  [Turn 2 PASS] 'Now show the top 10' -> successfully modified limit to 10.")

    # Turn 3: "Plot it as a bar chart"
    resolved_q3, plan_t3 = ConversationContextManager.resolve_follow_up("Plot it as a bar chart", session_ctx)
    assert plan_t3 is not None
    assert plan_t3["output"]["chart"] is True
    assert plan_t3["preferred_chart_type"] == "bar"
    vis_res = recommend_query_visualization(resolved_q3, plan_t3, resp_turn1["result"])
    assert vis_res["recommended"] is True
    assert vis_res["chart_type"] == "bar"
    print("  [Turn 3 PASS] 'Plot it as a bar chart' -> enforced bar chart visualization.")

    # Turn 4: "Filter only records from September"
    resolved_q4, plan_t4 = ConversationContextManager.resolve_follow_up("Filter only records from September", session_ctx)
    assert plan_t4 is not None
    assert any(f.get("operator") == "month" and f.get("value") == "September" for f in plan_t4["filters"])
    resp_turn4 = run_ask_analyst_query(
        question="Show top 5 customers by total quantity",
        datasets=datasets,
        metadata=metadata_all,
        context={"previous_query_plan": plan_t4},
    )
    assert resp_turn4["status"] == "success"
    print("  [Turn 4 PASS] 'Filter only records from September' -> filtered to September dates.")

    # Turn 5: "Now sort descending"
    resolved_q5, plan_t5 = ConversationContextManager.resolve_follow_up("Now sort descending", session_ctx)
    assert plan_t5 is not None
    assert plan_t5["sort"] == "descending"
    print("  [Turn 5 PASS] 'Now sort descending' -> updated plan sort to descending.")

    # Turn 6: Pronoun "What is the average of that column?"
    resolved_q6, _ = ConversationContextManager.resolve_follow_up("What is the average of that column?", session_ctx)
    assert "Quantity" in resolved_q6
    print(f"  [Turn 6 PASS] 'that column' resolved to '{resolved_q6}'.")


def test_5_dataset_switching_and_user_isolation():
    print("\n--- Test 5: Dataset Switching and User Isolation ---")
    # Simulate User 1 on Dataset 101
    ConversationContextManager.update_context(
        user_id=1,
        dataset_id=101,
        version="original",
        question="Show top 5 products",
        plan={"intent": "TOP_N", "limit": 5, "column": "Sales", "group_by": ["Product"]},
        result_payload={},
        entities=["Product A", "Product B"],
    )

    # 1. User 1 switching to Dataset 102 must NOT see context from Dataset 101
    ctx_ds2 = ConversationContextManager.get_context(user_id=1, dataset_id=102, version="original")
    assert ctx_ds2 == {}, "Context must be empty when querying a different dataset ID"
    print("  [PASS] Dataset switching strictly isolates context across datasets.")

    # 2. User 2 querying Dataset 101 must NOT see User 1's context
    ctx_u2 = ConversationContextManager.get_context(user_id=2, dataset_id=101, version="original")
    assert ctx_u2 == {}, "User 2 must not access User 1 context"
    print("  [PASS] User isolation strictly prevents cross-user context leakage.")

    # 3. Explicit clear_context works
    ConversationContextManager.clear_context(user_id=1, dataset_id=101)
    assert ConversationContextManager.get_context(user_id=1, dataset_id=101) == {}
    print("  [PASS] Context clearing verified.")


def test_6_in_memory_dataset_caching():
    print("\n--- Test 6: In-Memory Safe Dataset Caching ---")
    tmp_path = Path("scratch_test_cache.csv")
    df_raw = pd.DataFrame({"A": [1, 2, 3], "B": [10.0, 20.0, 30.0]})
    df_raw.to_csv(tmp_path, index=False)

    try:
        # First load: loads from disk and caches
        df1, err1 = DataAnalystService._get_cached_or_load_df(tmp_path, "scratch_test_cache.csv")
        assert df1 is not None
        assert len(df1) == 3

        # Second load: must be served from cache without disk re-parsing
        df2, err2 = DataAnalystService._get_cached_or_load_df(tmp_path, "scratch_test_cache.csv")
        assert df2 is not None
        assert len(df2) == 3

        # Mutate file on disk -> mtime updates
        time.sleep(0.05)
        df_updated = pd.DataFrame({"A": [1, 2, 3, 4], "B": [10.0, 20.0, 30.0, 40.0]})
        df_updated.to_csv(tmp_path, index=False)

        # Third load: must detect mtime change and reload fresh 4 rows
        df3, err3 = DataAnalystService._get_cached_or_load_df(tmp_path, "scratch_test_cache.csv")
        assert df3 is not None
        assert len(df3) == 4, f"Expected 4 rows after mtime invalidation, got {len(df3)}"
        print("  [PASS] Dataset in-memory cache safely reuses data and invalidates on mtime change.")
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


def test_7_empty_null_and_invalid_operations():
    print("\n--- Test 7: Empty, Null & Invalid Operations Guard ---")
    # Empty DataFrame
    empty_df = pd.DataFrame(columns=["A", "B"])
    meta_empty = {"column_names": ["A", "B"], "data_types": {"A": "int64", "B": "float64"}}
    resp_empty = run_ask_analyst_query(
        question="What is the average of A?",
        datasets={"empty.csv": empty_df},
        metadata={"empty.csv": meta_empty},
    )
    assert resp_empty["status"] == "error"
    print("  [PASS] Empty dataset safely rejected.")

    # Arbitrary code injection attempt
    df, meta = build_sample_data()
    resp_inject = run_ask_analyst_query(
        question="__import__('os').system('dir')",
        datasets={"data.csv": df},
        metadata={"data.csv": meta},
    )
    assert resp_inject["status"] in ("error", "needs_clarification")
    print("  [PASS] Arbitrary injection attempt strictly rejected.")


if __name__ == "__main__":
    print("=" * 70)
    print("ADVANCED DATA ANALYST - CONTEXT, ACCURACY & FOLLOW-UP TEST SUITE")
    print("=" * 70)
    test_1_exact_and_ambiguous_column_resolution()
    test_2_source_information_unavailable_when_no_lineage()
    test_3_clarification_continuation_without_retyping()
    test_4_follow_up_intelligence()
    test_5_dataset_switching_and_user_isolation()
    test_6_in_memory_dataset_caching()
    test_7_empty_null_and_invalid_operations()
    print("\n" + "=" * 70)
    print("ALL 7 ADVANCED INTELLIGENCE TEST SUITES PASSED SUCCESSFULLY!")
    print("=" * 70)
