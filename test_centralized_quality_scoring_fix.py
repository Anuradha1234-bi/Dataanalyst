import sys
import unittest
import tempfile
import shutil
from pathlib import Path

# Add backend directory to path
backend_path = Path(__file__).resolve().parent / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

import pandas as pd
import numpy as np

from app.models.dataset import Dataset
from app.services.quality_service import DataQualityService
from app.services.cleaning_service import DataCleaningService
from app.schemas.cleaning import CleaningOperationsRequest, MissingImputationConfig, DateCleaningConfig
from agents.profiler import ProfilerAgent


class TestCentralizedQualityScoring(unittest.TestCase):

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.dir_path = Path(self.temp_dir)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_01_consistent_quality_score_between_profiler_and_quality_service(self):
        """Verify that DataQualityService and ProfilerAgent yield the exact same score."""
        # Create dataset with 1 constant column and some values, identical to clean_customer_orders
        df = pd.DataFrame({
            "Customer_ID": list(range(1, 51)),
            "Order_Amount_INR": [1500.0 + i * 10 for i in range(50)],
            "State": ["Maharashtra"] * 50,  # 1 constant column
            "Category": ["Electronics" if i % 2 == 0 else "Apparel" for i in range(50)],
        })

        q_score, q_status, _, _ = DataQualityService.calculate_quality_score(df)
        prof_res = ProfilerAgent.profile_dataset(df)

        # Both must produce identical 92 score (100 - 8 pts for 1 constant column)
        self.assertEqual(q_score, 92.0)
        self.assertEqual(prof_res.quality.health_score, 92)
        self.assertEqual(int(round(q_score)), prof_res.quality.health_score)
        print(f"  [PASS] QualityService ({q_score}) and ProfilerAgent ({prof_res.quality.health_score}) are 100% consistent.")

    def test_02_original_vs_cleaned_version_handling(self):
        """Verify that analyze_dataset_quality evaluates cleaned file when active=True and original when active=False."""
        orig_file = self.dir_path / "orders_orig.csv"
        clean_file = self.dir_path / "orders_clean.csv"

        # Original has 5 missing values
        df_orig = pd.DataFrame({
            "id": list(range(1, 21)),
            "amount": [100.0] * 15 + [np.nan] * 5,  # 5 missing
        })
        df_orig.to_csv(orig_file, index=False)

        # Cleaned has 0 missing values
        df_clean = pd.DataFrame({
            "id": list(range(1, 21)),
            "amount": [100.0] * 20,
        })
        df_clean.to_csv(clean_file, index=False)

        mock_dataset = Dataset(
            id=999,
            filename="orders_orig.csv",
            file_path=str(orig_file),
            file_size_bytes=orig_file.stat().st_size,
            has_cleaned=True,
            cleaned_file_path=str(clean_file),
        )

        res_active = DataQualityService.analyze_dataset_quality(mock_dataset, active=True)
        res_orig = DataQualityService.analyze_dataset_quality(mock_dataset, active=False)

        # Cleaned dataset (active=True) should have 0 missing and higher/perfect score
        self.assertEqual(res_active.summary.missing_cells, 0)
        self.assertGreater(res_active.summary.quality_score, res_orig.summary.quality_score)
        self.assertEqual(res_orig.summary.missing_cells, 5)
        print(f"  [PASS] Version handling verified: Cleaned score={res_active.summary.quality_score} > Original score={res_orig.summary.quality_score}")

    def test_03_no_false_date_detection_on_order_and_id_columns(self):
        """Verify columns like Order_ID and Order_Amount_INR are NOT flagged as invalid dates."""
        df = pd.DataFrame({
            "Order_ID": [1001, 1002, 1003, 1004, 1005],
            "Customer_ID": [201, 202, 203, 204, 205],
            "Order_Amount_INR": [599.99, 1200.50, 45.00, 300.00, 1500.00],
            "order_date": ["2023-01-01", "2023-01-02", "2023-01-03", "2023-01-04", "2023-01-05"],
        })

        hygiene = DataCleaningService._compute_hygiene_metrics(df)

        # Invalid dates should be 0 because order_date is valid, and Order_ID / Order_Amount_INR are not dates
        self.assertEqual(hygiene["invalid_dates"], 0)
        self.assertEqual(len(hygiene["invalid_date_cols"]), 0)
        print(f"  [PASS] Zero false positive invalid dates detected on Order_ID and Order_Amount_INR.")

    def test_04_date_cleaning_does_not_corrupt_numeric_ids_into_1970_epoch(self):
        """Verify that date standardization on integer columns fails safely instead of converting to '1970-01-01'."""
        df = pd.DataFrame({
            "Customer_ID": [1, 2, 3, 4, 5],
        })
        ops = CleaningOperationsRequest(
            date_cleanings=[
                DateCleaningConfig(column="Customer_ID", output_format="%Y-%m-%d", handle_invalid="coerce_na")
            ]
        )
        cleaned_df, ops_performed, _, _, _, _, _ = DataCleaningService.execute_cleaning_pipeline(df.copy(), ops)

        # Customer_ID should NOT be constant '1970-01-01'
        unique_vals = cleaned_df["Customer_ID"].dropna().unique()
        self.assertNotIn("1970-01-01", unique_vals)
        print(f"  [PASS] Numeric IDs are safely guarded against 1970-01-01 epoch corruption.")

    def test_05_sequential_cleaning_preserves_previous_operations(self):
        """Verify that subsequent cleaning operations build upon previous active cleaned data."""
        orig_file = self.dir_path / "seq_test.csv"
        cleaned_file = self.dir_path / "cleaned_seq_test.csv"

        # Raw data: 1 duplicate, 2 missing in age
        df_raw = pd.DataFrame({
            "name": ["Alice", "Bob", "Charlie", "Alice"],
            "age": [25.0, np.nan, np.nan, 25.0],
        })
        df_raw.to_csv(orig_file, index=False)

        # Step 1: User previously imputed missing values
        df_v1 = pd.DataFrame({
            "name": ["Alice", "Bob", "Charlie", "Alice"],
            "age": [25.0, 30.0, 30.0, 25.0],  # imputed
        })
        df_v1.to_csv(cleaned_file, index=False)

        mock_dataset = Dataset(
            id=555,
            filename="seq_test.csv",
            file_path=str(orig_file),
            file_size_bytes=orig_file.stat().st_size,
            has_cleaned=True,
            cleaned_file_path=str(cleaned_file),
        )

        # Step 2: Now user applies 'remove_duplicates'
        ops = CleaningOperationsRequest(remove_duplicates=True)
        # In bulk preview or apply, active DataFrame is used
        source_df = DataCleaningService._get_dataframe(mock_dataset, active=True)
        cleaned_v2, _, _, _, _, _, _ = DataCleaningService.execute_cleaning_pipeline(source_df, ops)

        # v2 must have 3 rows (duplicate removed) AND 0 missing values (v1 imputation preserved!)
        self.assertEqual(len(cleaned_v2), 3)
        self.assertEqual(int(cleaned_v2["age"].isnull().sum()), 0)
        print(f"  [PASS] Sequential cleaning verified: v1 imputations preserved when v2 duplicates removed.")


if __name__ == "__main__":
    unittest.main()
