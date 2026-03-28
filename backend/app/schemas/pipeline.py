# schemas/pipeline.py
# Updated in Phase 3 to include StageLog schema
# and new metadata fields on PipelineRun.

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.models.pipeline import PipelineStatus


# ── Stage Log Schema ──────────────────────────────────────────────

class StageLogResponse(BaseModel):
    """Returned when viewing detailed logs for a run."""
    id: int
    run_id: int
    order: int
    name: str
    status: str
    passed: bool
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_seconds: Optional[float]
    output: Optional[str]
    error_output: Optional[str]

    class Config:
        from_attributes = True


# ── Pipeline Schemas ──────────────────────────────────────────────

class PipelineCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    repository: Optional[str] = None
    branch: str = "main"


class PipelineResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    repository: Optional[str]
    branch: str
    created_at: datetime
    updated_at: Optional[datetime]
    run_count: int = 0
    last_status: Optional[str] = None
    # Phase 7
    self_heal_enabled: bool = False
    max_retries: int = 2

    class Config:
        from_attributes = True


# ── Pipeline Run Schemas ──────────────────────────────────────────

class PipelineRunResponse(BaseModel):
    id: int
    pipeline_id: int
    status: PipelineStatus
    triggered_by: str

    # Phase 3: metadata fields
    environment: Optional[str]
    git_commit: Optional[str]
    git_author: Optional[str]
    runner_os: Optional[str]

    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_seconds: Optional[float]
    stages_total: int
    stages_passed: int
    stages_failed: int
    failed_stage: Optional[str]
    error_message: Optional[str]
    logs: Optional[str]
    risk_score: Optional[float]
    root_cause: Optional[str]
    recommendation: Optional[str]
    created_at: datetime

    # Phase 3: structured stage logs
    stage_logs: List[StageLogResponse] = []

    class Config:
        from_attributes = True


# ── Dashboard Schema ──────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_pipelines: int
    total_runs: int
    successful_runs: int
    failed_runs: int
    success_rate: float
    avg_duration_seconds: float
    most_failing_stage: Optional[str] = None
    total_stage_runs: int = 0

    # Phase 4: failure category breakdown
    failure_categories: dict = {}

# Add this at the bottom of schemas/pipeline.py

class FailureAnalysisSummary(BaseModel):
    """Structured breakdown of a failure analysis result."""
    run_id: int
    root_cause_category: str
    severity: str
    explanation: str
    suggestion: str
    confidence: float

    class Config:
        from_attributes = True

# Add at the bottom of schemas/pipeline.py

class RiskFactorResponse(BaseModel):
    """One contributing factor to the risk score."""
    name: str
    score: float
    weight: float
    description: str


class RiskAssessmentResponse(BaseModel):
    """Full risk assessment for a pipeline."""
    pipeline_id: int
    risk_score: float
    risk_level: str
    confidence: float
    factors: List[RiskFactorResponse]
    recommendation: str
    based_on_runs: int

# Add at the bottom of schemas/pipeline.py

class RecommendationResponse(BaseModel):
    id: str
    title: str
    description: str
    action_steps: List[str]
    priority: str
    effort: str
    impact: str
    category: str
    applies_to_stage: Optional[str] = None


class RecommendationReportResponse(BaseModel):
    pipeline_id: int
    run_id: Optional[int]
    recommendations: List[RecommendationResponse]
    summary: str
    total_count: int
    p1_count: int
    generated_from: str

# Add at the bottom of schemas/pipeline.py

class HealingLogResponse(BaseModel):
    id: int
    pipeline_id: int
    run_id: int
    action: str
    reason: str
    result: Optional[str]
    retry_number: int
    new_run_id: Optional[int]
    failure_category: Optional[str]
    risk_score: Optional[float]
    created_at: datetime

    class Config:
        from_attributes = True


class PipelineHealingConfig(BaseModel):
    """Used to enable/disable self-healing and set max retries."""
    self_heal_enabled: bool
    max_retries: int = 2

# ── Team / Invite Schemas ─────────────────────────────────────────

class TeamMemberResponse(BaseModel):
    id: int
    email: str
    name: str
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class InviteRequest(BaseModel):
    email: str = Field(..., description="Email to invite")
    role: str  = Field("member", description="owner | admin | member")


class InviteResponse(BaseModel):
    id: int
    email: str
    role: str
    token: str
    accepted: bool
    expires_at: datetime
    created_at: datetime
    invited_by_name: Optional[str] = None

    class Config:
        from_attributes = True


class AcceptInviteRequest(BaseModel):
    token: str
    name: str     = Field(..., min_length=1)
    password: str = Field(..., min_length=8)


class UpdateMemberRoleRequest(BaseModel):
    role: str = Field(..., description="owner | admin | member")

# ── Integration Schemas ───────────────────────────────────────────

class IntegrationCreate(BaseModel):
    platform: str = Field(..., description="github | gitlab | bitbucket | azure")
    name: str     = Field(..., description="Display name e.g. 'My GitHub'")
    access_token: Optional[str] = Field(None, description="OAuth token or PAT")


class IntegrationResponse(BaseModel):
    id: int
    platform: str
    name: str
    is_active: bool
    trigger_count: int
    last_triggered: Optional[datetime]
    created_at: datetime
    webhook_url: Optional[str] = None   # Generated URL for the webhook

    class Config:
        from_attributes = True


class WebhookPayload(BaseModel):
    """Generic webhook payload — normalized from any platform."""
    platform:    str
    repo_url:    str
    branch:      str
    commit_hash: str
    pusher:      str
    commit_msg:  str = ""

# ── Notification Schemas ──────────────────────────────────────────

class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    type: str
    read: bool
    pipeline_id: Optional[int]
    run_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationPreferenceResponse(BaseModel):
    slack_enabled:     bool
    email_enabled:     bool
    inapp_enabled:     bool
    slack_webhook_url: Optional[str]
    notify_on_failure: bool
    notify_on_success: bool
    notify_on_recovery: bool

    class Config:
        from_attributes = True


class NotificationPreferenceUpdate(BaseModel):
    slack_enabled:     Optional[bool] = None
    email_enabled:     Optional[bool] = None
    inapp_enabled:     Optional[bool] = None
    slack_webhook_url: Optional[str]  = None
    notify_on_failure: Optional[bool] = None
    notify_on_success: Optional[bool] = None
    notify_on_recovery: Optional[bool] = None