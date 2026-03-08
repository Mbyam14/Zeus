from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from app.schemas.pantry import (
    PantryItemCreate, PantryItemUpdate, PantryItemResponse,
    PantryFilter, BulkPantryAdd, BulkPantryDelete, PantryCategory,
    ImageAnalysisRequest, ImageAnalysisResponse
)
from app.schemas.user import UserResponse
from app.services.pantry_service import pantry_service
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/api/pantry", tags=["Pantry"])


@router.post("/", response_model=PantryItemResponse)
async def create_pantry_item(
    item_data: PantryItemCreate,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Create a new pantry item.

    Requires authentication. The item will be associated with the current user.
    """
    return await pantry_service.create_pantry_item(item_data, current_user.id)


@router.post("/bulk-delete")
async def bulk_delete_pantry_items(
    bulk_data: BulkPantryDelete,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """Delete multiple pantry items by ID."""
    deleted_count = await pantry_service.bulk_delete_pantry_items(bulk_data.item_ids, current_user.id)
    return {"message": f"Deleted {deleted_count} pantry items", "deleted_count": deleted_count}


@router.get("/", response_model=List[PantryItemResponse])
async def get_my_pantry_items(
    category: Optional[PantryCategory] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search by item name"),
    expiring_soon: Optional[bool] = Query(None, description="Only items expiring within 3 days"),
    expired: Optional[bool] = Query(None, description="Only expired items"),
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Get all pantry items for the current user.

    Supports filtering by category, search term, expiration status.
    """
    filters = PantryFilter(
        category=category,
        search=search,
        expiring_soon=expiring_soon,
        expired=expired
    )
    return await pantry_service.get_user_pantry_items(current_user.id, filters)


@router.get("/{item_id}", response_model=PantryItemResponse)
async def get_pantry_item(
    item_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Get a specific pantry item by ID.

    Requires authentication and ownership.
    """
    return await pantry_service.get_pantry_item_by_id(item_id, current_user.id)


@router.put("/{item_id}", response_model=PantryItemResponse)
async def update_pantry_item(
    item_id: str,
    item_data: PantryItemUpdate,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Update a pantry item.

    Only the item owner can update their own items.
    """
    return await pantry_service.update_pantry_item(item_id, item_data, current_user.id)


@router.delete("/clear-all")
async def clear_all_pantry_items(
    current_user: UserResponse = Depends(get_current_active_user)
):
    """Delete all pantry items for the current user."""
    deleted_count = await pantry_service.clear_all_pantry_items(current_user.id)
    return {"message": f"Deleted {deleted_count} pantry items", "deleted_count": deleted_count}


@router.delete("/{item_id}")
async def delete_pantry_item(
    item_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Delete a pantry item.

    Only the item owner can delete their own items.
    """
    await pantry_service.delete_pantry_item(item_id, current_user.id)
    return {"message": "Pantry item deleted successfully"}


@router.post("/bulk", response_model=List[PantryItemResponse])
async def bulk_add_pantry_items(
    bulk_data: BulkPantryAdd,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Add multiple pantry items at once.

    Useful for adding items from a photo scan (future feature).
    """
    return await pantry_service.bulk_add_pantry_items(bulk_data, current_user.id)


@router.get("/ingredients/search", response_model=List[dict])
async def search_ingredients(
    query: str = Query("", description="Search term (empty returns all)"),
    category: Optional[PantryCategory] = Query(None, description="Filter by category"),
    limit: int = Query(20, ge=1, le=50, description="Max results to return"),
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Search ingredient library for autocomplete.

    Returns matching ingredients with their categories and common units.
    """
    return await pantry_service.search_ingredient_library(query, category, limit)


@router.get("/expiring/alerts", response_model=List[PantryItemResponse])
async def get_expiring_items(
    days: int = Query(7, ge=1, le=30, description="Days threshold for expiration alert"),
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Get items expiring within the specified days threshold.

    Default is 7 days. Useful for expiration alerts.
    """
    return await pantry_service.get_expiring_items(current_user.id, days)


@router.post("/analyze-image", response_model=ImageAnalysisResponse)
async def analyze_pantry_image(
    request: ImageAnalysisRequest,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Analyze an image to detect pantry items using AI vision.

    Upload a base64-encoded image of your fridge, pantry, or cabinet.
    The AI will identify food items and check against your existing pantry
    to flag duplicates.

    Returns a list of detected items with confidence scores and duplicate flags.
    """
    return await pantry_service.analyze_pantry_image(request, current_user.id)
