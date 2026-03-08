"""
Shared ingredient matching utilities.

Used by:
- recipe_shortlist_service (pantry-aware scoring)
- grocery_list_service (pantry deduction for grocery lists)
- pantry_service (duplicate detection)
"""

import re
from typing import Dict, List, Optional, Set, Tuple


# Ingredient variation groups: base ingredient -> set of known names
INGREDIENT_VARIATIONS: Dict[str, Set[str]] = {
    "egg": {"eggs", "egg", "large egg", "large eggs"},
    "milk": {"milk", "whole milk", "2% milk", "skim milk", "oat milk", "almond milk"},
    "butter": {"butter", "unsalted butter", "salted butter"},
    "cheese": {"cheese", "cheddar cheese", "mozzarella cheese", "parmesan", "cheddar", "mozzarella",
               "cream cheese", "swiss cheese", "provolone", "american cheese", "gouda", "feta",
               "ricotta", "cottage cheese", "pepper jack"},
    "chicken": {"chicken", "chicken breast", "chicken thigh", "chicken thighs",
                "boneless skinless chicken breast", "boneless chicken breast",
                "chicken drumstick", "chicken leg", "chicken wing", "chicken tender"},
    "beef": {"beef", "ground beef", "beef steak", "stewing beef", "beef chuck", "sirloin",
             "chuck roast", "flank steak"},
    "pork": {"pork", "pork chop", "pork loin", "ground pork", "pork tenderloin", "bacon",
             "ham", "pork shoulder"},
    "rice": {"rice", "white rice", "brown rice", "jasmine rice", "basmati rice", "long grain rice"},
    "pasta": {"pasta", "spaghetti", "penne", "fettuccine", "macaroni", "linguine", "noodles",
              "rigatoni", "rotini", "elbow macaroni", "egg noodles"},
    "tomato": {"tomato", "tomatoes", "cherry tomato", "cherry tomatoes", "roma tomato",
               "diced tomatoes", "crushed tomatoes", "tomato sauce", "tomato paste"},
    "onion": {"onion", "onions", "yellow onion", "red onion", "white onion", "sweet onion"},
    "garlic": {"garlic", "garlic clove", "garlic cloves", "minced garlic"},
    "potato": {"potato", "potatoes", "russet potato", "yukon gold potato", "red potato",
               "sweet potato", "sweet potatoes"},
    "pepper": {"bell pepper", "green pepper", "red pepper", "green bell pepper",
               "red bell pepper", "yellow bell pepper", "orange bell pepper"},
    "carrot": {"carrot", "carrots"},
    "celery": {"celery", "celery stalk", "celery stalks"},
    "olive oil": {"olive oil", "extra virgin olive oil", "evoo"},
    "vegetable oil": {"vegetable oil", "canola oil", "cooking oil"},
    "flour": {"flour", "all-purpose flour", "all purpose flour", "ap flour"},
    "sugar": {"sugar", "granulated sugar", "white sugar"},
    "brown sugar": {"brown sugar", "light brown sugar", "dark brown sugar", "packed brown sugar"},
    "salt": {"salt", "kosher salt", "sea salt", "table salt"},
    "black pepper": {"black pepper", "ground black pepper", "pepper", "cracked black pepper"},
    "soy sauce": {"soy sauce", "low sodium soy sauce"},
    "broth": {"broth", "chicken broth", "beef broth", "vegetable broth",
              "stock", "chicken stock", "beef stock", "vegetable stock"},
    "lettuce": {"lettuce", "romaine lettuce", "iceberg lettuce", "romaine"},
    "apple": {"apple", "apples", "green apple", "granny smith apple"},
    "orange": {"orange", "oranges", "navel orange"},
    "lemon": {"lemon", "lemons", "lemon juice"},
    "lime": {"lime", "limes", "lime juice"},
    "cream": {"cream", "heavy cream", "heavy whipping cream", "whipping cream"},
    "sour cream": {"sour cream"},
    "yogurt": {"yogurt", "greek yogurt", "plain yogurt"},
    "tortilla": {"tortilla", "tortillas", "flour tortilla", "flour tortillas",
                 "corn tortilla", "corn tortillas"},
    "bread": {"bread", "white bread", "whole wheat bread", "sandwich bread"},
}

# Pre-compute reverse lookup: variant name -> base ingredient
INGREDIENT_TO_BASE: Dict[str, str] = {}
for _base, _variants in INGREDIENT_VARIATIONS.items():
    for _variant in _variants:
        INGREDIENT_TO_BASE[_variant] = _base


# Trivial ingredients that shouldn't count toward pantry coverage
_TRIVIAL_INGREDIENTS = {
    "water", "salt", "pepper", "black pepper", "cooking spray",
    "ice", "salt and pepper", "nonstick spray",
}

