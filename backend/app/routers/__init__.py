"""Routers package."""

from app.routers.auth import router as auth_router
from app.routers.datasets import router as datasets_router
from app.routers.profiling import router as profiling_router
from app.routers.quality import router as quality_router
from app.routers.cleaning import router as cleaning_router
from app.routers.relationships import router as relationships_router
from app.routers.analysis import router as analysis_router
from app.routers.anomalies import router as anomalies_router
from app.routers.prediction import router as prediction_router
from app.routers.reports import router as reports_router
from app.routers.analytics import router as analytics_router
from app.routers.settings import router as settings_router
from app.api.routes.users import router as users_router
from app.routers.support import router as support_router
from app.routers.feedback import router as feedback_router

__all__ = [
    "auth_router",
    "datasets_router",
    "profiling_router",
    "quality_router",
    "cleaning_router",
    "relationships_router",
    "analysis_router",
    "anomalies_router",
    "prediction_router",
    "reports_router",
    "analytics_router",
    "settings_router",
    "users_router",
    "support_router",
    "feedback_router",
]
