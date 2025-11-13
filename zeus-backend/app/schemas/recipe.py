from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class DifficultyLevel(str, Enum):
    EASY = "Easy"
    MEDIUM = "Medium"
    HARD = "Hard"


class MealType(str, Enum):
    BREAKFAST = "Breakfast"
    LUNCH = "Lunch"
    DINNER = "Dinner"
    SNACK = "Snack"
    DESSERT = "Dessert"


class Ingredient(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    quantity: str = Field(..., min_length=1, max_length=50)
    unit: str = Field(..., min_length=1, max_length=20)


class Instruction(BaseModel):
    step: int = Field(..., ge=1)
    instruction: str = Field(..., min_length=1, max_length=500)


class RecipeCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    ingredients: List[Ingredient] = Field(..., min_items=1)
    instructions: List[Instruction] = Field(..., min_items=1)
    servings: int = Field(4, ge=1, le=20)
    prep_time: Optional[int] = Field(None, ge=0, le=480)  # max 8 hours
    cook_time: Optional[int] = Field(None, ge=0, le=480)  # max 8 hours
    cuisine_type: Optional[str] = Field(None, max_length=50)
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    meal_type: List[MealType] = Field(default=[])
    dietary_tags: List[str] = Field(default=[])
    image_url: Optional[str] = None

    @validator('instructions')
    def validate_instructions_order(cls, v):
        steps = [instruction.step for instruction in v]
        if steps != list(range(1, len(steps) + 1)):
            raise ValueError('Instructions must be numbered consecutively starting from 1')
        return v


class RecipeUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    ingredients: Optional[List[Ingredient]] = None
    instructions: Optional[List[Instruction]] = None
    servings: Optional[int] = Field(None, ge=1, le=20)
    prep_time: Optional[int] = Field(None, ge=0, le=480)
    cook_time: Optional[int] = Field(None, ge=0, le=480)
    cuisine_type: Optional[str] = Field(None, max_length=50)
    difficulty: Optional[DifficultyLevel] = None
    meal_type: Optional[List[MealType]] = None
    dietary_tags: Optional[List[str]] = None
    image_url: Optional[str] = None

    @validator('instructions')
    def validate_instructions_order(cls, v):
        if v is not None:
            steps = [instruction.step for instruction in v]
            if steps != list(range(1, len(steps) + 1)):
                raise ValueError('Instructions must be numbered consecutively starting from 1')
        return v


class RecipeResponse(BaseModel):
    id: str
    user_id: str
    title: str
    description: Optional[str]
    image_url: Optional[str]
    ingredients: List[Ingredient]
    instructions: List[Instruction]
    servings: int
    prep_time: Optional[int]
    cook_time: Optional[int]
    cuisine_type: Optional[str]
    difficulty: str
    meal_type: List[str]
    dietary_tags: List[str]
    is_ai_generated: bool
    likes_count: int
    created_at: datetime
    
    # Optional fields for feed/detailed views
    creator_username: Optional[str] = None
    is_liked: Optional[bool] = None
    is_saved: Optional[bool] = None

    class Config:
        from_attributes = True


class RecipeFeedFilter(BaseModel):
    cuisine_type: Optional[str] = None
    difficulty: Optional[DifficultyLevel] = None
    max_prep_time: Optional[int] = Field(None, ge=0, le=480)
    meal_type: Optional[MealType] = None
    dietary_tags: Optional[List[str]] = None
    use_pantry_items: bool = False
    limit: int = Field(20, ge=1, le=100)
    offset: int = Field(0, ge=0)


class RecipeInteraction(BaseModel):
    recipe_id: str


class AIRecipeRequest(BaseModel):
    pantry_items: Optional[List[str]] = Field(default=[])
    cuisine_preference: Optional[str] = None
    dietary_restrictions: Optional[List[str]] = Field(default=[])
    cooking_skill: Optional[str] = Field(None, pattern="^(beginner|intermediate|advanced)$")
    max_prep_time: Optional[int] = Field(None, ge=5, le=240)
    servings: int = Field(4, ge=1, le=12)
    meal_type: Optional[MealType] = None
    additional_preferences: Optional[str] = Field(None, max_length=500)