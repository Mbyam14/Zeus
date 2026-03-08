"""
Use Claude AI to properly tag all recipes with dietary tags.

Sends batches of recipes (title + ingredients) to Claude and gets back
accurate dietary tags based on common culinary knowledge.

Usage:
    cd zeus-backend
    python scripts/ai_tag_recipes.py
"""

import sys
import os
import json
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import Database
from app.config import settings
import anthropic


VALID_TAGS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Pescatarian', 'Keto', 'Paleo']

BATCH_SIZE = 50  # recipes per API call


def build_prompt(recipes_batch: list[dict]) -> str:
    """Build the prompt for Claude with a batch of recipes."""
    recipe_lines = []
    for i, r in enumerate(recipes_batch):
        ingredients = r.get('ingredients') or []
        ing_names = []
        for ing in ingredients:
            if isinstance(ing, dict):
                name = ing.get('name', '')
                if name:
                    ing_names.append(name)
            elif isinstance(ing, str):
                ing_names.append(ing)

        ing_str = ', '.join(ing_names) if ing_names else '(no ingredients listed)'
        recipe_lines.append(f'{i}. "{r["title"]}" — Ingredients: {ing_str}')

    recipes_text = '\n'.join(recipe_lines)

    return f"""You are a culinary expert. For each recipe below, determine which dietary tags apply.

Available tags: {', '.join(VALID_TAGS)}

Rules:
- Vegetarian: No meat (chicken, beef, pork, lamb, turkey, duck, etc.) and no fish/seafood. Eggs and dairy ARE allowed.
- Vegan: No animal products at all (no meat, fish, dairy, eggs, honey).
- Pescatarian: No meat, but fish/seafood IS allowed. Eggs and dairy allowed.
- Dairy-Free: No milk, cheese, butter, cream, yogurt, or any dairy product. Ghee counts as dairy.
- Gluten-Free: No wheat, flour, bread, pasta, barley, rye, couscous, soy sauce, or gluten-containing grains. Rice, corn, quinoa, oats (if specified gluten-free) are OK.
- Keto: Very low carb — no bread, pasta, rice, potatoes, sugar, flour, grains, most fruits. High fat, moderate protein.
- Paleo: No grains, dairy, legumes, refined sugar, or processed foods. Meat, fish, vegetables, fruits, nuts, seeds are OK.

IMPORTANT: If ingredients are missing or incomplete, use your culinary knowledge of the dish name to infer what it typically contains. For example, "Spaghetti Carbonara" contains pasta (not gluten-free), cheese and eggs (not vegan), and traditionally pancetta/guanciale (not vegetarian).

A recipe can have MULTIPLE tags. For example, a salad with only vegetables would be: Vegetarian, Vegan, Pescatarian, Dairy-Free, Gluten-Free, Paleo.

Respond with ONLY a JSON array where each element is an object with "index" (number) and "tags" (array of strings). No other text.

Recipes:
{recipes_text}"""


def main():
    db = Database()
    client = db.connect()

    ai_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    print("Fetching all recipes...")
    all_recipes = []
    offset = 0
    batch_size = 1000
    while True:
        result = client.table('recipes').select(
            'id, title, ingredients, dietary_tags'
        ).range(offset, offset + batch_size - 1).execute()
        if not result.data:
            break
        all_recipes.extend(result.data)
        if len(result.data) < batch_size:
            break
        offset += batch_size

    print(f"Found {len(all_recipes)} recipes")

    total_updated = 0
    total_batches = (len(all_recipes) + BATCH_SIZE - 1) // BATCH_SIZE

    for batch_num in range(total_batches):
        start = batch_num * BATCH_SIZE
        end = min(start + BATCH_SIZE, len(all_recipes))
        batch = all_recipes[start:end]

        print(f"\nBatch {batch_num + 1}/{total_batches} (recipes {start+1}-{end})...")

        prompt = build_prompt(batch)

        try:
            response = ai_client.messages.create(
                model="claude-sonnet-4-5-20250929",
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}]
            )

            response_text = response.content[0].text.strip()

            # Parse JSON response - handle markdown code blocks
            if response_text.startswith('```'):
                response_text = response_text.split('\n', 1)[1]
                if response_text.endswith('```'):
                    response_text = response_text[:-3].strip()

            tag_results = json.loads(response_text)

            for item in tag_results:
                idx = item['index']
                new_tags = item['tags']

                # Validate tags
                new_tags = [t for t in new_tags if t in VALID_TAGS]
                new_tags.sort()

                recipe = batch[idx]
                old_tags = sorted(recipe.get('dietary_tags') or [])
                # Keep only valid tags from old, then compare
                old_valid = sorted([t for t in old_tags if t in VALID_TAGS])

                if new_tags != old_valid:
                    # Preserve any non-standard tags from old (like 'High Protein')
                    extra_old = [t for t in old_tags if t not in VALID_TAGS]
                    final_tags = sorted(set(new_tags + extra_old))

                    client.table('recipes').update({
                        'dietary_tags': final_tags
                    }).eq('id', recipe['id']).execute()
                    total_updated += 1

                    if total_updated <= 20:
                        print(f"  Fixed: {recipe['title']}: {old_tags} -> {final_tags}")

        except json.JSONDecodeError as e:
            print(f"  ERROR parsing JSON for batch {batch_num + 1}: {e}")
            print(f"  Response: {response_text[:200]}")
            continue
        except Exception as e:
            print(f"  ERROR in batch {batch_num + 1}: {e}")
            continue

        # Rate limiting
        if batch_num < total_batches - 1:
            time.sleep(1)

    print(f"\n{'='*50}")
    print(f"Done! Updated {total_updated} recipes across {total_batches} batches")

    # Print final stats
    result = client.table('recipes').select('dietary_tags').execute()
    tag_counts = {}
    for r in result.data:
        for tag in (r.get('dietary_tags') or []):
            if tag in VALID_TAGS:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1

    print("\nFinal tag distribution:")
    for tag, count in sorted(tag_counts.items(), key=lambda x: -x[1]):
        print(f"  {tag}: {count}")


if __name__ == '__main__':
    main()
