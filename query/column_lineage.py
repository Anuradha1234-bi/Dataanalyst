"""Column Lineage and Join Metadata Inspector.

Inspects dataset schemas, join history, and column name structures to determine:
- Actual column name
- Display name
- Base column name (stripped of join suffixes)
- Data type
- Whether a column is an original or join-generated column
- Source dataset and source column (only when verified by metadata, never guessed)
- Readable clarification labels
"""

from typing import Dict, Any, List, Optional,Union, Tuple
from dataclasses import dataclass, field, asdict
import re
from pathlib import Path


@dataclass
class ColumnLineageInfo:
    """Lineage metadata for a single dataset column."""
    actual_name: str
    base_name: str
    display_name: str
    data_type: str = "unknown"
    is_join_generated: bool = False
    source_dataset: Optional[str] = None
    source_column: Optional[str] = None
    suffix: Optional[str] = None
    clarification_label: str = ""
    description: str = ""

    @property
    def label(self) -> str:
        return self.clarification_label

    def to_dict(self) -> Dict[str, Any]:
        source_display = self.source_dataset if self.source_dataset else "Source information unavailable"
        return {
            "column": self.actual_name,
            "actual_name": self.actual_name,
            "base_name": self.base_name,
            "display_name": self.display_name,
            "data_type": self.data_type,
            "is_join_generated": self.is_join_generated,
            "source_dataset": self.source_dataset,
            "source_dataset_display": source_display,
            "source_column": self.source_column,
            "suffix": self.suffix,
            "label": self.clarification_label,
            "clarification_label": self.clarification_label,
            "description": self.description,
        }


# Known join suffix regex patterns
JOIN_SUFFIX_PATTERNS = [
    # Pattern 1: e.g. _joined_orders__1__customers_1 or _joined_left_right_inner
    r"(_joined_[a-zA-Z0-9_\-]+)$",
    # Pattern 2: e.g. __joined__orders or _joined_customers
    r"(__joined__[a-zA-Z0-9_\-]+)$",
    # Pattern 3: Standard pandas suffixes: _x, _y, _left, _right
    r"(_[xy])$",
    r"(_(?:left|right))$",
    # Pattern 4: Double underscore dataset tag: e.g. col__dataset
    r"(__[a-zA-Z0-9_\-]+)$",
]


def _format_display_name(raw_name: str) -> str:
    """Format snake_case or raw column name into human-readable Title Case."""
    clean = re.sub(r"_+", " ", str(raw_name)).strip()
    return clean.title() if clean else str(raw_name)


def inspect_column_lineage(
    columns: List[str],
    data_types: Optional[Union[Dict[str, Any], Dict[str, str]]] = None,
    join_history: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = None,
    dataset_name: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, ColumnLineageInfo]:
    """Inspect dataset columns and determine original vs join-generated lineage.

    Guarantees:
    - Never fabricates or guesses source dataset names when metadata is unavailable.
    - Accurately associates base columns with their suffixed join counterparts.
    - Generates human-readable labels for the clarification UI.
    """
    if metadata is not None and data_types is None:
        data_types = metadata

    actual_dtypes: Dict[str, str] = {}
    if data_types and isinstance(data_types, dict):
        if "data_types" in data_types or "column_names" in data_types or "join_history" in data_types:
            # Full dataset metadata dict passed as second argument
            actual_dtypes = data_types.get("data_types", {}) or {}
            if join_history is None:
                join_history = data_types.get("join_history")
            if dataset_name is None:
                dataset_name = data_types.get("dataset_name") or data_types.get("filename")
        else:
            actual_dtypes = data_types

    lineage_map: Dict[str, ColumnLineageInfo] = {}

    # Extract verified source datasets from join_history if available
    source_left: Optional[str] = None
    source_right: Optional[str] = None

    jh_entry: Optional[Dict[str, Any]] = None
    if isinstance(join_history, list) and join_history:
        jh_entry = join_history[0] if isinstance(join_history[0], dict) else None
    elif isinstance(join_history, dict):
        jh_entry = join_history

    if jh_entry:
        source_left = (
            jh_entry.get("source_left_filename")
            or jh_entry.get("left_dataset")
            or jh_entry.get("dataset_left")
        )
        source_right = (
            jh_entry.get("source_right_filename")
            or jh_entry.get("right_dataset")
            or jh_entry.get("dataset_right")
        )

    # First pass: identify potential join suffixes and base names
    parsed_cols: List[Tuple[str, str, Optional[str]]] = []  # (actual_name, base_name, suffix)
    for col in columns:
        col_str = str(col)
        detected_suffix: Optional[str] = None
        base_name = col_str

        for pat in JOIN_SUFFIX_PATTERNS:
            match = re.search(pat, col_str)
            if match:
                detected_suffix = match.group(1)
                base_name = col_str[:match.start()]
                break

        parsed_cols.append((col_str, base_name, detected_suffix))

    columns_set = set(columns)

    # Second pass: establish lineage status
    for col_str, base_name, detected_suffix in parsed_cols:
        dtype = actual_dtypes.get(col_str, "unknown")
        display_name = _format_display_name(col_str)

        is_join = False
        src_ds: Optional[str] = None
        src_col: Optional[str] = None

        if detected_suffix:
            # Check if this column is genuinely join-generated:
            # 1. Base name exists as another column in the dataset (e.g. unit_price and unit_price_joined_...)
            # 2. Or the suffix explicitly begins with _joined_
            # 3. Or join metadata confirms a join was performed
            if base_name in columns_set or detected_suffix.startswith("_joined_") or source_right:
                is_join = True
                src_col = base_name if base_name in columns_set else col_str
                if source_right:
                    src_ds = source_right

        if not is_join:
            # Original primary column
            src_col = col_str
            if source_left:
                src_ds = source_left
            elif dataset_name:
                src_ds = dataset_name

        # Construct clear, verified clarification label & description
        if is_join:
            desc = "Join-generated column from dataset join"
            if src_ds:
                label = f"{col_str} - Joined {src_ds} column"
            else:
                label = f"{col_str} - Joined column (Source information unavailable)"
        else:
            desc = "Original column from base dataset"
            if src_ds and source_right:  # We are in a joined dataset with verified source names
                label = f"{col_str} - Original {src_ds} column"
            elif src_ds:
                label = f"{col_str} - Dataset column ({src_ds})"
            else:
                label = f"{col_str} - Original column"

        lineage_map[col_str] = ColumnLineageInfo(
            actual_name=col_str,
            base_name=base_name,
            display_name=display_name,
            data_type=dtype,
            is_join_generated=is_join,
            source_dataset=src_ds,
            source_column=src_col,
            suffix=detected_suffix,
            clarification_label=label,
            description=desc,
        )

    return lineage_map
