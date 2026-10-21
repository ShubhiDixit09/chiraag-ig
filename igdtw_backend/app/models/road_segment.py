from sqlalchemy import Column, Integer, BigInteger, Float, String, DateTime
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from app.db import Base  # Adjust import based on where your Base = declarative_base() lives

class RoadSegment(Base):
    __tablename__ = "road_segments"

    id = Column(Integer, primary_key=True, index=True)
    osm_id = Column(BigInteger, index=True, nullable=False)
    length_m = Column(Float, nullable=False)
    dark_fraction = Column(Float, default=0.0)
    longest_gap_m = Column(Float, default=0.0)
    calibrated_lighting_prob = Column(Float, default=0.5)
    observation_state = Column(String, default="unobserved")  # 'audited', 'predicted', or 'unobserved'
    geom = Column(Geometry(geometry_type="LINESTRING", srid=4326), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())