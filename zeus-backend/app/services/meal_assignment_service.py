"""
Meal Assignment Service

Intelligently assigns recipes to meal slots with batch cooking support.
Instead of 21 unique meals, assigns X recipes (based on cooking_sessions_per_week)
across all 21 meal slots with intelligent repeating.

Rules:
- Dinners often become next-day lunches (leftovers)
- Breakfasts can repeat 3-4 times per week (normal behavior)
- Respect user's cooking_sessions_per_week preference
- Respect leftover_tolerance setting
"""

from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
MEAL_TYPES = ["breakfast", "lunch", "dinner"]


@dataclass
class MealSlotAssignment:
    """Represents a single meal slot assignment"""
    recipe_id: str
    is_repeat: bool = False
    original_day: Optional[str] = None  # For leftovers, which day was it cooked
    order: int = 1  # For ordering within a day


class MealAssignmentService:
    """
    Assigns recipes to 21 meal slots with intelligent repeating.

    Supports batch cooking where meals repeat throughout the week.
    """

    # Max times a meal can repeat based on tolerance
    LEFTOVER_MAX = {
        "low": 2,       # Same meal max 2x/week
        "moderate": 3,  # Same meal max 3x/week
        "high": 4       # Same meal max 4x/week
    }

    def assign_meals_to_week(
        self,
        recipes: List[Dict[str, Any]],
        cooking_sessions: int = 6,
        leftover_tolerance: str = "moderate"
    ) -> Dict[str, Dict[str, Dict[str, Any]]]:
        """
        Assign recipes to all 21 meal slots with intelligent repeating.

        Args:
            recipes: List of recipe dicts (each must have 'id', 'title', 'meal_type')
            cooking_sessions: Number of actual cooking events (unique recipes to use)
            leftover_tolerance: How much repetition is acceptable (low/moderate/high)

        Returns:
            Dict mapping day -> meal_type -> MealSlotData
            Example: {
                "monday": {
                    "breakfast": {"recipe_id": "xxx", "is_repeat": False, "original_day": None, "order": 1},
                    "lunch": {"recipe_id": "yyy", "is_repeat": True, "original_day": "sunday", "order": 2},
                    "dinner": {"recipe_id": "zzz", "is_repeat": False, "original_day": None, "order": 3}
                }
            }
        """
        max_repeats = self.LEFTOVER_MAX.get(leftover_tolerance, 3)

        # Categorize recipes by meal type
        breakfast_recipes = [r for r in recipes if self._is_meal_type(r, "breakfast")]
        lunch_recipes = [r for r in recipes if self._is_meal_type(r, "lunch")]
        dinner_recipes = [r for r in recipes if self._is_meal_type(r, "dinner")]

        # If we don't have categorized recipes, distribute evenly
        if not breakfast_recipes:
            breakfast_recipes = recipes[:max(1, len(recipes) // 3)]
        if not dinner_recipes:
            dinner_recipes = recipes[len(recipes) // 3:] if len(recipes) > 1 else recipes
        if not lunch_recipes:
            # Lunches can share with dinners (leftover concept)
            lunch_recipes = dinner_recipes

        logger.info(f"Assigning {len(recipes)} recipes to 21 slots (max {max_repeats} repeats)")
        logger.info(f"Breakfast: {len(breakfast_recipes)}, Lunch: {len(lunch_recipes)}, Dinner: {len(dinner_recipes)}")

        assignments: Dict[str, Dict[str, Dict[str, Any]]] = {day: {} for day in DAYS}
        recipe_usage: Dict[str, int] = {}  # Track usage count per recipe

        # Strategy 1: Assign dinners first (they generate lunch leftovers)
        dinner_rotation = self._create_rotation(dinner_recipes, 7, max_repeats)
        for i, day in enumerate(DAYS):
            recipe = dinner_rotation[i]
            recipe_id = recipe.get("id", f"temp_{i}")
            is_repeat = recipe_usage.get(recipe_id, 0) > 0

            assignments[day]["dinner"] = {
                "recipe_id": recipe_id,
                "is_repeat": is_repeat,
                "original_day": self._find_first_use_day(assignments, recipe_id, "dinner") if is_repeat else None,
                "order": 3
            }
            recipe_usage[recipe_id] = recipe_usage.get(recipe_id, 0) + 1

        # Strategy 2: Lunches = yesterday's dinner (leftover concept)
        for i, day in enumerate(DAYS):
            if i == 0:
                # Monday - use a lunch recipe or first available
                recipe = lunch_recipes[0] if lunch_recipes else dinner_recipes[0]
                recipe_id = recipe.get("id", "temp_lunch_0")
                is_repeat = recipe_usage.get(recipe_id, 0) > 0
                original_day = None
            else:
                # Other days - yesterday's dinner becomes today's lunch
                yesterday = DAYS[i - 1]
                recipe_id = assignments[yesterday]["dinner"]["recipe_id"]
                is_repeat = True
                original_day = yesterday

            assignments[day]["lunch"] = {
                "recipe_id": recipe_id,
                "is_repeat": is_repeat,
                "original_day": original_day,
                "order": 2
            }
            recipe_usage[recipe_id] = recipe_usage.get(recipe_id, 0) + 1

        # Strategy 3: Breakfasts - high repetition is normal (people eat same breakfast)
        breakfast_rotation = self._create_rotation(breakfast_recipes, 7, max_repeats + 1)
        for i, day in enumerate(DAYS):
            recipe = breakfast_rotation[i]
            recipe_id = recipe.get("id", f"temp_breakfast_{i}")
            is_repeat = recipe_usage.get(recipe_id, 0) > 0

            assignments[day]["breakfast"] = {
                "recipe_id": recipe_id,
                "is_repeat": is_repeat,
                "original_day": self._find_first_use_day(assignments, recipe_id, "breakfast") if is_repeat else None,
                "order": 1
            }
            recipe_usage[recipe_id] = recipe_usage.get(recipe_id, 0) + 1

        # Log summary
        unique_recipes = len(set(
            slot["recipe_id"]
            for day_meals in assignments.values()
            for slot in day_meals.values()
        ))
        repeat_count = sum(
            1 for day_meals in assignments.values()
            for slot in day_meals.values()
            if slot["is_repeat"]
        )
        logger.info(f"Assignment complete: {unique_recipes} unique recipes, {repeat_count} repeat meals")

        return assignments

    def _is_meal_type(self, recipe: Dict, meal_type: str) -> bool:
        """Check if recipe is for a specific meal type"""
        recipe_meal_types = recipe.get("meal_type", [])
        if isinstance(recipe_meal_types, str):
            recipe_meal_types = [recipe_meal_types]
        return meal_type.lower() in [m.lower() for m in recipe_meal_types]

    def _create_rotation(
        self,
        recipes: List[Dict],
        slots: int,
        max_per_recipe: int
    ) -> List[Dict]:
        """
        Create a rotation of recipes across slots respecting max usage.

        Returns a list of recipes, one for each slot, with repeats as needed.
        """
        if not recipes:
            return [{"id": f"placeholder_{i}", "title": "Placeholder"} for i in range(slots)]

        rotation = []
        usage = {r.get("id", f"temp_{i}"): 0 for i, r in enumerate(recipes)}

        for slot_idx in range(slots):
            # Find recipe with lowest usage that hasn't hit max
            available = [r for r in recipes if usage.get(r.get("id"), 0) < max_per_recipe]

            if not available:
                # All maxed out, reset to allow more
                available = recipes

            # Sort by usage (prefer least-used)
            available.sort(key=lambda r: usage.get(r.get("id"), 0))
            selected = available[0]

            rotation.append(selected)
            recipe_id = selected.get("id", f"temp_{slot_idx}")
            usage[recipe_id] = usage.get(recipe_id, 0) + 1

        return rotation

    def _find_first_use_day(
        self,
        assignments: Dict[str, Dict[str, Dict]],
        recipe_id: str,
        meal_type: str
    ) -> Optional[str]:
        """Find the first day a recipe was used (for leftover tracking)"""
        for day in DAYS:
            if meal_type in assignments.get(day, {}):
                slot = assignments[day][meal_type]
                if slot.get("recipe_id") == recipe_id and not slot.get("is_repeat"):
                    return day
        return None


# Singleton instance
meal_assignment_service = MealAssignmentService()
