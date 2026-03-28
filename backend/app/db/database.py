# database.py — Updated in Phase 9
# Now supports both SQLite (development) and PostgreSQL (production)
# The DATABASE_URL environment variable controls which one is used.
# SQLite:     sqlite:///./devops_orchestrator.db
# PostgreSQL: postgresql://user:password@host:5432/dbname

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# PostgreSQL needs different connection args than SQLite
is_sqlite = "sqlite" in settings.DATABASE_URL

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if is_sqlite else {},
    # Connection pool settings for PostgreSQL
    pool_pre_ping=True,     # Verify connections before using them
    pool_recycle=300,       # Recycle connections every 5 minutes
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()