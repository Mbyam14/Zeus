"""Tests for pantry endpoints."""

def test_get_pantry_empty(client, auth_headers):
    """New user should have empty pantry."""
    response = client.get("/api/pantry/", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_create_pantry_item(client, auth_headers):
    """Should create a pantry item."""
    response = client.post("/api/pantry/", headers=auth_headers, json={
        "item_name": "Test Eggs",
        "quantity": 12,
        "unit": "pieces",
        "category": "Dairy",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["item_name"] == "Test Eggs"
    assert data["quantity"] == 12

def test_bulk_add_pantry(client, auth_headers):
    """Should bulk add multiple items."""
    response = client.post("/api/pantry/bulk", headers=auth_headers, json={
        "items": [
            {"item_name": "Milk", "quantity": 1, "unit": "cups", "category": "Dairy"},
            {"item_name": "Bread", "quantity": 1, "unit": "pieces", "category": "Grains"},
        ]
    })
    assert response.status_code == 200
    assert len(response.json()) == 2

def test_search_ingredients(client, auth_headers):
    """Ingredient search should return results."""
    response = client.get("/api/pantry/ingredients/search?query=chicken", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_pantry_no_auth(client):
    """Pantry endpoints should require auth."""
    response = client.get("/api/pantry/")
    assert response.status_code == 401 or response.status_code == 403
