# failure_analysis.py
# The Failure Analysis Engine — Phase 4 core feature.
#
# This is a RULE-BASED system. It uses pattern matching on error messages
# and stage names to classify failures into categories.
#
# Why rule-based first?
# - Works with zero training data
# - Fully explainable (important for engineers)
# - Fast — no model inference needed
# - In Phase 5 we layer ML ON TOP of these rules
#
# Real tools like PagerDuty and OpsGenie use exactly this approach:
# rules first, ML second.

import re
import logging
from dataclasses import dataclass
from typing import Optional
from app.models.pipeline import PipelineRun, StageLog

logger = logging.getLogger(__name__)


# ── Data Structures ───────────────────────────────────────────────

@dataclass
class FailureAnalysisResult:
    """
    The complete analysis of a pipeline failure.
    Every field maps directly to a UI element.
    """
    root_cause_category: str    # e.g. "dependency", "test_failure"
    severity: str               # "low", "medium", "high", "critical"
    explanation: str            # Human-readable: "What happened"
    suggestion: str             # Human-readable: "How to fix it"
    confidence: float           # 0.0 to 1.0 — how sure are we?
    matched_pattern: str        # Which rule triggered this (for debugging)


# ── Rule Definitions ──────────────────────────────────────────────
# Each rule has:
#   pattern   : regex to match against the error message (case-insensitive)
#   category  : the type of failure
#   severity  : how bad is it
#   explanation: plain English description
#   suggestion : how to fix it
#   confidence : how reliable is this rule

