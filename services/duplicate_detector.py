"""Duplicate Dataset Detector Service - Content-based Tabular Comparison Engine.

Detects exact duplicates, potential duplicates, and partial overlaps across uploaded
datasets by analyzing actual tabular contents, independent of filenames, row ordering,
and column ordering. Preserves record multiplicity and normalizes safe differences.
"""

from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Tuple, Set
import math
import numpy as np
import pandas as pd


@dataclass
class DuplicatePairResult:
    """Detailed audit metrics and classification for a pair of evaluated datasets."""
    pair_id: str
    dataset1_id: int
    dataset1_name: str
    dataset1_rows: int
    dataset1_columns: int
    dataset2_id: int
    dataset2_name: str
    dataset2_rows: int
    dataset2_columns: int
    status: str            # "Exact Duplicate", "Potential Duplicate", "Partial Overlap"
    status_level: str      # "EXACT_DUPLICATE", "POTENTIAL_DUPLICATE", "PARTIAL_OVERLAP"
    overlap_percentage: float
    matching_records: int
    unique_to_dataset1: int
    unique_to_dataset2: int
    shared_columns: List[str]
    unmatched_columns_dataset1: List[str]
    unmatched_columns_dataset2: List[str]
    calculation_method: str
    comparison_method: str
    differences: List[str]
    sample_differences_dataset1: List[Dict[str, Any]] = field(default_factory=list)
    sample_differences_dataset2: List[Dict[str, Any]] = field(default_factory=list)
    user_status: str = "PENDING"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.pair_id,
            "dataset1_id": self.dataset1_id,
            "dataset1_name": self.dataset1_name,
            "dataset1_rows": self.dataset1_rows,
            "dataset1_columns": self.dataset1_columns,
            "dataset2_id": self.dataset2_id,
            "dataset2_name": self.dataset2_name,
            "dataset2_rows": self.dataset2_rows,
            "dataset2_columns": self.dataset2_columns,
            "status": self.status,
            "status_level": self.status_level,
            "overlap_percentage": self.overlap_percentage,
            "matching_records": self.matching_records,
            "unique_to_dataset1": self.unique_to_dataset1,
            "unique_to_dataset2": self.unique_to_dataset2,
            "shared_columns": self.shared_columns,
            "unmatched_columns_dataset1": self.unmatched_columns_dataset1,
            "unmatched_columns_dataset2": self.unmatched_columns_dataset2,
            "calculation_method": self.calculation_method,
            "comparison_method": self.comparison_method,
            "differences": self.differences,
            "sample_differences_dataset1": self.sample_differences_dataset1,
            "sample_differences_dataset2": self.sample_differences_dataset2,
            "user_status": self.user_status,
        }


