# services/pipeline_service.py
# Updated in Phase 3.
# Now creates a StageLog record for EVERY stage of every run.
# Also generates realistic metadata (git commit, author, environment).

import time
import random
import string
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.pipeline import Pipeline, PipelineRun, StageLog, PipelineStatus
from app.services.healing_agent import HealingAgent

logger = logging.getLogger(__name__)

# Simulated pipeline stages
PIPELINE_STAGES = [
    {
        "name": "checkout",
        "duration_range": (0.5, 1.5),
        "failure_rate": 0.02,
        "errors": [
            "Failed to clone repository: connection timeout",
            "Authentication error: invalid token",
        ],
        "outputs": [
            "Cloning into 'repo'...",
            "Checking out branch: {branch}",
            "HEAD is now at {commit}",
        ],
    },
    {
        "name": "install_dependencies",
        "duration_range": (2.0, 4.0),
        "failure_rate": 0.08,
        "errors": [
            "npm ERR! peer dep missing: react@18",
            "pip install failed: package not found",
            "Dependency version conflict detected",
        ],
        "outputs": [
            "Installing packages from package.json...",
            "added 847 packages in 3.2s",
            "All dependencies satisfied",
        ],
    },
    {
        "name": "lint",
        "duration_range": (1.0, 2.5),
        "failure_rate": 0.12,
        "errors": [
            "ESLint: 5 errors found in src/components/Header.js",
            "Flake8: line too long (120 > 79 characters)",
            "Prettier check failed: 3 files need formatting",
        ],
        "outputs": [
            "Running ESLint on 42 files...",
            "Running Flake8 on Python files...",
            "No linting errors found",
        ],
    },
    {
        "name": "unit_tests",
        "duration_range": (3.0, 6.0),
        "failure_rate": 0.15,
        "errors": [
            "FAILED tests/test_auth.py::test_login - AssertionError",
            "Jest: 5 tests failed, 47 passed",
            "Cannot find module './utils/helpers'",
        ],
        "outputs": [
            "Running test suite...",
            "52 tests found",
            "All 52 tests passed in {duration}s",
        ],
    },
    {
        "name": "build",
        "duration_range": (3.0, 7.0),
        "failure_rate": 0.10,
        "errors": [
            "Docker build failed: no source files specified",
            "webpack error: Module not found",
            "TypeScript error: Type mismatch on line 42",
        ],
        "outputs": [
            "Building Docker image...",
            "Step 1/8: FROM node:18-alpine",
            "Successfully built image: app:{commit}",
        ],
    },
    {
        "name": "integration_tests",
        "duration_range": (4.0, 8.0),
        "failure_rate": 0.18,
        "errors": [
            "Connection refused: PostgreSQL not reachable on port 5432",
            "Timeout: API /api/users took > 30s",
            "Expected status 200, got 500",
        ],
        "outputs": [
            "Starting integration test environment...",
            "Running 12 integration tests...",
            "All integration tests passed",
        ],
    },
    {
        "name": "deploy",
        "duration_range": (2.0, 5.0),
        "failure_rate": 0.07,
        "errors": [
            "Kubernetes rollout failed: ImagePullBackOff",
            "ECS task failed to start: out of memory",
            "Terraform apply error: resource already exists",
        ],
        "outputs": [
            "Deploying to {environment}...",
            "Rolling update: 3/3 pods healthy",
            "Deployment successful. Version {commit} is live.",
        ],
    },
]

# Simulated git authors
FAKE_AUTHORS = [
    "alice@company.com",
    "bob@company.com",
    "carol@company.com",
    "david@company.com",
]

# Simulated environments
ENVIRONMENTS = ["production", "staging", "development"]


def _random_commit() -> str:
    """Generate a realistic-looking git commit hash."""
    return "".join(random.choices(string.hexdigits[:16], k=8))


def _fill_template(text: str, context: dict) -> str:
    """Replace {placeholders} in log output templates."""
    for key, value in context.items():
        text = text.replace("{" + key + "}", str(value))
    return text


