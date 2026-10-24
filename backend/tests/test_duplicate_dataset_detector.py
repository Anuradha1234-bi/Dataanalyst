"""Unit and integration tests for Smart Duplicate Dataset Detection."""

import pandas as pd
import numpy as np
import pytest
from services.duplicate_detector import DuplicateDatasetDetector


def test_case_1_two_identical_files_different_filenames():
    """Case 1: Two identical files with different filenames -> Exact Duplicate."""
    df1 = pd.DataFrame({
        "order_id": [101, 102, 103],
        "customer": ["Alice", "Bob", "Charlie"],
        "amount": [50.0, 75.5, 120.0],
    })
    df2 = df1.copy()

    res = DuplicateDatasetDetector.compare_pair(
        df1, df2,
        dataset1_id=1, dataset1_name="sales.csv",
        dataset2_id=2, dataset2_name="sales_backup.csv",
    )
    assert res is not None
    assert res.status == "Exact Duplicate"
    assert res.status_level == "EXACT_DUPLICATE"
    assert res.overlap_percentage == 100.0
    assert res.matching_records == 3
    assert res.unique_to_dataset1 == 0
    assert res.unique_to_dataset2 == 0


def test_case_2_identical_data_rows_reordered():
    """Case 2: Identical data with rows in different order -> Exact Duplicate."""
    df1 = pd.DataFrame({
        "id": [1, 2, 3],
        "name": ["Alpha", "Beta", "Gamma"],
    })
    df2 = pd.DataFrame({
        "id": [3, 1, 2],
        "name": ["Gamma", "Alpha", "Beta"],
    })

    res = DuplicateDatasetDetector.compare_pair(df1, df2)
    assert res is not None
    assert res.status == "Exact Duplicate"
    assert res.overlap_percentage == 100.0
    assert res.matching_records == 3
    assert any("Rows appear in a different order" in d for d in res.differences)


def test_case_3_identical_data_columns_reordered():
    """Case 3: Identical data with columns in different order -> Exact Duplicate."""
    df1 = pd.DataFrame({
        "id": [1, 2],
        "age": [25, 30],
        "city": ["New York", "Chicago"],
    })
    df2 = pd.DataFrame({
        "city": ["New York", "Chicago"],
        "id": [1, 2],
        "age": [25, 30],
    })

    res = DuplicateDatasetDetector.compare_pair(df1, df2)
    assert res is not None
    assert res.status == "Exact Duplicate"
    assert res.overlap_percentage == 100.0
    assert res.matching_records == 2
    assert any("Columns appear in different order" in d for d in res.differences)


def test_case_4_equivalent_data_numeric_float_int_equivalence():
    """Case 4: Equivalent data from different formats (e.g. CSV int vs XLSX float 10.0) -> Exact Duplicate."""
    df1 = pd.DataFrame({
        "id": [1, 2, 3],
        "qty": [10, 20, 30],
    })
    df2 = pd.DataFrame({
        "id": [1.0, 2.0, 3.0],
        "qty": [10.0, 20.0, 30.0],
    })

    res = DuplicateDatasetDetector.compare_pair(df1, df2)
    assert res is not None
    assert res.status == "Exact Duplicate"
    assert res.overlap_percentage == 100.0
    assert res.matching_records == 3


def test_case_5_same_schema_different_records():
    """Case 5: Same schema but completely different records -> No Duplicate (no false positive)."""
    df1 = pd.DataFrame({
        "user_id": [1, 2, 3],
        "email": ["a@example.com", "b@example.com", "c@example.com"],
    })
    df2 = pd.DataFrame({
        "user_id": [4, 5, 6],
        "email": ["x@example.com", "y@example.com", "z@example.com"],
    })

    res = DuplicateDatasetDetector.compare_pair(df1, df2)
    # Should be None because 0 matching records
    assert res is None


