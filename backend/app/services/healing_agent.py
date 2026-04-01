# healing_agent.py
# AI Healing Agent — reads pipeline errors and proposes exact fixes using Claude AI

import os
import logging
import json
import re
import base64
import requests
from typing import Optional
from sqlalchemy.orm import Session

from app.models.pipeline import Pipeline, PipelineRun, HealingLog, Integration

logger = logging.getLogger(__name__)

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL   = "claude-sonnet-4-20250514"


class HealingAgent:
    """
    AI agent that reads a failed pipeline run, understands what went wrong,
    and proposes a specific fix. Results are shown in the Healing tab.
    """

    def __init__(self, db: Session):
        self.db = db

    def run(self, run: PipelineRun, healing_log: HealingLog) -> bool:
        """
        Main entry point.
        Returns True if analysis was completed, False if skipped.
        """
        # Check API key first — fail fast with clear log message
        api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            logger.warning(
                f"[AI Agent] Skipped run {run.id} — "
                f"ANTHROPIC_API_KEY not set in Railway Variables"
            )
            return False

        failure_category = self._get_category(run.root_cause)
        logger.info(
            f"[AI Agent] Starting analysis: run={run.id} | "
            f"stage={run.failed_stage} | category={failure_category}"
        )

        # Step 1: Build error context from the run
        error_context = self._build_error_context(run)

        # Step 2: Try to fetch relevant source files from GitHub
        source_context = self._fetch_github_files(run)
        if source_context:
            logger.info(f"[AI Agent] Fetched source files from GitHub for run {run.id}")
        else:
            logger.info(f"[AI Agent] No GitHub files fetched for run {run.id}")

        # Step 3: Call Claude API
        logger.info(f"[AI Agent] Calling Claude API for run {run.id}...")
        analysis = self._call_claude(api_key, error_context, source_context, failure_category)

        if not analysis:
            logger.error(f"[AI Agent] No analysis returned for run {run.id}")
            return False

        # Step 4: Save to healing log
        self._save(healing_log, analysis)
        logger.info(
            f"[AI Agent] Done for run {run.id} — "
            f"confidence={analysis.get('confidence')} | "
            f"fix_type={analysis.get('fix_type')}"
        )
        return True

    def _build_error_context(self, run: PipelineRun) -> str:
        parts = []
        parts.append(f"Failed stage: {run.failed_stage or 'unknown'}")
        parts.append(f"Environment: {run.environment or 'unknown'}")

        if run.root_cause:
            parts.append(f"Root cause classification: {run.root_cause}")

        if run.error_message:
            parts.append(f"Error message:\n{run.error_message[:2000]}")

        if run.logs:
            lines = run.logs.strip().split('\n')
            relevant = '\n'.join(lines[-80:])
            parts.append(f"Pipeline logs (last 80 lines):\n{relevant[:3000]}")

        if run.stage_logs:
            for stage in run.stage_logs:
                if hasattr(stage, 'passed') and not stage.passed:
                    stage_log = getattr(stage, 'logs', None) or getattr(stage, 'error_message', None)
                    if stage_log:
                        parts.append(f"Stage '{stage.name}' output:\n{str(stage_log)[:500]}")

        return '\n\n'.join(parts)

    def _fetch_github_files(self, run: PipelineRun) -> str:
        pipeline = self.db.query(Pipeline).filter(
            Pipeline.id == run.pipeline_id
        ).first()

        if not pipeline or not pipeline.repository:
            return ""

        integration = self.db.query(Integration).filter(
            Integration.organization_id == pipeline.organization_id,
            Integration.platform == "github",
            Integration.is_active == True,
        ).first()

        if not integration or not integration.access_token:
            return ""

        match = re.search(r'github\.com[/:](.+?)(?:\.git)?$', pipeline.repository)
        if not match:
            return ""

        repo_path = match.group(1)
        headers = {
            "Authorization": f"token {integration.access_token}",
            "Accept": "application/vnd.github.v3+json",
        }

        files_to_fetch = self._pick_files(run)
        fetched = []

        for filepath in files_to_fetch[:4]:
            try:
                url = f"https://api.github.com/repos/{repo_path}/contents/{filepath}"
                resp = requests.get(url, headers=headers, timeout=8)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get('encoding') == 'base64':
                        content = base64.b64decode(data['content']).decode('utf-8', errors='replace')
                        fetched.append(f"=== {filepath} ===\n{content[:1500]}")
            except Exception as e:
                logger.warning(f"[AI Agent] Could not fetch {filepath}: {e}")

        return '\n\n'.join(fetched)

    def _pick_files(self, run: PipelineRun) -> list:
        category = self._get_category(run.root_cause)
        stage    = (run.failed_stage or "").lower()

        if category in ("dependency", "dependency_error") or "install" in stage:
            return ["requirements.txt", "package.json", "Pipfile"]
        elif category == "test_failure" or "test" in stage:
            return ["test_app.py", "tests/test_app.py", "pytest.ini", "requirements.txt"]
        elif category == "config_error":
            return ["config.py", "settings.py", ".env.example"]
        elif "lint" in stage or "build" in stage:
            return ["requirements.txt", "package.json", "Dockerfile"]
        else:
            return ["requirements.txt", "package.json"]

    def _call_claude(self, api_key, error_context, source_context, failure_category):
        system_prompt = """You are an expert DevOps engineer helping a team fix a CI/CD pipeline failure.

Your job:
1. Read the error logs carefully
2. Identify the exact root cause
3. Provide a specific, actionable fix

Respond with ONLY a JSON object — no text before or after it, no markdown code blocks.

JSON fields required:
{
  "what_went_wrong": "One clear sentence explaining what failed and why",
  "why_it_happened": "2-3 sentences explaining the technical root cause in plain English",
  "how_to_fix": "Step-by-step instructions to fix this — be specific, not generic",
  "fix_type": "one of: add_dependency | fix_code | fix_config | run_command | manual_review",
  "affected_file": "exact filename that needs to change, or null",
  "exact_fix": "the exact code, command, or content change needed — copy-paste ready, or null",
  "confidence": "one of: high | medium | low",
  "time_to_fix": "one of: 2 minutes | 5 minutes | 15 minutes | 30+ minutes",
  "can_auto_fix": true if this is a simple dependency or config fix, false otherwise
}

Be specific. If you see 'ModuleNotFoundError: No module named requests', say exactly:
- affected_file: requirements.txt
- exact_fix: requests==2.31.0
- how_to_fix: Add 'requests==2.31.0' to requirements.txt and push the change

Never say 'check your configuration' or 'review your code'. Always say exactly what to change."""

        source_section = f"\n\nSOURCE FILES FROM GITHUB:\n{source_context}" if source_context else ""

        user_message = f"""Please analyse this pipeline failure.

FAILURE CATEGORY: {failure_category}

ERROR DETAILS:
{error_context}{source_section}

Provide your analysis as a JSON object."""

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
                    "max_tokens": 1024,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_message}],
                },
                timeout=30,
            )

            if resp.status_code != 200:
                logger.error(f"[AI Agent] Claude API error {resp.status_code}: {resp.text[:300]}")
                return None

            raw = resp.json().get("content", [{}])[0].get("text", "")
            raw = re.sub(r'^```(?:json)?\s*', '', raw.strip())
            raw = re.sub(r'\s*```$', '', raw.strip())
            return json.loads(raw)

        except json.JSONDecodeError as e:
            logger.error(f"[AI Agent] Invalid JSON from Claude: {e}")
            return None
        except requests.Timeout:
            logger.error(f"[AI Agent] Claude API timed out after 30s")
            return None
        except Exception as e:
            logger.error(f"[AI Agent] Unexpected error: {e}")
            return None

    def _save(self, healing_log: HealingLog, analysis: dict) -> None:
        try:
            healing_log.agent_analysed       = True
            healing_log.agent_summary        = analysis.get("what_went_wrong", "")
            healing_log.agent_root_cause     = analysis.get("why_it_happened", "")
            healing_log.agent_proposed_fix   = analysis.get("how_to_fix", "")
            healing_log.agent_fix_type       = analysis.get("fix_type", "")
            healing_log.agent_affected_file  = analysis.get("affected_file") or ""
            healing_log.agent_fix_code       = analysis.get("exact_fix") or ""
            healing_log.agent_confidence     = analysis.get("confidence", "low")
            healing_log.agent_fix_time       = analysis.get("time_to_fix", "")
            healing_log.agent_can_auto_apply = analysis.get("can_auto_fix", False)
            healing_log.agent_explanation    = analysis.get("how_to_fix", "")
            self.db.commit()
        except Exception as e:
            logger.error(f"[AI Agent] Failed to save: {e}")
            self.db.rollback()

    def _get_category(self, root_cause: str) -> str:
        if not root_cause:
            return "unknown"
        if root_cause.startswith("[") and "]" in root_cause:
            return root_cause[1:root_cause.index("]")].lower()
        return "unknown"