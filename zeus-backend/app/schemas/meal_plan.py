from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from enum import Enum


class MealSlot(str, Enum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACK = "snack"


class MealPlanMeal(BaseModel):
    recipe_id: str
    recipe_title: str
    servings: int = Field(4, ge=1, le=20)


class DayMeals(BaseModel):
    breakfast: Optional[MealPlanMeal] = None
    lunch: Optional[MealPlanMeal] = None
    dinner: Optional[MealPlanMeal] = None
    snack: Optional[MealPlanMeal] = None


class MealPlanCreate(BaseModel):
    plan_name: str = Field(..., min_length=1, max_length=100)
    week_start_date: date
    meals: Dict[str, DayMeals] = Field(..., description="Meals by day (monday, tuesday, etc.)")

    @validator('meals')
    def validate_meal_days(cls, v):
        valid_days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        for day in v.keys():
            if day.lower() not in valid_days:
                raise ValueError(f"Invalid day: {day}. Must be one of {valid_days}")
        return v


class MealPlanUpdate(BaseModel):
    plan_name: Optional[str] = Field(None, min_length=1, max_length=100)
    week_start_date: Optional[date] = None
    meals: Optional[Dict[str, DayMeals]] = None

    @validator('meals')
    def validate_meal_days(cls, v):
        if v is not None:
            valid_days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
            for day in v.keys():
                if day.lower() not in valid_days:
                    raise ValueError(f"Invalid day: {day}. Must be one of {valid_days}")
        return v


class MealPlanResponse(BaseModel):
    id: str
    user_id: str
    plan_name: str
    week_start_date: date
    meals: Dict[str, DayMeals]
    created_at: datetime

    class Config:
        from_attributes = True


class GroceryItem(BaseModel):
    name: str
    quantity: str
    unit: str
    category: str
    have_in_pantry: bool = False


class GroceryListResponse(BaseModel):
    meal_plan_id: str
    meal_plan_name: str
    week_start_date: date
    items: List[GroceryItem]
    items_by_category: Dict[str, List[GroceryItem]]


class AIMealPlanRequest(BaseModel):
    meals_per_day: List[MealSlot] = Field(..., min_items=1)
    week_start_date: date
    goals: Optional[List[str]] = Field(default=[], description="budget-friendly, quick-meals, use-pantry-items")
    dietary_preferences: Optional[List[str]] = Field(default=[])
    cuisine_preferences: Optional[List[str]] = Field(default=[])
    cooking_skill: Optional[str] = Field(None, pattern="^(beginner|intermediate|advanced)$")
    pantry_items: Optional[List[str]] = Field(default=[])
    servings_per_meal: int = Field(4, ge=1, le=12)