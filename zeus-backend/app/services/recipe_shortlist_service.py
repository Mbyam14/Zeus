"""
Recipe Shortlist Service

Queries the recipe database to find candidates matching user preferences,
filters out allergens/disliked ingredients, and scores/ranks results
for meal plan generation.
"""

import math
import logging
from typing import Dict, List, Optional, Any

from app.database import get_database

logger = logging.getLogger(__name__)


class RecipeShortlistService:
    def __init__(self):
        self.db = get_database()

    async def shortlist_candidates(
        self,
        preferences: dict,
        selected_days: List[str],
        meal_types: List[str] = None,
        exclude_recipe_ids: Optional[List[str]] = None,
        target_per_meal_type: int = 25,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Shortlist recipe candidates for meal plan generation.

        Returns dict of meal_type -> scored/ranked candidate list.
        Each candidate has all recipe fields plus a '_score' field.
        """
        if meal_types is None:
            meal_types = ["breakfast", "lunch", "dinner"]

        calorie_target = preferences.get("calorie_target") or 2000
        protein_target = preferences.get("protein_target_grams") or 150
        distribution = preferences.get("meal_calorie_distribution", {
            "breakfast": 25, "lunch": 35, "dinner": 40
        })

        allergies = preferences.get("allergies", [])
        disliked = preferences.get("disliked_ingredients", [])

        result = {}

        for meal_type in meal_types:
            # Calculate per-meal nutrition targets
            pct = distribution.get(meal_type, 33) / 100
            meal_cal_target = int(calorie_target * pct)
            meal_protein_target = protein_target * pct

            # Query DB with filters
            raw_candidates = await self._query_candidates(
                meal_type=meal_type.capitalize(),
                preferences=preferences,
                exclude_recipe_ids=exclude_recipe_ids,
                limit=200,
            )

            # If too few results, retry with relaxed filters
            if len(raw_candidates) < 5:
                logger.warning(
                    f"Only {len(raw_candidates)} {meal_type} candidates, relaxing filters"
                )
                raw_candidates = await self._query_candidates(
                    meal_type=meal_type.capitalize(),
                    preferences=preferences,
                    exclude_recipe_ids=exclude_recipe_ids,
                    limit=200,
                    relaxed=True,
                )

            # Filter out recipes with empty ingredients (incomplete data)
            raw_candidates = [
                r for r in raw_candidates
                if r.get("ingredients") and len(r["ingredients"]) > 0
            ]

            # Filter out allergens/disliked ingredients
            filtered = self._filter_by_excluded_ingredients(
                raw_candidates, allergies, disliked
            )

            # Score and rank
            scored = self._score_candidates(
                filtered, meal_cal_target, meal_protein_target
            )

            result[meal_type] = scored[:target_per_meal_type]

        return result

    async def _query_candidates(
        self,
        meal_type: str,
        preferences: dict,
        exclude_recipe_ids: Optional[List[str]] = None,
        limit: int = 200,
        relaxed: bool = False,
    ) -> List[Dict[str, Any]]:
        """Query Supabase for recipe candidates with server-side filters."""
        query = self.db.table("recipes").select(
            "id, title, description, calories, protein_grams, carbs_grams, fat_grams, "
            "cuisine_type, difficulty, meal_type, dietary_tags, ingredients, "
            "likes_count, image_url, is_ai_generated, prep_time, cook_time, servings"
        )

        # Filter by meal type
        query = query.contains("meal_type", [meal_type])

        # Only include recipes with complete data (image + ingredients)
        query = query.not_.is_("image_url", "null")

        # Dietary restrictions (ALL must match)
        dietary_restrictions = preferences.get("dietary_restrictions", [])
        if dietary_restrictions:
            query = query.contains("dietary_tags", dietary_restrictions)

        if not relaxed:
            # Difficulty based on cooking skill
            cooking_skill = preferences.get("cooking_skill", "intermediate")
            if cooking_skill == "beginner":
                query = query.eq("difficulty", "Easy")
            elif cooking_skill == "intermediate":
                query = query.in_("difficulty", ["Easy", "Medium"])

            # Cuisine preferences
            cuisine_prefs = preferences.get("cuisine_preferences", [])
            if cuisine_prefs:
                query = query.in_("cuisine_type", cuisine_prefs)

            # Recipe source preference
            source_pref = preferences.get("recipe_source_preference", "mixed")
            if source_pref == "vetted_only":
                query = query.eq("is_ai_generated", False)
            elif source_pref == "ai_only":
                query = query.eq("is_ai_generated", True)

        # Exclude specific recipe IDs
        if exclude_recipe_ids:
            for rid in exclude_recipe_ids:
                query = query.neq("id", rid)

        # Order by popularity and limit
        query = query.order("likes_count", desc=True)
        query = query.limit(limit)

        result = query.execute()
        return result.data or []

    def _filter_by_excluded_ingredients(
        self,
        candidates: List[Dict[str, Any]],
        allergies: List[str],
        disliked_ingredients: List[str],
    ) -> List[Dict[str, Any]]:
        """Remove recipes containing allergens or disliked ingredients."""
        excluded = set(item.lower().strip() for item in allergies + disliked_ingredients)
        if not excluded:
            return candidates

        filtered = []
        for recipe in candidates:
            ingredients = recipe.get("ingredients") or []
            # Build combined text of all ingredient names
            ingredient_text = " ".join(
                (ing.get("name", "") if isinstance(ing, dict) else str(ing)).lower()
                for ing in ingredients
            )
            has_excluded = any(excl in ingredient_text for excl in excluded)
            if not has_excluded:
                filtered.append(recipe)
        return filtered

    def _score_candidates(
        self,
        candidates: List[Dict[str, Any]],
        target_calories: int,
        target_protein: float,
    ) -> List[Dict[str, Any]]:
        """Score and rank candidates. Higher score = better match."""
        for recipe in candidates:
            score = 0.0

            # Calorie proximity (0-30 points)
            cal = recipe.get("calories") or 0
            if cal > 0 and target_calories > 0:
                cal_diff_pct = abs(cal - target_calories) / target_calories
                score += max(0, 30 * (1 - cal_diff_pct))

            # Protein proximity (0-25 points)
            prot = float(recipe.get("protein_grams") or 0)
            if prot > 0 and target_protein > 0:
                prot_diff_pct = abs(prot - target_protein) / target_protein
                score += max(0, 25 * (1 - prot_diff_pct))

            # Has image (0 or 15 points)
            if recipe.get("image_url"):
                score += 15

            # Popularity (0-15 points, logarithmic)
            likes = recipe.get("likes_count", 0) or 0
            score += min(15, math.log2(likes + 1) * 3)

            # Not AI-generated bonus (0 or 10 points)
            if not recipe.get("is_ai_generated", False):
                score += 10

            # Shorter cook time bonus (0-5 points)
            total_time = (recipe.get("prep_time") or 0) + (recipe.get("cook_time") or 0)
            if total_time > 0:
                score += max(0, 5 * (1 - total_time / 120))

            recipe["_score"] = round(score, 2)

        candidates.sort(key=lambda r: r.get("_score", 0), reverse=True)
        return candidates

    async def pick_top_for_slot(
        self,
        preferences: dict,
        meal_type: str,
        exclude_recipe_ids: Optional[List[str]] = None,
    ) -> Optional[str]:
        """
        Pick the best single recipe for a slot (no Claude needed).
        Used for fill-remaining and regenerate-meal.
        Returns recipe ID or None.
        """
        candidates = await self.shortlist_candidates(
            preferences=preferences,
            selected_days=[],
            meal_types=[meal_type],
            exclude_recipe_ids=exclude_recipe_ids,
            target_per_meal_type=10,
        )

        slot_candidates = candidates.get(meal_type, [])
        if not slot_candidates:
            return None

        # Add some randomness to top candidates to avoid always picking the same one
        import random
        top_n = min(5, len(slot_candidates))
        pick = random.choice(slot_candidates[:top_n])
        return pick["id"]


# Global instance
recipe_shortlist_service = RecipeShortlistService()
