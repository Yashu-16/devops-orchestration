# team_service.py
# Handles all team/invitation logic:
# - Creating invite tokens
# - Accepting invites (joining an org)
# - Managing member roles
# - Removing members

import secrets
import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from app.models.pipeline import User, Organization, InviteToken
from app.services.auth_service import hash_password

logger = logging.getLogger(__name__)

# Roles in order of power
ROLE_HIERARCHY = {"owner": 3, "admin": 2, "member": 1}


def can_manage(actor_role: str, target_role: str) -> bool:
    """
    Check if actor can manage target.
    You can only manage people with lower role than you.
    Example: admin can manage members but not other admins or owners.
    """
    return ROLE_HIERARCHY.get(actor_role, 0) > ROLE_HIERARCHY.get(target_role, 0)


class TeamService:

    def __init__(self, db: Session):
        self.db = db

    # ── List members ─────────────────────────────────────────────

    def get_members(self, org_id: int) -> list:
        """Get all active members of an organization."""
        return (
            self.db.query(User)
            .filter(
                User.organization_id == org_id,
                User.is_active == True,
            )
            .order_by(User.created_at.asc())
            .all()
        )

    # ── Invite ───────────────────────────────────────────────────

    def create_invite(
        self,
        org_id: int,
        invited_by: User,
        email: str,
        role: str = "member",
    ) -> InviteToken:
        """
        Creates an invite token for a new team member.
        The token is included in the invite link.
        """
        # Validate role
        if role not in ROLE_HIERARCHY:
            raise ValueError(f"Invalid role: {role}. Must be owner, admin, or member")

        # Only owners can invite owners
        if role == "owner" and invited_by.role != "owner":
            raise ValueError("Only owners can invite other owners")

        # Check if email already in this org
        existing = self.db.query(User).filter(
            User.email == email.lower().strip(),
            User.organization_id == org_id,
        ).first()
        if existing:
            raise ValueError(f"{email} is already a member of this organization")

        # Check for pending invite
        pending = self.db.query(InviteToken).filter(
            InviteToken.email == email.lower().strip(),
            InviteToken.organization_id == org_id,
            InviteToken.accepted == False,
            InviteToken.expires_at > datetime.now(timezone.utc),
        ).first()
        if pending:
            raise ValueError(
                f"An invite was already sent to {email}. "
                f"It expires at {pending.expires_at.strftime('%Y-%m-%d %H:%M UTC')}"
            )

        # Generate a secure random token
        token_value = secrets.token_urlsafe(32)

        invite = InviteToken(
            organization_id=org_id,
            invited_by_id=invited_by.id,
            email=email.lower().strip(),
            role=role,
            token=token_value,
            accepted=False,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=48),
        )
        self.db.add(invite)
        self.db.commit()
        self.db.refresh(invite)

        logger.info(
            f"Invite created: {email} → org={org_id} role={role} "
            f"by={invited_by.email}"
        )
        return invite

    def get_pending_invites(self, org_id: int) -> list:
        """Get all pending (not yet accepted) invites for an org."""
        return (
            self.db.query(InviteToken)
            .filter(
                InviteToken.organization_id == org_id,
                InviteToken.accepted == False,
                InviteToken.expires_at > datetime.now(timezone.utc),
            )
            .order_by(InviteToken.created_at.desc())
            .all()
        )

    def get_invite_by_token(self, token: str) -> InviteToken | None:
        """Look up an invite by its token value."""
        return self.db.query(InviteToken).filter(
            InviteToken.token == token
        ).first()

    def accept_invite(
        self,
        token: str,
        name: str,
        password: str,
    ) -> dict:
        """
        Accept an invite and create the user account.
        Called when a new colleague clicks the invite link.
        """
        invite = self.get_invite_by_token(token)

        if not invite:
            raise ValueError("Invalid invite link")

        if invite.accepted:
            raise ValueError("This invite has already been used")

        expires = invite.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise ValueError(
                "This invite has expired. Ask your team owner to send a new one."
            )

        # Check if they already have an account
        existing_user = self.db.query(User).filter(
            User.email == invite.email
        ).first()

        if existing_user:
            # If they already have an account in another org,
            # move them to this org
            if existing_user.organization_id != invite.organization_id:
                existing_user.organization_id = invite.organization_id
                existing_user.role = invite.role
                user = existing_user
            else:
                raise ValueError(
                    "You already have an account in this organization. "
                    "Please log in instead."
                )
        else:
            # Create new user in the invited org
            user = User(
                organization_id=invite.organization_id,
                email=invite.email,
                name=name,
                hashed_password=hash_password(password),
                role=invite.role,
                is_active=True,
            )
            self.db.add(user)

        # Mark invite as accepted
        invite.accepted = True
        self.db.commit()
        self.db.refresh(user)

        # Get org details
        org = self.db.query(Organization).filter(
            Organization.id == invite.organization_id
        ).first()

        logger.info(
            f"Invite accepted: {invite.email} joined org={org.name} "
            f"role={invite.role}"
        )

        # Create access token
        from app.services.auth_service import create_access_token
        token_value = create_access_token({
            "sub":    str(user.id),
            "org_id": user.organization_id,
            "email":  user.email,
            "role":   user.role,
        })

        return {
            "access_token": token_value,
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

    # ── Manage members ───────────────────────────────────────────

    def update_role(
        self,
        org_id: int,
        actor: User,
        target_user_id: int,
        new_role: str,
    ) -> User:
        """Change a member's role. Only higher roles can change lower roles."""
        if new_role not in ROLE_HIERARCHY:
            raise ValueError(f"Invalid role: {new_role}")

        target = self.db.query(User).filter(
            User.id == target_user_id,
            User.organization_id == org_id,
        ).first()
        if not target:
            raise ValueError("User not found in this organization")

        if target.id == actor.id:
            raise ValueError("You cannot change your own role")

        if not can_manage(actor.role, target.role):
            raise ValueError(
                f"You ({actor.role}) cannot manage a {target.role}"
            )

        old_role = target.role
        target.role = new_role
        self.db.commit()
        self.db.refresh(target)

        logger.info(
            f"Role changed: {target.email} {old_role} → {new_role} "
            f"by {actor.email}"
        )
        return target

    def remove_member(
        self,
        org_id: int,
        actor: User,
        target_user_id: int,
    ) -> None:
        """Remove a member from the organization."""
        target = self.db.query(User).filter(
            User.id == target_user_id,
            User.organization_id == org_id,
        ).first()
        if not target:
            raise ValueError("User not found in this organization")

        if target.id == actor.id:
            raise ValueError("You cannot remove yourself")

        if not can_manage(actor.role, target.role):
            raise ValueError(
                f"You ({actor.role}) cannot remove a {target.role}"
            )

        # Soft delete — deactivate instead of deleting
        target.is_active = False
        self.db.commit()

        logger.info(
            f"Member removed: {target.email} from org={org_id} "
            f"by {actor.email}"
        )

    def delete_invite(
        self,
        org_id: int,
        invite_id: int,
        actor: User,
    ) -> None:
        """Cancel a pending invite."""
        invite = self.db.query(InviteToken).filter(
            InviteToken.id == invite_id,
            InviteToken.organization_id == org_id,
        ).first()
        if not invite:
            raise ValueError("Invite not found")
        self.db.delete(invite)
        self.db.commit()
        logger.info(f"Invite cancelled: {invite.email} by {actor.email}")