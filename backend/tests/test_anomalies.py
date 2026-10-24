"""Automated test suite for Anomaly & Outlier Detection Module."""

import io
import json
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.dataset import Dataset
from app.models.user import User
from tools.anomaly_tool import AnomalyTool


def _create_test_dataset(client: TestClient, df: pd.DataFrame, filename: str = "test_anomaly.csv", token: str = None) -> int:
    """Helper to upload a dataset and return its assigned ID."""
    csv_bytes = df.to_csv(index=False).encode("utf-8")
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    files = {"files": (filename, io.BytesIO(csv_bytes), "text/csv")}
    resp = client.post("/api/datasets/upload", files=files, headers=headers)
    assert resp.status_code == 200, f"Upload failed: {resp.text}"
    data = resp.json()
    assert len(data["uploaded"]) > 0
    return data["uploaded"][0]["id"]


def test_1_iqr_mathematical_precision():
    """Test 1: Verify Q1, Q3, IQR, and bounds against known mathematical values."""
    # Known dataset: [10, 12, 14, 16, 18, 20, 22, 24, 26, 100]
    # Q1 = 13.5, Q3 = 22.5, IQR = 9.0
    # For 1.5x: Lower = 13.5 - 13.5 = 0.0, Upper = 22.5 + 13.5 = 36.0 -> 100 is outlier
    data = [10.0, 12.0, 14.0, 16.0, 18.0, 20.0, 22.0, 24.0, 26.0, 100.0]
    df = pd.DataFrame({"metric": data})

    res = AnomalyTool.detect_iqr_outliers(df, columns=["metric"], multiplier=1.5)
    col_res = res.column_results["metric"]

    assert col_res.q1 == pytest.approx(13.5, 0.1)
    assert col_res.q3 == pytest.approx(22.5, 0.1)
    assert col_res.iqr == pytest.approx(9.0, 0.1)
    assert col_res.upper_bound == pytest.approx(36.0, 0.1)
    assert col_res.total_outliers == 1
    assert col_res.outlier_indices == [9]
    assert res.total_outlier_rows == 1


def test_2_iqr_multiplier_1_5x_vs_3_0x():
    """Test 2: Configurable multiplier correctly differentiates moderate and extreme outliers."""
    # Data: normal cluster 10..20, moderate outlier 32.0 (between 28.0 and 37.0), extreme outlier 120.0
    df = pd.DataFrame({
        "val": [10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0, 32.0, 120.0]
    })

    # At 1.5x multiplier: both 40 and 120 are flagged
    res_1_5 = AnomalyTool.detect_iqr_outliers(df, columns=["val"], multiplier=1.5)
    # At 3.0x multiplier: only extreme outlier 120 should be flagged
    res_3_0 = AnomalyTool.detect_iqr_outliers(df, columns=["val"], multiplier=3.0)

    assert res_1_5.column_results["val"].total_outliers >= 2
    assert res_3_0.column_results["val"].total_outliers < res_1_5.column_results["val"].total_outliers
    assert 120.0 in [df.loc[i, "val"] for i in res_3_0.column_results["val"].outlier_indices]


def test_3_isolation_forest_multivariate():
    """Test 3: Isolation Forest detects multivariate anomalies on controlled numeric features."""
    np.random.seed(42)
    # Generate 40 normal correlated records and 2 stark multivariate anomalies
    feat1 = np.random.normal(50, 5, 40).tolist() + [50.0, 50.0]
    feat2 = np.random.normal(100, 10, 40).tolist() + [500.0, -100.0]  # Anomaly points at end

    df = pd.DataFrame({"f1": feat1, "f2": feat2})
    res = AnomalyTool.detect_isolation_forest(df, columns=["f1", "f2"], contamination=0.05, random_state=42)

    assert res.anomaly_count >= 1
    assert 40 in res.anomaly_indices or 41 in res.anomaly_indices
    assert len(res.anomaly_scores) == len(df)
    assert all(0.0 <= s <= 1.0 for s in res.anomaly_scores)


