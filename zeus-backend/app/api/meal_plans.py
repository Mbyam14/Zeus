from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from app.schemas.user import UserResponse
from app.utils.dependencies import get_current_active_user
from app.database import get_database
from app.services.ai_service import ai_service
from app.services.nutrition_service import nutrition_service
from app.services.meal_assignment_service import meal_assignment_service
from app.services.recipe_shortlist_service import recipe_shortlist_service
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/meal-plans", tags=["Meal Plans"])


def _calculate_unique_recipe_counts(
    num_days: int,
    cooking_sessions: int,
    leftover_tolerance: str,
) -> Dict[str, int]:
    """
    Calculate how many unique recipes are needed per meal type.

    Based on number of days, cooking sessions per week, and leftover tolerance.
    """
    # Distribute cooking sessions across meal types
    # Breakfast: simpler, fewer unique needed (people repeat breakfasts)
    # Dinner: most variety desired
    # Lunch: often leftovers from dinner, fewer unique needed
    if cooking_sessions >= num_days * 2:
        # High variety mode
        breakfast_count = min(num_days, max(2, num_days // 2))
        dinner_count = min(num_days, cooking_sessions // 2)
        lunch_count = min(num_days, max(1, cooking_sessions // 4))
    elif cooking_sessions >= num_days:
        # Moderate variety
        breakfast_count = min(num_days, max(2, num_days // 3))
        dinner_count = min(num_days, max(3, cooking_sessions // 2))
        lunch_count = min(num_days, max(1, cooking_sessions // 4))
    else:
        # Minimal cooking (batch heavy)
        breakfast_count = max(1, min(3, num_days // 3))
        dinner_count = max(2, cooking_sessions)
        lunch_count = max(1, cooking_sessions // 3)

    # Adjust based on leftover tolerance
    if leftover_tolerance == "high":
        breakfast_count = max(1, breakfast_count - 1)
        dinner_count = max(2, dinner_count - 1)
    elif leftover_tolerance == "low":
        breakfast_count = min(num_days, breakfast_count + 1)
        dinner_count = min(num_days, dinner_count + 1)
        lunch_count = min(num_days, lunch_count + 1)

    return {
        "breakfast": breakfast_count,
        "lunch": lunch_count,
        "dinner": dinner_count,
    }


@router.post("/generate/")
async def generate_meal_plan(
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    selected_days: Optional[List[str]] = Query(None, description="Days to include"),
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

        # Hybrid AI meal plan generation: shortlist DB recipes → Claude picks → assign
        logger.info(f"Generating hybrid meal plan for user {current_user.id} starting {start_date}")
        logger.info(f"User calorie target: {preferences.get('calorie_target', 'not set')}, protein target: {preferences.get('protein_target_grams', 'not set')}")

        # Get batch cooking preferences
        cooking_sessions = preferences.get("cooking_sessions_per_week", 6)
        leftover_tolerance = preferences.get("leftover_tolerance", "moderate")
        num_days = len(normalized_days)

        logger.info(f"Batch cooking mode: {cooking_sessions} sessions, {leftover_tolerance} tolerance, {num_days} days")

        # Calculate how many unique recipes needed per meal type
        unique_recipe_counts = _calculate_unique_recipe_counts(
            num_days, cooking_sessions, leftover_tolerance
        )
        logger.info(f"Unique recipe counts needed: {unique_recipe_counts}")

        # Step 1: Shortlist candidates from the recipe database
        candidates = await recipe_shortlist_service.shortlist_candidates(
            preferences=preferences,
            selected_days=normalized_days,
            meal_types=["breakfast", "lunch", "dinner"],
        )

        total_candidates = sum(len(v) for v in candidates.values())
        logger.info(f"Shortlisted {total_candidates} candidate recipes from database")

        # Step 2: Claude selects the best combination (or algorithmic fallback)
        selected_ids = await ai_service.select_meal_plan_recipes(
            candidates=candidates,
            preferences=preferences,
            selected_days=normalized_days,
            unique_recipe_counts=unique_recipe_counts,
        )

        # Step 3: Fetch selected recipes from DB
        all_selected_ids = []
        for ids in selected_ids.values():
            all_selected_ids.extend(ids)

        if not all_selected_ids:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No recipes could be selected for the meal plan"
            )

        recipes_result = db.table("recipes").select(
            "id, title, meal_type"
        ).in_("id", all_selected_ids).execute()

        selected_recipes = recipes_result.data or []
        logger.info(f"Fetched {len(selected_recipes)} selected recipes from database")

        # Step 4: Assign recipes to week slots for selected days only
        assignments = meal_assignment_service.assign_meals_to_week(
            recipes=selected_recipes,
            cooking_sessions=cooking_sessions,
            leftover_tolerance=leftover_tolerance,
            selected_days=normalized_days
        )

        saved_recipes = assignments

        # Step 5: Save meal plan
        meal_plan_record = {
            "user_id": current_user.id,
            "plan_name": f"Meal Plan - {num_days} days starting {start_date}",
            "week_start_date": start_date,
            "selected_days": normalized_days,
            "meals": saved_recipes
        }
        result = db.table("meal_plans").insert(meal_plan_record).execute()

        logger.info(f"Successfully created hybrid meal plan {result.data[0]['id']} with {len(saved_recipes)} days")

        return {
            "meal_plan_id": result.data[0]["id"],
            "selected_days": normalized_days,
            "meals": saved_recipes,
            "summary": {},
            "grocery_list": []
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
        selected_days = meal_plan.get("selected_days") or all_days

        return {
            "id": meal_plan["id"],
            "user_id": meal_plan["user_id"],
            "plan_name": meal_plan["plan_name"],
            "week_start_date": meal_plan["week_start_date"],
            "selected_days": selected_days,
            "meals": meal_plan["meals"],
            "created_at": meal_plan["created_at"]
        }

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
    selected_days: Optional[List[str]] = Query(None, description="Days to include"),
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

        # Get batch cooking preferences
        cooking_sessions = preferences.get("cooking_sessions_per_week", 6)
        leftover_tolerance = preferences.get("leftover_tolerance", "moderate")
        num_days = len(normalized_days)

        logger.info(f"Generating hybrid meal plan for user {current_user.id} starting {target_monday}")
        logger.info(f"Batch cooking: {cooking_sessions} sessions, {leftover_tolerance} tolerance, {num_days} days")

        # Calculate unique recipe counts
        unique_recipe_counts = _calculate_unique_recipe_counts(
            num_days, cooking_sessions, leftover_tolerance
        )

        # Step 1: Shortlist candidates from the recipe database
        candidates = await recipe_shortlist_service.shortlist_candidates(
            preferences=preferences,
            selected_days=normalized_days,
            meal_types=["breakfast", "lunch", "dinner"],
        )

        total_candidates = sum(len(v) for v in candidates.values())
        logger.info(f"Shortlisted {total_candidates} candidate recipes from database")

        # Step 2: Claude selects the best combination
        selected_ids = await ai_service.select_meal_plan_recipes(
            candidates=candidates,
            preferences=preferences,
            selected_days=normalized_days,
            unique_recipe_counts=unique_recipe_counts,
        )

        # Step 3: Fetch selected recipes from DB
        all_selected_ids = []
        for ids in selected_ids.values():
            all_selected_ids.extend(ids)

        if not all_selected_ids:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No recipes could be selected for the meal plan"
            )

        recipes_result = db.table("recipes").select(
            "id, title, meal_type"
        ).in_("id", all_selected_ids).execute()

        selected_recipes = recipes_result.data or []

        # Step 4: Assign recipes to week slots for selected days only
        assignments = meal_assignment_service.assign_meals_to_week(
            recipes=selected_recipes,
            cooking_sessions=cooking_sessions,
            leftover_tolerance=leftover_tolerance,
            selected_days=normalized_days
        )

        saved_recipes = assignments

        # Step 5: Save meal plan
        meal_plan_record = {
            "user_id": current_user.id,
            "plan_name": f"Meal Plan - {num_days} days starting {target_monday}",
            "week_start_date": target_monday,
            "selected_days": normalized_days,
            "meals": saved_recipes
        }
        result = db.table("meal_plans").insert(meal_plan_record).execute()

        logger.info(f"Successfully created hybrid meal plan {result.data[0]['id']} with {len(saved_recipes)} days")

        return {
            "meal_plan_id": result.data[0]["id"],
            "selected_days": normalized_days,
            "meals": saved_recipes,
            "summary": {},
            "grocery_list": []
        }

    except Exception as e:
        logger.error(f"Failed to generate meal plan for week {week_offset}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate meal plan: {str(e)}"
        )


@router.get("/{meal_plan_id}")
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


@router.delete("/{meal_plan_id}")
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


@router.post("/{meal_plan_id}/regenerate-meal")
async def regenerate_single_meal(
    meal_plan_id: str,
    day: str,
    meal_type: str,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, Any]:
    """
    Regenerate a single meal in an existing meal plan.

    Picks a new recipe from the database and updates the meal plan.
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

        # Collect existing recipe IDs in this meal plan to exclude
        meals = meal_plan["meals"]
        existing_recipe_ids = set()
        for day_meals in meals.values():
            if isinstance(day_meals, dict):
                for meal_data in day_meals.values():
                    if isinstance(meal_data, str):
                        existing_recipe_ids.add(meal_data)
                    elif isinstance(meal_data, dict) and 'recipe_id' in meal_data:
                        existing_recipe_ids.add(meal_data['recipe_id'])

        logger.info(f"Regenerating {meal_type} for {day} in meal plan {meal_plan_id}")

        # Pick a new recipe from the database using shortlist service
        new_recipe_id = await recipe_shortlist_service.pick_top_for_slot(
            preferences=preferences,
            meal_type=meal_type,
            exclude_recipe_ids=list(existing_recipe_ids),
        )

        if not new_recipe_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"No suitable {meal_type} recipe found"
            )

        # Fetch the full recipe for the response
        recipe_result = db.table("recipes").select("*").eq("id", new_recipe_id).execute()
        if not recipe_result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Selected recipe not found in database"
            )

        recipe_data = recipe_result.data[0]

        # Update meal plan
        if day not in meals:
            meals[day] = {}
        meals[day][meal_type] = {
            "recipe_id": new_recipe_id,
            "is_repeat": False,
            "original_day": None,
            "order": {"breakfast": 1, "lunch": 2, "dinner": 3, "snack": 2}.get(meal_type, 1)
        }

        db.table("meal_plans").update({"meals": meals}).eq("id", meal_plan_id).execute()

        logger.info(f"Successfully regenerated {meal_type} for {day} with recipe: {recipe_data.get('title')}")

        return recipe_data

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
        selected_days = meal_plan.get("selected_days") or all_days

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

        # Collect existing recipe IDs to exclude
        existing_recipe_ids = set()
        for day_meals in meals.values():
            if isinstance(day_meals, dict):
                for meal_data in day_meals.values():
                    if isinstance(meal_data, str):
                        existing_recipe_ids.add(meal_data)
                    elif isinstance(meal_data, dict) and 'recipe_id' in meal_data:
                        existing_recipe_ids.add(meal_data['recipe_id'])

        # Fill empty slots using shortlist service (instant, no AI calls)
        filled_count = 0
        exclude_ids = list(existing_recipe_ids)

        for day, meal_type in empty_slots:
            try:
                new_recipe_id = await recipe_shortlist_service.pick_top_for_slot(
                    preferences=preferences,
                    meal_type=meal_type,
                    exclude_recipe_ids=exclude_ids,
                )

                if not new_recipe_id:
                    logger.warning(f"No suitable {meal_type} recipe found for {day}")
                    continue

                # Update meal plan with new recipe
                if day not in meals:
                    meals[day] = {}
                meals[day][meal_type] = {
                    "recipe_id": new_recipe_id,
                    "is_repeat": False,
                    "original_day": None,
                    "order": {"breakfast": 1, "lunch": 2, "dinner": 3, "snack": 2}.get(meal_type, 1)
                }
                filled_count += 1

                # Add to exclude list to avoid duplicates in subsequent slots
                exclude_ids.append(new_recipe_id)

                logger.info(f"Filled {meal_type} for {day} with recipe {new_recipe_id}")

            except Exception as e:
                logger.error(f"Failed to fill {meal_type} for {day}: {e}")
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
        selected_days = meal_plan.get("selected_days") or all_days
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
