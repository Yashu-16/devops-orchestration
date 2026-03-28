# ml.py routes
# Endpoints for ML model management:
# - Train the model
# - Get model status and metrics
# - Get feature importances

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.pipeline import User
from app.core.auth import get_current_user
from app.ml.trainer import ModelTrainer
from app.ml.risk_model import get_model

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/ml/train", tags=["ML"])
def train_model(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Train or retrain the ML risk model.
    Uses run history from all pipelines in the database.
    Requires at least 10 pipeline runs to train.
    """
    trainer = ModelTrainer(db)
    result  = trainer.train_global_model()
    return result


@router.get("/ml/status", tags=["ML"])
def get_model_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get current ML model status and training metrics.
    Shows whether the model is trained, how many samples it used,
    and its cross-validation AUC score.
    """
    from app.models.pipeline import PipelineRun
    model = get_model()
    meta  = model.get_meta()

    total_runs = db.query(PipelineRun).count()
    trainer    = ModelTrainer(db)
    needs_retrain = trainer.should_retrain()

    return {
        **meta,
        "total_runs_in_db": total_runs,
        "needs_retrain":    needs_retrain,
        "min_runs_needed":  10,
    }


@router.get("/ml/feature-importance", tags=["ML"])
def get_feature_importance(
    current_user: User = Depends(get_current_user),
):
    """
    Get feature importances from the trained model.
    Shows which features most influence the risk prediction.
    Higher = more important.
    """
    model       = get_model()
    importances = model.get_feature_importances()

    if not importances:
        raise HTTPException(
            status_code=400,
            detail="Model not trained yet. Call POST /ml/train first."
        )

    return {
        "feature_importances": importances,
        "interpretation": {
            "failure_rate_7d":      "Recent failure rate is most predictive",
            "consecutive_failures": "Current streak strongly predicts next failure",
            "last_run_failed":      "Recent failure is a strong signal",
            "failure_rate_all":     "Long-term track record",
        }
    }


@router.post("/ml/auto-train", tags=["ML"])
def auto_train_if_needed(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrain the model only if enough new data has accumulated.
    Call this periodically (e.g. after every 10 new runs).
    """
    trainer = ModelTrainer(db)
    if trainer.should_retrain():
        result = trainer.train_global_model()
        return {"retrained": True, **result}
    else:
        model = get_model()
        meta  = model.get_meta()
        return {
            "retrained": False,
            "reason":    "Not enough new runs since last training",
            "last_trained": meta.get("trained_at"),
        }