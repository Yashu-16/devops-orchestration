# trainer.py
# Handles model training and retraining.
# Called:
# 1. Manually via API endpoint
# 2. Automatically after every N pipeline runs
# 3. On a schedule (weekly)

import logging
from sqlalchemy.orm import Session
from app.models.pipeline import Pipeline, PipelineRun
from app.ml.feature_extractor import FeatureExtractor
from app.ml.risk_model import get_model

logger = logging.getLogger(__name__)


class ModelTrainer:
    """
    Orchestrates ML model training across all pipelines.
    Collects training data from all pipelines and trains a single model.
    """

    def __init__(self, db: Session):
        self.db = db

    def train_global_model(self) -> dict:
        """
        Train the model on data from ALL pipelines in the database.
        This creates a general model that understands failure patterns
        across different pipeline types.
        """
        extractor = FeatureExtractor(self.db)
        model     = get_model()

        all_X, all_y = [], []

        # Collect training data from every pipeline
        pipelines = self.db.query(Pipeline).all()

        for pipeline in pipelines:
            run_count = (
                self.db.query(PipelineRun)
                .filter(PipelineRun.pipeline_id == pipeline.id)
                .count()
            )

            if run_count < 5:
                logger.debug(
                    f"Skipping pipeline {pipeline.id} — "
                    f"only {run_count} runs"
                )
                continue

            X, y = extractor.extract_batch(pipeline.id)
            all_X.extend(X)
            all_y.extend(y)

            logger.debug(
                f"Pipeline {pipeline.name}: "
                f"extracted {len(X)} training samples"
            )

        total_samples = len(all_X)
        logger.info(
            f"Training global model on {total_samples} samples "
            f"from {len(pipelines)} pipelines"
        )

        if total_samples == 0:
            return {
                "status":  "no_data",
                "message": "No training data found. Run more pipelines first.",
                "pipelines_checked": len(pipelines),
            }

        result = model.train(all_X, all_y)
        result["pipelines_used"] = len(pipelines)
        result["total_samples"]  = total_samples

        return result

    def should_retrain(self, min_new_runs: int = 10) -> bool:
        """
        Check if enough new runs have accumulated to justify retraining.
        Returns True if we should retrain.
        """
        model      = get_model()
        meta       = model.get_meta()
        trained_at = meta.get("trained_at")

        if not trained_at:
            total_runs = self.db.query(PipelineRun).count()
            return total_runs >= 10

        from datetime import datetime, timezone
        last_trained = datetime.fromisoformat(trained_at)
        if last_trained.tzinfo is None:
            last_trained = last_trained.replace(tzinfo=timezone.utc)

        # Count runs since last training
        new_runs = (
            self.db.query(PipelineRun)
            .filter(PipelineRun.created_at > last_trained)
            .count()
        )

        logger.debug(f"New runs since last training: {new_runs}")
        return new_runs >= min_new_runs