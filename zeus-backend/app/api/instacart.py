"""
Instacart API Routes

Endpoints for Instacart integration:
- Store selection
- Product matching
- Cart creation
- Checkout redirect
- Webhook handling
"""

from fastapi import APIRouter, HTTPException, Depends, Request, Header, status
from typing import Optional, List
import logging
import hmac
import hashlib

from app.schemas.instacart import (
    InstacartCartCreate,
    InstacartCartResponse,
    InstacartCartDetailResponse,
    InstacartRetailer,
    InstacartCartItem,
    ProductMatchRequest,
    ProductMatchResponse,
    RetailerPreferenceUpdate
)
from app.schemas.user import UserResponse
from app.utils.dependencies import get_current_active_user
from app.services.instacart_service import instacart_service
from app.services.grocery_list_service import grocery_list_service
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/instacart",
    tags=["Instacart"],
    responses={404: {"description": "Not found"}}
)


@router.get("/retailers", response_model=List[InstacartRetailer])
async def get_available_retailers(
    zip_code: str,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Get available Instacart retailers for a zip code.

    Returns list of stores (Walmart, Kroger, etc.) available
    for delivery in the user's area.
    """
    if not zip_code or len(zip_code) != 5 or not zip_code.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please enter a valid 5-digit zip code"
        )

    try:
        retailers = await instacart_service.get_available_retailers(zip_code)
        return retailers
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching retailers: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch retailers"
        )


@router.get("/preferences")
async def get_user_preferences(
    current_user: UserResponse = Depends(get_current_active_user)
):
    """Get user's Instacart preferences."""
    prefs = await instacart_service.get_user_preferences(current_user.id)
    return prefs or {}


@router.post("/retailers/preference")
async def save_retailer_preference(
    preference: RetailerPreferenceUpdate,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """Save user's preferred retailer."""
    try:
        await instacart_service.save_user_retailer_preference(
            user_id=current_user.id,
            retailer_id=preference.retailer_id,
            zip_code=preference.zip_code
        )
        return {"message": "Preference saved"}
    except Exception as e:
        logger.error(f"Error saving preference: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save preference"
        )


@router.post("/match-products", response_model=ProductMatchResponse)
async def match_products(
    request: ProductMatchRequest,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Match grocery list items to Instacart products.

    This endpoint searches Instacart's catalog to find matching
    products for each item in the grocery list. Returns match
    results with confidence scores.
    """
    try:
        # Get grocery list
        grocery_list = await grocery_list_service.get_grocery_list(
            user_id=current_user.id,
            grocery_list_id=request.grocery_list_id
        )

        if not grocery_list:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Grocery list not found"
            )

        # Convert items to dict format for matching
        items_data = [
            {
                "id": item.get("id"),
                "item_name": item.get("item_name"),
                "is_purchased": item.get("is_purchased", False),
                "have_in_pantry": item.get("have_in_pantry", False),
                "quantity": item.get("quantity"),
                "unit": item.get("unit")
            }
            for item in grocery_list.get("items", [])
        ]

        # Match items
        matches, summary = await instacart_service.match_grocery_items(
            items=items_data,
            retailer_id=request.retailer_id
        )

        return ProductMatchResponse(
            grocery_list_id=request.grocery_list_id,
            retailer_id=request.retailer_id,
            matches=[
                InstacartCartItem(
                    id=m.grocery_item_id,
                    grocery_item_id=m.grocery_item_id,
                    original_name=m.original_name,
                    matched_product_name=m.matched_product["name"] if m.matched_product else None,
                    matched_product_id=m.matched_product["id"] if m.matched_product else None,
                    matched_unit_price=m.matched_product.get("price") if m.matched_product else None,
                    quantity=1,
                    match_status=m.match_status,
                    match_confidence=m.confidence,
                    alternatives=[]
                )
                for m in matches
            ],
            summary=summary
        )

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error matching products: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to match products"
        )


@router.post("/carts", response_model=InstacartCartResponse)
async def create_cart(
    request: InstacartCartCreate,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Create an Instacart cart from a grocery list.

    This endpoint:
    1. Matches grocery items to Instacart products
    2. Creates a cart on Instacart
    3. Returns a checkout URL for redirect
    """
    try:
        # Get grocery list
        grocery_list = await grocery_list_service.get_grocery_list(
            user_id=current_user.id,
            grocery_list_id=request.grocery_list_id
        )

        if not grocery_list:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Grocery list not found"
            )

        # Convert items to dict format
        items_data = [
            {
                "id": item.get("id"),
                "item_name": item.get("item_name"),
                "is_purchased": item.get("is_purchased", False),
                "have_in_pantry": item.get("have_in_pantry", False),
                "quantity": item.get("quantity"),
                "unit": item.get("unit")
            }
            for item in grocery_list.get("items", [])
        ]

        # Match items first
        matches, summary = await instacart_service.match_grocery_items(
            items=items_data,
            retailer_id=request.retailer_id
        )

        if summary["matched"] == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No items could be matched to products. Please try a different store."
            )

        # Get retailer name (we could fetch this, but for simplicity use ID)
        retailer_name = request.retailer_id.replace("_", " ").title()

        # Create cart
        cart = await instacart_service.create_cart(
            user_id=current_user.id,
            grocery_list_id=request.grocery_list_id,
            retailer_id=request.retailer_id,
            retailer_name=retailer_name,
            matched_items=matches
        )

        # Save retailer preference
        await instacart_service.save_user_retailer_preference(
            user_id=current_user.id,
            retailer_id=request.retailer_id,
            zip_code=request.zip_code
        )

        return cart

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating cart: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create Instacart cart"
        )


