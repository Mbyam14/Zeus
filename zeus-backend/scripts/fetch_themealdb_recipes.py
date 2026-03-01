#!/usr/bin/env python3
"""
Fetch all recipes from TheMealDB and convert to Zeus format.
TheMealDB is a free, open recipe database with images.

Usage: python scripts/fetch_themealdb_recipes.py
Output: app/data/default_recipes.py
"""
import json
import re
import sys
from pathlib import Path

import requests

sys.path.append(str(Path(__file__).parent.parent))


# Map TheMealDB categories to our meal_type
CATEGORY_TO_MEAL_TYPE = {
    "Breakfast": ["Breakfast"],
    "Starter": ["Snack"],
    "Side": ["Lunch"],
    "Dessert": ["Dessert"],
    "Vegan": ["Dinner"],
    "Vegetarian": ["Dinner"],
    "Beef": ["Dinner"],
    "Chicken": ["Dinner"],
    "Lamb": ["Dinner"],
    "Pork": ["Dinner"],
    "Goat": ["Dinner"],
    "Seafood": ["Dinner"],
    "Pasta": ["Dinner"],
    "Miscellaneous": ["Dinner"],
}

# Map TheMealDB strArea to our cuisine_type
AREA_TO_CUISINE = {
    "American": "American",
    "British": "British",
    "Canadian": "American",
    "Chinese": "Chinese",
    "Croatian": "Mediterranean",
    "Dutch": "European",
    "Egyptian": "Mediterranean",
    "Filipino": "Asian",
    "French": "French",
    "Greek": "Greek",
    "Indian": "Indian",
    "Irish": "British",
    "Italian": "Italian",
    "Jamaican": "Caribbean",
    "Japanese": "Japanese",
    "Kenyan": "African",
    "Malaysian": "Asian",
    "Mexican": "Mexican",
    "Moroccan": "Mediterranean",
    "Polish": "European",
    "Portuguese": "Mediterranean",
    "Russian": "European",
    "Spanish": "Mediterranean",
    "Thai": "Thai",
    "Tunisian": "Mediterranean",
    "Turkish": "Mediterranean",
    "Ukrainian": "European",
    "Vietnamese": "Asian",
    "Norwegian": "European",
    "Algerian": "Mediterranean",
    "Australian": "American",
    "Saudi Arabian": "Mediterranean",
    "Argentinian": "Latin American",
    "Venezulan": "Latin American",
    "Uruguayan": "Latin American",
    "Syrian": "Mediterranean",
    "Slovakian": "European",
    "Unknown": "American",
}


def parse_ingredients(meal: dict) -> list[dict]:
    """Extract ingredients from TheMealDB's strIngredient1-20 / strMeasure1-20 format."""
    ingredients = []
    for i in range(1, 21):
        name = (meal.get(f"strIngredient{i}") or "").strip()
        measure = (meal.get(f"strMeasure{i}") or "").strip()
        if not name:
            break

        # Parse measure into quantity and unit
        quantity = measure
        unit = "pieces"

        # Try to split "2 tablespoons" into quantity="2" unit="tablespoons"
        measure_match = re.match(
            r"^([\d\s/.½¼¾⅓⅔]+)\s*(cups?|tablespoons?|tbsp|teaspoons?|tsp|"
            r"oz|ounces?|lbs?|pounds?|g|kg|ml|l|litres?|liters?|cloves?|cans?|"
            r"pieces?|slices?|pinch(?:es)?|handfuls?|bunche?s?|sprigs?|stalks?|"
            r"sticks?|heads?|fillets?|sheets?|leaves|dashes?|drops?|rashers?|"
            r"knobs?|cm|inch|medium|large|small)\s*(.*)$",
            measure, re.IGNORECASE
        )
        if measure_match:
            quantity = measure_match.group(1).strip()
            unit = measure_match.group(2).strip().lower()
        elif measure and not any(c.isdigit() for c in measure):
            # Measure is just a unit like "To taste" or "Handful"
            quantity = "1"
            unit = measure.lower()
        elif not measure:
            quantity = "1"
            unit = "pieces"

        # Clean up unicode fractions
        quantity = (quantity
            .replace("½", "1/2").replace("¼", "1/4").replace("¾", "3/4")
            .replace("⅓", "1/3").replace("⅔", "2/3"))

        if not quantity:
            quantity = "1"

        ingredients.append({
            "name": name,
            "quantity": quantity,
            "unit": unit,
        })

    return ingredients


