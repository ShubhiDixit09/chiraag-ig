"""Read-only routing graph from the real September 2026 Central Delhi pilot dump.

The PostGIS database is preferred when available. This immutable snapshot is
used only when explicitly requested or when the database is unreachable. It
preserves the actual OSM walking network and audited/predicted/unknown evidence;
no paths, safety gains or geometry are invented.

This module never executes SQL. It reads only the existing road_segments COPY
data in chiraag_data.sql and ignores all other database dump contents.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import networkx as nx
from shapely import wkb

from app.services.graph_builder import _routing_bbox

SNAPSHOT_DATE = "2026-09-04"
SOURCE = "pilot_snapshot"

# .../igdtw_backend/app/services/snapshot_graph.py => .../igdtw_backend
DATA_PATH = Path(__file__).resolve().parents[2] / "chiraag_data.sql"
COPY_MARKER = "COPY public.road_segments ("


@lru_cache(maxsize=1)
def load_snapshot() -> tuple[dict, ...]:
    if not DATA_PATH.is_file():
        raise FileNotFoundError("Bundled CHIRAAG pilot road data is missing.")

    rows = []
    inside_roads = False
    with DATA_PATH.open("r", encoding="utf-8") as dump:
        for line in dump:
            if not inside_roads:
                if line.startswith(COPY_MARKER) and line.rstrip().endswith("FROM stdin;"):
                    inside_roads = True
                continue

            if line.rstrip() == r"\.":
                break
            if not line.strip():
                continue
            fields = line.rstrip("\n").split("\t")
            if len(fields) != 9:
                raise ValueError("Invalid road segment record in pilot snapshot.")

            def nullable_float(index: int) -> float | None:
                return None if fields[index] == r"\N" else float(fields[index])

            geom = wkb.loads(bytes.fromhex(fields[7]))
            if geom.is_empty or geom.geom_type != "LineString":
                continue
            coords = list(geom.coords)
            if len(coords) < 2:
                continue
            rows.append({
                "id": int(fields[0]),
                "osm_id": int(fields[1]),
                "length_m": float(fields[2]),
                "dark_fraction": nullable_float(3),
                "longest_gap_m": nullable_float(4),
                "calibrated_prob": nullable_float(5),
                "observation_state": fields[6],
                "geometry": geom,
                "start": tuple(coords[0]),
                "end": tuple(coords[-1]),
            })

    if not inside_roads or not rows:
        raise ValueError("No road segments found in bundled pilot snapshot.")
    return tuple(rows)


@lru_cache(maxsize=1)
def segment_lookup() -> dict[int, dict]:
    return {item["id"]: item for item in load_snapshot()}


def get_snapshot_segment(segment_id: int) -> dict | None:
    return segment_lookup().get(segment_id)


def build_graph_from_snapshot(
    origin_coords: tuple[float, float], dest_coords: tuple[float, float]
) -> nx.MultiDiGraph:
    min_lon, min_lat, max_lon, max_lat = _routing_bbox(origin_coords, dest_coords)
    G = nx.MultiDiGraph()

    for item in load_snapshot():
        # Fast bounding-box intersection; matches the PostGIS && filter.
        x1, y1, x2, y2 = item["geometry"].bounds
        if x2 < min_lon or x1 > max_lon or y2 < min_lat or y1 > max_lat:
            continue

        attrs = {
            "id": item["id"],
            "osm_id": item["osm_id"],
            "length_m": item["length_m"],
            "dark_fraction": item["dark_fraction"],
            "longest_gap_m": item["longest_gap_m"],
            "calibrated_prob": item["calibrated_prob"],
            "observation_state": item["observation_state"],
            "geometry": item["geometry"],
        }
        G.add_edge(item["start"], item["end"], **attrs)
        G.add_edge(item["end"], item["start"], **attrs)

    return G
