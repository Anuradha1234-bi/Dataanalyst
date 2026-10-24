"""Anomaly Tool - Advanced Statistical Outlier & Anomaly Detection Engine.

Provides mathematically rigorous, non-destructive anomaly detection including:
1. IQR-based Outlier Detection (with configurable multipliers)
2. Isolation Forest (with safe imputation, ID exclusion, and calibrated scoring)
3. Deep Statistical Anomaly Analysis (skewness, kurtosis, variance, z-scores)
4. Multivariate Outlier Detection & Signal Attribution
5. Controlled Outlier Treatment (Keep, Flag Only, Remove Rows, Cap / Winsorize)
"""

from typing import Dict, Any, List, Optional, Tuple, Union
import re
from datetime import datetime
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from models.anomaly import (
    IQROutlierColumnResult,
    IQRAnalysisResult,
    IsolationForestResult,
    DeepStatisticalMetric,
    DeepStatisticalResult,
    MultivariateAnomalyRecord,
    MultivariateAnalysisResult,
    AnomalyTreatmentSummary,
    ZScoreColumnResult,
    ZScoreAnalysisResult,
    RobustZScoreColumnResult,
    RobustZScoreAnalysisResult,
    SingleAnomalyRecord,
    CombinedAnomalyResult,
    AnomalySummary,
    AnomalyExplanation,
)