def parse_instructions(text: str) -> list[dict]:
    """Parse instruction text into numbered steps."""
    if not text:
        return [{"step": 1, "instruction": "Follow recipe directions."}]

    # Clean up the text
    text = text.strip()

    # Try splitting by numbered steps (1. or Step 1 or STEP 1)
    steps = re.split(r"\n\s*(?:Step\s*)?\d+[\.\)]\s*", text, flags=re.IGNORECASE)
    if len(steps) <= 1:
        # Try splitting by \r\n\r\n (paragraph breaks)
        steps = re.split(r"\r?\n\r?\n", text)
    if len(steps) <= 1:
        # Try splitting by \r\n (single line breaks)
        steps = [s.strip() for s in text.split("\n") if s.strip()]

    # Filter out empty steps and number them
    instructions = []
    step_num = 1
    for step in steps:
        step = step.strip()
        # Remove leading step numbers if present
        step = re.sub(r"^(?:Step\s*)?\d+[\.\)]\s*", "", step, flags=re.IGNORECASE)
        step = step.strip()
        if step and len(step) > 5:  # Skip very short fragments
            instructions.append({
                "step": step_num,
                "instruction": step,
            })
            step_num += 1

    if not instructions:
        instructions = [{"step": 1, "instruction": text[:2000]}]

    return instructions


def infer_dietary_tags(ingredients: list[dict], category: str) -> list[str]:
    """Infer dietary tags from ingredients."""
    tags = []
    all_ingredients = " ".join(i["name"].lower() for i in ingredients)

    meat_keywords = ["chicken", "beef", "pork", "turkey", "bacon", "sausage", "ham",
                     "steak", "lamb", "goat", "duck", "veal", "prosciutto", "pepperoni"]
    fish_keywords = ["salmon", "tuna", "shrimp", "fish", "cod", "tilapia", "crab",
                     "lobster", "scallop", "anchov", "prawn", "mussel", "clam", "squid"]
    dairy_keywords = ["milk", "cheese", "cream", "butter", "yogurt", "yoghurt"]
    gluten_keywords = ["flour", "bread", "pasta", "noodle", "tortilla", "cracker",
                       "breadcrumb", "panko", "pastry", "pie crust", "puff pastry"]

    has_meat = any(k in all_ingredients for k in meat_keywords)
    has_fish = any(k in all_ingredients for k in fish_keywords)
    has_dairy = any(k in all_ingredients for k in dairy_keywords)
    has_gluten = any(k in all_ingredients for k in gluten_keywords)

    if category == "Vegan":
        tags.append("Vegan")
        tags.append("Vegetarian")
    elif category == "Vegetarian" or (not has_meat and not has_fish):
        tags.append("Vegetarian")

    if not has_gluten:
        tags.append("Gluten-Free")
    if not has_dairy:
        tags.append("Dairy-Free")

    return tags


