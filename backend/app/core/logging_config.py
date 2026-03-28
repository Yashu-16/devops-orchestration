# logging_config.py — Structured production logging
# In production, logs need to be:
# 1. Structured (JSON) so log aggregators (Datadog, CloudWatch) can parse them
# 2. Leveled (DEBUG/INFO/WARNING/ERROR) so you can filter noise
# 3. Consistent (same format everywhere)

import logging
import json
import sys
from datetime import datetime, timezone
from app.core.config import settings


class JSONFormatter(logging.Formatter):
    """
    Formats log records as JSON.
    This makes logs parseable by tools like Datadog, Splunk, CloudWatch.

    Example output:
    {"time": "2024-01-15T10:30:00Z", "level": "INFO",
     "logger": "app.services.pipeline_service",
     "message": "Run 42 finished: success"}
    """

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "time":    datetime.now(timezone.utc).isoformat(),
            "level":   record.levelname,
            "logger":  record.name,
            "message": record.getMessage(),
        }

        # Include exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Include extra fields if provided
        for key in ("pipeline_id", "run_id", "stage", "duration_ms"):
            if hasattr(record, key):
                log_data[key] = getattr(record, key)

        return json.dumps(log_data)


class HumanFormatter(logging.Formatter):
    """
    Human-readable format for development.
    Color-coded by level for easy reading.
    """
    COLORS = {
        "DEBUG":    "\033[36m",   # Cyan
        "INFO":     "\033[32m",   # Green
        "WARNING":  "\033[33m",   # Yellow
        "ERROR":    "\033[31m",   # Red
        "CRITICAL": "\033[35m",   # Magenta
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, self.RESET)
        level = f"{color}{record.levelname:<8}{self.RESET}"
        return (
            f"{datetime.now().strftime('%H:%M:%S')} | "
            f"{level} | "
            f"{record.name.split('.')[-1]:<25} | "
            f"{record.getMessage()}"
        )


def setup_logging() -> None:
    """
    Configure logging for the entire application.
    Uses JSON in production, human-readable in development.
    """
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    # Choose formatter based on environment
    if settings.is_production():
        formatter = JSONFormatter()
    else:
        formatter = HumanFormatter()

    # Console handler — all logs go to stdout
    # In Docker, this is captured by the container runtime
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.handlers.clear()
    root_logger.addHandler(handler)

    # Quiet down noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

    logging.getLogger(__name__).info(
        f"Logging configured: level={settings.LOG_LEVEL} "
        f"format={'json' if settings.is_production() else 'human'}"
    )