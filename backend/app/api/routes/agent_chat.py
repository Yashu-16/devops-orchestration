# agent_chat.py
# Autonomous AI Agent chat endpoint
# Each pipeline has its own agent that:
# 1. Knows everything about that specific pipeline
# 2. Can read files from that pipeline's GitHub repo
# 3. Can write fixes directly to GitHub
# 4. Can trigger a new pipeline run
# 5. Has NO access to other pipelines

import os
import re
import json
import base64
import logging
import requests as http_requests
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.database import get_db
from app.models.pipeline import (
    Pipeline, PipelineRun, HealingLog,
    PipelineStatus, User, PipelineMember, Integration
)
from app.core.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL   = "claude-sonnet-4-20250514"


# ── Request / Response models ──────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []


# ── Auth helper ────────────────────────────────────────────────────────────

def get_pipeline_or_404(pipeline_id: int, db: Session, user: User) -> Pipeline:
    p = db.query(Pipeline).filter(
        Pipeline.id == pipeline_id,
        Pipeline.organization_id == user.organization_id,
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Pipeline not found")
    if user.role == "member":
        assigned = db.query(PipelineMember).filter(
            PipelineMember.pipeline_id == pipeline_id,
            PipelineMember.user_id == user.id,
        ).first()
        if not assigned:
            raise HTTPException(status_code=403, detail="Access denied to this pipeline")
    return p


# ── GitHub helpers (scoped to this pipeline's repo only) ──────────────────

def get_github_token(pipeline: Pipeline, db: Session) -> Optional[str]:
    """Get GitHub token for this pipeline's organisation only."""
    integration = db.query(Integration).filter(
        Integration.organization_id == pipeline.organization_id,
        Integration.platform == "github",
        Integration.is_active == True,
    ).first()
    return integration.access_token if integration else None


def get_repo_path(pipeline: Pipeline) -> Optional[str]:
    """Extract owner/repo from the pipeline's repository URL."""
    if not pipeline.repository:
        return None
    match = re.search(r'github\.com[/:](.+?)(?:\.git)?$', pipeline.repository)
    return match.group(1) if match else None


def github_read_file(repo_path: str, filepath: str, token: str) -> Optional[dict]:
    """Read a file from GitHub. Returns {content, sha} or None."""
    url  = f"https://api.github.com/repos/{repo_path}/contents/{filepath}"
    resp = http_requests.get(url, headers={
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }, timeout=10)
    if resp.status_code == 200:
        data = resp.json()
        if data.get("encoding") == "base64":
            content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
            return {"content": content, "sha": data["sha"], "path": filepath}
    return None


def github_write_file(repo_path: str, filepath: str, new_content: str,
                      sha: str, commit_msg: str, token: str) -> bool:
    """Write a file to GitHub with a commit. Returns True if successful."""
    url     = f"https://api.github.com/repos/{repo_path}/contents/{filepath}"
    encoded = base64.b64encode(new_content.encode("utf-8")).decode("utf-8")
    resp = http_requests.put(url, headers={
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
    }, json={
        "message": commit_msg,
        "content": encoded,
        "sha": sha,
    }, timeout=15)
    return resp.status_code in (200, 201)


def github_list_files(repo_path: str, token: str, path: str = "") -> List[str]:
    """List files in a repo directory."""
    url  = f"https://api.github.com/repos/{repo_path}/contents/{path}"
    resp = http_requests.get(url, headers={
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }, timeout=10)
    if resp.status_code == 200:
        items = resp.json()
        if isinstance(items, list):
            return [item["path"] for item in items if item["type"] == "file"]
    return []


# ── Pipeline context builder ───────────────────────────────────────────────

def build_pipeline_context(pipeline: Pipeline, db: Session) -> str:
    """Build rich context from all pipeline data in the database."""
    lines = []

    runs = db.query(PipelineRun).filter(
        PipelineRun.pipeline_id == pipeline.id
    ).order_by(PipelineRun.created_at.desc()).limit(20).all()

    total   = len(runs)
    failed  = sum(1 for r in runs if r.status == PipelineStatus.FAILED)
    success = sum(1 for r in runs if r.status == PipelineStatus.SUCCESS)
    durations = [r.duration_seconds for r in runs if r.duration_seconds]
    avg_dur   = round(sum(durations) / len(durations), 1) if durations else 0
    last_run  = runs[0] if runs else None

    lines.append("=== PIPELINE INFO ===")
    lines.append(f"Name: {pipeline.name}")
    lines.append(f"Repository: {pipeline.repository or 'not set'}")
    lines.append(f"Branch: {pipeline.branch or 'main'}")
    lines.append(f"Last status: {last_run.status.value if last_run else 'never run'}")
    lines.append(f"Total runs: {total} | Success: {success} | Failed: {failed}")
    lines.append(f"Success rate: {round(success/total*100,1) if total else 0}%")
    lines.append(f"Avg duration: {avg_dur}s")
    lines.append(f"Auto-heal: {'ON (max ' + str(pipeline.max_retries) + ' retries)' if pipeline.self_heal_enabled else 'OFF'}")

    if runs:
        lines.append("\n=== RECENT RUNS ===")
        for r in runs[:15]:
            line = f"Run #{r.id}: {r.status.value.upper()}"
            if r.failed_stage:
                line += f" | failed at: {r.failed_stage}"
            line += f" | {r.duration_seconds}s | {r.environment} | {r.triggered_by}"
            if r.git_commit:
                line += f" | commit: {r.git_commit[:8]}"
            lines.append(line)
            if r.root_cause:
                lines.append(f"  Root cause: {r.root_cause}")
            if r.recommendation:
                lines.append(f"  Recommendation: {r.recommendation}")

        # Stage failure patterns
        stage_counts: dict = {}
        for r in runs:
            if r.failed_stage:
                stage_counts[r.failed_stage] = stage_counts.get(r.failed_stage, 0) + 1
        if stage_counts:
            top = sorted(stage_counts.items(), key=lambda x: -x[1])
            lines.append(f"\nMost failing stages: {', '.join(f'{s}({c}x)' for s,c in top)}")

    healing_logs = db.query(HealingLog).filter(
        HealingLog.pipeline_id == pipeline.id
    ).order_by(HealingLog.created_at.desc()).limit(10).all()

    if healing_logs:
        lines.append("\n=== HEALING HISTORY ===")
        healed = sum(1 for h in healing_logs if h.result == "retry_succeeded")
        lines.append(f"Healing: {healed}/{len(healing_logs)} succeeded")
        for h in healing_logs:
            action = h.action.value if hasattr(h.action, "value") else str(h.action)
            lines.append(f"Run #{h.run_id}: {action} -> {h.result}")
            if getattr(h, "agent_analysed", False):
                if getattr(h, "agent_summary", ""):
                    lines.append(f"  AI: {h.agent_summary}")
                if getattr(h, "agent_proposed_fix", ""):
                    lines.append(f"  Fix: {h.agent_proposed_fix}")
                if getattr(h, "agent_fix_code", ""):
                    lines.append(f"  Code: {h.agent_fix_code}")
                if getattr(h, "agent_affected_file", ""):
                    lines.append(f"  File: {h.agent_affected_file}")

    return "\n".join(lines)


# ── Tool execution ─────────────────────────────────────────────────────────

def execute_tool(tool_name: str, tool_input: dict, pipeline: Pipeline,
                 db: Session, token: Optional[str]) -> str:
    """Execute an agent tool and return the result as a string."""
    repo_path = get_repo_path(pipeline)

    if tool_name == "read_file":
        filepath = tool_input.get("filepath", "")
        if not token or not repo_path:
            return "ERROR: No GitHub token configured for this pipeline. Go to Integrations and add a GitHub token."
        result = github_read_file(repo_path, filepath, token)
        if result:
            return f"File: {filepath}\n```\n{result['content']}\n```\nSHA: {result['sha']}"
        return f"ERROR: Could not read {filepath} from {repo_path}"

    elif tool_name == "list_files":
        path = tool_input.get("path", "")
        if not token or not repo_path:
            return "ERROR: No GitHub token configured."
        files = github_list_files(repo_path, token, path)
        if files:
            return f"Files in {repo_path}/{path}:\n" + "\n".join(files)
        return f"No files found in {path}"

    elif tool_name == "write_fix":
        filepath   = tool_input.get("filepath", "")
        new_content= tool_input.get("new_content", "")
        commit_msg = tool_input.get("commit_message", f"fix: automated fix by DecisionOps agent")
        sha        = tool_input.get("sha", "")

        if not token or not repo_path:
            return "ERROR: No GitHub token configured. Go to Integrations and add a GitHub token."
        if not sha:
            # Read current SHA first
            current = github_read_file(repo_path, filepath, token)
            if not current:
                return f"ERROR: Could not read {filepath} to get its SHA before writing."
            sha = current["sha"]

        success = github_write_file(repo_path, filepath, new_content, sha, commit_msg, token)
        if success:
            return f"SUCCESS: Committed fix to {filepath}\nCommit: '{commit_msg}'\nRepo: {repo_path}"
        return f"ERROR: Failed to write {filepath} to GitHub. Check token permissions."

    elif tool_name == "trigger_pipeline":
        try:
            from app.services.pipeline_service import PipelineService
            service = PipelineService(db)
            run     = service.execute_pipeline(pipeline, triggered_by="ai_agent")
            return f"SUCCESS: Triggered new pipeline run #{run.id} for '{pipeline.name}'"
        except Exception as e:
            return f"ERROR: Could not trigger pipeline: {str(e)}"

    elif tool_name == "get_run_details":
        run_id = tool_input.get("run_id")
        run = db.query(PipelineRun).filter(
            PipelineRun.id == run_id,
            PipelineRun.pipeline_id == pipeline.id,
        ).first()
        if not run:
            return f"ERROR: Run #{run_id} not found for this pipeline."
        result = [
            f"Run #{run.id}: {run.status.value}",
            f"Stage failed: {run.failed_stage or 'none'}",
            f"Root cause: {run.root_cause or 'none'}",
            f"Duration: {run.duration_seconds}s",
            f"Triggered by: {run.triggered_by}",
        ]
        if run.logs:
            log_lines = run.logs.strip().split("\n")
            result.append(f"Last 50 log lines:\n" + "\n".join(log_lines[-50:]))
        return "\n".join(result)

    return f"ERROR: Unknown tool {tool_name}"


# ── Main chat endpoint ─────────────────────────────────────────────────────

@router.post("/pipelines/{pipeline_id}/agent/chat", tags=["AI Agent"])
def agent_chat(
    pipeline_id: int,
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Autonomous AI Agent for a specific pipeline.
    Can read code, write fixes to GitHub, and trigger pipeline runs.
    Each pipeline agent only has access to that pipeline's repository.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="AI Agent not configured. Add ANTHROPIC_API_KEY to Railway backend Variables."
        )

    pipeline  = get_pipeline_or_404(pipeline_id, db, current_user)
    token     = get_github_token(pipeline, db)
    repo_path = get_repo_path(pipeline)
    context   = build_pipeline_context(pipeline, db)

    github_status = "connected" if token and repo_path else "not connected (Go to Integrations to add GitHub token)"

    system_prompt = f"""You are an autonomous AI DevOps agent exclusively for the pipeline "{pipeline.name}" (ID: {pipeline_id}).

PIPELINE CONTEXT:
{context}

GITHUB STATUS: {github_status}
REPO: {repo_path or 'not set'}

YOU CAN:
1. Read files from this pipeline's GitHub repo
2. Write code fixes directly to GitHub
3. Trigger a new pipeline run
4. Explain errors and failures in plain English

YOU CANNOT:
- Access any other pipeline's data or repo
- Make changes outside this specific repo

AVAILABLE TOOLS:
- read_file: Read a file from the repo
- list_files: List files in a directory
- write_fix: Write a fixed file back to GitHub (creates a commit)
- trigger_pipeline: Start a new pipeline run
- get_run_details: Get full details of a specific run including logs

HOW TO FIX ERRORS:
1. Read the error from context above
2. Use read_file to see the failing file
3. Use write_fix to commit the fix
4. Use trigger_pipeline to re-run
5. Tell the user exactly what you changed

FORMAT TOOL CALLS AS JSON:
<tool>
{{"name": "read_file", "input": {{"filepath": "requirements.txt"}}}}
</tool>

<tool>
{{"name": "write_fix", "input": {{"filepath": "requirements.txt", "new_content": "requests==2.31.0\\nfastapi==0.104.0", "commit_message": "fix: add missing requests package"}}}}
</tool>

<tool>
{{"name": "trigger_pipeline", "input": {{}}}}
</tool>

Be direct and take action. If the user says "fix the error", read the relevant file, write the fix, trigger the pipeline, and report what you did."""

    # Build message history
    messages = []
    for msg in request.history[-12:]:
        role = "user" if msg.role == "user" else "assistant"
        messages.append({"role": role, "content": msg.content})
    messages.append({"role": "user", "content": request.message})

    # Agentic loop — allow up to 5 tool call rounds
    MAX_ROUNDS  = 5
    full_reply  = ""
    tool_results = []

    for round_num in range(MAX_ROUNDS):
        payload = {
            "model":      CLAUDE_MODEL,
            "max_tokens": 2048,
            "system":     system_prompt,
            "messages":   messages,
        }

        try:
            resp = http_requests.post(
                CLAUDE_API_URL,
                headers={
                    "Content-Type":    "application/json",
                    "x-api-key":       api_key,
                    "anthropic-version": "2023-06-01",
                },
                json=payload,
                timeout=40,
            )

            if resp.status_code != 200:
                err = resp.json().get("error", {})
                raise HTTPException(
                    status_code=502,
                    detail=f"Claude API error: {err.get('message', resp.text[:200])}"
                )

            data    = resp.json()
            content = data.get("content", [])
            text    = " ".join(
                block.get("text", "") for block in content if block.get("type") == "text"
            )

            # Parse tool calls from the response
            tool_matches = re.findall(
                r'<tool>\s*(\{.*?\})\s*</tool>',
                text, re.DOTALL
            )

            if not tool_matches:
                # No tool calls — final response
                full_reply = text
                break

            # Execute each tool
            messages.append({"role": "assistant", "content": text})
            tool_output_parts = []

            for tool_json in tool_matches:
                try:
                    tool_call  = json.loads(tool_json)
                    tool_name  = tool_call.get("name", "")
                    tool_input = tool_call.get("input", {})
                    logger.info(f"Agent executing tool: {tool_name} for pipeline {pipeline_id}")
                    result = execute_tool(tool_name, tool_input, pipeline, db, token)
                    tool_output_parts.append(f"Tool: {tool_name}\nResult: {result}")
                    tool_results.append({"tool": tool_name, "result": result[:200]})
                except json.JSONDecodeError as e:
                    tool_output_parts.append(f"Tool parse error: {e}")

            # Feed tool results back to Claude
            tool_output = "\n\n---\n\n".join(tool_output_parts)
            messages.append({
                "role":    "user",
                "content": f"Tool results:\n\n{tool_output}\n\nContinue based on these results."
            })

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Agent chat error (round {round_num}): {e}")
            raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")

    if not full_reply:
        full_reply = "I completed all the actions. Check the pipeline runs for results."

    return {
        "reply":       full_reply,
        "tools_used":  tool_results,
        "pipeline_id": pipeline_id,
    }