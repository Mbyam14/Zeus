"""
AllRecipes Import Script
========================
Imports curated recipes from AllRecipes archive into the Zeus Supabase DB.
Replaces existing TheMealDB default recipes.
"""

import json
import re
import os
import sys
import random
from datetime import datetime

# Add parent paths so we can import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from supabase import create_client

# --- CONFIG ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "") or os.environ.get("SUPABASE_KEY", "")
SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"
IMAGE_BASE_URL = "https://images.allrecipes.com/userphotos"
DATA_FILE = os.path.join(os.path.dirname(__file__), "database", "allrecipes.com_database_12042020000000.json")

# Target counts
TARGET_SIMPLE = 400    # <= 10 ingredients
TARGET_MEDIUM = 200    # 11-15 ingredients
TARGET_COMPLEX = 50    # 16+ ingredients
TOTAL_TARGET = TARGET_SIMPLE + TARGET_MEDIUM + TARGET_COMPLEX

# Categories that indicate actual meals (not crafts, drinks, etc.)
MEAL_CATEGORIES = {
    'Main Dish', 'Breakfast and Brunch', 'Chicken', 'Meat and Poultry',
    'Seafood', 'Pork', 'Pasta', 'Eggs', 'Chicken Breasts', 'Side Dish',
    'Soup', 'Soups, Stews and Chili', 'Salad', 'Vegetable Salads',
    'Mexican', 'Italian', 'Asian', 'Everyday Cooking', 'Beef', 'Sandwich',
    'Lunch', 'Latin American', 'European', 'Vegetables', 'Potatoes',
    'Rice', 'Beans and Peas', 'Tofu', 'Lamb', 'Turkey', 'Stew',
    'Fruits and Vegetables', 'Squash'
}

# Categories to EXCLUDE (not real meals)
EXCLUDE_CATEGORIES = {
    'Desserts', 'Cookies', 'Cakes', 'Pies', 'Bread', 'Quick Bread',
    'Yeast Bread', 'Drinks', 'Cocktails', 'Smoothies',
    'Sauces and Condiments', 'Sauces', 'Dips and Spreads',
    'Fruit Desserts', 'Candy', 'Frosting and Icing',
    'Decorating', 'Crafts'
}

# Map AllRecipes categories to our meal_type field
MEAL_TYPE_MAP = {
    'Breakfast and Brunch': 'Breakfast',
    'Eggs': 'Breakfast',
    'Lunch': 'Lunch',
    'Sandwich': 'Lunch',
    'Main Dish': 'Dinner',
    'Chicken': 'Dinner',
    'Chicken Breasts': 'Dinner',
    'Meat and Poultry': 'Dinner',
    'Seafood': 'Dinner',
    'Pork': 'Dinner',
    'Beef': 'Dinner',
    'Lamb': 'Dinner',
    'Turkey': 'Dinner',
    'Pasta': 'Dinner',
    'Soup': 'Lunch',
    'Soups, Stews and Chili': 'Dinner',
    'Salad': 'Lunch',
    'Vegetable Salads': 'Lunch',
    'Side Dish': 'Dinner',
    'Appetizers and Snacks': 'Snack',
}

# Map categories to cuisine_type
CUISINE_MAP = {
    'Mexican': 'Mexican',
    'Italian': 'Italian',
    'Asian': 'Asian',
    'Latin American': 'Latin American',
    'European': 'European',
    'Indian': 'Indian',
    'Chinese': 'Chinese',
    'Japanese': 'Japanese',
    'Thai': 'Thai',
    'Korean': 'Korean',
    'French': 'French',
    'Greek': 'Greek',
    'Mediterranean': 'Mediterranean',
}


def parse_duration(iso_str):
    """Parse ISO 8601 duration (e.g., PT25M, PT1H30M) to minutes."""
    if not iso_str or iso_str == '0':
        return None
    match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?', str(iso_str))
    if not match:
        return None
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    total = hours * 60 + minutes
    return total if total > 0 else None


def parse_number(val):
    """Extract a number from a string like '669' or '36.8g'."""
    if not val:
        return None
    match = re.match(r'([\d.]+)', str(val))
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return None
    return None


