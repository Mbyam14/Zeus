#!/usr/bin/env python3
"""
Seed script to populate the recipes table with default recipes from AllRecipes.
Run after: 1) scrape_allrecipes.py has generated app/data/default_recipes.py
           2) 003_system_user.sql migration has been applied

Usage: python scripts/seed_default_recipes.py
"""
import sys
from pathlib import Path

# Add parent directory to path so we can import from app
sys.path.append(str(Path(__file__).parent.parent))

from app.database import get_database
from app.data.default_recipes import get_default_recipes

SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"


def seed_default_recipes():
    """Seed the recipes table with default scraped recipes."""
    db = get_database()
    recipes = get_default_recipes()

    print(f"\n{'=' * 60}")
    print(f"Seeding Default Recipes")
    print(f"{'=' * 60}")
    print(f"Total recipes to seed: {len(recipes)}")

    # Count by meal type
    meal_type_counts = {}
    for r in recipes:
        for mt in r.get("meal_type", []):
            meal_type_counts[mt] = meal_type_counts.get(mt, 0) + 1
    print("\nBreakdown by meal type:")
    for mt, count in sorted(meal_type_counts.items()):
        print(f"  {mt:15s}: {count:3d} recipes")
    print(f"{'=' * 60}\n")

    # Check if default recipes already exist
    try:
        existing = (
            db.table("recipes")
            .select("count", count="exact")
            .eq("user_id", SYSTEM_USER_ID)
            .execute()
        )
        if existing.count and existing.count > 0:
            response = input(
                f"\nWarning: {existing.count} default recipes already exist.\n"
                "Do you want to clear and re-seed? (y/N): "
            )
            if response.lower() != "y":
                print("Seeding cancelled.")
                return

            print("Clearing existing default recipes...")
            db.table("recipes").delete().eq("user_id", SYSTEM_USER_ID).execute()
            print("Existing default recipes cleared.")
    except Exception as e:
        print(f"Could not check existing data: {e}")
        print("Proceeding with seeding...")

    # Prepare recipe records for insertion
    recipe_records = []
    for recipe in recipes:
        record = {
            "user_id": SYSTEM_USER_ID,
            "title": recipe["title"],
            "description": recipe.get("description", ""),
            "image_url": recipe.get("image_url"),
            "ingredients": recipe.get("ingredients", []),
            "instructions": recipe.get("instructions", []),
            "servings": recipe.get("servings", 4),
            "prep_time": recipe.get("prep_time"),
            "cook_time": recipe.get("cook_time"),
            "cuisine_type": recipe.get("cuisine_type"),
            "difficulty": recipe.get("difficulty", "Medium"),
            "meal_type": recipe.get("meal_type", []),
            "dietary_tags": recipe.get("dietary_tags", []),
            "is_ai_generated": False,
            "likes_count": 0,
            "calories": recipe.get("calories"),
            "protein_grams": recipe.get("protein_grams"),
            "carbs_grams": recipe.get("carbs_grams"),
            "fat_grams": recipe.get("fat_grams"),
            "serving_size": recipe.get("serving_size"),
        }
        recipe_records.append(record)

    # Insert in batches of 50
    batch_size = 50
    total_batches = (len(recipe_records) + batch_size - 1) // batch_size

    print(f"\nInserting recipes in {total_batches} batches...")

    success_count = 0
    error_count = 0

    for i in range(0, len(recipe_records), batch_size):
        batch = recipe_records[i : i + batch_size]
        batch_num = i // batch_size + 1

        try:
            result = db.table("recipes").insert(batch).execute()
            success_count += len(batch)
            print(
                f"  Batch {batch_num}/{total_batches}: Inserted {len(batch)} recipes"
            )
        except Exception as e:
            error_count += len(batch)
            print(
                f"  Batch {batch_num}/{total_batches}: Error: {str(e)[:100]}"
            )

    print(f"\n{'=' * 60}")
    print(f"Seeding complete!")
    print(f"  Successfully inserted: {success_count} recipes")
    if error_count > 0:
        print(f"  Errors: {error_count} recipes")
    print(f"{'=' * 60}\n")


def verify_seed_data():
    """Verify that the default recipes were seeded correctly."""
    db = get_database()

    print("Verifying seed data...")

    try:
        result = (
            db.table("recipes")
            .select("count", count="exact")
            .eq("user_id", SYSTEM_USER_ID)
            .execute()
        )
        print(f"  Total default recipes in database: {result.count}")

        # Sample a few
        sample = (
            db.table("recipes")
            .select("title, meal_type, cuisine_type, calories, image_url")
            .eq("user_id", SYSTEM_USER_ID)
            .limit(5)
            .execute()
        )
        print(f"\n  Sample recipes:")
        for r in sample.data:
            has_image = "yes" if r.get("image_url") else "no"
            print(
                f"    - {r['title']} ({r.get('cuisine_type', '?')}, "
                f"{r.get('calories', '?')} cal, image: {has_image})"
            )

        print("\nVerification complete!")
    except Exception as e:
        print(f"  Error during verification: {e}")


def main():
    print("\n" + "=" * 60)
    print("  Zeus Default Recipe Seeding Script")
    print("=" * 60 + "\n")

    # Verify system user exists
    db = get_database()
    try:
        user_check = (
            db.table("users")
            .select("id, username")
            .eq("id", SYSTEM_USER_ID)
            .execute()
        )
        if not user_check.data:
            print("ERROR: System user not found!")
            print("Please run the migration first:")
            print("  migrations/003_system_user.sql")
            print("in your Supabase SQL editor.")
            return
        print(f"System user found: {user_check.data[0]['username']}")
    except Exception as e:
        print(f"ERROR: Could not verify system user: {e}")
        return

    # Seed recipes
    try:
        seed_default_recipes()
    except Exception as e:
        print(f"\nError during seeding: {e}")
        print("Please check your database connection and try again.")
        return

    # Verify
    try:
        verify_seed_data()
    except Exception as e:
        print(f"\nCould not verify seed data: {e}")

    print("\nDone! Default recipes are ready.\n")


if __name__ == "__main__":
    main()
