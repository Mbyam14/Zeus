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
    token_type: str = "bearer"
    user: UserResponse


class TokenData(BaseModel):
    user_id: Optional[str] = None