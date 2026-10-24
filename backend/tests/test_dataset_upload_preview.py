"""Test suite for Upload Dataset Preview, Metadata Summary, and Graphics Enhancements."""

import io
import pytest
import pandas as pd
from fastapi.testclient import TestClient
from app.models.user import User


def get_auth_headers(client: TestClient, db_session, username="preview_user", email="preview@example.com"):
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


def test_upload_csv_with_preview_and_missing_values(client: TestClient, db_session):
    """Test CSV upload returning 5-row preview and missing values breakdown."""
    headers = get_auth_headers(client, db_session, "csv_user", "csv@example.com")

    # 10 rows, columns: id, name, score, department. score and department have missing values
    data = {
        "id": list(range(1, 11)),
        "name": [f"Person_{i}" for i in range(1, 11)],
        "score": [85.5, None, 92.0, 78.0, None, 88.0, 95.0, None, 80.0, 91.5],
        "department": ["Engineering", "Product", None, "Sales", "Engineering", None, "Design", "Sales", "Product", "Engineering"],
    }
    df = pd.DataFrame(data)
    csv_bytes = df.to_csv(index=False).encode("utf-8")

    files = [("files", ("test_team.csv", io.BytesIO(csv_bytes), "text/csv"))]
    res = client.post("/api/datasets/upload", files=files, headers=headers)
    assert res.status_code == 200
    res_data = res.json()

    assert res_data["total_uploaded"] == 1
    assert len(res_data["uploaded"]) == 1
    dataset = res_data["uploaded"][0]

    # Verify standard metadata
    assert dataset["filename"] == "test_team.csv"
    assert dataset["rows"] == 10
    assert dataset["columns"] == 4
    assert dataset["column_names"] == ["id", "name", "score", "department"]

    # Verify preview rows (first 5 rows)
    assert dataset["preview_rows"] is not None
    assert len(dataset["preview_rows"]) == 5
    assert dataset["preview_rows"][0]["id"] == 1
    assert dataset["preview_rows"][0]["name"] == "Person_1"
    assert dataset["preview_rows"][0]["score"] == 85.5
    assert dataset["preview_rows"][0]["department"] == "Engineering"

    # Missing value represented cleanly as None
    assert dataset["preview_rows"][1]["score"] is None
    assert dataset["preview_rows"][2]["department"] is None

    # Verify missing values summary
    assert dataset["total_missing_cells"] == 5  # 3 missing in score, 2 in department
    missing_cols = dataset["missing_columns"]
    assert len(missing_cols) == 2
    col_names = {mc["column"] for mc in missing_cols}
    assert "score" in col_names
    assert "department" in col_names


def test_get_dataset_preview_endpoint(client: TestClient, db_session):
    """Test dedicated GET /api/datasets/{dataset_id}/preview endpoint."""
    headers = get_auth_headers(client, db_session, "endpoint_user", "endpoint@example.com")

    data = {
        "metric_a": [10, 20, 30, 40, 50, 60, 70],
        "metric_b": ["A", "B", "C", "D", "E", "F", "G"],
    }
    df = pd.DataFrame(data)
    csv_bytes = df.to_csv(index=False).encode("utf-8")

    files = [("files", ("metrics.csv", io.BytesIO(csv_bytes), "text/csv"))]
    upload_res = client.post("/api/datasets/upload", files=files, headers=headers)
    assert upload_res.status_code == 200
    dataset_id = upload_res.json()["uploaded"][0]["id"]

    # Call preview endpoint
    preview_res = client.get(f"/api/datasets/{dataset_id}/preview", headers=headers)
    assert preview_res.status_code == 200
    pdata = preview_res.json()

    assert pdata["id"] == dataset_id
    assert pdata["filename"] == "metrics.csv"
    assert pdata["rows"] == 7
    assert pdata["columns"] == 2
    assert pdata["column_names"] == ["metric_a", "metric_b"]
    assert len(pdata["preview_rows"]) == 5
    assert pdata["total_missing_cells"] == 0
    assert len(pdata["missing_columns"]) == 0


def test_upload_dataset_fewer_than_five_rows(client: TestClient, db_session):
    """Test datasets with fewer than 5 rows return all available rows without padding or inventing data."""
    headers = get_auth_headers(client, db_session, "small_user", "small@example.com")

    data = {
        "item": ["Item 1", "Item 2", "Item 3"],
        "price": [19.99, 29.99, 49.99],
    }
    df = pd.DataFrame(data)
    csv_bytes = df.to_csv(index=False).encode("utf-8")

    files = [("files", ("small_inventory.csv", io.BytesIO(csv_bytes), "text/csv"))]
    res = client.post("/api/datasets/upload", files=files, headers=headers)
    assert res.status_code == 200
    dataset = res.json()["uploaded"][0]

    assert dataset["rows"] == 3
    assert len(dataset["preview_rows"]) == 3
    assert [r["item"] for r in dataset["preview_rows"]] == ["Item 1", "Item 2", "Item 3"]


def test_upload_excel_xlsx_preview(client: TestClient, db_session):
    """Test XLSX format upload and preview extraction."""
    headers = get_auth_headers(client, db_session, "excel_user", "excel@example.com")

    df = pd.DataFrame({
        "Quarter": ["Q1", "Q2", "Q3", "Q4"],
        "Revenue": [120000, 145000, 160000, 195000],
        "Growth": [0.05, 0.08, None, 0.12],
    })

    excel_buffer = io.BytesIO()
    with pd.ExcelWriter(excel_buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Financials")
    excel_bytes = excel_buffer.getvalue()

    files = [("files", ("financial_report.xlsx", io.BytesIO(excel_bytes), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))]
    res = client.post("/api/datasets/upload", files=files, headers=headers)
    assert res.status_code == 200
    dataset = res.json()["uploaded"][0]

    assert dataset["filename"] == "financial_report.xlsx"
    assert dataset["file_type"].lower() == "xlsx"
    assert dataset["rows"] == 4
    assert dataset["columns"] == 3
    assert len(dataset["preview_rows"]) == 4
    assert dataset["preview_rows"][0]["Quarter"] == "Q1"
    assert dataset["total_missing_cells"] == 1


def test_upload_empty_file_rejected(client: TestClient, db_session):
    """Test 0-byte file upload validation returns clear error."""
    headers = get_auth_headers(client, db_session, "empty_user", "empty@example.com")

    files = [("files", ("empty.csv", io.BytesIO(b""), "text/csv"))]
    res = client.post("/api/datasets/upload", files=files, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_uploaded"] == 0
    assert data["total_failed"] == 1
    assert "empty" in data["failed"][0]["error"].lower()


def test_upload_unsupported_extension_rejected(client: TestClient, db_session):
    """Test unsupported file extensions fail gracefully."""
    headers = get_auth_headers(client, db_session, "ext_user", "ext@example.com")

    files = [("files", ("document.pdf", io.BytesIO(b"PDF content"), "application/pdf"))]
    res = client.post("/api/datasets/upload", files=files, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_uploaded"] == 0
    assert data["total_failed"] == 1
    assert "unsupported" in data["failed"][0]["error"].lower()
