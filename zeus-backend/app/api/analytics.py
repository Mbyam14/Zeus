from fastapi import APIRouter, Depends, Query
from app.schemas.user import UserResponse
from app.utils.dependencies import get_current_active_user
from app.services.analytics_service import analytics
from typing import Dict, Any
from pydantic import BaseModel, Field
from typing import Optional

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


class TrackEventRequest(BaseModel):
    event_name: str = Field(..., min_length=1, max_length=100)
    properties: Optional[Dict[str, Any]] = None


@router.post("/track")
async def track_event(
    body: TrackEventRequest,
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, str]:
    """Track a frontend analytics event."""
    analytics.track(
        event_name=body.event_name,
        user_id=current_user.id,
        properties=body.properties,
    )
    return {"status": "ok"}


@router.get("/summary")
async def get_analytics_summary(
    days: int = Query(7, ge=1, le=90),
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get event summary for the last N days."""
    return await analytics.get_summary(days=days)


@router.get("/me")
async def get_my_activity(
    days: int = Query(30, ge=1, le=90),
    current_user: UserResponse = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Get your own activity summary."""
    return await analytics.get_user_activity(user_id=current_user.id, days=days)