def parse_ingredient(ing_str):
    """Parse an ingredient string like '2 cups flour' into our schema format."""
    # Our schema: {"name": "flour", "amount": "2", "unit": "cups"}
    ing_str = ing_str.strip()

    # Try to extract amount and unit
    # Pattern: optional amount (number/fraction), optional unit, then name
    match = re.match(
        r'^([\d./\s½¼¾⅓⅔⅛]+)?\s*'
        r'(cups?|tablespoons?|tbsp|teaspoons?|tsp|pounds?|lbs?|ounces?|oz|'
        r'cloves?|cans?|packages?|pieces?|slices?|stalks?|heads?|bunche?s?|'
        r'pinche?s?|dashes?|sprigs?|leaves?|quarts?|gallons?|pints?|'
        r'fl oz|fluid ounces?|sticks?|bags?|boxes?|jars?|bottles?|'
        r'handfuls?|links?|fillets?|breasts?|thighs?|drumsticks?|'
        r'\(\d+[\s\w.]*\))?\s*'
        r'(.+)',
        ing_str, re.IGNORECASE
    )

    if match:
        amount = (match.group(1) or '').strip()
        unit = (match.group(2) or '').strip()
        name = (match.group(3) or ing_str).strip()
        # Clean up name - remove leading "of "
        name = re.sub(r'^of\s+', '', name)
    else:
        amount = ''
        unit = ''
        name = ing_str

    return {
        "name": name,
        "quantity": amount if amount else "to taste",
        "unit": unit if unit else ""
    }


def determine_meal_types(categories):
    """Determine meal_type array from AllRecipes categories."""
    types = set()
    for cat in categories:
        if cat in MEAL_TYPE_MAP:
            types.add(MEAL_TYPE_MAP[cat])

    if not types:
        types.add('Dinner')  # Default

    return list(types)


def determine_cuisine(categories):
    """Determine cuisine_type from categories."""
    for cat in categories:
        if cat in CUISINE_MAP:
            return CUISINE_MAP[cat]
    return 'American'  # Default for AllRecipes


def determine_difficulty(ingredients_count, steps_count, cook_time_min):
    """Determine difficulty based on recipe complexity."""
    if ingredients_count <= 6 and steps_count <= 4:
        return 'Easy'
    elif ingredients_count <= 12 and steps_count <= 8:
        return 'Medium'
    else:
        return 'Hard'


def determine_dietary_tags(ingredients, title, categories):
    """Infer dietary tags from ingredients and categories."""
    tags = []
    all_text = ' '.join(ingredients).lower() + ' ' + title.lower() + ' ' + ' '.join(categories).lower()

    # Check for vegetarian/vegan indicators
    meat_keywords = ['chicken', 'beef', 'pork', 'bacon', 'sausage', 'ham', 'turkey',
                     'lamb', 'steak', 'ground meat', 'fish', 'salmon', 'shrimp', 'tuna',
                     'crab', 'lobster', 'prawn', 'anchov', 'pepperoni', 'salami']
    has_meat = any(kw in all_text for kw in meat_keywords)

    if 'vegetarian' in all_text or 'vegan' in all_text:
        tags.append('Vegetarian')
    if 'vegan' in all_text:
        tags.append('Vegan')

    # Gluten-free check
    gluten_keywords = ['flour', 'bread', 'pasta', 'noodle', 'tortilla', 'cracker',
                       'breadcrumb', 'panko', 'couscous', 'barley', 'wheat']
    if not any(kw in all_text for kw in gluten_keywords):
        if 'gluten' not in all_text:  # Don't tag if recipe mentions gluten at all
            tags.append('Gluten-Free')

    # Dairy-free check
    dairy_keywords = ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'sour cream',
                      'whipping cream', 'half-and-half', 'parmesan', 'mozzarella',
                      'cheddar', 'ricotta', 'feta']
    if not any(kw in all_text for kw in dairy_keywords):
        tags.append('Dairy-Free')

    # High protein
    protein_keywords = ['chicken', 'beef', 'pork', 'turkey', 'fish', 'salmon', 'shrimp',
                        'eggs', 'tofu', 'beans', 'lentils', 'steak']
    if any(kw in all_text for kw in protein_keywords):
        tags.append('High-Protein')

    return tags


