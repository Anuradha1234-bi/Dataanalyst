"""FastAPI Main Application Entry Point."""

import sys
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# Ensure the parent ai-data-analyst-agent directory is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Ensure backend directory is also on sys.path for app.* imports
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings
from app.database import init_db
from app.routers import (
    auth_router,
    datasets_router,
    profiling_router,
    quality_router,
    cleaning_router,
    relationships_router,
    analysis_router,
    anomalies_router,
    prediction_router,
    reports_router,
    analytics_router,
    settings_router,
    users_router,
    support_router,
    feedback_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle events - initialize storage and database tables on startup."""
    settings.ensure_directories()
    init_db()
    yield


# Global Exception Handler to avoid leaking internal Python tracebacks to clients
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "InternalServerError",
            "message": "An unexpected error occurred while processing your request. Please try again later.",
        },
    )


def create_application() -> FastAPI:
    """Application factory for FastAPI app instance."""
    app_instance = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.PROJECT_VERSION,
        description="Enterprise REST API for AI Data Analyst Agent",
        lifespan=lifespan,
    )

    # CORS Middleware configuration
    app_instance.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app_instance.add_exception_handler(Exception, global_exception_handler)

    # Health Check
    @app_instance.get("/api/health", tags=["Health"])
    def health_check():
        """System health check endpoint."""
        return {
            "status": "ok",
            "service": settings.PROJECT_NAME,
            "app": settings.PROJECT_NAME,
            "version": settings.PROJECT_VERSION,
            "database": "connected",
        }

    # Mount Routers
    app_instance.include_router(auth_router, prefix=settings.API_V1_PREFIX)
    app_instance.include_router(datasets_router, prefix=settings.API_V1_PREFIX)
    app_instance.include_router(profiling_router, prefix=settings.API_V1_PREFIX)
    app_instance.include_router(quality_router, prefix=settings.API_V1_PREFIX)
    app_instance.include_router(cleaning_router, prefix=settings.API_V1_PREFIX)
    app_instance.include_router(relationships_router, prefix=settings.API_V1_PREFIX)
    app_instance.include_router(analysis_router, prefix=settings.API_V1_PREFIX)
    app_instance.include_router(anomalies_router, prefix=settings.API_V1_PREFIX)
    app_instance.include_router(prediction_router, prefix=settings.API_V1_PREFIX)
    app_instance.include_router(reports_router, prefix=settings.API_V1_PREFIX)
    app_instance.include_router(analytics_router, prefix=settings.API_V1_PREFIX)
    app_instance.include_router(settings_router, prefix=settings.API_V1_PREFIX)
    app_instance.include_router(users_router, prefix=settings.API_V1_PREFIX)
    app_instance.include_router(support_router, prefix=settings.API_V1_PREFIX)
    app_instance.include_router(feedback_router, prefix=settings.API_V1_PREFIX)

    return app_instance


app = create_application()

