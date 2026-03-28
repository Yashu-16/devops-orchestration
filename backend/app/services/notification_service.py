# notification_service.py
# Sends notifications via multiple channels:
# - In-app (always stored in DB)
# - Slack (via webhook URL)
# - Email (via SendGrid)
#
# Called after every pipeline run completes.

import httpx
import logging
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.models.pipeline import (
    Notification, NotificationPreference,
    Pipeline, PipelineRun, User, PipelineStatus
)
from app.core.config import settings

logger = logging.getLogger(__name__)


class NotificationService:

    def __init__(self, db: Session):
        self.db = db

    # ── Main entry point ──────────────────────────────────────────

    def notify_run_complete(
        self,
        run: PipelineRun,
        pipeline: Pipeline,
    ) -> None:
        """
        Called after every pipeline run.
        Checks preferences and sends notifications on the right channels.
        """
        is_failure  = run.status == PipelineStatus.FAILED
        is_success  = run.status == PipelineStatus.SUCCESS

        if not is_failure and not is_success:
            return  # Don't notify for running/pending

        # Get all users in the organization
        users = (
            self.db.query(User)
            .filter(
                User.organization_id == pipeline.organization_id,
                User.is_active == True,
            )
            .all()
        )

        for user in users:
            prefs = self._get_or_create_prefs(user)

            # Check if user wants this type of notification
            if is_failure and not prefs.notify_on_failure:
                continue
            if is_success and not prefs.notify_on_success:
                continue

            # Build notification content
            content = self._build_content(run, pipeline, is_failure)

            # In-app notification (always if enabled)
            if prefs.inapp_enabled:
                self._create_inapp(user, pipeline, run, content)

            # Slack notification
            if prefs.slack_enabled and prefs.slack_webhook_url:
                self._send_slack(prefs.slack_webhook_url, content, run, pipeline)

            # Email notification
            if prefs.email_enabled and settings.SENDGRID_API_KEY:
                self._send_email(user.email, content, run, pipeline)

    # ── Content builder ───────────────────────────────────────────

    def _build_content(
        self, run: PipelineRun, pipeline: Pipeline, is_failure: bool
    ) -> dict:
        """Build notification content for all channels."""
        status_emoji = "❌" if is_failure else "✅"
        status_text  = "FAILED" if is_failure else "SUCCEEDED"

        # Extract root cause if available
        root_cause = ""
        if run.root_cause:
            bracket = run.root_cause.find("]")
            if run.root_cause.startswith("[") and bracket > 0:
                root_cause = run.root_cause[bracket + 1:].strip()

        title = f"{status_emoji} Pipeline {status_text}: {pipeline.name}"
        message = (
            f"Run #{run.id} {status_text.lower()} "
            f"after {run.duration_seconds or 0}s"
        )
        if root_cause:
            message += f" — {root_cause[:100]}"

        return {
            "title":       title,
            "message":     message,
            "status":      "error" if is_failure else "success",
            "run_id":      run.id,
            "pipeline":    pipeline.name,
            "duration":    run.duration_seconds or 0,
            "root_cause":  root_cause,
            "failed_stage": run.failed_stage or "",
            "environment": run.environment or "unknown",
            "triggered_by": run.triggered_by or "manual",
        }

    # ── In-app notifications ──────────────────────────────────────

    def _create_inapp(
        self,
        user: User,
        pipeline: Pipeline,
        run: PipelineRun,
        content: dict,
    ) -> None:
        """Save an in-app notification to the database."""
        notification = Notification(
            user_id=user.id,
            organization_id=pipeline.organization_id,
            title=content["title"],
            message=content["message"],
            type=content["status"],
            pipeline_id=pipeline.id,
            run_id=run.id,
            read=False,
        )
        self.db.add(notification)
        self.db.commit()
        logger.info(
            f"In-app notification created for user={user.email} "
            f"pipeline={pipeline.name} run={run.id}"
        )

    def get_notifications(
        self, user_id: int, limit: int = 20, unread_only: bool = False
    ) -> list:
        """Get notifications for a user."""
        query = (
            self.db.query(Notification)
            .filter(Notification.user_id == user_id)
        )
        if unread_only:
            query = query.filter(Notification.read == False)
        return (
            query.order_by(Notification.created_at.desc())
            .limit(limit)
            .all()
        )

    def get_unread_count(self, user_id: int) -> int:
        """Get count of unread notifications."""
        return (
            self.db.query(Notification)
            .filter(
                Notification.user_id == user_id,
                Notification.read == False,
            )
            .count()
        )

    def mark_read(self, user_id: int, notification_id: Optional[int] = None) -> None:
        """Mark one or all notifications as read."""
        query = self.db.query(Notification).filter(
            Notification.user_id == user_id
        )
        if notification_id:
            query = query.filter(Notification.id == notification_id)
        query.update({"read": True})
        self.db.commit()

    # ── Slack ─────────────────────────────────────────────────────

    def _send_slack(
        self,
        webhook_url: str,
        content: dict,
        run: PipelineRun,
        pipeline: Pipeline,
    ) -> None:
        """
        Send a Slack message via incoming webhook.
        The webhook URL is configured by the user in their preferences.

        How to get a Slack webhook URL:
        1. Go to https://api.slack.com/apps
        2. Create app → Incoming Webhooks → Add New Webhook
        3. Select channel → Copy webhook URL
        """
        is_failure = content["status"] == "error"
        color      = "#ff4444" if is_failure else "#00cc88"
        emoji      = "❌" if is_failure else "✅"

        # Slack Block Kit message format
        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{emoji} Pipeline {content['status'].upper()}: {content['pipeline']}",
                }
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Run:*\n#{content['run_id']}"},
                    {"type": "mrkdwn", "text": f"*Duration:*\n{content['duration']}s"},
                    {"type": "mrkdwn", "text": f"*Environment:*\n{content['environment']}"},
                    {"type": "mrkdwn", "text": f"*Triggered by:*\n{content['triggered_by']}"},
                ]
            },
        ]

        if content["root_cause"]:
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Root Cause:*\n{content['root_cause']}"
                }
            })

        if content["failed_stage"]:
            blocks.append({
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Failed Stage:*\n`{content['failed_stage']}`"
                }
            })

        payload = {
            "attachments": [{
                "color":  color,
                "blocks": blocks,
            }]
        }

        try:
            with httpx.Client(timeout=10) as client:
                response = client.post(webhook_url, json=payload)
                if response.status_code == 200:
                    logger.info(
                        f"Slack notification sent for "
                        f"pipeline={pipeline.name} run={run.id}"
                    )
                else:
                    logger.warning(
                        f"Slack notification failed: "
                        f"status={response.status_code} body={response.text}"
                    )
        except Exception as e:
            logger.error(f"Slack notification error: {e}")

    def test_slack_webhook(self, webhook_url: str) -> bool:
        """Test a Slack webhook URL with a simple message."""
        try:
            with httpx.Client(timeout=10) as client:
                response = client.post(webhook_url, json={
                    "text": "✅ DevOps Orchestrator connected successfully!"
                })
                return response.status_code == 200
        except Exception as e:
            logger.error(f"Slack test error: {e}")
            return False

    # ── Email via SendGrid ────────────────────────────────────────

    def _send_email(
        self,
        to_email: str,
        content: dict,
        run: PipelineRun,
        pipeline: Pipeline,
    ) -> None:
        """
        Send an email notification via SendGrid.
        Requires SENDGRID_API_KEY in .env
        Get a free key at: https://sendgrid.com (100 emails/day free)
        """
        if not settings.SENDGRID_API_KEY:
            logger.debug("SendGrid not configured — skipping email")
            return

        is_failure = content["status"] == "error"
        status_color = "#ff4444" if is_failure else "#00cc88"
        status_text  = "FAILED" if is_failure else "SUCCEEDED"

        html_content = f"""
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: {status_color}; padding: 20px; border-radius: 8px 8px 0 0;">
                <h2 style="color: white; margin: 0;">
                    Pipeline {status_text}: {pipeline.name}
                </h2>
            </div>
            <div style="background: #1a1a2e; padding: 20px; border-radius: 0 0 8px 8px;">
                <table style="color: #ccc; width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #333;">
                            <strong style="color: #fff;">Run</strong>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #333;">
                            #{content['run_id']}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #333;">
                            <strong style="color: #fff;">Duration</strong>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #333;">
                            {content['duration']}s
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #333;">
                            <strong style="color: #fff;">Environment</strong>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #333;">
                            {content['environment']}
                        </td>
                    </tr>
                    {"" if not content['root_cause'] else f'''
                    <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #333;">
                            <strong style="color: #fff;">Root Cause</strong>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #333; color: #ff8888;">
                            {content['root_cause']}
                        </td>
                    </tr>
                    '''}
                </table>
                <p style="color: #888; margin-top: 20px; font-size: 12px;">
                    DevOps Orchestrator · Autonomous CI/CD Platform
                </p>
            </div>
        </div>
        """

        try:
            import sendgrid
            from sendgrid.helpers.mail import Mail, To

            sg      = sendgrid.SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)
            message = Mail(
                from_email=(settings.SENDGRID_FROM_EMAIL, settings.SENDGRID_FROM_NAME),
                to_emails=to_email,
                subject=content["title"],
                html_content=html_content,
            )
            response = sg.send(message)
            if response.status_code in (200, 202):
                logger.info(f"Email sent to {to_email} for run={run.id}")
            else:
                logger.warning(f"Email failed: status={response.status_code}")
        except Exception as e:
            logger.error(f"Email error: {e}")

    # ── Preferences ───────────────────────────────────────────────

    def _get_or_create_prefs(self, user: User) -> NotificationPreference:
        """Get or create notification preferences for a user."""
        prefs = self.db.query(NotificationPreference).filter(
            NotificationPreference.user_id == user.id
        ).first()
        if not prefs:
            prefs = NotificationPreference(
                user_id=user.id,
                organization_id=user.organization_id,
                slack_enabled=False,
                email_enabled=True,
                inapp_enabled=True,
                notify_on_failure=True,
                notify_on_success=False,
                notify_on_recovery=True,
            )
            self.db.add(prefs)
            self.db.commit()
            self.db.refresh(prefs)
        return prefs

    def get_prefs(self, user_id: int) -> NotificationPreference:
        """Get preferences, creating defaults if needed."""
        user = self.db.query(User).filter(User.id == user_id).first()
        return self._get_or_create_prefs(user)

    def update_prefs(
        self, user_id: int, updates: dict
    ) -> NotificationPreference:
        """Update notification preferences."""
        user  = self.db.query(User).filter(User.id == user_id).first()
        prefs = self._get_or_create_prefs(user)
        for key, value in updates.items():
            if value is not None and hasattr(prefs, key):
                setattr(prefs, key, value)
        self.db.commit()
        self.db.refresh(prefs)
        return prefs