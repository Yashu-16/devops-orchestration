# auth.py routes
# Public endpoints for signup and login.
# These do NOT require authentication.

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.services.auth_service import AuthService
from app.core.auth import get_current_user
from app.models.pipeline import User

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Request/Response Schemas ──────────────────────────────────────

class SignupRequest(BaseModel):
    email: str = Field(..., description="Your email address")
    password: str = Field(..., min_length=8, description="Min 8 characters")
    name: str = Field(..., min_length=1, description="Your full name")
    org_name: str = Field(
        ..., min_length=1, description="Your company or team name"
    )


class AuthResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict
    organization: dict


class MeResponse(BaseModel):
    id: int
    email: str
    name: str
    role: str
    organization_id: int


# ── Endpoints ─────────────────────────────────────────────────────

@router.post("/auth/signup",
             response_model=AuthResponse,
             status_code=status.HTTP_201_CREATED,
             tags=["Auth"])
def signup(data: SignupRequest, db: Session = Depends(get_db)):
    """
    Create a new account.
    Creates both a User and an Organization (tenant) in one step.
    Returns a JWT token ready to use.
    """
    try:
        service = AuthService(db)
        result = service.signup(
            email=data.email,
            password=data.password,
            name=data.name,
            org_name=data.org_name,
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/auth/login",
             response_model=AuthResponse,
             tags=["Auth"])
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Login with email and password.
    Returns a JWT token. Include it in all future requests as:
    Authorization: Bearer <token>
    """
    try:
        service = AuthService(db)
        result = service.login(
            email=form_data.username,   # OAuth2 uses 'username' field
            password=form_data.password,
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.get("/auth/me",
            response_model=MeResponse,
            tags=["Auth"])
def get_me(current_user: User = Depends(get_current_user)):
    """
    Returns the currently logged-in user's details.
    Requires a valid JWT token.
    """
    return MeResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        organization_id=current_user.organization_id,
    )


@router.post("/auth/logout", tags=["Auth"])
def logout():
    """
    Logout endpoint.
    JWTs are stateless — just delete the token on the frontend.
    In production, you'd add the token to a blocklist here.
    """
    return {"message": "Logged out successfully"}