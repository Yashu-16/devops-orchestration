# healing_agent.py
# AI-powered healing agent — Phase 1
#
# When a pipeline fails with P1 or P2 priority:
# 1. Reads the actual error logs and root cause
# 2. Fetches relevant source files from GitHub (if connected)
# 3. Calls Claude API to diagnose the error
# 4. Generates a specific, actionable fix
# 5. Stores the analysis in the HealingLog
#
# The fix is shown in the Healing tab — one click to apply (Phase 2)

import logging
import json
import re
import requests
from typing import Optional
from sqlalchemy.orm import Session

from app.models.pipeline import (
    Pipeline, PipelineRun, HealingLog, Integration
)

logger = logging.getLogger(__name__)

CLAUDE_API_URL = "https://api.anthropic.com/v1/messages"
CLAUDE_MODEL   = "claude-sonnet-4-20250514"

# Priority levels that trigger the agent
AGENT_PRIORITIES = {"P1", "P2"}

# Failure categories the agent can realistically fix
FIXABLE_CATEGORIES = {
    "dependency",
    "dependency_error",
    "test_failure",
    "config_error",
    "timeout",
    "infrastructure",
    "unknown",
}


class HealingAgent:
    """
    AI agent that analyses pipeline failures and proposes specific fixes.
    Uses Claude to read error logs and source code, then generates
    a human-readable diagnosis and a concrete code fix.
    """

    def __init__(self, db: Session):
        self.db = db

    def analyse_and_propose_fix(
        self,
        run: PipelineRun,
        healing_log: HealingLog,
        priority: str = "P1",
    ) -> Optional[dict]:
        """
        Main entry point. Called after a failed run is classified.
        Returns a dict with diagnosis and proposed fix, or None if skipped.
        """
        if priority not in AGENT_PRIORITIES:
            logger.info(f"Agent skipping run {run.id} — priority {priority} below threshold")
            return None

        failure_category = self._extract_category(run.root_cause)

        logger.info(
            f"AI Healing Agent activated: run={run.id} | "
            f"priority={priority} | category={failure_category}"
        )

        # Build context for Claude
        error_context = self._build_error_context(run)

        # Fetch source files from GitHub if connected
        source_context = self._fetch_source_context(run)

        # Call Claude API
        analysis = self._call_claude(
            error_context=error_context,
            source_context=source_context,
            priority=priority,
            failure_category=failure_category,
        )

        if not analysis:
            return None

        # Store analysis in the healing log
        self._store_analysis(healing_log, analysis)

        logger.info(
            f"Agent analysis complete for run {run.id}: "
            f"confidence={analysis.get('confidence', 'unknown')}"
        )

        return analysis

    def _build_error_context(self, run: PipelineRun) -> str:
        """Builds a clear error context string from the run data."""
        parts = []

        parts.append(f"Pipeline: {run.pipeline_id}")
        parts.append(f"Failed Stage: {run.failed_stage or 'unknown'}")
        parts.append(f"Environment: {run.environment}")

        if run.root_cause:
            parts.append(f"Root Cause: {run.root_cause}")

        if run.error_message:
            parts.append(f"Error Message:\n{run.error_message[:2000]}")

        if run.logs:
            # Get last 100 lines of logs where the error usually appears
            log_lines = run.logs.strip().split('\n')
            relevant_logs = '\n'.join(log_lines[-100:])
            parts.append(f"Last 100 log lines:\n{relevant_logs[:3000]}")

        # Add stage logs if available
        if run.stage_logs:
            for stage in run.stage_logs:
                if stage.status == 'failed' and stage.logs:
                    parts.append(
                        f"Stage '{stage.name}' error:\n{stage.logs[:500]}"
                    )

        return '\n\n'.join(parts)

    def _fetch_source_context(self, run: PipelineRun) -> str:
        """
        Fetches relevant source files from GitHub if an integration exists.
        Only fetches files likely related to the failure.
        """
        pipeline = self.db.query(Pipeline).filter(
            Pipeline.id == run.pipeline_id
        ).first()

        if not pipeline or not pipeline.repository:
            return ""

        # Look for a GitHub integration with an access token
        integration = self.db.query(Integration).filter(
            Integration.organization_id == pipeline.organization_id,
            Integration.platform == "github",
            Integration.is_active == True,
        ).first()

        if not integration or not integration.access_token:
            return ""

        try:
            # Extract owner/repo from repository URL
            # e.g. https://github.com/Yashu-16/DevOps-testing.git
            match = re.search(r'github\.com[/:](.+?)(?:\.git)?$', pipeline.repository)
            if not match:
                return ""

            repo_path = match.group(1)
            headers = {
                "Authorization": f"token {integration.access_token}",
                "Accept": "application/vnd.github.v3+json",
            }

            # Decide which files to fetch based on failure category
            files_to_fetch = self._decide_files_to_fetch(run)
            source_parts = []

            for filepath in files_to_fetch[:5]:  # max 5 files
                url = f"https://api.github.com/repos/{repo_path}/contents/{filepath}"
                resp = requests.get(url, headers=headers, timeout=10)
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get('encoding') == 'base64':
                        import base64
                        content = base64.b64decode(data['content']).decode('utf-8', errors='replace')
                        source_parts.append(f"File: {filepath}\n```\n{content[:2000]}\n```")

            return '\n\n'.join(source_parts)

        except Exception as e:
            logger.warning(f"Could not fetch source context: {e}")
            return ""

    def _decide_files_to_fetch(self, run: PipelineRun) -> list:
        """Decides which source files to fetch based on the failure."""
        category = self._extract_category(run.root_cause)
        stage = run.failed_stage or ""

        files = []

        if category in ("dependency", "dependency_error"):
            files = ["requirements.txt", "package.json", "Pipfile", "pyproject.toml"]
        elif category == "config_error":
            files = [".env.example", "config.py", "settings.py", "docker-compose.yml"]
        elif category == "test_failure":
            # Try to get the specific test file from the error
            if run.error_message:
                match = re.search(r'(test_\w+\.py|spec/\w+)', run.error_message)
                if match:
                    files = [match.group(1)]
            files = files or ["tests/", "test_app.py", "pytest.ini"]
        elif "install" in stage.lower():
            files = ["requirements.txt", "package.json"]
        elif "lint" in stage.lower():
            files = [".flake8", ".eslintrc", "pyproject.toml"]
        else:
            files = ["requirements.txt", "package.json", "Dockerfile"]

        return files

    def _call_claude(
        self,
        error_context: str,
        source_context: str,
        priority: str,
        failure_category: str,
    ) -> Optional[dict]:
        """Calls Claude API to analyse the error and propose a fix."""
        import os
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")

        if not api_key:
            logger.warning("ANTHROPIC_API_KEY not set — agent skipped")
            return None

        system_prompt = """You are an expert DevOps AI agent. Your job is to analyse CI/CD pipeline failures and propose specific, actionable fixes.

You will be given:
- The error logs from a failed pipeline run
- The priority level (P1 = critical, P2 = important)
- The failure category
- Relevant source code files (if available)

You must respond with a JSON object only — no markdown, no explanation outside the JSON.

The JSON must have exactly these fields:
{
  "summary": "One sentence: what went wrong",
  "root_cause_detail": "2-3 sentences: exactly why this failed",
  "proposed_fix": "The specific fix — exact code or command to run",
  "fix_type": "code_change | config_change | command | dependency_update",
  "affected_file": "The file that needs to change (or null)",
  "fix_code": "The exact code/content to put in the file (or null if not a code fix)",
  "confidence": "high | medium | low",
  "estimated_fix_time": "2 min | 5 min | 15 min | 30 min",
  "can_auto_apply": true or false,
  "explanation_for_engineer": "Plain English explanation any engineer can understand"
}

Rules:
- Be specific. Never say 'check your configuration'. Say exactly what to change.
- If you can see the source file, reference the exact line number.
- can_auto_apply is true only for dependency additions and simple config changes.
- If you cannot determine the fix with confidence, set confidence to 'low' and explain why."""

        user_message = f"""Pipeline failure analysis request.

Priority: {priority}
Failure Category: {failure_category}

ERROR CONTEXT:
{error_context}

{"SOURCE CODE:" if source_context else ""}
{source_context}

Analyse this failure and provide a specific fix."""

        try:
            response = requests.post(
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
                    "messages": [
                        {"role": "user", "content": user_message}
                    ],
                },
                timeout=30,
            )

            if response.status_code != 200:
                logger.error(f"Claude API error: {response.status_code} — {response.text[:200]}")
                return None

            data = response.json()
            content = data.get("content", [{}])[0].get("text", "")

            # Parse JSON response
            # Strip any accidental markdown fences
            content = re.sub(r'```json\s*|\s*```', '', content).strip()
            analysis = json.loads(content)

            return analysis

        except json.JSONDecodeError as e:
            logger.error(f"Claude returned invalid JSON: {e}")
            return None
        except Exception as e:
            logger.error(f"Claude API call failed: {e}")
            return None

    def _store_analysis(self, healing_log: HealingLog, analysis: dict) -> None:
        """Stores the agent's analysis in the healing log."""
        try:
            healing_log.agent_summary         = analysis.get("summary", "")
            healing_log.agent_root_cause       = analysis.get("root_cause_detail", "")
            healing_log.agent_proposed_fix     = analysis.get("proposed_fix", "")
            healing_log.agent_fix_type         = analysis.get("fix_type", "")
            healing_log.agent_affected_file    = analysis.get("affected_file", "")
            healing_log.agent_fix_code         = analysis.get("fix_code", "")
            healing_log.agent_confidence       = analysis.get("confidence", "low")
            healing_log.agent_fix_time         = analysis.get("estimated_fix_time", "")
            healing_log.agent_can_auto_apply   = analysis.get("can_auto_apply", False)
            healing_log.agent_explanation      = analysis.get("explanation_for_engineer", "")
            healing_log.agent_analysed         = True

            self.db.commit()
        except Exception as e:
            logger.error(f"Failed to store agent analysis: {e}")
            self.db.rollback()

    def _extract_category(self, root_cause: str) -> str:
        """Parses '[CATEGORY] explanation' format."""
        if not root_cause:
            return "unknown"
        if root_cause.startswith("[") and "]" in root_cause:
            return root_cause[1:root_cause.index("]")].lower()
        return "unknown"