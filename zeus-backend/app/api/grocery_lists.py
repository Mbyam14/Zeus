"""
Grocery List API Routes

Endpoints for managing grocery lists generated from meal plans.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
import logging

from app.schemas.grocery_list import (
    GroceryListResponse,
    GroceryListItemResponse,
    GroceryListItemUpdatePurchased,
    GroceryListSummary
)
from app.schemas.user import UserResponse
from app.utils.dependencies import get_current_active_user
from app.services.grocery_list_service import grocery_list_service

logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/api/grocery-lists",
    tags=["Grocery Lists"],
    responses={404: {"description": "Not found"}}
)


@router.post("/{meal_plan_id}/generate", response_model=GroceryListResponse)
async def generate_grocery_list(
    meal_plan_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Generate grocery list from meal plan.

    This endpoint:
    - Extracts all ingredients from recipes in the meal plan
    - Aggregates ingredients with the same name
    - Matches ingredients against user's pantry
    - Calculates quantities needed after accounting for pantry stock
    - Categorizes items for easy shopping organization

    If a grocery list already exists for this meal plan, it will be updated
    with the latest recipe data.

    Args:
        meal_plan_id: ID of the meal plan to generate list from
        current_user: Authenticated user (injected)

    Returns:
        GroceryListResponse with all items grouped by category

    Raises:
        HTTPException 404: Meal plan not found or doesn't belong to user
        HTTPException 400: Meal plan has no recipes
        HTTPException 500: Database or service error
    """
    try:
        grocery_list = await grocery_list_service.generate_grocery_list(
            user_id=current_user.id,
            meal_plan_id=meal_plan_id
        )
        return grocery_list
    except ValueError as e:
        logger.error(f"ValueError in generate_grocery_list: {e}", exc_info=True)
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Exception in generate_grocery_list: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error generating grocery list: {str(e)}")


@router.get("/{grocery_list_id}", response_model=GroceryListResponse)
async def get_grocery_list(
    grocery_list_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Get grocery list by ID.

    Returns complete grocery list with all items grouped by category
    and summary statistics.

    Args:
        grocery_list_id: Grocery list ID
        current_user: Authenticated user (injected)

    Returns:
        GroceryListResponse with items and statistics

    Raises:
        HTTPException 404: Grocery list not found or doesn't belong to user
        HTTPException 500: Database or service error
    """
    try:
        grocery_list = await grocery_list_service.get_grocery_list(
            user_id=current_user.id,
            grocery_list_id=grocery_list_id
        )
        return grocery_list
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching grocery list: {str(e)}")


@router.get("/meal-plan/{meal_plan_id}", response_model=Optional[GroceryListResponse])
async def get_grocery_list_by_meal_plan(
    meal_plan_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Get grocery list for a specific meal plan.

    Useful for checking if a grocery list already exists for a meal plan
    before generating a new one.

    Args:
        meal_plan_id: Meal plan ID
        current_user: Authenticated user (injected)

    Returns:
        GroceryListResponse if found, null otherwise

    Raises:
        HTTPException 500: Database or service error
    """
    try:
        grocery_list = await grocery_list_service.get_grocery_list_by_meal_plan(
            user_id=current_user.id,
            meal_plan_id=meal_plan_id
        )
        return grocery_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching grocery list: {str(e)}")


@router.put("/items/{item_id}/purchased", response_model=GroceryListItemResponse)
async def toggle_item_purchased(
    item_id: str,
    update_data: GroceryListItemUpdatePurchased,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Update purchased status of a grocery list item.

    Allows users to check off items as they shop.

    Args:
        item_id: Grocery list item ID
        update_data: Contains is_purchased boolean
        current_user: Authenticated user (injected)

    Returns:
        Updated GroceryListItemResponse

    Raises:
        HTTPException 404: Item not found or user doesn't own the grocery list
        HTTPException 500: Database or service error
    """
    try:
        item = await grocery_list_service.update_item_purchased_status(
            user_id=current_user.id,
            item_id=item_id,
            is_purchased=update_data.is_purchased
        )
        return item
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating item: {str(e)}")


@router.post("/{grocery_list_id}/mark-purchased", response_model=GroceryListResponse)
async def mark_all_purchased(
    grocery_list_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Mark entire grocery list as purchased.

    Sets is_purchased=true for all items in the list and records
    the purchase timestamp.

    Useful for when user completes shopping trip.

    Args:
        grocery_list_id: Grocery list ID
        current_user: Authenticated user (injected)

    Returns:
        Updated GroceryListResponse

    Raises:
        HTTPException 404: Grocery list not found or doesn't belong to user
        HTTPException 500: Database or service error
    """
    try:
        grocery_list = await grocery_list_service.mark_list_as_purchased(
            user_id=current_user.id,
            grocery_list_id=grocery_list_id
        )
        return grocery_list
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error marking list as purchased: {str(e)}")


@router.delete("/{grocery_list_id}")
async def delete_grocery_list(
    grocery_list_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Delete a grocery list and all its items.

    Permanently removes the grocery list from the database.
    Items will cascade delete automatically.

    Args:
        grocery_list_id: Grocery list ID
        current_user: Authenticated user (injected)

    Returns:
        Success message

    Raises:
        HTTPException 404: Grocery list not found or doesn't belong to user
        HTTPException 500: Database or service error
    """
    try:
        result = await grocery_list_service.delete_grocery_list(
            user_id=current_user.id,
            grocery_list_id=grocery_list_id
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting grocery list: {str(e)}")
