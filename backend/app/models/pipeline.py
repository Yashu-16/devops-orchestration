# models/pipeline.py — Updated in Phase 7
# Added: self_heal_enabled, max_retries to Pipeline
# Added: HealingLog model for audit trail

from sqlalchemy import (
    Column, Integer, String, DateTime,
    Float, Text, Enum, ForeignKey, Boolean
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.database import Base

# Add at the top of models/pipeline.py
# These are the new multi-tenant models

class Organization(Base):
    """
    An organization is a tenant — a company or team.
    All pipelines, runs, and data belong to an organization.
    User A's org cannot see User B's org data.
    """
    __tablename__ = "organizations"

    id         = Column(Integer, primary_key=True, index=True)
    name       = Column(String(255), nullable=False)
    slug       = Column(String(100), unique=True, index=True)
    plan       = Column(String(50), default="free")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    users     = relationship("User", back_populates="organization")
    pipelines = relationship("Pipeline", back_populates="organization")


class User(Base):
    """
    A user belongs to one organization.
    They log in with email + password.
    """
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"))
    email           = Column(String(255), unique=True, index=True)
    name            = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role            = Column(String(50), default="member")  # owner | admin | member
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", back_populates="users")

class InviteToken(Base):
    """
    A one-time invite token sent to a colleague.
    When they click the link, they join the organization.
    Expires after 48 hours.
    """
    __tablename__ = "invite_tokens"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    invited_by_id   = Column(Integer, ForeignKey("users.id"), nullable=False)
    email           = Column(String(255), nullable=False)
    role            = Column(String(50), default="member")
    token           = Column(String(64), unique=True, index=True, nullable=False)
    accepted        = Column(Boolean, default=False)
    expires_at      = Column(DateTime(timezone=True), nullable=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    organization = relationship("Organization", foreign_keys=[organization_id])
    invited_by   = relationship("User", foreign_keys=[invited_by_id])

    def __repr__(self):
        return f"<InviteToken email={self.email} org={self.organization_id}>"

class Integration(Base):
    """
    Stores a connected CI/CD platform integration for an organization.
    Each org can connect multiple platforms.
    The webhook_secret is used to verify requests are genuine.
    """
    __tablename__ = "integrations"

    id              = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    platform        = Column(String(50), nullable=False)   # github | gitlab | bitbucket | azure
    name            = Column(String(255), nullable=False)  # Display name
    webhook_secret  = Column(String(64), nullable=True)    # For verifying webhooks
    access_token    = Column(String(500), nullable=True)   # OAuth or PAT token
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    last_triggered  = Column(DateTime(timezone=True), nullable=True)
    trigger_count   = Column(Integer, default=0)

    organization = relationship("Organization", foreign_keys=[organization_id])

    def __repr__(self):
        return f"<Integration platform={self.platform} org={self.organization_id}>"

class NotificationPreference(Base):
    """
    Per-user notification preferences.
    Controls which channels each user receives alerts on.
    """
    __tablename__ = "notification_preferences"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), unique=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"))

    # Channels
    slack_enabled   = Column(Boolean, default=False)
    email_enabled   = Column(Boolean, default=True)
    inapp_enabled   = Column(Boolean, default=True)

    # Slack config
    slack_webhook_url = Column(String(500), nullable=True)

    # When to notify
    notify_on_failure = Column(Boolean, default=True)
    notify_on_success = Column(Boolean, default=False)
    notify_on_recovery = Column(Boolean, default=True)  # When pipeline recovers after failure

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user         = relationship("User", foreign_keys=[user_id])
    organization = relationship("Organization", foreign_keys=[organization_id])


class Notification(Base):
    """
    In-app notification record.
    Shown in the notification bell in the top bar.
    """
    __tablename__ = "notifications"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"))
    organization_id = Column(Integer, ForeignKey("organizations.id"))

    title    = Column(String(255), nullable=False)
    message  = Column(String(1000), nullable=False)
    type     = Column(String(50), default="info")   # info | success | warning | error
    read     = Column(Boolean, default=False)

    # Link back to the run that triggered this
    pipeline_id = Column(Integer, ForeignKey("pipelines.id"), nullable=True)
    run_id      = Column(Integer, ForeignKey("pipeline_runs.id"), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user         = relationship("User", foreign_keys=[user_id])
    organization = relationship("Organization", foreign_keys=[organization_id])

class PipelineStatus(str, enum.Enum):
    PENDING   = "pending"
    RUNNING   = "running"
    SUCCESS   = "success"
    FAILED    = "failed"
    CANCELLED = "cancelled"


class HealingAction(str, enum.Enum):
    RETRY    = "retry"
    ROLLBACK = "rollback"
    ALERT    = "alert"
    SKIPPED  = "skipped"


class Pipeline(Base):
    __tablename__ = "pipelines"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    repository  = Column(String(500), nullable=True)
    branch      = Column(String(100), default="main")

    # Phase 7: Self-healing configuration
    self_heal_enabled = Column(Boolean, default=False)
    max_retries       = Column(Integer, default=2)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    runs = relationship(
        "PipelineRun",
        back_populates="pipeline",
        cascade="all, delete-orphan"
    )
    healing_logs = relationship(
        "HealingLog",
        back_populates="pipeline",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Pipeline id={self.id} name={self.name}>"

    # In the Pipeline class, add this field:
    organization_id = Column(
        Integer, ForeignKey("organizations.id"), nullable=True, index=True
    )
    organization = relationship("Organization", back_populates="pipelines")


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id          = Column(Integer, primary_key=True, index=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id"), nullable=False)

    status       = Column(Enum(PipelineStatus), default=PipelineStatus.PENDING)
    triggered_by = Column(String(100), default="manual")

    # Phase 3: metadata
    environment   = Column(String(50), default="production")
    git_commit    = Column(String(40), nullable=True)
    git_author    = Column(String(100), nullable=True)
    runner_os     = Column(String(50), default="ubuntu-latest")

    # Phase 7: healing context
    retry_count   = Column(Integer, default=0)
    is_retry      = Column(Boolean, default=False)
    parent_run_id = Column(Integer, nullable=True)  # which run triggered this retry

    started_at       = Column(DateTime(timezone=True), nullable=True)
    completed_at     = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Float, nullable=True)

    stages_total  = Column(Integer, default=0)
    stages_passed = Column(Integer, default=0)
    stages_failed = Column(Integer, default=0)
    failed_stage  = Column(String(100), nullable=True)
    error_message = Column(Text, nullable=True)
    logs          = Column(Text, nullable=True)

    risk_score     = Column(Float, nullable=True)
    root_cause     = Column(Text, nullable=True)
    recommendation = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    pipeline   = relationship("Pipeline", back_populates="runs")
    stage_logs = relationship(
        "StageLog",
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="StageLog.order"
    )

    def __repr__(self):
        return f"<PipelineRun id={self.id} status={self.status}>"


class StageLog(Base):
    __tablename__ = "stage_logs"

    id     = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("pipeline_runs.id"), nullable=False)

    order  = Column(Integer, nullable=False)
    name   = Column(String(100), nullable=False)
    status = Column(String(20), nullable=False)
    passed = Column(Boolean, default=False)

    started_at       = Column(DateTime(timezone=True), nullable=True)
    completed_at     = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Float, nullable=True)

    output       = Column(Text, nullable=True)
    error_output = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    run = relationship("PipelineRun", back_populates="stage_logs")


class HealingLog(Base):
    """
    NEW in Phase 7.
    Records every self-healing action taken.
    This is the audit trail — engineers can see exactly
    what the system did automatically and why.
    """
    __tablename__ = "healing_logs"

    id          = Column(Integer, primary_key=True, index=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id"), nullable=False)
    run_id      = Column(Integer, nullable=False)   # The run that triggered healing

    # What happened
    action      = Column(Enum(HealingAction), nullable=False)
    reason      = Column(Text, nullable=False)       # Why this action was taken
    result      = Column(String(50), nullable=True)  # "success", "failed", "pending"

    # Context
    retry_number      = Column(Integer, default=0)
    new_run_id        = Column(Integer, nullable=True)  # Run created by retry
    failure_category  = Column(String(50), nullable=True)
    risk_score        = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    pipeline = relationship("Pipeline", back_populates="healing_logs")

    def __repr__(self):
        return (
            f"<HealingLog id={self.id} "
            f"action={self.action} run={self.run_id}>"
        )