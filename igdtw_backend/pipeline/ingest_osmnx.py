import osmnx as ox
import geopandas as gpd
from sqlalchemy import create_engine, text

STAGING_TABLE = "_incoming_road_segments"


def _ensure_schema(engine):

    from app.db import Base
    import app.models  

    Base.metadata.create_all(bind=engine)


def ingest_osm(
    place_name="Piedmont, California, USA",
    db_url="postgresql://user:pass@localhost:5432/chiraag",
    center_point=None,   
    dist=1000,           
):

    if center_point is not None:
        G = ox.graph_from_point(center_point, dist=dist, network_type="walk")
    else:
        G = ox.graph_from_place(place_name, network_type="walk")

    _, gdf_edges = ox.graph_to_gdfs(G)

    gdf_edges = gdf_edges.reset_index()

    gdf_edges["_pair"] = [
        tuple(sorted(pair)) for pair in zip(gdf_edges["u"], gdf_edges["v"])
    ]
    gdf_edges = gdf_edges.drop_duplicates(subset=["_pair", "key"])
    gdf_edges = gdf_edges.drop(columns=["_pair"])

    edges = gdf_edges[['geometry', 'length', 'osmid']].copy()

    edges['osmid'] = edges['osmid'].apply(lambda x: x[0] if isinstance(x, list) else x)

    edges = edges.rename(columns={'length': 'length_m', 'osmid': 'osm_id'})
    edges = edges.rename_geometry('geom')

    print(f"  OSM returned {len(edges)} unique street segments.")

    engine = create_engine(db_url)

    _ensure_schema(engine)

    edges.to_postgis(STAGING_TABLE, engine, if_exists='replace', index=False)

    try:
        with engine.begin() as conn:
            existing_before = conn.execute(
                text("SELECT count(*) FROM road_segments")
            ).scalar()

            inserted = conn.execute(text(f"""
                INSERT INTO road_segments (osm_id, length_m, geom, observation_state)
                SELECT i.osm_id, i.length_m, i.geom, 'unobserved'
                FROM {STAGING_TABLE} AS i
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM road_segments AS r
                    WHERE r.geom && i.geom
                      AND ST_Equals(r.geom, i.geom)
                )
            """)).rowcount

            skipped = len(edges) - inserted

            print(
                f"  {existing_before} segments already in the database. "
                f"Inserted {inserted} new, skipped {skipped} duplicates."
            )

    finally:
        with engine.begin() as conn:
            conn.execute(text(f"DROP TABLE IF EXISTS {STAGING_TABLE}"))

