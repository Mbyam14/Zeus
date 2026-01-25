from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.utils.security import verify_token
from app.services.auth_service import auth_service
from app.schemas.user import UserResponse
from typing import Optional

# Mandatory auth - will auto-reject missing tokens with 403
security = HTTPBearer(auto_error=True)

# Optional auth - for public endpoints that have enhanced features when logged in
security_optional = HTTPBearer(auto_error=False)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> UserResponse:
    """Get current user from JWT token. Requires authentication."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials
    token_data = verify_token(token, credentials_exception)

    user = await auth_service.get_user_by_id(token_data.user_id)
    if user is None:
        raise credentials_exception

    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_optional)
) -> Optional[UserResponse]:
    """Get current user if token provided, None otherwise. For public endpoints."""
    if credentials is None:
        return None

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials
    token_data = verify_token(token, credentials_exception)

    user = await auth_service.get_user_by_id(token_data.user_id)
    return user  # May be None if user not found


async def get_current_active_user(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    """Require authenticated user for protected endpoints."""
    return current_user