"""Anomaly Utilities - Feature suitability, ID filtering, anomaly summaries, and deterministic explanations."""

from typing import Dict, Any, List, Optional, Tuple, Union
import re
from datetime import datetime
import numpy as np
import pandas as pd

from models.anomaly import (
    CombinedAnomalyResult,
    SingleAnomalyRecord,
    AnomalySummary,
    AnomalyExplanation,
)


class AnomalyUtils:
    """Helper utilities for tabular feature suitability, filtering, and explanation."""

    ID_REGEX = re.compile(
        r"^(id|index|row_?num(ber)?|row_?id|record_?id|trans(action)?_?id|order_?id|cust(omer)?_?id|user_?id|account_?id|invoice_?id|client_?id|patient_?id|employee_?id|member_?id|student_?id|product_?id|item_?id|sku(_?id)?|store_?id|vendor_?id|session_?id|device_?id)$",
        re.IGNORECASE,
    )

    ID_SUFFIX_REGEX = re.compile(
        r"(_id|id|_pk|_fk|_key|_code)$",
        re.IGNORECASE,
    )

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
        """Determine whether a column represents an ID, index, or technical artifact."""
        col_clean = str(col_name).strip()
        col_lower = col_clean.lower()
        col_base = cls.get_column_base_name(col_clean)
        col_base_lower = col_base.lower()

        # 1. Unnamed or obvious index column
        if col_lower.startswith("unnamed") or col_lower in ("index", "level_0") or col_base_lower in ("index", "level_0"):
            return True, "Automated or unnamed CSV index column"

        # 2. Obvious ID names
        if cls.ID_REGEX.match(col_lower) or cls.ID_REGEX.match(col_base_lower):
            return True, f"Identified as identifier column by name pattern '{col_name}'"

        if (cls.ID_SUFFIX_REGEX.search(col_lower) or cls.ID_SUFFIX_REGEX.search(col_base_lower)) and not any(
            val_kw in col_lower for val_kw in ["paid", "valid", "pyramid", "fluid", "solid", "rapid", "grid", "humid", "lipid", "acid", "hybrid"]
        ):
            non_null = series.dropna()
            if len(non_null) > 0 and (non_null.nunique() / len(non_null)) > 0.4:
                return True, f"High-cardinality identifier ending with ID/Code suffix ('{col_name}')"

        # 3. Monotonically increasing sequential integers (1, 2, 3...)
        non_null = series.dropna()
        if len(non_null) >= 5 and pd.api.types.is_numeric_dtype(series):
            try:
                int_check = (non_null == non_null.round()).all()
                if int_check:
                    diffs = non_null.diff().dropna()
                    if len(diffs) > 0 and (diffs == 1).all() and non_null.nunique() == len(non_null):
                        return True, "Strictly sequential integer index (1, 2, 3...)"
            except Exception:
                pass

        # 4. 100% unique integer sequence with reference name
        if pd.api.types.is_numeric_dtype(series) and len(non_null) >= 10:
            if non_null.nunique() == len(series) and (non_null == non_null.round()).all():
                if any(w in col_lower for w in ["num", "no", "code", "key", "ref"]) or any(w in col_base_lower for w in ["num", "no", "code", "key", "ref"]):
                    return True, "100% unique integer sequence with reference name"

        return False, ""

    @classmethod
    def identify_suitable_features(
        cls, df: pd.DataFrame
    ) -> Tuple[List[str], List[str], List[str]]:
        """Identify suitable numeric features, excluded ID columns, and excluded non-numeric features.

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

    @classmethod
    def summarize_anomalies(
        cls, anomaly_results: Union[CombinedAnomalyResult, Dict[str, Any]]
    ) -> AnomalySummary:
        """Create a clean executive summary container from combined anomaly results."""
        if isinstance(anomaly_results, CombinedAnomalyResult):
            top_anoms = []
            for rec in sorted(anomaly_results.records, key=lambda x: x.score, reverse=True)[:10]:
                top_anoms.append({
                    "row_index": rec.row_index,
                    "affected_columns": rec.affected_columns,
                    "score": rec.score,
                    "severity": rec.severity,
                    "methods": rec.methods,
                    "agreement": rec.agreement_ratio_str,
                })

            return AnomalySummary(
                dataset_name=anomaly_results.dataset_name,
                total_rows=anomaly_results.total_rows,
                normal_count=anomaly_results.normal_count,
                anomaly_count=anomaly_results.anomaly_count,
                anomaly_percentage=anomaly_results.anomaly_percentage,
                affected_columns=anomaly_results.affected_columns,
                methods_used=anomaly_results.methods_used,
                severity_breakdown=anomaly_results.severity_breakdown,
                top_anomalies=top_anoms,
                timestamp=anomaly_results.timestamp,
            )

        # If a dictionary was passed
        d_name = anomaly_results.get("dataset", "dataset")
        total = int(anomaly_results.get("total_rows", anomaly_results.get("rows", 0)))
        anom_cnt = int(anomaly_results.get("anomaly_count", anomaly_results.get("summary", {}).get("anomaly_count", 0)))
        normal_cnt = total - anom_cnt
        pct = float(anomaly_results.get("anomaly_percentage", anomaly_results.get("summary", {}).get("anomaly_percentage", 0.0)))
        aff_cols = anomaly_results.get("affected_columns", [])
        methods = anomaly_results.get("methods", [])

        return AnomalySummary(
            dataset_name=d_name,
            total_rows=total,
            normal_count=normal_cnt,
            anomaly_count=anom_cnt,
            anomaly_percentage=pct,
            affected_columns=aff_cols,
            methods_used=methods,
            severity_breakdown=anomaly_results.get("severity_breakdown", {}),
            top_anomalies=[],
        )

    @classmethod
    def explain_anomaly(
        cls,
        row: Union[pd.Series, Dict[str, Any], Any],
        anomaly_result: Union[CombinedAnomalyResult, Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AnomalyExplanation:
        """Construct a deterministic, grounded explanation for a specific flagged observation.

        Guarantees:
        - Uses actual computed boundaries and deviations.
        - NEVER invents real-world causal stories (e.g. "sales rose because of demand").
        - Distinctly conveys evidence and limitations.
        """
        row_idx = getattr(row, "name", None) if hasattr(row, "name") else (row.get("_row_index") if isinstance(row, dict) else row)
        dataset_name = getattr(anomaly_result, "dataset_name", "dataset") if hasattr(anomaly_result, "dataset_name") else anomaly_result.get("dataset", "dataset")

        # Find matching SingleAnomalyRecord if available
        matched_rec: Optional[SingleAnomalyRecord] = None
        if hasattr(anomaly_result, "records"):
            for r in anomaly_result.records:
                if str(r.row_index) == str(row_idx):
                    matched_rec = r
                    break

        if matched_rec:
            ev_items = list(matched_rec.signals)
            signals_summary = f" Signals: {'; '.join(matched_rec.signals)}." if matched_rec.signals else ""
            exp_text = (
                f"Row {matched_rec.row_index} in '{dataset_name}' was flagged as a {matched_rec.severity} severity anomaly "
                f"by {len(matched_rec.methods)} detection method(s) ({', '.join(matched_rec.methods)}) with agreement {matched_rec.agreement_ratio_str} "
                f"and composite anomaly score {matched_rec.score:.3f}. "
                f"Affected column(s): {', '.join(matched_rec.affected_columns)}.{signals_summary}"
            )

            return AnomalyExplanation(
                row_index=matched_rec.row_index,
                dataset_name=dataset_name,
                affected_columns=matched_rec.affected_columns,
                original_values=matched_rec.original_values,
                expected_ranges=matched_rec.expected_ranges,
                actual_values=matched_rec.original_values,
                deviations=matched_rec.deviations,
                methods=matched_rec.methods,
                score=matched_rec.score,
                severity=matched_rec.severity,
                agreement_str=matched_rec.agreement_ratio_str,
                explanation_text=exp_text,
                evidence_items=ev_items,
            )

        # Fallback if no specific record found
        vals = dict(row) if hasattr(row, "items") else {}
        return AnomalyExplanation(
            row_index=row_idx,
            dataset_name=dataset_name,
            affected_columns=[],
            original_values=vals,
            expected_ranges={},
            actual_values=vals,
            deviations={},
            methods=[],
            score=0.0,
            severity="LOW",
            agreement_str="0/0",
            explanation_text=f"Observation {row_idx} is within standard statistical bounds.",
            evidence_items=["No anomaly boundary violations detected."],
        )


# Functional aliases for external imports
identify_suitable_features = AnomalyUtils.identify_suitable_features
is_id_or_index_column = AnomalyUtils.is_id_or_index_column
summarize_anomalies = AnomalyUtils.summarize_anomalies
explain_anomaly = AnomalyUtils.explain_anomaly
