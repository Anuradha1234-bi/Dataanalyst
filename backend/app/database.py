"""SQLAlchemy Database configuration and session management."""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from typing import Generator
from app.config import settings

# Engine setup with appropriate connection arguments
is_sqlite = settings.DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator:
    """Dependency yielding a database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Initialize database tables."""
    # Import all models to ensure metadata registration
    import app.models.user  # noqa: F401
    import app.models.dataset  # noqa: F401
    import app.models.analysis_history  # noqa: F401
    import app.models.report  # noqa: F401
    import app.models.prediction_run  # noqa: F401
    import app.models.password_reset  # noqa: F401
    import app.models.settings  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # For existing SQLite databases, verify added columns exist
    if is_sqlite:
        with engine.connect() as conn:
            from sqlalchemy import text
            try:
                result = conn.execute(text("PRAGMA table_info(datasets)"))
                cols = [row[1] for row in result.fetchall()]
                if cols:
                    if "stored_filename" not in cols:
                        conn.execute(text("ALTER TABLE datasets ADD COLUMN stored_filename VARCHAR(255)"))
                    if "column_names_json" not in cols:
                        conn.execute(text("ALTER TABLE datasets ADD COLUMN column_names_json VARCHAR(4096)"))
                    conn.commit()
            except Exception:
                pass

            try:
                result = conn.execute(text("PRAGMA table_info(prediction_runs)"))
                cols = [row[1] for row in result.fetchall()]
                if cols and "validation_predictions_json" not in cols:
                    conn.execute(text("ALTER TABLE prediction_runs ADD COLUMN validation_predictions_json TEXT"))
                    conn.commit()
            except Exception:
                pass

