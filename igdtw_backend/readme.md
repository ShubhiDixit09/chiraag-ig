# CHIRAAG Routing Engine (`igdtw_backend`)

A FastAPI + PostGIS backend that computes safer, better-lit walking routes.
It scores street segments by lighting coverage (using OpenStreetMap street
geometry and Mapillary streetlight detections) and serves a routing API that
trades a small amount of extra distance for a meaningfully darker-free route.

---

## Prerequisites

Only one thing is required on your machine:

- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** — installed and running.

No local Python, Anaconda, or GDAL/geospatial setup is needed. Everything
(including the data-ingestion pipeline) runs inside containers.

---

## Setup

**1. Clone the repo and switch to this branch**
```bash
git clone https://github.com/sargupta1803/CHIRAAG.git
cd CHIRAAG
git checkout vidit-backend
cd igdtw_backend
```

**2. Create your `.env` file**

This file is intentionally not committed to the repo. Create
`igdtw_backend/.env` with:
```dotenv
PROJECT_NAME="CHIRAAG Routing Engine"
API_V1_STR="/api/v1"

POSTGRES_USER=chiraag
POSTGRES_PASSWORD=chiraag
POSTGRES_HOST=localhost
POSTGRES_PORT=5434
POSTGRES_DB=chiraag
```
This is only used if you run scripts directly on your host machine (outside
Docker). The containers themselves get their DB config from
`docker-compose.yml`, not this file.

**3. Build and start everything**
```bash
docker-compose up -d --build
```
This builds the API image and starts both containers (`db` and `api`)
together.

**4. Verify it's running**
```bash
docker ps
```
You should see `igdtw_backend-db-1` and `igdtw_backend-api-1`, both `Up`.

```bash
curl http://localhost:8000/
```
Expected response:
```json
{"status": "online", "system": "CHIRAAG Routing Engine", "docs_url": "/docs"}
```

Interactive API docs (try requests straight from the browser, no code
needed): **http://localhost:8000/docs**

---

## Populating real data (the ingestion pipeline)

The routing API only reads whatever is already sitting in the database — it
never fetches or scores anything itself. Populating real data is a separate,
offline step, run manually via `pipeline/orchestrator.py`.

Run it **inside the running `api` container** — it already has every pipeline
dependency installed, so there's no need to set up a local Python
environment:

```bash
docker-compose exec api python -m pipeline.orchestrator \
  --lat 28.62 --lon 77.22 --radius 1000 \
  --bbox "77.215,28.618,77.225,28.622" \
  --mapillary-token "YOUR_MAPILLARY_CLIENT_TOKEN"
```

### Getting a Mapillary token
1. Sign up / log in at [mapillary.com](https://www.mapillary.com/) (a
   Meta/Facebook account works).
