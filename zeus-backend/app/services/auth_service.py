from typing import Optional
from fastapi import HTTPException, status
from app.database import get_database
from app.schemas.user import UserRegister, UserLogin, UserResponse, Token
from app.utils.security import (
    verify_password, get_password_hash,
    create_access_token, create_refresh_token, verify_refresh_token,
)


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

        # Create tokens
        token_data = {"sub": created_user["id"]}
        access_token = create_access_token(data=token_data)
        refresh_token = create_refresh_token(data=token_data)

        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            user=user_response,
        )

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

        # Create tokens
        token_data = {"sub": user["id"]}
        access_token = create_access_token(data=token_data)
        refresh_token = create_refresh_token(data=token_data)

        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            user=user_response,
        )

    async def refresh_tokens(self, refresh_token: str) -> Token:
        """Validate refresh token and issue new token pair."""
        user_id = verify_refresh_token(refresh_token)
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token"
            )

        user = await self.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )

        # Issue new token pair
        token_data = {"sub": user_id}
        new_access_token = create_access_token(data=token_data)
        new_refresh_token = create_refresh_token(data=token_data)

        return Token(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            user=user,
        )

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

    async def change_password(self, user_id: str, current_password: str, new_password: str) -> None:
        """Verify current password and update to new password."""
        user_result = self.db.table("users").select("password_hash").eq("id", user_id).execute()

        if not user_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if not verify_password(current_password, user_result.data[0]["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )

        new_hash = get_password_hash(new_password)
        self.db.table("users").update({"password_hash": new_hash}).eq("id", user_id).execute()

    async def delete_account(self, user_id: str, password: str) -> None:
        """Delete user account and all associated data after verifying password."""
        user_result = self.db.table("users").select("password_hash").eq("id", user_id).execute()

        if not user_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if not verify_password(password, user_result.data[0]["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password is incorrect"
            )

        # Delete all user data from related tables
        tables_to_clean = [
            "ai_messages",  # via conversation
            "ai_conversations",
            "ai_user_memory",
            "meal_plans",
            "pantry_items",
            "recipe_likes",
            "recipe_saves",
            "grocery_lists",
        ]

        # Delete AI messages via conversation IDs first
        convos = self.db.table("ai_conversations").select("id").eq("user_id", user_id).execute()
        if convos.data:
            for convo in convos.data:
                self.db.table("ai_messages").delete().eq("conversation_id", convo["id"]).execute()

        # Delete from remaining tables
        for table in tables_to_clean:
            if table != "ai_messages":  # Already handled
                try:
                    self.db.table(table).delete().eq("user_id", user_id).execute()
                except Exception:
                    pass  # Table may not exist or have no rows

        # Delete user-created recipes (not system recipes)
        self.db.table("recipes").delete().eq("user_id", user_id).execute()

        # Finally delete the user
        self.db.table("users").delete().eq("id", user_id).execute()


# Global auth service instance
auth_service = AuthService()
