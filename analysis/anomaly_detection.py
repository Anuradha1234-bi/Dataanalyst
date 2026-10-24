"""Anomaly Detection Engine - Core algorithms: IQR, Z-Score, Robust Z-Score, and Isolation Forest."""

from typing import Dict, Any, List, Optional, Tuple, Union
from datetime import datetime
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from models.anomaly import (
    IQROutlierColumnResult,
    IQRAnalysisResult,
    ZScoreColumnResult,
    ZScoreAnalysisResult,
    RobustZScoreColumnResult,
    RobustZScoreAnalysisResult,
    IsolationForestResult,
    CombinedAnomalyResult,
)
from analysis.anomaly_utils import AnomalyUtils
from analysis.anomaly_scoring import combine_anomaly_results
from analysis.config import normalize_anomaly_config


def detect_iqr_anomalies(
    df: pd.DataFrame,
    columns: Optional[List[str]] = None,
    multiplier: float = 1.5,
    dataset_name: str = "dataset.csv",
) -> IQRAnalysisResult:
    """Calculate IQR-based outlier boundaries and identify outlier observations.

    Formula:
        IQR = Q3 - Q1
        Lower Bound = Q1 - (multiplier * IQR)
        Upper Bound = Q3 + (multiplier * IQR)
    """
    if df is None or df.empty:
        return IQRAnalysisResult(
            dataset_name=dataset_name,
            total_rows=0,
            columns_analyzed=[],
            column_results={},
            total_outlier_rows=0,
            outlier_rate=0.0,
            all_outlier_indices=[],
            multiplier=multiplier,
        )

    # Determine eligible columns
    if columns is None:
        suitable, _, _ = AnomalyUtils.identify_suitable_features(df)
        target_cols = suitable
    else:
        target_cols = [c for c in columns if c in df.columns and pd.api.types.is_numeric_dtype(df[c])]

    total_rows = len(df)
    column_results: Dict[str, IQROutlierColumnResult] = {}
    all_outlier_indices_set = set()

    for col in target_cols:
        col_series = df[col]
        num_series = pd.to_numeric(col_series, errors="coerce")
        finite_mask = num_series.notna() & np.isfinite(num_series.to_numpy(dtype=float, na_value=np.nan))
        s = num_series[finite_mask]
        valid_count = len(s)
        missing_count = total_rows - valid_count

        if missing_count > 0:
            eval_note = (
                f"Evaluated {valid_count} of {total_rows} values "
                f"({missing_count} missing/non-finite observation(s) excluded from IQR denominator)."
            )
        else:
            eval_note = f"Evaluated all {valid_count} values (100% valid observations)."

        if valid_count == 0:
            column_results[col] = IQROutlierColumnResult(
                column=col,
                q1=0.0,
                q3=0.0,
                iqr=0.0,
                multiplier=multiplier,
                lower_bound=0.0,
                upper_bound=0.0,
                lower_outliers_count=0,
                upper_outliers_count=0,
                total_outliers=0,
                outlier_pct=0.0,
                outlier_indices=[],
                min_val=0.0,
                max_val=0.0,
                valid_count=0,
                missing_count=total_rows,
                total_rows=total_rows,
                evaluation_note=f"No valid numeric values out of {total_rows} rows.",
            )
            continue

        q1 = float(s.quantile(0.25))
        q3 = float(s.quantile(0.75))
        iqr = float(q3 - q1)
        lower_bound = float(q1 - (multiplier * iqr))
        upper_bound = float(q3 + (multiplier * iqr))

        lower_mask = (num_series < lower_bound) & finite_mask
        upper_mask = (num_series > upper_bound) & finite_mask
        total_mask = lower_mask | upper_mask

        lower_count = int(lower_mask.sum())
        upper_count = int(upper_mask.sum())
        total_outliers = lower_count + upper_count
        outlier_pct = round((total_outliers / max(1, valid_count)) * 100, 2)

        outlier_idx = df.index[total_mask].tolist()
        all_outlier_indices_set.update(outlier_idx)

        column_results[col] = IQROutlierColumnResult(
            column=col,
            q1=round(q1, 4),
            q3=round(q3, 4),
            iqr=round(iqr, 4),
            multiplier=multiplier,
            lower_bound=round(lower_bound, 4),
            upper_bound=round(upper_bound, 4),
            lower_outliers_count=lower_count,
            upper_outliers_count=upper_count,
            total_outliers=total_outliers,
            outlier_pct=outlier_pct,
            outlier_indices=outlier_idx,
            min_val=round(float(s.min()), 4),
            max_val=round(float(s.max()), 4),
            valid_count=valid_count,
            missing_count=missing_count,
            total_rows=total_rows,
            evaluation_note=eval_note,
        )

    all_outlier_indices = sorted(list(all_outlier_indices_set))
    total_outlier_rows = len(all_outlier_indices)
    total_rows = len(df)
    outlier_rate = round((total_outlier_rows / max(1, total_rows)) * 100, 2)

    return IQRAnalysisResult(
        dataset_name=dataset_name,
        total_rows=total_rows,
        columns_analyzed=target_cols,
        column_results=column_results,
        total_outlier_rows=total_outlier_rows,
        outlier_rate=outlier_rate,
        all_outlier_indices=all_outlier_indices,
        multiplier=multiplier,
    )


