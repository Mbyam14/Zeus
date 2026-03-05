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
import logging

from app.database import get_database

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

    def __init__(self):
        self.db = get_database()

    # ========================================================================
    # PUBLIC METHODS
    # ========================================================================

    async def generate_grocery_list(
        self,
        user_id: str,
        meal_plan_id: str
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

            # 2. Extract recipe IDs from meal plan
            recipe_ids = self._extract_recipe_ids_from_meal_plan(meal_plan)

            if not recipe_ids:
                raise ValueError("Meal plan has no recipes")

            # 3. Fetch all recipes
            recipes_result = self.db.table("recipes").select("*").in_("id", recipe_ids).execute()
            recipes = recipes_result.data

            # 4. Aggregate ingredients from all recipes
            aggregated_ingredients, recipe_warnings = self._aggregate_ingredients(recipes)
        except Exception as e:
            logger.error(f"Error in generate_grocery_list: {e}", exc_info=True)
            raise

        # 5. Fetch user's pantry items
        pantry_result = self.db.table("pantry_items").select("*").eq("user_id", user_id).execute()
        pantry_items = pantry_result.data

        # 6. Match aggregated ingredients to pantry
        pantry_matches = self._match_pantry_items(aggregated_ingredients, pantry_items)

        # 7. Create or update grocery list
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

        # 8. Create grocery list items (consolidate alternate units into one item)
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

        # 9. Fetch and return complete grocery list with warnings
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

    def _aggregate_ingredients(
        self,
        recipes: List[dict]
    ) -> Tuple[Dict[str, IngredientAggregate], List[RecipeWarning]]:
        """
        Aggregate ingredients from multiple recipes.

        Strategy:
        1. Group ingredients by normalized name
        2. For each group, check if units are compatible
        3. If compatible, convert to common unit and sum quantities
        4. If incompatible, keep as separate entries

        Args:
            recipes: List of recipe dicts with 'ingredients' JSONB field

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

                name = ingredient.get("name") or ""  # Handle None values
                quantity = ingredient.get("quantity")
                unit = ingredient.get("unit")

                # Skip ingredients with no name
                if not name or not name.strip():
                    continue

                # Skip common household items that don't need to be purchased
                if self._should_skip_ingredient(name):
                    continue

                valid_ingredient_count += 1

                # Parse quantity if it's a string (e.g., "1-2" or "1/2")
                if isinstance(quantity, str):
                    quantity = self._parse_quantity_string(quantity)

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
        """
        Normalize ingredient name for matching.

        Strategy:
        - Lowercase
        - Trim whitespace
        - Remove trailing 's' (simple pluralization)
        - Remove common modifiers in parentheses

        Args:
            name: Original ingredient name

        Returns:
            Normalized name
        """
        if not name:
            return ""

        # Lowercase and trim
        normalized = name.lower().strip()

        # Remove content in parentheses (e.g., "tomatoes (diced)" -> "tomatoes")
        normalized = re.sub(r'\([^)]*\)', '', normalized).strip()

        # Remove trailing 's' for simple pluralization
        if normalized.endswith('s') and len(normalized) > 3:
            # Don't remove 's' from words like "peas", "lentils"
            if not normalized.endswith(('ss', 'us')):
                normalized = normalized[:-1]

        return normalized

    def _match_pantry_items(
        self,
        aggregated_ingredients: Dict[str, IngredientAggregate],
        pantry_items: List[dict]
    ) -> Dict[str, PantryMatch]:
        """
        Match aggregated ingredients to pantry items.

        Strategy:
        1. Exact match: normalized_name == pantry.normalized_name
        2. Partial match: one contains the other
        3. No match

        For matches, calculate needed_quantity = recipe_quantity - pantry_quantity

        Args:
            aggregated_ingredients: Dict of normalized_name -> IngredientAggregate
            pantry_items: List of pantry item dicts

        Returns:
            Dict mapping normalized_name to PantryMatch
        """
        pantry_matches = {}

        # Pre-normalize all pantry item names for matching
        pantry_with_normalized = []
        for pantry_item in pantry_items:
            pantry_name = pantry_item.get("item_name") or pantry_item.get("normalized_name") or ""
            pantry_normalized = self._normalize_ingredient_name(pantry_name)
            pantry_with_normalized.append((pantry_item, pantry_normalized))

        for normalized_name, ingredient in aggregated_ingredients.items():
            best_match = None
            match_type = 'none'

            # Try exact match first
            for pantry_item, pantry_normalized in pantry_with_normalized:
                if pantry_normalized and pantry_normalized == normalized_name:
                    best_match = pantry_item
                    match_type = 'exact'
                    break

            # Try partial/substring match if no exact match
            if not best_match:
                for pantry_item, pantry_normalized in pantry_with_normalized:
                    if pantry_normalized and normalized_name:
                        if (pantry_normalized in normalized_name or
                            normalized_name in pantry_normalized):
                            best_match = pantry_item
                            match_type = 'partial'
                            break

            # Try word-overlap match as last resort (e.g. "bell pepper" vs "green bell pepper")
            if not best_match and normalized_name:
                ingredient_words = set(normalized_name.split())
                for pantry_item, pantry_normalized in pantry_with_normalized:
                    if pantry_normalized and len(pantry_normalized) >= 3:
                        pantry_words = set(pantry_normalized.split())
                        # Match if all words of the shorter name appear in the longer one
                        shorter, longer = (pantry_words, ingredient_words) if len(pantry_words) <= len(ingredient_words) else (ingredient_words, pantry_words)
                        if shorter and shorter.issubset(longer):
                            best_match = pantry_item
                            match_type = 'partial'
                            break

            # Calculate needed quantity
            needed_quantity = ingredient.total_quantity

            if best_match and ingredient.total_quantity is not None:
                pantry_quantity = best_match.get("quantity")
                pantry_unit = best_match.get("unit", "").lower().strip()
                ingredient_unit = (ingredient.unit or "").lower().strip()

                # Only subtract if units match
                if pantry_quantity and pantry_unit == ingredient_unit:
                    needed_quantity = max(0, ingredient.total_quantity - pantry_quantity)

            pantry_matches[normalized_name] = PantryMatch(
                ingredient_name=ingredient.display_name,
                normalized_name=normalized_name,
                pantry_item_id=best_match.get("id") if best_match else None,
                match_type=match_type,
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

        Currently simplified - just sums quantities per unit.
        Future enhancement: Use unit_conversions table for actual conversion.

        Args:
            unit_groups: Dict mapping unit -> list of ingredients

        Returns:
            Dict mapping unit -> total quantity
        """
        # For MVP, just sum quantities within each unit group
        converted = {}

        for unit, ingredients in unit_groups.items():
            total = sum(
                ing["quantity"] for ing in ingredients
                if ing["quantity"] is not None
            )
            if total > 0:
                converted[unit or ""] = total

        # TODO: Future enhancement - query unit_conversions table and actually convert
        # For now, return as-is (separate entries for incompatible units)

        return converted

    def _categorize_ingredient(self, name: str) -> GroceryCategory:
        """
        Categorize ingredient by name.

        Simple keyword-based categorization.

        Args:
            name: Ingredient name

        Returns:
            GroceryCategory enum value
        """
        if not name:
            return GroceryCategory.OTHER

        name_lower = name.lower()

        # Produce
        if any(word in name_lower for word in [
            'tomato', 'lettuce', 'spinach', 'kale', 'carrot', 'broccoli',
            'cauliflower', 'pepper', 'onion', 'garlic', 'potato', 'cucumber',
            'celery', 'mushroom', 'zucchini', 'squash', 'apple', 'banana',
            'orange', 'lemon', 'lime', 'berry', 'grape', 'melon', 'avocado'
        ]):
            return GroceryCategory.PRODUCE

        # Dairy
        if any(word in name_lower for word in [
            'milk', 'cheese', 'butter', 'cream', 'yogurt', 'sour cream',
            'cottage cheese', 'mozzarella', 'parmesan', 'cheddar'
        ]):
            return GroceryCategory.DAIRY

        # Spices (check before Protein so "ground ginger" doesn't match "ground beef")
        if any(word in name_lower for word in [
            'salt', 'cumin', 'paprika', 'oregano', 'basil', 'thyme',
            'rosemary', 'cinnamon', 'nutmeg', 'ginger', 'turmeric', 'chili',
            'cayenne', 'parsley', 'cilantro', 'dill', 'sage', 'bay leaf',
            'clove', 'allspice', 'cardamom', 'coriander', 'fennel seed',
            'curry powder', 'garlic powder', 'onion powder', 'seasoning',
            'black pepper', 'white pepper', 'red pepper flake'
        ]):
            return GroceryCategory.SPICES

        # Condiments (check before Protein so "fish sauce" matches "sauce" not "fish")
        if any(word in name_lower for word in [
            'sauce', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'vinegar',
            'oil', 'olive oil', 'vegetable oil', 'soy sauce', 'hot sauce',
            'salsa', 'dressing', 'honey', 'syrup', 'jam', 'jelly', 'peanut butter'
        ]):
            return GroceryCategory.CONDIMENTS

        # Protein
        if any(word in name_lower for word in [
            'chicken', 'beef', 'pork', 'turkey', 'fish', 'salmon', 'tuna',
            'shrimp', 'egg', 'tofu', 'tempeh', 'bacon', 'sausage', 'lamb',
            'steak', 'ground beef', 'ground turkey', 'ground pork', 'ground chicken',
            'breast', 'thigh', 'drumstick', 'mince'
        ]):
            return GroceryCategory.PROTEIN

        # Grains
        if any(word in name_lower for word in [
            'bread', 'pasta', 'rice', 'flour', 'oats', 'quinoa', 'barley',
            'cereal', 'tortilla', 'noodle', 'couscous', 'bagel', 'roll'
        ]):
            return GroceryCategory.GRAINS

        # Beverages
        if any(word in name_lower for word in [
            'juice', 'coffee', 'tea', 'soda', 'water', 'wine', 'beer', 'liquor',
            'broth', 'stock', 'drink'
        ]):
            return GroceryCategory.BEVERAGES

        # Frozen
        if 'frozen' in name_lower or any(word in name_lower for word in [
            'ice cream', 'popsicle', 'frozen'
        ]):
            return GroceryCategory.FROZEN

        # Pantry staples
        if any(word in name_lower for word in [
            'sugar', 'baking powder', 'baking soda', 'yeast', 'vanilla',
            'chocolate', 'beans', 'lentils', 'chickpeas', 'canned', 'corn', 'peas'
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
