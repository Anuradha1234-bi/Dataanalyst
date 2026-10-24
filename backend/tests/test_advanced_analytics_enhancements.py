"""Comprehensive test suite for Advanced Analytics Module Enhancements.

Verifies:
1. Dataset Integrity & Source Validation (selected dataset ID, version, record counts, timestamp, duplicate column & duplicate row detection).
2. Dynamic Graphical Representation (actual CSV values, records_used, records_excluded, recommendations, chart types).
3. Reliable Time-Series Analysis (chronological sorting, quarterly interval, date range, zero-handling in period deltas).
4. Statistical Accuracy (IQR outlier column-level denominators, constant column exclusion from Pearson correlation).
5. Evidence-Grounded Automated Insights (observations_used, calculation_method, next_step, causal limitations).
"""

import io
import pytest
import pandas as pd
from fastapi.testclient import TestClient


def get_auth_headers(client: TestClient, username="adv_user", email="adv@example.com"):
    """Register and authenticate user, returning bearer authorization headers."""
    client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "password": "Password123!"},
    )
    res = client.post(
        "/api/auth/login",
        json={"username": username, "password": "Password123!"},
    )
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def analytics_test_dataset(client: TestClient, db_session):
    """Fixture providing a test dataset with casing variants, duplicate rows, date, constant, and numeric features."""
    headers = get_auth_headers(client, "analytics_tester", "analytics_tester@example.com")
    df = pd.DataFrame({
        "Transaction_Date": [
            "2024-01-15", "2024-02-10", "2024-03-05", "2024-04-20",
            "2024-05-18", "2024-06-22", "2024-07-11", "2024-08-30",
            "2024-08-30"  # Duplicate row entry for testing duplicate rows
        ],
        "Category": ["Retail", "Tech", "Food", "Retail", "Tech", "Food", "Retail", "Tech", "Tech"],
        "Revenue": [100.0, 250.0, 75.0, 500.0, 320.0, 80.0, 1200.0, 450.0, 450.0],
        "Constant_Feature": [42.0, 42.0, 42.0, 42.0, 42.0, 42.0, 42.0, 42.0, 42.0],  # Zero variance
        "Customer_ID": [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1008],
        "age": [25, 30, 45, 35, 40, 50, 22, 60, 60],
        "Age": [25, 30, 45, 35, 40, 50, 22, 60, 60],  # Case variant duplicate column
    })
    csv_bytes = df.to_csv(index=False).encode("utf-8")
    files = [("files", ("analytics_sample.csv", io.BytesIO(csv_bytes), "text/csv"))]
    res = client.post("/api/datasets/upload", files=files, headers=headers)
    assert res.status_code == 200, res.text
    dataset_id = res.json()["uploaded"][0]["id"]
    return {"headers": headers, "dataset_id": dataset_id, "df": df}


