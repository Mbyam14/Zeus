from typing import List, Optional
from fastapi import HTTPException, status
from app.database import get_database
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
            query = query.overlaps("dietary_tags", filters.dietary_tags)
        
        # Order by creation date (newest first) and apply pagination
        query = query.order("created_at", desc=True)
        query = query.range(filters.offset, filters.offset + filters.limit - 1)
        
        result = query.execute()
        
        recipes = []
        for recipe_data in result.data:
            recipe_response = await self._format_recipe_response(recipe_data)
            
            # Add user context if provided
            if user_id:
                recipe_response.is_liked = await self._is_recipe_liked(recipe_response.id, user_id)
                recipe_response.is_saved = await self._is_recipe_saved(recipe_response.id, user_id)
            
            recipes.append(recipe_response)
        
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
    
    async def get_user_recipes(self, user_id: str, limit: int = 20, offset: int = 0) -> List[RecipeResponse]:
        """Get recipes created by a user"""
        query = self.db.table("recipes").select("""
            *,
            users!recipes_user_id_fkey(username)
        """).eq("user_id", user_id).order("created_at", desc=True)
        
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
            creator_username=creator_username
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