"""Model Registry Module.

Decouples the UI and business workflows from underlying scikit-learn classes.
Provides metadata, problem compatibility, and descriptive labels for all candidate models.
"""

from typing import Dict, Any, List, Optional
from models.prediction import ProblemType


class ModelRegistry:
    """Central registry of supported predictive algorithms."""

    MODELS_METADATA = {
        # Time-series forecasting candidates
        "naive": {
            "name": "Naive (Last Value)",
            "type": "forecasting_baseline",
            "supported_problems": [ProblemType.TIME_SERIES_FORECAST],
            "description": "Projects the most recent observed historical value into the future.",
            "is_baseline": True,
        },
        "moving_average": {
            "name": "Moving Average Baseline",
            "type": "forecasting_baseline",
            "supported_problems": [ProblemType.TIME_SERIES_FORECAST],
            "description": "Projects the moving mean of recent historical observations.",
            "is_baseline": True,
        },
        "linear_trend": {
            "name": "Linear Trend Regression",
            "type": "forecasting",
            "supported_problems": [ProblemType.TIME_SERIES_FORECAST],
            "description": "Fits an ordinary least squares linear trajectory over the time index.",
            "is_baseline": False,
        },
        "rf_forecast": {
            "name": "Random Forest (Lag Features)",
            "type": "forecasting",
            "supported_problems": [ProblemType.TIME_SERIES_FORECAST],
            "description": "Nonlinear decision tree ensemble trained on historical lags and calendar features.",
            "is_baseline": False,
        },
        "hgb_forecast": {
            "name": "HistGradientBoosting (Lag Features)",
            "type": "forecasting",
            "supported_problems": [ProblemType.TIME_SERIES_FORECAST],
            "description": "Fast histogram-based gradient boosted decision trees over lag dynamics.",
            "is_baseline": False,
        },

        # Supervised Regression candidates
        "baseline_mean": {
            "name": "Mean Baseline Regressor",
            "type": "regression_baseline",
            "supported_problems": [ProblemType.REGRESSION],
            "description": "Predicts the empirical target mean. Benchmark against which all models are compared.",
            "is_baseline": True,
        },
        "linear_regression": {
            "name": "Linear Regression",
            "type": "regression",
            "supported_problems": [ProblemType.REGRESSION],
            "description": "Parametric linear model estimating feature coefficients.",
            "is_baseline": False,
        },
        "ridge_regression": {
            "name": "Ridge Regression (L2 Regularized)",
            "type": "regression",
            "supported_problems": [ProblemType.REGRESSION],
            "description": "Linear regression with L2 regularization to prevent overfitting.",
            "is_baseline": False,
        },
        "lasso_regression": {
            "name": "Lasso Regression (L1 Regularized)",
            "type": "regression",
            "supported_problems": [ProblemType.REGRESSION],
            "description": "Linear regression with L1 regularization for sparse feature selection.",
            "is_baseline": False,
        },
        "rf_regression": {
            "name": "Random Forest Regressor",
            "type": "regression",
            "supported_problems": [ProblemType.REGRESSION],
            "description": "Ensemble of randomized decision trees capturing complex feature interactions.",
            "is_baseline": False,
        },
        "hgb_regression": {
            "name": "HistGradientBoosting Regressor",
            "type": "regression",
            "supported_problems": [ProblemType.REGRESSION],
            "description": "Tree-based gradient boosting optimized for numeric and tabular measures.",
            "is_baseline": False,
        },

        # Supervised Classification candidates
        "baseline_mode": {
            "name": "Most Frequent Baseline",
            "type": "classification_baseline",
            "supported_problems": [ProblemType.BINARY_CLASSIFICATION, ProblemType.MULTICLASS_CLASSIFICATION],
            "description": "Predicts the empirical majority class label. Standard benchmark.",
            "is_baseline": True,
        },
        "logistic_regression": {
            "name": "Logistic Regression",
            "type": "classification",
            "supported_problems": [ProblemType.BINARY_CLASSIFICATION, ProblemType.MULTICLASS_CLASSIFICATION],
            "description": "Linear model estimating class probability log-odds.",
            "is_baseline": False,
        },
        "decision_tree": {
            "name": "Decision Tree Classifier",
            "type": "classification",
            "supported_problems": [ProblemType.BINARY_CLASSIFICATION, ProblemType.MULTICLASS_CLASSIFICATION],
            "description": "Single interpretable decision tree splitting on feature thresholds.",
            "is_baseline": True,
        },
        "rf_classification": {
            "name": "Random Forest Classifier",
            "type": "classification",
            "supported_problems": [ProblemType.BINARY_CLASSIFICATION, ProblemType.MULTICLASS_CLASSIFICATION],
            "description": "Robust ensemble classifier averaging predictions across diverse trees.",
            "is_baseline": False,
        },
        "hgb_classification": {
            "name": "HistGradientBoosting Classifier",
            "type": "classification",
            "supported_problems": [ProblemType.BINARY_CLASSIFICATION, ProblemType.MULTICLASS_CLASSIFICATION],
            "description": "High-performance gradient boosting classifier with native missing-value support.",
            "is_baseline": False,
        },
    }

    @classmethod
    def get_candidate_models(cls, problem_type: ProblemType) -> List[Dict[str, Any]]:
        """Return list of candidate models compatible with the given problem type."""
        candidates = []
        for model_id, meta in cls.MODELS_METADATA.items():
            if problem_type in meta["supported_problems"]:
                entry = dict(meta)
                entry["id"] = model_id
                candidates.append(entry)
        return candidates
