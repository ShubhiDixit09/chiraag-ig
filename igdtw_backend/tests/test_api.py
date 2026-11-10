def test_health_check_endpoint(test_client):
    """Verify API root health check."""
    response = test_client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "online"

def test_route_endpoint_validation(test_client):
    """Verify route endpoint rejects invalid payloads."""
    # Missing required coordinates
    invalid_payload = {"alpha": 1.2}
    response = test_client.post("/api/v1/route", json=invalid_payload)
    assert response.status_code == 422  # Unprocessable Entity (Pydantic validation error)

def test_dark_gaps_endpoint(test_client):
    """Verify dark gaps municipal priority endpoint returns ranked stretches."""
    response = test_client.get("/api/v1/evidence/dark-gaps?min_gap_m=100.0")
    assert response.status_code == 200
    data = response.json()
    assert "gaps" in data
    assert data["min_gap_m"] == 100.0
    assert data["total_gaps_found"] > 0
    # Longest gap in Central Delhi pilot dataset is ~498.6 m
    first_gap = data["gaps"][0]
    assert first_gap["longest_gap_m"] >= 490.0
    assert first_gap["priority_rank"] == 1
    assert "center" in first_gap
    assert len(first_gap["center"]) == 2
    assert "coordinates" in first_gap
    assert len(first_gap["coordinates"]) >= 2
