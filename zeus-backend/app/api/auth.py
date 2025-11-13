from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas.user import UserRegister, UserLogin, UserProfile, UserResponse, Token
from app.services.auth_service import auth_service
from app.utils.dependencies import get_current_active_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=Token)
async def register(user_data: UserRegister):
    """
    Register a new user account.
    
    Returns JWT token and user information upon successful registration.
    """
    return await auth_service.register_user(user_data)


@router.post("/login", response_model=Token)
async def login(user_data: UserLogin):
    """
    Login with email and password.
    
    Returns JWT token and user information upon successful authentication.
    """
    return await auth_service.login_user(user_data)


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: UserResponse = Depends(get_current_active_user)):
    """
    Get current authenticated user's information.
    
    Requires valid JWT token in Authorization header.
    """
    return current_user


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    profile_data: UserProfile,
    current_user: UserResponse = Depends(get_current_active_user)
):
    """
    Update current user's profile information.
    
    Requires valid JWT token in Authorization header.
    """
    update_data = profile_data.dict()
    return await auth_service.update_user_profile(current_user.id, update_data)