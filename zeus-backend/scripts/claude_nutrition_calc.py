"""
Use Claude AI to accurately calculate recipe nutrition from ingredients.
Batches 10 recipes per API call using Haiku for cost efficiency.
"""

import json
import os
import sys
import time
from pathlib import Path

import anthropic
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
load_dotenv(Path(__file__).parent.parent / ".env")

from app.database import get_database

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
MODEL = "claude-haiku-4-5-20251001"  # Cheapest, fast enough for nutrition calc
BATCH_SIZE = 10  # Recipes per API call


def format_recipe_for_prompt(recipe: dict, index: int) -> str:
    """Format a single recipe for the batch prompt."""
    ings = recipe.get('ingredients', [])
    ing_lines = []
    for ing in ings:
        if isinstance(ing, dict):
            qty = ing.get('quantity', '')
            unit = ing.get('unit', '')
            name = ing.get('name', '')
            ing_lines.append(f"  - {qty} {unit} {name}".strip())
        elif isinstance(ing, str):
            ing_lines.append(f"  - {ing}")

    return f"""Recipe {index}: {recipe['title']}
Servings: {recipe.get('servings', 1)}
Ingredients:
{chr(10).join(ing_lines)}"""


def parse_response(text: str, batch_size: int) -> list[dict]:
    """Parse Claude's JSON response into nutrition dicts."""
    # Find the JSON array in the response
    try:
        # Try to find JSON array
        start = text.find('[')
        end = text.rfind(']') + 1
        if start >= 0 and end > start:
            data = json.loads(text[start:end])
            return data
    except json.JSONDecodeError:
        pass

    # Try line-by-line JSON objects
    results = []
    for line in text.split('\n'):
        line = line.strip()
        if line.startswith('{'):
            try:
                obj = json.loads(line.rstrip(','))
                results.append(obj)
            except:
                pass
    return results


def calculate_batch(recipes: list[dict]) -> list[dict]:
    """Send a batch of recipes to Claude for nutrition calculation."""
    recipe_texts = []
    for i, r in enumerate(recipes):
        recipe_texts.append(format_recipe_for_prompt(r, i + 1))

    prompt = f"""Calculate accurate per-serving nutrition for each recipe below. Use standard USDA nutritional data for each ingredient.

For each recipe:
1. Calculate the total weight/volume of each ingredient in grams
2. Look up calories, protein, carbs, and fat per 100g for each ingredient
3. Sum the totals and divide by the number of servings

Important rules:
- Use cooked values for items that will be cooked (pasta absorbs water and doubles in weight)
- 1 pound = 453.6g, 1 cup = 240ml, 1 tablespoon = 15ml, 1 teaspoon = 5ml
- For count-based items (e.g., "3 eggs", "40 shrimp"), use standard weights
- A medium shrimp is ~15g, a large egg is ~50g, a chicken breast is ~175g
- Ignore negligible-calorie items (salt, pepper, herbs, spices, water)
- Round to reasonable values

{chr(10).join(recipe_texts)}

Respond with ONLY a JSON array, one object per recipe, in order:
[
  {{"recipe": 1, "calories": 350, "protein": 28.5, "carbs": 42.0, "fat": 8.2}},
  ...
]

No explanation, just the JSON array."""

    for attempt in range(3):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}]
            )
            text = response.content[0].text
            return parse_response(text, len(recipes))
        except Exception as e:
            print(f"  API error (attempt {attempt+1}/3): {e}")
            if attempt < 2:
                time.sleep(5 * (attempt + 1))
    return []


PROGRESS_FILE = Path(__file__).parent / "nutrition_progress.json"


def load_progress() -> set:
    """Load set of already-processed recipe IDs."""
    if PROGRESS_FILE.exists():
        return set(json.loads(PROGRESS_FILE.read_text()))
    return set()


def save_progress(processed_ids: set):
    """Save processed recipe IDs to disk."""
    PROGRESS_FILE.write_text(json.dumps(list(processed_ids)))


