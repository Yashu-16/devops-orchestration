from pydantic_settings import BaseSettings
from typing import List
import secrets
import os


class Settings(BaseSettings):

    # ── App ──────────────────────────────────────────────────────
    APP_NAME: str = "DevOps Orchestrator"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"

    # ── Database ─────────────────────────────────────────────────
    # Railway provides DATABASE_URL automatically
    DATABASE_URL: str = "sqlite:///./devops_orchestrator.db"

    # ── Security ─────────────────────────────────────────────────
    SECRET_KEY: str = secrets.token_hex(32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # ── CORS ─────────────────────────────────────────────────────
    ALLOWED_ORIGINS: str = "*"

    # ── Rate Limiting ─────────────────────────────────────────────
    RATE_LIMIT_PER_MINUTE: int = 60

    # ── Logging ──────────────────────────────────────────────────
    LOG_LEVEL: str = "INFO"

    # ── Notifications ─────────────────────────────────────────────
    SENDGRID_API_KEY: str = ""
    SENDGRID_FROM_EMAIL: str = "noreply@devops-orchestrator.com"
    SENDGRID_FROM_NAME: str = "DevOps Orchestrator"
    DEFAULT_SLACK_WEBHOOK: str = ""

    def get_allowed_origins(self) -> List[str]:
        if self.ALLOWED_ORIGINS == "*":
            return ["*"]
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


settings = Settings()