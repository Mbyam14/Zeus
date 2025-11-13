from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, Optional
from app.schemas.recipe import AIRecipeRequest, RecipeResponse
from app.schemas.meal_plan import AIMealPlanRequest
from app.schemas.user import UserResponse
from app.services.ai_service import ai_service
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/api/ai", tags=["AI Features"])


@router.post("/generate-recipe", response_model=RecipeResponse)
async def generate_recipe(
    request: AIRecipeRequest,
    current_user: Optional[UserResponse] = Depends(get_current_active_user)
):
    """
    Generate a recipe using AI based on user preferences and pantry items.

    The AI will consider:
    - Available pantry items
    - Dietary restrictions
    - Cuisine preferences
    - Cooking skill level
    - Time constraints
    - Serving size requirements

    The generated recipe will be saved to the user's recipes and marked as AI-generated.
    """
    user_id = current_user.id if current_user else "anonymous"
    return await ai_service.generate_recipe(request, user_id)


@router.post("/generate-meal-plan")
async def generate_meal_plan(
    request: AIMealPlanRequest,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Generate a weekly meal plan using AI based on user preferences.
    
    The AI will create:
    - A complete weekly meal plan
    - A comprehensive grocery list
    - Meal prep tips and suggestions
    
    The response includes suggested recipes that can be saved individually.
    """
    return await ai_service.generate_meal_plan(request, current_user.id)


@router.post("/recipe-suggestions")
async def get_recipe_suggestions(
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Get personalized recipe suggestions based on:
    - User's pantry items
    - Past recipe preferences
    - Dietary restrictions from profile
    - Current trending recipes
    
    Returns a list of suggested recipes without creating them.
    """
    # This could be implemented to analyze user's pantry and suggest existing recipes
    # or generate quick AI suggestions without full recipe creation
    
    return {
        "message": "Recipe suggestions feature coming soon!",
        "suggestions": [
            {
                "title": "Quick Pasta with Pantry Ingredients",
                "reason": "Based on your available ingredients",
                "confidence": 0.85
            },
            {
                "title": "30-Minute Stir Fry",
                "reason": "Matches your cooking skill level",
                "confidence": 0.78
            }
        ]
    }