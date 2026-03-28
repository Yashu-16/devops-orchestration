# notifications.py routes
# All notification endpoints — reading, marking read, and preferences.

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.pipeline import User
from app.core.auth import get_current_user
from app.services.notification_service import NotificationService
from app.schemas.pipeline import (
    NotificationResponse,
    NotificationPreferenceResponse,
    NotificationPreferenceUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Notifications ─────────────────────────────────────────────────

@router.get("/notifications",
            response_model=List[NotificationResponse],
            tags=["Notifications"])
def get_notifications(
    unread_only: bool = False,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get notifications for the current user."""
    service = NotificationService(db)
    return service.get_notifications(
        current_user.id,
        limit=limit,
        unread_only=unread_only,
    )


@router.get("/notifications/unread-count", tags=["Notifications"])
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get count of unread notifications."""
    service = NotificationService(db)
    return {"count": service.get_unread_count(current_user.id)}


@router.post("/notifications/mark-read", tags=["Notifications"])
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark all notifications as read."""
    service = NotificationService(db)
    service.mark_read(current_user.id)
    return {"status": "ok"}


@router.post("/notifications/{notification_id}/read",
             tags=["Notifications"])
def mark_one_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a single notification as read."""
    service = NotificationService(db)
    service.mark_read(current_user.id, notification_id)
    return {"status": "ok"}


# ── Preferences ───────────────────────────────────────────────────

@router.get("/notifications/preferences",
            response_model=NotificationPreferenceResponse,
            tags=["Notifications"])
def get_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get notification preferences for the current user."""
    service = NotificationService(db)
    return service.get_prefs(current_user.id)


@router.patch("/notifications/preferences",
              response_model=NotificationPreferenceResponse,
              tags=["Notifications"])
def update_preferences(
    data: NotificationPreferenceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update notification preferences."""
    service = NotificationService(db)
    return service.update_prefs(
        current_user.id,
        data.model_dump(exclude_none=True),
    )


@router.post("/notifications/test-slack", tags=["Notifications"])
def test_slack(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Send a test message to the configured Slack webhook.
    Use this to verify your webhook URL works.
    """
    service = NotificationService(db)
    prefs   = service.get_prefs(current_user.id)

    if not prefs.slack_webhook_url:
        raise HTTPException(
            status_code=400,
            detail="No Slack webhook URL configured. Add one in preferences first."
        )

    success = service.test_slack_webhook(prefs.slack_webhook_url)
    if success:
        return {"status": "ok", "message": "Test message sent to Slack successfully!"}
    else:
        raise HTTPException(
            status_code=400,
            detail="Failed to send test message. Check your webhook URL."
        )