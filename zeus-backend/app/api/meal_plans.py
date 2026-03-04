from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas.meal_plan import AIMealPlanRequest, MealSlot
from app.schemas.recipe import RecipeCreate, RecipeResponse, Ingredient, Instruction, DifficultyLevel
from app.schemas.user import UserResponse
from app.utils.dependencies import get_current_active_user
from app.database import get_database
from app.services.ai_service import ai_service
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/meal-plans", tags=["Meal Plans"])


@router.post("/generate/")
async def generate_meal_plan(
    start_date: str,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Generate AI-powered weekly meal plan.

    Creates 21 complete recipes (breakfast, lunch, dinner for 7 days) based on
    user's pantry inventory and dietary preferences.
    """
    try:
        db = get_database()

        # Get user preferences
        user_result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
        profile_data = user_result.data[0].get("profile_data", {}) if user_result.data else {}
        preferences = profile_data.get("preferences", {})

        # Get pantry items
        pantry_result = db.table("pantry_items").select("*").eq("user_id", current_user.id).execute()
        pantry_items = [
            item["item_name"]
            for item in pantry_result.data
        ]

        # Build AI meal plan request
        from datetime import datetime as dt
        request = AIMealPlanRequest(
            meals_per_day=[MealSlot.BREAKFAST, MealSlot.LUNCH, MealSlot.DINNER],
            week_start_date=dt.fromisoformat(start_date).date(),
            dietary_preferences=preferences.get("dietary_restrictions", []),
            cuisine_preferences=preferences.get("cuisine_preferences", []),
            cooking_skill=preferences.get("cooking_skill", "intermediate"),
            pantry_items=pantry_items,
            servings_per_meal=preferences.get("household_size", 2),
            goals=["use-pantry-items"]
        )

        # Generate meal plan with AI
        logger.info(f"Generating meal plan for user {current_user.id} starting {start_date}")
        meal_plan_data = await ai_service.generate_meal_plan(request, current_user.id)

        # Extract meals from response
        # meal_plan_data = {"meal_plan": {"week_summary": {...}, "meals": {...}, "grocery_list": [...]}}
        meal_plan_response = meal_plan_data.get("meal_plan", {})
        meals_dict = meal_plan_response.get("meals", {})

        # Save recipes to database and build meal plan structure
        saved_recipes: Dict[str, Dict[str, str]] = {}
        days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

        for day in days:
            if day not in meals_dict:
                continue

            saved_recipes[day] = {}
            day_meals = meals_dict[day]

            for meal_type in ["breakfast", "lunch", "dinner"]:
                if meal_type not in day_meals or not day_meals[meal_type]:
                    continue

                recipe_data = day_meals[meal_type]

                # Ensure instructions have proper step numbers
                instructions = recipe_data.get("instructions", [])
                if instructions:
                    for i, instruction in enumerate(instructions):
                        if "step" not in instruction:
                            instruction["step"] = i + 1

                # Map difficulty to valid values (Easy, Medium, Hard)
                difficulty = recipe_data.get("difficulty", "Medium")
                if difficulty == "Intermediate":
                    difficulty = "Medium"
                elif difficulty not in ["Easy", "Medium", "Hard"]:
                    difficulty = "Medium"

                # Create recipe record (ingredients/instructions may be empty for simplified plans)
                recipe_record = {
                    "user_id": current_user.id,
                    "title": recipe_data["title"],
                    "description": recipe_data.get("description"),
                    "ingredients": recipe_data.get("ingredients", []),
                    "instructions": instructions,
                    "servings": recipe_data.get("servings", request.servings_per_meal),
                    "prep_time": recipe_data.get("prep_time"),
                    "cook_time": recipe_data.get("cook_time"),
                    "cuisine_type": recipe_data.get("cuisine_type"),
                    "difficulty": difficulty,
                    "meal_type": recipe_data.get("meal_type", [meal_type.capitalize()]),
                    "dietary_tags": recipe_data.get("dietary_tags", []),
                    "is_ai_generated": True,
                    "calories": recipe_data.get("calories"),
                    "protein_grams": recipe_data.get("protein_grams"),
                    "carbs_grams": recipe_data.get("carbs_grams"),
                    "fat_grams": recipe_data.get("fat_grams"),
                    "serving_size": recipe_data.get("serving_size")
                }

                recipe_result = db.table("recipes").insert(recipe_record).execute()
                recipe_id = recipe_result.data[0]["id"]
                saved_recipes[day][meal_type] = recipe_id

        # Save meal plan
        meal_plan_record = {
            "user_id": current_user.id,
            "plan_name": f"Meal Plan - Week of {start_date}",
            "week_start_date": start_date,
            "meals": saved_recipes
        }
        result = db.table("meal_plans").insert(meal_plan_record).execute()

        logger.info(f"Successfully created meal plan {result.data[0]['id']} with {len(saved_recipes)} days")

        return {
            "meal_plan_id": result.data[0]["id"],
            "meals": saved_recipes,
            "summary": meal_plan_response.get("week_summary", {}),
            "grocery_list": meal_plan_response.get("grocery_list", [])
        }

    except Exception as e:
        logger.error(f"Failed to generate meal plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate meal plan. Please try again."
        )


@router.get("/current/")
async def get_current_week_meal_plan(
    current_user: UserResponse = Depends(get_current_active_user)
) -> Optional[Dict[str, Any]]:
    """
    Get meal plan for the current week.

    Returns the most recent meal plan or null if none exists.
    """
    try:
        db = get_database()

        # Get most recent meal plan (by creation time, not start date)
        result = db.table("meal_plans")\
            .select("*")\
            .eq("user_id", current_user.id)\
            .order("created_at", desc=True)\
            .limit(1)\
            .execute()

        if not result.data:
            return None

        meal_plan = result.data[0]

        response_data = {
            "id": meal_plan["id"],
            "user_id": meal_plan["user_id"],
            "plan_name": meal_plan["plan_name"],
            "week_start_date": meal_plan["week_start_date"],
            "meals": meal_plan["meals"],
            "created_at": meal_plan["created_at"]
        }

        return response_data

    except Exception as e:
        logger.error(f"Failed to get current meal plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve meal plan"
        )


@router.get("/{meal_plan_id}/")
async def get_meal_plan(
    meal_plan_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Get a specific meal plan by ID.

    Verifies ownership before returning.
    """
    try:
        db = get_database()

        result = db.table("meal_plans")\
            .select("*")\
            .eq("id", meal_plan_id)\
            .eq("user_id", current_user.id)\
            .execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meal plan not found"
            )

        meal_plan = result.data[0]

        return {
            "id": meal_plan["id"],
            "user_id": meal_plan["user_id"],
            "plan_name": meal_plan["plan_name"],
            "week_start_date": meal_plan["week_start_date"],
            "meals": meal_plan["meals"],
            "created_at": meal_plan["created_at"]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get meal plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve meal plan"
        )


