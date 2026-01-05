"""
Seed sample pantry items for testing meal plan generation
Run this script to populate a user's pantry with basic groceries and staples
"""

import sys
import os
from datetime import datetime, timedelta

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import get_database

# Sample pantry items across all categories
SAMPLE_ITEMS = [
    # Produce
    {"item_name": "Tomatoes", "quantity": 6, "unit": "pieces", "category": "Produce", "days_until_expiry": 7},
    {"item_name": "Onions", "quantity": 4, "unit": "pieces", "category": "Produce", "days_until_expiry": 14},
    {"item_name": "Garlic", "quantity": 2, "unit": "heads", "category": "Produce", "days_until_expiry": 21},
    {"item_name": "Bell Peppers", "quantity": 3, "unit": "pieces", "category": "Produce", "days_until_expiry": 10},
    {"item_name": "Carrots", "quantity": 8, "unit": "pieces", "category": "Produce", "days_until_expiry": 14},
    {"item_name": "Potatoes", "quantity": 5, "unit": "lbs", "category": "Produce", "days_until_expiry": 30},
    {"item_name": "Lettuce", "quantity": 1, "unit": "heads", "category": "Produce", "days_until_expiry": 7},
    {"item_name": "Spinach", "quantity": 1, "unit": "boxes", "category": "Produce", "days_until_expiry": 5},

    # Dairy
    {"item_name": "Milk", "quantity": 1, "unit": "items", "category": "Dairy", "days_until_expiry": 7},
    {"item_name": "Eggs", "quantity": 12, "unit": "pieces", "category": "Dairy", "days_until_expiry": 14},
    {"item_name": "Butter", "quantity": 2, "unit": "items", "category": "Dairy", "days_until_expiry": 30},
    {"item_name": "Cheddar Cheese", "quantity": 1, "unit": "lbs", "category": "Dairy", "days_until_expiry": 21},
    {"item_name": "Greek Yogurt", "quantity": 4, "unit": "items", "category": "Dairy", "days_until_expiry": 10},

    # Protein
    {"item_name": "Chicken Breast", "quantity": 2, "unit": "lbs", "category": "Protein", "days_until_expiry": 3},
    {"item_name": "Ground Beef", "quantity": 1, "unit": "lbs", "category": "Protein", "days_until_expiry": 3},
    {"item_name": "Salmon", "quantity": 2, "unit": "pieces", "category": "Protein", "days_until_expiry": 2},
    {"item_name": "Bacon", "quantity": 1, "unit": "lbs", "category": "Protein", "days_until_expiry": 14},

    # Grains
    {"item_name": "White Rice", "quantity": 5, "unit": "lbs", "category": "Grains", "days_until_expiry": 365},
    {"item_name": "Pasta", "quantity": 3, "unit": "boxes", "category": "Grains", "days_until_expiry": 365},
    {"item_name": "Bread", "quantity": 2, "unit": "items", "category": "Grains", "days_until_expiry": 5},
    {"item_name": "Oats", "quantity": 1, "unit": "boxes", "category": "Grains", "days_until_expiry": 180},
    {"item_name": "Quinoa", "quantity": 2, "unit": "lbs", "category": "Grains", "days_until_expiry": 365},

    # Spices
    {"item_name": "Salt", "quantity": 1, "unit": "boxes", "category": "Spices", "days_until_expiry": None},
    {"item_name": "Black Pepper", "quantity": 1, "unit": "items", "category": "Spices", "days_until_expiry": None},
    {"item_name": "Garlic Powder", "quantity": 1, "unit": "items", "category": "Spices", "days_until_expiry": 365},
    {"item_name": "Paprika", "quantity": 1, "unit": "items", "category": "Spices", "days_until_expiry": 365},
    {"item_name": "Italian Seasoning", "quantity": 1, "unit": "items", "category": "Spices", "days_until_expiry": 365},
    {"item_name": "Cumin", "quantity": 1, "unit": "items", "category": "Spices", "days_until_expiry": 365},

    # Condiments
    {"item_name": "Olive Oil", "quantity": 1, "unit": "items", "category": "Condiments", "days_until_expiry": 365},
    {"item_name": "Soy Sauce", "quantity": 1, "unit": "items", "category": "Condiments", "days_until_expiry": 365},
    {"item_name": "Ketchup", "quantity": 1, "unit": "items", "category": "Condiments", "days_until_expiry": 180},
    {"item_name": "Mayonnaise", "quantity": 1, "unit": "items", "category": "Condiments", "days_until_expiry": 90},
    {"item_name": "Hot Sauce", "quantity": 1, "unit": "items", "category": "Condiments", "days_until_expiry": 365},

    # Pantry
    {"item_name": "Canned Tomatoes", "quantity": 4, "unit": "cans", "category": "Pantry", "days_until_expiry": 365},
    {"item_name": "Chicken Broth", "quantity": 3, "unit": "cans", "category": "Pantry", "days_until_expiry": 365},
    {"item_name": "Black Beans", "quantity": 2, "unit": "cans", "category": "Pantry", "days_until_expiry": 365},
    {"item_name": "Peanut Butter", "quantity": 1, "unit": "items", "category": "Pantry", "days_until_expiry": 180},

    # Frozen
    {"item_name": "Mixed Vegetables", "quantity": 2, "unit": "boxes", "category": "Frozen", "days_until_expiry": 180},
    {"item_name": "Frozen Berries", "quantity": 1, "unit": "boxes", "category": "Frozen", "days_until_expiry": 180},
]


def seed_pantry_items(user_id: str):
    """Seed pantry items for a specific user"""
    supabase = get_database()

    try:
        # Clear existing pantry items for this user
        print(f"Clearing existing pantry items for user {user_id}...")
        supabase.table("pantry_items").delete().eq("user_id", user_id).execute()

        # Insert sample items
        print(f"Adding {len(SAMPLE_ITEMS)} sample pantry items...")
        pantry_records = []

        for item in SAMPLE_ITEMS:
            expires_at = None
            if item["days_until_expiry"] is not None:
                expires_at = (datetime.now() + timedelta(days=item["days_until_expiry"])).strftime("%Y-%m-%d")

            pantry_records.append({
                "user_id": user_id,
                "item_name": item["item_name"],
                "quantity": item["quantity"],
                "unit": item["unit"],
                "category": item["category"],
                "expires_at": expires_at
            })

        # Insert all records
        supabase.table("pantry_items").insert(pantry_records).execute()

        print(f"Successfully added {len(SAMPLE_ITEMS)} pantry items!")

        # Show summary by category
        result = supabase.table("pantry_items").select("category").eq("user_id", user_id).execute()

        category_counts = {}
        for record in result.data:
            category = record["category"]
            category_counts[category] = category_counts.get(category, 0) + 1

        print("\nPantry Summary:")
        for category in sorted(category_counts.keys()):
            print(f"  {category}: {category_counts[category]} items")

    except Exception as e:
        print(f"Error seeding pantry: {e}")
        raise


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python seed_sample_pantry.py <user_id>")
        print("\nTo get your user_id:")
        print("1. Open your app and log in")
        print("2. Check the 'Profile' tab or check network requests")
        print("3. Or run this to list users:")
        print("   python -c \"from app.database import get_database; db = get_database(); print([u['id'] + ': ' + u['email'] for u in db.table('users').select('id, email').execute().data])\"")
        sys.exit(1)

    user_id = sys.argv[1]
    print(f"Seeding pantry for user: {user_id}\n")
    seed_pantry_items(user_id)
