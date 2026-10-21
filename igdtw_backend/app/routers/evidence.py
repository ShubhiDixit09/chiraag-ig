from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.db import get_db
from app.models.road_segment import RoadSegment
from app.models.night_audit import NightAudit
from app.schemas.evidence import SegmentEvidence, AuditSubmission
from sqlalchemy import func

router = APIRouter(
    prefix="/api/v1/evidence",
    tags=["Evidence & Audits"]
)

@router.get(
    "/segment/{segment_id}",
    response_model=SegmentEvidence,
    summary="Get lighting safety details for a specific road segment"
)
def get_segment_evidence(segment_id: int, db: Session = Depends(get_db)):
    segment = db.query(RoadSegment).filter(RoadSegment.id == segment_id).first()
    if not segment:
        raise HTTPException(status_code=404, detail="Road segment not found")

    light_count = db.execute(
        text("""
            SELECT count(*)
            FROM streetlights s, road_segments r
            WHERE r.id = :segment_id
              AND ST_DWithin(s.geom::geography, r.geom::geography, 25)
        """),
        {"segment_id": segment_id},
    ).scalar() or 0

    return SegmentEvidence(
        road_id=segment.id,
        length_m=segment.length_m,
        dark_fraction=segment.dark_fraction,
        longest_gap_m=segment.longest_gap_m,
        calibrated_lighting_prob=segment.calibrated_lighting_prob,
        light_count=light_count,
        observation_state=segment.observation_state,
    )

@router.post(
    "/audit",
    status_code=status.HTTP_201_CREATED,
    summary="Submit ground-truth night audit rating"
)
def submit_night_audit(audit: AuditSubmission, db: Session = Depends(get_db)):
    segment = db.query(RoadSegment).filter(RoadSegment.id == audit.road_segment_id).first()
    if not segment:
        raise HTTPException(status_code=404, detail="Target road segment not found")
        
    new_audit = NightAudit(
        road_segment_id=audit.road_segment_id,
        rating=audit.rating,
        observed_light_count=audit.observed_light_count
    )

    db.add(new_audit)
    db.flush()

    average_rating = db.query(func.avg(NightAudit.rating)).filter(
        NightAudit.road_segment_id == audit.road_segment_id
    ).scalar()

    segment.dark_fraction = max(0.0, min(1.0, 1.0 - (float(average_rating) / 5.0)))

    segment.longest_gap_m = None

    segment.observation_state = "audited"

    db.commit()
    db.refresh(new_audit)

    return {
        "message": "Night audit recorded successfully",
        "audit_id": new_audit.id,
        "dark_fraction": segment.dark_fraction,
        "observation_state": segment.observation_state
    }
    
    return {"message": "Night audit recorded successfully", "audit_id": new_audit.id}