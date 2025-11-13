from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from typing import List, Optional
from app.schemas.recipe import (
    RecipeCreate, RecipeUpdate, RecipeResponse, RecipeFeedFilter,
    DifficultyLevel, MealType
)
from app.schemas.user import UserResponse
from app.services.recipe_service import recipe_service
from app.services.s3_service import s3_service
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/api/recipes", tags=["Recipes"])


@router.post("/", response_model=RecipeResponse)
async def create_recipe(
    recipe_data: RecipeCreate,
    current_user: Optional[UserResponse] = Depends(get_current_active_user)
):
    """
    Create a new recipe.

    Requires authentication. The recipe will be associated with the current user.
    """
    user_id = current_user.id if current_user else "anonymous"
    return await recipe_service.create_recipe(recipe_data, user_id)


@router.get("/feed", response_model=List[RecipeResponse])
async def get_recipe_feed(
    cuisine_type: Optional[str] = Query(None, description="Filter by cuisine type"),
    difficulty: Optional[DifficultyLevel] = Query(None, description="Filter by difficulty level"),
    max_prep_time: Optional[int] = Query(None, description="Maximum prep time in minutes"),
    meal_type: Optional[MealType] = Query(None, description="Filter by meal type"),
    dietary_tags: Optional[List[str]] = Query(None, description="Filter by dietary tags"),
    use_pantry_items: bool = Query(False, description="Prioritize recipes using pantry items"),
    limit: int = Query(20, ge=1, le=100, description="Number of recipes to return"),
    offset: int = Query(0, ge=0, description="Number of recipes to skip"),
    current_user: Optional[UserResponse] = Depends(get_current_active_user)
):
    """
    Get paginated recipe feed with optional filters.
    
    If authenticated, includes user-specific data like likes and saves.
    """
    filters = RecipeFeedFilter(
        cuisine_type=cuisine_type,
        difficulty=difficulty,
        max_prep_time=max_prep_time,
        meal_type=meal_type,
        dietary_tags=dietary_tags,
        use_pantry_items=use_pantry_items,
        limit=limit,
        offset=offset
    )
    
    user_id = current_user.id if current_user else None
    return await recipe_service.get_recipe_feed(filters, user_id)


@router.get("/{recipe_id}", response_model=RecipeResponse)
async def get_recipe(
    recipe_id: str,
    current_user: Optional[UserResponse] = Depends(get_current_active_user)
):
    """
    Get a specific recipe by ID.
    
    If authenticated, includes user-specific data like likes and saves.
    """
    user_id = current_user.id if current_user else None
    return await recipe_service.get_recipe_by_id(recipe_id, user_id)


@router.put("/{recipe_id}", response_model=RecipeResponse)
async def update_recipe(
    recipe_id: str,
    recipe_data: RecipeUpdate,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Update a recipe.
    
    Only the recipe creator can update their own recipes.
    """
    return await recipe_service.update_recipe(recipe_id, recipe_data, current_user.id)


@router.delete("/{recipe_id}")
async def delete_recipe(
    recipe_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Delete a recipe.
    
    Only the recipe creator can delete their own recipes.
    """
    await recipe_service.delete_recipe(recipe_id, current_user.id)
    return {"message": "Recipe deleted successfully"}


@router.post("/{recipe_id}/like")
async def like_recipe(
    recipe_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Like a recipe.
    
    Requires authentication. Cannot like the same recipe twice.
    """
    await recipe_service.like_recipe(recipe_id, current_user.id)
    return {"message": "Recipe liked successfully"}


@router.delete("/{recipe_id}/like")
async def unlike_recipe(
    recipe_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Remove like from a recipe.
    
    Requires authentication.
    """
    await recipe_service.unlike_recipe(recipe_id, current_user.id)
    return {"message": "Recipe unliked successfully"}


@router.post("/{recipe_id}/save")
async def save_recipe(
    recipe_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Save a recipe to user's collection.
    
    Requires authentication. Cannot save the same recipe twice.
    """
    await recipe_service.save_recipe(recipe_id, current_user.id)
    return {"message": "Recipe saved successfully"}


@router.delete("/{recipe_id}/save")
async def unsave_recipe(
    recipe_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Remove recipe from user's saved collection.
    
    Requires authentication.
    """
    await recipe_service.unsave_recipe(recipe_id, current_user.id)
    return {"message": "Recipe removed from saved collection"}


@router.get("/user/{user_id}", response_model=List[RecipeResponse])
async def get_user_recipes(
    user_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: Optional[UserResponse] = Depends(get_current_active_user)
):
    """
    Get recipes created by a specific user.
    
    Public endpoint - no authentication required.
    """
    return await recipe_service.get_user_recipes(user_id, limit, offset)


@router.get("/saved/my", response_model=List[RecipeResponse])
async def get_my_saved_recipes(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Get recipes saved by the current user.
    
    Requires authentication.
    """
    return await recipe_service.get_saved_recipes(current_user.id, limit, offset)


@router.post("/upload-image")
async def upload_recipe_image(
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Upload a recipe image to S3.
    
    Returns the public URL of the uploaded image.
    """
    image_url = await s3_service.upload_recipe_image(file, current_user.id)
    return {"image_url": image_url}


@router.get("/upload-url")
async def get_presigned_upload_url(
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Get a presigned URL for direct client-side image upload to S3.
    
    This allows the frontend to upload images directly to S3 without going through the backend.
    """
    presigned_data = s3_service.get_presigned_upload_url(current_user.id, "recipe")
    return presigned_data