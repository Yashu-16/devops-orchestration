# recommendation_engine.py
# Recommendation Engine — Phase 6 core feature.
#
# Generates specific, prioritized, actionable recommendations
# based on failure analysis + risk assessment results.
#
# Architecture:
# 1. A library of recommendation templates organized by category
# 2. A scoring system that prioritizes by impact + effort
# 3. A context engine that personalizes recommendations with run data
#
# This is how real tools like GitHub Dependabot, SonarQube,
# and Snyk generate their fix suggestions.

import logging
from dataclasses import dataclass, field
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from app.models.pipeline import Pipeline, PipelineRun, PipelineStatus

logger = logging.getLogger(__name__)


# ── Data Structures ───────────────────────────────────────────────

@dataclass
class Recommendation:
    """
    A single actionable recommendation.
    Every field maps directly to a UI element.
    """
    id: str                  # Unique ID for deduplication
    title: str               # Short action title
    description: str         # Why this helps
    action_steps: List[str]  # Ordered list of concrete steps
    priority: str            # "P1", "P2", "P3"
    effort: str              # "5 min", "30 min", "1 hour", "1 day"
    impact: str              # "critical", "high", "medium", "low"
    category: str            # Which failure type this addresses
    applies_to_stage: Optional[str] = None   # Specific stage


@dataclass
class RecommendationReport:
    """
    The full set of recommendations for a pipeline.
    Returned by the engine and saved/shown in the UI.
    """
    pipeline_id: int
    run_id: Optional[int]
    recommendations: List[Recommendation]
    summary: str             # One-line summary
    total_count: int
    p1_count: int            # Critical priority count
    generated_from: str      # What data this was based on


# ── Recommendation Templates ──────────────────────────────────────
# Organized by failure category.
# Each template can be personalized with run context.

