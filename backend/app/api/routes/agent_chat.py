# agent_chat.py
# POST /api/v1/pipelines/{id}/agent/chat
# Receives a message + conversation history from the frontend
# Fetches full pipeline context from DB
# Calls Claude API using the server-side ANTHROPIC_API_KEY
# Returns the agent response

import os
import logging
import json
import requests
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.database import get_db
from app.models.pipeline import (
    Pipeline, PipelineRun, HealingLog, PipelineStatus, User, PipelineMember
)
from app.core.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL   = "claude-sonnet-4-20250514"


class ChatMessage(BaseModel):
    role: str    # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []


def get_pipeline_or_404(pipeline_id: int, db: Session, current_user: User) -> Pipeline:
    pipeline = db.query(Pipeline).filter(
        Pipeline.id == pipeline_id,
        Pipeline.organization_id == current_user.organization_id,
    ).first()
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    if current_user.role == "member":
        assigned = db.query(PipelineMember).filter(
            PipelineMember.pipeline_id == pipeline_id,
            PipelineMember.user_id == current_user.id,
        ).first()
        if not assigned:
            raise HTTPException(status_code=403, detail="Access denied")
    return pipeline


def build_pipeline_context(pipeline_id: int, db: Session) -> str:
    """Build rich context string from all pipeline data in the database."""
    lines = []

    # ── Pipeline overview ──────────────────────────────────
    pipeline = db.query(Pipeline).filter(Pipeline.id == pipeline_id).first()
    if not pipeline:
        return "Pipeline not found."

    runs = db.query(PipelineRun).filter(
        PipelineRun.pipeline_id == pipeline_id
    ).order_by(PipelineRun.created_at.desc()).limit(20).all()

    total   = len(runs)
    failed  = sum(1 for r in runs if r.status == PipelineStatus.FAILED)
    success = sum(1 for r in runs if r.status == PipelineStatus.SUCCESS)

    durations = [r.duration_seconds for r in runs if r.duration_seconds]
    avg_dur   = round(sum(durations) / len(durations), 1) if durations else 0

    last_run = runs[0] if runs else None

    lines.append("=== PIPELINE OVERVIEW ===")
    lines.append(f"Name: {pipeline.name}")
    lines.append(f"Repository: {pipeline.repository or 'not set'}")
    lines.append(f"Branch: {pipeline.branch or 'main'}")
    lines.append(f"Last status: {last_run.status.value if last_run else 'never run'}")
    lines.append(f"Total runs: {total}")
    lines.append(f"Success rate: {round(success/total*100, 1) if total else 0}%")
    lines.append(f"Failure rate: {round(failed/total*100, 1) if total else 0}%")
    lines.append(f"Avg duration: {avg_dur}s")
    lines.append(f"Auto-heal: {'ENABLED (max retries: ' + str(pipeline.max_retries) + ')' if pipeline.self_heal_enabled else 'DISABLED'}")

    # ── Recent runs with full error details ────────────────
    if runs:
        lines.append("\n=== RECENT RUNS (last 20) ===")
        for r in runs:
            line = f"Run #{r.id}: {r.status.value.upper()}"
            line += f" | stage: {r.failed_stage or 'all passed'}"
            line += f" | duration: {r.duration_seconds}s"
            line += f" | env: {r.environment}"
            line += f" | triggered: {r.triggered_by}"
            if r.git_commit:
                line += f" | commit: {r.git_commit[:8]}"
            lines.append(line)
            if r.root_cause:
                lines.append(f"  Root cause: {r.root_cause}")
            if r.risk_score is not None:
                lines.append(f"  Risk: {round(r.risk_score * 100)}%")
            if r.recommendation:
                lines.append(f"  Recommendation: {r.recommendation}")

        # Stage-level failure summary
        failed_stages: dict = {}
        for r in runs:
            if r.failed_stage:
                failed_stages[r.failed_stage] = failed_stages.get(r.failed_stage, 0) + 1

        if failed_stages:
            sorted_stages = sorted(failed_stages.items(), key=lambda x: -x[1])
            lines.append(f"\nMost failing stages: {', '.join(f'{s}({c}x)' for s, c in sorted_stages)}")

        # Root cause categories
        categories: dict = {}
        for r in runs:
            if r.root_cause and r.root_cause.startswith("["):
                bracket = r.root_cause.find("]")
                if bracket > 0:
                    cat = r.root_cause[1:bracket].lower()
                    categories[cat] = categories.get(cat, 0) + 1
        if categories:
            sorted_cats = sorted(categories.items(), key=lambda x: -x[1])
            lines.append(f"Failure categories: {', '.join(f'{c}({n}x)' for c, n in sorted_cats)}")

    # ── Healing events with AI analyses ───────────────────
    healing_logs = db.query(HealingLog).filter(
        HealingLog.pipeline_id == pipeline_id
    ).order_by(HealingLog.created_at.desc()).limit(10).all()

    if healing_logs:
        lines.append("\n=== HEALING HISTORY ===")
        healed = sum(1 for h in healing_logs if h.result == "retry_succeeded")
        lines.append(f"Healing success rate: {healed}/{len(healing_logs)}")

        for h in healing_logs:
            action = h.action.value if hasattr(h.action, "value") else h.action
            lines.append(f"Run #{h.run_id}: {action} -> {h.result} | {h.reason}")

            if getattr(h, "agent_analysed", False):
                if getattr(h, "agent_summary", ""):
                    lines.append(f"  AI diagnosis: {h.agent_summary}")
                if getattr(h, "agent_root_cause", ""):
                    lines.append(f"  Root cause detail: {h.agent_root_cause}")
                if getattr(h, "agent_proposed_fix", ""):
                    lines.append(f"  Proposed fix: {h.agent_proposed_fix}")
                if getattr(h, "agent_fix_code", ""):
                    lines.append(f"  Fix code: {h.agent_fix_code}")
                if getattr(h, "agent_affected_file", ""):
                    lines.append(f"  File to change: {h.agent_affected_file}")
                if getattr(h, "agent_confidence", ""):
                    lines.append(f"  Confidence: {h.agent_confidence}")

    return "\n".join(lines)