def convert_recipe(ar_recipe):
    """Convert an AllRecipes recipe to our DB schema."""
    cats = ar_recipe.get('categories', [])
    ingredients_raw = ar_recipe.get('ingredients', [])
    steps = ar_recipe.get('steps', [])
    nutrition = ar_recipe.get('nutritional_information', {})

    # Parse ingredients
    ingredients = [parse_ingredient(ing) for ing in ingredients_raw]

    # Parse instructions
    instructions = [
        {"step": s['step'], "instruction": s['instruction']}
        for s in steps
    ]

    # Parse nutrition
    calories = parse_number(nutrition.get('calories'))
    protein = parse_number(nutrition.get('protein'))
    carbs = parse_number(nutrition.get('total_carbohydrate'))
    fat = parse_number(nutrition.get('total_fat'))
    servings_raw = parse_number(nutrition.get('servings'))
    servings = int(servings_raw) if servings_raw and servings_raw > 0 else 4

    # Parse times
    prep_time = parse_duration(ar_recipe.get('prep_time'))
    cook_time = parse_duration(ar_recipe.get('cook_time'))

    # Determine fields
    meal_types = determine_meal_types(cats)
    cuisine = determine_cuisine(cats)
    difficulty = determine_difficulty(len(ingredients_raw), len(steps), cook_time or 0)
    dietary_tags = determine_dietary_tags(ingredients_raw, ar_recipe['title'], cats)

    # Image URL - use first image
    image_url = None
    if ar_recipe.get('images'):
        image_url = f"{IMAGE_BASE_URL}/{ar_recipe['images'][0]}"

    # Clean title of HTML entities
    title = ar_recipe.get('title', '')
    title = title.replace('&#34;', '"').replace('&#38;', '&').replace('&#174;', '').replace('&#39;', "'")

    description = ar_recipe.get('description', '') or f"A delicious {difficulty.lower()} recipe for {title}."
    description = description.replace('&#34;', '"').replace('&#38;', '&').replace('&#174;', '').replace('&#39;', "'")

    return {
        "user_id": SYSTEM_USER_ID,
        "title": title,
        "description": description[:500],
        "image_url": image_url,
        "ingredients": ingredients,
        "instructions": instructions,
        "servings": servings,
        "prep_time": prep_time,
        "cook_time": cook_time,
        "cuisine_type": cuisine,
        "difficulty": difficulty,
        "meal_type": meal_types,
        "dietary_tags": dietary_tags,
        "is_ai_generated": False,
        "calories": int(calories) if calories else None,
        "protein_grams": round(protein, 1) if protein else None,
        "carbs_grams": round(carbs, 1) if carbs else None,
        "fat_grams": round(fat, 1) if fat else None,
        "serving_size": f"1 serving (serves {servings})",
    }


def is_qualified(r):
    """Check if a recipe meets basic quality requirements (ignoring category filter)."""
    if not r.get('images'):
        return False
    if float(r.get('rating', 0)) < 4.0:
        return False
    if len(r.get('steps', [])) == 0:
        return False
    if len(r.get('ingredients', [])) < 2:
        return False
    cal = parse_number(r.get('nutritional_information', {}).get('calories'))
    if not cal or cal == 0:
        return False
    return True


# Must-have basic recipe search terms - we guarantee the best match for each
MUST_HAVE_BASICS = [
    # Breakfast basics
    'scrambled eggs', 'poached eggs', 'omelette', 'omelet', 'french toast',
    'pancakes', 'waffles', 'avocado toast', 'breakfast burrito', 'egg sandwich',
    'hash browns', 'bacon and eggs', 'overnight oats',
    # Simple proteins
    'grilled chicken', 'baked chicken', 'pan seared chicken', 'chicken stir fry',
    'grilled steak', 'pan seared steak', 'baked salmon', 'grilled salmon',
    'pan seared salmon', 'shrimp stir fry', 'grilled shrimp', 'baked fish',
    'ground beef', 'meatballs', 'pork chops', 'grilled pork',
    # Quick meals
    'quesadilla', 'tacos', 'burrito bowl', 'taco bowl', 'fried rice',
    'chicken fried rice', 'stir fry', 'ramen', 'lo mein',
    'grilled cheese', 'BLT', 'club sandwich', 'chicken wrap',
    # Pasta
    'spaghetti', 'mac and cheese', 'alfredo', 'carbonara', 'penne',
    'pasta salad', 'garlic butter pasta', 'chicken pasta',
    # Rice & bowls
    'rice bowl', 'chicken rice', 'rice and beans', 'cilantro lime rice',
    'teriyaki chicken', 'teriyaki salmon',
    # Comfort food
    'mashed potatoes', 'baked potato', 'potato soup', 'chicken soup',
    'tomato soup', 'grilled cheese and tomato soup', 'chili',
    'chicken noodle soup', 'beef stew',
    # Salads
    'caesar salad', 'chicken salad', 'greek salad', 'cobb salad',
    # Sides
    'roasted vegetables', 'steamed broccoli', 'corn on the cob',
    'coleslaw', 'baked beans', 'garlic bread',
]