def detect_zscore_anomalies(
    df: pd.DataFrame,
    columns: Optional[List[str]] = None,
    threshold: float = 3.0,
    dataset_name: str = "dataset.csv",
) -> ZScoreAnalysisResult:
    """Calculate parametric Z-scores and identify observations exceeding threshold |z| > threshold.

    Formula:
        z = (x - mean) / std
    Safe Handling:
        If std == 0, flags warning and does NOT classify constant values as anomalies.
    """
    if df is None or df.empty:
        return ZScoreAnalysisResult(
            dataset_name=dataset_name,
            total_rows=0,
            columns_analyzed=[],
            column_results={},
            total_outlier_rows=0,
            outlier_rate=0.0,
            all_outlier_indices=[],
            threshold=threshold,
            warnings=["DataFrame is empty."],
        )

    if columns is None:
        suitable, _, _ = AnomalyUtils.identify_suitable_features(df)
        target_cols = suitable
    else:
        target_cols = [c for c in columns if c in df.columns and pd.api.types.is_numeric_dtype(df[c])]

    column_results: Dict[str, ZScoreColumnResult] = {}
    all_outlier_indices_set = set()
    global_warnings = []

    if len(df) < 10:
        global_warnings.append("Dataset is very small (<10 records). Statistical Z-score detection may be unreliable.")

    for col in target_cols:
        s = df[col].dropna()
        if len(s) == 0:
            continue

        mean_val = float(s.mean())
        std_val = float(s.std(ddof=1)) if len(s) > 1 else 0.0

        # Safe zero-variance handling
        if std_val < 1e-9:
            column_results[col] = ZScoreColumnResult(
                column=col,
                mean=round(mean_val, 4),
                std=0.0,
                threshold=threshold,
                outlier_count=0,
                outlier_pct=0.0,
                outlier_indices=[],
                min_z=0.0,
                max_z=0.0,
                zero_std=True,
                warning="Zero standard deviation (constant column). No anomalies classified.",
            )
            continue

        col_series = df[col]
        z_scores = ((col_series - mean_val) / std_val).abs()
        outlier_mask = (z_scores > threshold) & col_series.notna()

        outlier_indices = df.index[outlier_mask].tolist()
        all_outlier_indices_set.update(outlier_indices)
        outlier_count = len(outlier_indices)
        outlier_pct = round((outlier_count / max(1, len(s))) * 100, 2)

        valid_z = z_scores.dropna()
        min_z = float(valid_z.min()) if len(valid_z) > 0 else 0.0
        max_z = float(valid_z.max()) if len(valid_z) > 0 else 0.0

        column_results[col] = ZScoreColumnResult(
            column=col,
            mean=round(mean_val, 4),
            std=round(std_val, 4),
            threshold=threshold,
            outlier_count=outlier_count,
            outlier_pct=outlier_pct,
            outlier_indices=outlier_indices,
            min_z=round(min_z, 2),
            max_z=round(max_z, 2),
            zero_std=False,
        )

    all_outliers = sorted(list(all_outlier_indices_set))
    total_outliers = len(all_outliers)
    outlier_rate = round((total_outliers / max(1, len(df))) * 100, 2)

    return ZScoreAnalysisResult(
        dataset_name=dataset_name,
        total_rows=len(df),
        columns_analyzed=target_cols,
        column_results=column_results,
        total_outlier_rows=total_outliers,
        outlier_rate=outlier_rate,
        all_outlier_indices=all_outliers,
        threshold=threshold,
        warnings=global_warnings,
    )


