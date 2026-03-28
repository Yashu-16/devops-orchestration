# auth.py
# FastAPI dependency that protects routes.
# Add `current_user: User = Depends(get_current_user)` to any
# route that requires authentication.
# The route will return 401 if no valid token is provided.

import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.pipeline import User
from app.services.auth_service import decode_token

logger = logging.getLogger(__name__)

# This tells FastAPI where to look for the token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency. Extracts and verifies the JWT token.
    Use this on any route that requires a logged-in user.

    Example:
        @router.get("/pipelines")
        def list_pipelines(user: User = Depends(get_current_user)):
            # user is the authenticated user
            # user.organization_id is their tenant
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if not payload:
        raise credentials_error

    user_id = payload.get("sub")
    if not user_id:
        raise credentials_error

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise credentials_error

    return user


def get_current_org_id(
    current_user: User = Depends(get_current_user),
) -> int:
    """
    Returns the organization ID of the current user.
    Use this to filter database queries to the current tenant.
    """
    return current_user.organization_id