2. Go to the [developer dashboard](https://www.mapillary.com/dashboard/developer)
   and register a new application (read-only access is enough; the
   "Redirect URL" field is unused for this project — any placeholder works).
3. Copy the **Client Token** shown on your dashboard (looks like
   `MLY|123...|abc...`). This is what goes into `--mapillary-token` — you do
   **not** need the Client Secret, which is only for a different OAuth flow.

### What the pipeline does
1. Pulls walking-street geometry from OpenStreetMap for the given point +
   radius → `road_segments`
2. Pulls streetlight detections from Mapillary for the given bounding box →
   `streetlights`
3. Snaps each streetlight to its nearest road segment
4. Computes `dark_fraction` (how much of the segment is unlit) and
   `longest_gap_m` (the longest unlit stretch) per segment
5. Writes those scores back to `road_segments`

### Notes
- **`--lat`/`--lon`/`--radius` vs `--place`**: prefer `--lat`/`--lon` for
  small or landmark-style areas. `--place` only works for locations that
  resolve to an administrative polygon boundary in OpenStreetMap — a named
  landmark (e.g. a single intersection or plaza) will fail with a
  `TypeError`.
- **Re-running is safe.** Both ingestion steps skip records that already
  exist (by `osm_id` / `mapillary_id`) rather than erroring or duplicating
  — a plain rerun updates scores without needing `--skip-osm`/`--skip-lights`.
- **`--bbox` should roughly match your `--lat`/`--lon`/`--radius` area** —
  they're independent parameters and nothing validates that they overlap.
- If Mapillary returns an HTTP 500 with `"error_subcode": 99`, this is a
  known transient issue on Mapillary's servers, usually resolved by using a
  smaller bounding box.

---

## API Reference

Base URL: `http://localhost:8000/api/v1`

### `POST /api/v1/route`
Computes the shortest and safest walking routes between two points.

**Request:**
```json
{
  "origin": { "lat": 28.6190, "lon": 77.2180 },
  "destination": { "lat": 28.6205, "lon": 77.2215 },
  "alpha": 1.20
}
```
`alpha` is a detour cap as a multiplier (e.g. `1.20` = the safer route may be
up to 20% longer than the shortest route). Must be between `1.0` and `2.0`.

**Response:**
```json
{
  "status": "success",
  "detour_multiplier_cap": 1.2,
  "baseline_route": {
    "nodes": [[77.218, 28.619], [77.2185, 28.6195], "..."],
    "metrics": { "total_length_m": 812.0, "unlit_length_m": 402.0, "dark_fraction": 0.495 }
  },
  "chiraag_route": {
    "nodes": [[77.218, 28.619], [77.2178, 28.6198], "..."],
    "metrics": { "total_length_m": 901.0, "unlit_length_m": 96.0, "dark_fraction": 0.107 }
  },
  "evidence_summary": {
    "unlit_meters_avoided": 306.0,
    "extra_distance_m": 89.0,
    "safety_gain_percent": 76.1
  }
}
```
Note: `nodes` is a plain array of `[lon, lat]` pairs, not GeoJSON.

### `GET /api/v1/evidence/segment/{segment_id}`
Per-segment lighting evidence.
```json
{
  "road_id": 4412,
  "length_m": 220.0,
  "dark_fraction": 0.81,
  "longest_gap_m": 168.0,
  "calibrated_lighting_prob": 0.19,
  "observation_state": "audited"
}
```

### `POST /api/v1/evidence/audit`
Submit a human ground-truth lighting rating for a segment.
```json
{
  "road_segment_id": 4412,
  "rating": 4.0,
  "observed_light_count": 2
}
```

---

## Project structure

```
igdtw_backend/
├── app/
│   ├── main.py              # FastAPI app entrypoint
│   ├── config.py            # Settings (reads .env / environment vars)
│   ├── db.py                # SQLAlchemy Base + engine setup
│   ├── models/               # RoadSegment, Streetlight, NightAudit
│   ├── routers/               # /route, /evidence endpoints
│   ├── schemas/               # Pydantic request/response models
│   └── services/
│       ├── graph_builder.py  # Builds a NetworkX graph from the DB
│       └── routing.py        # Lambda-sweep Dijkstra routing engine
├── pipeline/
│   ├── orchestrator.py       # Runs the full pipeline end-to-end
│   ├── ingest_osmnx.py       # OSM street geometry -> road_segments
│   ├── ingest_mapillary.py   # Mapillary streetlights -> streetlights
│   ├── snap_to_road.py       # Snaps streetlights to nearest road
│   ├── gap_analysis.py       # Computes dark_fraction / longest_gap_m
│   └── calibrate.py          # Trains a model against human audit ratings
├── scripts/
│   └── seed_ward.py          # Seeds a small mock grid for local testing
├── docker-compose.yml
├── dockerfile
└── requirements.txt
```

---

## Common issues

| Symptom | Likely cause |
|---|---|
| `password authentication failed` on port 5432 | A native/local Postgres install is also listening on 5432 and intercepting the connection. Check `docker-compose.yml`'s `db` port mapping — this repo uses `5434:5432` on the host side to avoid the clash. |
| API container can't reach the DB (`Connection refused`) | The `api` service must reference the DB by its Docker service name (`db`) and internal port (`5432`) — never `localhost` or the host-mapped port — since containers reach each other over Docker's internal network. |
| `ModuleNotFoundError` in `pipeline/` | The `pipeline` package's `__init__.py` imports every submodule up front — if a file gets renamed, update the import there too. |
| Docker build takes minutes and transfers a huge context | Missing or stale `.dockerignore` — make sure `venv/`, `__pycache__/`, and `.env` are excluded from the build context. |