def detect_robust_zscore_anomalies(
    df: pd.DataFrame,
    columns: Optional[List[str]] = None,
    threshold: float = 3.5,
    dataset_name: str = "dataset.csv",
) -> RobustZScoreAnalysisResult:
    """Calculate Robust Z-scores using Median Absolute Deviation (MAD).

    Formula:
        MAD = median(|x - median|)
        Robust Z = 0.6745 * (x - median) / MAD
    Safe Handling:
        If MAD == 0, flags warning and does NOT crash or misclassify points.
    """
    if df is None or df.empty:
        return RobustZScoreAnalysisResult(
            dataset_name=dataset_name,
            total_rows=0,
            columns_analyzed=[],
            column_results={},
            total_outlier_rows=0,
            outlier_rate=0.0,
            all_outlier_indices=[],
            threshold=threshold,
            warnings=["DataFrame is empty."],
        )

    if columns is None:
        suitable, _, _ = AnomalyUtils.identify_suitable_features(df)
        target_cols = suitable
    else:
        target_cols = [c for c in columns if c in df.columns and pd.api.types.is_numeric_dtype(df[c])]

    column_results: Dict[str, RobustZScoreColumnResult] = {}
    all_outlier_indices_set = set()
    global_warnings = []

    if len(df) < 10:
        global_warnings.append("Dataset is very small (<10 records). Robust Z-score (MAD) detection may be unreliable.")

    for col in target_cols:
        s = df[col].dropna()
        if len(s) == 0:
            continue

        median_val = float(s.median())
        deviations = (s - median_val).abs()
        mad_val = float(deviations.median())

        # Safe zero-MAD handling
        if mad_val < 1e-9:
            column_results[col] = RobustZScoreColumnResult(
                column=col,
                median=round(median_val, 4),
                mad=0.0,
                threshold=threshold,
                outlier_count=0,
                outlier_pct=0.0,
                outlier_indices=[],
                min_robust_z=0.0,
                max_robust_z=0.0,
                zero_mad=True,
                warning="Zero Median Absolute Deviation (high concentration around median). No anomalies classified.",
            )
            continue

        col_series = df[col]
        robust_z = (0.6745 * (col_series - median_val).abs() / mad_val)
        outlier_mask = (robust_z > threshold) & col_series.notna()

        outlier_indices = df.index[outlier_mask].tolist()
        all_outlier_indices_set.update(outlier_indices)
        outlier_count = len(outlier_indices)
        outlier_pct = round((outlier_count / max(1, len(s))) * 100, 2)

        valid_rz = robust_z.dropna()
        min_rz = float(valid_rz.min()) if len(valid_rz) > 0 else 0.0
        max_rz = float(valid_rz.max()) if len(valid_rz) > 0 else 0.0

        column_results[col] = RobustZScoreColumnResult(
            column=col,
            median=round(median_val, 4),
            mad=round(mad_val, 4),
            threshold=threshold,
            outlier_count=outlier_count,
            outlier_pct=outlier_pct,
            outlier_indices=outlier_indices,
            min_robust_z=round(min_rz, 2),
            max_robust_z=round(max_rz, 2),
            zero_mad=False,
        )

    all_outliers = sorted(list(all_outlier_indices_set))
    total_outliers = len(all_outliers)
    outlier_rate = round((total_outliers / max(1, len(df))) * 100, 2)

    return RobustZScoreAnalysisResult(
        dataset_name=dataset_name,
        total_rows=len(df),
        columns_analyzed=target_cols,
        column_results=column_results,
        total_outlier_rows=total_outliers,
        outlier_rate=outlier_rate,
        all_outlier_indices=all_outliers,
        threshold=threshold,
        warnings=global_warnings,
    )


