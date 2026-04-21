from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Dict, Any
from datetime import datetime


class UserRegister(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, max_length=72)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserProfile(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    profile_data: Optional[Dict[str, Any]] = {}


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    profile_data: Dict[str, Any]
    created_at: datetime
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    refresh_token: str = ""
    token_type: str = "bearer"
    user: UserResponse


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenData(BaseModel):
    user_id: Optional[str] = None


class UserPreferences(BaseModel):
    """User dietary and cooking preferences"""
    dietary_restrictions: list[str] = Field(default=[], description="Dietary restrictions (e.g., vegetarian, vegan, gluten-free)")
    cuisine_preferences: list[str] = Field(default=[], description="Preferred cuisines (e.g., Italian, Mexican, Asian)")
    cooking_skill: str = Field(default="intermediate", pattern="^(beginner|intermediate|advanced)$")
    household_size: int = Field(default=2, ge=1, le=20, description="Number of people to cook for")
    calorie_target: Optional[int] = Field(None, ge=800, le=8000, description="Daily calorie target")
    protein_target_grams: Optional[int] = Field(None, ge=20, le=500, description="Daily protein target in grams")
    carb_target_grams: Optional[int] = Field(None, ge=20, le=800, description="Daily carb target in grams")
    fat_target_grams: Optional[int] = Field(None, ge=10, le=300, description="Daily fat target in grams")
    allergies: list[str] = Field(default=[], description="Food allergies")
    disliked_ingredients: list[str] = Field(default=[], description="Ingredients to avoid")

    # Meal planning preferences
    meal_calorie_distribution: Dict[str, int] = Field(
        default={"breakfast": 20, "snack": 10, "lunch": 30, "dinner": 40},
        description="Percentage of daily calories per meal type (must sum to 100)"
    )
    cooking_sessions_per_week: int = Field(
        default=6,
        ge=3,
        le=14,
        description="Number of actual cooking sessions per week (rest are leftovers/repeats)"
    )
    recipe_source_preference: str = Field(
        default="mixed",
        pattern="^(vetted_only|ai_only|mixed)$",
        description="Preference for recipe source: vetted_only, ai_only, or mixed"
    )
    leftover_tolerance: str = Field(
        default="moderate",
        pattern="^(low|moderate|high)$",
        description="How often the same meal can repeat: low=2x, moderate=3x, high=4x per week"
    )
    budget_friendly: bool = Field(
        default=False,
        description="Prioritize cheaper ingredients and maximize pantry usage for cost savings"
    )


class UserProfileUpdate(BaseModel):
    """Update user profile including preferences"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    preferences: Optional[UserPreferences] = None


class BodyStats(BaseModel):
    """User body stats for TDEE calculation"""
    sex: Optional[str] = Field(None, pattern="^(male|female)$")
    age: Optional[int] = Field(None, ge=13, le=120)
    height_cm: Optional[float] = Field(None, ge=50, le=300)
    weight_kg: Optional[float] = Field(None, ge=20, le=400)
    goal_weight_kg: Optional[float] = Field(None, ge=20, le=400)
    activity_level: Optional[str] = Field(
        None,
        pattern="^(sedentary|lightly_active|moderately_active|very_active|extra_active)$"
    )
    units: str = Field(default="imperial", pattern="^(imperial|metric)$")


class ChangePasswordRequest(BaseModel):
    """Change password request"""
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=72)


class NotificationPreferences(BaseModel):
    """User notification preferences"""
    meal_reminders: bool = True
    prep_reminders: bool = False
    grocery_reminders: bool = True
    expiring_items: bool = True
    new_recipes: bool = False
    weekly_summary: bool = False


class DeleteAccountRequest(BaseModel):
    """Delete account request - requires password confirmation"""
    password: str


class AvatarUpload(BaseModel):
    """Avatar upload as base64"""
    image_base64: str = Field(..., description="Base64-encoded JPEG image")