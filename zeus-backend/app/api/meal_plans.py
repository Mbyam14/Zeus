from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from app.schemas.meal_plan import AIMealPlanRequest, MealSlot
from app.schemas.recipe import RecipeCreate, RecipeResponse, Ingredient, Instruction, DifficultyLevel
from app.schemas.user import UserResponse
from app.utils.dependencies import get_current_active_user
from app.database import get_database
from app.services.ai_service import ai_service
from app.services.nutrition_service import nutrition_service
from app.services.meal_assignment_service import meal_assignment_service
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import logging
import json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/meal-plans", tags=["Meal Plans"])


@router.post("/generate/")
async def generate_meal_plan(
    start_date: str,
    selected_days: Optional[List[str]] = None,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Generate AI-powered meal plan for selected days.

    Creates recipes (breakfast, lunch, dinner) for the selected days based on
    user's pantry inventory and dietary preferences.

    Args:
        start_date: The start date of the meal plan (YYYY-MM-DD)
        selected_days: List of days to include (e.g., ["monday", "tuesday"]).
                       Defaults to all 7 days if not provided.
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

        # Normalize and validate selected_days
        all_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        if selected_days:
            normalized_days = [d.lower() for d in selected_days]
            # Validate days
            for d in normalized_days:
                if d not in all_days:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid day: {d}. Must be one of {all_days}"
                    )
        else:
            normalized_days = all_days

        request = AIMealPlanRequest(
            meals_per_day=[MealSlot.BREAKFAST, MealSlot.LUNCH, MealSlot.DINNER],
            week_start_date=dt.fromisoformat(start_date).date(),
            selected_days=normalized_days,
            dietary_preferences=preferences.get("dietary_restrictions", []),
            cuisine_preferences=preferences.get("cuisine_preferences", []),
            cooking_skill=preferences.get("cooking_skill", "intermediate"),
            pantry_items=pantry_items,
            servings_per_meal=preferences.get("household_size", 2),
            goals=["use-pantry-items"]
        )

        # Generate meal plan with AI (pass preferences for macro-aware generation)
        logger.info(f"Generating meal plan for user {current_user.id} starting {start_date}")
        logger.info(f"User calorie target: {preferences.get('calorie_target', 'not set')}, protein target: {preferences.get('protein_target_grams', 'not set')}")

        # Debug: Write preferences to file
        with open("debug_preferences.txt", "w") as f:
            f.write(f"Full preferences dict: {json.dumps(preferences, indent=2)}\n")
            f.write(f"calorie_target: {preferences.get('calorie_target')}\n")
            f.write(f"protein_target_grams: {preferences.get('protein_target_grams')}\n")
            f.write(f"meal_calorie_distribution: {preferences.get('meal_calorie_distribution')}\n")

        # Get batch cooking preferences
        cooking_sessions = preferences.get("cooking_sessions_per_week", 6)
        leftover_tolerance = preferences.get("leftover_tolerance", "moderate")

        logger.info(f"Batch cooking mode: {cooking_sessions} cooking sessions, {leftover_tolerance} leftover tolerance")

        meal_plan_data = await ai_service.generate_meal_plan(request, current_user.id, preferences)

        # Extract meals from response
        meal_plan_response = meal_plan_data.get("meal_plan", {})
        meals_dict = meal_plan_response.get("meals", {})

        # Write debug info to file
        with open("debug_meal_plan.txt", "w") as f:
            f.write(f"meal_plan_response keys: {list(meal_plan_response.keys())}\n")
            f.write(f"meals_dict keys: {list(meals_dict.keys())}\n")
            f.write(f"Batch cooking: {cooking_sessions} sessions, {leftover_tolerance} tolerance\n")
            f.write(f"Selected days: {normalized_days}\n")

        # Collect all recipes and DEDUPLICATE by title before saving
        # Use selected days instead of hardcoded 7 days
        days = normalized_days
        unique_recipes_by_title: Dict[str, Dict[str, Any]] = {}  # title -> recipe_data

        # First pass: collect unique recipes by title
        for day in days:
            if day not in meals_dict:
                continue

            day_meals = meals_dict[day]

            for meal_type in ["breakfast", "lunch", "dinner"]:
                if meal_type not in day_meals or not day_meals[meal_type]:
                    continue

                recipe_data = day_meals[meal_type]
                title = recipe_data.get("title", "").strip()

                # Skip if we already have this recipe (by title)
                if title in unique_recipes_by_title:
                    continue

                # Ensure instructions have proper step numbers
                instructions = recipe_data.get("instructions", [])
                if instructions:
                    for i, instruction in enumerate(instructions):
                        if "step" not in instruction:
                            instruction["step"] = i + 1

                # Map difficulty to valid values
                difficulty = recipe_data.get("difficulty", "Medium")
                if difficulty == "Intermediate":
                    difficulty = "Medium"
                elif difficulty not in ["Easy", "Medium", "Hard"]:
                    difficulty = "Medium"

                unique_recipes_by_title[title] = {
                    "user_id": current_user.id,
                    "title": title,
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

        logger.info(f"Found {len(unique_recipes_by_title)} unique recipes (deduplicated by title)")

        # Second pass: save unique recipes to database
        saved_recipe_records: List[Dict[str, Any]] = []
        title_to_id: Dict[str, str] = {}

        for title, recipe_record in unique_recipes_by_title.items():
            recipe_result = db.table("recipes").insert(recipe_record).execute()
            recipe_id = recipe_result.data[0]["id"]
            title_to_id[title] = recipe_id

            saved_recipe_records.append({
                "id": recipe_id,
                "title": title,
                "meal_type": recipe_record.get("meal_type", ["Dinner"])
            })

        logger.info(f"Saved {len(saved_recipe_records)} unique recipes to database")

        # Use MealAssignmentService to distribute recipes across slots with batch cooking logic
        assignments = meal_assignment_service.assign_meals_to_week(
            recipes=saved_recipe_records,
            cooking_sessions=cooking_sessions,
            leftover_tolerance=leftover_tolerance
        )

        # Convert assignments to final meal plan structure (new format with is_repeat, original_day)
        saved_recipes: Dict[str, Dict[str, Any]] = {}
        for day in days:
            if day in assignments:
                saved_recipes[day] = assignments[day]

        # Write saved recipes to file
        with open("debug_meal_plan.txt", "a") as f:
            f.write(f"Assigned {len(saved_recipes)} days using MealAssignmentService\n")
            f.write(f"saved_recipes structure:\n{json.dumps(saved_recipes, indent=2, default=str)}\n")

        # Save meal plan with selected_days metadata
        meal_plan_record = {
            "user_id": current_user.id,
            "plan_name": f"Meal Plan - {len(normalized_days)} days starting {start_date}",
            "week_start_date": start_date,
            "selected_days": normalized_days,
            "meals": saved_recipes
        }
        result = db.table("meal_plans").insert(meal_plan_record).execute()

        logger.info(f"Successfully created meal plan {result.data[0]['id']} with {len(saved_recipes)} days for {normalized_days}")

        return {
            "meal_plan_id": result.data[0]["id"],
            "selected_days": normalized_days,
            "meals": saved_recipes,
            "summary": meal_plan_response.get("week_summary", {}),
            "grocery_list": meal_plan_response.get("grocery_list", [])
        }

    except Exception as e:
        logger.error(f"Failed to generate meal plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate meal plan: {str(e)}"
        )


@router.post("/create-manual/")
async def create_manual_meal_plan(
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    selected_days: List[str] = Query(..., description="List of days to include"),
    meals: Dict[str, Any] = Body(..., description="Dictionary of meals"),
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Create a meal plan with manually selected recipes.

    Args:
        start_date: The start date of the meal plan (YYYY-MM-DD)
        selected_days: List of days included (e.g., ["monday", "tuesday"])
        meals: Dictionary of meals with recipe_ids for each day/meal_type
    """
    try:
        db = get_database()

        # Validate selected_days
        all_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        normalized_days = [d.lower() for d in selected_days]
        for d in normalized_days:
            if d not in all_days:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid day: {d}. Must be one of {all_days}"
                )

        # Check if a meal plan already exists for this week
        existing = db.table("meal_plans")\
            .select("id")\
            .eq("user_id", current_user.id)\
            .eq("week_start_date", start_date)\
            .execute()

        if existing.data:
            # Delete existing meal plan for this week
            logger.info(f"Deleting existing meal plan for week {start_date}")
            db.table("meal_plans").delete().eq("id", existing.data[0]["id"]).execute()

        # Create the meal plan
        meal_plan_record = {
            "user_id": current_user.id,
            "plan_name": f"Manual Meal Plan - {len(normalized_days)} days starting {start_date}",
            "week_start_date": start_date,
            "selected_days": normalized_days,
            "meals": meals
        }
        result = db.table("meal_plans").insert(meal_plan_record).execute()

        logger.info(f"Created manual meal plan {result.data[0]['id']} with {len(meals)} days")

        return {
            "id": result.data[0]["id"],
            "user_id": current_user.id,
            "plan_name": meal_plan_record["plan_name"],
            "week_start_date": start_date,
            "selected_days": normalized_days,
            "meals": meals,
            "created_at": result.data[0]["created_at"]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create manual meal plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create meal plan: {str(e)}"
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

        # Get selected_days with fallback to all 7 days for backwards compatibility
        all_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        selected_days = meal_plan.get("selected_days", all_days)

        response_data = {
            "id": meal_plan["id"],
            "user_id": meal_plan["user_id"],
            "plan_name": meal_plan["plan_name"],
            "week_start_date": meal_plan["week_start_date"],
            "selected_days": selected_days,
            "meals": meal_plan["meals"],
            "created_at": meal_plan["created_at"]
        }

        # Debug: Write response to file
        with open("debug_current_meal_plan.txt", "w") as f:
            f.write(f"Returning meal plan: {meal_plan['id']}\n")
            f.write(f"Number of days in meals: {len(meal_plan['meals'])}\n")
            f.write(f"Meals structure:\n{json.dumps(meal_plan['meals'], indent=2)}\n")

        return response_data

    except Exception as e:
        logger.error(f"Failed to get current meal plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve meal plan"
        )


def get_monday_of_week(date: datetime, week_offset: int = 0) -> str:
    """Get the Monday date for a given week offset from the provided date."""
    # Get the Monday of the current week
    days_since_monday = date.weekday()  # Monday = 0, Sunday = 6
    monday = date - timedelta(days=days_since_monday)
    # Apply week offset
    target_monday = monday + timedelta(weeks=week_offset)
    return target_monday.strftime("%Y-%m-%d")


@router.get("/week/{week_offset}")
async def get_meal_plan_by_week(
    week_offset: int,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Optional[Dict[str, Any]]:
    """
    Get meal plan for a specific week relative to current week.

    Args:
        week_offset: 0 = current week, 1 = next week, -1 = last week, etc.

    Returns meal plan if one exists for that week, otherwise null.
    """
    try:
        db = get_database()

        # Calculate the Monday of the target week
        target_monday = get_monday_of_week(datetime.now(), week_offset)
        logger.info(f"Looking for meal plan for week starting {target_monday}")

        # Find meal plan for that week
        result = db.table("meal_plans")\
            .select("*")\
            .eq("user_id", current_user.id)\
            .eq("week_start_date", target_monday)\
            .limit(1)\
            .execute()

        if not result.data:
            logger.info(f"No meal plan found for week {target_monday}")
            return None

        meal_plan = result.data[0]

        # Get selected_days with fallback to all 7 days for backwards compatibility
        all_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        selected_days_list = meal_plan.get("selected_days", all_days)

        return {
            "id": meal_plan["id"],
            "user_id": meal_plan["user_id"],
            "plan_name": meal_plan["plan_name"],
            "week_start_date": meal_plan["week_start_date"],
            "selected_days": selected_days_list,
            "meals": meal_plan["meals"],
            "created_at": meal_plan["created_at"]
        }

    except Exception as e:
        logger.error(f"Failed to get meal plan for week offset {week_offset}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve meal plan"
        )


@router.post("/generate/week/{week_offset}")
async def generate_meal_plan_for_week(
    week_offset: int,
    selected_days: Optional[List[str]] = None,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Generate a meal plan for a specific week.

    Args:
        week_offset: 0 = current week, 1 = next week, etc.
        selected_days: List of days to include (e.g., ["monday", "tuesday"]).
                       Defaults to all 7 days if not provided.

    If a meal plan already exists for that week, it will be replaced.
    """
    try:
        db = get_database()

        # Calculate the Monday of the target week
        target_monday = get_monday_of_week(datetime.now(), week_offset)
        logger.info(f"Generating meal plan for week starting {target_monday}")

        # Check if a meal plan already exists for this week
        existing = db.table("meal_plans")\
            .select("id")\
            .eq("user_id", current_user.id)\
            .eq("week_start_date", target_monday)\
            .execute()

        if existing.data:
            # Delete existing meal plan for this week
            logger.info(f"Deleting existing meal plan for week {target_monday}")
            db.table("meal_plans").delete().eq("id", existing.data[0]["id"]).execute()

        # Get user preferences
        user_result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
        profile_data = user_result.data[0].get("profile_data", {}) if user_result.data else {}
        preferences = profile_data.get("preferences", {})

        # Get pantry items
        pantry_result = db.table("pantry_items").select("*").eq("user_id", current_user.id).execute()
        pantry_items = [item["item_name"] for item in pantry_result.data]

        # Normalize and validate selected_days
        all_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        if selected_days:
            normalized_days = [d.lower() for d in selected_days]
            for d in normalized_days:
                if d not in all_days:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid day: {d}. Must be one of {all_days}"
                    )
        else:
            normalized_days = all_days

        # Build AI meal plan request
        request = AIMealPlanRequest(
            meals_per_day=[MealSlot.BREAKFAST, MealSlot.LUNCH, MealSlot.DINNER],
            week_start_date=datetime.strptime(target_monday, "%Y-%m-%d").date(),
            selected_days=normalized_days,
            dietary_preferences=preferences.get("dietary_restrictions", []),
            cuisine_preferences=preferences.get("cuisine_preferences", []),
            cooking_skill=preferences.get("cooking_skill", "intermediate"),
            pantry_items=pantry_items,
            servings_per_meal=preferences.get("household_size", 2),
            goals=["use-pantry-items"]
        )

        # Get batch cooking preferences
        cooking_sessions = preferences.get("cooking_sessions_per_week", 6)
        leftover_tolerance = preferences.get("leftover_tolerance", "moderate")

        logger.info(f"Generating meal plan for user {current_user.id} starting {target_monday}")
        logger.info(f"Batch cooking: {cooking_sessions} sessions, {leftover_tolerance} tolerance")

        # Generate meal plan with AI
        meal_plan_data = await ai_service.generate_meal_plan(request, current_user.id, preferences)

        meal_plan_response = meal_plan_data.get("meal_plan", {})
        meals_dict = meal_plan_response.get("meals", {})

        # Collect all recipes and DEDUPLICATE by title before saving
        # Use selected days instead of hardcoded 7 days
        days = normalized_days
        unique_recipes_by_title: Dict[str, Dict[str, Any]] = {}  # title -> recipe_data

        # First pass: collect unique recipes by title
        for day in days:
            if day not in meals_dict:
                continue

            day_meals = meals_dict[day]

            for meal_type in ["breakfast", "lunch", "dinner"]:
                if meal_type not in day_meals or not day_meals[meal_type]:
                    continue

                recipe_data = day_meals[meal_type]
                title = recipe_data.get("title", "").strip()

                # Skip if we already have this recipe (by title)
                if title in unique_recipes_by_title:
                    continue

                instructions = recipe_data.get("instructions", [])
                if instructions:
                    for i, instruction in enumerate(instructions):
                        if "step" not in instruction:
                            instruction["step"] = i + 1

                difficulty = recipe_data.get("difficulty", "Medium")
                if difficulty == "Intermediate":
                    difficulty = "Medium"
                elif difficulty not in ["Easy", "Medium", "Hard"]:
                    difficulty = "Medium"

                unique_recipes_by_title[title] = {
                    "user_id": current_user.id,
                    "title": title,
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

        logger.info(f"Found {len(unique_recipes_by_title)} unique recipes (deduplicated by title)")

        # Second pass: save unique recipes to database
        saved_recipe_records: List[Dict[str, Any]] = []
        title_to_id: Dict[str, str] = {}

        for title, recipe_record in unique_recipes_by_title.items():
            recipe_result = db.table("recipes").insert(recipe_record).execute()
            recipe_id = recipe_result.data[0]["id"]
            title_to_id[title] = recipe_id

            saved_recipe_records.append({
                "id": recipe_id,
                "title": title,
                "meal_type": recipe_record.get("meal_type", ["Dinner"])
            })

        logger.info(f"Saved {len(saved_recipe_records)} unique recipes to database")

        # Use MealAssignmentService to distribute recipes across slots
        assignments = meal_assignment_service.assign_meals_to_week(
            recipes=saved_recipe_records,
            cooking_sessions=cooking_sessions,
            leftover_tolerance=leftover_tolerance
        )

        # Convert assignments to final meal plan structure
        saved_recipes: Dict[str, Dict[str, Any]] = {}
        for day in days:
            if day in assignments:
                saved_recipes[day] = assignments[day]

        # Save meal plan with selected_days metadata
        meal_plan_record = {
            "user_id": current_user.id,
            "plan_name": f"Meal Plan - {len(normalized_days)} days starting {target_monday}",
            "week_start_date": target_monday,
            "selected_days": normalized_days,
            "meals": saved_recipes
        }
        result = db.table("meal_plans").insert(meal_plan_record).execute()

        logger.info(f"Successfully created meal plan {result.data[0]['id']} with {len(saved_recipes)} days for {normalized_days}")

        return {
            "meal_plan_id": result.data[0]["id"],
            "selected_days": normalized_days,
            "meals": saved_recipes,
            "summary": meal_plan_response.get("week_summary", {}),
            "grocery_list": meal_plan_response.get("grocery_list", [])
        }

    except Exception as e:
        logger.error(f"Failed to generate meal plan for week {week_offset}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate meal plan: {str(e)}"
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

        # Get selected_days with fallback to all 7 days for backwards compatibility
        all_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        selected_days_list = meal_plan.get("selected_days", all_days)

        return {
            "id": meal_plan["id"],
            "user_id": meal_plan["user_id"],
            "plan_name": meal_plan["plan_name"],
            "week_start_date": meal_plan["week_start_date"],
            "selected_days": selected_days_list,
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


@router.delete("/{meal_plan_id}/")
async def delete_meal_plan(
    meal_plan_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, str]:
    """
    Delete a specific meal plan.

    Verifies ownership before deleting.
    """
    try:
        db = get_database()

        # Verify ownership
        mp_result = db.table("meal_plans")\
            .select("id")\
            .eq("id", meal_plan_id)\
            .eq("user_id", current_user.id)\
            .execute()

        if not mp_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meal plan not found"
            )

        # Delete the meal plan
        db.table("meal_plans").delete().eq("id", meal_plan_id).execute()

        logger.info(f"Deleted meal plan {meal_plan_id} for user {current_user.id}")

        return {"message": "Meal plan deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete meal plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete meal plan"
        )


@router.patch("/{meal_plan_id}/meals")
async def update_meal_plan_meals(
    meal_plan_id: str,
    meals_update: Dict[str, Any],
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Update the meals in an existing meal plan.

    Allows users to swap, remove, or rearrange meals.
    The meals_update should be the complete meals object to replace the existing one.
    """
    try:
        db = get_database()

        # Verify ownership
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

        # Update the meals
        db.table("meal_plans").update({"meals": meals_update}).eq("id", meal_plan_id).execute()

        logger.info(f"Updated meals for meal plan {meal_plan_id}")

        # Return the updated meal plan
        updated_result = db.table("meal_plans")\
            .select("*")\
            .eq("id", meal_plan_id)\
            .execute()

        meal_plan = updated_result.data[0]

        # Get selected_days with fallback to all 7 days for backwards compatibility
        all_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        selected_days_list = meal_plan.get("selected_days", all_days)

        return {
            "id": meal_plan["id"],
            "user_id": meal_plan["user_id"],
            "plan_name": meal_plan["plan_name"],
            "week_start_date": meal_plan["week_start_date"],
            "selected_days": selected_days_list,
            "meals": meal_plan["meals"],
            "created_at": meal_plan["created_at"]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update meal plan meals: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update meal plan"
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

        # Get existing recipe titles in this meal plan to avoid duplicates
        meals = meal_plan["meals"]
        existing_recipe_ids = set()
        for day_meals in meals.values():
            if isinstance(day_meals, dict):
                for meal_data in day_meals.values():
                    if isinstance(meal_data, str):
                        existing_recipe_ids.add(meal_data)
                    elif isinstance(meal_data, dict) and 'recipe_id' in meal_data:
                        existing_recipe_ids.add(meal_data['recipe_id'])

        # Fetch existing recipe titles to tell AI what to avoid
        existing_titles = []
        if existing_recipe_ids:
            existing_recipes_result = db.table("recipes")\
                .select("title")\
                .in_("id", list(existing_recipe_ids))\
                .execute()
            existing_titles = [r["title"] for r in existing_recipes_result.data]

        avoid_list = ", ".join(existing_titles) if existing_titles else "none"

        # Generate new recipe
        from app.schemas.recipe import AIRecipeRequest, MealType
        request = AIRecipeRequest(
            pantry_items=pantry_items,
            dietary_restrictions=preferences.get("dietary_restrictions", []),
            cooking_skill=preferences.get("cooking_skill", "intermediate"),
            servings=preferences.get("household_size", 2),
            meal_type=MealType(meal_type.capitalize()) if meal_type != "snack" else MealType.SNACK,
            additional_preferences=f"Generate a {meal_type} recipe for {day}. IMPORTANT: Do NOT generate any of these recipes that already exist in the meal plan: [{avoid_list}]. Create something completely different."
        )

        logger.info(f"Regenerating {meal_type} for {day} in meal plan {meal_plan_id}")
        logger.info(f"Avoiding existing recipes: {existing_titles}")
        new_recipe = await ai_service.generate_recipe(request, current_user.id)

        # Check if a recipe with this exact title already exists (deduplication)
        # This prevents the same recipe from having different nutrition values
        duplicate_check = db.table("recipes")\
            .select("*")\
            .eq("title", new_recipe.title)\
            .eq("user_id", current_user.id)\
            .neq("id", new_recipe.id)\
            .limit(1)\
            .execute()

        if duplicate_check.data:
            # Use existing recipe instead of newly generated one
            logger.info(f"Found existing recipe with same title: {new_recipe.title}, using existing one")
            existing = duplicate_check.data[0]
            # Delete the duplicate we just created
            db.table("recipes").delete().eq("id", new_recipe.id).execute()
            # Use the existing recipe
            new_recipe = RecipeResponse(
                id=existing["id"],
                user_id=existing["user_id"],
                title=existing["title"],
                ingredients=existing.get("ingredients", []),
                instructions=existing.get("instructions", []),
                prep_time_minutes=existing.get("prep_time_minutes"),
                cook_time_minutes=existing.get("cook_time_minutes"),
                servings=existing.get("servings"),
                calories=existing.get("calories"),
                protein_grams=existing.get("protein_grams"),
                carbs_grams=existing.get("carbs_grams"),
                fat_grams=existing.get("fat_grams"),
                tags=existing.get("tags", []),
                source=existing.get("source"),
                notes=existing.get("notes"),
                created_at=existing.get("created_at"),
                updated_at=existing.get("updated_at")
            )

        # Update meal plan (use new format with is_repeat=False for regenerated meals)
        meals = meal_plan["meals"]
        if day not in meals:
            meals[day] = {}
        meals[day][meal_type] = {
            "recipe_id": new_recipe.id,
            "is_repeat": False,
            "original_day": None,
            "order": {"breakfast": 1, "lunch": 2, "dinner": 3, "snack": 2}.get(meal_type, 1)
        }

        db.table("meal_plans").update({"meals": meals}).eq("id", meal_plan_id).execute()

        logger.info(f"Successfully regenerated {meal_type} for {day}")

        return new_recipe

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to regenerate meal: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to regenerate meal: {str(e)}"
        )


@router.post("/{meal_plan_id}/fill-remaining")
async def fill_remaining_with_ai(
    meal_plan_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Fill all empty meal slots in an existing meal plan with AI-generated recipes.

    Useful for hybrid meal planning where user manually fills some slots
    and wants AI to fill the rest.
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
        meals = meal_plan.get("meals", {})

        # Get selected_days from meal plan (or default to all 7 days)
        all_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        selected_days = meal_plan.get("selected_days", all_days)

        # Find empty slots
        empty_slots = []
        meal_types = ["breakfast", "lunch", "dinner"]

        for day in selected_days:
            day_meals = meals.get(day, {})
            for meal_type in meal_types:
                meal_data = day_meals.get(meal_type)
                if not meal_data:
                    empty_slots.append((day, meal_type))
                elif isinstance(meal_data, dict) and not meal_data.get("recipe_id"):
                    empty_slots.append((day, meal_type))

        if not empty_slots:
            return {
                "message": "No empty slots to fill",
                "filled_count": 0,
                "meals": meals
            }

        logger.info(f"Filling {len(empty_slots)} empty slots in meal plan {meal_plan_id}")

        # Get user preferences
        user_result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
        profile_data = user_result.data[0].get("profile_data", {}) if user_result.data else {}
        preferences = profile_data.get("preferences", {})

        # Get pantry items
        pantry_result = db.table("pantry_items").select("*").eq("user_id", current_user.id).execute()
        pantry_items = [item["item_name"] for item in pantry_result.data]

        # Get existing recipe titles to avoid duplicates
        existing_recipe_ids = set()
        for day_meals in meals.values():
            if isinstance(day_meals, dict):
                for meal_data in day_meals.values():
                    if isinstance(meal_data, str):
                        existing_recipe_ids.add(meal_data)
                    elif isinstance(meal_data, dict) and 'recipe_id' in meal_data:
                        existing_recipe_ids.add(meal_data['recipe_id'])

        existing_titles = []
        if existing_recipe_ids:
            existing_recipes_result = db.table("recipes")\
                .select("title")\
                .in_("id", list(existing_recipe_ids))\
                .execute()
            existing_titles = [r["title"] for r in existing_recipes_result.data]

        avoid_list = ", ".join(existing_titles) if existing_titles else "none"

        # Generate recipes for empty slots
        from app.schemas.recipe import AIRecipeRequest, MealType
        filled_count = 0

        for day, meal_type in empty_slots:
            try:
                request = AIRecipeRequest(
                    pantry_items=pantry_items,
                    dietary_restrictions=preferences.get("dietary_restrictions", []),
                    cooking_skill=preferences.get("cooking_skill", "intermediate"),
                    servings=preferences.get("household_size", 2),
                    meal_type=MealType(meal_type.capitalize()) if meal_type != "snack" else MealType.SNACK,
                    additional_preferences=f"Generate a {meal_type} recipe for {day}. IMPORTANT: Avoid these recipes: [{avoid_list}]. Create something different."
                )

                new_recipe = await ai_service.generate_recipe(request, current_user.id)

                # Add to avoid list for subsequent generations
                if new_recipe.title not in existing_titles:
                    existing_titles.append(new_recipe.title)
                    avoid_list = ", ".join(existing_titles)

                # Update meal plan with new recipe
                if day not in meals:
                    meals[day] = {}
                meals[day][meal_type] = {
                    "recipe_id": new_recipe.id,
                    "is_repeat": False,
                    "original_day": None,
                    "order": {"breakfast": 1, "lunch": 2, "dinner": 3, "snack": 2}.get(meal_type, 1)
                }
                filled_count += 1

                logger.info(f"Generated {meal_type} for {day}: {new_recipe.title}")

            except Exception as e:
                logger.error(f"Failed to generate {meal_type} for {day}: {e}")
                # Continue with other slots even if one fails
                continue

        # Save updated meal plan
        db.table("meal_plans").update({"meals": meals}).eq("id", meal_plan_id).execute()

        logger.info(f"Filled {filled_count} slots in meal plan {meal_plan_id}")

        return {
            "message": f"Successfully filled {filled_count} empty slots",
            "filled_count": filled_count,
            "total_empty": len(empty_slots),
            "meals": meals
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fill remaining slots: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fill remaining slots: {str(e)}"
        )


@router.get("/{meal_plan_id}/macro-summary")
async def get_meal_plan_macro_summary(
    meal_plan_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Get nutrition macro summary for a meal plan.

    Returns weekly totals, daily averages, and macro percentages.
    Also includes per-day breakdowns and validation warnings.
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
        meals = meal_plan.get("meals", {})

        # Collect ALL recipe IDs (including repeats for accurate weekly totals)
        all_recipe_ids = []  # List with duplicates for counting actual meals
        unique_recipe_ids = set()  # Set for fetching unique recipes

        for day_meals in meals.values():
            if isinstance(day_meals, dict):
                for meal_data in day_meals.values():
                    if meal_data:
                        # Handle old format (string) and new format (object with recipe_id)
                        recipe_id = None
                        if isinstance(meal_data, str):
                            recipe_id = meal_data
                        elif isinstance(meal_data, dict) and 'recipe_id' in meal_data:
                            recipe_id = meal_data['recipe_id']

                        if recipe_id:
                            all_recipe_ids.append(recipe_id)  # Keep duplicates for counting
                            unique_recipe_ids.add(recipe_id)

        if not unique_recipe_ids:
            return {
                "meal_plan_id": meal_plan_id,
                "weekly_summary": nutrition_service.calculate_weekly_summary([]),
                "daily_breakdown": {},
                "validation_warnings": ["No recipes found in meal plan"]
            }

        # Fetch all unique recipes
        recipes_result = db.table("recipes")\
            .select("id, title, calories, protein_grams, carbs_grams, fat_grams")\
            .in_("id", list(unique_recipe_ids))\
            .execute()

        recipes_by_id = {r["id"]: r for r in recipes_result.data}

        # Build list of ALL meals (with repeats) for accurate weekly summary
        # This counts each meal the number of times it appears in the plan
        all_meals = []
        for recipe_id in all_recipe_ids:
            if recipe_id in recipes_by_id:
                all_meals.append(recipes_by_id[recipe_id])

        # Get selected_days from meal plan (fallback to all 7 days for backwards compatibility)
        all_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        selected_days = meal_plan.get("selected_days", all_days)
        num_days = len(selected_days)

        # Calculate weekly summary using actual meal count (not just unique recipes)
        # Pass num_days for accurate daily average calculation
        weekly_summary = nutrition_service.calculate_weekly_summary(all_meals, num_days)

        # Calculate per-day breakdown (only for selected days)
        daily_breakdown = {}

        for day in selected_days:
            day_meals = meals.get(day, {})
            day_recipes = []

            for meal_type in ["breakfast", "lunch", "dinner"]:
                meal_data = day_meals.get(meal_type)
                if meal_data:
                    # Handle old format (string) and new format (object with recipe_id)
                    if isinstance(meal_data, str):
                        recipe_id = meal_data
                    elif isinstance(meal_data, dict) and 'recipe_id' in meal_data:
                        recipe_id = meal_data['recipe_id']
                    else:
                        continue

                    if recipe_id in recipes_by_id:
                        day_recipes.append(recipes_by_id[recipe_id])

            if day_recipes:
                daily_breakdown[day] = nutrition_service.calculate_daily_summary(day_recipes)
                daily_breakdown[day]["meal_count"] = len(day_recipes)

        # Validate nutrition data for each recipe
        validation_warnings = []
        for recipe in all_meals:
            validation = nutrition_service.validate_nutrition(
                recipe.get("calories"),
                recipe.get("protein_grams"),
                recipe.get("carbs_grams"),
                recipe.get("fat_grams")
            )
            if validation.warnings:
                for warning in validation.warnings:
                    validation_warnings.append(f"{recipe.get('title', 'Unknown')}: {warning}")
            if validation.errors:
                for error in validation.errors:
                    validation_warnings.append(f"{recipe.get('title', 'Unknown')}: {error}")

        # Get user targets for comparison
        user_result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
        profile_data = user_result.data[0].get("profile_data", {}) if user_result.data else {}
        preferences = profile_data.get("preferences", {})

        targets = {
            "calorie_target": preferences.get("calorie_target"),
            "protein_target_grams": preferences.get("protein_target_grams")
        }

        # Calculate target comparison if targets are set
        target_comparison = None
        if targets["calorie_target"]:
            daily_avg = weekly_summary["daily_averages"]["calories"]
            target_comparison = {
                "calorie_target": targets["calorie_target"],
                "calorie_daily_avg": daily_avg,
                "calorie_difference": daily_avg - targets["calorie_target"],
                "calorie_on_target": abs(daily_avg - targets["calorie_target"]) <= 200
            }
        if targets["protein_target_grams"]:
            protein_avg = weekly_summary["daily_averages"]["protein_grams"]
            if target_comparison is None:
                target_comparison = {}
            target_comparison["protein_target_grams"] = targets["protein_target_grams"]
            target_comparison["protein_daily_avg"] = protein_avg
            target_comparison["protein_difference"] = protein_avg - targets["protein_target_grams"]
            target_comparison["protein_on_target"] = abs(protein_avg - targets["protein_target_grams"]) <= 20

        return {
            "meal_plan_id": meal_plan_id,
            "selected_days": selected_days,
            "num_days": num_days,
            "weekly_summary": weekly_summary,
            "daily_breakdown": daily_breakdown,
            "target_comparison": target_comparison,
            "validation_warnings": validation_warnings[:10]  # Limit to first 10 warnings
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get macro summary: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to calculate macro summary"
        )
