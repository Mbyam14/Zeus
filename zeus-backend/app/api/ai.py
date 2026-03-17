import asyncio
from fastapi import APIRouter, Depends, HTTPException, status, Body
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field
from app.schemas.recipe import AIRecipeRequest, RecipeResponse
from app.schemas.meal_plan import AIMealPlanRequest
from app.schemas.user import UserResponse
from app.services.ai_service import ai_service
from app.utils.dependencies import get_current_active_user
from app.database import get_database
import logging

logger = logging.getLogger(__name__)

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


class AskAIRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000, description="User's question or prompt")


@router.post("/ask")
async def ask_ai(
    request: AskAIRequest,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Ask Claude a free-form cooking/food question with context from the user's
    pantry, dietary preferences, and recipe history.

    Examples:
    - "What should I make for dinner tonight?"
    - "I have chicken and rice, what can I make?"
    - "Give me a high-protein snack idea"
    - "What can I make with what's in my pantry?"
    """
    if not ai_service.client:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI service not configured"
        )

    try:
        db = get_database()

        # Gather user context
        user_result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
        profile_data = user_result.data[0].get("profile_data", {}) if user_result.data else {}
        preferences = profile_data.get("preferences", {})

        # Get pantry items
        pantry_result = db.table("pantry_items").select(
            "item_name, quantity, unit, category"
        ).eq("user_id", current_user.id).execute()
        pantry_items = pantry_result.data or []

        # Get recently liked recipes for taste context
        liked_result = db.table("recipe_likes").select("recipe_id").eq(
            "user_id", current_user.id
        ).limit(10).execute()
        liked_ids = [r["recipe_id"] for r in (liked_result.data or [])]

        liked_titles = []
        if liked_ids:
            liked_recipes = db.table("recipes").select("title, cuisine_type").in_(
                "id", liked_ids
            ).execute()
            liked_titles = [f"{r['title']} ({r.get('cuisine_type', '?')})" for r in (liked_recipes.data or [])]

        # Build context-rich prompt
        pantry_text = "None"
        if pantry_items:
            pantry_entries = []
            for item in pantry_items[:30]:
                entry = item.get("item_name", "")
                if item.get("quantity"):
                    entry += f" ({item['quantity']} {item.get('unit', '')})"
                pantry_entries.append(entry)
            pantry_text = ", ".join(pantry_entries)

        dietary = ", ".join(preferences.get("dietary_restrictions", [])) or "None"
        allergies = ", ".join(preferences.get("allergies", [])) or "None"
        cuisines = ", ".join(preferences.get("cuisine_preferences", [])) or "Any"
        skill = preferences.get("cooking_skill", "intermediate")
        household = preferences.get("household_size", 2)
        calorie_target = preferences.get("calorie_target") or "Not set"
        liked_text = ", ".join(liked_titles[:8]) if liked_titles else "None yet"

        system_prompt = f"""You are a helpful cooking assistant for a meal planning app called Zeus.
You have context about the user to give personalized advice.

USER CONTEXT:
- Pantry items: {pantry_text}
- Dietary restrictions: {dietary}
- Allergies: {allergies}
- Preferred cuisines: {cuisines}
- Cooking skill: {skill}
- Household size: {household} people
- Daily calorie target: {calorie_target}
- Recently liked recipes: {liked_text}

GUIDELINES:
- Give specific, actionable recipe ideas or cooking advice
- When suggesting recipes, mention which pantry items they'd use
- Respect dietary restrictions and allergies absolutely
- Keep responses concise but helpful (2-4 paragraphs max)
- If suggesting a recipe, include a brief ingredient list and quick instructions
- Format with clear sections using bold text and bullet points
- Don't use emojis excessively"""

        import asyncio
        loop = asyncio.get_event_loop()
        response_text = await asyncio.wait_for(
            loop.run_in_executor(
                ai_service.executor,
                ai_service._call_claude_sync,
                "claude-sonnet-4-5-20250929",
                1500,
                0.7,
                [
                    {"role": "user", "content": f"{system_prompt}\n\nUser's question: {request.message}"}
                ]
            ),
            timeout=30
        )

        return {
            "response": response_text,
            "context_used": {
                "pantry_items_count": len(pantry_items),
                "has_dietary_restrictions": bool(preferences.get("dietary_restrictions")),
                "has_liked_recipes": bool(liked_titles),
            }
        }

    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="AI response timed out. Please try again."
        )
    except Exception as e:
        logger.error(f"Ask AI failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get AI response. Please try again."
        )
