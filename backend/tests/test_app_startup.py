def test_fastapi_app_imports_and_instantiates():
    """Test that FastAPI app imports and instantiates properly."""
    from app.main import app, create_application

    assert app is not None
    assert app.title == "AI Data Analyst Agent"

    # Test application factory
    fresh_app = create_application()
    assert fresh_app is not None
    assert fresh_app.title == "AI Data Analyst Agent"


def test_cors_middleware_is_configured():
    """Verify CORS middleware is properly registered."""
    from app.main import app

    middleware_classes = [m.cls.__name__ for m in app.user_middleware]
    assert "CORSMiddleware" in middleware_classes


def test_routes_registered():
    """Verify essential routes and documentation paths are mounted."""
    from app.main import app

    openapi_spec = app.openapi()
    paths = list(openapi_spec["paths"].keys())
    assert "/api/health" in paths
    assert app.docs_url == "/docs"


def test_settings_import_and_expected_attributes():
    """Verify from app.config import settings works and provides all expected attributes."""
    from app.config import settings, Settings

    assert settings is not None
    assert isinstance(settings, Settings)
    assert settings.PROJECT_NAME == "AI Data Analyst Agent"
    assert settings.APP_NAME == "AI Data Analyst Agent"
    assert settings.DATABASE_URL is not None
    assert settings.SECRET_KEY is not None
    assert settings.JWT_SECRET_KEY == settings.SECRET_KEY
    assert settings.JWT_ALGORITHM == "HS256"
    assert isinstance(settings.ACCESS_TOKEN_EXPIRE_MINUTES, int)
    assert isinstance(settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES, int)
    assert settings.SMTP_HOST is not None
    assert isinstance(settings.SMTP_PORT, int)
    assert hasattr(settings, "SMTP_USER")
    assert hasattr(settings, "SMTP_USERNAME")
    assert hasattr(settings, "SMTP_PASSWORD")
    assert settings.SUPPORT_EMAIL == "dataanalystagent@gmail.com"
    assert settings.SUPPORT_PHONE == "9021964018"
    assert hasattr(settings, "CORS_ORIGINS") and len(settings.CORS_ORIGINS) > 0
    assert hasattr(settings, "UPLOAD_DIR")
    assert hasattr(settings, "REPORTS_DIR")
    assert hasattr(settings, "MODELS_DIR")
    assert settings.MAX_UPLOAD_SIZE_MB > 0
    assert settings.max_upload_size_bytes == settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    assert settings.dataset_storage_path == settings.UPLOAD_DIR

