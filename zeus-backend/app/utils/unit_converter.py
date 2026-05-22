"""
Unit conversion: (quantity_str, unit_str, ingredient_name) -> grams.

Handles three layers:
1. Mass units (oz, lb, kg, g, mg)            — pure mass, no density needed
2. Volume units (cup, tbsp, tsp, ml, l, ...) — needs per-ingredient density
3. Count units ("clove", "stick", "")        — needs per-item weight

Densities and count weights come from the `ingredient_unit_density` table
seeded in migration 007. Standard mass and volume-to-water conversions are
hardcoded constants here.
"""

import re
from typing import Optional

from app.database import get_database

# ─── Quantity parsing ─────────────────────────────────────────────────────────

UNICODE_FRACTIONS = {
    "¼": 0.25, "½": 0.5, "¾": 0.75,
    "⅐": 1/7,  "⅑": 1/9, "⅒": 0.1,
    "⅓": 1/3,  "⅔": 2/3,
    "⅕": 0.2,  "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
    "⅙": 1/6,  "⅚": 5/6,
    "⅛": 0.125,"⅜": 0.375,"⅝": 0.625,"⅞": 0.875,
}


def parse_quantity(qty: str) -> Optional[float]:
    """
    Parse an ingredient quantity string into a float.
    Handles "1", "1.5", "1/2", "1 1/2", "1 3/4", "¼", "1¼".
    Returns None for empty / unparseable input.
    """
    if not qty:
        return None
    s = qty.strip().lower()

    # Drop trailing qualifiers like "1 chopped" -> "1"
    s = re.split(r"\s+(chopped|minced|diced|sliced|shredded|grated|crushed)", s)[0].strip()

    # Replace unicode fractions
    for uf, val in UNICODE_FRACTIONS.items():
        if uf in s:
            s = s.replace(uf, f" {val}")
    s = s.strip()

    if not s:
        return None

    # Mixed number "1 3/4"
    m = re.match(r"^(\d+)\s+(\d+)/(\d+)\s*$", s)
    if m:
        whole, num, denom = m.groups()
        denom_i = int(denom)
        if denom_i == 0:
            return None
        return int(whole) + int(num) / denom_i

    # Pure fraction "3/4"
    m = re.match(r"^(\d+)/(\d+)\s*$", s)
    if m:
        num, denom = m.groups()
        denom_i = int(denom)
        if denom_i == 0:
            return None
        return int(num) / denom_i

    # Range "1-2" -> use lower bound (conservative)
    m = re.match(r"^(\d+(?:\.\d+)?)\s*[-to]+\s*(\d+(?:\.\d+)?)\s*$", s)
    if m:
        return float(m.group(1))

    # Plain number "1.5" or "1"
    m = re.match(r"^(\d+(?:\.\d+)?)\s*", s)
    if m:
        return float(m.group(1))

    return None


# ─── Unit normalization ───────────────────────────────────────────────────────

UNIT_ALIASES = {
    # Mass
    "g": "gram", "grams": "gram", "gram": "gram",
    "mg": "milligram", "milligrams": "milligram",
    "kg": "kilogram", "kilograms": "kilogram", "kilo": "kilogram",
    "oz": "ounce", "ounces": "ounce", "ounce": "ounce",
    "lb": "pound", "lbs": "pound", "pounds": "pound", "pound": "pound",

    # Volume
    "ml": "ml", "milliliter": "ml", "milliliters": "ml", "millilitre": "ml", "millilitres": "ml",
    "l": "l", "liter": "l", "liters": "l", "litre": "l", "litres": "l",
    "fl oz": "fl_oz", "fluid ounce": "fl_oz", "fluid ounces": "fl_oz",
    "cup": "cup", "cups": "cup", "c": "cup",
    "tbsp": "tbsp", "tablespoon": "tbsp", "tablespoons": "tbsp", "tbs": "tbsp", "tb": "tbsp",
    "tsp": "tsp", "teaspoon": "tsp", "teaspoons": "tsp", "ts": "tsp",
    "pint": "pint", "pints": "pint", "pt": "pint",
    "quart": "quart", "quarts": "quart", "qt": "quart",
    "gallon": "gallon", "gallons": "gallon", "gal": "gallon",

    # Count
    "": "count", "piece": "count", "pieces": "count", "pc": "count",
    "ea": "count", "each": "count", "whole": "count",
    "clove": "clove", "cloves": "clove",
    "stick": "stick", "sticks": "stick",
    "head": "head", "heads": "head",
    "bunch": "bunch", "bunches": "bunch",
    "stalk": "stalk", "stalks": "stalk",
    "sprig": "sprig", "sprigs": "sprig",
    "leaf": "leaf", "leaves": "leaf",
    "slice": "slice", "slices": "slice",
    "can": "can", "cans": "can",
    "package": "package", "packages": "package", "pkg": "package",
    "bottle": "bottle", "bottles": "bottle",
    "jar": "jar", "jars": "jar",
    "container": "container", "containers": "container",
    "pinch": "pinch", "pinches": "pinch",
    "dash": "dash", "dashes": "dash",
    "drop": "drop", "drops": "drop",
}

