# feature_extractor.py
# Extracts numerical features from pipeline run history.
# These features are fed into the ML model.
#
# Feature engineering is the most important part of ML.
# Good features = good predictions.
# Bad features = garbage predictions regardless of model.

import numpy as np
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from app.models.pipeline import Pipeline, PipelineRun, PipelineStatus

logger = logging.getLogger(__name__)

# Feature names — must stay in this exact order
# Any change here requires model retraining
FEATURE_NAMES = [
    "total_runs",
    "failure_rate_all",       # Overall failure rate
    "failure_rate_7d",        # Failure rate last 7 days
    "failure_rate_30d",       # Failure rate last 30 days
    "consecutive_failures",   # Current failure streak
    "consecutive_successes",  # Current success streak
    "avg_duration",           # Average run duration in seconds
    "duration_std",           # Duration standard deviation (consistency)
    "last_run_failed",        # Was the last run a failure? (0/1)
    "runs_last_7d",           # How many runs in last 7 days
    "runs_last_24h",          # How many runs in last 24 hours
    "hour_of_day",            # Current hour (0-23)
    "day_of_week",            # Current day (0=Mon, 6=Sun)
    "checkout_fail_rate",     # Stage-specific failure rates
    "install_fail_rate",
    "lint_fail_rate",
    "test_fail_rate",
    "build_fail_rate",
    "deploy_fail_rate",
    "time_since_last_run_h",  # Hours since last run
]

N_FEATURES = len(FEATURE_NAMES)


class FeatureExtractor:
    """
    Extracts ML features from pipeline run history.
    Returns a numpy array of shape (N_FEATURES,).
    """

    def __init__(self, db: Session):
        self.db = db

    def extract(
        self,
        pipeline_id: int,
        at_time: Optional[datetime] = None,
    ) -> np.ndarray:
        """
        Extract features for a pipeline at a given point in time.
        If at_time is None, uses the current time.
        Returns a numpy array of shape (N_FEATURES,).
        """
        if at_time is None:
            at_time = datetime.now(timezone.utc)

        # Get all runs for this pipeline up to at_time
        runs = (
            self.db.query(PipelineRun)
            .filter(
                PipelineRun.pipeline_id == pipeline_id,
                PipelineRun.created_at <= at_time,
            )
            .order_by(PipelineRun.created_at.desc())
            .limit(100)  # Cap at 100 most recent runs
            .all()
        )

        if not runs:
            return self._zero_features(at_time)

        return self._compute_features(runs, at_time)

    def extract_batch(
        self, pipeline_id: int, lookback_runs: int = 50
    ) -> tuple[list, list]:
        """
        Extract features for ALL runs of a pipeline.
        Used for training the model.
        Returns (X, y) where X is features and y is labels (1=fail, 0=success).
        """
        all_runs = (
            self.db.query(PipelineRun)
            .filter(PipelineRun.pipeline_id == pipeline_id)
            .order_by(PipelineRun.created_at.asc())
            .all()
        )

        X, y = [], []
        for i, run in enumerate(all_runs):
            if i < 3:
                continue  # Need at least 3 prior runs for meaningful features

            # Extract features using only runs BEFORE this one
            prior_runs = all_runs[max(0, i - lookback_runs):i]
            features   = self._compute_features(
                list(reversed(prior_runs)),
                run.created_at,
            )
            label = 1 if run.status == PipelineStatus.FAILED else 0

            X.append(features)
            y.append(label)

        return X, y

    def _compute_features(
        self, runs: list, at_time: datetime
    ) -> np.ndarray:
        """Compute all features from a list of runs."""
        now = at_time
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

        total = len(runs)
        failed = sum(1 for r in runs if r.status == PipelineStatus.FAILED)

        # ── Basic failure rates ───────────────────────────────────
        failure_rate_all = failed / total if total > 0 else 0.0

        cutoff_7d  = now - timedelta(days=7)
        cutoff_30d = now - timedelta(days=30)

        runs_7d  = [r for r in runs if self._run_time(r) >= cutoff_7d]
        runs_30d = [r for r in runs if self._run_time(r) >= cutoff_30d]

        failure_rate_7d  = (
            sum(1 for r in runs_7d  if r.status == PipelineStatus.FAILED) /
            len(runs_7d) if runs_7d else failure_rate_all
        )
        failure_rate_30d = (
            sum(1 for r in runs_30d if r.status == PipelineStatus.FAILED) /
            len(runs_30d) if runs_30d else failure_rate_all
        )

        # ── Streaks ───────────────────────────────────────────────
        consecutive_failures  = 0
        consecutive_successes = 0

        for run in runs:  # runs are already newest-first
            if run.status == PipelineStatus.FAILED:
                if consecutive_successes == 0:
                    consecutive_failures += 1
                else:
                    break
            else:
                if consecutive_failures == 0:
                    consecutive_successes += 1
                else:
                    break

        # ── Duration stats ────────────────────────────────────────
        durations = [
            r.duration_seconds for r in runs
            if r.duration_seconds is not None
        ]
        avg_duration = float(np.mean(durations)) if durations else 30.0
        duration_std = float(np.std(durations))  if durations else 0.0

        # ── Last run ──────────────────────────────────────────────
        last_run_failed = (
            1 if runs[0].status == PipelineStatus.FAILED else 0
        )

        # ── Recency ───────────────────────────────────────────────
        cutoff_24h = now - timedelta(hours=24)
        runs_last_24h = sum(
            1 for r in runs if self._run_time(r) >= cutoff_24h
        )

        # Time since last run in hours
        last_run_time = self._run_time(runs[0])
        time_since_h  = (now - last_run_time).total_seconds() / 3600

        # ── Temporal features ─────────────────────────────────────
        hour_of_day  = now.hour
        day_of_week  = now.weekday()

        # ── Stage-specific failure rates ──────────────────────────
        stage_names = [
            "checkout", "install_dependencies", "lint",
            "unit_tests", "build", "deploy"
        ]
        stage_fail_rates = []
        for stage in stage_names:
            stage_runs   = [
                r for r in runs
                if r.failed_stage and stage in r.failed_stage.lower()
            ]
            fail_rate = len(stage_runs) / total if total > 0 else 0.0
            stage_fail_rates.append(fail_rate)

        features = np.array([
            total,
            failure_rate_all,
            failure_rate_7d,
            failure_rate_30d,
            consecutive_failures,
            consecutive_successes,
            avg_duration,
            duration_std,
            last_run_failed,
            len(runs_7d),
            runs_last_24h,
            hour_of_day,
            day_of_week,
            *stage_fail_rates,
            time_since_h,
        ], dtype=np.float32)

        return features

    def _zero_features(self, at_time: datetime) -> np.ndarray:
        """Return zero features for pipelines with no history."""
        features = np.zeros(N_FEATURES, dtype=np.float32)
        features[11] = at_time.hour       # hour_of_day
        features[12] = at_time.weekday()  # day_of_week
        return features

    def _run_time(self, run: PipelineRun) -> datetime:
        """Get run time with timezone."""
        t = run.created_at
        if t is None:
            return datetime.now(timezone.utc)
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        return t