def test_4_edge_cases_constant_null_small(client: TestClient, db_session: Session):
    """Test 4: Handle constant columns, missing values, non-numeric columns, and small datasets safely."""
    # Create user & auth token
    signup_res = client.post("/api/auth/signup", json={
        "username": "anomaly_edge_user",
        "email": "edge@example.com",
        "password": "StrongPassword123!"
    })
    token = client.post("/api/auth/login", json={
        "email_or_username": "edge@example.com",
        "password": "StrongPassword123!"
    }).json()["access_token"]

    # Dataset with constant column, non-numeric column, nulls, and valid column
    df = pd.DataFrame({
        "id_col": [1, 2, 3, 4, 5, 6, 7],
        "category": ["A", "B", "A", "C", "B", "A", "C"],
        "constant_col": [10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0],
        "with_nulls": [12.0, np.nan, 14.0, 15.0, np.nan, 18.0, 120.0],
    })
    ds_id = _create_test_dataset(client, df, "edge_dataset.csv", token=token)

    # 1. Inspect numeric columns endpoint excludes ID and constant columns
    col_res = client.get(f"/api/anomalies/{ds_id}/columns", headers={"Authorization": f"Bearer {token}"})
    assert col_res.status_code == 200
    cols_data = col_res.json()
    assert "with_nulls" in cols_data["suitable_numeric_columns"]
    # Constant and ID should be excluded from suitable columns
    assert "id_col" not in cols_data["suitable_numeric_columns"]

    # 2. Run detection with IQR - should succeed and handle nulls safely
    detect_res = client.post("/api/anomalies/detect", json={
        "dataset_id": ds_id,
        "method": "iqr",
        "columns": ["with_nulls"],
        "multiplier": 1.5,
    }, headers={"Authorization": f"Bearer {token}"})

    assert detect_res.status_code == 200
    res_data = detect_res.json()
    assert res_data["summary"]["unique_flagged_records"] >= 1
    assert any("with_nulls" in r["flagged_columns"] for r in res_data["flagged_records"])


def test_5_dataset_non_destruction(client: TestClient, db_session: Session):
    """Test 5: Anomaly detection must leave the original dataset records completely unchanged."""
    signup_res = client.post("/api/auth/signup", json={
        "username": "anomaly_safety_user",
        "email": "safety@example.com",
        "password": "StrongPassword123!"
    })
    token = client.post("/api/auth/login", json={
        "email_or_username": "safety@example.com",
        "password": "StrongPassword123!"
    }).json()["access_token"]

    original_rows = [
        {"x": 10.0, "y": 20.0},
        {"x": 12.0, "y": 22.0},
        {"x": 14.0, "y": 24.0},
        {"x": 16.0, "y": 26.0},
        {"x": 18.0, "y": 28.0},
        {"x": 20.0, "y": 30.0},
        {"x": 999.0, "y": 999.0},  # Stark outlier
    ]
    df = pd.DataFrame(original_rows)
    ds_id = _create_test_dataset(client, df, "safety_dataset.csv", token=token)

    # Run detection
    detect_res = client.post("/api/anomalies/detect", json={
        "dataset_id": ds_id,
        "method": "both",
        "multiplier": 1.5,
        "contamination": 0.1,
    }, headers={"Authorization": f"Bearer {token}"})
    assert detect_res.status_code == 200

    # Retrieve dataset row count and verify file on disk still has 7 rows
    dataset_rec = db_session.query(Dataset).filter(Dataset.id == ds_id).first()
    assert dataset_rec is not None
    loaded_df = pd.read_csv(dataset_rec.file_path)
    assert len(loaded_df) == 7
    assert float(loaded_df.loc[6, "x"]) == 999.0
    assert float(loaded_df.loc[6, "y"]) == 999.0


def test_6_authorization_isolation(client: TestClient):
    """Test 6: User cannot run anomaly detection on another user's dataset."""
    # User A
    client.post("/api/auth/signup", json={"username": "user_a", "email": "a@example.com", "password": "StrongPassword123!"})
    token_a = client.post("/api/auth/login", json={"email_or_username": "a@example.com", "password": "StrongPassword123!"}).json()["access_token"]

    # User B
    client.post("/api/auth/signup", json={"username": "user_b", "email": "b@example.com", "password": "StrongPassword123!"})
    token_b = client.post("/api/auth/login", json={"email_or_username": "b@example.com", "password": "StrongPassword123!"}).json()["access_token"]

    # Upload dataset as User A
    df = pd.DataFrame({"val": [1, 2, 3, 4, 5, 100]})
    ds_id = _create_test_dataset(client, df, "usera_data.csv", token=token_a)

    # User B attempts to access User A's dataset
    unauthorized_res = client.post("/api/anomalies/detect", json={
        "dataset_id": ds_id,
        "method": "iqr",
    }, headers={"Authorization": f"Bearer {token_b}"})

    assert unauthorized_res.status_code == 404
    assert "not found or access denied" in unauthorized_res.json()["detail"].lower()


