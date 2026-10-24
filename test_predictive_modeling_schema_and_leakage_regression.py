"""Comprehensive Regression Test Suite for Predictive Modeling:
Schema Consistency, Target Leakage Prevention, Holdout Evaluation Integrity,
and Cross-Schema Prediction Support.

Covers:
1. Dataset selection consistency (metadata, row/col count, target, feature alignment).
2. Target and duplicate-target leakage detection and exclusion.
3. Genuine perfect-fit (deterministic physical/math relationships) vs suspicious surrogate leakage.
4. Original vs cleaned/joined feature schema resolution at prediction time.
5. Reordered, extra, and missing columns handling (strict error without data fabrication).
6. Training and prediction with both CSV and Excel (.xlsx) files.
7. Artifact version consistency and existing workflows.
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

from app.database import Base, get_db
from app.main import app
from app.models.user import User
from app.models.dataset import Dataset
from app.models.prediction_run import PredictionRun
from app.auth.security import create_access_token

from prediction.problem_detector import ProblemDetector
from prediction.target_detector import TargetDetector
from prediction.feature_selector import FeatureSelector
from prediction.leakage_detector import LeakageDetector
from prediction.preprocessing import PreprocessingService
from prediction.regression import RegressionEngine
from prediction.classification import ClassificationEngine
from models.prediction import ProblemType

TEST_DB_PATH = PROJECT_ROOT / "test_prediction_schema_regression_tmp.db"
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
def setup_test_db():
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()

    user = User(
        id=888,
        username="qa_lead",
        email="qa@enterprise.ai",
        hashed_password="fakepassword",
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
    token = create_access_token(data={"sub": "888"})
    return {"Authorization": f"Bearer {token}"}


# =========================================================================
# TEST SUITE A: Target and Duplicate-Target Leakage
# =========================================================================
class TestLeakageDetectionAndPrevention:
    """Tests leakage detection for duplicate targets, self-join lookups, and proportional targets."""

    def test_target_duplicate_and_post_outcome_leakage_detected(self):
        # Synthetic dataset with exact target duplicate, joined target duplicate, and post-outcome column
        df = pd.DataFrame({
            "Quantity": [10, 20, 30, 40, 50, 60, 70, 80],
            "Quantity_clean_customer_orders (2)": [10, 20, 30, 40, 50, 60, 70, 80],
            "Unit_Price": [5.0, 4.0, 3.5, 6.0, 2.0, 8.0, 1.5, 4.5],
            "refund_amount": [0.0, 0.0, 5.0, 0.0, 10.0, 0.0, 0.0, 2.0],  # Post outcome
            "Region": ["North", "South", "East", "West", "North", "South", "East", "West"],
        })

        feature_cols = [c for c in df.columns if c != "Quantity"]
        leakage_report = LeakageDetector.detect_leakage(
            df=df,
            target_col="Quantity",
            feature_cols=feature_cols,
            problem_type=ProblemType.REGRESSION,
        )
        leaked_cols = list(leakage_report.flagged_features.keys())

        assert "Quantity_clean_customer_orders (2)" in leaked_cols
        assert "refund_amount" in leaked_cols

        # Ensure FeatureSelector removes them even if user explicitly selected them
        used, excluded, num, cat = FeatureSelector.select_features(
            df=df,
            target_col="Quantity",
            config={"features": {"selected_features": ["Quantity_clean_customer_orders (2)", "Unit_Price", "refund_amount", "Region"]}},
        )

        assert "Quantity_clean_customer_orders (2)" not in used
        assert "refund_amount" not in used
        assert "Unit_Price" in used
        assert "Region" in used

    def test_surrogate_entity_memorization_leakage(self):
        # A joined dataset where customer_name acts as 1:1 lookup for Quantity
        customers = [f"Cust_{i}" for i in range(20)]
        df = pd.DataFrame({
            "Customer_Name_clean_customer_orders (2)": customers,
            "Quantity": [i * 5 for i in range(20)],
            "Store_ID": ["Store_A", "Store_B"] * 10,
            "Discount": [0.05, 0.10] * 10,
        })

        feature_cols = [c for c in df.columns if c != "Quantity"]
        leakage_report = LeakageDetector.detect_leakage(
            df=df,
            target_col="Quantity",
            feature_cols=feature_cols,
            problem_type=ProblemType.REGRESSION,
        )
        leaked_cols = list(leakage_report.flagged_features.keys())

        assert "Customer_Name_clean_customer_orders (2)" in leaked_cols
        # Store_ID is low cardinality (2 categories across 20 rows) with variance, so not a surrogate entity
        assert "Store_ID" not in leaked_cols

    def test_genuine_continuous_relationship_not_falsely_flagged(self):
        # Non-identifier continuous numeric features with linear or physical law (e.g. Area = Length * Width)
        np.random.seed(42)
        length = np.random.uniform(5.0, 50.0, size=50)
        width = np.random.uniform(2.0, 20.0, size=50)
        area = length * width

        df = pd.DataFrame({
            "Length": length,
            "Width": width,
            "Area": area,
        })

        feature_cols = ["Length", "Width"]
        leakage_report = LeakageDetector.detect_leakage(
            df=df,
            target_col="Area",
            feature_cols=feature_cols,
            problem_type=ProblemType.REGRESSION,
        )
        leaked_cols = list(leakage_report.flagged_features.keys())

        # Valid predictive features must NOT be falsely flagged
        assert "Length" not in leaked_cols
        assert "Width" not in leaked_cols

        used, excluded, num, cat = FeatureSelector.select_features(df=df, target_col="Area")
        assert "Length" in used
        assert "Width" in used


# =========================================================================
# TEST SUITE B: Evaluation Integrity and Holdout Metrics
# =========================================================================
class TestEvaluationIntegrity:
    """Tests that holdout metrics are computed correctly, baseline is evaluated, and R2=1 audits trigger."""

    def test_baseline_and_independent_holdout_metrics(self):
        np.random.seed(123)
        feature1 = np.random.normal(10, 2, 100)
        feature2 = np.random.normal(50, 10, 100)
        target = 3.0 * feature1 + 0.5 * feature2 + np.random.normal(0, 1, 100)

        df = pd.DataFrame({
            "feature1": feature1,
            "feature2": feature2,
            "target": target,
        })

        res = RegressionEngine.train_and_evaluate(
            df=df,
            target_col="target",
            numeric_features=["feature1", "feature2"],
            categorical_features=[],
            test_size=0.20,
        )

        candidates, best_id, best_preds, y_val, best_est, feat_names = res

        # Ensure candidates include a baseline model
        model_names = [c.model_name for c in candidates]
        assert any("baseline" in name.lower() or "mean" in name.lower() for name in model_names)

        # Baseline model should have R2 close to 0 or negative
        baseline_cand = next(c for c in candidates if "baseline" in c.model_name.lower())
        assert baseline_cand.metrics.r2 is not None
        assert baseline_cand.metrics.r2 <= 0.1

        # Selected best model must beat baseline and not be baseline
        best_cand = next(c for c in candidates if c.model_id == best_id)
        assert best_cand.model_id != "baseline_mean"
        assert best_cand.metrics.r2 > baseline_cand.metrics.r2
        assert best_cand.metrics.rmse < baseline_cand.metrics.rmse

        # Independent holdout verification
        holdout_rmse = np.sqrt(np.mean((np.array(y_val) - np.array(best_preds)) ** 2))
        assert np.isclose(best_cand.metrics.rmse, holdout_rmse, atol=1e-3)

    def test_perfect_fit_audit_warning_when_r2_is_one(self):
        # A perfectly linear synthetic dataset
        x_vals = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]
        y_vals = [2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0, 18.0, 20.0]
        df = pd.DataFrame({"x": x_vals, "y": y_vals})

        res = RegressionEngine.train_and_evaluate(
            df=df,
            target_col="y",
            numeric_features=["x"],
            categorical_features=[],
            test_size=0.20,
        )

        candidates, best_id, best_preds, y_val, best_est, feat_names = res
        best_cand = next(c for c in candidates if c.model_id == best_id)
        assert np.isclose(best_cand.metrics.r2, 1.0, atol=1e-5)

        # Audit warning must record that R2=1.0 was achieved and inspected
        assert best_cand.warning is not None
        assert "R² = 1.0" in best_cand.warning or "perfect" in best_cand.warning.lower()


# =========================================================================
# TEST SUITE C: Dataset Consistency, Schema Resolution, and Prediction
# =========================================================================
@pytest.fixture
def test_data_paths(tmp_path):
    # 1. Training dataset with join suffix columns (simulating merged customer orders)
    train_df = pd.DataFrame({
        "Customer_ID": [f"C{i:03d}" for i in range(1, 61)],
        "Category": ["Electronics", "Clothing", "Home", "Books"] * 15,
        "Amount": [100.0 + i * 15.0 for i in range(1, 61)],
        "Discount": [0.05, 0.10, 0.15] * 20,
        "Quantity": [1 + (i % 5) for i in range(1, 61)],
        "Category_clean_customer_orders (2)": ["Electronics", "Clothing", "Home", "Books"] * 15,
        "Amount_clean_customer_orders (2)": [100.0 + i * 15.0 for i in range(1, 61)],
    })
    train_csv_path = tmp_path / "joined_orders_train.csv"
    train_df.to_csv(train_csv_path, index=False)

    # 2. Original schema file (clean_customer_orders (2).csv) without duplicate join columns
    orig_df = pd.DataFrame({
        "Customer_ID": ["C101", "C102", "C103", "C104"],
        "Category": ["Electronics", "Books", "Clothing", "Home"],
        "Amount": [150.0, 220.0, 310.0, 80.0],
        "Discount": [0.05, 0.10, 0.0, 0.15],
    })
    orig_csv_path = tmp_path / "clean_customer_orders (2).csv"
    orig_df.to_csv(orig_csv_path, index=False)

    orig_xlsx_path = tmp_path / "clean_customer_orders (2).xlsx"
    orig_df.to_excel(orig_xlsx_path, index=False)

    return {
        "train_csv": train_csv_path,
        "orig_csv": orig_csv_path,
        "orig_xlsx": orig_xlsx_path,
        "train_rows": len(train_df),
        "train_cols": len(train_df.columns),
    }


class TestDatasetAndSchemaConsistency:
    """Tests end-to-end dataset consistency, schema mapping, Excel/CSV support, and missing columns."""

    def test_dataset_consistency_and_inference_with_csv_and_excel(self, test_data_paths):
        db = TestingSessionLocal()
        dataset = Dataset(
            user_id=888,
            filename="joined_orders_train.csv",
            file_path=str(test_data_paths["train_csv"].resolve()),
            file_type="CSV",
            file_size_bytes=test_data_paths["train_csv"].stat().st_size,
            rows=test_data_paths["train_rows"],
            columns=test_data_paths["train_cols"],
        )
        db.add(dataset)
        db.commit()
        db.refresh(dataset)
        dataset_id = dataset.id
        db.close()

        headers = get_auth_headers()

        # Step 1: Analyze dataset
        resp_an = client.post("/api/prediction/analyze", headers=headers, json={"dataset_id": dataset_id, "mode": "regression"})
        assert resp_an.status_code == 200, resp_an.text
        an_json = resp_an.json()

        # Verify duplicate joined columns are flagged as duplicate role in columns_summary
        cols_summary = an_json["columns_summary"]
        dup_feats = [f for f in cols_summary if f["role"] == "duplicate"]
        assert len(dup_feats) > 0
        dup_names = [f["name"] for f in dup_feats]
        assert "Category_clean_customer_orders (2)" in dup_names or "Amount_clean_customer_orders (2)" in dup_names

        # Step 2: Train model
        resp_train = client.post(
            "/api/prediction/train",
            headers=headers,
            json={
                "dataset_id": dataset_id,
                "target_column": "Quantity",
                "mode": "regression",
                "test_size": 0.20,
            },
        )
        assert resp_train.status_code == 200, resp_train.text
        train_json = resp_train.json()
        run_id = train_json["run_id"]
        assert train_json["dataset_id"] == dataset_id
        assert train_json["dataset_name"] == "joined_orders_train.csv"

        # Verify run detail retains identical dataset metadata
        resp_run = client.get(f"/api/prediction/runs/{run_id}", headers=headers)
        assert resp_run.status_code == 200
        run_detail = resp_run.json()
        assert run_detail["dataset_id"] == dataset_id
        assert run_detail["dataset_name"] == "joined_orders_train.csv"

        # Step 3: Predict with original-schema CSV (without the _clean_customer_orders (2) suffixes)
        with open(test_data_paths["orig_csv"], "rb") as f:
            csv_bytes = f.read()

        resp_pred_csv = client.post(
            f"/api/prediction/runs/{run_id}/predict",
            headers=headers,
            files={"file": ("clean_customer_orders (2).csv", csv_bytes, "text/csv")},
        )
        assert resp_pred_csv.status_code == 200, resp_pred_csv.text
        pred_csv_json = resp_pred_csv.json()
        assert pred_csv_json["total_rows"] == 4
        assert len(pred_csv_json["predicted_rows"]) == 4
        for row in pred_csv_json["predicted_rows"]:
            assert "predicted_Quantity" in row
            assert row["predicted_Quantity"] is not None

        # Step 4: Predict with original-schema Excel (.xlsx) file
        with open(test_data_paths["orig_xlsx"], "rb") as f:
            xlsx_bytes = f.read()

        resp_pred_xlsx = client.post(
            f"/api/prediction/runs/{run_id}/predict",
            headers=headers,
            files={"file": ("clean_customer_orders (2).xlsx", xlsx_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        assert resp_pred_xlsx.status_code == 200, resp_pred_xlsx.text
        pred_xlsx_json = resp_pred_xlsx.json()
        assert pred_xlsx_json["total_rows"] == 4
        assert len(pred_xlsx_json["predicted_rows"]) == 4

        # Numerical predictions between CSV and Excel must match
        for r_csv, r_xlsx in zip(pred_csv_json["predicted_rows"], pred_xlsx_json["predicted_rows"]):
            assert np.isclose(r_csv["predicted_Quantity"], r_xlsx["predicted_Quantity"], atol=1e-4)

        # Step 5: Test reordered columns with extra unneeded columns (e.g. Notes, Rating)
        reordered_csv = (
            "Discount,Notes,Amount,Rating,Category\n"
            "0.10,Customer VIP,250.0,5.0,Electronics\n"
            "0.05,Returning,110.0,4.2,Books\n"
        ).encode("utf-8")

        resp_reordered = client.post(
            f"/api/prediction/runs/{run_id}/predict",
            headers=headers,
            files={"file": ("reordered_extra.csv", reordered_csv, "text/csv")},
        )
        assert resp_reordered.status_code == 200, resp_reordered.text
        resp_reordered_json = resp_reordered.json()
        assert resp_reordered_json["total_rows"] == 2
        assert len(resp_reordered_json["predicted_rows"]) == 2

        # Step 6: Test target column is NOT required for unseen data prediction
        no_target_csv = (
            "Customer_ID,Category,Amount,Discount\n"
            "C501,Electronics,120.0,0.05\n"
            "C502,Books,45.0,0.10\n"
        ).encode("utf-8")

        resp_no_target = client.post(
            f"/api/prediction/runs/{run_id}/predict",
            headers=headers,
            files={"file": ("unseen_no_target.csv", no_target_csv, "text/csv")},
        )
        assert resp_no_target.status_code == 200, resp_no_target.text
        assert resp_no_target.json()["total_rows"] == 2
        for row in resp_no_target.json()["predicted_rows"]:
            assert "predicted_Quantity" in row

        # Step 7: Test harmless naming differences (spaces, underscores, case normalization)
        spaces_case_csv = (
            "Customer ID,CATEGORY,amount,DISCOUNT\n"
            "C601,Clothing,180.0,0.15\n"
            "C602,Home,95.0,0.0\n"
        ).encode("utf-8")

        resp_norm = client.post(
            f"/api/prediction/runs/{run_id}/predict",
            headers=headers,
            files={"file": ("spaces_case.csv", spaces_case_csv, "text/csv")},
        )
        assert resp_norm.status_code == 200, resp_norm.text
        assert resp_norm.json()["total_rows"] == 2

        # Step 8: Test missing imputable column: absent column is handled by pipeline imputer with warning
        # Suppose 'Discount' is missing, but Category and Amount are present
        missing_imputable_csv = (
            "Customer_ID,Category,Amount\n"
            "C701,Books,50.0\n"
            "C702,Electronics,220.0\n"
        ).encode("utf-8")

        resp_imp = client.post(
            f"/api/prediction/runs/{run_id}/predict",
            headers=headers,
            files={"file": ("missing_imputable.csv", missing_imputable_csv, "text/csv")},
        )
        assert resp_imp.status_code == 200, resp_imp.text
        resp_imp_json = resp_imp.json()
        assert resp_imp_json["total_rows"] == 2
        # Pipeline must produce informative warning listing the imputed column
        assert len(resp_imp_json["warnings"]) > 0
        assert any("Discount" in w or "imputed" in w.lower() for w in resp_imp_json["warnings"])

        # Step 9: Genuinely incompatible columns (0 matching required features) -> returns HTTP 400
        incompatible_csv = (
            "Weather_Condition,Temperature_Celsius,Wind_Speed\n"
            "Sunny,28.5,12.0\n"
            "Rainy,19.2,25.0\n"
        ).encode("utf-8")

        resp_incompat = client.post(
            f"/api/prediction/runs/{run_id}/predict",
            headers=headers,
            files={"file": ("weather_data.csv", incompatible_csv, "text/csv")},
        )
        assert resp_incompat.status_code == 400
        error_detail = resp_incompat.json()["detail"]
        assert "incompatible" in error_detail.lower() or "none of the required" in error_detail.lower()

    def test_dataset_switching_consistency(self, test_data_paths):
        """Verifies switching datasets cleanly isolates metadata, runs, and prevents state contamination."""
        db = TestingSessionLocal()
        ds1 = Dataset(
            user_id=888,
            filename="dataset_alpha.csv",
            file_path=str(test_data_paths["train_csv"].resolve()),
            file_type="CSV",
            file_size_bytes=1000,
            rows=60,
            columns=7,
        )
        ds2 = Dataset(
            user_id=888,
            filename="dataset_beta.csv",
            file_path=str(test_data_paths["orig_csv"].resolve()),
            file_type="CSV",
            file_size_bytes=500,
            rows=4,
            columns=4,
        )
        db.add_all([ds1, ds2])
        db.commit()
        db.refresh(ds1)
        db.refresh(ds2)
        ds1_id = ds1.id
        ds2_id = ds2.id
        db.close()

        headers = get_auth_headers()

        # Analyze dataset 1
        resp1 = client.post("/api/prediction/analyze", headers=headers, json={"dataset_id": ds1_id, "mode": "regression"})
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert data1["dataset_id"] == ds1_id
        assert data1["total_rows"] == 60

        # Switch to dataset 2: analyze must return dataset 2's metadata without contamination
        resp2 = client.post("/api/prediction/analyze", headers=headers, json={"dataset_id": ds2_id, "mode": "regression"})
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["dataset_id"] == ds2_id
        assert data2["total_rows"] == 4
        assert data2["total_columns"] == 4

    def test_predict_clean_customer_orders_on_model_trained_with_income_and_email(self, tmp_path):
        """Validates that uploading clean_customer_orders (2).csv succeeds even if the selected
        trained model artifact includes annual_income_inr and email from a joined dataset.
        Absent features are imputed by the fitted ColumnTransformer, and customer/order predictors are mapped safely.
        """
        # 1. Dataset representing merged joined data (like dataset 9: joined_data_analyst_50_rows_clean_customer_orders__2_.csv)
        train_df = pd.DataFrame({
            "Customer_ID": [f"C{i:03d}" for i in range(1, 51)],
            "Age": [20 + (i % 40) for i in range(1, 51)],
            "City": ["Pune", "Mumbai", "Nagpur", "Nashik"] * 12 + ["Pune", "Mumbai"],
            "Gender": ["Male", "Female"] * 25,
            "Category": ["Electronics", "Clothing", "Books", "Home", "Sports"] * 10,
            "Order_Amount_INR": [500.0 + i * 25.0 for i in range(1, 51)],
            "annual_income_inr": [450000.0 + i * 10000.0 for i in range(1, 51)],
            "email": [f"user_{i}@domain.com" for i in range(1, 51)],
            "Quantity": [1 + (i % 6) for i in range(1, 51)],
        })
        train_csv = tmp_path / "joined_orders_income.csv"
        train_df.to_csv(train_csv, index=False)

        db = TestingSessionLocal()
        ds = Dataset(
            user_id=888,
            filename="joined_data_analyst_50_rows_clean_customer_orders__2_.csv",
            file_path=str(train_csv.resolve()),
            file_type="CSV",
            file_size_bytes=train_csv.stat().st_size,
            rows=len(train_df),
            columns=len(train_df.columns),
        )
        db.add(ds)
        db.commit()
        db.refresh(ds)
        ds_id = ds.id
        db.close()

        headers = get_auth_headers()

        # Train model with Quantity as target
        resp_train = client.post(
            "/api/prediction/train",
            headers=headers,
            json={
                "dataset_id": ds_id,
                "target_column": "Quantity",
                "mode": "regression",
                "test_size": 0.20,
            },
        )
        assert resp_train.status_code == 200, resp_train.text
        run_data = resp_train.json()
        run_id = run_data["run_id"]

        # 2. Upload clean_customer_orders (2).csv which has Customer_ID, Customer_Name, Age, City, Gender, Category, Quantity
        # but LACKS annual_income_inr and email!
        unseen_orders_df = pd.DataFrame({
            "Customer_ID": ["C901", "C902", "C903"],
            "Customer_Name": ["Alice Smith", "Bob Jones", "Charlie Brown"],
            "Age": [29, 45, 33],
            "City": ["Pune", "Mumbai", "Nagpur"],
            "Gender": ["Female", "Male", "Male"],
            "Category": ["Electronics", "Books", "Home"],
            "Quantity": [2, 5, 1],  # Original file has Quantity, but should not be required or cause issues
            "Order_Amount_INR": [1200.0, 350.0, 890.0],
        })
        unseen_csv_bytes = unseen_orders_df.to_csv(index=False).encode("utf-8")

        resp_pred = client.post(
            f"/api/prediction/runs/{run_id}/predict",
            headers=headers,
            files={"file": ("clean_customer_orders (2).csv", unseen_csv_bytes, "text/csv")},
        )
        assert resp_pred.status_code == 200, resp_pred.text
        pred_json = resp_pred.json()

        assert pred_json["total_rows"] == 3
        assert len(pred_json["predicted_rows"]) == 3

        # Every row receives a predicted_Quantity
        for row in pred_json["predicted_rows"]:
            assert "predicted_Quantity" in row
            assert row["predicted_Quantity"] is not None
            # Customer/order features are preserved
            assert row["Customer_ID"] in ["C901", "C902", "C903"]
            assert row["Category"] in ["Electronics", "Books", "Home"]

        # Notice/warning that annual_income_inr or email were imputed
        assert len(pred_json["warnings"]) > 0
        warning_text = " ".join(pred_json["warnings"])
        assert "annual_income_inr" in warning_text or "imputed" in warning_text

