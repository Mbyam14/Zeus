from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.schemas.user import UserRegister, UserLogin, UserProfile, UserResponse, Token, RefreshRequest
from app.services.auth_service import auth_service
from app.utils.dependencies import get_current_active_user
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/register", response_model=Token)
@limiter.limit(settings.rate_limit_auth)
async def register(request: Request, user_data: UserRegister):
    """Register a new user account. Returns access + refresh tokens."""
    return await auth_service.register_user(user_data)


@router.post("/login", response_model=Token)
@limiter.limit(settings.rate_limit_auth)
async def login(request: Request, user_data: UserLogin):
    """Login with email and password. Returns access + refresh tokens."""
    return await auth_service.login_user(user_data)


@router.post("/refresh", response_model=Token)
@limiter.limit("20/minute")
async def refresh_token(request: Request, body: RefreshRequest):
    """Exchange a valid refresh token for a new access + refresh token pair."""
    return await auth_service.refresh_tokens(body.refresh_token)


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: UserResponse = Depends(get_current_active_user)):
    """Get current authenticated user's information."""
    return current_user


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    profile_data: UserProfile,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """Update current user's profile information."""
    update_data = profile_data.dict()
    return await auth_service.update_user_profile(current_user.id, update_data)
