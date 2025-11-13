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
    PANTRY = "Pantry"
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