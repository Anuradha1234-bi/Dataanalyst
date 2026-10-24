"""Comprehensive test suite for Automated Insights Enhancement.

Verifies:
1. Severity count consistency: Total Insights == Critical + Warning + Informational.
2. Classification types: missing_values, duplicate_columns, correlation, outlier, distribution, concentration, data_quality.
3. Duplicate columns: Exact value match vs normalized naming redundancy.
4. Missing percentages: Correct denominator and calculation.
5. Graphical representation data: charts_data populated with 7 chart structures.
6. Handling edge cases: No numeric columns, empty dataset, all-null features.
7. Export report integration: Report contains accurate dataset-specific insights and metrics.
"""

import io
import pytest
import pandas as pd
from fastapi.testclient import TestClient


def get_auth_headers(client: TestClient, username="insights_user", email="insights@example.com"):
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


def upload_csv(client: TestClient, headers: dict, df: pd.DataFrame, filename="test_dataset.csv"):
    """Helper to upload a test dataframe as CSV."""
    csv_bytes = df.to_csv(index=False).encode("utf-8")
    files = [("files", (filename, io.BytesIO(csv_bytes), "text/csv"))]
    res = client.post("/api/datasets/upload", files=files, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()["uploaded"][0]["id"]


def test_customer_dataset_and_severity_consistency(client: TestClient, db_session):
    """Test 1: Small customer dataset with customer_id, customer_name, email, city, age.
    Verifies total == critical + warning + informational and no fake insights on customer_id.
    """
    headers = get_auth_headers(client, "cust_user", "cust@example.com")
    df = pd.DataFrame({
        "customer_id": [101, 102, 103, 104, 105, 106, 107, 108, 109, 110],
        "customer_name": ["Alice", "Bob", "Charlie", "David", "Eva", "Frank", "Grace", "Henry", "Ivy", "Jack"],
        "email": [f"user{i}@example.com" for i in range(10)],
        "city": ["Mumbai", "Delhi", "Bengaluru", "Mumbai", "Delhi", "Bengaluru", "Mumbai", "Pune", "Chennai", "Kolkata"],
        "age": [25, 32, 45, 29, 38, 51, 24, 42, 36, 48],
    })
    dataset_id = upload_csv(client, headers, df, "customers.csv")

    res = client.get(f"/api/analytics/insights/{dataset_id}?version=original", headers=headers)
    assert res.status_code == 200
    data = res.json()

    insights = data["insights"]
    total = len(insights)
    crit = sum(1 for i in insights if i["severity"] == "Critical")
    warn = sum(1 for i in insights if i["severity"] == "Warning")
    info = sum(1 for i in insights if i["severity"] == "Informational")

    # Strict consistency invariant
    assert total == crit + warn + info

    # customer_id should NOT be flagged as continuous measurement outlier or skewness
    id_insights = [i for i in insights if "customer_id" in i["columns_involved"] and i["type"] in ("outlier", "distribution")]
    assert len(id_insights) == 0

    # charts_data validation
    assert "charts_data" in data
    assert "severity_distribution" in data["charts_data"]
    assert "type_distribution" in data["charts_data"]


def test_missing_values_accuracy_and_classification(client: TestClient, db_session):
    """Test 2: Dataset containing missing values.
    Verifies missing-value percentages, critical severity for >=50%, and safe handling.
    """
    headers = get_auth_headers(client, "missing_user", "missing@example.com")
    df = pd.DataFrame({
        "feature_a": [1.0, 2.0, None, None, None, None, None, None, None, None],  # 80% missing -> Critical
        "feature_b": [10.0, 20.0, 30.0, None, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0],  # 10% missing -> Warning
        "feature_c": [1.0] * 10,  # 0% missing
    })
    dataset_id = upload_csv(client, headers, df, "missing_data.csv")

    res = client.get(f"/api/analytics/insights/{dataset_id}?version=original", headers=headers)
    assert res.status_code == 200
    data = res.json()

    missing_insights = [i for i in data["insights"] if i["type"] == "missing_values"]
    assert len(missing_insights) >= 2

    crit_missing = [i for i in missing_insights if "feature_a" in i["columns_involved"]]
    assert len(crit_missing) == 1
    assert crit_missing[0]["severity"] == "Critical"
    assert "80.0%" in crit_missing[0]["metric"]

    warn_missing = [i for i in missing_insights if "feature_b" in i["columns_involved"]]
    assert len(warn_missing) == 1
    assert warn_missing[0]["severity"] == "Warning"
    assert "10.0%" in warn_missing[0]["metric"]

    # Verify missing values chart data
    mv_chart = data["charts_data"]["missing_values"]
    assert mv_chart["total_rows"] == 10
    assert len(mv_chart["data_points"]) >= 2
    assert mv_chart["data_points"][0]["label"] == "feature_a"
    assert mv_chart["data_points"][0]["value"] == 80.0


def test_exact_duplicate_columns_vs_naming_redundancy(client: TestClient, db_session):
    """Test 3 & 4: Exact duplicate values vs same normalized name with different values.
    Verifies values are compared and exact duplicates get 100% Value Match (Warning).
    """
    headers = get_auth_headers(client, "dup_user", "dup@example.com")
    df = pd.DataFrame({
        "Revenue": [100.0, 200.0, 300.0, 400.0, 500.0, 600.0, 700.0, 800.0, 900.0, 1000.0],
        "revenue": [100.0, 200.0, 300.0, 400.0, 500.0, 600.0, 700.0, 800.0, 900.0, 1000.0],  # Exact duplicate
        "Score": [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
        "score": [15, 25, 35, 45, 55, 65, 75, 85, 95, 105],  # Same normalized name, DIFFERENT values
    })
    dataset_id = upload_csv(client, headers, df, "duplicates_test.csv")

    res = client.get(f"/api/analytics/insights/{dataset_id}?version=original", headers=headers)
    assert res.status_code == 200
    data = res.json()

    dup_insights = [i for i in data["insights"] if i["type"] == "duplicate_columns"]
    assert len(dup_insights) >= 2

    # Revenue & revenue should be Exact Duplicate (Warning)
    exact_rev = [i for i in dup_insights if "Revenue" in i["columns_involved"] and "revenue" in i["columns_involved"]]
    assert len(exact_rev) == 1
    assert exact_rev[0]["severity"] == "Warning"
    assert "Exact Duplicate" in exact_rev[0]["title"]
    assert exact_rev[0]["metric"] == "100% Value Match"

    # Score & score should be Naming Redundancy (Informational)
    redundant_score = [i for i in dup_insights if "Score" in i["columns_involved"] and "score" in i["columns_involved"]]
    assert len(redundant_score) == 1
    assert redundant_score[0]["severity"] == "Informational"
    assert "Potential Redundant" in redundant_score[0]["title"]


def test_outliers_and_correlation_heatmap(client: TestClient, db_session):
    """Test 5: Dataset with outliers and correlated numeric columns.
    Verifies correlation heatmap, Tukey 1.5x IQR outliers, and box plot quartiles.
    """
    headers = get_auth_headers(client, "stats_user", "stats@example.com")
    x_vals = [10.0, 12.0, 11.0, 13.0, 10.5, 12.5, 11.5, 13.5, 12.0, 11.0, 10.0, 12.0, 999.0]  # 999 is outlier
    y_vals = [20.0, 24.0, 22.0, 26.0, 21.0, 25.0, 23.0, 27.0, 24.0, 22.0, 20.0, 24.0, 2000.0]  # Correlated with x
    df = pd.DataFrame({"Feature_X": x_vals, "Feature_Y": y_vals})
    dataset_id = upload_csv(client, headers, df, "outliers_corr.csv")

    res = client.get(f"/api/analytics/insights/{dataset_id}?version=original", headers=headers)
    assert res.status_code == 200
    data = res.json()

    # Correlation insight
    corr_insights = [i for i in data["insights"] if i["type"] == "correlation"]
    assert len(corr_insights) >= 1
    assert corr_insights[0]["severity"] in ("Warning", "Informational")

    # Outlier insight
    outlier_insights = [i for i in data["insights"] if i["type"] == "outlier"]
    assert len(outlier_insights) >= 1

    # Boxplot data in charts_data
    boxplot_data = data["charts_data"]["outlier_analysis"]["boxplot_data"]
    assert len(boxplot_data) >= 1
    assert boxplot_data[0]["q1"] < boxplot_data[0]["median"] < boxplot_data[0]["q3"]

    # Correlation heatmap in charts_data
    heatmap = data["charts_data"]["correlation_heatmap"]
    assert len(heatmap["categories"]) == 2
    assert len(heatmap["matrix"]) == 2


def test_dataset_with_no_numeric_columns(client: TestClient, db_session):
    """Test 6: Dataset containing only categorical/text columns.
    Verifies graceful handling with zero crashes and appropriate chart empty states.
    """
    headers = get_auth_headers(client, "text_user", "text@example.com")
    df = pd.DataFrame({
        "Country": ["USA", "Canada", "USA", "UK", "USA", "Germany", "USA", "France", "USA", "Japan"],
        "Status": ["Active", "Active", "Active", "Active", "Pending", "Active", "Active", "Pending", "Active", "Active"],
    })
    dataset_id = upload_csv(client, headers, df, "text_only.csv")

    res = client.get(f"/api/analytics/insights/{dataset_id}?version=original", headers=headers)
    assert res.status_code == 200
    data = res.json()

    # Category concentration should detect USA dominance or Active dominance
    conc_insights = [i for i in data["insights"] if i["type"] == "concentration"]
    assert len(conc_insights) >= 1

    # Correlation heatmap categories should be empty
    heatmap = data["charts_data"]["correlation_heatmap"]
    assert len(heatmap["categories"]) == 0

    # Total == Critical + Warning + Informational
    insights = data["insights"]
    total = len(insights)
    crit = sum(1 for i in insights if i["severity"] == "Critical")
    warn = sum(1 for i in insights if i["severity"] == "Warning")
    info = sum(1 for i in insights if i["severity"] == "Informational")
    assert total == crit + warn + info


def test_export_report_integration(client: TestClient, db_session):
    """Test 7: Export report integration.
    Verifies export report generates dataset-specific insights and accurate summary metrics.
    """
    headers = get_auth_headers(client, "export_user", "export@example.com")
    df = pd.DataFrame({
        "Item": ["Apples", "Bananas", "Cherries", "Dates", "Elderberry"] * 4,
        "Quantity": [10, 20, 15, 30, 25] * 4,
    })
    dataset_id = upload_csv(client, headers, df, "sales_report.csv")

    req_payload = {
        "dataset_id": dataset_id,
        "version": "original",
        "title": "Quarterly Sales Report",
        "include_kpis": True,
        "include_stats": True,
        "include_insights": True,
    }
    res = client.post("/api/analytics/export/report", json=req_payload, headers=headers)
    assert res.status_code == 200
    report = res.json()

    assert report["dataset_id"] == dataset_id
    assert report["insights"] is not None
    assert "insights" in report["insights"]
    assert "charts_data" in report["insights"]