class DuplicateDatasetDetector:
    """Safe, content-driven comparison engine for detecting duplicate datasets."""

    @classmethod
    def _canonicalize_cell(cls, val: Any) -> Tuple[str, Any]:
        """Convert any cell value into a stable, comparable canonical representation.

        Preserves types while normalizing safe cross-format artifacts (e.g. float 10.0 vs int 10).
        """
        if val is None or pd.isna(val):
            return ("__NULL__", None)

        # Handle boolean
        if isinstance(val, (bool, np.bool_)):
            return ("__BOOL__", bool(val))

        # Handle numeric values
        if isinstance(val, (int, np.integer)):
            return ("__NUM__", int(val))

        if isinstance(val, (float, np.floating)):
            if math.isnan(val):
                return ("__NULL__", None)
            if math.isinf(val):
                return ("__INF__", 1 if val > 0 else -1)
            # If float is exactly an integer e.g. 10.0 from CSV/XLSX
            if val.is_integer():
                return ("__NUM__", int(val))
            # Round float up to 8 decimals to mitigate floating-point engine epsilon discrepancies
            return ("__FLOAT__", round(float(val), 8))

        # Handle datetime / timestamp
        if isinstance(val, (pd.Timestamp, np.datetime64)):
            try:
                ts = pd.to_datetime(val)
                return ("__DATE__", ts.strftime("%Y-%m-%d %H:%M:%S"))
            except Exception:
                pass

        # String representation - strip surrounding whitespace
        s = str(val).strip()
        # Check if string is a pure number or null-like token
        s_lower = s.lower()
        if s_lower in {"nan", "null", "none", ""}:
            # Don't silently convert real string "null" to None unless explicitly empty string
            if s == "":
                return ("__NULL__", None)

        return ("__STR__", s)

    @classmethod
    def _normalize_columns(cls, columns: List[str]) -> Tuple[Dict[str, str], List[str]]:
        """Normalize column names by stripping surrounding whitespace and lowercasing.

        Returns:
            mapping: { normalized_name: original_name }
            normalized_list: list of normalized names in original order
        """
        mapping: Dict[str, str] = {}
        normalized_list: List[str] = []
        for col in columns:
            clean = str(col).strip().lower()
            # If column name collision exists internally, append index suffix
            if clean in mapping:
                clean = f"{clean}__dup_{len(normalized_list)}"
            mapping[clean] = str(col)
            normalized_list.append(clean)
        return mapping, normalized_list

    @classmethod
    def _build_canonical_row(
        cls,
        row_series: pd.Series,
        col_mapping: Dict[str, str],
        shared_cols: List[str],
    ) -> Tuple[Any, ...]:
        """Convert a row into a tuple of canonical cells ordered by sorted shared_cols."""
        cells = []
        for norm_col in shared_cols:
            orig_col = col_mapping[norm_col]
            val = row_series[orig_col]
            cells.append(cls._canonicalize_cell(val))
        return tuple(cells)

    @classmethod
    def compare_pair(
        cls,
        df1: pd.DataFrame,
        df2: pd.DataFrame,
        dataset1_id: int = 1,
        dataset1_name: str = "Dataset 1",
        dataset2_id: int = 2,
        dataset2_name: str = "Dataset 2",
    ) -> Optional[DuplicatePairResult]:
        """Deep tabular comparison between two datasets.

        Returns DuplicatePairResult if exact duplicate, potential duplicate, or partial overlap.
        Returns None if no meaningful duplication or overlap detected.
        """
        pair_id = f"dup_{min(dataset1_id, dataset2_id)}_{max(dataset1_id, dataset2_id)}"

        rows1_count = len(df1)
        cols1_count = len(df1.columns)
        rows2_count = len(df2)
        cols2_count = len(df2.columns)

        # 1. Normalize column schemas
        col_map1, norm_cols1 = cls._normalize_columns(list(df1.columns))
        col_map2, norm_cols2 = cls._normalize_columns(list(df2.columns))

        set_cols1 = set(norm_cols1)
        set_cols2 = set(norm_cols2)

        shared_cols = sorted(list(set_cols1 & set_cols2))
        unmatched_cols1 = [col_map1[c] for c in sorted(list(set_cols1 - set_cols2))]
        unmatched_cols2 = [col_map2[c] for c in sorted(list(set_cols2 - set_cols1))]

        same_schema = (len(unmatched_cols1) == 0 and len(unmatched_cols2) == 0 and len(shared_cols) > 0)
        schema_jaccard = (
            len(shared_cols) / max(len(set_cols1 | set_cols2), 1)
            if (set_cols1 or set_cols2)
            else 0.0
        )

        # 2. Handle empty datasets
        if rows1_count == 0 and rows2_count == 0:
            if same_schema:
                return DuplicatePairResult(
                    pair_id=pair_id,
                    dataset1_id=dataset1_id,
                    dataset1_name=dataset1_name,
                    dataset1_rows=0,
                    dataset1_columns=cols1_count,
                    dataset2_id=dataset2_id,
                    dataset2_name=dataset2_name,
                    dataset2_rows=0,
                    dataset2_columns=cols2_count,
                    status="Exact Duplicate",
                    status_level="EXACT_DUPLICATE",
                    overlap_percentage=100.0,
                    matching_records=0,
                    unique_to_dataset1=0,
                    unique_to_dataset2=0,
                    shared_columns=[col_map1[c] for c in shared_cols],
                    unmatched_columns_dataset1=[],
                    unmatched_columns_dataset2=[],
                    calculation_method="Zero-record schema alignment (both datasets are empty schemas).",
                    comparison_method="Schema equality with case-insensitive, whitespace-trimmed column matching.",
                    differences=["Both datasets are empty (0 records) with identical column headers."],
                )
            return None

        if len(shared_cols) == 0:
            # Completely disjoint schemas
            return None

        # 3. Canonical row conversion and multiset frequency counters
        canonical_rows1: List[Tuple[Any, ...]] = []
        for idx in range(rows1_count):
            row_tuple = cls._build_canonical_row(df1.iloc[idx], col_map1, shared_cols)
            canonical_rows1.append(row_tuple)

        canonical_rows2: List[Tuple[Any, ...]] = []
        for idx in range(rows2_count):
            row_tuple = cls._build_canonical_row(df2.iloc[idx], col_map2, shared_cols)
            canonical_rows2.append(row_tuple)

        counter1 = Counter(canonical_rows1)
        counter2 = Counter(canonical_rows2)

        # Calculate exact matching records respecting multiplicity
        matching_records = 0
        common_row_keys = set(counter1.keys()) & set(counter2.keys())
        for r_key in common_row_keys:
            matching_records += min(counter1[r_key], counter2[r_key])

        unique_to_dataset1 = rows1_count - matching_records
        unique_to_dataset2 = rows2_count - matching_records

        # Overlap percentage relative to the larger dataset capacity
        max_rows = max(rows1_count, rows2_count)
        if max_rows > 0:
            overlap_pct = round((matching_records / max_rows) * 100.0, 2)
        else:
            overlap_pct = 100.0 if same_schema else 0.0

        # Differences audit log
        differences: List[str] = []

        # Check column name case/whitespace differences
        orig_cols1 = list(df1.columns)
        orig_cols2 = list(df2.columns)
        if orig_cols1 != orig_cols2:
            if sorted([c.strip().lower() for c in orig_cols1]) == sorted([c.strip().lower() for c in orig_cols2]):
                if [c.strip().lower() for c in orig_cols1] != [c.strip().lower() for c in orig_cols2]:
                    differences.append("Columns appear in different order across datasets (safely aligned).")
                else:
                    differences.append("Column headers differ only in casing or surrounding whitespace (safely normalized).")
            else:
                if unmatched_cols1:
                    differences.append(f"Columns unique to {dataset1_name}: {', '.join(unmatched_cols1)}.")
                if unmatched_cols2:
                    differences.append(f"Columns unique to {dataset2_name}: {', '.join(unmatched_cols2)}.")

        # Check row ordering
        if matching_records == rows1_count == rows2_count and same_schema:
            if canonical_rows1 != canonical_rows2:
                differences.append("Rows appear in a different order (safely resolved by multiset analysis).")

        if unique_to_dataset1 > 0:
            differences.append(f"{unique_to_dataset1} record(s) in {dataset1_name} do not match {dataset2_name}.")
        if unique_to_dataset2 > 0:
            differences.append(f"{unique_to_dataset2} record(s) in {dataset2_name} do not match {dataset1_name}.")

        # Multiplicity check: repeated rows difference
        if same_schema and set(counter1.keys()) == set(counter2.keys()) and rows1_count != rows2_count:
            differences.append("Record multiplicity differs: one dataset contains different repetitions of otherwise identical records.")

        # Extract sample differing rows (up to 5 for each)
        sample_diff1: List[Dict[str, Any]] = []
        sample_diff2: List[Dict[str, Any]] = []

        unmatched_tuples1 = set(counter1.keys()) - set(counter2.keys())
        for idx in range(rows1_count):
            if len(sample_diff1) >= 5:
                break
            if canonical_rows1[idx] in unmatched_tuples1:
                sample_diff1.append({k: (None if pd.isna(v) else v) for k, v in df1.iloc[idx].to_dict().items()})

        unmatched_tuples2 = set(counter2.keys()) - set(counter1.keys())
        for idx in range(rows2_count):
            if len(sample_diff2) >= 5:
                break
            if canonical_rows2[idx] in unmatched_tuples2:
                sample_diff2.append({k: (None if pd.isna(v) else v) for k, v in df2.iloc[idx].to_dict().items()})

        # 4. Classification
        calculation_formula = (
            f"Overlap % = (matching_records / max(rows1, rows2)) * 100 "
            f"-> ({matching_records} / {max_rows}) * 100 = {overlap_pct}%"
        )
        comparison_method_desc = (
            "Exact multiset cell-by-cell row hashing with case-insensitive, "
            "whitespace-trimmed column alignment and type-safe value canonicalization."
        )

        # EXACT DUPLICATE
        if same_schema and rows1_count == rows2_count and matching_records == rows1_count and unique_to_dataset1 == 0 and unique_to_dataset2 == 0:
            status = "Exact Duplicate"
            status_level = "EXACT_DUPLICATE"
            if not differences:
                differences.append("100% exact match across all columns and records.")

            return DuplicatePairResult(
                pair_id=pair_id,
                dataset1_id=dataset1_id,
                dataset1_name=dataset1_name,
                dataset1_rows=rows1_count,
                dataset1_columns=cols1_count,
                dataset2_id=dataset2_id,
                dataset2_name=dataset2_name,
                dataset2_rows=rows2_count,
                dataset2_columns=cols2_count,
                status=status,
                status_level=status_level,
                overlap_percentage=100.0,
                matching_records=matching_records,
                unique_to_dataset1=0,
                unique_to_dataset2=0,
                shared_columns=[col_map1[c] for c in shared_cols],
                unmatched_columns_dataset1=[],
                unmatched_columns_dataset2=[],
                calculation_method=calculation_formula,
                comparison_method=comparison_method_desc,
                differences=differences,
                sample_differences_dataset1=[],
                sample_differences_dataset2=[],
            )

        # POTENTIAL DUPLICATE (>= 80% overlap or high schema overlap with high record overlap,
        # or same schema where all distinct records match but multiplicity differs)
        is_potential = (
            (same_schema and overlap_pct >= 80.0)
            or (schema_jaccard >= 0.8 and overlap_pct >= 80.0)
            or (same_schema and set(counter1.keys()) == set(counter2.keys()) and matching_records > 0)
        )

        if is_potential and matching_records > 0:
            status = "Potential Duplicate"
            status_level = "POTENTIAL_DUPLICATE"
            return DuplicatePairResult(
                pair_id=pair_id,
                dataset1_id=dataset1_id,
                dataset1_name=dataset1_name,
                dataset1_rows=rows1_count,
                dataset1_columns=cols1_count,
                dataset2_id=dataset2_id,
                dataset2_name=dataset2_name,
                dataset2_rows=rows2_count,
                dataset2_columns=cols2_count,
                status=status,
                status_level=status_level,
                overlap_percentage=overlap_pct,
                matching_records=matching_records,
                unique_to_dataset1=unique_to_dataset1,
                unique_to_dataset2=unique_to_dataset2,
                shared_columns=[col_map1[c] for c in shared_cols],
                unmatched_columns_dataset1=unmatched_cols1,
                unmatched_columns_dataset2=unmatched_cols2,
                calculation_method=calculation_formula,
                comparison_method=comparison_method_desc,
                differences=differences,
                sample_differences_dataset1=sample_diff1,
                sample_differences_dataset2=sample_diff2,
            )

        # PARTIAL OVERLAP (> 0 matching records, but below 80%)
        if matching_records > 0 and overlap_pct >= 10.0:
            status = "Partial Overlap"
            status_level = "PARTIAL_OVERLAP"
            return DuplicatePairResult(
                pair_id=pair_id,
                dataset1_id=dataset1_id,
                dataset1_name=dataset1_name,
                dataset1_rows=rows1_count,
                dataset1_columns=cols1_count,
                dataset2_id=dataset2_id,
                dataset2_name=dataset2_name,
                dataset2_rows=rows2_count,
                dataset2_columns=cols2_count,
                status=status,
                status_level=status_level,
                overlap_percentage=overlap_pct,
                matching_records=matching_records,
                unique_to_dataset1=unique_to_dataset1,
                unique_to_dataset2=unique_to_dataset2,
                shared_columns=[col_map1[c] for c in shared_cols],
                unmatched_columns_dataset1=unmatched_cols1,
                unmatched_columns_dataset2=unmatched_cols2,
                calculation_method=calculation_formula,
                comparison_method=comparison_method_desc,
                differences=differences,
                sample_differences_dataset1=sample_diff1,
                sample_differences_dataset2=sample_diff2,
            )

        # No meaningful duplicate or overlap
        return None

    @classmethod
    def detect_all_duplicates(
        cls,
        dfs: Dict[str, pd.DataFrame],
        metadata_map: Optional[Dict[str, Any]] = None,
    ) -> List[DuplicatePairResult]:
        """Evaluate all pairwise combinations of loaded datasets and detect duplicate pairs."""
        keys = list(dfs.keys())
        results: List[DuplicatePairResult] = []

        if len(keys) < 2:
            return results

        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                k1 = keys[i]
                k2 = keys[j]
                df1 = dfs[k1]
                df2 = dfs[k2]

                # Resolve IDs and filenames
                ds1_id = 1
                ds1_name = k1
                ds2_id = 2
                ds2_name = k2

                if metadata_map:
                    m1 = metadata_map.get(k1)
                    m2 = metadata_map.get(k2)
                    if m1:
                        ds1_id = getattr(m1, "id", 1)
                        ds1_name = getattr(m1, "filename", getattr(m1, "original_filename", k1))
                    if m2:
                        ds2_id = getattr(m2, "id", 2)
                        ds2_name = getattr(m2, "filename", getattr(m2, "original_filename", k2))
                else:
                    if "::" in k1:
                        parts = k1.split("::", 1)
                        ds1_id = int(parts[0]) if parts[0].isdigit() else 1
                        ds1_name = parts[1]
                    if "::" in k2:
                        parts = k2.split("::", 1)
                        ds2_id = int(parts[0]) if parts[0].isdigit() else 2
                        ds2_name = parts[1]

                pair_res = cls.compare_pair(
                    df1=df1,
                    df2=df2,
                    dataset1_id=ds1_id,
                    dataset1_name=ds1_name,
                    dataset2_id=ds2_id,
                    dataset2_name=ds2_name,
                )
                if pair_res is not None:
                    results.append(pair_res)

        # Sort results: EXACT_DUPLICATE first, then POTENTIAL_DUPLICATE, then PARTIAL_OVERLAP; then by overlap_percentage desc
        order_rank = {"EXACT_DUPLICATE": 0, "POTENTIAL_DUPLICATE": 1, "PARTIAL_OVERLAP": 2}
        results.sort(key=lambda r: (order_rank.get(r.status_level, 3), -r.overlap_percentage))
        return results