def find_must_haves(data):
    """Find best matching recipe for each must-have basic."""
    must_have_recipes = []
    used_ids = set()

    for term in MUST_HAVE_BASICS:
        # Find matches in full dataset (no category restriction)
        matches = [
            r for r in data
            if term.lower() in r['title'].lower()
            and is_qualified(r)
            and r['id'] not in used_ids
        ]

        if not matches:
            continue

        # Sort by fewest ingredients first (simplest), then highest rating
        matches.sort(key=lambda r: (len(r['ingredients']), -float(r.get('rating', 0))))

        best = matches[0]
        must_have_recipes.append(best)
        used_ids.add(best['id'])

        # Also grab a second variant if available (different approach to same dish)
        if len(matches) > 1:
            alt = matches[1]
            must_have_recipes.append(alt)
            used_ids.add(alt['id'])

    return must_have_recipes, used_ids


def filter_and_curate(data):
    """Filter and curate recipes from AllRecipes data."""

    # Step 1: Find must-have basics first
    print("Finding must-have basic recipes...")
    must_haves, used_ids = find_must_haves(data)
    print(f"  Found {len(must_haves)} must-have basic recipes")

    # Step 2: Filter remaining recipes for general pool
    qualified = []
    for r in data:
        if r['id'] in used_ids:
            continue

        cats = set(r.get('categories', []))

        # Must have at least one meal category
        if not cats.intersection(MEAL_CATEGORIES):
            continue

        # Skip desserts, drinks, etc. (unless also tagged as a meal)
        if cats.intersection(EXCLUDE_CATEGORIES) and not cats.intersection({'Main Dish', 'Breakfast and Brunch', 'Everyday Cooking'}):
            continue

        if not is_qualified(r):
            continue

        qualified.append(r)

    print(f"  Qualified pool recipes: {len(qualified)}")

    # Step 3: Calculate remaining slots
    remaining_target = TOTAL_TARGET - len(must_haves)

    # Split remaining by complexity
    simple = [r for r in qualified if len(r['ingredients']) <= 10]
    medium = [r for r in qualified if 10 < len(r['ingredients']) <= 15]
    complex_r = [r for r in qualified if len(r['ingredients']) > 15]

    # Adjust targets based on how many must-haves we already have
    must_simple = len([r for r in must_haves if len(r['ingredients']) <= 10])
    must_medium = len([r for r in must_haves if 10 < len(r['ingredients']) <= 15])
    must_complex = len([r for r in must_haves if len(r['ingredients']) > 15])

    remaining_simple = max(0, TARGET_SIMPLE - must_simple)
    remaining_medium = max(0, TARGET_MEDIUM - must_medium)
    remaining_complex = max(0, TARGET_COMPLEX - must_complex)

    print(f"  Must-haves: {must_simple} simple, {must_medium} medium, {must_complex} complex")
    print(f"  Remaining slots: {remaining_simple} simple, {remaining_medium} medium, {remaining_complex} complex")

    # Sort each by rating
    def sort_key(r):
        rating = float(r.get('rating', 0))
        return (-rating, random.random())

    simple.sort(key=sort_key)
    medium.sort(key=sort_key)
    complex_r.sort(key=sort_key)

    # Select diverse from remaining pool
    selected_simple = select_diverse(simple, remaining_simple)
    selected_medium = select_diverse(medium, remaining_medium)
    selected_complex = select_diverse(complex_r, remaining_complex)

    all_selected = must_haves + selected_simple + selected_medium + selected_complex
    print(f"\nTotal: {len(must_haves)} must-haves + {len(selected_simple)} simple + {len(selected_medium)} medium + {len(selected_complex)} complex = {len(all_selected)}")

    return all_selected