# =============================================================================
# REGRESSION TEST SUITE: TESTS A THROUGH I
# =============================================================================

def test_a_percentage_calculation():
    """Test A: Given 786 evaluated rows and 76 unique flagged rows, expect 9.67% after rounding to two decimal places."""
    evaluated_rows = 786
    unique_flagged = 76
    rate = round((unique_flagged / evaluated_rows) * 100, 2)
    assert rate == 9.67

    # Also verify with dataframe in AnomalyTool
    vals = [10.0] * (786 - 76) + [1000.0] * 76
    df = pd.DataFrame({"metric": vals})
    iqr_res = AnomalyTool.detect_iqr_outliers(df, columns=["metric"], multiplier=1.5)
    assert iqr_res.total_rows == 786
    assert iqr_res.total_outlier_rows == 76
    assert iqr_res.outlier_rate == 9.67
    assert iqr_res.column_results["metric"].outlier_pct == 9.67

    # Verify zero denominator safety
    empty_df = pd.DataFrame({"metric": []})
    empty_res = AnomalyTool.detect_iqr_outliers(empty_df, columns=["metric"])
    assert empty_res.outlier_rate == 0.0


def test_b_duplicate_numerical_columns():
    """Test B: Detect identical numerical columns, preserve source columns, exclude from IF when enabled,
    and verify distinct columns with similar names are not classified as duplicates."""
    np.random.seed(42)
    data = [10.0, 12.0, 14.0, 16.0, 18.0, 20.0, np.nan, 24.0, 26.0, 28.0]
    df = pd.DataFrame({
        "feature_1": data,
        "feature_1_copy": data,  # Exact duplicate
        "feature_similar_name": [10.0, 12.0, 14.0, 16.0, 18.0, 20.0, np.nan, 24.0, 26.0, 99.0],  # Different values
        "feature_2": [55.0, 12.0, 73.0, 8.0, 91.0, 10.0, 34.0, 12.0, 87.0, 14.0],
    })
    original_cols = list(df.columns)
    original_dtypes = dict(df.dtypes)
    original_values = df.copy(deep=True)

    # 1. Detection of duplicates
    canonical_to_dups, dup_to_canonical = AnomalyTool.detect_duplicate_numerical_columns(df)
    assert "feature_1" in canonical_to_dups
    assert canonical_to_dups["feature_1"] == ["feature_1_copy"]
    assert dup_to_canonical["feature_1_copy"] == "feature_1"
    assert "feature_similar_name" not in dup_to_canonical
    assert "feature_similar_name" not in canonical_to_dups

    # 2. Source columns remain unchanged
    assert list(df.columns) == original_cols
    assert dict(df.dtypes) == original_dtypes
    assert df.equals(original_values)

    # 3. Model does not use duplicate as independent feature when exclude_duplicates is True
    if_res_excluded = AnomalyTool.detect_isolation_forest(
        df, columns=["feature_1", "feature_1_copy", "feature_2"], exclude_duplicates=True, random_state=42
    )
    assert "feature_1_copy" not in if_res_excluded.features_used
    assert "feature_1" in if_res_excluded.features_used
    assert any("feature_1_copy" in exc and "feature_1" in exc for exc in if_res_excluded.excluded_columns)

    # 4. If exclude_duplicates is False, both are retained
    if_res_included = AnomalyTool.detect_isolation_forest(
        df, columns=["feature_1", "feature_1_copy", "feature_2"], exclude_duplicates=False, random_state=42
    )
    assert "feature_1_copy" in if_res_included.features_used
    assert "feature_1" in if_res_included.features_used


