from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.route import RouteRequest, RouteResponse
from app.services.graph_builder import build_graph_from_db
from app.services.routing import find_optimal_route


router = APIRouter(
    prefix="/api/v1",
    tags=["Routing"],
)


@router.post(
    "/route",
    response_model=RouteResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute dark-exposure minimized route",
)
def compute_route(
    payload: RouteRequest,
    db: Session = Depends(get_db),
):


    try:

        origin_coords = (
            payload.origin.lon,
            payload.origin.lat,
        )

        dest_coords = (
            payload.destination.lon,
            payload.destination.lat,
        )


        G = build_graph_from_db(
            db,
            origin_coords=origin_coords,
            dest_coords=dest_coords,
        )

        if G.number_of_nodes() == 0:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Road network graph is empty. "
                    "Please run the ingestion pipeline first."
                ),
            )

        return find_optimal_route(
            G=G,
            origin_coords=origin_coords,
            dest_coords=dest_coords,
            alpha=payload.alpha,
            unknown_policy=payload.unknown_policy,
            hour=payload.hour,
        )

    except HTTPException:
        raise 

    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Routing failure: {str(e)}",
        )