"""Query Validator Module for Phase 6 Natural Language Query Engine.

Validates structured query plans against actual datasets, schemas, relationships,
and security policies before execution.
"""

from typing import Dict, Any, List, Optional
import pandas as pd
from query.query_models import QueryIntent
from query.config import get_default_query_config, normalize_query_config


ALLOWED_OPERATORS = {">", ">=", "<", "<=", "==", "!=", "in", "not in", "between", "contains", "month", "month_equals", "eq", "neq", "gt", "gte", "lt", "lte"}
ALLOWED_AGGREGATIONS = {"count", "sum", "mean", "median", "min", "max", "std", "nunique"}
NUMERIC_ONLY_AGGREGATIONS = {"sum", "mean", "median", "std"}


def validate_query_plan(
    query_plan: Dict[str, Any],
    datasets: Dict[str, pd.DataFrame],
    metadata: Dict[str, Any],
    relationships: Optional[List[Any]] = None,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Validate query plan prior to execution.

    Contract:
    Returns:
    {
        "valid": True,
        "errors": [],
        "warnings": [],
        "requires_clarification": False,
        "clarification_question": None
    }
    """
    cfg = normalize_query_config(config)
    errors: List[str] = []
    warnings: List[str] = []

    # 1. Ambiguity / Clarification check
    if query_plan.get("needs_clarification", False):
        return {
            "valid": False,
            "errors": [],
            "warnings": [],
            "requires_clarification": True,
            "clarification_question": query_plan.get("clarification_question", "Please clarify your question."),
            "clarification_options": query_plan.get("clarification_options", []),
        }

    # 2. Check Intent
    intent = query_plan.get("intent", QueryIntent.UNKNOWN.value)
    if intent not in QueryIntent.list_all():
        errors.append(f"Unsupported query intent '{intent}'.")
    elif intent == QueryIntent.UNKNOWN.value:
        errors.append(query_plan.get("metadata", {}).get("error") or "Operation rejected: Unsupported or disallowed query.")
    elif intent in (QueryIntent.OUT_OF_SCOPE.value, QueryIntent.UNSUPPORTED_OPERATION.value, QueryIntent.DATA_QUALITY_REPORT.value):
        # Valid user-classified intents that pass cleanly to execution / answer generation
        return {
            "valid": True,
            "errors": [],
            "warnings": [],
            "requires_clarification": False,
            "clarification_question": None,
        }

    # 3. Check Datasets availability
    if not datasets:
        return {
            "valid": False,
            "errors": ["No active datasets loaded. Please upload at least one dataset."],
            "warnings": [],
            "requires_clarification": False,
            "clarification_question": None,
        }

    target_ds_name = query_plan.get("dataset")
    if not target_ds_name:
        # If single dataset available, we can default, otherwise require specification
        if len(datasets) == 1:
            target_ds_name = list(datasets.keys())[0]
            query_plan["dataset"] = target_ds_name
        else:
            errors.append(f"Target dataset not specified among available datasets: {list(datasets.keys())}")
            return {
                "valid": False,
                "errors": errors,
                "warnings": warnings,
                "requires_clarification": True,
                "clarification_question": f"Which dataset would you like to query: {', '.join(datasets.keys())}?",
                "clarification_options": list(datasets.keys()),
            }

    if target_ds_name not in datasets:
        errors.append(f"Dataset '{target_ds_name}' not found. Available datasets: {list(datasets.keys())}")
        return {
            "valid": False,
            "errors": errors,
            "warnings": warnings,
            "requires_clarification": False,
            "clarification_question": None,
        }

    df = datasets[target_ds_name]
    df_cols = list(df.columns)
    sec_ds_name = query_plan.get("secondary_dataset")
    if sec_ds_name and sec_ds_name in datasets:
        df_cols = list(df.columns) + [c for c in datasets[sec_ds_name].columns if c not in df.columns]
    df_cols_lower = [c.lower() for c in df_cols]

    # 4. Check Column Existence and Datatypes
    missing_cols = query_plan.get("metadata", {}).get("missing_columns", [])
    if missing_cols:
        missing_formatted = ", ".join(f"'{c}'" for c in missing_cols)
        available_formatted = ", ".join(f"'{c}'" for c in df_cols)
        errors.append(
            f"Requested column(s) {missing_formatted} do not exist in dataset '{target_ds_name}'. "
            f"I cannot calculate {intent.lower()} because this dataset does not contain {missing_formatted} or sufficient information to derive it. "
            f"Available columns are: {available_formatted}."
        )

    col = query_plan.get("column")
    if col is not None:
        if col not in df_cols:
            errors.append(f"Column '{col}' does not exist in dataset '{target_ds_name}'. Available columns: {df_cols}")
        else:
            # Check aggregation compatibility
            agg = query_plan.get("aggregation")
            if agg:
                agg_clean = agg.lower()
                if agg_clean not in ALLOWED_AGGREGATIONS:
                    errors.append(f"Unsupported aggregation '{agg}'. Allowed: {list(ALLOWED_AGGREGATIONS)}")
                elif agg_clean in NUMERIC_ONLY_AGGREGATIONS:
                    if not pd.api.types.is_numeric_dtype(df[col]):
                        errors.append(
                            f"Aggregation '{agg}' requires a numeric column, but '{col}' is a categorical/text column with datatype '{df[col].dtype}'. "
                            f"Numeric operations like average, sum, mean, or standard deviation cannot be computed on text categories."
                        )
    elif intent in (
        QueryIntent.AVERAGE.value,
        QueryIntent.SUM.value,
        QueryIntent.MEDIAN.value,
        QueryIntent.MINIMUM.value,
        QueryIntent.MAXIMUM.value,
        QueryIntent.STANDARD_DEVIATION.value,
    ):
        if not missing_cols:
            has_numeric = any(pd.api.types.is_numeric_dtype(df[c]) for c in df_cols)
            if not has_numeric:
                available_formatted = ", ".join(f"'{c}'" for c in df_cols)
                op_disp = "standard deviation" if intent == QueryIntent.STANDARD_DEVIATION.value else intent.lower()
                errors.append(
                    f"No numeric columns exist in dataset '{target_ds_name}' to calculate {op_disp}. Available columns: {available_formatted}."
                )
    elif intent == QueryIntent.COMPLEX_SUBQUERY.value:
        if not missing_cols:
            available_formatted = ", ".join(f"'{c}'" for c in df_cols)
            if not col or col not in df_cols:
                errors.append(
                    f"No valid numeric metric column found for subquery analysis in dataset '{target_ds_name}'. Available columns: {available_formatted}."
                )
            elif not pd.api.types.is_numeric_dtype(df[col]):
                errors.append(
                    f"Subquery metric column '{col}' must be numeric, but has datatype '{df[col].dtype}'."
                )
            if not query_plan.get("group_by"):
                errors.append("Subquery analysis requires an entity or category column to evaluate.")

    sec_col = query_plan.get("secondary_column")
    if sec_col is not None and sec_col not in df_cols:
        errors.append(f"Secondary column '{sec_col}' does not exist in dataset '{target_ds_name}'. Available columns: {df_cols}")

    # 5. Check Group By Columns
    group_by = query_plan.get("group_by", [])
    if isinstance(group_by, list):
        for g_col in group_by:
            if g_col not in df_cols:
                errors.append(f"Group-by column '{g_col}' does not exist in dataset '{target_ds_name}'.")
    else:
        errors.append("Field 'group_by' must be a list of column names.")

    # 6. Check Filters
    filters = query_plan.get("filters", [])
    if isinstance(filters, list):
        for f in filters:
            if not isinstance(f, dict):
                errors.append(f"Invalid filter format: {f}")
                continue
            f_col = f.get("column")
            f_op = f.get("operator")
            if not f_col or f_col not in df_cols:
                errors.append(f"Filter column '{f_col}' does not exist in dataset '{target_ds_name}'.")
            if f_op not in ALLOWED_OPERATORS:
                errors.append(f"Filter operator '{f_op}' is not permitted. Allowed: {list(ALLOWED_OPERATORS)}")
    else:
        errors.append("Field 'filters' must be a list of filter definitions.")

    # 7. Check Date Column and Range
    date_col = query_plan.get("date_column")
    if date_col:
        if date_col not in df_cols:
            errors.append(f"Date column '{date_col}' does not exist in dataset '{target_ds_name}'.")

    # 8. Check Limit bounds
    limit = query_plan.get("limit")
    if limit is not None:
        max_allowed_top_n = cfg.get("max_top_n", 100)
        if not isinstance(limit, int) or limit <= 0:
            errors.append(f"Query limit must be a positive integer, got '{limit}'.")
        elif limit > max_allowed_top_n:
            warnings.append(f"Requested limit {limit} exceeds safe limit {max_allowed_top_n}; capping to {max_allowed_top_n}.")
            query_plan["limit"] = max_allowed_top_n

    # 9. Cross-dataset validation
    if intent in (QueryIntent.CROSS_DATASET_ANALYSIS.value, QueryIntent.COMPARE_DATASETS.value) or query_plan.get("secondary_dataset"):
        sec_ds = query_plan.get("secondary_dataset")
        if not sec_ds or sec_ds not in datasets:
            if len(datasets) > 1:
                other_ds = [d for d in datasets.keys() if d != target_ds_name]
                if other_ds:
                    sec_ds = other_ds[0]
                    query_plan["secondary_dataset"] = sec_ds
                else:
                    errors.append("Cross-dataset analysis requires at least two distinct uploaded datasets.")
            else:
                errors.append("Cross-dataset analysis requires at least two uploaded datasets.")

        if sec_ds and sec_ds in datasets:
            # Check relationships
            if cfg.get("require_validated_relationship", True):
                if not relationships:
                    errors.append(f"No validated relationships found between '{target_ds_name}' and '{sec_ds}'. Cross-dataset joins require verified key relationships.")
                else:
                    # Look for relationship connecting target_ds_name and sec_ds
                    matching_rels = [
                        r for r in relationships
                        if (getattr(r, "source_dataset", None) == target_ds_name and getattr(r, "target_dataset", None) == sec_ds)
                        or (getattr(r, "source_dataset", None) == sec_ds and getattr(r, "target_dataset", None) == target_ds_name)
                    ]
                    if not matching_rels:
                        errors.append(f"No verified relationship exists connecting '{target_ds_name}' and '{sec_ds}'. Join rejected for data safety.")
                    else:
                        rel = matching_rels[0]
                        # Check Many-to-Many safeguards
                        if not cfg.get("allow_many_to_many", False):
                            rel_type = getattr(rel, "relationship_type", "")
                            if rel_type == "Many-to-Many":
                                errors.append(f"Cross-dataset join rejected: Many-to-Many relationship between '{target_ds_name}' and '{sec_ds}' could lead to record duplication / row explosion.")

    is_valid = len(errors) == 0
    return {
        "valid": is_valid,
        "errors": errors,
        "warnings": warnings,
        "requires_clarification": False,
        "clarification_question": None,
    }
