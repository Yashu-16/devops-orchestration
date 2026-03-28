# errors.py — Global error handlers
# These catch all unhandled errors and return clean JSON responses
# instead of Python tracebacks. Never expose stack traces in production.

import logging
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)


def register_error_handlers(app: FastAPI) -> None:
    """Register all global error handlers on the FastAPI app."""

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ):
        """
        Handles Pydantic validation errors (bad request body).
        Returns a clean 422 with field-level error details.
        """
        errors = []
        for error in exc.errors():
            errors.append({
                "field":   " → ".join(str(e) for e in error["loc"]),
                "message": error["msg"],
                "type":    error["type"],
            })

        logger.warning(
            f"Validation error on {request.method} {request.url.path}: "
            f"{len(errors)} field(s) failed"
        )

        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error":   "Validation failed",
                "details": errors,
            },
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_error_handler(
        request: Request, exc: SQLAlchemyError
    ):
        """
        Handles unexpected database errors.
        Logs the full error internally but returns a safe message to the client.
        """
        logger.error(
            f"Database error on {request.method} {request.url.path}: {exc}",
            exc_info=True,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error":   "Database error",
                "message": "An internal database error occurred.",
            },
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        logger.warning(f"Value error: {exc}")
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "Bad request", "message": str(exc)},
        )

    @app.exception_handler(Exception)
    async def general_error_handler(request: Request, exc: Exception):
        """
        Catch-all handler for any unhandled exception.
        Logs the full traceback but never exposes it to the client.
        """
        logger.error(
            f"Unhandled error on {request.method} {request.url.path}: {exc}",
            exc_info=True,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error":   "Internal server error",
                "message": "Something went wrong. Please try again.",
            },
        )