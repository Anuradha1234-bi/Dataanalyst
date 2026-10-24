"""Time Series Feature Engineering and Temporal Sequencing.

Strictly preserves chronological order and generates lag, rolling summary,
and calendar features without allowing future observations to leak into the past.
"""

from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np


class TimeSeriesService:
    """Prepares sequential temporal features and projects future forecast dates."""

    @classmethod
    def prepare_time_series_features(
        cls,
        df: pd.DataFrame,
        date_col: str,
        target_col: str,
        lags: Optional[List[int]] = None,
        rolling_windows: Optional[List[int]] = None,
    ) -> Tuple[pd.DataFrame, List[str], pd.Series, str]:
        """Transform sequential data into lag and calendar features.

        Returns:
            (engineered_df, feature_names, date_series, inferred_frequency)
        """
        if lags is None:
            lags = [1, 2, 3, 7, 14, 30]
        if rolling_windows is None:
            rolling_windows = [7, 14, 30]

        # 1. Parse dates and target, handle duplicate timestamps, and sort chronologically
        df_work = df.copy()
        df_work["_parsed_date"] = pd.to_datetime(df_work[date_col], errors="coerce")
        df_work[target_col] = pd.to_numeric(
            df_work[target_col].astype(str).str.strip().str.replace(r"^[\$,₹,€,£]", "", regex=True).str.replace(r"%$", "", regex=True),
            errors="coerce",
        )
        df_work = df_work.dropna(subset=["_parsed_date", target_col])

        if len(df_work) < 5:
            raise ValueError(
                f"Time-series forecasting requires a valid numeric target and parseable dates. "
                f"Target '{target_col}' contains insufficient numeric data ({len(df_work)} observations, minimum 5 required)."
            )

        # Handle duplicate timestamps by taking chronological mean
        if df_work["_parsed_date"].duplicated().any():
            df_work = df_work.groupby("_parsed_date", as_index=False)[target_col].mean()

        df_work = df_work.sort_values(by="_parsed_date").reset_index(drop=True)

        n_rows = len(df_work)
        feature_cols: List[str] = []

        # 2. Sequential Trend Index (for linear trend projection)
        df_work["trend_index"] = np.arange(n_rows, dtype=float)
        feature_cols.append("trend_index")

        # 3. Calendar temporal features
        df_work["day_of_week"] = df_work["_parsed_date"].dt.dayofweek.astype(float)
        df_work["day_of_month"] = df_work["_parsed_date"].dt.day.astype(float)
        df_work["month"] = df_work["_parsed_date"].dt.month.astype(float)
        df_work["quarter"] = df_work["_parsed_date"].dt.quarter.astype(float)
        feature_cols.extend(["day_of_week", "day_of_month", "month", "quarter"])

        # 4. Lag Features (conditioned on available sequence length)
        for lag in lags:
            if n_rows > lag + 4:
                col_name = f"{target_col}_lag_{lag}"
                df_work[col_name] = df_work[target_col].shift(lag).astype(float)
                feature_cols.append(col_name)

        # 5. Rolling Window Features (strictly shifted by 1 to prevent current-step leakage)
        target_shifted = df_work[target_col].shift(1).astype(float)
        for window in rolling_windows:
            if n_rows > window + 4:
                mean_col = f"{target_col}_roll_mean_{window}"
                std_col = f"{target_col}_roll_std_{window}"
                df_work[mean_col] = target_shifted.rolling(window, min_periods=max(2, window // 2)).mean().astype(float)
                df_work[std_col] = target_shifted.rolling(window, min_periods=max(2, window // 2)).std().astype(float)
                feature_cols.extend([mean_col, std_col])

        # Fill leading edge NaNs from shifts using backfill/median so rows aren't discarded
        median_val = float(df_work[target_col].median()) if not df_work[target_col].empty else 0.0
        df_work[feature_cols] = df_work[feature_cols].bfill().fillna(median_val).fillna(0.0)

        # Infer frequency
        inferred_freq = "daily"
        if n_rows >= 3:
            diff_days = df_work["_parsed_date"].diff().dropna().dt.total_seconds().median() / 86400.0
            if 6.0 <= diff_days <= 8.0:
                inferred_freq = "weekly"
            elif 27.0 <= diff_days <= 32.0:
                inferred_freq = "monthly"
            elif diff_days < 0.5 or diff_days > 35.0:
                inferred_freq = "irregular"

        return df_work, feature_cols, df_work["_parsed_date"], inferred_freq

    @classmethod
    def generate_future_dates(
        cls,
        last_date: pd.Timestamp,
        horizon: int,
        frequency: str = "daily",
    ) -> List[str]:
        """Project future date strings corresponding to the forecast horizon."""
        future_dates: List[str] = []
        curr = last_date

        for _ in range(horizon):
            if frequency == "weekly":
                curr = curr + pd.Timedelta(days=7)
            elif frequency == "monthly":
                # Advance 1 month
                month = curr.month + 1 if curr.month < 12 else 1
                year = curr.year if curr.month < 12 else curr.year + 1
                day = min(curr.day, 28)
                curr = pd.Timestamp(year=year, month=month, day=day)
            else:
                # Default daily or irregular
                curr = curr + pd.Timedelta(days=1)
            future_dates.append(curr.strftime("%Y-%m-%d"))

        return future_dates
