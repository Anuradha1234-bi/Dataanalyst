"""Query Intent Detector for Natural-Language Data Questions.

Categorizes natural language analytical questions into a controlled, safe set of intents.
Does not invent unsupported intents. Rejects code execution or dangerous attempts.
"""

from typing import Dict, Any, List, Optional
import re
from query.query_models import QueryIntent


# Security blacklist patterns
DISALLOWED_PATTERNS = [
    r"\beval\s*\(",
    r"\bexec\s*\(",
    r"\bos\.system",
    r"\bsubprocess\b",
    r"\b__import__\b",
    r"\bimport\s+os\b",
    r"\bdelete\b.*?\b(file|table|database|directory)\b",
    r"\bdrop\b.*?\b(table|database)\b",
    r"\btruncate\b.*?\btable\b",
    r"\brun\s+python\s+code\b",
    r"\bpython\s+code\b",
    r"\bexecute\b.*?\b(code|script|sql|command)\b",
    r"\b(arbitrary\s+sql|arbitrary\s+code)\b",
    r"\b(select|insert|update|delete|drop|alter)\s+.*\s+from\b",
    r"\bsh\b|\bbash\b|\bcmd\b|\bpowershell\b",
]


def _get_dataset_tokens(metadata: Optional[Dict[str, Any]]) -> set:
    """Extract lowercased column names, terms, and sub-tokens from dataset metadata."""
    tokens = set()
    if not metadata or not isinstance(metadata, dict):
        return tokens
    top_cols = metadata.get("columns") or metadata.get("column_names")
    if isinstance(top_cols, list):
        for c in top_cols:
            tokens.add(str(c).lower())
            for sub in re.findall(r"[a-zA-Z0-9]+", str(c).lower()):
                tokens.add(sub)
    for k, v in metadata.items():
        if isinstance(v, dict):
            cols = v.get("columns") or v.get("column_names") or []
            if isinstance(cols, list):
                for c in cols:
                    tokens.add(str(c).lower())
                    for sub in re.findall(r"[a-zA-Z0-9]+", str(c).lower()):
                        tokens.add(sub)
        tokens.add(str(k).lower())
    return tokens


