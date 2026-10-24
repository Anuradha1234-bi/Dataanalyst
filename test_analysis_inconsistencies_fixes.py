"""Test suite for dataset analysis inconsistencies fixes:
1. Safe handling of missing dataset storage files in multi-dataset analysis.
2. Consistent semantic column data-type classification across Data Quality and Profiler.
3. Preserving authoritative Data Quality Score formula and rules.
"""

import os
import sys
from pathlib import Path
import unittest
import pandas as pd

# Path setup
PROJECT_ROOT = Path(__file__).resolve().parent
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from agents.profiler import ProfilerAgent
from app.database import SessionLocal
from app.models.dataset import Dataset
from app.models.user import User
from app.services.multi_dataset_service import MultiDatasetAnalysisService
from app.services.profiling_service import ProfilingService
from app.services.quality_service import DataQualityService


class TestAnalysisInconsistenciesFixes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()
        cls.user = cls.db.query(User).filter(User.id == 1).first()

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_missing_dataset_storage_handling_in_multi_analysis(self):
        """Test Issue 1: Missing dataset (ID 13: test_verify_dataset.csv) generates actionable error and allows analysis of valid datasets."""
        valid_ds = self.db.query(Dataset).filter(Dataset.id == 5).first()
        missing_ds = self.db.query(Dataset).filter(Dataset.id == 13).first()

        self.assertIsNotNone(valid_ds, "Dataset 5 should exist in database")
        self.assertIsNotNone(missing_ds, "Dataset 13 should exist in database")
        self.assertFalse(os.path.exists(missing_ds.file_path), "Dataset 13 file must be missing from disk as reported")

        # Run multi-dataset analysis with both
        res = MultiDatasetAnalysisService.analyze_datasets(
            dataset_ids=[valid_ds.id, missing_ds.id],
            current_user=self.user,
            db=self.db,
        )

        self.assertEqual(res.status, "partial")
        self.assertEqual(res.total_selected, 2)
        self.assertEqual(res.total_successful, 1)
        self.assertEqual(res.total_failed, 1)

        # Check actionable error message
        self.assertEqual(len(res.errors), 1)
        err = res.errors[0]
        self.assertEqual(err.dataset_id, 13)
        self.assertIn("missing from storage", err.error)
        self.assertIn("Please re-upload this dataset or remove it from your selection", err.error)

        # Verify valid dataset was profiled successfully without failure
        self.assertIn(5, res.individual_profiles)
        valid_profile = res.individual_profiles[5]
        self.assertEqual(valid_profile.dataset_info.id, 5)
        self.assertIsNotNone(res.combined_overview)
        self.assertEqual(res.combined_overview.total_datasets, 1)
        print("  [PASS] Missing dataset handling is safe, actionable, and preserves remaining valid analysis.")

    def test_order_date_semantic_type_classification(self):
        """Test Issue 2: Order_Date is consistently detected as DATETIME in ProfilerAgent."""
        ds = self.db.query(Dataset).filter(Dataset.id == 5).first()
        file_path = ds.cleaned_file_path if (ds.has_cleaned and os.path.exists(ds.cleaned_file_path)) else ds.file_path
        df = pd.read_csv(file_path)

        # 1. Test semantic type detection on Order_Date series
        self.assertIn("Order_Date", df.columns)
        st, parsed = ProfilerAgent._detect_semantic_type(df["Order_Date"])
        self.assertEqual(st, "DATETIME", f"Expected DATETIME for Order_Date, got {st}")
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed.notna().sum(), len(df), "All 50 dates should parse to valid datetimes")

        # 2. Test full profiling result
        profile_res = ProfilerAgent.profile_dataset(df)
        self.assertEqual(profile_res.type_counts["DATETIME"], 1)
        self.assertEqual(profile_res.type_counts["NUMERIC"], 4)
        self.assertEqual(profile_res.type_counts["CATEGORICAL"], 6)
        self.assertEqual(profile_res.type_counts["BOOLEAN"], 0)
        print("  [PASS] ProfilerAgent classifies Order_Date as DATETIME (Date=1, Categoricals=6, Numeric=4).")

    def test_consistent_type_summaries_between_profiler_and_data_quality(self):
        """Test Issue 2: Compare semantic type distributions across DataQualityService and ProfilingService."""
        ds = self.db.query(Dataset).filter(Dataset.id == 5).first()

        prof = ProfilingService.get_dataset_profile(ds, active=True)
        qual = DataQualityService.analyze_dataset_quality(ds, active=True)

        # DataQualityService counts
        dq_dt_count = len(qual.types_report.datetime_columns)
        dq_num_count = len(qual.types_report.numeric_columns)
        dq_cat_count = len(qual.types_report.categorical_columns)
        dq_bool_count = len(qual.types_report.boolean_columns)

        # Profiler counts
        prof_cols = prof.columns
        prof_dt_count = sum(1 for c in prof_cols if c.semantic_type == "DATETIME")
        prof_num_count = sum(1 for c in prof_cols if c.semantic_type == "NUMERIC")
        prof_cat_count = sum(1 for c in prof_cols if c.semantic_type in ("CATEGORICAL", "TEXT"))
        prof_bool_count = sum(1 for c in prof_cols if c.semantic_type == "BOOLEAN")

        self.assertEqual(dq_dt_count, prof_dt_count, f"Datetime mismatch: DQ={dq_dt_count}, Prof={prof_dt_count}")
        self.assertEqual(dq_num_count, prof_num_count, f"Numeric mismatch: DQ={dq_num_count}, Prof={prof_num_count}")
        self.assertEqual(dq_cat_count, prof_cat_count, f"Categorical mismatch: DQ={dq_cat_count}, Prof={prof_cat_count}")
        self.assertEqual(dq_bool_count, prof_bool_count, f"Boolean mismatch: DQ={dq_bool_count}, Prof={prof_bool_count}")

        self.assertEqual(dq_dt_count, 1)
        self.assertEqual(dq_cat_count, 6)
        self.assertEqual(dq_num_count, 4)
        self.assertEqual(dq_bool_count, 0)
        print(f"  [PASS] Perfect alignment across pages: Datetime={dq_dt_count}, Categorical={dq_cat_count}, Numeric={dq_num_count}, Boolean={dq_bool_count}.")

    def test_authoritative_quality_score_preserved(self):
        """Verify the authoritative quality score formula remains 92.0 and is untouched."""
        ds = self.db.query(Dataset).filter(Dataset.id == 5).first()
        prof = ProfilingService.get_dataset_profile(ds, active=True)
        qual = DataQualityService.analyze_dataset_quality(ds, active=True)

        self.assertEqual(prof.quality_summary.health_score, 92)
        self.assertEqual(qual.summary.quality_score, 92.0)
        print("  [PASS] Authoritative score preserved: 92 == 92.0.")


if __name__ == "__main__":
    unittest.main()
