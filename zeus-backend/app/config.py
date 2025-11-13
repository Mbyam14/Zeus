from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "Zeus"
    environment: str = "development"
    debug: bool = True
    secret_key: str
    
    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str
    
    # AWS
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_region: str = "us-east-1"
    s3_bucket_name: str
    
    # AI
    anthropic_api_key: str
    
    # CORS
    allowed_origins: str = "http://localhost:19006"
    
    class Config:
        env_file = ".env"


@lru_cache()
def get_settings():
    return Settings()


settings = get_settings()