import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException, Request, status, Body
from slowapi import Limiter
from slowapi.util import get_remote_address
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field
from app.schemas.recipe import AIRecipeRequest, RecipeResponse
from app.schemas.meal_plan import AIMealPlanRequest
from app.schemas.user import UserResponse
from app.services.ai_service import ai_service
from app.utils.dependencies import get_current_active_user
from app.database import get_database
from app.config import settings
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["AI Features"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/generate-recipe", response_model=RecipeResponse)
@limiter.limit(settings.rate_limit_ai)
async def generate_recipe(
    request: Request,
    recipe_request: AIRecipeRequest,
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
    return await ai_service.generate_recipe(recipe_request, user_id)


@router.post("/generate-meal-plan")
@limiter.limit(settings.rate_limit_ai)
async def generate_meal_plan(
    request: Request,
    meal_plan_request: AIMealPlanRequest,
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
    return await ai_service.generate_meal_plan(meal_plan_request, current_user.id)


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
@limiter.limit(settings.rate_limit_ai)
async def ask_ai(
    request: Request,
    body: AskAIRequest,
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
                    {"role": "user", "content": f"{system_prompt}\n\nUser's question: {body.message}"}
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
        import traceback
        logger.error(f"Ask AI failed: {e}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get AI response. Please try again."
        )


# --- Smart AI Features ---

HAIKU_MODEL = "claude-haiku-4-5-20251001"
SONNET_MODEL = "claude-sonnet-4-5-20250929"


class SubstitutionRequest(BaseModel):
    recipe_id: str = Field(..., description="Recipe ID")
    ingredient_name: str = Field(..., description="Ingredient to substitute")
    reason: str = Field("", description="Why substituting (allergy, missing, preference)")


class CookTonightRequest(BaseModel):
    max_prep_time: Optional[int] = Field(None, description="Max prep time in minutes")
    meal_type: str = Field("Dinner", description="Meal type")


class CookingTipRequest(BaseModel):
    recipe_title: str = Field(..., description="Recipe name")
    step_number: int = Field(..., ge=1, description="Step number")
    step_text: str = Field(..., description="The instruction text")
    question: Optional[str] = Field(None, description="Specific question about this step")


@router.post("/substitutions")
@limiter.limit(settings.rate_limit_ai)
async def get_substitution(
    request: Request,
    body: SubstitutionRequest,
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get AI-powered ingredient substitution for a recipe.
    Uses Haiku for speed and cost efficiency.
    """
    from app.services.cache_service import cache, make_cache_key, hash_dict, TTL_AI_RESPONSE

    # Check cache
    cache_key = make_cache_key("substitution", body.recipe_id, body.ingredient_name)
    cached = cache.get(cache_key, TTL_AI_RESPONSE)
    if cached:
        return cached

    db = get_database()

    # Fetch recipe
    recipe_result = db.table("recipes").select(
        "title, ingredients, instructions"
    ).eq("id", body.recipe_id).execute()
    if not recipe_result.data:
        raise HTTPException(status_code=404, detail="Recipe not found")

    recipe = recipe_result.data[0]
    ingredients_text = json.dumps(recipe["ingredients"])

    # Get user dietary context
    user_result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
    prefs = (user_result.data[0].get("profile_data", {}).get("preferences", {}) if user_result.data else {})
    dietary = ", ".join(prefs.get("dietary_restrictions", [])) or "None"
    allergies = ", ".join(prefs.get("allergies", [])) or "None"

    prompt = f"""You are a cooking substitution expert. A user needs to replace an ingredient in a recipe.

Recipe: {recipe['title']}
All ingredients: {ingredients_text}
Ingredient to replace: {body.ingredient_name}
Reason: {body.reason or 'Not specified'}
Dietary restrictions: {dietary}
Allergies: {allergies}

Provide 2-3 substitution options. For each, explain:
1. The substitute ingredient (with quantity adjustment if needed)
2. How it affects the dish (taste, texture)
3. Any cooking adjustments needed

Respond in JSON: {{"substitutions": [{{"substitute": "...", "quantity": "...", "impact": "...", "adjustments": "..."}}]}}"""

    try:
        loop = asyncio.get_event_loop()
        response_text = await asyncio.wait_for(
            loop.run_in_executor(
                ai_service.executor,
                ai_service._call_claude_sync,
                HAIKU_MODEL, 500, 0.3,
                [{"role": "user", "content": prompt}]
            ),
            timeout=15
        )

        import re
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
        else:
            result = {"substitutions": [{"substitute": response_text, "quantity": "", "impact": "", "adjustments": ""}]}

        result["recipe_title"] = recipe["title"]
        result["original_ingredient"] = body.ingredient_name

        cache.set(cache_key, result, TTL_AI_RESPONSE)
        return result

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Request timed out")
    except Exception as e:
        logger.error(f"Substitution failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to get substitution")


@router.post("/cook-tonight")
@limiter.limit(settings.rate_limit_ai)
async def cook_tonight(
    request: Request,
    body: CookTonightRequest,
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get a personalized 'what to cook tonight' suggestion based on
    pantry items (prioritizing expiring items), preferences, and time constraints.
    Uses Sonnet for quality recommendations.
    """
    db = get_database()

    # Get pantry items, prioritize expiring
    pantry_result = db.table("pantry_items").select(
        "item_name, quantity, unit, category, expires_at"
    ).eq("user_id", current_user.id).order("expires_at", desc=False).limit(40).execute()
    pantry_items = pantry_result.data or []

    if not pantry_items:
        return {
            "suggestion": None,
            "message": "Add items to your pantry first so I can suggest what to cook!",
        }

    # Separate expiring items
    from datetime import datetime, timedelta
    expiring_soon = []
    other_items = []
    cutoff = (datetime.utcnow() + timedelta(days=3)).isoformat()
    for item in pantry_items:
        if item.get("expires_at") and item["expires_at"] <= cutoff:
            expiring_soon.append(item)
        else:
            other_items.append(item)

    # Get preferences
    user_result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
    prefs = (user_result.data[0].get("profile_data", {}).get("preferences", {}) if user_result.data else {})

    expiring_text = ", ".join(f"{i['item_name']} (expires {i.get('expires_at', '?')})" for i in expiring_soon[:10]) or "None"
    pantry_text = ", ".join(f"{i['item_name']}" for i in other_items[:20])
    dietary = ", ".join(prefs.get("dietary_restrictions", [])) or "None"
    skill = prefs.get("cooking_skill", "intermediate")
    household = prefs.get("household_size", 2)

    prompt = f"""You're a smart meal planner. Suggest ONE specific recipe for {body.meal_type.lower()} tonight.

EXPIRING SOON (use these first!): {expiring_text}
OTHER PANTRY ITEMS: {pantry_text}
Dietary restrictions: {dietary}
Cooking skill: {skill}
Household size: {household}
{"Max prep time: " + str(body.max_prep_time) + " minutes" if body.max_prep_time else ""}

Respond in JSON:
{{
  "recipe_title": "...",
  "why": "Brief explanation of why this recipe (mention expiring items used)",
  "pantry_items_used": ["item1", "item2"],
  "items_to_buy": ["item1"],
  "prep_time_minutes": 30,
  "calories_estimate": 500,
  "quick_instructions": ["Step 1...", "Step 2...", "Step 3..."]
}}"""

    try:
        loop = asyncio.get_event_loop()
        response_text = await asyncio.wait_for(
            loop.run_in_executor(
                ai_service.executor,
                ai_service._call_claude_sync,
                SONNET_MODEL, 800, 0.7,
                [{"role": "user", "content": prompt}]
            ),
            timeout=30
        )

        import re
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            suggestion = json.loads(json_match.group())
        else:
            suggestion = {"recipe_title": "Custom suggestion", "quick_instructions": [response_text]}

        suggestion["expiring_items_count"] = len(expiring_soon)
        return {"suggestion": suggestion, "message": None}

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Request timed out")
    except Exception as e:
        logger.error(f"Cook tonight failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to get suggestion")


@router.post("/cooking-tips")
@limiter.limit("20/minute")
async def get_cooking_tip(
    request: Request,
    body: CookingTipRequest,
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Get AI cooking guidance for a specific recipe step.
    Uses Haiku for speed — these should feel instant.
    """
    from app.services.cache_service import cache, make_cache_key, hash_dict, TTL_AI_RESPONSE

    cache_key = make_cache_key("tip", hash_dict({"title": body.recipe_title, "step": body.step_number, "q": body.question or ""}))
    cached = cache.get(cache_key, TTL_AI_RESPONSE)
    if cached:
        return cached

    question_text = body.question or "Explain this step in detail with tips for getting it right."

    prompt = f"""You're a patient cooking instructor helping someone cook "{body.recipe_title}".

They're on step {body.step_number}: "{body.step_text}"

Their question: {question_text}

Give a helpful, concise answer (2-3 short paragraphs max). Include:
- Practical tips for this specific step
- Common mistakes to avoid
- Visual/sensory cues to know when it's done right"""

    try:
        loop = asyncio.get_event_loop()
        response_text = await asyncio.wait_for(
            loop.run_in_executor(
                ai_service.executor,
                ai_service._call_claude_sync,
                HAIKU_MODEL, 400, 0.5,
                [{"role": "user", "content": prompt}]
            ),
            timeout=10
        )

        result = {
            "recipe_title": body.recipe_title,
            "step_number": body.step_number,
            "tip": response_text,
        }
        cache.set(cache_key, result, TTL_AI_RESPONSE)
        return result

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Request timed out")
    except Exception as e:
        logger.error(f"Cooking tip failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to get cooking tip")
