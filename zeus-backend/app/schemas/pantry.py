from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, date
from enum import Enum


class PantryCategory(str, Enum):
    PRODUCE = "Produce"
    DAIRY = "Dairy"
    PROTEIN = "Protein"
    GRAINS = "Grains"
    SPICES = "Spices"
    CONDIMENTS = "Condiments"
    BEVERAGES = "Beverages"
    FROZEN = "Frozen"
    CANNED_JARRED = "Canned & Jarred"
    BAKING = "Baking"
    OILS_VINEGARS = "Oils & Vinegars"
    SNACKS = "Snacks"
    PANTRY = "Pantry"  # Keep for backwards compatibility with existing data
    OTHER = "Other"


class PantryItemCreate(BaseModel):
    item_name: str = Field(..., min_length=1, max_length=100)
    quantity: Optional[float] = Field(None, ge=0)
    unit: Optional[str] = Field(None, max_length=20)
    category: PantryCategory = PantryCategory.OTHER
    expires_at: Optional[date] = None


class PantryItemUpdate(BaseModel):
    item_name: Optional[str] = Field(None, min_length=1, max_length=100)
    quantity: Optional[float] = Field(None, ge=0)
    unit: Optional[str] = Field(None, max_length=20)
    category: Optional[PantryCategory] = None
    expires_at: Optional[date] = None
    clear_expires_at: Optional[bool] = False


class PantryItemResponse(BaseModel):
    id: str
    user_id: str
    item_name: str
    quantity: Optional[float]
    unit: Optional[str]
    category: str
    expires_at: Optional[date]
    created_at: datetime
    
    # Computed fields
    is_expiring_soon: Optional[bool] = None  # expires within 3 days
    is_expired: Optional[bool] = None

    class Config:
        from_attributes = True


class PantryFilter(BaseModel):
    category: Optional[PantryCategory] = None
    search: Optional[str] = Field(None, max_length=100)
    expiring_soon: Optional[bool] = None  # items expiring within 3 days
    expired: Optional[bool] = None


class BulkPantryAdd(BaseModel):
    items: List[PantryItemCreate] = Field(..., min_items=1, max_items=50)


class BulkPantryDelete(BaseModel):
    item_ids: List[str] = Field(..., min_items=1, max_items=100)


class IngredientLibraryItem(BaseModel):
    id: str
    name: str
    category: str
    common_units: List[str]

    class Config:
        from_attributes = True


class DetectedPantryItem(BaseModel):
    """Item detected from image analysis"""
    item_name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    category: PantryCategory = PantryCategory.OTHER
    confidence: float = Field(..., ge=0, le=1)
    already_in_pantry: bool = False
    existing_pantry_id: Optional[str] = None


class ImageAnalysisResponse(BaseModel):
    """Response from pantry image analysis"""
    detected_items: List[DetectedPantryItem]
    total_detected: int
    new_items_count: int
    existing_items_count: int
    analysis_notes: Optional[str] = None


class ImageAnalysisRequest(BaseModel):
    """Request for pantry image analysis"""
    image_base64: str = Field(..., description="Base64 encoded image data")
    image_type: str = Field("image/jpeg", description="MIME type of the image")