#!/usr/bin/env python3
"""
Fetch images for default recipes using free APIs:
1. TheMealDB (free, no key needed) - for exact recipe matches
2. Unsplash Source URLs - for everything else (food-related search)

Usage: python scripts/fetch_recipe_images.py
"""
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote_plus

import requests

sys.path.append(str(Path(__file__).parent.parent))

DELAY = 0.5  # seconds between API calls


def search_themealdb(title: str) -> str | None:
    """Search TheMealDB for an exact recipe match and return image URL."""
    try:
        # Try exact title
        resp = requests.get(
            f"https://www.themealdb.com/api/json/v1/1/search.php?s={quote_plus(title)}",
            timeout=10,
        )
        data = resp.json()
        if data.get("meals"):
            # Check if the result is a reasonable match
            meal = data["meals"][0]
            meal_name = meal["strMeal"].lower()
            title_lower = title.lower()

            # Accept if titles share significant words
            title_words = set(title_lower.split())
            meal_words = set(meal_name.split())
            common = title_words & meal_words
            if len(common) >= 1 or title_lower in meal_name or meal_name in title_lower:
                return meal["strMealThumb"]

    except Exception:
        pass

    return None


def get_unsplash_url(title: str) -> str:
    """Generate an Unsplash source URL for a food photo based on recipe title."""
    # Clean up the title for a better search
    # Remove words that don't help find food images
    skip_words = {"easy", "quick", "simple", "best", "classic", "homemade",
                  "traditional", "authentic", "recipe", "style", "the", "a", "an",
                  "with", "and", "or", "in", "on"}
    words = [w for w in title.lower().split() if w not in skip_words]
    query = " ".join(words[:4])  # Use first 4 meaningful words
    return f"https://images.unsplash.com/photo-food-{quote_plus(query)}?w=800&h=600&fit=crop"


def get_pexels_image(title: str) -> str | None:
    """Search Pexels for a food photo (no API key needed for basic queries via their CDN)."""
    # Use Foodish API as another free source
    try:
        resp = requests.get("https://foodish-api.com/api/", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("image")
    except Exception:
        pass
    return None


def search_spoonacular_image(title: str) -> str | None:
    """
    Try to find a recipe image via free recipe image CDNs.
    Spoonacular has predictable image URLs if we know the recipe.
    """
    # Use a known free food image API
    try:
        # Try TheMealDB with keywords from the title
        keywords = title.lower().split()
        # Try different keyword combinations
        for keyword in keywords[:3]:
            if len(keyword) < 3:
                continue
            resp = requests.get(
                f"https://www.themealdb.com/api/json/v1/1/search.php?s={keyword}",
                timeout=10,
            )
            data = resp.json()
            if data.get("meals"):
                # Find the best match
                for meal in data["meals"]:
                    meal_name = meal["strMeal"].lower()
                    # Accept if key terms match
                    if any(w in meal_name for w in keywords if len(w) > 3):
                        return meal["strMealThumb"]
    except Exception:
        pass

    return None


def main():
    print("\n" + "=" * 60)
    print("  Fetch Recipe Images")
    print("=" * 60 + "\n")

    from app.data.default_recipes import get_default_recipes

    recipes = get_default_recipes()

    has_image = sum(1 for r in recipes if r.get("image_url"))
    need_image = len(recipes) - has_image
    print(f"Total recipes: {len(recipes)}")
    print(f"Already have images: {has_image}")
    print(f"Need images: {need_image}\n")

    if need_image == 0:
        print("All recipes already have images!")
        return

    updated = 0
    from_mealdb = 0
    from_mealdb_keyword = 0
    from_foodish = 0
    failed_titles = []

    for i, recipe in enumerate(recipes):
        if recipe.get("image_url"):
            continue

        title = recipe["title"]
        print(f"  [{i+1}/{len(recipes)}] {title}...", end=" ", flush=True)

        time.sleep(DELAY)

        # Strategy 1: TheMealDB exact search
        image_url = search_themealdb(title)
        if image_url:
            recipe["image_url"] = image_url
            updated += 1
            from_mealdb += 1
            print("OK (MealDB)")
            continue

        time.sleep(DELAY)

        # Strategy 2: TheMealDB keyword search
        image_url = search_spoonacular_image(title)
        if image_url:
            recipe["image_url"] = image_url
            updated += 1
            from_mealdb_keyword += 1
            print("OK (MealDB keyword)")
            continue

        # Strategy 3: Foodish random food image
        image_url = get_pexels_image(title)
        if image_url:
            recipe["image_url"] = image_url
            updated += 1
            from_foodish += 1
            print("OK (Foodish)")
            continue

        failed_titles.append(title)
        print("SKIP")

        # Save progress every 25
        if (i + 1) % 25 == 0:
            save_recipes(recipes)
            print(f"  --- Progress saved ({updated} images so far) ---")

    print(f"\n{'=' * 60}")
    print(f"Results:")
    print(f"  TheMealDB exact: {from_mealdb}")
    print(f"  TheMealDB keyword: {from_mealdb_keyword}")
    print(f"  Foodish fallback: {from_foodish}")
    print(f"  Total found: {updated}")
    print(f"  Not found: {len(failed_titles)}")
    if failed_titles:
        print(f"\nRecipes without images:")
        for t in failed_titles:
            print(f"  - {t}")
    print(f"{'=' * 60}\n")

    save_recipes(recipes)
    print("Done!")


def save_recipes(recipes: list[dict]):
    """Save recipes back to the data file."""
    output_path = Path(__file__).parent.parent / "app" / "data" / "default_recipes.py"

    with open(output_path, "w", encoding="utf-8") as f:
        f.write('"""Default recipes with images."""\n\n\n')
        f.write("def get_default_recipes() -> list[dict]:\n")
        f.write('    """Return list of default recipes for seeding the database."""\n')
        f.write("    return [\n")

        for recipe in recipes:
            f.write("        {\n")
            for key, value in recipe.items():
                f.write(f"            {repr(key)}: {repr(value)},\n")
            f.write("        },\n")

        f.write("    ]\n")

    print(f"  Saved to: {output_path}")


if __name__ == "__main__":
    main()
