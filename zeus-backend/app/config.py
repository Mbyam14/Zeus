from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    app_name: str = "Zeus"
    environment: str = "development"  # development, staging, production
    debug: bool = True
    secret_key: str

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_key: str

    # AWS (optional - for image uploads)
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-1"
    s3_bucket_name: str = ""

    # AI
    anthropic_api_key: str

    # Instacart
    instacart_api_key: str = ""
    instacart_api_url: str = "https://connect.instacart.com/idp/v1"
    instacart_webhook_secret: str = ""

    # CORS
    allowed_origins: str = "http://localhost:19006"

    # Sentry (optional)
    sentry_dsn: str = ""

    # Rate limiting
    rate_limit_default: str = "60/minute"
    rate_limit_ai: str = "10/minute"
    rate_limit_auth: str = "5/minute"

    # JWT
    access_token_expire_minutes: int = 30      # 30 minutes
    refresh_token_expire_days: int = 30        # 30 days

    # Request limits
    max_request_size_mb: int = 10

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def cors_methods(self) -> list[str]:
        if self.is_production:
            return ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
        return ["*"]

    @property
    def cors_headers(self) -> list[str]:
        if self.is_production:
            return ["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"]
        return ["*"]

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings():
    return Settings()


settings = get_settings()
