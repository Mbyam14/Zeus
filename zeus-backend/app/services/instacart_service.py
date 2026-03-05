"""
Instacart Service

Handles integration with Instacart Developer Platform:
- Product search and matching
- Cart creation and management
- Store selection
- Order tracking via webhooks
"""

import httpx
import re
import asyncio
import logging
from typing import List, Dict, Optional, Tuple, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from difflib import SequenceMatcher

from app.config import settings
from app.database import get_database
from app.schemas.instacart import (
    InstacartCartResponse,
    InstacartRetailer,
    ProductSearchResult
)

logger = logging.getLogger(__name__)

# Constants
PRODUCT_CACHE_TTL_HOURS = 24
RETRY_ATTEMPTS = 3
REQUEST_TIMEOUT = 30.0


@dataclass
class ProductMatchResult:
    """Result of matching a grocery item to Instacart product."""
    grocery_item_id: str
    original_name: str
    match_status: str  # matched, not_found, low_confidence
    matched_product: Optional[Dict[str, Any]] = None
    alternatives: List[Dict[str, Any]] = field(default_factory=list)
    confidence: float = 0.0


class InstacartService:
    """Service for Instacart Developer Platform integration."""

    def __init__(self):
        self.api_key = settings.instacart_api_key
        self.base_url = settings.instacart_api_url
        self.db = get_database()
        self.client: Optional[httpx.AsyncClient] = None

        if not self.api_key:
            logger.warning("Instacart API key not configured. Service will be unavailable.")

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self.client is None or self.client.is_closed:
            self.client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                timeout=REQUEST_TIMEOUT
            )
        return self.client

    def _check_configured(self):
        """Check if service is configured."""
        if not self.api_key:
            raise ValueError("Instacart service not configured. Please set INSTACART_API_KEY.")

    # ========================================================================
    # RETAILER METHODS
    # ========================================================================

    async def get_available_retailers(
        self,
        zip_code: str
    ) -> List[InstacartRetailer]:
        """
        Get list of retailers available in user's area.

        Args:
            zip_code: User's zip code for location-based results

        Returns:
            List of available retailers with metadata
        """
        self._check_configured()

        try:
            client = await self._get_client()
            response = await client.get(
                "/retailers",
                params={"postal_code": zip_code}
            )
            response.raise_for_status()

            data = response.json()
            retailers = []

            for retailer in data.get("retailers", []):
                retailers.append(InstacartRetailer(
                    id=retailer["id"],
                    name=retailer["name"],
                    logo_url=retailer.get("logo_url"),
                    delivery_fee=retailer.get("delivery_fee"),
                    min_order=retailer.get("min_order"),
                    estimated_delivery=retailer.get("estimated_delivery_time")
                ))

            return retailers

        except httpx.HTTPStatusError as e:
            logger.error(f"Instacart API error getting retailers: {e}")
            raise ValueError(f"Failed to fetch retailers: {e.response.status_code}")
        except httpx.RequestError as e:
            logger.error(f"Request error getting retailers: {e}")
            raise ValueError("Failed to connect to Instacart")

    async def get_user_preferences(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user's Instacart preferences."""
        result = self.db.table("user_instacart_preferences")\
            .select("*")\
            .eq("user_id", user_id)\
            .execute()

        if result.data:
            return result.data[0]
        return None

    async def save_user_retailer_preference(
        self,
        user_id: str,
        retailer_id: str,
        zip_code: str
    ) -> None:
        """Save user's preferred retailer."""
        existing = self.db.table("user_instacart_preferences")\
            .select("id")\
            .eq("user_id", user_id)\
            .execute()

        if existing.data:
            self.db.table("user_instacart_preferences").update({
                "default_retailer_id": retailer_id,
                "zip_code": zip_code,
                "updated_at": datetime.utcnow().isoformat()
            }).eq("user_id", user_id).execute()
        else:
            self.db.table("user_instacart_preferences").insert({
                "user_id": user_id,
                "default_retailer_id": retailer_id,
                "zip_code": zip_code
            }).execute()

    # ========================================================================
    # PRODUCT SEARCH & MATCHING
    # ========================================================================

    async def search_product(
        self,
        query: str,
        retailer_id: str,
        use_cache: bool = True
    ) -> List[ProductSearchResult]:
        """
        Search for a product on Instacart.

        Args:
            query: Product name to search for
            retailer_id: Retailer to search within
            use_cache: Whether to check cache first

        Returns:
            List of matching products
        """
        self._check_configured()

        normalized_query = self._normalize_ingredient_name(query)

        # Check cache first
        if use_cache:
            cached = await self._get_cached_product(normalized_query, retailer_id)
            if cached:
                return [cached]

        try:
            client = await self._get_client()
            response = await client.get(
                "/products/search",
                params={
                    "query": query,
                    "retailer_id": retailer_id,
                    "limit": 5
                }
            )
            response.raise_for_status()

            data = response.json()
            products = []

            for product in data.get("products", []):
                result = ProductSearchResult(
                    product_id=product["id"],
                    name=product["name"],
                    image_url=product.get("image_url"),
                    unit_price=product.get("price"),
                    unit_size=product.get("size"),
                    availability=product.get("availability", "available")
                )
                products.append(result)

            # Cache the best match
            if products:
                await self._cache_product(normalized_query, retailer_id, products[0])

            return products

        except httpx.HTTPStatusError as e:
            logger.error(f"Instacart product search error: {e}")
            return []
        except httpx.RequestError as e:
            logger.error(f"Request error searching products: {e}")
            return []

    async def match_grocery_items(
        self,
        items: List[Dict[str, Any]],
        retailer_id: str
    ) -> Tuple[List[ProductMatchResult], Dict[str, Any]]:
        """
        Match grocery list items to Instacart products.

        Uses parallel requests for performance.

        Args:
            items: Grocery list items to match
            retailer_id: Target retailer

        Returns:
            Tuple of (match results, summary stats)
        """
        # Filter to items that need to be purchased
        items_to_match = [
            item for item in items
            if not item.get("is_purchased") and not item.get("have_in_pantry")
        ]

        if not items_to_match:
            return [], {"total_items": 0, "matched": 0, "not_found": 0, "match_rate": 0}

        # Match items in parallel (with concurrency limit)
        semaphore = asyncio.Semaphore(5)  # Max 5 concurrent requests

        async def match_with_limit(item):
            async with semaphore:
                return await self._match_single_item(item, retailer_id)

        tasks = [match_with_limit(item) for item in items_to_match]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        match_results = []
        matched_count = 0
        not_found_count = 0

        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Error matching item: {result}")
                match_results.append(ProductMatchResult(
                    grocery_item_id=items_to_match[i].get("id", ""),
                    original_name=items_to_match[i].get("item_name", "Unknown"),
                    match_status="error"
                ))
                not_found_count += 1
            else:
                match_results.append(result)
                if result.match_status == "matched":
                    matched_count += 1
                else:
                    not_found_count += 1

        summary = {
            "total_items": len(items_to_match),
            "matched": matched_count,
            "not_found": not_found_count,
            "match_rate": round(matched_count / len(items_to_match) * 100, 1) if items_to_match else 0
        }

        return match_results, summary

    async def _match_single_item(
        self,
        item: Dict[str, Any],
        retailer_id: str
    ) -> ProductMatchResult:
        """Match a single grocery item to Instacart products."""
        item_name = item.get("item_name", "")
        item_id = item.get("id", "")

        # Search for products
        products = await self.search_product(
            query=item_name,
            retailer_id=retailer_id
        )

        if not products:
            return ProductMatchResult(
                grocery_item_id=item_id,
                original_name=item_name,
                match_status="not_found",
                confidence=0.0
            )

        # Use first result as best match
        best_match = products[0]
        confidence = self._calculate_match_confidence(item_name, best_match.name)

        return ProductMatchResult(
            grocery_item_id=item_id,
            original_name=item_name,
            match_status="matched" if confidence > 0.5 else "low_confidence",
            matched_product={
                "id": best_match.product_id,
                "name": best_match.name,
                "price": best_match.unit_price,
                "image_url": best_match.image_url,
                "unit_size": best_match.unit_size
            },
            alternatives=[{
                "id": p.product_id,
                "name": p.name,
                "price": p.unit_price,
                "image_url": p.image_url
            } for p in products[1:4]],
            confidence=confidence
        )

    # ========================================================================
    # CART MANAGEMENT
    # ========================================================================

    async def create_cart(
        self,
        user_id: str,
        grocery_list_id: str,
        retailer_id: str,
        retailer_name: str,
        matched_items: List[ProductMatchResult]
    ) -> InstacartCartResponse:
        """
        Create an Instacart cart with matched products.

        Args:
            user_id: Zeus user ID
            grocery_list_id: Source grocery list
            retailer_id: Selected retailer
            retailer_name: Retailer display name
            matched_items: Products to add to cart

        Returns:
            Cart response with checkout URL
        """
        self._check_configured()

        # Build cart items for Instacart API
        cart_items = []
        for match in matched_items:
            if match.match_status in ["matched", "low_confidence"] and match.matched_product:
                cart_items.append({
                    "product_id": match.matched_product["id"],
                    "quantity": 1,
                    "note": f"For: {match.original_name}"
                })

        if not cart_items:
            raise ValueError("No items could be matched for cart creation")

        try:
            client = await self._get_client()
            response = await client.post(
                "/carts",
                json={
                    "retailer_id": retailer_id,
                    "items": cart_items,
                    "metadata": {
                        "source": "zeus_meal_planning",
                        "grocery_list_id": grocery_list_id
                    }
                }
            )
            response.raise_for_status()

            data = response.json()

            # Save cart to database
            cart_record = self.db.table("instacart_carts").insert({
                "user_id": user_id,
                "grocery_list_id": grocery_list_id,
                "instacart_cart_id": data.get("cart_id"),
                "instacart_checkout_url": data.get("checkout_url"),
                "retailer_id": retailer_id,
                "retailer_name": retailer_name,
                "status": "created",
                "total_items_sent": len(matched_items),
                "items_matched": len(cart_items),
                "items_not_found": len(matched_items) - len(cart_items)
            }).execute()

            cart_id = cart_record.data[0]["id"]

            # Save individual cart items
            for match in matched_items:
                self.db.table("instacart_cart_items").insert({
                    "instacart_cart_id": cart_id,
                    "grocery_list_item_id": match.grocery_item_id if match.grocery_item_id else None,
                    "original_item_name": match.original_name,
                    "instacart_product_id": match.matched_product["id"] if match.matched_product else None,
                    "matched_product_name": match.matched_product["name"] if match.matched_product else None,
                    "matched_unit_price": match.matched_product.get("price") if match.matched_product else None,
                    "match_status": match.match_status,
                    "match_confidence": match.confidence
                }).execute()

            return InstacartCartResponse(
                id=cart_id,
                instacart_cart_id=data.get("cart_id"),
                checkout_url=data.get("checkout_url"),
                retailer_id=retailer_id,
                retailer_name=retailer_name,
                total_items=len(matched_items),
                items_matched=len(cart_items),
                items_not_found=len(matched_items) - len(cart_items),
                status="created"
            )

        except httpx.HTTPStatusError as e:
            logger.error(f"Instacart cart creation error: {e}")
            raise ValueError(f"Failed to create Instacart cart: {e.response.status_code}")
        except httpx.RequestError as e:
            logger.error(f"Request error creating cart: {e}")
            raise ValueError("Failed to connect to Instacart")

    async def get_cart_status(
        self,
        user_id: str,
        cart_id: str
    ) -> Optional[Dict[str, Any]]:
        """Get current status of an Instacart cart."""
        result = self.db.table("instacart_carts")\
            .select("*")\
            .eq("id", cart_id)\
            .eq("user_id", user_id)\
            .execute()

        if not result.data:
            return None

        return result.data[0]

    async def get_cart_items(self, cart_id: str) -> List[Dict[str, Any]]:
        """Get items in a cart."""
        result = self.db.table("instacart_cart_items")\
            .select("*")\
            .eq("instacart_cart_id", cart_id)\
            .execute()

        return result.data if result.data else []

    # ========================================================================
    # WEBHOOK HANDLING
    # ========================================================================

    async def handle_webhook(
        self,
        event_type: str,
        payload: Dict[str, Any]
    ) -> None:
        """
        Process webhook events from Instacart.

        Event types:
        - order.created
        - order.updated
        - order.completed
        - order.cancelled
        """
        instacart_cart_id = payload.get("cart_id")
        if not instacart_cart_id:
            logger.warning(f"Webhook missing cart_id: {event_type}")
            return

        # Find cart by Instacart cart ID
        result = self.db.table("instacart_carts")\
            .select("id")\
            .eq("instacart_cart_id", instacart_cart_id)\
            .execute()

        if not result.data:
            logger.warning(f"Cart not found for webhook: {instacart_cart_id}")
            return

        cart_db_id = result.data[0]["id"]

        update_data = {
            "updated_at": datetime.utcnow().isoformat()
        }

        if event_type == "order.created":
            update_data["order_id"] = payload.get("order_id")
            update_data["order_status"] = "pending"
            update_data["status"] = "ordered"

        elif event_type == "order.updated":
            update_data["order_status"] = payload.get("status")
            if payload.get("estimated_delivery_time"):
                update_data["estimated_delivery_time"] = payload["estimated_delivery_time"]

        elif event_type == "order.completed":
            update_data["order_status"] = "delivered"
            update_data["status"] = "completed"
            update_data["completed_at"] = datetime.utcnow().isoformat()
            update_data["order_total"] = payload.get("total")

        elif event_type == "order.cancelled":
            update_data["order_status"] = "cancelled"
            update_data["status"] = "failed"

        self.db.table("instacart_carts")\
            .update(update_data)\
            .eq("id", cart_db_id)\
            .execute()

        logger.info(f"Processed webhook {event_type} for cart {cart_db_id}")

    # ========================================================================
    # PRIVATE HELPER METHODS
    # ========================================================================

    def _normalize_ingredient_name(self, name: str) -> str:
        """Normalize ingredient name for caching and matching."""
        if not name:
            return ""

        # Lowercase and trim
        normalized = name.lower().strip()

        # Remove content in parentheses
        normalized = re.sub(r'\([^)]*\)', '', normalized).strip()

        # Remove common modifiers
        modifiers = ['fresh', 'frozen', 'dried', 'organic', 'chopped', 'diced',
                     'minced', 'sliced', 'whole', 'raw', 'cooked', 'canned']
        for mod in modifiers:
            normalized = re.sub(rf'\b{mod}\b', '', normalized).strip()

        # Remove extra whitespace
        normalized = re.sub(r'\s+', ' ', normalized).strip()

        return normalized

    def _calculate_match_confidence(
        self,
        original: str,
        matched: str
    ) -> float:
        """Calculate confidence score for a product match."""
        original_lower = self._normalize_ingredient_name(original)
        matched_lower = matched.lower()

        # Direct substring match
        if original_lower in matched_lower or matched_lower in original_lower:
            return 0.9

        # Check if all words from original are in matched
        original_words = set(original_lower.split())
        matched_words = set(matched_lower.split())
        if original_words.issubset(matched_words):
            return 0.85

        # Sequence similarity
        ratio = SequenceMatcher(None, original_lower, matched_lower).ratio()

        return round(ratio, 2)

    async def _get_cached_product(
        self,
        normalized_name: str,
        retailer_id: str
    ) -> Optional[ProductSearchResult]:
        """Get cached product search result."""
        result = self.db.table("instacart_product_cache")\
            .select("*")\
            .eq("normalized_name", normalized_name)\
            .eq("retailer_id", retailer_id)\
            .gt("cache_expires_at", datetime.utcnow().isoformat())\
            .execute()

        if result.data:
            cached = result.data[0]
            return ProductSearchResult(
                product_id=cached["instacart_product_id"],
                name=cached["product_name"],
                image_url=cached.get("product_image_url"),
                unit_price=cached.get("unit_price"),
                unit_size=cached.get("unit_size"),
                availability=cached.get("availability", "available")
            )

        return None

    async def _cache_product(
        self,
        normalized_name: str,
        retailer_id: str,
        product: ProductSearchResult
    ) -> None:
        """Cache a product search result."""
        expires_at = datetime.utcnow() + timedelta(hours=PRODUCT_CACHE_TTL_HOURS)

        # Upsert cache entry
        self.db.table("instacart_product_cache").upsert({
            "normalized_name": normalized_name,
            "retailer_id": retailer_id,
            "instacart_product_id": product.product_id,
            "product_name": product.name,
            "product_image_url": product.image_url,
            "unit_price": product.unit_price,
            "unit_size": product.unit_size,
            "availability": product.availability,
            "cache_expires_at": expires_at.isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }, on_conflict="normalized_name,retailer_id").execute()

    async def close(self):
        """Close the HTTP client."""
        if self.client and not self.client.is_closed:
            await self.client.aclose()


# Singleton instance
instacart_service = InstacartService()
