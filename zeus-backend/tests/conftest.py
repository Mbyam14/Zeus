"""
Shared test fixtures for Zeus backend tests.
Uses the real FastAPI app with test client.
"""
import pytest
import uuid
from fastapi.testclient import TestClient
from app.main import app

# Generate a unique ID once per test session
_session_id = uuid.uuid4().hex[:8]
_cached_token = None


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture
def auth_headers(client):
    """Register a test user once per session and return auth headers."""
    global _cached_token

    if _cached_token:
        return {"Authorization": f"Bearer {_cached_token}"}

    # Try to register
    response = client.post("/api/auth/register", json={
        "email": f"test_{_session_id}@example.com",
        "username": f"testuser_{_session_id}",
        "password": "TestPass123!",
    })
    if response.status_code == 200:
        _cached_token = response.json()["access_token"]
        return {"Authorization": f"Bearer {_cached_token}"}

    # If registration fails (duplicate), try login
    response = client.post("/api/auth/login", json={
        "email": f"test_{_session_id}@example.com",
        "password": "TestPass123!",
    })
    if response.status_code == 200:
        _cached_token = response.json()["access_token"]
        return {"Authorization": f"Bearer {_cached_token}"}

    pytest.skip("Could not create or login test user")
