"""
Meal Assignment Service

Assigns recipes to meal slots across selected days with configurable
leftover tolerance. Replaces the hardwired dinner→lunch-every-day assumption
with a user-preference-driven approach.

Leftover tolerance controls:
  none     → 0 leftover days, all meals are unique
  low      → yesterday's dinner only (1-day gap max)
  moderate → dinner repeats as lunch for up to 2 subsequent days
  high     → dinner repeats as lunch for up to 3 subsequent days

Snacks now rotate properly instead of repeating every day.
"""

import math
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

# Max days a dinner can carry forward as leftovers
LEFTOVER_TOLERANCE_MAP = {
    "none": 0,
    "low": 1,
    "moderate": 2,
    "high": 3,
}


class MealAssignmentService:
    def assign_meals_to_week(
        self,
        recipes: List[Dict[str, Any]],
        cooking_sessions: int = 5,
        leftover_tolerance: str = "moderate",
        selected_days: Optional[List[str]] = None,
    ) -> Dict[str, Dict[str, Dict[str, Any]]]:
        """
        Assign recipes to meal slots with intelligent repetition.

        Args:
            recipes: Recipe dicts (each with 'id' and 'meal_type')
            cooking_sessions: Unique dinner cooking events per week
            leftover_tolerance: How far leftovers carry (none/low/moderate/high)
            selected_days: Which days to plan for

        Returns:
            day -> meal_type -> {recipe_id, is_repeat, original_day, order}
        """
        target_days = selected_days if selected_days else DAYS
        num_days = len(target_days)
        max_leftover_days = LEFTOVER_TOLERANCE_MAP.get(leftover_tolerance, 2)

        # Categorize recipes by meal type
        breakfast_recipes = [r for r in recipes if self._is_meal_type(r, "breakfast")]
        snack_recipes = [r for r in recipes if self._is_meal_type(r, "snack")]
        # Lunch-only = tagged lunch but NOT dinner (pure lunch recipes)
        lunch_only_recipes = [
            r for r in recipes
            if self._is_meal_type(r, "lunch") and not self._is_meal_type(r, "dinner")
        ]
        dinner_recipes = [r for r in recipes if self._is_meal_type(r, "dinner")]

        # Fallbacks for sparse recipe sets
        if not breakfast_recipes:
            breakfast_recipes = recipes[:max(1, len(recipes) // 4)]
        if not dinner_recipes:
            dinner_recipes = recipes[len(recipes) // 2:] or recipes
        if not lunch_only_recipes:
            lunch_only_recipes = dinner_recipes  # Use dinner recipes as lunch fallback

        logger.info(
            f"Assigning: {len(breakfast_recipes)}B / {len(lunch_only_recipes)}L / "
            f"{len(dinner_recipes)}D / {len(snack_recipes)}S over {num_days} days "
            f"(tolerance={leftover_tolerance}, sessions={cooking_sessions})"
        )

        assignments: Dict[str, Dict[str, Dict[str, Any]]] = {day: {} for day in target_days}
        recipe_usage: Dict[str, int] = {}

        # ── DINNERS: variety-first rotation ──────────────────────────────────
        # Fewer cooking sessions = more repeats, but never consecutive
        dinner_max_repeats = max(1, math.ceil(num_days / max(1, cooking_sessions)))
        dinner_rotation = self._create_variety_rotation(dinner_recipes, num_days, dinner_max_repeats)

        for i, day in enumerate(target_days):
            recipe = dinner_rotation[i]
            recipe_id = recipe.get("id", f"temp_dinner_{i}")
            is_repeat = recipe_usage.get(recipe_id, 0) > 0
            original_day = self._find_first_use_day(assignments, recipe_id, "dinner") if is_repeat else None
            assignments[day]["dinner"] = {
                "recipe_id": recipe_id,
                "is_repeat": is_repeat,
                "original_day": original_day,
                "order": 4,
            }
            recipe_usage[recipe_id] = recipe_usage.get(recipe_id, 0) + 1

        # ── LUNCHES: leftover-aware, not hardwired every day ─────────────────
        lunch_usage: Dict[str, int] = {}  # Tracks per-dinner how many times it was used as lunch

        for i, day in enumerate(target_days):
            recipe_id = None
            is_repeat = False
            original_day = None

            if max_leftover_days > 0 and i > 0:
                # Check yesterday's dinner as a leftover candidate
                yesterday = target_days[i - 1]
                dinner_id = assignments[yesterday]["dinner"]["recipe_id"]
                times_used_as_lunch = lunch_usage.get(dinner_id, 0)

                if times_used_as_lunch < max_leftover_days:
                    recipe_id = dinner_id
                    is_repeat = True
                    # Original day is when it was first cooked, not when the repeat started
                    original_day = (
                        assignments[yesterday]["dinner"].get("original_day") or yesterday
                    )
                    lunch_usage[dinner_id] = times_used_as_lunch + 1

            if not recipe_id:
                # No leftover: use a standalone lunch recipe
                available = [
                    r for r in lunch_only_recipes
                    if recipe_usage.get(r.get("id"), 0) == 0
                ]
                if not available:
                    # All used once — pick least-used
                    available = sorted(
                        lunch_only_recipes,
                        key=lambda r: recipe_usage.get(r.get("id"), 0)
                    )
                recipe = available[0]
                recipe_id = recipe.get("id", f"temp_lunch_{i}")
                is_repeat = recipe_usage.get(recipe_id, 0) > 0
                original_day = self._find_first_use_day(assignments, recipe_id, "lunch") if is_repeat else None

            assignments[day]["lunch"] = {
                "recipe_id": recipe_id,
                "is_repeat": is_repeat,
                "original_day": original_day,
                "order": 3,
            }
            recipe_usage[recipe_id] = recipe_usage.get(recipe_id, 0) + 1

        # ── BREAKFASTS: moderate repetition (2-3 unique per week is normal) ──
        # Max 3 uses per breakfast recipe, but rotate variety-first
        breakfast_rotation = self._create_variety_rotation(breakfast_recipes, num_days, 3)
        for i, day in enumerate(target_days):
            recipe = breakfast_rotation[i]
            recipe_id = recipe.get("id", f"temp_breakfast_{i}")
            is_repeat = recipe_usage.get(recipe_id, 0) > 0
            original_day = self._find_first_use_day(assignments, recipe_id, "breakfast") if is_repeat else None
            assignments[day]["breakfast"] = {
                "recipe_id": recipe_id,
                "is_repeat": is_repeat,
                "original_day": original_day,
                "order": 1,
            }
            recipe_usage[recipe_id] = recipe_usage.get(recipe_id, 0) + 1

        # ── SNACKS: rotate properly (max 2 uses per snack, not same snack daily) ──
        if snack_recipes:
            snack_rotation = self._create_variety_rotation(snack_recipes, num_days, 2)
            for i, day in enumerate(target_days):
                recipe = snack_rotation[i]
                recipe_id = recipe.get("id", f"temp_snack_{i}")
                is_repeat = recipe_usage.get(recipe_id, 0) > 0
                original_day = self._find_first_use_day(assignments, recipe_id, "snack") if is_repeat else None
                assignments[day]["snack"] = {
                    "recipe_id": recipe_id,
                    "is_repeat": is_repeat,
                    "original_day": original_day,
                    "order": 2,
                }
                recipe_usage[recipe_id] = recipe_usage.get(recipe_id, 0) + 1

        unique_count = len(set(
            slot["recipe_id"]
            for day_meals in assignments.values()
            for slot in day_meals.values()
        ))
        repeat_count = sum(
            1 for day_meals in assignments.values()
            for slot in day_meals.values()
            if slot["is_repeat"]
        )
        logger.info(f"Assignment complete: {unique_count} unique, {repeat_count} repeats")

        return assignments

    def _is_meal_type(self, recipe: Dict, meal_type: str) -> bool:
        types = recipe.get("meal_type", [])
        if isinstance(types, str):
            types = [types]
        return meal_type.lower() in [m.lower() for m in types]

    def _create_variety_rotation(
        self,
        recipes: List[Dict],
        slots: int,
        max_per_recipe: int,
    ) -> List[Dict]:
        """
        Round-robin rotation that never repeats the same recipe consecutively.

        Fills `slots` positions from `recipes`, each recipe used at most
        `max_per_recipe` times. Prioritizes least-used, avoids consecutive.
        """
        if not recipes:
            return [{"id": f"placeholder_{i}", "title": "Placeholder"} for i in range(slots)]

        rotation = []
        usage = {r.get("id", f"t{i}"): 0 for i, r in enumerate(recipes)}
        last_used_id = None

        for _ in range(slots):
            # Prefer least-used, avoid consecutive repeat
            available = [
                r for r in recipes
                if usage.get(r.get("id"), 0) < max_per_recipe
                and r.get("id") != last_used_id
            ]
            if not available:
                # Relax consecutive constraint
                available = [r for r in recipes if usage.get(r.get("id"), 0) < max_per_recipe]
            if not available:
                # Relax max constraint too — just avoid consecutive if possible
                available = [r for r in recipes if r.get("id") != last_used_id] or recipes

            available.sort(key=lambda r: usage.get(r.get("id"), 0))
            selected = available[0]
            rotation.append(selected)
            recipe_id = selected.get("id")
            usage[recipe_id] = usage.get(recipe_id, 0) + 1
            last_used_id = recipe_id

        return rotation

    def _find_first_use_day(
        self,
        assignments: Dict,
        recipe_id: str,
        meal_type: str,
    ) -> Optional[str]:
        """Find the first day a recipe appeared in a specific meal type slot."""
        for day in DAYS:
            slot = assignments.get(day, {}).get(meal_type)
            if slot and slot.get("recipe_id") == recipe_id and not slot.get("is_repeat"):
                return day
        return None


# Singleton instance
meal_assignment_service = MealAssignmentService()
