"""
Grocery List Service

Handles grocery list generation from meal plans, including:
- Ingredient aggregation from multiple recipes
- Unit conversions and quantity calculations
- Pantry matching to identify what's already available
- Category organization for easy shopping
"""

from typing import List, Dict, Optional, Tuple
from datetime import datetime, date
from collections import defaultdict
import re
import json
import math
import logging

import anthropic

from app.database import get_database
from app.config import settings
from app.utils.ingredient_matching import (
    normalize_ingredient_name as shared_normalize,
    match_ingredient_to_pantry,
    prepare_pantry_lookup,
    convert_quantity,
    normalize_unit,
)

logger = logging.getLogger(__name__)
from app.schemas.grocery_list import (
    GroceryListResponse,
    GroceryListItemResponse,
    GroceryListCreate,
    GroceryListItemCreate,
    GroceryCategory,
    IngredientAggregate,
    IngredientEntry,
    PantryMatch,
    RecipeWarning
)
from app.schemas.recipe import RecipeResponse
from app.schemas.pantry import PantryItemResponse


class GroceryListService:
    """Service for managing grocery lists."""

    # Valid grocery categories for Claude validation
    VALID_CATEGORIES = {
        'Produce', 'Dairy', 'Protein', 'Grains', 'Spices',
        'Condiments', 'Beverages', 'Frozen', 'Pantry', 'Other'
    }

    def __init__(self):
        self.db = get_database()
        try:
            self.claude_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        except Exception:
            self.claude_client = None
            logger.warning("Claude client not available for ingredient categorization")

    # ========================================================================
    # PUBLIC METHODS
    # ========================================================================

    async def generate_grocery_list(
        self,
        user_id: str,
        meal_plan_id: str,
        household_size: Optional[int] = None
    ) -> GroceryListResponse:
        """
        Generate grocery list from meal plan.

        Steps:
        1. Fetch meal plan and all associated recipes
        2. Extract and aggregate ingredients
        3. Match against user's pantry
        4. Calculate needed quantities
        5. Categorize items
        6. Save to database
        7. Return formatted response

        Args:
            user_id: User ID
            meal_plan_id: Meal plan ID to generate list from

        Returns:
            GroceryListResponse with all items grouped by category

        Raises:
            ValueError: If meal plan not found or doesn't belong to user
        """
        try:
            # 1. Fetch meal plan
            meal_plan_result = self.db.table("meal_plans").select("*").eq("id", meal_plan_id).eq("user_id", user_id).execute()
            if not meal_plan_result.data:
                raise ValueError(f"Meal plan {meal_plan_id} not found or doesn't belong to user")

            meal_plan = meal_plan_result.data[0]
            week_start_date = meal_plan.get("week_start_date")

            # 2. Extract recipe IDs and count occurrences
            recipe_ids = self._extract_recipe_ids_from_meal_plan(meal_plan)
            recipe_occurrences = self._count_recipe_occurrences(meal_plan)

            if not recipe_ids:
                raise ValueError("Meal plan has no recipes")

            # 3. Fetch all recipes
            recipes_result = self.db.table("recipes").select("*").in_("id", recipe_ids).execute()
            recipes = recipes_result.data

            if household_size:
                logger.info(f"Scaling grocery list for household size: {household_size}")
            for rid, count in recipe_occurrences.items():
                if count > 1:
                    logger.info(f"Recipe {rid} appears {count} times in meal plan")

            # 4. Aggregate ingredients from all recipes (scaled for household size + occurrences)
            aggregated_ingredients, recipe_warnings = self._aggregate_ingredients(
                recipes, household_size=household_size, recipe_occurrences=recipe_occurrences
            )
        except Exception as e:
            logger.error(f"Error in generate_grocery_list: {e}", exc_info=True)
            raise

        # 5. Use Claude to clean names and categorize ingredients
        ai_results = self._ai_clean_and_categorize(aggregated_ingredients)
        if ai_results:
            for norm_name, ai_data in ai_results.items():
                if norm_name in aggregated_ingredients:
                    agg = aggregated_ingredients[norm_name]
                    agg.display_name = ai_data["clean_name"]
                    agg.category = GroceryCategory(ai_data["category"])
        else:
            # Fallback: use rule-based categorization (already set during aggregation)
            logger.info("Using rule-based categorization (Claude unavailable)")

        # 6. Fetch user's pantry items
        pantry_result = self.db.table("pantry_items").select("*").eq("user_id", user_id).execute()
        pantry_items = pantry_result.data

        # 7. Match aggregated ingredients to pantry
        pantry_matches = self._match_pantry_items(aggregated_ingredients, pantry_items)

        # 8. Create or update grocery list
        grocery_list_data = GroceryListCreate(
            user_id=user_id,
            meal_plan_id=meal_plan_id,
            name=f"Grocery List - Week of {week_start_date}",
            week_start_date=week_start_date
        )

        # Check if grocery list already exists for this meal plan
        existing_list = self.db.table("grocery_lists").select("id").eq("user_id", user_id).eq("meal_plan_id", meal_plan_id).execute()

        if existing_list.data:
            # Update existing list
            grocery_list_id = existing_list.data[0]["id"]

            # Delete old items
            self.db.table("grocery_list_items").delete().eq("grocery_list_id", grocery_list_id).execute()

            # Update grocery list metadata
            self.db.table("grocery_lists").update({
                "updated_at": datetime.now().isoformat(),
                "is_purchased": False,
                "purchased_at": None
            }).eq("id", grocery_list_id).execute()
        else:
            # Create new grocery list
            grocery_list_result = self.db.table("grocery_lists").insert({
                "user_id": user_id,
                "meal_plan_id": meal_plan_id,
                "name": grocery_list_data.name,
                "week_start_date": str(week_start_date)
            }).execute()
            grocery_list_id = grocery_list_result.data[0]["id"]

        # 9. Create grocery list items (consolidate alternate units into one item)
        grocery_items = []
        for agg_ingredient in aggregated_ingredients.values():
            pantry_match = pantry_matches.get(agg_ingredient.normalized_name)

            # Combine all recipe IDs from primary + alternate entries
            all_recipe_ids = list(agg_ingredient.recipe_ids)
            for alt_entry in agg_ingredient.alternate_entries:
                all_recipe_ids.extend(alt_entry.recipe_ids)

            # Build combined unit string if there are alternate entries
            if agg_ingredient.alternate_entries:
                # Format: "2 cups + 3 tablespoons"
                parts = []
                if agg_ingredient.total_quantity and agg_ingredient.total_quantity > 0:
                    qty_str = str(int(agg_ingredient.total_quantity)) if agg_ingredient.total_quantity == int(agg_ingredient.total_quantity) else str(agg_ingredient.total_quantity)
                    parts.append(f"{qty_str} {agg_ingredient.unit or ''}".strip())
                for alt_entry in agg_ingredient.alternate_entries:
                    if alt_entry.quantity and alt_entry.quantity > 0:
                        qty_str = str(int(alt_entry.quantity)) if alt_entry.quantity == int(alt_entry.quantity) else str(alt_entry.quantity)
                        parts.append(f"{qty_str} {alt_entry.unit or ''}".strip())
                combined_unit = " + ".join(parts) if parts else None
                # Truncate to fit the 50 char max on the unit field
                if combined_unit and len(combined_unit) > 50:
                    combined_unit = combined_unit[:47] + "..."
            else:
                combined_unit = None

            final_unit = combined_unit if combined_unit else agg_ingredient.unit
            if final_unit and len(final_unit) > 50:
                final_unit = final_unit[:47] + "..."

            item_data = GroceryListItemCreate(
                item_name=agg_ingredient.display_name,
                normalized_name=agg_ingredient.normalized_name,
                quantity=agg_ingredient.total_quantity,
                unit=final_unit,
                category=agg_ingredient.category,
                have_in_pantry=pantry_match.match_type != 'none' if pantry_match else False,
                pantry_quantity=pantry_match.pantry_quantity if pantry_match else None,
                pantry_unit=pantry_match.pantry_unit if pantry_match else None,
                needed_quantity=pantry_match.needed_quantity if pantry_match else agg_ingredient.total_quantity,
                recipe_ids=all_recipe_ids
            )

            grocery_items.append(item_data.model_dump())

        # Insert all items
        if grocery_items:
            for item in grocery_items:
                item["grocery_list_id"] = grocery_list_id

            self.db.table("grocery_list_items").insert(grocery_items).execute()

        # 10. Fetch and return complete grocery list with warnings
        return await self.get_grocery_list(user_id, grocery_list_id, warnings=recipe_warnings)

    async def get_grocery_list(
        self,
        user_id: str,
        grocery_list_id: str,
        warnings: Optional[List[RecipeWarning]] = None
    ) -> GroceryListResponse:
        """
        Get grocery list by ID.

        Args:
            user_id: User ID (for authorization)
            grocery_list_id: Grocery list ID
            warnings: Optional list of warnings about recipes (passed from generate)

        Returns:
            GroceryListResponse with items grouped by category

        Raises:
            ValueError: If grocery list not found or doesn't belong to user
        """
        # Fetch grocery list
        list_result = self.db.table("grocery_lists").select("*").eq("id", grocery_list_id).eq("user_id", user_id).execute()

        if not list_result.data:
            raise ValueError(f"Grocery list {grocery_list_id} not found or doesn't belong to user")

        grocery_list = list_result.data[0]

        # Fetch all items
        items_result = self.db.table("grocery_list_items").select("*").eq("grocery_list_id", grocery_list_id).execute()
        items = items_result.data

        # Convert to response objects
        item_responses = [GroceryListItemResponse(**item) for item in items]

        # Group by category
        items_by_category = defaultdict(list)
        for item in item_responses:
            items_by_category[item.category].append(item)

        # Calculate summary statistics
        total_items = len(item_responses)
        purchased_items_count = sum(1 for item in item_responses if item.is_purchased)
        items_in_pantry_count = sum(1 for item in item_responses if item.have_in_pantry)

        return GroceryListResponse(
            id=grocery_list["id"],
            user_id=grocery_list["user_id"],
            meal_plan_id=grocery_list["meal_plan_id"],
            name=grocery_list["name"],
            week_start_date=grocery_list["week_start_date"],
            items=item_responses,
            items_by_category=dict(items_by_category),
            total_items=total_items,
            purchased_items_count=purchased_items_count,
            items_in_pantry_count=items_in_pantry_count,
            warnings=warnings or [],
            is_purchased=grocery_list["is_purchased"],
            purchased_at=grocery_list.get("purchased_at"),
            created_at=grocery_list["created_at"],
            updated_at=grocery_list["updated_at"]
        )

    async def get_grocery_list_by_meal_plan(
        self,
        user_id: str,
        meal_plan_id: str
    ) -> Optional[GroceryListResponse]:
        """
        Get grocery list for a specific meal plan.

        Args:
            user_id: User ID
            meal_plan_id: Meal plan ID

        Returns:
            GroceryListResponse if found, None otherwise
        """
        # Find grocery list for this meal plan
        list_result = self.db.table("grocery_lists").select("id").eq("user_id", user_id).eq("meal_plan_id", meal_plan_id).execute()

        if not list_result.data:
            return None

        grocery_list_id = list_result.data[0]["id"]
        return await self.get_grocery_list(user_id, grocery_list_id)

    async def update_item_purchased_status(
        self,
        user_id: str,
        item_id: str,
        is_purchased: bool
    ) -> GroceryListItemResponse:
        """
        Update purchased status of a grocery list item.

        Args:
            user_id: User ID (for authorization)
            item_id: Item ID
            is_purchased: New purchased status

        Returns:
            Updated GroceryListItemResponse

        Raises:
            ValueError: If item not found or user doesn't own the grocery list
        """
        # Verify ownership
        item_result = self.db.table("grocery_list_items").select("grocery_list_id").eq("id", item_id).execute()

        if not item_result.data:
            raise ValueError(f"Grocery list item {item_id} not found")

        grocery_list_id = item_result.data[0]["grocery_list_id"]

        # Verify user owns the grocery list
        list_result = self.db.table("grocery_lists").select("id").eq("id", grocery_list_id).eq("user_id", user_id).execute()

        if not list_result.data:
            raise ValueError("Unauthorized to update this item")

        # Update item
        update_result = self.db.table("grocery_list_items").update({
            "is_purchased": is_purchased,
            "updated_at": datetime.now().isoformat()
        }).eq("id", item_id).execute()

        return GroceryListItemResponse(**update_result.data[0])

    async def mark_list_as_purchased(
        self,
        user_id: str,
        grocery_list_id: str
    ) -> GroceryListResponse:
        """
        Mark entire grocery list as purchased.

        Args:
            user_id: User ID
            grocery_list_id: Grocery list ID

        Returns:
            Updated GroceryListResponse

        Raises:
            ValueError: If list not found or doesn't belong to user
        """
        # Verify ownership
        list_result = self.db.table("grocery_lists").select("id").eq("id", grocery_list_id).eq("user_id", user_id).execute()

        if not list_result.data:
            raise ValueError(f"Grocery list {grocery_list_id} not found or doesn't belong to user")

        # Mark all items as purchased
        self.db.table("grocery_list_items").update({
            "is_purchased": True,
            "updated_at": datetime.now().isoformat()
        }).eq("grocery_list_id", grocery_list_id).execute()

        # Mark list as purchased
        self.db.table("grocery_lists").update({
            "is_purchased": True,
            "purchased_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }).eq("id", grocery_list_id).execute()

        return await self.get_grocery_list(user_id, grocery_list_id)

    async def delete_grocery_list(
        self,
        user_id: str,
        grocery_list_id: str
    ) -> dict:
        """
        Delete a grocery list and all its items.

        Args:
            user_id: User ID
            grocery_list_id: Grocery list ID

        Returns:
            Success message

        Raises:
            ValueError: If list not found or doesn't belong to user
        """
        # Verify ownership
        list_result = self.db.table("grocery_lists").select("id").eq("id", grocery_list_id).eq("user_id", user_id).execute()

        if not list_result.data:
            raise ValueError(f"Grocery list {grocery_list_id} not found or doesn't belong to user")

        # Delete grocery list (items will cascade delete)
        self.db.table("grocery_lists").delete().eq("id", grocery_list_id).execute()

        return {"message": "Grocery list deleted successfully"}

    # ========================================================================
    # PRIVATE HELPER METHODS
    # ========================================================================

    def _extract_recipe_ids_from_meal_plan(self, meal_plan: dict) -> List[str]:
        """
        Extract all unique recipe IDs from meal plan's meals structure.

        Handles both old format (string recipe_id) and new format (object with recipe_id property).

        Args:
            meal_plan: Meal plan dict with 'meals' JSONB field

        Returns:
            List of unique recipe IDs
        """
        recipe_ids = set()
        meals = meal_plan.get("meals", {})

        for day_name, day_meals in meals.items():
            if isinstance(day_meals, dict):
                for meal_type, meal_data in day_meals.items():
                    if meal_data:
                        # Handle both old (string) and new (object) formats
                        if isinstance(meal_data, str):
                            # Old format: meal_data is the recipe_id directly
                            recipe_ids.add(meal_data)
                        elif isinstance(meal_data, dict) and 'recipe_id' in meal_data:
                            # New format: meal_data is an object with recipe_id property
                            recipe_ids.add(meal_data['recipe_id'])

        return list(recipe_ids)

    def _count_recipe_occurrences(self, meal_plan: dict) -> Dict[str, int]:
        """
        Count how many times each recipe appears in the meal plan.

        A recipe used for Monday dinner AND Wednesday dinner counts as 2 occurrences,
        meaning ingredient quantities should be doubled.

        Args:
            meal_plan: Meal plan dict with 'meals' JSONB field

        Returns:
            Dict mapping recipe_id -> occurrence count
        """
        counts: Dict[str, int] = defaultdict(int)
        meals = meal_plan.get("meals", {})

        for day_name, day_meals in meals.items():
            if isinstance(day_meals, dict):
                for meal_type, meal_data in day_meals.items():
                    if meal_data:
                        if isinstance(meal_data, str):
                            counts[meal_data] += 1
                        elif isinstance(meal_data, dict) and 'recipe_id' in meal_data:
                            counts[meal_data['recipe_id']] += 1

        return dict(counts)

    def _aggregate_ingredients(
        self,
        recipes: List[dict],
        household_size: Optional[int] = None,
        recipe_occurrences: Optional[Dict[str, int]] = None
    ) -> Tuple[Dict[str, IngredientAggregate], List[RecipeWarning]]:
        """
        Aggregate ingredients from multiple recipes, scaled for household size
        and recipe occurrence count.

        Strategy:
        1. Multiply quantities by occurrence count (recipe used 6 times = 6x ingredients)
        2. Scale each recipe's ingredient quantities based on household_size / recipe.servings
        3. Group ingredients by normalized name
        4. For each group, check if units are compatible
        5. If compatible, convert to common unit and sum quantities
        6. If incompatible, keep as separate entries

        Args:
            recipes: List of recipe dicts with 'ingredients' JSONB field
            household_size: Number of people to cook for (scales quantities)
            recipe_occurrences: Dict of recipe_id -> count of times used in meal plan

        Returns:
            Tuple of:
            - Dict mapping normalized_name to IngredientAggregate
            - List of warnings about recipes that couldn't be processed
        """
        # Group ingredients by normalized name
        ingredient_groups = defaultdict(list)
        warnings = []

        for recipe in recipes:
            recipe_id = recipe["id"]
            recipe_title = recipe.get("title", "Unknown Recipe")
            ingredients = recipe.get("ingredients")

            # How many times does this recipe appear in the meal plan?
            occurrence_count = (recipe_occurrences or {}).get(recipe_id, 1)

            # Calculate scaling factor for household size
            recipe_servings = recipe.get("servings") or 4
            if household_size and household_size > 0 and recipe_servings > 0:
                scale_factor = (household_size / recipe_servings) * occurrence_count
            else:
                scale_factor = float(occurrence_count)

            # Handle None or empty ingredients
            if ingredients is None:
                logger.warning(f"Recipe {recipe_id} ({recipe_title}) has null ingredients")
                warnings.append(RecipeWarning(
                    recipe_id=recipe_id,
                    recipe_title=recipe_title,
                    reason="Recipe has no ingredients defined"
                ))
                continue

            if not isinstance(ingredients, list):
                logger.warning(f"Recipe {recipe_id} ({recipe_title}) has invalid ingredients format: {type(ingredients)}")
                warnings.append(RecipeWarning(
                    recipe_id=recipe_id,
                    recipe_title=recipe_title,
                    reason="Recipe has invalid ingredients format"
                ))
                continue

            if len(ingredients) == 0:
                logger.warning(f"Recipe {recipe_id} ({recipe_title}) has empty ingredients list")
                warnings.append(RecipeWarning(
                    recipe_id=recipe_id,
                    recipe_title=recipe_title,
                    reason="Recipe has no ingredients"
                ))
                continue

            valid_ingredient_count = 0
            for ingredient in ingredients:
                # Handle case where ingredient is not a dict
                if not isinstance(ingredient, dict):
                    logger.warning(f"Recipe {recipe_id} has invalid ingredient format: {ingredient}")
                    continue

                raw_name = ingredient.get("name") or ""  # Handle None values
                quantity = ingredient.get("quantity")
                unit = ingredient.get("unit")

                # Skip ingredients with no name
                if not raw_name or not raw_name.strip():
                    continue

                # Clean ingredient name (remove recipe notes like "or more to taste")
                name = self._clean_ingredient_name(raw_name)

                # Skip common household items that don't need to be purchased
                if self._should_skip_ingredient(name):
                    continue

                valid_ingredient_count += 1

                # Parse quantity if it's a string (e.g., "1-2" or "1/2")
                if isinstance(quantity, str):
                    quantity = self._parse_quantity_string(quantity)

                # Scale quantity for household size + occurrence count
                if quantity is not None and scale_factor != 1.0:
                    scaled = quantity * scale_factor
                    # Round up count-based units (can't buy 0.3 of an egg)
                    unit_lower = (unit or "").lower().strip()
                    count_units = {
                        "", "piece", "pieces", "item", "items", "whole",
                        "clove", "cloves", "head", "heads", "bunch", "bunches",
                        "slice", "slices", "can", "cans", "box", "boxes",
                        "package", "packages", "bag", "bags", "jar", "jars",
                        "stalk", "stalks", "sprig", "sprigs", "leaf", "leaves",
                        "strip", "strips", "link", "links",
                    }
                    if unit_lower in count_units:
                        quantity = math.ceil(scaled)
                    else:
                        quantity = round(scaled, 2)

                normalized_name = self._normalize_ingredient_name(name)

                ingredient_groups[normalized_name].append({
                    "display_name": name,
                    "quantity": quantity,
                    "unit": unit,
                    "recipe_id": recipe_id
                })

            if valid_ingredient_count == 0:
                logger.warning(f"Recipe {recipe_id} ({recipe_title}) has no valid ingredients")
                warnings.append(RecipeWarning(
                    recipe_id=recipe_id,
                    recipe_title=recipe_title,
                    reason="Recipe has no valid ingredients"
                ))

        # Aggregate each group
        aggregated = {}

        for normalized_name, ingredients in ingredient_groups.items():
            # Use first occurrence as display name (maintain original case)
            display_name = ingredients[0]["display_name"]

            # Group by unit to check compatibility
            unit_groups = defaultdict(list)
            for ing in ingredients:
                unit_key = (ing["unit"] or "").lower().strip()
                unit_groups[unit_key].append(ing)

            # Determine category
            category = self._categorize_ingredient(display_name)

            # Try to aggregate quantities
            if len(unit_groups) == 1:
                # All same unit - simple aggregation
                unit = list(unit_groups.keys())[0] or None
                total_quantity = sum(
                    ing["quantity"] for ing in ingredients
                    if ing["quantity"] is not None
                )
                recipe_ids = [ing["recipe_id"] for ing in ingredients]

                aggregated[normalized_name] = IngredientAggregate(
                    normalized_name=normalized_name,
                    display_name=display_name,
                    total_quantity=total_quantity if total_quantity > 0 else None,
                    unit=unit,
                    category=category,
                    recipe_ids=recipe_ids,
                    alternate_entries=[]
                )
            else:
                # Multiple units - try to convert
                converted_groups = self._try_convert_units(unit_groups)

                if len(converted_groups) == 1:
                    # Successfully converted to one unit
                    unit, total_quantity = list(converted_groups.items())[0]
                    recipe_ids = [ing["recipe_id"] for ing in ingredients]

                    aggregated[normalized_name] = IngredientAggregate(
                        normalized_name=normalized_name,
                        display_name=display_name,
                        total_quantity=total_quantity,
                        unit=unit,
                        category=category,
                        recipe_ids=recipe_ids,
                        alternate_entries=[]
                    )
                else:
                    # Couldn't convert - keep as separate entries
                    primary_entry = list(converted_groups.items())[0]
                    primary_unit, primary_quantity = primary_entry

                    # Get recipe IDs for primary entry
                    primary_recipe_ids = [
                        ing["recipe_id"] for ing in ingredients
                        if (ing["unit"] or "").lower().strip() == primary_unit
                    ]

                    alternate_entries = []
                    for unit, quantity in list(converted_groups.items())[1:]:
                        alt_recipe_ids = [
                            ing["recipe_id"] for ing in ingredients
                            if (ing["unit"] or "").lower().strip() == unit
                        ]
                        alternate_entries.append(IngredientEntry(
                            quantity=quantity,
                            unit=unit,
                            recipe_ids=alt_recipe_ids
                        ))

                    aggregated[normalized_name] = IngredientAggregate(
                        normalized_name=normalized_name,
                        display_name=display_name,
                        total_quantity=primary_quantity,
                        unit=primary_unit,
                        category=category,
                        recipe_ids=primary_recipe_ids,
                        alternate_entries=alternate_entries
                    )

        return aggregated, warnings

    def _should_skip_ingredient(self, name: str) -> bool:
        """
        Check if an ingredient should be skipped from the grocery list.

        These are common household items that people typically don't need
        to purchase at the grocery store.

        Args:
            name: Ingredient name

        Returns:
            True if the ingredient should be skipped
        """
        if not name:
            return True

        name_lower = name.lower().strip()

        # Items to skip - common household items or things you don't buy
        skip_items = {
            # Water and ice
            'water', 'tap water', 'cold water', 'warm water', 'hot water',
            'boiling water', 'ice water', 'filtered water', 'room temperature water',
            'ice', 'ice cubes',

            # Basic seasonings most people have
            'salt and pepper', 'salt & pepper',

            # Cooking basics that aren't really "ingredients"
            'cooking spray', 'non-stick spray', 'nonstick spray',
            'parchment paper', 'aluminum foil', 'plastic wrap',

            # Garnishes that are optional
            'garnish', 'for garnish', 'optional garnish',
        }

        # Check exact matches
        if name_lower in skip_items:
            return True

        # Check if name starts with these (handles variations like "water, divided")
        skip_prefixes = ['water,', 'water ', 'ice,', 'ice ']
        for prefix in skip_prefixes:
            if name_lower.startswith(prefix):
                return True

        return False

    def _normalize_ingredient_name(self, name: str) -> str:
        """Normalize ingredient name for matching. Delegates to shared utility."""
        return shared_normalize(name)

    def _match_pantry_items(
        self,
        aggregated_ingredients: Dict[str, IngredientAggregate],
        pantry_items: List[dict]
    ) -> Dict[str, PantryMatch]:
        """
        Match aggregated ingredients to pantry items with unit-aware deduction.

        Uses shared 4-level matching (exact → variation → substring → word-overlap)
        and converts between compatible units (cups↔tbsp, lbs↔oz, etc.).

        Args:
            aggregated_ingredients: Dict of normalized_name -> IngredientAggregate
            pantry_items: List of pantry item dicts

        Returns:
            Dict mapping normalized_name to PantryMatch
        """
        pantry_matches = {}

        # Build pantry lookup using shared utility
        pantry_lookup = prepare_pantry_lookup(pantry_items)

        for normalized_name, ingredient in aggregated_ingredients.items():
            # Use shared 4-level matching
            matched_pantry_name, match_type = match_ingredient_to_pantry(
                ingredient.display_name, pantry_lookup
            )

            best_match = pantry_lookup.get(matched_pantry_name) if matched_pantry_name else None

            # Calculate needed quantity with unit conversion
            needed_quantity = ingredient.total_quantity

            if best_match and ingredient.total_quantity is not None:
                pantry_quantity = best_match.get("quantity")
                pantry_unit = normalize_unit(best_match.get("unit", ""))
                ingredient_unit = normalize_unit(ingredient.unit or "")

                if pantry_quantity and pantry_quantity > 0:
                    # Try to convert pantry quantity to ingredient's unit
                    converted = convert_quantity(pantry_quantity, pantry_unit, ingredient_unit)
                    if converted is not None:
                        needed_quantity = max(0, round(ingredient.total_quantity - converted, 2))
                    else:
                        # Units incompatible — still flag as in pantry but don't deduct
                        logger.info(
                            f"Cannot convert {pantry_quantity} {pantry_unit} → {ingredient_unit} "
                            f"for '{ingredient.display_name}'"
                        )

            pantry_matches[normalized_name] = PantryMatch(
                ingredient_name=ingredient.display_name,
                normalized_name=normalized_name,
                pantry_item_id=best_match.get("id") if best_match else None,
                match_type=match_type if match_type != "none" else "none",
                pantry_quantity=best_match.get("quantity") if best_match else None,
                pantry_unit=best_match.get("unit") if best_match else None,
                needed_quantity=needed_quantity
            )

        return pantry_matches

    def _try_convert_units(
        self,
        unit_groups: Dict[str, List[dict]]
    ) -> Dict[str, float]:
        """
        Try to convert different units to a common unit.

        Uses unit conversion tables to merge compatible units (e.g., cups + tbsp → cups).
        Falls back to separate entries for truly incompatible units (e.g., cups + lbs).

        Args:
            unit_groups: Dict mapping unit -> list of ingredients

        Returns:
            Dict mapping unit -> total quantity
        """
        # First, sum quantities within each unit group
        unit_totals = {}
        for unit, ingredients in unit_groups.items():
            total = sum(
                ing["quantity"] for ing in ingredients
                if ing["quantity"] is not None
            )
            if total > 0:
                unit_totals[unit or ""] = total

        if len(unit_totals) <= 1:
            return unit_totals

        # Try to merge compatible units into the most common/largest unit
        units = list(unit_totals.keys())
        merged = {}
        used = set()

        for i, primary_unit in enumerate(units):
            if primary_unit in used:
                continue

            total_in_primary = unit_totals[primary_unit]
            used.add(primary_unit)

            for j in range(i + 1, len(units)):
                other_unit = units[j]
                if other_unit in used:
                    continue

                converted = convert_quantity(unit_totals[other_unit], other_unit, primary_unit)
                if converted is not None:
                    total_in_primary += converted
                    used.add(other_unit)

            merged[primary_unit] = round(total_in_primary, 2)

        return merged

    def _ai_clean_and_categorize(
        self,
        ingredients: Dict[str, 'IngredientAggregate']
    ) -> Dict[str, Dict[str, str]]:
        """
        Use Claude to clean ingredient names and assign grocery categories.

        Sends all ingredient names in one batch call. Returns a dict mapping
        normalized_name -> {"clean_name": "...", "category": "..."}.

        Falls back to rule-based categorization if Claude is unavailable.
        """
        if not self.claude_client or not ingredients:
            return {}

        # Build the list of raw display names
        name_list = []
        for norm_name, agg in ingredients.items():
            name_list.append(f"- {agg.display_name}")

        names_text = "\n".join(name_list)

        prompt = f"""You are a grocery list assistant. For each ingredient below, return:
1. A clean display name — what you'd see on a grocery shopping list:
   - Remove brand names ("Eggland's Best Eggs" → "Eggs")
   - Remove recipe instructions ("minced", "diced", "or to taste", "divided")
   - Remove size descriptors ("small", "large", "medium")
   - Remove cooking state prefixes ("Uncooked Jasmine Rice" → "Jasmine Rice")
   - Remove any emoji characters
   - Fix truncated words ("larg" → infer it was "large" and remove it)
   - Fix typos and formatting issues
   - Capitalize properly (title case)
   - Keep it simple: just the ingredient name a shopper needs
2. The correct grocery store category

Valid categories (use EXACTLY one of these):
Produce, Dairy, Protein, Grains, Spices, Condiments, Beverages, Frozen, Pantry, Other

Category rules:
- Peanut butter, nut butters → Condiments (NOT Dairy)
- Shallots, scallions, fresh herbs → Produce
- Sauces (soy, fish, oyster, hot sauce, etc.) → Condiments
- Oils and vinegars → Condiments
- Flour, sugar, cornstarch, baking supplies → Pantry
- Salt, pepper, dried herbs/spices, seasoning → Spices
- Eggs → Protein
- Rice, pasta, bread, noodles → Grains
- Broth/stock → Beverages
- Nuts, seeds, dried beans → Pantry
- Honey, maple syrup → Condiments
- Mirin, cooking wine → Condiments

Ingredients:
{names_text}

Respond with ONLY a JSON array, no other text. Each element:
{{"original": "exact original name from list above", "clean_name": "cleaned name", "category": "Category"}}"""

        try:
            response = self.claude_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}]
            )

            response_text = response.content[0].text.strip()

            # Extract JSON from response (handle markdown code blocks)
            if response_text.startswith("```"):
                response_text = response_text.split("\n", 1)[1]
                response_text = response_text.rsplit("```", 1)[0].strip()

            parsed = json.loads(response_text)

            # Build lookup by original name -> result
            result = {}
            for item in parsed:
                original = item.get("original", "")
                clean_name = item.get("clean_name", original)
                category = item.get("category", "Other")

                # Validate category
                if category not in self.VALID_CATEGORIES:
                    category = "Other"

                # Match back to our normalized names
                for norm_name, agg in ingredients.items():
                    if agg.display_name == original:
                        result[norm_name] = {
                            "clean_name": clean_name,
                            "category": category
                        }
                        break

            logger.info(f"Claude categorized {len(result)}/{len(ingredients)} ingredients")
            return result

        except Exception as e:
            logger.warning(f"Claude categorization failed, falling back to rules: {e}")
            return {}

    def _clean_ingredient_name(self, name: str) -> str:
        """
        Clean ingredient name by removing recipe notes and cooking instructions.

        Strips things like "or more to taste", "divided", "for serving", etc.
        """
        if not name:
            return name

        # Remove trailing recipe notes after comma that are instructions, not part of the name
        # e.g. "peanut butter, or more to taste" → "peanut butter"
        # But keep descriptive commas like "Small shallot, minced" → "Shallot"
        cleaning_patterns = [
            r',?\s*or (?:more |less )?to taste.*$',
            r',?\s*to taste.*$',
            r',?\s*or as needed.*$',
            r',?\s*as needed.*$',
            r',?\s*for (?:serving|garnish|topping|decoration).*$',
            r',?\s*plus (?:more|extra) for.*$',
            r',?\s*at room temperature.*$',
            r',?\s*room temperature.*$',
            r',?\s*divided.*$',
            r',?\s*optional.*$',
            r',?\s*adjusted to taste.*$',
            r',?\s*or to preference.*$',
        ]

        result = name
        for pattern in cleaning_patterns:
            result = re.sub(pattern, '', result, flags=re.IGNORECASE)

        # Remove emoji characters
        result = re.sub(
            r'[\U0001F300-\U0001F9FF\U00002702-\U000027B0\U0000FE00-\U0000FE0F'
            r'\U0000200D\U00002600-\U000026FF\U0000231A-\U0000231B]+',
            '', result
        )

        # Remove leading size descriptors (small, medium, large)
        result = re.sub(r'^(?:small|medium|large|extra.large)\s+', '', result, flags=re.IGNORECASE)

        # Remove cooking state prefixes (Uncooked, Raw, Cooked, etc.)
        result = re.sub(r'^(?:uncooked|raw|cooked|prepared|pre-cooked)\s+', '', result, flags=re.IGNORECASE)

        # Remove trailing cooking instructions after comma (minced, chopped, diced, etc.)
        result = re.sub(
            r',\s*(?:minced|chopped|diced|sliced|grated|shredded|crushed|julienned|'
            r'cut into.*|torn|peeled|seeded|cored|trimmed|halved|quartered|cubed|'
            r'thinly sliced|finely (?:chopped|diced|minced)|roughly chopped|freshly ground)$',
            '', result, flags=re.IGNORECASE
        )

        return result.strip()

    def _categorize_ingredient(self, name: str) -> GroceryCategory:
        """
        Categorize ingredient by name using word-boundary matching.

        Uses regex word boundaries to avoid false matches like
        "peanut butter" → Dairy (from "butter") or "shallot, minced" → Protein (from "mince").

        Args:
            name: Ingredient name

        Returns:
            GroceryCategory enum value
        """
        if not name:
            return GroceryCategory.OTHER

        name_lower = name.lower()

        def _has_word(words):
            """Check if any word appears as a whole word (word boundary match)."""
            for word in words:
                if re.search(r'\b' + re.escape(word) + r'\b', name_lower):
                    return True
            return False

        # Condiments — check FIRST for multi-word matches that would conflict
        # (e.g., "peanut butter" before "butter" matches Dairy)
        if _has_word([
            'peanut butter', 'almond butter', 'cashew butter', 'sunflower butter',
            'soy sauce', 'hot sauce', 'fish sauce', 'oyster sauce', 'hoisin sauce',
            'teriyaki sauce', 'bbq sauce', 'worcestershire sauce',
        ]):
            return GroceryCategory.CONDIMENTS

        # Produce
        if _has_word([
            'tomato', 'lettuce', 'spinach', 'kale', 'carrot', 'broccoli',
            'cauliflower', 'pepper', 'onion', 'garlic', 'potato', 'cucumber',
            'celery', 'mushroom', 'zucchini', 'squash', 'apple', 'banana',
            'orange', 'lemon', 'lime', 'berry', 'grape', 'melon', 'avocado',
            'shallot', 'scallion', 'green onion', 'leek', 'cabbage', 'radish',
            'turnip', 'beet', 'corn', 'eggplant', 'artichoke', 'asparagus',
            'pear', 'peach', 'plum', 'mango', 'pineapple', 'grapefruit',
            'jalapeño', 'jalapeno', 'serrano', 'habanero', 'poblano',
            'bok choy', 'arugula', 'watercress', 'endive', 'fennel',
            'ginger root', 'fresh ginger',
        ]):
            return GroceryCategory.PRODUCE

        # Dairy
        if _has_word([
            'milk', 'cheese', 'butter', 'cream', 'yogurt', 'sour cream',
            'cottage cheese', 'mozzarella', 'parmesan', 'cheddar',
            'ricotta', 'feta', 'gouda', 'brie', 'provolone',
            'cream cheese', 'whipped cream', 'half and half',
        ]):
            return GroceryCategory.DAIRY

        # Spices (check before Protein so "ground ginger" doesn't match "ground beef")
        if _has_word([
            'salt', 'cumin', 'paprika', 'oregano', 'basil', 'thyme',
            'rosemary', 'cinnamon', 'nutmeg', 'ginger', 'turmeric', 'chili',
            'cayenne', 'parsley', 'cilantro', 'dill', 'sage', 'bay leaf',
            'clove', 'allspice', 'cardamom', 'coriander', 'fennel seed',
            'curry powder', 'garlic powder', 'onion powder', 'seasoning',
            'black pepper', 'white pepper', 'red pepper flake',
            'smoked paprika', 'chili flake', 'dried oregano', 'dried thyme',
            'dried basil', 'ground cumin', 'ground cinnamon',
        ]):
            return GroceryCategory.SPICES

        # Condiments (remaining)
        if _has_word([
            'sauce', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'vinegar',
            'oil', 'olive oil', 'vegetable oil',
            'salsa', 'dressing', 'honey', 'syrup', 'jam', 'jelly',
            'mirin', 'tahini', 'miso', 'sambal', 'gochujang', 'harissa',
        ]):
            return GroceryCategory.CONDIMENTS

        # Protein — use word boundaries to avoid "minced" matching "mince"
        if _has_word([
            'chicken', 'beef', 'pork', 'turkey', 'fish', 'salmon', 'tuna',
            'shrimp', 'egg', 'eggs', 'tofu', 'tempeh', 'bacon', 'sausage', 'lamb',
            'steak', 'ground beef', 'ground turkey', 'ground pork', 'ground chicken',
            'chicken breast', 'chicken thigh', 'drumstick', 'mince',
            'prawn', 'crab', 'lobster', 'scallop', 'clam', 'mussel',
            'duck', 'veal', 'bison', 'venison', 'anchovy',
        ]):
            return GroceryCategory.PROTEIN

        # Grains
        if _has_word([
            'bread', 'pasta', 'rice', 'flour', 'oats', 'quinoa', 'barley',
            'cereal', 'tortilla', 'noodle', 'couscous', 'bagel', 'roll',
            'pita', 'cracker', 'granola', 'polenta', 'grits',
        ]):
            return GroceryCategory.GRAINS

        # Beverages
        if _has_word([
            'juice', 'coffee', 'tea', 'soda', 'water', 'wine', 'beer', 'liquor',
            'broth', 'stock', 'drink', 'kombucha',
        ]):
            return GroceryCategory.BEVERAGES

        # Frozen
        if _has_word(['ice cream', 'popsicle', 'frozen']):
            return GroceryCategory.FROZEN

        # Pantry staples
        if _has_word([
            'sugar', 'baking powder', 'baking soda', 'yeast', 'vanilla',
            'chocolate', 'beans', 'lentils', 'chickpeas', 'canned', 'peas',
            'cornstarch', 'breadcrumbs', 'panko',
        ]):
            return GroceryCategory.PANTRY

        # Default to Other
        return GroceryCategory.OTHER

    def _parse_quantity_string(self, quantity_str: str) -> Optional[float]:
        """
        Parse quantity string to float.

        Handles:
        - Fractions: "1/2" -> 0.5
        - Ranges: "1-2" -> 1.5 (average)
        - Mixed: "1 1/2" -> 1.5

        Args:
            quantity_str: Quantity as string

        Returns:
            Float value or None if can't parse
        """
        if not quantity_str:
            return None

        try:
            # Try direct float conversion first
            return float(quantity_str)
        except ValueError:
            pass

        # Handle fractions (e.g., "1/2")
        if '/' in quantity_str:
            parts = quantity_str.split()
            if len(parts) == 2:
                # Mixed number (e.g., "1 1/2")
                whole = float(parts[0])
                frac_parts = parts[1].split('/')
                fraction = float(frac_parts[0]) / float(frac_parts[1])
                return whole + fraction
            elif len(parts) == 1:
                # Simple fraction (e.g., "1/2")
                frac_parts = parts[0].split('/')
                return float(frac_parts[0]) / float(frac_parts[1])

        # Handle ranges (e.g., "1-2")
        if '-' in quantity_str:
            parts = quantity_str.split('-')
            if len(parts) == 2:
                try:
                    low = float(parts[0])
                    high = float(parts[1])
                    return (low + high) / 2
                except ValueError:
                    pass

        # Can't parse - return None
        return None


# Singleton instance
grocery_list_service = GroceryListService()