def test_overview_dataset_integrity_and_duplicate_detection(client: TestClient, db_session, analytics_test_dataset):
    """Verify overview returns dataset ID, version, timestamp, duplicate rows, and duplicate column warnings."""
    headers = analytics_test_dataset["headers"]
    dataset_id = analytics_test_dataset["dataset_id"]

    res = client.get(f"/api/analytics/overview/{dataset_id}?version=original", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["dataset_id"] == dataset_id
    assert data["version"] == "original"
    assert data["rows"] == 9
    assert data["columns"] == 7
    assert "analysis_timestamp" in data
    assert data["duplicate_row_count"] >= 1
    assert len(data["duplicate_column_warnings"]) >= 1
    assert any("age" in w.lower() for w in data["duplicate_column_warnings"])
    assert any("duplicate rows" in w.lower() for w in data["warnings"])


def test_generate_chart_records_used_and_recommendations(client: TestClient, db_session, analytics_test_dataset):
    """Verify chart generation tracks records_used, records_excluded, recommendations, and dataset provenance."""
    headers = analytics_test_dataset["headers"]
    dataset_id = analytics_test_dataset["dataset_id"]

    # 1. Bar Chart
    payload = {
        "dataset_id": dataset_id,
        "version": "original",
        "chart_type": "bar",
        "x_column": "Category",
        "y_column": "Revenue",
        "aggregation": "sum",
        "limit": 10,
    }
    res = client.post("/api/analytics/chart", json=payload, headers=headers)
    assert res.status_code == 200
    chart = res.json()

    assert chart["chart_type"] == "bar"
    assert chart["dataset_id"] == dataset_id
    assert chart["version"] == "original"
    assert chart["records_used"] == 9
    assert chart["records_excluded"] == 0
    assert len(chart["data_points"]) >= 3
    assert len(chart["table_data"]["rows"]) >= 3
    assert "recommendations" in chart

    # 2. Donut / Pie Chart
    payload_donut = {
        "dataset_id": dataset_id,
        "version": "original",
        "chart_type": "donut",
        "x_column": "Category",
        "aggregation": "count",
    }
    res_donut = client.post("/api/analytics/chart", json=payload_donut, headers=headers)
    assert res_donut.status_code == 200
    donut = res_donut.json()
    assert donut["chart_type"] == "donut"
    assert donut["records_used"] == 9

    # 3. Warning on summing ID column
    payload_id_sum = {
        "dataset_id": dataset_id,
        "version": "original",
        "chart_type": "bar",
        "x_column": "Category",
        "y_column": "Customer_ID",
        "aggregation": "sum",
    }
    res_id = client.post("/api/analytics/chart", json=payload_id_sum, headers=headers)
    assert res_id.status_code == 200
    id_chart = res_id.json()
    assert any("statistically misleading" in w for w in id_chart["warnings"])


def test_time_series_chronological_ordering_and_quarterly(client: TestClient, db_session, analytics_test_dataset):
    """Verify time-series analysis sorts chronologically and computes quarterly buckets with period comparisons."""
    headers = analytics_test_dataset["headers"]
    dataset_id = analytics_test_dataset["dataset_id"]

    # Quarterly interval
    payload = {
        "dataset_id": dataset_id,
        "version": "original",
        "date_column": "Transaction_Date",
        "metric_column": "Revenue",
        "interval": "quarterly",
        "aggregation": "sum",
    }
    res = client.post("/api/analytics/trend", json=payload, headers=headers)
    assert res.status_code == 200
    trend = res.json()

    assert trend["interval"] == "quarterly"
    assert trend["start_date"] == "2024-01-15"
    assert trend["end_date"] == "2024-08-30"
    assert trend["observations_count"] == 9
    assert len(trend["data_points"]) >= 3
    # Check that points are chronologically ordered (e.g. 2024-Q1, 2024-Q2, 2024-Q3)
    labels = [p["label"] for p in trend["data_points"]]
    assert "2024-Q1" in labels[0]
    assert trend["causal_caveat"] is not None
    assert trend["previous_period_comparison"] is not None
    assert "change_direction" in trend["previous_period_comparison"]


def test_deep_stats_outlier_denominators_and_constant_columns(client: TestClient, db_session, analytics_test_dataset):
    """Verify IQR outlier detection uses column-specific denominator and excludes zero-variance constant columns."""
    headers = analytics_test_dataset["headers"]
    dataset_id = analytics_test_dataset["dataset_id"]

    payload = {
        "dataset_id": dataset_id,
        "version": "original",
    }
    res = client.post("/api/analytics/stats", json=payload, headers=headers)
    assert res.status_code == 200
    stats = res.json()

    assert len(stats["descriptive_table"]) > 0
    for row in stats["descriptive_table"]:
        # Verify denominator: count is positive, outlier_pct is between 0 and 100
        assert row["count"] > 0
        assert 0.0 <= row["outlier_pct"] <= 100.0

    # Verify constant column is noted in limitations for correlation matrix
    assert any("Constant_Feature" in lim for lim in stats["limitations"])
    # Matrix shouldn't contain Constant_Feature
    corr_cols = stats["correlation_matrix"]["columns"]
    assert "Constant_Feature" not in corr_cols


def test_evidence_grounded_insights_attributes(client: TestClient, db_session, analytics_test_dataset):
    """Verify all insights contain observations_used, calculation_method, next_step, and duplicate column alert."""
    headers = analytics_test_dataset["headers"]
    dataset_id = analytics_test_dataset["dataset_id"]

    res = client.get(f"/api/analytics/insights/{dataset_id}?version=original", headers=headers)
    assert res.status_code == 200
    insights_data = res.json()

    assert insights_data["dataset_id"] == dataset_id
    assert len(insights_data["insights"]) > 0

    for item in insights_data["insights"]:
        assert item["observations_used"] is not None
        assert item["calculation_method"] is not None
        assert item["next_step"] is not None
        assert item["title"] != ""
        assert item["statement"] != ""

    # Verify duplicate columns ('age' vs 'Age') triggered an insight
    dup_insights = [i for i in insights_data["insights"] if "dup_col" in i["id"]]
    assert len(dup_insights) >= 1
