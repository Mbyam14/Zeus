from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.utils.security import verify_token
from app.services.auth_service import auth_service
from app.schemas.user import UserResponse
from typing import Optional

security = HTTPBearer(auto_error=False)
security_required = HTTPBearer(auto_error=True)


async def get_current_user_optional(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Optional[UserResponse]:
    """Return the authenticated user or None for public endpoints (e.g. recipe feed)."""
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
    if user is None:
        raise credentials_exception

    return user


async def get_current_active_user(credentials: HTTPAuthorizationCredentials = Depends(security_required)) -> UserResponse:
    """Require a valid JWT token. Returns 401 if missing or invalid."""
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