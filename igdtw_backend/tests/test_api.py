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