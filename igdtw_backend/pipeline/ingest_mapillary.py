import time
import requests
import geopandas as gpd
from shapely.geometry import Point
from sqlalchemy import create_engine, text

MAPILLARY_URL = "https://graph.mapillary.com/map_features"


def _split_bbox(bbox):
    min_lon, min_lat, max_lon, max_lat = (float(v) for v in bbox.split(","))
    mid_lon = (min_lon + max_lon) / 2
    mid_lat = (min_lat + max_lat) / 2
    return [
        f"{min_lon},{min_lat},{mid_lon},{mid_lat}",
        f"{mid_lon},{min_lat},{max_lon},{mid_lat}",
        f"{min_lon},{mid_lat},{mid_lon},{max_lat}",
        f"{mid_lon},{mid_lat},{max_lon},{max_lat}",
    ]


def _fetch_tile(bbox, access_token, depth=0, max_depth=3):

    params = {
        "fields": "id,geometry",
        "object_value": "object--street-light",
        "bbox": bbox,
    }
    headers = {"Authorization": f"OAuth {access_token}"}

    try:
        response = requests.get(
            MAPILLARY_URL, params=params, headers=headers, timeout=60
        )
        status = response.status_code
    except requests.RequestException as exc:
        print(f"  request error on {bbox}: {exc}")
        response, status = None, "network error"

    if response is not None and status == 200:
        data = response.json().get("data", [])
        print(f"  {bbox} -> {len(data)} features")
        if len(data) >= 2000:
            print("    (near result cap -- subdividing to avoid truncation)")
        else:
            return data
    elif depth >= max_depth:
        print(f"  giving up on {bbox} (HTTP {status})")
        return []
    else:
        print(f"  HTTP {status} on {bbox} -- subdividing")

    if depth >= max_depth:
        return data if response is not None and status == 200 else []

    features = []
    for sub in _split_bbox(bbox):
        time.sleep(0.3)
        features.extend(_fetch_tile(sub, access_token, depth + 1, max_depth))
    return features


def ingest_mapillary(bbox, access_token, db_url):
    print(f"Fetching street lights for bbox {bbox} (auto-tiling as needed)...")
    raw_data = _fetch_tile(bbox, access_token)
    print(f"Mapillary returned {len(raw_data)} street-light features total")

    # Overlapping tiles can return the same feature twice.
    features, seen = [], set()
    for item in raw_data:
        mid = str(item["id"])
        if mid in seen:
            continue
        seen.add(mid)
        coords = item["geometry"]["coordinates"]
        features.append({
            "mapillary_id": mid,
            "geometry": Point(coords[0], coords[1]),
        })

    if not features:
        print("No streetlight features to insert -- skipping DB write.")
        return

    engine = create_engine(db_url)

    with engine.connect() as conn:
        existing_ids = {
            str(row[0])
            for row in conn.execute(text("SELECT mapillary_id FROM streetlights"))
        }

    new_features = [f for f in features if f["mapillary_id"] not in existing_ids]
    skipped = len(features) - len(new_features)
    if skipped:
        print(f"Skipping {skipped} street lights already in the database.")

    if not new_features:
        print("Nothing new to insert -- all features already exist.")
        return

    gdf = gpd.GeoDataFrame(new_features, geometry="geometry", crs="EPSG:4326")
    gdf = gdf.rename_geometry("geom")
    gdf.to_postgis("streetlights", engine, if_exists="append", index=False)
    print(f"Inserted {len(new_features)} new street lights.")