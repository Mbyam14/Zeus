"""
Ingredient-based dietary tag detection.

Uses whole-word boundary matching (regex \\b) so keywords like "ham" don't
false-match inside "graham", and "roast" doesn't match "roasted garlic".

Tags applied: Vegetarian, Vegan, Pescatarian, Gluten-Free, Dairy-Free.

Conservative by design: ambiguous cases are treated as containing the
restricted substance so the tag is withheld. A vegetarian user missing a
recipe is far better than seeing a meat recipe.
"""

import re
from functools import lru_cache

# ─── Keyword sets ─────────────────────────────────────────────────────────────

MEAT_KEYWORDS = {
    # Land animals
    "beef", "pork", "chicken", "turkey", "lamb", "veal", "duck", "goose",
    "venison", "bison", "rabbit", "quail", "game hen", "pheasant",
    # Processed / cured meats
    "bacon", "ham", "prosciutto", "salami", "pepperoni", "sausage",
    "hot dog", "hotdog", "bratwurst", "chorizo", "kielbasa", "pancetta",
    "mortadella", "pastrami", "corned beef", "bologna", "liverwurst",
    # Fats
    "lard", "tallow", "suet", "schmaltz", "fatback", "drippings",
    # Specific cuts / forms (multi-word avoids false positives)
    "ground beef", "ground pork", "ground turkey", "ground chicken",
    "pot roast", "roast beef", "beef roast", "pork roast", "chuck roast",
    "ribeye", "sirloin", "brisket", "short rib", "oxtail",
    # Offal
    "chicken liver", "beef liver", "chicken gizzard",
    # Broths / stocks made from animals
    "chicken broth", "beef broth", "pork broth",
    "chicken stock", "beef stock", "pork stock",
    "chicken bouillon", "beef bouillon", "bone broth",
    # Gelatin (animal-derived)
    "gelatin",
}

SEAFOOD_KEYWORDS = {
    # Fish
    "fish", "salmon", "tuna", "cod", "halibut", "tilapia", "bass", "trout",
    "snapper", "flounder", "mahi", "catfish", "swordfish", "grouper",
    "pollock", "haddock", "sole", "perch", "walleye", "pike",
    "anchovy", "sardine", "herring", "mackerel", "caviar", "eel", "carp",
    # Shellfish
    "shrimp", "prawn", "lobster", "crab", "clam", "oyster", "mussel",
    "scallop", "squid", "octopus", "calamari", "abalone",
    # Other common names
    "imitation crab", "surimi", "scampi", "crawfish", "crayfish", "langostino",
    "seafood", "shellfish",
    # Condiments derived from seafood
    "fish sauce", "oyster sauce", "worcestershire",
    "fish stock", "seafood stock", "clam juice", "shrimp paste",
}

DAIRY_KEYWORDS = {
    "milk", "cream", "butter", "cheese", "yogurt", "yoghurt",
    "whey", "casein", "ghee", "lactose",
    "half-and-half", "half and half", "buttermilk",
    "sour cream", "cream cheese", "heavy cream", "whipping cream",
    "ice cream", "evaporated milk", "condensed milk",
    "mozzarella", "parmesan", "cheddar", "brie", "ricotta", "mascarpone",
    "gruyere", "gouda", "provolone", "colby", "asiago", "goat cheese",
    "feta", "havarti", "camembert", "fontina", "swiss cheese",
    "whole milk", "skim milk", "nonfat milk", "2% milk",
    "kefir", "quark", "creme fraiche",
}

# Dairy-free alternatives — checked first so they don't trigger DAIRY_KEYWORDS
DAIRY_FREE_ALTERNATIVES = {
    "almond milk", "oat milk", "soy milk", "coconut milk", "rice milk",
    "cashew milk", "hemp milk", "oat cream", "coconut cream", "coconut butter",
    "vegan butter", "dairy-free", "non-dairy", "plant-based",
    "vegan cheese", "cashew cheese", "nutritional yeast",
    # Baking
    "cream of tartar",  # potassium bitartrate, not dairy
}

EGG_KEYWORDS = {"egg", "mayo", "mayonnaise"}
EGG_EXCEPTIONS = {"eggplant", "egg roll wrapper", "egg noodle"}

