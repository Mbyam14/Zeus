"""
Pydantic schemas for Instacart integration.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class InstacartCartStatus(str, Enum):
    """Status of an Instacart cart."""
    DRAFT = "draft"
    CREATED = "created"
    REDIRECTED = "redirected"
    ORDERED = "ordered"
    COMPLETED = "completed"
    FAILED = "failed"


class ProductMatchStatus(str, Enum):
    """Status of product matching."""
    PENDING = "pending"
    MATCHED = "matched"
    LOW_CONFIDENCE = "low_confidence"
    NOT_FOUND = "not_found"
    MANUAL = "manual"


class ProductSearchResult(BaseModel):
    """Product search result from Instacart."""
    product_id: str
    name: str
    image_url: Optional[str] = None
    unit_price: Optional[float] = None
    unit_size: Optional[str] = None
    availability: str = "available"


class InstacartRetailer(BaseModel):
    """Retailer information from Instacart."""
    id: str
    name: str
    logo_url: Optional[str] = None
    delivery_fee: Optional[float] = None
    min_order: Optional[float] = None
    estimated_delivery: Optional[str] = None


class InstacartCartItem(BaseModel):
    """Item in an Instacart cart."""
    id: str
    grocery_item_id: str
    original_name: str
    matched_product_name: Optional[str] = None
    matched_product_id: Optional[str] = None
    matched_unit_price: Optional[float] = None
    quantity: int = 1
    match_status: str = "pending"
    match_confidence: float = 0.0
    alternatives: List[ProductSearchResult] = Field(default_factory=list)


class InstacartCartCreate(BaseModel):
    """Request to create an Instacart cart."""
    grocery_list_id: str
    retailer_id: str
    zip_code: str


class InstacartCartResponse(BaseModel):
    """Response for Instacart cart operations."""
    id: str
    instacart_cart_id: Optional[str] = None
    checkout_url: Optional[str] = None
    retailer_id: str
    retailer_name: Optional[str] = None

    # Item stats
    total_items: int = 0
    items_matched: int = 0
    items_not_found: int = 0

    # Status
    status: str = "draft"
    order_status: Optional[str] = None
    order_total: Optional[float] = None

    # Timestamps
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class InstacartCartDetailResponse(InstacartCartResponse):
    """Detailed cart response with items."""
    items: List[InstacartCartItem] = Field(default_factory=list)


class ProductMatchRequest(BaseModel):
    """Request to match grocery items to Instacart products."""
    grocery_list_id: str
    retailer_id: str


class ProductMatchResponse(BaseModel):
    """Response for product matching."""
    grocery_list_id: str
    retailer_id: str
    matches: List[InstacartCartItem]
    summary: Dict[str, Any]


class RetailerPreferenceUpdate(BaseModel):
    """Update user's retailer preference."""
    retailer_id: str
    zip_code: str


class InstacartWebhookPayload(BaseModel):
    """Webhook payload from Instacart."""
    event_type: str
    cart_id: Optional[str] = None
    order_id: Optional[str] = None
    status: Optional[str] = None
    total: Optional[float] = None
    estimated_delivery_time: Optional[str] = None
    metadata: Dict[str, str] = Field(default_factory=dict)