def detect_query_intent(
    question: str,
    metadata: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Detect the analytical intent from user question and context.

    Contract:
    Returns:
    {
        "intent": "TOP_N",
        "confidence": 0.92,
        "reason": "...",
        "candidate_intents": []
    }
    """
    if not question or not question.strip():
        return {
            "intent": QueryIntent.UNKNOWN.value,
            "confidence": 0.0,
            "reason": "Empty or whitespace-only question.",
            "candidate_intents": [],
        }

    q_clean = question.strip()
    q_lower = q_clean.lower()

    # 1. Security Check: Reject code execution requests immediately
    for pattern in DISALLOWED_PATTERNS:
        if re.search(pattern, q_lower):
            return {
                "intent": QueryIntent.UNKNOWN.value,
                "confidence": 0.0,
                "reason": "Question contains disallowed code execution, file system, or arbitrary command patterns.",
                "candidate_intents": [],
            }

    # 2. Check for Contextual Follow-ups
    prev_plan = context.get("previous_query_plan") if context else None
    if prev_plan and isinstance(prev_plan, dict):
        prev_intent = prev_plan.get("intent")
        if re.search(r"\b(second|2nd|third|3rd|next|another)\s+(highest|lowest|best|worst|top|bottom)\b", q_lower):
            target_intent = QueryIntent.TOP_N.value if any(w in q_lower for w in ["highest", "best", "top"]) else QueryIntent.BOTTOM_N.value
            return {
                "intent": target_intent,
                "confidence": 0.95,
                "reason": f"Follow-up rank modification referencing previous {prev_intent} query.",
                "candidate_intents": [{"intent": target_intent, "score": 0.95}],
            }
        if re.search(r"\b(make\s+it|change\s+to|show)\s+(top|bottom)?\s*(\d+)\b", q_lower):
            return {
                "intent": prev_intent or QueryIntent.TOP_N.value,
                "confidence": 0.95,
                "reason": "Follow-up limit modification for previous query.",
                "candidate_intents": [{"intent": prev_intent or QueryIntent.TOP_N.value, "score": 0.95}],
            }

    # 3. Intent Pattern Matching with Candidates
    candidates: List[Dict[str, Any]] = []

    def add_candidate(intent: QueryIntent, score: float, reason: str, candidate_meta: Optional[Dict[str, Any]] = None):
        cand: Dict[str, Any] = {"intent": intent.value, "score": score, "reason": reason}
        if candidate_meta:
            cand["metadata"] = candidate_meta
        candidates.append(cand)

    # A. Row Count & Dataset Size (Highest specificity for dataset volume questions)
    row_count_patterns = [
        r"\bhow\s+many\s+(?:rows?|records?|observations?|entries|items?|tuples?)\b",
        r"\b(?:number|count|total)\s+of\s+(?:rows?|records?|observations?|entries|items?|tuples?)\b",
        r"\btotal\s+(?:number\s+of\s+)?(?:rows?|records?|observations?|entries)\b",
        r"\b(?:row|record|observation)\s+count\b",
        r"\b(?:rows?|records?|observations?)\s+in\s+(?:this|our|the)\s+(?:dataset|file|data|table|csv|excel)\b",
        r"\bhow\s+big\s+is\s+(?:this|our|the)\s+(?:dataset|file|data|table)\b",
        r"\bsize\s+of\s+(?:this|our|the)\s+(?:dataset|file|data|table)\b",
        r"\b(?:dataset|file|table)\s+size\b",
        r"\bhow\s+many\s+(?:data\s+)?points\b",
    ]
    if any(re.search(pat, q_lower) for pat in row_count_patterns) or q_lower.strip() in (
        "how many row in our file", "how many rows in our file", "how many row", "how many rows",
        "how many records", "row count", "rows", "records", "count", "record count", "total records"
    ):
        add_candidate(QueryIntent.COUNT, 0.98, "Matches record/row count inquiry.")

    # B. Column Count & Feature Schema
    col_count_patterns = [
        r"\bhow\s+many\s+(?:columns?|features?|variables?|fields?|attributes?)\b",
        r"\b(?:number|count|total)\s+of\s+(?:columns?|features?|variables?|fields?|attributes?)\b",
        r"\btotal\s+(?:number\s+of\s+)?(?:columns?|features?|variables?|fields?|attributes?)\b",
        r"\b(?:column|feature|variable)\s+count\b",
        r"\b(?:features?|columns?|variables?|fields?)\s+(?:are\s+)?available\b",
        r"\bwhich\s+columns?\s+(?:are\s+there|exist|available)\b",
        r"\blist\s+(?:all\s+)?columns?\b",
        r"\bshow\s+(?:all\s+)?columns?\b",
        r"\bwhat\s+(?:are\s+the\s+)?columns?\b",
        r"\bcolumn\s+types?\b",
        r"\bdata\s+types?\b",
        r"\bdatatypes\b",
        r"\bdtypes\b",
    ]
    if any(re.search(pat, q_lower) for pat in col_count_patterns):
        add_candidate(QueryIntent.DATA_TYPES, 0.96, "Matches column/feature count and schema inquiry.")

    # C. Data Hygiene: Missing Values, Nulls, NaNs, Incomplete Records
    missing_patterns = [
        r"\b(?:missing|null|nan|blank|empty|unfilled)\s+(?:values?|data|cells?|counts?|records?)\b",
        r"\b(?:columns?|features?)\s+(?:have|with|contain)\s+(?:missing|null|nan|incomplete)\b",
        r"\b(?:are\s+there|any)\s+(?:missing|null|nan)\s+(?:values?|data)?\b",
        r"\bhow\s+many\s+(?:missing|null|nan)\b",
        r"\bmissing\s+values?\s+column-?wise\b",
        r"\bshow\s+missing\b",
        r"\bincomplete\s+records?\b",
        r"\bnull\s+values?\b",
        r"\bnull\s+count\b",
    ]
    if any(re.search(pat, q_lower) for pat in missing_patterns) or any(k in q_lower for k in ["missing value", "missing values", "null values", "nan", "missing data", "nulls", "nans"]):
        add_candidate(QueryIntent.MISSING_VALUES, 0.96, "Matches missing value inquiry keywords.")
    elif "missing" in q_lower or (re.search(r"\bnull\b", q_lower) and "null hypothesis" not in q_lower):
        add_candidate(QueryIntent.MISSING_VALUES, 0.88, "Matches keyword 'missing' or 'null'.")

    # D. Duplicates
    if any(k in q_lower for k in ["duplicate", "duplicates", "duplicated", "repeated rows", "identical rows"]):
        add_candidate(QueryIntent.DUPLICATES, 0.95, "Matches duplicate records inquiry keywords.")

    # E. Unique / Distinct Values
    if any(k in q_lower for k in ["unique value", "unique values", "distinct values", "how many unique", "nunique"]):
        add_candidate(QueryIntent.UNIQUE_VALUES, 0.92, "Matches unique / distinct value inquiry.")

    # F. Anomalies & Outliers
    if any(k in q_lower for k in ["unusual record", "anomalous record", "show anomalies", "show outliers", "list outliers", "outlier rows"]):
        add_candidate(QueryIntent.ANOMALY_RECORDS, 0.94, "Matches anomalous record extraction keywords.")
    elif any(k in q_lower for k in ["unusual value", "unusual values", "anomal", "outlier", "outliers", "isolation forest", "iqr"]):
        add_candidate(QueryIntent.ANOMALY_SUMMARY, 0.92, "Matches statistical anomaly summary keywords.")

    # Data Quality Report / Hygiene Audit
    if any(k in q_lower for k in [
        "data quality report", "data quality", "quality report", "data hygiene report",
        "quality audit", "data quality audit", "data hygiene audit", "dataset quality"
    ]):
        add_candidate(QueryIntent.DATA_QUALITY_REPORT, 0.98, "Matches comprehensive data quality report keywords.")

    # G. Correlation
    if any(k in q_lower for k in [
        "correlat", "correlation", "strongly correlated", "highest correlation",
        "strongest correlation", "association between", "relationship between"
    ]):
        add_candidate(QueryIntent.CORRELATION, 0.96, "Matches statistical correlation keywords.")

    # H. Dataset Summary, Insights & Dimensions
    summary_patterns = [
        r"\b(?:summarize|summarise)\s+(?:the\s+)?(?:important\s+)?findings?\b",
        r"\b(?:explain|show)\s+(?:the\s+)?main\s+patterns?\b",
        r"\bwhat\s+else\s+can\s+you\s+tell\s+me\s+about\s+(?:this|the|our)\s+dataset\b",
        r"\b(?:give\s+me\s+a\s+)?(?:dataset|executive|data)\s+summary\b",
        r"\bsummary\s+of\s+(?:this|the|our)\s+(?:dataset|file|data)\b",
        r"\bsummarize\s+(?:this|the|our)\s+(?:dataset|file|data)\b",
        r"\bkey\s+findings?\b",
        r"\bmain\s+insights?\b",
        r"\bdataset\s+dimensions?\b",
        r"\bdimensions\s+of\s+(?:this|the|our)\s+dataset\b",
        r"\bshow\s+me\s+(?:the\s+)?dataset\s+dimensions?\b",
        r"\bwhat\s+are\s+the\s+(?:dataset\s+)?dimensions?\b",
        r"\bdataset\s+shape\b",
    ]
    if any(re.search(pat, q_lower) for pat in summary_patterns) or any(k in q_lower for k in ["main insight", "main insights", "explain the main insights", "key findings", "important findings", "summary of insight", "executive insight", "dataset summary"]):
        add_candidate(QueryIntent.INSIGHT_SUMMARY, 0.96, "Matches insight summary keywords.")

    # I. Multi-Statistic / Descriptive Statistics
    stat_tokens = ["mean", "average", "median", "minimum", "maximum", "min", "max", "std", "standard deviation", "variance", "skewness", "kurtosis", "quartile", "percentile", "distribution"]
    matched_stat_tokens = [tok for tok in stat_tokens if re.search(r"\b" + re.escape(tok) + r"\b", q_lower)]
    if len(matched_stat_tokens) >= 2 or any(k in q_lower for k in ["descriptive statistics", "summary statistics", "moments", "distribution summary"]):
        add_candidate(QueryIntent.DESCRIPTIVE_STATISTICS, 0.96, "Matches multi-metric descriptive statistics keywords.")

    # J. Statistical Analysis, Regression & Hypothesis Testing
    if any(k in q_lower for k in ["regression", "linear regression", "regress", "r-squared", "trend line equation", "ordinary least squares"]):
        add_candidate(QueryIntent.REGRESSION, 0.96, "Matches linear regression keywords.")

    if any(k in q_lower for k in ["t-test", "ttest", "statistically significant difference", "compare two groups", "is the difference significant", "mann-whitney", "hypothesis test"]):
        add_candidate(QueryIntent.TWO_GROUP_TEST, 0.95, "Matches two-group hypothesis testing keywords.")

    if any(k in q_lower for k in ["chi-square", "chi square", "contingency table", "categorical association", "cramers v"]):
        add_candidate(QueryIntent.CHI_SQUARE, 0.95, "Matches chi-square categorical association test.")

    # K. Predictive & Forecasting Queries (Phase 5)
    if any(k in q_lower for k in ["forecast", "predict future", "future sales", "next 7 days", "next 14 days", "next 30 days", "projected", "future demand", "what will the price be", "forecast demand"]):
        add_candidate(QueryIntent.FORECAST, 0.95, "Matches forecasting inquiry keywords.")
    elif any(k in q_lower for k in ["predict", "prediction", "which model performed better", "which model performs better", "model accuracy", "model performance", "predicted price", "predicted value"]):
        add_candidate(QueryIntent.PREDICTION, 0.92, "Matches predictive modeling inquiry keywords.")

    # L. Temporal & Trend Queries
    trend_patterns = [
        r"\btrend\s+of\s+.+?\s+(?:over|by|across)\s+",
        r"\btrend\s+over\s+time\b",
        r"\bover\s+(?:time|date|admission_date|admission\s+date)\b",
        r"\b(?:monthly|daily|weekly|yearly)\s+trend\b",
        r"\btrajectory\b",
    ]
    if any(re.search(pat, q_lower) for pat in trend_patterns) or any(k in q_lower for k in ["trend over", "trend of", "price trend", "trajectory", "monthly trend", "daily trend", "weekly trend"]):
        add_candidate(QueryIntent.TREND, 0.95, "Matches temporal trend inquiry keywords.")
    elif re.search(r"\btrend\b", q_lower):
        add_candidate(QueryIntent.TREND, 0.88, "Matches keyword 'trend'.")

    if any(k in q_lower for k in ["what changed between", "difference between dates", "compare august and september", "compare dates", "change between"]):
        add_candidate(QueryIntent.DATE_COMPARISON, 0.95, "Matches date-to-date comparison keywords.")

    if any(k in q_lower for k in ["percentage change", "percent change", "pct change", "growth rate", "how much did price increase"]):
        add_candidate(QueryIntent.PERCENTAGE_CHANGE, 0.92, "Matches percentage change inquiry.")

    if any(k in q_lower for k in ["between", "from date", "during year", "in 202", "date range"]) and any(w in q_lower for w in ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "2024", "2025", "2026"]):
        add_candidate(QueryIntent.DATE_RANGE, 0.88, "Matches date range filter keywords.")

    # M. Cross-dataset & Dataset Comparison
    if any(k in q_lower for k in ["compare these two datasets", "compare datasets", "compare both datasets", "dataset comparison"]):
        add_candidate(QueryIntent.COMPARE_DATASETS, 0.95, "Matches dataset comparison keywords.")

    if any(k in q_lower for k in ["compare sales and customer", "across datasets", "joined with", "customers who purchased", "customer sales", "compare sales between regions", "sales by region", "sales between regions"]):
        add_candidate(QueryIntent.CROSS_DATASET_ANALYSIS, 0.95, "Matches cross-dataset analysis keywords.")

    if any(k in q_lower for k in ["new and returning", "returning and new"]) and any(k in q_lower for k in ["compare", "difference", "total revenue", "revenue", "sales"]):
        add_candidate(QueryIntent.COMPARE_GROUPS, 0.98, "Matches customer group comparison (new vs returning).")
    elif any(k in q_lower for k in ["compare sales between two regions", "compare between regions", "compare groups", "compare categories", "compare the total revenue"]):
        add_candidate(QueryIntent.COMPARE_GROUPS, 0.90, "Matches group comparison keywords.")

    # Multi-Part Executive Dashboard Query
    dash_patterns = [
        r"\b(?:create|show|build|generate|display)\s+(?:a\s+)?(?:summary\s+)?dashboard\b",
        r"\bdashboard\s+showing\b",
        r"\bexecutive\s+dashboard\b",
        r"\bmulti-?metric\s+dashboard\b",
    ]
    metric_clause_count = sum(1 for phrase in ["total revenue", "total orders", "average order value", "revenue by", "sales by", "sales per"] if phrase in q_lower)
    if any(re.search(p, q_lower) for p in dash_patterns) or metric_clause_count >= 3:
        add_candidate(QueryIntent.DASHBOARD, 0.98, "Matches multi-part executive dashboard request.")

    # Percentage Contribution / Share of Total
    pct_contrib_patterns = [
        r"\bpercentage\s+of\s+.+?\s+(?:contributed\s+by|by|across|per)\s+",
        r"\bpercentage\s+contribution\b",
        r"\bshare\s+of\s+(?:total\s+)?(?:revenue|sales|amount|orders|volume)\b",
        r"\bproportion\s+of\s+(?:total\s+)?(?:revenue|sales|amount)\b",
        r"\bpercentage\s+share\b",
        r"\bbreakdown\s+of\s+.+?\s+in\s+percentage\b",
    ]
    if any(re.search(p, q_lower) for p in pct_contrib_patterns) or ("percentage" in q_lower and "contributed" in q_lower):
        add_candidate(QueryIntent.PERCENTAGE_CONTRIBUTION, 0.98, "Matches percentage contribution / share of total inquiry.")

    # Frequency / Most Common Category / Mode
    freq_patterns = [
        r"\b(?:find\s+)?(?:the\s+)?most\s+(?:frequently|common|popular|used)\s+(?:used\s+)?([a-zA-Z0-9_\s]+)",
        r"\bwhich\s+([a-zA-Z0-9_\s]+)\s+is\s+most\s+(?:common|frequently\s+used|popular|frequent)\b",
        r"\bmost\s+(?:frequently\s+used|frequent|common|popular)\s+([a-zA-Z0-9_]+)\b",
        r"\bfrequency\s+of\s+([a-zA-Z0-9_]+)\b",
        r"\bmode\s+of\s+([a-zA-Z0-9_]+)\b",
        r"\bvalue\s+counts?\s+(?:of|for)\b",
    ]
    if any(re.search(p, q_lower) for p in freq_patterns) or any(k in q_lower for k in ["most frequently used", "most frequent", "most common category", "most popular payment", "frequently used"]):
        add_candidate(QueryIntent.FREQUENCY, 0.98, "Matches categorical frequency / mode inquiry.")

    # Average Order Value (AOV)
    aov_patterns = [
        r"\baverage\s+order\s+value\b",
        r"\bmean\s+order\s+value\b",
        r"\baov\b",
        r"\baverage\s+value\s+per\s+order\b",
        r"\baverage\s+amount\s+per\s+order\b",
    ]
    if any(re.search(p, q_lower) for p in aov_patterns):
        add_candidate(QueryIntent.AVERAGE_ORDER_VALUE, 0.98, "Matches Average Order Value (AOV) inquiry.")

    # Profitability Analysis
    profit_patterns = [
        r"\bmost\s+profitable\s+([a-zA-Z0-9_]+)\b",
        r"\bhighest\s+profit\b",
        r"\bprofitability\s+(?:of|by|across)\b",
        r"\bmost\s+profitable\b",
        r"\bproduct\s+profitability\b",
    ]
    if any(re.search(p, q_lower) for p in profit_patterns) or "profitable" in q_lower or "profitability" in q_lower:
        add_candidate(QueryIntent.PROFITABILITY, 0.98, "Matches profitability analysis inquiry.")

    # Highest-Sales Day / Date Grouping
    if any(k in q_lower for k in ["highest-sales day", "highest sales day", "best sales day", "peak sales date", "day with the highest sales", "identify the highest-sales day"]):
        add_candidate(QueryIntent.TOP_N, 0.98, "Matches highest-sales date ranking.")

    # N. Rankings: Top N & Bottom N
    num_words_pat = r"(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)"
    top_n_pattern = rf"\b(top|highest|best|largest|peak|greatest)\s*({num_words_pat})?\b"
    bottom_n_pattern = rf"\b(bottom|lowest|worst|smallest|least)\s*({num_words_pat})?\b"

    match_top = re.search(top_n_pattern, q_lower)
    match_bottom = re.search(bottom_n_pattern, q_lower)

    if match_top:
        limit_str = match_top.group(2)
        if limit_str:
            add_candidate(QueryIntent.TOP_N, 0.96, f"Matches Top-{limit_str} ranking pattern.")
        elif any(w in q_lower for w in ["which", "what", "who"]) and any(w in q_lower for w in ["highest", "largest", "peak", "maximum"]):
            add_candidate(QueryIntent.TOP_N, 0.93, "Matches superlative highest ranking question (Top 1).")
        else:
            add_candidate(QueryIntent.TOP_N, 0.85, "Matches top ranking keywords.")

    if match_bottom:
        limit_str = match_bottom.group(2)
        if limit_str:
            add_candidate(QueryIntent.BOTTOM_N, 0.96, f"Matches Bottom-{limit_str} ranking pattern.")
        elif any(w in q_lower for w in ["which", "what"]) and any(w in q_lower for w in ["lowest", "smallest", "minimum"]):
            add_candidate(QueryIntent.BOTTOM_N, 0.93, "Matches superlative lowest ranking question (Bottom 1).")
        else:
            add_candidate(QueryIntent.BOTTOM_N, 0.85, "Matches bottom ranking keywords.")

    # O. Complex Subquery & Multi-Stage Analysis (Section 6)
    complex_subquery_patterns = [
        r"\b(?:find|show|list|identify|get|which)\s+([a-zA-Z0-9_\s]+?)\s+(?:whose|with|where|having)\s+([a-zA-Z0-9_\s]+?)\s+(?:is|are|exceeds|exceed)?\s*(?:greater\s+than|more\s+than|above|higher\s+than|exceeds?|below|less\s+than|lower\s+than|under)\s+(?:the\s+)?(?:overall\s+)?(?:average|mean)\b",
        r"\b(?:categories|products|items|customers|markets|regions|departments)\s+whose\s+.+?\s+(?:exceeds?|is\s+greater\s+than|is\s+above|is\s+more\s+than|is\s+below|is\s+less\s+than)\s+(?:the\s+)?(?:overall\s+)?(?:average|mean)\b",
        r"\b(?:exceeds?|above|greater\s+than|more\s+than|higher\s+than)\s+(?:the\s+)?(?:overall\s+)?(?:average|mean)\s+(?:category|product|customer|item|market|region)?\s*(?:revenue|sales|spending|amount|quantity|price)?\b",
        r"\b(?:below|less\s+than|lower\s+than|under)\s+(?:the\s+)?(?:overall\s+)?(?:average|mean)\s+(?:category|product|customer|item|market|region)?\s*(?:revenue|sales|spending|amount|quantity|price)?\b",
        r"\bcompare\s+each\s+[a-zA-Z0-9_\s]+?(?:'s)?\s+[a-zA-Z0-9_\s]+?\s+(?:against|with|to)\s+(?:the\s+)?(?:overall|total)\s+[a-zA-Z0-9_\s]+\b",
        r"\bspent\s+more\s+than\s+(?:the\s+)?average\b",
        r"\bsales\s+(?:are\s+)?above\s+(?:the\s+)?average\s+sales\b",
        r"\brevenue\s+exceeds\s+(?:the\s+)?(?:overall\s+)?average\b",
    ]
    if any(re.search(pat, q_lower) for pat in complex_subquery_patterns):
        add_candidate(QueryIntent.COMPLEX_SUBQUERY, 0.98, "Matches complex multi-stage/subquery analytical pattern.")

    # Distinct Count and Non-Null Count
    distinct_patterns = [
        r"\b(?:distinct|unique)\s+count\b",
        r"\bcount\s+distinct\b",
        r"\bhow\s+many\s+(?:distinct|unique|different)\s+([a-zA-Z0-9_\s]+)\b",
        r"\bnumber\s+of\s+(?:distinct|unique|different)\s+([a-zA-Z0-9_\s]+)\b",
    ]
    if any(re.search(pat, q_lower) for pat in distinct_patterns):
        add_candidate(QueryIntent.UNIQUE_VALUES, 0.96, "Matches count distinct / unique count inquiry.")

    non_null_patterns = [
        r"\b(?:non-?null|non\s+null|valid|non-?empty)\s+count\b",
        r"\bcount\s+(?:of\s+)?(?:non-?null|non\s+null|valid|non-?empty)\b",
        r"\bhow\s+many\s+(?:non-?null|non\s+null|valid|non-?empty)\b",
        r"\bnumber\s+of\s+(?:non-?null|non\s+null|valid|non-?empty)\b",
    ]
    if any(re.search(pat, q_lower) for pat in non_null_patterns):
        add_candidate(QueryIntent.COUNT, 0.96, "Matches non-null count inquiry.", candidate_meta={"count_type": "non_null"})

    # P. Basic Aggregations (Single-metric)
    std_patterns = [
        r"\b(?:standard\s+deviation|std\s+dev|stdev|std\s+of)\b",
        r"\bstd\b",
    ]
    if any(re.search(pat, q_lower) for pat in std_patterns):
        add_candidate(QueryIntent.STANDARD_DEVIATION, 0.96, "Matches standard deviation statistical inquiry.")

    if any(k in q_lower for k in ["average", "mean", "avg", "typical"]):
        add_candidate(QueryIntent.AVERAGE, 0.90, "Matches average/mean aggregation keyword.")

    if any(k in q_lower for k in ["median", "50th percentile"]):
        add_candidate(QueryIntent.MEDIAN, 0.92, "Matches median aggregation keyword.")

    sum_patterns = [
        r"\bhow\s+much\s+(?:money\s+did\s+we\s+make|money|revenue|sales?|turnover|income|spend|spending)\b",
        r"\b(?:can\s+you\s+tell\s+me\s+(?:the\s+)?)?overall\s+(?:sales|revenue|amount|total|turnover|quantity|spending)\b",
        r"\b(?:calculate|find|get|give\s+me|show\s+me|what\s+is|what's)\s+(?:the\s+)?(?:total|overall|sum\s+of|aggregate|net|gross)\s+(?:sales|revenue|amount|turnover|spending|quantity|profit)?\b",
        r"\bhow\s+much\s+did\s+we\s+(?:make|earn|sell|spend)\b",
        r"\bhow\s+much\s+was\s+spent\b",
        r"\b(?:sum\s+of|total\s+of|total\s+sales|total\s+revenue|total\s+quantity|total\s+amount|sum\s+total|overall\s+sales|overall\s+revenue)\b",
    ]
    if any(re.search(pat, q_lower) for pat in sum_patterns) or any(k in q_lower for k in [
        "sum of", "total of", "total sales", "total revenue", "total quantity", "total amount",
        "money did we make", "overall sales", "overall revenue", "overall amount", "overall sales amount",
        "calculate total", "calculate sales", "calculate revenue", "give me total", "show total",
        "sum total", "total earnings", "how much money"
    ]):
        add_candidate(QueryIntent.SUM, 0.94, "Matches summation/monetary aggregation keywords.")

    if "minimum" in q_lower or (re.search(r"\bmin\b", q_lower) and "minute" not in q_lower):
        add_candidate(QueryIntent.MINIMUM, 0.88, "Matches minimum aggregation keyword.")

    if "maximum" in q_lower or (re.search(r"\bmax\b", q_lower) and "maximum" not in q_lower):
        add_candidate(QueryIntent.MAXIMUM, 0.88, "Matches maximum aggregation keyword.")

    # Grouping
    if any(k in q_lower for k in ["group by", "grouped by", "by department", "by market", "by commodity", "by region", "by customer", "per category", "for each", "category-wise", "department-wise", "region-wise"]):
        add_candidate(QueryIntent.GROUP_BY, 0.85, "Matches grouping keywords.")

    # Filtering & Showing data
    if any(k in q_lower for k in ["where", "greater than", "less than", "is equal to", "filtered by", "more than", "above"]):
        add_candidate(QueryIntent.FILTER, 0.82, "Matches filter clause keywords.")

    if any(k in q_lower for k in [
        "preview dataset", "preview data", "preview the dataset", "show preview",
        "sample dataset", "sample data", "sample records", "show me records",
        "show data", "display rows", "view records", "show the first", "preview"
    ]):
        add_candidate(QueryIntent.SHOW_DATA, 0.95, "Matches raw records display inquiry.")

    # Distribution / Histogram
    if any(k in q_lower for k in [
        "show distribution", "distribution of", "value distribution", "frequency distribution",
        "show histogram", "generate histogram"
    ]):
        add_candidate(QueryIntent.FREQUENCY, 0.95, "Matches distribution visualization inquiry.")

    # Suitable Chart / Automated Visualization
    if any(k in q_lower for k in [
        "generate suitable chart", "suitable chart", "generate chart", "create chart",
        "suggest chart", "recommended chart", "recommend chart", "visualize dataset"
    ]):
        add_candidate(QueryIntent.INSIGHT_SUMMARY, 0.92, "Matches automated chart recommendation request.", candidate_meta={"action": "suitable_chart"})

    # Sort
    if any(k in q_lower for k in ["sort by", "order by", "sorted ascending", "sorted descending"]):
        add_candidate(QueryIntent.SORT, 0.85, "Matches sorting keywords.")

    # Highest and lowest values
    if "highest and lowest" in q_lower or "max and min" in q_lower:
        add_candidate(QueryIntent.DESCRIPTIVE_STATISTICS, 0.90, "Matches range (highest and lowest) inquiry.")

    # P. Unsupported Analytical Operations on Datasets
    unsupported_ops = [
        "kurtosis", "skewness", "variance", "fourier", "fft", "clustering",
        "kmeans", "k-means", "anova", "pca", "eigenvalue", "eigenvalues",
        "monte carlo", "survival analysis", "arima", "factor analysis",
    ]
    for uop in unsupported_ops:
        if re.search(r"\b" + re.escape(uop) + r"\b", q_lower):
            add_candidate(
                QueryIntent.UNSUPPORTED_OPERATION,
                0.95,
                f"Matches unsupported analytical operation '{uop}'.",
                candidate_meta={"unsupported_operation": uop},
            )
            break

    dataset_tokens = _get_dataset_tokens(metadata)

    # Schema-aware fallback: if no candidate matched yet, inspect tokens against actual schema
    if not candidates and metadata:
        words_in_q = set(re.findall(r"[a-zA-Z0-9_]+", q_lower))
        matched_cols = [c for c in dataset_tokens if c in words_in_q and len(c) > 2]
        if matched_cols:
            # Question mentions an actual dataset column!
            # Infer the most likely intended analytical operation
            if any(w in words_in_q for w in ["average", "mean", "avg", "typical"]):
                add_candidate(QueryIntent.AVERAGE, 0.85, f"Inferred average inquiry for column in dataset.")
            elif any(w in words_in_q for w in ["total", "sum", "overall", "make", "earn", "much", "spent", "spending", "revenue", "sales"]):
                add_candidate(QueryIntent.SUM, 0.85, f"Inferred summation inquiry for column in dataset.")
            elif any(w in words_in_q for w in ["highest", "max", "maximum", "peak", "best"]):
                add_candidate(QueryIntent.MAXIMUM, 0.85, f"Inferred maximum inquiry for column in dataset.")
            elif any(w in words_in_q for w in ["lowest", "min", "minimum", "worst", "least"]):
                add_candidate(QueryIntent.MINIMUM, 0.85, f"Inferred minimum inquiry for column in dataset.")
            elif any(w in words_in_q for w in ["how", "many", "count", "number"]):
                add_candidate(QueryIntent.COUNT, 0.85, f"Inferred count inquiry for column in dataset.")
            elif any(w in words_in_q for w in ["distinct", "unique", "different"]):
                add_candidate(QueryIntent.UNIQUE_VALUES, 0.85, f"Inferred unique values inquiry for column in dataset.")
            elif any(w in words_in_q for w in ["by", "per", "across", "each"]):
                add_candidate(QueryIntent.GROUP_BY, 0.85, f"Inferred grouping inquiry for column in dataset.")
            else:
                add_candidate(QueryIntent.SHOW_DATA, 0.75, f"Inferred data inspection inquiry for column in dataset.")

    if not candidates:
        # Check if question is an out-of-scope / unrelated inquiry
        out_of_scope_patterns = [
            r"\b(?:capital\s+of|population\s+of|where\s+is|what\s+country|continent|president\s+of|prime\s+minister|who\s+was|who\s+is|tell\s+me\s+about|history\s+of)\b",
            r"\b(?:photosynthesis|gravity|quantum|mitochondria|dna|rna|chemical\s+formula|speed\s+of\s+light|atoms?|molecules?|solar\s+system|planets?|black\s+hole)\b",
            r"\b(?:tell\s+me\s+a\s+joke|write\s+a\s+poem|how\s+are\s+you|who\s+created\s+you|what\s+is\s+your\s+name|weather\s+in|recipe\s+for|meaning\s+of\s+life)\b",
            r"\b(?:explain|describe|define)\s+(?!the\s+dataset|this\s+dataset|our\s+dataset|data|columns?|rows?|missing|records?)[a-zA-Z\s]+(?:\s+in\s+simple\s+words|\s+simply|\s+briefly)?$",
        ]

        data_terms = {
            "dataset", "datasets", "file", "table", "csv", "excel", "row", "rows",
            "record", "records", "column", "columns", "feature", "features",
            "entry", "entries", "null", "nulls", "nan", "nans", "missing",
            "filter", "where", "sort", "rank", "average", "mean", "sum", "count",
            "std", "deviation", "median", "min", "max", "trend", "correlation",
            "distribution", "value", "values", "chart", "graph", "metric"
        }

        words_in_q = set(re.findall(r"[a-zA-Z0-9_]+", q_lower))
        has_dataset_term = bool(words_in_q & data_terms)
        has_dataset_col = bool(words_in_q & dataset_tokens) if dataset_tokens else False
        matches_explicit_oos = any(re.search(pat, q_lower) for pat in out_of_scope_patterns)

        if matches_explicit_oos or (not has_dataset_term and not has_dataset_col):
            return {
                "intent": QueryIntent.OUT_OF_SCOPE.value,
                "confidence": 0.95,
                "reason": "The question is an out-of-scope inquiry unrelated to the loaded dataset.",
                "candidate_intents": [],
            }

        return {
            "intent": QueryIntent.UNKNOWN.value,
            "confidence": 0.20,
            "reason": "Could not conclusively map question to a known analytical intent.",
            "candidate_intents": [],
        }

    # Sort candidates by descending score
    candidates.sort(key=lambda x: x["score"], reverse=True)
    top_cand = candidates[0]

    res_dict: Dict[str, Any] = {
        "intent": top_cand["intent"],
        "confidence": top_cand["score"],
        "reason": top_cand["reason"],
        "candidate_intents": candidates,
    }
    if "metadata" in top_cand:
        res_dict["metadata"] = top_cand["metadata"]

    return res_dict
