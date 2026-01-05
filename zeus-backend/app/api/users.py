from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas.user import UserPreferences, UserProfileUpdate, UserResponse
from app.utils.dependencies import get_current_active_user
from app.database import get_database
from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("/me/preferences/")
async def get_user_preferences(current_user: UserResponse = Depends(get_current_active_user)) -> Dict[str, Any]:
    """
    Get current user's preferences.

    Returns user preferences from profile_data JSONB field.
    """
    try:
        db = get_database()
        result = db.table("users").select("profile_data").eq("id", current_user.id).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        profile_data = result.data[0].get("profile_data", {})
        preferences = profile_data.get("preferences", {})

        # Return default preferences if none exist
        if not preferences:
            return {
                "dietary_restrictions": [],
                "cuisine_preferences": [],
                "cooking_skill": "intermediate",
                "household_size": 2,
                "calorie_target": None,
                "protein_target_grams": None,
                "allergies": [],
                "disliked_ingredients": []
            }

        return preferences

    except Exception as e:
        logger.error(f"Failed to get user preferences: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve preferences"
        )


@router.put("/me/preferences/")
async def update_user_preferences(
    preferences: UserPreferences,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, str]:
    """
    Update user preferences.

    Updates the preferences field within the profile_data JSONB column.
    """
    try:
        db = get_database()

        # Get current profile_data
        result = db.table("users").select("profile_data").eq("id", current_user.id).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        profile_data = result.data[0].get("profile_data", {})

        # Update preferences
        profile_data["preferences"] = preferences.dict()

        # Save back to database
        db.table("users").update({"profile_data": profile_data}).eq("id", current_user.id).execute()

        logger.info(f"Updated preferences for user {current_user.id}")

        return {"message": "Preferences updated successfully"}

    except Exception as e:
        logger.error(f"Failed to update user preferences: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update preferences"
        )


@router.put("/me/profile/")
async def update_user_full_profile(
    profile_update: UserProfileUpdate,
    current_user: UserResponse = Depends(get_current_active_user)
) -> UserResponse:
    """
    Update user profile including name and preferences.

    Allows updating both user name and preferences in a single request.
    """
    try:
        db = get_database()

        update_data: Dict[str, Any] = {}

        # Handle name update if provided
        if profile_update.name is not None:
            update_data["username"] = profile_update.name

        # Handle preferences update if provided
        if profile_update.preferences is not None:
            # Get current profile_data
            result = db.table("users").select("profile_data").eq("id", current_user.id).execute()
            profile_data = result.data[0].get("profile_data", {}) if result.data else {}

            # Update preferences
            profile_data["preferences"] = profile_update.preferences.dict()
            update_data["profile_data"] = profile_data

        # Update database
        if update_data:
            db.table("users").update(update_data).eq("id", current_user.id).execute()

        # Get updated user data
        updated_result = db.table("users").select("*").eq("id", current_user.id).execute()

        if not updated_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        user_data = updated_result.data[0]

        return UserResponse(
            id=str(user_data["id"]),
            email=user_data["email"],
            username=user_data["username"],
            profile_data=user_data.get("profile_data", {}),
            created_at=user_data["created_at"]
        )

    except Exception as e:
        logger.error(f"Failed to update user profile: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile"
        )
