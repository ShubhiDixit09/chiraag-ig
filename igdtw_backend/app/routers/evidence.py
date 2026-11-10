"""Road evidence endpoints. Pilot snapshots are explicitly read-only."""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.road_segment import RoadSegment
from app.models.night_audit import NightAudit
from app.schemas.evidence import SegmentEvidence, AuditSubmission, DarkGapItem, DarkGapsResponse
from app.routers.route import snapshot_only
from app.services.snapshot_graph import (
    SNAPSHOT_DATE,
    SOURCE,
    get_snapshot_segment,
    get_snapshot_dark_gaps,
)

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/api/v1/evidence", tags=["Evidence & Audits"])


def snapshot_evidence(segment_id: int) -> dict:
    row = get_snapshot_segment(segment_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Road segment not found in the pilot snapshot")
    return {
        "data_source": SOURCE,
        "snapshot_date": SNAPSHOT_DATE,
        "road_id": row["id"],
        "length_m": row["length_m"],
        "dark_fraction": row["dark_fraction"],
        "longest_gap_m": row["longest_gap_m"],
        "calibrated_lighting_prob": row["calibrated_prob"],
        "observation_state": row["observation_state"],
    }


@router.get(
    "/segment/{segment_id}",
    response_model=SegmentEvidence,
    summary="Get a segment's lighting evidence and source",
)
def get_segment_evidence(segment_id: int, db: Session = Depends(get_db)):
    if snapshot_only():
        return snapshot_evidence(segment_id)
    try:
        row = db.query(RoadSegment).filter(RoadSegment.id == segment_id).first()
        if row is None:
            raise HTTPException(status_code=404, detail="Road segment not found")
        return SegmentEvidence(
            data_source="live_postgis",
            road_id=row.id,
            length_m=row.length_m,
            dark_fraction=row.dark_fraction,
            longest_gap_m=row.longest_gap_m,
            calibrated_lighting_prob=row.calibrated_lighting_prob,
            observation_state=row.observation_state,
        )
    except SQLAlchemyError as error:
        logger.warning("Evidence database unavailable (%s), using pilot snapshot",
                       type(error).__name__)
        return snapshot_evidence(segment_id)


@router.get(
    "/dark-gaps",
    response_model=DarkGapsResponse,
    summary="Get ranked list of worst continuous dark gaps for municipal infrastructure repair priority",
)
def get_dark_gaps(
    min_gap_m: float = 50.0,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    if snapshot_only():
        gaps = get_snapshot_dark_gaps(min_gap_m=min_gap_m, limit=limit)
        return DarkGapsResponse(
            data_source=SOURCE,
            snapshot_date=SNAPSHOT_DATE,
            min_gap_m=min_gap_m,
            total_gaps_found=len(gaps),
            gaps=gaps,
        )

    try:
        from geoalchemy2.shape import to_shape

        query = (
            db.query(RoadSegment)
            .filter(RoadSegment.longest_gap_m.isnot(None))
            .filter(RoadSegment.longest_gap_m >= min_gap_m)
            .order_by(RoadSegment.longest_gap_m.desc())
        )
        if limit and limit > 0:
            query = query.limit(limit)

        rows = query.all()
        results = []
        for rank, row in enumerate(rows, 1):
            geom = to_shape(row.geom)
            centroid = geom.centroid
            results.append(
                DarkGapItem(
                    road_id=row.id,
                    osm_id=row.osm_id,
                    length_m=round(float(row.length_m), 1),
                    longest_gap_m=round(float(row.longest_gap_m), 1),
                    dark_fraction=round(float(row.dark_fraction or 0.0), 3),
                    observation_state=row.observation_state,
                    center=[round(float(centroid.x), 6), round(float(centroid.y), 6)],
                    coordinates=[[round(float(x), 6), round(float(y), 6)] for x, y in geom.coords],
                    priority_rank=rank,
                )
            )

        return DarkGapsResponse(
            data_source="live_postgis",
            min_gap_m=min_gap_m,
            total_gaps_found=len(results),
            gaps=results,
        )
    except (SQLAlchemyError, Exception) as error:
        logger.warning(
            "Evidence database unavailable (%s), using pilot snapshot for dark gaps",
            type(error).__name__,
        )
        gaps = get_snapshot_dark_gaps(min_gap_m=min_gap_m, limit=limit)
        return DarkGapsResponse(
            data_source=SOURCE,
            snapshot_date=SNAPSHOT_DATE,
            min_gap_m=min_gap_m,
            total_gaps_found=len(gaps),
            gaps=gaps,
        )


@router.post(
    "/audit",
    status_code=status.HTTP_201_CREATED,
    summary="Submit live ground-truth night audit; unavailable in snapshot mode",
)
def submit_night_audit(audit: AuditSubmission, db: Session = Depends(get_db)):
    if snapshot_only():
        raise HTTPException(
            status_code=503,
            detail="Night audits are disabled in read-only pilot snapshot mode.",
        )

    try:
        segment = db.query(RoadSegment).filter(
            RoadSegment.id == audit.road_segment_id
        ).first()
        if segment is None:
            raise HTTPException(status_code=404, detail="Target road segment not found")

        new_audit = NightAudit(
            road_segment_id=audit.road_segment_id,
            rating=audit.rating,
            observed_light_count=audit.observed_light_count,
        )
        db.add(new_audit)
        db.flush()
        average = db.query(func.avg(NightAudit.rating)).filter(
            NightAudit.road_segment_id == audit.road_segment_id
        ).scalar()
        segment.dark_fraction = max(
            0.0, min(1.0, 1.0 - float(average) / 5.0)
        )
        segment.longest_gap_m = None
        segment.observation_state = "audited"
        db.commit()
        db.refresh(new_audit)
        return {
            "message": "Night audit recorded successfully",
            "audit_id": new_audit.id,
            "dark_fraction": segment.dark_fraction,
            "observation_state": segment.observation_state,
        }

    except SQLAlchemyError as error:
        db.rollback()
        logger.error("Night audit write unavailable (%s)", type(error).__name__)
        raise HTTPException(
            status_code=503,
            detail="Live night audits unavailable while the database is offline.",
        ) from None