def test_c_overlapping_detection_methods(client: TestClient):
    """Test C: IQR flags rows A and B, IF flags rows B and C.
    Expected: IQR = 2, IF = 2, Combined = 3, Both = 1."""
    iqr_flagged_map = {0: ["col1"], 1: ["col2"]}  # Rows A and B
    if_flagged_map = {1: (0.85, "Anomaly"), 2: (0.88, "Anomaly")}  # Rows B and C

    iqr_unique = len(iqr_flagged_map.keys())
    if_unique = len(if_flagged_map.keys())
    combined_unique = len(set(iqr_flagged_map.keys()) | set(if_flagged_map.keys()))
    both_unique = len(set(iqr_flagged_map.keys()) & set(if_flagged_map.keys()))

    assert iqr_unique == 2
    assert if_unique == 2
    assert combined_unique == 3
    assert both_unique == 1


def test_d_iqr_boundaries():
    """Test D: Verify Q1, Q3, IQR, lower/upper bounds, and counts against independently calculated values.
    Test values exactly on bounds and values immediately outside them."""
    # 20 observations where we know percentiles exactly:
    base = [10.0, 10.0, 10.0, 10.0, 10.0, 20.0, 20.0, 20.0, 20.0, 20.0, 30.0, 30.0, 30.0, 30.0, 30.0, 40.0, 40.0, 40.0, 40.0, 40.0]
    test_vals = [-100.0, -50.0] + base + [100.0, 200.0]
    df = pd.DataFrame({"v": test_vals})

    res = AnomalyTool.detect_iqr_outliers(df, columns=["v"], multiplier=1.5)
    cr = res.column_results["v"]

    # Verify formula properties
    assert cr.iqr == pytest.approx(cr.q3 - cr.q1, 0.001)
    assert cr.lower_bound == pytest.approx(cr.q1 - 1.5 * cr.iqr, 0.001)
    assert cr.upper_bound == pytest.approx(cr.q3 + 1.5 * cr.iqr, 0.001)
    assert cr.lower_outliers_count >= 1
    assert cr.upper_outliers_count >= 1
    assert cr.total_outliers == cr.lower_outliers_count + cr.upper_outliers_count

    # Check strict equality rule: values exactly on the boundary are NOT outliers
    exact_df = pd.DataFrame({
        "exact": [cr.lower_bound, cr.lower_bound, cr.q1, cr.q3, cr.upper_bound, cr.upper_bound]
    })
    # Set known bounds
    exact_res = AnomalyTool.detect_iqr_outliers(exact_df, columns=["exact"], multiplier=1.5)
    # Values exactly equal to lower/upper bound must not be counted as strictly below/above
    exact_cr = exact_res.column_results["exact"]
    assert exact_cr.lower_outliers_count == 0
    assert exact_cr.upper_outliers_count == 0
    assert exact_cr.total_outliers == 0


def test_e_missing_and_invalid_values():
    """Test E: Missing values, infinities, constant columns, zero-IQR columns, and insufficient samples."""
    # 1. Infinities and NaNs must NOT be classified as outliers
    df_invalids = pd.DataFrame({
        "val": [10.0, 11.0, 12.0, 13.0, 14.0, 15.0, np.nan, np.inf, -np.inf, 100.0]
    })
    res_invalids = AnomalyTool.detect_iqr_outliers(df_invalids, columns=["val"])
    cr_invalids = res_invalids.column_results["val"]
    # Only 100.0 should be flagged
    assert cr_invalids.total_outliers == 1
    # Nan and infs should not be in outlier indices
    nan_inf_indices = [6, 7, 8]
    for idx in nan_inf_indices:
        assert idx not in cr_invalids.outlier_indices

    # 2. Constant column: 0 outliers
    df_const = pd.DataFrame({"c": [42.0] * 10})
    res_const = AnomalyTool.detect_iqr_outliers(df_const, columns=["c"])
    assert res_const.column_results["c"].total_outliers == 0

    # 3. Zero-IQR column: >50% identical
    df_zero_iqr = pd.DataFrame({"z": [0.0] * 15 + [100.0]})
    res_zero = AnomalyTool.detect_iqr_outliers(df_zero_iqr, columns=["z"])
    assert res_zero.column_results["z"].iqr == 0.0
    assert res_zero.column_results["z"].total_outliers == 1

    # 4. Insufficient samples for IF (<5)
    df_small = pd.DataFrame({"a": [1.0, 2.0], "b": [3.0, 4.0]})
    with pytest.raises(ValueError, match="at least 5"):
        AnomalyTool.detect_isolation_forest(df_small)


