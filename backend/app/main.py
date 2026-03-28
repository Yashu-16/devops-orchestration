from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.logging_config import setup_logging
from app.core.errors import register_error_handlers
from app.db.database import engine, Base
from app.api.routes import pipelines, auth, team, integrations, notifications, ml

setup_logging()

import logging
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION} [{settings.ENVIRONMENT}]")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ready")
    yield
    logger.info(f"Shutting down {settings.APP_NAME}")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)


# ── Manual CORS — handles OPTIONS preflight ───────────────────────
@app.middleware("http")
async def cors_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        response = Response()
        response.headers["Access-Control-Allow-Origin"]  = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Max-Age"]       = "86400"
        return response

    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response


# ── Standard CORS middleware as backup ────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Error handlers ────────────────────────────────────────────────
register_error_handlers(app)

# ── Routes ────────────────────────────────────────────────────────
app.include_router(auth.router,          prefix="/api/v1")
app.include_router(pipelines.router,     prefix="/api/v1")
app.include_router(team.router,          prefix="/api/v1")
app.include_router(integrations.router,  prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(ml.router,            prefix="/api/v1")


@app.get("/health", tags=["System"])
def health_check():
    from app.db.database import SessionLocal
    from sqlalchemy import text
    db_status = "healthy"
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
    except Exception:
        db_status = "unhealthy"
    return {
        "status":      "healthy" if db_status == "healthy" else "degraded",
        "app":         settings.APP_NAME,
        "version":     settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "database":    db_status,
    }


@app.get("/", tags=["System"])
def root():
    return {
        "app":     settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs":    "/docs",
    }