"""SQLAlchemy Dataset Model."""

import json
from typing import List, Optional
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Dataset(Base):
    """Uploaded and processed dataset representation with user isolation."""

    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=True)
    file_type = Column(String(50), nullable=False)  # CSV, XLSX, XLS
    file_path = Column(String(1024), nullable=False)
    cleaned_file_path = Column(String(1024), nullable=True)
    rows = Column(Integer, default=0, nullable=False)
    columns = Column(Integer, default=0, nullable=False)
    file_size_bytes = Column(Integer, default=0, nullable=False)
    column_names_json = Column(String(4096), nullable=True)
    has_cleaned = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    owner = relationship("User", back_populates="datasets")

    @property
    def original_filename(self) -> str:
        return self.filename

    @original_filename.setter
    def original_filename(self, val: str):
        self.filename = val

    @property
    def storage_path(self) -> str:
        return self.file_path

    @storage_path.setter
    def storage_path(self, val: str):
        self.file_path = val

    @property
    def row_count(self) -> int:
        return self.rows

    @row_count.setter
    def row_count(self, val: int):
        self.rows = val

    @property
    def column_count(self) -> int:
        return self.columns

    @column_count.setter
    def column_count(self, val: int):
        self.columns = val

    @property
    def file_size(self) -> int:
        return self.file_size_bytes

    @file_size.setter
    def file_size(self, val: int):
        self.file_size_bytes = val

    @property
    def column_names(self) -> List[str]:
        if not self.column_names_json:
            return []
        try:
            return json.loads(self.column_names_json)
        except Exception:
            return []

    @column_names.setter
    def column_names(self, val: Optional[List[str]]):
        if val is None:
            self.column_names_json = None
        else:
            self.column_names_json = json.dumps(val)

    @property
    def preview_rows(self):
        return getattr(self, "_preview_rows", None)

    @preview_rows.setter
    def preview_rows(self, val):
        self._preview_rows = val

    @property
    def total_missing_cells(self):
        return getattr(self, "_total_missing_cells", None)

    @total_missing_cells.setter
    def total_missing_cells(self, val):
        self._total_missing_cells = val

    @property
    def missing_columns(self):
        return getattr(self, "_missing_columns", None)

    @missing_columns.setter
    def missing_columns(self, val):
        self._missing_columns = val
