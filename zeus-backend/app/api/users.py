from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas.user import (
    UserPreferences, UserProfileUpdate, UserResponse,
    BodyStats, NotificationPreferences, AvatarUpload,
)
from app.utils.dependencies import get_current_active_user
from app.database import get_database
from typing import Dict, Any
import base64
import logging
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/users", tags=["Users"])


def _get_profile_data(db, user_id: str) -> Dict[str, Any]:
    """Helper to fetch user's profile_data JSONB."""
    result = db.table("users").select("profile_data").eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return result.data[0].get("profile_data", {})


def _save_profile_data(db, user_id: str, profile_data: Dict[str, Any]) -> None:
    """Helper to save profile_data JSONB."""
    db.table("users").update({"profile_data": profile_data}).eq("id", user_id).execute()


# ─── Preferences ────────────────────────────────────────────

@router.get("/me/preferences/")
async def get_user_preferences(current_user: UserResponse = Depends(get_current_active_user)) -> Dict[str, Any]:
    """Get current user's preferences."""
    try:
        db = get_database()
        profile_data = _get_profile_data(db, current_user.id)
        preferences = profile_data.get("preferences", {})

        if not preferences:
            return {
                "dietary_restrictions": [],
                "cuisine_preferences": [],
                "cooking_skill": "intermediate",
                "household_size": 2,
                "calorie_target": None,
                "protein_target_grams": None,
                "carb_target_grams": None,
                "fat_target_grams": None,
                "allergies": [],
                "disliked_ingredients": [],
            }

        return preferences

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get user preferences: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve preferences")


@router.put("/me/preferences/")
async def update_user_preferences(
    preferences: UserPreferences,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, str]:
    """Update user preferences."""
    try:
        db = get_database()
        profile_data = _get_profile_data(db, current_user.id)
        profile_data["preferences"] = preferences.dict()
        _save_profile_data(db, current_user.id, profile_data)
        logger.info(f"Updated preferences for user {current_user.id}")
        return {"message": "Preferences updated successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update user preferences: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update preferences")


# ─── Body Stats ─────────────────────────────────────────────

@router.get("/me/body-stats/")
async def get_body_stats(current_user: UserResponse = Depends(get_current_active_user)) -> Dict[str, Any]:
    """Get user's body stats."""
    try:
        db = get_database()
        profile_data = _get_profile_data(db, current_user.id)
        return profile_data.get("body_stats", {
            "sex": None,
            "age": None,
            "height_cm": None,
            "weight_kg": None,
            "goal_weight_kg": None,
            "activity_level": None,
            "units": "imperial",
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get body stats: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve body stats")


@router.put("/me/body-stats/")
async def update_body_stats(
    body_stats: BodyStats,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, str]:
    """Update user's body stats."""
    try:
        db = get_database()
        profile_data = _get_profile_data(db, current_user.id)
        profile_data["body_stats"] = body_stats.dict()
        _save_profile_data(db, current_user.id, profile_data)
        logger.info(f"Updated body stats for user {current_user.id}")
        return {"message": "Body stats updated successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update body stats: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update body stats")


# ─── Notification Preferences ───────────────────────────────

@router.get("/me/notifications/")
async def get_notification_preferences(current_user: UserResponse = Depends(get_current_active_user)) -> Dict[str, Any]:
    """Get user's notification preferences."""
    try:
        db = get_database()
        profile_data = _get_profile_data(db, current_user.id)
        return profile_data.get("notification_preferences", {
            "meal_reminders": True,
            "prep_reminders": False,
            "grocery_reminders": True,
            "expiring_items": True,
            "new_recipes": False,
            "weekly_summary": False,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get notification preferences: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve notification preferences")


@router.put("/me/notifications/")
async def update_notification_preferences(
    prefs: NotificationPreferences,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, str]:
    """Update user's notification preferences."""
    try:
        db = get_database()
        profile_data = _get_profile_data(db, current_user.id)
        profile_data["notification_preferences"] = prefs.dict()
        _save_profile_data(db, current_user.id, profile_data)
        logger.info(f"Updated notification preferences for user {current_user.id}")
        return {"message": "Notification preferences updated successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update notification preferences: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update notification preferences")


# ─── Avatar ─────────────────────────────────────────────────

@router.post("/me/avatar")
async def upload_avatar(
    body: AvatarUpload,
    current_user: UserResponse = Depends(get_current_active_user)
) -> Dict[str, str]:
    """Upload user avatar image. Accepts base64-encoded JPEG."""
    try:
        db = get_database()

        # Decode base64
        try:
            image_bytes = base64.b64decode(body.image_base64)
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid base64 image data")

        # Limit to 500KB
        if len(image_bytes) > 500_000:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image too large (max 500KB)")

        # Upload to Supabase storage
        file_path = f"{current_user.id}.jpg"
        try:
            # Try to remove old avatar first so upload doesn't conflict
            try:
                db.storage.from_("avatars").remove([file_path])
            except Exception:
                pass

            db.storage.from_("avatars").upload(
                path=file_path,
                file=image_bytes,
                file_options={"content-type": "image/jpeg", "x-upsert": "true"}
            )
            avatar_url = db.storage.from_("avatars").get_public_url(file_path)
        except Exception as e:
            logger.error(f"Supabase storage upload failed: {e}")
            # Fallback: store as base64 data URI if storage isn't set up
            avatar_url = f"data:image/jpeg;base64,{base64.b64encode(image_bytes).decode()}"
            logger.info("Falling back to base64 avatar storage")

        # Save URL to profile_data
        profile_data = _get_profile_data(db, current_user.id)
        profile_data["avatar_url"] = avatar_url
        _save_profile_data(db, current_user.id, profile_data)

        logger.info(f"Updated avatar for user {current_user.id}")
        return {"avatar_url": avatar_url}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upload avatar: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to upload avatar")


# ─── Full Profile Update ────────────────────────────────────

@router.put("/me/profile/")
async def update_user_full_profile(
    profile_update: UserProfileUpdate,
    current_user: UserResponse = Depends(get_current_active_user)
) -> UserResponse:
    """Update user profile including name and preferences."""
    try:
        db = get_database()
        update_data: Dict[str, Any] = {}

        if profile_update.name is not None:
            update_data["username"] = profile_update.name

        if profile_update.preferences is not None:
            profile_data = _get_profile_data(db, current_user.id)
            profile_data["preferences"] = profile_update.preferences.dict()
            update_data["profile_data"] = profile_data

        if update_data:
            db.table("users").update(update_data).eq("id", current_user.id).execute()

        updated_result = db.table("users").select("*").eq("id", current_user.id).execute()

        if not updated_result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        user_data = updated_result.data[0]
        return UserResponse(
            id=str(user_data["id"]),
            email=user_data["email"],
            username=user_data["username"],
            profile_data=user_data.get("profile_data", {}),
            created_at=user_data["created_at"]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update user profile: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update profile")