def estimate_nutrition(ingredients: list[dict], category: str) -> dict:
    """Estimate rough nutrition per serving based on category and ingredient count."""
    # These are rough estimates based on typical recipes in each category
    base = {
        "Breakfast": {"calories": 350, "protein": 15, "carbs": 40, "fat": 15},
        "Dessert": {"calories": 380, "protein": 5, "carbs": 50, "fat": 18},
        "Starter": {"calories": 200, "protein": 8, "carbs": 20, "fat": 10},
        "Side": {"calories": 180, "protein": 5, "carbs": 25, "fat": 8},
        "Beef": {"calories": 480, "protein": 35, "carbs": 25, "fat": 22},
        "Chicken": {"calories": 420, "protein": 32, "carbs": 20, "fat": 18},
        "Lamb": {"calories": 500, "protein": 30, "carbs": 22, "fat": 28},
        "Pork": {"calories": 460, "protein": 28, "carbs": 22, "fat": 24},
        "Goat": {"calories": 450, "protein": 30, "carbs": 20, "fat": 22},
        "Seafood": {"calories": 350, "protein": 28, "carbs": 20, "fat": 14},
        "Pasta": {"calories": 520, "protein": 18, "carbs": 60, "fat": 20},
        "Vegetarian": {"calories": 320, "protein": 12, "carbs": 40, "fat": 14},
        "Vegan": {"calories": 300, "protein": 10, "carbs": 42, "fat": 12},
        "Miscellaneous": {"calories": 400, "protein": 20, "carbs": 30, "fat": 18},
    }

    vals = base.get(category, base["Miscellaneous"])

    # Add some variation based on ingredient count
    ingredient_factor = len(ingredients) / 10.0  # normalize around 10 ingredients
    variation = int(ingredient_factor * 30) - 15  # -15 to +15 range

    return {
        "calories": vals["calories"] + variation,
        "protein_grams": vals["protein"] + (variation // 10),
        "carbs_grams": vals["carbs"] + (variation // 5),
        "fat_grams": vals["fat"] + (variation // 8),
    }


def infer_difficulty(num_ingredients: int, num_steps: int) -> str:
    """Infer difficulty from complexity."""
    if num_ingredients <= 6 and num_steps <= 4:
        return "Easy"
    elif num_ingredients > 12 or num_steps > 8:
        return "Hard"
    return "Medium"


def convert_meal(meal: dict) -> dict:
    """Convert a TheMealDB meal to Zeus recipe format."""
    ingredients = parse_ingredients(meal)
    instructions = parse_instructions(meal.get("strInstructions", ""))
    category = meal.get("strCategory", "Miscellaneous")
    area = meal.get("strArea", "Unknown")
    nutrition = estimate_nutrition(ingredients, category)

    return {
        "title": meal["strMeal"],
        "description": f"A delicious {area.lower()} {category.lower()} recipe - {meal['strMeal']}.",
        "image_url": meal.get("strMealThumb"),
        "ingredients": ingredients,
        "instructions": instructions,
        "servings": 4,
        "prep_time": 15,
        "cook_time": 30,
        "cuisine_type": AREA_TO_CUISINE.get(area, "American"),
        "difficulty": infer_difficulty(len(ingredients), len(instructions)),
        "meal_type": CATEGORY_TO_MEAL_TYPE.get(category, ["Dinner"]),
        "dietary_tags": infer_dietary_tags(ingredients, category),
        "is_ai_generated": False,
        "calories": nutrition["calories"],
        "protein_grams": nutrition["protein_grams"],
        "carbs_grams": nutrition["carbs_grams"],
        "fat_grams": nutrition["fat_grams"],
        "serving_size": "1 serving (serves 4)",
    }


def main():
    print("\n" + "=" * 60)
    print("  Fetch Recipes from TheMealDB")
    print("=" * 60 + "\n")

    all_meals = []
    print("Fetching all recipes by letter...")
    for letter in "abcdefghijklmnopqrstuvwxyz":
        resp = requests.get(
            f"https://www.themealdb.com/api/json/v1/1/search.php?f={letter}",
            timeout=10,
        )
        data = resp.json()
        if data.get("meals"):
            all_meals.extend(data["meals"])
        print(f"  {letter}: {len(data.get('meals') or [])} meals", end="  ")
        if ord(letter) % 5 == 0:
            print()

    print(f"\n\nTotal meals fetched: {len(all_meals)}")

    # Convert all meals
    recipes = []
    for meal in all_meals:
        try:
            recipe = convert_meal(meal)
            recipes.append(recipe)
        except Exception as e:
            print(f"  Error converting {meal.get('strMeal', '?')}: {e}")

    print(f"Successfully converted: {len(recipes)} recipes")

    # Stats
    meal_type_counts = {}
    cuisine_counts = {}
    for r in recipes:
        for mt in r["meal_type"]:
            meal_type_counts[mt] = meal_type_counts.get(mt, 0) + 1
        cuisine_counts[r["cuisine_type"]] = cuisine_counts.get(r["cuisine_type"], 0) + 1

    print("\nBy meal type:")
    for mt, c in sorted(meal_type_counts.items()):
        print(f"  {mt}: {c}")

    print("\nBy cuisine:")
    for cuisine, c in sorted(cuisine_counts.items(), key=lambda x: -x[1])[:10]:
        print(f"  {cuisine}: {c}")

    has_image = sum(1 for r in recipes if r.get("image_url"))
    print(f"\nWith images: {has_image}/{len(recipes)}")

    # Write output
    output_path = Path(__file__).parent.parent / "app" / "data" / "default_recipes.py"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write('"""Default recipes from TheMealDB (www.themealdb.com)."""\n\n\n')
        f.write("def get_default_recipes() -> list[dict]:\n")
        f.write('    """Return list of default recipes for seeding the database."""\n')
        f.write("    return [\n")

        for recipe in recipes:
            f.write("        {\n")
            for key, value in recipe.items():
                f.write(f"            {repr(key)}: {repr(value)},\n")
            f.write("        },\n")

        f.write("    ]\n")

    print(f"\nOutput: {output_path}")
    print(f"File size: {output_path.stat().st_size / 1024:.0f} KB")
    print("Done!")


if __name__ == "__main__":
    main()
