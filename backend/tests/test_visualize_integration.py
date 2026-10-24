"""Test suite for Dataset Visualization feature integration with actual dataset data."""

import io
import pytest
import pandas as pd
from fastapi.testclient import TestClient
from app.models.user import User


def get_auth_headers(client: TestClient, db_session, username="viz_user", email="viz@example.com"):
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
def uploaded_test_dataset(client: TestClient, db_session):
    """Fixture providing an authentic uploaded dataset ID with categorical, date, and numeric features."""
    headers = get_auth_headers(client, db_session, "chart_user", "chart@example.com")
    df = pd.DataFrame({
        "Category": ["Electronics", "Clothing", "Home", "Electronics", "Clothing", "Home", "Electronics", "Home"],
        "Subcategory": ["Phones", "Shirts", "Kitchen", "Laptops", "Pants", "Furniture", "Tablets", "Decor"],
        "Sales": [1200.5, 450.0, 780.25, 2300.0, 620.0, 1150.0, 890.0, 310.5],
        "Units": [12, 18, 5, 8, 14, 3, 9, 7],
        "Profit": [340.0, 120.5, 190.0, 680.0, 155.0, 260.0, 240.0, 85.0],
    })
    csv_bytes = df.to_csv(index=False).encode("utf-8")
    files = [("files", ("sales_data.csv", io.BytesIO(csv_bytes), "text/csv"))]
    res = client.post("/api/datasets/upload", files=files, headers=headers)
    assert res.status_code == 200
    dataset_id = res.json()["uploaded"][0]["id"]
    return {"headers": headers, "dataset_id": dataset_id, "df": df}


def test_visualization_overview_returns_real_column_summaries(client: TestClient, db_session, uploaded_test_dataset):
    """Verify overview endpoint returns real column classifications and metadata for visualization panel."""
    headers = uploaded_test_dataset["headers"]
    dataset_id = uploaded_test_dataset["dataset_id"]

    res = client.get(f"/api/analytics/overview/{dataset_id}", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["dataset_id"] == dataset_id
    assert data["rows"] == 8
    assert data["columns"] == 5
    assert "Sales" in data["available_numeric_columns"]
    assert "Units" in data["available_numeric_columns"]
    assert "Profit" in data["available_numeric_columns"]
    assert "Category" in data["available_categorical_columns"]


def test_visualize_bar_and_line_charts(client: TestClient, db_session, uploaded_test_dataset):
    """Verify dynamic Bar and Line chart generation with actual aggregated values."""
    headers = uploaded_test_dataset["headers"]
    dataset_id = uploaded_test_dataset["dataset_id"]

    # Bar chart: Sum of Sales by Category
    res = client.post(
        "/api/analytics/chart",
        json={
            "dataset_id": dataset_id,
            "chart_type": "bar",
            "x_column": "Category",
            "y_column": "Sales",
            "aggregation": "sum",
        },
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["data_points"]) == 3  # Electronics, Clothing, Home
    labels = [p["label"] for p in data["data_points"]]
    assert "Electronics" in labels

    # Line chart: Average Units by Category
    line_res = client.post(
        "/api/analytics/chart",
        json={
            "dataset_id": dataset_id,
            "chart_type": "line",
            "x_column": "Category",
            "y_column": "Units",
            "aggregation": "mean",
        },
        headers=headers,
    )
    assert line_res.status_code == 200
    line_data = line_res.json()
    assert len(line_data["data_points"]) == 3


def test_visualize_pie_and_donut_charts(client: TestClient, db_session, uploaded_test_dataset):
    """Verify Pie and Donut chart generation with slice proportions."""
    headers = uploaded_test_dataset["headers"]
    dataset_id = uploaded_test_dataset["dataset_id"]

    res = client.post(
        "/api/analytics/chart",
        json={
            "dataset_id": dataset_id,
            "chart_type": "donut",
            "x_column": "Category",
            "y_column": "Profit",
            "aggregation": "sum",
        },
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["data_points"]) == 3
    total_val = sum(p["value"] for p in data["data_points"])
    assert total_val > 0


def test_visualize_histogram_distribution(client: TestClient, db_session, uploaded_test_dataset):
    """Verify Histogram generation with frequency bin ranges on numeric columns."""
    headers = uploaded_test_dataset["headers"]
    dataset_id = uploaded_test_dataset["dataset_id"]

    res = client.post(
        "/api/analytics/chart",
        json={
            "dataset_id": dataset_id,
            "chart_type": "histogram",
            "y_column": "Sales",
            "bins": 5,
        },
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["data_points"]) == 5
    assert sum(p["value"] for p in data["data_points"]) == 8  # 8 total rows


def test_visualize_scatter_and_heatmap(client: TestClient, db_session, uploaded_test_dataset):
    """Verify Scatter plot and Correlation Heatmap matrix generation."""
    headers = uploaded_test_dataset["headers"]
    dataset_id = uploaded_test_dataset["dataset_id"]

    # Scatter: Sales vs Profit
    res = client.post(
        "/api/analytics/chart",
        json={
            "dataset_id": dataset_id,
            "chart_type": "scatter",
            "x_column": "Sales",
            "y_column": "Profit",
        },
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data["data_points"]) == 8
    assert "x" in data["data_points"][0]

    # Heatmap: Correlation Matrix across Sales, Units, Profit
    heat_res = client.post(
        "/api/analytics/chart",
        json={
            "dataset_id": dataset_id,
            "chart_type": "heatmap",
        },
        headers=headers,
    )
    assert heat_res.status_code == 200
    heat_data = heat_res.json()
    assert heat_data["matrix"] is not None
    assert heat_data["categories"] is not None
    assert len(heat_data["categories"]) == 3