@router.post("/{meal_plan_id}/regenerate-meal/")
async def regenerate_single_meal(
    meal_plan_id: str,
    day: str,
    meal_type: str,
    current_user: UserResponse = Depends(get_current_active_user)
) -> RecipeResponse:
    """
    Regenerate a single meal in an existing meal plan.

    Generates a new AI recipe and updates the meal plan.
    """
    try:
        db = get_database()

        # Get meal plan and verify ownership
        mp_result = db.table("meal_plans")\
            .select("*")\
            .eq("id", meal_plan_id)\
            .eq("user_id", current_user.id)\
            .execute()

        if not mp_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meal plan not found"
            )

        meal_plan = mp_result.data[0]

        # Get user preferences
        user_result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
        profile_data = user_result.data[0].get("profile_data", {}) if user_result.data else {}
        preferences = profile_data.get("preferences", {})

        # Get pantry items
        pantry_result = db.table("pantry_items").select("*").eq("user_id", current_user.id).execute()
        pantry_items = [item["item_name"] for item in pantry_result.data]

        # Generate new recipe
        from app.schemas.recipe import AIRecipeRequest, MealType
        request = AIRecipeRequest(
            pantry_items=pantry_items,
            dietary_restrictions=preferences.get("dietary_restrictions", []),
            cooking_skill=preferences.get("cooking_skill", "intermediate"),
            servings=preferences.get("household_size", 2),
            meal_type=MealType(meal_type.capitalize()) if meal_type != "snack" else MealType.SNACK,
            additional_preferences=f"Generate a {meal_type} recipe for {day}. Make it different from other meals this week."
        )

        logger.info(f"Regenerating {meal_type} for {day} in meal plan {meal_plan_id}")
        new_recipe = await ai_service.generate_recipe(request, current_user.id)

        # Update meal plan
        meals = meal_plan["meals"]
        if day not in meals:
            meals[day] = {}
        meals[day][meal_type] = new_recipe.id

        db.table("meal_plans").update({"meals": meals}).eq("id", meal_plan_id).execute()

        logger.info(f"Successfully regenerated {meal_type} for {day}")

        return new_recipe

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to regenerate meal: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to regenerate meal. Please try again."
        )