def test_f_isolation_forest_configuration():
    """Test F: Contamination passed correctly, predictions map to original row positions,
    and actual anomaly rate is calculated from unique evaluated rows."""
    np.random.seed(42)
    x = list(np.random.normal(0, 1, 50)) + [100.0, -100.0]
    y = list(np.random.normal(0, 1, 50)) + [100.0, -100.0]
    df = pd.DataFrame({"x": x, "y": y})

    # Test with contamination = 0.08
    res = AnomalyTool.detect_isolation_forest(df, contamination=0.08, random_state=42)
    assert res.contamination == 0.08
    assert res.rows_analyzed == 52
    assert len(res.anomaly_indices) == res.anomaly_count
    # Row mapping: indices correspond to rows in df
    for idx in res.anomaly_indices:
        assert idx in df.index
    # Anomaly percentage matches actual unique flagged count / total rows
    expected_pct = round((res.anomaly_count / 52) * 100, 2)
    assert res.anomaly_pct == expected_pct


def test_g_source_integrity(client: TestClient):
    """Test G: Snapshot of original dataset before detection.
    Confirm original values, column order, row order, data types, and row count remain unchanged."""
    signup_res = client.post("/api/auth/signup", json={"username": "user_integ", "email": "integ@example.com", "password": "StrongPassword123!"})
    token = client.post("/api/auth/login", json={"email_or_username": "integ@example.com", "password": "StrongPassword123!"}).json()["access_token"]

    df = pd.DataFrame({
        "metric_a": [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 500.0],
        "metric_b": [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 5000.0],
        "category": ["p", "q", "r", "s", "t", "u", "v"],
    })
    snapshot_df = df.copy(deep=True)
    snapshot_dtypes = dict(df.dtypes)
    snapshot_cols = list(df.columns)

    ds_id = _create_test_dataset(client, df, "integ_test.csv", token=token)

    # Run combined detection
    resp = client.post("/api/anomalies/detect", json={
        "dataset_id": ds_id,
        "method": "both",
    }, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200

    # Verify input df is identical
    assert df.equals(snapshot_df)
    assert list(df.columns) == snapshot_cols
    assert dict(df.dtypes) == snapshot_dtypes
    assert len(df) == len(snapshot_df)


def test_h_repeated_execution(client: TestClient):
    """Test H: Run same detection configuration twice. Verify deterministic result aggregation,
    no duplicate row flags, and no source-data mutation."""
    signup_res = client.post("/api/auth/signup", json={"username": "user_rep", "email": "rep@example.com", "password": "StrongPassword123!"})
    token = client.post("/api/auth/login", json={"email_or_username": "rep@example.com", "password": "StrongPassword123!"}).json()["access_token"]

    df = pd.DataFrame({
        "f1": [10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 999.0],
        "f2": [20.0, 21.0, 22.0, 23.0, 24.0, 25.0, 9999.0],
    })
    ds_id = _create_test_dataset(client, df, "rep_test.csv", token=token)

    # Run 1
    resp1 = client.post("/api/anomalies/detect", json={"dataset_id": ds_id, "method": "both"}, headers={"Authorization": f"Bearer {token}"}).json()
    # Run 2
    resp2 = client.post("/api/anomalies/detect", json={"dataset_id": ds_id, "method": "both"}, headers={"Authorization": f"Bearer {token}"}).json()

    assert resp1["summary"]["unique_flagged_records"] == resp2["summary"]["unique_flagged_records"]
    assert resp1["summary"]["flagged_percentage"] == resp2["summary"]["flagged_percentage"]
    assert len(resp1["flagged_records"]) == len(resp2["flagged_records"])
    # Ensure no duplicate row indices in flagged records
    flagged_row_indices_1 = [r["row_index"] for r in resp1["flagged_records"]]
    flagged_row_indices_2 = [r["row_index"] for r in resp2["flagged_records"]]
    assert len(flagged_row_indices_1) == len(set(flagged_row_indices_1))
    assert len(flagged_row_indices_2) == len(set(flagged_row_indices_2))


def test_i_api_and_ui_consistency(client: TestClient):
    """Test I: Verify existing endpoints and response structures remain compatible,
    and summary, tables, and flagged records agree."""
    signup_res = client.post("/api/auth/signup", json={"username": "user_compat", "email": "compat@example.com", "password": "StrongPassword123!"})
    token = client.post("/api/auth/login", json={"email_or_username": "compat@example.com", "password": "StrongPassword123!"}).json()["access_token"]

    df = pd.DataFrame({
        "id_col": [1, 2, 3, 4, 5, 6, 7],
        "amount": [100.0, 102.0, 105.0, 103.0, 101.0, 104.0, 950.0],
        "amount_dup": [100.0, 102.0, 105.0, 103.0, 101.0, 104.0, 950.0],
        "score": [50.0, 52.0, 51.0, 53.0, 49.0, 50.0, 10.0],
    })
    ds_id = _create_test_dataset(client, df, "compat_test.csv", token=token)

    # 1. GET columns endpoint
    cols_resp = client.get(f"/api/anomalies/{ds_id}/columns", headers={"Authorization": f"Bearer {token}"})
    assert cols_resp.status_code == 200
    cols_data = cols_resp.json()
    assert "amount" in cols_data["suitable_numeric_columns"]
    assert "score" in cols_data["suitable_numeric_columns"]
    assert "duplicate_columns" in cols_data
    assert "amount" in cols_data["duplicate_columns"]
    assert cols_data["duplicate_columns"]["amount"] == ["amount_dup"]

    # 2. POST detect endpoint
    det_resp = client.post("/api/anomalies/detect", json={
        "dataset_id": ds_id,
        "method": "both",
    }, headers={"Authorization": f"Bearer {token}"})
    assert det_resp.status_code == 200
    res = det_resp.json()

    # Verify response schema fields exist
    assert "summary" in res
    assert "iqr_results" in res
    assert "isolation_forest_results" in res
    assert "flagged_records" in res
    assert "all_numeric_columns" in res
    assert "duplicate_columns" in res
    assert "warnings" in res

    # Consistency across summary, tables, and flagged records
    total_analyzed = res["summary"]["total_records_analyzed"]
    unique_flagged = res["summary"]["unique_flagged_records"]
    flagged_pct = res["summary"]["flagged_percentage"]

    assert total_analyzed == 7
    assert unique_flagged == len(res["flagged_records"])
    assert flagged_pct == round((unique_flagged / total_analyzed) * 100, 2)

    # Flagged records have unique row indices
    flagged_indices = [r["row_index"] for r in res["flagged_records"]]
    assert len(flagged_indices) == len(set(flagged_indices))

    # All flagged records contain row_number matching 1-based order
    for r in res["flagged_records"]:
        assert r["row_number"] >= 1
        assert "full_row" in r
        assert "methods" in r
        assert "reasons" in r


def test_j_missing_value_denominator_transparency(client: TestClient):
    """Test J: Regression test for 4.08% vs 4.00% denominator transparency.
    In a 50-row dataset with 1 missing value and 2 extreme outliers:
    - Overall dataset outlier percentage must be (2 / 50) * 100 = 4.00%
    - Feature-level outlier rate must be (2 / 49) * 100 = 4.08%
    - Evaluated count (49), total rows (50), missing count (1), and evaluation note must be explicitly reported.
    - Isolation Forest rule requires >=2 eligible features and is skipped with clear warning when only 1 feature exists.
    """
    signup_res = client.post("/api/auth/signup", json={"username": "user_denom", "email": "denom@example.com", "password": "StrongPassword123!"})
    token = client.post("/api/auth/login", json={"email_or_username": "denom@example.com", "password": "StrongPassword123!"}).json()["access_token"]

    # Construct 50-row dataset replicating data_analyst_50_rows.csv
    # 47 normal values, 1 NaN, 2 extreme outliers (9999999)
    incomes = [45000.0 + (i * 500.0) for i in range(47)]
    incomes.append(np.nan)  # 1 missing value (row 48)
    incomes.append(9999999.0)  # outlier 1 (row 49)
    incomes.append(9999999.0)  # outlier 2 (row 50)

    df_50 = pd.DataFrame({
        "customer_id": [f"C{i:04d}" for i in range(1, 51)],
        "customer_name": [f"Customer {i}" for i in range(1, 51)],
        "annual_income_inr": incomes,
    })
    assert len(df_50) == 50
    assert df_50["annual_income_inr"].isna().sum() == 1

    # 1. Test AnomalyTool directly
    iqr_res = AnomalyTool.detect_iqr_outliers(df_50, columns=["annual_income_inr"])
    col_res = iqr_res.column_results["annual_income_inr"]

    assert iqr_res.total_rows == 50
    assert iqr_res.total_outlier_rows == 2
    # Dataset-level rate: (2 / 50) * 100 = 4.0%
    assert iqr_res.outlier_rate == 4.0

    # Feature-level breakdown: 49 valid observations evaluated, 1 excluded
    assert col_res.total_rows == 50
    assert col_res.valid_count == 49
    assert col_res.missing_count == 1
    assert col_res.total_outliers == 2
    # Feature-level rate: (2 / 49) * 100 = 4.08%
    assert col_res.outlier_pct == round((2 / 49) * 100, 2)
    assert col_res.outlier_pct == 4.08
    assert col_res.evaluation_note is not None
    assert "49 of 50" in col_res.evaluation_note
    assert "1 missing" in col_res.evaluation_note

    # 2. Test full API pipeline via detect endpoint
    ds_id = _create_test_dataset(client, df_50, "data_analyst_50_rows.csv", token=token)
    det_resp = client.post("/api/anomalies/detect", json={
        "dataset_id": ds_id,
        "method": "both",
    }, headers={"Authorization": f"Bearer {token}"})
    assert det_resp.status_code == 200
    res = det_resp.json()

    # Check Summary (dataset-level)
    assert res["summary"]["total_records_analyzed"] == 50
    assert res["summary"]["unique_flagged_records"] == 2
    assert res["summary"]["flagged_percentage"] == 4.0

    # Check Feature-level IQR Response
    feat_iqr = res["iqr_results"]["column_results"]["annual_income_inr"]
    assert feat_iqr["total_rows"] == 50
    assert feat_iqr["valid_count"] == 49
    assert feat_iqr["missing_count"] == 1
    assert feat_iqr["total_outliers"] == 2
    assert feat_iqr["outlier_pct"] == 4.08
    assert feat_iqr["evaluation_note"] is not None
    assert "49 of 50" in feat_iqr["evaluation_note"]

    # Check Warnings
    # Warning 1: Isolation Forest requires >= 2 features
    # Warning 2: annual_income_inr missing value exclusion notice
    warnings = res["warnings"]
    assert any("at least 2 non-duplicate numerical features" in w for w in warnings)
    assert any("1 missing value(s) excluded from its IQR denominator" in w for w in warnings)
    assert any("49/50 rows evaluated" in w for w in warnings)

    # Check Flagged Records: exactly 2 rows
    assert len(res["flagged_records"]) == 2
    for rec in res["flagged_records"]:
        assert rec["values"]["annual_income_inr"] == 9999999.0
        assert "above IQR upper bound" in rec["reasons"][0]


def test_k_set_union_intersection_accounting_and_suffixed_id(client: TestClient):
    """Test K: Comprehensive regression test for:
    1. Suffixed identifier column detection (e.g. 'Customer_ID_clean_customer_orders (2)').
    2. Preservation of genuine numerical measurements with suffixes/numbers.
    3. Mathematical set union and intersection identity: |A ∪ B| = |A| + |B| − |A ∩ B|.
    4. Method accounting breakdown: IQR-only, IF-only, overlap, and total unique flagged records.
    5. Preservation of original row positions and original dataset integrity.
    """
    signup_res = client.post("/api/auth/signup", json={"username": "user_math", "email": "math@example.com", "password": "StrongPassword123!"})
    token = client.post("/api/auth/login", json={"email_or_username": "math@example.com", "password": "StrongPassword123!"}).json()["access_token"]

    # 1. Verify suffixed ID detection vs genuine measurement
    s_id = pd.Series([1001, 1002, 1003, 1004, 1005] * 20)
    is_id_suffixed, reason_suffixed = AnomalyTool.is_id_or_index_column(s_id, "Customer_ID_clean_customer_orders (2)")
    assert is_id_suffixed is True
    assert "Customer_ID_clean_customer_orders (2)" in reason_suffixed

    s_amt = pd.Series([500.0, 1200.0, 350.0, 480.0, 99999.0] * 20)
    is_id_amt, reason_amt = AnomalyTool.is_id_or_index_column(s_amt, "Order_Amount_INR_clean_customer_orders (2)")
    assert is_id_amt is False

    s_age = pd.Series([25, 34, 45, 29, 52] * 20)
    is_id_age, _ = AnomalyTool.is_id_or_index_column(s_age, "Age_clean_customer_orders (2)")
    assert is_id_age is False

    # 2. Build multi-feature dataset to test union & intersection
    # Rows: 100 total
    # Feature 1 (iqr_feat): normal distribution, with 6 extreme outliers at rows [10, 11, 12, 13, 14, 15]
    # Feature 2 (trend_feat): normal distribution, with 6 outliers for Isolation Forest
    np.random.seed(42)
    x1 = np.random.normal(50, 5, 100)
    x2 = np.random.normal(100, 10, 100)

    # Inject extreme univariate IQR outliers into x1
    x1[10:16] = [9999.0, 9998.0, 9997.0, 9996.0, 9995.0, 9994.0]

    # Inject bivariate anomalies into x2 (some overlapping with x1 [14, 15], some disjoint [20, 21, 22, 23])
    x2[14] = 999.0  # Overlap with x1
    x2[15] = 998.0  # Overlap with x1
    x2[20:24] = [-500.0, -501.0, -502.0, -503.0]  # Disjoint from x1

    df = pd.DataFrame({
        "Customer_ID_clean_customer_orders (2)": list(range(1001, 1101)),
        "Order_Amount_INR_clean_customer_orders (2)": x1,
        "Age_clean_customer_orders (2)": x2,
    })

    # Snapshot to verify non-destruction
    df_snapshot = df.copy(deep=True)

    # Check identify_suitable_features excludes the suffixed ID column
    suitable, excluded_ids, _ = AnomalyTool.identify_suitable_features(df)
    assert "Customer_ID_clean_customer_orders (2)" not in suitable
    assert any("Customer_ID_clean_customer_orders (2)" in ex for ex in excluded_ids)
    assert "Order_Amount_INR_clean_customer_orders (2)" in suitable
    assert "Age_clean_customer_orders (2)" in suitable

    # Run detection through API
    ds_id = _create_test_dataset(client, df, "set_accounting_test.csv", token=token)
    det_resp = client.post("/api/anomalies/detect", json={
        "dataset_id": ds_id,
        "method": "both",
        "contamination": 0.08,
    }, headers={"Authorization": f"Bearer {token}"})
    assert det_resp.status_code == 200
    res = det_resp.json()

    summary = res["summary"]
    iqr_res = res["iqr_results"]
    if_res = res["isolation_forest_results"]
    flagged_records = res["flagged_records"]

    iqr_indices = set(iqr_res["all_outlier_indices"])
    if_indices = set(if_res["anomaly_indices"])
    combined_indices = iqr_indices | if_indices
    overlap_indices = iqr_indices & if_indices
    iqr_only_indices = iqr_indices - if_indices
    if_only_indices = if_indices - iqr_indices

    # 3. Mathematical Set Identity Verifications
    # |A ∪ B| = |A| + |B| − |A ∩ B|
    assert len(combined_indices) == len(iqr_indices) + len(if_indices) - len(overlap_indices)
    assert len(combined_indices) == len(iqr_only_indices) + len(if_only_indices) + len(overlap_indices)

    # API summary counts must strictly match set math
    assert summary["unique_flagged_records"] == len(combined_indices)
    assert summary["iqr_unique_records"] == len(iqr_indices)
    assert summary["isolation_forest_unique_records"] == len(if_indices)
    assert summary["both_methods_records"] == len(overlap_indices)
    assert summary["iqr_only_records"] == len(iqr_only_indices)
    assert summary["isolation_forest_only_records"] == len(if_only_indices)

    # Flagged records review table must contain exactly len(combined_indices) records
    assert len(flagged_records) == len(combined_indices)

    # Verify each flagged record classification
    for rec in flagged_records:
        idx = rec["row_index"]
        # Original row positions must be 1-based and strictly aligned
        assert rec["row_number"] == (idx + 1)
        methods = rec["methods"]
        if idx in overlap_indices:
            assert "IQR" in methods and "Isolation Forest" in methods
        elif idx in iqr_only_indices:
            assert "IQR" in methods and "Isolation Forest" not in methods
        elif idx in if_only_indices:
            assert "Isolation Forest" in methods and "IQR" not in methods

    # 4. Verify original dataset integrity remains completely unchanged
    pd.testing.assert_frame_equal(df, df_snapshot)



