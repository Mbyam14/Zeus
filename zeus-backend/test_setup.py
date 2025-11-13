#!/usr/bin/env python3
"""
Test script to verify Zeus backend setup
"""
import os
import asyncio
import sys
from datetime import datetime

# Add the app directory to Python path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

try:
    from app.config import settings
    from app.database import get_database
    from app.services.auth_service import auth_service
    from app.schemas.user import UserRegister, UserLogin
    print("[SUCCESS] All imports successful!")
except ImportError as e:
    print(f"[ERROR] Import error: {e}")
    sys.exit(1)


async def test_database_connection():
    """Test Supabase database connection"""
    print("\n[TESTING] Database connection...")
    try:
        db = get_database()
        # Simple test query
        result = db.table("users").select("count").execute()
        print("[SUCCESS] Database connection successful!")
        return True
    except Exception as e:
        print(f"[ERROR] Database connection failed: {e}")
        return False


async def test_auth_system():
    """Test authentication system"""
    print("\n[TESTING] Authentication system...")
    
    # Test user registration
    test_email = f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}@example.com"
    test_username = f"testuser_{datetime.now().strftime('%H%M%S')}"
    test_password = "testpass123"
    
    try:
        # Test registration
        print(f"[REGISTER] Testing registration with email: {test_email}")
        user_data = UserRegister(
            email=test_email,
            username=test_username,
            password=test_password
        )
        
        token_response = await auth_service.register_user(user_data)
        print("[SUCCESS] User registration successful!")
        print(f"   Token type: {token_response.token_type}")
        print(f"   User ID: {token_response.user.id}")
        print(f"   Username: {token_response.user.username}")
        
        # Test login
        print(f"[LOGIN] Testing login with same credentials...")
        login_data = UserLogin(email=test_email, password=test_password)
        login_response = await auth_service.login_user(login_data)
        print("[SUCCESS] User login successful!")
        print(f"   Token generated: {len(login_response.access_token)} characters")
        
        return True
        
    except Exception as e:
        print(f"[ERROR] Authentication test failed: {e}")
        return False


async def main():
    """Run all tests"""
    print("Zeus Backend Setup Test")
    print("=" * 40)
    
    # Test configuration
    print(f"Configuration loaded:")
    print(f"   App Name: {settings.app_name}")
    print(f"   Environment: {settings.environment}")
    print(f"   Debug: {settings.debug}")
    print(f"   Supabase URL: {settings.supabase_url}")
    
    # Test database
    db_success = await test_database_connection()
    
    # Test authentication (only if database works)
    auth_success = False
    if db_success:
        auth_success = await test_auth_system()
    
    # Summary
    print("\nTest Summary:")
    print("=" * 40)
    print(f"Database Connection: {'PASS' if db_success else 'FAIL'}")
    print(f"Authentication System: {'PASS' if auth_success else 'FAIL'}")
    
    if db_success and auth_success:
        print("\nAll tests passed! Zeus backend is ready to go!")
        return True
    else:
        print("\nSome tests failed. Please check your configuration.")
        return False


if __name__ == "__main__":
    asyncio.run(main())