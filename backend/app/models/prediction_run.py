"""SQLAlchemy PredictionRun Model."""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class PredictionRun(Base):
    """Stores trained predictive models, evaluation results, artifacts, and history."""

    __tablename__ = "prediction_runs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True, index=True)
    dataset_name = Column(String(255), nullable=False)
    run_name = Column(String(255), nullable=True)
    task_type = Column(String(50), nullable=False)  # regression, classification, time_series
    mode = Column(String(50), default="auto", nullable=False)  # auto, manual
    target_column = Column(String(255), nullable=False)
    date_column = Column(String(255), nullable=True)
    selected_model = Column(String(255), nullable=False)
    selection_metric = Column(String(255), nullable=True)

    # Sample partitions & parameters
    train_rows = Column(Integer, default=0, nullable=False)
    validation_rows = Column(Integer, default=0, nullable=False)
    forecast_horizon = Column(Integer, nullable=True)

    # Stored JSON payloads for lossless retrieval
    metrics_json = Column(Text, nullable=True)
    model_comparison_json = Column(Text, nullable=True)
    predictions_json = Column(Text, nullable=True)
    validation_predictions_json = Column(Text, nullable=True)
    feature_importance_json = Column(Text, nullable=True)
    features_used_json = Column(Text, nullable=True)
    features_excluded_json = Column(Text, nullable=True)
    warnings_json = Column(Text, nullable=True)
    limitations_json = Column(Text, nullable=True)
    explanation = Column(Text, nullable=True)
    uncertainty_method = Column(String(255), nullable=True)

    # Local filesystem path to versioned, trained pipeline artifact (.joblib)
    artifact_path = Column(String(1024), nullable=True)

    status = Column(String(50), default="success", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", backref="prediction_runs")
    dataset = relationship("Dataset", backref="prediction_runs")
