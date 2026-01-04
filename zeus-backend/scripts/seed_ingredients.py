#!/usr/bin/env python3
"""
Seed script to populate the ingredient_library table with common ingredients.
Run this script once after creating the ingredient_library table.
"""
import sys
from pathlib import Path

# Add parent directory to path so we can import from app
sys.path.append(str(Path(__file__).parent.parent))

from app.database import get_database
from app.data.seed_ingredients import get_all_ingredients, get_category_counts


def create_ingredient_library_table():
    """
    Create the ingredient_library table if it doesn't exist.
    This table stores common ingredients for autocomplete functionality.
    """
    db = get_database()

    create_table_sql = """
    CREATE TABLE IF NOT EXISTS ingredient_library (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text UNIQUE NOT NULL,
        category text NOT NULL,
        common_units text[] DEFAULT '{}',
        created_at timestamp with time zone DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_ingredient_library_name ON ingredient_library(name);
    CREATE INDEX IF NOT EXISTS idx_ingredient_library_category ON ingredient_library(category);
    """

    print("Creating ingredient_library table...")
    try:
        # Supabase doesn't support direct SQL execution via Python client
        # This would need to be run manually via Supabase dashboard or SQL editor
        print("Table creation SQL:")
        print(create_table_sql)
        print("\nPlease run this SQL manually in your Supabase SQL editor if the table doesn't exist yet.")
    except Exception as e:
        print(f"Note: {e}")
        print("You may need to create the table manually using the SQL above.")


def seed_ingredients():
    """Seed the ingredient_library table with common ingredients"""
    db = get_database()

    ingredients = get_all_ingredients()
    category_counts = get_category_counts()

    print(f"\n{'='*60}")
    print(f"Seeding Ingredient Library")
    print(f"{'='*60}")
    print(f"Total ingredients to seed: {len(ingredients)}")
    print(f"\nBreakdown by category:")
    for category, count in sorted(category_counts.items()):
        print(f"  {category:20s}: {count:3d} items")
    print(f"{'='*60}\n")

    # Check if data already exists
    try:
        existing = db.table("ingredient_library").select("count", count="exact").execute()
        if existing.count and existing.count > 0:
            response = input(f"\nWarning: {existing.count} ingredients already exist in the database.\nDo you want to clear and re-seed? (y/N): ")
            if response.lower() != 'y':
                print("Seeding cancelled.")
                return

            # Clear existing data
            print("Clearing existing ingredients...")
            db.table("ingredient_library").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
            print("Existing data cleared.")
    except Exception as e:
        print(f"Could not check existing data: {e}")
        print("Proceeding with seeding...")

    # Insert in batches of 100 to avoid rate limits
    batch_size = 100
    total_batches = (len(ingredients) + batch_size - 1) // batch_size

    print(f"\nInserting ingredients in {total_batches} batches...")

    success_count = 0
    error_count = 0

    for i in range(0, len(ingredients), batch_size):
        batch = ingredients[i:i+batch_size]
        batch_num = i//batch_size + 1

        try:
            result = db.table("ingredient_library").insert(batch).execute()
            success_count += len(batch)
            print(f"  Batch {batch_num}/{total_batches}: ✓ Inserted {len(batch)} ingredients")
        except Exception as e:
            error_count += len(batch)
            print(f"  Batch {batch_num}/{total_batches}: ✗ Error: {str(e)[:100]}")

    print(f"\n{'='*60}")
    print(f"Seeding complete!")
    print(f"  Successfully inserted: {success_count} ingredients")
    if error_count > 0:
        print(f"  Errors: {error_count} ingredients")
    print(f"{'='*60}\n")


def verify_seed_data():
    """Verify that the ingredients were seeded correctly"""
    db = get_database()

    print("Verifying seed data...")

    try:
        # Get total count
        result = db.table("ingredient_library").select("count", count="exact").execute()
        total_count = result.count

        print(f"  Total ingredients in database: {total_count}")

        # Sample a few ingredients
        sample = db.table("ingredient_library").select("*").limit(5).execute()
        print(f"\n  Sample ingredients:")
        for ing in sample.data:
            print(f"    - {ing['name']} ({ing['category']}) - Units: {ing['common_units']}")

        # Count by category
        print(f"\n  Ingredients by category:")
        for category in ["Produce", "Dairy", "Protein", "Grains", "Spices", "Condiments", "Beverages", "Frozen", "Pantry"]:
            count_result = db.table("ingredient_library").select("count", count="exact").eq("category", category).execute()
            print(f"    {category:15s}: {count_result.count:3d}")

        print("\nVerification complete!")

    except Exception as e:
        print(f"  Error during verification: {e}")


def main():
    print("\n" + "="*60)
    print("  Zeus Ingredient Library Seeding Script")
    print("="*60 + "\n")

    # Step 1: Show table creation SQL
    create_ingredient_library_table()

    # Step 2: Seed ingredients
    try:
        seed_ingredients()
    except Exception as e:
        print(f"\n✗ Error during seeding: {e}")
        print("Please check your database connection and try again.")
        return

    # Step 3: Verify
    try:
        verify_seed_data()
    except Exception as e:
        print(f"\nCould not verify seed data: {e}")

    print("\nDone! The ingredient library is ready for use.\n")


if __name__ == "__main__":
    main()
