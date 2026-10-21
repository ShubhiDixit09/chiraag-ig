from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from geoalchemy2 import Geometry
from app.db import Base

class Streetlight(Base):
    __tablename__ = "streetlights"

    id = Column(Integer, primary_key=True, index=True)
    mapillary_id = Column(String, unique=True, index=True, nullable=True)
    geom = Column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())