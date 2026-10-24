"""Core Prediction Engine Orchestrator.

Coordinates dataset suitability diagnostics, Phase 4 anomaly filtering choices,
feature preparation, algorithm training, validation evaluation, uncertainty
interval construction, and grounded explanation synthesis.
"""

from typing import Dict, Any, List, Optional, Tuple, Callable
import pandas as pd
import numpy as np

from models.prediction import (
    PredictionMode,
    ProblemType,
    PredictionResult,
    PredictionPoint,
    ModelEvaluationMetrics,
    ModelCandidateResult,
    FeatureImportanceItem,
)
from prediction.config import normalize_prediction_config
from prediction.target_detector import TargetDetector
from prediction.problem_detector import ProblemDetector
from prediction.feature_selector import FeatureSelector
from prediction.forecasting import ForecastingEngine
from prediction.regression import RegressionEngine
from prediction.classification import ClassificationEngine
from prediction.uncertainty import UncertaintyService
from prediction.feature_importance import FeatureImportanceService
from prediction.explanation import ExplanationService


class PredictionEngine:
    """Master engine executing end-to-end predictive analysis and forecasting."""

    @classmethod
    def execute_prediction(
        cls,
        df: pd.DataFrame,
        dataset_name: str = "dataset.csv",
        target_col: Optional[str] = None,
        date_col: Optional[str] = None,
        mode: str = "auto",
        horizon: int = 7,
        config: Optional[Dict[str, Any]] = None,
        exclude_anomalies: bool = False,
        anomaly_indices: Optional[List[Any]] = None,
        progress_callback: Optional[Callable[[str, int], None]] = None,
    ) -> PredictionResult:
        """Run the complete Phase 5 pipeline and return a structured PredictionResult."""
        cfg = normalize_prediction_config(config)

        def report_stage(msg: str, step: int):
            if progress_callback:
                try:
                    progress_callback(msg, step)
                except Exception:
                    pass

        report_stage("Diagnosing dataset and detecting target candidates...", 10)

        if df is None or df.empty:
            return PredictionResult(
                status="unsuitable",
                mode=mode,
                problem_type="unknown",
                dataset_name=dataset_name,
                target_column=target_col or "unknown",
                date_column=date_col,
                selected_model_name="None",
                selection_metric="None",
                model_results=[],
                best_metrics=ModelEvaluationMetrics(),
                predictions=[],
                feature_importance=[],
                features_used=[],
                features_excluded={},
                uncertainty_method="None",
                explanation="Dataset is empty.",
                limitations=["No data available for predictive modeling."],
                warnings=["Uploaded dataset contains zero rows."],
            )

        df_work = df.copy()
        anomalies_excluded_cnt = 0

        # 1. Phase 4 Anomaly Integration (User choice: Keep vs Exclude)
        if exclude_anomalies:
            report_stage("Applying user-directed anomaly exclusion filter...", 15)
            if anomaly_indices:
                initial_len = len(df_work)
                df_work = df_work.drop(index=anomaly_indices, errors="ignore").reset_index(drop=True)
                anomalies_excluded_cnt = initial_len - len(df_work)
            elif "_anomaly_flag" in df_work.columns:
                initial_len = len(df_work)
                df_work = df_work[df_work["_anomaly_flag"] != True].reset_index(drop=True)
                anomalies_excluded_cnt = initial_len - len(df_work)

        # 2. Target Resolution
        if not target_col:
            recs = TargetDetector.detect_targets(df_work)
            if recs:
                target_col = recs[0].column
            else:
                return PredictionResult(
                    status="unsuitable",
                    mode=mode,
                    problem_type="unknown",
                    dataset_name=dataset_name,
                    target_column="none",
                    date_column=date_col,
                    selected_model_name="None",
                    selection_metric="None",
                    model_results=[],
                    best_metrics=ModelEvaluationMetrics(),
                    predictions=[],
                    feature_importance=[],
                    features_used=[],
                    features_excluded={},
                    uncertainty_method="None",
                    explanation="No viable target column found. All columns appear to be identifiers, technical keys, or constants.",
                    limitations=["Supervised modeling requires a non-constant business target variable."],
                    warnings=["No eligible target column could be recommended."],
                )

        # 3. Date Resolution (for Forecasting)
        if not date_col and mode in ["auto", "forecasting"]:
            date_infos = TargetDetector.detect_date_columns(df_work)
            if date_infos:
                date_col = date_infos[0].column

        # 4. Problem Type & Suitability Pre-flight
        report_stage("Evaluating problem type and pre-flight dataset viability...", 25)
        problem_type = ProblemDetector.detect_problem_type(
            df=df_work,
            target_col=target_col,
            date_col=date_col,
            requested_mode=mode,
        )

        suitability = ProblemDetector.check_dataset_suitability(
            df=df_work,
            target_col=target_col,
            problem_type=problem_type,
            date_col=date_col,
        )

        if not suitability.is_suitable:
            return PredictionResult(
                status="unsuitable",
                mode=problem_type.value,
                problem_type=problem_type.value,
                dataset_name=dataset_name,
                target_column=target_col,
                date_column=date_col,
                selected_model_name="None",
                selection_metric="None",
                model_results=[],
                best_metrics=ModelEvaluationMetrics(),
                predictions=[],
                feature_importance=[],
                features_used=[],
                features_excluded={},
                uncertainty_method="None",
                explanation="Prediction cannot be performed because dataset preconditions are not met: " + "; ".join(suitability.reasons),
                limitations=suitability.reasons,
                warnings=suitability.warnings,
            )

        # 5. Feature Selection
        report_stage("Filtering eligible predictors and checking data leakage...", 40)
        features_used, features_excluded, num_feats, cat_feats = FeatureSelector.select_features(
            df=df_work,
            target_col=target_col,
            date_col=date_col,
            config=cfg,
            problem_type=problem_type,
        )

        enabled_models = cfg.get("models", {})
        val_cfg = cfg.get("validation", {})
        test_size = val_cfg.get("test_size", 0.20)
        random_state = val_cfg.get("random_state", 42)

        # 6. Branch into Mode-Specific Model Execution
        if problem_type == ProblemType.TIME_SERIES_FORECAST:
            report_stage(f"Training time-series candidate models for {target_col}...", 55)
            fc_cfg = cfg.get("forecasting", {})
            lags = fc_cfg.get("lags", [1, 2, 3, 7, 14, 30])
            windows = fc_cfg.get("rolling_windows", [7, 14, 30])

            fc_res = ForecastingEngine.train_and_forecast(
                df=df_work,
                date_col=date_col,
                target_col=target_col,
                horizon=horizon,
                test_size=test_size,
                lags=lags,
                rolling_windows=windows,
                enabled_models=enabled_models,
            )
            candidate_results, best_model_id, future_preds, y_val_t, y_val_p, future_dates, best_estimator = fc_res[:7]
            val_dates = fc_res[7] if len(fc_res) > 7 else [f"val_{i}" for i in range(len(y_val_t))]

            validation_points = []
            for d, yt, yp in zip(val_dates, y_val_t, y_val_p):
                abs_err = round(float(abs(yt - yp)), 4)
                pct_err = round(float(abs_err / abs(yt) * 100.0), 2) if abs(yt) > 1e-9 else None
                validation_points.append(
                    PredictionPoint(
                        index_or_date=str(d),
                        actual_value=round(float(yt), 4),
                        predicted_value=round(float(yp), 4),
                        absolute_error=abs_err,
                        percentage_error=pct_err,
                    )
                )

            report_stage("Calculating empirical uncertainty intervals...", 75)
            lowers, uppers, uncert_desc = UncertaintyService.calculate_regression_intervals(
                y_val_true=y_val_t,
                y_val_pred=y_val_p,
                predictions=np.array(future_preds),
                confidence_level=0.95,
                is_non_negative=True,
                is_forecasting=True,
            )

            prediction_points = [
                PredictionPoint(
                    index_or_date=d,
                    predicted_value=v,
                    lower_bound=l,
                    upper_bound=u,
                )
                for d, v, l, u in zip(future_dates, future_preds, lowers, uppers)
            ]

            # Feature Importance
            importance_items = []
            if best_estimator is not None:
                # Features for TS are lags, rolling, and calendar
                from prediction.time_series import TimeSeriesService
                _, ts_feats, _, _ = TimeSeriesService.prepare_time_series_features(df_work, date_col, target_col, lags, windows)
                importance_items = FeatureImportanceService.extract_importance(best_estimator, ts_feats, max_features=10)

            best_candidate = next(c for c in candidate_results if c.model_id == best_model_id)
            selection_metric = "Lowest Validation Mean Absolute Error (MAE)"

            report_stage("Synthesizing plain-language explanations...", 90)
            explanation_text, limitations = ExplanationService.generate_explanation(
                mode="forecasting",
                target_col=target_col,
                selected_model=best_candidate.model_name,
                metrics=best_candidate.metrics,
                feature_importance=importance_items,
                forecast_horizon=horizon,
                predictions_sample=future_preds,
                date_col=date_col,
            )

            return PredictionResult(
                status="success",
                mode="forecasting",
                problem_type=problem_type.value,
                dataset_name=dataset_name,
                target_column=target_col,
                date_column=date_col,
                selected_model_name=best_candidate.model_name,
                selection_metric=selection_metric,
                model_results=candidate_results,
                best_metrics=best_candidate.metrics,
                predictions=prediction_points,
                validation_predictions=validation_points,
                feature_importance=importance_items,
                features_used=features_used or ["historical_lags", "rolling_statistics", "calendar_trend"],
                features_excluded=features_excluded,
                uncertainty_method=uncert_desc,
                explanation=explanation_text,
                limitations=limitations,
                warnings=suitability.warnings,
                train_rows=len(df_work) - len(y_val_t),
                validation_rows=len(y_val_t),
                forecast_horizon=horizon,
                anomalies_excluded_count=anomalies_excluded_cnt,
            )

        elif problem_type == ProblemType.REGRESSION:
            report_stage(f"Training supervised regression models on {len(features_used)} features...", 60)
            candidate_results, best_model_id, best_preds, y_val, best_est, proc_feats = (
                RegressionEngine.train_and_evaluate(
                    df=df_work,
                    target_col=target_col,
                    numeric_features=num_feats,
                    categorical_features=cat_feats,
                    test_size=test_size,
                    random_state=random_state,
                    enabled_models=enabled_models,
                )
            )

            report_stage("Calculating validation uncertainty bounds...", 80)
            lowers, uppers, uncert_desc = UncertaintyService.calculate_regression_intervals(
                y_val_true=y_val,
                y_val_pred=best_preds,
                predictions=best_preds,
                confidence_level=0.95,
                is_non_negative=False,
                is_forecasting=False,
            )

            prediction_points = [
                PredictionPoint(
                    index_or_date=str(i),
                    predicted_value=round(float(p), 4),
                    lower_bound=l,
                    upper_bound=u,
                    actual_value=round(float(a), 4),
                )
                for i, (p, l, u, a) in enumerate(zip(best_preds, lowers, uppers, y_val))
            ]

            importance_items = FeatureImportanceService.extract_importance(best_est, proc_feats, max_features=10)
            best_candidate = next(c for c in candidate_results if c.model_id == best_model_id)

            report_stage("Synthesizing model explanations and limitations...", 90)
            explanation_text, limitations = ExplanationService.generate_explanation(
                mode="regression",
                target_col=target_col,
                selected_model=best_candidate.model_name,
                metrics=best_candidate.metrics,
                feature_importance=importance_items,
            )

            return PredictionResult(
                status="success",
                mode="regression",
                problem_type=problem_type.value,
                dataset_name=dataset_name,
                target_column=target_col,
                date_column=date_col,
                selected_model_name=best_candidate.model_name,
                selection_metric="Lowest Validation Mean Absolute Error (MAE)",
                model_results=candidate_results,
                best_metrics=best_candidate.metrics,
                predictions=prediction_points[:50],  # Return validation predictions sample
                feature_importance=importance_items,
                features_used=features_used,
                features_excluded=features_excluded,
                uncertainty_method=uncert_desc,
                explanation=explanation_text,
                limitations=limitations,
                warnings=suitability.warnings,
                train_rows=len(df_work) - len(y_val),
                validation_rows=len(y_val),
                forecast_horizon=None,
                anomalies_excluded_count=anomalies_excluded_cnt,
            )

        else:
            # Classification
            report_stage(f"Training supervised classification models for {target_col}...", 60)
            candidate_results, best_model_id, best_preds, y_val, best_est, proc_feats, le = (
                ClassificationEngine.train_and_evaluate(
                    df=df_work,
                    target_col=target_col,
                    numeric_features=num_feats,
                    categorical_features=cat_feats,
                    problem_type=problem_type,
                    test_size=test_size,
                    random_state=random_state,
                    enabled_models=enabled_models,
                )
            )

            pred_labels = le.inverse_transform(best_preds)
            actual_labels = le.inverse_transform(y_val)

            prediction_points = [
                PredictionPoint(
                    index_or_date=str(i),
                    predicted_value=str(pl),
                    actual_value=str(al),
                )
                for i, (pl, al) in enumerate(zip(pred_labels, actual_labels))
            ]

            importance_items = FeatureImportanceService.extract_importance(best_est, proc_feats, max_features=10)
            best_candidate = next(c for c in candidate_results if c.model_id == best_model_id)

            report_stage("Synthesizing classification explanation...", 90)
            explanation_text, limitations = ExplanationService.generate_explanation(
                mode="classification",
                target_col=target_col,
                selected_model=best_candidate.model_name,
                metrics=best_candidate.metrics,
                feature_importance=importance_items,
            )

            return PredictionResult(
                status="success",
                mode="classification",
                problem_type=problem_type.value,
                dataset_name=dataset_name,
                target_column=target_col,
                date_column=date_col,
                selected_model_name=best_candidate.model_name,
                selection_metric="Highest Validation F1 Score",
                model_results=candidate_results,
                best_metrics=best_candidate.metrics,
                predictions=prediction_points[:50],
                feature_importance=importance_items,
                features_used=features_used,
                features_excluded=features_excluded,
                uncertainty_method="Class probability distribution / Label assignment",
                explanation=explanation_text,
                limitations=limitations,
                warnings=suitability.warnings,
                train_rows=len(df_work) - len(y_val),
                validation_rows=len(y_val),
                forecast_horizon=None,
                anomalies_excluded_count=anomalies_excluded_cnt,
            )
