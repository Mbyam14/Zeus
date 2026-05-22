"""
Recipe-level nutrition calculator.

Given a recipe (ingredients + servings), normalize each ingredient, convert
its quantity to grams, look up the matching USDA food entry, and sum macros.
Returns per-serving values, or None when too few ingredients matched to be
trustworthy.

This is the single source of truth for nutrition in Zeus. Every recipe
creation path (user, AI, AllRecipes import) calls this — uniform output.
"""

import logging
from typing import Optional

from app.utils.ingredient_normalizer import normalize_ingredient_name
from app.utils.unit_converter import to_grams
from app.utils.usda_matcher import match_to_usda, log_unmatched

logger = logging.getLogger(__name__)

# Minimum fraction of total ingredient weight that must be matched against
# USDA before we trust the macro totals. Below this, we return None and
# the recipe's macros stay NULL (signals "not enough data" to consumers).
# Loosened from 0.70 -> 0.50 to maximize macro coverage. Tradeoff: a few
# more recipes will have slightly imprecise macros (when sauces/seasonings
# don't match), but the calorie totals are still directionally correct
# since the bulk of weight comes from main ingredients that do match.
COVERAGE_THRESHOLD = 0.50


def calculate_recipe_nutrition(
    ingredients: list[dict],
    servings: int = 4,
    recipe_id: Optional[str] = None,
    log_misses: bool = True,
) -> Optional[dict]:
    """
    Compute per-serving macros for a recipe.

    Args:
        ingredients: list of {"name", "quantity", "unit"} dicts as stored on recipes.
        servings:    number of servings the recipe yields.
        recipe_id:   optional, used for unmatched-ingredient logging.
        log_misses:  if True, write unmatched ingredients to unmatched_ingredient_log.

    Returns:
        dict with calories/protein/carbs/fat + match_coverage + unmatched_ingredients,
        or None when match_coverage < COVERAGE_THRESHOLD or zero matches.
    """
    if not ingredients or servings <= 0:
        return None

    total_cal = 0.0
    total_prot = 0.0
    total_carb = 0.0
    total_fat = 0.0

    matched_grams = 0.0
    total_grams_attempted = 0.0
    unmatched_names: list[str] = []

    for ing in ingredients:
        raw_name = (ing.get("name") or "").strip()
        if not raw_name:
            continue

        normalized = normalize_ingredient_name(raw_name)
        if not normalized:
            # Negligible (salt, water, pepper, "to taste") — skip silently.
            continue

        grams = to_grams(ing.get("quantity", ""), ing.get("unit", ""), normalized)
        if grams is None or grams <= 0:
            # Can't quantify — exclude from both matched and total weight.
            # This avoids penalizing recipes that have one weird unit.
            continue

        total_grams_attempted += grams

        food = match_to_usda(normalized)
        if food is None:
            unmatched_names.append(normalized)
            if log_misses:
                try:
                    log_unmatched(normalized, raw_name, recipe_id)
                except Exception as exc:
                    logger.debug(f"Failed to log unmatched ingredient: {exc}")
            continue

        # Macros are per-100g; scale by gram weight
        factor = grams / 100.0
        total_cal  += food["calories_per_100g"] * factor
        total_prot += food["protein_per_100g"] * factor
        total_carb += food["carbs_per_100g"]  * factor
        total_fat  += food["fat_per_100g"]    * factor
        matched_grams += grams

    if total_grams_attempted <= 0:
        return None

    coverage = matched_grams / total_grams_attempted
    if coverage < COVERAGE_THRESHOLD:
        return None

    # Per-serving values. Clamp to the DB column limits:
    #   calories is INTEGER (Postgres int4, ~2.1B max — no real limit)
    #   protein_grams, carbs_grams, fat_grams are NUMERIC(5,1) -> max 9999.9
    # Recipes that overflow (e.g. a "1 serving" punch bowl) almost always have
    # wrong servings metadata, but cap so we still get *some* value rather than
    # rejecting the whole calc.
    per_serving_cal  = total_cal  / servings
    per_serving_prot = min(total_prot / servings, 9999.9)
    per_serving_carb = min(total_carb / servings, 9999.9)
    per_serving_fat  = min(total_fat  / servings, 9999.9)

    return {
        "calories":      int(round(per_serving_cal)),
        "protein_grams": round(per_serving_prot, 1),
        "carbs_grams":   round(per_serving_carb, 1),
        "fat_grams":     round(per_serving_fat,  1),
        "match_coverage": round(coverage, 3),
        "unmatched_ingredients": unmatched_names,
    }
