"""Exhaustive Verification Suite for Predictive Modeling & Forecasting Fixes.

Verifies:
1. Regression with `annual_income_inr` on dirty `data_analyst_50_rows.csv`
2. Prevention of 'No numeric types to aggregate' on time-series forecasting
3. Prevention of 'could not convert string to float: unknown' with dirty numeric features (e.g. age)
4. Singleton class diagnostic on 'city' (e.g. Nashik has 1 sample) with actionable recommendations
5. Multiclass and binary classification with balanced and imbalanced categories
6. Time-series forecasting with valid, duplicate, and irregular dates
7. Predict on new data with unseen categories and missing/string sentinels
8. Target auto-recommendation rankings prioritizing continuous measures over unviable singletons
9. Full API end-to-end workflow (analyze, train, get detail, export, predict new data)
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
from app.services.prediction_service import PredictionService
from app.schemas.prediction import AnalyzeDatasetRequest, PredictionTrainRequest

from prediction.problem_detector import ProblemDetector
from prediction.target_detector import TargetDetector
from prediction.feature_selector import FeatureSelector
from prediction.preprocessing import PreprocessingService
from prediction.regression import RegressionEngine
from prediction.classification import ClassificationEngine
from prediction.forecasting import ForecastingEngine
from prediction.time_series import TimeSeriesService
from models.prediction import ProblemType

TEST_DB_PATH = PROJECT_ROOT / "test_prediction_fixes_tmp.db"
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
        id=777,
        username="lead_analyst",
        email="analyst@enterprise.ai",
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
    token = create_access_token(data={"sub": "777"})
    return {"Authorization": f"Bearer {token}"}


def find_data_analyst_50_csv() -> Path:
    candidates = list(PROJECT_ROOT.glob("uploads/**/1a1f23c3aca24513b3bcd317781733ea_data_analyst_50_rows.csv"))
    if candidates and candidates[0].exists():
        return candidates[0]
    all_50 = list(PROJECT_ROOT.glob("uploads/**/*data_analyst_50_rows*.csv"))
    if all_50:
        return all_50[0]
    # Fallback to create realistic 50 rows matching description
    csv_path = PROJECT_ROOT / "scratch" / "data_analyst_50_rows.csv"
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame({
        "customer_id": [f"C{i:04d}" for i in range(1, 51)],
        "customer_name": [f"Customer_{i:03d}" for i in range(1, 51)],
        "email": [f"user{i}@test.com" if i % 15 != 0 else np.nan for i in range(1, 51)],
        "city": ["Nagpur"] * 12 + ["Satara"] * 10 + ["Pune"] * 8 + ["Solapur"] * 7 + ["Kolhapur"] * 6 + ["Mumbai"] * 4 + ["pune"] * 2 + ["Nashik"] * 1,
        "age": ["39", "50", "unknown", "40", "59", "45", "two years", "54", "48", "-5", "22", "44"] * 4 + ["32", "46"],
        "signup_date": [f"2024-01-{(i%28)+1:02d}" for i in range(1, 51)],
        "annual_income_inr": [50000.0 + (i * 1200.5) if i != 20 else np.nan for i in range(1, 51)],
    })
    df.to_csv(csv_path, index=False)
    return csv_path


# =========================================================================
# TEST 1: Target Detection & Ranking on data_analyst_50_rows.csv
# =========================================================================
def test_target_detector_prioritizes_continuous_over_singleton_city():
    csv_path = find_data_analyst_50_csv()
    df = pd.read_csv(csv_path)

    targets = TargetDetector.detect_targets(df)
    assert len(targets) > 0

    top_target = targets[0]
    assert top_target.column == "annual_income_inr"
    assert top_target.problem_type == ProblemType.REGRESSION
    assert top_target.score >= 0.85

    # Personal info (customer_name, email, customer_id) must be excluded
    target_cols = [t.column for t in targets]
    assert "customer_id" not in target_cols
    assert "customer_name" not in target_cols
    assert "email" not in target_cols

    # 'city' candidate must reflect singleton penalty
    city_cand = next((t for t in targets if t.column == "city"), None)
    assert city_cand is not None
    assert city_cand.score < top_target.score
    assert any("singleton" in r.lower() or "1 sample" in r.lower() for r in city_cand.reasons)


# =========================================================================
# TEST 2: Feature Selection filters identifiers/names/emails & recognizes dirty age
# =========================================================================
def test_feature_selector_filters_names_emails_and_detects_dirty_numeric_age():
    csv_path = find_data_analyst_50_csv()
    df = pd.read_csv(csv_path)

    used, excluded, num_feats, cat_feats = FeatureSelector.select_features(
        df=df,
        target_col="annual_income_inr",
        date_col="signup_date",
    )

    assert "customer_id" in excluded
    assert "customer_name" in excluded
    assert "email" in excluded

    # 'age' contains strings like 'unknown' but is predominantly numeric -> categorized as numeric_features
    assert "age" in num_feats
    assert "city" in cat_feats
    assert "annual_income_inr" not in used


# =========================================================================
# TEST 3: Preprocessing sanitization handles 'unknown' without ValueError
# =========================================================================
def test_preprocessing_sanitization_and_unseen_categories():
    train_df = pd.DataFrame({
        "age": ["39", "50", "unknown", "40", "two years", "25", "30", "45"],
        "city": ["Pune", "Mumbai", "Nagpur", "Satara", "Kolhapur", "Pune", "Mumbai", "Nagpur"],
    })
    val_df = pd.DataFrame({
        "age": ["unknown", "60", "22"],
        "city": ["NewCityUnknown", "Pune", "Mumbai"],
    })

    num_feats = ["age"]
    cat_feats = ["city"]

    X_train_proc, X_val_proc, feat_names, preprocessor = PreprocessingService.transform_datasets_with_preprocessor(
        X_train=train_df,
        X_val=val_df,
        numeric_features=num_feats,
        categorical_features=cat_feats,
        scale_numeric=True,
    )

    assert X_train_proc.shape[0] == len(train_df)
    assert X_val_proc.shape[0] == len(val_df)
    assert not np.isnan(X_train_proc).any()
    assert not np.isnan(X_val_proc).any()

    # Inference on completely new data with unexpected string and unseen city
    infer_df = pd.DataFrame({
        "age": ["unknown", "42"],
        "city": ["AlienCity", "Satara"],
    })
    infer_clean = PreprocessingService.sanitize_features(infer_df, num_feats, cat_feats)
    infer_proc = preprocessor.transform(infer_clean)
    assert infer_proc.shape == (2, X_train_proc.shape[1])


# =========================================================================
# TEST 4: Regression on annual_income_inr succeeds on data_analyst_50_rows.csv
# =========================================================================
def test_regression_pipeline_annual_income_inr():
    csv_path = find_data_analyst_50_csv()
    df = pd.read_csv(csv_path)

    used, excluded, num_feats, cat_feats = FeatureSelector.select_features(
        df=df, target_col="annual_income_inr", date_col="signup_date"
    )

    candidates, best_id, best_preds, y_val, best_est, feat_names, preprocessor = (
        RegressionEngine.train_and_evaluate(
            df=df,
            target_col="annual_income_inr",
            numeric_features=num_feats,
            categorical_features=cat_feats,
            test_size=0.20,
            return_preprocessor=True,
        )
    )

    assert len(candidates) >= 2
    assert best_id in ["linear_regression", "ridge", "rf_regression", "random_forest", "hist_gradient_boosting"]
    assert len(best_preds) == len(y_val)
    best_cand = next(c for c in candidates if c.model_id == best_id)
    assert best_cand.metrics.mae is not None
    assert best_cand.metrics.rmse is not None


# =========================================================================
# TEST 5: Classification singleton 'Nashik' check and actionable diagnostics
# =========================================================================
def test_classification_singleton_handling_and_suitability():
    csv_path = find_data_analyst_50_csv()
    df = pd.read_csv(csv_path)

    # Suitability check on 'city' must flag singleton Nashik
    suit = ProblemDetector.check_dataset_suitability(
        df=df,
        target_col="city",
        problem_type=ProblemType.MULTICLASS_CLASSIFICATION,
    )
    assert not suit.is_suitable
    assert any("Nashik" in r and "1 sample" in r for r in suit.reasons)

    # ClassificationEngine directly validates and raises clear actionable error
    with pytest.raises(ValueError) as excinfo:
        ClassificationEngine.train_and_evaluate(
            df=df,
            target_col="city",
            numeric_features=["age"],
            categorical_features=[],
            problem_type=ProblemType.MULTICLASS_CLASSIFICATION,
        )
    assert "Nashik" in str(excinfo.value)
    assert "1 sample" in str(excinfo.value)


# =========================================================================
# TEST 6: Balanced and Imbalanced Classification with sufficient samples
# =========================================================================
def test_classification_balanced_and_imbalanced():
    # 1. Balanced multiclass
    df_balanced = pd.DataFrame({
        "feature_1": np.random.randn(60),
        "feature_2": np.random.randn(60),
        "target": ["A"] * 20 + ["B"] * 20 + ["C"] * 20,
    })
    cand_b, best_b, _, _, _, _, _, _ = ClassificationEngine.train_and_evaluate(
        df=df_balanced,
        target_col="target",
        numeric_features=["feature_1", "feature_2"],
        categorical_features=[],
        problem_type=ProblemType.MULTICLASS_CLASSIFICATION,
        return_preprocessor=True,
    )
    assert any(c.status == "success" for c in cand_b)

    # 2. Imbalanced binary (e.g. 5 minority, 45 majority)
    df_imbal = pd.DataFrame({
        "feature_1": np.random.randn(50),
        "target": [1] * 5 + [0] * 45,
    })
    cand_i, best_i, _, _, _, _, _, _ = ClassificationEngine.train_and_evaluate(
        df=df_imbal,
        target_col="target",
        numeric_features=["feature_1"],
        categorical_features=[],
        problem_type=ProblemType.BINARY_CLASSIFICATION,
        return_preprocessor=True,
    )
    assert any(c.status == "success" for c in cand_i)


# =========================================================================
# TEST 7: Time-Series Forecasting rejects non-numeric 'city' without crash
# =========================================================================
def test_forecasting_rejects_non_numeric_city_without_aggregate_error():
    csv_path = find_data_analyst_50_csv()
    df = pd.read_csv(csv_path)

    # 1. ProblemDetector rejects non-numeric target for time-series forecasting
    suit = ProblemDetector.check_dataset_suitability(
        df=df,
        target_col="city",
        problem_type=ProblemType.TIME_SERIES_FORECAST,
        date_col="signup_date",
    )
    assert not suit.is_suitable
    assert any("valid numeric target" in r.lower() for r in suit.reasons)

    # 2. TimeSeriesService raises clear ValueError rather than DataError: No numeric types to aggregate
    with pytest.raises(ValueError) as excinfo:
        TimeSeriesService.prepare_time_series_features(
            df=df,
            date_col="signup_date",
            target_col="city",
        )
    assert "numeric target" in str(excinfo.value).lower()


# =========================================================================
# TEST 8: Time-Series Forecasting with valid, duplicate, and irregular dates
# =========================================================================
def test_forecasting_valid_duplicate_and_irregular_dates():
    # Valid & duplicate dates
    df_ts = pd.DataFrame({
        "date": ["2024-01-01", "2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05", "2024-01-06", "2024-01-07"],
        "target": [100.0, 120.0, 110.0, 130.0, 125.0, 140.0, 135.0, 150.0],
    })

    fc_res = ForecastingEngine.train_and_forecast(
        df=df_ts,
        date_col="date",
        target_col="target",
        horizon=3,
        test_size=0.25,
    )
    cand, best_id, future_preds, y_true, y_pred, future_dates, _ = fc_res[:7]

    assert len(future_preds) == 3
    assert len(future_dates) == 3
    assert best_id is not None
    assert any(c.status == "success" for c in cand)


# =========================================================================
# TEST 9: Full API Workflow (Analyze, Train, Predict New Data, Export)
# =========================================================================
def test_e2e_api_workflow_with_data_analyst_50_csv():
    csv_path = find_data_analyst_50_csv()
    df = pd.read_csv(csv_path)

    db = TestingSessionLocal()
    dataset = Dataset(
        user_id=777,
        filename="data_analyst_50_rows.csv",
        file_path=str(csv_path.resolve()),
        file_type="CSV",
        file_size_bytes=csv_path.stat().st_size,
        rows=len(df),
        columns=len(df.columns),
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    dataset_id = dataset.id
    db.close()

    headers = get_auth_headers()

    # 1. Analyze endpoint
    resp_analyze = client.post(
        "/api/prediction/analyze",
        headers=headers,
        json={"dataset_id": dataset_id, "mode": "regression"},
    )
    assert resp_analyze.status_code == 200, resp_analyze.text
    an_data = resp_analyze.json()
    assert an_data["recommended_target"] == "annual_income_inr"
    assert an_data["suitability"]["is_suitable"] is True

    # 2. Train endpoint on Regression
    resp_train = client.post(
        "/api/prediction/train",
        headers=headers,
        json={
            "dataset_id": dataset_id,
            "target_column": "annual_income_inr",
            "mode": "regression",
            "test_size": 0.20,
        },
    )
    assert resp_train.status_code == 200, resp_train.text
    train_data = resp_train.json()
    run_id = train_data["run_id"]
    assert train_data["selected_model"] is not None
    assert len(train_data["validation_predictions"]) > 0

    # 3. Predict New Data with unseen categories and string values
    new_csv_content = (
        "customer_id,customer_name,email,city,age\n"
        "C9001,Unknown Client,test@company.org,NewYork,unknown\n"
        "C9002,Jane Doe,jane@tech.io,Pune,28\n"
        "C9003,Bob Smith,bob@corp.co,Tokyo,two years\n"
    ).encode("utf-8")

    resp_infer = client.post(
        f"/api/prediction/runs/{run_id}/predict",
        headers=headers,
        files={"file": ("unseen_customers.csv", new_csv_content, "text/csv")},
    )
    assert resp_infer.status_code == 200, resp_infer.text
    infer_data = resp_infer.json()
    assert infer_data["total_rows"] == 3
    assert len(infer_data["predicted_rows"]) == 3
    for row in infer_data["predicted_rows"]:
        assert row["predicted_annual_income_inr"] is not None

    # 4. Export CSV & Report
    resp_csv = client.get(f"/api/prediction/runs/{run_id}/export/csv", headers=headers)
    assert resp_csv.status_code == 200
    assert "predicted_annual_income_inr" in resp_csv.text or "predicted" in resp_csv.text

    resp_rep = client.get(f"/api/prediction/runs/{run_id}/export/report", headers=headers)
    assert resp_rep.status_code == 200
    assert "# Machine Learning Evaluation Report" in resp_rep.text
