#!/usr/bin/env python3
"""
Simple bcrypt test
"""
try:
    from passlib.context import CryptContext
    
    print("Testing bcrypt...")
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    
    test_password = "testpass123"
    print(f"Hashing password: {test_password}")
    
    hashed = pwd_context.hash(test_password)
    print(f"Hashed password: {hashed}")
    
    verified = pwd_context.verify(test_password, hashed)
    print(f"Verification result: {verified}")
    
    if verified:
        print("SUCCESS: bcrypt is working correctly!")
    else:
        print("ERROR: bcrypt verification failed!")
        
except Exception as e:
    print(f"ERROR: {e}")