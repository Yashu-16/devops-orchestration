import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.pipeline import User, Organization

logger = logging.getLogger(__name__)

# Use sha256_crypt instead of bcrypt to avoid the 72-byte limit
pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(
            token, settings.SECRET_KEY, algorithms=[ALGORITHM]
        )
    except JWTError:
        return None


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


class AuthService:

    def __init__(self, db: Session):
        self.db = db

    def signup(
        self,
        email: str,
        password: str,
        name: str,
        org_name: str,
    ) -> dict:
        # Check email not already used
        existing = self.db.query(User).filter(
            User.email == email
        ).first()
        if existing:
            raise ValueError("Email already registered")

        # Validate password
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters")

        # Create organization
        slug = _slugify(org_name)
        base_slug = slug
        counter = 1
        while self.db.query(Organization).filter(
            Organization.slug == slug
        ).first():
            slug = f"{base_slug}-{counter}"
            counter += 1

        org = Organization(name=org_name, slug=slug, plan="free")
        self.db.add(org)
        self.db.flush()

        # Create user
        user = User(
            organization_id=org.id,
            email=email.lower().strip(),
            name=name,
            hashed_password=hash_password(password),
            role="owner",
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        logger.info(f"New signup: {email} | org={org_name}")

        token = create_access_token({
            "sub":    str(user.id),
            "org_id": org.id,
            "email":  user.email,
            "role":   user.role,
        })

        return {
            "access_token": token,
            "token_type":   "bearer",
            "user": {
                "id":    user.id,
                "email": user.email,
                "name":  user.name,
                "role":  user.role,
            },
            "organization": {
                "id":   org.id,
                "name": org.name,
                "slug": org.slug,
                "plan": org.plan,
            },
        }

    def login(self, email: str, password: str) -> dict:
        user = self.db.query(User).filter(
            User.email == email.lower().strip()
        ).first()

        if not user or not verify_password(password, user.hashed_password):
            raise ValueError("Invalid email or password")

        if not user.is_active:
            raise ValueError("Account is disabled")

        org = self.db.query(Organization).filter(
            Organization.id == user.organization_id
        ).first()

        token = create_access_token({
            "sub":    str(user.id),
            "org_id": user.organization_id,
            "email":  user.email,
            "role":   user.role,
        })

        logger.info(f"Login: {email}")

        return {
            "access_token": token,
            "token_type":   "bearer",
            "user": {
                "id":    user.id,
                "email": user.email,
                "name":  user.name,
                "role":  user.role,
            },
            "organization": {
                "id":   org.id if org else None,
                "name": org.name if org else None,
                "slug": org.slug if org else None,
                "plan": org.plan if org else None,
            },
        }