# Mass conversions to grams (universal, density-independent)
MASS_TO_GRAMS = {
    "gram":      1.0,
    "milligram": 0.001,
    "kilogram":  1000.0,
    "ounce":     28.3495,
    "pound":     453.592,
}

# Volume conversions to milliliters (still need ingredient density to get grams)
VOLUME_TO_ML = {
    "ml":     1.0,
    "l":      1000.0,
    "fl_oz":  29.5735,
    "cup":    236.588,
    "tbsp":   14.7868,
    "tsp":    4.92892,
    "pint":   473.176,
    "quart":  946.353,
    "gallon": 3785.41,
}

# Default density (water-based) for volume units when no ingredient density available.
# 1ml of water weighs ~1g; most aqueous ingredients are within 10% of this.
DEFAULT_DENSITY_G_PER_ML = 1.0

# Fallback weights for count-style units with no ingredient match. Conservative.
DEFAULT_COUNT_WEIGHTS = {
    "count":     100,   # "1 onion", "1 apple"  — assume ~medium-size produce
    "clove":     3,
    "stick":     113,   # butter stick standard
    "head":      500,
    "bunch":     100,
    "stalk":     40,
    "sprig":     1,
    "leaf":      1,
    "slice":     25,
    "can":       400,
    "package":   400,
    "bottle":    400,
    "jar":       400,
    "container": 400,
    "pinch":     0.4,
    "dash":      0.6,
    "drop":      0.05,
}


# ─── Density cache ────────────────────────────────────────────────────────────

_density_cache: Optional[dict] = None


def _load_density_cache() -> dict:
    """
    Load the ingredient_unit_density table once into a {(name, unit): grams} dict.
    Populated lazily on first use.
    """
    global _density_cache
    if _density_cache is not None:
        return _density_cache

    db = get_database()
    cache: dict[tuple[str, str], float] = {}
    offset = 0
    while True:
        rows = (db.table("ingredient_unit_density")
                .select("ingredient_name, unit, grams")
                .range(offset, offset + 999).execute())
        if not rows.data:
            break
        for r in rows.data:
            key = (r["ingredient_name"].lower(), r["unit"].lower())
            cache[key] = float(r["grams"])
        if len(rows.data) < 1000:
            break
        offset += 1000

    _density_cache = cache
    return cache


def _lookup_density(ingredient_name: str, unit: str) -> Optional[float]:
    """
    Try to find an exact density entry, then fall back to partial matches.
    e.g. "extra-large eggs" with unit "count" -> lookup for "egg" too.
    """
    cache = _load_density_cache()
    name = (ingredient_name or "").lower().strip()
    key = (name, unit)
    if key in cache:
        return cache[key]

    # Partial match: try removing leading qualifier words
    tokens = name.split()
    for i in range(1, len(tokens)):
        sub = " ".join(tokens[i:])
        if (sub, unit) in cache:
            return cache[(sub, unit)]

    return None


# ─── Main API ─────────────────────────────────────────────────────────────────

def to_grams(quantity: str, unit: str, ingredient_name: str) -> Optional[float]:
    """
    Convert (quantity, unit, ingredient_name) to grams.

    Returns None when:
      - quantity is unparseable
      - unit is unknown
      - the ingredient is fundamentally non-quantifiable ("to taste")
    """
    qty_f = parse_quantity(quantity)
    if qty_f is None or qty_f <= 0:
        return None

    raw_unit = (unit or "").lower().strip()
    canonical = UNIT_ALIASES.get(raw_unit, raw_unit)

    # 1. Mass — direct conversion
    if canonical in MASS_TO_GRAMS:
        return qty_f * MASS_TO_GRAMS[canonical]

    # 2. Volume — needs density
    if canonical in VOLUME_TO_ML:
        ml = qty_f * VOLUME_TO_ML[canonical]
        # Try ingredient-specific density (in grams per the canonical unit)
        grams_per_unit = _lookup_density(ingredient_name, canonical)
        if grams_per_unit is not None:
            return qty_f * grams_per_unit
        # Fall back to water density
        return ml * DEFAULT_DENSITY_G_PER_ML

    # 3. Count — needs per-item weight
    if canonical in DEFAULT_COUNT_WEIGHTS:
        grams_per_unit = _lookup_density(ingredient_name, canonical)
        if grams_per_unit is not None:
            return qty_f * grams_per_unit
        return qty_f * DEFAULT_COUNT_WEIGHTS[canonical]

    # Unknown unit
    return None
