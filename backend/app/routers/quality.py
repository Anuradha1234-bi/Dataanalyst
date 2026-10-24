"""Data Quality Router - Dedicated endpoint for data hygiene analysis."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.dataset import Dataset
from app.auth.dependencies import get_current_user
from app.schemas.quality import DataQualityResponse
from app.services.quality_service import DataQualityService

router = APIRouter(prefix="/quality", tags=["Data Quality"])


@router.get("/{dataset_id}", response_model=DataQualityResponse)
def get_dataset_quality(
    dataset_id: int,
    version: str = Query("original", description="Dataset version: 'original' or 'cleaned'"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve detailed data quality assessment for a specific dataset."""
    dataset = (
        db.query(Dataset)
        .filter(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
        .first()
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )
    return DataQualityService.analyze_dataset_quality(dataset, version=version)

