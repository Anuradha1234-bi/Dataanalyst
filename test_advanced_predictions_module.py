"""Comprehensive Automated Test Suite for Advanced Predictions Module.

Tests:
1. Pre-flight dataset analysis and leakage detection.
2. Supervised Regression model training, evaluation metrics, and uncertainty intervals.
3. Binary and Multiclass Classification with confusion matrix and balanced metrics.
4. Time-series Forecasting with chronological train/val splits and naive/moving-average baselines.
5. Strict Data Leakage Prevention (target-derived variables & identifiers excluded).
6. Safe Handling of missing values, categorical encoding, and constant targets.
7. Predict on new unseen data using fitted scikit-learn pipeline artifact.
8. Incompatible schema validation on new prediction data.
9. Database persistence, retrieval of actual saved history, and run deletion.
10. Downloadable CSV and Markdown evaluation report generation.
"""

import io
import os
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

PROJECT_ROOT = Path(__file__).resolve().parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.user import User
from app.models.dataset import Dataset
from app.models.prediction_run import PredictionRun
from app.auth.security import create_access_token
from app.services.prediction_service import PredictionService
from app.schemas.prediction import (
    AnalyzeDatasetRequest,
    PredictionTrainRequest,
)

# Test SQLite in-memory / temporary database
TEST_DB_PATH = PROJECT_ROOT / "test_prediction_tmp.db"
test_engine = create_engine(f"sqlite:///{TEST_DB_PATH.as_posix()}", connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_test_database():
    """Setup clean tables and sample user for testing."""
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()

    # Create test user
    user = User(
        id=999,
        username="predict_tester",
        email="tester@example.com",
        hashed_password="fakehashedpassword",
        role="analyst",
        is_active=True,
    )
    db.merge(user)
    db.commit()
    db.close()

    yield

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
    if TEST_DB_PATH.exists():
        try:
            TEST_DB_PATH.unlink()
        except Exception:
            pass


def get_auth_headers():
    token = create_access_token(data={"sub": "999"})
    return {"Authorization": f"Bearer {token}"}


def create_temp_dataset(db, filename: str, df: pd.DataFrame) -> Dataset:
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    file_path = settings.UPLOAD_DIR / filename
    df.to_csv(file_path, index=False)

    ds = Dataset(
        user_id=999,
        filename=filename,
        file_type="csv",
        file_path=str(file_path),
        rows=len(df),
        columns=len(df.columns),
        file_size_bytes=os.path.getsize(file_path),
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return ds


def test_prediction_status_and_models():
    """Test /api/prediction/status and /api/prediction/models endpoints."""
    headers = get_auth_headers()

    resp_status = client.get("/api/prediction/status", headers=headers)
    assert resp_status.status_code == 200
    assert resp_status.json()["status"] == "ready"

    resp_models = client.get("/api/prediction/models", headers=headers)
    assert resp_models.status_code == 200
    models = resp_models.json()
    assert len(models) >= 10
    model_ids = [m["id"] for m in models]
    assert "linear_regression" in model_ids
    assert "ridge_regression" in model_ids
    assert "lasso_regression" in model_ids
    assert "rf_regression" in model_ids
    assert "logistic_regression" in model_ids
    assert "naive" in model_ids


def test_regression_pipeline_and_leakage():
    """Test regression pre-flight analysis, data leakage exclusion, training, and metrics."""
    db = TestingSessionLocal()
    np.random.seed(42)
    n = 120

    # Dataset with intentional leakage column (exact copy + near perfect correlation)
    sales = np.random.uniform(100, 1000, size=n)
    df = pd.DataFrame({
        "id": range(1, n + 1),
        "ad_spend": np.random.uniform(10, 50, size=n),
        "store_size": np.random.choice(["Small", "Medium", "Large"], size=n),
        "sales_copy": sales.copy(),  # 100% circular leakage
        "future_refund": np.random.uniform(0, 10, size=n),  # Post-outcome indicator
        "sales": sales,
    })

    ds = create_temp_dataset(db, "test_regression.csv", df)
    headers = get_auth_headers()

    # 1. Analyze dataset
    analyze_resp = client.post(
        "/api/prediction/analyze",
        json={"dataset_id": ds.id, "mode": "regression", "target_column": "sales"},
        headers=headers,
    )
    assert analyze_resp.status_code == 200
    analyze_data = analyze_resp.json()
    assert analyze_data["dataset_id"] == ds.id
    assert analyze_data["recommended_target"] == "sales"
    assert analyze_data["suitability"]["is_suitable"] is True
    assert analyze_data["suitability"]["has_leakage"] is True
    assert "sales_copy" in analyze_data["suitability"]["flagged_leakage_features"]

    # 2. Train model
    train_resp = client.post(
        "/api/prediction/train",
        json={
            "dataset_id": ds.id,
            "target_column": "sales",
            "mode": "regression",
            "test_size": 0.20,
        },
        headers=headers,
    )
    assert train_resp.status_code == 200
    train_data = train_resp.json()

    assert train_data["task_type"] == "regression"
    assert train_data["target_column"] == "sales"
    assert "sales_copy" in train_data["features_excluded"]  # Leakage prevented!
    assert "future_refund" in train_data["features_excluded"]  # Post-outcome excluded!
    assert "ad_spend" in train_data["features_used"]
    assert "store_size" in train_data["features_used"]
    assert train_data["train_rows"] == 96
    assert train_data["validation_rows"] == 24
    assert "mae" in train_data["metrics"]
    assert "rmse" in train_data["metrics"]
    assert "r2" in train_data["metrics"]
    assert len(train_data["predictions"]) > 0
    assert len(train_data["model_comparison"]) >= 4

    run_id = train_data["run_id"]

    # 3. Test New Data Prediction
    new_test_df = pd.DataFrame({
        "ad_spend": [25.0, 45.0],
        "store_size": ["Medium", "Large"],
    })
    csv_bytes = io.BytesIO(new_test_df.to_csv(index=False).encode("utf-8"))
    predict_resp = client.post(
        f"/api/prediction/runs/{run_id}/predict",
        files={"file": ("new_input.csv", csv_bytes, "text/csv")},
        headers=headers,
    )
    assert predict_resp.status_code == 200
    pred_data = predict_resp.json()
    assert pred_data["total_rows"] == 2
    assert "predicted_sales" in pred_data["predicted_column_name"]
    assert len(pred_data["predicted_rows"]) == 2
    assert "predicted_sales" in pred_data["predicted_rows"][0]
    assert isinstance(pred_data["predicted_rows"][0]["predicted_sales"], (float, int))

    # 4. Test Incompatible Schema on New Prediction Data
    bad_df = pd.DataFrame({"unrelated_col": [1, 2]})
    bad_bytes = io.BytesIO(bad_df.to_csv(index=False).encode("utf-8"))
    bad_resp = client.post(
        f"/api/prediction/runs/{run_id}/predict",
        files={"file": ("bad_input.csv", bad_bytes, "text/csv")},
        headers=headers,
    )
    assert bad_resp.status_code == 400
    assert "missing required predictor columns" in bad_resp.json()["detail"].lower()

    # 5. Test Download CSV and Report
    csv_export_resp = client.get(f"/api/prediction/runs/{run_id}/export/csv", headers=headers)
    assert csv_export_resp.status_code == 200
    assert "predicted_sales" in csv_export_resp.text

    report_export_resp = client.get(f"/api/prediction/runs/{run_id}/export/report", headers=headers)
    assert report_export_resp.status_code == 200
    assert "Machine Learning Evaluation Report" in report_export_resp.text

    db.close()


def test_classification_binary_and_multiclass():
    """Test classification with confusion matrix, F1, Accuracy, and class metrics."""
    db = TestingSessionLocal()
    np.random.seed(42)
    n = 150

    # Binary Classification Dataset
    df_binary = pd.DataFrame({
        "age": np.random.randint(18, 70, size=n),
        "income": np.random.uniform(20000, 120000, size=n),
        "contract": np.random.choice(["Month-to-month", "One year", "Two year"], size=n),
        "churn": np.random.choice(["Yes", "No"], size=n, p=[0.35, 0.65]),
    })

    ds_bin = create_temp_dataset(db, "test_churn.csv", df_binary)
    headers = get_auth_headers()

    train_bin_resp = client.post(
        "/api/prediction/train",
        json={
            "dataset_id": ds_bin.id,
            "target_column": "churn",
            "mode": "classification",
            "test_size": 0.20,
        },
        headers=headers,
    )
    assert train_bin_resp.status_code == 200
    bin_data = train_bin_resp.json()
    assert bin_data["task_type"] == "classification"
    assert "accuracy" in bin_data["metrics"]
    assert "f1" in bin_data["metrics"]
    assert "confusion_matrix" in bin_data["metrics"]
    cm = bin_data["metrics"]["confusion_matrix"]
    assert len(cm["labels"]) == 2
    assert len(cm["matrix"]) == 2

    # Multiclass Classification Dataset
    df_multi = pd.DataFrame({
        "feature_1": np.random.normal(0, 1, size=n),
        "feature_2": np.random.normal(5, 2, size=n),
        "category": np.random.choice(["Tier_A", "Tier_B", "Tier_C"], size=n),
        "grade": np.random.choice(["High", "Medium", "Low"], size=n),
    })
    ds_multi = create_temp_dataset(db, "test_multiclass.csv", df_multi)

    train_multi_resp = client.post(
        "/api/prediction/train",
        json={
            "dataset_id": ds_multi.id,
            "target_column": "grade",
            "mode": "classification",
            "candidate_model": "rf_classification",
            "test_size": 0.20,
        },
        headers=headers,
    )
    assert train_multi_resp.status_code == 200
    multi_data = train_multi_resp.json()
    assert multi_data["selected_model"] == "Random Forest Classifier"
    assert len(multi_data["metrics"]["confusion_matrix"]["labels"]) == 3

    db.close()


def test_time_series_forecasting():
    """Test time-series forecasting with chronological validation and future projection."""
    db = TestingSessionLocal()
    np.random.seed(42)
    n = 90
    dates = pd.date_range("2024-01-01", periods=n, freq="D")
    demand = 50 + np.cumsum(np.random.normal(0.5, 2.0, size=n))

    df_ts = pd.DataFrame({
        "timestamp": dates.strftime("%Y-%m-%d"),
        "demand": demand,
    })

    ds_ts = create_temp_dataset(db, "test_demand_ts.csv", df_ts)
    headers = get_auth_headers()

    # Pre-flight check
    ana_resp = client.post(
        "/api/prediction/analyze",
        json={"dataset_id": ds_ts.id, "mode": "forecasting", "target_column": "demand", "date_column": "timestamp"},
        headers=headers,
    )
    assert ana_resp.status_code == 200
    ana_data = ana_resp.json()
    assert len(ana_data["date_candidates"]) > 0

    # Train forecasting
    train_ts_resp = client.post(
        "/api/prediction/train",
        json={
            "dataset_id": ds_ts.id,
            "target_column": "demand",
            "date_column": "timestamp",
            "mode": "forecasting",
            "forecast_horizon": 14,
            "test_size": 0.20,
        },
        headers=headers,
    )
    assert train_ts_resp.status_code == 200
    ts_data = train_ts_resp.json()
    assert ts_data["task_type"] == "time_series"
    assert ts_data["forecast_horizon"] == 14
    assert len(ts_data["predictions"]) == 14
    first_pt = ts_data["predictions"][0]
    assert first_pt["lower_bound"] is not None
    assert first_pt["upper_bound"] is not None
    assert first_pt["lower_bound"] <= first_pt["predicted_value"] <= first_pt["upper_bound"]

    # 1. Validation predictions verification (Proposal 1)
    assert "validation_predictions" in ts_data
    val_preds = ts_data["validation_predictions"]
    assert len(val_preds) == ts_data["validation_rows"]
    assert len(val_preds) > 0
    first_val = val_preds[0]
    assert first_val["actual_value"] is not None
    assert first_val["predicted_value"] is not None
    assert first_val["absolute_error"] is not None
    assert abs(first_val["absolute_error"] - abs(first_val["actual_value"] - first_val["predicted_value"])) < 1e-4
    if abs(first_val["actual_value"]) > 1e-9:
        assert first_val["percentage_error"] is not None

    # 2. CSV Export check (must contain validation_holdout and future_forecast records)
    run_id = ts_data["run_id"]
    csv_resp = client.get(f"/api/prediction/runs/{run_id}/export/csv", headers=headers)
    assert csv_resp.status_code == 200
    csv_text = csv_resp.text
    assert "validation_holdout" in csv_text
    assert "future_forecast" in csv_text
    assert "absolute_error" in csv_text

    # 3. Report Export check (must contain Validation Holdout and Future Horizon sections)
    report_resp = client.get(f"/api/prediction/runs/{run_id}/export/report", headers=headers)
    assert report_resp.status_code == 200
    report_text = report_resp.text
    assert "Validation Holdout (Actual vs Predicted)" in report_text
    assert "Future Horizon Projections" in report_text

    # History listing check
    history_resp = client.get("/api/prediction/runs", headers=headers)
    assert history_resp.status_code == 200
    history = history_resp.json()
    assert len(history) >= 3

    # Delete run
    del_resp = client.delete(f"/api/prediction/runs/{run_id}", headers=headers)
    assert del_resp.status_code == 200
    assert del_resp.json()["status"] == "deleted"

    db.close()


def test_proposal_1_validation_holdout_and_zero_handling():
    """Verify holdout validation records with zero actual values safely compute percentage error as None."""
    db = TestingSessionLocal()
    np.random.seed(42)
    n = 60
    dates = pd.date_range("2025-01-01", periods=n, freq="D")
    vals = [10.0] * 48 + [0.0] * 6 + [20.0] * 6  # contains zero actual values in holdout
    df_zero = pd.DataFrame({"order_date": dates.strftime("%Y-%m-%d"), "amount": vals})
    ds = create_temp_dataset(db, "test_zero_handling.csv", df_zero)
    headers = get_auth_headers()

    train_resp = client.post(
        "/api/prediction/train",
        json={
            "dataset_id": ds.id,
            "target_column": "amount",
            "date_column": "order_date",
            "mode": "forecasting",
            "forecast_horizon": 5,
            "test_size": 0.20,
        },
        headers=headers,
    )
    assert train_resp.status_code == 200
    data = train_resp.json()
    assert "validation_predictions" in data
    assert len(data["validation_predictions"]) == data["validation_rows"]

    # Verify zero actual rows have percentage_error as None (N/A) without division error
    zero_rows = [p for p in data["validation_predictions"] if p["actual_value"] == 0.0]
    assert len(zero_rows) > 0
    for zr in zero_rows:
        assert zr["percentage_error"] is None
        assert zr["absolute_error"] is not None

    db.close()


def test_invalid_target_and_empty_dataset_guards():
    """Verify system returns clean validation errors on invalid inputs."""
    db = TestingSessionLocal()
    headers = get_auth_headers()

    df_valid = pd.DataFrame({"val": [10, 20, 30]})
    ds = create_temp_dataset(db, "test_guards.csv", df_valid)

    # 1. Non-existent target column
    bad_target_resp = client.post(
        "/api/prediction/train",
        json={"dataset_id": ds.id, "target_column": "ghost_column"},
        headers=headers,
    )
    assert bad_target_resp.status_code == 400
    assert "invalid or not found" in bad_target_resp.json()["detail"].lower()

    # 2. Dataset with 0 variance / constant target
    df_constant = pd.DataFrame({
        "feat1": [1, 2, 3, 4, 5],
        "constant_target": [42, 42, 42, 42, 42],
    })
    ds_const = create_temp_dataset(db, "test_const.csv", df_constant)
    const_resp = client.post(
        "/api/prediction/train",
        json={"dataset_id": ds_const.id, "target_column": "constant_target"},
        headers=headers,
    )
    assert const_resp.status_code == 400
    assert "not suitable" in const_resp.json()["detail"].lower()

    db.close()
