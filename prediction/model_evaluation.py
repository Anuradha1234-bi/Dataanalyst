"""Model Performance Evaluation Module.

Computes empirical validation metrics (MAE, RMSE, R2, MAPE, sMAPE, Accuracy,
Precision, Recall, F1, ROC-AUC) on holdout data with robust handling of zero values.
"""

from typing import Dict, Any,List, Optional
import numpy as np
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
)

from models.prediction import ModelEvaluationMetrics, ProblemType


class ModelEvaluator:
    """Calculates standardized, un-fabricated validation metrics."""

    @classmethod
    def evaluate_regression(
        cls,
        y_true: np.ndarray,
        y_pred: np.ndarray,
    ) -> ModelEvaluationMetrics:
        """Calculate regression/forecasting metrics with safe division handling."""
        y_t = np.asarray(y_true, dtype=float)
        y_p = np.asarray(y_pred, dtype=float)

        if len(y_t) == 0:
            return ModelEvaluationMetrics()

        mae = float(mean_absolute_error(y_t, y_p))
        mse = float(mean_squared_error(y_t, y_p))
        rmse = float(np.sqrt(mse))

        # R2 score (safely handles zero variance in validation holdout)
        try:
            r2 = float(r2_score(y_t, y_p)) if np.var(y_t) > 1e-9 else 0.0
        except Exception:
            r2 = 0.0

        # Safe sMAPE calculation (Symmetric Mean Absolute Percentage Error)
        denominator = (np.abs(y_t) + np.abs(y_p)) / 2.0
        # Avoid division by zero
        non_zero_mask = denominator > 1e-9
        if non_zero_mask.sum() > 0:
            smape = float(np.mean(np.abs(y_p[non_zero_mask] - y_t[non_zero_mask]) / denominator[non_zero_mask]) * 100.0)
        else:
            smape = 0.0

        # Standard MAPE (only if all y_true are non-zero)
        mape: Optional[float] = None
        if (np.abs(y_t) > 1e-9).all():
            mape = float(np.mean(np.abs((y_t - y_p) / y_t)) * 100.0)

        return ModelEvaluationMetrics(
            mae=round(mae, 4),
            mse=round(mse, 4),
            rmse=round(rmse, 4),
            r2=round(r2, 4),
            mape=round(mape, 2) if mape is not None else None,
            smape=round(smape, 2),
        )

    @classmethod
    def evaluate_classification(
        cls,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        y_prob: Optional[np.ndarray] = None,
        is_binary: bool = True,
        labels: Optional[List[Any]] = None,
    ) -> ModelEvaluationMetrics:
        """Calculate classification metrics (Accuracy, Precision, Recall, F1, ROC-AUC, Confusion Matrix)."""
        y_t = np.asarray(y_true)
        y_p = np.asarray(y_pred)

        if len(y_t) == 0:
            return ModelEvaluationMetrics()

        avg_strategy = "binary" if is_binary else "weighted"

        acc = float(accuracy_score(y_t, y_p))
        prec = float(precision_score(y_t, y_p, average=avg_strategy, zero_division=0))
        rec = float(recall_score(y_t, y_p, average=avg_strategy, zero_division=0))
        f1 = float(f1_score(y_t, y_p, average=avg_strategy, zero_division=0))

        roc_auc: Optional[float] = None
        unique_classes = np.unique(y_t)
        if y_prob is not None:
            try:
                if is_binary and len(unique_classes) == 2:
                    prob_pos = y_prob[:, 1] if y_prob.ndim == 2 and y_prob.shape[1] > 1 else y_prob
                    roc_auc = float(roc_auc_score(y_t, prob_pos))
                elif not is_binary and len(unique_classes) > 2 and y_prob.ndim == 2 and y_prob.shape[1] == len(unique_classes):
                    roc_auc = float(roc_auc_score(y_t, y_prob, multi_class="ovr", average="weighted"))
            except Exception:
                roc_auc = None

        cm_dict = cls.compute_confusion_matrix(y_t, y_p, labels=labels)

        return ModelEvaluationMetrics(
            accuracy=round(acc, 4),
            precision=round(prec, 4),
            recall=round(rec, 4),
            f1=round(f1, 4),
            roc_auc=round(roc_auc, 4) if roc_auc is not None else None,
            confusion_matrix=cm_dict,
        )

    @classmethod
    def compute_confusion_matrix(
        cls,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        labels: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """Compute structured confusion matrix with labels and 2D matrix counts."""
        from sklearn.metrics import confusion_matrix
        try:
            if labels is None:
                lbls = sorted(list(set(y_true).union(set(y_pred))))
            else:
                lbls = list(labels)
            cm = confusion_matrix(y_true, y_pred, labels=lbls)
            return {
                "labels": [str(l) for l in lbls],
                "matrix": cm.tolist(),
            }
        except Exception:
            return {"labels": [], "matrix": []}

