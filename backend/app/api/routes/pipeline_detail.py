# pipeline_detail.py
# Per-pipeline detail endpoints:
# GET /pipelines/{id}/overview   — stats summary
# GET /pipelines/{id}/runs       — run history for this pipeline only
# GET /pipelines/{id}/analytics  — charts data for this pipeline only
# GET /pipelines/{id}/healing    — healing events for this pipeline only
# GET /pipelines/{id}/ml         — ML prediction for this pipeline only
# GET /pipelines/{id}/members    — who has access to this pipeline
# POST /pipelines/{id}/members   — assign a member to this pipeline

import logging
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.database import get_db
from app.models.pipeline import (
    Pipeline, PipelineRun, PipelineStatus,
    HealingLog, User, PipelineMember,
)
from app.core.auth import get_current_user
from app.services.risk_engine import RiskEngine
from app.services.recommendation_engine import RecommendationEngine

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────

def get_pipeline_or_404(
    pipeline_id: int,
    db: Session,
    current_user: User,
) -> Pipeline:
    """
    Fetch pipeline and verify the current user has access.
    - Owners and admins can access any pipeline in their org.
    - Members can only access pipelines they are assigned to.
    """
    pipeline = db.query(Pipeline).filter(
        Pipeline.id == pipeline_id,
        Pipeline.organization_id == current_user.organization_id,
    ).first()

    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    # Role-based access check
    if current_user.role == "member":
        assigned = db.query(PipelineMember).filter(
            PipelineMember.pipeline_id == pipeline_id,
            PipelineMember.user_id == current_user.id,
        ).first()
        if not assigned:
            raise HTTPException(
                status_code=403,
                detail="You don't have access to this pipeline"
            )

    return pipeline


# ── Overview ───────────────────────────────────────────────────────────────