# Cooking modifiers to strip from ingredient names
_COOKING_MODIFIERS = [
    "boneless", "skinless", "fresh", "dried", "ground", "chopped", "diced",
    "sliced", "minced", "crushed", "shredded", "grated", "frozen", "canned",
    "cooked", "raw", "peeled", "seeded", "halved", "quartered", "cubed",
    "melted", "softened", "packed", "sifted", "divided", "optional",
    "finely", "thinly", "thickly", "roughly",
]


def normalize_ingredient_name(name: str) -> str:
    """
    Normalize ingredient name for matching.

    - Lowercase + trim
    - Remove content in parentheses
    - Remove cooking modifiers (boneless, skinless, chopped, etc.)
    - Collapse whitespace
    - Naive depluralize (remove trailing 's')
    """
    if not name:
        return ""

    normalized = name.lower().strip()

    # Remove content in parentheses: "tomatoes (diced)" → "tomatoes"
    normalized = re.sub(r'\([^)]*\)', '', normalized).strip()

    # Remove cooking modifiers
    for modifier in _COOKING_MODIFIERS:
        normalized = re.sub(r'\b' + modifier + r'\b', '', normalized)

    # Collapse whitespace
    normalized = re.sub(r'\s+', ' ', normalized).strip()

    # Handle pluralization
    if normalized.endswith('oes') and len(normalized) > 4:
        # tomatoes -> tomato, potatoes -> potato
        normalized = normalized[:-2]
    elif normalized.endswith('ies') and len(normalized) > 4:
        # berries -> berry
        normalized = normalized[:-3] + 'y'
    elif normalized.endswith('s') and len(normalized) > 3:
        if not normalized.endswith(('ss', 'us')):
            normalized = normalized[:-1]

    return normalized


def match_ingredient_to_pantry(
    ingredient_name: str,
    pantry_normalized: Dict[str, dict],
) -> Tuple[Optional[str], str]:
    """
    Match a recipe ingredient to a pantry item.

    4-level matching: exact → variation → substring → word-overlap.

    Args:
        ingredient_name: raw ingredient name from recipe
        pantry_normalized: dict of normalized_name -> pantry_item_dict

    Returns:
        (matched_pantry_normalized_name, match_type)
        match_type is 'exact', 'variation', 'substring', 'word_overlap', or 'none'
    """
    norm = normalize_ingredient_name(ingredient_name)
    if not norm:
        return None, "none"

    # 1. Exact match
    if norm in pantry_normalized:
        return norm, "exact"

    # 2. Variation match (both map to same base ingredient)
    ing_base = INGREDIENT_TO_BASE.get(norm)
    if ing_base:
        for pantry_norm in pantry_normalized:
            pantry_base = INGREDIENT_TO_BASE.get(pantry_norm)
            if pantry_base and pantry_base == ing_base:
                return pantry_norm, "variation"

    # 3. Substring match
    for pantry_norm in pantry_normalized:
        if pantry_norm and norm:
            if pantry_norm in norm or norm in pantry_norm:
                return pantry_norm, "substring"

    # 4. Word-overlap match
    ing_words = set(norm.split())
    for pantry_norm in pantry_normalized:
        if pantry_norm and len(pantry_norm) >= 3:
            pantry_words = set(pantry_norm.split())
            shorter = pantry_words if len(pantry_words) <= len(ing_words) else ing_words
            longer = ing_words if len(pantry_words) <= len(ing_words) else pantry_words
            if shorter and shorter.issubset(longer):
                return pantry_norm, "word_overlap"

    return None, "none"


def is_trivial_ingredient(name: str) -> bool:
    """Check if an ingredient is too common to count toward pantry coverage."""
    return normalize_ingredient_name(name) in _TRIVIAL_INGREDIENTS


def calculate_pantry_coverage(
    recipe_ingredients: List[dict],
    pantry_normalized: Dict[str, dict],
) -> Tuple[float, int, int]:
    """
    Calculate what percentage of a recipe's non-trivial ingredients are in the pantry.

    Args:
        recipe_ingredients: list of ingredient dicts with 'name' key
        pantry_normalized: dict of normalized_name -> pantry_item_dict

    Returns:
        (coverage_ratio, matched_count, total_non_trivial_count)
    """
    if not recipe_ingredients:
        return 0.0, 0, 0

    total = 0
    matched = 0

    for ing in recipe_ingredients:
        if not isinstance(ing, dict):
            continue
        name = ing.get("name", "")
        if not name or not name.strip():
            continue
        if is_trivial_ingredient(name):
            continue

        total += 1
        _, match_type = match_ingredient_to_pantry(name, pantry_normalized)
        if match_type != "none":
            matched += 1

    if total == 0:
        return 0.0, 0, 0

    return matched / total, matched, total


def prepare_pantry_lookup(pantry_items: List[dict]) -> Dict[str, dict]:
    """
    Pre-normalize all pantry items into a lookup dict.

    Key: normalized_name, Value: pantry item dict.
    Called once per meal plan generation, reused for all candidates.
    """
    lookup = {}
    for item in pantry_items:
        name = item.get("item_name") or ""
        normalized = normalize_ingredient_name(name)
        if normalized:
            lookup[normalized] = item
    return lookup
