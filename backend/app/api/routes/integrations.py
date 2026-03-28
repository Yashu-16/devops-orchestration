# integrations.py routes
# Two types of endpoints:
# 1. Integration management (authenticated) — create/delete integrations
# 2. Webhook receivers (public) — receive payloads from GitHub/GitLab/etc

import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.pipeline import Integration, User
from app.core.auth import get_current_user, get_current_org_id
from app.services.integration_service import IntegrationService, PLATFORM_INFO
from app.services.pipeline_service import PipelineService
from app.schemas.pipeline import (
    IntegrationCreate,
    IntegrationResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter()

import os
BASE_URL = os.environ.get(
    "PUBLIC_BACKEND_URL",
    os.environ.get("RAILWAY_PUBLIC_DOMAIN", "http://localhost:8000")
)
# Ensure https for Railway
if BASE_URL and not BASE_URL.startswith("http"):
    BASE_URL = f"https://{BASE_URL}"


# ── Integration Management (authenticated) ────────────────────────

@router.get("/integrations",
            response_model=List[IntegrationResponse],
            tags=["Integrations"])
def list_integrations(
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    """Get all integrations for the current organization."""
    service      = IntegrationService(db)
    integrations = service.get_integrations(org_id)
    result = []
    for i in integrations:
        result.append(IntegrationResponse(
            id=i.id,
            platform=i.platform,
            name=i.name,
            is_active=i.is_active,
            trigger_count=i.trigger_count,
            last_triggered=i.last_triggered,
            created_at=i.created_at,
            webhook_url=service.get_webhook_url(i, BASE_URL),
        ))
    return result


@router.post("/integrations",
             response_model=IntegrationResponse,
             status_code=status.HTTP_201_CREATED,
             tags=["Integrations"])
def create_integration(
    data: IntegrationCreate,
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    """
    Connect a new CI/CD platform.
    Returns the integration with the webhook URL to configure on the platform.
    """
    try:
        service     = IntegrationService(db)
        integration = service.create_integration(
            org_id=org_id,
            platform=data.platform,
            name=data.name,
            access_token=data.access_token,
        )
        return IntegrationResponse(
            id=integration.id,
            platform=integration.platform,
            name=integration.name,
            is_active=integration.is_active,
            trigger_count=integration.trigger_count,
            last_triggered=integration.last_triggered,
            created_at=integration.created_at,
            webhook_url=service.get_webhook_url(integration, BASE_URL),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/integrations/{integration_id}",
               status_code=status.HTTP_204_NO_CONTENT,
               tags=["Integrations"])
def delete_integration(
    integration_id: int,
    db: Session = Depends(get_db),
    org_id: int = Depends(get_current_org_id),
):
    """Disconnect a platform integration."""
    try:
        service = IntegrationService(db)
        service.delete_integration(org_id, integration_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/integrations/platforms", tags=["Integrations"])
def list_platforms(
    current_user: User = Depends(get_current_user),
):
    """
    Returns info about all supported platforms.
    Used by the UI to show the integration catalog.
    """
    return [
        {
            "id":          platform,
            "name":        info["name"],
            "webhook_doc": info["webhook_doc"],
            "events":      info["events"],
        }
        for platform, info in PLATFORM_INFO.items()
    ]


# ── Webhook Receivers (public — no auth) ─────────────────────────

@router.post("/webhooks/github/{integration_id}", tags=["Webhooks"])
async def receive_github_webhook(
    integration_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Receives GitHub push webhooks.
    Configure this URL in GitHub: Settings → Webhooks → Add webhook
    Payload URL: http://your-server:8000/api/v1/webhooks/github/{integration_id}
    Content type: application/json
    Events: Just the push event
    """
    body    = await request.body()
    payload = await request.json()

    integration = db.query(Integration).filter(
        Integration.id == integration_id,
        Integration.is_active == True,
    ).first()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")

    # Verify webhook signature
    signature = request.headers.get("X-Hub-Signature-256", "")
    service   = IntegrationService(db)

    if integration.webhook_secret and signature:
        if not service.verify_github_signature(body, signature, integration.webhook_secret):
            logger.warning(f"Invalid GitHub signature for integration {integration_id}")
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    # Parse the payload
    parsed = service.parse_github_webhook(payload)
    if not parsed:
        return {"status": "ignored", "reason": "Not a branch push event"}

    logger.info(
        f"GitHub webhook: {parsed.pusher} pushed to "
        f"{parsed.repo_url}@{parsed.branch} | commit={parsed.commit_hash}"
    )

    return await _process_webhook(parsed, integration, service, db)


@router.post("/webhooks/gitlab/{integration_id}", tags=["Webhooks"])
async def receive_gitlab_webhook(
    integration_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Receives GitLab push webhooks.
    Configure in GitLab: Settings → Webhooks
    URL: http://your-server:8000/api/v1/webhooks/gitlab/{integration_id}
    Trigger: Push events
    """
    payload = await request.json()
    event   = request.headers.get("X-Gitlab-Event", "")

    if event != "Push Hook":
        return {"status": "ignored", "reason": f"Event type '{event}' not handled"}

    integration = db.query(Integration).filter(
        Integration.id == integration_id,
        Integration.is_active == True,
    ).first()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")

    service = IntegrationService(db)
    parsed  = service.parse_gitlab_webhook(payload)
    if not parsed:
        return {"status": "ignored", "reason": "Could not parse payload"}

    logger.info(
        f"GitLab webhook: {parsed.pusher} pushed to "
        f"{parsed.repo_url}@{parsed.branch}"
    )

    return await _process_webhook(parsed, integration, service, db)


@router.post("/webhooks/bitbucket/{integration_id}", tags=["Webhooks"])
async def receive_bitbucket_webhook(
    integration_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Receives Bitbucket push webhooks.
    Configure in Bitbucket: Repository Settings → Webhooks
    URL: http://your-server:8000/api/v1/webhooks/bitbucket/{integration_id}
    Triggers: Repository Push
    """
    payload   = await request.json()
    event_key = request.headers.get("X-Event-Key", "")

    if event_key not in ("repo:push", ""):
        return {"status": "ignored", "reason": f"Event '{event_key}' not handled"}

    integration = db.query(Integration).filter(
        Integration.id == integration_id,
        Integration.is_active == True,
    ).first()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")

    service = IntegrationService(db)
    parsed  = service.parse_bitbucket_webhook(payload)
    if not parsed:
        return {"status": "ignored", "reason": "Could not parse payload"}

    logger.info(
        f"Bitbucket webhook: {parsed.pusher} pushed to "
        f"{parsed.repo_url}@{parsed.branch}"
    )

    return await _process_webhook(parsed, integration, service, db)


@router.post("/webhooks/azure/{integration_id}", tags=["Webhooks"])
async def receive_azure_webhook(
    integration_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Receives Azure DevOps push webhooks.
    Configure in Azure: Project Settings → Service Hooks → Add subscription
    Service: Web Hooks → Trigger: Code pushed
    URL: http://your-server:8000/api/v1/webhooks/azure/{integration_id}
    """
    payload = await request.json()

    integration = db.query(Integration).filter(
        Integration.id == integration_id,
        Integration.is_active == True,
    ).first()
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")

    service = IntegrationService(db)
    parsed  = service.parse_azure_webhook(payload)
    if not parsed:
        return {"status": "ignored", "reason": "Not a push event or could not parse"}

    logger.info(
        f"Azure DevOps webhook: {parsed.pusher} pushed to "
        f"{parsed.repo_url}@{parsed.branch}"
    )

    return await _process_webhook(parsed, integration, service, db)


# ── Shared webhook processing ─────────────────────────────────────

async def _process_webhook(
    parsed,
    integration: Integration,
    service: IntegrationService,
    db: Session,
) -> dict:
    """
    Shared logic for all webhook handlers.
    Finds the matching pipeline and triggers a run.
    """
    # Find matching pipeline for this org
    pipeline = service.find_matching_pipeline(
        parsed, org_id=integration.organization_id
    )

    if not pipeline:
        logger.info(
            f"No pipeline matched for "
            f"{parsed.repo_url}@{parsed.branch} "
            f"in org={integration.organization_id}"
        )
        return {
            "status": "ignored",
            "reason": (
                f"No pipeline configured for "
                f"{parsed.repo_url} (branch: {parsed.branch})"
            ),
        }

    # Record the trigger
    service.record_trigger(integration)

    # Trigger the pipeline
    pipeline_service = PipelineService(db)
    run = pipeline_service.execute_pipeline(
        pipeline,
        triggered_by=f"{parsed.platform}:{parsed.pusher}",
    )

    # Update run with real commit info
    if parsed.commit_hash:
        run.git_commit = parsed.commit_hash
    if parsed.pusher:
        run.git_author = parsed.pusher
    db.commit()

    logger.info(
        f"Webhook triggered pipeline '{pipeline.name}' → "
        f"run={run.id} status={run.status}"
    )

    return {
        "status":    "triggered",
        "platform":  parsed.platform,
        "pipeline":  pipeline.name,
        "run_id":    run.id,
        "branch":    parsed.branch,
        "commit":    parsed.commit_hash,
        "result":    run.status.value,
    }