class AnomalyTool:
    """Detects tabular anomalies using statistical and scikit-learn models."""

    ID_REGEX = re.compile(
        r"^(id|index|row_?num(ber)?|row_?id|record_?id|trans(action)?_?id|order_?id|cust(omer)?_?id|user_?id|account_?id|invoice_?id|client_?id|patient_?id|employee_?id|member_?id|student_?id|product_?id|item_?id|sku(_?id)?|store_?id|vendor_?id|session_?id|device_?id)$",
        re.IGNORECASE,
    )

    ID_SUFFIX_REGEX = re.compile(
        r"(_id|id|_pk|_fk|_key|_code)$",
        re.IGNORECASE,
    )

    def __init__(self, default_contamination: float = 0.05):
        self.default_contamination = default_contamination
        self.version = "Phase 4 - Advanced Statistical Anomaly Detection"

    # =========================================================================
    # FEATURE SUITABILITY & ID FILTERING
    # =========================================================================

    @classmethod
    def get_column_base_name(cls, col_name: str) -> str:
        """Strip dataset cleaning, joining, and duplicate numbering suffixes to reveal base semantic feature name."""
        c = str(col_name).strip()
        prev = None
        while c != prev:
            prev = c
            c = re.sub(r"\s*\(\d+\)$", "", c).strip()
            c = re.sub(r"\.\d+$", "", c).strip()
            c = re.sub(
                r"(_clean_[a-zA-Z0-9_]+|_cleaned|_clean|_copy|_dup|_duplicate|_left|_right)$",
                "",
                c,
                flags=re.IGNORECASE,
            ).strip()
            c = re.sub(r"__\d+$", "", c).strip()
        return c

    @classmethod
    def is_id_or_index_column(cls, series: pd.Series, col_name: str) -> Tuple[bool, str]:
        """Determine whether a column represents an ID, index, or meaningless sequence."""
        col_clean = str(col_name).strip()
        col_lower = col_clean.lower()
        col_base = cls.get_column_base_name(col_clean)
        col_base_lower = col_base.lower()

        # 1. Unnamed index columns
        if col_lower.startswith("unnamed") or col_lower in ("index", "level_0") or col_base_lower in ("index", "level_0"):
            return True, "Automated or unnamed CSV index column"

        # 2. Obvious ID names (matching original or base name)
        if cls.ID_REGEX.match(col_lower) or cls.ID_REGEX.match(col_base_lower):
            return True, f"Identified as identifier column by name pattern '{col_name}'"

        if (cls.ID_SUFFIX_REGEX.search(col_lower) or cls.ID_SUFFIX_REGEX.search(col_base_lower)) and not any(
            val_kw in col_lower for val_kw in ["paid", "valid", "pyramid", "fluid", "solid", "rapid", "grid", "humid", "lipid", "acid", "hybrid"]
        ):
            # Check cardinality: if high unique ratio, it's an ID
            non_null = series.dropna()
            if len(non_null) > 0 and (non_null.nunique() / len(non_null)) > 0.4:
                return True, f"High-cardinality identifier ending with ID/Code suffix ('{col_name}')"

        # 3. Monotonically increasing sequential integers (1, 2, 3, 4...)
        non_null = series.dropna()
        if len(non_null) >= 5 and pd.api.types.is_numeric_dtype(series):
            try:
                # Check if integer values
                int_check = (non_null == non_null.round()).all()
                if int_check:
                    diffs = non_null.diff().dropna()
                    if len(diffs) > 0 and (diffs == 1).all() and non_null.nunique() == len(non_null):
                        return True, "Strictly sequential integer index (1, 2, 3...)"
            except Exception:
                pass

        # 4. 100% unique integer columns with exact record count
        if pd.api.types.is_numeric_dtype(series) and len(non_null) >= 10:
            if non_null.nunique() == len(series) and (non_null == non_null.round()).all():
                # Check if it has an ID-like name
                if any(w in col_lower for w in ["num", "no", "code", "key", "ref"]) or any(w in col_base_lower for w in ["num", "no", "code", "key", "ref"]):
                    return True, "100% unique integer sequence with reference name"

        return False, ""

    @classmethod
    def identify_suitable_features(
        cls, df: pd.DataFrame
    ) -> Tuple[List[str], List[str], List[str]]:
        """Identify suitable numeric features, excluded ID columns, and excluded non-numeric columns.

        Returns:
            Tuple of (suitable_features, excluded_ids, excluded_other)
        """
        suitable: List[str] = []
        excluded_ids: List[str] = []
        excluded_other: List[str] = []

        if df is None or df.empty:
            return suitable, excluded_ids, excluded_other

        for col in df.columns:
            s = df[col]

            # Check if numeric
            if not pd.api.types.is_numeric_dtype(s):
                excluded_other.append(f"{col} (Non-numeric dtype: {s.dtype})")
                continue

            # Check if constant or all-null
            valid_vals = s.dropna()
            if len(valid_vals) <= 1 or valid_vals.nunique() <= 1:
                excluded_other.append(f"{col} (Constant or all-null feature)")
                continue

            # Check if ID / index column
            is_id, reason = cls.is_id_or_index_column(s, col)
            if is_id:
                excluded_ids.append(f"{col} ({reason})")
                continue

            suitable.append(col)

        return suitable, excluded_ids, excluded_other

    # =========================================================================
    # FEATURE SUITABILITY, DUPLICATE DETECTION & ID FILTERING
    # =========================================================================

    @classmethod
    def are_numeric_columns_exact_duplicates(cls, s1: pd.Series, s2: pd.Series) -> bool:
        """Compare two numerical series for exact row-aligned equivalence including missing values.
        
        Requires identical row lengths, aligned missing value masks, and exactly equal valid values.
        Does not treat partially matching, merely correlated, or non-identical columns as duplicates.
        """
        if len(s1) != len(s2):
            return False
        # Align missing values
        na1 = s1.isna().to_numpy()
        na2 = s2.isna().to_numpy()
        if not np.array_equal(na1, na2):
            return False
        # If all missing in both series, they are equivalent
        if np.all(na1):
            return True
        # Compare non-missing numeric values strictly
        try:
            v1 = pd.to_numeric(s1[~na1], errors="coerce").to_numpy(dtype=float)
            v2 = pd.to_numeric(s2[~na2], errors="coerce").to_numpy(dtype=float)
            if len(v1) != len(v2):
                return False
            # Check for non-finite values in valid positions
            fin1 = np.isfinite(v1)
            fin2 = np.isfinite(v2)
            if not np.array_equal(fin1, fin2):
                return False
            # Compare finite values exactly (robust to floating point precision)
            return bool(np.allclose(v1[fin1], v2[fin2], rtol=1e-9, atol=1e-12, equal_nan=False))
        except Exception:
            return False

    @classmethod
    def detect_duplicate_numerical_columns(
        cls, df: pd.DataFrame, columns: Optional[List[str]] = None
    ) -> Tuple[Dict[str, List[str]], Dict[str, str]]:
        """Identify exact duplicate numerical columns preserving original column order.
        
        Returns:
            canonical_to_duplicates: Dict[canonical_col_name, list_of_duplicate_col_names]
            duplicate_to_canonical: Dict[duplicate_col_name, canonical_col_name]
        """
        if df is None or df.empty:
            return {}, {}

        source_cols = columns if columns is not None else list(df.columns)
        num_cols = [c for c in source_cols if c in df.columns and pd.api.types.is_numeric_dtype(df[c])]
        canonical_to_duplicates: Dict[str, List[str]] = {}
        duplicate_to_canonical: Dict[str, str] = {}
        already_duplicate = set()

        for i in range(len(num_cols)):
            col_a = num_cols[i]
            if col_a in already_duplicate:
                continue
            s_a = df[col_a]
            for j in range(i + 1, len(num_cols)):
                col_b = num_cols[j]
                if col_b in already_duplicate:
                    continue
                s_b = df[col_b]
                if cls.are_numeric_columns_exact_duplicates(s_a, s_b):
                    if col_a not in canonical_to_duplicates:
                        canonical_to_duplicates[col_a] = []
                    canonical_to_duplicates[col_a].append(col_b)
                    duplicate_to_canonical[col_b] = col_a
                    already_duplicate.add(col_b)

        return canonical_to_duplicates, duplicate_to_canonical

    # =========================================================================
    # 1. IQR-BASED OUTLIER DETECTION
    # =========================================================================

    @classmethod
    def detect_iqr_outliers(
        cls,
        df: pd.DataFrame,
        columns: Optional[List[str]] = None,
        multiplier: float = 1.5,
        dataset_name: str = "dataset",
    ) -> IQRAnalysisResult:
        """Calculate IQR-based outlier boundaries and identify outlier records.

        Formula:
            IQR = Q3 - Q1
            Lower Bound = Q1 - multiplier * IQR
            Upper Bound = Q3 + multiplier * IQR
        
        Classification rules:
            - Lower outlier: value strictly below lower bound (< lower_bound).
            - Upper outlier: value strictly above upper bound (> upper_bound).
            - Values exactly on bounds are NOT outliers.
            - Missing, null, or non-finite values (NaN, +inf, -inf) are NEVER classified as outliers.
            - Denominator for per-column outlier_pct is the count of valid finite observations evaluated.
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
                duplicate_columns={},
            )

        # Determine target columns
        if columns is None:
            suitable, _, _ = cls.identify_suitable_features(df)
            target_cols = suitable
        else:
            target_cols = [c for c in columns if c in df.columns and pd.api.types.is_numeric_dtype(df[c])]

        # Detect duplicate numerical columns among evaluated columns
        canonical_to_dups, _ = cls.detect_duplicate_numerical_columns(df, columns=target_cols)

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

            # Strictly below lower bound or strictly above upper bound
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
            duplicate_columns=canonical_to_dups,
        )

    # =========================================================================
    # 2. ISOLATION FOREST ANOMALY DETECTION
    # =========================================================================

    @classmethod
    def detect_isolation_forest(
        cls,
        df: pd.DataFrame,
        columns: Optional[List[str]] = None,
        contamination: Union[float, str] = 0.05,
        random_state: int = 42,
        dataset_name: str = "dataset",
        exclude_duplicates: bool = True,
    ) -> IsolationForestResult:
        """Fit Isolation Forest model to detect multivariate numeric anomalies.

        Performs non-destructive preprocessing:
        - Filters out non-numeric and ID/index columns
        - Excludes exact duplicate numerical columns from multivariate model input when exclude_duplicates is True
        - Safely imputes missing values and infinities for fitting without altering input DataFrame
        - Generates calibrated anomaly score (0.0 to 1.0, higher = more anomalous)
        - Labels records as 'Normal' or 'Anomaly'
        """
        if df is None or df.empty:
            raise ValueError("Cannot run Isolation Forest on an empty or None DataFrame.")

        # Determine features
        if columns is None:
            suitable, excluded_ids, excluded_other = cls.identify_suitable_features(df)
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
                is_id, reason = cls.is_id_or_index_column(df[c], c)
                if is_id:
                    excluded_ids.append(f"{c} ({reason})")
                    continue
                num_s = pd.to_numeric(df[c], errors="coerce")
                fin_s = num_s[num_s.notna() & np.isfinite(num_s.to_numpy(dtype=float, na_value=np.nan))]
                if len(fin_s) == 0 or fin_s.nunique() <= 1:
                    excluded_other.append(f"{c} (Constant or all-null)")
                    continue
                suitable.append(c)

        if not suitable:
            raise ValueError(
                "No suitable numeric features are available for Isolation Forest. "
                "Ensure dataset contains valid numerical attributes (ID columns and constants are excluded)."
            )

        preprocessing_notes: List[str] = []
        preprocessing_notes.append(f"Initially selected {len(suitable)} numerical feature(s): {', '.join(suitable)}")

        if excluded_ids:
            preprocessing_notes.append(f"Excluded {len(excluded_ids)} identifier/index columns: {', '.join(excluded_ids)}")
        if excluded_other:
            preprocessing_notes.append(f"Excluded {len(excluded_other)} non-suitable columns: {', '.join(excluded_other)}")

        # Detect and handle exact duplicate numerical features for multivariate modeling
        duplicate_exclusions: List[str] = []
        features_to_fit = list(suitable)

        if exclude_duplicates:
            canonical_to_dups, dup_to_canonical = cls.detect_duplicate_numerical_columns(df, columns=suitable)
            if dup_to_canonical:
                features_to_fit = [c for c in suitable if c not in dup_to_canonical]
                for dup_col, can_col in dup_to_canonical.items():
                    duplicate_exclusions.append(f"{dup_col} (Exact duplicate of canonical feature '{can_col}')")
                    preprocessing_notes.append(
                        f"Excluded duplicate feature '{dup_col}' from multivariate model: exact duplicate of '{can_col}'."
                    )
                preprocessing_notes.append(
                    f"Excluded {len(dup_to_canonical)} exact duplicate feature(s) from multivariate trees to prevent multicollinear inflation."
                )

        if len(features_to_fit) < 2:
            raise ValueError(
                f"Isolation Forest requires at least 2 non-duplicate numerical features for multivariate analysis. "
                f"Found {len(features_to_fit)} eligible feature(s) ({', '.join(features_to_fit)})."
            )

        if len(df) < 5:
            raise ValueError(
                f"Dataset contains only {len(df)} records. Isolation Forest requires at least 5 records to build isolation trees."
            )

        # Construct feature matrix copy for modeling without modifying input DataFrame
        X = df[features_to_fit].copy()

        # Handle missing and infinite values safely
        has_missing = False
        for c in features_to_fit:
            X[c] = pd.to_numeric(X[c], errors="coerce").replace([np.inf, -np.inf], np.nan)
            col_missing = int(X[c].isna().sum())
            if col_missing > 0:
                has_missing = True
                col_median = float(X[c].median())
                if np.isnan(col_median):
                    col_median = 0.0
                X[c] = X[c].fillna(col_median)
                preprocessing_notes.append(
                    f"Imputed {col_missing} missing values in '{c}' using feature median ({round(col_median, 2)})"
                )

        if not has_missing:
            preprocessing_notes.append("No missing values required imputation in feature matrix.")

        # Validate contamination
        contam_val: Union[float, str] = contamination
        if isinstance(contamination, (int, float)):
            contam_val = max(0.001, min(0.5, float(contamination)))
        elif str(contamination).lower() == "auto":
            contam_val = "auto"
        else:
            contam_val = 0.05

        # Fit Isolation Forest
        model = IsolationForest(
            contamination=contam_val,
            random_state=random_state,
            n_estimators=100,
        )
        model.fit(X)

        # Predictions: -1 for anomaly, 1 for normal
        raw_preds = model.predict(X)
        decision_scores = model.decision_function(X)

        # Calibrated anomaly score: 0.0 to 1.0 (higher = more anomalous)
        min_dec = float(np.min(decision_scores))
        max_dec = float(np.max(decision_scores))
        span = max(1e-6, max_dec - min_dec)

        # Normalized anomaly score from 0.0 (safest) to 1.0 (most anomalous)
        normalized_scores = [round(float((max_dec - d) / span), 4) for d in decision_scores]
        raw_decision_list = [round(float(d), 4) for d in decision_scores]

        labels: List[str] = ["Anomaly" if p == -1 else "Normal" for p in raw_preds]
        anomaly_positions: List[int] = [i for i, p in enumerate(raw_preds) if p == -1]
        anomaly_indices: List[Any] = [df.index[i] for i in anomaly_positions]

        anomaly_count = len(anomaly_indices)
        anomaly_pct = round((anomaly_count / max(1, len(df))) * 100, 2)

        return IsolationForestResult(
            dataset_name=dataset_name,
            rows_analyzed=len(df),
            features_used=features_to_fit,
            contamination=float(contam_val) if isinstance(contam_val, (int, float)) else 0.05,
            anomaly_count=anomaly_count,
            anomaly_pct=anomaly_pct,
            anomaly_scores=normalized_scores,
            raw_decision_scores=raw_decision_list,
            anomaly_labels=labels,
            anomaly_indices=anomaly_indices,
            anomaly_positions=anomaly_positions,
            preprocessing_notes=preprocessing_notes,
            excluded_columns=excluded_ids + excluded_other + duplicate_exclusions,
        )

    # =========================================================================
    # 3. DEEP STATISTICAL ANOMALY ANALYSIS
    # =========================================================================

    @classmethod
    def compute_deep_statistics(
        cls,
        df: pd.DataFrame,
        columns: Optional[List[str]] = None,
        dataset_name: str = "dataset",
    ) -> DeepStatisticalResult:
        """Compute comprehensive parametric and non-parametric statistical metrics.

        Calculates:
        - Mean, Median, Std Dev, Variance, Min, Max
        - Q1, Q3, IQR
        - Skewness and Kurtosis
        - Z-score distribution and extreme observation signals (>3σ)
        - Distinguishes 'Statistically Unusual' from 'Confirmed Invalid'
        """
        if df is None or df.empty:
            return DeepStatisticalResult(
                dataset_name=dataset_name,
                total_rows=0,
                columns_analyzed=[],
                column_metrics={},
                unusual_columns_count=0,
            )

        if columns is None:
            suitable, _, _ = cls.identify_suitable_features(df)
            target_cols = suitable
        else:
            target_cols = [c for c in columns if c in df.columns and pd.api.types.is_numeric_dtype(df[c])]

        column_metrics: Dict[str, DeepStatisticalMetric] = {}
        unusual_count = 0

        for col in target_cols:
            s = df[col].dropna()
            count = len(s)
            if count == 0:
                continue

            mean_val = float(s.mean())
            median_val = float(s.median())
            std_val = float(s.std(ddof=1)) if count > 1 else 0.0
            variance_val = float(s.var(ddof=1)) if count > 1 else 0.0
            min_val = float(s.min())
            max_val = float(s.max())
            q1_val = float(s.quantile(0.25))
            q3_val = float(s.quantile(0.75))
            iqr_val = float(q3_val - q1_val)

            # Skewness and Kurtosis
            skew_val = float(s.skew()) if count >= 3 else 0.0
            kurt_val = float(s.kurt()) if count >= 4 else 0.0

            # Z-scores
            signals: List[str] = []
            z_outliers = 0
            z_min = 0.0
            z_max = 0.0

            if std_val > 1e-9:
                z_scores = (s - mean_val) / std_val
                z_outliers_mask = z_scores.abs() > 3.0
                z_outliers = int(z_outliers_mask.sum())
                z_min = round(float(z_scores.min()), 2)
                z_max = round(float(z_scores.max()), 2)

                if z_outliers > 0:
                    signals.append(f"{z_outliers} observations exceed 3 standard deviations (Max Z: {z_max:+.2f})")

            # Check skewness
            if abs(skew_val) > 2.0:
                skew_dir = "Right-skewed" if skew_val > 0 else "Left-skewed"
                signals.append(f"Severe distribution asymmetry: {skew_dir} (skewness: {skew_val:.2f})")
            elif abs(skew_val) > 1.0:
                skew_dir = "moderately right-skewed" if skew_val > 0 else "moderately left-skewed"
                signals.append(f"Distribution is {skew_dir} (skewness: {skew_val:.2f})")

            # Check kurtosis
            if kurt_val > 7.0:
                signals.append(f"Heavy-tailed distribution / leptokurtic tails (kurtosis: {kurt_val:.2f})")

            # Zero IQR check
            if iqr_val == 0.0 and count > 5:
                signals.append("Zero IQR detected: high concentration around median value")

            # Assessment: Statistically Unusual vs Normal
            is_unusual = len(signals) > 0 and (abs(skew_val) > 2.0 or kurt_val > 7.0 or z_outliers > 0)
            assessment = "Statistically Unusual" if is_unusual else "Normal"
            if is_unusual:
                unusual_count += 1
                signals.append("Observations are statistically unusual; review domain context before treating as invalid")

            column_metrics[col] = DeepStatisticalMetric(
                column=col,
                count=count,
                mean=round(mean_val, 4),
                median=round(median_val, 4),
                std=round(std_val, 4),
                variance=round(variance_val, 4),
                min_val=round(min_val, 4),
                max_val=round(max_val, 4),
                q1=round(q1_val, 4),
                q3=round(q3_val, 4),
                iqr=round(iqr_val, 4),
                skewness=round(skew_val, 4),
                kurtosis=round(kurt_val, 4),
                z_outliers_count=z_outliers,
                z_min=z_min,
                z_max=z_max,
                assessment=assessment,
                signals=signals,
            )

        return DeepStatisticalResult(
            dataset_name=dataset_name,
            total_rows=len(df),
            columns_analyzed=target_cols,
            column_metrics=column_metrics,
            unusual_columns_count=unusual_count,
        )

    # =========================================================================
    # 4. MULTIVARIATE OUTLIER DETECTION & ANALYSIS
    # =========================================================================

    @classmethod
    def compute_multivariate_anomalies(
        cls,
        df: pd.DataFrame,
        columns: Optional[List[str]] = None,
        contamination: Union[float, str] = 0.05,
        random_state: int = 42,
        dataset_name: str = "dataset",
    ) -> MultivariateAnalysisResult:
        """Evaluate multidimensional feature relationships and attribute specific anomaly signals.

        Considers joint variable interactions (e.g. Price vs Quantity vs Revenue)
        where a point may be normal in single dimensions but anomalous in combination.
        """
        if df is None or df.empty:
            raise ValueError("Cannot run multivariate anomaly analysis on an empty DataFrame.")

        # Identify features
        if columns is None:
            suitable, _, _ = cls.identify_suitable_features(df)
            selected_features = suitable
        else:
            selected_features = []
            for c in columns:
                if c in df.columns and pd.api.types.is_numeric_dtype(df[c]):
                    is_id, _ = cls.is_id_or_index_column(df[c], c)
                    if not is_id and df[c].dropna().nunique() > 1:
                        selected_features.append(c)

        if len(selected_features) < 2:
            raise ValueError(
                f"Multivariate outlier detection requires at least 2 numerical features to evaluate cross-variable relationships. "
                f"Only {len(selected_features)} suitable feature(s) found ({', '.join(selected_features)})."
            )

        # Run Isolation Forest on joint feature matrix
        if_result = cls.detect_isolation_forest(
            df=df,
            columns=selected_features,
            contamination=contamination,
            random_state=random_state,
            dataset_name=dataset_name,
        )

        # Precompute univariate statistics (mean, std, IQR bounds) for explaining anomaly signals
        feature_stats: Dict[str, Dict[str, float]] = {}
        for feat in selected_features:
            s = df[feat].dropna()
            q1 = float(s.quantile(0.25))
            q3 = float(s.quantile(0.75))
            iqr = float(q3 - q1)
            mean_v = float(s.mean())
            std_v = float(s.std(ddof=1)) if len(s) > 1 else 1.0
            feature_stats[feat] = {
                "mean": mean_v,
                "std": std_v if std_v > 1e-9 else 1.0,
                "q1": q1,
                "q3": q3,
                "iqr": iqr,
                "lower_bound": q1 - (1.5 * iqr),
                "upper_bound": q3 + (1.5 * iqr),
            }

        anomalies: List[MultivariateAnomalyRecord] = []

        for row_idx in if_result.anomaly_indices:
            row = df.loc[row_idx]
            pos = df.index.get_loc(row_idx)
            score = if_result.anomaly_scores[pos]

            feat_vals = {feat: row[feat] for feat in selected_features if feat in row}
            signals: List[str] = []

            # 1. Check univariate IQR boundary violations
            univariate_outliers: List[str] = []
            for feat, val in feat_vals.items():
                if pd.isna(val):
                    signals.append(f"Feature '{feat}' is missing (NaN)")
                    continue
                stats = feature_stats[feat]
                if val > stats["upper_bound"]:
                    univariate_outliers.append(
                        f"'{feat}' ({val:,.2f}) is above IQR upper bound ({stats['upper_bound']:,.2f})"
                    )
                elif val < stats["lower_bound"]:
                    univariate_outliers.append(
                        f"'{feat}' ({val:,.2f}) is below IQR lower bound ({stats['lower_bound']:,.2f})"
                    )

            if univariate_outliers:
                signals.extend(univariate_outliers)

            # 2. Check Z-scores for each feature
            z_signals: List[str] = []
            for feat, val in feat_vals.items():
                if pd.isna(val):
                    continue
                stats = feature_stats[feat]
                z = (val - stats["mean"]) / stats["std"]
                if abs(z) >= 2.5:
                    z_signals.append(f"'{feat}' standard deviation distance is {z:+.2f}σ")

            if z_signals:
                signals.extend(z_signals)

            # 3. Multivariate context signal
            if not univariate_outliers:
                signals.append(
                    "Cross-feature anomaly: Individual feature values are within univariate bounds, "
                    "but their multidimensional combination deviates from normal correlation patterns"
                )

            signals.append(f"Isolation Forest calibrated anomaly score: {score:.3f}")

            anomalies.append(
                MultivariateAnomalyRecord(
                    row_index=row_idx,
                    anomaly_score=score,
                    status="Anomaly",
                    feature_values=feat_vals,
                    signals=signals,
                )
            )

        return MultivariateAnalysisResult(
            dataset_name=dataset_name,
            rows_analyzed=if_result.rows_analyzed,
            features_used=selected_features,
            contamination=if_result.contamination,
            anomaly_count=len(anomalies),
            anomaly_pct=if_result.anomaly_pct,
            anomalies=anomalies,
            all_anomaly_indices=if_result.anomaly_indices,
            preprocessing_notes=if_result.preprocessing_notes,
        )

    # =========================================================================
    # 5. CONTROLLED OUTLIER TREATMENT (NEVER AUTOMATIC DELETE)
    # =========================================================================

    @classmethod
    def apply_treatment(
        cls,
        df: pd.DataFrame,
        treatment_type: str,
        outlier_indices: List[Any],
        columns: Optional[List[str]] = None,
        iqr_bounds: Optional[Dict[str, Tuple[float, float]]] = None,
        dataset_name: str = "dataset",
    ) -> Tuple[pd.DataFrame, AnomalyTreatmentSummary]:
        """Apply controlled, user-authorized outlier treatment.

        Options:
            - 'keep': Retain all records untouched.
            - 'flag_only': Add 'is_outlier' boolean column and 'anomaly_flag' metadata.
            - 'remove_rows': Drop rows identified in outlier_indices.
            - 'cap_values': Clip/Winsorize extreme values to IQR lower and upper bounds for columns.

        Guarantees:
            Original DataFrame is never modified in-place; returns a deep copy.
        """
        if df is None:
            raise ValueError("Cannot apply treatment to a None DataFrame.")

        treated_df = df.copy(deep=True)
        rows_before = len(df)
        cols_treated = columns or []
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        valid_outlier_set = set(outlier_indices).intersection(set(df.index))
        affected_count = len(valid_outlier_set)

        if treatment_type == "keep":
            details = (
                f"Retained all {rows_before:,} records without modification. "
                f"{affected_count:,} flagged outlier observations were marked as valid domain variance."
            )
            summary = AnomalyTreatmentSummary(
                dataset_name=dataset_name,
                treatment_type="keep",
                affected_rows=0,
                rows_before=rows_before,
                rows_after=rows_before,
                columns_treated=[],
                details=details,
                timestamp=now_str,
            )
            return treated_df, summary

        elif treatment_type == "flag_only":
            # Add is_outlier column
            treated_df["is_outlier"] = treated_df.index.isin(valid_outlier_set)
            details = (
                f"Flagged {affected_count:,} outlier records in new boolean column 'is_outlier'. "
                f"No rows or feature values were removed or altered."
            )
            summary = AnomalyTreatmentSummary(
                dataset_name=dataset_name,
                treatment_type="flag_only",
                affected_rows=affected_count,
                rows_before=rows_before,
                rows_after=rows_before,
                columns_treated=cols_treated,
                details=details,
                timestamp=now_str,
            )
            return treated_df, summary

        elif treatment_type == "remove_rows":
            if affected_count == 0:
                details = "No outlier indices matched dataset rows; 0 rows removed."
                summary = AnomalyTreatmentSummary(
                    dataset_name=dataset_name,
                    treatment_type="remove_rows",
                    affected_rows=0,
                    rows_before=rows_before,
                    rows_after=rows_before,
                    columns_treated=cols_treated,
                    details=details,
                    timestamp=now_str,
                )
                return treated_df, summary

            treated_df = treated_df.drop(index=list(valid_outlier_set))
            rows_after = len(treated_df)
            details = (
                f"Removed {affected_count:,} confirmed outlier rows. "
                f"Dataset reduced from {rows_before:,} to {rows_after:,} records."
            )
            summary = AnomalyTreatmentSummary(
                dataset_name=dataset_name,
                treatment_type="remove_rows",
                affected_rows=affected_count,
                rows_before=rows_before,
                rows_after=rows_after,
                columns_treated=cols_treated,
                details=details,
                timestamp=now_str,
            )
            return treated_df, summary

        elif treatment_type == "cap_values":
            # Capping / Winsorization
            if not iqr_bounds and columns:
                # Compute default 1.5 IQR bounds if not passed
                iqr_res = cls.detect_iqr_outliers(df, columns=columns, multiplier=1.5)
                iqr_bounds = {c: (r.lower_bound, r.upper_bound) for c, r in iqr_res.column_results.items()}

            capped_cells = 0
            if iqr_bounds:
                for col, (l_bound, u_bound) in iqr_bounds.items():
                    if col in treated_df.columns and pd.api.types.is_numeric_dtype(treated_df[col]):
                        low_count = int((treated_df[col] < l_bound).sum())
                        high_count = int((treated_df[col] > u_bound).sum())
                        capped_cells += (low_count + high_count)
                        treated_df[col] = treated_df[col].clip(lower=l_bound, upper=u_bound)

            details = (
                f"Winsorized/Capped {capped_cells:,} extreme values across {len(iqr_bounds or {})} column(s) "
                f"to their statistical IQR thresholds. Row count preserved at {rows_before:,}."
            )
            summary = AnomalyTreatmentSummary(
                dataset_name=dataset_name,
                treatment_type="cap_values",
                affected_rows=capped_cells,
                rows_before=rows_before,
                rows_after=rows_before,
                columns_treated=list((iqr_bounds or {}).keys()),
                details=details,
                timestamp=now_str,
            )
            return treated_df, summary

        elif treatment_type in {"replace_median", "median_replace"}:
            cols_to_treat = columns or [c for c in treated_df.columns if pd.api.types.is_numeric_dtype(treated_df[c])]
            modified_cells = 0
            for c in cols_to_treat:
                if c in treated_df.columns and pd.api.types.is_numeric_dtype(treated_df[c]):
                    med_v = float(treated_df[c].median())
                    mask = treated_df.index.isin(valid_outlier_set)
                    cnt = int(mask.sum())
                    if cnt > 0:
                        treated_df.loc[mask, c] = med_v
                        modified_cells += cnt

            details = (
                f"Replaced {modified_cells:,} outlier cells across {len(cols_to_treat)} feature(s) "
                f"with column median values. Row count preserved at {rows_before:,}."
            )
            summary = AnomalyTreatmentSummary(
                dataset_name=dataset_name,
                treatment_type="replace_median",
                affected_rows=modified_cells,
                rows_before=rows_before,
                rows_after=rows_before,
                columns_treated=cols_to_treat,
                details=details,
                timestamp=now_str,
            )
            return treated_df, summary

        elif treatment_type == "winsorize":
            cols_to_treat = columns or [c for c in treated_df.columns if pd.api.types.is_numeric_dtype(treated_df[c])]
            winsor_cells = 0
            for c in cols_to_treat:
                if c in treated_df.columns and pd.api.types.is_numeric_dtype(treated_df[c]):
                    s = treated_df[c].dropna()
                    if len(s) > 0:
                        l_v = float(s.quantile(0.01))
                        u_v = float(s.quantile(0.99))
                        cnt = int(((treated_df[c] < l_v) | (treated_df[c] > u_v)).sum())
                        treated_df[c] = treated_df[c].clip(lower=l_v, upper=u_v)
                        winsor_cells += cnt

            details = (
                f"Winsorized {winsor_cells:,} extreme values across {len(cols_to_treat)} column(s) "
                f"at percentiles [1.0%, 99.0%]. Row count preserved at {rows_before:,}."
            )
            summary = AnomalyTreatmentSummary(
                dataset_name=dataset_name,
                treatment_type="winsorize",
                affected_rows=winsor_cells,
                rows_before=rows_before,
                rows_after=rows_before,
                columns_treated=cols_to_treat,
                details=details,
                timestamp=now_str,
            )
            return treated_df, summary

        elif treatment_type == "investigate":
            details = (
                f"Marked {affected_count:,} flagged records for operational/field investigation. "
                f"All {rows_before:,} records retained without alteration."
            )
            summary = AnomalyTreatmentSummary(
                dataset_name=dataset_name,
                treatment_type="investigate",
                affected_rows=affected_count,
                rows_before=rows_before,
                rows_after=rows_before,
                columns_treated=cols_treated,
                details=details,
                timestamp=now_str,
            )
            return treated_df, summary

        else:
            raise ValueError(f"Unknown treatment type '{treatment_type}'. Must be one of: 'keep', 'flag_only', 'remove_rows', 'cap_values', 'replace_median', 'winsorize', 'investigate'.")

    # =========================================================================
    # PHASE 4 COMPREHENSIVE SUITE METHODS
    # =========================================================================

    @classmethod
    def detect_iqr_anomalies(
        cls,
        df: pd.DataFrame,
        columns: Optional[List[str]] = None,
        multiplier: float = 1.5,
        dataset_name: str = "dataset.csv",
    ) -> IQRAnalysisResult:
        """Alias to detect_iqr_outliers returning IQRAnalysisResult."""
        from analysis.anomaly_detection import detect_iqr_anomalies
        return detect_iqr_anomalies(df=df, columns=columns, multiplier=multiplier, dataset_name=dataset_name)

    @classmethod
    def detect_zscore_anomalies(
        cls,
        df: pd.DataFrame,
        columns: Optional[List[str]] = None,
        threshold: float = 3.0,
        dataset_name: str = "dataset.csv",
    ) -> ZScoreAnalysisResult:
        """Run parametric Z-score anomaly detection."""
        from analysis.anomaly_detection import detect_zscore_anomalies
        return detect_zscore_anomalies(df=df, columns=columns, threshold=threshold, dataset_name=dataset_name)

    @classmethod
    def detect_robust_zscore_anomalies(
        cls,
        df: pd.DataFrame,
        columns: Optional[List[str]] = None,
        threshold: float = 3.5,
        dataset_name: str = "dataset.csv",
    ) -> RobustZScoreAnalysisResult:
        """Run Robust Z-score (MAD) anomaly detection."""
        from analysis.anomaly_detection import detect_robust_zscore_anomalies
        return detect_robust_zscore_anomalies(df=df, columns=columns, threshold=threshold, dataset_name=dataset_name)

    @classmethod
    def detect_isolation_forest_anomalies(
        cls,
        df: pd.DataFrame,
        columns: Optional[List[str]] = None,
        config: Optional[Dict[str, Any]] = None,
        dataset_name: str = "dataset.csv",
    ) -> IsolationForestResult:
        """Fit Isolation Forest model with configuration."""
        from analysis.anomaly_detection import detect_isolation_forest_anomalies
        return detect_isolation_forest_anomalies(df=df, columns=columns, config=config, dataset_name=dataset_name)

    @classmethod
    def combine_anomaly_results(
        cls,
        results: Dict[str, Any],
        df: pd.DataFrame,
        dataset_name: str = "dataset.csv",
    ) -> CombinedAnomalyResult:
        """Aggregate multi-method outputs and calculate agreement and severity."""
        from analysis.anomaly_scoring import combine_anomaly_results
        return combine_anomaly_results(results=results, df=df, dataset_name=dataset_name)

    @classmethod
    def calculate_anomaly_severity(
        cls,
        score: float,
        methods_agreeing: int,
        total_methods: int,
        affected_columns: List[str],
        max_z: float = 0.0,
        has_iqr_outlier: bool = False,
    ) -> Tuple[str, List[str]]:
        """Calculate anomaly severity rating."""
        from analysis.anomaly_scoring import calculate_anomaly_severity
        return calculate_anomaly_severity(
            score=score,
            methods_agreeing=methods_agreeing,
            total_methods=total_methods,
            affected_columns=affected_columns,
            max_z=max_z,
            has_iqr_outlier=has_iqr_outlier,
        )

    @classmethod
    def summarize_anomalies(
        cls, anomaly_results: Union[CombinedAnomalyResult, Dict[str, Any]]
    ) -> AnomalySummary:
        """Generate executive summary of anomaly detection."""
        from analysis.anomaly_utils import summarize_anomalies
        return summarize_anomalies(anomaly_results)

    @classmethod
    def explain_anomaly(
        cls,
        row: Union[pd.Series, Dict[str, Any], Any],
        anomaly_result: Union[CombinedAnomalyResult, Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AnomalyExplanation:
        """Generate deterministic explanation for flagged observation."""
        from analysis.anomaly_utils import explain_anomaly
        return explain_anomaly(row=row, anomaly_result=anomaly_result, metadata=metadata)

    @classmethod
    def apply_anomaly_treatment(
        cls,
        df: pd.DataFrame,
        anomaly_result: Union[CombinedAnomalyResult, Dict[str, Any]],
        treatment_config: Dict[str, Any],
        dataset_name: str = "dataset.csv",
    ) -> Tuple[pd.DataFrame, AnomalyTreatmentSummary]:
        """Apply safe treatment to DataFrame copy."""
        from analysis.anomaly_treatment import apply_anomaly_treatment
        return apply_anomaly_treatment(
            df=df,
            anomaly_result=anomaly_result,
            treatment_config=treatment_config,
            dataset_name=dataset_name,
        )

    @classmethod
    def validate_anomaly_treatment(
        cls,
        df: pd.DataFrame,
        anomaly_result: Union[CombinedAnomalyResult, Dict[str, Any]],
        treatment_config: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Validate treatment config prior to execution."""
        from analysis.anomaly_treatment import validate_anomaly_treatment
        return validate_anomaly_treatment(df=df, anomaly_result=anomaly_result, treatment_config=treatment_config)

    @classmethod
    def run_anomaly_detection(
        cls,
        df: pd.DataFrame,
        dataset_name: str = "dataset.csv",
        methods: Optional[List[str]] = None,
        columns: Optional[List[str]] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Execute full anomaly pipeline orchestrator."""
        from analysis.anomaly_detection import run_anomaly_detection
        return run_anomaly_detection(
            df=df,
            dataset_name=dataset_name,
            methods=methods,
            columns=columns,
            config=config,
        )


# Functional exports for backward and forward compatibility
detect_iqr_anomalies = AnomalyTool.detect_iqr_anomalies
detect_zscore_anomalies = AnomalyTool.detect_zscore_anomalies
detect_robust_zscore_anomalies = AnomalyTool.detect_robust_zscore_anomalies
detect_isolation_forest_anomalies = AnomalyTool.detect_isolation_forest_anomalies
combine_anomaly_results = AnomalyTool.combine_anomaly_results
calculate_anomaly_severity = AnomalyTool.calculate_anomaly_severity
summarize_anomalies = AnomalyTool.summarize_anomalies
explain_anomaly = AnomalyTool.explain_anomaly
apply_anomaly_treatment = AnomalyTool.apply_anomaly_treatment
validate_anomaly_treatment = AnomalyTool.validate_anomaly_treatment
run_anomaly_detection = AnomalyTool.run_anomaly_detection