def main():
    db = get_database()

    # Load resume state
    processed_ids = load_progress()
    if processed_ids:
        print(f"Resuming: {len(processed_ids)} recipes already processed")

    # Fetch all recipes
    all_recipes = []
    offset = 0
    while True:
        result = db.table('recipes').select(
            'id, title, calories, protein_grams, carbs_grams, fat_grams, servings, ingredients'
        ).range(offset, offset + 999).execute()
        if not result.data:
            break
        all_recipes.extend(result.data)
        if len(result.data) < 1000:
            break
        offset += 1000

    # Filter out already-processed recipes
    remaining = [r for r in all_recipes if r['id'] not in processed_ids]

    print(f"Total recipes: {len(all_recipes)}")
    print(f"Remaining to process: {len(remaining)}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Estimated API calls: {len(remaining) // BATCH_SIZE + 1}")
    print(f"Model: {MODEL}")
    print()

    updated = 0
    errors = 0
    skipped = 0

    for batch_start in range(0, len(remaining), BATCH_SIZE):
        batch = remaining[batch_start:batch_start + BATCH_SIZE]
        batch_num = batch_start // BATCH_SIZE + 1
        total_batches = len(remaining) // BATCH_SIZE + 1

        # Filter out recipes with no/empty ingredients
        valid_batch = [r for r in batch if r.get('ingredients') and isinstance(r['ingredients'], list) and len(r['ingredients']) > 0]
        if not valid_batch:
            skipped += len(batch)
            continue

        results = calculate_batch(valid_batch)

        if len(results) != len(valid_batch):
            # Retry once if mismatch
            time.sleep(1)
            results = calculate_batch(valid_batch)

        if len(results) == len(valid_batch):
            for recipe, nutrition in zip(valid_batch, results):
                cal = nutrition.get('calories', 0)
                prot = nutrition.get('protein', 0)
                carbs = nutrition.get('carbs', 0)
                fat = nutrition.get('fat', 0)

                # Sanity checks
                if cal < 5 or cal > 2000:
                    skipped += 1
                    continue
                if prot < 0 or carbs < 0 or fat < 0:
                    skipped += 1
                    continue

                try:
                    db.table('recipes').update({
                        'calories': round(cal),
                        'protein_grams': round(prot, 1),
                        'carbs_grams': round(carbs, 1),
                        'fat_grams': round(fat, 1),
                    }).eq('id', recipe['id']).execute()
                    updated += 1
                    processed_ids.add(recipe['id'])
                except Exception as e:
                    errors += 1
        else:
            errors += len(valid_batch)
            if errors < 20:
                print(f"  Batch {batch_num}: expected {len(valid_batch)} results, got {len(results)}")

        # Save progress every 10 batches
        if batch_num % 10 == 0 or batch_num == total_batches:
            save_progress(processed_ids)
            print(f"  Batch {batch_num}/{total_batches} | Updated: {updated} | Skipped: {skipped} | Errors: {errors}")

        # Small delay to avoid rate limiting
        time.sleep(0.3)

    print(f"\nDone!")
    print(f"  Updated: {updated}")
    print(f"  Skipped: {skipped}")
    print(f"  Errors: {errors}")

    # Spot checks
    print("\n--- Spot checks ---")
    checks = [
        'Garlic Shrimp Linguine',
        'Shrimp Linguine Alfredo',
        'Garlic Shrimp Kabobs',
        'Classic Chicken Caesar Salad',
        'Beef Stew IV',
        'Ground Beef Curly Noodle',
    ]
    for title in checks:
        result = db.table('recipes').select(
            'title, calories, protein_grams, carbs_grams, fat_grams, servings'
        ).eq('title', title).execute()
        for r in result.data:
            print(f"  {r['title'][:45]}: {r['calories']}cal {r['protein_grams']}P {r['carbs_grams']}C {r['fat_grams']}F (serves {r['servings']})")


if __name__ == "__main__":
    main()
