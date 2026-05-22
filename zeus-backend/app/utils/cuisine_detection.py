"""
Cuisine detection from ingredient signatures.

The AllRecipes import defaults unknown cuisines to "American" which buries
real cuisine diversity. This module re-detects cuisine from characteristic
ingredient combinations + title clues, and is run on recipes whose
cuisine_type is NULL or "American" (the unreliable bucket).

Approach: count ingredient signal hits per cuisine. Tie-breakers favor:
  1. Title clue (recipe explicitly named "Italian X")
  2. Highest signal count

Returns None if no cuisine has more than 1 signal hit (don't guess from
single ingredient — basil alone isn't enough to call something Italian).
"""

import re

# ─── Cuisine signatures ───────────────────────────────────────────────────────
# Each cuisine has:
#   "ingredients" : substrings to look for in ingredient names (any 1 = 1 hit)
#   "title_words" : words that, when in title, are very strong cuisine signals
#
# Avoid overlap between cuisines — "tomato" alone doesn't tell us Italian vs
# Mexican vs American. Pick distinctive markers.

CUISINE_SIGNATURES = {
    "Italian": {
        "ingredients": [
            "parmesan", "pecorino", "mozzarella", "ricotta", "mascarpone",
            "prosciutto", "pancetta", "pesto",
            "basil", "oregano",
            "marinara", "tomato sauce", "tomato paste",
            "balsamic", "italian seasoning",
            "polenta", "risotto", "arborio",
            "spaghetti", "penne", "fettuccine", "linguine", "lasagna",
            "rigatoni", "ravioli", "gnocchi", "orzo", "ziti",
        ],
        "title_words": ["italian", "pasta", "lasagna", "risotto", "carbonara",
                        "alfredo", "marinara", "parmigiana", "pesto", "bolognese"],
    },
    "Mexican": {
        "ingredients": [
            "tortilla", "corn tortilla", "flour tortilla",
            "salsa", "guacamole", "cilantro",
            "jalapeño", "jalapeno", "chipotle", "ancho", "poblano",
            "cumin", "lime juice", "lime",
            "queso fresco", "cotija", "monterey jack",
            "refried beans", "pinto beans", "black beans",
            "masa", "masa harina",
            "chorizo", "carnitas", "carne asada",
        ],
        "title_words": ["mexican", "taco", "burrito", "enchilada", "quesadilla",
                        "fajita", "tamale", "salsa", "guacamole", "tostada",
                        "chimichanga", "carnitas", "carne asada"],
    },
    "Indian": {
        "ingredients": [
            "garam masala", "turmeric", "curry powder", "curry leaves",
            "cardamom", "cumin seeds", "coriander seeds",
            "ghee", "paneer",
            "basmati", "naan",
            "tikka", "tandoori", "biryani", "masala",
            "lentils", "chickpea flour", "besan",
            "fenugreek", "asafoetida", "mustard seeds",
        ],
        "title_words": ["indian", "curry", "tikka", "masala", "tandoori",
                        "biryani", "naan", "samosa", "vindaloo", "dal",
                        "korma", "rogan josh", "chana"],
    },
    "Thai": {
        "ingredients": [
            "fish sauce", "lemongrass", "kaffir lime", "thai basil",
            "coconut milk", "galangal",
            "thai chili", "bird's eye chili",
            "rice noodle", "pad thai", "tamarind",
            "thai curry paste", "red curry paste", "green curry paste",
        ],
        "title_words": ["thai", "pad thai", "tom yum", "tom kha", "satay",
                        "massaman", "green curry", "red curry"],
    },
    "Japanese": {
        "ingredients": [
            "miso", "mirin", "sake", "dashi",
            "soy sauce", "tamari",
            "nori", "wakame", "kombu", "seaweed",
            "rice vinegar", "sushi rice",
            "bonito", "katsuobushi",
            "panko", "tonkatsu",
            "udon", "soba", "ramen noodle",
            "wasabi", "ginger",
        ],
        "title_words": ["japanese", "sushi", "ramen", "udon", "soba",
                        "tempura", "teriyaki", "yakitori", "miso", "donburi",
                        "katsu", "onigiri"],
    },
    "Chinese": {
        "ingredients": [
            "soy sauce", "oyster sauce", "hoisin", "rice wine",
            "shaoxing", "five-spice", "five spice",
            "sesame oil", "sesame seeds",
            "scallion", "green onion", "ginger root",
            "bok choy", "napa cabbage",
            "lo mein", "chow mein",
            "water chestnut", "bamboo shoot",
        ],
        "title_words": ["chinese", "kung pao", "general tso", "lo mein",
                        "chow mein", "mapo", "szechuan", "sichuan", "moo shu",
                        "egg foo young", "egg roll", "fried rice"],
    },
    "French": {
        "ingredients": [
            "shallot", "tarragon", "herbes de provence",
            "creme fraiche", "crème fraîche",
            "dijon", "dijon mustard",
            "puff pastry", "phyllo",
            "gruyere", "brie", "camembert", "roquefort",
            "white wine", "red wine",
        ],
        "title_words": ["french", "ratatouille", "coq au vin", "bouillabaisse",
                        "quiche", "souffle", "soufflé", "crepe", "crêpe",
                        "beef bourguignon", "cassoulet", "tarte", "galette"],
    },
    "Greek": {
        "ingredients": [
            "feta", "kalamata", "olives",
            "tzatziki", "phyllo",
            "oregano", "dill",
            "lemon juice", "olive oil",
            "yogurt", "greek yogurt",
        ],
        "title_words": ["greek", "gyro", "souvlaki", "spanakopita", "moussaka",
                        "tzatziki", "baklava", "dolmades"],
    },
    "Mediterranean": {
        "ingredients": [
            "olive oil", "kalamata", "feta",
            "lemon", "oregano",
            "chickpeas", "hummus", "tahini",
            "couscous", "bulgur",
            "sun-dried tomato", "artichoke",
        ],
        "title_words": ["mediterranean", "hummus", "falafel", "shawarma",
                        "tabouli", "tabbouleh", "kebab"],
    },
    "Middle Eastern": {
        "ingredients": [
            "tahini", "sumac", "za'atar", "zaatar",
            "harissa", "ras el hanout",
            "pomegranate molasses",
            "pita", "lamb",
            "bulgur", "freekeh",
            "rose water", "orange blossom",
        ],
        "title_words": ["lebanese", "moroccan", "persian", "turkish",
                        "shawarma", "kibbeh", "falafel", "tagine",
                        "baba ganoush", "muhammara"],
    },
    "Korean": {
        "ingredients": [
            "gochujang", "gochugaru", "kimchi",
            "doenjang", "ssamjang",
            "sesame oil", "sesame seeds",
            "korean chili", "korean radish",
        ],
        "title_words": ["korean", "bibimbap", "bulgogi", "kimchi", "japchae",
                        "tteokbokki", "kalbi"],
    },
    "Vietnamese": {
        "ingredients": [
            "fish sauce", "rice noodle", "rice paper",
            "lemongrass", "thai basil",
            "lime", "cilantro", "mint",
            "hoisin",
        ],
        "title_words": ["vietnamese", "pho", "banh mi", "spring roll",
                        "summer roll", "bun cha", "bahn"],
    },
}

