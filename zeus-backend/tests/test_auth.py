"""Tests for authentication endpoints."""

# NOTE: test_get_current_user runs first to ensure the auth_headers fixture
# registers before other tests exhaust the 5/minute rate limit.

def test_get_current_user(client, auth_headers):
    """Authenticated user should get their profile."""
    response = client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    assert "email" in response.json()

def test_register_success(client):
    """New user registration should return tokens."""
    import uuid
    unique = uuid.uuid4().hex[:8]
    response = client.post("/api/auth/register", json={
        "email": f"test_{unique}@example.com",
        "username": f"user_{unique}",
        "password": "SecurePass123!",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == f"test_{unique}@example.com"

def test_register_duplicate_email(client):
    """Duplicate email should fail."""
    import uuid
    unique = uuid.uuid4().hex[:8]
    payload = {
        "email": f"dup_{unique}@example.com",
        "username": f"user1_{unique}",
        "password": "SecurePass123!",
    }
    client.post("/api/auth/register", json=payload)
    # Try again with same email
    payload["username"] = f"user2_{unique}"
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 400

def test_register_short_password(client):
    """Password under 8 chars should fail."""
    import uuid
    unique = uuid.uuid4().hex[:8]
    response = client.post("/api/auth/register", json={
        "email": f"test_{unique}@example.com",
        "username": f"user_{unique}",
        "password": "short",
    })
    assert response.status_code == 422 or response.status_code == 400

def test_login_success(client):
    """Login with valid credentials should return tokens."""
    import uuid
    unique = uuid.uuid4().hex[:8]
    # Register first
    client.post("/api/auth/register", json={
        "email": f"login_{unique}@example.com",
        "username": f"login_{unique}",
        "password": "SecurePass123!",
    })
    # Login
    response = client.post("/api/auth/login", json={
        "email": f"login_{unique}@example.com",
        "password": "SecurePass123!",
    })
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_login_wrong_password(client):
    """Login with wrong password should fail."""
    import uuid
    unique = uuid.uuid4().hex[:8]
    client.post("/api/auth/register", json={
        "email": f"wp_{unique}@example.com",
        "username": f"wp_{unique}",
        "password": "SecurePass123!",
    })
    response = client.post("/api/auth/login", json={
        "email": f"wp_{unique}@example.com",
        "password": "WrongPass!",
    })
    assert response.status_code == 401

def test_get_current_user_no_token(client):
    """Unauthenticated request should fail."""
    response = client.get("/api/auth/me")
    assert response.status_code == 401 or response.status_code == 403