FAILURE_RULES = [

    # ── Dependency Issues ─────────────────────────────────────────
    {
        "pattern": r"npm err|peer dep|package not found|dependency.*conflict|yarn.*error",
        "category": "dependency",
        "severity": "medium",
        "explanation": "A package dependency failed to install. This is often caused by "
                       "version conflicts between packages or a missing package in the registry.",
        "suggestion": "Run 'npm install' locally and check for peer dependency warnings. "
                      "Consider pinning dependency versions in package.json. "
                      "Check if the package exists in the registry.",
        "confidence": 0.92,
    },
    {
        "pattern": r"pip install|requirements\.txt|module not found|no module named",
        "category": "dependency",
        "severity": "medium",
        "explanation": "A Python package dependency could not be installed or imported.",
        "suggestion": "Check requirements.txt for version conflicts. "
                      "Run 'pip install -r requirements.txt' locally. "
                      "Verify the package name is spelled correctly.",
        "confidence": 0.90,
    },

    # ── Test Failures ─────────────────────────────────────────────
    {
        "pattern": r"assertion.*error|assertionerror|test.*failed|failed.*test|"
                   r"jest.*failed|pytest.*failed|tests.*passed",
        "category": "test_failure",
        "severity": "high",
        "explanation": "One or more automated tests failed. The code change likely broke "
                       "existing functionality or a new test was added without the implementation.",
        "suggestion": "Run the failing tests locally: check the test output for the exact "
                      "assertion that failed. Review recent code changes that may have affected "
                      "the tested functionality. Do not skip or comment out failing tests.",
        "confidence": 0.94,
    },
    {
        "pattern": r"cannot find module|module.*not found|import.*error|"
                   r"failed to resolve|could not resolve",
        "category": "test_failure",
        "severity": "high",
        "explanation": "A required module or file could not be found during test execution. "
                       "This usually means a file was renamed, moved, or deleted.",
        "suggestion": "Check recent file renames or deletions. Update import paths in the "
                      "affected files. Ensure all new files are committed to the repository.",
        "confidence": 0.88,
    },

    # ── Build Failures ────────────────────────────────────────────
    {
        "pattern": r"docker.*build.*failed|dockerfile|image.*pull|"
                   r"imagepullbackoff|no source files",
        "category": "build_failure",
        "severity": "high",
        "explanation": "The Docker image build failed. This could be caused by a syntax "
                       "error in the Dockerfile, missing source files, or an unreachable "
                       "base image.",
        "suggestion": "Run 'docker build .' locally to reproduce the error. "
                      "Check the Dockerfile for syntax errors. "
                      "Verify the base image tag exists in the registry. "
                      "Ensure all COPY source paths exist.",
        "confidence": 0.91,
    },
    {
        "pattern": r"webpack|typescript.*error|type.*error|compilation.*error|"
                   r"build.*error|syntax.*error",
        "category": "build_failure",
        "severity": "medium",
        "explanation": "The application failed to compile. There is likely a TypeScript "
                       "type error or syntax error introduced in a recent commit.",
        "suggestion": "Run 'npm run build' locally to see the full error. "
                      "Check for TypeScript errors with 'tsc --noEmit'. "
                      "Review the diff of recently changed files.",
        "confidence": 0.87,
    },

    # ── Infrastructure / Environment Issues ───────────────────────
    {
        "pattern": r"connection refused|connection.*timeout|"
                   r"timeout.*api|took > \d+s|econnrefused",
        "category": "infrastructure",
        "severity": "critical",
        "explanation": "A service or database was unreachable during the pipeline run. "
                       "This is an environment issue, not a code issue — the pipeline "
                       "infrastructure itself is having problems.",
        "suggestion": "Check if the required services (database, API, cache) are running "
                      "in the CI environment. Review CI environment variable configuration. "
                      "Check network policies and firewall rules between pipeline runners.",
        "confidence": 0.89,
    },
    {
        "pattern": r"out of memory|oom|killed|memory.*limit|"
                   r"ecs task.*failed|resource.*exhausted",
        "category": "infrastructure",
        "severity": "critical",
        "explanation": "The pipeline runner ran out of memory. The process was killed by "
                       "the operating system's OOM killer.",
        "suggestion": "Increase the memory limit for the CI runner or container. "
                      "Check for memory leaks in tests. "
                      "Split large test suites into parallel jobs. "
                      "Reduce the number of concurrent processes.",
        "confidence": 0.93,
    },

    # ── Deployment Failures ───────────────────────────────────────
    {
        "pattern": r"kubernetes|kubectl|rollout.*failed|pod.*crash|"
                   r"crashloopbackoff|terraform.*error|resource.*already exists",
        "category": "deployment",
        "severity": "critical",
        "explanation": "The deployment to the target environment failed. The application "
                       "may have been partially deployed, leaving the environment in an "
                       "inconsistent state.",
        "suggestion": "Check Kubernetes pod logs: 'kubectl logs <pod-name>'. "
                      "Review the deployment manifest for errors. "
                      "Check if the previous deployment is still healthy. "
                      "Consider rolling back: 'kubectl rollout undo deployment/<name>'.",
        "confidence": 0.90,
    },

    # ── Code Quality / Lint ───────────────────────────────────────
    {
        "pattern": r"eslint|flake8|prettier|lint.*error|"
                   r"formatting|style.*error|\d+ errors? found",
        "category": "code_quality",
        "severity": "low",
        "explanation": "The code failed linting or formatting checks. While this does not "
                       "affect functionality, it indicates the code does not meet the "
                       "project's style standards.",
        "suggestion": "Run the linter locally: 'npm run lint' or 'flake8 .' "
                      "Use auto-fix: 'npm run lint -- --fix' or 'black .' "
                      "Consider adding a pre-commit hook to catch these before pushing.",
        "confidence": 0.95,
    },

    # ── Authentication / Access ───────────────────────────────────
    {
        "pattern": r"authentication.*error|invalid.*token|"
                   r"permission denied|access denied|unauthorized|403|401",
        "category": "authentication",
        "severity": "high",
        "explanation": "The pipeline failed due to an authentication or authorization error. "
                       "A credential, token, or secret is likely expired or misconfigured.",
        "suggestion": "Check that all CI/CD secrets and environment variables are set correctly. "
                      "Rotate any expired tokens. "
                      "Verify service account permissions in the target environment.",
        "confidence": 0.91,
    },

    # ── Git / Source Control ──────────────────────────────────────
    {
        "pattern": r"failed to clone|git.*error|clone.*timeout|"
                   r"repository.*not found|checkout.*failed",
        "category": "source_control",
        "severity": "medium",
        "explanation": "The pipeline could not check out the source code from the repository.",
        "suggestion": "Verify the repository URL is correct. "
                      "Check that the CI runner has read access to the repository. "
                      "Ensure the branch name exists and is spelled correctly.",
        "confidence": 0.88,
    },
]

# Fallback when no rule matches
UNKNOWN_FAILURE = FailureAnalysisResult(
    root_cause_category="unknown",
    severity="medium",
    explanation="The pipeline failed but the root cause could not be automatically determined. "
                "Manual investigation of the logs is required.",
    suggestion="Review the full pipeline logs carefully. "
               "Check recent commits for changes in the failing stage area. "
               "Try running the failed stage locally to reproduce the error.",
    confidence=0.30,
    matched_pattern="none",
)


# ── Severity ordering for comparison ─────────────────────────────
SEVERITY_ORDER = {"low": 1, "medium": 2, "high": 3, "critical": 4}


