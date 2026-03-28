# risk_engine.py — Phase 15: Now uses ML model for predictions
# Falls back to weighted heuristic when model not trained yet.

import logging
from dataclasses import dataclass
from typing import List
from sqlalchemy.orm import Session
from app.models.pipeline import Pipeline, PipelineRun, PipelineStatus

logger = logging.getLogger(__name__)


@dataclass
class RiskFactor:
    name: str
    score: float
    weight: float
    description: str


@dataclass
class RiskAssessment:
    pipeline_id: int
    risk_score: float
    risk_level: str
    confidence: float
    factors: List[RiskFactor]
    recommendation: str
    based_on_runs: int
    used_ml: bool = False


def _risk_level(score: float) -> str:
    if score >= 0.75: return "critical"
    if score >= 0.50: return "high"
    if score >= 0.25: return "medium"
    return "low"


def _recommendation(score: float, used_ml: bool) -> str:
    source = "ML model" if used_ml else "heuristic analysis"
    if score >= 0.75:
        return f"Critical risk ({source}). Recommend code review before running."
    if score >= 0.50:
        return f"High risk ({source}). Check recent failures and test locally first."
    if score >= 0.25:
        return f"Moderate risk ({source}). Monitor this run closely."
    return f"Low risk ({source}). Pipeline looks healthy."


class RiskEngine:
    """
    Predicts pipeline failure probability.
    Uses ML model when trained, falls back to weighted heuristic.
    """

    def __init__(self, db: Session):
        self.db = db

    def assess(self, pipeline_id: int) -> RiskAssessment:
        runs = (
            self.db.query(PipelineRun)
            .filter(PipelineRun.pipeline_id == pipeline_id)
            .order_by(PipelineRun.created_at.desc())
            .limit(50)
            .all()
        )

        if not runs:
            return RiskAssessment(
                pipeline_id=pipeline_id,
                risk_score=0.3,
                risk_level="medium",
                confidence=0.1,
                factors=[RiskFactor(
                    name="No History",
                    score=0.3,
                    weight=1.0,
                    description="No run history — using default risk score"
                )],
                recommendation="No history yet. Risk is unknown.",
                based_on_runs=0,
                used_ml=False,
            )

        # Try ML model first
        try:
            from app.ml.feature_extractor import FeatureExtractor
            from app.ml.risk_model import get_model

            extractor  = FeatureExtractor(self.db)
            features   = extractor.extract(pipeline_id)
            model      = get_model()
            prob, conf, used_ml = model.predict_failure_probability(features)

            # Build human-readable factors from feature importances
            factors = self._build_factors_from_features(
                features, runs, used_ml
            )

            return RiskAssessment(
                pipeline_id=pipeline_id,
                risk_score=round(prob, 3),
                risk_level=_risk_level(prob),
                confidence=round(conf, 3),
                factors=factors,
                recommendation=_recommendation(prob, used_ml),
                based_on_runs=len(runs),
                used_ml=used_ml,
            )

        except Exception as e:
            logger.error(f"ML risk assessment failed: {e} — using heuristic")
            return self._heuristic_assess(pipeline_id, runs)

    def _build_factors_from_features(
        self, features, runs, used_ml: bool
    ) -> List[RiskFactor]:
        """Build human-readable risk factors from ML features."""
        total   = len(runs)
        failed  = sum(1 for r in runs if r.status == PipelineStatus.FAILED)
        failure_rate = failed / total if total > 0 else 0.0

        # Streak
        streak = 0
        for r in runs:
            if r.status == PipelineStatus.FAILED:
                streak += 1
            else:
                break

        factors = [
            RiskFactor(
                name="Historical Failure Rate",
                score=round(failure_rate, 3),
                weight=0.35,
                description=(
                    f"{failed}/{total} runs failed "
                    f"({round(failure_rate * 100)}%)"
                ),
            ),
            RiskFactor(
                name="Recent Trend",
                score=round(float(features[2]), 3),
                weight=0.30,
                description=(
                    f"7-day failure rate: "
                    f"{round(float(features[2]) * 100)}%"
                ),
            ),
            RiskFactor(
                name="Last Run Status",
                score=round(float(features[8]), 3),
                weight=0.15,
                description=(
                    "Last run failed" if float(features[8]) > 0.5
                    else "Last run succeeded"
                ),
            ),
            RiskFactor(
                name="Failure Streak",
                score=round(min(streak / 5.0, 1.0), 3),
                weight=0.10,
                description=(
                    f"{streak} consecutive failure(s)"
                    if streak > 0
                    else "No current streak"
                ),
            ),
        ]

        if used_ml:
            factors.append(RiskFactor(
                name="ML Model",
                score=1.0,
                weight=0.0,
                description="Prediction from trained RandomForest model",
            ))

        return factors

    def _heuristic_assess(
        self, pipeline_id: int, runs: list
    ) -> RiskAssessment:
        """Original weighted heuristic fallback."""
        total  = len(runs)
        failed = sum(1 for r in runs if r.status == PipelineStatus.FAILED)
        failure_rate = failed / total if total > 0 else 0.0

        recent = runs[:5]
        recent_fails = sum(
            1 for r in recent if r.status == PipelineStatus.FAILED
        )
        recent_trend = recent_fails / len(recent) if recent else 0.0

        last_failed = (
            1.0 if runs[0].status == PipelineStatus.FAILED else 0.0
        )

        streak = 0
        for r in runs:
            if r.status == PipelineStatus.FAILED:
                streak += 1
            else:
                break

        import numpy as np
        durations = [
            r.duration_seconds for r in runs
            if r.duration_seconds is not None
        ]
        duration_anomaly = 0.0
        if len(durations) >= 3:
            mean_d = float(np.mean(durations))
            std_d  = float(np.std(durations))
            last_d = durations[0] if durations else mean_d
            if std_d > 0:
                z = abs(last_d - mean_d) / std_d
                duration_anomaly = min(z / 3.0, 1.0)

        streak_score = min(streak / 5.0, 1.0)

        risk_score = (
            failure_rate     * 0.35 +
            recent_trend     * 0.30 +
            last_failed      * 0.15 +
            duration_anomaly * 0.10 +
            streak_score     * 0.10
        )

        factors = [
            RiskFactor("Historical Failure Rate", round(failure_rate, 3),
                       0.35, f"{failed}/{total} runs failed"),
            RiskFactor("Recent Trend", round(recent_trend, 3),
                       0.30, f"{recent_fails}/5 recent runs failed"),
            RiskFactor("Last Run Status", round(last_failed, 3),
                       0.15, "Last run failed" if last_failed else "Last run succeeded"),
            RiskFactor("Duration Anomaly", round(duration_anomaly, 3),
                       0.10, "Duration is abnormal" if duration_anomaly > 0.5 else "Duration is normal"),
            RiskFactor("Failure Streak", round(streak_score, 3),
                       0.10, f"{streak} consecutive failure(s)"),
        ]

        conf = min(total / 20.0, 1.0)
        return RiskAssessment(
            pipeline_id=pipeline_id,
            risk_score=round(risk_score, 3),
            risk_level=_risk_level(risk_score),
            confidence=round(conf, 3),
            factors=factors,
            recommendation=_recommendation(risk_score, False),
            based_on_runs=total,
            used_ml=False,
        )