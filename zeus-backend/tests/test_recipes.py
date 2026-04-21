"""Tests for recipe endpoints."""

def test_get_recipe_feed(client, auth_headers):
    """Recipe feed should return a list."""
    response = client.get("/api/recipes/feed?limit=5", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_get_recipe_feed_with_filters(client, auth_headers):
    """Feed should accept filter params."""
    response = client.get(
        "/api/recipes/feed?limit=5&meal_type=Dinner&cuisine_type=Italian",
        headers=auth_headers
    )
    assert response.status_code == 200

def test_get_liked_recipes(client, auth_headers):
    """Liked recipes should return a list (possibly empty)."""
    response = client.get("/api/recipes/liked?limit=10", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_get_saved_recipes(client, auth_headers):
    """Saved recipes should return a list."""
    response = client.get("/api/recipes/saved/my?limit=10", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_get_my_recipes(client, auth_headers):
    """My recipes should return a list."""
    response = client.get("/api/recipes/my-recipes?limit=10", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)