class FailureAnalysisEngine:
    """
    Analyzes a failed PipelineRun and returns a structured diagnosis.

    Usage:
        engine = FailureAnalysisEngine()
        result = engine.analyze(run)
    """

    def analyze(self, run: PipelineRun) -> Optional[FailureAnalysisResult]:
        """
        Main entry point. Analyzes a pipeline run.
        Returns None if the run did not fail (no analysis needed).
        """
        if run.status.value != "failed":
            logger.debug(f"Run {run.id} is not failed — skipping analysis")
            return None

        logger.info(f"Analyzing failure for run {run.id} | stage={run.failed_stage}")

        # Build the text we will search through
        # We combine error_message + stage name for maximum signal
        search_text = self._build_search_text(run)

        # Try each rule in order
        best_result = None
        best_confidence = 0.0

        for rule in FAILURE_RULES:
            if re.search(rule["pattern"], search_text, re.IGNORECASE):
                if rule["confidence"] > best_confidence:
                    best_confidence = rule["confidence"]
                    best_result = FailureAnalysisResult(
                        root_cause_category=rule["category"],
                        severity=rule["severity"],
                        explanation=rule["explanation"],
                        suggestion=rule["suggestion"],
                        confidence=rule["confidence"],
                        matched_pattern=rule["pattern"][:50],
                    )

        # If no rule matched, use stage-based fallback
        if best_result is None:
            best_result = self._stage_based_fallback(run)

        logger.info(
            f"Run {run.id} analysis complete: "
            f"category={best_result.root_cause_category} | "
            f"severity={best_result.severity} | "
            f"confidence={best_result.confidence}"
        )
        return best_result

    def _build_search_text(self, run: PipelineRun) -> str:
        """
        Combines all available failure signals into one string for pattern matching.
        More text = better pattern matching accuracy.
        """
        parts = []

        if run.error_message:
            parts.append(run.error_message)

        if run.failed_stage:
            parts.append(run.failed_stage)

        # Also search through stage log error outputs
        if run.stage_logs:
            for stage in run.stage_logs:
                if stage.error_output:
                    parts.append(stage.error_output)

        return " | ".join(parts).lower()

    def _stage_based_fallback(self, run: PipelineRun) -> FailureAnalysisResult:
        """
        If no error message pattern matched, make an educated guess
        based purely on which stage failed.
        This handles cases where the error message is unusual or empty.
        """
        stage_fallbacks = {
            "checkout": FailureAnalysisResult(
                root_cause_category="source_control",
                severity="medium",
                explanation="The checkout stage failed. Source code could not be retrieved.",
                suggestion="Check repository access and branch name.",
                confidence=0.60,
                matched_pattern="stage:checkout",
            ),
            "install_dependencies": FailureAnalysisResult(
                root_cause_category="dependency",
                severity="medium",
                explanation="Dependency installation failed.",
                suggestion="Check package.json or requirements.txt for issues.",
                confidence=0.60,
                matched_pattern="stage:install_dependencies",
            ),
            "lint": FailureAnalysisResult(
                root_cause_category="code_quality",
                severity="low",
                explanation="Lint checks failed. Code style issues detected.",
                suggestion="Run linter locally and fix reported issues.",
                confidence=0.65,
                matched_pattern="stage:lint",
            ),
            "unit_tests": FailureAnalysisResult(
                root_cause_category="test_failure",
                severity="high",
                explanation="Unit tests failed.",
                suggestion="Run tests locally to identify failing test cases.",
                confidence=0.65,
                matched_pattern="stage:unit_tests",
            ),
            "build": FailureAnalysisResult(
                root_cause_category="build_failure",
                severity="high",
                explanation="Build stage failed.",
                suggestion="Run the build locally and check for compilation errors.",
                confidence=0.65,
                matched_pattern="stage:build",
            ),
            "integration_tests": FailureAnalysisResult(
                root_cause_category="infrastructure",
                severity="high",
                explanation="Integration tests failed. May be an environment issue.",
                suggestion="Check service availability in the test environment.",
                confidence=0.60,
                matched_pattern="stage:integration_tests",
            ),
            "deploy": FailureAnalysisResult(
                root_cause_category="deployment",
                severity="critical",
                explanation="Deployment failed.",
                suggestion="Check deployment logs and rollback if needed.",
                confidence=0.60,
                matched_pattern="stage:deploy",
            ),
        }

        if run.failed_stage and run.failed_stage in stage_fallbacks:
            return stage_fallbacks[run.failed_stage]

        return UNKNOWN_FAILURE