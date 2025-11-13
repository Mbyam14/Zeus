from typing import Optional
from fastapi import HTTPException, status
from app.database import get_database
from app.schemas.user import UserRegister, UserLogin, UserResponse, Token
from app.utils.security import verify_password, get_password_hash, create_access_token


class AuthService:
    def __init__(self):
        self.db = get_database()
    
    async def register_user(self, user_data: UserRegister) -> Token:
        # Check if user already exists
        existing_user = self.db.table("users").select("*").eq("email", user_data.email).execute()
        if existing_user.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Check if username is taken
        existing_username = self.db.table("users").select("*").eq("username", user_data.username).execute()
        if existing_username.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        
        # Hash password and create user
        hashed_password = get_password_hash(user_data.password)
        
        user_record = {
            "email": user_data.email,
            "username": user_data.username,
            "password_hash": hashed_password,
            "profile_data": {}
        }
        
        result = self.db.table("users").insert(user_record).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create user"
            )
        
        created_user = result.data[0]
        user_response = UserResponse(**created_user)
        
        # Create access token
        access_token = create_access_token(data={"sub": created_user["id"]})
        
        return Token(access_token=access_token, user=user_response)
    
    async def login_user(self, user_data: UserLogin) -> Token:
        # Find user by email
        user_result = self.db.table("users").select("*").eq("email", user_data.email).execute()
        
        if not user_result.data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        user = user_result.data[0]
        
        # Verify password
        if not verify_password(user_data.password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        user_response = UserResponse(**user)
        
        # Create access token
        access_token = create_access_token(data={"sub": user["id"]})
        
        return Token(access_token=access_token, user=user_response)
    
    async def get_user_by_id(self, user_id: str) -> Optional[UserResponse]:
        user_result = self.db.table("users").select("*").eq("id", user_id).execute()
        
        if not user_result.data:
            return None
        
        user = user_result.data[0]
        return UserResponse(**user)
    
    async def update_user_profile(self, user_id: str, profile_data: dict) -> UserResponse:
        update_data = {"profile_data": profile_data}
        
        result = self.db.table("users").update(update_data).eq("id", user_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        updated_user = result.data[0]
        return UserResponse(**updated_user)


# Global auth service instance
auth_service = AuthService()