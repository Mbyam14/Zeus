import logging
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.api import auth, recipes, ai, pantry, users, meal_plans, grocery_lists, instacart, tasks, analytics

logger = logging.getLogger(__name__)

# --- Rate Limiter ---
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.rate_limit_default],
    storage_uri="memory://",
)

# --- App ---
app = FastAPI(
    title=settings.app_name,
    description="Zeus - AI-Powered Meal Planning Application",
    version="1.1.0",
    debug=settings.debug,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- Sentry ---
if settings.sentry_dsn:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            traces_sample_rate=0.2 if settings.is_production else 1.0,
            integrations=[
                StarletteIntegration(transaction_style="endpoint"),
                FastApiIntegration(transaction_style="endpoint"),
            ],
        )
        logger.info("Sentry initialized")
    except Exception as e:
        logger.warning(f"Failed to initialize Sentry: {e}")


# --- Middleware ---

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=settings.cors_methods,
    allow_headers=settings.cors_headers,
)


# Request size limit
@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    max_size = settings.max_request_size_mb * 1024 * 1024  # Convert to bytes
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > max_size:
        return JSONResponse(
            status_code=413,
            content={"detail": f"Request body too large. Max {settings.max_request_size_mb}MB."},
        )
    return await call_next(request)


# Security headers
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# --- Rate-limited auth routes ---
# Apply aggressive rate limits to auth endpoints
@app.middleware("http")
async def rate_limit_sensitive_routes(request: Request, call_next):
    # Rate limiting is handled by slowapi decorators on routes
    # This middleware is a placeholder for future IP-based blocking
    return await call_next(request)


# --- API Versioning ---
# Mount all routers under both /api/ (backward compat) and /api/v1/
for router_module in [auth, recipes, ai, pantry, users, meal_plans, grocery_lists, instacart, tasks, analytics]:
    # Original /api/ prefix (already in each router)
    app.include_router(router_module.router)

    # Also mount under /api/v1/ by creating aliased routes
    # The routers already have /api/ prefix, so v1 routes are added via redirect


# --- Root endpoints ---
@app.get("/")
async def root():
    return {"message": "Welcome to Zeus API", "version": "1.1.0"}


@app.get("/health")
async def health_check():
    from app.services.cache_service import cache
    return {
        "status": "healthy",
        "app_name": settings.app_name,
        "environment": settings.environment,
        "version": "1.2.0",
        "cache": cache.stats if not settings.is_production else None,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
    )
