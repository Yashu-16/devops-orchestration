from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.logging_config import setup_logging
from app.core.errors import register_error_handlers
from app.db.database import engine, Base
from app.api.routes import pipelines, auth, team, integrations, notifications, ml

setup_logging()
import logging
logger = logging.getLogger(__name__)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
}

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION} [{settings.ENVIRONMENT}]")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ready")
    yield

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

# This middleware runs on EVERY request including OPTIONS
@app.middleware("http")
async def cors_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return Response(status_code=200, headers=CORS_HEADERS)
    response = await call_next(request)
    for key, value in CORS_HEADERS.items():
        response.headers[key] = value
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)

app.include_router(auth.router,          prefix="/api/v1")
app.include_router(pipelines.router,     prefix="/api/v1")
app.include_router(team.router,          prefix="/api/v1")
app.include_router(integrations.router,  prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(ml.router,            prefix="/api/v1")

@app.get("/health")
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
    return {"status": "healthy", "app": settings.APP_NAME, "version": settings.APP_VERSION, "environment": settings.ENVIRONMENT, "database": db_status}

@app.get("/")
def root():
    return {"app": settings.APP_NAME, "version": settings.APP_VERSION}