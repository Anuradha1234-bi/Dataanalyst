"""Answer Generator Module for Phase 6 Natural Language Query Engine.

Generates concise, human-friendly, evidence-grounded natural language answers.
Never hallucinates, invents numbers, or creates unsupported causal assertions.
Strictly relies on deterministic execution results and evidence.
"""

from typing import Dict, Any, List, Optional
import pandas as pd
from query.query_models import QueryIntent
from query.config import normalize_query_config


def generate_query_answer(
    question: str,
    query_plan: Dict[str, Any],
    query_result: Dict[str, Any],
    evidence: Dict[str, Any],
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Generate evidence-grounded natural language answer for query results.

    Contract:
    Returns:
    {
        "answer": "...",
        "key_points": [],
        "evidence": [],
        "limitations": [],
        "confidence": 0.91
    }
    """
    cfg = normalize_query_config(config)
    intent = query_plan.get("intent", QueryIntent.UNKNOWN.value)
    data = query_result.get("data")
    row_count = query_result.get("row_count", 0)
    dataset_name = evidence.get("dataset_used", "the dataset")
    source_label = evidence.get("dataset_source", "")

    # Check for empty result or error
    if query_result.get("status") == "error":
        err_msg = query_result.get("errors", ["An error occurred during query execution."])[0]
        return {
            "answer": f"Unable to complete query: {err_msg}",
            "key_points": [err_msg],
            "evidence": [],
            "limitations": ["Query execution encountered an error."],
            "confidence": "Low",
        }

    # Handle OUT_OF_SCOPE inquiries directly
    if intent == QueryIntent.OUT_OF_SCOPE.value:
        return {
            "answer": "This assistant is designed to analyze your selected dataset. Please ask a question related to the available data and columns.",
            "key_points": [
                "This assistant is specialized for dataset analysis.",
                "Please ask a question related to your loaded dataset columns.",
            ],
            "evidence": ["Out-of-scope query: no dataset columns or analytical operations referenced."],
            "limitations": ["General trivia, biology, geography, and non-dataset questions are out of scope."],
            "confidence": "High",
        }

    # Handle UNSUPPORTED_OPERATION inquiries directly
    if intent == QueryIntent.UNSUPPORTED_OPERATION.value:
        raw_ev = evidence.get("raw_evidence", {}) or evidence
        uop = raw_ev.get("unsupported_operation") or query_plan.get("metadata", {}).get("unsupported_operation", "requested analytical operation")
        req_col = raw_ev.get("requested_column") or query_plan.get("column")
        col_clause = f" on column `{req_col}`" if req_col else ""
        return {
            "answer": (
                f"The requested analytical operation '{uop}' is not currently supported{col_clause}. "
                "Supported analytical operations include count, sum, average (mean), median, minimum, maximum, "
                "standard deviation, top/bottom rankings, grouping, percentage contribution, temporal trends, "
                "correlation analysis, and data hygiene checks (missing values and duplicates)."
            ),
            "key_points": [
                f"Operation '{uop}' is not supported.",
                "Supported operations: count, sum, average, median, min, max, standard deviation, rankings, grouping, trends, correlations.",
            ],
            "evidence": [f"Unsupported analytical operation requested: '{uop}'{col_clause}"],
            "limitations": [f"The '{uop}' statistical algorithm is not implemented in the current analytical engine."],
            "confidence": "High",
        }

    if row_count == 0 or data is None or (isinstance(data, pd.DataFrame) and data.empty):
        if intent in (QueryIntent.FORECAST.value, QueryIntent.PREDICTION.value, "forecast", "prediction") or str(intent).upper() in ("FORECAST", "PREDICTION"):
            raw_ev = evidence.get("raw_evidence", {}) or evidence
            notice = raw_ev.get("notice") or evidence.get("notice") or "No prediction results are available yet. Run a prediction or forecasting analysis first."
            sugg = raw_ev.get("suggestion") or evidence.get("suggestion") or "Run a prediction or forecasting analysis first."
            full_msg = f"{notice} {sugg}".strip() if sugg not in notice else notice
            return {
                "answer": full_msg,
                "key_points": ["No active prediction or forecast model results available yet."],
                "evidence": [notice],
                "limitations": ["A prediction model must be trained in the Prediction page before querying future projections."],
                "confidence": "Medium",
            }

        return {
            "answer": f"No matching records were found in `{dataset_name}` matching your criteria.",
            "key_points": ["0 matching rows returned."],
            "evidence": ["Result set is empty."],
            "limitations": ["No observations satisfied the applied filters or queries."],
            "confidence": "Medium",
        }

    key_points: List[str] = []
    evidence_items: List[str] = []
    limitations: List[str] = []

    # Calculate overall confidence
    plan_conf = query_plan.get("confidence", 1.0)
    if plan_conf >= 0.85:
        confidence_label = "High"
        confidence_score = 0.95
    elif plan_conf >= 0.60:
        confidence_label = "Medium"
        confidence_score = 0.75
    else:
        confidence_label = "Low"
        confidence_score = 0.50

    answer_text = ""

    # 1. COUNT
    if intent == QueryIntent.COUNT.value:
        cnt = evidence.get("computed_values", {}).get("count")
        if cnt is None and isinstance(data, pd.DataFrame) and not data.empty:
            cnt = int(data.iloc[0, 0])
        cnt_val = cnt if cnt is not None else row_count
        raw_ev = evidence.get("raw_evidence", {}) if isinstance(evidence.get("raw_evidence"), dict) else {}
        feat_cnt = evidence.get("feature_count") or raw_ev.get("feature_count")
        if feat_cnt:
            answer_text = f"Dataset `{dataset_name}` contains **{cnt_val:,}** records and **{feat_cnt} features / columns**."
            key_points.append(f"Total Records: {cnt_val:,}")
            key_points.append(f"Total Features: {feat_cnt}")
        else:
            answer_text = f"There are **{cnt_val:,}** records in `{dataset_name}`."
            key_points.append(f"Total Count: {cnt_val:,}")
        if evidence.get("filters_applied"):
            answer_text += " matching the specified criteria."
        evidence_items.append(f"Row count: {cnt_val:,}")

    # 2. AGGREGATIONS (AVERAGE, MEDIAN, SUM, MINIMUM, MAXIMUM, STANDARD_DEVIATION)
    elif intent in (
        QueryIntent.AVERAGE.value,
        QueryIntent.MEDIAN.value,
        QueryIntent.SUM.value,
        QueryIntent.MINIMUM.value,
        QueryIntent.MAXIMUM.value,
        QueryIntent.STANDARD_DEVIATION.value,
    ):
        col = query_plan.get("column")
        agg = query_plan.get("aggregation") or (intent.lower() if intent else "average")
        group_by = query_plan.get("group_by", [])
        display_agg = "standard deviation" if (agg == "std" or intent == QueryIntent.STANDARD_DEVIATION.value) else agg

        if not col or str(col).lower() == "none":
            if isinstance(data, pd.DataFrame) and not data.empty and "Feature" in data.columns:
                answer_text = f"Computed {display_agg} across **{len(data)} numerical features** in `{dataset_name}`."
                for _, r in data.iterrows():
                    key_points.append(f"{r['Feature']}: {r.iloc[1]}")
                    evidence_items.append(f"{r['Feature']} {display_agg} = {r.iloc[1]}")
            else:
                missing_cols = query_plan.get("metadata", {}).get("missing_columns", [])
                if missing_cols:
                    answer_text = f"Unable to compute {display_agg}: requested column(s) {', '.join(f'`{c}`' for c in missing_cols)} were not found in dataset `{dataset_name}`."
                else:
                    answer_text = f"Unable to compute {display_agg}: no valid numerical column was specified or found in dataset `{dataset_name}`."
                limitations.append(f"Requested measure not found in schema of dataset '{dataset_name}'.")
                confidence_label = "Low"
                confidence_score = 0.20
        elif group_by and isinstance(data, pd.DataFrame) and not data.empty:
            grp_col = group_by[0]
            top_row = data.iloc[0]
            top_entity = top_row[grp_col]
            metric_val = top_row.iloc[1]
            answer_text = f"**{top_entity}** has the highest {display_agg} `{col}` at **{metric_val:,.2f}**." if isinstance(metric_val, (int, float)) else f"**{top_entity}** leads with {display_agg} `{col}` of **{metric_val}**."
            key_points.append(f"Top {grp_col}: {top_entity}")
            key_points.append(f"Computed {display_agg}: {metric_val}")
            evidence_items.append(f"{grp_col}='{top_entity}', {display_agg}_{col}={metric_val}")
        else:
            val = evidence.get("computed_values", {}).get("metric_value")
            if val is None and isinstance(data, pd.DataFrame) and not data.empty:
                val = data.iloc[0, 0]
            elif val is None and isinstance(data, (int, float)):
                val = data

            if val is None:
                answer_text = f"No valid numerical values were found in `{col}` to calculate {display_agg}."
                limitations.append(f"Column '{col}' contains no valid numerical observations.")
                confidence_label = "Low"
                confidence_score = 0.20
            else:
                formatted_val = f"{val:,.2f}" if isinstance(val, (int, float)) else str(val)
                raw_ev = evidence.get("raw_evidence", {}) if isinstance(evidence.get("raw_evidence"), dict) else {}
                rec_info = evidence.get("record") or raw_ev.get("record")
                rec_idx = evidence.get("record_index") or raw_ev.get("record_index")

                if agg in ("std", "standard_deviation") or intent == QueryIntent.STANDARD_DEVIATION.value:
                    null_cnt = evidence.get("count_null") or raw_ev.get("count_null", 0)
                    valid_cnt = evidence.get("count_valid") or raw_ev.get("count_valid")
                    valid_str = f" across {valid_cnt:,} valid records" if valid_cnt else ""
                    null_str = f" ({null_cnt:,} missing value{'s were' if null_cnt > 1 else ' was'} excluded)" if null_cnt and null_cnt > 0 else ""
                    answer_text = (
                        f"The sample standard deviation of `{col}` is **{formatted_val}**"
                        f"{valid_str} (calculated using unbiased sample standard deviation with ddof=1{null_str})."
                    )
                    key_points.append(f"Sample Standard Deviation of {col}: {formatted_val}")
                    if valid_cnt:
                        key_points.append(f"Sample Size: {valid_cnt} valid observations (ddof=1)")
                    if null_cnt and null_cnt > 0:
                        key_points.append(f"Missing Values Excluded: {null_cnt}")
                    evidence_items.append(f"{col} sample std = {formatted_val} (ddof=1, n={valid_cnt}, nulls={null_cnt})")
                elif rec_info and agg in ("max", "maximum", "min", "minimum"):
                    id_candidates = ["order_id", "patient_id", "id", "customer_id", "product", "item", "category", "name", "department", "admission_date", "date"]
                    found_keys = []
                    for cand in id_candidates:
                        for k in rec_info.keys():
                            if k.lower() == cand and k not in found_keys:
                                found_keys.append(k)
                                break
                    if not found_keys:
                        found_keys = list(rec_info.keys())[:3]
                    id_summary = ", ".join(f"{k}: `{rec_info[k]}`" for k in found_keys[:3])
                    idx_str = f"record #{rec_idx}" if rec_idx is not None else "matching record"
                    answer_text = f"The {agg} `{col}` is **{formatted_val}**, found in {idx_str} ({id_summary})."
                    key_points.append(f"{agg.title()} Record: {idx_str} ({id_summary})")
                    key_points.append(f"{agg.title()} {col}: {formatted_val}")
                    evidence_items.append(f"Computed value: {formatted_val}")
                else:
                    answer_text = f"The {agg} `{col}` is **{formatted_val}**."
                    key_points.append(f"{agg.title()} {col}: {formatted_val}")
                    evidence_items.append(f"Computed value: {formatted_val}")

    # 3. TOP_N & BOTTOM_N
    elif intent in (QueryIntent.TOP_N.value, QueryIntent.BOTTOM_N.value):
        offset = query_plan.get("offset")
        limit = query_plan.get("limit", 10)
        group_by = query_plan.get("group_by", [])
        col = query_plan.get("column", "value")

        if isinstance(data, pd.DataFrame) and not data.empty:
            if offset and offset > 0:
                # Rank offset (e.g. "second highest")
                top_row = data.iloc[0]
                entity_label = top_row.iloc[0]
                metric_val = top_row.iloc[1] if len(top_row) > 1 else top_row.iloc[0]
                rank_str = "second highest" if offset == 1 else ("third highest" if offset == 2 else f"rank {offset + 1}")
                val_str = f"{metric_val:,.2f}" if isinstance(metric_val, (int, float)) else str(metric_val)
                answer_text = f"The {rank_str} is **{entity_label}** with `{col}` of **{val_str}**."
                key_points.append(f"Rank {offset + 1}: {entity_label} ({val_str})")
                evidence_items.append(f"Offset={offset}: {entity_label} = {val_str}")
            elif group_by:
                top_entity = data.iloc[0, 0]
                top_val = data.iloc[0, 1]
                val_str = f"{top_val:,.2f}" if isinstance(top_val, (int, float)) else str(top_val)
                agg_type = query_plan.get("aggregation") or "value"
                agg_prefix = "average " if agg_type == "mean" else ("total " if agg_type == "sum" else "")
                grp_col_lower = str(group_by[0]).lower()
                if limit == 1:
                    if grp_col_lower in ("date", "order_date", "day"):
                        answer_text = f"The highest-sales day was **{top_entity}** with {agg_prefix}`{col}` of **{val_str}**."
                    else:
                        answer_text = f"**{top_entity}** has the highest {agg_prefix}`{col}` at **{val_str}**."
                else:
                    direction = "top" if intent == QueryIntent.TOP_N.value else "bottom"
                    rank_label = f"{agg_prefix}`{col}`" if agg_prefix else f"`{col}`"
                    if grp_col_lower in ("order_id", "order", "id"):
                        answer_text = f"Here are the {direction} {len(data)} orders ranked by {rank_label}. Order **#{top_entity}** ranks first with **{val_str}**."
                    else:
                        answer_text = f"Here are the {direction} {len(data)} `{group_by[0]}` items ranked by {rank_label}. **{top_entity}** ranks first with **{val_str}**."
                for _, r in data.head(5).iterrows():
                    key_points.append(f"{r.iloc[0]}: {r.iloc[1]:,.2f}" if isinstance(r.iloc[1], (int, float)) else f"{r.iloc[0]}: {r.iloc[1]}")
                    evidence_items.append(f"{r.iloc[0]} -> {r.iloc[1]}")
            else:
                top_val = data.iloc[0][col] if col in data.columns else data.iloc[0, 0]
                val_str = f"{top_val:,.2f}" if isinstance(top_val, (int, float)) else str(top_val)
                answer_text = f"The highest `{col}` value is **{val_str}**."
                key_points.append(f"Peak value: {val_str}")
                evidence_items.append(f"Top record: {val_str}")

    # 4. MISSING VALUES
    elif intent == QueryIntent.MISSING_VALUES.value:
        raw_ev = evidence.get("raw_evidence", {})
        tot_missing = raw_ev.get("total_missing_values", 0)
        overall_pct = raw_ev.get("overall_missing_pct", 0.0)
        cols_with_missing = raw_ev.get("columns_with_missing", [])

        if tot_missing == 0:
            answer_text = f"There are **no missing values** in `{dataset_name}` (100% complete data)."
            key_points.append("Dataset is 100% complete.")
        else:
            answer_text = f"Found **{tot_missing:,} missing values** ({overall_pct}% of total cells) across {len(cols_with_missing)} columns."
            key_points.append(f"Total null cells: {tot_missing:,} ({overall_pct}%)")
            key_points.append(f"Columns affected: {', '.join(cols_with_missing[:5])}")
            for c in cols_with_missing[:3]:
                evidence_items.append(f"Column '{c}' has missing values")

    # 5. DUPLICATES
    elif intent == QueryIntent.DUPLICATES.value:
        raw_ev = evidence.get("raw_evidence", {})
        dup_count = raw_ev.get("duplicate_count", 0)
        dup_pct = raw_ev.get("duplicate_rate_pct", 0.0)
        if dup_count == 0:
            answer_text = f"There are **0 duplicate rows** in `{dataset_name}`. Every record is unique."
            key_points.append("0 duplicate rows identified.")
        else:
            answer_text = f"Identified **{dup_count:,} duplicate rows** representing **{dup_pct}%** of the dataset."
            key_points.append(f"Duplicates: {dup_count:,} ({dup_pct}%)")
            evidence_items.append(f"Duplicate count: {dup_count:,}")

    # 6. DATA TYPES
    elif intent == QueryIntent.DATA_TYPES.value:
        raw_ev = evidence.get("raw_evidence", {})
        num_cols = raw_ev.get("numeric_columns", [])
        tot_cols = raw_ev.get("total_columns", len(query_result.get("columns", [])))
        answer_text = f"`{dataset_name}` has **{tot_cols} columns**, including **{len(num_cols)} numeric columns**: {', '.join(num_cols[:5])}."
        key_points.append(f"Numeric features ({len(num_cols)}): {', '.join(num_cols[:5])}")
        evidence_items.append(f"{len(num_cols)} numeric columns confirmed")

    # 7. TREND & PERCENTAGE CHANGE
    elif intent in (QueryIntent.TREND.value, QueryIntent.PERCENTAGE_CHANGE.value):
        raw_ev = evidence.get("raw_evidence", {})
        dir_str = raw_ev.get("direction", "stable")
        pct_chg = raw_ev.get("percentage_change", 0.0)
        col = raw_ev.get("metric_column", "value")
        s_date = raw_ev.get("start_period", "")
        e_date = raw_ev.get("end_period", "")
        s_val = raw_ev.get("start_value", 0.0)
        e_val = raw_ev.get("end_value", 0.0)

        answer_text = f"`{col}` exhibited an **{dir_str} trend** ({pct_chg:+.1f}%) from **{s_date}** ({s_val:,.2f}) to **{e_date}** ({e_val:,.2f})."
        key_points.append(f"Trajectory: {dir_str.title()} ({pct_chg:+.1f}%)")
        key_points.append(f"Starting value: {s_val:,.2f} ({s_date})")
        key_points.append(f"Ending value: {e_val:,.2f} ({e_date})")
        evidence_items.append(f"Change: {s_val} -> {e_val} ({pct_chg:+.1f}%)")
        limitations.append("Trend calculation reflects empirical historical trajectory. The dataset does not establish causal operational drivers.")

    # 8. DATE COMPARISON
    elif intent == QueryIntent.DATE_COMPARISON.value:
        cmp = evidence.get("comparison_values", {})
        dt_a = cmp.get("period_a", "Period A")
        val_a = cmp.get("value_a", 0.0)
        dt_b = cmp.get("period_b", "Period B")
        val_b = cmp.get("value_b", 0.0)
        chg = cmp.get("absolute_change", 0.0)
        pct = cmp.get("percentage_change", 0.0)
        dir_w = cmp.get("direction", "changed")

        answer_text = f"Between **{dt_a}** and **{dt_b}**, the value {dir_w} by **{chg:+,.2f}** ({pct:+.1f}%), moving from **{val_a:,.2f}** to **{val_b:,.2f}**."
        key_points.append(f"Baseline ({dt_a}): {val_a:,.2f}")
        key_points.append(f"Comparison ({dt_b}): {val_b:,.2f}")
        key_points.append(f"Shift: {chg:+,.2f} ({pct:+.1f}%)")
        evidence_items.append(f"{dt_a}={val_a} -> {dt_b}={val_b}")
        limitations.append("The dataset records the numerical shift during this interval but does not record external causal factors.")

    # 9. CORRELATION
    elif intent == QueryIntent.CORRELATION.value:
        raw_ev = evidence.get("raw_evidence", {})
        st_pair = raw_ev.get("strongest_pair", {})
        ev_msg = raw_ev.get("message") or evidence.get("message") or ""
        missing_cols = query_plan.get("metadata", {}).get("missing_columns", [])

        if missing_cols:
            answer_text = f"Unable to compute correlation: requested column(s) {', '.join(f'`{c}`' for c in missing_cols)} do not exist in dataset `{dataset_name}`."
            limitations.append(f"Requested features {missing_cols} not present in dataset schema.")
            confidence_label = "Low"
            confidence_score = 0.20
        elif ev_msg and ("extraction metadata" in ev_msg.lower() or "insufficient" in ev_msg.lower()):
            answer_text = f"Dataset `{dataset_name}` contains extraction metadata columns but lacks domain numerical features for statistical correlation analysis."
            limitations.append("Metadata-only columns (e.g. PDF pagination, line offsets) do not represent domain metrics.")
            confidence_label = "Low"
            confidence_score = 0.20
        elif st_pair:
            c1 = st_pair.get("Feature A") or st_pair.get("column_a", "")
            c2 = st_pair.get("Feature B") or st_pair.get("column_b", "")
            r_val = st_pair.get("Correlation (r)") or st_pair.get("correlation", 0.0)
            strength = st_pair.get("Strength") or st_pair.get("strength", "Strong")
            answer_text = f"The strongest association is between `{c1}` and `{c2}` with a **{strength} correlation of {r_val:+.2f}**."
            key_points.append(f"Top Pair: `{c1}` & `{c2}` (r = {r_val:+.2f})")
            evidence_items.append(f"Pearson r = {r_val}")
        else:
            answer_text = f"No meaningful pairwise correlations could be computed for `{dataset_name}`."
            limitations.append("Requires at least two valid numerical columns.")

        limitations.append("Correlation does NOT imply causation. Associations reflect mathematical covariance rather than direct operational causality.")

    # 10. ANOMALY
    elif intent in (QueryIntent.ANOMALY_SUMMARY.value, QueryIntent.ANOMALY_RECORDS.value):
        raw_ev = evidence.get("raw_evidence", {})
        tot_anom = raw_ev.get("total_iqr_outliers", raw_ev.get("total_anomalies", 0))
        cols_anom = raw_ev.get("columns_with_anomalies", [])
        if tot_anom > 0:
            answer_text = f"Identified **{tot_anom:,} anomalous data points** across {len(cols_anom)} columns ({', '.join(cols_anom[:4])})."
            key_points.append(f"Total flagged anomalies: {tot_anom:,}")
            key_points.append(f"Columns with outliers: {', '.join(cols_anom[:4])}")
            evidence_items.append(f"{tot_anom} anomalies detected via statistical bounds")
        else:
            answer_text = f"No statistical anomalies or extreme outliers were flagged in `{dataset_name}`."
            key_points.append("0 anomalies detected within standard statistical bounds.")
        limitations.append("Outliers reflect statistical departures from expected bounds, not necessarily data errors.")

    # 11. CROSS-DATASET / COMPARISON
    elif intent in (QueryIntent.CROSS_DATASET_ANALYSIS.value, QueryIntent.COMPARE_DATASETS.value):
        raw_ev = evidence.get("raw_evidence", {})
        l_ds = raw_ev.get("left_dataset", "")
        r_ds = raw_ev.get("right_dataset", "")
        rows_a = raw_ev.get("rows_after", row_count)
        answer_text = f"Successfully linked `{l_ds}` and `{r_ds}` via validated foreign key relationship. Resulted in **{rows_a:,} matching records**."
        key_points.append(f"Linked Datasets: `{l_ds}` ↔ `{r_ds}`")
        key_points.append(f"Matched records: {rows_a:,}")
        evidence_items.append(f"Join: {l_ds} ↔ {r_ds} (rows={rows_a})")

    # 12. FORECAST & PREDICTION
    elif intent in (QueryIntent.FORECAST.value, QueryIntent.PREDICTION.value, "forecast", "prediction") or str(intent).upper() in ("FORECAST", "PREDICTION"):
        raw_ev = evidence.get("raw_evidence", {}) or evidence
        sel_model = raw_ev.get("selected_model")
        if sel_model:
            tgt = raw_ev.get("target_column", "the target")
            m_name = raw_ev.get("metric_name", "MAE")
            m_val = raw_ev.get("metric_value", 0.0)
            first_v = raw_ev.get("first_predicted", 0.0)
            last_v = raw_ev.get("last_predicted", 0.0)
            horizon = raw_ev.get("horizon", row_count)
            conf_stmt = raw_ev.get("confidence_statement", "")
            narrative = raw_ev.get("explanation", "")
            prob_type = raw_ev.get("problem_type", "")

            first_v_str = f"{first_v:,.2f}" if isinstance(first_v, (int, float)) else str(first_v)
            last_v_str = f"{last_v:,.2f}" if isinstance(last_v, (int, float)) else str(last_v)
            m_val_str = f"{m_val:.4f}" if isinstance(m_val, (int, float)) else str(m_val)

            if prob_type == "classification":
                answer_text = f"Based on the trained **{sel_model}** model for `{tgt}` (Classification), predictions project {horizon} records (Validation {m_name}: {m_val_str})."
            elif prob_type == "time_series":
                answer_text = f"Based on the trained **{sel_model}** model for `{tgt}`, forecast projections across a **{horizon}-step horizon** project values from **{first_v_str}** to **{last_v_str}** (Validation {m_name}: {m_val_str})."
            else:
                answer_text = f"Based on the trained **{sel_model}** model for `{tgt}` (Regression), predictions across {horizon} validation points project values from **{first_v_str}** to **{last_v_str}** (Validation {m_name}: {m_val_str})."

            if narrative:
                answer_text += f"\n\n{narrative}"
            key_points.append(f"Selected Model: {sel_model} (validation {m_name} = {m_val_str})")
            key_points.append(f"Prediction Horizon: {horizon} steps")
            key_points.append(f"Range: {first_v_str} -> {last_v_str}")
            top_feats = raw_ev.get("top_features", [])
            if top_feats:
                key_points.append(f"Top influential features: {', '.join(top_feats)}")
            if conf_stmt:
                key_points.append(conf_stmt)
            evidence_items.append(f"Model: {sel_model}, {m_name}={m_val_str}")
            for lim in raw_ev.get("limitations", []):
                limitations.append(lim)
            if not limitations:
                limitations.append("Predictions reflect historical statistical patterns; unseen external shocks cannot be anticipated.")
        else:
            notice = raw_ev.get("notice") or "No prediction results are available yet. Run a prediction or forecasting analysis first."
            answer_text = notice
            key_points.append("No active prediction result available.")
    elif intent in (QueryIntent.REGRESSION.value, "REGRESSION"):
        raw_ev = evidence.get("raw_evidence", {}) or evidence
        reg_details = raw_ev.get("regression_details") or {}
        interp = reg_details.get("interpretation") or f"Linear regression model fitted: {reg_details.get('equation', '')}"
        answer_text = interp
        key_points.append(f"Equation: {reg_details.get('equation', 'N/A')}")
        r2 = reg_details.get('r_squared', 0)
        key_points.append(f"R²: {r2} (explains {float(r2) * 100:.1f}% variance)")
        key_points.append(f"P-value: {reg_details.get('p_value', 'N/A')}")
        for lim in reg_details.get("limitations", []):
            limitations.append(lim)

    elif intent in (QueryIntent.TWO_GROUP_TEST.value, "TWO_GROUP_TEST"):
        raw_ev = evidence.get("raw_evidence", {}) or evidence
        test_details = raw_ev.get("test_details") or {}
        interp = test_details.get("interpretation") or "Two-group hypothesis test evaluated."
        answer_text = interp
        key_points.append(f"T-statistic: {test_details.get('t_statistic')}, P-value: {test_details.get('p_value')}")
        key_points.append(f"Effect Size (Cohen's d): {test_details.get('cohens_d')}")
        key_points.append(f"Statistically Significant: {'Yes (p < 0.05)' if test_details.get('is_significant') else 'No (p >= 0.05)'}")
        for lim in test_details.get("limitations", []):
            limitations.append(lim)

    elif intent in (QueryIntent.CHI_SQUARE.value, "CHI_SQUARE"):
        raw_ev = evidence.get("raw_evidence", {}) or evidence
        chi_details = raw_ev.get("chi_details") or {}
        interp = chi_details.get("interpretation") or "Chi-square test of independence evaluated."
        answer_text = interp
        key_points.append(f"Chi² Statistic: {chi_details.get('chi2_statistic')}, dof: {chi_details.get('degrees_of_freedom')}")
        key_points.append(f"P-value: {chi_details.get('p_value')}, Cramér's V: {chi_details.get('cramers_v')}")
        limitations.append("Chi-square evaluates non-parametric categorical association, not causality.")

    elif intent == QueryIntent.DATA_TYPES.value:
        tot_cols = evidence.get("total_columns") or evidence.get("raw_evidence", {}).get("total_columns") or row_count
        num_cols = evidence.get("numeric_columns", [])
        answer_text = f"There are **{tot_cols} columns** (features) in `{dataset_name}`."
        if num_cols:
            answer_text += f" Including {len(num_cols)} numerical columns ({', '.join(f'`{c}`' for c in num_cols[:4])}{'...' if len(num_cols) > 4 else ''})."
        key_points.append(f"Total Columns: {tot_cols}")
        if num_cols:
            key_points.append(f"Numerical Columns: {len(num_cols)}")
        evidence_items.append(f"Schema count: {tot_cols} columns")

    elif intent == QueryIntent.DESCRIPTIVE_STATISTICS.value:
        col = query_plan.get("column")
        if col and isinstance(data, pd.DataFrame) and "Statistic" in data.columns:
            stats_dict = dict(zip(data["Statistic"], data["Value"]))
            mean_s = stats_dict.get("Mean", "N/A")
            med_s = stats_dict.get("Median (50%)", "N/A")
            std_s = stats_dict.get("Standard Deviation", "N/A")
            min_s = stats_dict.get("Minimum", "N/A")
            max_s = stats_dict.get("Maximum", "N/A")
            cnt_s = stats_dict.get("Count (valid)", str(row_count))
            answer_text = f"Statistical distribution for `{col}` in `{dataset_name}`:\n• **Mean**: {mean_s} | **Median**: {med_s} | **Std Dev**: {std_s}\n• **Min**: {min_s} | **Max**: {max_s} (from {cnt_s} valid observations)."
            key_points.append(f"Mean: {mean_s}, Median: {med_s}")
            key_points.append(f"Min: {min_s}, Max: {max_s}")
        else:
            feat_cnt = len(evidence.get("features_described", [])) or (len(data) if isinstance(data, pd.DataFrame) else 0)
            answer_text = f"Statistical distribution breakdown across {feat_cnt} numerical features in `{dataset_name}`."
            key_points.append(f"Described features: {feat_cnt}")
        evidence_items.append(f"Computed descriptive statistics for `{dataset_name}`")

    elif intent == QueryIntent.INSIGHT_SUMMARY.value:
        q_low = question.lower()
        tot_r = evidence.get("total_rows", row_count)
        tot_c = evidence.get("total_columns", len(data.columns) if isinstance(data, pd.DataFrame) else 0)
        tot_m = evidence.get("total_missing", 0)

        if any(w in q_low for w in ["dimension", "dimensions", "shape", "how big", "size"]):
            answer_text = f"The dataset `{dataset_name}` has **{tot_r:,} rows** and **{tot_c} columns** ({tot_r * max(tot_c, 1):,} total data cells)."
            key_points.append(f"Dimensions: {tot_r:,} rows × {tot_c} columns")
            if tot_m > 0:
                key_points.append(f"Missing Values: {tot_m:,}")
            else:
                key_points.append("Data Completeness: 100% (0 missing values)")
        else:
            insights = evidence.get("automated_insights", [])
            answer_text = f"Executive Analytical Summary for `{dataset_name}` (**{tot_r:,} rows**, **{tot_c} columns**):\n"
            if insights:
                points_txt = [f"• **{ins['type']}**: {ins['statement']}" for ins in insights[:4]]
                answer_text += "\n".join(points_txt)
                for ins in insights[:3]:
                    key_points.append(f"{ins['type']}: {ins['metric']}")
            else:
                answer_text += f"The dataset contains {tot_r:,} records across {tot_c} columns with {tot_m:,} missing values detected."
                key_points.append(f"Scale: {tot_r:,} rows, {tot_c} columns")
        evidence_items.append(f"Dataset overview: {tot_r:,} rows, {tot_c} columns")

    # 13. PERCENTAGE CONTRIBUTION / SHARE OF TOTAL
    elif intent == QueryIntent.PERCENTAGE_CONTRIBUTION.value:
        grp_col = evidence.get("group_column", "group")
        meas_col = evidence.get("measure_column", "amount")
        tot_amt = evidence.get("total_amount", 0.0)
        top_grp = evidence.get("top_group", "")
        top_pct = evidence.get("top_percentage", 0.0)
        top_amt = evidence.get("top_amount", 0.0)

        answer_text = (
            f"Percentage contribution breakdown across `{grp_col}` in `{dataset_name}` (Total: **${tot_amt:,.2f}**):\n"
            f"**{top_grp}** accounts for the largest share at **{top_pct:.1f}%** (${top_amt:,.2f})."
        )
        if isinstance(data, pd.DataFrame) and not data.empty:
            for _, r in data.iterrows():
                grp_v = r.iloc[0]
                amt_v = r.iloc[1]
                pct_v = r.iloc[2]
                key_points.append(f"{grp_v}: {pct_v:.1f}% (${amt_v:,.2f})")
                evidence_items.append(f"{grp_col} '{grp_v}': share={pct_v}%, total={amt_v}")
        else:
            key_points.append(f"Top Contributor: {top_grp} ({top_pct:.1f}%)")
            key_points.append(f"Total Amount: ${tot_amt:,.2f}")

    # 14. FREQUENCY / MOST COMMON CATEGORY
    elif intent == QueryIntent.FREQUENCY.value:
        col = evidence.get("column", "category")
        top_val = evidence.get("most_frequent_value", "")
        top_cnt = evidence.get("frequency_count", 0)
        top_share = evidence.get("percentage_share", 0.0)
        tot_records = evidence.get("total_records", row_count)
        dist_cats = evidence.get("distinct_categories", 0)

        answer_text = (
            f"The most frequently used `{col}` in `{dataset_name}` is **{top_val}**, "
            f"occurring in **{top_cnt:,} of {tot_records:,} records** (**{top_share:.1f}%** of total)."
        )
        key_points.append(f"Most Frequent {col}: {top_val} ({top_cnt:,} occurrences, {top_share:.1f}%)")
        key_points.append(f"Total Records Evaluated: {tot_records:,}")
        if dist_cats:
            key_points.append(f"Distinct Categories: {dist_cats}")
        evidence_items.append(f"Mode for {col}: '{top_val}' with frequency {top_cnt}/{tot_records}")

    # 15. AVERAGE ORDER VALUE (AOV)
    elif intent == QueryIntent.AVERAGE_ORDER_VALUE.value:
        aov = evidence.get("aov", 0.0)
        tot_rev = evidence.get("total_revenue", 0.0)
        dist_orders = evidence.get("distinct_orders", 0)
        ord_col = evidence.get("order_column") or "Order Records"
        has_id = evidence.get("has_order_id", False)

        basis_str = f"distinct orders (`{ord_col}`)" if has_id else "individual transaction records"
        answer_text = (
            f"The Average Order Value (AOV) for `{dataset_name}` is **${aov:,.2f}**.\n\n"
            f"This is calculated from a total revenue of **${tot_rev:,.2f}** across **{dist_orders:,} {basis_str}**."
        )
        key_points.append(f"Average Order Value: ${aov:,.2f}")
        key_points.append(f"Total Revenue: ${tot_rev:,.2f}")
        key_points.append(f"Order Volume: {dist_orders:,} ({basis_str})")
        evidence_items.append(f"AOV = ${tot_rev:,.2f} / {dist_orders} = ${aov:,.2f}")

    # 16. PROFITABILITY
    elif intent == QueryIntent.PROFITABILITY.value:
        top_prod = evidence.get("top_product", "")
        top_val = evidence.get("top_value", 0.0)
        has_true_profit = evidence.get("has_true_profit", False)
        metric_used = evidence.get("metric_used", "profit")
        assumption = evidence.get("assumption", "")

        if has_true_profit:
            answer_text = (
                f"The most profitable product in `{dataset_name}` is **{top_prod}** "
                f"with total profit of **${top_val:,.2f}**."
            )
            key_points.append(f"Top Product: {top_prod}")
            key_points.append(f"Total Profit: ${top_val:,.2f}")
        else:
            answer_text = (
                f"**Notice on Profitability:** True product profitability cannot be definitively determined "
                f"because product cost, COGS, or margin data is not present in `{dataset_name}`.\n\n"
                f"Based on available sales data, **{top_prod}** generated the highest gross sales revenue at **${top_val:,.2f}**.\n\n"
                f"**Assumptions:** Stated under the operational assumption of uniform profit margins across products in the absence of explicit cost records."
            )
            key_points.append(f"Highest Revenue Product: {top_prod} (${top_val:,.2f})")
            key_points.append("Proxy Metric: Gross Sales Revenue (Profitability proxy)")
            limitations.append("True profitability requires product cost or margin data not present in this dataset.")
        if assumption:
            key_points.append(f"Assumption: {assumption}")
        evidence_items.append(f"Top product by {metric_used}: {top_prod} = {top_val}")

    # 17. MULTI-PART DASHBOARD
    elif intent == QueryIntent.DASHBOARD.value:
        summary_metrics = evidence.get("summary_metrics", {})
        reg_breakdown = evidence.get("region_breakdown", {})
        cat_breakdown = evidence.get("category_breakdown", {})
        unsupported = evidence.get("unsupported_metrics", [])

        metric_lines = []
        for k, v in summary_metrics.items():
            val_fmt = f"{v:,}" if "total order" in k.lower() else (f"${v:,.2f}" if isinstance(v, (int, float)) else f"{v}")
            metric_lines.append(f"• **{k}**: {val_fmt}")
            key_points.append(f"{k}: {val_fmt}")

        if reg_breakdown:
            top_r = list(reg_breakdown.items())[0]
            metric_lines.append(f"• **Top Region**: {top_r[0]} (${top_r[1]:,.2f})")
            key_points.append(f"Leading Region: {top_r[0]} (${top_r[1]:,.2f})")
        if cat_breakdown:
            top_c = list(cat_breakdown.items())[0]
            metric_lines.append(f"• **Top Category**: {top_c[0]} (${top_c[1]:,.2f})")
            key_points.append(f"Leading Category: {top_c[0]} (${top_c[1]:,.2f})")

        answer_text = f"Executive Analytical Dashboard for `{dataset_name}`:\n\n" + "\n".join(metric_lines)

        if unsupported:
            answer_text += "\n\n**Schema Limitations:**\n" + "\n".join(f"• {u}" for u in unsupported)
            for u in unsupported:
                limitations.append(u)

        evidence_items.append(f"Compiled multi-metric dashboard across {len(summary_metrics)} core KPIs")

    # 18. COMPARE GROUPS
    elif intent == QueryIntent.COMPARE_GROUPS.value:
        grp_col = evidence.get("group_col", "group")
        metric_col = evidence.get("metric_col", "metric")
        agg = evidence.get("aggregation", "total")
        top_grp = evidence.get("top_group")
        top_val = evidence.get("top_value")
        sec_grp = evidence.get("second_group")
        sec_val = evidence.get("second_value")

        if top_grp and sec_grp:
            diff_val = top_val - sec_val if (top_val is not None and sec_val is not None) else 0.0
            pct_val = (diff_val / sec_val * 100.0) if sec_val and sec_val != 0 else 0.0
            answer_text = (
                f"Comparison of `{agg}` `{metric_col}` between **{top_grp}** and **{sec_grp}** in `{dataset_name}`:\n\n"
                f"• **{top_grp}**: ${top_val:,.2f}\n"
                f"• **{sec_grp}**: ${sec_val:,.2f}\n\n"
                f"**{top_grp}** generated **${diff_val:,.2f}** ({pct_val:+.1f}%) more than **{sec_grp}**."
            )
            key_points.append(f"{top_grp}: ${top_val:,.2f}")
            key_points.append(f"{sec_grp}: ${sec_val:,.2f}")
            key_points.append(f"Difference: ${diff_val:,.2f} ({pct_val:+.1f}%)")
            evidence_items.append(f"Group comparison: {top_grp}=${top_val:,.2f} vs {sec_grp}=${sec_val:,.2f}")
        elif isinstance(data, pd.DataFrame) and not data.empty:
            answer_text = f"Comparison of `{agg}` `{metric_col}` by `{grp_col}` across {len(data)} groups."
            for _, r in data.iterrows():
                key_points.append(f"{r.iloc[0]}: ${r.iloc[1]:,.2f}" if isinstance(r.iloc[1], (int, float)) else f"{r.iloc[0]}: {r.iloc[1]}")
        else:
            answer_text = f"Compared `{metric_col}` across groups in `{dataset_name}`."

    # 19. GROUP BY
    elif intent == QueryIntent.GROUP_BY.value:
        col = query_plan.get("column") or "metric"
        agg = query_plan.get("aggregation") or "sum"
        group_by = query_plan.get("group_by", [])
        grp_name = group_by[0] if group_by else "group"
        if isinstance(data, pd.DataFrame) and not data.empty:
            top_entity = data.iloc[0, 0]
            top_val = data.iloc[0, 1]
            val_str = f"{top_val:,.2f}" if isinstance(top_val, (int, float)) else str(top_val)
            answer_text = f"Breakdown of {agg} `{col}` grouped by `{grp_name}` across {len(data)} categories. **{top_entity}** is highest with **{val_str}**."
            for _, r in data.head(5).iterrows():
                key_points.append(f"{r.iloc[0]}: {r.iloc[1]:,.2f}" if isinstance(r.iloc[1], (int, float)) else f"{r.iloc[0]}: {r.iloc[1]}")
                evidence_items.append(f"{r.iloc[0]} -> {r.iloc[1]}")
        else:
            answer_text = f"Computed {agg} `{col}` grouped by `{grp_name}`."

    # 20. COMPLEX SUBQUERY & MULTI-STAGE ANALYSIS (Section 6)
    elif intent == QueryIntent.COMPLEX_SUBQUERY.value:
        raw_ev = evidence.get("raw_evidence", {}) or evidence
        sub_type = raw_ev.get("subquery_type") or query_plan.get("metadata", {}).get("subquery_type", "entity_average_comparison")
        ent_col = raw_ev.get("entity_column") or query_plan.get("metadata", {}).get("entity_column", "Category")
        met_col = raw_ev.get("metric_column") or query_plan.get("column", "Metric")
        m_count = raw_ev.get("matching_entities_count", row_count)
        t_count = raw_ev.get("total_entities_evaluated", row_count)
        thresh = raw_ev.get("average_threshold", 0.0)
        comp_word = raw_ev.get("comparison_desc", "above")

        if sub_type == "compare_against_overall":
            o_total = raw_ev.get("overall_total", 0.0)
            answer_text = (
                f"Analysis comparing each `{ent_col}` against the overall `{met_col}` (Grand Total: **{o_total:,.2f}**):\n\n"
                f"Below is the breakdown showing each `{ent_col}`'s total revenue and percentage share of overall revenue."
            )
            key_points.append(f"Overall Total {met_col}: {o_total:,.2f}")
            key_points.append(f"Categories Evaluated: {row_count}")
        else:
            answer_text = (
                f"Found **{m_count}** `{ent_col}` item(s) (out of {t_count}) whose total `{met_col}` is **{comp_word}** "
                f"the overall average {ent_col.lower()} total of **{thresh:,.2f}**."
            )
            key_points.append(f"Threshold (Average {ent_col} {met_col}): {thresh:,.2f}")
            key_points.append(f"{ent_col.title()}s Exceeding Threshold: {m_count} of {t_count}")
            top_ents = raw_ev.get("top_entities", [])
            if top_ents:
                evidence_items.append(f"Top matching {ent_col}s: {', '.join(str(e) for e in top_ents[:3])}")

    # 21. SHOW DATA / PREVIEW
    elif intent == QueryIntent.SHOW_DATA.value:
        raw_ev = evidence.get("raw_evidence", {}) or evidence
        tot_r = raw_ev.get("total_filtered_rows") or evidence.get("total_rows") or row_count
        answer_text = f"Displaying a sample preview of `{dataset_name}` (showing first **{row_count}** records in the table below)."
        key_points.append(f"Preview records shown: {row_count}")
        key_points.append(f"Total dataset records: {tot_r:,}")
        evidence_items.append(f"Dataset preview: {row_count} rows displayed")

    # 22. DATA QUALITY REPORT
    elif intent == QueryIntent.DATA_QUALITY_REPORT.value:
        raw_ev = evidence.get("raw_evidence", {}) or evidence
        comp_pct = raw_ev.get("completeness_pct", 100.0)
        dup_cnt = raw_ev.get("duplicate_rows", 0)
        miss_cnt = raw_ev.get("missing_cells", 0)
        out_cnt = raw_ev.get("outlier_rows", 0)
        rating = raw_ev.get("health_rating", "Good")
        answer_text = (
            f"Comprehensive Data Quality Audit for `{dataset_name}`: Overall health status is **{rating}** "
            f"with **{comp_pct}% data completeness**. Detected **{miss_cnt:,}** missing values, "
            f"**{dup_cnt:,}** duplicate rows, and **{out_cnt:,}** outlier observations."
        )
        key_points.append(f"Overall Quality Rating: {rating}")
        key_points.append(f"Data Completeness: {comp_pct}%")
        key_points.append(f"Missing Values: {miss_cnt:,}")
        key_points.append(f"Duplicate Records: {dup_cnt:,}")
        key_points.append(f"Flagged Outlier Records: {out_cnt:,}")
        evidence_items.append(f"Data Quality Audit: {rating} ({comp_pct}% complete, {miss_cnt} nulls, {dup_cnt} dupes, {out_cnt} outliers)")

    # Fallback default
    else:
        answer_text = (
            f"I could not conclusively map your question to a supported column or analytical operation in `{dataset_name}`. "
            f"Please verify the column names and try asking about record counts, missing values, summary statistics, rankings, or trends."
        )
        key_points.append("Clarification requested: question not mapped to dataset schema.")
        evidence_items.append("Unmapped query intent")

    # Append column selection explanation if lineage established preference
    selection_expl = query_plan.get("metadata", {}).get("selection_explanation") or evidence.get("selection_explanation")
    if selection_expl and selection_expl not in key_points:
        key_points.append(selection_expl)

    # Append data source notice
    if source_label:
        evidence_items.append(source_label)

    # Append dataset mismatch notification (Section 9E)
    ds_mismatch = query_plan.get("metadata", {}).get("dataset_mismatch_warning")
    if ds_mismatch:
        if ds_mismatch not in limitations:
            limitations.append(ds_mismatch)
        answer_text = f"{answer_text}\n\n*Dataset Notice:* {ds_mismatch}"

    return {
        "answer": answer_text,
        "key_points": key_points,
        "evidence": evidence_items,
        "limitations": limitations,
        "confidence": confidence_label,
        "confidence_score": confidence_score,
    }
