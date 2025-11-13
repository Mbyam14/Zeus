from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum


class FriendshipStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"


class FriendRequest(BaseModel):
    friend_email_or_username: str = Field(..., min_length=1, max_length=100)


class FriendshipResponse(BaseModel):
    id: str
    user_id: str
    friend_id: str
    friend_username: str
    friend_email: str
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class FriendProfileResponse(BaseModel):
    id: str
    username: str
    email: str
    profile_data: dict
    recipes_count: int
    friends_count: int
    created_at: datetime


class UserSearchResult(BaseModel):
    id: str
    username: str
    email: str
    is_friend: bool
    friendship_status: Optional[str] = None  # pending, accepted, declined


class TrendingRecipeResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    image_url: Optional[str]
    creator_username: str
    cuisine_type: Optional[str]
    difficulty: str
    prep_time: Optional[int]
    cook_time: Optional[int]
    likes_count: int
    saves_count: int
    created_at: datetime
    
    # For trending calculation
    trending_score: Optional[float] = None