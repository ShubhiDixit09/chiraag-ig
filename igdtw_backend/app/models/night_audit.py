from sqlalchemy import Column, Integer, Float, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.db import Base

class NightAudit(Base):
    __tablename__ = "night_audits"

    id = Column(Integer, primary_key=True, index=True)
    road_segment_id = Column(Integer, ForeignKey("road_segments.id", ondelete="CASCADE"), nullable=False)
    rating = Column(Float, nullable=False)  # Human ground-truth safety/brightness rating (e.g. 0.0 to 5.0)
    observed_light_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())