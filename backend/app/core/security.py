# security.py — Security headers and middleware
# These headers protect against common web attacks:
# - XSS (Cross-Site Scripting)
# - Clickjacking
# - MIME type sniffing
# - Information disclosure

import logging
import time
from fastapi import FastAPI, Request
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from app.core.config import settings

logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Adds security headers to every response.
    These are standard headers recommended by OWASP.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # Force HTTPS in production
        if settings.is_production():
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        # Hide server information
        response.headers["Server"] = "DevOps-Orchestrator"

        # Basic XSS protection
        response.headers["X-XSS-Protection"] = "1; mode=block"

        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Logs every request with timing information.
    This is how you monitor API performance in production.
    Format: METHOD /path → STATUS in Xms
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        start_time = time.time()

        # Process the request
        response = await call_next(request)

        # Calculate duration
        duration_ms = round((time.time() - start_time) * 1000, 2)

        # Skip logging health checks to reduce noise
        if request.url.path not in ("/health", "/"):
            log_level = (
                logging.WARNING
                if response.status_code >= 400
                else logging.INFO
            )
            logger.log(
                log_level,
                f"{request.method} {request.url.path} "
                f"→ {response.status_code} in {duration_ms}ms"
            )

        # Add timing header so frontend can see response times
        response.headers["X-Response-Time"] = f"{duration_ms}ms"

        return response


def setup_security(app: FastAPI) -> None:
    """Register all security middleware on the app."""
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestLoggingMiddleware)