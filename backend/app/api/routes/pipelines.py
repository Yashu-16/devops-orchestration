from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from collections import Counter
import logging

from app.db.database import get_db
from app.models.pipeline import Pipeline, PipelineRun, StageLog, PipelineStatus
from app.services.pipeline_service import PipelineService
from app.services.failure_analysis import FailureAnalysisEngine
from app.services.risk_engine import RiskEngine
from app.services.recommendation_engine import RecommendationEngine
from app.services.healing_engine import SelfHealingEngine
from app.services.real_pipeline_service import RealPipelineService
from app.schemas.pipeline import (
    PipelineCreate,
    PipelineResponse,
    PipelineRunResponse,
    StageLogResponse,
    DashboardStats,
    FailureAnalysisSummary,
    RiskAssessmentResponse,
    RiskFactorResponse,
    RecommendationResponse,
    RecommendationReportResponse,
    HealingLogResponse,
    PipelineHealingConfig,
)
from app.core.auth import get_current_org_id

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Pipelines ─────────────────────────────────────────────────────

@router.get("/pipelines", response_model=List[PipelineResponse], tags=["Pipelines"])
def list_pipelines(
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    pipelines = db.query(Pipeline).filter(
        Pipeline.organization_id == org_id
    ).all()
    result = []
    for p in pipelines:
        last_status = p.runs[-1].status.value if p.runs else None
        result.append(PipelineResponse(
            id=p.id, name=p.name, description=p.description,
            repository=p.repository, branch=p.branch,
            created_at=p.created_at, updated_at=p.updated_at,
            run_count=len(p.runs), last_status=last_status,
            self_heal_enabled=p.self_heal_enabled,
            max_retries=p.max_retries,
        ))
    return result


@router.post("/pipelines", response_model=PipelineResponse,
             status_code=status.HTTP_201_CREATED, tags=["Pipelines"])
def create_pipeline(
    data: PipelineCreate,
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    pipeline = Pipeline(**data.model_dump(), organization_id=org_id)
    db.add(pipeline)
    db.commit()
    db.refresh(pipeline)
    return PipelineResponse(
        id=pipeline.id, name=pipeline.name,
        description=pipeline.description,
        repository=pipeline.repository, branch=pipeline.branch,
        created_at=pipeline.created_at, updated_at=pipeline.updated_at,
        run_count=0, last_status=None,
        self_heal_enabled=pipeline.self_heal_enabled,
        max_retries=pipeline.max_retries,
    )


@router.get("/pipelines/{pipeline_id}", response_model=PipelineResponse, tags=["Pipelines"])
def get_pipeline(
    pipeline_id: int,
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    p = db.query(Pipeline).filter(
        Pipeline.id == pipeline_id,
        Pipeline.organization_id == org_id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    return PipelineResponse(
        id=p.id, name=p.name, description=p.description,
        repository=p.repository, branch=p.branch,
        created_at=p.created_at, updated_at=p.updated_at,
        run_count=len(p.runs),
        last_status=p.runs[-1].status.value if p.runs else None,
        self_heal_enabled=p.self_heal_enabled,
        max_retries=p.max_retries,
    )


@router.delete("/pipelines/{pipeline_id}",
               status_code=status.HTTP_204_NO_CONTENT, tags=["Pipelines"])
def delete_pipeline(
    pipeline_id: int,
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    p = db.query(Pipeline).filter(
        Pipeline.id == pipeline_id,
        Pipeline.organization_id == org_id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    db.delete(p)
    db.commit()


# ── Runs ──────────────────────────────────────────────────────────

@router.post("/pipelines/{pipeline_id}/run",
             response_model=PipelineRunResponse, tags=["Runs"])
def trigger_pipeline(
    pipeline_id: int,
    triggered_by: str = "manual",
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    p = db.query(Pipeline).filter(
        Pipeline.id == pipeline_id,
        Pipeline.organization_id == org_id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    service = PipelineService(db)
    run = service.execute_pipeline(p, triggered_by)
    return run


@router.post("/pipelines/{pipeline_id}/run/real",
             response_model=PipelineRunResponse, tags=["Runs"])
def trigger_real_pipeline(
    pipeline_id: int,
    triggered_by: str = "manual",
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    p = db.query(Pipeline).filter(
        Pipeline.id == pipeline_id,
        Pipeline.organization_id == org_id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    if not p.repository:
        raise HTTPException(status_code=400, detail="No repository configured")
    service = RealPipelineService(db)
    run = service.execute_pipeline(p, triggered_by)
    return run


@router.get("/runs", response_model=List[PipelineRunResponse], tags=["Runs"])
def list_runs(
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    runs = (
        db.query(PipelineRun)
        .join(Pipeline, PipelineRun.pipeline_id == Pipeline.id)
        .filter(Pipeline.organization_id == org_id)
        .order_by(PipelineRun.created_at.desc())
        .limit(50)
        .all()
    )
    return runs


@router.get("/runs/{run_id}", response_model=PipelineRunResponse, tags=["Runs"])
def get_run(
    run_id: int,
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    run = (
        db.query(PipelineRun)
        .join(Pipeline, PipelineRun.pipeline_id == Pipeline.id)
        .filter(
            PipelineRun.id == run_id,
            Pipeline.organization_id == org_id,
        )
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("/runs/{run_id}/stages",
            response_model=List[StageLogResponse], tags=["Runs"])
def get_run_stages(
    run_id: int,
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    run = (
        db.query(PipelineRun)
        .join(Pipeline, PipelineRun.pipeline_id == Pipeline.id)
        .filter(
            PipelineRun.id == run_id,
            Pipeline.organization_id == org_id,
        )
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run.stage_logs


# ── Analysis ──────────────────────────────────────────────────────

@router.post("/runs/{run_id}/analyze",
             response_model=FailureAnalysisSummary, tags=["Analysis"])
def analyze_run(
    run_id: int,
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    run = (
        db.query(PipelineRun)
        .join(Pipeline, PipelineRun.pipeline_id == Pipeline.id)
        .filter(
            PipelineRun.id == run_id,
            Pipeline.organization_id == org_id,
        )
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if run.status.value != "failed":
        raise HTTPException(status_code=400, detail="Run did not fail")

    engine = FailureAnalysisEngine()
    result = engine.analyze(run)
    if not result:
        raise HTTPException(status_code=500, detail="Analysis returned no result")

    run.root_cause     = f"[{result.root_cause_category.upper()}] {result.explanation}"
    run.recommendation = result.suggestion
    db.commit()

    return FailureAnalysisSummary(
        run_id=run_id,
        root_cause_category=result.root_cause_category,
        severity=result.severity,
        explanation=result.explanation,
        suggestion=result.suggestion,
        confidence=result.confidence,
    )


# ── Risk ──────────────────────────────────────────────────────────

@router.get("/pipelines/{pipeline_id}/risk",
            response_model=RiskAssessmentResponse, tags=["Risk"])
def get_pipeline_risk(
    pipeline_id: int,
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    pipeline = db.query(Pipeline).filter(
        Pipeline.id == pipeline_id,
        Pipeline.organization_id == org_id,
    ).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    engine     = RiskEngine(db)
    assessment = engine.assess(pipeline_id)

    return RiskAssessmentResponse(
        pipeline_id=assessment.pipeline_id,
        risk_score=assessment.risk_score,
        risk_level=assessment.risk_level,
        confidence=assessment.confidence,
        factors=[
            RiskFactorResponse(
                name=f.name, score=f.score,
                weight=f.weight, description=f.description,
            )
            for f in assessment.factors
        ],
        recommendation=assessment.recommendation,
        based_on_runs=assessment.based_on_runs,
    )


@router.get("/dashboard/risks",
            response_model=List[RiskAssessmentResponse], tags=["Risk"])
def get_all_risks(
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    pipelines = db.query(Pipeline).filter(
        Pipeline.organization_id == org_id
    ).all()
    engine  = RiskEngine(db)
    results = []
    for p in pipelines:
        assessment = engine.assess(p.id)
        results.append(RiskAssessmentResponse(
            pipeline_id=assessment.pipeline_id,
            risk_score=assessment.risk_score,
            risk_level=assessment.risk_level,
            confidence=assessment.confidence,
            factors=[
                RiskFactorResponse(
                    name=f.name, score=f.score,
                    weight=f.weight, description=f.description,
                )
                for f in assessment.factors
            ],
            recommendation=assessment.recommendation,
            based_on_runs=assessment.based_on_runs,
        ))
    return results


# ── Recommendations ───────────────────────────────────────────────

@router.get("/pipelines/{pipeline_id}/recommendations",
            response_model=RecommendationReportResponse,
            tags=["Recommendations"])
def get_pipeline_recommendations(
    pipeline_id: int,
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    pipeline = db.query(Pipeline).filter(
        Pipeline.id == pipeline_id,
        Pipeline.organization_id == org_id,
    ).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    engine = RecommendationEngine(db)
    report = engine.generate(pipeline_id)

    return RecommendationReportResponse(
        pipeline_id=report.pipeline_id,
        run_id=report.run_id,
        recommendations=[
            RecommendationResponse(
                id=r.id, title=r.title,
                description=r.description,
                action_steps=r.action_steps,
                priority=r.priority, effort=r.effort,
                impact=r.impact, category=r.category,
                applies_to_stage=r.applies_to_stage,
            )
            for r in report.recommendations
        ],
        summary=report.summary,
        total_count=report.total_count,
        p1_count=report.p1_count,
        generated_from=report.generated_from,
    )


@router.post("/runs/{run_id}/recommendations",
             response_model=RecommendationReportResponse,
             tags=["Recommendations"])
def get_run_recommendations(
    run_id: int,
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    run = (
        db.query(PipelineRun)
        .join(Pipeline, PipelineRun.pipeline_id == Pipeline.id)
        .filter(
            PipelineRun.id == run_id,
            Pipeline.organization_id == org_id,
        )
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    engine = RecommendationEngine(db)
    report = engine.generate(run.pipeline_id, run_id=run_id)

    return RecommendationReportResponse(
        pipeline_id=report.pipeline_id,
        run_id=report.run_id,
        recommendations=[
            RecommendationResponse(
                id=r.id, title=r.title,
                description=r.description,
                action_steps=r.action_steps,
                priority=r.priority, effort=r.effort,
                impact=r.impact, category=r.category,
                applies_to_stage=r.applies_to_stage,
            )
            for r in report.recommendations
        ],
        summary=report.summary,
        total_count=report.total_count,
        p1_count=report.p1_count,
        generated_from=report.generated_from,
    )


# ── Self-Healing ──────────────────────────────────────────────────

@router.patch("/pipelines/{pipeline_id}/healing",
              response_model=PipelineResponse, tags=["Self-Healing"])
def update_healing_config(
    pipeline_id: int,
    config: PipelineHealingConfig,
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    p = db.query(Pipeline).filter(
        Pipeline.id == pipeline_id,
        Pipeline.organization_id == org_id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    p.self_heal_enabled = config.self_heal_enabled
    p.max_retries       = config.max_retries
    db.commit()
    db.refresh(p)

    return PipelineResponse(
        id=p.id, name=p.name, description=p.description,
        repository=p.repository, branch=p.branch,
        created_at=p.created_at, updated_at=p.updated_at,
        run_count=len(p.runs),
        last_status=p.runs[-1].status.value if p.runs else None,
        self_heal_enabled=p.self_heal_enabled,
        max_retries=p.max_retries,
    )


@router.get("/dashboard/healing",
            response_model=List[HealingLogResponse], tags=["Self-Healing"])
def get_all_healing_logs(
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    from app.models.pipeline import HealingLog
    return (
        db.query(HealingLog)
        .join(Pipeline, HealingLog.pipeline_id == Pipeline.id)
        .filter(Pipeline.organization_id == org_id)
        .order_by(HealingLog.created_at.desc())
        .limit(20)
        .all()
    )


# ── Dashboard ─────────────────────────────────────────────────────

@router.get("/dashboard/stats", response_model=DashboardStats, tags=["Dashboard"])
def get_stats(
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    total_pipelines = db.query(Pipeline).filter(
        Pipeline.organization_id == org_id
    ).count()

    run_query = (
        db.query(PipelineRun)
        .join(Pipeline, PipelineRun.pipeline_id == Pipeline.id)
        .filter(Pipeline.organization_id == org_id)
    )

    total_runs  = run_query.count()
    successful  = run_query.filter(
        PipelineRun.status == PipelineStatus.SUCCESS
    ).count()
    failed      = run_query.filter(
        PipelineRun.status == PipelineStatus.FAILED
    ).count()
    success_rate = round((successful / total_runs * 100), 1) if total_runs > 0 else 0.0

    avg_duration = db.query(
        func.avg(PipelineRun.duration_seconds)
    ).join(Pipeline).filter(
        Pipeline.organization_id == org_id
    ).scalar() or 0.0

    failed_stages = (
        db.query(PipelineRun.failed_stage)
        .join(Pipeline)
        .filter(
            Pipeline.organization_id == org_id,
            PipelineRun.failed_stage.isnot(None),
        )
        .all()
    )
    most_failing = None
    if failed_stages:
        counts = Counter(row[0] for row in failed_stages)
        most_failing = counts.most_common(1)[0][0]

    total_stage_runs = (
        db.query(StageLog)
        .join(PipelineRun)
        .join(Pipeline)
        .filter(Pipeline.organization_id == org_id)
        .count()
    )

    failed_runs_with_cause = (
        db.query(PipelineRun.root_cause)
        .join(Pipeline)
        .filter(
            Pipeline.organization_id == org_id,
            PipelineRun.root_cause.isnot(None),
        )
        .all()
    )
    category_counts: dict = {}
    for row in failed_runs_with_cause:
        cause = row[0] or ""
        if cause.startswith("[") and "]" in cause:
            category = cause[1:cause.index("]")].lower()
            category_counts[category] = category_counts.get(category, 0) + 1

    return DashboardStats(
        total_pipelines=total_pipelines,
        total_runs=total_runs,
        successful_runs=successful,
        failed_runs=failed,
        success_rate=success_rate,
        avg_duration_seconds=round(avg_duration, 2),
        most_failing_stage=most_failing,
        total_stage_runs=total_stage_runs,
        failure_categories=category_counts,
    )


# ── Webhooks ──────────────────────────────────────────────────────

@router.post("/webhooks/github", tags=["Webhooks"])
async def github_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    payload    = await request.json()
    ref        = payload.get("ref", "")
    branch     = ref.replace("refs/heads/", "")
    repo_url   = payload.get("repository", {}).get("clone_url", "")
    pusher     = payload.get("pusher", {}).get("name", "webhook")

    if not repo_url:
        return {"status": "ignored", "reason": "no repository URL"}

    pipelines = db.query(Pipeline).all()
    matched   = None
    for p in pipelines:
        if p.repository and (
            p.repository in repo_url or
            repo_url.replace("https://github.com/", "") in (p.repository or "")
        ):
            if p.branch == branch or p.branch == "*":
                matched = p
                break

    if not matched:
        return {"status": "ignored", "reason": "no matching pipeline"}

    service = RealPipelineService(db)
    run     = service.execute_pipeline(matched, triggered_by=f"webhook:{pusher}")

    return {
        "status":   "triggered",
        "pipeline": matched.name,
        "run_id":   run.id,
    }