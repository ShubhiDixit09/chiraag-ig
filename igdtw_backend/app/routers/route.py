"""Lighting-aware route calculation with transparent pilot-data failover."""
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.route import RouteRequest, RouteResponse
from app.services.graph_builder import build_graph_from_db
from app.services.routing import find_optimal_route
from app.services.snapshot_graph import SNAPSHOT_DATE, SOURCE, build_graph_from_snapshot

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/api/v1", tags=["Routing"])


def snapshot_only() -> bool:
    return os.getenv("CHIRAAG_SNAPSHOT_ONLY", "").lower() in {"1", "true", "yes"}


@router.post(
    "/route",
    response_model=RouteResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute a dark-exposure-minimized walking route",
)
def compute_route(payload: RouteRequest, db: Session = Depends(get_db)):
    origin = (payload.origin.lon, payload.origin.lat)
    destination = (payload.destination.lon, payload.destination.lat)

    try:
        if snapshot_only():
            G = build_graph_from_snapshot(origin, destination)
            source = SOURCE
        else:
            try:
                G = build_graph_from_db(
                    db, origin_coords=origin, dest_coords=destination
                )
                source = "live_postgis"
            except SQLAlchemyError as error:
                # The live Supabase pooler has previously rejected the tenant.
                # A genuine immutable road dataset is safer than a fabricated
                # route or exposing SQLAlchemy's credential-bearing exception.
                logger.warning(
                    "Live PostGIS route graph unavailable (%s); using dated pilot snapshot",
                    type(error).__name__,
                )
                G = build_graph_from_snapshot(origin, destination)
                source = SOURCE

        if G.number_of_nodes() == 0:
            raise HTTPException(
                status_code=503,
                detail="No mapped streets found in this pilot region.",
            )

        answer = find_optimal_route(
            G=G,
            origin_coords=origin,
            dest_coords=destination,
            alpha=payload.alpha,
            unknown_policy=payload.unknown_policy,
            hour=payload.hour,
        )
        answer["data_source"] = source
        answer["snapshot_date"] = SNAPSHOT_DATE if source == SOURCE else None
        return answer

    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from None
    except (SQLAlchemyError, FileNotFoundError) as error:
        logger.error("CHIRAAG routing storage failed (%s)", type(error).__name__)
        raise HTTPException(
            status_code=503,
            detail="Routing data is unavailable. Please retry later.",
        ) from None
    except Exception as error:
        logger.error("CHIRAAG routing failed (%s)", type(error).__name__)
        raise HTTPException(
            status_code=500,
            detail="Route calculation failed. Please retry later.",
        ) from None
