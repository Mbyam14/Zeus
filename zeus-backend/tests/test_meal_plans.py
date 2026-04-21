"""Tests for meal plan endpoints."""

def test_get_current_meal_plan(client, auth_headers):
    """Getting current meal plan should work (may return 404 if none)."""
    response = client.get("/api/meal-plans/current/", headers=auth_headers)
    assert response.status_code in [200, 404]

def test_get_meal_plan_by_week(client, auth_headers):
    """Getting meal plan by week offset should work."""
    response = client.get("/api/meal-plans/week/0", headers=auth_headers)
    assert response.status_code in [200, 404]

def test_meal_plan_no_auth(client):
    """Meal plan endpoints should require auth."""
    response = client.get("/api/meal-plans/current/")
    assert response.status_code == 401 or response.status_code == 403