def detect_isolation_forest_anomalies(
    df: pd.DataFrame,
    columns: Optional[List[str]] = None,
    config: Optional[Dict[str, Any]] = None,
    dataset_name: str = "dataset.csv",
) -> IsolationForestResult:
    """Fit Isolation Forest model to detect multivariate numeric anomalies.

    Safe Non-Destructive Operation:
    - Filters out non-numeric, ID, and technical index columns.
    - Imputes missing values on feature copy during fitting without altering original DataFrame.
    - Generates calibrated anomaly score (0.0 to 1.0, higher = more anomalous).
    """
    if df is None or df.empty:
        raise ValueError("Cannot run Isolation Forest on an empty or None DataFrame.")

    # Determine features
    if columns is None:
        suitable, excluded_ids, excluded_other = AnomalyUtils.identify_suitable_features(df)
    else:
        suitable = []
        excluded_ids = []
        excluded_other = []
        for c in columns:
            if c not in df.columns:
                continue
            if not pd.api.types.is_numeric_dtype(df[c]):
                excluded_other.append(f"{c} (Non-numeric dtype)")
                continue
            is_id, reason = AnomalyUtils.is_id_or_index_column(df[c], c)
            if is_id:
                excluded_ids.append(f"{c} ({reason})")
                continue
            if df[c].dropna().nunique() <= 1:
                excluded_other.append(f"{c} (Constant or all-null)")
                continue
            suitable.append(c)

    if not suitable:
        raise ValueError(
            "No suitable numeric features are available for Isolation Forest. "
            "Ensure dataset contains valid numerical attributes (ID columns and constants are excluded)."
        )

    if len(df) < 5:
        raise ValueError(
            f"Dataset contains only {len(df)} records. Isolation Forest requires at least 5 records to build isolation trees."
        )

    preprocessing_notes: List[str] = []
    preprocessing_notes.append(f"Selected {len(suitable)} numerical feature(s): {', '.join(suitable)}")

    if excluded_ids:
        preprocessing_notes.append(f"Excluded {len(excluded_ids)} identifier/index column(s): {', '.join(excluded_ids)}")
    if excluded_other:
        preprocessing_notes.append(f"Excluded {len(excluded_other)} non-suitable column(s): {', '.join(excluded_other)}")

    # Extract configuration
    cfg = config or {}
    n_estimators = int(cfg.get("n_estimators", 200))
    contam_raw = cfg.get("contamination", "auto")
    random_state = int(cfg.get("random_state", 42))

    if isinstance(contam_raw, (int, float)):
        contamination: Union[float, str] = max(0.001, min(0.5, float(contam_raw)))
    elif str(contam_raw).lower() == "auto":
        contamination = "auto"
    else:
        contamination = 0.05

    # Create feature matrix copy for model fitting
    X = df[suitable].copy()

    # Safe imputation of NaNs and Infs for tree building
    for c in suitable:
        X[c] = X[c].replace([np.inf, -np.inf], np.nan)
        missing_count = int(X[c].isna().sum())
        if missing_count > 0:
            med_val = float(X[c].median())
            if np.isnan(med_val):
                med_val = 0.0
            X[c] = X[c].fillna(med_val)
            preprocessing_notes.append(f"Imputed {missing_count} missing values in '{c}' using feature median ({round(med_val, 2)}) for modeling.")

    # Train Isolation Forest
    model = IsolationForest(
        n_estimators=n_estimators,
        contamination=contamination,
        random_state=random_state,
    )
    model.fit(X)

    raw_preds = model.predict(X)
    decision_scores = model.decision_function(X)

    # Calibrate normalized score between 0.0 and 1.0 (higher = more anomalous)
    min_dec = float(np.min(decision_scores))
    max_dec = float(np.max(decision_scores))
    span = max(1e-6, max_dec - min_dec)

    normalized_scores = [round(float((max_dec - d) / span), 4) for d in decision_scores]
    raw_decision_list = [round(float(d), 4) for d in decision_scores]

    labels = ["Anomaly" if p == -1 else "Normal" for p in raw_preds]
    anomaly_indices = [df.index[i] for i, p in enumerate(raw_preds) if p == -1]
    anomaly_count = len(anomaly_indices)
    anomaly_pct = round((anomaly_count / max(1, len(df))) * 100, 2)

    return IsolationForestResult(
        dataset_name=dataset_name,
        rows_analyzed=len(df),
        features_used=suitable,
        contamination=float(contamination) if isinstance(contamination, (int, float)) else 0.05,
        anomaly_count=anomaly_count,
        anomaly_pct=anomaly_pct,
        anomaly_scores=normalized_scores,
        raw_decision_scores=raw_decision_list,
        anomaly_labels=labels,
        anomaly_indices=anomaly_indices,
        preprocessing_notes=preprocessing_notes,
        excluded_columns=excluded_ids + excluded_other,
    )


