"""Feature Selection and Safe Filtering Module.

Categorizes candidate predictors into numeric and categorical features while safely
excluding technical identifiers, row numbers, date coordinates, and leaking variables.
"""

from typing import Dict, Any, List, Optional, Tuple
import pandas as pd

from models.prediction import ProblemType
from analysis.anomaly_utils import AnomalyUtils
from prediction.leakage_detector import LeakageDetector


class FeatureSelector:
    """Selects eligible predictive features and provides transparent exclusion audits."""

    @classmethod
    def select_features(
        cls,
        df: pd.DataFrame,
        target_col: str,
        date_col: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        problem_type: ProblemType = ProblemType.REGRESSION,
    ) -> Tuple[List[str], Dict[str, str], List[str], List[str]]:
        """Filter dataset columns into usable features and categorized lists.

        Returns:
            (features_used, features_excluded, numeric_features, categorical_features)
        """
        if df is None or df.empty:
            return [], {}, [], []

        cfg = config or {}
        feat_cfg = cfg.get("features", {})
        exclude_ids = feat_cfg.get("exclude_identifiers", True)
        exclude_idx = feat_cfg.get("exclude_index_columns", True)
        detect_leak = feat_cfg.get("detect_leakage", True)
        user_selected = feat_cfg.get("selected_features")
        user_excluded = set(feat_cfg.get("excluded_features") or [])

        features_used: List[str] = []
        features_excluded: Dict[str, str] = {}
        candidate_cols = [c for c in df.columns if c != target_col and c != date_col]

        from prediction.leakage_detector import extract_base_column_name

        # First pass: technical artifact, duplicate column, identifier, name, email, and variance filtering
        for col in candidate_cols:
            col_str = str(col)
            col_lower = col_str.strip().lower()
            col_base = extract_base_column_name(col_str)
            col_base_lower = col_base.lower()

            if col_str in user_excluded:
                features_excluded[col_str] = "Explicitly excluded by user."
                continue
            if user_selected is not None and col_str not in user_selected:
                features_excluded[col_str] = "Not selected by user."
                continue

            series = df[col]
            is_explicitly_selected = user_selected is not None and col_str in user_selected

            # 0. Exclude redundant duplicate joined columns (e.g. col_clean_... when base col exists)
            if col_base != col_str and col_base in candidate_cols and col_base not in user_excluded:
                features_excluded[col_str] = f"Duplicate of existing base column '{col_base}'."
                continue

            # 1. Customer names and email addresses exclusion (unless explicitly selected)
            is_name_col = any(
                p in [col_lower, col_base_lower]
                or col_lower.endswith(f"_{p}") or col_base_lower.endswith(f"_{p}")
                or col_lower.startswith(f"{p}_") or col_base_lower.startswith(f"{p}_")
                for p in ["customer_name", "user_name", "client_name", "username", "name", "full_name", "first_name", "last_name"]
            )
            is_email_col = any(
                p in [col_lower, col_base_lower]
                or col_lower.endswith(f"_{p}") or col_base_lower.endswith(f"_{p}")
                or col_lower.startswith(f"{p}_") or col_base_lower.startswith(f"{p}_")
                for p in ["email", "e_mail", "mail"]
            )

            if is_name_col and (not is_explicitly_selected or target_col.lower() in ["quantity", "order_amount", "sales", "amount", "revenue", "price"]):
                features_excluded[col_str] = "Customer name / personal identifier excluded to prevent entity memorization."
                continue
            if is_email_col and (not is_explicitly_selected or target_col.lower() in ["quantity", "order_amount", "sales", "amount", "revenue", "price"]):
                features_excluded[col_str] = "Email address excluded to prevent entity memorization."
                continue

            # Content-based email detection
            if (pd.api.types.is_object_dtype(series) or pd.api.types.is_string_dtype(series)):
                sample_s = series.dropna().astype(str).head(15)
                if len(sample_s) > 0 and (sample_s.str.contains(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", regex=True).mean() >= 0.5):
                    features_excluded[col_str] = "Email address excluded to prevent entity memorization."
                    continue

            # 2. Date / Datetime column exclusion from tabular predictors
            is_date_col = (
                pd.api.types.is_datetime64_any_dtype(series)
                or col_lower.endswith("_date") or col_base_lower.endswith("_date")
                or col_lower.endswith("_time") or col_base_lower.endswith("_time")
                or col_lower in ["date", "time", "timestamp", "datetime", "signup_date", "order_date", "created_at"]
                or col_base_lower in ["date", "time", "timestamp", "datetime", "signup_date", "order_date", "created_at"]
            )
            if is_date_col and not is_explicitly_selected:
                features_excluded[col_str] = "Date/time column excluded from tabular predictor features."
                continue

            # 3. Identifier / Index column exclusion
            is_id, id_reason = AnomalyUtils.is_id_or_index_column(series, col_str)
            if is_id and (exclude_ids or exclude_idx):
                # Do not exclude domain features that have semantic meaning and low/moderate cardinality
                has_semantic = any(kw in col_lower or kw in col_base_lower for kw in [
                    "hour", "study", "exp", "score", "age", "attendance", "grade", "level",
                    "year", "month", "day", "rate", "rank", "val", "step", "count", "num",
                    "store", "dept", "department", "category", "class", "tier", "type",
                    "branch", "zone", "region", "segment", "group"
                ])
                non_null = series.dropna()
                is_low_cardinality = len(non_null) > 0 and (non_null.nunique() / len(non_null) <= 0.4)
                if has_semantic and (is_low_cardinality or "sequential integer" in id_reason.lower()):
                    pass  # Retain as valid domain predictor
                elif not is_explicitly_selected or target_col.lower() in ["quantity", "order_amount", "sales", "amount", "revenue", "price"]:
                    features_excluded[col_str] = id_reason
                    continue

            # 4. Constant / Zero-variance exclusion
            if series.nunique(dropna=True) <= 1:
                features_excluded[col_str] = "Zero variance (constant column)."
                continue

            # 5. Excessive missingness
            missing_pct = (series.isna().sum() / max(1, len(df))) * 100
            if missing_pct > 80.0:
                features_excluded[col_str] = f"Excessive missing values ({missing_pct:.1f}%)."
                continue

            # 6. Exclude metadata/anomaly tracking columns
            if col_str.startswith("_anomaly_") or col_str.startswith("_metadata_"):
                features_excluded[col_str] = "Internal metadata tracking column."
                continue

            features_used.append(col_str)

        # Second pass: Data leakage check (ALWAYS applied to prevent target leakage)
        if detect_leak and features_used:
            leakage_report = LeakageDetector.detect_leakage(
                df=df,
                target_col=target_col,
                feature_cols=features_used,
                problem_type=problem_type,
            )
            for leak_col, reason in leakage_report.flagged_features.items():
                if leak_col in features_used:
                    features_used.remove(leak_col)
                    features_excluded[leak_col] = f"Potential data leakage: {reason}"

        # Sub-divide into numeric and categorical predictors
        numeric_features: List[str] = []
        categorical_features: List[str] = []

        for col in list(features_used):
            series = df[col]
            if pd.api.types.is_numeric_dtype(series):
                numeric_features.append(col)
            elif (
                isinstance(series.dtype, pd.CategoricalDtype)
                or pd.api.types.is_object_dtype(series)
                or pd.api.types.is_string_dtype(series)
            ):
                # Detect dirty numeric features (e.g. 'age' containing numbers mixed with 'unknown' or 'two years')
                non_null_s = series.dropna().astype(str).str.strip()
                cleaned_num_s = non_null_s.str.replace(r"^[\$,₹,€,£]", "", regex=True).str.replace(r"%$", "", regex=True).str.strip()
                parsed_nums = pd.to_numeric(cleaned_num_s, errors="coerce") if len(cleaned_num_s) > 0 else pd.Series(dtype=float)
                valid_num_count = parsed_nums.notna().sum()
                num_ratio = (valid_num_count / len(non_null_s)) if len(non_null_s) > 0 else 0.0

                if len(non_null_s) > 0 and num_ratio >= 0.50 and valid_num_count >= 3:
                    numeric_features.append(col)
                elif series.nunique(dropna=True) <= 50:
                    categorical_features.append(col)
                else:
                    features_used.remove(col)
                    features_excluded[col] = f"High-cardinality categorical ({series.nunique()} unique categories)."
            elif pd.api.types.is_bool_dtype(series):
                categorical_features.append(col)

        return features_used, features_excluded, numeric_features, categorical_features
