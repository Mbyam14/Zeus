from typing import List, Optional
from fastapi import HTTPException, status
import logging
from app.database import get_database

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
        recipe_record = {
            "user_id": user_id,
            "title": recipe_data.title,
            "description": recipe_data.description,
            "image_url": recipe_data.image_url,
            "ingredients": [ing.dict() for ing in recipe_data.ingredients],
            "instructions": [inst.dict() for inst in recipe_data.instructions],
            "servings": recipe_data.servings,
            "prep_time": recipe_data.prep_time,
            "cook_time": recipe_data.cook_time,
            "cuisine_type": recipe_data.cuisine_type,
            "difficulty": recipe_data.difficulty.value,
            "meal_type": [mt.value for mt in recipe_data.meal_type],
            "dietary_tags": recipe_data.dietary_tags,
            "is_ai_generated": False,
            "likes_count": 0
        }
        
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
        if recipe_data.dietary_tags is not None:
            update_data["dietary_tags"] = recipe_data.dietary_tags
        if recipe_data.image_url is not None:
            update_data["image_url"] = recipe_data.image_url
        
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
        if filters.max_prep_time:
            query = query.lte("prep_time", filters.max_prep_time)
        if filters.meal_type:
            query = query.contains("meal_type", [filters.meal_type.value])
        if filters.dietary_tags:
            # Use contains (ALL tags must match) for dietary restriction filtering
            query = query.contains("dietary_tags", filters.dietary_tags)
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

            # Filter to recipes where most non-trivial ingredients are in pantry
            PANTRY_THRESHOLD = 0.9
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
            # Normal mode: fetch with shuffle/pagination as before
            if filters.offset == 0:
                pool_size = min(filters.limit * 4, 500)
                query = query.order("likes_count", desc=True)
                query = query.range(0, pool_size - 1)
                result = query.execute()

                import random
                data = result.data or []
                random.shuffle(data)
                data = data[:filters.limit]
            else:
                query = query.order("id")
                query = query.range(filters.offset, filters.offset + filters.limit - 1)
                result = query.execute()
                data = result.data or []

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
    
    async def like_recipe(self, recipe_id: str, user_id: str) -> bool:
        """Like a recipe"""
        # Check if recipe exists
        recipe_exists = self.db.table("recipes").select("id").eq("id", recipe_id).execute()
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
        
        return bool(result.data)
    
    async def unlike_recipe(self, recipe_id: str, user_id: str) -> bool:
        """Unlike a recipe"""
        result = self.db.table("recipe_likes").delete().eq("user_id", user_id).eq("recipe_id", recipe_id).execute()
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