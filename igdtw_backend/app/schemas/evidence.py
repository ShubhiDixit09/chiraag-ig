from pydantic import BaseModel, Field

class SegmentEvidence(BaseModel):
    road_id: int
    length_m: float

    # NULL for unobserved segments -- most of the network. Never coerce
    # these to 0.0: "no evidence" is not "no darkness".
    dark_fraction: float | None = None
    longest_gap_m: float | None = None
    calibrated_lighting_prob: float | None = None

    observation_state: str

class AuditSubmission(BaseModel):
    road_segment_id: int
    rating: float = Field(..., ge=0.0, le=5.0, description="0 = pitch dark, 5 = well lit")
    observed_light_count: int = Field(default=0, ge=0)