# healing_engine.py
# Self-Healing Engine — Phase 7 core feature.
#
# Decides what to do after a pipeline failure:
#   RETRY    → run the pipeline again automatically
#   ROLLBACK → signal that a rollback is needed
#   ALERT    → log and notify (no automatic action)
#   SKIPPED  → healing disabled or not applicable
#
# Key design decisions:
# 1. NOT all failures should be retried
#    - Lint failures: fix the code, don't retry blindly
#    - Infrastructure failures: retry makes sense (transient)
#    - Test failures: retry once (might be flaky), then stop
#
# 2. There is always a retry LIMIT
#    - Infinite retries = infinite cost and hidden problems
#    - Default: max 2 retries before escalating
#
# 3. Everything is logged
#    - Engineers must be able to see what the system did
#    - "Auto-healed" is not the same as "actually fixed"

import logging
from dataclasses import dataclass
from typing import Optional
from sqlalchemy.orm import Session
from app.models.pipeline import (
    Pipeline, PipelineRun, HealingLog,
    HealingAction, PipelineStatus
)

logger = logging.getLogger(__name__)


# ── Which failure categories are safe to auto-retry ──────────────
# Infrastructure and unknown failures are often transient.
# Code failures (test, lint, build) should NOT be blindly retried
# — they need a human to fix the underlying issue.

RETRYABLE_CATEGORIES = {
    "infrastructure",   # Connection timeouts, service unavailable
    "unknown",          # We're not sure — one retry is safe
    "source_control",   # Git clone failures are often transient
}

NON_RETRYABLE_CATEGORIES = {
    "test_failure",     # Tests fail for a reason — fix the code
    "build_failure",    # Build errors need a code fix
    "code_quality",     # Lint errors need a code fix
    "deployment",       # Deployment failures need investigation
    "authentication",   # Auth failures need secret rotation
    "dependency",       # Dependency conflicts need manual resolution
}


@dataclass
class HealingDecision:
    """The result of the healing engine's decision."""
    action: HealingAction
    reason: str
    should_retry: bool
    retry_number: int