RECOMMENDATION_TEMPLATES: Dict[str, List[dict]] = {

    "test_failure": [
        {
            "id": "tf_001",
            "title": "Fix Failing Unit Tests Immediately",
            "description": "Failing tests indicate broken functionality. "
                           "Every commit should maintain a green test suite. "
                           "Unresolved test failures compound over time.",
            "action_steps": [
                "Run 'npm test' or 'pytest -v' locally to reproduce the failure",
                "Read the assertion error carefully — it shows expected vs actual",
                "Check git blame to find which recent commit broke the test",
                "Fix the code or update the test if requirements changed",
                "Never skip or comment out failing tests",
            ],
            "priority": "P1",
            "effort": "30 min",
            "impact": "critical",
            "category": "test_failure",
        },
        {
            "id": "tf_002",
            "title": "Add Test Coverage for Recently Changed Files",
            "description": "Files changed without corresponding test updates "
                           "are the most common source of test failures.",
            "action_steps": [
                "Run coverage report: 'pytest --cov' or 'npm test -- --coverage'",
                "Identify files changed in recent commits with low coverage",
                "Write tests for all new functions and edge cases",
                "Set a minimum coverage threshold in CI (e.g., 80%)",
            ],
            "priority": "P2",
            "effort": "1 hour",
            "impact": "high",
            "category": "test_failure",
        },
        {
            "id": "tf_003",
            "title": "Set Up Pre-commit Test Hook",
            "description": "Catching test failures before push eliminates "
                           "CI failures entirely for this category.",
            "action_steps": [
                "Install pre-commit: 'pip install pre-commit'",
                "Add a hook that runs the test suite before each commit",
                "Configure to only run tests for changed files (faster)",
                "Document this in CONTRIBUTING.md for the team",
            ],
            "priority": "P3",
            "effort": "30 min",
            "impact": "high",
            "category": "test_failure",
        },
    ],

    "dependency": [
        {
            "id": "dep_001",
            "title": "Pin All Dependency Versions",
            "description": "Unpinned dependencies ('latest', '^1.2.3') cause "
                           "non-deterministic builds. A package update overnight "
                           "can break your pipeline without any code change.",
            "action_steps": [
                "Run 'npm ci' instead of 'npm install' in CI pipelines",
                "Commit package-lock.json or yarn.lock to the repository",
                "Change '^1.2.3' to '1.2.3' for critical dependencies",
                "Use 'pip freeze > requirements.txt' for Python projects",
                "Set up Dependabot to handle updates safely",
            ],
            "priority": "P1",
            "effort": "30 min",
            "impact": "high",
            "category": "dependency",
        },
        {
            "id": "dep_002",
            "title": "Cache Dependencies in CI",
            "description": "Re-downloading all packages on every run is slow "
                           "and can fail due to network issues or registry downtime.",
            "action_steps": [
                "Add dependency caching to your CI configuration",
                "Cache the node_modules or .pip directory between runs",
                "Use a cache key based on the lock file hash",
                "This can reduce install time from 3 min to 10 seconds",
            ],
            "priority": "P2",
            "effort": "30 min",
            "impact": "medium",
            "category": "dependency",
        },
        {
            "id": "dep_003",
            "title": "Audit Dependencies for Known Vulnerabilities",
            "description": "Dependency failures sometimes come from packages "
                           "that have been removed due to security issues.",
            "action_steps": [
                "Run 'npm audit' or 'pip-audit' to check for vulnerabilities",
                "Update or replace any flagged packages",
                "Add security scanning to your CI pipeline",
            ],
            "priority": "P3",
            "effort": "1 hour",
            "impact": "medium",
            "category": "dependency",
        },
    ],

    "build_failure": [
        {
            "id": "bf_001",
            "title": "Fix TypeScript / Compilation Errors",
            "description": "Build failures are blocking — nothing can deploy "
                           "until the build passes. These must be fixed first.",
            "action_steps": [
                "Run 'npm run build' locally to see the full error",
                "Run 'tsc --noEmit' to check TypeScript types only",
                "Check the diff of recently changed files for type errors",
                "Fix type errors — do not use 'any' as a workaround",
                "Add a type-check step to your pre-commit hook",
            ],
            "priority": "P1",
            "effort": "30 min",
            "impact": "critical",
            "category": "build_failure",
        },
        {
            "id": "bf_002",
            "title": "Validate Dockerfile Locally Before Pushing",
            "description": "Docker build failures are expensive to debug in CI. "
                           "A quick local test catches 90% of issues.",
            "action_steps": [
                "Run 'docker build -t myapp:test .' locally",
                "Verify all COPY source paths exist in the repo",
                "Check that the base image tag exists in Docker Hub",
                "Use 'docker run' to test the built image",
                "Add hadolint to CI for Dockerfile linting",
            ],
            "priority": "P2",
            "effort": "15 min",
            "impact": "high",
            "category": "build_failure",
        },
    ],

    "infrastructure": [
        {
            "id": "inf_001",
            "title": "Fix Service Connectivity in CI Environment",
            "description": "Integration test failures due to connection refused "
                           "mean a required service (DB, API, cache) is not "
                           "available in the CI environment.",
            "action_steps": [
                "Check CI environment variables for correct service URLs",
                "Verify the database/service container starts before tests run",
                "Add a health check wait loop before running integration tests",
                "Use Docker Compose in CI to spin up required services",
                "Check network policies between pipeline runners",
            ],
            "priority": "P1",
            "effort": "1 hour",
            "impact": "critical",
            "category": "infrastructure",
        },
        {
            "id": "inf_002",
            "title": "Increase CI Runner Memory Limit",
            "description": "OOM kills and memory-related failures indicate "
                           "the runner does not have enough resources.",
            "action_steps": [
                "Check current memory usage during the failing stage",
                "Increase the container memory limit in CI configuration",
                "Split large test suites into parallel jobs",
                "Profile memory usage locally with 'valgrind' or 'memory-profiler'",
            ],
            "priority": "P2",
            "effort": "30 min",
            "impact": "high",
            "category": "infrastructure",
        },
        {
            "id": "inf_003",
            "title": "Add Retry Logic for Flaky Network Operations",
            "description": "Timeout errors are often transient. Adding retries "
                           "with backoff reduces false-positive failures.",
            "action_steps": [
                "Identify which operations are timing out",
                "Wrap network calls in retry logic with exponential backoff",
                "Set realistic timeout values (not too low)",
                "Consider running flaky tests in isolation",
            ],
            "priority": "P2",
            "effort": "1 hour",
            "impact": "medium",
            "category": "infrastructure",
        },
    ],

    "deployment": [
        {
            "id": "dep_d_001",
            "title": "Implement Rollback Procedure",
            "description": "Deployment failures leave the environment in an "
                           "inconsistent state. A rollback procedure is "
                           "critical for production stability.",
            "action_steps": [
                "Define rollback command: 'kubectl rollout undo deployment/app'",
                "Test the rollback procedure in staging first",
                "Set up automatic rollback on health check failure",
                "Document the rollback process in your runbook",
                "Consider blue-green or canary deployment strategy",
            ],
            "priority": "P1",
            "effort": "1 hour",
            "impact": "critical",
            "category": "deployment",
        },
        {
            "id": "dep_d_002",
            "title": "Add Deployment Health Checks",
            "description": "Deployments should verify the application is "
                           "healthy after rollout before marking as successful.",
            "action_steps": [
                "Add a /health endpoint to your application",
                "Configure readiness and liveness probes in Kubernetes",
                "Add a post-deployment smoke test to the pipeline",
                "Set up alerts for deployment failures",
            ],
            "priority": "P2",
            "effort": "1 hour",
            "impact": "high",
            "category": "deployment",
        },
    ],

    "code_quality": [
        {
            "id": "cq_001",
            "title": "Enforce Code Formatting with Pre-commit Hook",
            "description": "Lint failures are entirely preventable. "
                           "Automating formatting before commit means "
                           "this category of failure never reaches CI.",
            "action_steps": [
                "Install auto-formatter: 'npm install --save-dev prettier' or 'pip install black'",
                "Add format-on-save to your editor",
                "Add pre-commit hook: 'npx prettier --write .' or 'black .'",
                "Add lint check to CI as a non-blocking warning first",
                "Gradually enforce as blocking once team adopts it",
            ],
            "priority": "P2",
            "effort": "15 min",
            "impact": "medium",
            "category": "code_quality",
        },
        {
            "id": "cq_002",
            "title": "Configure Shared Linting Rules",
            "description": "Inconsistent lint config causes surprise failures "
                           "when code that passes locally fails in CI.",
            "action_steps": [
                "Commit .eslintrc, .flake8, or pyproject.toml to the repo",
                "Ensure local and CI environments use the same config file",
                "Document the linting standards in CONTRIBUTING.md",
            ],
            "priority": "P3",
            "effort": "30 min",
            "impact": "low",
            "category": "code_quality",
        },
    ],

    "authentication": [
        {
            "id": "auth_001",
            "title": "Rotate and Update Expired CI Secrets",
            "description": "Authentication failures in CI almost always mean "
                           "a token, API key, or certificate has expired.",
            "action_steps": [
                "Identify which secret is causing the auth failure from logs",
                "Rotate the expired token/key in the source system",
                "Update the secret in your CI/CD secret store",
                "Set calendar reminders before secrets expire",
                "Use short-lived tokens with automatic rotation",
            ],
            "priority": "P1",
            "effort": "15 min",
            "impact": "critical",
            "category": "authentication",
        },
    ],

    "source_control": [
        {
            "id": "sc_001",
            "title": "Fix Repository Access for CI Runner",
            "description": "Checkout failures mean the CI runner cannot "
                           "clone the repository. This is usually a "
                           "permissions or network issue.",
            "action_steps": [
                "Verify the CI runner's SSH key or access token has read access",
                "Check the repository URL is correct in pipeline config",
                "Test access manually: 'git clone <repo-url>'",
                "Check if the branch name is correct and exists",
            ],
            "priority": "P1",
            "effort": "15 min",
            "impact": "critical",
            "category": "source_control",
        },
    ],

    # General recommendations shown for high risk pipelines
    # regardless of specific failure category
    "general_high_risk": [
        {
            "id": "gen_001",
            "title": "Increase Run Frequency to Detect Failures Earlier",
            "description": "Pipelines with high failure rates often have "
                           "accumulated technical debt. More frequent smaller "
                           "changes are easier to debug.",
            "action_steps": [
                "Break large changes into smaller, incremental commits",
                "Run the pipeline on every PR, not just main branch",
                "Set up branch protection rules requiring green CI",
            ],
            "priority": "P3",
            "effort": "30 min",
            "impact": "medium",
            "category": "general",
        },
        {
            "id": "gen_002",
            "title": "Review Recent Commits for This Pipeline",
            "description": "A sudden increase in failure rate almost always "
                           "correlates with a specific commit or change.",
            "action_steps": [
                "Check git log for commits in the past 24-48 hours",
                "Run 'git bisect' to identify the breaking commit",
                "Review the diff of suspected commits carefully",
                "Consider reverting if the fix is not immediately clear",
            ],
            "priority": "P2",
            "effort": "30 min",
            "impact": "high",
            "category": "general",
        },
    ],
}

