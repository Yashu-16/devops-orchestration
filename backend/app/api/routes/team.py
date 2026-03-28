# team.py routes
# All team management endpoints.
# All require authentication.

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.models.pipeline import User, InviteToken, Organization    # ADD InviteToken, Organization
from app.core.auth import get_current_user
from app.services.team_service import TeamService
from app.services.auth_service import AuthService
from app.schemas.pipeline import (
    TeamMemberResponse,
    InviteRequest,
    InviteResponse,
    AcceptInviteRequest,
    UpdateMemberRoleRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Team Members ──────────────────────────────────────────────────

@router.get("/team/members",
            response_model=List[TeamMemberResponse],
            tags=["Team"])
def list_members(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all members of the current user's organization."""
    service = TeamService(db)
    return service.get_members(current_user.organization_id)


@router.patch("/team/members/{user_id}/role",
              response_model=TeamMemberResponse,
              tags=["Team"])
def update_member_role(
    user_id: int,
    data: UpdateMemberRoleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Change a team member's role.
    Requires: admin or owner role.
    """
    if current_user.role not in ("owner", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and owners can change roles",
        )
    try:
        service = TeamService(db)
        return service.update_role(
            org_id=current_user.organization_id,
            actor=current_user,
            target_user_id=user_id,
            new_role=data.role,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/team/members/{user_id}",
               status_code=status.HTTP_204_NO_CONTENT,
               tags=["Team"])
def remove_member(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Remove a member from the organization.
    Requires: admin or owner role.
    """
    if current_user.role not in ("owner", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and owners can remove members",
        )
    try:
        service = TeamService(db)
        service.remove_member(
            org_id=current_user.organization_id,
            actor=current_user,
            target_user_id=user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Invites ───────────────────────────────────────────────────────

@router.get("/team/invites",
            response_model=List[InviteResponse],
            tags=["Team"])
def list_invites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all pending invites for the organization."""
    service = TeamService(db)
    invites = service.get_pending_invites(current_user.organization_id)
    result = []
    for inv in invites:
        result.append(InviteResponse(
            id=inv.id,
            email=inv.email,
            role=inv.role,
            token=inv.token,
            accepted=inv.accepted,
            expires_at=inv.expires_at,
            created_at=inv.created_at,
            invited_by_name=inv.invited_by.name if inv.invited_by else None,
        ))
    return result


@router.post("/team/invites",
             response_model=InviteResponse,
             status_code=status.HTTP_201_CREATED,
             tags=["Team"])
def create_invite(
    data: InviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Invite a new member to the organization.
    Returns the invite token — share this link with the invitee.
    Requires: admin or owner role.
    """
    if current_user.role not in ("owner", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and owners can invite members",
        )
    try:
        service = TeamService(db)
        invite = service.create_invite(
            org_id=current_user.organization_id,
            invited_by=current_user,
            email=data.email,
            role=data.role,
        )
        return InviteResponse(
            id=invite.id,
            email=invite.email,
            role=invite.role,
            token=invite.token,
            accepted=invite.accepted,
            expires_at=invite.expires_at,
            created_at=invite.created_at,
            invited_by_name=current_user.name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/team/invites/{invite_id}",
               status_code=status.HTTP_204_NO_CONTENT,
               tags=["Team"])
def cancel_invite(
    invite_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancel a pending invite."""
    if current_user.role not in ("owner", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins and owners can cancel invites",
        )
    try:
        service = TeamService(db)
        service.delete_invite(
            org_id=current_user.organization_id,
            invite_id=invite_id,
            actor=current_user,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Public invite endpoint (no auth needed) ───────────────────────

@router.get("/team/invites/lookup/{token}", tags=["Team"])
def lookup_invite(token: str, db: Session = Depends(get_db)):
    """
    Look up invite details by token.
    Public endpoint — no authentication required.
    """
    from datetime import datetime, timezone
    from app.models.pipeline import Organization

    invite = db.query(InviteToken).filter(
        InviteToken.token == token
    ).first()

    if not invite:
        raise HTTPException(status_code=404, detail="Invalid invite link")

    if invite.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This invite has expired")

    if invite.accepted:
        raise HTTPException(status_code=410, detail="This invite has already been used")

    # Load org separately to avoid relationship issues
    org = db.query(Organization).filter(
        Organization.id == invite.organization_id
    ).first()

    return {
        "email":      invite.email,
        "role":       invite.role,
        "org_name":   org.name if org else "Unknown Organization",
        "expires_at": invite.expires_at,
    }


@router.post("/team/invites/accept",
             tags=["Team"])
def accept_invite(
    data: AcceptInviteRequest,
    db: Session = Depends(get_db),
):
    """
    Accept an invite and create an account.
    Public endpoint — no auth needed.
    """
    try:
        service = TeamService(db)
        result  = service.accept_invite(
            token=data.token,
            name=data.name,
            password=data.password,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))