class SelfHealingEngine:
    """
    Evaluates a failed pipeline run and decides what to do.
    If auto-heal is enabled, it executes the decision.
    If manual mode, it only logs what it WOULD have done.
    """

    def __init__(self, db: Session):
        self.db = db

    def evaluate_and_heal(self, run: PipelineRun) -> Optional[HealingLog]:
        """
        Main entry point.
        Called automatically after every failed run.
        Returns the HealingLog record created, or None.
        """
        if run.status != PipelineStatus.FAILED:
            return None

        pipeline = self.db.query(Pipeline).filter(
            Pipeline.id == run.pipeline_id
        ).first()
        if not pipeline:
            return None

        logger.info(
            f"Self-healing evaluation: run={run.id} | "
            f"pipeline={pipeline.name} | "
            f"auto_heal={pipeline.self_heal_enabled}"
        )

        # Make the decision
        decision = self._decide(run, pipeline)

        # Log the decision regardless of mode
        healing_log = self._create_log(run, pipeline, decision)

        # Only execute if auto-heal is enabled
        if pipeline.self_heal_enabled and decision.should_retry:
            self._execute_retry(run, pipeline, healing_log)
        elif not pipeline.self_heal_enabled:
            healing_log.result = "manual_mode"
            healing_log.reason += (
                " [AUTO-HEAL IS OFF — enable it to automate this action]"
            )
            self.db.commit()
            logger.info(
                f"Auto-heal is OFF for pipeline {pipeline.id}. "
                f"Would have taken action: {decision.action.value}"
            )

        return healing_log

    def _decide(
        self, run: PipelineRun, pipeline: Pipeline
    ) -> HealingDecision:
        """
        The decision logic.
        Determines the best healing action based on:
        - failure category
        - retry history
        - pipeline configuration
        """
        failure_category = self._extract_category(run.root_cause)

        # Count how many retries have already been attempted
        retry_count = self._count_retries(run, pipeline)

        # Decision 1: Over retry limit
        if retry_count >= pipeline.max_retries:
            return HealingDecision(
                action=HealingAction.ROLLBACK,
                reason=(
                    f"Retry limit reached ({retry_count}/{pipeline.max_retries}). "
                    f"Escalating to rollback signal. "
                    f"Manual intervention required."
                ),
                should_retry=False,
                retry_number=retry_count,
            )

        # Decision 2: Non-retryable failure category
        if failure_category in NON_RETRYABLE_CATEGORIES:
            return HealingDecision(
                action=HealingAction.ALERT,
                reason=(
                    f"Failure category '{failure_category}' requires "
                    f"a code fix — auto-retry would not resolve this. "
                    f"Check the recommendations panel for fix steps."
                ),
                should_retry=False,
                retry_number=retry_count,
            )

        # Decision 3: Retryable failure — go for it
        if failure_category in RETRYABLE_CATEGORIES:
            return HealingDecision(
                action=HealingAction.RETRY,
                reason=(
                    f"Failure category '{failure_category}' is likely "
                    f"transient. Attempting retry "
                    f"{retry_count + 1}/{pipeline.max_retries}."
                ),
                should_retry=True,
                retry_number=retry_count + 1,
            )

        # Decision 4: Unknown category — one retry, then alert
        if retry_count == 0:
            return HealingDecision(
                action=HealingAction.RETRY,
                reason=(
                    f"Unknown failure pattern. "
                    f"Attempting one retry to check if transient. "
                    f"Retry {retry_count + 1}/{pipeline.max_retries}."
                ),
                should_retry=True,
                retry_number=retry_count + 1,
            )

        return HealingDecision(
            action=HealingAction.ALERT,
            reason=(
                f"Previous retry did not resolve the issue. "
                f"Manual investigation required."
            ),
            should_retry=False,
            retry_number=retry_count,
        )

    def _execute_retry(
        self,
        run: PipelineRun,
        pipeline: Pipeline,
        healing_log: HealingLog,
    ) -> None:
        """
        Executes a retry by triggering a new pipeline run.
        The new run is marked as a retry so we can track lineage.
        """
        from app.services.pipeline_service import PipelineService

        logger.info(
            f"AUTO-HEALING: Retrying pipeline {pipeline.name} "
            f"(retry #{healing_log.retry_number})"
        )

        try:
            service     = PipelineService(self.db)
            new_run     = service.execute_pipeline(
                pipeline,
                triggered_by=f"auto_heal_retry_{healing_log.retry_number}"
            )

            # Mark the new run as a retry
            new_run.is_retry      = True
            new_run.retry_count   = healing_log.retry_number
            new_run.parent_run_id = run.id
            self.db.commit()

            # Update the healing log with the result
            healing_log.new_run_id = new_run.id
            healing_log.result     = (
                "retry_succeeded"
                if new_run.status == PipelineStatus.SUCCESS
                else "retry_failed"
            )
            self.db.commit()

            logger.info(
                f"Retry run {new_run.id} completed: {new_run.status}"
            )

        except Exception as e:
            healing_log.result = "retry_error"
            self.db.commit()
            logger.error(f"Retry execution error: {e}")

    def _create_log(
        self,
        run: PipelineRun,
        pipeline: Pipeline,
        decision: HealingDecision,
    ) -> HealingLog:
        """Creates and saves a HealingLog record."""
        failure_category = self._extract_category(run.root_cause)

        log = HealingLog(
            pipeline_id      = pipeline.id,
            run_id           = run.id,
            action           = decision.action,
            reason           = decision.reason,
            result           = "pending",
            retry_number     = decision.retry_number,
            failure_category = failure_category,
            risk_score       = run.risk_score,
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(log)
        return log

    def _count_retries(
        self, run: PipelineRun, pipeline: Pipeline
    ) -> int:
        """
        Counts how many consecutive retries have happened
        for this pipeline recently.
        """
        recent = (
            self.db.query(HealingLog)
            .filter(HealingLog.pipeline_id == pipeline.id)
            .filter(HealingLog.action == HealingAction.RETRY)
            .order_by(HealingLog.created_at.desc())
            .limit(10)
            .all()
        )

        # Count consecutive retries without a manual success in between
        count = 0
        for log in recent:
            if log.result in ("retry_failed", "pending", "retry_error"):
                count += 1
            else:
                break
        return count

    def _extract_category(self, root_cause: str) -> str:
        """Parses '[CATEGORY] explanation' format."""
        if not root_cause:
            return "unknown"
        if root_cause.startswith("[") and "]" in root_cause:
            return root_cause[1:root_cause.index("]")].lower()
        return "unknown"