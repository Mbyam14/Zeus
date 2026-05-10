"""
Recipe Shortlist Service

Queries the recipe database to find candidates matching user preferences,
filters out allergens/disliked ingredients, and scores/ranks results
for meal plan generation.

Scoring system (max ~100 pts per recipe):
  Nutrition match:   25 pts  (Gaussian decay — harsh on poor matches)
  User preference:   25 pts  (liked=25, cuisine=12, dietary style=8)
  Pantry coverage:   20 pts  (non-linear curve, not dominant)
  Practical fit:     15 pts  (cook time, difficulty, servings)
  Quality signals:   10 pts  (popularity, completeness)
  Freshness penalty: -15..0  (recently used recipes penalized)
  Jitter:             0..4   (prevents identical plans)
"""

import math
import logging
from typing import Dict, List, Optional, Any, Set

from app.database import get_database
from app.utils.ingredient_matching import (
    calculate_pantry_coverage,
    prepare_pantry_lookup,
)

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
        target_per_meal_type: int = 35,
        pantry_items: Optional[List[dict]] = None,
        recently_used_recipe_ids: Optional[List[str]] = None,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Shortlist recipe candidates for meal plan generation.

        Returns dict of meal_type -> scored/ranked candidate list.
        Each candidate has all recipe fields plus a '_score' field.
        """
        if meal_types is None:
            meal_types = ["breakfast", "snack", "lunch", "dinner"]

        calorie_target = preferences.get("calorie_target") or 2000
        protein_target = preferences.get("protein_target_grams") or 150
        fat_target = preferences.get("fat_target_grams") or round(calorie_target * 0.3 / 9)
        distribution = preferences.get("meal_calorie_distribution", {
            "breakfast": 20, "snack": 10, "lunch": 30, "dinner": 40
        })
        if "snack" not in distribution:
            distribution = {"breakfast": 20, "snack": 10, "lunch": 30, "dinner": 40}

        allergies = preferences.get("allergies", [])
        disliked = preferences.get("disliked_ingredients", [])
        liked_recipe_ids = set(preferences.get("liked_recipe_ids", []))
        recently_used = set(recently_used_recipe_ids or [])

        pantry_lookup = prepare_pantry_lookup(pantry_items) if pantry_items else {}
        if pantry_lookup:
            logger.info(f"Pantry-aware scoring with {len(pantry_lookup)} pantry items")

        result = {}

        for meal_type in meal_types:
            pct = distribution.get(meal_type, 33) / 100
            meal_cal_target = int(calorie_target * pct)
            meal_protein_target = protein_target * pct
            meal_fat_target = fat_target * pct

            # Single broad query — no dietary/cuisine/calorie filtering at DB level.
            # Scoring handles all preference matching in Python, which is fast and
            # avoids multiple round-trips to Supabase (each blocks the event loop).
            raw_candidates = await self._query_candidates(
                meal_type=meal_type.capitalize(),
                preferences={},
                exclude_recipe_ids=exclude_recipe_ids,
                meal_cal_target=0,
                limit=300,
                relaxed=True,
            )

            if len(raw_candidates) < 5:
                logger.warning(f"Only {len(raw_candidates)} {meal_type} candidates from DB")

            raw_candidates = [
                r for r in raw_candidates
                if r.get("ingredients") and len(r["ingredients"]) > 0
            ]

            filtered = self._filter_by_excluded_ingredients(raw_candidates, allergies, disliked)

            scored = self._score_candidates(
                candidates=filtered,
                meal_cal_target=meal_cal_target,
                meal_protein_target=meal_protein_target,
                meal_fat_target=meal_fat_target,
                pantry_lookup=pantry_lookup,
                household_size=preferences.get("household_size", 2),
                liked_recipe_ids=liked_recipe_ids,
                recently_used=recently_used,
                preferred_cook_time=preferences.get("preferred_cook_time", "moderate"),
                cooking_skill=preferences.get("cooking_skill", "intermediate"),
                cuisine_prefs=preferences.get("cuisine_preferences", []),
                budget_friendly=preferences.get("budget_friendly", False),
            )

            diverse = self._enforce_diversity(scored, target_per_meal_type)
            result[meal_type] = diverse

        return result

    async def _query_candidates(
        self,
        meal_type: str,
        preferences: dict,
        exclude_recipe_ids: Optional[List[str]] = None,
        meal_cal_target: int = 600,
        limit: int = 300,
        relaxed: bool = False,
    ) -> List[Dict[str, Any]]:
        """Query Supabase for recipe candidates with server-side filters."""
        query = self.db.table("recipes").select(
            "id, title, description, calories, protein_grams, carbs_grams, fat_grams, "
            "cuisine_type, difficulty, meal_type, dietary_tags, ingredients, "
            "likes_count, image_url, is_ai_generated, prep_time, cook_time, servings"
        )

        query = query.contains("meal_type", [meal_type])
        query = query.not_.is_("image_url", "null")

        # Calorie range filter at DB level — wide range (25%–250%) to pre-eliminate junk
        # but not so tight it kills variety. Scoring handles the rest.
        if meal_cal_target > 0 and not relaxed:
            cal_min = max(50, int(meal_cal_target * 0.25))
            cal_max = int(meal_cal_target * 2.5)
            query = query.gte("calories", cal_min).lte("calories", cal_max)

        dietary_restrictions = preferences.get("dietary_restrictions", [])
        if dietary_restrictions:
            query = query.contains("dietary_tags", dietary_restrictions)

        if not relaxed:
            cooking_skill = preferences.get("cooking_skill", "intermediate")
            # Softer than before: beginners can see Medium too
            if cooking_skill == "beginner":
                query = query.in_("difficulty", ["Easy", "Medium"])

            cuisine_prefs = preferences.get("cuisine_preferences", [])
            if cuisine_prefs:
                query = query.in_("cuisine_type", cuisine_prefs)

            source_pref = preferences.get("recipe_source_preference", "mixed")
            if source_pref == "vetted_only":
                query = query.eq("is_ai_generated", False)
            elif source_pref == "ai_only":
                query = query.eq("is_ai_generated", True)

        if exclude_recipe_ids:
            for rid in exclude_recipe_ids:
                query = query.neq("id", rid)

        # No pre-sort by likes — scoring decides importance, not popularity bias
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
            ingredient_text = " ".join(
                (ing.get("name", "") if isinstance(ing, dict) else str(ing)).lower()
                for ing in ingredients
            )
            if not any(excl in ingredient_text for excl in excluded):
                filtered.append(recipe)
        return filtered

    def _score_candidates(
        self,
        candidates: List[Dict[str, Any]],
        meal_cal_target: int,
        meal_protein_target: float,
        meal_fat_target: float,
        pantry_lookup: Optional[Dict[str, dict]] = None,
        household_size: int = 2,
        liked_recipe_ids: Optional[Set[str]] = None,
        recently_used: Optional[Set[str]] = None,
        preferred_cook_time: str = "moderate",
        cooking_skill: str = "intermediate",
        cuisine_prefs: Optional[List[str]] = None,
        budget_friendly: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Score candidates using a weighted multi-factor system.

        Max ~100 pts. Freshness penalty can go negative.
        """
        import random
        from datetime import datetime

        rng = random.Random(int(datetime.now().strftime("%Y%m%d%H")))
        liked_ids = liked_recipe_ids or set()
        recent = recently_used or set()

        # Cook time budget in minutes
        cook_budget = {"quick": 30, "moderate": 60, "patient": 120}.get(preferred_cook_time, 60)

        for recipe in candidates:
            score = 0.0
            recipe_id = recipe.get("id", "")
            cal = recipe.get("calories") or 0
            prot = float(recipe.get("protein_grams") or 0)
            fat = float(recipe.get("fat_grams") or 0)

            # ── NUTRITION (0–25 pts) ──────────────────────────────────────────
            # Gaussian decay: e^(-4 * diff²) — 10% off = 85% of max, 30% off = 30%, 60% off = 2%
            if cal > 0 and meal_cal_target > 0:
                cal_diff_pct = abs(cal - meal_cal_target) / meal_cal_target
                score += 12 * math.exp(-4 * cal_diff_pct ** 2)

            if prot > 0 and meal_protein_target > 0:
                prot_diff_pct = abs(prot - meal_protein_target) / meal_protein_target
                score += 8 * math.exp(-4 * prot_diff_pct ** 2)

            if fat > 0 and meal_fat_target > 0:
                fat_diff_pct = abs(fat - meal_fat_target) / meal_fat_target
                score += 5 * math.exp(-4 * fat_diff_pct ** 2)

            # ── USER PREFERENCE (0–25 pts) ────────────────────────────────────
            if recipe_id in liked_ids:
                score += 25  # Strongest signal — user explicitly liked this
                recipe["_liked"] = True

            cuisine = (recipe.get("cuisine_type") or "").lower()
            if cuisine_prefs and cuisine in [c.lower() for c in cuisine_prefs]:
                score += 12

            # High-protein preference alignment
            if meal_protein_target > 40 and prot >= meal_protein_target * 0.75:
                score += 5

            if budget_friendly:
                num_ings = len(recipe.get("ingredients") or [])
                if num_ings <= 8:
                    score += 8
                elif num_ings <= 12:
                    score += 4

            # ── PANTRY COVERAGE (0–20 pts, non-linear) ───────────────────────
            # coverage^0.6 curve: 100% pantry = 20pts, 50% = 14pts, 20% = 8pts
            # Prevents simple 2-ingredient recipes from dominating
            ingredients = recipe.get("ingredients") or []
            if pantry_lookup and ingredients:
                coverage, matched, total = calculate_pantry_coverage(ingredients, pantry_lookup)
                pantry_score = (coverage ** 0.6) * 20
                score += pantry_score
                recipe["_pantry_coverage"] = round(coverage * 100)
                recipe["_pantry_matched"] = matched
                recipe["_pantry_total"] = total

            # ── PRACTICAL FIT (0–15 pts) ──────────────────────────────────────
            total_time = (recipe.get("prep_time") or 0) + (recipe.get("cook_time") or 0)
            if total_time > 0:
                if total_time <= cook_budget:
                    score += 8
                elif total_time <= cook_budget * 1.5:
                    score += 4
                # Over 1.5x budget = 0 points

            difficulty = (recipe.get("difficulty") or "").lower()
            skill_scores = {
                ("beginner", "easy"): 4, ("beginner", "medium"): 2, ("beginner", "hard"): 0,
                ("intermediate", "easy"): 3, ("intermediate", "medium"): 4, ("intermediate", "hard"): 2,
                ("advanced", "easy"): 2, ("advanced", "medium"): 3, ("advanced", "hard"): 4,
            }
            score += skill_scores.get((cooking_skill, difficulty), 2)

            recipe_servings = recipe.get("servings") or 4
            serving_diff = abs(recipe_servings - household_size)
            if serving_diff == 0:
                score += 3
            elif serving_diff <= 1:
                score += 2
            elif serving_diff <= 2:
                score += 1

            # ── QUALITY SIGNALS (0–10 pts) ────────────────────────────────────
            likes = recipe.get("likes_count", 0) or 0
            # log10 scale: 10 likes ≈ 1.25pt, 100 = 2.5pt, 1000 = 3.75pt, cap at 5pt
            score += min(5, math.log10(likes + 1) * (5 / 4))

            if cal > 0 and prot > 0:
                score += 3  # Complete nutrition data

            if not recipe.get("is_ai_generated", False):
                score += 2  # Vetted recipe bonus

            # ── FRESHNESS PENALTY (-15..0) ────────────────────────────────────
            if recipe_id in recent:
                score -= 15

            # ── SMALL JITTER (0–4 pts) ────────────────────────────────────────
            score += rng.uniform(0, 4)

            recipe["_score"] = round(score, 2)

        candidates.sort(key=lambda r: r.get("_score", 0), reverse=True)

        if pantry_lookup and candidates:
            for r in candidates[:5]:
                logger.info(
                    f"  Top: {r.get('title', '?')[:40]} "
                    f"score={r.get('_score', 0)} "
                    f"pantry={r.get('_pantry_coverage', 'N/A')}% "
                    f"liked={'YES' if r.get('_liked') else 'no'}"
                )

        return candidates

    def _enforce_diversity(
        self,
        scored: List[Dict[str, Any]],
        target_count: int,
    ) -> List[Dict[str, Any]]:
        """
        Enforce cuisine diversity in the top N candidates.
        No single cuisine > 40% of the shortlist.
        """
        if not scored or target_count <= 3:
            return scored[:target_count]

        max_per_cuisine = max(1, int(target_count * 0.4))
        result = []
        cuisine_count: Dict[str, int] = {}
        overflow = []

        for recipe in scored:
            cuisine = (recipe.get("cuisine_type") or "unknown").lower()
            if cuisine_count.get(cuisine, 0) < max_per_cuisine:
                result.append(recipe)
                cuisine_count[cuisine] = cuisine_count.get(cuisine, 0) + 1
                if len(result) >= target_count:
                    break
            else:
                overflow.append(recipe)

        # Fill remaining from overflow if needed
        for recipe in overflow:
            if len(result) >= target_count:
                break
            result.append(recipe)

        return result

    async def pick_top_for_slot(
        self,
        preferences: dict,
        meal_type: str,
        exclude_recipe_ids: Optional[List[str]] = None,
        pantry_items: Optional[List[dict]] = None,
        recently_used_recipe_ids: Optional[List[str]] = None,
    ) -> Optional[str]:
        """
        Pick the best single recipe for a slot (no AI needed).
        Used for fill-remaining and regenerate-meal.
        Returns recipe ID or None.
        """
        candidates = await self.shortlist_candidates(
            preferences=preferences,
            selected_days=[],
            meal_types=[meal_type],
            exclude_recipe_ids=exclude_recipe_ids,
            target_per_meal_type=10,
            pantry_items=pantry_items,
            recently_used_recipe_ids=recently_used_recipe_ids,
        )

        slot_candidates = candidates.get(meal_type, [])
        if not slot_candidates:
            return None

        import random
        top_n = min(3, len(slot_candidates))
        return random.choice(slot_candidates[:top_n])["id"]


# Global instance
recipe_shortlist_service = RecipeShortlistService()
