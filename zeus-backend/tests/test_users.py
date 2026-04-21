"""Tests for user preference endpoints."""

def test_get_preferences(client, auth_headers):
    """Should get user preferences."""
    response = client.get("/api/users/me/preferences/", headers=auth_headers)
    assert response.status_code == 200

def test_update_preferences(client, auth_headers):
    """Should update user preferences."""
    response = client.put("/api/users/me/preferences/", headers=auth_headers, json={
        "dietary_restrictions": ["Vegetarian"],
        "cuisine_preferences": ["Italian", "Mexican"],
        "cooking_skill": "intermediate",
        "household_size": 2,
        "allergies": [],
        "disliked_ingredients": [],
    })
    assert response.status_code == 200

def test_get_body_stats(client, auth_headers):
    """Should get body stats."""
    response = client.get("/api/users/me/body-stats/", headers=auth_headers)
    assert response.status_code == 200

def test_get_notifications(client, auth_headers):
    """Should get notification preferences."""
    response = client.get("/api/users/me/notifications/", headers=auth_headers)
    assert response.status_code == 200