# Pre-compile patterns for speed
def _compile(words: list[str]) -> re.Pattern:
    sorted_w = sorted(set(words), key=len, reverse=True)
    return re.compile(
        r"\b(?:" + "|".join(re.escape(w) for w in sorted_w) + r")\b",
        re.IGNORECASE,
    )

_INGREDIENT_PATTERNS = {c: _compile(d["ingredients"]) for c, d in CUISINE_SIGNATURES.items()}
_TITLE_PATTERNS      = {c: _compile(d["title_words"])  for c, d in CUISINE_SIGNATURES.items()}

# Minimum ingredient-signal hits before we'll claim a cuisine (anti-noise).
MIN_INGREDIENT_HITS = 2

# Title hit is worth this many ingredient hits when scoring
TITLE_HIT_WEIGHT = 3


def detect_cuisine(title: str, ingredients: list) -> str | None:
    """
    Best-guess cuisine for a recipe based on ingredient signature + title clues.
    Returns one of CUISINE_SIGNATURES keys, or None if no clear winner.
    """
    title_lc = (title or "").lower()
    ingredient_text = " ".join(
        ((ing.get("name") if isinstance(ing, dict) else str(ing)) or "").lower()
        for ing in (ingredients or [])
    )

    scores: dict[str, int] = {}
    ingredient_hits: dict[str, int] = {}

    for cuisine in CUISINE_SIGNATURES:
        ing_hits = len(set(_INGREDIENT_PATTERNS[cuisine].findall(ingredient_text)))
        title_hits = len(set(_TITLE_PATTERNS[cuisine].findall(title_lc)))
        ingredient_hits[cuisine] = ing_hits
        scores[cuisine] = ing_hits + title_hits * TITLE_HIT_WEIGHT

    if not scores:
        return None

    best = max(scores, key=lambda c: scores[c])
    if scores[best] == 0:
        return None

    # Anti-noise: don't claim a cuisine on a single ingredient match unless
    # the title also corroborates.
    title_hit_best = bool(_TITLE_PATTERNS[best].search(title_lc))
    if ingredient_hits[best] < MIN_INGREDIENT_HITS and not title_hit_best:
        return None

    return best