GLUTEN_KEYWORDS = {
    "flour", "wheat", "barley", "rye", "spelt", "farro", "kamut", "bulgur",
    "semolina", "couscous", "triticale",
    "bread", "breadcrumb", "bread crumb", "panko", "crouton",
    "pasta", "spaghetti", "linguine", "penne", "fettuccine", "orzo",
    "tortilla", "pita", "cracker", "biscuit",
    "all-purpose flour", "bread flour", "whole wheat",
    "malt", "malt vinegar",
    "soy sauce",  # regular soy sauce contains wheat
}

GLUTEN_FREE_ALTERNATIVES = {
    "almond flour", "coconut flour", "rice flour", "corn flour", "cornflour",
    "chickpea flour", "tapioca flour", "cassava flour", "oat flour",
    "buckwheat flour", "teff flour", "arrowroot flour", "potato flour",
    "gluten-free flour", "gf flour",
    "rice noodle", "rice pasta", "glass noodle", "cellophane noodle",
    "corn tortilla", "rice tortilla", "gluten-free pasta", "gluten-free bread",
    "tamari",       # GF soy sauce alternative
    "coconut aminos",
}


# ─── Compiled patterns (built once at import time) ────────────────────────────

def _build_pattern(keywords: set[str]) -> re.Pattern:
    # Sort longest first so multi-word phrases match before their sub-words.
    # Each keyword gets an optional trailing 's' so plurals match too:
    # "game hens" matches the "game hen" keyword, "shrimps" matches "shrimp".
    sorted_kw = sorted(keywords, key=len, reverse=True)
    alternation = "|".join(re.escape(kw) + "s?" for kw in sorted_kw)
    return re.compile(r"\b(?:" + alternation + r")\b", re.IGNORECASE)


_MEAT_PAT    = _build_pattern(MEAT_KEYWORDS)
_SEAFOOD_PAT = _build_pattern(SEAFOOD_KEYWORDS)
_DAIRY_PAT   = _build_pattern(DAIRY_KEYWORDS)
_DAIRY_FREE_PAT = _build_pattern(DAIRY_FREE_ALTERNATIVES)
_EGG_PAT     = _build_pattern(EGG_KEYWORDS)
_EGG_EXC_PAT = _build_pattern(EGG_EXCEPTIONS)
_GLUTEN_PAT  = _build_pattern(GLUTEN_KEYWORDS)
_GLUTEN_FREE_PAT = _build_pattern(GLUTEN_FREE_ALTERNATIVES)


# ─── Detection ────────────────────────────────────────────────────────────────

def _name(ingredient: dict) -> str:
    return (ingredient.get("name") or "").lower()


def _has_meat(ingredients: list) -> bool:
    return any(_MEAT_PAT.search(_name(i)) for i in ingredients)


def _has_seafood(ingredients: list) -> bool:
    return any(_SEAFOOD_PAT.search(_name(i)) for i in ingredients)


def _has_dairy(ingredients: list) -> bool:
    for ing in ingredients:
        n = _name(ing)
        if _DAIRY_FREE_PAT.search(n):
            continue
        if _DAIRY_PAT.search(n):
            return True
    return False


def _has_eggs(ingredients: list) -> bool:
    for ing in ingredients:
        n = _name(ing)
        if _EGG_EXC_PAT.search(n):
            continue
        if _EGG_PAT.search(n):
            return True
    return False


def _has_gluten(ingredients: list) -> bool:
    for ing in ingredients:
        n = _name(ing)
        if _GLUTEN_FREE_PAT.search(n):
            continue
        if _GLUTEN_PAT.search(n):
            return True
    return False


def detect_dietary_tags(ingredients: list) -> list[str]:
    """
    Return dietary tags that apply to a recipe based on its ingredient list.
    Returns [] for an empty ingredient list (no tags claimed).
    """
    if not ingredients:
        return []

    meat    = _has_meat(ingredients)
    seafood = _has_seafood(ingredients)
    dairy   = _has_dairy(ingredients)
    eggs    = _has_eggs(ingredients)
    gluten  = _has_gluten(ingredients)

    tags = []
    if not meat and not seafood:
        tags.append("Vegetarian")
    if not meat and not seafood and not dairy and not eggs:
        tags.append("Vegan")
    if not meat:
        tags.append("Pescatarian")
    if not gluten:
        tags.append("Gluten-Free")
    if not dairy:
        tags.append("Dairy-Free")

    return tags
