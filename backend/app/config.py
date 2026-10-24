"""Backend configuration module for AI Data Analyst Agent."""

import os
from pathlib import Path
from typing import List
from dotenv import load_dotenv

# Root and directory paths
BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent

# Load environment variables: check PROJECT_ROOT / .env, then BACKEND_DIR / .env, then cwd
if (PROJECT_ROOT / ".env").exists():
    load_dotenv(dotenv_path=PROJECT_ROOT / ".env")
elif (BACKEND_DIR / ".env").exists():
    load_dotenv(dotenv_path=BACKEND_DIR / ".env")
else:
    load_dotenv()


class Settings:
    """Application and environment configuration."""

    PROJECT_NAME: str = os.getenv("APP_NAME", "AI Data Analyst Agent")
    APP_NAME: str = PROJECT_NAME
    APP_ENV: str = os.getenv("APP_ENV", "development")
    PROJECT_VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api"

    # Database Configuration (PostgreSQL supported, SQLite default for zero-friction setup)
    _env_db: str = os.getenv("DATABASE_URL", "")
    if not _env_db or _env_db == "sqlite:///./data_analyst.db" or _env_db == f"sqlite:///{PROJECT_ROOT.as_posix()}/data_analyst.db":
        DATABASE_URL: str = f"sqlite:///{BACKEND_DIR.as_posix()}/data_analyst.db"
    else:
        DATABASE_URL: str = _env_db

    # JWT Authentication & Security
    SECRET_KEY: str = os.getenv(
        "SECRET_KEY",
        os.getenv("JWT_SECRET_KEY", "super-secure-dev-secret-key-change-in-production-1234567890abcdef")
    )
    JWT_SECRET_KEY: str = SECRET_KEY  # Alias for backward compatibility
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

    # Password Reset & Email Configuration (Gmail SMTP)
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", "20"))
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5174").rstrip("/")
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME: str = (os.getenv("SMTP_USERNAME") or os.getenv("SMTP_USER") or "").strip()
    SMTP_USER: str = SMTP_USERNAME
    _raw_smtp_pwd: str = os.getenv("SMTP_PASSWORD", "").strip()
    SMTP_PASSWORD: str = _raw_smtp_pwd.replace(" ", "") if (len(_raw_smtp_pwd.replace(" ", "")) == 16 and _raw_smtp_pwd.replace(" ", "").isalnum()) else _raw_smtp_pwd
    SMTP_FROM_EMAIL: str = (os.getenv("SMTP_FROM_EMAIL") or os.getenv("SMTP_USERNAME") or os.getenv("SMTP_USER") or "dataanalystagent@gmail.com").strip()
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "AI Data Analyst Agent")
    SMTP_TLS: bool = os.getenv("SMTP_TLS", "true").lower() in ("true", "1", "yes")

    # Support Contact Information
    SUPPORT_EMAIL: str = os.getenv("SUPPORT_EMAIL", "dataanalystagent@gmail.com").strip()
    SUPPORT_PHONE: str = os.getenv("SUPPORT_PHONE", "9021964018").strip()

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:8002",
        "http://127.0.0.1:8002",
    ]

    # Storage Paths & Upload Limits
    UPLOAD_DIR: Path = PROJECT_ROOT / os.getenv("UPLOAD_DIR", "uploads")
    REPORTS_DIR: Path = PROJECT_ROOT / os.getenv("REPORTS_DIR", "reports")
    MODELS_DIR: Path = PROJECT_ROOT / os.getenv("MODELS_DIR", "models_storage")
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))
    ALLOWED_EXTENSIONS: List[str] = [".csv", ".xlsx", ".xls"]

    @property
    def max_upload_size_bytes(self) -> int:
        """Maximum file upload size in bytes."""
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @property
    def dataset_storage_path(self) -> Path:
        """Directory path where uploaded dataset files are stored."""
        return self.UPLOAD_DIR

    @classmethod
    def ensure_directories(cls) -> None:
        """Ensure necessary upload, report, and model directories exist."""
        cls.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        cls.REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        cls.MODELS_DIR.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_directories()
