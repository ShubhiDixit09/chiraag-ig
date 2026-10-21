from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import route_router, evidence_router

app = FastAPI(
    title="CHIRAAG Routing Engine API",
    description="Safety-focused navigation API minimizing exposure to unlit road segments.",
    version="0.1.0"
)

# Enable CORS for local frontend development (Mapbox/Leaflet UI)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register endpoints
app.include_router(route_router)
app.include_router(evidence_router)

@app.get("/", tags=["Health"])
def health_check():
    return {"status": "online", "system": "CHIRAAG API"}