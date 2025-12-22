import requests
import json

# Your backend URL
BASE_URL = "http://localhost:8000"

# You'll need to get a valid auth token first
# For now, we'll use the endpoint without auth or you can add your token here
AUTH_TOKEN = None  # Replace with actual token if needed

recipes_to_add = [
    {
        "title": "Quick Asian Stir Fry",
        "description": "Colorful vegetable stir fry with soy sauce and ginger",
        "image_url": "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800&q=80",
        "ingredients": [
            {"name": "Mixed vegetables", "quantity": "500", "unit": "g"},
            {"name": "Soy sauce", "quantity": "3", "unit": "tbsp"},
            {"name": "Fresh ginger", "quantity": "2", "unit": "tbsp"},
            {"name": "Sesame oil", "quantity": "1", "unit": "tbsp"},
        ],
        "instructions": [
            {"step": 1, "instruction": "Heat oil in wok over high heat"},
            {"step": 2, "instruction": "Add ginger and stir for 30 seconds"},
            {"step": 3, "instruction": "Add vegetables and stir fry for 5 minutes"},
            {"step": 4, "instruction": "Add soy sauce and toss to combine"},
        ],
        "servings": 2,
        "prep_time": 10,
        "cook_time": 8,
        "cuisine_type": "Asian",
        "difficulty": "Easy",
        "meal_type": ["Lunch", "Dinner"],
        "dietary_tags": ["Vegetarian", "Vegan"],
    },
    {
        "title": "Avocado Toast with Poached Egg",
        "description": "Perfect breakfast with creamy avocado and runny egg",
        "image_url": "https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?w=800&q=80",
        "ingredients": [
            {"name": "Sourdough bread", "quantity": "2", "unit": "slices"},
            {"name": "Avocado", "quantity": "1", "unit": "large"},
            {"name": "Eggs", "quantity": "2", "unit": "large"},
            {"name": "Lemon juice", "quantity": "1", "unit": "tsp"},
        ],
        "instructions": [
            {"step": 1, "instruction": "Toast bread until golden"},
            {"step": 2, "instruction": "Mash avocado with lemon juice"},
            {"step": 3, "instruction": "Poach eggs in simmering water"},
            {"step": 4, "instruction": "Top toast with avocado and poached eggs"},
        ],
        "servings": 2,
        "prep_time": 5,
        "cook_time": 10,
        "cuisine_type": "American",
        "difficulty": "Easy",
        "meal_type": ["Breakfast"],
        "dietary_tags": ["Vegetarian"],
    },
]

print("Adding sample recipes to database...")

for recipe in recipes_to_add:
    try:
        headers = {"Content-Type": "application/json"}
        if AUTH_TOKEN:
            headers["Authorization"] = f"Bearer {AUTH_TOKEN}"

        response = requests.post(
            f"{BASE_URL}/api/recipes/",
            json=recipe,
            headers=headers
        )

        if response.status_code == 200 or response.status_code == 201:
            print(f"✓ Added: {recipe['title']}")
        else:
            print(f"✗ Failed to add {recipe['title']}: {response.status_code}")
            print(f"  Error: {response.text}")
    except Exception as e:
        print(f"✗ Error adding {recipe['title']}: {str(e)}")

print("\nDone!")