@router.get("/carts/{cart_id}", response_model=InstacartCartDetailResponse)
async def get_cart(
    cart_id: str,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """Get Instacart cart details."""
    try:
        cart = await instacart_service.get_cart_status(
            user_id=current_user.id,
            cart_id=cart_id
        )

        if not cart:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cart not found"
            )

        # Get cart items
        items = await instacart_service.get_cart_items(cart_id)

        return InstacartCartDetailResponse(
            id=cart["id"],
            instacart_cart_id=cart.get("instacart_cart_id"),
            checkout_url=cart.get("instacart_checkout_url"),
            retailer_id=cart.get("retailer_id", ""),
            retailer_name=cart.get("retailer_name"),
            total_items=cart.get("total_items_sent", 0),
            items_matched=cart.get("items_matched", 0),
            items_not_found=cart.get("items_not_found", 0),
            status=cart.get("status", "draft"),
            order_status=cart.get("order_status"),
            order_total=cart.get("order_total"),
            created_at=cart.get("created_at"),
            completed_at=cart.get("completed_at"),
            items=[
                InstacartCartItem(
                    id=item["id"],
                    grocery_item_id=item.get("grocery_list_item_id", ""),
                    original_name=item.get("original_item_name", ""),
                    matched_product_name=item.get("matched_product_name"),
                    matched_product_id=item.get("instacart_product_id"),
                    matched_unit_price=item.get("matched_unit_price"),
                    quantity=item.get("quantity_to_buy", 1),
                    match_status=item.get("match_status", "pending"),
                    match_confidence=item.get("match_confidence", 0),
                    alternatives=[]
                )
                for item in items
            ]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching cart: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch cart"
        )


@router.post("/webhooks")
async def handle_webhook(
    request: Request,
    x_instacart_signature: Optional[str] = Header(None)
):
    """
    Handle webhook events from Instacart.

    Events: order.created, order.updated, order.completed, order.cancelled
    """
    body = await request.body()

    # Verify webhook signature if secret is configured
    if settings.instacart_webhook_secret:
        expected_signature = hmac.new(
            settings.instacart_webhook_secret.encode(),
            body,
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(x_instacart_signature or "", expected_signature):
            logger.warning("Invalid webhook signature")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid signature"
            )

    try:
        payload = await request.json()
        event_type = payload.get("event_type", "unknown")

        logger.info(f"Received Instacart webhook: {event_type}")

        await instacart_service.handle_webhook(
            event_type=event_type,
            payload=payload
        )

        return {"status": "ok"}

    except Exception as e:
        logger.error(f"Webhook processing error: {e}")
        # Return 200 to acknowledge receipt even if processing fails
        return {"status": "error", "message": str(e)}