def run_anomaly_detection(
    df: pd.DataFrame,
    dataset_name: str = "dataset.csv",
    methods: Optional[List[str]] = None,
    columns: Optional[List[str]] = None,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Orchestrator executing Phase 4 anomaly detection pipeline and assembling structured results.

    Returns:
        Structured result dictionary containing status, summary, method results,
        combined results, affected columns, and affected rows.
    """
    if df is None or df.empty:
        return {
            "status": "error",
            "dataset": dataset_name,
            "rows": 0,
            "features_used": [],
            "methods": [],
            "summary": {"anomaly_count": 0, "normal_count": 0, "anomaly_percentage": 0.0},
            "method_results": {},
            "combined_results": {},
            "affected_columns": [],
            "affected_rows": [],
            "warnings": ["Dataset is empty or None."],
            "errors": ["Cannot execute anomaly detection on an empty dataset."],
        }

    norm_cfg = normalize_anomaly_config(config)
    active_methods = methods or [m for m, active in norm_cfg.get("methods", {}).items() if active]
    if not active_methods:
        active_methods = ["iqr"]

    # Filter features
    suitable_cols, excluded_ids, excluded_other = AnomalyUtils.identify_suitable_features(df)
    target_cols = [c for c in columns if c in suitable_cols] if columns else suitable_cols

    if not target_cols:
        return {
            "status": "warning",
            "dataset": dataset_name,
            "rows": len(df),
            "features_used": [],
            "methods": active_methods,
            "summary": {"anomaly_count": 0, "normal_count": len(df), "anomaly_percentage": 0.0},
            "method_results": {},
            "combined_results": {},
            "affected_columns": [],
            "affected_rows": [],
            "warnings": ["No suitable numerical features found for anomaly modeling."],
            "errors": [],
        }

    method_results = {}
    warnings = []
    errors = []

    # Small dataset warning
    if len(df) < 10:
        warnings.append("Dataset is very small (<10 records). Statistical anomaly detection may be unreliable.")

    # 1. IQR
    if "iqr" in active_methods:
        try:
            iqr_mult = float(norm_cfg.get("iqr", {}).get("multiplier", 1.5))
            method_results["iqr"] = detect_iqr_anomalies(
                df=df, columns=target_cols, multiplier=iqr_mult, dataset_name=dataset_name
            )
        except Exception as e:
            errors.append(f"IQR detection failed: {str(e)}")

    # 2. Z-Score
    if "z_score" in active_methods:
        try:
            z_thresh = float(norm_cfg.get("z_score", {}).get("threshold", 3.0))
            method_results["z_score"] = detect_zscore_anomalies(
                df=df, columns=target_cols, threshold=z_thresh, dataset_name=dataset_name
            )
        except Exception as e:
            errors.append(f"Z-score detection failed: {str(e)}")

    # 3. Robust Z-Score
    if "robust_z_score" in active_methods:
        try:
            rz_thresh = float(norm_cfg.get("robust_z_score", {}).get("threshold", 3.5))
            method_results["robust_z_score"] = detect_robust_zscore_anomalies(
                df=df, columns=target_cols, threshold=rz_thresh, dataset_name=dataset_name
            )
        except Exception as e:
            errors.append(f"Robust Z-score detection failed: {str(e)}")

    # 4. Isolation Forest
    if "isolation_forest" in active_methods:
        try:
            if_cfg = norm_cfg.get("isolation_forest", {})
            method_results["isolation_forest"] = detect_isolation_forest_anomalies(
                df=df, columns=target_cols, config=if_cfg, dataset_name=dataset_name
            )
        except Exception as e:
            errors.append(f"Isolation Forest detection failed: {str(e)}")

    # Combine multi-method results
    combined: CombinedAnomalyResult = combine_anomaly_results(
        results=method_results,
        df=df,
        dataset_name=dataset_name,
    )

    return {
        "status": "success" if not errors else ("partial_success" if method_results else "error"),
        "dataset": dataset_name,
        "rows": len(df),
        "features_used": target_cols,
        "methods": combined.methods_used,
        "summary": {
            "anomaly_count": combined.anomaly_count,
            "normal_count": combined.normal_count,
            "anomaly_percentage": combined.anomaly_percentage,
        },
        "method_results": method_results,
        "combined_results": combined,
        "affected_columns": combined.affected_columns,
        "affected_rows": combined.all_anomaly_indices,
        "severity_breakdown": combined.severity_breakdown,
        "method_agreement_counts": combined.method_agreement_counts,
        "warnings": warnings + combined.warnings,
        "errors": errors,
    }
