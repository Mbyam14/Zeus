from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from app.schemas.user import UserResponse
from app.utils.dependencies import get_current_active_user
from app.database import get_database
from app.services.ai_service import ai_service
from app.services.nutrition_service import nutrition_service
from app.services.meal_assignment_service import meal_assignment_service
from app.services.recipe_shortlist_service import recipe_shortlist_service
from app.services.analytics_service import analytics
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import math
import logging
import traceback

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/meal-plans", tags=["Meal Plans"])

# AI optimize rate limit: 3 uses per meal plan lifetime
AI_OPTIMIZE_MAX_USES = 3


def _calculate_unique_recipe_counts(
    num_days: int,
    cooking_sessions: int,
    leftover_tolerance: str,
) -> Dict[str, int]:
    """Calculate how many unique recipes are needed per meal type."""
    if cooking_sessions >= num_days * 2:
        breakfast_count = min(num_days, max(2, num_days // 2))
        dinner_count = min(num_days, cooking_sessions // 2)
        lunch_count = min(num_days, max(1, cooking_sessions // 4))
        snack_count = min(num_days, max(2, num_days // 3))
    elif cooking_sessions >= num_days:
        breakfast_count = min(num_days, max(2, num_days // 3))
        dinner_count = min(num_days, max(3, cooking_sessions // 2))
        lunch_count = min(num_days, max(1, cooking_sessions // 4))
        snack_count = min(num_days, max(1, num_days // 4))
    else:
        breakfast_count = max(1, min(3, num_days // 3))
        dinner_count = max(2, cooking_sessions)
        lunch_count = max(1, cooking_sessions // 3)
        snack_count = max(1, min(2, num_days // 4))

    if leftover_tolerance == "high":
        breakfast_count = max(1, breakfast_count - 1)
        dinner_count = max(2, dinner_count - 1)
    elif leftover_tolerance == "low":
        breakfast_count = min(num_days, breakfast_count + 1)
        dinner_count = min(num_days, dinner_count + 1)
        lunch_count = min(num_days, lunch_count + 1)
        snack_count = min(num_days, snack_count + 1)

    return {
        "breakfast": breakfast_count,
        "snack": snack_count,
        "lunch": lunch_count,
        "dinner": dinner_count,
    }


def _deterministic_select(
    candidates: Dict[str, List[Dict[str, Any]]],
    unique_recipe_counts: Dict[str, int],
) -> Dict[str, List[str]]:
    """
    Tier 1: Deterministic recipe selection from the scored shortlist.

    Picks top-scored recipes with cuisine diversity enforcement.
    No AI call — instant, free, reproducible.
    """
    result = {}

    for meal_type, count in unique_recipe_counts.items():
        meal_candidates = candidates.get(meal_type, [])
        # Already sorted by score descending from shortlist service

        selected_ids = []
        cuisine_count: Dict[str, int] = {}
        max_per_cuisine = max(1, math.ceil(count * 0.6))

        for recipe in meal_candidates:
            if len(selected_ids) >= count:
                break
            cuisine = (recipe.get("cuisine_type") or "unknown").lower()
            slots_remaining = count - len(selected_ids)

            # Relax cuisine constraint when we're running low on candidates
            if cuisine_count.get(cuisine, 0) >= max_per_cuisine and slots_remaining > 1:
                continue

            selected_ids.append(recipe["id"])
            cuisine_count[cuisine] = cuisine_count.get(cuisine, 0) + 1

        # Fill any remaining slots regardless of cuisine
        if len(selected_ids) < count:
            for recipe in meal_candidates:
                if recipe["id"] not in selected_ids:
                    selected_ids.append(recipe["id"])
                if len(selected_ids) >= count:
                    break

        result[meal_type] = selected_ids

    return result


def get_monday_of_week(date: datetime, week_offset: int = 0) -> str:
    """Get the Monday date string for a given week offset."""
    days_since_monday = date.weekday()  # Monday = 0, Sunday = 6
    monday = date - timedelta(days=days_since_monday)
    target_monday = monday + timedelta(weeks=week_offset)
    return target_monday.strftime("%Y-%m-%d")


async def _fetch_recently_used_recipe_ids(db, user_id: str, exclude_week: str) -> List[str]:
    """Fetch recipe IDs used in the most recent prior meal plan (for freshness penalty)."""
    try:
        result = db.table("meal_plans").select("meals").eq(
            "user_id", user_id
        ).neq("week_start_date", exclude_week).order(
            "created_at", desc=True
        ).limit(1).execute()

        if not result.data:
            return []

        meals = result.data[0].get("meals", {})
        ids = set()
        for day_meals in meals.values():
            if isinstance(day_meals, dict):
                for slot in day_meals.values():
                    if isinstance(slot, str):
                        ids.add(slot)
                    elif isinstance(slot, dict):
                        rid = slot.get("recipe_id")
                        if rid:
                            ids.add(rid)
        return list(ids)
    except Exception:
        return []


async def _run_generation(
    db,
    user_id: str,
    preferences: dict,
    normalized_days: List[str],
    target_monday: str,
    pantry_items: List[dict],
) -> Dict[str, Any]:
    """
    Shared generation logic: shortlist → Tier 1 deterministic select → assign → save.
    Deletes any existing plan for the week before saving.
    """
    # Delete existing plan for this week
    existing = db.table("meal_plans").select("id").eq("user_id", user_id).eq(
        "week_start_date", target_monday
    ).execute()
    for old in (existing.data or []):
        db.table("meal_plans").delete().eq("id", old["id"]).execute()

    cooking_sessions = preferences.get("cooking_sessions_per_week", 5)
    leftover_tolerance = preferences.get("leftover_tolerance", "moderate")
    num_days = len(normalized_days)

    unique_recipe_counts = _calculate_unique_recipe_counts(num_days, cooking_sessions, leftover_tolerance)

    # Fetch liked recipes for preference-aware scoring
    liked_result = db.table("recipe_likes").select("recipe_id").eq("user_id", user_id).execute()
    liked_ids = [r["recipe_id"] for r in (liked_result.data or [])]
    if liked_ids:
        preferences["liked_recipe_ids"] = liked_ids

    # Fetch recently used recipes for freshness penalty
    recently_used = await _fetch_recently_used_recipe_ids(db, user_id, target_monday)

    # Step 1: Shortlist candidates
    candidates = await recipe_shortlist_service.shortlist_candidates(
        preferences=preferences,
        selected_days=normalized_days,
        meal_types=["breakfast", "snack", "lunch", "dinner"],
        pantry_items=pantry_items,
        recently_used_recipe_ids=recently_used,
    )
    total_candidates = sum(len(v) for v in candidates.values())
    logger.info(f"Shortlisted {total_candidates} candidates")

    # Step 2: Tier 1 deterministic selection (no Claude call)
    selected_ids = _deterministic_select(candidates, unique_recipe_counts)

    all_selected_ids = [rid for ids in selected_ids.values() for rid in ids]
    if not all_selected_ids:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No recipes could be selected for the meal plan",
        )

    # Step 3: Fetch selected recipe details
    recipes_result = db.table("recipes").select("id, title, meal_type").in_(
        "id", all_selected_ids
    ).execute()
    selected_recipes = recipes_result.data or []

    # Step 4: Assign to week slots
    assignments = meal_assignment_service.assign_meals_to_week(
        recipes=selected_recipes,
        cooking_sessions=cooking_sessions,
        leftover_tolerance=leftover_tolerance,
        selected_days=normalized_days,
    )

    # Step 5: Save — cascade fallbacks for optional columns that may not exist yet
    meal_plan_record = {
        "user_id": user_id,
        "plan_name": f"Meal Plan – {num_days} days starting {target_monday}",
        "week_start_date": target_monday,
        "selected_days": normalized_days,
        "meals": assignments,
        "ai_optimize_uses": 0,
    }
    result = None
    last_insert_err = None
    for attempt, drop_keys in enumerate([[], ["ai_optimize_uses"], ["ai_optimize_uses", "selected_days"]], 1):
        record = {k: v for k, v in meal_plan_record.items() if k not in drop_keys}
        try:
            result = db.table("meal_plans").insert(record).execute()
            if drop_keys:
                logger.warning(f"Insert succeeded on attempt {attempt} (dropped: {drop_keys})")
            break
        except Exception as insert_err:
            last_insert_err = insert_err
            logger.warning(f"Insert attempt {attempt} failed: {repr(insert_err)} — retrying without {drop_keys or 'nothing'}")
    if result is None:
        raise last_insert_err
    plan_id = result.data[0]["id"]
    logger.info(f"Created meal plan {plan_id} (Tier 1 deterministic)")

    return {
        "meal_plan_id": plan_id,
        "selected_days": normalized_days,
        "meals": assignments,
        "summary": {},
        "grocery_list": [],
    }


@router.post("/generate/")
async def generate_meal_plan(
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    selected_days: Optional[List[str]] = Query(None),
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Generate Tier 1 meal plan for selected days."""
    try:
        db = get_database()
        user_result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
        profile_data = user_result.data[0].get("profile_data", {}) if user_result.data else {}
        preferences = profile_data.get("preferences", {})

        all_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        normalized_days = [d.lower() for d in (selected_days or all_days)]
        for d in normalized_days:
            if d not in all_days:
                raise HTTPException(status_code=400, detail=f"Invalid day: {d}")

        pantry_result = db.table("pantry_items").select(
            "item_name, quantity, unit, category"
        ).eq("user_id", current_user.id).execute()
        pantry_items = pantry_result.data or []

        result = await _run_generation(db, current_user.id, preferences, normalized_days, start_date, pantry_items)
        analytics.track("meal_plan_generated", current_user.id, {"plan_id": result["meal_plan_id"], "tier": 1})
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate meal plan: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate meal plan: {str(e)}")


@router.post("/generate/week/{week_offset}")
async def generate_meal_plan_for_week(
    week_offset: int,
    selected_days: Optional[List[str]] = Query(None),
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Generate Tier 1 meal plan for a specific week offset."""
    try:
        db = get_database()
        target_monday = get_monday_of_week(datetime.now(), week_offset)
        logger.info(f"[generate_week] user={current_user.id} offset={week_offset} monday={target_monday} days={selected_days}")

        user_result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
        profile_data = user_result.data[0].get("profile_data", {}) if user_result.data else {}
        preferences = profile_data.get("preferences", {})

        all_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        normalized_days = [d.lower() for d in (selected_days or all_days)]
        for d in normalized_days:
            if d not in all_days:
                raise HTTPException(status_code=400, detail=f"Invalid day: {d}")

        pantry_result = db.table("pantry_items").select(
            "item_name, quantity, unit, category"
        ).eq("user_id", current_user.id).execute()
        pantry_items = pantry_result.data or []

        result = await _run_generation(db, current_user.id, preferences, normalized_days, target_monday, pantry_items)
        analytics.track("meal_plan_generated", current_user.id, {"plan_id": result["meal_plan_id"], "tier": 1, "week_offset": week_offset})
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate meal plan for week {week_offset}: {repr(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to generate meal plan: {repr(e)}")


@router.post("/{meal_plan_id}/ai-optimize")
async def ai_optimize_meal_plan(
    meal_plan_id: str,
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Tier 2: Use Claude Haiku to review and improve the existing meal plan.

    Reviews the current plan and swaps 2-3 meals that are nutritionally off,
    repetitive, or mismatched. Rate limited to 3 uses per plan.
    """
    try:
        db = get_database()

        # Fetch plan and verify ownership
        mp_result = db.table("meal_plans").select("*").eq("id", meal_plan_id).eq(
            "user_id", current_user.id
        ).execute()
        if not mp_result.data:
            raise HTTPException(status_code=404, detail="Meal plan not found")

        meal_plan = mp_result.data[0]
        uses_so_far = meal_plan.get("ai_optimize_uses", 0) or 0

        if uses_so_far >= AI_OPTIMIZE_MAX_USES:
            return {
                "optimized": False,
                "message": f"AI optimize limit reached ({AI_OPTIMIZE_MAX_USES} uses per plan). Create a new plan to reset.",
                "uses_remaining": 0,
                "swaps": [],
            }

        meals = meal_plan.get("meals", {})
        selected_days = meal_plan.get("selected_days") or [
            "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
        ]

        # Get user preferences
        user_result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
        profile_data = user_result.data[0].get("profile_data", {}) if user_result.data else {}
        preferences = profile_data.get("preferences", {})

        # Collect current recipe IDs
        current_recipe_ids = set()
        for day_meals in meals.values():
            if isinstance(day_meals, dict):
                for slot in day_meals.values():
                    if isinstance(slot, str):
                        current_recipe_ids.add(slot)
                    elif isinstance(slot, dict):
                        rid = slot.get("recipe_id")
                        if rid:
                            current_recipe_ids.add(rid)

        # Fetch current recipe details for the plan summary
        recipes_result = db.table("recipes").select(
            "id, title, calories, protein_grams, carbs_grams, cuisine_type"
        ).in_("id", list(current_recipe_ids)).execute()
        recipes_by_id = {r["id"]: r for r in (recipes_result.data or [])}

        # Build compact plan summary for Haiku
        plan_summary: Dict[str, Dict[str, Any]] = {}
        for day in selected_days:
            day_meals = meals.get(day, {})
            for meal_type, slot in day_meals.items():
                rid = slot if isinstance(slot, str) else (slot.get("recipe_id") if isinstance(slot, dict) else None)
                if rid and rid in recipes_by_id:
                    r = recipes_by_id[rid]
                    plan_summary.setdefault(day, {})[meal_type] = {
                        "recipe_id": rid,
                        "title": r.get("title", "?"),
                        "calories": r.get("calories", 0),
                        "protein_grams": r.get("protein_grams", 0),
                        "cuisine_type": r.get("cuisine_type", "?"),
                    }

        # Fetch swap candidates for meal types in the plan
        pantry_result = db.table("pantry_items").select(
            "item_name, quantity, unit, category"
        ).eq("user_id", current_user.id).execute()
        pantry_items = pantry_result.data or []

        liked_result = db.table("recipe_likes").select("recipe_id").eq("user_id", current_user.id).execute()
        liked_ids = [r["recipe_id"] for r in (liked_result.data or [])]
        if liked_ids:
            preferences["liked_recipe_ids"] = liked_ids

        swap_candidates = await recipe_shortlist_service.shortlist_candidates(
            preferences=preferences,
            selected_days=selected_days,
            meal_types=["breakfast", "snack", "lunch", "dinner"],
            exclude_recipe_ids=list(current_recipe_ids),
            target_per_meal_type=8,
            pantry_items=pantry_items,
        )

        # Call Haiku for targeted swap suggestions
        swaps = await ai_service.ai_optimize_meal_plan(
            plan_summary=plan_summary,
            preferences=preferences,
            swap_candidates=swap_candidates,
        )

        if not swaps:
            return {
                "optimized": False,
                "message": "Your plan already looks great! No swaps needed.",
                "uses_remaining": AI_OPTIMIZE_MAX_USES - uses_so_far,
                "swaps": [],
            }

        # Apply validated swaps to the plan
        swaps_applied = 0
        swap_log = []
        new_recipe_ids = set()

        for swap in swaps:
            day = swap.get("day", "").lower()
            meal_type = swap.get("meal_type", "").lower()
            new_recipe_id = swap.get("new_recipe_id", "")

            if not day or not meal_type or not new_recipe_id:
                continue
            if day not in meals:
                continue
            if new_recipe_id in current_recipe_ids or new_recipe_id in new_recipe_ids:
                continue

            # Validate recipe exists
            recipe_check = db.table("recipes").select("id, title, calories").eq("id", new_recipe_id).execute()
            if not recipe_check.data:
                continue

            new_recipe = recipe_check.data[0]
            old_slot = meals[day].get(meal_type)
            old_rid = old_slot if isinstance(old_slot, str) else (old_slot.get("recipe_id") if isinstance(old_slot, dict) else None)

            meals[day][meal_type] = {
                "recipe_id": new_recipe_id,
                "is_repeat": False,
                "original_day": None,
                "order": {"breakfast": 1, "snack": 2, "lunch": 3, "dinner": 4}.get(meal_type, 1),
            }
            new_recipe_ids.add(new_recipe_id)
            swaps_applied += 1
            swap_log.append({
                "day": day,
                "meal_type": meal_type,
                "old_recipe": recipes_by_id.get(old_rid, {}).get("title", "?") if old_rid else "?",
                "new_recipe": new_recipe["title"],
                "reason": swap.get("reason", ""),
            })

        if swaps_applied > 0:
            new_uses = uses_so_far + 1
            db.table("meal_plans").update({
                "meals": meals,
                "ai_optimize_uses": new_uses,
            }).eq("id", meal_plan_id).execute()
            logger.info(f"AI optimized plan {meal_plan_id}: {swaps_applied} swaps (use {new_uses}/{AI_OPTIMIZE_MAX_USES})")
            analytics.track("meal_plan_ai_optimized", current_user.id, {"plan_id": meal_plan_id, "swaps": swaps_applied})
        else:
            new_uses = uses_so_far

        return {
            "optimized": swaps_applied > 0,
            "message": f"Made {swaps_applied} swap{'s' if swaps_applied != 1 else ''} to improve your plan." if swaps_applied > 0 else "Could not find suitable improvements.",
            "uses_remaining": AI_OPTIMIZE_MAX_USES - new_uses,
            "swaps": swap_log,
            "meals": meals,
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"AI optimize failed: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"AI optimize failed: {str(e)}")


@router.post("/create-manual/")
async def create_manual_meal_plan(
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    selected_days: List[str] = Query(...),
    meals: Dict[str, Any] = Body(...),
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Create a meal plan with manually selected recipes."""
    try:
        db = get_database()

        all_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        normalized_days = [d.lower() for d in selected_days]
        for d in normalized_days:
            if d not in all_days:
                raise HTTPException(status_code=400, detail=f"Invalid day: {d}")

        existing = db.table("meal_plans").select("id").eq("user_id", current_user.id).eq(
            "week_start_date", start_date
        ).execute()
        for old in (existing.data or []):
            db.table("meal_plans").delete().eq("id", old["id"]).execute()

        meal_plan_record = {
            "user_id": current_user.id,
            "plan_name": f"Manual Meal Plan – {len(normalized_days)} days starting {start_date}",
            "week_start_date": start_date,
            "selected_days": normalized_days,
            "meals": meals,
            "ai_optimize_uses": 0,
        }
        result = None
        last_insert_err = None
        for attempt, drop_keys in enumerate([[], ["ai_optimize_uses"], ["ai_optimize_uses", "selected_days"]], 1):
            record = {k: v for k, v in meal_plan_record.items() if k not in drop_keys}
            try:
                result = db.table("meal_plans").insert(record).execute()
                if drop_keys:
                    logger.warning(f"Manual insert succeeded on attempt {attempt} (dropped: {drop_keys})")
                break
            except Exception as insert_err:
                last_insert_err = insert_err
                logger.warning(f"Manual insert attempt {attempt} failed: {repr(insert_err)}")
        if result is None:
            raise last_insert_err

        return {
            "id": result.data[0]["id"],
            "user_id": current_user.id,
            "plan_name": meal_plan_record["plan_name"],
            "week_start_date": start_date,
            "selected_days": normalized_days,
            "meals": meals,
            "created_at": result.data[0]["created_at"],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create manual meal plan: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create meal plan: {str(e)}")


@router.get("/current/")
async def get_current_week_meal_plan(
    current_user: UserResponse = Depends(get_current_active_user),
) -> Optional[Dict[str, Any]]:
    """Get meal plan for the current week."""
    try:
        db = get_database()
        this_monday = get_monday_of_week(datetime.now(), 0)
        result = db.table("meal_plans").select("*").eq("user_id", current_user.id).eq(
            "week_start_date", this_monday
        ).order("created_at", desc=True).limit(1).execute()

        if not result.data:
            return None

        return _format_meal_plan(result.data[0])

    except Exception as e:
        logger.error(f"Failed to get current meal plan: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve meal plan")


@router.get("/week/{week_offset}")
async def get_meal_plan_by_week(
    week_offset: int,
    current_user: UserResponse = Depends(get_current_active_user),
) -> Optional[Dict[str, Any]]:
    """Get meal plan for a specific week offset (0=current, 1=next, -1=last)."""
    try:
        db = get_database()
        target_monday = get_monday_of_week(datetime.now(), week_offset)

        result = db.table("meal_plans").select("*").eq("user_id", current_user.id).eq(
            "week_start_date", target_monday
        ).order("created_at", desc=True).limit(1).execute()

        if not result.data:
            return None

        return _format_meal_plan(result.data[0])

    except Exception as e:
        logger.error(f"Failed to get meal plan for week {week_offset}: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve meal plan")


@router.get("/{meal_plan_id}")
async def get_meal_plan(
    meal_plan_id: str,
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get a specific meal plan by ID."""
    try:
        db = get_database()
        result = db.table("meal_plans").select("*").eq("id", meal_plan_id).eq(
            "user_id", current_user.id
        ).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Meal plan not found")

        return _format_meal_plan(result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get meal plan: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve meal plan")


@router.delete("/{meal_plan_id}")
async def delete_meal_plan(
    meal_plan_id: str,
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, str]:
    """Delete a specific meal plan."""
    try:
        db = get_database()
        mp_result = db.table("meal_plans").select("id").eq("id", meal_plan_id).eq(
            "user_id", current_user.id
        ).execute()
        if not mp_result.data:
            raise HTTPException(status_code=404, detail="Meal plan not found")

        db.table("meal_plans").delete().eq("id", meal_plan_id).execute()
        return {"message": "Meal plan deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete meal plan: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete meal plan")


@router.patch("/{meal_plan_id}/meals")
async def update_meal_plan_meals(
    meal_plan_id: str,
    meals_update: Dict[str, Any],
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Update the meals in an existing meal plan."""
    try:
        db = get_database()
        mp_result = db.table("meal_plans").select("*").eq("id", meal_plan_id).eq(
            "user_id", current_user.id
        ).execute()
        if not mp_result.data:
            raise HTTPException(status_code=404, detail="Meal plan not found")

        db.table("meal_plans").update({"meals": meals_update}).eq("id", meal_plan_id).execute()

        updated = db.table("meal_plans").select("*").eq("id", meal_plan_id).execute()
        return _format_meal_plan(updated.data[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update meal plan meals: {e}")
        raise HTTPException(status_code=500, detail="Failed to update meal plan")


@router.post("/{meal_plan_id}/regenerate-meal")
async def regenerate_single_meal(
    meal_plan_id: str,
    day: str,
    meal_type: str,
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Regenerate a single meal slot using Tier 1 scoring."""
    try:
        db = get_database()
        mp_result = db.table("meal_plans").select("*").eq("id", meal_plan_id).eq(
            "user_id", current_user.id
        ).execute()
        if not mp_result.data:
            raise HTTPException(status_code=404, detail="Meal plan not found")

        meal_plan = mp_result.data[0]
        meals = meal_plan["meals"]

        user_result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
        profile_data = user_result.data[0].get("profile_data", {}) if user_result.data else {}
        preferences = profile_data.get("preferences", {})

        # Collect existing recipe IDs to exclude
        existing_ids = set()
        for day_meals in meals.values():
            if isinstance(day_meals, dict):
                for slot in day_meals.values():
                    if isinstance(slot, str):
                        existing_ids.add(slot)
                    elif isinstance(slot, dict) and slot.get("recipe_id"):
                        existing_ids.add(slot["recipe_id"])

        pantry_result = db.table("pantry_items").select("item_name, quantity, unit, category").eq(
            "user_id", current_user.id
        ).execute()
        pantry_items = pantry_result.data or []

        recently_used = await _fetch_recently_used_recipe_ids(db, current_user.id, meal_plan.get("week_start_date", ""))

        new_recipe_id = await recipe_shortlist_service.pick_top_for_slot(
            preferences=preferences,
            meal_type=meal_type,
            exclude_recipe_ids=list(existing_ids),
            pantry_items=pantry_items,
            recently_used_recipe_ids=recently_used,
        )

        if not new_recipe_id:
            raise HTTPException(status_code=500, detail=f"No suitable {meal_type} recipe found")

        recipe_result = db.table("recipes").select("*").eq("id", new_recipe_id).execute()
        if not recipe_result.data:
            raise HTTPException(status_code=500, detail="Selected recipe not found")

        recipe_data = recipe_result.data[0]

        if day not in meals:
            meals[day] = {}
        meals[day][meal_type] = {
            "recipe_id": new_recipe_id,
            "is_repeat": False,
            "original_day": None,
            "order": {"breakfast": 1, "snack": 2, "lunch": 3, "dinner": 4}.get(meal_type, 1),
        }

        db.table("meal_plans").update({"meals": meals}).eq("id", meal_plan_id).execute()
        return recipe_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to regenerate meal: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to regenerate meal: {str(e)}")


@router.post("/{meal_plan_id}/fill-remaining")
async def fill_remaining_with_ai(
    meal_plan_id: str,
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Fill all empty meal slots using Tier 1 scoring."""
    try:
        db = get_database()
        mp_result = db.table("meal_plans").select("*").eq("id", meal_plan_id).eq(
            "user_id", current_user.id
        ).execute()
        if not mp_result.data:
            raise HTTPException(status_code=404, detail="Meal plan not found")

        meal_plan = mp_result.data[0]
        meals = meal_plan.get("meals", {})
        selected_days = meal_plan.get("selected_days") or [
            "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
        ]

        empty_slots = []
        for day in selected_days:
            day_meals = meals.get(day, {})
            for meal_type in ["breakfast", "snack", "lunch", "dinner"]:
                slot = day_meals.get(meal_type)
                if not slot or (isinstance(slot, dict) and not slot.get("recipe_id")):
                    empty_slots.append((day, meal_type))

        if not empty_slots:
            return {"message": "No empty slots to fill", "filled_count": 0, "meals": meals}

        user_result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
        profile_data = user_result.data[0].get("profile_data", {}) if user_result.data else {}
        preferences = profile_data.get("preferences", {})

        existing_ids = set()
        for day_meals in meals.values():
            if isinstance(day_meals, dict):
                for slot in day_meals.values():
                    if isinstance(slot, str):
                        existing_ids.add(slot)
                    elif isinstance(slot, dict) and slot.get("recipe_id"):
                        existing_ids.add(slot["recipe_id"])

        pantry_result = db.table("pantry_items").select("item_name, quantity, unit, category").eq(
            "user_id", current_user.id
        ).execute()
        pantry_items = pantry_result.data or []

        recently_used = await _fetch_recently_used_recipe_ids(db, current_user.id, meal_plan.get("week_start_date", ""))

        filled_count = 0
        exclude_ids = list(existing_ids)

        for day, meal_type in empty_slots:
            try:
                new_recipe_id = await recipe_shortlist_service.pick_top_for_slot(
                    preferences=preferences,
                    meal_type=meal_type,
                    exclude_recipe_ids=exclude_ids,
                    pantry_items=pantry_items,
                    recently_used_recipe_ids=recently_used,
                )
                if not new_recipe_id:
                    continue

                if day not in meals:
                    meals[day] = {}
                meals[day][meal_type] = {
                    "recipe_id": new_recipe_id,
                    "is_repeat": False,
                    "original_day": None,
                    "order": {"breakfast": 1, "snack": 2, "lunch": 3, "dinner": 4}.get(meal_type, 1),
                }
                filled_count += 1
                exclude_ids.append(new_recipe_id)
            except Exception as e:
                logger.error(f"Failed to fill {meal_type} for {day}: {e}")

        db.table("meal_plans").update({"meals": meals}).eq("id", meal_plan_id).execute()

        return {
            "message": f"Successfully filled {filled_count} empty slots",
            "filled_count": filled_count,
            "total_empty": len(empty_slots),
            "meals": meals,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fill remaining slots: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fill remaining slots: {str(e)}")


@router.post("/{meal_plan_id}/optimize-calories")
async def optimize_meal_plan_calories(
    meal_plan_id: str,
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Swap meals to better match daily calorie targets (rule-based, no AI)."""
    try:
        db = get_database()
        mp_result = db.table("meal_plans").select("*").eq("id", meal_plan_id).eq(
            "user_id", current_user.id
        ).execute()
        if not mp_result.data:
            raise HTTPException(status_code=404, detail="Meal plan not found")

        meal_plan = mp_result.data[0]
        meals = meal_plan.get("meals", {})
        selected_days = meal_plan.get("selected_days") or [
            "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
        ]

        user_result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
        profile_data = user_result.data[0].get("profile_data", {}) if user_result.data else {}
        preferences = profile_data.get("preferences", {})
        calorie_target = preferences.get("calorie_target") or 2000
        distribution = preferences.get("meal_calorie_distribution", {
            "breakfast": 20, "snack": 10, "lunch": 30, "dinner": 40
        })

        # Collect all recipe IDs
        unique_ids = set()
        for day_meals in meals.values():
            if isinstance(day_meals, dict):
                for slot in day_meals.values():
                    rid = slot if isinstance(slot, str) else (slot.get("recipe_id") if isinstance(slot, dict) else None)
                    if rid:
                        unique_ids.add(rid)

        if not unique_ids:
            return {"meal_plan_id": meal_plan_id, "optimized": False, "message": "No recipes in meal plan"}

        recipes_result = db.table("recipes").select(
            "id, title, calories, protein_grams, meal_type"
        ).in_("id", list(unique_ids)).execute()
        recipes_by_id = {r["id"]: r for r in recipes_result.data}

        # Find days most off-target
        days_needing_opt = []
        for day in selected_days:
            day_meals = meals.get(day, {})
            day_total = 0
            day_detail = {}
            for meal_type in ["breakfast", "snack", "lunch", "dinner"]:
                slot = day_meals.get(meal_type)
                rid = slot if isinstance(slot, str) else (slot.get("recipe_id") if isinstance(slot, dict) else None)
                if rid and rid in recipes_by_id:
                    cal = recipes_by_id[rid].get("calories") or 0
                    day_total += cal
                    day_detail[meal_type] = {
                        "recipe_id": rid,
                        "title": recipes_by_id[rid].get("title", "?"),
                        "calories": cal,
                        "target": int(calorie_target * distribution.get(meal_type, 25) / 100),
                    }
            if abs(day_total - calorie_target) > 200:
                days_needing_opt.append({"day": day, "total": day_total, "meals": day_detail})

        if not days_needing_opt:
            return {
                "meal_plan_id": meal_plan_id,
                "optimized": False,
                "message": "All days are within 200 calories of your target. No optimization needed!",
                "analysis": [],
            }

        swaps_made = 0
        analysis = []
        exclude_ids = list(unique_ids)

        for day_info in days_needing_opt:
            day = day_info["day"]
            # Find worst slot (furthest from its per-meal target, non-repeat)
            worst_slot = None
            worst_diff = 0
            for meal_type, info in day_info["meals"].items():
                slot = meals.get(day, {}).get(meal_type)
                if isinstance(slot, dict) and slot.get("is_repeat"):
                    continue
                diff = abs(info["calories"] - info["target"])
                if diff > worst_diff:
                    worst_diff = diff
                    worst_slot = meal_type

            if not worst_slot or worst_diff < 100:
                analysis.append({"day": day, "action": "skipped", "reason": "No slot far enough from target"})
                continue

            target_cal = day_info["meals"][worst_slot]["target"]
            old_recipe = day_info["meals"][worst_slot]
            cal_min = max(50, int(target_cal * 0.8))
            cal_max = int(target_cal * 1.2)

            query = db.table("recipes").select("id, title, calories, image_url, meal_type")
            query = query.contains("meal_type", [worst_slot.capitalize()])
            query = query.gte("calories", cal_min).lte("calories", cal_max)
            query = query.not_.is_("image_url", "null")
            dietary = preferences.get("dietary_restrictions", [])
            if dietary:
                query = query.contains("dietary_tags", dietary)
            query = query.order("likes_count", desc=True).limit(20)

            swap_result = query.execute()
            swap_candidates = [r for r in (swap_result.data or []) if r["id"] not in exclude_ids]
            if not swap_candidates:
                analysis.append({"day": day, "action": "no_swap_found", "slot": worst_slot})
                continue

            swap_candidates.sort(key=lambda r: abs((r.get("calories") or 0) - target_cal))
            new_recipe = swap_candidates[0]

            meals[day][worst_slot] = {
                "recipe_id": new_recipe["id"],
                "is_repeat": False,
                "original_day": None,
                "order": {"breakfast": 1, "snack": 2, "lunch": 3, "dinner": 4}.get(worst_slot, 1),
            }
            swaps_made += 1
            exclude_ids.append(new_recipe["id"])
            analysis.append({
                "day": day, "action": "swapped", "slot": worst_slot,
                "old_recipe": old_recipe["title"], "new_recipe": new_recipe["title"],
            })

        if swaps_made > 0:
            db.table("meal_plans").update({"meals": meals}).eq("id", meal_plan_id).execute()

        return {
            "meal_plan_id": meal_plan_id,
            "optimized": swaps_made > 0,
            "swaps_made": swaps_made,
            "message": f"Made {swaps_made} swap(s) to better match your {calorie_target} cal/day target." if swaps_made > 0 else "Could not find better alternatives.",
            "analysis": analysis,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to optimize calories: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to optimize meal plan: {str(e)}")


@router.get("/{meal_plan_id}/macro-summary")
async def get_meal_plan_macro_summary(
    meal_plan_id: str,
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get nutrition macro summary for a meal plan."""
    try:
        db = get_database()
        mp_result = db.table("meal_plans").select("*").eq("id", meal_plan_id).eq(
            "user_id", current_user.id
        ).execute()
        if not mp_result.data:
            raise HTTPException(status_code=404, detail="Meal plan not found")

        meal_plan = mp_result.data[0]
        meals = meal_plan.get("meals", {})

        all_recipe_ids = []
        unique_recipe_ids = set()

        for day_meals in meals.values():
            if isinstance(day_meals, dict):
                for slot in day_meals.values():
                    rid = slot if isinstance(slot, str) else (slot.get("recipe_id") if isinstance(slot, dict) else None)
                    if rid:
                        all_recipe_ids.append(rid)
                        unique_recipe_ids.add(rid)

        if not unique_recipe_ids:
            return {
                "meal_plan_id": meal_plan_id,
                "weekly_summary": nutrition_service.calculate_weekly_summary([]),
                "daily_breakdown": {},
                "validation_warnings": ["No recipes found in meal plan"],
            }

        recipes_result = db.table("recipes").select(
            "id, title, calories, protein_grams, carbs_grams, fat_grams"
        ).in_("id", list(unique_recipe_ids)).execute()
        recipes_by_id = {r["id"]: r for r in recipes_result.data}

        all_meals = [recipes_by_id[rid] for rid in all_recipe_ids if rid in recipes_by_id]

        all_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        selected_days = meal_plan.get("selected_days") or all_days
        num_days = len(selected_days)

        weekly_summary = nutrition_service.calculate_weekly_summary(all_meals, num_days)

        daily_breakdown = {}
        for day in selected_days:
            day_meals = meals.get(day, {})
            day_recipes = []
            for meal_type in ["breakfast", "snack", "lunch", "dinner"]:
                slot = day_meals.get(meal_type)
                rid = slot if isinstance(slot, str) else (slot.get("recipe_id") if isinstance(slot, dict) else None)
                if rid and rid in recipes_by_id:
                    day_recipes.append(recipes_by_id[rid])
            if day_recipes:
                daily_breakdown[day] = nutrition_service.calculate_daily_summary(day_recipes)
                daily_breakdown[day]["meal_count"] = len(day_recipes)

        validation_warnings = []
        for recipe in all_meals:
            v = nutrition_service.validate_nutrition(
                recipe.get("calories"), recipe.get("protein_grams"),
                recipe.get("carbs_grams"), recipe.get("fat_grams"),
            )
            for w in v.warnings[:2]:
                validation_warnings.append(f"{recipe.get('title', '?')}: {w}")

        user_result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
        profile_data = user_result.data[0].get("profile_data", {}) if user_result.data else {}
        preferences = profile_data.get("preferences", {})

        target_comparison = None
        cal_target = preferences.get("calorie_target")
        prot_target = preferences.get("protein_target_grams")
        if cal_target:
            avg = weekly_summary["daily_averages"]["calories"]
            target_comparison = {
                "calorie_target": cal_target,
                "calorie_daily_avg": avg,
                "calorie_difference": avg - cal_target,
                "calorie_on_target": abs(avg - cal_target) <= 200,
            }
        if prot_target:
            avg = weekly_summary["daily_averages"]["protein_grams"]
            target_comparison = target_comparison or {}
            target_comparison.update({
                "protein_target_grams": prot_target,
                "protein_daily_avg": avg,
                "protein_difference": avg - prot_target,
                "protein_on_target": abs(avg - prot_target) <= 20,
            })

        return {
            "meal_plan_id": meal_plan_id,
            "selected_days": selected_days,
            "num_days": num_days,
            "weekly_summary": weekly_summary,
            "daily_breakdown": daily_breakdown,
            "target_comparison": target_comparison,
            "validation_warnings": validation_warnings[:10],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get macro summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to calculate macro summary")


def _format_meal_plan(meal_plan: dict) -> dict:
    """Format a meal plan DB record for API response."""
    all_days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    return {
        "id": meal_plan["id"],
        "user_id": meal_plan["user_id"],
        "plan_name": meal_plan["plan_name"],
        "week_start_date": meal_plan["week_start_date"],
        "selected_days": meal_plan.get("selected_days") or all_days,
        "meals": meal_plan["meals"],
        "ai_optimize_uses": meal_plan.get("ai_optimize_uses", 0),
        "ai_optimize_remaining": max(0, AI_OPTIMIZE_MAX_USES - (meal_plan.get("ai_optimize_uses", 0) or 0)),
        "created_at": meal_plan["created_at"],
    }