@router.post("/pipelines/{pipeline_id}/agent/chat", tags=["AI Agent"])
def agent_chat(
    pipeline_id: int,
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Chat with the AI agent about a specific pipeline.
    Uses server-side ANTHROPIC_API_KEY — frontend needs no API key.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI Agent not configured. Add ANTHROPIC_API_KEY to Railway backend Variables."
        )

    pipeline = get_pipeline_or_404(pipeline_id, db, current_user)

    # Build full context from database
    context = build_pipeline_context(pipeline_id, db)

    system_prompt = f"""You are an intelligent AI DevOps agent exclusively for the pipeline "{pipeline.name}" (Pipeline ID: {pipeline_id}).

You have complete, real-time knowledge of this pipeline pulled directly from the database:

{context}

YOUR CAPABILITIES:
1. Answer any question about this pipeline specifically — failures, errors, patterns, risk scores
2. When asked to fix an error, provide the EXACT file name and code change needed
3. Identify patterns across multiple runs (e.g. "this stage always fails")
4. Explain risk scores in plain English based on the actual factors
5. Suggest preventive actions based on the failure history

YOUR RULES:
- You ONLY help with this specific pipeline — never give generic advice
- Always reference specific run numbers, error messages, and stage names from the context above
- When suggesting a code fix, format it as:
  **File:** filename.py
  ```
  exact code to add/change
  ```
- If the user asks to "fix" something, give them the exact change needed
- Be direct, specific, and actionable
- If you don't have enough information, say exactly what is missing"""

    # Build message history for Claude
    messages = []
    for msg in request.history[-10:]:  # last 10 messages for context
        role = "user" if msg.role == "user" else "assistant"
        messages.append({"role": role, "content": msg.content})

    # Add current message
    messages.append({"role": "user", "content": request.message})

    try:
        resp = requests.post(
            CLAUDE_API_URL,
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": CLAUDE_MODEL,
                "max_tokens": 2048,
                "system": system_prompt,
                "messages": messages,
            },
            timeout=30,
        )

        if resp.status_code != 200:
            err = resp.json().get("error", {})
            raise HTTPException(
                status_code=502,
                detail=f"Claude API error: {err.get('message', resp.text[:200])}"
            )

        data  = resp.json()
        reply = data.get("content", [{}])[0].get("text", "Sorry, no response generated.")

        return {"reply": reply}

    except requests.Timeout:
        raise HTTPException(status_code=504, detail="Claude API timed out. Please try again.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Agent chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")