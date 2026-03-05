"""
Auto-tag recipes with dietary tags based on their ingredients.

Scans all recipes and assigns dietary tags (Vegetarian, Vegan, Gluten-Free,
Dairy-Free, Pescatarian) based on ingredient analysis.

Usage:
    cd zeus-backend
    python scripts/tag_recipes_dietary.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import Database

# Ingredient keywords that indicate non-vegetarian
MEAT_KEYWORDS = [
    'chicken', 'beef', 'pork', 'turkey', 'lamb', 'bacon', 'sausage', 'ham',
    'steak', 'mince', 'meatball', 'meatloaf', 'veal', 'duck', 'goose',
    'venison', 'bison', 'prosciutto', 'pancetta', 'salami', 'pepperoni',
    'chorizo', 'bratwurst', 'hot dog', 'ribs', 'drumstick', 'thigh',
    'breast', 'wing', 'ground beef', 'ground turkey', 'ground pork',
    'ground chicken', 'pulled pork', 'roast beef', 'corned beef',
    'meat', 'lard', 'suet', 'gelatin', 'bone broth',
]

# Seafood/fish keywords
FISH_KEYWORDS = [
    'salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'bass',
    'mackerel', 'sardine', 'anchovy', 'swordfish', 'mahi', 'catfish',
    'shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster',
    'scallop', 'squid', 'calamari', 'octopus', 'fish', 'seafood',
    'fish sauce', 'fish stock', 'worcestershire',
]

# Dairy keywords
DAIRY_KEYWORDS = [
    'milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt',
    'sour cream', 'cream cheese', 'mozzarella', 'parmesan', 'cheddar',
    'ricotta', 'feta', 'brie', 'gouda', 'gruyere', 'provolone',
    'cottage cheese', 'mascarpone', 'ghee', 'whey', 'casein',
    'half and half', 'half-and-half', 'heavy cream', 'whipped cream',
    'ice cream', 'custard',
]

# Gluten keywords
GLUTEN_KEYWORDS = [
    'flour', 'bread', 'pasta', 'noodle', 'spaghetti', 'penne', 'linguine',
    'fettuccine', 'macaroni', 'tortilla', 'wrap', 'pita', 'naan',
    'crouton', 'breadcrumb', 'panko', 'couscous', 'barley', 'rye',
    'wheat', 'semolina', 'bulgur', 'seitan', 'soy sauce',
    'biscuit', 'cookie', 'cake', 'pastry', 'croissant', 'bagel',
    'cracker', 'pretzel', 'dumpling', 'wonton', 'udon', 'ramen',
]

# Animal product keywords (for vegan check - includes dairy + eggs + honey)
ANIMAL_PRODUCT_KEYWORDS = DAIRY_KEYWORDS + [
    'egg', 'eggs', 'honey', 'mayo', 'mayonnaise', 'anchovy',
    'worcestershire', 'gelatin',
]


def get_ingredient_names(recipe: dict) -> list[str]:
    """Extract lowercased ingredient names from a recipe."""
    ingredients = recipe.get('ingredients') or []
    names = []
    for ing in ingredients:
        if isinstance(ing, dict):
            name = ing.get('name', '').lower().strip()
            if name:
                names.append(name)
        elif isinstance(ing, str):
            names.append(ing.lower().strip())
    return names


def has_keyword(ingredient_names: list[str], keywords: list[str]) -> bool:
    """Check if any ingredient contains any of the keywords."""
    for name in ingredient_names:
        for keyword in keywords:
            if keyword in name:
                return True
    return False


def determine_dietary_tags(recipe: dict) -> list[str]:
    """Determine dietary tags for a recipe based on its ingredients."""
    ingredient_names = get_ingredient_names(recipe)
    title = (recipe.get('title') or '').lower()

    # Also check the title for clues
    all_text = ingredient_names + [title]

    has_meat = has_keyword(all_text, MEAT_KEYWORDS)
    has_fish = has_keyword(all_text, FISH_KEYWORDS)
    has_dairy = has_keyword(all_text, DAIRY_KEYWORDS)
    has_gluten = has_keyword(all_text, GLUTEN_KEYWORDS)
    has_animal = has_keyword(all_text, ANIMAL_PRODUCT_KEYWORDS)

    tags = []

    # Vegetarian: no meat, no fish
    if not has_meat and not has_fish:
        tags.append('Vegetarian')

    # Vegan: no meat, no fish, no dairy, no eggs, no honey
    if not has_meat and not has_fish and not has_animal:
        tags.append('Vegan')

    # Pescatarian: no meat (fish is ok)
    if not has_meat:
        tags.append('Pescatarian')

    # Dairy-Free: no dairy
    if not has_dairy:
        tags.append('Dairy-Free')

    # Gluten-Free: no gluten
    if not has_gluten:
        tags.append('Gluten-Free')

    return tags


def main():
    db = Database()
    client = db.connect()

    print("Fetching all recipes...")

    # Fetch all recipes in batches (Supabase has row limits)
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

    print(f"Found {len(all_recipes)} recipes total")

    # Count current state
    empty_tags = sum(1 for r in all_recipes if not r.get('dietary_tags'))
    print(f"Recipes with no dietary tags: {empty_tags}")

    updated = 0
    skipped = 0

    for recipe in all_recipes:
        new_tags = determine_dietary_tags(recipe)
        old_tags = recipe.get('dietary_tags') or []

        # Merge: keep any existing tags and add new ones
        merged_tags = list(set(old_tags + new_tags))
        merged_tags.sort()

        old_sorted = sorted(old_tags)
        if merged_tags != old_sorted:
            client.table('recipes').update({
                'dietary_tags': merged_tags
            }).eq('id', recipe['id']).execute()
            updated += 1
            if updated <= 10:
                print(f"  Tagged: {recipe['title']}: {old_tags} -> {merged_tags}")
            elif updated == 11:
                print("  ... (showing first 10 only)")
        else:
            skipped += 1

    print(f"\nDone! Updated: {updated}, Already correct: {skipped}")

    # Print summary stats
    result = client.table('recipes').select('dietary_tags').execute()
    tag_counts = {}
    for r in result.data:
        for tag in (r.get('dietary_tags') or []):
            tag_counts[tag] = tag_counts.get(tag, 0) + 1

    print("\nTag distribution:")
    for tag, count in sorted(tag_counts.items(), key=lambda x: -x[1]):
        print(f"  {tag}: {count}")


if __name__ == '__main__':
    main()
