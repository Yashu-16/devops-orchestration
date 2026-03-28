# real_pipeline_service.py
# Placeholder — full implementation added when needed
# This allows the backend to start without the real pipeline executor

from app.services.pipeline_service import PipelineService
from app.models.pipeline import Pipeline, PipelineRun
from sqlalchemy.orm import Session


class RealPipelineService:
    """
    Wraps the simulated pipeline service.
    Replace with real execution logic when ready.
    """

    def __init__(self, db: Session):
        self.db = db
        self._sim = PipelineService(db)

    def execute_pipeline(
        self, pipeline: Pipeline, triggered_by: str = "manual"
    ) -> PipelineRun:
        return self._sim.execute_pipeline(pipeline, triggered_by)