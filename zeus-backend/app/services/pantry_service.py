from typing import List, Optional
from datetime import datetime, date, timedelta
from fastapi import HTTPException, status
from app.database import get_database
from app.schemas.pantry import (
    PantryItemCreate, PantryItemUpdate, PantryItemResponse,
    PantryFilter, BulkPantryAdd, PantryCategory, IngredientLibraryItem
)


class PantryService:
    def __init__(self):
        self.db = get_database()

    async def create_pantry_item(self, item_data: PantryItemCreate, user_id: str) -> PantryItemResponse:
        """Create a new pantry item"""
        item_record = {
            "user_id": user_id,
            "item_name": item_data.item_name,
            "quantity": item_data.quantity,
            "unit": item_data.unit,
            "category": item_data.category.value,
            "expires_at": item_data.expires_at.isoformat() if item_data.expires_at else None
        }

        result = self.db.table("pantry_items").insert(item_record).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create pantry item"
            )

        created_item = result.data[0]
        return self._format_pantry_response(created_item)

    async def get_user_pantry_items(self, user_id: str, filters: Optional[PantryFilter] = None) -> List[PantryItemResponse]:
        """Get all pantry items for a user with optional filters"""
        query = self.db.table("pantry_items").select("*").eq("user_id", user_id)

        # Apply filters
        if filters:
            if filters.category:
                query = query.eq("category", filters.category.value)

            if filters.search:
                query = query.ilike("item_name", f"%{filters.search}%")

            if filters.expiring_soon:
                threshold = (date.today() + timedelta(days=3)).isoformat()
                query = query.lte("expires_at", threshold).gte("expires_at", date.today().isoformat())

            if filters.expired:
                query = query.lt("expires_at", date.today().isoformat())

        query = query.order("category").order("item_name")
        result = query.execute()

        items = []
        for item_data in result.data:
            item_response = self._format_pantry_response(item_data)
            items.append(item_response)

        return items

    async def get_pantry_item_by_id(self, item_id: str, user_id: str) -> PantryItemResponse:
        """Get a specific pantry item (with ownership check)"""
        result = self.db.table("pantry_items").select("*").eq("id", item_id).eq("user_id", user_id).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pantry item not found"
            )

        return self._format_pantry_response(result.data[0])

    async def update_pantry_item(self, item_id: str, item_data: PantryItemUpdate, user_id: str) -> PantryItemResponse:
        """Update a pantry item (only by owner)"""
        existing_item = self.db.table("pantry_items").select("*").eq("id", item_id).eq("user_id", user_id).execute()

        if not existing_item.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pantry item not found or you don't have permission to edit it"
            )

        update_data = {}
        if item_data.item_name is not None:
            update_data["item_name"] = item_data.item_name
        if item_data.quantity is not None:
            update_data["quantity"] = item_data.quantity
        if item_data.unit is not None:
            update_data["unit"] = item_data.unit
        if item_data.category is not None:
            update_data["category"] = item_data.category.value
        if item_data.expires_at is not None:
            update_data["expires_at"] = item_data.expires_at.isoformat()

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No valid fields to update"
            )

        result = self.db.table("pantry_items").update(update_data).eq("id", item_id).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update pantry item"
            )

        return self._format_pantry_response(result.data[0])

    async def delete_pantry_item(self, item_id: str, user_id: str) -> bool:
        """Delete a pantry item (only by owner)"""
        existing_item = self.db.table("pantry_items").select("*").eq("id", item_id).eq("user_id", user_id).execute()

        if not existing_item.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pantry item not found or you don't have permission to delete it"
            )

        self.db.table("pantry_items").delete().eq("id", item_id).execute()
        return True

    async def bulk_add_pantry_items(self, bulk_data: BulkPantryAdd, user_id: str) -> List[PantryItemResponse]:
        """Add multiple pantry items at once"""
        items_to_insert = []
        for item in bulk_data.items:
            item_record = {
                "user_id": user_id,
                "item_name": item.item_name,
                "quantity": item.quantity,
                "unit": item.unit,
                "category": item.category.value,
                "expires_at": item.expires_at.isoformat() if item.expires_at else None
            }
            items_to_insert.append(item_record)

        result = self.db.table("pantry_items").insert(items_to_insert).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to add pantry items"
            )

        return [self._format_pantry_response(item) for item in result.data]

    async def search_ingredient_library(self, query: str, category: Optional[PantryCategory] = None, limit: int = 20) -> List[dict]:
        """Search ingredient library for autocomplete"""
        search_query = self.db.table("ingredient_library").select("*")

        if query:
            search_query = search_query.ilike("name", f"%{query}%")

        if category:
            search_query = search_query.eq("category", category.value)

        search_query = search_query.order("name").limit(limit)

        result = search_query.execute()
        return result.data if result.data else []

    async def get_expiring_items(self, user_id: str, days_threshold: int = 7) -> List[PantryItemResponse]:
        """Get items expiring within the specified days threshold"""
        threshold_date = (date.today() + timedelta(days=days_threshold)).isoformat()
        today = date.today().isoformat()

        result = self.db.table("pantry_items").select("*").eq("user_id", user_id).gte("expires_at", today).lte("expires_at", threshold_date).order("expires_at").execute()

        items = []
        for item_data in result.data:
            item_response = self._format_pantry_response(item_data)
            items.append(item_response)

        return items

    def _format_pantry_response(self, item_data: dict) -> PantryItemResponse:
        """Format raw pantry item data into PantryItemResponse"""
        is_expiring_soon = False
        is_expired = False

        if item_data.get("expires_at"):
            expires_at_date = date.fromisoformat(item_data["expires_at"])
            today = date.today()
            days_until_expiry = (expires_at_date - today).days

            is_expired = days_until_expiry < 0
            is_expiring_soon = 0 <= days_until_expiry <= 7

        return PantryItemResponse(
            id=item_data["id"],
            user_id=item_data["user_id"],
            item_name=item_data["item_name"],
            quantity=item_data.get("quantity"),
            unit=item_data.get("unit"),
            category=item_data["category"],
            expires_at=date.fromisoformat(item_data["expires_at"]) if item_data.get("expires_at") else None,
            created_at=datetime.fromisoformat(item_data["created_at"].replace("Z", "+00:00")),
            is_expiring_soon=is_expiring_soon,
            is_expired=is_expired
        )


# Global pantry service instance
pantry_service = PantryService()