@router.get("/pipelines/{pipeline_id}/overview", tags=["Pipeline Detail"])
def get_pipeline_overview(
    pipeline_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Summary stats for a single pipeline.
    Used as the header of the pipeline detail page.
    """
    pipeline = get_pipeline_or_404(pipeline_id, db, current_user)

    runs = (
        db.query(PipelineRun)
        .filter(PipelineRun.pipeline_id == pipeline_id)
        .order_by(PipelineRun.created_at.desc())
        .all()
    )

    total     = len(runs)
    failed    = sum(1 for r in runs if r.status == PipelineStatus.FAILED)
    success   = sum(1 for r in runs if r.status == PipelineStatus.SUCCESS)
    fail_rate = round(failed / total * 100, 1) if total > 0 else 0

    durations = [r.duration_seconds for r in runs if r.duration_seconds]
    avg_dur   = round(sum(durations) / len(durations), 1) if durations else 0

    last_run  = runs[0] if runs else None

    # Risk assessment
    risk_engine = RiskEngine(db)
    assessment  = risk_engine.assess(pipeline_id)

    return {
        "id":             pipeline.id,
        "name":           pipeline.name,
        "description":    pipeline.description,
        "repository":     pipeline.repository,
        "branch":         pipeline.branch,
        "total_runs":     total,
        "failed_runs":    failed,
        "success_runs":   success,
        "failure_rate":   fail_rate,
        "avg_duration":   avg_dur,
        "risk_score":     assessment.risk_score,
        "risk_level":     assessment.risk_level,
        "last_run_status": last_run.status.value if last_run else None,
        "last_run_at":    last_run.created_at if last_run else None,
        "self_heal_enabled": pipeline.self_heal_enabled,
        "created_at":     pipeline.created_at,
    }


# ── Runs ───────────────────────────────────────────────────────────────────

@router.get("/pipelines/{pipeline_id}/runs", tags=["Pipeline Detail"])
def get_pipeline_runs(
    pipeline_id: int,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run history for a specific pipeline only."""
    pipeline = get_pipeline_or_404(pipeline_id, db, current_user)

    runs = (
        db.query(PipelineRun)
        .filter(PipelineRun.pipeline_id == pipeline_id)
        .order_by(PipelineRun.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    total = db.query(func.count(PipelineRun.id)).filter(
        PipelineRun.pipeline_id == pipeline_id
    ).scalar()

    return {
        "pipeline_id":   pipeline_id,
        "pipeline_name": pipeline.name,
        "total":         total,
        "runs": [
            {
                "id":              r.id,
                "status":          r.status.value,
                "environment":     r.environment,
                "triggered_by":    r.triggered_by,
                "git_commit":      r.git_commit,
                "git_author":      r.git_author,
                "duration_seconds": r.duration_seconds,
                "stages_total":    r.stages_total,
                "stages_passed":   r.stages_passed,
                "stages_failed":   r.stages_failed,
                "failed_stage":    r.failed_stage,
                "root_cause":      r.root_cause,
                "risk_score":      r.risk_score,
                "created_at":      r.created_at,
                "completed_at":    r.completed_at,
            }
            for r in runs
        ],
    }


# ── Analytics ──────────────────────────────────────────────────────────────

@router.get("/pipelines/{pipeline_id}/analytics", tags=["Pipeline Detail"])
def get_pipeline_analytics(
    pipeline_id: int,
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Analytics data scoped to a single pipeline.
    Returns trend charts, failure breakdown, and stage stats.
    """
    pipeline = get_pipeline_or_404(pipeline_id, db, current_user)

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    runs = (
        db.query(PipelineRun)
        .filter(
            PipelineRun.pipeline_id == pipeline_id,
            PipelineRun.created_at >= cutoff,
        )
        .order_by(PipelineRun.created_at.asc())
        .all()
    )

    # Daily trend
    daily: dict = defaultdict(lambda: {"success": 0, "failed": 0, "total": 0})
    for r in runs:
        day = r.created_at.strftime("%Y-%m-%d") if r.created_at else "unknown"
        daily[day]["total"] += 1
        if r.status == PipelineStatus.SUCCESS:
            daily[day]["success"] += 1
        elif r.status == PipelineStatus.FAILED:
            daily[day]["failed"] += 1

    trend = [
        {"date": d, **v}
        for d, v in sorted(daily.items())
    ]

    # Stage failure breakdown
    stage_failures: dict = defaultdict(int)
    for r in runs:
        if r.failed_stage:
            stage_failures[r.failed_stage] += 1

    stage_data = [
        {"stage": s, "failures": c}
        for s, c in sorted(stage_failures.items(), key=lambda x: -x[1])
    ]

    # Root cause breakdown
    causes: dict = defaultdict(int)
    for r in runs:
        if r.root_cause:
            # Extract category from "[category] detail"
            bracket = r.root_cause.find("]")
            cat = r.root_cause[1:bracket] if r.root_cause.startswith("[") and bracket > 0 else "unknown"
            causes[cat] += 1

    cause_data = [
        {"name": c, "value": v}
        for c, v in sorted(causes.items(), key=lambda x: -x[1])
    ]

    # Summary stats
    total   = len(runs)
    failed  = sum(1 for r in runs if r.status == PipelineStatus.FAILED)
    success = sum(1 for r in runs if r.status == PipelineStatus.SUCCESS)
    durations = [r.duration_seconds for r in runs if r.duration_seconds]

    return {
        "pipeline_id":   pipeline_id,
        "pipeline_name": pipeline.name,
        "period_days":   days,
        "summary": {
            "total_runs":   total,
            "success_runs": success,
            "failed_runs":  failed,
            "success_rate": round(success / total * 100, 1) if total > 0 else 0,
            "avg_duration": round(sum(durations) / len(durations), 1) if durations else 0,
            "min_duration": round(min(durations), 1) if durations else 0,
            "max_duration": round(max(durations), 1) if durations else 0,
        },
        "trend":        trend,
        "stage_failures": stage_data,
        "root_causes":  cause_data,
    }


# ── Healing ────────────────────────────────────────────────────────────────

@router.get("/pipelines/{pipeline_id}/healing", tags=["Pipeline Detail"])
def get_pipeline_healing(
    pipeline_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Healing events scoped to a single pipeline."""
    pipeline = get_pipeline_or_404(pipeline_id, db, current_user)

    events = (
        db.query(HealingLog)
        .filter(HealingLog.pipeline_id == pipeline_id)
        .order_by(HealingLog.created_at.desc())
        .limit(50)
        .all()
    )

    total     = len(events)
    succeeded = sum(1 for e in events if e.result == "retry_succeeded")
    failed_h  = total - succeeded

    return {
        "pipeline_id":   pipeline_id,
        "pipeline_name": pipeline.name,
        "summary": {
            "total":     total,
            "succeeded": succeeded,
            "failed":    failed_h,
            "success_rate": round(succeeded / total * 100, 1) if total > 0 else 0,
        },
        "events": [
            {
                "id":            e.id,
                "run_id":        e.run_id,
                "action":        e.action,
                "reason":        e.reason,
                "succeeded":     e.result == "retry_succeeded",
                "retry_count":   e.retry_number,
                "created_at":    e.created_at,
            }
            for e in events
        ],
    }


# ── ML ─────────────────────────────────────────────────────────────────────

@router.get("/pipelines/{pipeline_id}/ml", tags=["Pipeline Detail"])
def get_pipeline_ml(
    pipeline_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    ML risk prediction scoped to a single pipeline.
    Shows the current risk score and what's driving it.
    """
    pipeline = get_pipeline_or_404(pipeline_id, db, current_user)

    risk_engine = RiskEngine(db)
    assessment  = risk_engine.assess(pipeline_id)

    recs_engine = RecommendationEngine(db)
    recs        = recs_engine.generate(pipeline_id)

    # Run count for this pipeline
    run_count = db.query(func.count(PipelineRun.id)).filter(
        PipelineRun.pipeline_id == pipeline_id
    ).scalar()

    # Recent risk trend (last 10 runs)
    recent_runs = (
        db.query(PipelineRun)
        .filter(PipelineRun.pipeline_id == pipeline_id)
        .order_by(PipelineRun.created_at.desc())
        .limit(10)
        .all()
    )

    risk_trend = [
        {
            "run_id":     r.id,
            "risk_score": r.risk_score,
            "status":     r.status.value,
            "created_at": r.created_at,
        }
        for r in reversed(recent_runs)
        if r.risk_score is not None
    ]

    return {
        "pipeline_id":   pipeline_id,
        "pipeline_name": pipeline.name,
        "run_count":     run_count,
        "current_risk": {
            "score":       assessment.risk_score,
            "level":       assessment.risk_level,
            "confidence":  assessment.confidence,
            "based_on_runs": assessment.based_on_runs,
            "used_ml":     assessment.used_ml,
        },
        "factors": [
            {
                "name":        f.name,
                "score":       f.score,
                "weight":      f.weight,
                "description": f.description,
            }
            for f in assessment.factors
        ],
        "recommendations": [
            {
                "priority":    r.priority,
                "title":       r.title,
                "description": r.description,
                "action":      r.action,
            }
            for r in (recs.recommendations[:3] if recs else [])
        ],
        "risk_trend": risk_trend,
    }


# ── Pipeline Members (access control) ─────────────────────────────────────

@router.get("/pipelines/{pipeline_id}/members", tags=["Pipeline Detail"])
def get_pipeline_members(
    pipeline_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all users assigned to this pipeline."""
    pipeline = get_pipeline_or_404(pipeline_id, db, current_user)

    members = (
        db.query(PipelineMember, User)
        .join(User, PipelineMember.user_id == User.id)
        .filter(PipelineMember.pipeline_id == pipeline_id)
        .all()
    )

    # All org members (for the assign dropdown)
    all_members = db.query(User).filter(
        User.organization_id == current_user.organization_id,
        User.is_active == True,
    ).all()

    assigned_ids = {pm.user_id for pm, _ in members}

    return {
        "pipeline_id": pipeline_id,
        "assigned_members": [
            {
                "user_id": u.id,
                "name":    u.name,
                "email":   u.email,
                "role":    u.role,
            }
            for _, u in members
        ],
        "available_to_assign": [
            {
                "user_id": u.id,
                "name":    u.name,
                "email":   u.email,
                "role":    u.role,
            }
            for u in all_members
            if u.id not in assigned_ids
        ],
    }


@router.post("/pipelines/{pipeline_id}/members", tags=["Pipeline Detail"])
def assign_pipeline_member(
    pipeline_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Assign a user to a pipeline. Requires admin or owner."""
    if current_user.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only admins and owners can assign members")

    pipeline = get_pipeline_or_404(pipeline_id, db, current_user)

    user_id = data.get("user_id")
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = db.query(PipelineMember).filter(
        PipelineMember.pipeline_id == pipeline_id,
        PipelineMember.user_id == user_id,
    ).first()

    if not existing:
        db.add(PipelineMember(pipeline_id=pipeline_id, user_id=user_id))
        db.commit()

    return {"status": "assigned", "user_id": user_id, "pipeline_id": pipeline_id}


@router.delete("/pipelines/{pipeline_id}/members/{user_id}", tags=["Pipeline Detail"])
def remove_pipeline_member(
    pipeline_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a user's access to a pipeline. Requires admin or owner."""
    if current_user.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only admins and owners can remove members")

    db.query(PipelineMember).filter(
        PipelineMember.pipeline_id == pipeline_id,
        PipelineMember.user_id == user_id,
    ).delete()
    db.commit()
    return {"status": "removed"}