def test_case_6_partially_overlapping_datasets():
    """Case 6: Partially overlapping datasets -> Partial Overlap."""
    df1 = pd.DataFrame({
        "id": [1, 2, 3, 4, 5],
        "val": ["A", "B", "C", "D", "E"],
    })
    df2 = pd.DataFrame({
        "id": [4, 5, 6, 7, 8],
        "val": ["D", "E", "F", "G", "H"],
    })

    res = DuplicateDatasetDetector.compare_pair(df1, df2)
    assert res is not None
    assert res.status == "Partial Overlap"
    assert res.status_level == "PARTIAL_OVERLAP"
    assert res.matching_records == 2  # (4, D) and (5, E)
    assert res.unique_to_dataset1 == 3
    assert res.unique_to_dataset2 == 3
    assert res.overlap_percentage == 40.0  # 2 / 5 * 100


def test_case_7_record_multiplicity_repeated_rows():
    """Case 7: Different counts of repeated rows -> Potential Duplicate (NOT Exact Duplicate)."""
    # df1 has row (1, "A") TWICE
    df1 = pd.DataFrame({
        "id": [1, 1, 2],
        "val": ["A", "A", "B"],
    })
    # df2 has row (1, "A") ONCE
    df2 = pd.DataFrame({
        "id": [1, 2],
        "val": ["A", "B"],
    })

    res = DuplicateDatasetDetector.compare_pair(df1, df2)
    assert res is not None
    # Must preserve record multiplicity: differing repeated counts CANNOT be classified as Exact Duplicate
    assert res.status != "Exact Duplicate"
    assert res.status == "Potential Duplicate"
    assert res.matching_records == 2
    assert res.unique_to_dataset1 == 1
    assert res.unique_to_dataset2 == 0
    assert any("multiplicity" in d for d in res.differences)


def test_case_8_datasets_with_missing_values():
    """Case 8: Datasets with missing values -> Handled safely with sentinel."""
    df1 = pd.DataFrame({
        "id": [1, 2, 3],
        "note": ["Hello", None, "World"],
    })
    df2 = pd.DataFrame({
        "id": [1, 2, 3],
        "note": ["Hello", np.nan, "World"],
    })

    res = DuplicateDatasetDetector.compare_pair(df1, df2)
    assert res is not None
    assert res.status == "Exact Duplicate"
    assert res.overlap_percentage == 100.0
    assert res.matching_records == 3


def test_case_9_empty_datasets():
    """Case 9: Empty datasets -> Handled safely."""
    df_empty1 = pd.DataFrame(columns=["a", "b"])
    df_empty2 = pd.DataFrame(columns=["b", "a"])

    res = DuplicateDatasetDetector.compare_pair(df_empty1, df_empty2)
    assert res is not None
    assert res.status == "Exact Duplicate"
    assert res.overlap_percentage == 100.0


def test_case_10_column_names_differ_only_in_case_or_whitespace():
    """Case 10: Column names differing only in case or surrounding whitespace -> Exact Duplicate."""
    df1 = pd.DataFrame({
        " Product_Name ": ["Laptop", "Mouse"],
        "PRICE": [1200.0, 25.0],
    })
    df2 = pd.DataFrame({
        "product_name": ["Laptop", "Mouse"],
        " price ": [1200.0, 25.0],
    })

    res = DuplicateDatasetDetector.compare_pair(df1, df2)
    assert res is not None
    assert res.status == "Exact Duplicate"
    assert res.overlap_percentage == 100.0
    assert res.matching_records == 2


def test_case_11_similar_columns_unrelated_data():
    """Case 11: Similar column names but completely unrelated records -> No duplicate."""
    df1 = pd.DataFrame({
        "customer_id": [101, 102],
        "city": ["Mumbai", "Delhi"],
    })
    df2 = pd.DataFrame({
        "customer_id": [999, 888],
        "city": ["Tokyo", "London"],
    })

    res = DuplicateDatasetDetector.compare_pair(df1, df2)
    assert res is None