class PipelineService:

    def __init__(self, db: Session):
        self.db = db

    def execute_pipeline(
        self, pipeline: Pipeline, triggered_by: str = "manual"
    ) -> PipelineRun:
        """
        Runs the full pipeline simulation.
        Phase 3 upgrade: creates a StageLog record for every stage,
        with individual timing, output, and error info.
        """
        # Generate run metadata
        git_commit  = _random_commit()
        git_author  = random.choice(FAKE_AUTHORS)
        environment = random.choice(ENVIRONMENTS)

        logger.info(
            f"Executing pipeline '{pipeline.name}' | "
            f"commit={git_commit} | env={environment}"
        )

        # Create the run record
        run = PipelineRun(
            pipeline_id=pipeline.id,
            status=PipelineStatus.RUNNING,
            triggered_by=triggered_by,
            environment=environment,
            git_commit=git_commit,
            git_author=git_author,
            runner_os="ubuntu-latest",
            started_at=datetime.now(timezone.utc),
            stages_total=len(PIPELINE_STAGES),
            stages_passed=0,
            stages_failed=0,
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)

        # Context for filling log templates
        ctx = {
            "branch":      pipeline.branch,
            "commit":      git_commit,
            "environment": environment,
        }

        # Summary log (kept for backward compat)
        summary_lines = [
            f"Pipeline : {pipeline.name}",
            f"Branch   : {pipeline.branch}",
            f"Commit   : {git_commit}",
            f"Author   : {git_author}",
            f"Env      : {environment}",
            f"Runner   : ubuntu-latest",
            f"Started  : {datetime.now(timezone.utc).isoformat()}",
            "-" * 50,
        ]

        total_duration  = 0.0
        pipeline_failed = False
        failed_stage_name = None
        error_msg = None

        # ── Execute each stage ────────────────────────────────────
        for order, stage in enumerate(PIPELINE_STAGES):
            stage_name = stage["name"]
            summary_lines.append(f"\n[ STAGE {order + 1}/{len(PIPELINE_STAGES)} ] {stage_name.upper()}")

            stage_started = datetime.now(timezone.utc)
            sim_seconds   = random.uniform(*stage["duration_range"])
            actual_sleep  = sim_seconds / 10
            time.sleep(actual_sleep)
            stage_ended   = datetime.now(timezone.utc)
            total_duration += sim_seconds

            # Fill output template with context
            ctx["duration"] = f"{sim_seconds:.1f}"
            normal_output = "\n".join(
                _fill_template(line, ctx) for line in stage["outputs"]
            )

            # Did this stage fail?
            if random.random() < stage["failure_rate"]:
                error_msg         = random.choice(stage["errors"])
                failed_stage_name = stage_name
                pipeline_failed   = True

                # ── Create FAILED StageLog ────────────────────────
                stage_log = StageLog(
                    run_id           = run.id,
                    order            = order,
                    name             = stage_name,
                    status           = "failed",
                    passed           = False,
                    started_at       = stage_started,
                    completed_at     = stage_ended,
                    duration_seconds = round(sim_seconds, 2),
                    output           = normal_output,
                    error_output     = error_msg,
                )
                self.db.add(stage_log)
                run.stages_failed += 1

                summary_lines.append(f"  STATUS : FAILED ({sim_seconds:.1f}s)")
                summary_lines.append(f"  ERROR  : {error_msg}")
                self.db.commit()
                break  # Stop — just like a real pipeline

            else:
                # ── Create PASSED StageLog ────────────────────────
                stage_log = StageLog(
                    run_id           = run.id,
                    order            = order,
                    name             = stage_name,
                    status           = "passed",
                    passed           = True,
                    started_at       = stage_started,
                    completed_at     = stage_ended,
                    duration_seconds = round(sim_seconds, 2),
                    output           = normal_output,
                    error_output     = None,
                )
                self.db.add(stage_log)
                run.stages_passed += 1

                summary_lines.append(f"  STATUS : PASSED ({sim_seconds:.1f}s)")
                self.db.commit()

        # ── Finalize run ──────────────────────────────────────────
        summary_lines.append("\n" + "-" * 50)

        if pipeline_failed:
            run.status = PipelineStatus.FAILED
            summary_lines.append(f"RESULT : FAILED at '{failed_stage_name}'")
        else:
            run.status = PipelineStatus.SUCCESS
            summary_lines.append("RESULT : SUCCESS — all stages passed")

        summary_lines.append(f"Duration: {total_duration:.1f}s")

        run.completed_at     = datetime.now(timezone.utc)
        run.duration_seconds = round(total_duration, 2)
        run.failed_stage     = failed_stage_name
        run.error_message    = error_msg
        run.logs             = "\n".join(summary_lines)

        self.db.commit()
        self.db.refresh(run)

        # ── Phase 4: Run failure analysis automatically ────────────
        if pipeline_failed:
            self._run_failure_analysis(run)

        logger.info(
            f"Run {run.id} finished: {run.status} | "
            f"stages: {run.stages_passed}/{run.stages_total} passed | "
            f"duration: {run.duration_seconds}s"
        )
        # Send notifications
        try:
            from app.services.notification_service import NotificationService
            notification_svc = NotificationService(self.db)
            notification_svc.notify_run_complete(run, pipeline)
        except Exception as e:
            logger.error(f"Notification error: {e}")

        # Auto-retrain ML model if enough new data
        try:
            from app.ml.trainer import ModelTrainer
            trainer = ModelTrainer(self.db)
            if trainer.should_retrain(min_new_runs=10):
                logger.info("Auto-retraining ML model...")
                trainer.train_global_model()
        except Exception as e:
            logger.warning(f"Auto-train skipped: {e}")


        return run

    def _run_failure_analysis(self, run: PipelineRun) -> None:
        """
        Called automatically after every failed run.
        Phase 4: Failure classification
        Phase 6: Recommendations
        Phase 7: Self-healing
        Phase AI: Healing agent analysis (NEW)
        """
        from app.services.failure_analysis import FailureAnalysisEngine
        from app.services.recommendation_engine import RecommendationEngine
        from app.services.healing_engine import SelfHealingEngine
        from app.services.healing_agent import HealingAgent
 
        # ── Phase 4: Classify the failure ─────────────────────────
        try:
            engine = FailureAnalysisEngine()
            result = engine.analyze(run)
            if result:
                run.root_cause = (
                    f"[{result.root_cause_category.upper()}] "
                    f"{result.explanation}"
                )
                run.recommendation = result.suggestion
                self.db.commit()
                logger.info(
                    f"Failure analysis saved for run {run.id}: "
                    f"{result.root_cause_category} "
                    f"(confidence={result.confidence})"
                )
        except Exception as e:
            logger.error(f"Failure analysis error for run {run.id}: {e}")
 
        # ── Phase 6: Generate recommendations ─────────────────────
        try:
            rec_engine = RecommendationEngine(self.db)
            report     = rec_engine.generate(run.pipeline_id, run_id=run.id)
            logger.info(
                f"Generated {report.total_count} recommendations "
                f"({report.p1_count} P1) for pipeline {run.pipeline_id}"
            )
        except Exception as e:
            logger.error(f"Recommendation error for run {run.id}: {e}")
 
        # ── Phase 7: Self-healing evaluation ──────────────────────
        healing_log = None
        try:
            healing_engine = SelfHealingEngine(self.db)
            healing_log    = healing_engine.evaluate_and_heal(run)
            if healing_log:
                logger.info(
                    f"Healing action for run {run.id}: "
                    f"{healing_log.action.value} — {healing_log.result}"
                )
        except Exception as e:
            logger.error(f"Self-healing error for run {run.id}: {e}")
 
        # ── Phase AI: Healing agent analysis ──────────────────────
        # Determine priority from recommendation report
        try:
            priority = "P2"  # default
            try:
                rec_engine = RecommendationEngine(self.db)
                report     = rec_engine.generate(run.pipeline_id, run_id=run.id)
                if report and report.p1_count > 0:
                    priority = "P1"
                elif report and report.total_count > 0:
                    priority = "P2"
                else:
                    priority = "P3"
            except Exception:
                pass
 
            # Only run agent for P1 and P2
            if priority in ("P1", "P2") and healing_log:
                agent = HealingAgent(self.db)
                analysis = agent.analyse_and_propose_fix(
                    run=run,
                    healing_log=healing_log,
                    priority=priority,
                )
                if analysis:
                    logger.info(
                        f"AI Agent analysis complete for run {run.id}: "
                        f"confidence={analysis.get('confidence', 'unknown')} | "
                        f"fix_type={analysis.get('fix_type', 'unknown')}"
                    )
                else:
                    logger.info(f"AI Agent skipped for run {run.id}")
 
        except Exception as e:
            logger.error(f"AI Healing Agent error for run {run.id}: {e}")