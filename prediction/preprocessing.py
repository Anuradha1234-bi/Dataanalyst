"""Reusable Preprocessing Pipeline Module.

Constructs scikit-learn ColumnTransformer and Pipeline objects for robust handling
of missing values, categorical encoding, and feature scaling without modifying
raw inputs or leaking information between train and validation splits.
"""

from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder


class PreprocessingService:
    """Builds and applies reproducible scikit-learn preprocessing pipelines."""

    @classmethod
    def build_preprocessor(
        cls,
        numeric_features: List[str],
        categorical_features: List[str],
        scale_numeric: bool = False,
    ) -> ColumnTransformer:
        """Construct a scikit-learn ColumnTransformer for tabular features."""
        transformers = []

        if numeric_features:
            num_steps = [("imputer", SimpleImputer(strategy="median"))]
            if scale_numeric:
                num_steps.append(("scaler", StandardScaler()))
            transformers.append(("num", Pipeline(num_steps), numeric_features))

        if categorical_features:
            cat_steps = [
                ("imputer", SimpleImputer(strategy="most_frequent")),
                (
                    "encoder",
                    OneHotEncoder(
                        handle_unknown="ignore",
                        sparse_output=False,
                    ),
                ),
            ]
            transformers.append(("cat", Pipeline(cat_steps), categorical_features))

        return ColumnTransformer(transformers=transformers, remainder="drop")

    @classmethod
    def sanitize_features(
        cls,
        df: pd.DataFrame,
        numeric_features: List[str],
        categorical_features: List[str],
    ) -> pd.DataFrame:
        """Sanitize feature columns: convert invalid strings in numeric features to NaN and normalize categories."""
        if df is None or df.empty:
            return df

        df_out = df.copy()

        # Coerce numeric features: strings like 'unknown', 'two years', '$100', '10%' safely become float or NaN
        for col in numeric_features:
            if col in df_out.columns:
                s = df_out[col].astype(str).str.strip()
                # Clean currency symbols and percentages if present
                s_clean = s.str.replace(r"^[\$,₹,€,£]", "", regex=True).str.replace(r"%$", "", regex=True).str.strip()
                df_out[col] = pd.to_numeric(s_clean, errors="coerce")

        # Normalize categorical features to strings without trailing whitespace
        for col in categorical_features:
            if col in df_out.columns:
                df_out[col] = df_out[col].fillna("missing").astype(str).str.strip()

        return df_out

    @classmethod
    def transform_datasets_with_preprocessor(
        cls,
        X_train: pd.DataFrame,
        X_val: Optional[pd.DataFrame],
        numeric_features: List[str],
        categorical_features: List[str],
        scale_numeric: bool = False,
    ) -> Tuple[np.ndarray, Optional[np.ndarray], List[str], Optional[ColumnTransformer]]:
        """Fit preprocessor on X_train, transform both train and val, extract feature names and return fitted preprocessor."""
        if not numeric_features and not categorical_features:
            return np.empty((len(X_train), 0)), (np.empty((len(X_val), 0)) if X_val is not None else None), [], None

        # Sanitize inputs so invalid string sentinels like 'unknown' are coerced to NaN
        X_train_clean = cls.sanitize_features(X_train, numeric_features, categorical_features)
        X_val_clean = cls.sanitize_features(X_val, numeric_features, categorical_features) if X_val is not None else None

        preprocessor = cls.build_preprocessor(
            numeric_features=numeric_features,
            categorical_features=categorical_features,
            scale_numeric=scale_numeric,
        )

        X_train_proc = preprocessor.fit_transform(X_train_clean)
        X_val_proc = preprocessor.transform(X_val_clean) if X_val_clean is not None and not X_val_clean.empty else None

        # Extract output feature names
        feature_names: List[str] = []
        try:
            feature_names = list(preprocessor.get_feature_names_out())
            # Clean "num__" and "cat__" prefixes for user-facing transparency
            feature_names = [f.replace("num__", "").replace("cat__", "") for f in feature_names]
        except Exception:
            feature_names = numeric_features + [f"{c}_encoded" for c in categorical_features]

        return X_train_proc, X_val_proc, feature_names, preprocessor

    @classmethod
    def transform_datasets(
        cls,
        X_train: pd.DataFrame,
        X_val: Optional[pd.DataFrame],
        numeric_features: List[str],
        categorical_features: List[str],
        scale_numeric: bool = False,
    ) -> Tuple[np.ndarray, Optional[np.ndarray], List[str]]:
        """Fit preprocessor on X_train, transform both train and val, and extract feature names."""
        X_train_proc, X_val_proc, feature_names, _ = cls.transform_datasets_with_preprocessor(
            X_train=X_train,
            X_val=X_val,
            numeric_features=numeric_features,
            categorical_features=categorical_features,
            scale_numeric=scale_numeric,
        )
        return X_train_proc, X_val_proc, feature_names

