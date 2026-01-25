from typing import List, Optional
from datetime import datetime, date, timedelta
from fastapi import HTTPException, status
import anthropic
import json
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
from app.database import get_database
from app.config import settings
from app.schemas.pantry import (
    PantryItemCreate, PantryItemUpdate, PantryItemResponse,
    PantryFilter, BulkPantryAdd, PantryCategory, IngredientLibraryItem,
    DetectedPantryItem, ImageAnalysisResponse, ImageAnalysisRequest
)

logger = logging.getLogger(__name__)

# Timeout for image analysis (in seconds)
IMAGE_ANALYSIS_TIMEOUT = 45


class PantryService:
    def __init__(self):
        self.db = get_database()
        self.executor = ThreadPoolExecutor(max_workers=2)
        try:
            self.claude_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        except Exception as e:
            logger.warning(f"Claude API not configured for pantry service: {e}")
            self.claude_client = None

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

    async def analyze_pantry_image(self, request: ImageAnalysisRequest, user_id: str) -> ImageAnalysisResponse:
        """Analyze an image to detect pantry items using Claude Vision"""
        if not self.claude_client:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="AI image analysis service not configured"
            )

        # Get user's existing pantry items for duplicate detection
        existing_items = await self.get_user_pantry_items(user_id)
        existing_names = {item.item_name.lower().strip() for item in existing_items}
        existing_items_map = {item.item_name.lower().strip(): item for item in existing_items}

        # Build prompt for Claude Vision
        prompt = self._build_image_analysis_prompt(list(existing_names))

        try:
            # Call Claude Vision API with timeout
            logger.info(f"Calling Claude Vision for pantry image analysis (timeout: {IMAGE_ANALYSIS_TIMEOUT}s)")

            loop = asyncio.get_event_loop()
            response_text = await asyncio.wait_for(
                loop.run_in_executor(
                    self.executor,
                    self._call_claude_vision_sync,
                    request.image_base64,
                    request.image_type,
                    prompt
                ),
                timeout=IMAGE_ANALYSIS_TIMEOUT
            )

            # Parse the response
            detected_items = self._parse_image_analysis_response(response_text)

            # Check each item against existing pantry
            new_items_count = 0
            existing_items_count = 0

            for item in detected_items:
                item_name_lower = item.item_name.lower().strip()

                # Check for duplicates (exact match or similar)
                is_duplicate = self._check_item_duplicate(item_name_lower, existing_names)

                if is_duplicate:
                    item.already_in_pantry = True
                    existing_items_count += 1
                    # Find and set the existing pantry item ID
                    for existing_name, existing_item in existing_items_map.items():
                        if self._items_are_similar(item_name_lower, existing_name):
                            item.existing_pantry_id = existing_item.id
                            break
                else:
                    new_items_count += 1

            return ImageAnalysisResponse(
                detected_items=detected_items,
                total_detected=len(detected_items),
                new_items_count=new_items_count,
                existing_items_count=existing_items_count,
                analysis_notes=f"Found {len(detected_items)} items. {new_items_count} new, {existing_items_count} already in pantry."
            )

        except asyncio.TimeoutError:
            logger.error(f"Claude Vision API call timed out after {IMAGE_ANALYSIS_TIMEOUT} seconds")
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail=f"Image analysis timed out after {IMAGE_ANALYSIS_TIMEOUT} seconds. Please try again."
            )
        except Exception as e:
            logger.error(f"Failed to analyze image with Claude Vision: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to analyze image. Please try again."
            )

    def _call_claude_vision_sync(self, image_base64: str, image_type: str, prompt: str) -> str:
        """Synchronous Claude Vision API call for use in executor"""
        response = self.claude_client.messages.create(
            model="claude-3-7-sonnet-20250219",
            max_tokens=2000,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": image_type,
                                "data": image_base64
                            }
                        },
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ]
                }
            ]
        )
        return response.content[0].text

    def _build_image_analysis_prompt(self, existing_items: List[str]) -> str:
        """Build prompt for pantry image analysis"""
        existing_str = ", ".join(existing_items[:50]) if existing_items else "None"

        return f"""Analyze this image of a refrigerator, pantry, cabinet, or food storage area.
Identify all visible food items, ingredients, and groceries.

The user already has these items in their pantry (for reference): {existing_str}

For each item you can clearly identify, provide:
1. The item name (use common grocery names, e.g., "milk" not "dairy product")
2. Estimated quantity if visible
3. Unit of measurement if applicable
4. Category (must be one of: Produce, Dairy, Protein, Grains, Spices, Condiments, Beverages, Frozen, Pantry, Other)
5. Your confidence level (0.0-1.0) in the identification

Guidelines:
- Only include items you can clearly see and identify
- Use standard grocery item names
- Be specific (e.g., "cheddar cheese" not just "cheese" if you can tell)
- For quantity, estimate based on what's visible (e.g., "1" for a carton, "6" for eggs visible)
- Set confidence lower for partially visible or obscured items
- DO NOT include items that are too blurry or unclear to identify
- Focus on food items only, ignore non-food items

Respond with ONLY a valid JSON array in this exact format:
[
    {{
        "item_name": "Milk",
        "quantity": 1,
        "unit": "gallon",
        "category": "Dairy",
        "confidence": 0.95
    }},
    {{
        "item_name": "Eggs",
        "quantity": 12,
        "unit": "count",
        "category": "Protein",
        "confidence": 0.9
    }}
]

If no food items are visible, return an empty array: []"""

    def _parse_image_analysis_response(self, response_text: str) -> List[DetectedPantryItem]:
        """Parse Claude Vision response into DetectedPantryItem list"""
        try:
            # Extract JSON array from response
            start_idx = response_text.find('[')
            end_idx = response_text.rfind(']') + 1

            if start_idx == -1 or end_idx == 0:
                logger.warning("No JSON array found in image analysis response")
                return []

            json_str = response_text[start_idx:end_idx]
            items_data = json.loads(json_str)

            detected_items = []
            for item in items_data:
                # Map category string to enum
                category_str = item.get("category", "Other")
                try:
                    category = PantryCategory(category_str)
                except ValueError:
                    category = PantryCategory.OTHER

                detected_item = DetectedPantryItem(
                    item_name=item.get("item_name", "Unknown"),
                    quantity=item.get("quantity"),
                    unit=item.get("unit"),
                    category=category,
                    confidence=min(max(item.get("confidence", 0.5), 0.0), 1.0),
                    already_in_pantry=False,
                    existing_pantry_id=None
                )
                detected_items.append(detected_item)

            # Sort by confidence (highest first)
            detected_items.sort(key=lambda x: x.confidence, reverse=True)

            return detected_items

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse image analysis JSON: {e}")
            return []
        except Exception as e:
            logger.error(f"Failed to parse image analysis response: {e}")
            return []

    def _check_item_duplicate(self, item_name: str, existing_names: set) -> bool:
        """Check if an item name is a duplicate of existing items"""
        # Direct match
        if item_name in existing_names:
            return True

        # Check for similar items
        for existing_name in existing_names:
            if self._items_are_similar(item_name, existing_name):
                return True

        return False

    def _items_are_similar(self, name1: str, name2: str) -> bool:
        """Check if two item names are similar (accounting for variations)"""
        name1 = name1.lower().strip()
        name2 = name2.lower().strip()

        # Exact match
        if name1 == name2:
            return True

        # One contains the other (e.g., "milk" and "whole milk")
        if name1 in name2 or name2 in name1:
            return True

        # Common variations
        variations = {
            "egg": ["eggs", "egg"],
            "milk": ["milk", "whole milk", "2% milk", "skim milk"],
            "butter": ["butter", "unsalted butter", "salted butter"],
            "cheese": ["cheese", "cheddar cheese", "mozzarella cheese", "parmesan"],
            "chicken": ["chicken", "chicken breast", "chicken thigh"],
            "tomato": ["tomato", "tomatoes"],
            "onion": ["onion", "onions"],
            "potato": ["potato", "potatoes"],
            "apple": ["apple", "apples"],
            "orange": ["orange", "oranges"],
            "carrot": ["carrot", "carrots"],
            "lettuce": ["lettuce", "romaine lettuce", "iceberg lettuce"],
        }

        for base, variants in variations.items():
            if name1 in variants and name2 in variants:
                return True
            # Check if both names contain the base ingredient
            if base in name1 and base in name2:
                return True

        return False

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
