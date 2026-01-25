"""
Pydantic schemas for grocery list feature.

Defines request/response models for:
- Grocery lists
- Grocery list items
- Item categories
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime, date
from enum import Enum


class GroceryCategory(str, Enum):
    """Categories for organizing grocery items."""
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


class GroceryListItemCreate(BaseModel):
    """Schema for creating a grocery list item (internal use)."""
    item_name: str = Field(..., min_length=1, max_length=200)
    normalized_name: str = Field(..., min_length=1, max_length=200)
    quantity: Optional[float] = Field(None, ge=0)
    unit: Optional[str] = Field(None, max_length=50)
    category: GroceryCategory = GroceryCategory.OTHER

    # Pantry tracking
    have_in_pantry: bool = False
    pantry_quantity: Optional[float] = Field(None, ge=0)
    pantry_unit: Optional[str] = Field(None, max_length=50)
    needed_quantity: Optional[float] = Field(None, ge=0)

    # Source tracking
    recipe_ids: List[str] = Field(default_factory=list)


class GroceryListItemResponse(BaseModel):
    """Schema for grocery list item response."""
    id: str
    item_name: str
    quantity: Optional[float]
    unit: Optional[str]
    category: str

    # Pantry tracking
    have_in_pantry: bool
    pantry_quantity: Optional[float]
    pantry_unit: Optional[str]
    needed_quantity: Optional[float]

    # Purchase tracking
    is_purchased: bool
    estimated_price: Optional[float]

    # Source tracking
    recipe_ids: List[str]

    # Timestamps
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GroceryListItemUpdatePurchased(BaseModel):
    """Schema for updating item purchased status."""
    is_purchased: bool = Field(..., description="Whether the item has been purchased")


class GroceryListCreate(BaseModel):
    """Schema for creating a grocery list (internal use)."""
    user_id: str
    meal_plan_id: str
    name: str = Field(default="Weekly Grocery List", max_length=200)
    week_start_date: date


class RecipeWarning(BaseModel):
    """Warning about a recipe that couldn't be processed."""
    recipe_id: str
    recipe_title: str
    reason: str


class GroceryListResponse(BaseModel):
    """Schema for grocery list response."""
    id: str
    user_id: str
    meal_plan_id: str
    name: str
    week_start_date: date

    # Items
    items: List[GroceryListItemResponse]
    items_by_category: Dict[str, List[GroceryListItemResponse]] = Field(
        default_factory=dict,
        description="Items grouped by category for easier UI rendering"
    )

    # Summary statistics
    total_items: int = Field(..., description="Total number of items in the list")
    purchased_items_count: int = Field(..., description="Number of items marked as purchased")
    items_in_pantry_count: int = Field(
        default=0,
        description="Number of items already available in pantry"
    )

    # Warnings
    warnings: List[RecipeWarning] = Field(
        default_factory=list,
        description="Warnings about recipes that couldn't be fully processed"
    )

    # Status
    is_purchased: bool = Field(default=False, description="Whether entire list is marked as purchased")
    purchased_at: Optional[datetime] = None

    # Timestamps
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GroceryListSummary(BaseModel):
    """Schema for grocery list summary (lightweight response)."""
    id: str
    meal_plan_id: str
    name: str
    week_start_date: date
    total_items: int
    purchased_items_count: int
    is_purchased: bool
    created_at: datetime


class GroceryListMarkAllPurchased(BaseModel):
    """Schema for marking all items as purchased."""
    is_purchased: bool = True


# ============================================================================
# Internal Data Structures (not exposed via API)
# ============================================================================

class IngredientAggregate(BaseModel):
    """Internal structure for aggregating ingredients from multiple recipes."""
    normalized_name: str
    display_name: str  # Original case-sensitive name
    total_quantity: Optional[float]
    unit: Optional[str]
    category: GroceryCategory
    recipe_ids: List[str]  # Which recipes use this ingredient

    # Separate entries if units are incompatible
    alternate_entries: List["IngredientEntry"] = Field(default_factory=list)


class IngredientEntry(BaseModel):
    """Single ingredient entry with specific unit."""
    quantity: Optional[float]
    unit: Optional[str]
    recipe_ids: List[str]


class PantryMatch(BaseModel):
    """Internal structure for pantry matching results."""
    ingredient_name: str
    normalized_name: str
    pantry_item_id: Optional[str]
    match_type: str  # 'exact', 'partial', 'none'
    pantry_quantity: Optional[float]
    pantry_unit: Optional[str]
    needed_quantity: Optional[float]


# Allow forward references for alternate_entries
IngredientAggregate.model_rebuild()
