# risk_model.py
# The actual ML model for pipeline failure prediction.
#
# Architecture:
# - RandomForestClassifier (100 trees, balanced classes)
# - Falls back to weighted heuristic if not enough training data
# - Model persisted to disk with joblib
# - Retrains when new data arrives
#
# Why RandomForest?
# - Handles small datasets well (we may only have 20-50 runs)
# - No need for feature scaling
# - Built-in feature importance (we can explain predictions)
# - Resistant to overfitting with small data

import os
import logging
import numpy as np
import joblib
from datetime import datetime, timezone
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# Where the trained model is saved
MODEL_DIR  = Path(__file__).parent / "saved_models"
MODEL_PATH = MODEL_DIR / "risk_model.joblib"
META_PATH  = MODEL_DIR / "risk_model_meta.joblib"

# Minimum runs needed before we trust the ML model
MIN_TRAINING_SAMPLES = 10


class RiskMLModel:
    """
    RandomForest-based pipeline failure predictor.

    Usage:
        model = RiskMLModel()
        prob  = model.predict_failure_probability(features)
        # Returns float between 0.0 and 1.0
    """

    def __init__(self):
        self.model      = None
        self.is_trained = False
        self.meta       = {}
        self._load()

    def predict_failure_probability(
        self, features: np.ndarray
    ) -> tuple[float, float, bool]:
        """
        Predict the probability of failure for a pipeline.

        Returns:
            (probability, confidence, used_ml)
            - probability: 0.0 to 1.0
            - confidence:  how confident the model is
            - used_ml:     True if ML model was used, False if fallback
        """
        if not self.is_trained:
            # Not enough data yet — use simple heuristic
            prob = self._heuristic_fallback(features)
            return prob, 0.5, False

        try:
            features_2d = features.reshape(1, -1)
            # Get probability of class 1 (failure)
            proba = self.model.predict_proba(features_2d)[0]
            prob  = float(proba[1]) if len(proba) > 1 else float(proba[0])

            # Confidence = how far from 0.5 (uncertain)
            confidence = abs(prob - 0.5) * 2

            return prob, confidence, True

        except Exception as e:
            logger.error(f"ML prediction failed: {e}")
            return self._heuristic_fallback(features), 0.3, False

    def train(
        self,
        X: list,
        y: list,
        pipeline_id: Optional[int] = None,
    ) -> dict:
        """
        Train or retrain the model on new data.

        Args:
            X: List of feature arrays
            y: List of labels (1=failure, 0=success)
            pipeline_id: Optional pipeline ID for logging

        Returns:
            Training metrics dict
        """
        if len(X) < MIN_TRAINING_SAMPLES:
            logger.info(
                f"Not enough samples to train: {len(X)} < {MIN_TRAINING_SAMPLES}. "
                f"Need more pipeline runs."
            )
            return {
                "status":  "insufficient_data",
                "samples": len(X),
                "needed":  MIN_TRAINING_SAMPLES,
            }

        from sklearn.ensemble import RandomForestClassifier
        from sklearn.model_selection import cross_val_score
        from sklearn.preprocessing import StandardScaler

        X_arr = np.array(X, dtype=np.float32)
        y_arr = np.array(y, dtype=np.int32)

        failure_count = int(y_arr.sum())
        success_count = len(y_arr) - failure_count

        logger.info(
            f"Training ML model on {len(X)} samples | "
            f"failures={failure_count} successes={success_count}"
        )

        # RandomForest with class balancing for imbalanced data
        self.model = RandomForestClassifier(
            n_estimators=100,
            max_depth=8,
            min_samples_leaf=2,
            class_weight="balanced",  # Handle imbalanced failure/success ratio
            random_state=42,
            n_jobs=-1,
        )
        self.model.fit(X_arr, y_arr)
        self.is_trained = True

        # Cross-validation score (if enough samples)
        cv_score = 0.0
        if len(X) >= 20:
            try:
                scores   = cross_val_score(
                    self.model, X_arr, y_arr,
                    cv=min(5, len(X) // 4),
                    scoring="roc_auc",
                )
                cv_score = float(scores.mean())
            except Exception as e:
                logger.warning(f"CV scoring failed: {e}")

        # Feature importances
        importances = {}
        from app.ml.feature_extractor import FEATURE_NAMES
        for name, imp in zip(
            FEATURE_NAMES, self.model.feature_importances_
        ):
            importances[name] = round(float(imp), 4)

        # Sort by importance
        importances = dict(
            sorted(importances.items(), key=lambda x: x[1], reverse=True)
        )

        self.meta = {
            "trained_at":        datetime.now(timezone.utc).isoformat(),
            "training_samples":  len(X),
            "failure_samples":   failure_count,
            "success_samples":   success_count,
            "cv_auc_score":      round(cv_score, 4),
            "feature_importances": importances,
            "pipeline_id":       pipeline_id,
        }

        self._save()

        logger.info(
            f"Model trained successfully | "
            f"samples={len(X)} cv_auc={cv_score:.3f}"
        )

        return {
            "status":   "trained",
            "samples":  len(X),
            "cv_auc":   cv_score,
            "top_features": dict(list(importances.items())[:5]),
        }

    def get_feature_importances(self) -> dict:
        """Return feature importances if model is trained."""
        if not self.is_trained:
            return {}
        return self.meta.get("feature_importances", {})

    def get_meta(self) -> dict:
        """Return model metadata."""
        return {
            **self.meta,
            "is_trained": self.is_trained,
            "model_path": str(MODEL_PATH),
        }

    def _heuristic_fallback(self, features: np.ndarray) -> float:
        """
        Simple weighted heuristic when model not trained yet.
        Same logic as the old RiskEngine.
        """
        if len(features) < 4:
            return 0.3

        failure_rate_all = float(features[1]) if len(features) > 1 else 0.3
        failure_rate_7d  = float(features[2]) if len(features) > 2 else failure_rate_all
        consecutive_fail = float(features[4]) if len(features) > 4 else 0.0
        last_run_failed  = float(features[8]) if len(features) > 8 else 0.0

        streak_score = min(consecutive_fail / 5.0, 1.0)

        score = (
            failure_rate_all * 0.35 +
            failure_rate_7d  * 0.30 +
            last_run_failed  * 0.20 +
            streak_score     * 0.15
        )
        return min(max(score, 0.0), 1.0)

    def _save(self) -> None:
        """Save model and metadata to disk."""
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.model, MODEL_PATH)
        joblib.dump(self.meta,  META_PATH)
        logger.info(f"Model saved to {MODEL_PATH}")

    def _load(self) -> None:
        """Load model from disk if it exists."""
        if MODEL_PATH.exists() and META_PATH.exists():
            try:
                self.model      = joblib.load(MODEL_PATH)
                self.meta       = joblib.load(META_PATH)
                self.is_trained = True
                logger.info(
                    f"ML model loaded from disk | "
                    f"samples={self.meta.get('training_samples', '?')} "
                    f"auc={self.meta.get('cv_auc_score', '?')}"
                )
            except Exception as e:
                logger.warning(f"Could not load model: {e}")
                self.is_trained = False


# ── Singleton instance ────────────────────────────────────────────
# One model instance shared across all requests
_model_instance: Optional[RiskMLModel] = None


def get_model() -> RiskMLModel:
    """Get or create the singleton ML model instance."""
    global _model_instance
    if _model_instance is None:
        _model_instance = RiskMLModel()
    return _model_instance