# Priority ordering for sorting
PRIORITY_ORDER = {"P1": 0, "P2": 1, "P3": 2}
IMPACT_ORDER   = {"critical": 0, "high": 1, "medium": 2, "low": 3}


class RecommendationEngine:
    """
    Generates prioritized recommendations for a pipeline
    based on its failure history and risk assessment.
    """

    def __init__(self, db: Session):
        self.db = db

    def generate(
        self,
        pipeline_id: int,
        run_id: Optional[int] = None,
    ) -> RecommendationReport:
        """
        Main entry point. Generates recommendations for a pipeline.
        Can be called after a run (with run_id) or on-demand.
        """
        logger.info(
            f"Generating recommendations for pipeline {pipeline_id}"
        )

        pipeline = self.db.query(Pipeline).filter(
            Pipeline.id == pipeline_id
        ).first()
        if not pipeline:
            raise ValueError(f"Pipeline {pipeline_id} not found")

        # Get recent runs for context
        recent_runs = (
            self.db.query(PipelineRun)
            .filter(PipelineRun.pipeline_id == pipeline_id)
            .filter(PipelineRun.status.in_([
                PipelineStatus.SUCCESS, PipelineStatus.FAILED
            ]))
            .order_by(PipelineRun.created_at.desc())
            .limit(10)
            .all()
        )

        # Get the specific run if provided
        target_run = None
        if run_id:
            target_run = self.db.query(PipelineRun).filter(
                PipelineRun.id == run_id
            ).first()

        # Collect all applicable recommendations
        recs = self._collect_recommendations(
            pipeline, recent_runs, target_run
        )

        # Sort: P1 first, then by impact
        recs.sort(key=lambda r: (
            PRIORITY_ORDER.get(r.priority, 99),
            IMPACT_ORDER.get(r.impact, 99)
        ))

        # Deduplicate by ID
        seen = set()
        unique_recs = []
        for r in recs:
            if r.id not in seen:
                seen.add(r.id)
                unique_recs.append(r)

        p1_count = sum(1 for r in unique_recs if r.priority == "P1")

        summary = self._generate_summary(pipeline, unique_recs, recent_runs)

        report = RecommendationReport(
            pipeline_id=pipeline_id,
            run_id=run_id,
            recommendations=unique_recs,
            summary=summary,
            total_count=len(unique_recs),
            p1_count=p1_count,
            generated_from=f"{len(recent_runs)} recent runs",
        )

        logger.info(
            f"Generated {len(unique_recs)} recommendations "
            f"({p1_count} P1) for pipeline {pipeline_id}"
        )
        return report

    def _collect_recommendations(
        self,
        pipeline: Pipeline,
        recent_runs: List[PipelineRun],
        target_run: Optional[PipelineRun],
    ) -> List[Recommendation]:
        """
        Collects all applicable recommendation templates
        based on failure history.
        """
        recs = []
        categories_seen = set()

        # From the specific run
        if target_run and target_run.root_cause:
            category = self._extract_category(target_run.root_cause)
            if category and category in RECOMMENDATION_TEMPLATES:
                for tmpl in RECOMMENDATION_TEMPLATES[category]:
                    recs.append(self._from_template(
                        tmpl, target_run, pipeline
                    ))
                categories_seen.add(category)

        # From all recent failed runs
        for run in recent_runs:
            if run.status != PipelineStatus.FAILED:
                continue
            if not run.root_cause:
                continue
            category = self._extract_category(run.root_cause)
            if not category or category in categories_seen:
                continue
            if category in RECOMMENDATION_TEMPLATES:
                for tmpl in RECOMMENDATION_TEMPLATES[category]:
                    recs.append(self._from_template(
                        tmpl, run, pipeline
                    ))
                categories_seen.add(category)

        # High risk general recommendations
        failed = [r for r in recent_runs
                  if r.status == PipelineStatus.FAILED]
        if len(recent_runs) >= 3 and len(failed) / len(recent_runs) >= 0.4:
            for tmpl in RECOMMENDATION_TEMPLATES["general_high_risk"]:
                recs.append(self._from_template(tmpl, None, pipeline))

        return recs

    def _from_template(
        self,
        tmpl: dict,
        run: Optional[PipelineRun],
        pipeline: Pipeline,
    ) -> Recommendation:
        """Creates a Recommendation from a template, optionally
        personalizing it with run-specific context."""
        return Recommendation(
            id=tmpl["id"],
            title=tmpl["title"],
            description=tmpl["description"],
            action_steps=tmpl["action_steps"],
            priority=tmpl["priority"],
            effort=tmpl["effort"],
            impact=tmpl["impact"],
            category=tmpl["category"],
            applies_to_stage=run.failed_stage if run else None,
        )

    def _extract_category(self, root_cause: str) -> Optional[str]:
        """Parses '[CATEGORY] explanation' format."""
        if not root_cause:
            return None
        if root_cause.startswith("[") and "]" in root_cause:
            return root_cause[1:root_cause.index("]")].lower()
        return None

    def _generate_summary(
        self,
        pipeline: Pipeline,
        recs: List[Recommendation],
        recent_runs: List[PipelineRun],
    ) -> str:
        if not recs:
            return "No recommendations — pipeline appears healthy."

        p1 = [r for r in recs if r.priority == "P1"]
        if p1:
            return (
                f"{len(p1)} critical action(s) required. "
                f"Start with: '{p1[0].title}'"
            )

        failed = sum(
            1 for r in recent_runs
            if r.status == PipelineStatus.FAILED
        )
        return (
            f"{len(recs)} recommendations based on "
            f"{failed} failure(s) in recent history."
        )