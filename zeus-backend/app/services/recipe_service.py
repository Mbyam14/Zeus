from typing import List, Optional
from fastapi import HTTPException, status
import logging
from app.database import get_database
from app.utils.dietary_detection import detect_dietary_tags
from app.utils.cooking_method_detection import detect_all_tags
from app.utils.cuisine_detection import detect_cuisine
from app.services.nutrition_calculator import calculate_recipe_nutrition

logger = logging.getLogger(__name__)
from app.schemas.recipe import (
    RecipeCreate, RecipeUpdate, RecipeResponse, RecipeFeedFilter, 
    RecipeInteraction, Ingredient, Instruction
)
from datetime import datetime, timedelta


class RecipeService:
    def __init__(self):
        self.db = get_database()
    
    async def create_recipe(self, recipe_data: RecipeCreate, user_id: str) -> RecipeResponse:
        """Create a new recipe"""
        ingredients_raw = [ing.dict() for ing in recipe_data.ingredients]
        auto_tags = detect_dietary_tags(ingredients_raw)
        # Merge auto-detected tags with any manually supplied tags (deduplicated)
        combined_tags = list(set(auto_tags) | set(recipe_data.dietary_tags or []))

        # Default meal_type to ["Dinner"] when omitted so the recipe is visible
        # in meal-type-filtered queries (which use `contains` and fail on []).
        meal_types = [mt.value for mt in recipe_data.meal_type]
        if not meal_types:
            meal_types = ["Dinner"]

        # USDA-based per-serving macros. May return None when coverage is too
        # low — in that case macros stay NULL (signals "not enough data" to UI).
        nutrition = calculate_recipe_nutrition(
            ingredients_raw,
            servings=recipe_data.servings,
        )

        # Cooking method, time, and style tags. Same uniform pipeline that runs
        # on every recipe — user, AI, imported — so output is consistent.
        instructions_raw = [inst.dict() for inst in recipe_data.instructions]
        method_tags = detect_all_tags(
            title=recipe_data.title,
            instructions=instructions_raw,
            prep_time=recipe_data.prep_time,
            cook_time=recipe_data.cook_time,
            difficulty=recipe_data.difficulty.value,
            meal_type=meal_types,
            description=recipe_data.description,
        )

        # Auto-detect cuisine if user didn't supply one.
        cuisine = recipe_data.cuisine_type
        if not cuisine:
            cuisine = detect_cuisine(recipe_data.title, ingredients_raw)

        recipe_record = {
            "user_id": user_id,
            "title": recipe_data.title,
            "description": recipe_data.description,
            "image_url": recipe_data.image_url,
            "ingredients": ingredients_raw,
            "instructions": instructions_raw,
            "servings": recipe_data.servings,
            "prep_time": recipe_data.prep_time,
            "cook_time": recipe_data.cook_time,
            "cuisine_type": cuisine,
            "difficulty": recipe_data.difficulty.value,
            "meal_type": meal_types,
            "dietary_tags": combined_tags,
            "cooking_method": method_tags["cooking_method"],
            "time_tags":      method_tags["time_tags"],
            "style_tags":     method_tags["style_tags"],
            "is_ai_generated": False,
            "likes_count": 0,
        }
        if nutrition:
            recipe_record["calories"]      = nutrition["calories"]
            recipe_record["protein_grams"] = nutrition["protein_grams"]
            recipe_record["carbs_grams"]   = nutrition["carbs_grams"]
            recipe_record["fat_grams"]     = nutrition["fat_grams"]

        result = self.db.table("recipes").insert(recipe_record).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create recipe"
            )

        created_recipe = result.data[0]
        return await self._format_recipe_response(created_recipe)
    
    async def get_recipe_by_id(self, recipe_id: str, user_id: Optional[str] = None) -> RecipeResponse:
        """Get a recipe by ID with optional user context for likes/saves"""
        recipe_query = self.db.table("recipes").select("""
            *,
            users!recipes_user_id_fkey(username)
        """).eq("id", recipe_id)
        
        result = recipe_query.execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found"
            )
        
        recipe = result.data[0]
        recipe_response = await self._format_recipe_response(recipe)

        # Add user context if provided
        if user_id:
            recipe_response.is_liked = await self._is_recipe_liked(recipe_id, user_id)
            recipe_response.is_saved = await self._is_recipe_saved(recipe_id, user_id)

        return recipe_response

    async def get_recipes_batch(self, recipe_ids: List[str], user_id: Optional[str] = None) -> List[RecipeResponse]:
        """
        Get multiple recipes by IDs in a single database query.

        This is much more efficient than fetching recipes one by one.
        """
        if not recipe_ids:
            return []

        # Remove duplicates while preserving order
        seen = set()
        unique_ids = []
        for rid in recipe_ids:
            if rid not in seen:
                seen.add(rid)
                unique_ids.append(rid)

        # Fetch all recipes in one query
        result = self.db.table("recipes").select("""
            *,
            users!recipes_user_id_fkey(username)
        """).in_("id", unique_ids).execute()

        if not result.data:
            return []

        # Build a map for quick lookup
        recipes_map = {}
        for recipe_data in result.data:
            recipes_map[recipe_data["id"]] = recipe_data

        # Get user likes/saves in batch if user_id provided
        liked_ids = set()
        saved_ids = set()
        if user_id:
            likes_result = self.db.table("recipe_likes").select("recipe_id").eq("user_id", user_id).in_("recipe_id", unique_ids).execute()
            liked_ids = {like["recipe_id"] for like in likes_result.data}

            saves_result = self.db.table("recipe_saves").select("recipe_id").eq("user_id", user_id).in_("recipe_id", unique_ids).execute()
            saved_ids = {save["recipe_id"] for save in saves_result.data}

        # Format responses in the original order
        recipes = []
        for recipe_id in unique_ids:
            if recipe_id in recipes_map:
                recipe_response = await self._format_recipe_response(recipes_map[recipe_id])
                if user_id:
                    recipe_response.is_liked = recipe_id in liked_ids
                    recipe_response.is_saved = recipe_id in saved_ids
                recipes.append(recipe_response)

        return recipes

    async def update_recipe(self, recipe_id: str, recipe_data: RecipeUpdate, user_id: str) -> RecipeResponse:
        """Update a recipe (only by owner)"""
        # Check if recipe exists and user owns it
        existing_recipe = self.db.table("recipes").select("*").eq("id", recipe_id).eq("user_id", user_id).execute()
        
        if not existing_recipe.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found or you don't have permission to edit it"
            )
        
        # Prepare update data
        update_data = {}
        if recipe_data.title is not None:
            update_data["title"] = recipe_data.title
        if recipe_data.description is not None:
            update_data["description"] = recipe_data.description
        if recipe_data.ingredients is not None:
            update_data["ingredients"] = [ing.dict() for ing in recipe_data.ingredients]
        if recipe_data.instructions is not None:
            update_data["instructions"] = [inst.dict() for inst in recipe_data.instructions]
        if recipe_data.servings is not None:
            update_data["servings"] = recipe_data.servings
        if recipe_data.prep_time is not None:
            update_data["prep_time"] = recipe_data.prep_time
        if recipe_data.cook_time is not None:
            update_data["cook_time"] = recipe_data.cook_time
        if recipe_data.cuisine_type is not None:
            update_data["cuisine_type"] = recipe_data.cuisine_type
        if recipe_data.difficulty is not None:
            update_data["difficulty"] = recipe_data.difficulty.value
        if recipe_data.meal_type is not None:
            update_data["meal_type"] = [mt.value for mt in recipe_data.meal_type]
        if recipe_data.image_url is not None:
            update_data["image_url"] = recipe_data.image_url

        # Re-run dietary detection whenever ingredients change, merging with any
        # explicitly supplied dietary_tags from the request.
        ingredients_for_detection = (
            update_data.get("ingredients")
            or existing_recipe.data[0].get("ingredients")
            or []
        )
        auto_tags = detect_dietary_tags(ingredients_for_detection)
        explicit_tags = (
            recipe_data.dietary_tags
            if recipe_data.dietary_tags is not None
            else existing_recipe.data[0].get("dietary_tags") or []
        )
        update_data["dietary_tags"] = list(set(auto_tags) | set(explicit_tags))

        # Recalculate macros + method/time/style tags whenever inputs change.
        if (recipe_data.ingredients is not None
                or recipe_data.servings is not None
                or recipe_data.instructions is not None
                or recipe_data.title is not None
                or recipe_data.prep_time is not None
                or recipe_data.cook_time is not None
                or recipe_data.difficulty is not None
                or recipe_data.meal_type is not None):
            servings_for_calc = (
                update_data.get("servings")
                or existing_recipe.data[0].get("servings")
                or 4
            )
            nutrition = calculate_recipe_nutrition(
                ingredients_for_detection,
                servings=servings_for_calc,
                recipe_id=recipe_id,
            )
            # Clear stale macros either way; only repopulate if calc succeeded.
            update_data["calories"]      = nutrition["calories"]      if nutrition else None
            update_data["protein_grams"] = nutrition["protein_grams"] if nutrition else None
            update_data["carbs_grams"]   = nutrition["carbs_grams"]   if nutrition else None
            update_data["fat_grams"]     = nutrition["fat_grams"]     if nutrition else None

            # Method / time / style tags
            existing = existing_recipe.data[0]
            method_tags = detect_all_tags(
                title       = update_data.get("title")       or existing.get("title") or "",
                instructions= update_data.get("instructions") or existing.get("instructions") or [],
                prep_time   = update_data.get("prep_time")    if "prep_time" in update_data else existing.get("prep_time"),
                cook_time   = update_data.get("cook_time")    if "cook_time" in update_data else existing.get("cook_time"),
                difficulty  = update_data.get("difficulty")   or existing.get("difficulty"),
                meal_type   = update_data.get("meal_type")    or existing.get("meal_type"),
                description = existing.get("description"),
            )
            update_data["cooking_method"] = method_tags["cooking_method"]
            update_data["time_tags"]      = method_tags["time_tags"]
            update_data["style_tags"]     = method_tags["style_tags"]

            # Re-detect cuisine if it wasn't explicitly set in this update
            if recipe_data.cuisine_type is None and not existing.get("cuisine_type"):
                detected_cuisine = detect_cuisine(
                    update_data.get("title") or existing.get("title") or "",
                    ingredients_for_detection,
                )
                if detected_cuisine:
                    update_data["cuisine_type"] = detected_cuisine
        
        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid fields to update"
            )
        
        result = self.db.table("recipes").update(update_data).eq("id", recipe_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update recipe"
            )
        
        updated_recipe = result.data[0]
        return await self._format_recipe_response(updated_recipe)
    
    async def delete_recipe(self, recipe_id: str, user_id: str) -> bool:
        """Delete a recipe (only by owner)"""
        # Check if recipe exists and user owns it
        existing_recipe = self.db.table("recipes").select("*").eq("id", recipe_id).eq("user_id", user_id).execute()
        
        if not existing_recipe.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found or you don't have permission to delete it"
            )
        
        result = self.db.table("recipes").delete().eq("id", recipe_id).execute()
        return True
    
    async def get_recipe_feed(self, filters: RecipeFeedFilter, user_id: Optional[str] = None) -> List[RecipeResponse]:
        """Get paginated recipe feed with filters"""

        # Auto-apply user's dietary restrictions from their profile preferences.
        # Merge with any explicit dietary_tags the frontend passed.
        user_dietary_tags: list = []
        user_allergies: list = []
        user_disliked: list = []
        if user_id:
            user_result = self.db.table("users").select("profile_data").eq("id", user_id).execute()
            if user_result.data:
                prefs = (user_result.data[0].get("profile_data") or {}).get("preferences") or {}
                user_dietary_tags = prefs.get("dietary_restrictions") or []
                user_allergies    = prefs.get("allergies") or []
                user_disliked     = prefs.get("disliked_ingredients") or []

        effective_dietary_tags = list(set(filters.dietary_tags or []) | set(user_dietary_tags))
        # Combine allergens and disliked ingredients into one avoidance list. Both
        # are filtered post-query by scanning ingredient names (Postgres can't
        # easily do this via PostgREST).
        avoid_terms = [t.lower() for t in (user_allergies + user_disliked) if t]

        # Pantry mode: fetch user's pantry and filter recipes by ingredient match
        # pantry_lookup = None means pantry mode is OFF
        # pantry_lookup = {} means pantry mode is ON but pantry is empty
        # pantry_lookup = {...} means pantry mode is ON with items
        pantry_lookup = None
        if filters.use_pantry_items and user_id:
            from app.utils.ingredient_matching import prepare_pantry_lookup, calculate_pantry_coverage
            pantry_result = self.db.table("pantry_items").select(
                "item_name, quantity, unit, category"
            ).eq("user_id", user_id).execute()
            pantry_items = pantry_result.data or []
            pantry_lookup = prepare_pantry_lookup(pantry_items)
            logger.info(f"Pantry mode: {len(pantry_lookup)} pantry items for filtering")

        query = self.db.table("recipes").select("""
            *,
            users!recipes_user_id_fkey(username)
        """)

        # Apply filters
        if filters.cuisine_type:
            query = query.eq("cuisine_type", filters.cuisine_type)
        if filters.difficulty:
            query = query.eq("difficulty", filters.difficulty.value)
        if filters.max_difficulty:
            # Filter to recipes at or below the max difficulty level
            difficulty_order = {"Easy": 1, "Medium": 2, "Hard": 3}
            max_level = difficulty_order.get(filters.max_difficulty.value, 3)
            allowed = [d for d, level in difficulty_order.items() if level <= max_level]
            query = query.in_("difficulty", allowed)
        if filters.max_prep_time:
            query = query.lte("prep_time", filters.max_prep_time)
        if filters.meal_type:
            query = query.contains("meal_type", [filters.meal_type.value])
        if effective_dietary_tags:
            # Use contains (ALL tags must match) for dietary restriction filtering
            query = query.contains("dietary_tags", effective_dietary_tags)
        # ANY-match (overlap) for the new multi-select tag dimensions
        if filters.cooking_methods:
            query = query.overlaps("cooking_method", filters.cooking_methods)
        if filters.style_tags:
            query = query.overlaps("style_tags", filters.style_tags)
        if filters.time_tags:
            query = query.overlaps("time_tags", filters.time_tags)
        if filters.search:
            query = query.ilike("title", f"%{filters.search}%")

        if pantry_lookup is not None:
            # Pantry mode active — if pantry is empty, return nothing
            if len(pantry_lookup) == 0:
                logger.info("Pantry mode: no pantry items, returning empty results")
                return []

            # Fetch a large pool to filter down from
            query = query.order("likes_count", desc=True)
            query = query.range(0, 499)
            result = query.execute()
            data = result.data or []

            # Filter to recipes where at least 60% of non-trivial ingredients are in pantry
            PANTRY_THRESHOLD = 0.6
            pantry_matched = []
            for recipe_data in data:
                ingredients = recipe_data.get("ingredients") or []
                if not ingredients:
                    continue
                coverage, matched, total = calculate_pantry_coverage(
                    ingredients, pantry_lookup
                )
                if total > 0 and coverage >= PANTRY_THRESHOLD:
                    recipe_data["_pantry_coverage"] = round(coverage * 100)
                    pantry_matched.append(recipe_data)

            # Sort by coverage descending — best matches first
            pantry_matched.sort(key=lambda r: r.get("_pantry_coverage", 0), reverse=True)

            logger.info(f"Pantry mode: {len(pantry_matched)} recipes >= {int(PANTRY_THRESHOLD*100)}% pantry coverage (from {len(data)} total)")

            # Apply pagination to filtered results
            import random
            if filters.offset == 0:
                random.shuffle(pantry_matched)
            data = pantry_matched[filters.offset:filters.offset + filters.limit]
        else:
            import random
            from datetime import date

            daily_seed = int(date.today().strftime("%Y%m%d"))
            rng = random.Random(daily_seed)

            PRACTICAL_TYPES = {"breakfast", "lunch", "dinner", "snack"}

            def meal_tier(r: dict) -> str:
                """Classify a recipe as 'practical', 'sides', or 'dessert'."""
                types = [t.lower() for t in (r.get("meal_type") or [])]
                if not types or any(t in PRACTICAL_TYPES for t in types):
                    return "practical"
                if "dessert" in types:
                    return "dessert"
                return "sides"  # Sides, Bread, etc.

            def balance_feed(pool: list, practical_ratio: int, sides_ratio: int) -> list:
                """
                Reorder pool so:
                  - 1 dessert per `practical_ratio` practicals  (default 1-in-10)
                  - 1 sides per `sides_ratio` practicals         (default 1-in-15)
                Practical meals (Breakfast/Lunch/Dinner/Snack) fill the rest.
                """
                practical = [r for r in pool if meal_tier(r) == "practical"]
                desserts  = [r for r in pool if meal_tier(r) == "dessert"]
                sides     = [r for r in pool if meal_tier(r) == "sides"]

                balanced: list = []
                pi, di, si = 0, 0, 0
                while pi < len(practical) or di < len(desserts) or si < len(sides):
                    for _ in range(practical_ratio):
                        if pi < len(practical):
                            balanced.append(practical[pi]); pi += 1
                    if di < len(desserts):
                        balanced.append(desserts[di]); di += 1
                    # sides appear less often than desserts
                    if si < len(sides) and (pi % sides_ratio == 0 or pi >= len(practical)):
                        balanced.append(sides[si]); si += 1
                return balanced

            # Keep old name as alias so existing call-sites still work
            def interleave_desserts(pool: list, practical_ratio: int) -> list:
                return balance_feed(pool, practical_ratio, sides_ratio=15)

            # ── Popular (unfiltered) feed ────────────────────────────────────
            # Use a two-step query so the full recipe library (3 000+) is
            # available for shuffle, not just the first 500.
            # Step 1: lightweight ID + meal_type fetch of ALL matching records.
            # Step 2: full-data fetch for the 60-recipe page only.
            is_popular = (
                not filters.meal_type and not filters.cuisine_type
                and not filters.search and not effective_dietary_tags
                and not filters.difficulty and not filters.max_difficulty
                and not filters.cooking_methods
                and not filters.style_tags
                and not filters.time_tags
            )

            if is_popular:
                meta_result = self.db.table("recipes").select("id, meal_type").execute()
                all_meta = meta_result.data or []

                rng.shuffle(all_meta)

                # Cap desserts at 1-in-10: practical meals dominate the scroll
                all_meta = interleave_desserts(all_meta, 9)

                page_meta = all_meta[filters.offset:filters.offset + filters.limit]
                page_ids  = [r["id"] for r in page_meta]

                if not page_ids:
                    data = []
                else:
                    full_result = self.db.table("recipes").select("""
                        *,
                        users!recipes_user_id_fkey(username)
                    """).in_("id", page_ids).execute()
                    raw_map = {r["id"]: r for r in (full_result.data or [])}
                    # Restore page order — IN query doesn't guarantee it
                    data = [raw_map[rid] for rid in page_ids if rid in raw_map]

            # ── Filtered feed (meal type / cuisine / search / dietary) ───────
            else:
                pool_size = 500
                query = query.order("likes_count", desc=True)
                query = query.range(0, pool_size - 1)
                result = query.execute()
                data = result.data or []

                # Cuisine-preference boost
                if filters.cuisine_preferences:
                    preferred_lower = [c.lower() for c in filters.cuisine_preferences]
                    preferred = [r for r in data if (r.get("cuisine_type") or "").lower() in preferred_lower]
                    others    = [r for r in data if (r.get("cuisine_type") or "").lower() not in preferred_lower]
                    rng.shuffle(preferred)
                    rng.shuffle(others)
                    data = []
                    pi, oi = 0, 0
                    while pi < len(preferred) or oi < len(others):
                        for _ in range(2):
                            if pi < len(preferred):
                                data.append(preferred[pi]); pi += 1
                        if oi < len(others):
                            data.append(others[oi]); oi += 1
                else:
                    rng.shuffle(data)

                # Cap desserts in unfiltered-by-type views
                if not filters.meal_type:
                    data = interleave_desserts(data, 9)

                data = data[filters.offset:filters.offset + filters.limit]

        # Final pass: filter out recipes containing user's allergens / disliked
        # ingredients. Done in Python because PostgREST can't easily search
        # inside the ingredient JSONB by substring across multiple terms.
        if avoid_terms:
            def safe(recipe_data: dict) -> bool:
                names = " ".join(
                    (ing.get("name") or "").lower()
                    for ing in (recipe_data.get("ingredients") or [])
                )
                return not any(term in names for term in avoid_terms)
            data = [r for r in data if safe(r)]

        recipes = []
        for recipe_data in data:
            recipe_response = await self._format_recipe_response(recipe_data)
            recipes.append(recipe_response)

        # Batch fetch liked/saved status instead of N+1 queries
        if user_id and recipes:
            recipe_ids = [r.id for r in recipes]
            liked_result = self.db.table("recipe_likes").select("recipe_id").eq("user_id", user_id).in_("recipe_id", recipe_ids).execute()
            saved_result = self.db.table("recipe_saves").select("recipe_id").eq("user_id", user_id).in_("recipe_id", recipe_ids).execute()
            liked_ids = {r["recipe_id"] for r in liked_result.data}
            saved_ids = {r["recipe_id"] for r in saved_result.data}
            for recipe in recipes:
                recipe.is_liked = recipe.id in liked_ids
                recipe.is_saved = recipe.id in saved_ids

        return recipes

    # ─── Scenario-based collections (NYT-style discovery) ───────────────────
    #
    # Each collection is a named pre-built filter. Centralized here so the
    # frontend just passes a key — the rules below decide what "Quick Weeknight"
    # actually means in DB terms. User dietary restrictions are auto-applied
    # the same way they are in get_recipe_feed.

    COLLECTION_DEFINITIONS = {
        "quick_weeknight": {
            "time_tags_contain": ["weeknight"],
            "meal_type_in":      ["Breakfast", "Lunch", "Dinner", "Snack"],
        },
        "quick": {
            "time_tags_contain": ["quick"],
        },
        "one_pot": {
            "cooking_method_contain": ["one_pot"],
        },
        "sheet_pan": {
            "cooking_method_contain": ["sheet_pan"],
            "meal_type_in":           ["Lunch", "Dinner"],
        },
        "slow_cooker": {
            "cooking_method_contain": ["slow_cooker"],
        },
        "instant_pot": {
            "cooking_method_contain": ["instant_pot"],
        },
        "air_fryer": {
            "cooking_method_contain": ["air_fryer"],
        },
        "no_cook": {
            "cooking_method_contain": ["no_cook"],
        },
        "healthy_light": {
            "calories_lt":  500,
            "meal_type_in": ["Breakfast", "Lunch", "Dinner"],
        },
        "make_ahead": {
            "style_tags_contain": ["make_ahead"],
        },
        "meal_prep": {
            "style_tags_contain": ["meal_prep"],
        },
        "comfort_food": {
            "style_tags_contain": ["comfort_food"],
        },
        "family_favorites": {
            "order_by_likes": True,
            "min_likes": 1,
        },
    }

    async def get_collection(
        self,
        collection_key: str,
        user_id: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> List[RecipeResponse]:
        """
        Return recipes for a named scenario collection.
        Auto-applies the logged-in user's dietary_restrictions / allergies /
        disliked_ingredients (same rules as the main feed).
        """
        definition = self.COLLECTION_DEFINITIONS.get(collection_key)
        if not definition:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Unknown collection: {collection_key}",
            )

        # Pull user prefs the same way get_recipe_feed does
        user_dietary_tags: list = []
        user_allergies: list = []
        user_disliked: list = []
        if user_id:
            ures = self.db.table("users").select("profile_data").eq("id", user_id).execute()
            if ures.data:
                prefs = (ures.data[0].get("profile_data") or {}).get("preferences") or {}
                user_dietary_tags = prefs.get("dietary_restrictions") or []
                user_allergies    = prefs.get("allergies") or []
                user_disliked     = prefs.get("disliked_ingredients") or []

        query = self.db.table("recipes").select("""
            *,
            users!recipes_user_id_fkey(username)
        """)

        # Apply collection-specific filters
        if "time_tags_contain" in definition:
            query = query.contains("time_tags", definition["time_tags_contain"])
        if "cooking_method_contain" in definition:
            query = query.contains("cooking_method", definition["cooking_method_contain"])
        if "style_tags_contain" in definition:
            query = query.contains("style_tags", definition["style_tags_contain"])
        if "meal_type_in" in definition:
            # Postgres array overlap: any of these meal types matches
            query = query.overlaps("meal_type", definition["meal_type_in"])
        if "calories_lt" in definition:
            query = query.lt("calories", definition["calories_lt"])
            query = query.not_.is_("calories", "null")
        if "min_likes" in definition:
            query = query.gte("likes_count", definition["min_likes"])
        if user_dietary_tags:
            query = query.contains("dietary_tags", user_dietary_tags)

        # Order: by likes for "family_favorites", else fetch wider pool and shuffle
        if definition.get("order_by_likes"):
            query = query.order("likes_count", desc=True)
            query = query.range(offset, offset + limit - 1)
        else:
            # Wider pool so we can shuffle for variety, then page in Python.
            pool_size = max(limit * 5, 50)
            query = query.order("likes_count", desc=True)
            query = query.range(0, pool_size - 1)

        result = query.execute()
        data = result.data or []

        # Allergy / dislike filter (ingredient-name substring match)
        if user_allergies or user_disliked:
            avoid_terms = [t.lower() for t in (user_allergies + user_disliked) if t]
            def safe(recipe_data: dict) -> bool:
                names = " ".join(
                    (ing.get("name") or "").lower()
                    for ing in (recipe_data.get("ingredients") or [])
                )
                return not any(term in names for term in avoid_terms)
            data = [r for r in data if safe(r)]

        if not definition.get("order_by_likes"):
            import random
            from datetime import date
            rng = random.Random(int(date.today().strftime("%Y%m%d")) + hash(collection_key))
            rng.shuffle(data)
            data = data[offset:offset + limit]

        recipes = []
        for recipe_data in data:
            recipe_response = await self._format_recipe_response(recipe_data)
            recipes.append(recipe_response)

        # Attach is_liked/is_saved status (matches feed behavior)
        if user_id and recipes:
            recipe_ids = [r.id for r in recipes]
            liked = self.db.table("recipe_likes").select("recipe_id").eq("user_id", user_id).in_("recipe_id", recipe_ids).execute()
            saved = self.db.table("recipe_saves").select("recipe_id").eq("user_id", user_id).in_("recipe_id", recipe_ids).execute()
            liked_ids = {r["recipe_id"] for r in liked.data}
            saved_ids = {r["recipe_id"] for r in saved.data}
            for r in recipes:
                r.is_liked = r.id in liked_ids
                r.is_saved = r.id in saved_ids

        return recipes

    async def like_recipe(self, recipe_id: str, user_id: str) -> bool:
        """Like a recipe"""
        # Check if recipe exists (also gives us current likes_count for the counter update)
        recipe_exists = self.db.table("recipes").select("id, likes_count").eq("id", recipe_id).execute()
        if not recipe_exists.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found"
            )

        # Check if already liked
        existing_like = self.db.table("recipe_likes").select("*").eq("user_id", user_id).eq("recipe_id", recipe_id).execute()
        if existing_like.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Recipe already liked"
            )

        # Add like
        like_data = {"user_id": user_id, "recipe_id": recipe_id}
        result = self.db.table("recipe_likes").insert(like_data).execute()

        # Increment the counter on recipes. Done app-side (no DB triggers in this codebase).
        try:
            current = int(recipe_exists.data[0].get("likes_count") or 0)
            self.db.table("recipes").update({"likes_count": current + 1}).eq("id", recipe_id).execute()
        except Exception as exc:
            logger.warning(f"Failed to increment likes_count for {recipe_id}: {exc}")

        return bool(result.data)

    async def unlike_recipe(self, recipe_id: str, user_id: str) -> bool:
        """Unlike a recipe"""
        # Get current count so we can decrement safely (clamp at 0)
        recipe_row = self.db.table("recipes").select("likes_count").eq("id", recipe_id).execute()
        existing = self.db.table("recipe_likes").select("id").eq("user_id", user_id).eq("recipe_id", recipe_id).execute()

        self.db.table("recipe_likes").delete().eq("user_id", user_id).eq("recipe_id", recipe_id).execute()

        if recipe_row.data and existing.data:
            try:
                current = int(recipe_row.data[0].get("likes_count") or 0)
                new_count = max(current - 1, 0)
                self.db.table("recipes").update({"likes_count": new_count}).eq("id", recipe_id).execute()
            except Exception as exc:
                logger.warning(f"Failed to decrement likes_count for {recipe_id}: {exc}")
        return True
    
    async def save_recipe(self, recipe_id: str, user_id: str) -> bool:
        """Save a recipe"""
        # Check if recipe exists
        recipe_exists = self.db.table("recipes").select("id").eq("id", recipe_id).execute()
        if not recipe_exists.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found"
            )
        
        # Check if already saved
        existing_save = self.db.table("recipe_saves").select("*").eq("user_id", user_id).eq("recipe_id", recipe_id).execute()
        if existing_save.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Recipe already saved"
            )
        
        # Add save
        save_data = {"user_id": user_id, "recipe_id": recipe_id}
        result = self.db.table("recipe_saves").insert(save_data).execute()
        
        return bool(result.data)
    
    async def unsave_recipe(self, recipe_id: str, user_id: str) -> bool:
        """Unsave a recipe"""
        result = self.db.table("recipe_saves").delete().eq("user_id", user_id).eq("recipe_id", recipe_id).execute()
        return True
    
    async def get_user_recipes(
        self,
        user_id: str,
        limit: int = 20,
        offset: int = 0,
        search: Optional[str] = None,
        meal_type: Optional[str] = None
    ) -> List[RecipeResponse]:
        """
        Get recipes created by a user with optional search and filtering.

        Args:
            user_id: The user ID to get recipes for
            limit: Maximum number of recipes to return
            offset: Number of recipes to skip
            search: Search term to filter by title (case-insensitive)
            meal_type: Filter by meal type (breakfast, lunch, dinner)
        """
        query = self.db.table("recipes").select("""
            *,
            users!recipes_user_id_fkey(username)
        """).eq("user_id", user_id)

        # Apply search filter (case-insensitive title search)
        if search:
            query = query.ilike("title", f"%{search}%")

        # Apply meal type filter
        if meal_type:
            # meal_type is stored as an array, use contains to check if the array contains the value
            query = query.contains("meal_type", [meal_type.capitalize()])

        query = query.order("created_at", desc=True)
        query = query.range(offset, offset + limit - 1)
        result = query.execute()

        recipes = []
        for recipe_data in result.data:
            recipe_response = await self._format_recipe_response(recipe_data)
            recipes.append(recipe_response)

        return recipes
    
    async def get_saved_recipes(self, user_id: str, limit: int = 20, offset: int = 0) -> List[RecipeResponse]:
        """Get recipes saved by a user"""
        query = self.db.table("recipe_saves").select("""
            recipes!recipe_saves_recipe_id_fkey(*,
                users!recipes_user_id_fkey(username)
            )
        """).eq("user_id", user_id).order("created_at", desc=True)

        query = query.range(offset, offset + limit - 1)
        result = query.execute()

        recipes = []
        for save_data in result.data:
            recipe_data = save_data["recipes"]
            recipe_response = await self._format_recipe_response(recipe_data)
            recipe_response.is_saved = True
            recipes.append(recipe_response)

        return recipes

    async def get_liked_recipes(self, user_id: str, limit: int = 20, offset: int = 0) -> List[RecipeResponse]:
        """Get recipes liked by a user"""
        query = self.db.table("recipe_likes").select("""
            recipes!recipe_likes_recipe_id_fkey(*,
                users!recipes_user_id_fkey(username)
            )
        """).eq("user_id", user_id).order("created_at", desc=True)

        query = query.range(offset, offset + limit - 1)
        result = query.execute()

        recipes = []
        for like_data in result.data:
            recipe_data = like_data["recipes"]
            recipe_response = await self._format_recipe_response(recipe_data)
            recipe_response.is_liked = True
            recipes.append(recipe_response)

        return recipes

    async def _format_recipe_response(self, recipe_data: dict) -> RecipeResponse:
        """Format raw recipe data into RecipeResponse"""
        # Handle ingredients and instructions conversion
        ingredients = [Ingredient(**ing) for ing in recipe_data["ingredients"]]
        instructions = [Instruction(**inst) for inst in recipe_data["instructions"]]
        
        # Extract creator username if available
        creator_username = None
        if "users" in recipe_data and recipe_data["users"]:
            creator_username = recipe_data["users"]["username"]
        
        return RecipeResponse(
            id=recipe_data["id"],
            user_id=recipe_data["user_id"],
            title=recipe_data["title"],
            description=recipe_data.get("description"),
            image_url=recipe_data.get("image_url"),
            ingredients=ingredients,
            instructions=instructions,
            servings=recipe_data["servings"],
            prep_time=recipe_data.get("prep_time"),
            cook_time=recipe_data.get("cook_time"),
            cuisine_type=recipe_data.get("cuisine_type"),
            difficulty=recipe_data["difficulty"],
            meal_type=recipe_data.get("meal_type", []),
            dietary_tags=recipe_data.get("dietary_tags", []),
            is_ai_generated=recipe_data.get("is_ai_generated", False),
            likes_count=recipe_data.get("likes_count", 0),
            created_at=datetime.fromisoformat(recipe_data["created_at"].replace("Z", "+00:00")),
            creator_username=creator_username,
            calories=recipe_data.get("calories"),
            protein_grams=recipe_data.get("protein_grams"),
            carbs_grams=recipe_data.get("carbs_grams"),
            fat_grams=recipe_data.get("fat_grams"),
            serving_size=recipe_data.get("serving_size")
        )
    
    async def _is_recipe_liked(self, recipe_id: str, user_id: str) -> bool:
        """Check if user has liked a recipe"""
        result = self.db.table("recipe_likes").select("id").eq("user_id", user_id).eq("recipe_id", recipe_id).execute()
        return bool(result.data)
    
    async def _is_recipe_saved(self, recipe_id: str, user_id: str) -> bool:
        """Check if user has saved a recipe"""
        result = self.db.table("recipe_saves").select("id").eq("user_id", user_id).eq("recipe_id", recipe_id).execute()
        return bool(result.data)


# Global recipe service instance
recipe_service = RecipeService()