def select_diverse(recipes, target):
    """Select recipes ensuring diversity across categories."""
    if len(recipes) <= target:
        return recipes

    # Group by primary category
    by_category = {}
    for r in recipes:
        cats = r.get('categories', [])
        primary = cats[0] if cats else 'Other'
        if primary not in by_category:
            by_category[primary] = []
        by_category[primary].append(r)

    selected = []
    # Round-robin from each category
    while len(selected) < target:
        added_this_round = False
        for cat in list(by_category.keys()):
            if by_category[cat] and len(selected) < target:
                selected.append(by_category[cat].pop(0))
                added_this_round = True
        if not added_this_round:
            break

    return selected


def main():
    print("=" * 60)
    print("AllRecipes Import Script")
    print("=" * 60)

    # Load data
    print(f"\nLoading AllRecipes data from {DATA_FILE}...")
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(f"Loaded {len(data)} recipes")

    # Filter and curate
    print("\nFiltering and curating recipes...")
    random.seed(42)  # Reproducible selection
    selected = filter_and_curate(data)

    # Convert to our schema
    print("\nConverting to DB schema...")
    converted = []
    for r in selected:
        try:
            converted.append(convert_recipe(r))
        except Exception as e:
            print(f"  Error converting '{r.get('title')}': {e}")

    print(f"Successfully converted {len(converted)} recipes")

    # Show sample
    print("\nSample recipes:")
    for r in converted[:10]:
        print(f"  {r['title']} - {r['difficulty']} - {r['meal_type']} - {r['cuisine_type']} - {len(r['ingredients'])} ing")

    # Connect to Supabase
    supabase_url = SUPABASE_URL
    supabase_key = SUPABASE_KEY

    if not supabase_url or not supabase_key:
        # Try loading from .env
        env_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if '=' in line and not line.startswith('#'):
                        key, val = line.split('=', 1)
                        os.environ[key.strip()] = val.strip()
            supabase_url = os.environ.get("SUPABASE_URL", "")
            supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "") or os.environ.get("SUPABASE_KEY", "")

    if not supabase_url or not supabase_key:
        print("\nERROR: SUPABASE_URL and SUPABASE_KEY must be set!")
        print("Saving converted recipes to JSON for manual review...")
        with open(os.path.join(os.path.dirname(__file__), 'converted_recipes.json'), 'w') as f:
            json.dump(converted, f, indent=2)
        print("Saved to converted_recipes.json")
        return

    db = create_client(supabase_url, supabase_key)

    # Step 1: Delete existing default recipes
    print(f"\nDeleting existing default recipes (user_id={SYSTEM_USER_ID})...")
    try:
        result = db.table("recipes").delete().eq("user_id", SYSTEM_USER_ID).execute()
        deleted_count = len(result.data) if result.data else 0
        print(f"  Deleted {deleted_count} existing default recipes")
    except Exception as e:
        print(f"  Error deleting: {e}")
        return

    # Step 2: Insert new recipes in batches
    print(f"\nInserting {len(converted)} new recipes...")
    BATCH_SIZE = 50
    inserted = 0
    errors = 0

    for i in range(0, len(converted), BATCH_SIZE):
        batch = converted[i:i + BATCH_SIZE]
        try:
            result = db.table("recipes").insert(batch).execute()
            inserted += len(result.data) if result.data else len(batch)
            print(f"  Batch {i // BATCH_SIZE + 1}: inserted {len(batch)} recipes ({inserted} total)")
        except Exception as e:
            print(f"  Batch {i // BATCH_SIZE + 1} ERROR: {e}")
            # Try one-by-one for this batch
            for recipe in batch:
                try:
                    db.table("recipes").insert(recipe).execute()
                    inserted += 1
                except Exception as e2:
                    errors += 1
                    print(f"    Failed: {recipe['title']} - {e2}")

    print(f"\n{'=' * 60}")
    print(f"DONE! Inserted {inserted} recipes, {errors} errors")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
